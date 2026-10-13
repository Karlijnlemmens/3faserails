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
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { bladRijen } from './werkboek.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Eén declaratie uit de broncode halen: vanaf de regel waarop hij begint, net zolang
   regels erbij tot het geheel als javascript te ontleden valt. Haakjes tellen werkt
   hier niet - een reguliere expressie als /^\d+([.,]\d+)?$/ zit vol haakjes die niets
   openen, en function f(a){...} is al "in balans" na zijn parameterlijst. De ontleder
   van Node weet dat allemaal wel. */
function snijUit(tekst, naam){
  const regels = tekst.split('\n');
  let start = regels.findIndex(r => new RegExp('^(?:const|let|(?:async\\s+)?function)\\s+' + naam + '\\b').test(r));
  /* Anders een ingesprongen declaratie, zoals een hulpfunctie binnen de tekenlaag van
     pdf-huisstijl.js - alleen bruikbaar als die niets uit zijn omgeving nodig heeft. */
  if(start < 0) start = regels.findIndex(r => new RegExp('^\\s+(?:const|let|(?:async\\s+)?function)\\s+' + naam + '\\b').test(r));
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
     'armBesteGroep', 'matchArmGroep', 'ARM_SCHRIJFWIJZE', 'armSuggestie',
     'ARM_SERIES', 'armSerieKeuze', 'armKeuzeBlijft'],
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
  /* Sigma G2: IP44 (ag34) of IP65 (ag82), op de IP-klasse - de volledige naam zoals de
     gebruiker hem aanleverde, of alleen het type met de klasse, ook met een spatie of
     streepje ertussen ("IP 65", "IP-65"). */
  is('Sigma G2 IP65, volledige naam',
    groep('Pragmalux LED Paneel 30x120cm Sigma G2 IP65 CRI>90 37W 3000K-4000K 2-CCT 5000-5050lm UGR<19 '
        + '+IP65 Driver (2x28W/2x36W)'), 'ag82');
  is('Sigma G2 IP44, volledige naam',
    groep('Pragmalux LED Paneel 30x60cm Sigma G2 IP44 9-20W 3000K-4000K 2-CCT 1050-2500lm UGR<19 +Driver (2x14W)'), 'ag34');
  is('Sigma op de IP-klasse, ingetypt',
    ['Sigma IP65', 'sigma ip65', 'SIGMA IP 65', 'Sigma IP-65', 'IP65 Sigma', 'Sigma IP44', 'sigma ip 44', 'Sigma G2'].map(groep),
    ['ag82', 'ag82', 'ag82', 'ag82', 'ag82', 'ag34', 'ag34', 'ag34']);
  is('IP-klasse los getypt, ook bij andere types', ['Fora IP 65', 'Dot IP-65', 'Clean IP 69K'].map(groep), ['ag19', 'ag75', 'ag68']);
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
  /* Sinds september 2026 heeft de Highbay Essence een eigen blad; vóór die tijd gaf dit
     null, en dat was goed: de waterdichte Essence is het niet. */
  is('een highbay Essence is de Highbay Essence IP65, geen waterdichte Essence',
    groep('Pragmalux LED Highbay Essence IP65 100-200W 3000K-5000K 3CCT 15500-32000lm 90D Zwart'), 'ag111');

  /* De productlancering van september 2026 (productupdate_9-26.xlsx). */
  is('Clean HACCP G3 is de G3', groep('Pragmalux LED Highbay Clean HACCP G3 IP66&IP69K C4 100-200W 3000K-5000K 3CCT 18500-38000lm 90D 0-10V Dimbaar Grijs RAL9006 (250-400W)'), 'ag112');
  is('Clean HACCP G2 blijft de G2', groep('Pragmalux LED Highbay Clean HACCP G2 100W 4000K 13500lm 90D Wit 0-10V Dimbaar'), 'ag68');
  is('Clean HACCP zonder generatie blijft de G2', groep('Pragmalux LED Highbay Clean HACCP 100W 4000K 14000lm 90D Wit - 1-10V Dimbaar (250W)'), 'ag68');
  is('getypt: Clean G3 en Clean HACCP', [groep('Clean G3'), groep('Clean HACCP'), groep('Highbay Clean')], ['ag112', 'ag68', 'ag68']);
  is('de LED-Ario is de LED Half-inbouwspot Ario',
    groep('Pragmalux LED Half-inbouwspot Ario zaagmaat Ø70 zwart RAL9004 12W 850-900lm 2700-3000-4000K 3CCT CRI95 36° incl.Osram DALI2 driver'), 'ag113');
  is('de Ario met GU10-fitting blijft de Ario GU10',
    groep('Pragmalux Half-inbouwspot Ario zaagmaat Ø70 zwart RAL9004 - Incl. GU10 Fitting en junction box'), 'ag09');
  is('alleen "Ario" blijft de GU10, met de LED als tweede keuze',
    [groep('Ario zwart'), m.armSerieKeuze('ag09').keuzes.map(k => k.id)], ['ag09', ['ag09', 'ag113']]);
  is('"half afgeschermd" maakt van een Aludisc geen Ario',
    groep('Pragmalux LED Plafonnière / Wandarmatuur Aludisc-M Zwart half afgeschermd Ø340 IP66 IK10 C4 10-23W 750-1800lm 3000K-3500K-4000K 3-CCT'), 'ag116');
  /* Een IP-klasse is geen naam: op "wandarmatuur" en "IP65" werden de Titandisc, de
     Soladisc, de Facio en de Parono de Qube IP65, en de Cyclone HT werd op
     "waterdicht" en "IP66" de Essence G3 IP66. */
  is('een Titandisc IP65 is de Titandisc, geen Qube IP65',
    groep('Pragmalux LED Plafonnière / Wandarmatuur Titandisc-M Grijs Ø360 IP65 IK10 7-14W 690-1500lm 3000K-3500K-4000K 3-CCT'), 'ag115');
  is('een Eclipse is de Eclipse',
    groep('Pragmalux LED Plafonnière / Pendelarmatuur Eclipse-L Wit Ø430 IP40 IK08 13-32W 1400-4000lm 3000K-3500K-4000K 3-CCT'), 'ag114');
  is('een Soladisc IP65 is de Soladisc IP65 (geen Qube, geen Titandisc)',
    groep('Pragmalux LED Plafonnière / Wandarmatuur Soladisc IP65 IK10 Ø370 7-14W 700-1600lm 3000-3500-4000K'), 'ag117');
  /* De Soladisc-S/M/L is een ander armatuur (IP44) met een eigen blad (ag118): de IP65-groep
     eist "IP65" (vereist), anders wees "Soladisc" alleen al het IP65-blad aan. */
  is('een Soladisc-M IP44 krijgt het IP44-blad, niet het IP65-blad',
    groep('Pragmalux LED Plafonnière / Wandarmatuur Soladisc-M Wit Ø340 IP44 IK10 7-14W 700-1600lm 3000K-3500K-4000K 3-CCT'), 'ag118');
  is('getypt: Soladisc IP 65 is de IP65, een kale Soladisc de IP44', [groep('Soladisc IP 65'), groep('Soladisc wit')], ['ag117', 'ag118']);
  is('een Facio IP65 is de Facio', groep('Pragmalux LED Wandarmatuur Facio IP65 Up/Down 6W 500lm 2700K'), 'ag50');
  is('een Cyclone HT IP66 is de Cyclone, geen Essence G3 IP66',
    groep('Pragmalux LED TL Waterdicht Armatuur Cyclone HT IP66 150cm 42W 4000K 7000lm Alu+PC 3x2,5mm Doorvoerbedrading'), 'ag119');
  is('de Qube zelf blijft de Qube', [groep('Wandarmatuur Qube IP65'), groep('Qube')], ['ag88', 'ag88']);
  /* De Port-Nova (oktober 2026) heeft een eigen blad; de Port-M en Port-S PKVW houden het hunne. */
  is('een Port-Nova is de Port-Nova, en Port-M en Port-S blijven wat ze waren',
    [groep('Pragmalux LED Portiek Port-Nova Wit IP65 IK10 3-6W 360-780lm 3000K-3500K-4000K 3-CCT + draadloos sensor'),
     groep('Port Nova 6W'), groep('Pragmalux LED Portiek Port-M PKVW IP66 IK10 2,75-5W 295-570lm 2700K-4000K 3-CCT'),
     groep('Pragmalux LED Portiek Port-S PKVW IP66 IK10 2,75-5W 275-600lm 2700K-4000K 3-CCT'), groep('Nova')],
    ['ag120', 'ag120', 'ag85', 'ag95', null]);
  /* De Rondisc (oktober 2026) heeft een eigen blad; de Rondix (een paneel)
     blijft de Rondix - de twee namen schelen één letter. */
  is('een Rondisc is de Rondisc, een Rondix blijft de Rondix',
    [groep('Pragmalux LED Plafonnière / Wandarmatuur Rondisc Wit Ø348 IP44 IK10 6-12W 650-1500lm 3000K-4000K 2-CCT + bewegingssensor'),
     groep('Rondisc 12W'), groep('Paneel Rondix'), groep('Rondix')],
    ['ag121', 'ag121', 'ag33', 'ag33']);
  /* Opus en Verto (oktober 2026) hebben elk een eigen blad. De afstandsbediening en de
     PIR-sensor heten "Batten Lumea IP44 /Opbouwarmatuur Opus" en blijven bij de Lumea,
     waar ze al hoorden; de Qube blijft de enige wandarmatuur met IP65. */
  is('een Opus is de Opus en een Verto de Verto, de gedeelde accessoires blijven Lumea',
    [groep('Pragmalux LED Opbouwarmatuur Opus prisma up/down 160x1495mm 35-60W 4750-8700lm 3000K-4000K 2CCT UGR<19 wit RAL9003 + PIR sensor'),
     groep('Opus 1300'),
     groep('Pragmalux LED Wandarmatuur Verto 60 Up/Down IP40 IK06 Ø60x170mm 2x5W 730-800lm 2700-3000-4000K 3CCT CRI90 70° Wit RAL9016 DALI2'),
     groep('Verto zwart'),
     groep('Pragmalux LED Batten Lumea IP44 /Opbouwarmatuur Opus accessoire afstandsbediening'),
     groep('Pragmalux LED Batten Lumea IP44 /Opbouwarmatuur Opus component PIR sensor'),
     groep('Wandarmatuur Qube IP65')],
    ['ag122', 'ag122', 'ag123', 'ag123', 'ag70', 'ag70', 'ag88']);
  /* Paneel en bandraster zijn één soort: de Flexcore-presenter heet zelf zo. */
  is('bandraster Flexcore houdt de Flexcore-presenter',
    groep('Pragmalux LED Bandrasterarmatuur Flexcore Microprisma 185x1542mm 26-36W 3600-4800lm'), 'ag30');
  /* Een soortwoord alleen wijst niets aan; er moet een naamwoord raken. */
  is('Polo is niet Qube omdat beide wandarmatuur zijn',
    groep('Pragmalux LED Plafonnière / Wandarmatuur Polo IP64 8W 3000K 650lm Ø180 (1x18W)'),
    m.ARM_GROEPEN.find(g => g.naam === 'Polo G3').id);
  /* sinds september 2026 met een eigen blad; daarvoor null, en dat was goed */
  is('Aludisc is de Aludisc, geen Qube', groep('Pragmalux LED Plafonnière / Wandarmatuur Aludisc-M Zwart Ø340 IP66 IK10'), 'ag116');
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

  /* Een serie met meer presenters: de Mondial kan ook de opbouw-/pendeluitvoering
     zijn, of PIR, nood of track. De herkenning kiest de gewone; het armaturenboek
     maakt van het label een keuzelijst. */
  const mondial = groep('Pragmalux LED Downlight Mondial IP54 facet wit 6-19,5W 3-CCT');
  is('een Mondial wordt de gewone Mondial', mondial, 'ag21');
  is('met de opbouw/pendel als tweede keuze', m.armSerieKeuze(mondial).keuzes.map(k => k.id).slice(0, 2), ['ag21', 'ag25']);
  is('elke keuze in een serie is een echte groep', m.ARM_SERIES.flatMap(x => x.keuzes)
    .filter(([id]) => !m.ARM_GROEPEN.some(g => g.id === id)).map(([id]) => id), []);
  {
    /* een keuze zonder presenterbestand zou een lege plek in het boek geven */
    const venster = {};
    new Function('window', readFileSync(join(root, 'presenters-data.js'), 'utf8'))(venster);
    is('elke keuze in een serie heeft een presenter', m.ARM_SERIES.flatMap(x => x.keuzes)
      .filter(([id]) => !venster.PRESENTER_FILES.includes(id)).map(([id]) => id), []);
  }
  is('Punto staat alleen', m.armSerieKeuze(groep('Punto 15W zwart')), null);
  is('keuze blijft als alleen de kleur verandert',
    m.armKeuzeBlijft('ag25', 'Mondial facet wit 9W', 'Mondial facet zwart 9W'), true);
  is('keuze vervalt als de naam iets anders wordt', m.armKeuzeBlijft('ag25', 'Mondial 9W', 'Punto 15W'), false);
  is('keuze vervalt als de naam zelf PIR aanwijst', m.armKeuzeBlijft('ag25', 'Mondial 9W', 'Mondial PIR 9W'), false);
  is('een keuze buiten een serie blijft altijd', m.armKeuzeBlijft('ag01', 'Punto', 'Mondial'), true);

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
  /* De Clean HACCP is in de prijslijst één serie, maar de G3 heeft een eigen blad
     (september 2026); net zo de Soladisc: S/M/L (IP44) en IP65 elk een eigen blad. */
  is('families die over groepen vallen', gesplitst.sort(),
    ['LED Highbay Clean HACCP', 'LED Paneel Sigma', 'LED Plafonnière / Wandarmatuur Soladisc', 'LED Portiek Port PKVW',
     'LED TL Waterdicht Armatuur Essence Classic']);
  /* September 2026: de Soladisc, de Titandisc en de Cyclone HT verloren hun presenter
     (de Qube IP65 en de Essence G3 IP66, op niets dan het soortwoord en de IP-klasse -
     geen presenter is beter dan de verkeerde), de Clean HACCP valt terecht in tweeën,
     en de Highbay Essence, Titandisc, Aludisc, Eclipse en Soladisc IP65 kregen hun eigen
     blad. Oktober 2026: de Port-Nova en de Rondisc kregen hun eigen blad, daarna de Opus
     en de Verto (154 -> 157). */
  is('families met één presenter: ondergrens 157', eens >= 157, true);
  is('geen suggestie op een echt artikel', onterecht, 0);
  console.log('  catalogus: ' + eens + ' families eenduidig, ' + gesplitst.length + ' gesplitst, '
            + zonder + ' zonder presenter.');
}

