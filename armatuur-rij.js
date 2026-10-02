/* Eén armatuurregel en het boek dat eruit volgt, zoals het armaturenboek
   (armaturenboek.html) en de railtool (index.html) hem allebei tonen.

   Die twee tools maken hetzelfde armaturenboek: per regel een armatuur, daaruit
   een presenter per type, een armaturenlijst en een gestempelde code op elke
   presenter. Ze deden dat elk op hun eigen manier, en waren uit elkaar gegroeid:
   de railtool had geen uploadknop voor een onherkend type, geen keuze tussen de
   Mondial-presenters, één stempelstijl op een andere plek, een armaturenlijst per
   type in plaats van in de volgorde van de regels, en geen pijltjes om een regel
   te verplaatsen. Alles wat voor beide hetzelfde hoort te zijn staat daarom hier;
   wat de tools zelf houden is hun eigen staat (de railtool kent een DALI-code
   naast de gewone) en hun eigen verversing (refresh() tegenover updateSummary()).

   Een gewoon <script src>, geen module: modules laden niet vanaf schijf. De
   functies staan op het hoogste niveau, net als in armatuur-groepen.js, zodat
   tools/controleer-logica.mjs ze kan uitsnijden. Laden na pdf-huisstijl.js,
   armatuur-groepen.js, zoeken.js en melding.js; die gebruikt het pas bij een
   aanroep, niet bij het inladen. */

/* ======================= presenter per regel ======================= */

/* De eigen PDF van een regel hangt aan het slot, niet aan het type: elke upload
   is een eenmalig armatuur, dus krijgt hij een eigen id per slot. */
function specialPresenterId(armId){ return 'sp'+armId; }

/* Telt een regel mee in het boek? Zodra er iets in staat - een code, een naam, een
   artikelcode (gewoon of DALI) of een aantal. Een regel zonder aantal hoort dus ook in
   de armaturenlijst en krijgt zijn presenter: vaak is het aantal nog niet bekend als
   het boek al de deur uit moet. De railtool eiste een aantal en liet zonder aantal de
   hele lijst weg, ook met het vinkje aan; het armaturenboek deed het zo. Spaties
   alleen tellen niet. */
function armSlotLeeg(s){
  if(!s) return true;
  const vol = v => String(v||'').trim() !== '';
  return !vol(s.aanduiding) && !vol(s.name) && !vol(s.code) && !vol(s.codeDali) && !((s.qty||0) > 0)
      && !armAccessoires(s).length;
}

/* De accessoires van een armatuurregel - een opbouwset bij een Mondial Opbouw, een
   pendelset: een eigen artikelcode en naam, maar geen eigen CODE en geen presenter.
   Ze horen bij de CODE van hun armatuur en staan in de armaturenlijst direct eronder.
   s.accessoires = [{code, name, qty}]; alleen wat ingevuld is telt mee. */
function armAccessoires(s){
  const vol = v => String(v||'').trim() !== '';
  return ((s && s.accessoires) || []).filter(a => a && (vol(a.code) || vol(a.name)));
}

/* Welke presenter bij een regel hoort. Een zelf geüploade PDF wint altijd, op
   elke regel - niet alleen op een regel met "special" in het artikelcodeveld.
   Uploaden is een bewuste handeling; wie dat doet wil die PDF in het boek, ook
   als de naam toevallig een type raakt. Weg ermee kan met het kruisje naast de
   knop. Zonder eigen PDF is het de gewone herkenning: een handmatig gekozen type
   (s.groep; '-' is bewust geen presenter), en anders matchArmGroep() op de naam.
   Dat geldt ook voor een Special-regel, zodat een Special met een herkenbare naam
   gewoon die presenter krijgt tot er een eigen PDF is. `special` geeft de tool
   mee, want welk codeveld telt verschilt: de railtool kijkt in DALI-stand naar
   de DALI-code. */
function armGroepVanRij(s, armId, special){
  if(!s) return null;
  if(armId){
    const id = specialPresenterId(armId);
    if(PdfHuisstijl.presenterAanwezig(id)){
      return {id, naam:(s.name&&s.name.trim()) || ('Special '+armId.replace('arm','')), zoektermen:[], special:true};
    }
  }
  if(special) return matchArmGroep(s.name);
  if(s.groep==='-') return null;
  if(s.groep) return ARM_GROEPEN.find(g=>g.id===s.groep) || null;
  return matchArmGroep(s.name);
}

/* Kan de tool zelf geen presenter aanwijzen? Dan krijgt de regel een uploadknop.
   De eigen PDF telt hier bewust niet mee: anders zou de knop verdwijnen zodra je
   hem gebruikt hebt, en kon je de upload niet meer vervangen. `naam` is wat er nu
   in het veld staat, niet wat al is vastgelegd. */
