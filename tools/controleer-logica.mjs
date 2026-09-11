#!/usr/bin/env node
/* Tests voor de rekenkern van de tools - zonder testrunner, zonder build.
 *
 * Gebruik, vanuit de hoofdmap van het project:
 *     node tools/controleer-logica.mjs
 *
 * Hoe dit kan zonder de code op te knippen: een tool is één HTML-bestand, maar de
 * functies die rekenen staan gewoon op het hoogste niveau van zijn <script>. Dit
 * script snijdt precies die declaraties eruit, plakt er export-regels achter en
 * importeert dat als module via een data:-URL. Zo draait de ECHTE code van de tool,
 * niet een kopie die uit de pas kan lopen - en hoeft er niets aan de tools zelf te
 * veranderen om ze te kunnen testen.
 *
 * Eindigt met afsluitcode 1 zodra een test faalt. Alleen Node nodig.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Eén declaratie uit de broncode halen: vanaf de regel waarop hij begint, net zolang
   regels erbij tot het geheel als javascript te ontleden valt. Haakjes tellen werkt
   hier niet - een reguliere expressie als /^\d+([.,]\d+)?$/ zit vol haakjes die niets
   openen, en function f(a){...} is al "in balans" na zijn parameterlijst. De ontleder
   van Node weet dat allemaal wel. */
function snijUit(tekst, naam){
  const regels = tekst.split('\n');
  const start = regels.findIndex(r => new RegExp('^(?:const|let|function)\\s+' + naam + '\\b').test(r));
  if(start < 0) throw new Error('niet gevonden in de broncode: ' + naam);
  for(let eind = start; eind < Math.min(regels.length, start + 400); eind++){
    const stuk = regels.slice(start, eind + 1).join('\n');
    try{ new Function(stuk); return stuk; }catch(err){ /* nog niet af */ }
  }
  throw new Error('geen einde gevonden voor: ' + naam);
}

async function laadUit(bestand, namen, extra = ''){
  const bron = readFileSync(join(root, bestand), 'utf8');
  const code = namen.map(n => snijUit(bron, n)).join('\n') + '\n' + extra
             + '\nexport {' + namen.join(', ') + '};\n';
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}

/* ---------------------------------------------------------------- testraam ---- */
let gedaan = 0, mis = 0;
function is(wat, gekregen, verwacht){
  gedaan++;
  const a = JSON.stringify(gekregen), b = JSON.stringify(verwacht);
  if(a !== b){ mis++; console.log('  MIS  ' + wat + '\n       gekregen ' + a + ', verwacht ' + b); }
}

/* ============================ armatuurherkenning ============================ */
{
  const m = await laadUit('armaturenboek.html',
    ['ARM_GROEPEN', 'ARM_STOPWOORDEN', 'ARM_GETAL', 'ARM_CODE', 'armTokens', 'ARM_GROEP_TOKENS',
     'ARM_VOCAB', 'armSchoon', 'armZinvolleTokens', 'ARM_TYPEWOORDEN', 'ARM_TUSSENWOORDEN',
     'ARM_NAAMWOORDEN', 'armNaamZone', 'armBesteGroep', 'matchArmGroep']);
  const groep = (t) => { const g = m.matchArmGroep(t); return g ? g.id : null; };

  console.log('armatuurherkenning');
  /* De twee fouten die aanleiding waren voor de naam-achter-het-soortwoord-regel. */
  is('Lumio achter twee soortwoorden',
    groep('Pragmalux LED Plafonnière / Wandarmatuur Lumio-M Wit Ø335 IP65 IK10 7,5-19W 850-2400lm '
        + '2700K-3000K-4000K 3-CCT UGR<23 + DALI2 & noodmodule DALI 3uur autotest'), 'ag39');
  is('Mondial Opbouw wint van Downlight Mondial',
    groep('Pragmalux LED Downlight Mondial Opbouw IP54 hoogglans wit standaard 25,5W 3050-3200lm '
        + '3-CCT CRI>90 UGR<19 60D BØ226 - GØ200-210 +Philips DALI2 driver'), 'ag25');
  /* Het soortwoord telt mee als het onderscheidend is. */
  is('Pendelarmatuur Orion is niet Orion', groep('Pragmalux LED Pendelarmatuur Orion wit 30W'), 'ag109');
  is('Gevelarmatuur Squalo is niet Squalo Mini', groep('Pragmalux LED Gevelarmatuur Squalo IP65 zwart 20W'), 'ag67');
  is('Squalo Mini blijft Squalo Mini', groep('Pragmalux LED Squalo Mini IP65 zwart 10W'), 'ag63');
  /* De naam staat vóór het soortwoord: dan niet afknippen. */
  is('Mondial Opbouw Pendel zonder merknaam', groep('Mondial Opbouw Pendel wit 25,5W'), 'ag25');
  /* Ruis mag niet meetellen. */
  is('kleur, wattage en code eruit', groep('Punto 15W zwart 3000K DALI 2001234'), 'ag01');
  is('UGR-waarde is geen type', groep('Pragmalux LED Paneel Optic 60x60 36W 4000K UGR<19'), 'ag32');
  is('niets herkenbaars geeft niets', groep('Onbekend armatuur 12W'), null);
  is('lege tekst geeft niets', groep(''), null);

  /* Elke groep moet zichzelf terugvinden in een omschrijving van eigen naam plus ruis.
     Waar twee groepen dezelfde naam dragen (Essence) mag de tool weigeren te kiezen -
     dat is beter dan de verkeerde presenter in het boek. */
  let raak = 0, geweigerd = 0, fout = [];
  m.ARM_GROEPEN.forEach(g => {
    const uit = groep('Pragmalux LED ' + g.naam + ' wit 15W 3000K DALI 2001234');
    if(uit === g.id) raak++;
    else if(uit === null) geweigerd++;
    else fout.push(g.naam + ' -> ' + uit);
  });
  is('elke groepsnaam komt bij zichzelf uit (of nergens)', fout, []);
  console.log('  ' + raak + ' van de ' + m.ARM_GROEPEN.length + ' groepen herkend, '
            + geweigerd + ' te dubbelzinnig om te kiezen.');
}