/* ============================ armatuurregel ============================ */
{
  /* Het armaturenboek en de railtool maken hetzelfde boek, via armatuur-rij.js. Hier
     de regels die daar vastliggen: welke presenter een regel krijgt, wanneer de
     uploadknop verschijnt, wat er op een presenter gestempeld wordt, de kolommen van
     de armaturenlijst en het verplaatsen van een regel. */
  const r = await laadUit('armatuur-rij.js',
    ['specialPresenterId', 'armGroepVanRij', 'armTypeOnbekend', 'armEigenPresenters', 'armWisselRijen',
     'STEMPELSTIJLEN', 'stempelZwart', 'armBoekGroepen', 'armLijstKolommen', 'STEMPEL_SPECIAL', 'armSlotLeeg',
     'armAccessoires', 'ARM_LIJST_KOLOMMEN', 'STEMPEL_OPMERKING', 'stempelPresenter', 'stempelOpmerkingRegels'],
    readFileSync(join(root, 'zoeken.js'), 'utf8') + '\n' + readFileSync(join(root, 'armatuur-groepen.js'), 'utf8')
    + '\nconst window = globalThis; globalThis.PRESENTER_DATA = {};'
    + '\nconst PDFLib = {rgb: (r, g, b) => [r, g, b]};'
    + '\nconst PdfHuisstijl = {presenterAanwezig: id => !!globalThis.PRESENTER_DATA[id]};');
  const D = globalThis.PRESENTER_DATA;
  const rij = (x) => Object.assign({aanduiding:'', name:'', code:'', groep:'', qty:0}, x);
  const id = (g) => g ? g.id : null;

  console.log('\narmatuurregel');
  is('een herkende naam', id(r.armGroepVanRij(rij({name:'Punto 15W zwart'}), 'arm01', false)), 'ag01');
  is('een keuze in het label wint van de naam', id(r.armGroepVanRij(rij({name:'Mondial 9W', groep:'ag25'}), 'arm01', false)), 'ag25');
  is('bewust geen presenter', r.armGroepVanRij(rij({name:'Punto', groep:'-'}), 'arm01', false), null);
  D.sparm03 = 'eigen-pdf';
  const eigen = r.armGroepVanRij(rij({name:'Punto 15W'}), 'arm03', false);
  is('een eigen PDF wint op elke regel, ook als de naam herkend wordt', [eigen.id, eigen.special], ['sparm03', true]);
  is('special zonder PDF valt terug op de naam', id(r.armGroepVanRij(rij({name:'Punto'}), 'arm04', true)), 'ag01');
  is('special zonder PDF en zonder herkenbare naam: niets', r.armGroepVanRij(rij({name:'Iets eenmaligs'}), 'arm04', true), null);
  /* Welke regels meetellen - voor beide tools hetzelfde. De railtool eiste een aantal:
     zonder aantal geen armaturenlijst en geen presenters, ook met het vinkje aan. */
  is('meetellen: iets ingevuld, ook zonder aantal',
    [rij({}), rij({aanduiding:'A1'}), rij({name:'Punto 15W'}), rij({code:'2001111'}), rij({codeDali:'2001111-DA'}),
     rij({qty:4}), rij({name:'   ', code:' '}), rij({qty:0, groep:'ag01'}), null].map(r.armSlotLeeg),
    [true, false, false, false, false, false, true, true, true]);

  /* Accessoires (een opbouwset bij een Mondial): eigen artikelcode en naam, geen eigen
     CODE, geen presenter; in de armaturenlijst direct onder hun armatuur. */
  const mondial = rij({aanduiding:'H1', name:'Mondial opbouw 19W', code:'2013254', qty:24,
    accessoires:[{code:'2013261', name:'Mondial opbouwset zwart', qty:24}, {code:'', name:'  ', qty:0},
                 {code:'2013278', name:'Mondial pendelset', qty:0}]});
  is('accessoires: alleen de ingevulde', r.armAccessoires(mondial).map(a => a.code), ['2013261', '2013278']);
  is('een regel met alleen een accessoire telt mee', r.armSlotLeeg(rij({accessoires:[{code:'2013261', name:'', qty:0}]})), false);
  is('een leeg accessoire telt niet', r.armSlotLeeg(rij({accessoires:[{code:' ', name:'', qty:0}]})), true);
  const lijst = r.armLijstKolommen([{s:mondial}, {s:rij({aanduiding:'H2', name:'Punto 15W', code:'2001111', qty:8})}],
    x => x.s.code, x => x.s.name);
  is('accessoires direct onder hun armatuur, zonder eigen CODE, aantal alleen als ingevuld',
    lijst.regels.map(g => (g.vervolg ? '  ' : '') + g.waarden.join(' | ')),
    ['H1 | 2013254 | Mondial opbouw 19W | 24',
     '   | 2013261 | Mondial opbouwset zwart | 24',
     '   | 2013278 | Mondial pendelset | ',
     'H2 | 2001111 | Punto 15W | 8']);
  const alleenAcc = r.armLijstKolommen([{s:rij({name:'Mondial opbouw', accessoires:[{code:'', name:'Opbouwset', qty:5}]})}],
    x => (x.s.code || '').trim(), x => x.s.name);
  const verplaatst = {arm01: mondial, arm02: rij({aanduiding:'H2'})};
  r.armWisselRijen(verplaatst, 'arm01', 'arm02');
  is('↑/↓ neemt de accessoires mee', [verplaatst.arm01.accessoires, verplaatst.arm02.accessoires.length], [undefined, 3]);
  is('een accessoire met aantal toont de kolom Aantal; zonder code blijft de cel leeg (geen "volgt")',
    [alleenAcc.cols.map(c => c.h), alleenAcc.regels.map(g => g.waarden.slice(0, 2)), (alleenAcc.regels[1] || {waarden:[]}).waarden[2]],
    [['Artikelcode', 'Omschrijving', 'Aantal'], [['', 'Mondial opbouw'], ['', 'Opbouwset']], '5']);

  /* Welke kolommen er in de armaturenlijst komen, per kolom uit te vinken; Omschrijving
     blijft altijd, en de vrijgekomen breedte gaat naar Omschrijving */
  const tweeRijen = [{s:mondial}, {s:rij({aanduiding:'H2', name:'Punto 15W', code:'2001111', qty:8})}];
  const metKeuze = keuze => { const l = r.armLijstKolommen(tweeRijen, x => x.s.code, x => x.s.name, keuze);
    return [l.cols.map(c => c.h).join('/'), l.cols.reduce((t, c) => t + c.w, 0), l.regels[1].waarden.join(' | ')]; };
  is('kolommen uitvinken: aantal, artikelcode, code; geen keuze of {} is alles',
    [metKeuze(), metKeuze({}), metKeuze({aantal:false}), metKeuze({artikel:false}), metKeuze({code:false, aantal:true}),
     metKeuze({code:false, artikel:false, aantal:false})],
    [['Code/Artikelcode/Omschrijving/Aantal', 515, ' | 2013261 | Mondial opbouwset zwart | 24'],
     ['Code/Artikelcode/Omschrijving/Aantal', 515, ' | 2013261 | Mondial opbouwset zwart | 24'],
     ['Code/Artikelcode/Omschrijving', 515, ' | 2013261 | Mondial opbouwset zwart'],
     ['Code/Omschrijving/Aantal', 515, ' | Mondial opbouwset zwart | 24'],
     ['Artikelcode/Omschrijving/Aantal', 515, '2013261 | Mondial opbouwset zwart | 24'],
     ['Omschrijving', 515, 'Mondial opbouwset zwart']]);
  is('de vinkjes zijn Code, Artikelcode en Aantal', r.ARM_LIJST_KOLOMMEN.map(k => k.k), ['code', 'artikel', 'aantal']);

  /* De stempel met opmerkingen, op een nagebootste pagina: wat er getekend wordt, waar.
     Letters van 0,6 korps breed. Zonder opmerkingen precies wat het altijd was. */
  const tekenen = (codes, zwart, special, opm) => {
    const getekend = [];
    const pagina = {getSize: () => ({width: 595.28, height: 841.89}),
      drawText: (t, o) => getekend.push({t, x: +o.x.toFixed(2), y: +o.y.toFixed(2), size: o.size, rood: o.color[1] < 0.5})};
    r.stempelPresenter(pagina, codes, '#FFFFFF', zwart, {widthOfTextAtSize: (t, k) => t.length * k * 0.6}, special, opm);
    return getekend;
  };
  const rechts = 595.28 - 145.4, b1 = 841.89 - 35.5 - 11 * 0.78;
  const codeOp = (t, i, extra = 0) => ({t, x: +(rechts - t.length * 6.6).toFixed(2), y: +(b1 - i * 13 - extra).toFixed(2), size: 11, rood: false});
  is('zonder opmerkingen: de codes rechts uitgelijnd onder elkaar, zoals altijd',
    [tekenen(['CODE A', 'B'], false, false), tekenen(['CODE A', 'B'], false, false, ['', ''])],
    [[codeOp('CODE A', 0), codeOp('B', 1)], [codeOp('CODE A', 0), codeOp('B', 1)]]);
  /* De opmerking: rood, 7,5 pt, op de basislijn van zijn code, en alle opmerkingen
     eindigen op één lijn een tussenruimte links van de breedste code */
  const lijn = rechts - 'CODE A'.length * 6.6 - r.STEMPEL_OPMERKING.tussen;
  const opmOp = (t, y, k = 7.5) => ({t, x: +(lijn - t.length * k * 0.6).toFixed(2), y: +y.toFixed(2), size: k, rood: true});
  is('een opmerking naast zijn code, alle opmerkingen op één lijn rechts',
    tekenen(['CODE A', 'B'], false, false, ['Niet IK10', 'zwart']),
    [codeOp('CODE A', 0), opmOp('Niet IK10', b1), codeOp('B', 1), opmOp('zwart', b1 - 13)]);
  is('ook als de breedste code niet de eerste is', tekenen(['B', 'CODE A'], false, false, ['zwart', 'Niet IK10']),
    [codeOp('B', 0), opmOp('zwart', b1), codeOp('CODE A', 1), opmOp('Niet IK10', b1 - 13)]);
  /* Een lange opmerking loopt door op een volgende regel; de code eronder schuift mee */
  const ruimte = 250 - 'CODE A'.length * 6.6 - r.STEMPEL_OPMERKING.tussen;
  const lang = 'Let op: dit armatuur wordt zonder bevestigingsbeugel geleverd, die apart bestellen';
  const gewikkeld = r.stempelOpmerkingRegels(lang, {widthOfTextAtSize: (t, k) => t.length * k * 0.6}, ruimte);
  const getekendLang = tekenen(['CODE A', 'B'], false, false, [lang, '']);
  is('een lange opmerking: regels binnen de ruimte, samen weer de hele tekst, de volgende code eronder',
    [gewikkeld.length, gewikkeld.every(g => g.tw <= ruimte), gewikkeld.map(g => g.tekst).join(' '),
     getekendLang[getekendLang.length - 1]],
    [3, true, lang, codeOp('B', 1, 2 * 9)]);
  const heelLang = Array(30).fill('woordje').join(' ');
  const krimp = r.stempelOpmerkingRegels(heelLang, {widthOfTextAtSize: (t, k) => t.length * k * 0.6}, 150);
  is('te lang voor drie regels: kleiner, tot 6 pt', [krimp[0].grootte, krimp.length > 3], [6, true]);
  /* het rood hangt af van de kop: helderder op de donkere balk (witte stempel) */
  const roodVan = (zwart, kleur) => { let c; r.stempelPresenter({getSize: () => ({width: 595, height: 842}),
    drawText: (t, o) => { if(t === 'x') c = o.color; }}, ['A'], kleur, zwart, {widthOfTextAtSize: (t, k) => t.length * k}, false, ['x']); return c; };
  is('rood: helder op de donkere kop, het gewone op een lichte', [roodVan(false, '#FFFFFF'), roodVan(true, '#FFFFFF'), roodVan(false, '#1F5FA3')],
    [r.STEMPEL_OPMERKING.opDonker, r.STEMPEL_OPMERKING.opLicht, r.STEMPEL_OPMERKING.opLicht]);
  is('niets of spaties is geen opmerking', [r.stempelOpmerkingRegels('', null, 100), r.stempelOpmerkingRegels('   ', null, 100)], [[], []]);

  is('uploadknop bij een onherkend type', r.armTypeOnbekend(rij({}), 'Onbekend armatuur 12W', false), true);
  is('geen uploadknop bij een herkend type', r.armTypeOnbekend(rij({}), 'Punto 15W', false), false);
  is('uploadknop bij special', r.armTypeOnbekend(rij({}), 'Punto 15W', true), true);
  is('geen uploadknop bij bewust geen presenter', r.armTypeOnbekend(rij({groep:'-'}), 'Onbekend', false), false);

  const g = {id:'ag01', stempelKleur:undefined};
  const boek = [{g, rijen:[{s:rij({aanduiding:'A'})}, {s:rij({aanduiding:' A '})}, {s:rij({aanduiding:'B', stempel:'zwart'})}]}];
  is('stempel: unieke codes onder elkaar, zwart als een regel erom vraagt', r.armBoekGroepen(boek),
    [{id:'ag01', code:['A', 'B'], opmerking:['', ''], kleur:'#FFFFFF', zwart:true, special:false}]);
  is('wit is de standaard', r.stempelZwart(rij({})), false);
  /* Een special is meestal een DLC-blad: daar valt de stempel op wit papier. */
  is('special: standaard zwart', r.stempelZwart(rij({}), true), true);
  is('special: zelf op wit gezet blijft wit', r.stempelZwart(rij({stempel:'wit'}), true), false);
  is('special gaat mee naar het boek',
    r.armBoekGroepen([{g:{id:'sparm03', special:true}, rijen:[{s:rij({aanduiding:'S1'})}]}]),
    [{id:'sparm03', code:['S1'], opmerking:[''], kleur:'#FFFFFF', zwart:true, special:true}]);
  /* De opmerking uit kolom L (of zelf getypt) gaat met zijn code naar de presenter */
  is('opmerkingen per code: samengevoegd als het er meer zijn, een opmerking zonder code achteraan',
    r.armBoekGroepen([{g, rijen:[{s:rij({aanduiding:'A', opmerking:'Niet IK10'})}, {s:rij({aanduiding:'B'})},
      {s:rij({aanduiding:'A', opmerking:' Niet  IK10 '})}, {s:rij({aanduiding:'C', opmerking:'zwart'})},
      {s:rij({aanduiding:'C', opmerking:'3000K'})}, {s:rij({name:'Punto', opmerking:'zonder code'})}]}]).map(x => [x.code, x.opmerking]),
    [[['A', 'B', 'C', ''], ['Niet IK10', '', 'zwart · 3000K', 'zonder code']]]);
  is('een regel met alleen een opmerking telt mee', [r.armSlotLeeg(rij({opmerking:'Niet IK10'})), r.armSlotLeeg(rij({opmerking:'  '}))],
    [false, true]);

  /* De plek op een special tegen de kop van het DLC-blad, gemeten op een blad uit
     dlc.html: balk over de hele breedte tot y 23,7, het schuine logovlak met zijn
     linkerrand van x 444,8 (y 24) tot 468,3 (y 57,4). Hoofdletters Poppins Bold 11 pt:
     0,47 onder basislijn, 7,7 hoog; regels 13 pt, onderstok 2,5. Tot drie codes onder
     elkaar mag geen letter de balk of het vlak raken, met minstens een goot (12 pt)
     ertussen. De Pragmalux-plek (449,9 / 27,2) haalt dat niet - zo is het misgegaan. */
  const vrijVanKop = (rechts, basislijn, regels) => {
    const boven = basislijn + 0.47, onder = basislijn + 0.47 + 7.7 + 2.5 + (regels - 1) * 13;
    const vlakRand = y => 444.8 + (468.3 - 444.8) * (Math.min(Math.max(y, 24), 57.4) - 24) / (57.4 - 24);
    const naastVlak = Math.min(vlakRand(boven), vlakRand(onder)) - rechts;
    return Math.round(Math.min(boven - 23.7, onder < 24 ? Infinity : naastVlak) * 10) / 10;
  };
  const SP = r.STEMPEL_SPECIAL, rechtsSP = 595.28 - SP.marge;
  is('special: een goot onder de balk en naast het logovlak, ook met drie codes',
    [1, 2, 3].map(n => vrijVanKop(rechtsSP, SP.basislijn, n) >= 11.9), [true, true, true]);
  is('special: rechts op de DLC-lijn van de goot tussen detail 4 en 5', Math.round(rechtsSP * 100) / 100, 435.85);
  is('de oude plek raakte het logovlak', vrijVanKop(595.28 - 145.4, 27.2, 1) < 0, true);

  const zonder = r.armLijstKolommen([{s:rij({name:'x'})}], () => '123', () => 'x');
  is('lijst zonder codes en aantallen: alleen Artikelcode en Omschrijving',
    zonder.cols.map(c => c.h + ':' + c.w), ['Artikelcode:90', 'Omschrijving:425']);
  const met = r.armLijstKolommen([{s:rij({aanduiding:'A', qty:3})}], () => '123', () => 'Punto');
  is('lijst met code en aantal, in de volgorde van het armaturenboek', met.cols.map(c => c.h), ['Code', 'Artikelcode', 'Omschrijving', 'Aantal']);
  is('de waarden in die volgorde', met.waarden({s:rij({aanduiding:' A ', qty:3})}), ['A', '123', 'Punto', '3']);

  const st = {arm01:rij({name:'een'}), arm02:rij({name:'twee'})};
  D.sparm01 = 'pdf-een';
  r.armWisselRijen(st, 'arm01', 'arm02');
  is('verplaatsen wisselt de inhoud', [st.arm01.name, st.arm02.name], ['twee', 'een']);
  is('en neemt de eigen PDF mee', [D.sparm01, D.sparm02], [undefined, 'pdf-een']);
  is('alle eigen PDF\'s gaan mee met opslaan', Object.keys(r.armEigenPresenters(['arm01', 'arm02', 'arm03'])), ['sparm02', 'sparm03']);
}

