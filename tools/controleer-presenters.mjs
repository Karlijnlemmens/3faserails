#!/usr/bin/env node
/* Loopt alle ingebakken presenters na en meldt wat er mis mee kan zijn.
 *
 * Gebruik, vanuit de hoofdmap van het project:
 *     node tools/controleer-presenters.mjs
 *
 * Waarom dit bestaat: het inbakken (tools/maak-presenters.mjs) is niets anders dan
 * base64 en kan dus niet zien of er iets OP de pagina's staat. Twee presenters bleken
 * lege exports - drie witte pagina's in het armaturenboek bij de Blocq, en een Neo van
 * 42 MB waar ook niets op stond. Dat kwam aan het licht doordat iemand witte pagina's
 * in zijn boek zag; dit script vindt het in een minuut.
 *
 * Gemeld wordt:
 *   - pagina's zonder één tekenopdracht (de lege-export-fout);
 *   - bestanden die niet te openen zijn;
 *   - presenters in presenters/ die niet in PRESENTER_FILES staan en andersom;
 *   - uitschieters in bestandsgrootte (die maken de export onmailbaar).
 *
 * Eindigt met afsluitcode 1 als er iets te melden valt, zodat het ook in een
 * controlestap gebruikt kan worden.
 *
 * Nodig: Node, Playwright met Chromium en pdfjs-dist (npm install --global pdfjs-dist),
 * net als tools/maak-rail-figuren.mjs.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const map = join(root, 'presenters');
const GROOT_MB = 5;        /* daarboven is een presenter het nakijken waard */

/* ---------- pdf.js erbij zoeken (zie tools/maak-rail-figuren.mjs) ---------- */
const eis = createRequire(import.meta.url);
function zoekPdfJs(){
  const kandidaten = [
    () => eis.resolve('pdfjs-dist/build/pdf.min.mjs'),
    () => '/opt/node22/lib/node_modules/pdfjs-dist/build/pdf.min.mjs',
    () => join(root, 'node_modules/pdfjs-dist/build/pdf.min.mjs'),
  ];
  for(const k of kandidaten){
    try{ const p = k(); if(existsSync(p)) return dirname(p); }catch(err){ /* volgende */ }
  }
  console.error('pdfjs-dist niet gevonden. Installeer het met:  npm install --global pdfjs-dist');
  process.exit(1);
}
const pdfjsDir = zoekPdfJs();
const bestanden = {
  '/pdf.mjs':        readFileSync(join(pdfjsDir, 'pdf.min.mjs')),
  '/pdf.worker.mjs': readFileSync(join(pdfjsDir, 'pdf.worker.min.mjs')),
  '/leeg.html':      Buffer.from('<!doctype html><meta charset="utf-8"><body></body>'),
};
const server = createServer((req, res) => {
  const b = bestanden[req.url.split('?')[0]];
  if(!b){ res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'Content-Type': req.url.endsWith('.html') ? 'text/html' : 'text/javascript'});
  res.end(b);
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const basis = 'http://127.0.0.1:' + server.address().port;

/* ---------- wat er in de lijst staat ---------- */
const dataBestand = join(root, 'presenters-data.js');
const lijst = (()=>{
  const t = readFileSync(dataBestand, 'utf8');
  const blok = /window\.PRESENTER_FILES\s*=\s*\[([\s\S]*?)\]/.exec(t);
  if(!blok) return [];
  /* Commentaar er eerst uit: er staat een uitgecommentarieerde regel in (ag44) en de
     toelichting bevat apostrofs ("pagina's"), die anders als id gelezen worden. */
  return [...blok[1].replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/'([^']+)'/g)].map(m => m[1]);
})();

const opSchijf = readdirSync(map).filter(f => f.endsWith('.js')).map(f => f.replace('.js',''));
const meldingen = [];
lijst.filter(id => !opSchijf.includes(id))
     .forEach(id => meldingen.push(id + ': staat in PRESENTER_FILES maar het bestand ontbreekt'));
opSchijf.filter(id => !lijst.includes(id))
        .forEach(id => meldingen.push(id + ': ligt in presenters/ maar staat niet in PRESENTER_FILES'));

/* ---------- elke presenter openen ---------- */
const browser = await chromium.launch();
const pagina = await browser.newPage();
await pagina.goto(basis + '/leeg.html');
await pagina.addScriptTag({url: basis + '/pdf.mjs', type: 'module'});
await pagina.waitForFunction(() => !!window.pdfjsLib);
await pagina.evaluate((w)=>{ window.pdfjsLib.GlobalWorkerOptions.workerSrc = w; }, basis + '/pdf.worker.mjs');

const regels = [];
for(const id of opSchijf.sort()){
  const pad = join(map, id + '.js');
  const mb = statSync(pad).size / 1048576;
  /* Niet met een reguliere expressie: op een bestand van tientallen MB loopt de
     backtracking vast. De data staat tussen "] = '" en de laatste "';". */
  const tekst = readFileSync(pad, 'utf8');
  const a = tekst.indexOf("] = '"), b = tekst.lastIndexOf("';");
  if(a < 0 || b < a){ meldingen.push(id + ': geen presenterdata in het bestand'); continue; }
  const uitslag = await pagina.evaluate(async (data) => {
    try{
      const doc = await window.pdfjsLib.getDocument({data: Uint8Array.from(atob(data), c => c.charCodeAt(0))}).promise;
      const leeg = [];
      for(let n = 1; n <= doc.numPages; n++){
        const ops = await (await doc.getPage(n)).getOperatorList();
        if(!ops.fnArray.length) leeg.push(n);
      }
      return {paginas: doc.numPages, leeg};
    }catch(e){ return {fout: String(e).slice(0, 120)}; }
  }, tekst.slice(a + 5, b));

  if(uitslag.fout) meldingen.push(id + ': niet te openen - ' + uitslag.fout);
  else if(uitslag.leeg.length === uitslag.paginas) meldingen.push(id + ': ALLE ' + uitslag.paginas + ' pagina\'s zijn leeg (geen tekenopdrachten)');
  else if(uitslag.leeg.length) meldingen.push(id + ': lege pagina(\'s) ' + uitslag.leeg.join(', ') + ' van ' + uitslag.paginas);
  if(mb > GROOT_MB) meldingen.push(id + ': ' + mb.toFixed(1) + ' MB - groot genoeg om de export onmailbaar te maken');
  regels.push({id, mb, paginas: uitslag.paginas || 0, leeg: (uitslag.leeg || []).length});
}
await browser.close();
server.close();

/* ---------- verslag ---------- */
const totaal = regels.reduce((s, r) => s + r.mb, 0);
console.log('%d presenters nagelopen, %s MB samen, %d pagina\'s.',
  regels.length, totaal.toFixed(0), regels.reduce((s, r) => s + r.paginas, 0));
const grootste = [...regels].sort((a, b) => b.mb - a.mb).slice(0, 5);
console.log('Grootste: ' + grootste.map(r => r.id + ' ' + r.mb.toFixed(1) + ' MB').join(', '));
if(meldingen.length){
  console.log('\n' + meldingen.length + ' ding(en) om naar te kijken:');
  meldingen.forEach(m => console.log('  - ' + m));
  process.exit(1);
}
console.log('\nNiets bijzonders gevonden.');
