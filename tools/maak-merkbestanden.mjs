#!/usr/bin/env node
/* Zet de huisstijlbestanden (lettertypen en logo's) om naar merk/merk-data.js, dat de
 * tool bij het maken van een PDF inleest.
 *
 * Waarom base64 in een .js-bestand: als index.html rechtstreeks vanaf schijf wordt
 * geopend (file://) blokkeert de browser fetch() naar losse bestanden. Een script
 * inladen mag wel. Zodra de tool op een webserver staat kan dit eenvoudiger, maar dit
 * werkt in beide gevallen.
 *
 * Gebruik, vanuit de hoofdmap:
 *     node tools/maak-merkbestanden.mjs
 *
 * Verwacht in merk/:
 *     OpenSans-Regular.ttf                     lopende tekst
 *     OpenSans-Bold.ttf                        nadruk en tabelkoppen
 *     SofiaSansExtraCondensed-ExtraBold.ttf    koppen
 *     SofiaSansExtraCondensed-Light.ttf        onderschriften
 *     logo-licht.png                           logo voor op donkere vlakken
 *     logo-donker.png                          logo voor op wit
 *     pragmalux-logo.png                       merklogo (optioneel)
 *
 * Ontbrekende bestanden worden overgeslagen; de tool valt dan terug op tekst in
 * plaats van een logo, of op een standaardlettertype.
 */
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const merk = join(root, 'merk');

const FONTS = {
  regular:   'OpenSans-Regular.ttf',
  bold:      'OpenSans-Bold.ttf',
  kopVet:    'SofiaSansExtraCondensed-ExtraBold.ttf',
  kopLicht:  'SofiaSansExtraCondensed-Light.ttf',
};
const LOGOS = {
  licht:     'logo-licht.png',
  donker:    'logo-donker.png',
  merk:      'pragmalux-logo.png',
};

const uit = [];
const gemist = [];
function lees(bestand){
  const p = join(merk, bestand);
  if(!existsSync(p)){ gemist.push(bestand); return null; }
  return { b64: readFileSync(p).toString('base64'), kb: Math.round(statSync(p).size/1024) };
}

const regels = [];
let totaal = 0;
for(const [sleutel, bestand] of Object.entries(FONTS)){
  const r = lees(bestand);
  if(!r) continue;
  totaal += r.kb;
  regels.push(`  ${sleutel}: '${r.b64}',   /* ${bestand} */`);
  uit.push(`lettertype ${sleutel.padEnd(9)} ${String(r.kb).padStart(4)} KB  <- ${bestand}`);
}
const logoRegels = [];
for(const [sleutel, bestand] of Object.entries(LOGOS)){
  const r = lees(bestand);
  if(!r) continue;
  totaal += r.kb;
  logoRegels.push(`  ${sleutel}: '${r.b64}',   /* ${bestand} */`);
  uit.push(`logo       ${sleutel.padEnd(9)} ${String(r.kb).padStart(4)} KB  <- ${bestand}`);
}

writeFileSync(join(merk, 'merk-data.js'),
`/* Huisstijlbestanden voor de PDF-export - GEGENEREERD door tools/maak-merkbestanden.mjs.
   Niet met de hand aanpassen; vervang de bronbestanden in merk/ en draai het script.

   Wordt pas ingeladen op het moment dat er een PDF gemaakt wordt (zie merkData() in
   index.html), zodat de tool snel blijft openen. */
window.MERK_FONTS = {
${regels.join('\n')}
};
window.MERK_LOGOS = {
${logoRegels.join('\n')}
};
`);

console.log('merk/merk-data.js geschreven (' + totaal + ' KB aan bronbestanden):');
uit.forEach(r=>console.log('  ' + r));
if(gemist.length) console.log('\nNog niet aanwezig: ' + gemist.join(', '));
