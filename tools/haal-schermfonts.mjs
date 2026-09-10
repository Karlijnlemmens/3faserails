#!/usr/bin/env node
/* Haalt de schermlettertypes van Google Fonts en zet ze in fonts/ neer, met een
 * fonts/schermfonts.css ervoor in de plaats van de <link> die elke pagina vroeger
 * naar fonts.googleapis.com had staan.
 *
 * Gebruik, vanuit de hoofdmap van het project:
 *     node tools/haal-schermfonts.mjs
 *
 * Draai dit alleen als er een gewicht bij moet of als Google de bestanden ververst;
 * de gedownloade woff2's staan in de repo, dus normaal is er niets te halen. Voeg een
 * nieuw gewicht toe aan FACES hieronder - en gebruik geen gewicht in de opmaak dat hier
 * niet staat, want dan rekt de browser het dichtstbijzijnde uit.
 *
 * Alleen de subsets latin en latin-ext: de tools zijn Nederlands, cyrillisch/grieks/
 * vietnamees zou het drie keer zo groot maken zonder ooit een letter te tonen.
 *
 * Nodig: Node met netwerktoegang. Verder niets.
 */
import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const uitDir = join(root, 'fonts');
const SUBSETS = ['latin', 'latin-ext'];
/* Wat de tools echt gebruiken. Nunito Sans 900 en cursief stonden wel in de oude
   <link> maar kwamen in geen enkele stijlregel voor, en Caveat hoorde bij een
   tagline die uit de koprij verdween toen daar het logo als afbeelding kwam. */
const FACES = [
  ['Nunito Sans', [400, 600, 700, 800]],
  ['JetBrains Mono', [500, 600]],
];
/* Zonder deze User-Agent stuurt Google truetype in plaats van woff2. */
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) '
         + 'Chrome/120.0.0.0 Safari/537.36';

const vraag = FACES.map(([naam, gew]) =>
  'family=' + naam.replace(/ /g, '+') + ':wght@' + gew.join(';')).join('&');
const css = await (await fetch(
  'https://fonts.googleapis.com/css2?' + vraag + '&display=swap',
  { headers: { 'User-Agent': UA } })).text();

/* Google zet boven elk @font-face-blok de naam van de subset als commentaar; dat is
   het enige wat de blokken uit elkaar houdt. */
const blokken = [...css.matchAll(/\/\* ([a-z-]+) \*\/\s*@font-face \{([^}]*)\}/g)]
  .filter(b => SUBSETS.includes(b[1]))
  .map(b => {
    const veld = (re) => (re.exec(b[2]) || [, ''])[1];
    return {
      subset: b[1],
      familie: veld(/font-family: '([^']+)'/),
      stijl:   veld(/font-style: (\w+)/),
      gewicht: veld(/font-weight: (\d+)/),
      url:     veld(/url\((https:[^)]+)\)/),
      bereik:  veld(/unicode-range: ([^;]+);/),
    };
  });
if (!blokken.length) { console.error('Geen font-faces gevonden - is het antwoord van Google veranderd?'); process.exit(1); }

mkdirSync(uitDir, { recursive: true });
let totaal = 0;
for (const b of blokken) {
  b.bestand = b.familie.replace(/ /g, '') + '-' + b.stijl + '-' + b.gewicht + '-' + b.subset + '.woff2';
  const bytes = Buffer.from(await (await fetch(b.url)).arrayBuffer());
  writeFileSync(join(uitDir, b.bestand), bytes);
  totaal += bytes.length;
}

/* Op volgorde van familie en gewicht, zodat het bestand leesbaar blijft en een
   nieuwe versie een klein diff geeft. */
const orde = (b) => (b.familie === 'Nunito Sans' ? 0 : 100) + Number(b.gewicht) / 10
                  + (b.subset === 'latin' ? 0 : 0.5);
blokken.sort((a, b) => orde(a) - orde(b));

const kop = `/* De schermlettertypes van de tools, uit de repo in plaats van bij Google vandaan.

   Waarom: elke pagina haalde deze fonts op bij fonts.googleapis.com, met een
   <link> in de <head> - dus render-blokkerend. Is dat adres onbereikbaar (een
   laptop zonder verbinding, een opgeslagen projectbestand op een machine zonder
   internet, een netwerk dat Google blokkeert), dan wacht de browser eerst zijn
   volledige time-out af: gemeten 12,8 seconden wit scherm, en daarna alsnog het
   verkeerde lettertype. Vanaf schijf is dat 0,07 s en klopt de opmaak altijd.

   Gegenereerd door tools/haal-schermfonts.mjs - pas dit bestand niet met de hand
   aan. De woff2's zijn de originele van Google Fonts (subsets latin en latin-ext).
   Alleen de gewichten die de tools echt gebruiken staan erin; gebruik je een nieuw
   gewicht in de opmaak, zet het dan in FACES in dat script en draai het opnieuw -
   anders rekt de browser het dichtstbijzijnde gewicht uit. */
`;
const regels = blokken.map(b =>
  '@font-face{\n'
  + "  font-family:'" + b.familie + "';\n"
  + '  font-style:' + b.stijl + '; font-weight:' + b.gewicht + '; font-display:swap;\n'
  + "  src:url('" + b.bestand + "') format('woff2');\n"
  + '  unicode-range:' + b.bereik + ';\n}').join('\n');
writeFileSync(join(uitDir, 'schermfonts.css'), kop + regels + '\n');

blokken.forEach(b => console.log('  ' + b.bestand.padEnd(42)
  + (statSync(join(uitDir, b.bestand)).size / 1024).toFixed(0).padStart(4) + ' kB'));
console.log('\n%d bestanden -> fonts/ (%s kB), plus fonts/schermfonts.css',
  blokken.length, (totaal / 1024).toFixed(0));
