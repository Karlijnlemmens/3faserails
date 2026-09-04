#!/usr/bin/env node
/* Snijdt de technische tekeningen van de adapters en de overige artikelen uit de
 * 3-Fase Rail presenter en schrijft ze weg als rail-figuren.js. Dat bestand voedt
 * de informatietekens achter "Adapters & overig" in index.html.
 *
 * Gebruik, vanuit de hoofdmap van het project:
 *     node tools/maak-rail-figuren.mjs
 *
 * De bron is presenters/rail.js - de presenter die al in de repo staat en die de
 * tool zelf ook aan het armaturenboek plakt. Zo is er geen los PDF-bestand nodig
 * en kan iedereen met de repo het opnieuw draaien.
 *
 * De kaders hieronder zijn opgemeten op een weergave van die presenter op schaal 2
 * (1190x1683 px), versie 24062026. Ze hoeven niet nauwkeurig te zijn: ze moeten de
 * tekening bevatten en niets van de buren, want wat er aan wit omheen staat gaat er
 * daarna vanzelf af. Komt er een nieuwe presenterversie met een andere indeling,
 * dan is dit de tabel die bijgesteld moet worden - het verslag onderaan laat zien
 * wat er is uitgesneden.
 *
 * Nodig: Node, Playwright met Chromium (zoals de andere scripts hier, zie
 * tools/LEESMIJ-pdf-controle.md) en pdfjs-dist om de pagina's te rasteren:
 *     npm install --global pdfjs-dist
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bron = join(root, 'presenters', 'rail.js');
const uitBestand = join(root, 'rail-figuren.js');
const MAX = 520;   /* langste zijde; groter wint niets, de tekeningen zijn lijnwerk */

/* id -> {pagina, kader}. De id's zijn die van ADAPTERS_OVERIG in index.html.
 * ao07 (DALI Rail Adapter 103mm) staat niet in deze presenter - die hoort bij de
 * PRX DALI rail - en heeft dus geen tekening. */
const KADERS = [
  {id:'ao01', p:1, x:48,  y:1195, w:155, h:140},  /* Universal Adapter 70mm */
  {id:'ao02', p:1, x:48,  y:1358, w:155, h:122},  /* Universal Multi-Adapter */
  {id:'ao03', p:1, x:48,  y:1484, w:155, h:142},  /* Schuko Adapter */
  {id:'ao04', p:2, x:48,  y:100,  w:155, h:105},  /* Monopoint */
  {id:'ao05', p:2, x:48,  y:518,  w:155, h:105},  /* Verstevigingsplaat 182mm */
  {id:'ao06', p:2, x:48,  y:658,  w:155, h:85},   /* Afdekplaat 2M */
  {id:'ao08', p:2, x:48,  y:788,  w:155, h:85},   /* Trekontlasting brug 2001947 */
  {id:'ao09', p:2, x:595, y:983,  w:128, h:95},   /* Slot connection tool */
  {id:'ao10', p:2, x:48,  y:878,  w:155, h:95},   /* Trekontlasting */
  /* De presenter zet nippel en moer als één set onder elkaar; hier zijn het twee
     artikelen, dus het blok wordt in tweeën geknipt. */
  {id:'ao11', p:2, x:48,  y:998,  w:155, h:56},   /* Nippel draaibaar M10 */
  {id:'ao12', p:2, x:48,  y:1061, w:155, h:42},   /* Moer M10 */
];

/* ======================= de presenter uitpakken ======================= */

if(!existsSync(bron)){
  console.error('Niet gevonden: ' + bron + ' (draai eerst tools/maak-presenters.mjs)');
  process.exit(1);
}
const m = /'([A-Za-z0-9+/=]{500,})'/.exec(readFileSync(bron, 'utf8'));
if(!m){ console.error('Geen presenterdata gevonden in ' + bron); process.exit(1); }
const pdf = Buffer.from(m[1], 'base64');

/* ======================= pdf.js erbij zoeken ======================= */

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

/* pdf.js wil zijn worker van een http-adres halen; vanaf file:// weigert de browser
   dat. Een klein servertje voor de duur van het script is genoeg. */
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

/* ======================= renderen en uitsnijden ======================= */

const browser = await chromium.launch();
const pagina = await browser.newPage();
await pagina.goto(basis + '/leeg.html');
await pagina.addScriptTag({url: basis + '/pdf.mjs', type: 'module'});
await pagina.waitForFunction(() => !!window.pdfjsLib);

