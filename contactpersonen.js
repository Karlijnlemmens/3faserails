/* De contactpersonen op de introductiepagina: "Contactgegevens" met de gekozen
   projectuitwerker, accountmanager en commerciële binnendienst naast elkaar, en
   "Onze specialist" - het blauwe vlak met foto en persoonlijke noot van een
   projectuitwerker die er een heeft.

   Het armaturenboek en de railtool zetten dit allebei in hun PDF: het armaturenboek
   onder de briefing, de railtool op een eigen introductiepagina achter het voorblad.
   Hier staat wat voor beide hetzelfde hoort te zijn - de maten, de keuze in het
   paneel en de tekening - zodat ze niet uit elkaar kunnen groeien, zoals de
   armatuurregel dat eerder deed (zie armatuur-rij.js). De gegevens zelf staan in
   medewerkers.js en de foto's in medewerker-fotos.js.

   Een gewoon <script src>, geen module; functies op het hoogste niveau, zodat
   tools/controleer-logica.mjs ze kan uitsnijden. Laden na pdf-huisstijl.js,
   medewerkers.js en medewerker-fotos.js. */

/* Maten uit de aangeleverde contactkaarten ("Contactgegevens - Update sep 2026.pdf")
   en uit het voorbeeld van de gewenste pagina; y is de bovenkant van een regel, net
   als in pdf-huisstijl.js. De tekst is die van de briefing (pt, Open Sans); alleen de
   koppen, en de naam en de functie op het blauwe vlak, zijn Poppins, zoals in de bron.
   x/kaartX/kaartB zijn de linkerrand van de tekst en het blauwe vlak op de pagina -
   dezelfde als de briefing van het armaturenboek (BRIEF.x, BRIEF.blok). */
const CONTACT = {
  x:38, kaartX:35, kaartB:525, pt:8.5,
  boven:96.1,            /* bovenaan een eigen pagina: waar in het armaturenboek "Briefing" staat */
  kopPt:12,
  kopGat:46,             /* bovenkant laatste regel erboven -> bovenkant "Contactgegevens" */
  naKop:26.9,            /* bovenkant kop -> bovenkant eerste naam (basislijnen 29,7 uit elkaar) */
  regel:12.4,
  kolomX:[38, 215, 400], kolomB:175,
  labelB:11.5,           /* "T" -> het nummer erachter */
  specialistGat:55,      /* bovenkant laatste contactregel -> bovenkant "Onze specialist" */
  naSpecKop:29,          /* bovenkant kop -> bovenkant van het blauwe vlak */
  /* Krap: bij de langere tekst van een vergelijking kwam het blauwe vlak een paar punten
     tekort en verhuisde het naar een eigen, verder lege pagina. Dan liever de witruimte
     erboven wat kleiner; pas als het ook zo niet past gaat het naar de volgende pagina. */
  specialistGatKrap:34, naSpecKopKrap:23,
  kaart:{
    kleur:'#0E7DC2', h:170,
    foto:{x:14, y:14, maat:102},
    tekstX:127, rechts:12,
    naamPt:14, naamTop:16.5,          /* basislijn 27,4 onder de bovenrand */
    functiePt:10, functieTop:34.3,    /* basislijn 42,1 */
    citaatPt:8.5, citaatTop:48.9,     /* basislijn 55,5 */
    citaatRegel:12.95, alinea:15.3,
    naCitaat:26, contactRegel:10.3, labelB:14.9, onder:13.3,
  },
};

/* Een medewerker uit medewerkers.js, per rol; null als er niets (geldigs) gekozen is -
   een id dat intussen uit het bestand is verdwenen telt als niet gekozen. */
function medewerkerVan(rol, id){
  const M = window.MEDEWERKERS, R = (window.MEDEWERKER_ROLLEN||[]).find(r=>r.id===rol);
  if(!id || !M || !R) return null;
  return (M[R.lijst]||[]).find(p=>p.id===id) || null;
}
/* De gekozen contactpersonen, in de volgorde van de rollen. `keuze` is de staat van
   de tool: {projectuitwerker, accountmanager, binnendienst} met ids. */
function contactPersonen(keuze){
  return (window.MEDEWERKER_ROLLEN||[]).map(r=>({rol:r, p:medewerkerVan(r.id, keuze[r.id])})).filter(x=>x.p);
}
/* De regels onder naam en functie, zoals in de contactgegevens van de bron. */
function contactRegels(p){
  const alg = (window.MEDEWERKERS||{}).algemeen;
  const uit = [['T', p.tel+' (Direct)']];
  if(alg) uit.push(['T', alg+' (Algemeen)']);
  if(p.mobiel) uit.push(['M', p.mobiel]);
  uit.push(['E', p.email]);
  return uit;
}
/* Het blauwe vlak: alleen voor een projectuitwerker met een persoonlijke noot. */
function specialist(keuze){
  const p = medewerkerVan('projectuitwerker', keuze.projectuitwerker);
  return p && p.noot ? p : null;
}