function armTypeOnbekend(s, naam, special){
  if(special) return true;
  if(s.groep==='-') return false;
  if(s.groep) return !ARM_GROEPEN.find(g=>g.id===s.groep);
  return !matchArmGroep(naam);
}

/* Alle geüploade PDF's, van elke regel, zodat ze meegaan in "Project opslaan". */
function armEigenPresenters(slotIds){
  const out={};
  slotIds.forEach(id=>{
    const pid=specialPresenterId(id);
    const data=window.PRESENTER_DATA && window.PRESENTER_DATA[pid];
    if(data) out[pid]=data;
  });
  return out;
}

/* Verwissel de INHOUD van twee regels, niet de slots zelf: arm01..armNN blijven op
   volgorde staan. Dat scheelt: de labels ("Armatuur 3"), het opslaan en het
   herstellen (dat op slotnummer sorteert) hoeven er niets van te weten. Een
   geüploade presenter hangt wel aan het slot (sp<armId>), dus die moet met de hand
   mee - anders raakt een verplaatste regel zijn PDF kwijt. */
function armWisselRijen(armaturen, idA, idB){
  const bewaar = armaturen[idA];
  armaturen[idA] = armaturen[idB];
  armaturen[idB] = bewaar;
  const D = window.PRESENTER_DATA = window.PRESENTER_DATA || {};
  const pa = specialPresenterId(idA), pb = specialPresenterId(idB);
  const da = D[pa], db = D[pb];
  if(db === undefined) delete D[pa]; else D[pa] = db;
  if(da === undefined) delete D[pb]; else D[pb] = da;
}

/* ======================= de stempel ======================= */

/* Twee stempelstijlen, per armatuurregel te kiezen:
     'wit'    de stempel van de Pragmalux-presenters: in de donkere kopbalk, in de
              kleur van de groep (wit, tenzij de groep een eigen stempelKleur heeft).
     'zwart'  zwart en hoger, voor een pagina waar de kop licht is of de indeling
              onbekend, zodat hij niet over het merk of het logo valt.
   Wit is de standaard, behalve op een special (een geüploade PDF): die komt meestal
   uit de DLC-tool, en daar valt de stempel onder de dunne zwarte balk op wit papier
   - een witte stempel was daar onzichtbaar. Een special is dus standaard zwart; wie
   zelf op wit zet (een eigen PDF met een hoge donkere kop) houdt wit. `special` is
   of de regel een eigen PDF heeft (armGroepVanRij() geeft dan special:true). */
const STEMPELSTIJLEN = [
  {id:'wit',   label:'Stempel wit'},
  {id:'zwart', label:'Stempel zwart'},
];
function stempelZwart(s, special){
  if(s && s.stempel) return s.stempel==='zwart';
  return !!special;
}

/* Per presenter in het boek: de codes die erop gestempeld worden, de kleur en de
   stijl. Meerdere regels mogen dezelfde code hebben en twee codes kunnen bij
   hetzelfde type horen - vandaar de unieke lijst, die onder elkaar komt te staan.
   De stempel staat op één pagina, dus er kan er maar één stijl gelden: vraagt een
   van de regels om zwart, dan wordt hij zwart - dat vraag je alleen als de kop van
   die pagina licht is, en dat is een eigenschap van de pagina zelf. */
function armBoekGroepen(boek){
  return boek.map(b=>({
    id: b.g.id,
    code: [...new Set(b.rijen.map(r=>(r.s.aanduiding||'').trim()).filter(Boolean))],
    kleur: b.g.stempelKleur || '#FFFFFF',
    zwart: b.rijen.some(r=>stempelZwart(r.s, b.g.special)),
    special: !!b.g.special,
  }));
}

/* De stempel op een special - een geüploade PDF, meestal een DLC-blad uit dlc.html.
   Gemeten op dat blad (pt, y van boven): de zwarte balk loopt over de hele breedte tot
   23,7; rechts hangt het schuine logovlak eraan, met zijn linkerrand van x 444,8 op
   y 24 tot 468,3 op y 57,4. Op de Pragmalux-plek (rechterrand 449,9, hoofdletters
   vanaf 27,7) liep de zwarte stempel met zijn laatste letter in dat vlak en stond hij
   4 pt onder de balk; een witte viel op wit papier.
   Hier: rechts uitgelijnd op x 435,85 - de lijn van het DLC-raster waar de goot
   tussen detail 4 en 5 begint (323,8 + (236,1 - 12) / 2) - dus 9 pt vóór de hoek van
   het logovlak en 17 pt ervan op de hoogte van de letters. De hoofdletters beginnen
   één goot (12 pt) onder de balk: 35,7. Gemeten in Poppins Bold 11 pt beginnen die
   0,47 pt onder `basislijn` (zoals stempelPresenter die gebruikt), vandaar 35,2.
   Een lange code loopt naar links, over het wit boven de titel; een derde regel
   eindigt rond y 72, de titel begint op 78. */
