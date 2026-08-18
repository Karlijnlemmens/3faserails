#!/usr/bin/env node
/* Zet presenter-PDF's om naar de bestanden die de Railconfigurator inleest.
 *
 * Gebruik:
 *   1. Zet de presenter-PDF's in de map  presenters-bron/  met de groeps-id of de
 *      groepsnaam als bestandsnaam, bijvoorbeeld:
 *          presenters-bron/ag01.pdf        (op id)
 *          presenters-bron/Punto.pdf       (op naam - hoofdletters maken niet uit)
 *          presenters-bron/rail.pdf        (de 3-Fase Rail presenter)
 *   2. Draai vanuit de hoofdmap van het project:
 *          node tools/maak-presenters.mjs
 *
 * Het script schrijft dan  presenters/<id>.js  per presenter en werkt de lijst in
 * presenters-data.js bij. Draai het opnieuw zodra er een presenter bijkomt of wijzigt.
 *
 * Geen npm-pakketten nodig - alleen Node zelf.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bronDir = join(root, 'presenters-bron');
const uitDir = join(root, 'presenters');
const dataBestand = join(root, 'presenters-data.js');

/* Moet gelijk blijven aan ARM_GROEPEN in index.html. 'achterpaginas' is geen
 * armatuurtype maar de vaste achterpagina's die altijd, ongevraagd, achteraan de
 * eind-PDF komen (zie assembleFinalPdf in index.html) - net als 'rail' krijgt hij
 * geen codestempel en staat hij niet in het armaturenboek. */
const GROEPEN = [
  ['rail', '3-Fase Rail'],
  ['ag01', 'Punto'], ['ag02', 'Piccolo'], ['ag03', 'Dio'], ['ag04', 'Alto'],
  ['ag05', 'Skyline'], ['ag06', 'Arda'], ['ag07', 'Orion'], ['ag08', 'Notra'],
  ['ag09', 'Ario'], ['ag10', 'Lustra'], ['ag11', 'Fendi'], ['ag12', 'Altoflood'],
  ['ag13', 'Paneel Essence G3'], ['ag14', 'Downlight Essence G2'], ['ag15', 'Mondial Pir'],
  ['ag16', 'Bandraster Miro'], ['ag17', 'Downlight Essence Pir'], ['ag18', 'Downlight Essence Ugr'],
  ['ag19', 'Downlight Fora IP65'], ['ag20', 'Downlight Mado'], ['ag21', 'Downlight Mondial'],
  ['ag22', 'Downlight Spectre'], ['ag23', 'In-/Opbouw Downlight Luna G2'], ['ag24', 'Mondial Nood'],
  ['ag25', 'Mondial Opbouw Pendel'], ['ag26', 'Mondial Track'], ['ag27', 'Opbouw Downlight Relio'],
  ['ag28', 'Paneel Conto'], ['ag29', 'Paneel Easy G2'], ['ag30', 'Paneel Flexcore'],
  ['ag31', 'Paneel Modul'], ['ag32', 'Paneel Optic'], ['ag33', 'Paneel Rondix'],
  ['ag34', 'Paneel Sigma G2'], ['ag35', 'Paneel Wingar'],
  ['ag36', 'BRIQ'], ['ag37', 'Inbouwspot Alpha'], ['ag38', 'Inbouwspot Apollo Round'],
  ['ag39', 'Lumio'], ['ag40', 'Noodverlichting Dot'], ['ag41', 'Noodverlichting Uni'],
  ['ag42', 'Waterdicht Hermes'],
  ['ag43', 'Module Mico'],
  ['achterpaginas', 'AB Achterpaginas'],
];
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const opNaam = new Map();
for (const [id, naam] of GROEPEN) { opNaam.set(id, id); opNaam.set(norm(naam), id); }

if (!existsSync(bronDir)) {
  console.error('De map "presenters-bron" bestaat niet.\n'
    + 'Maak hem aan en zet er de presenter-PDF\'s in, bijvoorbeeld presenters-bron/Punto.pdf\n'
    + 'Geldige namen: ' + GROEPEN.map(([id, n]) => id + ' (' + n + ')').join(', '));
  process.exit(1);
}

const pdfs = readdirSync(bronDir).filter((f) => extname(f).toLowerCase() === '.pdf');
if (!pdfs.length) { console.error('Geen PDF-bestanden gevonden in ' + bronDir); process.exit(1); }

mkdirSync(uitDir, { recursive: true });

const gedaan = [];
const overgeslagen = [];
for (const bestand of pdfs) {
  const id = opNaam.get(norm(basename(bestand, extname(bestand))));
  if (!id) { overgeslagen.push(bestand); continue; }
  const pad = join(bronDir, bestand);
  const bytes = readFileSync(pad);
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
    overgeslagen.push(bestand + ' (lijkt geen PDF)');
    continue;
  }
  const b64 = bytes.toString('base64');
  const uit = join(uitDir, id + '.js');
  writeFileSync(uit,
    '/* ' + bestand + ' - automatisch gegenereerd door tools/maak-presenters.mjs. Niet met de hand aanpassen. */\n'
    + 'window.PRESENTER_DATA = window.PRESENTER_DATA || {};\n'
    + 'window.PRESENTER_DATA.' + id + " = '" + b64 + "';\n");
  gedaan.push({ id, bestand, mb: (statSync(pad).size / 1048576).toFixed(1) });
}

/* presenters-data.js herschrijven: alleen nog de lijst met beschikbare presenters. */
const ids = gedaan.map((g) => g.id).sort();
const naamVan = Object.fromEntries(GROEPEN);
writeFileSync(dataBestand,
`/* Welke presenter-PDF's beschikbaar zijn voor de PDF-export van de Railconfigurator.

   Dit bestand wordt gegenereerd door tools/maak-presenters.mjs - pas het niet met de
   hand aan. Zet de PDF's in presenters-bron/ en draai:

       node tools/maak-presenters.mjs

   De presenters zelf staan als los bestand in presenters/<id>.js en worden pas
   ingeladen op het moment dat er een PDF wordt gemaakt (zie presenterData() in
   index.html). Zo blijft de tool snel openen, ook met tientallen MB aan presenters.

   PRESENTER_DATA blijft bestaan voor presenters die je liever direct hier inplakt;
   die worden bij het openen al meegeladen en gaan voor op het losse bestand. */
window.PRESENTER_FILES = [
${ids.map((id) => `  '${id}',   /* ${naamVan[id] || id} */`).join('\n')}
];
window.PRESENTER_DATA = window.PRESENTER_DATA || {};
`);

console.log('Klaar. ' + gedaan.length + ' presenter(s) geschreven naar presenters/:');
for (const g of gedaan) console.log('  ' + g.id.padEnd(6) + (naamVan[g.id] || '').padEnd(14) + g.mb + ' MB   <- ' + g.bestand);
const ontbreekt = GROEPEN.filter(([id]) => !ids.includes(id));
if (ontbreekt.length) console.log('\nNog geen presenter voor: ' + ontbreekt.map(([id, n]) => n + ' (' + id + ')').join(', '));
if (overgeslagen.length) console.log('\nOvergeslagen (naam hoort bij geen enkele groep): ' + overgeslagen.join(', '));
