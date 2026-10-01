/* De introductiepagina direct achter het voorblad: de briefing - "De vraag" in het
   grijze vlak, "Wat wij bieden" en "Wij leveren" - met daaronder de contactpersonen.

   Het armaturenboek en de railtool zetten deze pagina allebei in hun PDF, en ze hoort
   in beide precies dezelfde te zijn. De railtool had eerst alleen de contactpersonen,
   omdat de briefing in armaturenboek.html zelf stond. Hier staat alles wat de pagina
   maakt - de maten, de tekst, de keuze in het paneel en de tekening - zodat de twee
   niet uit elkaar kunnen groeien. Contactgegevens en "Onze specialist" zelf staan in
   contactpersonen.js.

   De functies krijgen de staat van de tool mee (keuze): proj, datum, soort, de vier
   bronnen (bestek, tekeningen, armaturenboek, email) en de drie contactpersonen.

   Een gewoon <script src>, geen module; functies op het hoogste niveau, zodat
   tools/controleer-logica.mjs ze kan uitsnijden. Laden na pdf-huisstijl.js en
   contactpersonen.js. */

/* ======================= de maten en de tekst ======================= */

/* Maten uit het aangeleverde ontwerp (docs/ontwerp/AB Briefing vergelijking.pdf), gemeten in plaats
   van geschat; y telt vanaf de bovenkant van de pagina, net als in pdf-huisstijl.js.
   De regelafstand is 10,3 pt en een witregel tussen twee alinea's is er precies een
   in dezelfde maat - vandaar dat naAlinea gelijk is aan regel. */
const BRIEF = {
  kopX:37, kopY:96.1, kopPt:12,
  blok:{x:35, y:122, b:525, h:122},
  tekstIn:27,            /* tekst begint 27 pt binnen de linkerrand van het blok */
  blokBreedte:478, blokRegel:13,
  vraagTop:19.8,         /* "De vraag:" t.o.v. de bovenkant van het blok */
  naVraag:25.7, blokOnder:42,
  /* Het aanhalingsteken linksboven zit op (+20,6, +9) vanaf de blokhoek; die
     rechtsonder even ver van de rechter- en onderrand. */
  quoteInX:20.6, quoteInY:9, quoteUitX:43, quoteUitY:36,
  quoteH:25.5, quoteBoven:10.9, quoteOnderL:-10.5, quoteOnderR:6.1, quoteGat:21.8,
  x:38, breedte:507, pt:8.5, disclaimerPt:8,
  bulletX:56.3, bulletTekstX:74.7, bulletBreedte:470,
  /* Elke afstand is die tot de BOVENKANT van de vorige regel, precies zoals in het
     ontwerp gemeten - zo staan de getallen er rechtstreeks in en hoeft er nergens
     iets bij of af geteld te worden. */
  gaten:{
    regel:10.3,          /* volgende regel binnen dezelfde alinea */
    naBlok:17.2,         /* onderkant grijs blok -> "Wat wij bieden:" */
    naKop:25.7,          /* een kop -> de eerste regel eronder */
    naWit:20.7,          /* witregel tussen twee alinea's */
    naLeveren:11.9,      /* "Wij leveren:" -> de eerste opsommingsregel */
    naDisclaimer:9.7,    /* "DISCLAIMER:" -> de eerste regel eronder */
  },
};

function briefRegels(tekst){
  return String(tekst||'').split(/\r?\n/).map(r=>r.trim()).filter(Boolean);
}
/* Meer namen in een veld worden een opsomming: "a", "a en b", "a, b en c". */
function briefOpsomming(lijst){
  if(lijst.length<=1) return lijst[0]||'';
  return lijst.slice(0,-1).join(', ')+' en '+lijst[lijst.length-1];
}