const STEMPEL_SPECIAL = {marge: 595.28 - 435.85, basislijn: 35.2};

/* Zet de codes rechtsboven op de eerste presenterpagina, zodat te zien is bij
   welke regel uit de armaturenlijst dit blad hoort.

   De basislijnen zijn op de afdruk beoordeeld. Eerst gemeten op 27 (het beste
   gemiddelde voor de bovenkant van het Pragmalux-logo; niet elke presenter-PDF
   heeft dat logo op exact dezelfde hoogte) en 47; daarna is de witte 3 mm naar
   beneden gegaan en de zwarte 7 mm naar boven - 1 mm is 72/25,4 pt, dus
   27 + 8,5 = 35,5 en 47 - 19,8 = 27,2.

   Veilige breedte: hoe ver een stempelregel maximaal naar links mag lopen vanaf
   de rechtermarge voordat hij een wit element (garantieblokje, Pragmalux-logo)
   zou kunnen raken - gemeten op meerdere presenter-PDF's (krapste geval 282 pt
   vrije ruimte). pdf-lib kan geen pixels van een bestaande pagina uitlezen, dus
   dit is een vuistregel: bij overschrijding krimpt het lettertype van die regel
   in plaats van dat de positie verschuift. `font` is een lettertype dat in het
   document van de pagina is ingesloten.

   Een special (special=true) krijgt een eigen plek, zie STEMPEL_SPECIAL: de plek
   hierboven is op de Pragmalux-bladen gemeten en valt op een DLC-blad in de kop. */
function stempelPresenter(pagina, codes, kleur, zwart, font, special){
  if(!pagina || !codes || !codes.length) return;
  const korps=11, regelhoogte=13;
  const marge = special ? STEMPEL_SPECIAL.marge : 32+113.4 /* +4cm naar links t.o.v. de rechtermarge */;
  const basislijn = special ? STEMPEL_SPECIAL.basislijn : zwart ? 27.2 : 35.5;
  const veiligeBreedte = 250, minKorps = 7;
  const {width, height} = pagina.getSize();
  const c = zwart
    ? PDFLib.rgb(0,0,0)
    : String(kleur||'').charAt(0)==='#'
      ? PDFLib.rgb(parseInt(kleur.substr(1,2),16)/255, parseInt(kleur.substr(3,2),16)/255, parseInt(kleur.substr(5,2),16)/255)
      : PDFLib.rgb(1,1,1);
  /* Meerdere codes voor hetzelfde armatuurtype komen onder elkaar te staan, elk
     apart rechts uitgelijnd, in plaats van samengevoegd op één regel. */
  codes.forEach((tekst, i)=>{
    let grootte = korps;
    let tw = font.widthOfTextAtSize(tekst, grootte);
    while(tw>veiligeBreedte && grootte>minKorps){
      grootte -= 0.5;
      tw = font.widthOfTextAtSize(tekst, grootte);
    }
    pagina.drawText(tekst, {x: width-marge-tw, y: height-basislijn-korps*0.78-i*regelhoogte,
      size: grootte, font, color: c});
  });
}

/* ======================= de armaturenlijst ======================= */

/* De kolommen van de armaturenlijst, voor de regels die erin komen (in de
   volgorde van de tool - niet gegroepeerd per type: wie de regels op volgorde van
   het bestek invult wil ze zo terugzien). Een kolom (Code of Aantal) valt helemaal
   weg als GEEN ENKELE regel er een waarde voor heeft - anders staat hij zinloos
   leeg of vol nullen; de vrijgekomen breedte gaat naar Omschrijving. `artikel` en
   `oms` geeft de tool, want welke code geldt verschilt (standaard of DALI). */
