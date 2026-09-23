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
     'ARM_NAAMWOORDEN', 'armNaamZone', 'ARM_SOORT', 'armSoorten', 'ARM_GROEP_SOORT', 'armBeginSoorten',
     'armBesteGroep', 'matchArmGroep', 'ARM_SCHRIJFWIJZE', 'armSuggestie'],
    /* armSuggestie() rekent met bewerkAfstand() uit zoeken.js, dat de tools ook laden */
    readFileSync(join(root, 'zoeken.js'), 'utf8'), ['bewerkAfstand']);
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

  /* De soort vooraan spreekt de groep tegen: dan valt die groep af. Alle vijf zijn
     echte omschrijvingen uit de catalogus die de verkeerde presenter kregen. */
  is('een paneel Essence G2 is geen downlight',
    groep('Pragmalux LED Paneel 60x60cm Essence G2 34W 4000K UGR<19 (4x14W) Excl. LED Driver'), 'ag13');
  is('een paneel Clean is geen highbay',
    groep('Pragmalux LED Paneel 60x60cm Clean IP65 Prisma 39W 3000K 4236lm UGR<19'), null);
  is('een highbay Essence is geen waterdichte Essence',
    groep('Pragmalux LED Highbay Essence IP65 100-200W 3000K-5000K 3CCT 15500-32000lm 90D Zwart'), null);
  /* Paneel en bandraster zijn één soort: de Flexcore-presenter heet zelf zo. */
  is('bandraster Flexcore houdt de Flexcore-presenter',
    groep('Pragmalux LED Bandrasterarmatuur Flexcore Microprisma 185x1542mm 26-36W 3600-4800lm'), 'ag30');
  /* Een soortwoord alleen wijst niets aan; er moet een naamwoord raken. */
  is('Polo is niet Qube omdat beide wandarmatuur zijn',
    groep('Pragmalux LED Plafonnière / Wandarmatuur Polo IP64 8W 3000K 650lm Ø180 (1x18W)'),
    m.ARM_GROEPEN.find(g => g.naam === 'Polo G3').id);
  is('Aludisc is geen Qube', groep('Pragmalux LED Plafonnière / Wandarmatuur Aludisc-M Zwart Ø340 IP66 IK10'), null);
  is('een bandraster zonder naam is geen Miro',
    groep('Pragmalux LED Bandraster Opaal 295x1560mm 43W 6000lm 4000K wit RAL9003'), null);

  /* Een tikfout krijgt een voorstel, een echte productnaam die de tabel niet kent niet. */
  const sug = (t) => { const x = m.armSuggestie(t); return x ? [x.suggestie, x.groep.id] : null; };
  is('verwisseling telt als één fout', m.bewerkAfstand('mondail', 'mondial', 2), 1);
  is('Esence wordt Essence', sug('Esence G2 downlight 9W'), ['Essence', 'ag14']);
  is('Mondail wordt Mondial', sug('Mondail opbouw'), ['Mondial', groep('Mondial opbouw')]);
  is('Lumoi wordt Lumio', sug('Plafonniere Lumoi'), ['Lumio', 'ag39']);
  is('Horizon wordt niet Orion', sug('Pragmalux LED Highbay Horizon 100W 4000K 14000lm'), null);
  is('Area wordt niet Arda', sug('Pragmalux LED Straatverlichting Area 100W 4000K 14000lm'), null);
  is('herkend geeft geen suggestie', sug('Punto 15W zwart'), null);

  /* De meting over de hele catalogus: alle artikelen van één Pragmalux-familie horen
     bij dezelfde presenter uit te komen. Een familie die over twee groepen valt is
     een aanwijzing voor een verkeerde herkenning - op de drie na die hieronder
     staan, waar de tabel echt twee presenters heeft voor wat de prijslijst één
     serie noemt. De ondergrens mag omhoog, nooit omlaag. En een suggestie mag op
     geen enkel echt artikel afgaan: dat zou een bestaande naam "verbeteren". */
  const data = JSON.parse(readFileSync(join(root, 'vergelijker/data/armaturen.json'), 'utf8'));
  let eens = 0, zonder = 0, onterecht = 0; const gesplitst = [];
  for(const f of data.families){
    if(!/pragmalux/i.test(f.merk || '')) continue;
    const ids = new Set();
    for(const v of f.varianten){
      const g = m.matchArmGroep(v.omschrijving || '');
      if(g) ids.add(g.id); else if(m.armSuggestie(v.omschrijving || '')) onterecht++;
    }
    if(!ids.size) zonder++; else if(ids.size === 1) eens++; else gesplitst.push(f.naam);
  }
  is('families die over groepen vallen', gesplitst.sort(),
    ['LED Paneel Sigma', 'LED Portiek Port PKVW', 'LED TL Waterdicht Armatuur Essence Classic']);
  is('families met één presenter: ondergrens 151', eens >= 151, true);
  is('geen suggestie op een echt artikel', onterecht, 0);
  console.log('  catalogus: ' + eens + ' families eenduidig, ' + gesplitst.length + ' gesplitst, '
            + zonder + ' zonder presenter.');
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
    ['SECTIE', 'VELDMAP', 'FRAGMENTEN', 'VRIJE_TEKST', 'parseGetal', 'mm', 'zaagTekst',
     'naarBladvelden'],
    'const window = {};\n' + lezer + '\n'
    + 'const LEZER = window.SpecLezer.maak({veldmap:VELDMAP, sectie:SECTIE, kop:true,\n'
    + '                                     fragmenten:FRAGMENTEN, vrijeTekst:VRIJE_TEKST});\n'
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
       vermogen:'15 W', lumen:'1650 lm', cct:'3000 K', aansturing:'DALI', dimbaar:'Ja'});
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
      {vermogen:'26 W', lumen:'3600 lm', rendement:'140 lm/W', cct:'4000 K', ip:'IP 20/44',
       ik:'IK02, 0,2 J standaard', ugr:'UGR19',
       montage:'Visible profile ceiling version', kleur:'Signaalwit (RAL9003)',
       aansluiting:'Insteekconnector, 4-polig',
       bundel:'90\u00b0', optiek:'Microprismatische lens',
       aansturing:'Voedingsunit met DALI-interface', dimbaar:'Ja',
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
      {vermogen:'8W/17W', lumen:'580/620/1220/1300lm', rendement:'73/78/72/76lm/W',
       cct:'3000/4000K',
       ip:'IP65', ik:'IK06', ugr:'UGR<22/25', cri:'Ra>80',
       montage:'Paal, wand, sokkel of aardstaaf, Buiten', aansluiting:'Kabel 2x1mm\u00b2 5,0m',
       optiek:'Glas',
       levensduur:'L80/B20>50,000', aansturing:'Fase afsnijding', dimbaar:'Ja',
       afmetingen:'342\u00d7182 \u00d7 H144'});
    /* "Optiek" is zowel een kopje als een veldnaam; wat eronder staat beslist. */
    is('Optiek als veldnaam, niet als kopje', r.uit.optiek, 'Glas');
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
      {vermogen:'8W/17W', lumen:'580/620/1220/1300lm', rendement:'73/78/72/76lm/W',
       cct:'3000/4000K',
       ip:'IP65', ik:'IK06', ugr:'UGR<22/25', cri:'Ra>80',
       montage:'Pole, wall, base or ground spike, Outdoor', aansluiting:'Cable 2x1mm\u00b2 5.0m',
       optiek:'Glass',
       levensduur:'L80/B20>50,000', aansturing:'Trailing edge', dimbaar:'Ja',
       afmetingen:'342\u00d7182 \u00d7 H144'});
    is('Type onder Control/dimming is de dimwijze', r.uit.type, undefined);
    is('Optic als veldnaam, niet als kopje', r.uit.optiek, 'Glass');
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
      {vermogen:'26 W', lumen:'3600 lm', rendement:'140 lm/W', cct:'4000 K', ip:'IP 20/44',
       ik:'IK02, 0.2 J standard', ugr:'UGR19',
       montage:'Visible profile ceiling version', kleur:'Signal white (RAL9003)',
       aansluiting:'Plug connector, 4-pole',
       bundel:'90\u00b0', optiek:'Micro-prismatic lens',
       aansturing:'Power supply with DALI interface', dimbaar:'Ja',
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
       optiek:'heldere polycarbonaat afdekking met prismastructuur',
       afmetingen:'1270\u00d7113\u00d7106 mm'});
    /* De punt van de zin hoort niet bij de waarde. */
    is('punt aan het eind gaat eraf', r.uit.ik, 'IK08');
    /* Het materiaal staat hier in een zinsdeel, niet als los woord. */
    is('materiaal uit een zinsdeel', r.uit._materiaal, 'grijze spuitgietpolycarbonaat behuizing');
    is('optiek gaat voor materiaal', r.uit.optiek, 'heldere polycarbonaat afdekking met prismastructuur');
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
       optiek:'Zilvermat (SM)', aansturing:'Dali/ Dim', dimbaar:'Ja'});
    /* "Reflector" is de optiek, en die heeft sinds kort een eigen rij. "Uitvoering"
       heeft er geen, maar wordt wel gelezen - anders meldt de tool hem als
       onbekend en gaat de gebruiker zoeken naar een fout die er niet is. */
    is('uitvoering wordt gelezen zonder eigen rij', r.uit._uitvoering, 'LED');
    is('de reflector is de optiek', r.uit.optiek, 'Zilvermat (SM)');
    is('een bestek laat niets liggen', r.onbekend, []);
  }

  /* Een verkooptekst in plaats van een blad: alles in lopende tekst, de opgave
     half achter een label en half midden in een zin. Zo levert een deel van de
     leveranciers zijn bestekpositie aan. Hiervoor kwam er twee rijen uit - de
     rest liep als bijzin mee in "lifespan:" of stond nergens.

     De drie stukken die dit aankan staan hieronder los uit elkaar getrokken;
     deze proef is de hele tekst zoals hij binnenkomt. */
  {
    const verkoop =
      'The Panel IP65 CR is a range of backlit LED panels tested by 3rd party to ensure '
      + 'they meet ISO 14644-1 Class 3-9 cleanroom classification. Ideal for healthcare, '
      + 'hospitals, laboratories and pharmaceutical industry, it meets the IFS requirements '
      + 'by offering impact resistant cover and good cleanability. Easy-to-clean luminaires '
      + 'with a high protection class to avoid vapors and dust entry. Low glaring UGR<19. '
      + 'RG0, 100-degree beam angle, optical system: prismatic diffuser with powder coating '
      + 'finish. Tp(b) rated diffuser that may not burn at a speed of more than 50mm per '
      + 'minute. Light color temperature: 4000K Cool White, total system power: 37W, '
      + 'total fixture output: 4400lm, efficacy: 119lm/W, Ra80 typical, LED chromaticity: '
      + '3 step MacAdam ellipse (SDCM3), lifespan: 100,000 hours at 70% of the original '
      + 'output (L70B50), operating voltage: 220-240V / 50-60Hz, low flicker, DALI-2 '
      + 'dimmable IP65 driver, electrical protection: Class I. Degree of Protection: IP65 '
      + '(both front and back) - able to protect against water jets. Nominal size: '
      + '595x595mm, Loop in / loop out wiring with accessory box, safety cables included, '
      + '34mm nominal height, White color frame, weight: 2.2kg. For using EM kits '
      + '0046600-01 please order connector 0047523.';
    const r = lees(verkoop), b = m.naarBladvelden(r.uit);
    /* Achter een Engels label - de schrijfwijzen die een verkooptekst gebruikt. */
    is('total system power is het vermogen',  b.vermogen, '37W');
    is('total fixture output is de lichtstroom', b.lumen, '4400lm');
    is('light color temperature is de kleurtemperatuur', b.cct, '4000K Cool White');
    /* En midden in een zin, waar geen label bij staat. */
    is('UGR uit de lopende tekst',            b.ugr, 'UGR<19');
    is('kleurweergave uit de lopende tekst',  b.cri, 'Ra80');
    is('100-degree is de bundelhoek',         b.bundel, '100\u00b0');
    is('DALI-2 uit de lopende tekst',         b.aansturing, 'DALI-2');
    is('en daarmee is hij dimbaar',           b.dimbaar, 'Ja');
    is('de kleur staat bij het woord kleur',  b.kleur, 'White');
    is('de optiek krijgt zijn eigen rij',     b.optiek,
      'prismatic diffuser with powder coating finish');
    /* "efficacy: 119lm/W, Ra80 typical" - het rendement houdt op bij lm/W, en de
       Ra die erachter stond komt in zijn eigen rij terecht. */
    is('het rendement houdt op bij lm/W',     b.rendement, '119lm/W');
    /* De levensduur hield op waar de volgende opgave begon; hiervoor slikte hij
       de netspanning, "low flicker" en de driver er alledrie bij in. */
    is('de levensduur houdt op bij het volgende label',
      b.levensduur, '100,000 hours at 70% of the original output (L70B50)');
    /* De omschrijving is de tekst tot de eerste opgave. */
    is('de verkooptekst blijft de omschrijving',
      /^The Panel IP65 CR is a range/.test(b.omschrijving||''), true);
    /* En wat nergens onder viel blijft zichtbaar: de bestelaanwijzing achterin is
       precies wat de binnendienst moet lezen. */
    is('de losse zinnen blijven zichtbaar', r.onbekend,
      ['Tp(b) rated diffuser that may not burn at a speed of more than 50mm per minute',
       'For using EM kits 0046600-01 please order connector 0047523.']);
  }

  /* Stuk 1: een waarde houdt op aan het eind van zijn zin. Wat erachter stond
     verdwijnt niet - het wordt een eigen regel en komt in `onbekend`. */
  {
    const r = lees('Gewicht: 2.2kg. For using EM kits 0046600-01 please order connector 0047523.');
    is('de waarde houdt op bij de punt', r.uit._gewicht, '2.2kg');
    is('en de zin erachter blijft zichtbaar', r.onbekend,
      ['For using EM kits 0046600-01 please order connector 0047523.']);
    /* Maar een punt zonder spatie hoort bij het getal, en die mag niet knippen. */
    is('een punt in een getal knipt niet',
      lees('Levensduur: 50.000 uur L80B10').uit.levensduur, '50.000 uur L80B10');
    is('en een komma in een getal ook niet',
      lees('Levensduur: L80/B20>50,000').uit.levensduur, 'L80/B20>50,000');
  }

  /* Stuk 2: een nieuw label achter een punt begint een nieuw paar. Zonder deze
     knip liep de waarde van het vorige label door tot het volgende BEKENDE label
     en slikte er hele zinnen bij in. */
  {
    const r = lees('Type: LED paneel. Vermogen: 26 W. Lichtstroom: 3600 lm');
    is('een label achter een punt is een nieuw paar', m.naarBladvelden(r.uit),
      {type:'LED paneel', vermogen:'26 W', lumen:'3600 lm'});
    /* Een gewone zin met een punt erin valt niet uit elkaar: er volgt geen label. */
    const zin = 'Inbouwdownlight voor kantoren. Geschikt voor systeemplafonds';
    is('een zin zonder label blijft heel', lees(zin + '\nVermogen: 15 W').uit.omschrijving, zin);
  }

  /* Stuk 3: de lopende-tekstronde vult alleen wat de gewone ronde leeg liet. */
  {
    const r = lees('Lichtstroom: 1650 lm\nDe armatuur geeft 3600 lm bij 26 W.');
    is('het label wint van de lopende tekst', r.uit.lumen, '1650 lm');
    is('en wat leeg was wordt wel gevuld', r.uit.vermogen, '26W');
    /* "119lm/W" is het rendement, niet de lichtstroom. */
    is('lm/W is geen lichtstroom', lees('Een efficiency van 119lm/W.').uit.lumen, undefined);
  }

  /* Een echt label weet meer dan een patroon en wordt niet overschreven. */
  {
    const r = lees('Lichtstroom: 1650 lm\nWit, 3600 lm, 26 W, 4000 K, IP20, UGR<19');
    is('het label wint van de waardenrij', r.uit.lumen, '1650 lm');
  }
}

