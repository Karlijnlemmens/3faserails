#!/usr/bin/env node
/* Tests voor de rekenkern van de tools - zonder testrunner, zonder build.
 *
 * Gebruik, vanuit de hoofdmap van het project:
 *     node tools/controleer-logica.mjs
 *
 * Hoe dit kan zonder de code op te knippen: een tool is één HTML-bestand, maar de
 * functies die rekenen staan gewoon op het hoogste niveau van zijn <script> (of, voor
 * wat gedeeld is, in een los .js-bestand). Dit script snijdt precies die declaraties
 * eruit, plakt er export-regels achter en
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

async function laadUit(bestand, namen, extra = '', ookUit = []){
  const bron = readFileSync(join(root, bestand), 'utf8');
  const code = namen.map(n => snijUit(bron, n)).join('\n') + '\n' + extra
             + '\nexport {' + namen.concat(ookUit).join(', ') + '};\n';
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
  const m = await laadUit('armatuur-groepen.js',
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

/* ======================= specificaties uitlezen ======================= */
{
  /* spec-lezer.js is geen module maar een IIFE die zichzelf op window zet; hier
     zetten we dat window zelf neer en halen de lezer er weer af. De VELDMAP en
     FRAGMENTEN komen uit de echte template van de vergelijker. */
  const lezer = readFileSync(join(root, 'spec-lezer.js'), 'utf8');
  const m = await laadUit('vergelijker/index-template.html',
    ['SECTIE', 'VELDMAP', 'FRAGMENTEN', 'parseGetal', 'mm', 'zaagTekst', 'naarBladvelden'],
    'const window = {};\n' + lezer + '\n'
    + 'const LEZER = window.SpecLezer.maak({veldmap:VELDMAP, sectie:SECTIE, kop:true, fragmenten:FRAGMENTEN});\n'
    + 'const ONTHTML = window.SpecLezer.ontHtml;',
    ['LEZER', 'ONTHTML']);
  const lees = (t) => m.LEZER.lees(t);

  console.log('\nspecificaties uitlezen');

  /* Een gewone leverancierstabel: label en waarde, al dan niet met een kopregel
     erboven. Die kopregel is de omschrijving van het armatuur. */
  {
    const r = lees('Inbouwdownlight met microprismatische afdekking voor kantoren\n'
      + 'Vermogen: 15 W\nLichtstroom: 1650 lm\nKleurtemperatuur: 3000 K\nDimbaar: Ja, DALI');
    is('kopregel wordt de omschrijving', r.uit.omschrijving,
      'Inbouwdownlight met microprismatische afdekking voor kantoren');
    is('tabel vult de velden', m.naarBladvelden(r.uit),
      {omschrijving:'Inbouwdownlight met microprismatische afdekking voor kantoren',
       vermogen:'15 W', lumen:'1650 lm', cct:'3000 K', dimbaar:'Ja', aansturing:'DALI'});
  }

  /* Een rij losse waarden zonder ook maar één label - zo levert een deel van de
     leveranciers zijn blad aan. Dit was de aanleiding voor de fragmentronde:
     hiervoor belandde de hele regel als omschrijving in het blad. */
  {
    const r = lees('600x600 mm, Visible profile ceiling version, Staal, Wit, Signaalwit (RAL9003), '
      + 'Voedingsunit met DALI-interface, 3600 lm, 26 W, 140 lm/W, 4000 K, (0.38, 0.38) SDCM \u22643, '
      + 'UGR19, Bundelhoek 90\u00b0, Microprismatische lens, Polystyreen, '
      + 'IP 20/44 | Bescherming tegen vingers, bescherming tegen draden, spatwaterdicht, '
      + 'IK02 | 0,2 J standaard, Veiligheidsklasse II, Insteekconnector, 4-polig, SC | Veiligheidskabel');
    is('waardenrij vult het blad', m.naarBladvelden(r.uit),
      {vermogen:'26 W', lumen:'3600 lm', cct:'4000 K', ip:'IP 20/44',
       ik:'IK02, 0,2 J standaard', ugr:'UGR19',
       montage:'Visible profile ceiling version', kleur:'Signaalwit (RAL9003)',
       aansluiting:'Insteekconnector, 4-polig',
       bundel:'90\u00b0', aansturing:'Voedingsunit met DALI-interface', dimbaar:'Ja',
       afmetingen:'600\u00d7600 mm'});
    is('waardenrij wordt geen omschrijving', r.uit.omschrijving, undefined);
    /* IP en IK staan sinds kort op het blad zelf, niet meer alleen in de
       bewaarde velden - vandaar dat ze hierboven in naarBladvelden() staan. */
    is('IP-klasse uit de rij',   r.uit.ip,    'IP 20/44');
    is('UGR uit de rij',         r.uit.ugr,   'UGR19');
    /* Een tweede treffer schuift aan bij de eerste in plaats van te verdwijnen. */
    is('slagvastheid plus de energie', r.uit.ik, 'IK02, 0,2 J standaard');
    is('aansluiting plus polen', r.uit.aansluiting, 'Insteekconnector, 4-polig');
    /* RAL is preciezer dan "Wit" en overschrijft dat binnen dezelfde ronde. */
    is('RAL wint van de kleurnaam', r.uit.kleur, 'Signaalwit (RAL9003)');
    /* Een behuizingskleur achter een eigen label komt er net zo goed uit. */
    is('behuizingskleur als label',
      m.naarBladvelden(lees('Behuizingskleur: Zwart (RAL9005)').uit).kleur, 'Zwart (RAL9005)');
    /* Wat nergens onder valt blijft zichtbaar in plaats van stilletjes te verdwijnen. */
    is('de rest blijft zichtbaar', r.onbekend,
      ['Bescherming tegen vingers', 'bescherming tegen draden', 'spatwaterdicht',
       'SC', 'Veiligheidskabel']);
  }

  /* Een zin met komma's erin is geen waardenrij: die hoort de omschrijving te
     blijven. Dat is waar de drempels in fragmentStukken() voor zijn. */
  {
    const zin = 'Inbouwdownlight, rond, met microprismatische afdekking voor kantoren';
    const r = lees(zin + '\nVermogen: 15 W');
    is('een zin met komma\'s blijft de omschrijving', r.uit.omschrijving, zin);
  }

  /* Het blad dat label en waarde om en om op een eigen regel zet - de vorm waarin
     de meeste leveranciers hun tabel plakken. Hier hoort niets in `onbekend` te
     eindigen: elk label op dit blad staat in de VELDMAP. */
  {
    const blad = [
      'Elektrisch', 'Wattage', '8W/17W', 'Spanning', '220-240V',
      'Frequentie (Hz)', '50/60Hz',
      'Max. armaturen per stroomonderbreker', 'B10: 30, B16: 47, C10: 50, C16: 80',
      'Lichttechniek', 'Soort lichtbron', 'LED',
      'Luminous flux', '580/620/1220/1300lm',
      'Armatuur effici\u00ebntie LED', '73/78/72/76lm/W',
      'Kleur temperatuur', '3000/4000K', 'Kleurweergave (CRI)', 'Ra>80',
      'MacAdams factor', 'SDCM: 3', 'Levensduur', 'L80/B20>50,000',
      'Lichtverdeling', 'Direct', 'Optiek', 'Glas', 'UGR', 'UGR<22/25',
      'Fotobiologische veiligheid', 'RG 1', 'ULOR (<1%)', 'Ja',
      'Controle/dimmen', 'Type', 'Fase afsnijding',
      'Bescherming', 'Isolatieklasse', 'Klasse II', 'IK Klasse', 'IK06',
      'IP Klasse', 'IP65',
      'Energie en goedkeuringen', 'Bevat een lichtbron met energieclasse', 'E/E/E/E',
      'Materiaal en afwerking', 'Behuizing', 'Aluminium',
      'Montage/Aansluiting', 'Montage', 'Paal, wand, sokkel of aardstaaf, Buiten',
      'Model', '\u00d860', 'Kabel', 'Kabel 2x1mm\u00b2 5,0m',
      'Afmetingen', 'Lengte (mm) L', '342', 'Breedte (mm) W', '182',
      'Hoogte (mm) H', '144', 'Gewicht (kg) bruto/netto', '2.55 / 2.02',
      'Verpakking', 'Packaging dimensions (mm)', '340 x 190 x 200',
    ].join('\n');
    const r = lees(blad);
    is('label-boven-waarde vult het blad', m.naarBladvelden(r.uit),
      {vermogen:'8W/17W', lumen:'580/620/1220/1300lm', cct:'3000/4000K',
       ip:'IP65', ik:'IK06', ugr:'UGR<22/25', cri:'Ra>80',
       montage:'Paal, wand, sokkel of aardstaaf, Buiten', aansluiting:'Kabel 2x1mm\u00b2 5,0m',
       levensduur:'L80/B20>50,000', aansturing:'Fase afsnijding', dimbaar:'Ja',
       afmetingen:'342\u00d7182 \u00d7 H144'});
    /* "Optiek" is zowel een kopje als een veldnaam; wat eronder staat beslist. */
    is('Optiek als veldnaam, niet als kopje', r.uit._optiek, 'Glas');
    /* "Type" telt alleen als dimwijze onder een dimsectie. */
    is('Type onder Controle/dimmen is de aansturing', r.uit.aansturing, 'Fase afsnijding');
    /* Een waarde met dubbele punten erin blijft heel: dit is \u00e9\u00e9n opgave,
       geen vier losse paren. */
    is('waarde met dubbele punten blijft heel', r.uit._zekering,
      'B10: 30, B16: 47, C10: 50, C16: 80');
    /* Het haakje is versiering: "ULOR (<1%)" is een label, geen waarde. */
    is('haakje met cijfers maakt het nog geen waarde', r.uit._ulor, 'Ja');
    is('dit blad laat niets liggen', r.onbekend, []);
  }

  /* Hetzelfde blad in het Engels - zo levert een deel van de leveranciers aan.
     De kopjes tellen mee: zonder "Control/dimming" als kopje valt "Type" terug op
     het armatuurtype, en komt "Trailing edge" als Type op het blad te staan. */
  {
    const blad = [
      'Electrical', 'Wattage', '8W/17W', 'Voltage', '220-240V',
      'Frequency (Hz)', '50/60Hz',
      'Max. luminaires per circuit breaker', 'B10: 30, B16: 47, C10: 50, C16: 80',
      'Photometrics', 'Light source', 'LED',
      'Luminous flux', '580/620/1220/1300lm',
      'Luminaire efficacy', '73/78/72/76lm/W',
      'Colour temperature', '3000/4000K', 'Colour rendering (CRI)', 'Ra>80',
      'MacAdam', 'SDCM: 3', 'Lifetime', 'L80/B20>50,000',
      'Light distribution', 'Direct', 'Optic', 'Glass', 'UGR', 'UGR<22/25',
      'Photobiological safety', 'RG 1', 'ULOR (<1%)', 'Yes',
      'Control/dimming', 'Type', 'Trailing edge',
      'Protection', 'Protection class', 'Class II', 'IK Class', 'IK06',
      'IP Class', 'IP65',
      'Energy and approvals', 'Contains a light source with energy class', 'E/E/E/E',
      'Material and finish', 'Housing', 'Aluminium',
      'Mounting/Connection', 'Mounting', 'Pole, wall, base or ground spike, Outdoor',
      'Model', '\u00d860', 'Cable', 'Cable 2x1mm\u00b2 5.0m',
      'Dimensions', 'Length (mm) L', '342', 'Width (mm) W', '182',
      'Height (mm) H', '144', 'Weight (kg) gross/net', '2.55 / 2.02',
      'Packaging', 'Packaging dimensions (mm)', '340 x 190 x 200',
    ].join('\n');
    const r = lees(blad);
    is('engels blad vult het blad', m.naarBladvelden(r.uit),
      {vermogen:'8W/17W', lumen:'580/620/1220/1300lm', cct:'3000/4000K',
       ip:'IP65', ik:'IK06', ugr:'UGR<22/25', cri:'Ra>80',
       montage:'Pole, wall, base or ground spike, Outdoor', aansluiting:'Cable 2x1mm\u00b2 5.0m',
       levensduur:'L80/B20>50,000', aansturing:'Trailing edge', dimbaar:'Ja',
       afmetingen:'342\u00d7182 \u00d7 H144'});
    is('Type onder Control/dimming is de dimwijze', r.uit.type, undefined);
    is('Optic als veldnaam, niet als kopje', r.uit._optiek, 'Glass');
    is('engels blad laat niets liggen', r.onbekend, []);
  }

  /* Een rij losse waarden in het Engels. */
  {
    const r = lees('600x600 mm, Visible profile ceiling version, Steel, White, Signal white (RAL9003), '
      + 'Power supply with DALI interface, 3600 lm, 26 W, 140 lm/W, 4000 K, (0.38, 0.38) SDCM \u22643, '
      + 'UGR19, Beam angle 90\u00b0, Micro-prismatic lens, Polystyrene, '
      + 'IP 20/44 | Protection against fingers, IK02 | 0.2 J standard, '
      + 'Safety class II, Plug connector, 4-pole');
    is('engelse waardenrij vult het blad', m.naarBladvelden(r.uit),
      {vermogen:'26 W', lumen:'3600 lm', cct:'4000 K', ip:'IP 20/44',
       ik:'IK02, 0.2 J standard', ugr:'UGR19',
       montage:'Visible profile ceiling version', kleur:'Signal white (RAL9003)',
       aansluiting:'Plug connector, 4-pole',
       bundel:'90\u00b0', aansturing:'Power supply with DALI interface', dimbaar:'Ja',
       afmetingen:'600\u00d7600 mm'});
    is('engelse klasse-aanduiding', r.uit._klasse, 'Safety class II');
    is('engelse materialen schuiven aan', r.uit._materiaal, 'Steel, Polystyrene');
  }

  /* En de keerzijde: een Engelse zin met komma's is GEEN waardenrij. "Recessed"
     en "prismatic" passen allebei op een patroon, maar midden in een zinsdeel -
     daarom telt alleen een patroon dat het hele stuk beslaat. */
  {
    const zin = 'Recessed downlight, round, with a micro-prismatic diffuser for offices';
    const r = lees(zin + '\nPower: 15 W');
    is('engelse zin blijft de omschrijving', r.uit.omschrijving, zin);
    is('en de regel eronder wordt gewoon gelezen', r.uit.vermogen, '15 W');
  }

  /* Een waardenrij zoals hij echt binnenkomt: als een zin getypt, met een punt
     erachter en een dubbele spatie er per ongeluk in. Allebei lieten ze de hele
     regel eerst op stuk vallen - de dubbele spatie omdat die voor een geplakte
     tabelregel doorging, de punt omdat "IK08." nergens meer op past. */
  {
    const r = lees('LED-armatuur, grijze spuitgietpolycarbonaat behuizing, '
      + 'heldere polycarbonaat afdekking met prismastructuur, 2200 lm, 19 W, '
      + '1270 \u00d7 113 \u00d7 106 mm,  IP65, IK08.');
    is('zinsvorm vult het blad', m.naarBladvelden(r.uit),
      {type:'LED-armatuur', vermogen:'19 W', lumen:'2200 lm', ip:'IP65', ik:'IK08',
       afmetingen:'1270\u00d7113\u00d7106 mm'});
    /* De punt van de zin hoort niet bij de waarde. */
    is('punt aan het eind gaat eraf', r.uit.ik, 'IK08');
    /* Het materiaal staat hier in een zinsdeel, niet als los woord. */
    is('materiaal uit een zinsdeel', r.uit._materiaal, 'grijze spuitgietpolycarbonaat behuizing');
    is('optiek gaat voor materiaal', r.uit._optiek, 'heldere polycarbonaat afdekking met prismastructuur');
    is('zinsvorm laat niets liggen', r.onbekend, []);
  }

  /* < en > op dezelfde regel zijn geen HTML. "UGR<19, Ra>80" werd "UGR80":
     alles tussen de tekens gold als tag. Een tag begint met een letter of een /. */
  {
    is('< en > op \u00e9\u00e9n regel zijn geen tag',
      m.ONTHTML('UGR<19, Ra>80.'), 'UGR<19, Ra>80.');
    /* Echte opmaak gaat er wel uit - zo komt het binnen uit een webpagina. */
    is('echte opmaak gaat er wel uit',
      m.ONTHTML('<span class="w">50.000 uur</span>'), '50.000 uur');
    is('levensduur uit geplakte opmaak',
      lees('Levensduur: <span class="w">50.000 uur</span>').uit.levensduur, '50.000 uur');
    const r = lees('LED paneel, 3600 lm, 26 W, 4000 K, UGR<19, Ra>80.');
    is('UGR blijft heel', r.uit.ugr, 'UGR<19');
    is('kleurweergave blijft heel', r.uit.cri, 'Ra>80');
  }

  /* Montage, aansluiting en noodverlichting staan sinds kort op het blad zelf. */
  {
    const blad = (t,k) => m.naarBladvelden(lees(t).uit)[k];
    is('montage uit een tabelrij',
      blad('\tMontage\tPaal, wand, sokkel of aardstaaf', 'montage'), 'Paal, wand, sokkel of aardstaaf');
    is('engels mounting', blad('Mounting\tSurface', 'montage'), 'Surface');
    is('de kabel is de aansluiting',
      blad('Kabel\tKabel 2x1mm\u00b2 5,0m', 'aansluiting'), 'Kabel 2x1mm\u00b2 5,0m');
    is('noodmodule', blad('Noodverlichting: Noodmodule 3 uur autotest', 'nood'),
      'Noodmodule 3 uur autotest');
    is('noodmodule los in een waardenrij',
      blad('LED Downlight, 15 W, 1650 lm, IP44, Noodmodule 3 uur zelftest.', 'nood'),
      'Noodmodule 3 uur zelftest');
    /* Dimbaar en aansturing zijn twee rijen: of er gedimd kan worden, en waarmee.
       Noemt de leverancier er maar \u00e9\u00e9n, dan volgt de ander eruit. */
    is('aansturing vult zijn eigen rij',
      blad('Controle/dimmen\nAansturing\tDALI', 'aansturing'), 'DALI');
    is('en maakt het armatuur dimbaar',
      blad('Controle/dimmen\nAansturing\tDALI', 'dimbaar'), 'Ja');
    is('aan-uit is niet dimbaar', blad('Aansturing: Aan-uit', 'dimbaar'), 'Nee');
    /* Een bewegingsmelder als aansturing zegt niets over dimmen: dan leeg. */
    is('een melder zegt niets over dimmen', blad('Aansturing: BM', 'dimbaar'), undefined);
    /* "Dimbaar: ja, DALI" noemt allebei; het protocol hoort in zijn eigen rij. */
    is('protocol achter "ja" schuift door', blad('Dimbaar: Ja, DALI', 'aansturing'), 'DALI');
    is('sensor uit een label', blad('Sensor: Bewegingssensor 360\u00b0', 'sensor'), 'Bewegingssensor 360\u00b0');
    is('sensor los in een waardenrij',
      blad('LED paneel, 26 W, 3600 lm, 4000 K, DALI-2, Bewegingssensor, IP20', 'sensor'),
      'Bewegingssensor');
  }

  /* Het gradenteken zegt dat het om de lichtbundel gaat. */
  {
    const blad = (t) => m.naarBladvelden(lees(t).uit).bundel;
    /* Zo komt het uit een tabel van een leverancier: label en waarde met een tab
       ertussen, en een spatie voor het teken. */
    is('tabelrij met het gradenteken', blad('\tLichtbundel\t90 \u00b0'), '90\u00b0');
    is('label met dubbele punt',       blad('Bundelhoek: 60\u00b0'), '60\u00b0');
    is('engels label',                 blad('Beam angle\t120 \u00b0'), '120\u00b0');
    is('kaal in een waardenrij',
      blad('LED Downlight, 15 W, 1650 lm, 90\u00b0, IP44, IK03'), '90\u00b0');
    is('een bereik blijft een bereik',
      blad('LED Downlight, 15 W, 1650 lm, 60-90\u00b0, IP44, IK03'), '60-90\u00b0');
    /* Maar een temperatuur draagt hetzelfde teken en is geen bundel. */
    is('omgevingstemperatuur is geen bundel',
      blad('Omgevingstemperatuur: -20\u00b0C tot +40\u00b0C\nVermogen: 15 W'), undefined);
    is('graden Celsius in een rij ook niet',
      blad('LED Downlight, 15 W, 1650 lm, 25 \u00b0C, IP44, IK03'), undefined);
  }

  /* \u00d8 zegt dat het om de diameter gaat, en die hoort bij de afmetingen. */
  {
    const blad = (t) => m.naarBladvelden(lees(t).uit).afmetingen;
    is('\u00d8 in een waardenrij',
      blad('LED Downlight, 15 W, 1650 lm, 3000 K, \u00d8150, IP20'), '\u00d8150');
    is('spatie achter de \u00d8 gaat eruit',
      blad('LED paneel, 26 W, 3600 lm, \u00d8 226 mm, IP20, IK02'), '\u00d8226 mm');
    is('\u00d8 met hoogte achter een label',
      blad('Afmetingen: \u00d8226 x 80(H) mm'), '\u00d8226 x 80(H) mm');
    is('buitenmaat is ook de maat',
      blad('Buitenmaat: \u00d8150x80(H)'), '\u00d8150x80(H)');
    is('los diameterlabel wordt \u00d8',
      blad('Diameter: 226 mm'), '\u00d8226');
    /* "Inbouwdiameter" is in het vak het GAT, niet de maat van het armatuur. */
    is('inbouwdiameter is de zaagmaat',
      blad('Inbouwdiameter: \u00d8200'), 'cut-out \u00d8200');
    /* En dan houden de buitenmaat en de zaagmaat elkaar niet weg. */
    is('buitenmaat en zaagmaat naast elkaar',
      blad('LED Downlight, 15 W, 1650 lm, \u00d8226, zaagmaat \u00d8200-210, IP44'),
      '\u00d8226 \u2014 cut-out \u00d8200-210');
    /* Een kaal getal is geen maat: dat kan van alles zijn. */
    is('kaal getal wordt geen maat',
      blad('LED Downlight, 15 W, 1650 lm, 226, IP44'), undefined);
  }

  /* Een bestekregel zoals de binnendienst hem uit een bestek plakt: korte,
     Nederlandse labels, niet de schrijfwijze van een leverancierstabel.
     Leverancier en Toepassing zijn rijen op het blad die geen enkel label
     hadden - die waren dus alleen met de hand te vullen. */
  {
    const bestek = [
      'Fabricaat: Glamox', 'Montage: Inbouw / Opbouw', 'Type: D70-R195 G2',
      'Uitvoering: LED', 'Schakeling: Dali/ Dim', 'Reflector: Zilvermat (SM)',
      'Lumen: 2220LM', 'Kleur temp: 4000K', 'Locatie: Gangen', 'Kleur: Wit',
    ].join('\n');
    const r = lees(bestek);
    is('bestekregels vullen het blad', m.naarBladvelden(r.uit),
      {leverancier:'Glamox', toepassing:'Gangen', type:'D70-R195 G2',
       lumen:'2220LM', cct:'4000K', montage:'Inbouw / Opbouw', kleur:'Wit',
       aansturing:'Dali/ Dim', dimbaar:'Ja'});
    /* "Uitvoering" en "Reflector" hebben geen eigen rij op het blad, maar worden
       wel gelezen - anders meldt de tool ze als onbekend en gaat de gebruiker
       zoeken naar een fout die er niet is. */
    is('uitvoering wordt gelezen zonder eigen rij', r.uit._uitvoering, 'LED');
    is('reflector wordt gelezen zonder eigen rij', r.uit._optiek, 'Zilvermat (SM)');
    is('een bestek laat niets liggen', r.onbekend, []);
  }

  /* Een echt label weet meer dan een patroon en wordt niet overschreven. */
  {
    const r = lees('Lichtstroom: 1650 lm\nWit, 3600 lm, 26 W, 4000 K, IP20, UGR<19');
    is('het label wint van de waardenrij', r.uit.lumen, '1650 lm');
  }
}