/* ============================ contactpersonen ============================ */
{
  /* De briefingpagina van het armaturenboek zet de gekozen projectuitwerker,
     accountmanager en commerciële binnendienst onder "Contactgegevens", en onder
     "Onze specialist" het blauwe vlak van een projectuitwerker met een persoonlijke
     noot. De gegevens staan in medewerkers.js, de foto's in medewerker-fotos.js. */
  const venster = {};
  new Function('window', readFileSync(join(root, 'medewerkers.js'), 'utf8'))(venster);
  new Function('window', readFileSync(join(root, 'medewerker-fotos.js'), 'utf8'))(venster);
  const M = venster.MEDEWERKERS, F = venster.MEDEWERKER_FOTOS;
  console.log('\ncontactpersonen');

  const alle = venster.MEDEWERKER_ROLLEN.flatMap(r => M[r.lijst].map(p => ({rol:r.id, p})));
  is('elke medewerker heeft naam, functie, telefoon en e-mail',
    alle.filter(({p}) => !(p.naam && p.functie && p.tel && /^[^@\s]+@distrilight\.com$/.test(p.email)))
      .map(({p}) => p.id), []);
  is('ids zijn uniek binnen hun lijst', venster.MEDEWERKER_ROLLEN.flatMap(r => {
    const ids = M[r.lijst].map(p => p.id); return ids.filter((x, i) => ids.indexOf(x) !== i); }), []);
  is('telefoonnummers in de schrijfwijze van de bron', alle.filter(({p}) =>
    ![p.tel, p.mobiel].filter(Boolean).every(n => /^0\d{2} \d{3} \d{2} \d{2}$/.test(n))).map(({p}) => p.id), []);
  /* de tool zet de aanhalingstekens er zelf omheen */
  is('een noot zonder eigen aanhalingstekens aan begin of eind', M.projectuitwerkers
    .filter(p => p.noot && /^["\u201c\u201d]|["\u201c\u201d]$/.test(p.noot.trim())).map(p => p.id), []);
  is('elke projectuitwerker met een noot heeft een foto',
    M.projectuitwerkers.filter(p => p.noot && !F[p.id]).map(p => p.id), []);
  const bronFotos = readdirSync(join(root, 'docs/bronnen/medewerkers')).filter(f => /\.jpe?g$/i.test(f))
    .map(f => f.replace(/\.jpe?g$/i, '')).sort();
  is('medewerker-fotos.js is gebouwd uit docs/bronnen/medewerkers', Object.keys(F).sort(), bronFotos);
  is('en de foto\'s zijn dezelfde bytes', bronFotos.filter(id =>
    F[id] !== 'data:image/jpeg;base64,' + readFileSync(join(root, 'docs/bronnen/medewerkers', id + '.jpg')).toString('base64')), []);
  is('geen foto zonder medewerker', Object.keys(F).filter(id => !M.projectuitwerkers.some(p => p.id === id)), []);

  /* de keuze: de echte functies uit contactpersonen.js, die het armaturenboek en de
     railtool allebei gebruiken */
  const t = await laadUit('contactpersonen.js', ['CONTACT', 'medewerkerVan', 'contactPersonen', 'contactRegels', 'specialist'],
    'const window = ' + JSON.stringify({MEDEWERKERS:M, MEDEWERKER_ROLLEN:venster.MEDEWERKER_ROLLEN}) + ';');
  const keuze = {projectuitwerker:'', accountmanager:'', binnendienst:''};
  is('niets gekozen: geen contactblok (en in de railtool geen extra pagina)', t.contactPersonen(keuze), []);
  Object.assign(keuze, {projectuitwerker:'christophe', accountmanager:'tiemen', binnendienst:'hilde'});
  is('de gekozen drie in de volgorde van de pagina', t.contactPersonen(keuze).map(x => x.p.naam),
    ['Christophe Canoy', 'Tiemen Hasselo', 'Hilde van den Oever']);
  is('de regels van Christophe, met mobiel', t.contactRegels(t.medewerkerVan('projectuitwerker', 'christophe')),
    [['T', '040 209 49 26 (Direct)'], ['T', '040 209 49 00 (Algemeen)'], ['M', '062 714 11 90'], ['E', 'christophe@distrilight.com']]);
  is('Christophe krijgt het blauwe vlak', !!t.specialist(keuze), true);
  Object.assign(keuze, {projectuitwerker:'olivia'});
  is('Olivia nog niet: alleen contactgegevens', t.specialist(keuze), null);
  Object.assign(keuze, {projectuitwerker:'bestaat-niet', accountmanager:''});
  is('een id dat er niet meer is telt als niet gekozen', t.contactPersonen(keuze).map(x => x.p.naam), ['Hilde van den Oever']);
  /* de kolommen passen naast elkaar binnen de breedte van het blauwe vlak */
  is('drie kolommen binnen de pagina', t.CONTACT.kolomX[2] + t.CONTACT.kolomB <= t.CONTACT.kaartX + t.CONTACT.kaartB + 40, true);
  is('Christophe als binnendienst heeft een andere functie', t.medewerkerVan('binnendienst', 'christophe').functie,
    'Hoofd Commerciële Binnendienst');
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
     'artikelVoorWoord','artikelenBijWoord','zoekFamilies','SUGGESTIEWOORDEN','zoekSuggestie',
     'REEKSWOORDEN','LOSSE_WOORDEN','GEEN_REEKSBEGIN','reeksWoorden','reeksZoekterm'],
    zoek + '\n' + readFileSync(join(root, 'armatuur-groepen.js'), 'utf8') + '\nconst DATA = null;');
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

  /* De akkoordronde: uit de reactie van de manager (in gewone zinnen) haalt de
     tool een zoekopdracht die de binnendienst met één klik in de zoeker zet. */
  for(const [zin, term] of [
    ['nee, dit moet de Mondial verdiept worden', 'mondial verdiept'],
    ['Neem liever de Sigma DALI', 'sigma dali'],
    ['Nee, te duur. Essence G2 inbouw is beter', 'essence g2 inbouw'],
    ['Luna G2 met sensor', 'luna g2'],
    ['Moet een downlight worden, wit', null],
    ['Geen idee, bel me even', null],
    ['nee rond de 3000 lumen moet het zijn', null],
  ]) is('reactie "' + zin + '"', v.reeksZoekterm(zin, F), term);
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
  const gewoon = sigma.varianten.find(v => /Sigma G2 IP44/.test(v.omschrijving));
  is('een Sigma-artikel krijgt de Sigma G2 IP44', m.presenterNaam(m.presenterVan(leeg, sigma, gewoon).id), 'Paneel Sigma G2 IP44');
  is('een Sigma IP65 krijgt die van de IP65', m.presenterNaam(m.presenterVan(leeg, sigma, ip65).id), 'Paneel Sigma G2 IP65');
  /* Over de hele familie: elk G2-artikel krijgt het blad van zijn eigen IP-klasse.
     Gemeten: 48 keer IP65, 53 keer IP44 (de 16 Sigma G3 IP54 hebben geen eigen blad). */
  const sigmaG2 = sigma.varianten.filter(v => /Sigma G2\s+(Zwart\s+)?IP(44|65)/.test(v.omschrijving));
  const sigmaMis = sigmaG2.filter(v => m.presenterVan(leeg, sigma, v).id !== (/IP65/.test(v.omschrijving) ? 'ag82' : 'ag34'));
  is('elke Sigma G2 krijgt het blad van zijn IP-klasse', sigmaMis.map(v => v.artikelcode), []);
  is('Sigma G2-artikelen gemeten: ondergrens 101', sigmaG2.length >= 101, true);
  is('zonder artikel en oneens: geen', m.presenterVan(leeg, sigma, null).id, null);
  is('herkend staat erbij', m.presenterVan(leeg, sigma, gewoon).bron, 'herkend');
  is('families.json wint', m.presenterVan(leeg, pir, pir.varianten[0]).bron, 'familie');
  is('zelf gekozen wint van alles', m.presenterVan({presenter: 'ag01'}, pir, pir.varianten[0]), {id: 'ag01', bron: 'handmatig'});
  is('geen presenter is een keuze', m.presenterVan({presenter: '-'}, pir, pir.varianten[0]), {id: null, bron: 'geen'});
}