/* De bronnen van de briefing: waar de vraag op steunt. Ze zijn alle vier optioneel -
   alleen wat is ingevuld komt in de tekst, en de zinnen voegen zich daarnaar. Een leeg
   veld gaf vroeger de plaatshouder uit het ontwerp ("[Bestek]"), ook bij een opdracht
   zonder bestek; nu laat je het gewoon leeg.
     ev/mv  hoe de bron in de lopende tekst heet, bij één naam en bij meer. Bestek en
            armaturenboek heten allebei "het document": de namen zeggen het zelf al
            ("Bestek E-installaties ...", "Armaturenboek Hoofdstraat 12"), en zo worden
            ze samen "de documenten ... en ...".
     aanhalen  het onderwerp van een e-mail staat tussen aanhalingstekens. */
const BRIEF_VELDEN = [
  {id:'bestek',        label:'Bestek',                 ev:'het document', mv:'de documenten'},
  {id:'tekeningen',    label:'Technische tekeningen',  ev:'de tekening',  mv:'de tekeningen'},
  {id:'armaturenboek', label:'Armaturenboek',          ev:'het document', mv:'de documenten'},
  {id:'email',         label:'E-mail',                 ev:'de e-mail met als onderwerp', mv:'de e-mails met als onderwerp',
   aanhalen:true},
];

/* Wat er op de briefingpagina nog leeg is. De bronnen mogen leeg blijven (dan komen
   ze er niet in); alleen de projectnaam heeft nog een plaatshouder. */
function briefingOpenVelden(keuze){
  return (keuze.proj||'').trim() ? [] : ['projectnaam'];
}
/* Wat de tool zegt als er op de pagina nog een plaatshouder komt, zoals Lichtplan.waarschuwing()
   en .exportMelding(): kort in het overzicht, en in de lijst die je vóór het maken van
   de PDF bewust leest. Leeg als er niets openstaat. */
function briefingWaarschuwing(keuze){
  const open = briefingOpenVelden(keuze);
  return open.length ? 'Briefingpagina: '+open.join(', ')+' nog niet ingevuld — daar komt nu de '
    +'plaatshouder uit het ontwerp te staan.' : '';
}
function briefingExportMelding(keuze){
  const open = briefingOpenVelden(keuze);
  return open.length ? 'Op de briefingpagina is nog niet ingevuld: '+open.join(', ')+'.\n'
    + 'Daar komt nu de plaatshouder uit het ontwerp te staan ([projectnaam]).' : '';
}
/* De ingevulde namen van een bron, met aanhalingstekens waar dat hoort. */
function briefNamen(keuze, v){
  return briefRegels(keuze[v.id]).map(n=> v.aanhalen ? '“'+n+'”' : n);
}
/* De ingevulde bronnen uit ids, gegroepeerd op hoe ze heten: bestek en armaturenboek
   vallen samen onder "de documenten". Elke groep: {noemer, namen}. */
function briefGroepen(keuze, ids){
  const groepen=[];
  BRIEF_VELDEN.filter(v=> ids.indexOf(v.id)>=0).forEach(v=>{
    const namen = briefNamen(keuze, v);
    if(!namen.length) return;
    let g = groepen.find(x=> x.ev===v.ev);
    if(!g){ g = {ev:v.ev, mv:v.mv, namen:[]}; groepen.push(g); }
    g.namen = g.namen.concat(namen);
  });
  groepen.forEach(g=>{ g.noemer = g.namen.length>1 ? g.mv : g.ev; });
  return groepen;
}
/* De bronnen als lopende tekst: "het document **X** en de e-mail met als onderwerp
   **“Y”**" - de noemer gewoon, de namen vet. Leeg als er niets is ingevuld. */
function briefBronnen(keuze, ids){
  const groepen = briefGroepen(keuze, ids), uit=[];
  groepen.forEach((g,i)=>{
    if(i) uit.push({t: i===groepen.length-1 ? ' en ' : ', '});
    uit.push({t:g.noemer+' '}, {t:briefOpsomming(g.namen), v:true});
  });
  return uit;
}
/* De slotzin van "De vraag" en de regel eronder. Met één soort bron blijft het zoals
   in het ontwerp: "... zoals vastgelegd in het document:" en de naam vet op de regel
   eronder. Met meer soorten staat de hele opsomming op die regel. Zonder bron geen
   slotzin. */
