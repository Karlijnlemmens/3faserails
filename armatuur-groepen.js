/* De armatuurtypen en hun herkenning - gedeeld door de railconfigurator en het
   armaturenboek.

   Een presenter hoort bij een TYPE, niet bij een uitvoering: kleur, wattage,
   lichtkleur en dimprotocol delen allemaal dezelfde presenter. Naam en artikelcode
   van een armatuur blijven vrije tekst; de groep wordt daaruit herkend met
   matchArmGroep() en kan per regel met de hand worden overschreven.
   zoektermen = extra schrijfwijzen en handelsnamen die naar dezelfde groep wijzen.

   Deze tabel stond in twee bestanden, 253 regels per stuk, met de opdracht ze met de
   hand gelijk te houden. Dat ging mis: de lichtlijn-groepen zaten alleen in het
   armaturenboek. Nu staat hij hier, en kennen beide tools hetzelfde.

   Het bestand zet ARM_GROEPEN en matchArmGroep als globale namen neer, precies zoals
   de tools ze al gebruikten - zo hoefde er in de tools zelf niets aan de aanroepen te
   veranderen. Laden met een gewoon <script src="armatuur-groepen.js">, vóór de code
   van de tool; geen module, want die weigert te laden vanaf schijf (file://).

   node tools/controleer-logica.mjs test de herkenning (113 groepen plus de gevallen
   die er ooit naast zaten). */