function armLijstKolommen(rijen, artikel, oms){
  const toonCode = rijen.some(r=> (r.s.aanduiding||'').trim());
  const toonAantal = rijen.some(r=> (r.s.qty||0)>0 || armAccessoires(r.s).some(a=> (a.qty||0)>0));
  let omschrijvingBreedte = 290;
  if(!toonCode) omschrijvingBreedte += 75;
  if(!toonAantal) omschrijvingBreedte += 60;
  const cols = [];
  if(toonCode) cols.push({w:75,h:'Code'});
  cols.push({w:90,h:'Artikelcode'});
  cols.push({w:omschrijvingBreedte,h:'Omschrijving'});
  if(toonAantal) cols.push({w:60,h:'Aantal'});
  const waarden = (r)=>{
    const basis=[];
    if(toonCode) basis.push((r.s.aanduiding||'').trim());
    basis.push(artikel(r), oms(r));
    if(toonAantal) basis.push(String(r.s.qty||0));
    return basis;
  };
  /* Een accessoire: geen eigen CODE (die van zijn armatuur staat erboven), zijn
     artikelcode - leeg als die niet is ingevuld, net als bij een armatuur - en zijn
     naam. Het aantal alleen als het is ingevuld: leeg is niet 0. */
  const accWaarden = (a)=>{
    const basis=[];
    if(toonCode) basis.push('');
    basis.push((a.code||'').trim(), (a.name||'').trim());
    if(toonAantal) basis.push((a.qty||0)>0 ? String(a.qty) : '');
    return basis;
  };
  /* De regels van de tabel: elke armatuur met zijn accessoires direct eronder. Een
     accessoire is een vervolg: tableRow() geeft hem dezelfde kleur als zijn armatuur,
     zodat ze in de tabel zichtbaar bij elkaar horen. */
  const regels = rijen.flatMap(r=> [{waarden:waarden(r), vervolg:false}]
    .concat(armAccessoires(r.s).map(a=> ({waarden:accWaarden(a), vervolg:true}))));
  return {cols, waarden, regels};
}

/* ======================= de naam uit de catalogus ======================= */

/* De omschrijving van een artikelcode uit de catalogus (catalogus-data.js, gebouwd uit
   vergelijker/data/bron/catalogus.csv), of null. Alleen een exacte code telt -
   hoofdletters en spaties eromheen maken niet uit, maar een code die er bijna op lijkt is
   een ander artikel. catalogus mag weg; dan window.CATALOGUS. */
function catalogusNaam(code, catalogus){
  const c = String(code || '').trim().toUpperCase();
  const cat = catalogus || (typeof window !== 'undefined' && window.CATALOGUS) || {};
  return c && Object.prototype.hasOwnProperty.call(cat, c) ? cat[c] : null;
}
/* Wat er met de naam moet nadat er een artikelcode is ingetypt; verandert zelf niets.
   obj is de regel of het accessoire: {name, naamUitCatalogus}. De naam komt uit de
   catalogus als het naamveld leeg is, of als de naam er eerder zo in kwam (dan hoort hij
   bij de vorige code). Een zelf getypte of aangepaste naam blijft altijd staan. Staat de
   nieuwe code niet in de catalogus terwijl de naam bij een vorige code hoorde, dan gaat
   die naam weg: anders staat er een naam bij een code waar hij niet bij hoort.
     {soort:'gevuld', naam}   de omschrijving uit de catalogus
     {soort:'gewist', naam:''} de oude automatische naam weg
     {soort:'eigen naam'}     gevonden, maar er staat een eigen naam
     {soort:'onbekend'}       niet in de catalogus
     {soort:'leeg'}           geen code, of "special" */
function armNaamUitCode(obj, code, catalogus){
  const c = String(code || '').trim();
  if(!c || c.toLowerCase() === 'special') return {soort:'leeg'};
  const naam = String(obj.name || '').trim();
  const automatisch = !!naam && naam === obj.naamUitCatalogus;
  const oms = catalogusNaam(c, catalogus);
  if(!oms) return automatisch ? {soort:'gewist', naam:''} : {soort:'onbekend'};
  if(naam && !automatisch) return {soort:'eigen naam'};
  return {soort:'gevuld', naam:oms};
}
/* Het naamveld bijwerken na een ingetypte code. De nieuwe naam gaat via dezelfde
   'change' als een getypte naam, zodat de tool hem net zo verwerkt (de typeherkenning,
   een keuze binnen een serie). Staat de code niet in de catalogus en is er geen naam,
   dan zegt de tool dat. */
function armNaamVeldUitCode(obj, code, naamInp){
  const r = armNaamUitCode(obj, code);
  if(r.soort === 'gevuld' || r.soort === 'gewist'){
    obj.naamUitCatalogus = r.naam;
    naamInp.value = r.naam;
    naamInp.dispatchEvent(new Event('change'));
  }
  if(r.soort !== 'gevuld' && r.soort !== 'eigen naam' && r.soort !== 'leeg' && !String(obj.name || '').trim()
     && typeof Melding !== 'undefined')
    Melding.letop('Artikelcode ' + String(code).trim() + ' staat niet in de catalogus van de tool — '
      + 'vul de volledige naam zelf in.', {bij: naamInp});
  return r.soort;
}

/* ======================= de regel in beeld ======================= */

/* De accessoires onder een armatuurregel: de knop "+ Accessoire" voor op de regel en
   de lijst subregels (artikelcode, naam, aantal, ×) die de tool onder de regel zet.
   o.s is de staat van de regel, o.opWijziging() laat de tool verversen. Een lege
   subregel telt niet mee (armAccessoires()); weghalen gaat met het kruisje. De
   accessoires horen bij de regel, dus ↑/↓ neemt ze mee (armWisselRijen() verwisselt
   de hele regel). */