function briefVraagSlot(keuze, ids){
  const groepen = briefGroepen(keuze, ids);
  if(!groepen.length) return {zin:[], slot:[]};
  const inleiding = ' Dit plan dient gebaseerd te zijn op de uitgangspunten zoals vastgelegd in';
  if(groepen.length===1)
    return {zin:[{t:inleiding+' '+groepen[0].noemer+':'}], slot:[{t:briefOpsomming(groepen[0].namen), v:true}]};
  return {zin:[{t:inleiding+':'}], slot:briefBronnen(keuze, ids)};
}

/* De inhoud van de briefingpagina per soort opdracht; de opmaak is voor beide
   dezelfde. Elk blok noemt zelf de afstand tot de vorige regel (zie BRIEF.gaten).
   Welke bronnen er staan, bepaalt de zinnen:
     lichtberekening  de tekening is de basis van het ontwerp ("Op basis van de
                      tekening: ..."), de andere bronnen zijn de uitgangspunten;
     vergelijking     alle bronnen samen zijn de basis van de propositie, en het
                      armaturenboek is waar de armaturen van kunnen afwijken. */
function briefInhoud(keuze){
  /* een project van vóór de soort opdracht kent hem niet: dan, zoals in het paneel, een lichtberekening */
  const soort = keuze.soort === 'vergelijking' ? 'vergelijking' : 'lichtberekening';
  const naam = (keuze.proj||'').trim() || '[projectnaam]';
  const heeft = id => briefRegels(keuze[id]).length > 0;

  if(soort === 'lichtberekening'){
    const uitgangspunten = ['bestek','armaturenboek','email'];
    const vraag = briefVraagSlot(keuze, uitgangspunten);
    const basis = briefBronnen(keuze, uitgangspunten);
    const blokken = [{k:'kop', t:'Wat wij bieden:', voor:'naBlok'}];
    const norm = basis.length
      ? [{t:' Dit concept is uitgewerkt volgens de uitgangspunten zoals omschreven in '}].concat(basis,
         [{t:', en voldoet aan de actuele norm NEN-EN 12464-1:2021.'}])
      : [{t:' Dit concept voldoet aan de actuele norm NEN-EN 12464-1:2021.'}];
    if(heeft('tekeningen')){
      const g = briefGroepen(keuze, ['tekeningen'])[0];
      blokken.push(
        {k:'plat',   t:'Op basis van '+g.noemer+':', voor:'naKop'},
        {k:'alinea', voor:'regel', s:[{t:briefOpsomming(g.namen), v:true}]},
        {k:'alinea', voor:'regel', s:[{t:'ontwikkelen wij een lichtconcept dat aansluit op het gevraagde lichtplan.'}].concat(norm)});
    } else {
      blokken.push({k:'alinea', voor:'naKop',
        s:[{t:'Wij ontwikkelen een lichtconcept dat aansluit op het gevraagde lichtplan.'}].concat(norm)});
    }
    blokken.push(
      {k:'plat',   t:'Wij leveren:', voor:'naWit'},
      {k:'bullets', voor:'naLeveren', items:[
        'Een voorstel met verschillende armaturen, afgestemd op de diverse toepassingen',
        'Een lichtontwerp dat voldoet aan de lichtbehoeften zoals beschreven in de uitgangspunten',
        'Ondersteuning van dit voorstel met lichtberekeningen en een gedetailleerde armaturenlijst']});
    return {
      vraag:[{t:'Het opstellen van een lichtplan voor '}, {t:naam+'.', v:true}].concat(vraag.zin),
      vraagSlot:vraag.slot,
      blokken,
    };
  }

  /* vergelijking */
  const alles = BRIEF_VELDEN.map(v=>v.id);
  const vraag = briefVraagSlot(keuze, alles);
  const basis = briefBronnen(keuze, alles);
  const boek = briefBronnen(keuze, ['armaturenboek']);
  return {
    vraag:[{t:'Het opstellen van een verlichtingsarmaturen/offerte voor '}, {t:naam+'.', v:true}].concat(vraag.zin),
    vraagSlot:vraag.slot,
    blokken:[
      {k:'kop',    t:'Wat wij bieden:', voor:'naBlok'},
      {k:'alinea', voor:'naKop', s: basis.length
        ? [{t:'Op basis van '}].concat(basis, [{t:' maken wij een armaturenpropositie die aansluit op de gevraagde offerte.'}])
        : [{t:'Wij maken een armaturenpropositie die aansluit op de gevraagde offerte.'}]},
      {k:'plat',   t:'Wij leveren:', voor:'naWit'},
      {k:'bullets', voor:'naLeveren', items:['Een voorstel met verschillende armaturen.']},
      {k:'kopklein', t:'DISCLAIMER:', voor:'naWit'},
      {k:'alinea', voor:'naDisclaimer', s:[].concat(
        basis.length
          ? [{t:'Deze propositie is gebaseerd op de informatie zoals opgenomen in '}].concat(basis, [{t:'.'}])
          : [{t:'Deze propositie is gebaseerd op de aangeleverde informatie.'}],
        boek.length
          ? [{t:' Houd er rekening mee dat specificaties van armaturen kunnen afwijken van de armaturen in '}].concat(boek,
             [{t:' of van de laatst geldende technische gegevens.'}])
          : [{t:' Houd er rekening mee dat specificaties van armaturen kunnen afwijken van de gevraagde armaturen '
              +'of van de laatst geldende technische gegevens.'}],
        [{t:' Er is geen lichtberekening uitgevoerd ter '
          +'controle van de gewenste verlichtingsniveaus. Wij zijn niet verantwoordelijk voor de gemaakte '
          +'keuzes op basis van deze vergelijking, noch voor de gevolgen van de aanbieding richting de '
          +'opdrachtgever. De verantwoordelijkheid voor de uiteindelijke selectie en toepassing van '
          +'armaturen ligt bij de klant.'}])},
    ],
  };
}