/* ==================== waarden uit de productdata ==================== */
{
  const m = await laadUit('vergelijker/index-template.html',
    ['typeVan','CODEINDEX','codeIndex','codeKlopt','artikelVoorWoord','rendementVan','ugrVan','criVan',
     'nieuwePositie','AKKOORD','REF_VELDEN','PDF_VERBORGEN'],
    readFileSync(join(root, 'zoeken.js'), 'utf8'));

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

  /* Het rendement staat niet in de prijslijst maar volgt uit de lichtstroom
     gedeeld door het vermogen. Bij een dipswitch-armatuur zijn dat allebei
     bereiken, en die horen per stand bij elkaar. */
  is('lichtstroom gedeeld door vermogen',
    m.rendementVan({vermogen_w:{min:26,max:26}, lichtstroom_lm:{min:3600,max:3600}}),
    '138 lm/W');
  is('de uiteinden van een dipswitch horen bij elkaar',
    m.rendementVan({vermogen_w:{min:50,max:70}, lichtstroom_lm:{min:7279,max:10191}}),
    '146 lm/W');
  is('verschillen ze, dan is het een bereik',
    m.rendementVan({vermogen_w:{min:50,max:80}, lichtstroom_lm:{min:8000,max:12500}}),
    '156-160 lm/W');
  /* Staat er alleen een bovengrens, dan is dat de stand waar het getal bij hoort. */
  is('alleen een bovengrens rekent met die grens',
    m.rendementVan({vermogen_w:{min:null,max:6}, lichtstroom_lm:{min:null,max:690}}),
    '115 lm/W');
  /* Ontbreekt een van de twee, dan valt er niets te delen en blijft de rij leeg -
     een rendement verzinnen is erger dan een lege rij. */
  is('zonder lichtstroom geen rendement',
    m.rendementVan({vermogen_w:{min:26,max:26}}), '');
  is('zonder vermogen geen rendement',
    m.rendementVan({lichtstroom_lm:{min:3600,max:3600}}), '');
  is('nul watt levert geen deling op',
    m.rendementVan({vermogen_w:{min:0,max:0}, lichtstroom_lm:{min:3600,max:3600}}), '');

  /* UGR en kleurweergave staan in de omschrijving van het artikel zélf en
     daarnaast bij de familie. Het artikel gaat voor: de Sigma noemt op elke
     regel UGR<19 en had die rij toch leeg, omdat er voor die serie geen blok in
     de overlay stond. */
  is('het artikel gaat voor de familie',
    m.ugrVan({ugr:'<22'}, {ugr:'<19'}), 'UGR<19');
  is('zonder opgave bij het artikel telt de familie',
    m.ugrVan({ugr:'<22'}, {}), 'UGR<22');
  is('zegt geen van beide iets, dan niets',
    m.ugrVan({}, {}), '');
  /* Een waterdicht armatuur heeft die opgave niet; dan hoort er geen kale
     "UGR" op het blad te staan. */
  is('geen familie en geen artikel', m.ugrVan(null, null), '');
  /* Het teken hoort bij het getal en wordt getoond zoals het er staat. */
  is('het teken blijft staan', m.ugrVan({}, {ugr:'<=22'}), 'UGR\u226422');

  /* Bij de kleurweergave verschillen de twee bronnen van vorm: de prijslijst
     schrijft ">90", de overlay een ondergrens. Allebei zeggen ze iets anders,
     dus allebei worden ze getoond zoals ze bedoeld zijn. */
  is('het teken uit de omschrijving blijft staan',
    m.criVan({cri_min:80}, {cri:'>90'}), 'CRI>90');
  is('de ondergrens uit de overlay is een ondergrens',
    m.criVan({cri_min:80}, {}), 'CRI\u226580');
  is('zonder opgave niets', m.criVan({}, {}), '');
  /* cri_min 0 bestaat niet, maar null en undefined moeten wel onderscheiden
     worden van "niets ingevuld" - anders komt er "CRIundefined" te staan. */
  is('een familie zonder cri_min levert niets', m.criVan({cri_min:null}, {}), '');

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

  /* Leverancier en artikelnummer staan wel op het blad in de tool - de
     binnendienst moet de positie kunnen terugzoeken - maar niet op de PDF die
     naar buiten gaat. Een sleutel die in REF_VELDEN niet bestaat verbergt niets
     en valt nergens op, vandaar de derde controle. */
  const bladsleutels = m.REF_VELDEN.map(r => r[0]);
  is('de leverancier blijft van de PDF', m.PDF_VERBORGEN.includes('leverancier'), true);
  is('het artikelnummer blijft van de PDF', m.PDF_VERBORGEN.includes('artikelnummer'), true);
  is('elke verborgen sleutel is een echte rij',
    m.PDF_VERBORGEN.filter(k => !bladsleutels.includes(k)), []);

  /* De akkoordronde: de binnendienst schrijft haar voorstel op, de manager zet
     er een vinkje of een kruisje bij, en pas daarna wordt het artikel gekozen.
     Die drie velden reizen mee in het opgeslagen projectbestand - dat is de
     hele uitwisseling - dus ze horen bij de vorm die nieuwePositie() neerzet.
     Een positie zonder die sleutels zou na opslaan en heropenen leeg terugkomen
     zonder dat iemand dat merkt. */
  const pos = m.nieuwePositie('A1');
  is('een nieuwe positie kent de akkoordvelden',
    ['voorstel','akkoord','reactie'].map(k => pos[k]), ['','','']);
  /* De lege staat is "nog niet beoordeeld" en staat vooraan: dat is wat een
     positie is zolang niemand ernaar gekeken heeft. */
  is('nog niet beoordeeld is de eerste stand', m.AKKOORD[0][0], '');
  is('en er zijn er drie', m.AKKOORD.map(x => x[0]), ['','ja','nee']);
  /* Intern overleg hoort niet op het blad en dus ook niet in de PDF - dezelfde
     reden als bij PDF_VERBORGEN, maar hier hoeft er niets verborgen te worden
     omdat het nooit een rij is geweest. */
  is('het overleg staat niet op het blad',
    ['voorstel','akkoord','reactie'].filter(k => bladsleutels.includes(k)), []);
}

