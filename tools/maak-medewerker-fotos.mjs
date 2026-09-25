#!/usr/bin/env node
/* Zet de pasfoto's van de medewerkers om in medewerker-fotos.js, het bestand dat
 * het armaturenboek inleest voor het blauwe vlak "Onze specialist" op de
 * briefingpagina.
 *
 * Gebruik, vanuit de hoofdmap van het project:
 *     node tools/maak-medewerker-fotos.mjs
 *
 * Leest elke .jpg in docs/bronnen/medewerkers/; de bestandsnaam is het id van de
 * medewerker in medewerkers.js (jose.jpg hoort bij {id:'jose'}). Een nieuwe
 * collega met een persoonlijke noot: foto erbij zetten, dit script draaien, en in
 * medewerkers.js de noot invullen.
 *
 * Waarom een .js en geen losse plaatjes: de tools draaien vanaf schijf (file://),
 * en daar weigert de browser een los plaatje in een PDF te zetten - hetzelfde als bij
 * armatuur-beelden.js en bandraster-beelden.js. De foto's gaan ongewijzigd mee
 * (JPEG, een paar honderd pixels), dus er is geen browser nodig om ze te verkleinen.
 * De originelen komen uit "Contactgegevens - Update sep 2026.pdf". */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bron = join(root, 'docs', 'bronnen', 'medewerkers');
const bestanden = readdirSync(bron).filter(f => /\.jpe?g$/i.test(f)).sort();

const regels = bestanden.map(f => {
  const id = f.replace(/\.jpe?g$/i, '');
  const data = readFileSync(join(bron, f)).toString('base64');
  return '  ' + JSON.stringify(id) + ': "data:image/jpeg;base64,' + data + '"';
});
const uit = join(root, 'medewerker-fotos.js');
writeFileSync(uit,
  '/* Gegenereerd door tools/maak-medewerker-fotos.mjs uit docs/bronnen/medewerkers/ -\n'
  + '   niet met de hand aanpassen. De pasfoto\'s voor "Onze specialist" op de\n'
  + '   briefingpagina van het armaturenboek; de gegevens zelf staan in medewerkers.js. */\n'
  + 'window.MEDEWERKER_FOTOS = {\n' + regels.join(',\n') + '\n};\n');
console.log('medewerker-fotos.js geschreven - ' + bestanden.length + ' foto\'s: '
  + bestanden.map(f => f.replace(/\.jpe?g$/i, '')).join(', '));