/* ======================= de keuze in het paneel ======================= */

/* Wat er als voorbeeld in een leeg bronveld staat. */
const BRIEF_PLAATS = {
  bestek:'bijv. Bestek E-installaties 2024-11-03',
  tekeningen:'bijv. Tekening E-01 t/m E-04',
  armaturenboek:'bijv. Armaturenboek Hoofdstraat 12',
  email:'onderwerp van de e-mail, bijv. Aanvraag verlichting kantoor',
};

/* De soort opdracht en de vier bronnen in `vak`, die `keuze` lezen en schrijven;
   opWijziging() na elke wijziging. De bronnen staan er bij beide soorten opdracht; wat
   je invult komt op de pagina, wat leeg blijft niet. Het vak wordt eerst leeggemaakt:
   "Project opslaan" bakt de HTML mee zoals hij op dat moment in het scherm staat, dus
   in een opgeslagen bestand staan deze velden er al - zonder leegmaken kwamen ze er bij
   het heropenen een tweede keer bij, en de eerste, nog lege, zou dan degene zijn die
   getElementById() vindt. Opnieuw aanroepen (na het terughalen van een project) zet
   alles op wat er in keuze staat. */
function briefingKeuze(vak, keuze, opWijziging, idVoorvoegsel){
  const vv = idVoorvoegsel || 'brief_';
  vak.textContent = '';
  const soorten = document.createElement('div');
  soorten.className = 'brief-soort';
  [['lichtberekening','Lichtberekening'], ['vergelijking','Vergelijking']].forEach(([waarde, tekst])=>{
    const label = document.createElement('label');
    const knop = document.createElement('input');
    knop.type = 'radio'; knop.name = vv+'soort'; knop.value = waarde; knop.id = vv+'soort_'+waarde;
    knop.checked = (keuze.soort === 'vergelijking') === (waarde === 'vergelijking');
    knop.addEventListener('change', ()=>{
      if(knop.checked){ keuze.soort = waarde; if(opWijziging) opWijziging(); }
    });
    const naam = document.createElement('span'); naam.textContent = tekst;
    label.appendChild(knop); label.appendChild(naam);
    soorten.appendChild(label);
  });
  vak.appendChild(soorten);
  BRIEF_VELDEN.forEach(v=>{
    const blok = document.createElement('div');
    blok.className = 'brief-veld';
    const label = document.createElement('label');
    const ta = document.createElement('textarea');
    ta.className = 'brief-tekst'; ta.id = vv+v.id;
    label.textContent = v.label; label.htmlFor = ta.id;
    ta.placeholder = BRIEF_PLAATS[v.id] || '';
    ta.value = keuze[v.id] || '';
    ta.addEventListener('input', ()=>{ keuze[v.id] = ta.value; if(opWijziging) opWijziging(); });
    blok.appendChild(label); blok.appendChild(ta);
    vak.appendChild(blok);
  });
}