/* ============================== zoeken =============================== */
{
  const zoek = readFileSync(join(root, 'zoeken.js'), 'utf8');
  /* zoeken.js is een gewoon script met functies op het hoogste niveau; zo
     laden we het als module, net als armatuur-groepen.js hierboven. */
  const z = await import('data:text/javascript;base64,' + Buffer.from(zoek
    + '\nexport {zoekNormaal, zoekWoorden, codeSleutel, lijktCode, bevatWoord, maatLezingen, bewerkAfstand, besteSuggestie};\n')
    .toString('base64'));

  console.log('\nzoeken');

  /* Invoer gelijktrekken: accenten, hoofdletters, maten en eenheden. */
  is('accenten eraf', z.zoekNormaal('Plafonnière'), 'plafonniere');
  is('maat met spaties en \u00d7', z.zoekNormaal('60 x 60 \u00d7 10'), '60x60x10');
  is('getal en eenheid aan elkaar', z.zoekNormaal('4000 K 26 W'), '4000k 26w');
  /* Een woord met een cijfer mag niet achter een ander cijfer beginnen. */
  is('15w vindt geen 115W', z.bevatWoord('led 115w', '15w'), false);
  is('4000k vindt het in een reeks', z.bevatWoord('3000k-4000k', '4000k'), true);
  is('zonder cijfer mag het midden in een woord', z.bevatWoord('microprismatisch', 'prisma'), true);
  is('600x600 is ook 60x60', z.maatLezingen('600x600').includes('60x60'), true);
  is('120x30 is ook 30x120', z.maatLezingen('120x30').includes('30x120'), true);
  /* Een artikelnummer herkennen, en een meetwaarde niet. */
  is('een artikelnummer lijkt een code', z.lijktCode('1043227-tc-da'), true);
  is('een lichtstroom niet', z.lijktCode('13000lm'), false);
  /* Suggesties: tikfouten in woorden, nooit in nummers. */
  is('een letter te veel', z.besteSuggestie('sigmaa', ['sigma','essence']), 'sigma');
  is('een letter verwisseld', z.besteSuggestie('essense', ['sigma','essence']), 'essence');
  is('nooit bij een nummer', z.besteSuggestie('104322', ['1043227']), null);
  is('te ver weg is geen suggestie', z.besteSuggestie('xyzzy', ['sigma']), null);

  /* De familiezoeker van de vergelijker, op de echte catalogus. Elke regel hier
     gaf vóór deze ronde 0 families - behalve de laatste drie, die moeten nul
     blijven: een artikelnummer klopt een-op-een of het wijst niets aan. */
  const v = await laadUit('vergelijker/index-template.html',
    ['FAMILIETEKST','ARTIKELTEKST','familieTekst','artikelTekst','CODEINDEX','codeIndex','codeKlopt',
     'artikelVoorWoord','artikelenBijWoord','zoekFamilies','SUGGESTIEWOORDEN','zoekSuggestie'],
    zoek + '\nconst DATA = null;');
  const F = JSON.parse(readFileSync(join(root, 'vergelijker/data/armaturen.json'), 'utf8')).families;
  const eerste = (q) => { const r = v.zoekFamilies(q, F)[0]; return r ? r.fam.naam : null; };
  const lijst = (q) => v.zoekFamilies(q, F);
  for(const [q, fam] of [
    ['sigma dali', 'LED Paneel Sigma'], ['sigma 60x60', 'LED Paneel Sigma'],
    ['sigma 600x600', 'LED Paneel Sigma'], ['sigma g2', 'LED Paneel Sigma'],
    ['sigma zwart', 'LED Paneel Sigma'], ['sigma 4000 K', 'LED Paneel Sigma'],
    ['mondial verdiept', 'LED Downlight Mondial'], ['mondial zwart dali', 'LED Downlight Mondial'],
  ]) is('"' + q + '" vindt ' + fam, eerste(q), fam);
  /* Een artikel moet alle woorden dekken; wat terugkomt past ook echt. */
  const dali = lijst('sigma dali')[0];
  is('"sigma dali" geeft alleen DALI-artikelen',
    dali.passend.every(a => /dali/i.test(a.dimprotocol || a.omschrijving)), true);
  is('en niet de hele familie', dali.passend.length < dali.fam.varianten.length, true);
  is('plafonniere zonder accent = met accent',
    lijst('plafonniere').length, lijst('plafonni\u00e8re').length);
  is('plafonniere vindt iets', lijst('plafonniere').length > 0, true);
  /* Artikelnummers: met spaties, zonder streepjes, en het aangewezen artikel. */
  for(const q of ['1043227-TC-DA', '1043227 TC DA', '1043227TCDA'])
    is('"' + q + '" wijst 1043227-TC-DA aan', lijst(q)[0]?.art?.artikelcode, '1043227-TC-DA');
  /* 4030-P-HO en 4030-PHO zijn twee artikelen die alleen een streepje schelen. */
  is('4030-PHO precies', lijst('4030-PHO').map(x => x.art?.artikelcode), ['4030-PHO']);
  is('4030pho wijst geen van beide aan', lijst('4030pho').every(x => !x.art), true);
  is('maar vindt ze wel allebei', lijst('4030pho').length, 2);
  is('een half nummer vindt niets', lijst('104322').length, 0);
  is('een onbekend nummer vindt niets', lijst('9999999').length, 0);
  /* Een tikfout geeft een suggestie, geen stille correctie. */
  is('sigmaa vindt niets', lijst('sigmaa').length, 0);
  is('maar stelt sigma voor', v.zoekSuggestie('sigmaa', F), 'sigma');
  is('esence stelt essence voor', v.zoekSuggestie('esence', F), 'essence');
  is('geen suggestie bij een nummer', v.zoekSuggestie('104322', F), null);
}

