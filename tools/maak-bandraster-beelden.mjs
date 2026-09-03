#!/usr/bin/env node
/* Haalt de celafbeeldingen uit Bandraster_Intake_Nieuw_V3.xlsx en schrijft ze als
 * bandraster-beelden.js, het beeldbestand dat bandrasters.html inleest.
 *
 * Gebruik, vanuit de hoofdmap van het project:
 *     node tools/maak-bandraster-beelden.mjs
 *     node tools/maak-bandraster-beelden.mjs ergens/anders/werkboek.xlsx
 *
 * Waar de plaatjes zitten: het werkboek zet ze als "afbeelding in een cel" neer,
 * niet als zwevend plaatje. Zo'n cel draagt alleen een verwijzing (vm="12"), en die
 * loopt via xl/metadata.xml -> xl/richData/rdrichvalue.xml -> richValueRel.xml naar
 * een bestand in xl/media/. Op het verborgen blad Datasheet staan ze in kolommen
 * naast de namen die de tool ook gebruikt:
 *
 *     AA -> AE   optiek van het bestaande armatuur   (rij aan rij)
 *     AD -> AE   optiek van het alternatief
 *     AH -> AI   aansluiting bij geschakeld/pushdim
 *     AK -> AL   aansluiting bij DALI/1-10V
 *
 * Het Formulier zelf zoekt daar met XLOOKUP in (E23/L23 voor de optiek, E28/L28 voor
 * de aansluiting); dit script leest dezelfde tabel, zodat de tool dezelfde plaatjes
 * bij dezelfde namen laat zien als de Excel.
 *
 * Twee dingen worden overgeslagen, met een regel in het verslag: een naam waarvan de
 * afbeelding leeg is (het werkboek zet bij "Kaal" en bij "A-symmetrisch" een blanco
 * plaatje neer) en een naam die geen afbeelding heeft.
 *
 * Nodig: Node en Playwright met Chromium - dat laatste alleen om de plaatjes te
 * verkleinen, precies zoals de tool zelf dat met een canvas doet. Staat op de
 * ontwikkelmachine onder /opt/pw-browsers; zie tools/LEESMIJ-pdf-controle.md.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const werkboek = process.argv[2] || join(root, 'Bandraster_Intake_Nieuw_V3.xlsx');
const uitBestand = join(root, 'bandraster-beelden.js');
const MAX = 440;   /* langste zijde; de tool toont ze als duimnagel en op ~680px vergroot */
const KWALITEIT = 0.88;

if(!existsSync(werkboek)){
  console.error('Niet gevonden: ' + werkboek);
  process.exit(1);
}

/* ======================= het werkboek openpakken =======================
   Een xlsx is een zip. Node heeft geen zipreader, maar meer dan de centrale
   inhoudsopgave aflopen en per onderdeel inflateRaw draaien is het niet. */
function zipLees(buf){
  const eocd = (() => {
    for(let i = buf.length - 22; i >= 0; i--) if(buf.readUInt32LE(i) === 0x06054b50) return i;
    throw new Error('Geen zip: het einde van de inhoudsopgave ontbreekt.');
  })();
  let p = buf.readUInt32LE(eocd + 16);
  const aantal = buf.readUInt16LE(eocd + 10), uit = new Map();
  for(let i = 0; i < aantal; i++){
    if(buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Beschadigde inhoudsopgave in de zip.');
    const nLen = buf.readUInt16LE(p + 28), eLen = buf.readUInt16LE(p + 30), cLen = buf.readUInt16LE(p + 32);
    const naam = buf.toString('utf8', p + 46, p + 46 + nLen);
    const lokaal = buf.readUInt32LE(p + 42);
    const methode = buf.readUInt16LE(p + 10), gepakt = buf.readUInt32LE(p + 20);
    const lnLen = buf.readUInt16LE(lokaal + 26), leLen = buf.readUInt16LE(lokaal + 28);
    const start = lokaal + 30 + lnLen + leLen;
    const rauw = buf.subarray(start, start + gepakt);
    uit.set(naam, methode === 0 ? Buffer.from(rauw) : inflateRawSync(rauw));
    p += 46 + nLen + eLen + cLen;
  }
  return uit;
}
const zip = zipLees(readFileSync(werkboek));
const tekst = naam => {
  const b = zip.get(naam);
  if(!b) throw new Error('Ontbreekt in het werkboek: ' + naam);
  return b.toString('utf8');
};

/* ======================= vm="N" naar een mediabestand ======================= */

const alles = (s, re) => Array.from(s.matchAll(re));

const meta = tekst('xl/metadata.xml');
/* futureMetadata XLRICHVALUE: per blok de index in rdrichvalue.xml */
const rijk = meta.slice(meta.indexOf('name="XLRICHVALUE"'));
const rvb = alles(rijk.slice(0, rijk.indexOf('</futureMetadata>')), /<xlrd:rvb i="(\d+)"/g).map(m => +m[1]);
/* valueMetadata: vm="N" is het N-de blok hier, en dat wijst een futureMetadata-blok aan */
const vmDeel = meta.slice(meta.indexOf('<valueMetadata'));
const vmNaar = alles(vmDeel.slice(0, vmDeel.indexOf('</valueMetadata>')), /<rc [^>]*v="(\d+)"/g).map(m => rvb[+m[1]]);

/* rdrichvalue: de eerste <v> van elke waarde is de plaatjesindex in richValueRel */
const rv = alles(tekst('xl/richData/rdrichvalue.xml'), /<rv[^>]*>\s*<v>(\d+)<\/v>/g).map(m => +m[1]);
const relIds = alles(tekst('xl/richData/richValueRel.xml'), /<rel r:id="([^"]+)"/g).map(m => m[1]);
const relDoel = new Map(alles(tekst('xl/richData/_rels/richValueRel.xml.rels'),
  /Id="([^"]+)"[^>]*Target="([^"]+)"/g).map(m => [m[1], m[2].replace('../', 'xl/')]));