/* De regel in de kop van het dichtgeklapte blok: de gekozen soort, welke bronnen er op
   de pagina komen en de projectuitwerker. Anders moet je het openklappen om dat te zien. */
function briefingStand(keuze){
  const bronnen = BRIEF_VELDEN.filter(v=> briefRegels(keuze[v.id]).length).map(v=> v.label.toLowerCase());
  const pu = medewerkerVan('projectuitwerker', keuze.projectuitwerker);
  return '— '
    + (keuze.soort === 'vergelijking' ? 'Vergelijking' : 'Lichtberekening')
    + (bronnen.length ? ', ' + bronnen.join(' + ') : ', geen bronnen')
    + (pu ? ', ' + pu.naam.split(' ')[0] : '');
}

/* ======================= de tekening ======================= */

/* Tekent de hele introductiepagina, direct achter het voorblad: de kop "Introductie",
   de briefing en de contactpersonen. Natekening van het aangeleverde ontwerp; zie de
   BRIEF-tabel voor de maten en briefInhoud() voor de tekst. De blauwe kopbalk en de
   schuine grijze voet komen uit pdf-huisstijl.js, zodat de pagina bij de rest van het
   boek hoort. HS is de tekenlaag; plek.haal()/plek.zet() lezen en zetten de y van de
   tool (need() in de tekenlaag kijkt naar diezelfde y).

   metBriefing false: alleen de contactpersonen, bovenaan de pagina waar anders
   "Briefing" staat - de railtool zonder briefing. De sectienaam blijft daarna
   "Introductie"; een tool die verder gaat met een andere zet die zelf terug. */
