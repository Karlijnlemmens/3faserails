/* Gedeelde tekenlaag voor de PDF-export van de Distrilight tools-suite.

   Tot nu toe stond deze code drie keer in de repo: in buildPdf() (index.html),
   buildArmaturenboekPdf() (armaturenboek.html) en bouwPdf() (de vergelijker). Die
   drie kopieen waren op commentaar en wat schrijfwijze na identiek, wat betekende
   dat elke correctie aan een maat, een kleur of een lettertype op drie plaatsen
   moest gebeuren. Ze staan nu hier.

   Wat hier hoort: alles wat GEEN weet heeft van wat er op de pagina komt - de
   tekenprimitieven, de huisstijlkleuren en -lettertypen, het voorblad, de kopbalk,
   de voetvorm en de tabelopmaak. Wat NIET hier hoort: de inhoud zelf. Elke tool
   stelt zijn eigen pagina's samen; alleen het gereedschap is gedeeld.

   Laden: een gewoon <script src="pdf-huisstijl.js"> in de kop van de pagina. Geen
   module, want een ES-module weigert te laden als de tool rechtstreeks vanaf schijf
   (file://) wordt geopend, en dat is hier de normale manier van werken. Het bestand
   is klein en bevat geen beeld- of lettergegevens, dus het meeladen bij het openen
   kost niets - de zware bestanden (pdf-lib, merk-data.js, de presenters) blijven
   gewoon op aanvraag laden.

   Coordinaten: y telt in de hele laag vanaf de BOVENKANT van de pagina. pdf-lib
   rekent vanaf onder; die omzetting gebeurt in de primitieven zelf. Houd die
   afspraak aan als je er iets aan toevoegt.

   y en pg blijven van de aanroepende tool: die geeft bij tekenaar() vier
   toegangsfuncties mee (haalY/zetY/haalPg/zetPg). Zo kunnen beginPage(), need()
   en para() de schrijfpositie verzetten terwijl de tool zelf gewoon `y += 12`
   blijft schrijven. */