/* ======================= de keuze in het paneel ======================= */

/* Drie keuzelijsten in `vak`, die `keuze[rol]` lezen en schrijven; opWijziging() na
   elke keuze. Het vak wordt eerst leeggemaakt: "Project opslaan" bakt de HTML mee zoals
   hij op dat moment in het scherm staat, dus in een opgeslagen bestand staan deze
   keuzelijsten er al - zonder leegmaken kwamen ze er bij het heropenen een tweede keer
   bij, en de eerste, nog lege, zou dan degene zijn die getElementById() vindt. Zonder
   medewerkers.js blijft het leeg en werkt de rest van de tool gewoon. */
function contactKeuze(vak, keuze, opWijziging, idVoorvoegsel){
  vak.textContent = '';
  vak.classList.add('contactkeuze');
  (window.MEDEWERKER_ROLLEN||[]).forEach(r=>{
    const lijst = ((window.MEDEWERKERS||{})[r.lijst]) || [];
    const blok = document.createElement('div');
    const label = document.createElement('label');
    const sel = document.createElement('select');
    sel.className = 'c2-select'; sel.id = (idVoorvoegsel||'contact_')+r.id;
    label.textContent = r.label; label.htmlFor = sel.id;
    sel.append(new Option('— niet op de pagina —', ''));
    /* Alleen de naam, anders past het niet in de lijst; staat een naam er twee keer in
       (Luuk Eerden als accountmanager en als business developer), dan de functie erbij. */
    const dubbel = (p)=> lijst.filter(q=>q.naam===p.naam).length > 1;
    const optie = (p)=>{ const o = new Option(p.naam + (dubbel(p) ? ' ('+p.functie+')' : ''), p.id);
      o.title = p.functie; return o; };
    if(r.id==='projectuitwerker'){
      /* wie een noot heeft krijgt het blauwe vlak - zo zie je bij het kiezen al wat je krijgt */
      [['Met blauw vlak “Onze specialist”', lijst.filter(p=>p.noot)],
       ['Alleen contactgegevens', lijst.filter(p=>!p.noot)]].forEach(([kop, groep])=>{
        if(!groep.length) return;
        const g = document.createElement('optgroup'); g.label = kop;
        groep.forEach(p=>g.appendChild(optie(p)));
        sel.appendChild(g);
      });
    } else lijst.forEach(p=>sel.appendChild(optie(p)));
    const uitleg = document.createElement('p');
    uitleg.className = 'hint'; uitleg.style.margin = '4px 0 0';
    const toon = ()=>{
      const p = medewerkerVan(r.id, sel.value);
      uitleg.textContent = !p ? '' : p.functie
        + (r.id==='projectuitwerker' ? (p.noot ? ' · met blauw vlak' : ' · alleen contactgegevens') : '');
    };
    /* een gekozen id dat niet meer in medewerkers.js staat: leeg tonen, en zo ook tellen */
    sel.value = medewerkerVan(r.id, keuze[r.id]) ? keuze[r.id] : '';
    toon();
    sel.addEventListener('change', ()=>{ keuze[r.id] = sel.value; toon(); if(opWijziging) opWijziging(); });
    blok.appendChild(label); blok.appendChild(sel); blok.appendChild(uitleg);
    vak.appendChild(blok);
  });
}

/* ======================= de tekening ======================= */

/* Tekent "Contactgegevens" en "Onze specialist" vanaf de huidige plek op de pagina.
   HS is de tekenlaag uit pdf-huisstijl.js; plek.haal()/plek.zet() lezen en zetten de
   y van de tool (need() in de tekenlaag kijkt naar diezelfde y). eersteGat is de
   afstand vanaf de regel erboven: onder de briefing CONTACT.kopGat, bovenaan een
   eigen pagina 0. Geeft terug of er iets getekend is. */
