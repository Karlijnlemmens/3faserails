#!/usr/bin/env node
/* Maakt van een nieuwe profielfoto een pasfoto voor docs/bronnen/medewerkers/.
 *
 * Gebruik, vanuit de hoofdmap van het project:
 *     node tools/maak-pasfoto.mjs <foto.jpg> <id>
 *     node tools/maak-medewerker-fotos.mjs
 *
 * De profielfoto's van oktober 2026 zijn 2000x2000 pixels, ronduit gesneden op een
 * blauw vlak. Zo groot hoort hij niet in medewerker-fotos.js: dat bestand laden de
 * tools bij het opstarten, en elke foto gaat mee in elke PDF met dat blauwe vlak.
 * Dit script zoekt de cirkel (de eerste niet-blauwe pixel vanaf elke rand, over de
 * middelste rij en kolom), snijdt bij tot het vierkant om die cirkel en verkleint tot
 * 400x400 (JPEG, zo'n 20 kB) - ruim genoeg voor het vlak van 102 pt. In de PDF knipt
 * de tekenlaag hem rond (rond:true in medewerkers.js), zodat de blauwe hoeken wegvallen.
 *
 * Er is geen beeldbibliotheek zonder npm, dus het verkleinen gaat via Chromium
 * (Playwright), net als tools/pdfbaseline.mjs. Een hulpmiddel, nooit door de app geladen. */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [bron, id, maat = '400'] = process.argv.slice(2);
if(!bron || !/^[a-z0-9-]+$/.test(id || '')){
  console.error('Gebruik: node tools/maak-pasfoto.mjs <foto.jpg> <id>   (id zoals in medewerkers.js, bijv. karlijn)');
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const uit = join(root, 'docs', 'bronnen', 'medewerkers', id + '.jpg');
const soort = /\.png$/i.test(bron) ? 'image/png' : 'image/jpeg';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const pagina = await browser.newPage();
const r = await pagina.evaluate(async ([src, maat])=>{
  const img = new Image(); img.src = src; await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const blauw = (x, y)=>{ const [rr, , bb] = g.getImageData(x, y, 1, 1).data; return bb > 150 && rr < 80 && bb - rr > 100; };
  const rand = (van, stap, vast, horizontaal)=>{
    for(let i = van; i >= 0 && i < (horizontaal ? W : H); i += stap)
      if(!(horizontaal ? blauw(i, vast) : blauw(vast, i))) return i;
    return -1;
  };
  const my = Math.round(H/2), mx = Math.round(W/2);
  const links = rand(0, 1, my, true), rechts = rand(W-1, -1, my, true);
  const boven = rand(0, 1, mx, false), onder = rand(H-1, -1, mx, false);
  if(links < 0 || boven < 0) return {fout:'geen blauw vlak met een cirkel gevonden'};
  const cx = (links + rechts)/2, cy = (boven + onder)/2;
  const d = Math.max(rechts - links, onder - boven) + 1;
  const u = document.createElement('canvas'); u.width = u.height = maat;
  const ug = u.getContext('2d'); ug.imageSmoothingQuality = 'high';
  ug.drawImage(c, cx - d/2, cy - d/2, d, d, 0, 0, maat, maat);
  return {W, H, d, uri: u.toDataURL('image/jpeg', 0.86)};
}, ['data:' + soort + ';base64,' + readFileSync(bron).toString('base64'), +maat]);
await browser.close();
if(r.fout){ console.error(bron + ': ' + r.fout + '. Is het een profielfoto in het nieuwe formaat?'); process.exit(1); }
writeFileSync(uit, Buffer.from(r.uri.split(',')[1], 'base64'));
console.log(id + '.jpg geschreven: ' + r.W + 'x' + r.H + ', cirkel ' + r.d + ' px -> ' + maat + 'x' + maat
  + ', ' + Math.round(readFileSync(uit).length/1024) + ' kB. Draai nu node tools/maak-medewerker-fotos.mjs');