function armAccessoireDelen(o){
  const s = o.s;
  const knop = document.createElement('button'); knop.type='button'; knop.className='c2-accknop';
  knop.textContent = '+ Accessoire';
  knop.title = 'Een accessoire bij dit armatuur, zoals een opbouwset: eigen artikelcode en naam, '
    + 'geen eigen CODE en geen presenter. In de armaturenlijst komt het direct onder dit armatuur.';
  const lijst = document.createElement('div'); lijst.className='c2-acclijst';
  const veld = (klasse, hint, waarde, zet)=>{
    const inp = document.createElement('input'); inp.type='text'; inp.className=klasse;
    inp.placeholder = hint; inp.value = waarde || '';
    inp.addEventListener('change', ()=>{ zet(inp.value); o.opWijziging(); });
    inp.addEventListener('keydown', e=>{ if(e.key==='Enter') inp.blur(); });
    return inp;
  };
  function teken(){
    lijst.innerHTML = '';
    (s.accessoires || []).forEach((acc, i)=>{
      const r = document.createElement('div'); r.className = 'c2-accrow';
      const label = document.createElement('span'); label.className = 'c2-acclabel'; label.textContent = '↳ accessoire';
      /* een artikelcode uit de catalogus vult de naam in, net als op de regel zelf */
      const code = veld('c2-textinp c2-acccode', 'Artikelcode', acc.code, v=>{ acc.code = v; armNaamVeldUitCode(acc, v, naam); });
      const naam = veld('c2-textinp c2-accnaam', 'Naam (bijv. Mondial opbouwset)', acc.name, v=>{ acc.name = v; });
      const qty = veld('c2-qtyinp', '–', acc.qty > 0 ? String(acc.qty) : '', v=>{
        acc.qty = Math.max(0, parseInt(v) || 0); qty.value = acc.qty > 0 ? String(acc.qty) : '';
      });
      qty.inputMode = 'numeric'; qty.title = 'Aantal — mag leeg blijven';
      const weg = document.createElement('button'); weg.type='button'; weg.className='c2-accweg';
      weg.textContent = '×'; weg.title = 'Accessoire weghalen'; weg.setAttribute('aria-label', 'Accessoire weghalen');
      weg.addEventListener('click', ()=>{ s.accessoires.splice(i, 1); teken(); o.opWijziging(); });
      r.append(label, code, naam, qty, weg);
      lijst.appendChild(r);
    });
  }
  knop.addEventListener('click', ()=>{
    s.accessoires = s.accessoires || [];
    s.accessoires.push({code:'', name:'', qty:0});
    teken(); o.opWijziging();
    const codes = lijst.querySelectorAll('.c2-acccode');
    if(codes.length) codes[codes.length-1].focus();
  });
  teken();
  return {knop, lijst};
}

/* De onderdelen van een armatuurregel die in beide tools hetzelfde doen: het label
   met het herkende type, de uploadknop, de stempelknop en de pijltjes. De tool
   bouwt de regel zelf op (zijn eigen velden, zijn eigen volgorde) en zet deze
   onderdelen erin.

     o.a             het slot ({id})
     o.s             de staat van de regel (aanduiding, name, groep, stempel, qty ...)
     o.naamInp       het naamveld; de luisteraars daarop zet deze functie zelf
     o.codeNaamInp   het codeveld (CODE A); de stempelknop kijkt of er iets in staat
     o.isSpecial()   staat er "special" in het artikelcodeveld dat nu telt
     o.opWijziging() de tool ververst (railtool: refresh, armaturenboek: updateSummary)
     o.verplaats(r)  een regel omhoog (-1) of omlaag (+1); weglaten = geen pijltjes

   Geeft {volg, badge, upload, stempel, verf}; verf() tekent alles opnieuw en
   hoort na elke wijziging aan de regel die de tool zelf afhandelt. */