const ARM_GROEPEN = [
  {id:'ag01', naam:'Punto', zoektermen:[]},
  {id:'ag02', naam:'Piccolo', zoektermen:[]},
  {id:'ag03', naam:'Dio', zoektermen:[], stempelKleur:'#1A253C'},
  {id:'ag04', naam:'Alto', zoektermen:[]},
  {id:'ag05', naam:'Skyline', zoektermen:[]},
  {id:'ag06', naam:'Arda', zoektermen:[]},
  {id:'ag07', naam:'Orion', zoektermen:[]},
  {id:'ag08', naam:'Notra', zoektermen:[]},
  {id:'ag09', naam:'Ario GU10', zoektermen:['Ario']},
  {id:'ag10', naam:'Lustra GU10', zoektermen:['Lustra']},
  {id:'ag11', naam:'Fendi GU10', zoektermen:['Fendi']},
  {id:'ag12', naam:'Altoflood', zoektermen:['Alto flood','Alto-flood']},
  {id:'ag13', naam:'Paneel Essence G3', zoektermen:['Essence G3','Essence']},
  {id:'ag14', naam:'Downlight Essence G2', zoektermen:['Essence G2','Essence']},
  {id:'ag15', naam:'Mondial Pir', zoektermen:[]},
  {id:'ag16', naam:'Bandraster Miro', zoektermen:['Miro']},
  {id:'ag17', naam:'Downlight Essence Pir', zoektermen:['Essence Pir']},
  {id:'ag18', naam:'Downlight Essence Ugr', zoektermen:['Essence Ugr']},
  {id:'ag19', naam:'Downlight Fora IP65', zoektermen:['Fora IP65','Fora']},
  {id:'ag20', naam:'Downlight Mado', zoektermen:['Mado']},
  {id:'ag21', naam:'Downlight Mondial', zoektermen:['Mondial']},
  {id:'ag22', naam:'Downlight Spectre', zoektermen:['Spectre']},
  {id:'ag23', naam:'In-/Opbouw Downlight Luna G2', zoektermen:['Luna G2','Luna']},
  {id:'ag24', naam:'Mondial Nood', zoektermen:[]},
  {id:'ag25', naam:'Mondial Opbouw Pendel', zoektermen:[]},
  {id:'ag26', naam:'Mondial Track', zoektermen:[]},
  {id:'ag27', naam:'Opbouw Downlight Relio', zoektermen:['Relio']},
  {id:'ag28', naam:'Paneel Conto', zoektermen:['Conto']},
  {id:'ag29', naam:'Paneel Easy G2', zoektermen:['Easy G2','Easy']},
  {id:'ag30', naam:'Paneel Flexcore', zoektermen:['Flexcore']},
  {id:'ag31', naam:'Paneel Modul', zoektermen:['Modul']},
  {id:'ag32', naam:'Paneel Optic', zoektermen:['Optic']},
  {id:'ag33', naam:'Paneel Rondix', zoektermen:['Rondix']},
  {id:'ag34', naam:'Paneel Sigma G2', zoektermen:['Sigma G2','Sigma']},
  {id:'ag35', naam:'Paneel Wingar', zoektermen:['Wingar']},
  {id:'ag36', naam:'Briq', zoektermen:[]},
  {id:'ag37', naam:'Inbouwspot Alpha', zoektermen:['Alpha']},
  {id:'ag38', naam:'Inbouwspot Apollo Round', zoektermen:['Apollo Round','Apollo']},
  {id:'ag39', naam:'Lumio', zoektermen:[]},
  {id:'ag40', naam:'Noodverlichting Dot', zoektermen:['Dot']},
  {id:'ag41', naam:'Noodverlichting Uni', zoektermen:['Uni']},
  {id:'ag42', naam:'Waterdicht Hermes', zoektermen:['Hermes']},
  {id:'ag43', naam:'Module Mico', zoektermen:['Mico']},
  {id:'ag44', naam:'Neo', zoektermen:[]},
  {id:'ag45', naam:'Auva G2', zoektermen:[]},
  {id:'ag46', naam:'Auva G2 Anticorrosie', zoektermen:['Anticorrosie']},
  {id:'ag47', naam:'Breedstraler Auva G3', zoektermen:['Auva G3']},
  {id:'ag48', naam:'Bulkhead Ovalo', zoektermen:['Ovalo']},
  {id:'ag49', naam:'Bulkhead Venus G2', zoektermen:['Venus G2','Venus']},
  {id:'ag50', naam:'Facio', zoektermen:[]},
  {id:'ag51', naam:'Gevelarmatuur Mura', zoektermen:['Mura']},
  {id:'ag52', naam:'Gevelarmatuur Rocq', zoektermen:['Rocq']},
  {id:'ag53', naam:'Waterdicht Value V3', zoektermen:['Value V3','Value']},
  {id:'ag54', naam:'Wandarmatuur Blocq', zoektermen:['Blocq']},
  {id:'ag55', naam:'Parono', zoektermen:[]},
  {id:'ag56', naam:'Waterdicht Essence G3 IP66', zoektermen:['Essence G3 IP66']},
  {id:'ag57', naam:'Waterdicht Hera IP66', zoektermen:['Hera IP66','Hera']},
  {id:'ag58', naam:'Plano IP54', zoektermen:['Plano']},
  {id:'ag59', naam:'Re-Light', zoektermen:[]},
  {id:'ag60', naam:'Spiegelarmatuur Aqualis Rond', zoektermen:['Aqualis Rond']},
  {id:'ag61', naam:'Spiegelarmatuur Aqualis Vierkant', zoektermen:['Aqualis Vierkant']},
  {id:'ag62', naam:'Spiegelarmatuur Softshine', zoektermen:['Softshine']},
  {id:'ag63', naam:'Squalo Mini IP65', zoektermen:['Squalo Mini']},
  {id:'ag64', naam:'Spiegelarmatuur Spigo', zoektermen:['Spigo']},
  {id:'ag65', naam:'Sparta UGR', zoektermen:['Sparta UGR']},
  {id:'ag66', naam:'Gevelarmatuur Deca', zoektermen:['Deca']},
  {id:'ag67', naam:'Gevelarmatuur Squalo', zoektermen:['Squalo']},
  {id:'ag68', naam:'Highbay Clean IP69K G2', zoektermen:['Clean IP69K']},
  {id:'ag69', naam:'Batten Essence', zoektermen:['Batten Essence']},
  {id:'ag70', naam:'Batten Lumea', zoektermen:['Lumea']},
  {id:'ag71', naam:'Highbay Storm G3', zoektermen:['Storm G3','Storm']},
  {id:'ag72', naam:'Lowbay Copa G2', zoektermen:['Copa']},
  {id:'ag73', naam:'Montagebalk Linea', zoektermen:['Linea']},
  {id:'ag74', naam:'Moon', zoektermen:[]},
  {id:'ag75', naam:'Noodverlichting Dot IP65', zoektermen:['Dot IP65']},
  {id:'ag76', naam:'Noodverlichting Dot Plus', zoektermen:['Dot Plus']},
  {id:'ag77', naam:'Noodverlichting Dot XL', zoektermen:['Dot XL']},
  {id:'ag78', naam:'Noodverlichting Kit', zoektermen:['Kit']},
  {id:'ag79', naam:'Noodverlichting Maximus', zoektermen:['Maximus']},
  {id:'ag80', naam:'Noodverlichting Norma', zoektermen:['Norma']},
  {id:'ag81', naam:'Noodverlichting Picto', zoektermen:['Picto']},
  {id:'ag82', naam:'Paneel Sigma G2 IP65', zoektermen:['Sigma G2 IP65']},
  {id:'ag83', naam:'Pendelarmatuur Circo', zoektermen:['Circo']},
  {id:'ag84', naam:'Polo G3', zoektermen:[]},
  {id:'ag85', naam:'Portiekarmatuur Port M', zoektermen:['Port M']},
  {id:'ag86', naam:'Spot Scopa', zoektermen:['Scopa']},
  {id:'ag87', naam:'Spot Vita', zoektermen:['Vita']},
  {id:'ag88', naam:'Wandarmatuur Qube IP65', zoektermen:['Qube IP65','Qube']},
  {id:'ag89', naam:'Sparta Pro', zoektermen:['Sparta Pro']},
  {id:'ag90', naam:'Dura', zoektermen:[]},
  {id:'ag91', naam:'Highbay Lineo', zoektermen:['Lineo']},
  {id:'ag92', naam:'Opbouwspot Cubo', zoektermen:['Cubo']},
  {id:'ag93', naam:'Opbouwspot Kaja', zoektermen:['Kaja']},
  {id:'ag94', naam:'Opbouwspot Penda', zoektermen:['Penda']},
  {id:'ag95', naam:'Portiekarmatuur Port S', zoektermen:['Port S']},
  {id:'ag96', naam:'Sirius', zoektermen:[]},
  {id:'ag97', naam:'Sparta Eco', zoektermen:['Sparta Eco']},
  {id:'ag98', naam:'Spot Adjusto G2', zoektermen:['Adjusto']},
  {id:'ag99', naam:'Spot Casso', zoektermen:['Casso']},
  {id:'ag100', naam:'Spot Fasio', zoektermen:['Fasio']},
  {id:'ag101', naam:'Spot Pico', zoektermen:['Pico']},
  {id:'ag102', naam:'Spot Ponto', zoektermen:['Ponto']},
  {id:'ag103', naam:'Spot Projecto', zoektermen:['Projecto']},
  {id:'ag104', naam:'Spot Squadro', zoektermen:['Squadro']},
  {id:'ag105', naam:'Straatverlichting Strada', zoektermen:['Strada']},
  {id:'ag106', naam:'Waterdicht Essence Classic G2', zoektermen:['Essence Classic G2']},
  {id:'ag107', naam:'Waterdicht Essence Slim', zoektermen:['Essence Slim']},
  {id:'ag108', naam:'Waterdicht Typhoon', zoektermen:['Typhoon']},
  {id:'ag109', naam:'Pendelarmatuur Orion', zoektermen:['Pendel Orion']},
  {id:'ag110', naam:'Spot Vapor IP65', zoektermen:['Vapor']},
  {id:'lichtlijn-prxline', naam:'Lichtlijn PRX-Line', zoektermen:['Line']},
  {id:'lichtlijn-uniline', naam:'Lichtlijn PRX-Uniline', zoektermen:['Uniline']},
  {id:'lichtlijn-retroline', naam:'Lichtlijn Retroline PRX', zoektermen:['Retroline']},
];
const ARM_STOPWOORDEN = new Set([
  'wit','witte','white','zwart','zwarte','black','grijs','grijze','grey','gray',
  'zilver','silver','aluminium','alu','goud','gold','brons','bronze',
  'custom','coating','gecoat','mat','matte','glans','ral',
  'dali','dimbaar','dimbare','dimmable','dim','onoff','on','off','push','triac',
  'casambi','zigbee','switchdim','fase','driefase',
  'led','lamp','armatuur','armaturen','spot','spots','spotje','opbouwspot','inbouwspot',
  'downlight','paneel','opbouw','in',
  /* "track" is bewust geen stopwoord (meer): Mondial Track heeft geen ander woord om
     zich op te herkennen dan "track" zelf. */
  'rail','railspot','pragmalux','prx',
  'ww','nw','cw','warmwit','neutraalwit','koelwit',
  'stuks','stuk','type','serie','model','incl','excl','met','voor','de','het','een'
]);
const ARM_GETAL = /^\d+([.,]\d+)?(w|watt|k|lm|v|va|ma|mm|cm|m|gr|graden|deg)?$/;
const ARM_CODE = /^[a-z]{0,4}\d{5,}$/;
function armTokens(txt){
  /* Accenten er eerst af, anders valt "Plafonnière" uiteen in "plafonni" en "re" en
     is het soortwoord niet meer te herkennen. */
  return String(txt||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
}
/* Generieke formaatwoorden (downlight/paneel/opbouw/in = stopwoord) blijven weggefilterd
   ook al staan ze als eerste woord van een groepsnaam, anders wint dat woord altijd van
   het echte productwoord - zie index.html voor de volledige toelichting. */
const ARM_GROEP_TOKENS = ARM_GROEPEN.map(g=>({
  g, varianten: [g.naam].concat(g.zoektermen||[]).map(armTokens).filter(v=>v.length)
}));
const ARM_VOCAB = (()=>{ const s=new Set();
  ARM_GROEP_TOKENS.forEach(x=>x.varianten.forEach(v=>v.forEach(t=>{ if(!ARM_STOPWOORDEN.has(t)) s.add(t); })));
  return s; })();
function armSchoon(txt){
  /* "UGR<19" e.d. is een glare-index spec-waarde die op vrijwel elk paneel/downlight-
     spec-blad staat, geen verwijzing naar het type "Essence Ugr" (ag18) - anders wint
     dat type onterecht mee zodra iemand een volledige spec-tekst plakt die toevallig
     ook een UGR-waarde bevat. Kaal "Ugr" (zonder </≤ + getal erachter) blijft intact. */
  return String(txt||'').replace(/ugr\s*[<≤]\s*\d+/gi, ' ');
}
function armZinvolleTokens(txt){
  return armTokens(armSchoon(txt)).filter(t=>
    ARM_VOCAB.has(t) || !(ARM_STOPWOORDEN.has(t) || ARM_GETAL.test(t) || ARM_CODE.test(t)));
}
/* De naam waar de presenter aan hangt staat achter het soortwoord ("Downlight
   Mondial Opbouw…"), dus daar wordt eerst op gezocht; anders wint het soortwoord het
   van de naam - zie index.html voor de volledige toelichting. */
const ARM_TYPEWOORDEN = new Set([
  'downlight','downlights','paneel','paneelarmatuur','plafonniere','plafondarmatuur',
  'wandarmatuur','wandlamp','gevelarmatuur','pendelarmatuur','portiekarmatuur',
  'spiegelarmatuur','buitenarmatuur','inbouwarmatuur','opbouwarmatuur',
  'inbouwspot','opbouwspot','railspot','railspots','spot','spots',
  'waterdicht','waterdichte','bandraster','bulkhead','breedstraler','schijnwerper',
  'highbay','lowbay','montagebalk','lichtlijn','noodverlichting','straatverlichting',
  'module','opbouw','inbouw'
]);
/* Merk- en vulwoorden die tussen het soortwoord en de naam in mogen staan. */
const ARM_TUSSENWOORDEN = new Set(['pragmalux','prx','led','armatuur','armaturen','lamp','serie','type']);
/* Elk woord dat in een groepsnaam of zoekterm voorkomt. Zulke woorden horen bij een
   productnaam en breken de naam dus niet af: "Opbouw" hoort nog bij "Mondial Opbouw",
   terwijl "wit" of "25,5W" het einde van de naam markeert. */
const ARM_NAAMWOORDEN = (()=>{ const s=new Set();
  ARM_GROEP_TOKENS.forEach(x=>x.varianten.forEach(v=>v.forEach(t=>s.add(t))));
  return s; })();
function armNaamZone(txt){
  const toks = armTokens(armSchoon(txt));
  /* Het soortwoord moet vooraan staan; ervoor mag alleen merk of ruis staan, geen
     naam. Anders zou "Mondial Opbouw Pendel" bij "Opbouw" worden afgeknipt en alleen
     "Pendel" overhouden - daar staat de naam juist vóór het soortwoord. */
  let i = 0;
  while(i<toks.length && !ARM_TYPEWOORDEN.has(toks[i]) &&
        (ARM_TUSSENWOORDEN.has(toks[i]) || !ARM_NAAMWOORDEN.has(toks[i]))) i++;
  if(i>=toks.length || !ARM_TYPEWOORDEN.has(toks[i])) return null;
  /* Een omschrijving kan meer soortwoorden achter elkaar zetten ("Plafonnière /
     Wandarmatuur", "Opbouw Downlight"); de naam begint achter het laatste. */
  const soort = [];
  while(i<toks.length && (ARM_TYPEWOORDEN.has(toks[i]) || ARM_TUSSENWOORDEN.has(toks[i]))){
    if(ARM_TYPEWOORDEN.has(toks[i])) soort.push(toks[i]);
    i++;
  }
  const naam = [];
  for(; i<toks.length; i++){
    const t = toks[i];
    if(ARM_NAAMWOORDEN.has(t)){ naam.push(t); continue; }
    if(ARM_STOPWOORDEN.has(t) || ARM_GETAL.test(t) || ARM_CODE.test(t)) break;
    naam.push(t);   /* een woord dat we niet kennen kan nog steeds naam zijn */
  }
  if(!naam.length) return null;
  /* Het soortwoord telt wel mee in de score - "Pendelarmatuur Orion" is een andere
     presenter dan "Orion", en "Gevelarmatuur Squalo" een andere dan "Squalo Mini" -
     maar alleen als het onderscheidend is: de generieke soortwoorden (downlight,
     paneel, opbouw, spot) staan al in ARM_STOPWOORDEN en blijven eruit. */
  return naam.concat(soort.filter(t=>!ARM_STOPWOORDEN.has(t)));
}
/* De soort armatuur, voor zover die elkaar uitsluit: een paneel is geen
   downlight. Alleen de soortwoorden die echt een ander armatuur betekenen -
   niet opbouw/inbouw (dat is montage: "Downlight Mondial Opbouw" is de
   Mondial Opbouw Pendel), en niet spot, plafonnière of wandarmatuur (de
   Lumio is plafonnière én wandarmatuur). Paneel en bandraster zijn hier één
   soort, het systeemplafond: de presenter van de Flexcore heet zelf "Paneel &
   bandraster Flexcore" en die van de Optic noemt bandrasterformaten als
   uitvoering. Waterdicht is wel een eigen soort: een Highbay Essence werd
   anders de Waterdicht Essence Classic G2, zodra de paneel- en
   downlightgroepen van de Essence afvielen. */
const ARM_SOORT = {
  downlight:'downlight', downlights:'downlight',
  paneel:'raster', paneelarmatuur:'raster',
  bandraster:'raster', bandrasterarmatuur:'raster',
  waterdicht:'waterdicht', waterdichte:'waterdicht',
  highbay:'highbay', lowbay:'lowbay', lichtlijn:'lichtlijn',
  breedstraler:'breedstraler', schijnwerper:'breedstraler',
  railspot:'railspot', railspots:'railspot'
};
function armSoorten(toks){ return new Set(toks.map(t=>ARM_SOORT[t]).filter(Boolean)); }
/* De soort van een groep volgt uit zijn eigen naam: "Paneel Essence G3" is een
   paneel, "Downlight Essence G2" een downlight, "Punto" zegt niets. */
const ARM_GROEP_SOORT = new Map(ARM_GROEPEN.map(g=>[g, armSoorten(armTokens(g.naam))]));
/* De soortwoorden vooraan in een omschrijving - dezelfde plek waar armNaamZone()
   de naam begint te zoeken: "Pragmalux LED Paneel 60x60cm Essence G2 ...". */
function armBeginSoorten(txt){
  const toks = armTokens(armSchoon(txt)), soort = [];
  let i = 0;
  while(i<toks.length && !ARM_TYPEWOORDEN.has(toks[i]) && !ARM_SOORT[toks[i]] &&
        (ARM_TUSSENWOORDEN.has(toks[i]) || !ARM_NAAMWOORDEN.has(toks[i]))) i++;
  while(i<toks.length && (ARM_TYPEWOORDEN.has(toks[i]) || ARM_SOORT[toks[i]] || ARM_TUSSENWOORDEN.has(toks[i]))){
    soort.push(toks[i]); i++;
  }
  return armSoorten(soort);
}
/* Twee regels bovenop de score, allebei gevonden door na te kijken of alle
   artikelen van één catalogusfamilie bij dezelfde presenter uitkomen:
   - Spreekt de soort vooraan de soort van de groep tegen, dan valt die groep af.
     "LED Paneel 60x60cm Essence G2" werd de presenter van Downlight Essence G2,
     omdat G2 daar in de zoektermen staat en bij het paneel niet.
   - Een soortwoord alleen wijst geen presenter aan; er moet ook een naamwoord
     raken. "Plafonnière / Wandarmatuur Polo" werd Wandarmatuur Qube IP65, op
     niets anders dan het woord "wandarmatuur" - de Polo heet in de tabel
     "Polo G3" en haalde daardoor net minder punten. Een soortwoord telt wel mee
     náást de naam: "Pendelarmatuur Orion" wint nog steeds van "Orion". */
function armBesteGroep(toks, soorten){
  if(!toks || !toks.length) return null;
  const heeft = new Set(toks);
  let best=null, bestScore=0, gelijk=false;
  ARM_GROEP_TOKENS.forEach(({g,varianten})=>{
    const gs = ARM_GROEP_SOORT.get(g);
    if(soorten && soorten.size && gs.size && ![...gs].some(x=>soorten.has(x))) return;
    let score=0;
    varianten.forEach(v=>{
      if(!heeft.has(v[0])) return;
      if(!v.some(t=>heeft.has(t) && !ARM_TYPEWOORDEN.has(t) && !ARM_SOORT[t])) return;
      const hits = v.filter(t=>heeft.has(t)).length;
      const s = hits*100 + (hits===v.length?50:0) + v.join('').length;
      if(s>score) score=s;
    });
    if(!score) return;
    if(score>bestScore){ bestScore=score; best=g; gelijk=false; }
    else if(score===bestScore && g!==best) gelijk=true;
  });
  return gelijk ? null : best;
}
function matchArmGroep(txt){
  const soorten = armBeginSoorten(txt);
  return armBesteGroep(armNaamZone(txt), soorten) || armBesteGroep(armZinvolleTokens(txt), soorten);
}
/* Hoe een naamwoord in de tabel geschreven staat, zodat een suggestie "Essence"
   voorstelt en niet "essence". */
const ARM_SCHRIJFWIJZE = (()=>{ const m=new Map();
  ARM_GROEPEN.forEach(g=>[g.naam].concat(g.zoektermen||[]).forEach(z=>
    String(z).normalize('NFD').replace(/[̀-ͯ]/g,'').split(/[^A-Za-z0-9]+/)
      .forEach(w=>{ const t=w.toLowerCase(); if(t && !m.has(t)) m.set(t, w); })));
  return m; })();
/* Wordt een naam niet herkend, dan kan het een tikfout zijn: "Esence G2" of
   "Mondail opbouw". Dan stelt deze functie de verbeterde naam voor - maar veel
   strenger dan de familiezoeker van de vergelijker, want hier staan de
   productnamen die de tabel niet kent gewoon in de invoer. Over de hele
   catalogus gemeten wees een ruime regel (twee fouten, zoals besteSuggestie())
   bij 87 van de 733 onherkende artikelen een verkeerd type aan: Highbay
   Horizon werd "Orion", Straatverlichting Area "Arda", Rondisc "Rondix". Dus:
   - alleen woorden uit de naam, niet uit de specificatie erachter;
   - minstens vijf letters, en dezelfde eerste letter;
   - precies één tikfout (een verwisseling telt als één, zie bewerkAfstand());
   - precies één woord uit de tabel op die afstand, anders is het gokken;
   - en de verbeterde naam moet wél een groep opleveren.
   Zonder zoeken.js geeft ze niets. */
function armSuggestie(txt){
  if(typeof bewerkAfstand!=='function' || !String(txt||'').trim() || matchArmGroep(txt)) return null;
  const toks = armTokens(armSchoon(txt));
  let zone = armNaamZone(txt);
  if(!zone){
    /* geen soortwoord vooraan ("Pnto 15W zwart"): de naam loopt tot de specificatie */
    zone = [];
    for(const t of toks){
      if(ARM_GETAL.test(t) || ARM_CODE.test(t) || (ARM_STOPWOORDEN.has(t) && !ARM_TUSSENWOORDEN.has(t))) break;
      zone.push(t);
    }
  }
  for(const w of new Set(zone)){
    if(w.length < 5 || /\d/.test(w) || ARM_NAAMWOORDEN.has(w) || ARM_STOPWOORDEN.has(w) ||
       ARM_TYPEWOORDEN.has(w) || ARM_TUSSENWOORDEN.has(w)) continue;
    const kandidaten = [...ARM_VOCAB].filter(t=>
      t[0]===w[0] && !/\d/.test(t) && bewerkAfstand(w, t, 1) <= 1);
    if(kandidaten.length !== 1) continue;
    const goed = ARM_SCHRIJFWIJZE.get(kandidaten[0]) || kandidaten[0];
    const tekst = String(txt).replace(/[\p{L}\p{N}]+/gu, x=>armTokens(x).join('')===w ? goed : x);
    const groep = matchArmGroep(tekst);
    if(groep) return {woord:w, suggestie:goed, tekst, groep};
  }
  return null;
}
/* Series met meer dan één presenter, waar de naam niet altijd zegt welke bedoeld
   is. "Mondial 6-19,5W facet wit" kan de gewone inbouw zijn, maar ook de
   opbouw- of pendeluitvoering - die hebben samen één eigen presenter (ag25) - of
   de PIR-, nood- of trackversie. De herkenning kiest de gewone, en in het
   armaturenboek wordt het label dan een keuzelijst met de rest. De eerste is de
   gewone; de volgorde is die van hoe vaak ze bedoeld worden. */
const ARM_SERIES = [
  {serie:'Mondial', keuzes:[
    ['ag21', 'Mondial'],
    ['ag25', 'Mondial Opbouw / Pendel'],
    ['ag15', 'Mondial PIR'],
    ['ag24', 'Mondial Nood'],
    ['ag26', 'Mondial Track'],
  ]},
];
/* De keuzes voor de serie waar deze groep bij hoort, of null als hij alleen staat. */
function armSerieKeuze(id){
  const s = ARM_SERIES.find(x=>x.keuzes.some(k=>k[0]===id));
  return s ? {serie:s.serie, keuzes:s.keuzes.map(([id, label])=>({id, label}))} : null;
}
/* Blijft een gekozen presenter staan als de naam verandert? Alleen een keuze
   binnen een serie kan vervallen, en alleen als de nieuwe naam zelf een ander
   type aanwijst dan de oude: wie "Mondial" vervangt door "Punto" of door
   "Mondial PIR" zegt daarmee wat hij bedoelt, maar wie alleen het wattage of de
   kleur aanpast wil zijn opbouwkeuze houden. Een keuze buiten een serie blijft
   altijd staan - daar heeft iemand bewust iets gekozen. */
function armKeuzeBlijft(gekozenId, oudeNaam, nieuweNaam){
  if(!armSerieKeuze(gekozenId)) return true;
  const voor = matchArmGroep(oudeNaam), na = matchArmGroep(nieuweNaam);
  return (voor ? voor.id : null) === (na ? na.id : null);
}