/* ============================ zoeken in de railtool ============================ */
{
  /* De artikelzoeker en de onderdelen zochten de invoer als één stuk tekst:
     "rail wit" en "wit rail" vonden niets, "t-stuk" ook niet (het heet
     T-koppelstuk), en Onderdelen zocht niet op artikelnummer. */
  const r = await laadUit('index.html', ['parts', 'RAIL_SYNONIEMEN', 'onderdeelTekst', 'allArticles',
    'artikelRijTekst'], readFileSync(join(root, 'zoeken.js'), 'utf8'), ['zoekWoorden', 'tekstPast']);
  const artikelen = (q) => r.allArticles.filter(a =>
    r.tekstPast(r.artikelRijTekst(a), r.zoekWoorden(q), r.RAIL_SYNONIEMEN)).map(a => a.name);
  const onderdelen = (q) => r.parts.filter(p =>
    r.tekstPast(r.onderdeelTekst(p), r.zoekWoorden(q), r.RAIL_SYNONIEMEN)).map(p => p.name);

  console.log('\nzoeken in de railtool');
  is('rail wit vindt de witte rails', artikelen('rail wit'),
    ['Rail 1m Wit', 'Rail 2m Wit', 'Rail 3m Wit', 'Rail 4m Wit', 'Rail beugel + snelspanner Wit']);
  is('de volgorde van de woorden telt niet', artikelen('wit rail'), artikelen('rail wit'));
  is('3 m met spatie is 3m', artikelen('rail 3 m'), ['Rail 3m Wit', 'Rail 3m Zwart', 'Rail 3m Grijs']);
  is('t-stuk vindt het T-koppelstuk', artikelen('t-stuk').every(n => /^T-Koppelstuk/.test(n)), true);
  is('en vindt er iets', artikelen('t-stuk').length > 0, true);
  is('een artikelnummer precies', artikelen('2000766'), ['Rail 1m Wit']);
  /* Een tabel die meefiltert mag een half nummer tonen: hier wijst niets een
     artikel aan, je ziet de rijen die ermee beginnen. */
  is('een begin van een nummer filtert mee', artikelen('20007').length, 6);
  is('maar niet midden in een nummer', artikelen('00766'), []);
  is('onderdelen vindt een artikelnummer', onderdelen('2000766'), ['Rail']);
  is('onderdelen vindt een uitvoering', onderdelen('rail 3m'), ['Rail']);
  is('stekker is de schuko-adapter', onderdelen('stekker'), ['Schuko Adapter']);
}