/* ======================= armaturenboek: totaal projectboek ======================= */
{
  /* Het lichtplan komt direct na de introductie, achter het hoofdstukblad
     "Lichtberekening"; daarna pas het hoofdstuk Armaturen, de presenters en de
     achterpagina's. boekDelen() in armaturenboek.html bepaalt die volgorde. */
  /* lichtplanDelen() staat in lichtplan.js, gedeeld met de railtool */
  const lpDelen = snijUit(readFileSync(join(root, 'lichtplan.js'), 'utf8'), 'lichtplanDelen');
  const m = await laadUit('armaturenboek.html', ['boekDelen'], lpDelen);
  const r = await laadUit('index.html', ['railBoekDelen'], lpDelen);
  console.log('totaal projectboek');
  const kort = d => d.bron === 'eigen' ? 'eigen ' + d.van + '-' + d.tot : d.bron;
  /* voorblad (0) + introductie (1) = 2; dan hoofdstukblad Armaturen en armaturenlijst = 4 */
  is('met lichtplan: na de introductie', m.boekDelen(2, 4, true).map(kort),
    ['eigen 0-2', 'lichtberekening', 'lichtplan', 'eigen 2-4', 'presenters', 'achterpaginas']);
  is('zonder lichtplan: het gewone boek', m.boekDelen(2, 4, false).map(kort),
    ['eigen 0-4', 'presenters', 'achterpaginas']);
  is('introductie over twee pagina\'s', m.boekDelen(3, 5, true).map(kort)[0], 'eigen 0-3');
  is('niets na de introductie: geen leeg stuk', m.boekDelen(2, 2, true).map(kort),
    ['eigen 0-2', 'lichtberekening', 'lichtplan', 'presenters', 'achterpaginas']);
  /* De railtool: dezelfde regel. Met contactpersonen voorblad + introductie (2), anders
     alleen het voorblad (1); daarna Bestelgegevens, Installatieoverzicht enz. */
  is('railtool met introductie', r.railBoekDelen(2, 6, true).map(kort),
    ['eigen 0-2', 'lichtberekening', 'lichtplan', 'eigen 2-6', 'rail', 'presenters', 'achterpaginas']);
  is('railtool zonder introductie: na het voorblad', r.railBoekDelen(1, 5, true).map(kort).slice(0, 4),
    ['eigen 0-1', 'lichtberekening', 'lichtplan', 'eigen 1-5']);
  is('railtool zonder lichtplan: zoals voorheen', r.railBoekDelen(1, 5, false).map(kort),
    ['eigen 0-5', 'rail', 'presenters', 'achterpaginas']);

  /* Sinds oktober 2026 kunnen er meer lichtplannen in: st.lichtplan is een lijst. Een
     project van daarvoor heeft er één, als {naam, paginas}; dat moet als lijst van één
     terugkomen, en geen lichtplan blijft leeg. */
  const lp = await laadUit('lichtplan.js', ['lichtplanLijst']);
  const a = {naam:'BG.pdf', paginas:4}, b = {naam:'1e verdieping.pdf', paginas:6};
  is('oud project: één lichtplan wordt een lijst van één', lp.lichtplanLijst(a), [a]);
  is('nieuw project: de lijst zoals hij is', lp.lichtplanLijst([a, b]), [a, b]);
  is('geen lichtplan: een lege lijst', [lp.lichtplanLijst(null), lp.lichtplanLijst(undefined), lp.lichtplanLijst([])], [[], [], []]);
  is('een kapotte regel valt weg', lp.lichtplanLijst([a, null, {paginas:2}]), [a]);
}

/* ============== het projectenboek onder de 10 MB: pdf-verkleinen.js ============== */
{
  /* Boven de grens maakt PdfVerkleinen de foto's lichter. Een vlakke afbeelding staat
     in een PDF vaak met PNG-voorspellers opgeslagen; die moeten precies terug, anders
     wordt de foto rommel. En een /Decode die iets doet (kleuren omkeren) mag niet door
     de JPEG-omzetting heen, een neutrale ([0 1] per kleur, van Ghostscript) wel. */
  console.log('pdf verkleinen');
  const v = await laadUit('pdf-verkleinen.js', ['pngOntvoorspel', 'decodeNeutraal', 'verkleinInStappen']);
  /* een kleine RGB-afbeelding van 4x3, elke rij met een andere voorspeller gecodeerd */
  const kol = 4, kl = 3, rij = kol * kl;
  const pix = Uint8Array.from({length: rij * 5}, (_, i) => (i * 37 + (i >> 3) * 11) & 255);
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return (pa <= pb && pa <= pc) ? a : pb <= pc ? b : c; };
  const gecodeerd = [];
  for(let r = 0; r < 5; r++){
    gecodeerd.push(r);   /* rij r met voorspeller r: geen, links, boven, gemiddelde, Paeth */
    for(let x = 0; x < rij; x++){
      const o = pix[r * rij + x], a = x >= kl ? pix[r * rij + x - kl] : 0, b = r ? pix[(r - 1) * rij + x] : 0,
            c = r && x >= kl ? pix[(r - 1) * rij + x - kl] : 0;
      const voorspeld = [0, a, b, (a + b) >> 1, paeth(a, b, c)][r];
      gecodeerd.push((o - voorspeld) & 255);
    }
  }
  is('PNG-voorspellers (alle vijf) gaan precies terug', Array.from(v.pngOntvoorspel(Uint8Array.from(gecodeerd), kol, kl)), Array.from(pix));
  is('een neutrale /Decode mag, een die iets doet niet',
    [v.decodeNeutraal(null, 3), v.decodeNeutraal([0, 1, 0, 1, 0, 1], 3), v.decodeNeutraal([0, 1], 1),
     v.decodeNeutraal([1, 0], 1), v.decodeNeutraal([0, 255], 1), v.decodeNeutraal([0, 1], 3), v.decodeNeutraal([NaN], 1)],
    [true, true, true, false, false, false, false]);
  /* Welke stap wint (verkleinInStappen), met nep-stappen die alleen een grootte hebben:
     [de grootte die eruit komt, de stappen die gezet zijn]. Het boek (altijd = false) blijft
     onder de grens onaangeroerd; een lichtplan bij het inladen (altijd = true) krijgt de
     eerste stap altijd en de volgende alleen zolang het boven de grens zit. */
  const proef = async (grootte, doel, uitkomsten, altijd) => {
    const gezet = [];
    const r = await v.verkleinInStappen({length: grootte}, doel, uitkomsten.length,
      async i => { gezet.push(i); return uitkomsten[i] == null ? null : {length: uitkomsten[i]}; }, altijd);
    return [r.length, gezet];
  };
  is('het boek onder de grens: niets gedaan', await proef(8, 10, [6, 5, 4, 3], false), [8, []]);
  is('het boek erboven: de eerste stap die eronder komt wint', await proef(14, 10, [12, 9, 7, 5], false), [9, [0, 1]]);
  is('het boek: haalt geen stap het, dan de kleinste', await proef(30, 10, [25, null, 20, 22], false), [20, [0, 1, 2, 3]]);
  is('een lichtplan onder de grens: alleen de eerste stap', await proef(4, 5, [3, 2, 1, 1], true), [3, [0]]);
  is('een lichtplan waar de eerste stap niets doet, blijft zoals het is', await proef(4, 5, [null, 2, 1, 1], true), [4, [0]]);
  is('een lichtplan erboven: verder tot het eronder zit', await proef(12, 5, [8, 6, 4, 3], true), [4, [0, 1, 2]]);
}