function armRijDelen(o){
  const {a, s, naamInp, codeNaamInp} = o;
  const special = ()=> !!(o.isSpecial && o.isSpecial());
  const groep = ()=> armGroepVanRij(s, a.id, special());
  const aanwezig = (id)=> PdfHuisstijl.presenterAanwezig(id);

  /* --- pijltjes: de volgorde van de regels is de volgorde in het boek --- */
  let volg = null;
  if(o.verplaats){
    volg = document.createElement('span'); volg.className='c2-armvolg';
    [['↑',-1,'Deze regel een plaats omhoog'], ['↓',1,'Deze regel een plaats omlaag']]
      .forEach(([teken, richting, titel])=>{
        const k=document.createElement('button'); k.type='button';
        k.textContent=teken; k.title=titel; k.setAttribute('aria-label', titel);
        k.addEventListener('click', ()=>o.verplaats(richting));
        volg.appendChild(k);
      });
  }

  /* --- het label: herkend type, keuzelijst binnen een serie, of een suggestie --- */
  const badge=document.createElement('span'); badge.className='c2-armrecog';

  /* --- de uploadknop: zodra de tool zelf geen presenter kan aanwijzen, bij
         "special" in het artikelcodeveld, maar net zo goed bij een omschrijving die
         niet herkend wordt - een armatuur met een onherkenbare naam kan anders
         nergens heen. --- */
  const upload=document.createElement('span'); upload.className='c2-armspecial';
  const bestand=document.createElement('input'); bestand.type='file'; bestand.accept='application/pdf';
  bestand.style.display='none';
  const knop=document.createElement('button'); knop.type='button'; knop.className='c2-specialbtn';
  /* Een knop, geen span: hij doet iets, en dan hoort hij bereikbaar te zijn met de
     tab-toets en een naam te hebben. */
  const weg=document.createElement('button'); weg.type='button';
  weg.className='c2-specialx'; weg.textContent='✕';
  weg.title='Geüploade PDF verwijderen'; weg.setAttribute('aria-label', 'Geüploade PDF verwijderen');
  knop.addEventListener('click', ()=>bestand.click());
  weg.addEventListener('click', ()=>{
    if(window.PRESENTER_DATA) delete window.PRESENTER_DATA[specialPresenterId(a.id)];
    bestand.value='';
    verf(); o.opWijziging();
  });
  bestand.addEventListener('change', ()=>{
    const f=bestand.files && bestand.files[0];
    if(!f) return;
    const rdr=new FileReader();
    rdr.onload=()=>{
      const bytes=new Uint8Array(rdr.result);
      const kop=String.fromCharCode.apply(null, bytes.subarray(0,5));
      if(kop!=='%PDF-'){ Melding.fout('Dit lijkt geen PDF-bestand.'); bestand.value=''; return; }
      window.PRESENTER_DATA = window.PRESENTER_DATA || {};
      window.PRESENTER_DATA[specialPresenterId(a.id)] = PdfHuisstijl.bytesToB64(bytes);
      verf(); o.opWijziging();
    };
    rdr.readAsArrayBuffer(f);
  });
  upload.appendChild(knop); upload.appendChild(weg); upload.appendChild(bestand);

  /* --- de stempelknop: alleen op een regel die echt gestempeld wordt - er moet een
         presenter zijn en een code om te stempelen --- */
  const stempel=document.createElement('button');
  stempel.type='button'; stempel.className='c2-stempelbtn';
  stempel.addEventListener('click', ()=>{
    const g = groep();
    s.stempel = stempelZwart(s, g && g.special) ? 'wit' : 'zwart';
    verf(); o.opWijziging();
  });

  function verfUpload(){
    const geladen = aanwezig(specialPresenterId(a.id));
    /* Een lege regel krijgt de knop niet; die zou alleen maar in de weg staan. */
    const toon = geladen || ((naamInp.value.trim() || special()) && armTypeOnbekend(s, naamInp.value, special()));
    upload.classList.toggle('show', toon);
    if(!toon) return;
    knop.textContent = geladen ? '✓ PDF geladen' : '⚠ PDF uploaden';
    knop.className = 'c2-specialbtn '+(geladen?'ok':'miss');
    knop.title = geladen
      ? 'Klik om de geüploade presenter-PDF te vervangen.'
      : 'Upload hier zelf de presenter-PDF voor dit armatuur.';
    weg.style.display = geladen ? '' : 'none';
  }
  function verfStempel(){
    const toon = !!groep() && !!(codeNaamInp.value||'').trim();
    stempel.style.display = toon ? '' : 'none';
    if(!toon) return;
    const sp = !!(groep() || {}).special;
    const zwart = stempelZwart(s, sp);
    stempel.textContent = zwart ? '● Stempel zwart' : '○ Stempel wit';
    stempel.className = 'c2-stempelbtn'+(zwart?' zwart':'');
    stempel.title = sp
      ? (zwart
        ? 'De code komt zwart onder de kop van de eigen PDF, links van het DLC-logo. Klik voor wit - alleen voor een PDF met een hoge donkere kop.'
        : 'De code komt wit onder de kop van de eigen PDF; op een DLC-blad is die dan onzichtbaar. Klik voor zwart.')
      : zwart
        ? 'De code komt zwart en iets hoger op de presenter — voor een pagina met een lichte kop. Klik voor wit.'
        : 'De code komt wit in de kopbalk van de presenter. Klik voor zwart, als die kop licht is.';
  }
  function verfBadge(){
    badge.removeAttribute('tabindex'); badge.removeAttribute('role'); badge.dataset.tekst='';
    const g = groep();
    /* g.special: er staat een eigen PDF, en de knop hiernaast zegt al "PDF geladen" */
    if(g && g.special){
      badge.textContent=''; badge.className='c2-armrecog'; badge.title='';
    } else if(g && armSerieKeuze(g.id)){
      /* Een serie met meer presenters: welke bedoeld is zegt de naam niet altijd
         ("Mondial" kan ook de opbouw-/pendeluitvoering zijn). Het label wordt een
         keuzelijst; de herkende staat voorgekozen. Een andere keuze gaat in s.groep,
         dezelfde plek die armGroepVanRij() als handmatige keuze leest, en wordt dus
         ook opgeslagen en verhuist mee met de pijltjes. */
      const serie = armSerieKeuze(g.id), er = aanwezig(g.id);
      badge.textContent = er ? '✓ ' : '⚠ ';
      badge.className = 'c2-armrecog '+(er?'ok':'warn');
      const sel = document.createElement('select'); sel.className='c2-serie';
      serie.keuzes.forEach(k=>sel.append(new Option(k.label, k.id)));
      sel.value = g.id;
      sel.setAttribute('aria-label', 'Welke '+serie.serie+'-presenter');
      sel.addEventListener('change', ()=>{
        const auto = matchArmGroep(s.name);
        s.groep = (auto && auto.id===sel.value) ? '' : sel.value;
        verf(); o.opWijziging();
      });
      badge.append(sel);
      badge.title = (er
        ? 'Presenter '+g.naam+' komt in het armaturenboek.'
        : 'De presenter-PDF van '+g.naam+' ontbreekt nog in presenters-data.js.')
        + ' Kies hier een andere '+serie.serie+'-presenter als de opbouw-, pendel- of een andere uitvoering bedoeld is.';
    } else if(g){
      badge.textContent = (aanwezig(g.id)?'✓ ':'⚠ ')+g.naam;
      badge.className = 'c2-armrecog '+(aanwezig(g.id)?'ok':'warn');
      badge.title = aanwezig(g.id)
        ? 'Presenter '+g.naam+' komt in het armaturenboek (herkend uit de naam). Upload hiernaast een eigen PDF om dit te vervangen.'
        : 'Type herkend, maar de presenter-PDF van '+g.naam+' ontbreekt nog in presenters-data.js.';
    } else if(!naamInp.value.trim()){
      badge.textContent=''; badge.className='c2-armrecog'; badge.title='';
    } else {
      /* Een tikfout in de naam ("Esence", "Mondail") krijgt een voorstel dat je met
         één klik overneemt - zie armSuggestie() voor waarom die zo streng is. */
      const sug = armSuggestie(naamInp.value);
      if(sug){
        badge.textContent='Bedoelde je '+sug.suggestie+'?'; badge.className='c2-armrecog miss sug';
        badge.title='Klik om de naam te verbeteren tot "'+sug.tekst+'" — dan wordt het '+sug.groep.naam+'.';
        badge.dataset.tekst=sug.tekst; badge.tabIndex=0; badge.setAttribute('role','button');
        return;
      }
      badge.textContent='Kies type'; badge.className='c2-armrecog miss';
      badge.title='Type niet herkend uit de naam — pas de omschrijving aan zodat het type duidelijk wordt, of upload hiernaast zelf een presenter-PDF.';
    }
  }
  function verf(){ verfBadge(); verfUpload(); verfStempel(); }

  function neemSuggestieOver(){
    if(!badge.dataset.tekst) return;
    naamInp.value = badge.dataset.tekst;
    naamInp.dispatchEvent(new Event('input'));
    naamInp.dispatchEvent(new Event('change'));
  }
  badge.addEventListener('click', neemSuggestieOver);
  /* alleen het label zelf: een toets in de keuzelijst erin hoort bij de keuzelijst */
  badge.addEventListener('keydown', e=>{ if(e.target===badge && (e.key==='Enter'||e.key===' ')){ e.preventDefault(); neemSuggestieOver(); } });

  naamInp.addEventListener('input', verf);
  naamInp.addEventListener('change', ()=>{
    /* een keuze binnen een serie vervalt als de nieuwe naam zelf een ander type aanwijst */
    if(s.groep && !armKeuzeBlijft(s.groep, s.name, naamInp.value)) s.groep='';
    s.name=naamInp.value;
    verf(); o.opWijziging();
  });
  codeNaamInp.addEventListener('input', verfStempel);

  verf();
  return {volg, badge, upload, stempel, verf};
}