(function(){
'use strict';

/* ======================= laden op aanvraag ======================= */

/* Een script op aanvraag inladen. Werkt ook als de tool rechtstreeks vanaf schijf
   wordt geopend, waar fetch() naar losse bestanden geblokkeerd is. */
const scriptLaad = {};
function laadScript(src){
  if(!scriptLaad[src]){
    scriptLaad[src] = new Promise(res=>{
      const s=document.createElement('script');
      s.src=src;
      s.onload=()=>res(true);
      s.onerror=()=>res(false);
      document.head.appendChild(s);
    });
  }
  return scriptLaad[src];
}
function laadPresenterBestand(id){ return laadScript('presenters/'+id+'.js'); }

/* Huisstijl: lettertypen, logo's en beelden. Samen ruim vier megabyte, dus pas
   inladen als er echt een PDF gemaakt wordt. fontkit hoort daarbij: pdf-lib heeft
   dat nodig om een eigen lettertype in te sluiten. Ontbreekt er iets, dan valt de
   PDF terug op de standaardlettertypen - hij wordt dan minder mooi, maar wel
   gemaakt. */
let merkGeladen=null;
function merkData(){
  if(!merkGeladen){
    merkGeladen = (async()=>{
      await Promise.all([laadScript('vendor/fontkit.umd.min.js'), laadScript('merk/merk-data.js')]);
      const fk = window.fontkit;
      if(!fk) console.warn('fontkit kon niet worden geladen - de PDF gebruikt de standaardlettertypen.');
      if(!window.MERK_FONTS) console.warn('merk/merk-data.js kon niet worden geladen - de PDF gebruikt de standaardlettertypen.');
      return {fontkit:fk||null, fonts:window.MERK_FONTS||{}, logos:window.MERK_LOGOS||{},
              beelden:window.MERK_BEELDEN||{}};
    })();
  }
  return merkGeladen;
}

/* base64 -> bytes, voor lettertypen, logo's en presenters. */
function b64Bytes(b64){
  const bin=atob(b64); const arr=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
  return arr;
}
/* bytes -> base64, voor een door de gebruiker geuploade presenter. In stukjes omdat
   String.fromCharCode.apply op een paar MB in een keer de argumentenlimiet van de
   engine kan raken. */
function bytesToB64(bytes){
  const CHUNK=0x8000; let bin='';
  for(let i=0;i<bytes.length;i+=CHUNK) bin+=String.fromCharCode.apply(null, bytes.subarray(i,i+CHUNK));
  return btoa(bin);
}

/* Presenters staan op twee plaatsen:
     1. presenters/<id>.js  - een bestand per presenter, op aanvraag ingeladen.
                              Dit is wat tools/maak-presenters.mjs genereert.
     2. presenters-data.js  - alles in een bestand, wordt bij het openen meegeladen.
                              Blijft werken, maar vertraagt het opstarten.
   PRESENTER_FILES (uit presenters-data.js) zegt welke id's als los bestand bestaan,
   zodat we van tevoren weten of een presenter er is zonder hem al te downloaden. */
function presenterAanwezig(id){
  if(window.PRESENTER_DATA && window.PRESENTER_DATA[id]) return true;
  return !!(window.PRESENTER_FILES && window.PRESENTER_FILES.indexOf(id)>=0);
}
async function presenterData(id){
  const direct = window.PRESENTER_DATA && window.PRESENTER_DATA[id];
  if(direct) return direct;
  if(!(window.PRESENTER_FILES && window.PRESENTER_FILES.indexOf(id)>=0)) return null;
  await laadPresenterBestand(id);
  return (window.PRESENTER_DATA && window.PRESENTER_DATA[id]) || null;
}

/* ======================= tekst ======================= */

/* pdf-lib doet het ontsnappen en coderen zelf; wat hier overblijft is het omzetten
   van tekens die de ingesloten lettertypen niet kennen. Breid dit uit als er een
   nieuw teken opduikt, in plaats van aan te nemen dat UTF-8 vanzelf goed gaat. */
function pdfTxt(s){
  s=String(s==null?'':s).replace(/\u2014|\u2013/g,'-').replace(/\u00d7/g,'x').replace(/\u2192/g,'->')
    .replace(/\u201c|\u201d/g,'"').replace(/\u2018|\u2019/g,"'")
    .replace(/\u00ab|\u00bb/g,'"')
    .replace(/\u26a1/g,'').replace(/\uff0b/g,'+').replace(/\u2212/g,'-');
  let o='';
  for(let i=0;i<s.length;i++){ const c=s.charCodeAt(i); o += String.fromCharCode(c>255?63:c); }
  return o;
}
/* jjjj-mm-dd -> dd-mm-jjjj; leeg of onherkenbaar wordt vandaag. */
function datumNL(s){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s||''));
  if(m) return m[3]+'-'+m[2]+'-'+m[1];
  const d=new Date();
  return String(d.getDate()).padStart(2,'0')+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+d.getFullYear();
}

/* ======================= huisstijl ======================= */

/* Twee huisstijlen kunnen in een document staan. Distrilight is de afzender en
   kleurt alles rond de eigen pagina's; het armaturenboek gaat over Pragmalux-
   producten en loopt door in Pragmalux-presenters, dus dat deel draagt die
   huisstijl. Kleuren komen uit de huisstijlhandboeken: Distrilight blauw #0F7ABE,
   Pragmalux blauw #1A253C. De accentkleuren van Distrilight (oranje/groen/paars)
   blijven bewust ongebruikt - die zijn bedoeld om spaarzaam iets uit te lichten,
   niet om vlakken mee te vullen.

   logoRatio is de beeldverhouding van het logobestand (993x445 respectievelijk
   1418x269); daarmee kan de breedte uit een gevraagde hoogte volgen zonder het
   beeld te hoeven raadplegen. */
const THEMAS = {
  distrilight: {naam:'Distrilight', hoofd:'#0F7ABE', hoofd2:'#3E95CB', hoofdDiep:'#0A5A8C', tekst:'#123A5E', lt:'#DCECF8', shade:'#EDF3F9', line:'#C7D9E7',
                logoLicht:'dlLicht', logoDonker:'dlDonker', logoRatio:993/445,
                kopHoogte:40, omslagHoogte:30},
  pragmalux:   {naam:'Pragmalux', hoofd:'#1A253C', hoofd2:'#2A3855', hoofdDiep:'#101728', tekst:'#1A253C', lt:'#B9C4DA', shade:'#EDEFF3', line:'#CBD0DA',
                logoLicht:'pmLicht', logoDonker:'pmDonker', logoRatio:1418/269,
                kopHoogte:15, omslagHoogte:30},
};