const figuren = await pagina.evaluate(async ([data, worker, kaders, MAX]) => {
  const L = window.pdfjsLib;
  L.GlobalWorkerOptions.workerSrc = worker;
  const doc = await L.getDocument({data: Uint8Array.from(atob(data), c => c.charCodeAt(0))}).promise;
  const SCHAAL = 4, F = SCHAAL / 2;   /* de kaders zijn op schaal 2 opgemeten */
  const vellen = {}, uit = {};
  for(const k of kaders){
    if(!vellen[k.p]){
      const p = await doc.getPage(k.p), vp = p.getViewport({scale: SCHAAL});
      const c = document.createElement('canvas');
      c.width = vp.width; c.height = vp.height;
      await p.render({canvasContext: c.getContext('2d'), viewport: vp}).promise;
      vellen[k.p] = c;
    }
    const vel = vellen[k.p];
    let sx = k.x*F, sy = k.y*F, sw = k.w*F, sh = k.h*F;

    /* Het wit rondom de tekening eraf halen, zodat elke figuur even strak in zijn
       kader staat en het kader zelf niet op de punt gemikt hoeft te worden. */
    const hulp = document.createElement('canvas');
    hulp.width = Math.round(sw); hulp.height = Math.round(sh);
    const hx = hulp.getContext('2d');
    hx.fillStyle = '#fff'; hx.fillRect(0, 0, hulp.width, hulp.height);
    hx.drawImage(vel, sx, sy, sw, sh, 0, 0, hulp.width, hulp.height);
    const px = hx.getImageData(0, 0, hulp.width, hulp.height).data;
    let x1 = hulp.width, y1 = hulp.height, x2 = -1, y2 = -1;
    for(let y = 0; y < hulp.height; y++) for(let x = 0; x < hulp.width; x++){
      const i = (y*hulp.width + x)*4;
      if(px[i] < 235 || px[i+1] < 235 || px[i+2] < 235){
        if(x < x1) x1 = x; if(x > x2) x2 = x;
        if(y < y1) y1 = y; if(y > y2) y2 = y;
      }
    }
    if(x2 > x1 && y2 > y1){
      const rand = 6;
      sx += Math.max(0, x1 - rand);
      sy += Math.max(0, y1 - rand);
      sw = Math.min(hulp.width,  x2 + rand) - Math.max(0, x1 - rand);
      sh = Math.min(hulp.height, y2 + rand) - Math.max(0, y1 - rand);
    }

    const schaal = Math.min(1, MAX / Math.max(sw, sh));
    const c2 = document.createElement('canvas');
    c2.width  = Math.round(sw*schaal);
    c2.height = Math.round(sh*schaal);
    const x2d = c2.getContext('2d');
    x2d.fillStyle = '#fff'; x2d.fillRect(0, 0, c2.width, c2.height);
    x2d.drawImage(vel, sx, sy, sw, sh, 0, 0, c2.width, c2.height);
    /* png en geen jpeg: dit is lijnwerk, en jpeg maakt van dunne zwarte lijnen op
       wit een grijze soep. */
    uit[k.id] = {uri: c2.toDataURL('image/png'), w: c2.width, h: c2.height};
  }
  return uit;
}, [pdf.toString('base64'), basis + '/pdf.worker.mjs', KADERS, MAX]);

await browser.close();
server.close();

/* ======================= wegschrijven ======================= */

const regels = KADERS.map(k => '  ' + k.id + ': ' + JSON.stringify(figuren[k.id].uri)).join(',\n');
writeFileSync(uitBestand,
  "/* Technische tekeningen bij de adapters en de overige artikelen van de 3-fase\n" +
  " * rail, uitgesneden uit presenters/rail.js door tools/maak-rail-figuren.mjs.\n" +
  " * Niet met de hand bijwerken - draai het script opnieuw.\n" +
  " * Data-URI's en geen losse beeldbestanden: vanaf schijf mag de browser die niet\n" +
  " * uit een canvas lezen, en dan komen ze een PDF nooit in. */\n" +
  "window.RAIL_FIGUREN = {\n" + regels + "\n};\n");

KADERS.forEach(k => {
  const f = figuren[k.id];
  console.log('  ' + k.id + '  pagina ' + k.p + '  ' + (f.w + 'x' + f.h).padEnd(9) +
              (f.uri.length/1024).toFixed(0) + ' kB');
});
console.log('\n%d figuren -> %s (%s MB)', KADERS.length,
  uitBestand.replace(root + '/', ''), (readFileSync(uitBestand).length/1048576).toFixed(2));