/* ============== de naam uit de catalogus bij een ingetypte artikelcode ============== */
{
  /* Typ je in het armaturenboek of de railtool alleen de artikelcode, dan komt de
     volledige naam uit de catalogus (catalogus-data.js, gebouwd uit catalogus.csv). Een
     artikelcode telt één-op-één of niet: een code die er bijna op lijkt is een ander
     artikel. En een zelf getypte naam wordt nooit overschreven. */
  console.log('naam uit de catalogus');
  const venster = {};
  new Function('window', readFileSync(join(root, 'catalogus-data.js'), 'utf8'))(venster);
  const CAT = venster.CATALOGUS;
  const csvRegels = readFileSync(join(root, 'vergelijker/data/bron/catalogus.csv'), 'utf8').split(/\r?\n/).slice(1).filter(Boolean).length;
  is('elke artikelcode uit de catalogus staat erin', Object.keys(CAT).length, csvRegels);
  const r = await laadUit('armatuur-rij.js', ['catalogusNaam', 'armNaamUitCode']);
  const dura = 'Pragmalux LED Plafonnière / Wandarmatuur Dura-M Wit Ø340 IP64 IK10 max.18W 1725-2075lm 2200K-2700K 2-CCT + Casambi driver';
  is('een code uit de catalogus geeft de omschrijving (dubbele spaties enkel)',
    [r.catalogusNaam('1084459-CA', CAT), r.catalogusNaam(' 1084459-ca ', CAT), r.catalogusNaam('1047515', CAT).startsWith('Pragmalux LED Inbouw')],
    [dura, dura, true]);
  /* De Sparta Pro 1043890 bestaat alleen als -PH en -PH-DA: het kale nummer en een andere
     uitgang zijn een ander artikel (of geen). Hier stond eerst de Dura 1084459, tot de hele
     Dura-lijst erbij kwam. */
  is('geen bijna-treffer: het basisartikel of een andere uitgang is iets anders',
    [r.catalogusNaam('1043890', CAT), r.catalogusNaam('1043890-DA', CAT), r.catalogusNaam('1084459-C', CAT), r.catalogusNaam('', CAT)],
    [null, null, null, null]);
  /* Oktober 2026: de volledige Dura-lijst (208 artikelen, 192 nieuw) staat in de catalogus,
     met het voorbeeld waarmee om deze functie gevraagd werd. */
  is('1084459-SN geeft de naam uit het voorbeeld van de vraag', r.catalogusNaam('1084459-SN', CAT),
    'Pragmalux LED Plafonnière / Wandarmatuur Dura-M Wit Ø340 IP64 IK10 8-18W 750-2075lm 2200K-2700K 2-CCT + bewegingssensor + noodmodule 1uur autotest');
  is('Dura-artikelen in de catalogus: ondergrens 208', Object.values(CAT).filter(o => /\bDura-[SM]\b/.test(o)).length >= 208, true);
  const K = {'A1':'Armatuur een', 'B2':'Armatuur twee'};
  is('lege naam: invullen', r.armNaamUitCode({name:''}, 'a1', K), {soort:'gevuld', naam:'Armatuur een'});
  is('eigen naam: blijft staan', r.armNaamUitCode({name:'Punto 15W wit'}, 'A1', K), {soort:'eigen naam'});
  is('automatische naam, andere bekende code: de nieuwe naam',
    r.armNaamUitCode({name:'Armatuur een', naamUitCatalogus:'Armatuur een'}, 'B2', K), {soort:'gevuld', naam:'Armatuur twee'});
  is('automatische naam, onbekende code: de oude naam weg',
    r.armNaamUitCode({name:'Armatuur een', naamUitCatalogus:'Armatuur een'}, 'X9', K), {soort:'gewist', naam:''});
  is('aangepaste automatische naam telt als eigen naam',
    r.armNaamUitCode({name:'Armatuur een, wit', naamUitCatalogus:'Armatuur een'}, 'B2', K), {soort:'eigen naam'});
  is('onbekende code zonder naam, special en leeg',
    [r.armNaamUitCode({name:''}, 'X9', K).soort, r.armNaamUitCode({name:''}, 'Special', K).soort, r.armNaamUitCode({name:''}, '  ', K).soort],
    ['onbekend', 'leeg', 'leeg']);
}

/* ===================== tabelcellen: een te lang woord ===================== */
{
  /* Een woord breder dan zijn kolom liep de volgende kolom in (de armaturenlijst:
     "Trappenhuizen/gangen(opbouw)" dwars door het artikelnummer). breekWoord() in
     pdf-huisstijl.js breekt het af; hier met een tekenaantal als breedtemaat, zodat
     de uitkomst niet van het lettertype afhangt. */
  const m = await laadUit('pdf-huisstijl.js', ['breekWoord']);
  console.log('tabelcellen');
  const tot = n => t => t.length <= n;
  is('past het, dan heel', m.breekWoord('Horeca', tot(14)), ['Horeca']);
  is('na een schuine streep', m.breekWoord('Trappenhuizen/gangen(opbouw)', tot(14)), ['Trappenhuizen/', 'gangen(opbouw)']);
  is('vóór een haakje, niet midden in het woord', m.breekWoord('gangen(opbouw)', tot(13)), ['gangen', '(opbouw)']);
  is('na een streepje', m.breekWoord('ZSF1092386-tc-da', tot(12)), ['ZSF1092386-', 'tc-da']);
  is('geen breekplek: midden in het woord', m.breekWoord('ABCDEFGHIJKLMNOPQRST', tot(8)), ['ABCDEFGH', 'IJKLMNOP', 'QRST']);
  is('geen snipper vooraan', m.breekWoord('A/BCDEFGHIJKLMNOP', tot(8))[0].length > 2, true);
  const proef = ['Trappenhuizen/gangen(opbouw)', 'ZSF1092386-tc-da-extra-lang', 'kantoor_verdieping_2(noord)', 'x'.repeat(40), 'a-b-c-d-e-f-g-h-i-j'];
  const fout = [];
  for(const w of proef) for(const n of [4, 7, 10, 15]){
    const stukken = m.breekWoord(w, tot(n));
    if(stukken.join('') !== w) fout.push(w + '/' + n + ': tekens kwijt');
    if(stukken.some(st => st.length > n)) fout.push(w + '/' + n + ': stuk te breed');
  }
  is('niets kwijt en elk stuk past', fout, []);
}

/* ========================== DLC: de vijf fotovakken ========================== */
{
  const m = await laadUit('dlc.html', ['BEELDVAKKEN', 'beeldenNaarVakken', 'beeldOp', 'schrijfBeeld', 'wisselBeelden',
                                      'FOTO', 'hoofdfotoPlek', 'onderzoneBoven', 'onderzone']);
  console.log('DLC: fotovakken');
  const vakken = S => m.BEELDVAKKEN.map(v => S[v.id] || '-').join('');
  is('de legenda van de schets', m.BEELDVAKKEN.map(v => v.nr + ' ' + v.label),
    ['1 Hoofdfoto', '2 Afmetingen', '3 Toepassing', '4 Detail 1', '5 Detail 2']);

  /* Een special van voor de vijf vakken: hoofdfoto plus een rij beelden onderaan. De
     rij gaat in de volgorde van de legenda in de lege vakken; de hoofdfoto blijft. */
  const oud = m.beeldenNaarVakken({hoofdfoto: '1', beelden: ['A', 'B', 'C', 'D', 'E', 'F']});
  is('oude rij in vak 2 t/m 5', vakken(oud), '1ABCD');
  is('wat niet past blijft over, niets kwijt', oud.beelden, ['E', 'F']);
  is('zonder hoofdfoto blijft vak 1 leeg', vakken(m.beeldenNaarVakken({beelden: ['A']})), '-A---');
  is('een gevuld vak wordt overgeslagen',
    vakken(m.beeldenNaarVakken({afmetingen: 'x', beelden: ['A', 'B']})), '-xAB-');
  is('een nieuwe special blijft zoals hij is',
    vakken(m.beeldenNaarVakken({hoofdfoto: '1', detail2: '5', beelden: []})), '1---5');

  /* slepen: twee vakken wisselen, een niet-geplaatst beeld valt uit de rij */
  const S = {hoofdfoto: '1', afmetingen: 'A', toepassing: 'B', detail1: '', detail2: 'D', beelden: ['E', 'F']};
  is('vak naar vak wisselt', vakken(m.wisselBeelden(S, 'afmetingen', 'toepassing')), '1BA-D');
  is('rest naar leeg vak', [vakken(m.wisselBeelden(S, 'rest1', 'detail1')), S.beelden], ['1BAFD', ['E']]);
  is('rest naar vol vak wisselt terug', [vakken(m.wisselBeelden(S, 'rest0', 'hoofdfoto')), S.beelden], ['EBAFD', ['1']]);
  is('op zichzelf: niets', vakken(m.wisselBeelden(S, 'detail2', 'detail2')), 'EBAFD');
  is('onbekend vak raakt niets', [vakken(m.wisselBeelden(S, 'hoofdfoto', 'onder')), S.beelden], ['EBAFD', ['1']]);

  /* Het raster (FOTO): gemeten op het blad - BESTELGEGEVENS begint op 141 pt, de
     rechterrand van het DLC-logo ligt op 560,25, de tabel loopt van 35,4 tot 288,4. */
  const F = m.FOTO, r1 = x => Math.round(x * 10) / 10, A4B = 595.28, onder = 786.9;
  console.log('DLC: fotoraster');
  is('kolomgat = linkermarge', r1(F.rechts - (F.links + F.linksB)), r1(F.links));
  is('rechtermarge = linkermarge (en de logorand)', r1(A4B - (F.rechts + F.rechtsB)), r1(F.links));
  const rand = p => [r1(p.x), r1(p.x + p.b)];
  const volle = [r1(F.rechts), r1(F.rechts + F.rechtsB)], tabel = [r1(F.links), r1(F.links + F.linksB)];

  /* bovenzone: foto 1 naast de specificaties */
  const h43 = m.hoofdfotoPlek(4/3);
  is('foto 1 begint op BESTELGEGEVENS en vult de kolom', [h43.y, rand(h43)], [141, volle]);
  const staand = m.hoofdfotoPlek(2/3);
  is('staande 2:3 wordt smaller, gecentreerd, niet gesneden',
    [r1(staand.h), staand.snijden, r1(staand.x - F.rechts) === r1(F.rechts + F.rechtsB - staand.x - staand.b)],
    [F.hoofdMaxH, false, true]);
  const bijna = m.hoofdfotoPlek(3/4);
  is('staande 3:4 houdt de kolombreedte, wat achtergrond eraf', [rand(bijna), bijna.snijden], [volle, true]);

  /* onderzone: altijd onder de specificaties en onder foto 1 */
  const hOnder = h43.y + h43.h;
  is('korte tabel: een goot onder foto 1', r1(m.onderzoneBoven(250, h43)), r1(hOnder + F.goot));
  is('lange tabel: 24 pt onder de tabel', r1(m.onderzoneBoven(500, h43)), 524);
  is('zonder foto 1 (of op een volgende pagina): onder de tabel', m.onderzoneBoven(200, null), 224);

  const alle = {toepassing: 3/2, detail1: 1, detail2: 4/3, afmetingen: 2};
  const z = m.onderzone(alle, 330, onder, false).plek;
  is('3, 4 en 5 beginnen op één lijn', [z.toepassing.y, z.detail1.y, z.detail2.y], [330, 330, 330]);
  is('3 onder de tabel, 4|5 en 2 onder foto 1',
    [rand(z.toepassing), [rand(z.detail1)[0], rand(z.detail2)[1]], rand(z.afmetingen)], [tabel, volle, volle]);
  is('overal dezelfde goot',
    [z.afmetingen.y - (z.detail1.y + z.detail1.h), z.detail2.x - (z.detail1.x + z.detail1.b)].map(r1), [F.goot, F.goot]);
  is('4 en 5 een tweeling', [z.detail1.b, z.detail1.h], [z.detail2.b, z.detail2.h]);
  is('tweeling volgt de gemiddelde vorm', r1(z.detail1.h / z.detail1.b), r1(1 / Math.sqrt(4/3)));
  is('3 sluit onderaan af met 2', r1(z.toepassing.y + z.toepassing.h), r1(z.afmetingen.y + z.afmetingen.h));
  const lang = m.onderzone({detail1: 1/3, detail2: 1/3}, 330, onder, false).plek.detail1;
  is('tweeling hoogstens 4:5 staand', Math.round(lang.h / lang.b * 100) / 100, F.tweeling[1]);
  is('staande toepassing hoogstens vierkant', r1(m.onderzone({toepassing: 2/3}, 330, onder, false).plek.toepassing.h), F.toepMaxH);
  is('ook niet hoger om uit te lijnen',
    m.onderzone({toepassing: 2/3, detail1: 3/4, afmetingen: 1}, 330, onder, false).plek.toepassing.h <= F.toepMaxH, true);
  is('past niet: de hele zone naar een nieuwe pagina', m.onderzone(alle, 700, onder, false), null);
  const vers = m.onderzone(alle, 97.35, onder, true);
  is('op een verse pagina past hij altijd', vers && vers.onder <= onder, true);

  /* De proef over de hele breedte: elke tabellengte, elke vormcombinatie. Wat er ook
     komt: 3 en 4|5 beginnen samen, niets raakt de tabel, foto 1 of de voet, 3 staat
     onder de tabel en de rest onder foto 1. */
  const vormen = [0, 1/2, 2/3, 3/4, 1, 4/3, 3/2, 16/9, 3];
  let proeven = 0, fout = [];
  for(const hf of [0, 2/3, 1, 4/3, 16/9]) for(const tabelOnder of [150, 260, 330, 420, 520, 620, 700, 760]){
    const hoofd = m.hoofdfotoPlek(hf);
    const boven = m.onderzoneBoven(tabelOnder, hoofd);
    for(const a3 of vormen) for(const a4 of vormen) for(const a2 of vormen){
      const v = {toepassing: a3, detail1: a4, detail2: a4 && 1.2, afmetingen: a2};
      const zone = m.onderzone(v, boven, onder, false) || m.onderzone(v, 97.35, onder, true);
      const nieuw = !m.onderzone(v, boven, onder, false);
      const P = zone.plek, top = nieuw ? 97.35 : boven;
      proeven++;
      const mis = [];
      if(P.toepassing && P.detail1 && P.toepassing.y !== P.detail1.y) mis.push('3 en 4 niet op één lijn');
      Object.entries(P).forEach(([id, p]) => {
        if(p.y + p.h > onder + 0.01) mis.push(id + ' over de voet');
        if(p.y < top - 0.01) mis.push(id + ' boven de zonelijn');
        if(!nieuw && p.y < tabelOnder + F.naTabel - 0.01) mis.push(id + ' raakt de tabel');
        if(!nieuw && hoofd && p.x + p.b > F.rechts && p.y < hoofd.y + hoofd.h + F.goot - 0.01) mis.push(id + ' raakt foto 1');
      });
      if(P.toepassing && (r1(P.toepassing.x) !== tabel[0] || r1(P.toepassing.b) !== F.linksB)) mis.push('3 niet onder de tabel');
      if(mis.length && fout.length < 5) fout.push(JSON.stringify({hf, tabelOnder, a3, a4, a2}) + ': ' + mis.join(', '));
    }
  }
  is('raster houdt over ' + proeven + ' combinaties', fout, []);
}