const mediaVoor = vm => relDoel.get(relIds[rv[vmNaar[+vm - 1]]]);

/* ======================= het blad Datasheet lezen ======================= */

const ontsnap = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
                      .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const gedeeld = alles(tekst('xl/sharedStrings.xml'), /<si>([\s\S]*?)<\/si>/g)
  .map(m => ontsnap(Array.from(m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map(t => t[1]).join('')));

/* Welk sheet<N>.xml is Datasheet: via de naam in workbook.xml en de r:id in de rels. */
function bladBestand(naam){
  const m = new RegExp('<sheet name="' + naam + '"[^>]*r:id="([^"]+)"').exec(tekst('xl/workbook.xml'));
  if(!m) throw new Error('Blad niet gevonden: ' + naam);
  const r = new RegExp('Id="' + m[1] + '"[^>]*Target="([^"]+)"').exec(tekst('xl/_rels/workbook.xml.rels'));
  return 'xl/' + r[1].replace(/^\/?xl\//, '');
}
function cellen(bestand){
  const uit = new Map();
  /* De attributen lui matchen: bij een lege cel (<c r="AH9" s="4"/>) zou een gulzige
     groep het afsluitende "/" opeten en daarna doorlopen tot de eerstvolgende </c>,
     waarmee de cellen ertussen verdwijnen. */
  for(const m of alles(tekst(bestand), /<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
    const attr = m[2], inhoud = m[3] || '';
    const vm = /vm="(\d+)"/.exec(attr);
    const v = /<v>([\s\S]*?)<\/v>/.exec(inhoud);
    let waarde = v ? ontsnap(v[1]) : '';
    if(/t="s"/.test(attr) && v) waarde = gedeeld[+v[1]];
    uit.set(m[1], {waarde: waarde.trim(), vm: vm ? vm[1] : null});
  }
  return uit;
}
const ds = cellen(bladBestand('Datasheet'));
const cel = ref => ds.get(ref) || {waarde: '', vm: null};

/* De vier kolomparen uit de XLOOKUP-formules van het Formulier: naam links,
   afbeelding rechts, rij aan rij. */
const PAREN = [
  {soort:'optiek',      naam:'AA', beeld:'AE', wat:'optiek bestaand'},
  {soort:'optiek',      naam:'AD', beeld:'AE', wat:'optiek alternatief'},
  {soort:'aansluiting', naam:'AH', beeld:'AI', wat:'aansluiting aan-uit/pushdim'},
  {soort:'aansluiting', naam:'AK', beeld:'AL', wat:'aansluiting DALI/1-10V'},
];

const gevonden = [];      /* {soort, naam, media, wat} */
const zonder = [];        /* namen zonder afbeelding */
for(const paar of PAREN){
  for(let rij = 2; rij <= 60; rij++){
    const naam = cel(paar.naam + rij).waarde;
    if(!naam) continue;
    const vm = cel(paar.beeld + rij).vm;
    if(!vm){ zonder.push(paar.wat + ': ' + naam); continue; }
    gevonden.push({soort: paar.soort, naam, media: mediaVoor(vm), wat: paar.wat});
  }
}

/* ======================= verkleinen en wegschrijven ======================= */

const browser = await chromium.launch();
const pagina = await browser.newPage();

/* Verkleinen tot MAX en als jpeg op wit terugschrijven. De renders staan op een
   doorzichtige achtergrond, maar die staat in de tool toch op een witte kaart, en
   png houden zou het bestand zeven keer zo groot maken (2,4 MB tegen 0,33 MB voor
   dezelfde 21 plaatjes) zonder dat je er iets van ziet. Een plaatje waarvan alle
   pixels gelijk zijn is het blanco plaatje dat het werkboek bij "Kaal" en bij
   "A-symmetrisch" neerzet; dat telt niet mee. */
async function verklein(media){
  const uri = 'data:image/png;base64,' + zip.get(media).toString('base64');
  return await pagina.evaluate(async ([uri, MAX, KWALITEIT]) => {
    const img = new Image();
    await new Promise((ok, mis) => { img.onload = ok; img.onerror = mis; img.src = uri; });
    const schaal = Math.min(1, MAX / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * schaal));
    c.height = Math.max(1, Math.round(img.height * schaal));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    let leeg = true;
    for(let i = 4; i < px.length; i += 4){
      if(px[i] !== px[0] || px[i+1] !== px[1] || px[i+2] !== px[2]){ leeg = false; break; }
    }
    return {uri: c.toDataURL('image/jpeg', KWALITEIT), leeg, breedte: c.width, hoogte: c.height};
  }, [uri, MAX, KWALITEIT]);
}

const kleiner = new Map();
for(const media of new Set(gevonden.map(g => g.media))) kleiner.set(media, await verklein(media));
await browser.close();

/* Namen delen plaatjes - drie snoerlengtes zijn dezelfde foto, en de optiek van het
   bestaande armatuur staat op dezelfde render als die van het alternatief. Elke
   data-URI komt daarom een keer in het bestand en de namen wijzen ernaar; anders
   staat dezelfde megabyte er vier keer in. */
const tabellen = {optiek: {}, aansluiting: {}};
const blanco = [], verslag = [], sleutels = new Map();
for(const g of gevonden){
  const k = kleiner.get(g.media);
  if(k.leeg){ blanco.push(g.wat + ': ' + g.naam); continue; }
  if(!sleutels.has(g.media)) sleutels.set(g.media, g.media.split('/').pop().replace(/\.\w+$/, ''));
  tabellen[g.soort][g.naam] = sleutels.get(g.media);
  verslag.push(['  ', g.wat.padEnd(28), g.naam.padEnd(38), g.media.split('/').pop().padEnd(13),
                (k.breedte + 'x' + k.hoogte).padEnd(9), (k.uri.length / 1024).toFixed(0) + ' kB'].join(''));
}

const blok = t => Object.keys(t).sort()
  .map(k => '      ' + JSON.stringify(k) + ': b.' + t[k]).join(',\n');
writeFileSync(uitBestand,
  "/* Foto's bij de optieken en de aansluitingen van bandrasters.html.\n" +
  " * Gemaakt door tools/maak-bandraster-beelden.mjs uit de celafbeeldingen van\n" +
  " * Bandraster_Intake_Nieuw_V3.xlsx; niet met de hand bijwerken - draai het script\n" +
  " * opnieuw, of gebruik de kaart \"Foto's\" in de tool en zet het resultaat hier neer.\n" +
  " * Data-URI's en geen losse beeldbestanden: vanaf schijf mag de browser die niet\n" +
  " * uit een canvas lezen, en dan komen ze een PDF nooit in.\n" +
  " * De namen in b zijn de bestandsnamen uit het werkboek (xl/media). */\n" +
  "(function(){\n  var b = {\n" +
  Array.from(sleutels.entries())
    .map(([media, sleutel]) => '    ' + sleutel + ': ' + JSON.stringify(kleiner.get(media).uri))
    .join(',\n') + "\n  };\n" +
  "  window.BANDRASTER_BEELDEN = {\n" +
  "    optiek: {\n"      + blok(tabellen.optiek)      + "\n    },\n" +
  "    aansluiting: {\n" + blok(tabellen.aansluiting) + "\n    }\n" +
  "  };\n})();\n");

console.log(verslag.join('\n'));
console.log('\n%d optieken en %d aansluitingen -> %s (%s MB)',
  Object.keys(tabellen.optiek).length, Object.keys(tabellen.aansluiting).length,
  uitBestand.replace(root + '/', ''), (readFileSync(uitBestand).length / 1048576).toFixed(2));
if(blanco.length) console.log('\nBlanco plaatje in het werkboek, dus overgeslagen:\n  ' + blanco.join('\n  '));
if(zonder.length) console.log('\nGeen afbeelding in het werkboek:\n  ' + zonder.join('\n  '));
