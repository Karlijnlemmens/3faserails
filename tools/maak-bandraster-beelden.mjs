#!/usr/bin/env node
/* Haalt de afbeeldingen uit docs/bronnen/Bandraster_Intake_Nieuw_V3.xlsx (het oude werkboek)
 * en docs/bronnen/bandraster_lijst.xlsx (de lijst van de binnendienst, november 2026) en
 * schrijft ze als bandraster-beelden.js, het beeldbestand dat bandrasters.html inleest.
 *
 * Gebruik, vanuit de hoofdmap van het project:
 *     node tools/maak-bandraster-beelden.mjs
 *     node tools/maak-bandraster-beelden.mjs ergens/werkboek.xlsx ergens/lijst.xlsx
 *
 * Uit het oude werkboek komen de optieken. Zijn aansluitlijst is vervangen door de
 * vervolgvragen van de nieuwe lijst; van zijn renders blijven er vier, voorlopig, bij het
 * onderdeel dat hetzelfde is (AANSLUIT_VOORLOPIG). Uit de nieuwe lijst komen - ook
 * voorlopig, de echte foto's komen via Rob - de plafondtypes, de basisarmaturen en het
 * standaard plenum. Daar zijn het zwevende afbeeldingen naast de namen; welke bij welke
 * naam hoort staat in LIJST_ANKERS, en het script controleert dat de naam ernaast nog
 * klopt, zodat een verschoven lijst niet stil verkeerde foto's oplevert.
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
import { zipLees } from './werkboek.mjs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const werkboek = process.argv[2] || join(root, 'docs/bronnen/Bandraster_Intake_Nieuw_V3.xlsx');
const lijstBoek = process.argv[3] || join(root, 'docs/bronnen/bandraster_lijst.xlsx');
const uitBestand = join(root, 'bandraster-beelden.js');
const MAX = 440;   /* langste zijde; de tool toont ze als duimnagel en op ~680px vergroot */
const KWALITEIT = 0.88;

for(const f of [werkboek, lijstBoek]){
  if(!existsSync(f)){ console.error('Niet gevonden: ' + f); process.exit(1); }
}

/* ======================= het werkboek openpakken =======================
   Een xlsx is een zip; zipLees() staat in werkboek.mjs, gedeeld met de controles. */
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

const gevonden = [];      /* {soort, naam, media, wat, bron} */
const zonder = [];        /* namen zonder afbeelding */
for(const paar of PAREN){
  for(let rij = 2; rij <= 60; rij++){
    const naam = cel(paar.naam + rij).waarde;
    if(!naam) continue;
    const vm = cel(paar.beeld + rij).vm;
    if(!vm){ zonder.push(paar.wat + ': ' + naam); continue; }
    gevonden.push({soort: paar.soort, naam, media: mediaVoor(vm), wat: paar.wat, bron: zip});
  }
}

/* De aansluitingen van de nieuwe opzet (AANSLUIT_FOTOS in bandrasters.html) die
   voorlopig een render van het oude werkboek krijgen: hetzelfde onderdeel, een andere
   schrijfwijze (GST18i3 = GST18-3, en een RA-steker is een Schuko). */
const AANSLUIT_VOORLOPIG = {
  'GST18i3 chassis': 'GST18-3 male chassis',
  'GST18i5 chassis': 'GST18-5 male chassis',
  'Snoer Schuko':    'RA-steker snoer 1m',
  'Snoer Eurosnoer': 'Eurosteker snoer 1m',
};
for(const [nieuw, oud] of Object.entries(AANSLUIT_VOORLOPIG)){
  const g = gevonden.find(x => x.soort === 'aansluiting' && x.naam === oud);
  if(!g) throw new Error('Render voor ' + nieuw + ' niet gevonden in het oude werkboek: ' + oud);
  gevonden.push(Object.assign({}, g, {soort: 'aansluiting-nieuw', naam: nieuw, wat: 'aansluiting (voorlopig)'}));
}

/* ======================= de lijst van de binnendienst =======================
   Zwevende afbeeldingen: een anker in xl/drawings/drawingN.xml (cel linksboven, met
   kolom en rij vanaf 0) en een r:embed naar xl/media. Per anker de naam in de tool, en
   de cel waar die naam in de lijst zelf staat - die moet erbij passen. */
