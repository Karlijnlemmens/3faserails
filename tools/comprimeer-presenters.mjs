#!/usr/bin/env node
/* Comprimeert de bron-PDF's in presenters-bron/ zodat de geëxporteerde installatie-PDF
 * (assembleFinalPdf() in index.html, die de rail-presenter + alle gebruikte
 * armatuurtype-presenters + achterpaginas samenvoegt) onder de mailbare grootte
 * blijft. De presenter-PDF's zelf zijn de bottleneck (0,5-4,3 MB per stuk aan
 * hoge-resolutie productfoto's) - pdf-lib kan bestaande beeld-XObjects niet
 * downsamplen, dus dat moet vóór het inbakken gebeuren.
 *
 * Gebruik:
 *   1. Zorg dat Ghostscript op het PATH staat (gswin64c op Windows, gs op
 *      macOS/Linux). Bijvoorbeeld: winget install --id ArtifexSoftware.Ghostscript -e
 *      of  choco install ghostscript
 *   2. Draai vanuit de hoofdmap van het project:
 *          node tools/comprimeer-presenters.mjs
 *   3. Controleer het rapport en steekproefsgewijs een paar resultaten visueel.
 *   4. Draai daarna  node tools/maak-presenters.mjs  om presenters/*.js opnieuw
 *      te bakken van de gecomprimeerde bytes.
 *
 * Comprimeert altijd vanaf het ongewijzigde origineel in presenters-bron/origineel/
 * (wordt bij de eerste run automatisch aangemaakt), zodat opnieuw draaien met een
 * andere instelling nooit kwaliteit stapelt op een eerdere compressie. Alleen
 * rasterbeelden worden gedownsampled/hergecomprimeerd - tekst en vectors in de
 * presenters blijven scherp.
 *
 * Geen npm-pakket nodig - dit script roept alleen het externe Ghostscript-programma
 * aan, net zoals maak-presenters.mjs een data-prep-utility is en geen deel van de
 * tool zelf.
 */
import { readFileSync, writeFileSync, copyFileSync, readdirSync, mkdirSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bronDir = join(root, 'presenters-bron');
const origineelDir = join(bronDir, 'origineel');

/* Beeldschermkwaliteit (~150 dpi) - flink kleiner, tekst blijft scherp, foto's
 * blijven prima leesbaar op scherm en in een gemailde PDF. Bij zichtbaar
 * kwaliteitsverlies op een specifieke presenter: dit getal omhoog (bv. 200) en
 * alleen dat bestand opnieuw comprimeren. */
const IMAGE_DPI = 150;

const GS_KANDIDATEN = ['gswin64c', 'gswin32c', 'gs'];

/* Meteen na installeren staat Ghostscript nog niet per se op het PATH van een
 * al openstaande terminal (die kreeg de PATH-wijziging van de installer niet
 * mee) - val in dat geval terug op de standaard installatiemap. */
function vindInStandaardMap(){
  const basis = 'C:\\Program Files\\gs';
  if(!existsSync(basis)) return null;
  const versies = readdirSync(basis).filter((d) => /^gs\d/.test(d)).sort().reverse();
  for(const v of versies){
    for(const exe of ['gswin64c.exe', 'gswin32c.exe']){
      const pad = join(basis, v, 'bin', exe);
      if(existsSync(pad)) return pad;
    }
  }
  return null;
}

function vindGhostscript(){
  for(const cmd of GS_KANDIDATEN){
    const r = spawnSync(cmd, ['-v'], { encoding: 'utf8' });
    if(!r.error) return cmd;
  }
  return vindInStandaardMap();
}

const gsCmd = vindGhostscript();
if(!gsCmd){
  console.error('Ghostscript niet gevonden op het PATH (geprobeerd: ' + GS_KANDIDATEN.join(', ') + ').\n'
    + 'Installeer het eerst, bijvoorbeeld:\n'
    + '  winget install --id ArtifexSoftware.Ghostscript -e\n'
    + '  of: choco install ghostscript\n'
    + 'en open daarna een nieuwe terminal zodat het PATH ververst is.');
  process.exit(1);
}

if(!existsSync(bronDir)){
  console.error('De map "presenters-bron" bestaat niet - er is niets te comprimeren.');
  process.exit(1);
}
mkdirSync(origineelDir, { recursive: true });

const pdfs = readdirSync(bronDir).filter((f) => extname(f).toLowerCase() === '.pdf');
if(!pdfs.length){
  console.error('Geen PDF-bestanden gevonden in ' + bronDir);
  process.exit(1);
}

const rapport = [];
for(const bestand of pdfs){
  const huidig = join(bronDir, bestand);
  const origineel = join(origineelDir, bestand);

  /* Altijd comprimeren vanaf het pristine origineel, niet vanaf een eerder
   * gecomprimeerd resultaat - anders stapelt kwaliteitsverlies bij herhaald draaien. */
  if(!existsSync(origineel)) copyFileSync(huidig, origineel);

  const voorMaat = statSync(origineel).size;
  const tmp = huidig + '.tmp';
  const args = [
    '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.4', '-dPDFSETTINGS=/ebook',
    '-dColorImageResolution=' + IMAGE_DPI, '-dGrayImageResolution=' + IMAGE_DPI,
    '-dNOPAUSE', '-dBATCH', '-dQUIET', '-dSAFER',
    '-sOutputFile=' + tmp, origineel,
  ];
  const r = spawnSync(gsCmd, args, { encoding: 'utf8' });
  if(r.status !== 0 || !existsSync(tmp)){
    console.warn('Comprimeren mislukt voor ' + bestand + ':', (r.stderr || r.error || 'onbekende fout'));
    if(existsSync(tmp)) unlinkSync(tmp);
    continue;
  }
  const naMaat = statSync(tmp).size;
  /* Ghostscript kan bij een al compacte PDF soms een groter bestand teruggeven
   * (herschreven structuur); in dat geval het origineel gewoon laten staan. */
  if(naMaat >= voorMaat){
    unlinkSync(tmp);
    rapport.push({ bestand, voorMaat, naMaat: voorMaat, overgeslagen: true });
    continue;
  }
  writeFileSync(huidig, readFileSync(tmp));
  unlinkSync(tmp);
  rapport.push({ bestand, voorMaat, naMaat, overgeslagen: false });
}

const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
let totVoor = 0, totNa = 0;
console.log('\nResultaat (' + IMAGE_DPI + ' dpi):');
for(const r of rapport){
  totVoor += r.voorMaat; totNa += r.naMaat;
  const pct = r.overgeslagen ? '(al compact, overgeslagen)' : '-' + (100 - (r.naMaat / r.voorMaat * 100)).toFixed(0) + '%';
  console.log('  ' + r.bestand.padEnd(28) + mb(r.voorMaat).padStart(10) + ' -> ' + mb(r.naMaat).padStart(10) + '   ' + pct);
}
console.log('\nTotaal: ' + mb(totVoor) + ' -> ' + mb(totNa) + '  (-' + (100 - (totNa / totVoor * 100)).toFixed(0) + '%)');
console.log('\nOriginelen staan veilig in presenters-bron/origineel/. Draai nu:\n  node tools/maak-presenters.mjs\nom presenters/*.js opnieuw te bakken van deze kleinere bestanden.');
