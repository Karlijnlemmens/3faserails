#!/usr/bin/env node
/* Bouwt catalogus-data.js uit vergelijker/data/bron/catalogus.csv: van elke artikelcode de
 * omschrijving, zodat het armaturenboek en de railtool bij een ingetypte artikelcode de
 * volledige naam kunnen invullen (armNaamUitCode() in armatuur-rij.js).
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
const bronPad = 'vergelijker/data/bron/catalogus.csv';
const bron = readFileSync(join(root, bronPad), 'utf8');
const vinger = createHash('sha256').update(bron.replace(/\r\n/g, '\n'), 'utf8').digest('hex').slice(0, 16);

/* artikelcode,merk,omschrijving - de eerste twee zonder komma, de omschrijving eventueel
   tussen aanhalingstekens (met "" voor een aanhalingsteken erin). Dubbele spaties in de
   bron ("Pragmalux  LED ...") worden enkele; verder blijft de tekst zoals hij is. */
const codes = {};
const regels = bron.split(/\r?\n/).slice(1).filter(Boolean);
for(const r of regels){
  const m = /^([^,]*),([^,]*),(.*)$/.exec(r);
  if(!m) throw new Error('onleesbare regel in de catalogus: ' + r.slice(0, 80));
  const code = m[1].trim().toUpperCase();
  let oms = m[3].trim();
  if(oms.startsWith('"') && oms.endsWith('"')) oms = oms.slice(1, -1).replace(/""/g, '"');
  oms = oms.replace(/\s+/g, ' ').trim();
  if(!code || !oms) continue;
  if(codes[code] && codes[code] !== oms) throw new Error('artikelcode twee keer, met een andere omschrijving: ' + code);
  codes[code] = oms;
}

writeFileSync(join(root, 'catalogus-data.js'),
  '/* Gegenereerd door tools/maak-catalogus-data.mjs uit ' + bronPad + ' - niet met de hand\n'
  + '   aanpassen. Van elke artikelcode de omschrijving (sleutel in hoofdletters), voor het\n'
  + '   invullen van de naam bij een ingetypte artikelcode. bron-vingerafdruk catalogus.csv=' + vinger + ' */\n'
  + 'window.CATALOGUS = ' + JSON.stringify(codes) + ';\n');
console.log('catalogus-data.js geschreven - ' + Object.keys(codes).length + ' artikelcodes.');