/* ======================= tekenaar ======================= */

/* Bouwt de tekenlaag voor een pdf-lib-document.

   doc  het PDFDocument waarop getekend wordt
   opt  haalY/zetY/haalPg/zetPg  toegang tot de schrijfpositie en de huidige pagina
                                 van de aanroepende tool (verplicht)
        paginas    de array waarin beginPage() nieuwe pagina's bijschrijft
        fonts      'volledig' (beide kop-lettertypen) of 'distrilight' (alleen
                   Poppins; scheelt twee ingesloten lettertypen in de PDF)
        logos      welke logo's ingesloten worden, bijv. ['dlLicht','dlDonker']
        beelden    welke merkbeelden ingesloten worden
        sectie     beginwaarde voor de kop op vervolgpagina's

   Levert een object met alle tekengereedschappen; de tool haalt eruit wat hij
   nodig heeft. */
async function tekenaar(doc, opt){
  opt = opt || {};
  const haalY = opt.haalY, zetY = opt.zetY, haalPg = opt.haalPg, zetPg = opt.zetPg;
  if(!haalY || !zetY || !haalPg || !zetPg)
    throw new Error('tekenaar(): haalY/zetY/haalPg/zetPg zijn verplicht.');
  const paginas = opt.paginas || [];

  /* A4 staand, in punten. Mg is de marge rondom, MB de hoogte die onderaan vrij
     blijft voor de voetvorm, BALK_H de hoogte van de blauwe kopbalk. */
  const W=595, H=842, Mg=40, MB=64, BALK_H=70;

  const merk = await merkData();

  /* Huisstijllettertypen: Open Sans voor lopende tekst. Voor koppen (cond:true)
     heeft elk merk zijn eigen kop-lettertype: Pragmalux blijft Sofia Sans Extra
     Condensed, Distrilight gebruikt Poppins - zie kiesFont(), die op het actieve
     thema kiest. Lukt insluiten niet (bestand ontbreekt, fontkit niet geladen),
     dan valt alles terug op Helvetica; de PDF komt er dan uit, alleen minder mooi.
     eigenKop zegt of de koppen een echt smal lettertype hebben - zo ja, dan hoeft
     de kunstmatige versmalling van vroeger niet meer. */
  const volledig = opt.fonts !== 'distrilight';
  let FONT, eigenKop=false;
  try{
    if(!merk.fontkit || !merk.fonts.regular) throw new Error('huisstijllettertypen niet beschikbaar');
    doc.registerFontkit(merk.fontkit);
    const laad = async(sleutel, terugval)=> merk.fonts[sleutel]
      ? doc.embedFont(b64Bytes(merk.fonts[sleutel]), {subset:true})
      : doc.embedFont(terugval);
    const reg  = await laad('regular', PDFLib.StandardFonts.Helvetica);
    const bold = await laad('bold',    PDFLib.StandardFonts.HelveticaBold);
    if(volledig){
      const kopVet   = await laad('kopVet',     PDFLib.StandardFonts.HelveticaBold);
      const kopLicht = await laad('kopLicht',   PDFLib.StandardFonts.Helvetica);
      const dlVet    = await laad('dlKopVet',   PDFLib.StandardFonts.HelveticaBold);
      const dlLicht  = await laad('dlKopLicht', PDFLib.StandardFonts.Helvetica);
      FONT = {reg, bold, kopVet, kopLicht, dlKopVet:dlVet, dlKopLicht:dlLicht};
      eigenKop = !!merk.fonts.kopVet;
    } else {
      /* Alleen de Distrilight-koppen. kopVet/kopLicht wijzen naar dezelfde
         lettertypen, zodat kiesFont() ook zonder Pragmalux-thema nooit op
         undefined uitkomt. */
      const dlVet   = await laad('dlKopVet',   PDFLib.StandardFonts.HelveticaBold);
      const dlLicht = await laad('dlKopLicht', PDFLib.StandardFonts.Helvetica);
      FONT = {reg, bold, kopVet:dlVet, kopLicht:dlLicht, dlKopVet:dlVet, dlKopLicht:dlLicht};
      eigenKop = !!merk.fonts.dlKopVet;
    }
  }catch(err){
    console.warn('Huisstijllettertypen niet ingesloten, terugval op Helvetica:', err && err.message);
    const reg = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    const bold = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    FONT = {reg, bold, kopVet:bold, kopLicht:reg, dlKopVet:bold, dlKopLicht:reg};
  }

  /* Kleuren mogen als '#RRGGBB' of als 'r g b' (0-1) worden opgegeven; het tweede
     formaat komt uit de oude code en blijft werken. */
  const kleurCache = {};
  function col(v){
    if(kleurCache[v]) return kleurCache[v];
    let r,g,b;
    if(v.charAt(0)==='#'){
      const h=v.slice(1);
      r=parseInt(h.substr(0,2),16)/255; g=parseInt(h.substr(2,2),16)/255; b=parseInt(h.substr(4,2),16)/255;
    } else { const p=v.trim().split(/\s+/).map(Number); r=p[0]; g=p[1]; b=p[2]; }
    return (kleurCache[v]=PDFLib.rgb(r,g,b));
  }

  /* Functionele kleuren staan los van de huisstijl: de rode voedingsstip en de
     polariteitslijn zijn signaalkleuren in een technische tekening, geen
     merkkleur. De thema-afhankelijke velden worden door zetThema() gevuld. */
  const C={grey:'#5B677E', grijs:'#5B677E', rail:'#B7C0CE', red:'#D6362B', mount:'#98A6BC',
    wit:'#FFFFFF', zwart:'#000000', voet:'#EBEBEC',
    hoofd:'', hoofd2:'', hoofdDiep:'', tekst:'', lt:'', shade:'', line:''};
  let thema=null;
  function zetThema(k){
    thema=THEMAS[k];
    C.hoofd=thema.hoofd; C.hoofd2=thema.hoofd2; C.hoofdDiep=thema.hoofdDiep; C.tekst=thema.tekst;
    C.lt=thema.lt; C.shade=thema.shade; C.line=thema.line;
  }
  zetThema('distrilight');

  /* Logo's als afbeelding. Ontbreekt er een, dan valt logo() terug op de naam in
     letters, zodat de PDF er altijd uitkomt. */
  const LOGO={};
  for(const sleutel of (opt.logos||[])){
    if(!merk.logos[sleutel]) continue;
    try{ LOGO[sleutel]=await doc.embedPng(b64Bytes(merk.logos[sleutel])); }
    catch(err){ console.warn('Logo "'+sleutel+'" kon niet worden ingesloten:', err && err.message); }
  }
  /* Het type wordt uit de eerste bytes afgeleid, zodat zowel PNG als JPEG kan.
     Ook bruikbaar voor beeld dat de gebruiker zelf aanlevert. */
  async function sluitBeeldIn(bytes){
    const isPng = bytes[0]===0x89 && bytes[1]===0x50 && bytes[2]===0x4E && bytes[3]===0x47;
    const isJpg = bytes[0]===0xFF && bytes[1]===0xD8;
    if(isPng) return doc.embedPng(bytes);
    if(isJpg) return doc.embedJpg(bytes);
    throw new Error('geen PNG of JPEG');
  }
  const BEELD={};
  for(const sleutel of (opt.beelden||[])){
    if(!merk.beelden[sleutel]) continue;
    try{ BEELD[sleutel]=await sluitBeeldIn(b64Bytes(merk.beelden[sleutel])); }
    catch(err){ console.warn('Beeld "'+sleutel+'" kon niet worden ingesloten:', err && err.message); }
  }

  /* ---------- primitieven ---------- */

  /* cond = een kop. Welk kop-lettertype dat is hangt af van het actieve thema:
     Distrilight-pagina's gebruiken Poppins, Pragmalux-pagina's het echte smalle
     Sofia Sans Extra Condensed. Zonder ingesloten lettertypen valt alles terug op
     Helvetica die kunstmatig versmald wordt, zoals vroeger. Daarom wordt hz alleen
     ingezet als terugval. */
  function kiesFont(opt){
    if(opt.cond){
      const dl = thema===THEMAS.distrilight;
      return opt.bold===false ? (dl?FONT.dlKopLicht:FONT.kopLicht) : (dl?FONT.dlKopVet:FONT.kopVet);
    }
    return opt.bold ? FONT.bold : FONT.reg;
  }
  /* Zet tekst neer en geeft de gebruikte breedte terug. pushOperators omdat pdf-lib
     de horizontale samenknijping (cond) en de letterspatiering niet aanbiedt. */
  function text(x,yt,size,str,opt){ opt=opt||{};
    const pg=haalPg();
    const s=pdfTxt(str);
    const f=kiesFont(opt);
    const hz=(opt.cond && !eigenKop) ? 84 : 100, tc=opt.tc||0;
    /* echte breedte incl. horizontale schaling en letterspatiering */
    const w=f.widthOfTextAtSize(s,size)*hz/100 + s.length*tc;
    let xx=x; if(opt.align==='center')xx=x-w/2; else if(opt.align==='right')xx=x-w;
    pg.setFont(f);
    const key=pg.getFont()[1];
    const c=col(opt.color||'#000000');
    pg.pushOperators(
      PDFLib.pushGraphicsState(), PDFLib.beginText(),
      PDFLib.setFontAndSize(key,size),
      PDFLib.setCharacterSqueeze(hz), PDFLib.setCharacterSpacing(tc),
      PDFLib.setFillingRgbColor(c.red,c.green,c.blue),
      PDFLib.setTextMatrix(1,0,0,1,xx,H-yt-size*0.78),
      PDFLib.showText(f.encodeText(s)),
      PDFLib.endText(), PDFLib.popGraphicsState());
    return w;
  }
  /* Breedte van een stuk tekst zonder het te tekenen. */
  function meet(str,size,opt){ opt=opt||{};
    const s=pdfTxt(str), f=kiesFont(opt);
    const hz=(opt.cond && !eigenKop) ? 84 : 100;
    return f.widthOfTextAtSize(s,size)*hz/100 + s.length*(opt.tc||0);
  }
  function line(x1,y1,x2,y2,lw,color,round){
    haalPg().drawLine({start:{x:x1,y:H-y1}, end:{x:x2,y:H-y2}, thickness:lw,
      color:col(color||'#000000'), lineCap: round?PDFLib.LineCapStyle.Round:PDFLib.LineCapStyle.Butt});
  }
  function rect(x,yt,w,h,fill,stroke,lw){
    /* Zonder vul- of lijnkleur tekent pdf-lib een ZWART vlak. Dat is bijna nooit de
       bedoeling, dus dan liever niets tekenen. */
    if(!fill && !stroke) return;
    const o={x:x, y:H-yt-h, width:w, height:h};
    if(fill) o.color=col(fill);
    if(stroke){ o.borderColor=col(stroke); o.borderWidth=lw||0.8; }
    else o.borderWidth=0;
    haalPg().drawRectangle(o);
  }
  function circle(cx,cyT,r,fill,stroke,lw){
    const o={x:cx, y:H-cyT, size:r};
    if(fill) o.color=col(fill);
    if(stroke){ o.borderColor=col(stroke); o.borderWidth=lw||1; }
    haalPg().drawCircle(o);
  }
  function poly(pts,fill){
    /* pdf-lib kent geen veelhoek; via een SVG-pad met absolute coordinaten. */
    const d='M '+pts.map(p=>p[0]+' '+p[1]).join(' L ')+' Z';
    haalPg().drawSvgPath(d,{x:0, y:H, color:col(fill), borderWidth:0});
  }
  function dots(x0,y0,w,h,step,color){
    for(let dx=0;dx<w;dx+=step) for(let dy=0;dy<h;dy+=step) circle(x0+dx,y0+dy,0.9,color);
  }
  /* Tekent binnen een uitsnede: alles wat tekenen() buiten de veelhoek zet, valt weg. */
  function metUitsnede(punten, tekenen){
    const pg=haalPg();
    pg.pushOperators(PDFLib.pushGraphicsState(),
      PDFLib.moveTo(punten[0][0], H-punten[0][1]),
      ...punten.slice(1).map(pt=>PDFLib.lineTo(pt[0], H-pt[1])),
      PDFLib.closePath(), PDFLib.clip(), PDFLib.endPath());
    tekenen();
    pg.pushOperators(PDFLib.popGraphicsState());
  }
  /* schaalt het beeld zo dat het het vlak vult en snijdt de rest weg */
  function beeldVullend(img, x, yt, w, h){
    const s=Math.max(w/img.width, h/img.height);
    const bw=img.width*s, bh=img.height*s;
    haalPg().drawImage(img, {x:x-(bw-w)/2, y:H-yt-h-(bh-h)/2, width:bw, height:bh});
  }
  /* Twee kleuren mengen, t=0 geeft a, t=1 geeft b. */
  function meng(a,b,t){
    const h=v=>[1,3,5].map(i=>parseInt(v.substr(i,2),16));
    const A=h(a), B=h(b);
    return '#'+[0,1,2].map(i=>Math.round(A[i]+(B[i]-A[i])*t).toString(16).padStart(2,'0')).join('').toUpperCase();
  }

  /* ---------- tekst afbreken ---------- */

  /* Breekt af op echte breedte in plaats van op een geschat aantal tekens. Een woord
     dat zelf al te breed is blijft staan - beter een regel die uitsteekt dan een
     afgekapte projectnaam. */
  function wrapBreedte(s,maxW,size,opt){
    const woorden=String(s).split(/\s+/).filter(Boolean); const regels=[]; let cur='';
    woorden.forEach(w=>{
      const kandidaat = cur ? cur+' '+w : w;
      if(cur && meet(kandidaat,size,opt)>maxW){ regels.push(cur); cur=w; }
      else cur=kandidaat;
    });
    if(cur) regels.push(cur);
    return regels;
  }
  /* Oudere, grovere variant: afbreken op een aantal tekens. Blijft in gebruik waar
     de precieze breedte niet uitmaakt (para). */
  function wrapTekens(s,maxChars){
    const words=String(s).split(' '); const lines=[]; let cur='';
    words.forEach(wd=>{ if((cur+' '+wd).trim().length>maxChars){ lines.push(cur.trim()); cur=wd; } else cur+=' '+wd; });
    if(cur.trim()) lines.push(cur.trim());
    return lines;
  }

  /* ---------- logo ---------- */

  function logoBreedte(hoogte){ return hoogte*thema.logoRatio; }
  function logo(x,yt,hoogte,opDonker){
    const img = LOGO[opDonker ? thema.logoLicht : thema.logoDonker];
    const breedte = logoBreedte(hoogte);
    if(img){
      haalPg().drawImage(img, {x:x, y:H-yt-hoogte, width:breedte, height:hoogte});
    } else {
      /* terugval als het logobestand ontbreekt */
      text(x,yt,hoogte*0.8,thema.naam,{bold:true,color:opDonker?C.wit:C.hoofd});
    }
    return breedte;
  }

  /* ---------- pagina's ---------- */

  let sectie = opt.sectie || '';
  function zetSectie(s){ sectie=s; }

  /* Geen doorlopende balk maar een lichte schuine vorm rechtsonder (40% kleiner dan
     de oorspronkelijke maat), in een vaste lichtgrijze tint (dus niet thema-
     afhankelijk, i.t.t. de rest van de opmaak). De onderste linkerpunt loopt door
     tot de linkermarge (waar de tabel begint); de bovenste punt zit op dezelfde
     afstand ervan als in de oorspronkelijke vorm, zodat de afsnijvorm (de schuine
     snede) hetzelfde blijft. Geen paginanummer op deze vorm. */
  function voet(){
    const vSchaal=0.6, vH=52*vSchaal, vBreed=128*vSchaal, vSmal=92*vSchaal, vTopY=H-vH;
    const afstand=vBreed-vSmal, onderX=Mg, bovenX=onderX+afstand;
    poly([[W,vTopY],[bovenX,vTopY],[onderX,H],[W,H]], C.voet);
  }
  function flush(kaal){ if(!kaal) voet(); }
  function contHeader(){
    let y=haalY();
    text(Mg,y,13,sectie.toUpperCase(),{bold:true,cond:true,color:C.hoofd});
    /* onderlangs uitlijnen op de titel, want de twee logo's verschillen van hoogte */
    const lh=thema.kopHoogte; logo(W-Mg-logoBreedte(lh), 58-lh, lh, false);
    y+=22; line(Mg,y,W-Mg,y,1.1,C.hoofd); y+=14;
    zetY(y);
  }
  function beginPage(first){
    const pg=doc.addPage([W,H]); zetPg(pg); paginas.push(pg); zetY(Mg);
    if(!first) contHeader();
  }
  function need(h){ if(haalY()+h>H-MB){ flush(); beginPage(false); } }
  function para(t,size,color){
    wrapTekens(t, Math.floor((W-2*Mg)/((size||8.5)*0.48))).forEach(l=>{
      need(12); text(Mg,haalY(),size||8.5,l,{color:color||'0 0 0'}); zetY(haalY()+11.5);
    });
    zetY(haalY()+3);
  }
  /* Blauwe kopbalk met ruitpatroon, voor een pagina die met een titel begint. */
  function paginaKop(titel, onderschrift){
    rect(0,0,W,BALK_H,C.hoofd);
    if(BEELD.ruitpatroon){
      /* Het vel is op A4-verhouding; op paginabreedte geschaald valt de bovenkant
         binnen de balk. Wat eronder uitsteekt wordt door de witte pagina afgedekt. */
      const ph = W / (BEELD.ruitpatroon.width / BEELD.ruitpatroon.height);
      haalPg().drawImage(BEELD.ruitpatroon, {x:0, y:H-ph, width:W, height:ph});
      rect(0,BALK_H,W,H-BALK_H,C.wit);
    }
    text(Mg,30,25,String(titel).toUpperCase(),{bold:true,cond:true,color:C.wit});
    if(onderschrift) text(Mg,55,10,onderschrift,{color:C.lt});
    zetY(BALK_H+38);
  }

  /* Het voorblad. project = {naam, nr, inst, datum}, met datum als kant-en-klare
     tekst: de tools maken die verschillend op en dat blijft aan hen. */
  function omslag(project){
    project = project || {};
    beginPage(true);
    const bovenH=357, fotoY=357, fotoH=210;

    /* Is er een volledig voorblad aangeleverd, dan is dat het ontwerp en zetten we er
       alleen de projectgegevens overheen. Dat is de betrouwbaarste weg naar precies
       de huisstijl: geen namaak van patroon en fotostrook. */
    const heel = !!BEELD.omslagVolledig;
    if(heel){
      beeldVullend(BEELD.omslagVolledig, 0, 0, W, H);
    } else {
      if(BEELD.omslagBoven){
        /* Bovenblok (ruitpatroon + fotostrook) over de volle breedte. De hoogte volgt
           uit het beeld zelf, zodat er niets uitgerekt wordt. */
        const bh = W / (BEELD.omslagBoven.width / BEELD.omslagBoven.height);
        haalPg().drawImage(BEELD.omslagBoven, {x:0, y:H-bh, width:W, height:bh});
      } else {
        /* terugval zonder beeld: rustig driehoekpatroon in tinten die dicht bij elkaar
           liggen. Bewust ingetogen - dit is een plaatsvervanger, geen ontwerp. */
        rect(0,0,W,bovenH,C.hoofd);
        const tinten=[C.hoofd, meng(C.hoofd,C.wit,0.10), meng(C.hoofd,C.wit,0.18), meng(C.hoofd,C.zwart,0.10)];
        const stap=119;
        for(let rij=0, ry=0; ry<bovenH; rij++, ry+=stap){
          for(let kol=0, rx=0; rx<W; kol++, rx+=stap){
            /* vaste afwisseling, geen toeval: dezelfde invoer moet dezelfde PDF geven */
            poly([[rx,ry],[rx+stap,ry],[rx,ry+stap]], tinten[(rij*3+kol*2)%4]);
            poly([[rx+stap,ry],[rx+stap,ry+stap],[rx,ry+stap]], tinten[(rij*3+kol*2+1)%4]);
          }
        }
        rect(0,fotoY,W,fotoH,meng(C.hoofd,C.wit,0.14));
      }

      /* schuine balk waar de projectnaam in komt - zelfde hoek als de schuine kant
         van het logovlak rechtsonder (34pt over 70pt hoogte), zodat de twee sneden in
         de huisstijl met elkaar overeenkomen in plaats van toevallig verschillend. */
      const titelY0=99, titelY1=226;
      const schuineHoek=34/70;
      const titelSchuin=(titelY1-titelY0)*schuineHoek;
      poly([[0,titelY0],[378,titelY0],[378-titelSchuin,titelY1],[0,titelY1]], C.hoofdDiep);

      /* logovlak rechtsonder, doorlopend tot de paginarand */
      poly([[361+34,716],[W,716],[W,786],[361,786]], C.hoofd);
      const lh=70;
      logo(W-logoBreedte(lh)-30, 716+(70-lh)/2, lh, true);
    }

    /* projectnaam in de balk - maximaal 3 regels, anders loopt hij eruit. Breedte is
       gebaseerd op de onderste (smalste) regel, want de balk versmalt door de schuine
       kant hierboven - bij een bredere maat zou de laatste regel erover heen lopen. */
    const naam=(project.naam||'').trim() || 'Projectnaam';
    const regels=wrapBreedte(naam, 260, 20, {bold:true,cond:true}).slice(0,3);
    let ty=128;
    regels.forEach(r=>{ text(45,ty,20,r,{bold:true,cond:true,color:C.wit}); ty+=36; });

    /* projectgegevens linksonder */
    const veld=(label,waarde,dy)=>{
      const b=meet(label+' ',8.5,{});
      text(38,748+dy,8.5,label,{color:C.zwart});
      text(38+b,748+dy,8.5,waarde||'-',{bold:true,color:C.zwart});
    };
    veld('Projectnummer:', (project.nr||'').trim(), 0);
    veld('Installateur:',  (project.inst||'').trim(), 14.5);
    veld('Datum:',         project.datum, 29);

    flush(true); /* geen voetvorm op het voorblad */
  }

  /* ---------- tabellen ---------- */

  function tableStart(cols){ const totW=cols.reduce((s,c)=>s+c.w,0);
    need(20); let x=Mg; const y=haalY(); rect(Mg,y,totW,15,C.hoofd);
    cols.forEach(c=>{ text(x+5,y+2.6,8.5,c.h,{bold:true,color:C.wit}); x+=c.w; });
    zetY(y+15); return {cols,totW,i:0};
  }
  function wrapCell(str,w){
    const words=String(str==null?'':str).split(' ');
    const lines=[]; let cur='';
    words.forEach(wd=>{
      const test=cur?cur+' '+wd:wd;
      if(FONT.reg.widthOfTextAtSize(test,8.5)>w && cur){ lines.push(cur); cur=wd; }
      else cur=test;
    });
    lines.push(cur);
    return lines;
  }
  function tableRow(T,vals){
    const lineH=11;
    const cellLines=T.cols.map((c,j)=>wrapCell(vals[j],c.w-10));
    const nLines=Math.max.apply(null,cellLines.map(l=>l.length));
    const rowH=13.5+(nLines-1)*lineH;
    let y=haalY();
    if(y+rowH>H-MB){ flush(); beginPage(false); y=haalY();
      let x=Mg; rect(Mg,y,T.totW,15,C.hoofd);
      T.cols.forEach(c=>{ text(x+5,y+2.6,8.5,c.h,{bold:true,color:C.wit}); x+=c.w; }); y+=15; }
    if(T.i%2===0) rect(Mg,y,T.totW,rowH,C.shade);
    let x=Mg;
    T.cols.forEach((c,j)=>{ cellLines[j].forEach((ln,li)=>text(x+5,y+2.4+li*lineH,8.5,ln,{color:C.tekst})); x+=c.w; });
    line(Mg,y+rowH,Mg+T.totW,y+rowH,0.5,C.line);
    T.i++; zetY(y+rowH);
  }

  return {
    /* maten */
    W, H, Mg, MB, BALK_H,
    /* huisstijl */
    C, FONT, LOGO, BEELD, THEMAS, zetThema, get thema(){ return thema; }, get eigenKop(){ return eigenKop; },
    /* primitieven */
    col, kiesFont, text, meet, line, rect, circle, poly, dots,
    metUitsnede, beeldVullend, meng, sluitBeeldIn,
    /* tekst */
    wrapBreedte, wrapTekens, pdfTxt, datumNL,
    /* pagina's */
    logo, logoBreedte, voet, flush, contHeader, beginPage, need, para,
    paginaKop, omslag, zetSectie, paginas,
    /* tabellen */
    tableStart, wrapCell, tableRow,
  };
}

window.PdfHuisstijl = {
  laadScript, laadPresenterBestand, merkData, b64Bytes, bytesToB64,
  presenterAanwezig, presenterData, pdfTxt, datumNL, THEMAS, tekenaar,
};
})();