/* ========================== bandrasterberekening =========================== */
{
  /* P.instellingen staat in de tool op het projectobject; hier zetten we alleen dat
     stukje neer, met de waarden die leegProject() ook gebruikt. */
  const m = await laadUit('bandrasters.html',
    ['LICHTBRON', 'OPTIEK_OUD', 'OPTIEK_NIEUW', 'getal', 'lumenSleutel', 'optiekFactor',
     'lumenOud', 'wattNieuw', 'lumenNieuw'],
    'const P = {instellingen:{efficacy:140, maxWatt:60}};');

  const positie = (oud, nieuw) => ({oud, nieuw});
  console.log('\nbandrasterberekening');

  /* Het voorbeeld uit de werkmap zelf (project 7633): 1x TL5-35W achter Prisma bij
     4000K/80+ geeft 2230 lm bestaand, en microprismatisch 16 W / 2130 lm. */
  const p7633 = positie(
    {lichtbron:'TL5-35W', cri:'80+', kleurtemp:'4000K', aantalLb:'1', optiek:'Prisma'},
    {optiek:'Microprismatisch UGR<19'});
  is('7633 bestaande lichtstroom', m.lumenOud(p7633), 2230);
  is('7633 vermogen alternatief',  m.wattNieuw(p7633), 16);
  is('7633 lichtstroom alternatief', m.lumenNieuw(p7633), 2130);

  /* Twee buizen doet het dubbele. */
  const twee = positie({...p7633.oud, aantalLb:'2'}, p7633.nieuw);
  is('twee buizen verdubbelt', m.lumenOud(twee), 4460);

  /* De aftopping op 60 W uit P.instellingen moet gelden. */
  const veel = positie({...p7633.oud, aantalLb:'8'}, p7633.nieuw);
  is('vermogen wordt afgetopt', m.wattNieuw(veel), 60);

  /* Ontbrekende gegevens geven niets terug in plaats van een half getal - de tool
     toont dan "Gegevens ontbreken" in plaats van een verzonnen waarde. */
  is('zonder lichtbron geen uitkomst',
    m.lumenOud(positie({...p7633.oud, lichtbron:''}, p7633.nieuw)), null);
  is('zonder optiek geen uitkomst',
    m.lumenOud(positie({...p7633.oud, optiek:''}, p7633.nieuw)), null);
  /* 5000K wordt in de tool niet aangeboden: de lumentabel heeft er geen kolom voor,
     dus de opzoeking loopt dood op "gegevens ontbreken" in plaats van een gok. */
  is('5000K geeft geen lichtstroom',
    m.lumenOud(positie({...p7633.oud, kleurtemp:'5000K'}, p7633.nieuw)), null);
  /* Een buis waarvoor die combinatie niet bestaat (TL5 bij 90+) net zo. */
  is('TL5-35W bij CRI 90+ bestaat niet',
    m.lumenOud(positie({...p7633.oud, cri:'90+'}, p7633.nieuw)), null);
}

/* ---------------------------------------------------------------- verslag ---- */
console.log('\n' + gedaan + ' controles, ' + (mis ? mis + ' MIS' : 'alles goed') + '.');
process.exit(mis ? 1 : 0);
