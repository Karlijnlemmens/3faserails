#!/usr/bin/env node
/* Controleert de afspraken die over meerdere bestanden lopen. Die zijn met de hand
 * niet vol te houden - en als ze stilletjes uit elkaar lopen, merk je dat pas als een
 * tool iets anders doet dan zijn buurman.
 *
 * Gebruik, vanuit de hoofdmap van het project:
 *     node tools/controleer-suite.mjs
 *
 * Wat er gecontroleerd wordt:
 *   1. de armatuurtabel + herkenning staat identiek in index.html en armaturenboek.html
 *      (op commentaar en de lichtlijn-groepen na, die alleen het armaturenboek kent);
 *   2. elke pagina draagt dezelfde rij tabbladen naar de andere tools;
 *   3. elke pagina gebruikt hetzelfde palet voor de kleuren die ze allebei kennen;
 *   4. niemand haalt nog iets van het netwerk (geen http(s) in een src/href);
 *   5. de gedeelde scripts worden overal ingeladen waar ze gebruikt worden;
 *   6. de GROEPEN-tabel van maak-presenters.mjs kent elke ag-groep uit index.html.
 *
 * Eindigt met afsluitcode 1 als er iets niet klopt. Geen pakketten nodig, alleen Node.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lees = (p) => readFileSync(join(root, p), 'utf8');
const PAGINAS = ['index.html', 'armaturenboek.html', 'presenters.html', 'dlc.html',
                 'bandrasters.html', 'vergelijking.html', 'lichtlijn.html', 'intake.html',
                 'snoerenplan.html'].filter(p => existsSync(join(root, p)));

const fouten = [];
const meld = (regel) => fouten.push(regel);
const zonderCommentaar = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\n/gm, '');

/* ---------- 1. armatuurherkenning in twee bestanden ---------- */
function herkenningsBlok(t){
  const a = t.indexOf('const ARM_STOPWOORDEN');
  const b = t.indexOf('function matchArmGroep');
  if(a < 0 || b < 0) return null;
  return zonderCommentaar(t.slice(a, t.indexOf('\n}', b)));
}
{
  const a = herkenningsBlok(lees('index.html'));
  const b = herkenningsBlok(lees('armaturenboek.html'));
  if(!a || !b) meld('armatuurherkenning: het blok is niet in allebei de bestanden te vinden');
  else if(a !== b) meld('armatuurherkenning: index.html en armaturenboek.html lopen uit elkaar '
                      + '(zelfde code hoort in allebei te staan)');

  const groepen = (t) => [...t.matchAll(/\{id:'(ag\d+|lichtlijn-[a-z]+)'[^}]*naam:'([^']*)'/g)]
    .map(m => m[1] + ' = ' + m[2]);
  const gi = groepen(lees('index.html')), ga = groepen(lees('armaturenboek.html'));
  /* De lichtlijn-groepen staan bewust alleen in het armaturenboek; de rest hoort gelijk. */
  const kaal = (lijst) => lijst.filter(r => !r.startsWith('lichtlijn-'));
  const alleen = (x, y) => kaal(x).filter(r => !y.includes(r));
  alleen(gi, ga).forEach(r => meld('armatuurgroep alleen in index.html: ' + r));
  alleen(ga, gi).forEach(r => meld('armatuurgroep alleen in armaturenboek.html: ' + r));
}

/* ---------- 2. dezelfde rij tabbladen op elke pagina ---------- */
{
  const rij = (t) => {
    const m = /<div class="badges">([\s\S]*?)<\/div>/.exec(t);
    if(!m) return null;
    return [...m[1].matchAll(/href="([^"]+)"[^>]*>([^<]*)</g)].map(x => x[2].trim() + ' -> ' + x[1]);
  };
  const eerste = rij(lees(PAGINAS[0]));
  if(!eerste) meld('tabbladenrij: niet gevonden in ' + PAGINAS[0]);
  else PAGINAS.slice(1).forEach(p => {
    const r = rij(lees(p));
    if(!r) return meld('tabbladenrij: niet gevonden in ' + p);
    const mist = eerste.filter(x => !r.includes(x));
    const extra = r.filter(x => !eerste.includes(x));
    if(mist.length || extra.length){
      meld('tabbladenrij in ' + p + ' wijkt af van ' + PAGINAS[0]
         + (mist.length ? ' - mist: ' + mist.join(', ') : '')
         + (extra.length ? ' - extra: ' + extra.join(', ') : ''));
    }
  });
}