/* ======================= railtool: de codeparen ======================= */
{
  /* In het installatieoverzicht, onder "Onderdelen in de tekening", staan per onderdeel
     ons artikelnummer (PCODES) en de verpakkingscode (LCODES, de KKT-reeks) naast
     elkaar. De tool houdt die twee in aparte tabellen bij; ze moeten bij elkaar horen
     zoals in het bronwerkboek docs/bronnen/PCODES LCODES.xlsx (ProductCode en
     LeverancierCode op één rij). Een paar dat uit de pas loopt, staat anders zo bij de
     installateur. */
  const t = await laadUit('index.html', ['PCODES', 'LCODES', 'PCODES_DALI', 'LCODES_DALI']);
  const bron = new Map();
  bladRijen(join(root, 'docs/bronnen/PCODES LCODES.xlsx')).slice(1).forEach(r => {
    const code = (r[0] || '').replace(/\*/g, '').trim();
    if(code) bron.set(code, (r[2] || '').trim());
  });
  /* Wat nu niet klopt, en geen van beide in de tekening: adapter70 heeft in de tool geen
     verpakkingscode en "trek" heeft in de bron '????'. Komt er een afwijking bij, dan
     valt die op. Een onderdeel dat in een uitvoering niet bestaat (de verstelbare hoek
     bij DALI) heeft in beide tabellen null: geen nummer, en dan ook geen verpakkingscode
     - daar stond de KKT-code van de gewone hoek naast 'NB'. */
  const BEKEND = ['PCODES.adapter70.wit', 'PCODES.adapter70.zwart', 'PCODES.adapter70.grijs', 'PCODES.trek', 'PCODES_DALI.trek'];
  const afwijkend = [];
  let paren = 0;
  for(const [pn, ln] of [['PCODES', 'LCODES'], ['PCODES_DALI', 'LCODES_DALI']]){
    const loop = (p, l, pad) => {
      if(p === null){
        if(l !== null) afwijkend.push(pad + ': geen nummer, maar wel verpakkingscode ' + l);
        return;
      }
      if(typeof p === 'string'){
        paren++;
        if(bron.get(p) !== l && !BEKEND.includes(pad))
          afwijkend.push(pad + ': ' + p + ' / ' + l + ' (bron: ' + (bron.has(p) ? bron.get(p) : 'niet gevonden') + ')');
        return;
      }
      for(const k of Object.keys(p)) loop(p[k], l && typeof l === 'object' ? l[k] : undefined, pad + '.' + k);
    };
    loop(t[pn], t[ln], pn);
  }
  is('het bronwerkboek en de codetabellen zijn gelezen', [bron.size >= 150, paren >= 159], [true, true]);
  is('artikelnummer en verpakkingscode horen bij elkaar zoals in PCODES LCODES.xlsx (' + paren + ' paren)', afwijkend, []);
}