async function tekenIntroductie(HS, keuze, plek, metBriefing){
  const {C, text, meet, rect, circle, poly, need, flush, beginPage, paginaKop, zetSectie} = HS;
  const B = BRIEF, G = B.gaten;
  let y = plek.haal();
  const zet = (v)=>{ y = v; plek.zet(v); };

  /* Woorden met hun vet-vlag; een woord dat zonder spatie op het vorige volgt (de
     punt achter een vetgedrukte projectnaam) blijft eraan vastzitten. */
  function briefWoorden(segmenten){
    const uit=[]; let naSpatie=true;
    segmenten.forEach(seg=>{
      String(seg.t).split(/(\s+)/).forEach(deel=>{
        if(deel==='') return;
        if(/^\s+$/.test(deel)){ naSpatie=true; return; }
        const plak = !naSpatie && uit.length>0;
        if(plak) uit[uit.length-1].push({t:deel, v:!!seg.v});
        else uit.push([{t:deel, v:!!seg.v}]);
        naSpatie=false;
      });
    });
    return uit;
  }
  function briefBreedte(groep, pt){
    return groep.reduce((b,d)=> b + meet(d.t, pt, {bold:d.v}), 0);
  }
  /* Breekt af op echte tekstbreedte, dwars door de vet/niet-vet-grenzen heen. */
  function rijkeRegels(segmenten, maxB, pt){
    const spatie = meet(' ', pt, {});
    const regels=[]; let regel=[], breed=0;
    briefWoorden(segmenten).forEach(groep=>{
      const gb = briefBreedte(groep, pt);
      if(regel.length && breed + spatie + gb > maxB){ regels.push(regel); regel=[]; breed=0; }
      if(regel.length) breed += spatie;
      regel.push(groep); breed += gb;
    });
    if(regel.length) regels.push(regel);
    return regels.length ? regels : [[]];
  }
  function tekenRegel(regel, x, yy, pt){
    const spatie = meet(' ', pt, {});
    let cx = x;
    regel.forEach((groep, i)=>{
      if(i) cx += spatie;
      groep.forEach(deel=>{ cx += text(cx, yy, pt, deel.t, {bold:deel.v, color:C.tekst}); });
    });
  }
  /* Twee schuine balken, breder aan de onderkant - het aanhalingsteken uit het
     ontwerp. x/y is de linkerbovenhoek van de eerste balk. */
  function aanhalingsteken(x, yy){
    [0, B.quoteGat].forEach(dx=>{
      poly([[x+dx, yy], [x+dx+B.quoteBoven, yy],
            [x+dx+B.quoteOnderR, yy+B.quoteH], [x+dx+B.quoteOnderL, yy+B.quoteH]], C.wit);
    });
  }

  const proj = (keuze.proj||'').trim();
  zetSectie('Introductie');
  beginPage(true);
  paginaKop('Introductie', proj + (proj ? '  —  ' : '') + PdfHuisstijl.datumNL(keuze.datum));

  if(!metBriefing){
    zet(CONTACT.boven);
    await tekenContactpersonen(HS, keuze, plek, 0);
    flush();
    return;
  }

  const inhoud = briefInhoud(keuze);
  /* Poppins (cond), zoals in het ontwerp - en zoals de koppen eronder */
  text(B.kopX, B.kopY, B.kopPt, 'Briefing', {bold:true, cond:true, color:C.hoofd});

  /* Eerst opmeten: staan er meer documentnamen, dan groeit het grijze vlak mee. */
  const blokRegels = rijkeRegels(inhoud.vraag, B.blokBreedte, B.pt)
    .concat(inhoud.vraagSlot.length ? rijkeRegels(inhoud.vraagSlot, B.blokBreedte, B.pt) : []);
  const blokH = Math.max(B.blok.h,
    B.vraagTop + B.naVraag + (blokRegels.length-1)*B.blokRegel + B.pt + B.blokOnder);

  rect(B.blok.x, B.blok.y, B.blok.b, blokH, C.voet);
  aanhalingsteken(B.blok.x + B.quoteInX, B.blok.y + B.quoteInY);
  aanhalingsteken(B.blok.x + B.blok.b - B.quoteUitX, B.blok.y + blokH - B.quoteUitY);

  const blokX = B.blok.x + B.tekstIn;
  text(blokX, B.blok.y + B.vraagTop, B.pt, 'De vraag:', {bold:true, color:C.tekst});
  blokRegels.forEach((r,i)=>
    tekenRegel(r, blokX, B.blok.y + B.vraagTop + B.naVraag + i*B.blokRegel, B.pt));

  /* --- alles onder het blok ---
     y wijst steeds naar de bovenkant van de laatst getekende regel; naar() zet hem
     op de volgende plek. De onderrand van het blok geldt als "vorige regel", zodat
     ook de eerste afstand gewoon uit BRIEF.gaten komt. */
  zet(B.blok.y + blokH);
  const naar = (gat)=>{ zet(y + G[gat]); need(G.regel); y = plek.haal(); };
  const schrijf = (segmenten, x, breedte, pt)=>{
    rijkeRegels(segmenten, breedte, pt||B.pt).forEach((r,i)=>{
      if(i){ zet(y + G.regel); need(G.regel); y = plek.haal(); }
      tekenRegel(r, x, y, pt||B.pt);
    });
  };

  inhoud.blokken.forEach(blok=>{
    if(blok.k==='kop'){       naar(blok.voor); text(B.x, y, B.pt, blok.t, {bold:true, color:C.tekst}); }
    else if(blok.k==='kopklein'){ naar(blok.voor); text(B.x, y, B.disclaimerPt, blok.t, {bold:true, color:C.tekst}); }
    else if(blok.k==='plat'){ naar(blok.voor); text(B.x, y, B.pt, blok.t, {color:C.tekst}); }
    else if(blok.k==='alinea'){ naar(blok.voor); schrijf(blok.s, B.x, B.breedte); }
    else if(blok.k==='bullets'){
      blok.items.forEach((it,i)=>{
        naar(i ? 'regel' : blok.voor);
        /* De opsommingsstip als vorm: pdfTxt() kent het bullet-teken niet en zou er
           een vraagteken van maken. Een stip tekenen scheelt een uitbreiding van de
           gedeelde tekstlaag voor dit ene teken. */
        circle(B.bulletX + 2.2, y + B.pt*0.45, 1.5, C.tekst);
        schrijf([{t:it}], B.bulletTekstX, B.bulletBreedte);
      });
    }
  });

  /* --- Contactgegevens en Onze specialist: tekenContactpersonen() in contactpersonen.js --- */
  await tekenContactpersonen(HS, keuze, plek, CONTACT.kopGat);
  flush();
}

