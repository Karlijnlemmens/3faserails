/* Vangnet voor de refactor: opent elke tool in headless Chromium, laat hem een PDF
   maken, vangt de blob op en schrijft de bytes weg. Draai voor en na de refactor. */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
/* Zie tools/LEESMIJ-pdf-controle.md voor het gebruik. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const UIT = process.argv[2];
mkdirSync(UIT, { recursive: true });

const HOOK = () => {
  window.__blobs = [];
  const orig = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (b) => { window.__blobs.push(b); return orig(b); };
  window.__pak = async () => {
    const b = window.__blobs[window.__blobs.length - 1];
    if (!b) return null;
    const buf = new Uint8Array(await b.arrayBuffer());
    let bin = ''; const CH = 0x8000;
    for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode.apply(null, buf.subarray(i, i + CH));
    return btoa(bin);
  };
};

function normaliseer(buf) {
  let s = Buffer.from(buf).toString('latin1');
  s = s.replace(/\/CreationDate\s*\(D:[^)]*\)/g, '/CreationDate (D:X)')
       .replace(/\/ModDate\s*\(D:[^)]*\)/g, '/ModDate (D:X)')
       .replace(/\/ID\s*\[\s*<[^>]*>\s*<[^>]*>\s*\]/g, '/ID [<X><X>]');
  return Buffer.from(s, 'latin1');
}

const ALLEEN = process.env.ALLEEN;
const SCENARIOS = [
  /* Niet meteen ?demo=pdf: eerst de datum vastzetten, anders zet het voorblad die
     van vandaag en verschilt elke vergelijking die op een andere dag gedraaid is. */
  { naam: 'railconfigurator', url: 'index.html?demo', knop: '#c2Preview',
    start: async (page) => page.evaluate(() => {
      const d = document.getElementById('c2Datum');
      d.value = '2026-01-15'; d.dispatchEvent(new Event('input', { bubbles: true }));
    }) },
  { naam: 'armaturenboek', url: 'armaturenboek.html', knop: '#abPreview',
    start: async (page) => page.evaluate(() => {
      st.proj = 'Testproject'; st.projNr = 'P-001'; st.installateur = 'Installateur BV'; st.datum = '2026-08-20';
      const zet = (id, aand, naam, code, q) => { const a = st.armaturen[id]; a.aanduiding = aand; a.name = naam; a.code = code; a.qty = q; a.groep = ''; };
      zet('arm01', 'CODE A', 'Punto 15W 3000K wit', '2001111', 8);
      zet('arm02', 'CODE B', 'Dio 12W wit', '2002222', 6);
      document.getElementById('abProj').value = st.proj;
      document.getElementById('abProjNr').value = st.projNr;
      buildArmList(); updateSummary();
    }) },
  { naam: 'vergelijker', url: 'vergelijking.html', knop: '#btnPdf',
    start: async (page) => page.evaluate(() => {
      S.project = { nr: 'P-001', naam: 'Testproject', inst: 'Installateur BV', datum: '2026-08-20', lagen: ['BG'], type: 'nieuwbouw' };
      const fam = DATA.families[0], v = fam.varianten[0];
      const p = nieuwePositie('A');
      p.familieId = fam.id; p.artikelcode = v.artikelcode; p.aantallen = { BG: 10 };
      p.ref = { leverancier: 'Referentie BV', type: 'REF-1', artikelnummer: '12345',
                omschrijving: 'Referentie-armatuur', toepassing: 'Kantoor', vermogen: '20W',
                cct: '4000K', lumen: '2000lm', dimbaar: 'Ja', afmetingen: '600x600' };
      S.posities = [p]; S.actief = 0;
      render();
    }) },
];

const GEKOZEN = ALLEEN ? SCENARIOS.filter(s=>s.naam===ALLEEN) : SCENARIOS;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const resultaten = [];
for (const sc of GEKOZEN) {
  const page = await browser.newPage();
  const fouten = [];
  page.on('console', m => { if (m.type() === 'error') fouten.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => fouten.push('pageerror: ' + e.message.slice(0, 200)));
  page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.addInitScript(HOOK);
  await page.goto('file://' + ROOT + '/' + sc.url);
  await page.waitForTimeout(800);
  try {
    if (sc.start) await sc.start(page);
    if (sc.knop) { await page.waitForTimeout(300); await page.click(sc.knop, { timeout: 15000 }); }
  } catch (e) { resultaten.push({ naam: sc.naam, fout: String(e).slice(0, 300), fouten }); await page.close(); continue; }
  let b64 = null;
  for (let i = 0; i < 120 && !b64; i++) { await page.waitForTimeout(500); b64 = await page.evaluate(() => window.__pak()); }
  if (!b64) { resultaten.push({ naam: sc.naam, fout: 'geen PDF-blob binnen 60s', fouten }); await page.close(); continue; }
  const buf = Buffer.from(b64, 'base64');
  writeFileSync(UIT + '/' + sc.naam + '.pdf', buf);
  resultaten.push({ naam: sc.naam, bytes: buf.length,
    paginas: (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length,
    hash: createHash('sha256').update(normaliseer(buf)).digest('hex').slice(0, 16), fouten });
  await page.close();
}
await browser.close();
writeFileSync(UIT + '/rapport.json', JSON.stringify(resultaten, null, 2));
for (const r of resultaten) console.log(JSON.stringify(r));