/* ======================= railtool: de 1-fase rail ======================= */
{
  /* De artikelen van de 1-fase rail staan in docs/bronnen/1-fase-rail.csv (het
     artikelexport van de binnendienst, 13-10-2026: artikelnummer, omschrijving,
     leverancierscode). Elke code in de tool moet daar staan, op de plek die bij zijn
     omschrijving hoort (een 2 m vierkant wit op rail.opbouw.wit[2], een T Links Binnen op
     de sleutel die T_1F_NAAM zo noemt), met de verpakkingscode die erbij staat, en elk
     artikel van de lijst moet in de tool terug te vinden zijn. */
  console.log('1-fase rail');
  const t = await laadUit('index.html', ['PCODES_1F', 'T_1F_NAAM', 'KKT_1F', 'LCODES_1F', 'ADAPTERS_OVERIG_1F', 'MM_1F', 'MM_3F', 'PCODES'],
    "ADAPTERS_OVERIG_1F.forEach(a=> Object.values(a.codes).forEach(c=>{ c.l = KKT_1F[c.p] || ''; }));");
  const regels = readFileSync(join(root, 'docs/bronnen/1-fase-rail.csv'), 'utf8').split(/\r?\n/).slice(1).filter(Boolean)
    .map(r => r.match(/^([^,]*),("(?:[^"]|"")*"|[^,]*),(.*)$/)).map(m => [m[1], m[2].replace(/^"|"$/g, '').replace(/""/g, '"'), m[3]]);
  const bron = new Map(regels.map(r => [r[0], r[1]])), lev = new Map(regels.map(r => [r[0], r[2]]));
  const P = t.PCODES_1F, K = {wit:'Wit', zwart:'Zwart'}, fout = [], gebruikt = new Set();
  const moet = (code, woord, pad) => {
    gebruikt.add(code);
    const o = bron.get(code);
    if(!o) fout.push(pad + ': ' + code + ' staat niet in de lijst');
    else if(!o.includes(woord)) fout.push(pad + ': ' + code + ' is "' + o + '", verwacht "' + woord + '"');
  };
  for(const [prof, woord] of [['opbouw', 'Vierkant'], ['inbouw', 'Inbouw']])
    for(const k in P.rail[prof]) for(const m in P.rail[prof][k]) moet(P.rail[prof][k][m], m + 'M ' + woord + ' ' + K[k], 'rail.' + prof + '.' + k + '.' + m);
  for(const k in K){
    moet(P.aansluit[k].R, 'Aansluitstuk ' + K[k] + ' Rechts', 'aansluit.' + k + '.R');
    moet(P.aansluit[k].L, 'Aansluitstuk ' + K[k] + ' Links', 'aansluit.' + k + '.L');
    moet(P.bocht[k].binnen, 'Bocht Binnen ' + K[k], 'bocht.' + k + '.binnen');
    moet(P.bocht[k].buiten, 'Bocht Buiten ' + K[k], 'bocht.' + k + '.buiten');
    for(const sl in t.T_1F_NAAM) moet(P.tkoppel[k][sl], 'T-Koppelstuk ' + K[k] + ' ' + t.T_1F_NAAM[sl], 'tkoppel.' + k + '.' + sl);
    [['kruis', 'Kruis Koppelstuk '], ['midden', 'Middenvoeding '], ['eindkap', 'Eindkap '], ['elkoppel', 'Elektrisch Koppelstuk '],
     ['verstelbaar', 'Verstelbare Hoek '], ['afdekEind', 'Afdekplaat Inbouwrail Eindvoeding '], ['afdekTussen', 'Afdekplaat Inbouwrail Tussenkoppeling ']]
      .forEach(([sl, w]) => moet(P[sl][k], w + K[k], sl + '.' + k));
    for(const len in P.ophangset[k]) moet(P.ophangset[k][len], 'Ophangset Verstelbaar ' + len + 'M incl. Beugel en Kap ' + K[k], 'ophangset.' + k + '.' + len);
  }
  moet(P.beugelLang, 'Ophangbeugel Lang', 'beugelLang');
  moet(P.beugelKort, 'Ophangbeugel Kort', 'beugelKort');
  moet(P.snelspanner, 'Snelspanner', 'snelspanner');
  for(const k in K) moet(P.plafondklem[k], 'Plafondklem + Plafondkap excl. Staalkabel ' + K[k], 'plafondklem.' + k);
  for(const len in P.ophangkabel) moet(P.ophangkabel[len], 'Ophangkabel ' + len + 'M', 'ophangkabel.' + len);
  /* de losse onderdelen: het juiste artikel, en de keuze (kleur, lengte) die er bij staat */
  const SOORT = {e01:/Rail Adapter (Wit|Zwart) 10kg/, e02:/Adapter Mini/, e03:/Adapter 78mm/, e04:/Trekontlasting (Wit|Zwart)$/,
    e05:/Trekontlasting Draaibaar/, e06:/Slot connection tool/, e07:/Eindvoeding/, e08:/Tussenkoppeling/, e09:/Ophangset Verstelbaar/,
    e10:/Ophangbeugel Lang/, e11:/Ophangbeugel Kort/, e12:/Ophangkabel/, e13:/Plafondklem/, e14:/Snelspanner/, e15:/Schuko adapter/};
  t.ADAPTERS_OVERIG_1F.forEach(a => Object.entries(a.codes).forEach(([opt, c]) => {
    gebruikt.add(c.p);
    const o = bron.get(c.p) || '';
    /* 'wit 1,5 m' wordt Wit en 1,5M, zoals de lijst ze schrijft */
    const woorden = opt === '-' ? [] : opt.replace(/ m$/, 'M').split(' ').map(w => K[w] || w);
    if(!SOORT[a.id] || !SOORT[a.id].test(o)) fout.push(a.id + ' (' + a.name + '): ' + c.p + ' is "' + o + '"');
    else if(!woorden.every(w => o.includes(w))) fout.push(a.id + ' ' + opt + ': ' + c.p + ' is "' + o + '"');
  }));
  is('elke 1-fase code staat op zijn plek, zoals in 1-fase-rail.csv', fout, []);
  is('alle ' + bron.size + ' artikelen van de lijst zitten in de tool', [...bron.keys()].filter(c => !gebruikt.has(c)), []);
  /* De T-koppelstukken (zie PCODES_1F): Binnen/Buiten is de balkzijde (R = buiten),
     Links/Rechts de steelzijde (1 = rechts); en de nummers lopen op in de volgorde van de
     Nordic-typen GB36, 37, 39, 40 = R1, L2, R2, L1 - zoals bij de 3-fase rail, waar die
     volgorde op 17-7-2026 is vastgesteld. */
  is('T-namen volgen balk- en steelzijde', Object.entries(t.T_1F_NAAM).filter(([sl, n]) =>
    n !== (sl[1] === '1' ? 'Rechts' : 'Links') + ' ' + (sl[0] === 'R' ? 'Buiten' : 'Binnen')), []);
  const oplopend = tab => ['R1', 'L2', 'R2', 'L1'].map(sl => +tab[sl]).every((v, i, r) => !i || v > r[i - 1]);
  is('T-nummers lopen op als R1, L2, R2, L1 (1-fase wit en zwart, en de 3-fase rail)',
    [oplopend(P.tkoppel.wit), oplopend(P.tkoppel.zwart), oplopend(t.PCODES.tkoppel.wit), oplopend(t.PCODES.tkoppel.zwart)], [true, true, true, true]);
  /* Artikelnummer en verpakkingscode horen bij elkaar zoals in het export; waar het
     export geen leverancierscode heeft ("** " met het eigen nummer: de ophangset) is de
     verpakkingscode leeg. */
  const paren = [];
  const loopPaar = (p, l, pad) => {
    if(typeof p === 'string'){ const v = lev.get(p) || ''; if((v.startsWith('KKT') ? v : '') !== l) paren.push(pad + ': ' + p + ' / ' + l + ' (export: ' + v + ')'); return; }
    for(const k of Object.keys(p)) loopPaar(p[k], l[k], pad + '.' + k);
  };
  loopPaar(P, t.LCODES_1F, 'PCODES_1F');
  t.ADAPTERS_OVERIG_1F.forEach(a => Object.entries(a.codes).forEach(([o, c]) => loopPaar(c.p, c.l, a.id + '.' + o)));
  is('artikelnummer en verpakkingscode van de 1-fase rail zoals in het export', paren, []);
  /* De vier T's tegen de catalogus van Nordic: het type dat het polariteitsschema bij de
     sleutel van nodeVariants() geeft (R1 = GB36, L2 = GB37, R2 = GB39, L1 = GB40), en de
     KKT-code die de catalogus bij dat type en die kleur noemt. */
  const NORDIC_T = {R1:{wit:'KKT303243', zwart:'KKT303241'}, L2:{wit:'KKT303248', zwart:'KKT303246'},
                    R2:{wit:'KKT303258', zwart:'KKT303256'}, L1:{wit:'KKT303263', zwart:'KKT303261'}};
  is('T-koppelstukken: het Nordic-type van het polariteitsschema', ['wit', 'zwart'].map(k => Object.keys(NORDIC_T).map(sl => t.LCODES_1F.tkoppel[k][sl])),
    ['wit', 'zwart'].map(k => Object.keys(NORDIC_T).map(sl => NORDIC_T[sl][k])));
  /* de maten van de koppelstukken buiten de rail, uit de maattekeningen van Nordic */
  is('maten 1-fase', t.MM_1F, {aansluit:55, eindkap:4, bochtArm:55, tBarArm:40, tStemArm:55, kruisArm:40, midden:80, elkoppel:0});
  is('maten 3-fase ongewijzigd', t.MM_3F, {aansluit:66, eindkap:3, bochtArm:66, tBarArm:50, tStemArm:66, kruisArm:50, midden:100, elkoppel:0});
}

/* ============== de briefingtekst (armaturenboek en railtool) ============== */
{
  /* De bronnen van de briefing (bestek, technische tekeningen, armaturenboek, e-mail)
     zijn optioneel: alleen wat is ingevuld komt in de tekst, en de zinnen voegen zich
     daarnaar. Een leeg veld gaf vroeger "[Bestek]" in de PDF, ook bij een vergelijking
     waar geen bestek bij hoorde. De tekst staat in briefing.js, dat het armaturenboek
     en de railtool allebei laden. */
  console.log('briefingtekst');
  const b = await laadUit('briefing.js',
    ['briefRegels', 'briefOpsomming', 'BRIEF_VELDEN', 'briefingOpenVelden', 'briefNamen', 'briefGroepen',
     'briefBronnen', 'briefVraagSlot', 'briefInhoud']);
  const tekst = segs => segs.map(s => s.v ? '**' + s.t + '**' : s.t).join('');
  const blad = (soort, velden) => {
    const i = b.briefInhoud(Object.assign({soort, proj:'Kantoor Weena'}, velden));
    return {vraag: tekst(i.vraag), slot: tekst(i.vraagSlot),
            rest: i.blokken.map(x => x.t || (x.s ? tekst(x.s) : x.items.join(' / ')))};
  };

  const alleenMail = blad('vergelijking', {email:'Aanvraag verlichting kantoor'});
  is('vergelijking met alleen een e-mail: geen bestek, geen plaatshouder',
    [alleenMail.vraag + alleenMail.slot + alleenMail.rest.join(' ')].map(s => /\[|bestek|document/i.test(s)), [false]);
  is('de e-mail staat in "De vraag", onderwerp tussen aanhalingstekens',
    [alleenMail.vraag.endsWith('vastgelegd in de e-mail met als onderwerp:'), alleenMail.slot],
    [true, '**“Aanvraag verlichting kantoor”**']);
  is('zonder armaturenboek wijkt het af van de gevraagde armaturen',
    alleenMail.rest.some(r => r.includes('afwijken van de gevraagde armaturen of van de laatst geldende')), true);

  /* bestek en tekeningen: dezelfde zinnen als het ontwerp */
  const ontwerp = blad('lichtberekening', {bestek:'Bestek E-01', tekeningen:'Tekening E-01\nTekening E-02'});
  is('lichtberekening met bestek en tekeningen: de tekst van het ontwerp',
    [ontwerp.vraag.endsWith('vastgelegd in het document:'), ontwerp.slot, ontwerp.rest.slice(1, 4)],
    [true, '**Bestek E-01**', ['Op basis van de tekeningen:', '**Tekening E-01 en Tekening E-02**',
      'ontwikkelen wij een lichtconcept dat aansluit op het gevraagde lichtplan. Dit concept is uitgewerkt '
      + 'volgens de uitgangspunten zoals omschreven in het document **Bestek E-01**, en voldoet aan de actuele '
      + 'norm NEN-EN 12464-1:2021.']]);

  const twee = blad('vergelijking', {bestek:'Bestek X', armaturenboek:'Armaturenboek Y'});
  is('bestek en armaturenboek worden samen "de documenten"', twee.rest[1],
    'Op basis van de documenten **Bestek X en Armaturenboek Y** maken wij een armaturenpropositie die aansluit op de gevraagde offerte.');
  is('het armaturenboek in de disclaimer', twee.rest.some(r => r.includes('afwijken van de armaturen in het document **Armaturenboek Y** of')), true);

  const gemengd = blad('vergelijking', {bestek:'Bestek X', email:'Offerte hal 2'});
  is('twee soorten bronnen: de opsomming op de regel onder de vraag',
    [gemengd.vraag.endsWith('vastgelegd in:'), gemengd.slot],
    [true, 'het document **Bestek X** en de e-mail met als onderwerp **“Offerte hal 2”**']);

  const niets = blad('lichtberekening', {});
  is('zonder bronnen: geen slotzin en geen plaatshouder',
    [niets.vraag, niets.slot, niets.rest[1]],
    ['Het opstellen van een lichtplan voor **Kantoor Weena.**', '',
     'Wij ontwikkelen een lichtconcept dat aansluit op het gevraagde lichtplan. Dit concept voldoet aan de actuele norm NEN-EN 12464-1:2021.']);
  is('alleen een lege projectnaam is nog een open veld', b.briefingOpenVelden({}), ['projectnaam']);
  /* een project van vóór de soort opdracht (de railtool kende hem niet) is een
     lichtberekening, zoals het paneel hem dan ook toont */
  is('zonder soort: een lichtberekening', b.briefInhoud({proj:'X'}).vraag[0].t, 'Het opstellen van een lichtplan voor ');
}

/* ============== armaturen uit een Excel-lijst: armaturen-excel.js ============== */
{
  /* Het armaturenboek en de railtool lezen een Excel-lijst in: kolom A de code, F het
     totale aantal, I de artikelcode(s), J de omschrijving(en), L de opmerking. De naam
     komt uit de catalogus zoals bij intypen; de omschrijving uit de lijst is de controle,
     en wijkt hij af dan kiest de gebruiker. Accessoires staan op de regel van hun
     armatuur, met een + ertussen. */
  console.log('Excel-lijst inlezen');
  const xl = await laadUit('armaturen-excel.js',
    ['excelRijen', 'csvRijen', 'EXCEL_KOLOM', 'enkel', 'EXCEL_KOPWOORD', 'excelArmatuurRegels', 'excelDelen',
     'excelVergelijk', 'woordVerschil'],
    snijUit(readFileSync(join(root, 'armatuur-rij.js'), 'utf8'), 'catalogusNaam'));
  const venster = {};
  new Function('window', readFileSync(join(root, 'catalogus-data.js'), 'utf8'))(venster);
  const CAT = venster.CATALOGUS;

  /* tools/proef-armaturen.xlsx, gemaakt met openpyxl (tools/maak-proef-armaturen.py) in
     de opmaak van de lijst die inside sales zelf maakt: drie kopregels, aantallen per
     ruimte en een totaal, tekst in de cel zelf (inlineStr), een getal als artikelcode,
     opgemaakte tekst in één cel, een tussenkop, accessoires met een +, regels met alleen
     een 0 in de totaalkolom, en een tweede blad */
  const rijen = await xl.excelRijen(new Uint8Array(readFileSync(join(root, 'tools/proef-armaturen.xlsx'))));
  is('de proeflijst: twintig rijen, kolom A op plek 0, F op 5 en I op 8 (een getal blijft zoals het staat)',
    [rijen.length, rijen[3][0], rijen[3][1], rijen[3][5], rijen[3][8], rijen[3].slice(2, 5)], [20, 'A', '12', '12', '1092379', ['', '', '']]);
  const regels = xl.excelArmatuurRegels(rijen);
  const mondial120 = CAT['1092379'], dura = CAT['1084459-SN'];
  const NOOD = 'Pragmalux Noodmodule Kit t.b.v. Panelen & Downlights 3 uur met autotest';
  const DRIVER = 'Philips Driver Xitanium 20W/m 300mA 44V DS I 230V incl. DC kabel';
  const r = (rij, code, artikelcode, omschrijving, aantal = 0, opmerking = '', codes = [artikelcode]) =>
    ({rij, code, artikelcode, omschrijving, codes, aantal, opmerking});
  is('de proeflijst: kopregels, tussenkop, nullen en het tweede blad tellen niet; aantal uit F, opmerking uit L', regels, [
    r(4, 'A', '1092379', mondial120, 12),
    r(5, 'B', '1084459-SN', dura.replace('1uur', '3uur'), 4, 'Niet IK10'),
    r(6, 'C', '9999999', 'Eigen armatuur & zo', 2, 'via de leverancier'),
    r(7, 'D', '1047515', ''),
    r(9, 'E', '8888888', ''),
    r(10, 'F', '1092409', 'Pragmalux LED Downlight Mondial IP54 platte frame alu wit Ø132 buitenmaat - gatmaat Ø120'),
    r(11, 'G', '1092416', CAT['1092416']),
    r(12, 'H', '1000947-OS + 1000282', CAT['1000947-OS'] + ' + ' + NOOD, 8, '', ['1000947-OS', '1000282']),
    r(13, 'K', 'WS1046761 + 9322219-300 + 1000282', CAT['WS1046761'] + ' + ' + DRIVER + ' + ' + NOOD, 4, '',
      ['WS1046761', '9322219-300', '1000282']),
    r(14, 'M', '1084459-S+1047515', CAT['1084459-S'] + ' + ' + CAT['1047515'], 6, '', ['1084459-S', '1047515']),
    r(15, 'S', 'Special', 'DLC - volledige eigen naam special', 3)]);
  /* per artikel, het armatuur en zijn accessoires apart */
  const perArtikel = regels.map(x => xl.excelDelen(x, CAT).map(d => d.artikelcode + ' ' + xl.excelVergelijk(d, CAT).soort).join(' + '));
  is('per artikel: gelijk, anders, niet in de catalogus, zonder omschrijving, geen van beide', perArtikel,
    ['1092379 gelijk', '1084459-SN anders', '9999999 excel', '1047515 catalogus', '8888888 leeg', '1092409 gelijk', '1092416 gelijk',
     '1000947-OS gelijk + 1000282 excel', 'WS1046761 gelijk + 9322219-300 excel + 1000282 excel',
     '1084459-S gelijk + 1047515 gelijk', 'Special excel']);
  is('een verschil geeft beide omschrijvingen; zonder verschil de naam uit de catalogus',
    [xl.excelVergelijk(regels[1], CAT), xl.excelVergelijk(regels[0], CAT), xl.excelVergelijk(regels[2], CAT), xl.excelVergelijk(regels[3], CAT)],
    [{soort:'anders', catalogus:dura, excel:dura.replace('1uur', '3uur')}, {soort:'gelijk', naam:mondial120},
     {soort:'excel', naam:'Eigen armatuur & zo'}, {soort:'catalogus', naam:CAT['1047515']}]);
  /* "1 op 1": een hoofdletter of een leesteken is een verschil, een spatie niet */
  is('gelijk is letterlijk, op spaties na',
    ['ip54', 'IP54,', ' IP54  '].map(w => xl.excelVergelijk({artikelcode:'1092379', omschrijving:mondial120.replace('IP54', w)}, CAT).soort),
    ['anders', 'anders', 'gelijk']);

  /* Het knippen van J. Niet elke + is een grens: "+Osram Driver" en "2-CCT +
     bewegingssensor" horen bij de naam van het armatuur. */
  const knip = (codes, oms) => xl.excelDelen({codes, omschrijving: oms}, CAT).map(d => d.omschrijving);
  const sigma = CAT['1000947-OS'], duraS = CAT['1084459-S'], luna = CAT['1047515'];
  is('de + in een naam uit de catalogus is geen grens', [knip(['1000947-OS', '1000282'], sigma + ' + ' + NOOD),
    knip(['1084459-S', '1047515'], duraS + ' + ' + luna)], [[sigma, NOOD], [duraS, luna]]);
  /* De catalogus kent het armatuur niet: dan de knip met de grenzen het verst naar achteren */
  is('onbekend: de grenzen zo ver mogelijk naar achteren', knip(['9999999', '8888888'], 'Lamp + sensor + Driver X'),
    ['Lamp + sensor', 'Driver X']);
  /* De omschrijving van het armatuur wijkt af (3uur): dan nog wint de knip die er het minst van verschilt */
  is('een afwijkende naam knipt toch goed', knip(['1084459-SN', '1047515'], dura.replace('1uur', '3uur') + ' + ' + luna),
    [dura.replace('1uur', '3uur'), luna]);
  is('minder stukken dan codes: de laatste blijft leeg; één code: niets geknipt',
    [knip(['1000947-OS', '1000282'], sigma), knip(['1084459-S'], duraS + ' + ' + luna)], [[sigma, ''], [duraS + ' + ' + luna]]);
  /* het aantal uit F */
  is('het aantal: een getal, ook als tekst of met een komma; leeg, 0 of tekst is 0',
    ['5', '8.0', '2,6', '', '0', 'n.t.b.', '-3'].map(f => {
      const rij = []; rij[0] = 'A'; rij[5] = f; rij[8] = '1092379'; return xl.excelArmatuurRegels([rij])[0].aantal; }),
    [5, 8, 3, 0, 0, 0, 0]);

  /* wat de gebruiker gemarkeerd ziet */
  const anders = ([a, b]) => [a.filter(w => !w.mee).map(w => w.w), b.filter(w => !w.mee).map(w => w.w)];
  is('het verschil per woord: alleen 1uur tegen 3uur', anders(xl.woordVerschil(dura, dura.replace('1uur', '3uur'))), [['1uur'], ['3uur']]);
  is('een woord erbij, eraf en anders', [anders(xl.woordVerschil('a b c', 'a x b c')), anders(xl.woordVerschil('a b c d', 'a c d')),
    anders(xl.woordVerschil('LED 12W wit', 'LED 18W  wit'))], [[[], ['x']], [['b'], []], [['12W'], ['18W']]]);

  /* Zoals Excel zelf schrijft: tekst in een gedeelde lijst (sharedStrings.xml), opgemaakte
     tekst in stukken (<r>), de uitspraakhulp (<rPh>) die er niet bij hoort, een formule met
     zijn uitkomst, en een eerste blad dat niet sheet1.xml heet - Excel houdt de bestandsnaam
     als je een blad naar voren sleept. Half ingepakt, half niet. */
  const maakZip = (delen) => {
    const lokaal = [], centraal = []; let plek = 0;
    for(const [naam, tekst, pak] of delen){
      const n = Buffer.from(naam), ruw = Buffer.from(tekst, 'utf8'), data = pak ? deflateRawSync(ruw) : ruw;
      const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(pak ? 8 : 0, 8);
      l.writeUInt32LE(data.length, 18); l.writeUInt32LE(ruw.length, 22); l.writeUInt16LE(n.length, 26);
      const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6);
      c.writeUInt16LE(pak ? 8 : 0, 10); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(ruw.length, 24);
      c.writeUInt16LE(n.length, 28); c.writeUInt32LE(plek, 42);
      lokaal.push(l, n, data); centraal.push(c, n); plek += 30 + n.length + data.length;
    }
    const cd = Buffer.concat(centraal), e = Buffer.alloc(22);
    e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(delen.length, 8); e.writeUInt16LE(delen.length, 10);
    e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(plek, 16);
    return new Uint8Array(Buffer.concat([...lokaal, cd, e]));
  };
  const S = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const zip = maakZip([
    ['xl/workbook.xml', '<workbook ' + S + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
      + '<sheet name="Lijst" sheetId="3" r:id="rId3"/><sheet name="Oud" sheetId="1" r:id="rId1"/></sheets></workbook>', true],
    ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="x/worksheet" Target="worksheets/sheet1.xml"/>'
      + '<Relationship Id="rId3" Type="x/worksheet" Target="worksheets/sheet3.xml"/></Relationships>', false],
    ['xl/sharedStrings.xml', '<sst ' + S + ' count="5" uniqueCount="5">'
      + '<si><t>Code</t></si><si><t>Artikelcode</t></si><si><t>Omschrijving</t></si>'
      + '<si><r><t xml:space="preserve">Downlight </t></r><r><rPr><b/></rPr><t>Mondial</t></r>'
      + '<rPh sb="0" eb="1"><t>X</t></rPh><t xml:space="preserve"> &amp; frame</t></si>'
      + '<si><t>A1</t></si><si><t xml:space="preserve">Niet IK10 </t></si></sst>', true],
    ['xl/worksheets/sheet1.xml', '<worksheet ' + S + '><sheetData><row r="1"><c r="I1" t="inlineStr"><is><t>FOUT</t></is></c>'
      + '<c r="J1" t="inlineStr"><is><t>het verkeerde blad</t></is></c></row></sheetData></worksheet>', true],
    ['xl/worksheets/sheet3.xml', '<worksheet ' + S + '><sheetData>'
      + '<row r="2" spans="1:10"><c r="A2" t="s"><v>0</v></c><c r="I2" t="s"><v>1</v></c><c r="J2" t="s"><v>2</v></c></row>'
      + '<row r="3"><c r="A3" t="s" s="1"><v>4</v></c><c r="B3" s="2"><v>3</v></c><c r="C3"><v>4</v></c>'
      + '<c r="F3"><f>SUM(B3:E3)</f><v>7</v></c><c r="I3" s="1"><v>1092379</v></c><c r="J3" t="s"><v>3</v></c>'
      + '<c r="L3" t="s"><v>5</v></c></row>'
      + '<row r="5"><c r="A5" t="str"><f>A3&amp;"b"</f><v>A1b</v></c><c r="I5" t="str"><f>I3</f><v>1092379</v></c>'
      + '<c r="J5" t="s"><v>3</v></c></row>'
      + '</sheetData></worksheet>', false],
  ]);
  const leesFout = async bytes => { try{ await xl.excelRijen(bytes); return ''; }catch(err){ return err.message; } };
  is('de zip zoals Excel hem schrijft leest zonder fout', await leesFout(zip), '');
  const ex = await xl.excelRijen(zip).catch(() => []);
  is('zoals Excel schrijft: gedeelde tekst, stukken, formules, het eerste blad via de rels', xl.excelArmatuurRegels(ex), [
    {rij:3, code:'A1', artikelcode:'1092379', omschrijving:'Downlight Mondial & frame', codes:['1092379'], aantal:7, opmerking:'Niet IK10'},
    {rij:5, code:'A1b', artikelcode:'1092379', omschrijving:'Downlight Mondial & frame', codes:['1092379'], aantal:0, opmerking:''}]);
  is('een lege rij tussendoor blijft een lege rij', [ex.length, ex[0], ex[3]], [5, [], []]);
  /* een kapotte zip: de inhoudsopgave klopt, de ingepakte inhoud niet */
  const kapot = maakZip([['xl/workbook.xml', '<workbook/>', true]]);
  kapot.fill(0xFF, 30 + 'xl/workbook.xml'.length, 30 + 'xl/workbook.xml'.length + 4);
  is('geen zip, of een kapotte: een fout die iets zegt',
    [await leesFout(new Uint8Array(Buffer.from('Code;Artikelcode\nA;1092379\n'))), await leesFout(kapot)],
    ['dit is geen Excel-bestand (.xlsx)', 'het bestand is beschadigd']);

  /* een .csv zoals Excel hem opslaat: puntkomma's, aanhalingstekens, BOM, CRLF */
  const csv = '﻿Code;B;C;D;E;F;G;H;Artikelcode;Omschrijving\r\n'
    + 'A;;;;;;;;1092379;"Downlight; met ""puntkomma"""\r\n;;;;;;;;;\r\nB;;;;;;;;1047515;\r\n';
  is('een .csv met puntkomma\'s', xl.excelArmatuurRegels(xl.csvRijen(csv)), [
    {rij:2, code:'A', artikelcode:'1092379', omschrijving:'Downlight; met "puntkomma"', codes:['1092379'], aantal:0, opmerking:''},
    {rij:4, code:'B', artikelcode:'1047515', omschrijving:'', codes:['1047515'], aantal:0, opmerking:''}]);
  is('en een met komma\'s', xl.csvRijen('a,b,"c,d"\n1,2,3'), [['a', 'b', 'c,d'], ['1', '2', '3']]);
}