async function tekenContactpersonen(HS, keuze, plek, eersteGat){
  const {C, text, rect, need, metUitsnede, beeldVullend, wrapBreedte} = HS;
  const K = CONTACT, KK = K.kaart;
  let y = plek.haal();
  const zet = (v)=>{ y = v; plek.zet(v); };

  /* --- Contactgegevens: de gekozen mensen naast elkaar. Wie niet gekozen is laat geen
         lege kolom achter; de rest schuift op. --- */
  const mensen = contactPersonen(keuze);
  if(mensen.length){
    const hoogste = Math.max(...mensen.map(m=>contactRegels(m.p).length+1));
    zet(y + eersteGat);
    need(K.naKop + hoogste*K.regel + K.pt); y = plek.haal();
    text(K.x, y, K.kopPt, 'Contactgegevens', {bold:true, cond:true, color:C.hoofd});
    const top = y + K.naKop;
    let onder = top;
    mensen.forEach(({p}, i)=>{
      const x = K.kolomX[i];
      let yy = top;
      text(x, yy, K.pt, p.naam, {bold:true, color:C.tekst});
      yy += K.regel; text(x, yy, K.pt, p.functie, {bold:true, color:C.hoofd});
      contactRegels(p).forEach(([label, waarde])=>{
        yy += K.regel;
        text(x, yy, K.pt, label, {bold:true, color:C.tekst});
        text(x + K.labelB, yy, K.pt, waarde, {color:C.tekst});
      });
      onder = Math.max(onder, yy);
    });
    zet(onder);
  }

  /* --- Onze specialist: alleen als de projectuitwerker een noot heeft. Het vlak
         wordt nooit gebroken; past het niet, dan komt het op de volgende pagina. --- */
  const spec = specialist(keuze);
  if(spec){
    const tx = K.kaartX + KK.tekstX, breedte = K.kaartB - KK.tekstX - KK.rechts;
    /* opmeten: de noot in alinea's, elke alinea afgebroken op echte tekstbreedte */
    const alineas = String(spec.noot).split(/\n/).map(a=>a.trim()).filter(Boolean);
    alineas[0] = '“' + alineas[0];
    alineas[alineas.length-1] += '”';
    const regels = [];
    alineas.forEach((a, i)=> wrapBreedte(a, breedte, KK.citaatPt, {})
      .forEach((r, j)=> regels.push({t:r, gat: (i>0 && j===0) ? KK.alinea : KK.citaatRegel})));
    let hoogte = KK.citaatTop;
    regels.forEach((r, i)=>{ if(i) hoogte += r.gat; });
    const telTop = hoogte + KK.naCitaat;
    const kaartH = Math.max(KK.h, telTop + KK.contactRegel + KK.citaatPt*0.78 + KK.onder);

    const ruim = mensen.length ? K.specialistGat : eersteGat;
    const krap = mensen.length
              && y + ruim + K.naSpecKop + kaartH > HS.H - HS.MB
              && y + K.specialistGatKrap + K.naSpecKopKrap + kaartH <= HS.H - HS.MB;
    zet(y + (krap ? K.specialistGatKrap : ruim));
    const naKop = krap ? K.naSpecKopKrap : K.naSpecKop;
    need(naKop + kaartH); y = plek.haal();
    text(K.x, y, K.kopPt, 'Onze specialist', {bold:true, cond:true, color:C.hoofd});
    const kt = y + naKop, kx = K.kaartX;
    rect(kx, kt, K.kaartB, kaartH, KK.kleur);

    const foto = (window.MEDEWERKER_FOTOS||{})[spec.id];
    if(foto){
      try{
        const img = await HS.sluitBeeldIn(PdfHuisstijl.b64Bytes(foto.split(',')[1]));
        const fx = kx + KK.foto.x, fy = kt + KK.foto.y, m = KK.foto.maat;
        if(spec.rond){
          /* De foto is in de bron al rond uitgesneden op een blauw vlak, in een net
             iets andere tint. Rond knippen, iets binnen de rand, zodat dat blauw niet
             als vierkant zichtbaar wordt. */
          const r = m*0.46, cx = fx + m/2, cy = fy + m/2;
          const punten = Array.from({length:72}, (_, i)=>
            [cx + r*Math.cos(i*Math.PI/36), cy + r*Math.sin(i*Math.PI/36)]);
          metUitsnede(punten, ()=> beeldVullend(img, fx, fy, m, m));
        } else {
          beeldVullend(img, fx, fy, m, m);
        }
      }catch(err){ console.warn('Foto van '+spec.naam+' kon niet worden ingesloten:', err); }
    }

    text(tx, kt + KK.naamTop, KK.naamPt, spec.naam, {bold:true, cond:true, color:C.wit});
    text(tx, kt + KK.functieTop, KK.functiePt, spec.kaartFunctie || spec.functie,
      {bold:true, cond:true, color:C.wit});
    let ry = kt + KK.citaatTop;
    regels.forEach((r, i)=>{
      if(i) ry += r.gat;
      text(tx, ry, KK.citaatPt, r.t, {schuin:true, color:C.wit});
    });
    [['T', spec.tel], ['E', spec.email]].forEach(([label, waarde], i)=>{
      const ty = kt + telTop + i*KK.contactRegel;
      text(tx, ty, KK.citaatPt, label, {bold:true, color:C.wit});
      text(tx + KK.labelB, ty, KK.citaatPt, waarde, {color:C.wit});
    });
    zet(kt + kaartH);
  }
  return mensen.length > 0 || !!spec;
}

/* De opmaak van de keuze in het paneel, één keer, zodat hij in beide tools gelijk is. */
(function(){
  if(typeof document==='undefined' || document.getElementById('contactpersonen-stijl')) return;
  const st=document.createElement('style'); st.id='contactpersonen-stijl';
  st.textContent = `
  .contactkeuze{display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:10px; margin-top:8px;}
  @media (max-width:640px){ .contactkeuze{grid-template-columns:minmax(0,1fr);} }
  .contactkeuze label{display:block; font-size:12.5px; font-weight:700; color:var(--ink); margin-bottom:3px;}
  .contactkeuze select{width:100%;}
  `;
  document.head.appendChild(st);
})();