/* De opmaak van de keuze in het paneel, één keer, zodat hij in beide tools gelijk is:
   het blok dat dichtklapt (de regel in de kop zegt wat erin staat), de soort opdracht
   als twee knoppen en de vier bronvelden. */
(function(){
  if(typeof document==='undefined' || document.getElementById('briefing-stijl')) return;
  const st=document.createElement('style'); st.id='briefing-stijl';
  st.textContent = `
  .brief-vouw > summary{
    cursor:pointer; list-style:none; display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;
    font-size:13px; font-weight:800; color:var(--navy-900); margin-bottom:2px;
  }
  .brief-vouw > summary::-webkit-details-marker{display:none;}
  .brief-vouw > summary::before{content:'\\25B8'; color:var(--blue); font-size:11px; transition:transform .15s;}
  .brief-vouw[open] > summary::before{transform:rotate(90deg);}
  .brief-vouw > summary:hover{color:var(--blue-dark);}
  .brief-vouw > summary .stand{font-weight:600; font-size:11.5px; color:var(--slate);}
  .brief-vouw:not([open]) > summary{margin-bottom:0;}
  .brief-soort{display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;}
  .brief-soort label{
    display:flex; align-items:center; gap:7px; cursor:pointer;
    border:1.5px solid var(--border); border-radius:8px; padding:7px 12px;
    font-size:12.5px; font-weight:700; color:var(--ink); background:#fff; transition:.12s;
  }
  .brief-soort label:hover{border-color:var(--blue);}
  .brief-soort input{accent-color:var(--blue); margin:0;}
  .brief-soort input:checked + span{color:var(--blue-dark);}
  .brief-soort label:has(input:checked){border-color:var(--blue); background:var(--blue-light);}
  .brief-veld{margin-top:12px;}
  .brief-veld > label{display:block; font-size:12.5px; font-weight:700; color:var(--ink); margin-bottom:3px;}
  .brief-tekst{
    border:1.5px solid var(--border); border-radius:8px; padding:7px 10px; width:100%;
    font-family:'Nunito Sans',sans-serif; font-size:12.5px; color:var(--ink); background:#fff;
    resize:vertical; min-height:58px;
  }
  .brief-tekst:focus{outline:none; border-color:var(--blue);}
  `;
  document.head.appendChild(st);
})();