/* ======================= railtool: ruimtes per tekenvlak ======================= */
{
  /* Eén ontwerp in meer ruimtes (twintig gelijke kantoren) is één tekenvlak met twintig
     ruimtes. Het invoerveld neemt een naam, een reeks of een lijst. */
  console.log('ruimtes');
  const r = await laadUit('index.html', ['ruimteNamen']);
  is('één naam is één ruimte', r.ruimteNamen('Kantoor 1'), ['Kantoor 1']);
  is('een reeks wordt uitgeschreven', r.ruimteNamen('Kantoor 1-4'), ['Kantoor 1', 'Kantoor 2', 'Kantoor 3', 'Kantoor 4']);
  is('ook met t/m, en voorloopnullen blijven', r.ruimteNamen('Spreekkamer 08 t/m 11'),
    ['Spreekkamer 08', 'Spreekkamer 09', 'Spreekkamer 10', 'Spreekkamer 11']);
  is('komma\'s scheiden namen', r.ruimteNamen('Kantine, Hal; Kantoor 2-3'), ['Kantine', 'Hal', 'Kantoor 2', 'Kantoor 3']);
  is('een aflopende of te lange reeks blijft één naam', [r.ruimteNamen('Kamer 5-2'), r.ruimteNamen('Gebouw 1-9999').length],
    [['Kamer 5-2'], 1]);
  is('leeg is niets', r.ruimteNamen('  , '), []);
}

/* ---------------------------------------------------------------- verslag ---- */
console.log('\n' + gedaan + ' controles, ' + (mis ? mis + ' MIS' : 'alles goed') + '.');
process.exit(mis ? 1 : 0);