/* De ↑ van de eerste en de ↓ van de laatste regel wijzen nergens heen. */
function armVolgBijwerken(lijst){
  const rijen = Array.from(lijst.querySelectorAll('.c2-armrow'));
  rijen.forEach((r,i)=>{
    const k = r.querySelectorAll('.c2-armvolg button');
    if(k[0]) k[0].disabled = (i === 0);
    if(k[1]) k[1].disabled = (i === rijen.length-1);
  });
}

/* De opmaak van die onderdelen, één keer, zodat hij in beide tools gelijk is. Net
   als info-teken.js brengt dit bestand zijn eigen stijl mee; de tools houden alleen
   de breedte van hun eigen velden. */
(function(){
  if(typeof document==='undefined' || document.getElementById('armatuur-rij-stijl')) return;
  const st=document.createElement('style'); st.id='armatuur-rij-stijl';
  st.textContent = `
  .c2-armvolg{display:flex; flex:0 0 auto; gap:2px;}
  .c2-armvolg button{
    width:20px; height:22px; padding:0; font:inherit; font-size:11px; line-height:1;
    border:1.5px solid var(--border); border-radius:6px; background:var(--white);
    color:var(--slate); cursor:pointer; transition:.12s;
  }
  .c2-armvolg button:hover:not(:disabled){border-color:var(--blue); color:var(--blue-dark);}
  .c2-armvolg button:disabled{opacity:.3; cursor:default;}
  .c2-armrecog{font-size:11px; font-weight:700; white-space:nowrap; padding:3px 8px; border-radius:20px;}
  .c2-armrecog.ok{background:var(--green-light); color:var(--green);}
  .c2-armrecog.miss{background:#FDECEC; color:#B0362B;}
  .c2-armrecog.warn{background:#FFF4E0; color:#95651A;}
  .c2-armrecog.sug{cursor:pointer; text-decoration:underline dotted; text-underline-offset:2px;}
  .c2-armrecog.sug:hover{background:#F9D9D6;}
  .c2-armrecog select.c2-serie{font:inherit; color:inherit; background:transparent; border:none;
    padding:0 2px; margin:0; cursor:pointer; max-width:190px;}
  .c2-stempelbtn{
    font:inherit; font-size:11px; font-weight:700; white-space:nowrap;
    padding:3px 8px; border-radius:20px; cursor:pointer;
    border:1px solid var(--border); background:var(--white); color:var(--slate);
  }
  .c2-stempelbtn:hover{border-color:var(--blue); color:var(--blue-dark);}
  .c2-stempelbtn.zwart{background:#232323; border-color:#232323; color:#fff;}
  .c2-armspecial{display:none; align-items:center; gap:4px;}
  .c2-armspecial.show{display:inline-flex;}
  .c2-armspecial .c2-specialbtn{font:inherit; font-size:11px; font-weight:700; white-space:nowrap;
    padding:3px 8px; border-radius:20px; border:none; cursor:pointer;}
  .c2-armspecial .c2-specialbtn.miss{background:#FDECEC; color:#B0362B;}
  .c2-armspecial .c2-specialbtn.ok{background:var(--green-light); color:var(--green);}
  .c2-armspecial .c2-specialx{font:inherit; font-size:14px; color:var(--slate); cursor:pointer;
    padding:0 3px; line-height:1; background:none; border:0;}
  /* De accessoires lopen in kolommen met hun armatuur mee: het label op de plek van de
     CODE (ingesprongen voorbij de pijltjes), de artikelcode en de naam eronder, het
     aantal onder het aantal en het kruisje onder de knop. De knop en het kruisje delen
     daarom één vaste breedte. Een tool met andere veldbreedtes zet de variabelen. */
  .c2-accknop{
    flex:0 0 var(--acc-knop, 92px);
    font:inherit; font-size:11px; font-weight:700; white-space:nowrap; padding:3px 0; border-radius:20px;
    cursor:pointer; border:1px dashed var(--border); background:var(--white); color:var(--slate);
  }
  .c2-accknop:hover{border-color:var(--blue); border-style:solid; color:var(--blue-dark);}
  .c2-acclijst{display:flex; flex-direction:column;}
  .c2-accrow{display:flex; align-items:center; gap:8px; padding:0 2px 5px var(--acc-inspring, 52px);}
  .c2-acclabel{flex:0 0 var(--acc-label, 96px); font-size:11px; font-weight:700; color:var(--slate); white-space:nowrap;}
  .c2-accrow input.c2-textinp{padding:5px 8px; font-size:12px; min-width:0;}
  .c2-accrow input.c2-acccode{flex:0 0 var(--acc-code, 100px);}
  .c2-accrow input.c2-accnaam{flex:1 1 auto;}
  .c2-accrow .c2-qtyinp{flex:0 0 auto;}
  .c2-accweg{flex:0 0 var(--acc-knop, 92px); font:inherit; font-size:15px; color:var(--slate); cursor:pointer;
    padding:0; line-height:1; background:none; border:0;}
  .c2-accweg:hover{color:#B0362B;}
  `;
  document.head.appendChild(st);
})();