/* ====================== presenters in de vergelijker ====================== */
{
  /* families.json noemde met de hand een presenter bij 3 van de 209 Pragmalux-
     families; de rest eindigde als "Nog geen presenter voor ...". presenterVan()
     valt nu terug op dezelfde herkenning als het armaturenboek. */
  const m = await laadUit('vergelijker/index-template.html',
    ['FAMILIEGROEP', 'familieGroep', 'presenterVan', 'presenterNaam'],
    readFileSync(join(root, 'armatuur-groepen.js'), 'utf8'),
    ['ARM_GROEPEN', 'ARM_GROEP_SOORT', 'armSoorten', 'armTokens']);
  const venster = {};
  new Function('window', readFileSync(join(root, 'presenters-data.js'), 'utf8'))(venster);
  const beschikbaar = new Set(venster.PRESENTER_FILES || []);
  const data = JSON.parse(readFileSync(join(root, 'vergelijker/data/armaturen.json'), 'utf8'));
  const leeg = {presenter: ''};
  const soortVan = id => m.ARM_GROEP_SOORT.get(m.ARM_GROEPEN.find(g => g.id === id)) || new Set();

  console.log('\npresenters in de vergelijker');
  let fams = 0, arts = 0, alle = 0; const tegenspraak = [], anderMerk = [];
  for(const f of data.families){
    const pragma = /pragmalux/i.test(f.merk || '');
    const famSoort = m.armSoorten(m.armTokens(f.armatuurtype || ''));
    let raak = false;
    for(const v of f.varianten){
      const {id} = m.presenterVan(leeg, f, v);
      if(pragma) alle++;
      if(!id) continue;
      if(!pragma && !f.presenter) anderMerk.push(f.naam);
      if(beschikbaar.has(id)){ raak = true; if(pragma) arts++; }
      /* de soort van de familie en die van de presenter mogen elkaar niet tegenspreken */
      const gs = soortVan(id);
      if(famSoort.size && gs.size && ![...gs].some(x => famSoort.has(x)))
        tegenspraak.push(f.naam + ' -> ' + m.presenterNaam(id));
    }
    if(raak && pragma) fams++;
  }
  is('geen presenter van een andere soort (paneel achter downlight e.d.)', [...new Set(tegenspraak)], []);
  is('geen Pragmalux-presenter bij een ander merk', [...new Set(anderMerk)], []);
  /* gemeten bij de invoering: 152 families, 2760 artikelen; mag omhoog, niet omlaag */
  is('families met een presenter: ondergrens 150', fams >= 150, true);
  console.log('  ' + fams + ' Pragmalux-families en ' + arts + ' van de ' + alle
            + ' artikelen hebben een presenter (was 3 families, 47 artikelen).');

  const fam = naam => data.families.find(f => f.naam === naam);
  const art = (f, code) => f.varianten.find(v => v.artikelcode === code);
  const pir = fam('LED Downlight Essence PIR');
  is('Essence PIR krijgt de PIR-presenter', m.presenterVan(leeg, pir, pir.varianten[0]).id, 'ag17');
  const sigma = fam('LED Paneel Sigma');
  const ip65 = sigma.varianten.find(v => /IP65/.test(v.omschrijving));
  const gewoon = sigma.varianten.find(v => !/IP65/.test(v.omschrijving));
  is('een Sigma-artikel krijgt de Sigma G2', m.presenterNaam(m.presenterVan(leeg, sigma, gewoon).id), 'Paneel Sigma G2');
  is('een Sigma IP65 krijgt die van de IP65', m.presenterNaam(m.presenterVan(leeg, sigma, ip65).id), 'Paneel Sigma G2 IP65');
  is('zonder artikel en oneens: geen', m.presenterVan(leeg, sigma, null).id, null);
  is('herkend staat erbij', m.presenterVan(leeg, sigma, gewoon).bron, 'herkend');
  is('families.json wint', m.presenterVan(leeg, pir, pir.varianten[0]).bron, 'familie');
  is('zelf gekozen wint van alles', m.presenterVan({presenter: 'ag01'}, pir, pir.varianten[0]), {id: 'ag01', bron: 'handmatig'});
  is('geen presenter is een keuze', m.presenterVan({presenter: '-'}, pir, pir.varianten[0]), {id: null, bron: 'geen'});
}

/* ---------------------------------------------------------------- verslag ---- */
console.log('\n' + gedaan + ' controles, ' + (mis ? mis + ' MIS' : 'alles goed') + '.');
process.exit(mis ? 1 : 0);