const LIJST_ANKERS = [
  {soort:'plafond', cel:'E4',  naam:'Lay-On Ceiling',              label:['D4',  'Lay-On Ceiling']},
  {soort:'plafond', cel:'E5',  naam:'Opbouw',                      label:['D5',  'Opbouw']},
  {soort:'plafond', cel:'E6',  naam:'Clip-In Metal Ceiling',       label:['D6',  'Clip-In Metal Ceiling']},
  {soort:'plafond', cel:'E7',  naam:'Hook-Over Metal Ceiling',     label:['D7',  'Hook-Over Metal Ceiling']},
  {soort:'plafond', cel:'E8',  naam:'Hook-On Metal Ceiling',       label:['D8',  'Hook-On Metal Ceiling']},
  {soort:'plafond', cel:'E9',  naam:'Lay-In Ceiling',              label:['D9',  'Lay-In Ceiling']},
  /* "Gypsun" in de lijst */
  {soort:'plafond', cel:'E10', naam:'Gypsum Board Ceiling',        label:['D10', 'Gypsun Board Ceiling']},
  {soort:'basis',   cel:'G36', naam:'EU (Opaal/Microprismatisch)', label:['G35', 'EU (Opaal/Microprismatische)']},
  {soort:'basis',   cel:'I36', naam:'EU (Ledil)',                  label:['I35', 'EU (Ledil)']},
  {soort:'basis',   cel:'K36', naam:'Flexcore',                    label:['K35', 'Flexcore']},
  {soort:'basis',   cel:'M36', naam:'Optic',                       label:['M35', 'Optic']},
  {soort:'plenum',  cel:'H52', naam:'Standaard',                   label:['G51', 'Standaard']},
];
const lijstZip = zipLees(readFileSync(lijstBoek));
const lijstTekst = naam => {
  const b = lijstZip.get(naam);
  if(!b) throw new Error('Ontbreekt in de lijst: ' + naam);
  return b.toString('utf8');
};
{
  const gedeeldL = alles(lijstTekst('xl/sharedStrings.xml'), /<si>([\s\S]*?)<\/si>/g)
    .map(m => ontsnap(Array.from(m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map(t => t[1]).join('')));
  const celL = new Map();
  for(const m of alles(lijstTekst('xl/worksheets/sheet1.xml'), /<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
    const v = /<v>([\s\S]*?)<\/v>/.exec(m[3] || '');
    celL.set(m[1], v ? (/t="s"/.test(m[2]) ? gedeeldL[+v[1]] : ontsnap(v[1])).trim() : '');
  }
  const tekening = lijstTekst('xl/drawings/drawing1.xml');
  const rels = new Map(alles(lijstTekst('xl/drawings/_rels/drawing1.xml.rels'),
    /Id="([^"]+)"[^>]*Target="([^"]+)"/g).map(m => [m[1], m[2].replace('../', 'xl/')]));
  const kolomLetter = n => n < 26 ? String.fromCharCode(65 + n) : String.fromCharCode(64 + Math.floor(n / 26)) + String.fromCharCode(65 + n % 26);
  const ankers = new Map();
  for(const m of alles(tekening, /<xdr:(twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/xdr:\1>/g)){
    const van = /<xdr:from><xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(m[0]);
    const beeld = /r:embed="([^"]+)"/.exec(m[0]);
    if(van && beeld) ankers.set(kolomLetter(+van[1]) + (+van[2] + 1), rels.get(beeld[1]));
  }
  for(const a of LIJST_ANKERS){
    const label = celL.get(a.label[0]) || '';
    if(label !== a.label[1]) throw new Error('In de lijst staat bij ' + a.label[0] + ' "' + label + '", verwacht "' + a.label[1] + '"');
    const media = ankers.get(a.cel);
    if(!media){ zonder.push(a.soort + ': ' + a.naam + ' (geen afbeelding op ' + a.cel + ')'); continue; }
    gevonden.push({soort: a.soort, naam: a.naam, media, wat: a.soort + ' (lijst)', bron: lijstZip});
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
async function verklein(bron, media){
  const uri = 'data:image/png;base64,' + bron.get(media).toString('base64');
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

/* Een plaatje wordt per bron en bestandsnaam één keer verkleind; beide werkboeken hebben
   een xl/media/image1.png, dus de bron hoort bij de sleutel. */
const beeldSleutel = g => (g.bron === zip ? 'werkboek' : 'lijst') + ':' + g.media;
const kleiner = new Map();
for(const g of gevonden){
  if(!kleiner.has(beeldSleutel(g))) kleiner.set(beeldSleutel(g), await verklein(g.bron, g.media));
}
await browser.close();

/* Namen delen plaatjes - drie snoerlengtes zijn dezelfde foto, en de optiek van het
   bestaande armatuur staat op dezelfde render als die van het alternatief. Elke
   data-URI komt daarom een keer in het bestand en de namen wijzen ernaar; anders
   staat dezelfde megabyte er vier keer in. */
/* De oude aansluitlijst gaat niet meer mee (die is vervangen); van zijn renders alleen
   de vier voorlopige hierboven, onder hun nieuwe naam. */
const tabellen = {plafond: {}, basis: {}, optiek: {}, aansluiting: {}, plenum: {}};
const blanco = [], verslag = [], sleutels = new Map();
for(const g of gevonden){
  if(g.soort === 'aansluiting') continue;
  const soort = g.soort === 'aansluiting-nieuw' ? 'aansluiting' : g.soort;
  const k = kleiner.get(beeldSleutel(g));
  if(k.leeg){ blanco.push(g.wat + ': ' + g.naam); continue; }
  if(!sleutels.has(beeldSleutel(g)))
    sleutels.set(beeldSleutel(g), (g.bron === zip ? '' : 'lijst_') + g.media.split('/').pop().replace(/\.\w+$/, ''));
  tabellen[soort][g.naam] = sleutels.get(beeldSleutel(g));
  verslag.push(['  ', g.wat.padEnd(28), g.naam.padEnd(38), sleutels.get(beeldSleutel(g)).padEnd(14),
                (k.breedte + 'x' + k.hoogte).padEnd(9), (k.uri.length / 1024).toFixed(0) + ' kB'].join(''));
}

const blok = t => Object.keys(t).sort()
  .map(k => '      ' + JSON.stringify(k) + ': b.' + t[k]).join(',\n');
writeFileSync(uitBestand,
  "/* Foto's bij plafondtype, basisarmatuur, optiek, aansluiting en plenum van\n" +
  " * bandrasters.html. Gemaakt door tools/maak-bandraster-beelden.mjs uit de\n" +
  " * celafbeeldingen van Bandraster_Intake_Nieuw_V3.xlsx (de optieken) en de afbeeldingen\n" +
  " * in bandraster_lijst.xlsx (plafondtypes, basisarmaturen, plenum - voorlopig, tot de\n" +
  " * foto's van Rob er zijn); niet met de hand bijwerken - draai het script opnieuw, of\n" +
  " * gebruik de kaart \"Foto's\" in de tool en zet het resultaat hier neer.\n" +
  " * Data-URI's en geen losse beeldbestanden: vanaf schijf mag de browser die niet\n" +
  " * uit een canvas lezen, en dan komen ze een PDF nooit in.\n" +
  " * De namen in b zijn de bestandsnamen uit het werkboek (xl/media; lijst_ = de lijst). */\n" +
  "(function(){\n  var b = {\n" +
  Array.from(sleutels.entries())
    .map(([sleutel, naam]) => '    ' + naam + ': ' + JSON.stringify(kleiner.get(sleutel).uri))
    .join(',\n') + "\n  };\n" +
  "  window.BANDRASTER_BEELDEN = {\n" +
  Object.keys(tabellen).map(s => '    ' + s + ': {\n' + blok(tabellen[s]) + '\n    }').join(',\n') + "\n" +
  "  };\n})();\n");

console.log(verslag.join('\n'));
console.log('\n' + Object.keys(tabellen).map(s => Object.keys(tabellen[s]).length + ' ' + s).join(', ') + ' -> %s (%s MB)',
  uitBestand.replace(root + '/', ''), (readFileSync(uitBestand).length / 1048576).toFixed(2));
if(blanco.length) console.log('\nBlanco plaatje in het werkboek, dus overgeslagen:\n  ' + blanco.join('\n  '));
if(zonder.length) console.log('\nGeen afbeelding in het werkboek:\n  ' + zonder.join('\n  '));