/* ==================== waarden uit de productdata ==================== */
{
  const m = await laadUit('vergelijker/index-template.html', ['typeVan','artikelVoorWoord']);

  console.log('\nwaarden uit de productdata');

  /* De familienaam geldt voor de hele serie, de uitgelezen naam voor dit ene
     artikel. Dezelfde afweging als bij ipVan(): de familienaam blijft staan
     zolang die al zegt wat de omschrijving zegt. */
  is('rijkere familienaam blijft staan',
    m.typeVan({naam:'LED TL Waterdicht Armatuur Essence Classic G3 IP66'},
              {type:'Essence Classic G3'}),
    'LED TL Waterdicht Armatuur Essence Classic G3 IP66');
  is('preciezere omschrijving wint',
    m.typeVan({naam:'LED Downlight Luna G2'},
              {type:'LED Inbouw/Opbouw Downlight Luna G2'}),
    'LED Inbouw/Opbouw Downlight Luna G2');
  is('dezelfde naam verandert niets',
    m.typeVan({naam:'LED Downlight Essence G2'}, {type:'LED Downlight Essence G2'}),
    'LED Downlight Essence G2');
  /* Hoofdletters en dubbele spaties uit de prijslijst mogen niet uitmaken. */
  is('hoofdletters en spaties tellen niet mee',
    m.typeVan({naam:'LED Paneel Essence G3'}, {type:'paneel  essence g3'}),
    'LED Paneel Essence G3');
  is('zonder uitgelezen naam blijft de familienaam',
    m.typeVan({naam:'LED Downlight Mondial'}, {}), 'LED Downlight Mondial');
  is('zonder familienaam wint de uitgelezen naam',
    m.typeVan({}, {type:'LED Downlight Mondial'}), 'LED Downlight Mondial');

  /* Zoeken op artikelnummer. artikelVoorWoord() is het stuk dat beslist wélk
     artikel een getypt nummer aanwijst; zoekFamilies() eromheen leest de
     globale DATA en valt daarom buiten deze controle. */
  const fam = {varianten:[
    {artikelcode:'1000152'}, {artikelcode:'1000152-DA'}, {artikelcode:'1000152-S'},
    {artikelcode:'WO1046761', basiscode:'WO1046761', barcode:'8712345678901'},
  ]};
  is('een exacte code wijst dat artikel aan',
    m.artikelVoorWoord(fam,'1000152')?.artikelcode, '1000152');
  is('code met uitvoering wijst die uitvoering aan',
    m.artikelVoorWoord(fam,'1000152-da')?.artikelcode, '1000152-DA');
  is('de barcode telt ook mee',
    m.artikelVoorWoord(fam,'8712345678901')?.artikelcode, 'WO1046761');
  /* Een artikelnummer moet een-op-een kloppen. Een half nummer wijst niets aan:
     een bijna-treffer aanbieden betekent het verkeerde artikel offreren. */
  is('een half nummer wijst niets aan',
    m.artikelVoorWoord(fam,'100015'), null);
  is('een begin van een code wijst niets aan',
    m.artikelVoorWoord(fam,'wo10467'), null);
  /* Een basiscode hoort bij meerdere uitvoeringen en kiest er dus geen. */
  is('een basiscode kiest geen uitvoering',
    m.artikelVoorWoord({varianten:[{artikelcode:'X-DA',basiscode:'X'}]},'x'), null);
  /* Zonder cijfer is het geen artikelnummer; anders wees "wit" het eerste het
     beste artikel aan en kreeg je dat in plaats van een vrije keuze. */
  is('een woord zonder cijfer wijst niets aan',
    m.artikelVoorWoord(fam,'wit'), null);
  is('een nummer dat niet bestaat wijst niets aan',
    m.artikelVoorWoord(fam,'9999999'), null);
}

/* ---------------------------------------------------------------- verslag ---- */
console.log('\n' + gedaan + ' controles, ' + (mis ? mis + ' MIS' : 'alles goed') + '.');
process.exit(mis ? 1 : 0);