/* ---------- 3. hetzelfde palet ---------- */
{
  const palet = (t) => {
    const m = /:root\{([\s\S]*?)\}/.exec(t);
    const uit = {};
    if(m) [...m[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].forEach(x => { uit[x[1]] = x[2].trim(); });
    return uit;
  };
  const basis = palet(lees('index.html'));
  PAGINAS.filter(p => p !== 'index.html').forEach(p => {
    const eigen = palet(lees(p));
    Object.keys(eigen).forEach(k => {
      if(basis[k] && basis[k].toLowerCase() !== eigen[k].toLowerCase()){
        meld('kleur ' + k + ' in ' + p + ' is ' + eigen[k] + ', in index.html ' + basis[k]);
      }
    });
  });
}

/* ---------- 3b. elke gebruikte kleurnaam bestaat ook ---------- */
{
  const gedeeld = lees('suite-stijl.css');
  const namenIn = (t) => new Set([...t.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));
  const uitSuite = namenIn(gedeeld);
  PAGINAS.forEach(p => {
    const t = lees(p);
    const eigen = namenIn(t);
    /* var(--x, terugval) is geen fout: daar is een alternatief opgeschreven. */
    const gebruikt = new Set([...t.matchAll(/var\((--[a-z0-9-]+)\s*\)/g)].map(m => m[1]));
    [...gebruikt].filter(n => !eigen.has(n) && !uitSuite.has(n))
      .forEach(n => meld(p + ' gebruikt ' + n + ' maar die kleur is nergens gezet'));
  });
}

/* ---------- 4. niets meer van het netwerk ---------- */
PAGINAS.forEach(p => {
  const t = lees(p);
  [...t.matchAll(/<(?:script|link|img)[^>]+(?:src|href)="(https?:\/\/[^"]+)"/g)]
    .forEach(m => meld(p + ' haalt iets van het netwerk: ' + m[1]));
});

/* ---------- 5. gedeelde scripts ingeladen waar ze gebruikt worden ---------- */
{
  const gedeeld = [
    ['info-teken.js',    /InfoTeken\./],
    ['project-opslag.js',/ProjectOpslag\./],
    ['pdf-huisstijl.js', /PdfHuisstijl\./],
    ['spec-lezer.js',    /SpecLezer\./],
    ['melding.js',       /Melding\./],
  ];
  PAGINAS.forEach(p => {
    const t = lees(p);
    gedeeld.forEach(([bestand, gebruik]) => {
      const laadt = t.includes('src="' + bestand + '"');
      /* Alleen kijken naar het gebruik in de eigen code, niet in commentaar. */
      const gebruikt = gebruik.test(zonderCommentaar(t));
      if(gebruikt && !laadt) meld(p + ' gebruikt ' + bestand + ' maar laadt het niet in');
    });
  });
}

/* ---------- 6. de presenterscripttabel kent elke groep ---------- */
{
  const script = lees('tools/maak-presenters.mjs');
  const idsInScript = new Set([...script.matchAll(/\['(ag\d+|rail|achterpaginas|lichtlijn-[a-z]+)'/g)].map(m => m[1]));
  const idsInTool = [...lees('index.html').matchAll(/\{id:'(ag\d+)'/g)].map(m => m[1]);
  [...new Set(idsInTool)].filter(id => !idsInScript.has(id))
    .forEach(id => meld('tools/maak-presenters.mjs kent ' + id + ' niet, index.html wel'));
}

/* ---------- verslag ---------- */
console.log(PAGINAS.length + ' pagina\'s nagelopen.');
if(fouten.length){
  console.log('\n' + fouten.length + ' ding(en) om naar te kijken:');
  fouten.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log('Alles loopt gelijk.');
