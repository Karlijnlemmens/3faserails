#!/usr/bin/env node
/* Bouwt catalogus-data.js uit vergelijker/data/bron/catalogus.csv en spots.csv: van elke
 * artikelcode de omschrijving, zodat het armaturenboek en de railtool bij een ingetypte
 * artikelcode de volledige naam kunnen invullen (armNaamUitCode() in armatuur-rij.js) en een
 * ingeladen Excel-lijst kunnen controleren (armaturen-excel.js).
 *
 * catalogus.csv is ook de bron van de productdata van de vergelijker (bouw-data.py);
 * spots.csv alleen van dit bestand. Dat is de spotlijst van de binnendienst (oktober 2026,
 * de uitgefaseerde artikelen weggelaten): zonder die lijst vonden de Zena, de Ario
 * 1-fase railspot en honderden andere spots niets. In de vergelijker zouden ze 39 families
 * opleveren, waaronder losse lampen en spots zonder lichtstroom of maat in hun
 * omschrijving - die eisen eerst werk aan de productdata. Staat een code in beide, dan
 * wint catalogus.csv (op het moment van toevoegen waren alle 292 dubbelen gelijk).
 *
 * Gebruik, vanuit de hoofdmap van het project:
 *     node tools/maak-catalogus-data.mjs
 *
 * Draai het na elke nieuwe catalogus (knip-export.py --aanvullen, zie docs/vergelijker.md).
 * controleer-suite.mjs rekent de vingerafdruk in de kop na en meldt het als het bestand
 * niet meer bij de catalogus hoort. Alleen code en omschrijving gaan mee - de catalogus
 * heeft niets anders, en zo hoort het ook (de repo is openbaar).
 *
 * Waarom een .js en geen fetch van de csv: de tools draaien vanaf schijf (file://), en
 * daar blokkeert de browser fetch() van een lokaal bestand. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BRONNEN = ['catalogus.csv', 'spots.csv'];
const bronPad = naam => 'vergelijker/data/bron/' + naam;
const vinger = tekst => createHash('sha256').update(tekst.replace(/\r\n/g, '\n'), 'utf8').digest('hex').slice(0, 16);

/* artikelcode,merk,omschrijving - de eerste twee zonder komma, de omschrijving eventueel
   tussen aanhalingstekens (met "" voor een aanhalingsteken erin). Dubbele spaties in de
   bron ("Pragmalux  LED ...") worden enkele; verder blijft de tekst zoals hij is. */
const codes = {}, vingers = [];
let anders = 0;
for(const naam of BRONNEN){
  const bron = readFileSync(join(root, bronPad(naam)), 'utf8');
  vingers.push(naam + '=' + vinger(bron));
  const eigen = {};
  for(const r of bron.split(/\r?\n/).slice(1).filter(Boolean)){
    const m = /^([^,]*),([^,]*),(.*)$/.exec(r);
    if(!m) throw new Error('onleesbare regel in ' + naam + ': ' + r.slice(0, 80));
    const code = m[1].trim().toUpperCase();
    let oms = m[3].trim();
    if(oms.startsWith('"') && oms.endsWith('"')) oms = oms.slice(1, -1).replace(/""/g, '"');
    oms = oms.replace(/\s+/g, ' ').trim();
    if(!code || !oms) continue;
    if(eigen[code] && eigen[code] !== oms) throw new Error(naam + ': artikelcode twee keer, met een andere omschrijving: ' + code);
    eigen[code] = oms;
    /* staat de code al in een eerdere bron, dan wint die */
    if(codes[code] === undefined) codes[code] = oms;
    else if(codes[code] !== oms) anders++;
  }
}
if(anders) console.log('Let op: ' + anders + ' artikelcode(s) staan in meer bronnen met een andere omschrijving; de eerste bron wint.');

writeFileSync(join(root, 'catalogus-data.js'),
  '/* Gegenereerd door tools/maak-catalogus-data.mjs uit ' + BRONNEN.map(bronPad).join(' en ') + ' - niet met\n'
  + '   de hand aanpassen. Van elke artikelcode de omschrijving (sleutel in hoofdletters), voor het\n'
  + '   invullen van de naam bij een ingetypte artikelcode. bron-vingerafdruk ' + vingers.join(' ') + ' */\n'
  + 'window.CATALOGUS = ' + JSON.stringify(codes) + ';\n');
console.log('catalogus-data.js geschreven - ' + Object.keys(codes).length + ' artikelcodes.');
