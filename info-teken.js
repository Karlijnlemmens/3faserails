/* Informatieteken - gedeeld door de tools van de suite.

   Een klein rondje met een i achter een veldnaam of een kop. Ga je er met de muis
   overheen (of spring je er met tab naartoe), dan verschijnt de toelichting; klik
   je erop, dan gaat diezelfde toelichting groot open in een nieuw tabblad - handig
   voor een foto of een schema dat in een ballonnetje toch te klein blijft.

   Gebruik, vanuit javascript:

     InfoTeken.zet(kop, {titel:'Lichtvlakken', tekst:'Wat het is…'});
     const t = InfoTeken.maak({...});   // geeft het element terug, zet het zelf neer

   of zonder javascript, rechtstreeks in de opmaak:

     <span data-info="Wat het is…" data-info-titel="Lichtvlakken"></span>

   InfoTeken.scan() maakt daar tekens van; dat gebeurt vanzelf zodra de pagina
   geladen is, en nog eens als je hem zelf aanroept na het bijtekenen van een stuk
   scherm.

   De opties:

     titel       kop boven de toelichting en de titel van het tabblad
     tekst       een alinea, of een lijst alinea's
     lijst       opsommingstekens onder de tekst
     beeld       een afbeelding: data-URI of pad. In de ballon klein, in het
                 tabblad op volle breedte
     bijschrift  regel onder het beeld
     breed       breedte van de ballon in px (standaard 280)

   Alles wordt als tekst behandeld en ontsnapt; er gaat dus geen opmaak in mee.
   Dat is met opzet: de teksten komen uit de tools zelf en een halve html-editor
   in een tooltip levert alleen maar kapotte ballonnen op.

   Laden: een gewoon <script src="info-teken.js">; geen module, want die weigert te
   laden als een tool vanaf schijf (file://) wordt geopend. Het bestand brengt zijn
   eigen opmaak mee, zodat een tool alleen deze regel hoeft toe te voegen. */
(function(){
'use strict';

/* De kleuren komen uit de huisstijlvariabelen van de tool waar het teken in staat;
   de terugval erachter houdt hem heel op een pagina die ze niet zet. */
const STIJL = `
.infoteken{
  display:inline-flex; align-items:center; justify-content:center;
  width:15px; height:15px; padding:0; margin:0 0 0 5px; vertical-align:middle;
  border:1px solid var(--blue, #3E8EDE); border-radius:50%;
  background:var(--white, #fff); color:var(--blue-dark, #2C72BA);
  font-family:'Nunito Sans', system-ui, sans-serif; font-size:10px; font-weight:800;
  line-height:1; cursor:help; flex:none; transition:.12s;
}
.infoteken:hover, .infoteken:focus-visible{
  background:var(--blue, #3E8EDE); color:#fff; outline:none;
}
.infoteken-ballon{
  position:fixed; z-index:400; display:none; pointer-events:none;
  background:var(--white, #fff); color:var(--ink, #1C2534);
  border:1px solid var(--border, #DCE6F2); border-radius:10px;
  box-shadow:0 6px 24px rgba(30,42,74,.18);
  padding:10px 12px; font-family:'Nunito Sans', system-ui, sans-serif;
  font-size:12px; line-height:1.45;
}
.infoteken-ballon.aan{display:block;}
.infoteken-ballon h4{
  margin:0 0 5px; font-size:12px; font-weight:800; color:var(--navy-900, #1E2A4A);
}
.infoteken-ballon p{margin:0 0 6px;}
.infoteken-ballon p:last-child{margin-bottom:0;}
.infoteken-ballon ul{margin:0 0 6px; padding-left:16px;}
.infoteken-ballon li{margin-bottom:2px;}
.infoteken-ballon img{
  display:block; width:100%; max-height:150px; object-fit:contain;
  border:1px solid var(--border, #DCE6F2); border-radius:7px; margin:6px 0 0; background:#fff;
}
.infoteken-ballon .infoteken-bij{
  font-size:11px; color:var(--slate, #5A6B84); margin:4px 0 0;
}
.infoteken-ballon .infoteken-meer{
  font-size:11px; color:var(--slate, #5A6B84); margin:7px 0 0;
  border-top:1px solid var(--border, #DCE6F2); padding-top:5px;
}
`;

let ballon = null;

function opmaakEenmalig(){
  if(document.getElementById('infoteken-stijl')) return;
  const st = document.createElement('style');
  st.id = 'infoteken-stijl';
  st.textContent = STIJL;
  document.head.appendChild(st);
}

/* Eén ballon voor alle tekens samen, en aan <body> in plaats van naast het teken:
   anders knipt de eerste kaart of tabelcel met overflow hem af. */
function ballonVak(){
  if(ballon && ballon.isConnected) return ballon;
  ballon = document.createElement('div');
  ballon.className = 'infoteken-ballon';
  document.body.appendChild(ballon);
  return ballon;
}

function alinea(tekst){
  return Array.isArray(tekst) ? tekst.filter(Boolean) : (tekst ? [tekst] : []);
}
function esc(t){
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                  .replace(/"/g,'&quot;');
}

/* De inhoud van ballon en tabblad komt uit dezelfde opbouw, zodat het tabblad
   nooit iets anders zegt dan het ballonnetje. */
function inhoudHtml(opt, groot){
  const stuk = [];
  if(opt.titel) stuk.push('<h4>' + esc(opt.titel) + '</h4>');
  alinea(opt.tekst).forEach(function(t){ stuk.push('<p>' + esc(t) + '</p>'); });
  if(opt.lijst && opt.lijst.length){
    stuk.push('<ul>' + opt.lijst.map(function(r){ return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>');
  }
  if(opt.beeld){
    stuk.push('<img src="' + esc(opt.beeld) + '" alt="' + esc(opt.titel || '') + '">');
    if(opt.bijschrift) stuk.push('<p class="infoteken-bij">' + esc(opt.bijschrift) + '</p>');
  }
  if(!groot) stuk.push('<p class="infoteken-meer">Klik voor een grotere weergave.</p>');
  return stuk.join('');
}

/* Naast het teken, en anders eronder of erboven - net wat past. position:fixed,
   dus de maten van getBoundingClientRect kunnen zo gebruikt worden. */
function plaats(teken, vak){
  const marge = 8;
  const t = teken.getBoundingClientRect();
  const b = vak.getBoundingClientRect();
  let x = t.left;
  let y = t.bottom + 6;
  if(x + b.width > window.innerWidth - marge) x = window.innerWidth - marge - b.width;
  if(x < marge) x = marge;
  if(y + b.height > window.innerHeight - marge && t.top - 6 - b.height > marge){
    y = t.top - 6 - b.height;
  }
  if(y < marge) y = marge;
  vak.style.left = Math.round(x) + 'px';
  vak.style.top  = Math.round(y) + 'px';
}

function toon(teken, opt){
  opmaakEenmalig();
  const vak = ballonVak();
  vak.style.width = (opt.breed || 280) + 'px';
  vak.innerHTML = inhoudHtml(opt, false);
  vak.classList.add('aan');
  /* Eerst tonen, dan pas plaatsen: zonder afmetingen valt er niets te rekenen. */
  plaats(teken, vak);
}
function verberg(){
  if(ballon) ballon.classList.remove('aan');
}

/* Het tabblad is een op zichzelf staand documentje in een blob-URL. Een nieuw
   venster beschrijven met document.write mag niet meer overal vanaf file://;
   een blob wel, en die blijft ook staan als je hem later nog eens ververst. */
function openTab(opt){
  const doc =
    '<!doctype html><html lang="nl"><head><meta charset="utf-8">' +
    '<title>' + esc(opt.titel || 'Informatie') + '</title>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">' +
    '<link href="https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;700;800&display=swap" rel="stylesheet">' +
    '<style>' +
    'body{margin:0; background:#F3F7FC; color:#1C2534;' +
    " font-family:'Nunito Sans',system-ui,sans-serif; line-height:1.5;}" +
    'main{max-width:760px; margin:0 auto; padding:32px 24px 60px;}' +
    '.kaart{background:#fff; border:1px solid #DCE6F2; border-radius:14px; padding:24px 26px;}' +
    'h1{font-size:20px; font-weight:800; color:#1E2A4A; margin:0 0 14px;}' +
    'p{margin:0 0 10px; font-size:14px;}' +
    'ul{margin:0 0 10px; padding-left:20px; font-size:14px;}' +
    'li{margin-bottom:4px;}' +
    'img{display:block; width:100%; height:auto; margin:16px 0 0;' +
    ' border:1px solid #DCE6F2; border-radius:10px; background:#fff;}' +
    '.infoteken-bij{font-size:12px; color:#5A6B84; margin-top:6px;}' +
    'h4{display:none;}' +   /* de kop staat hierboven al als h1 */
    '</style></head><body><main><div class="kaart">' +
    '<h1>' + esc(opt.titel || 'Informatie') + '</h1>' +
    inhoudHtml(opt, true) +
    '</div></main></body></html>';
  const url = URL.createObjectURL(new Blob([doc], {type:'text/html'}));
  const venster = window.open(url, '_blank');
  if(!venster) alert('Het tabblad kon niet worden geopend; sta pop-ups toe voor deze pagina.');
  /* Pas intrekken als het tabblad hem geladen heeft - meteen intrekken geeft een
     lege pagina. */
  setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
}

function maak(opt){
  opt = opt || {};
  opmaakEenmalig();
  const teken = document.createElement('button');
  teken.type = 'button';
  teken.className = 'infoteken';
  teken.textContent = 'i';
  teken.setAttribute('aria-label', 'Meer over ' + (opt.titel || 'dit veld'));
  teken.title = '';   /* geen tweede, dubbele tooltip van de browser zelf */
  teken.addEventListener('mouseenter', function(){ toon(teken, opt); });
  teken.addEventListener('mouseleave', verberg);
  teken.addEventListener('focus',      function(){ toon(teken, opt); });
  teken.addEventListener('blur',       verberg);
  teken.addEventListener('click', function(e){
    e.preventDefault();
    e.stopPropagation();
    verberg();
    openTab(opt);
  });
  return teken;
}

function zet(doel, opt){
  if(!doel) return null;
  const teken = maak(opt);
  doel.appendChild(teken);
  return teken;
}

/* Tekens uit de opmaak: <span data-info="…" data-info-titel="…" data-info-lijst="a|b">.
   Het element zelf wordt vervangen, zodat een tweede scan niets dubbel doet. */
function scan(wortel){
  const vanaf = wortel || document;
  Array.prototype.forEach.call(vanaf.querySelectorAll('[data-info]'), function(n){
    const opt = {
      titel:      n.getAttribute('data-info-titel') || '',
      tekst:      (n.getAttribute('data-info') || '').split('|'),
      lijst:      (n.getAttribute('data-info-lijst') || '').split('|').filter(Boolean),
      beeld:      n.getAttribute('data-info-beeld') || '',
      bijschrift: n.getAttribute('data-info-bijschrift') || '',
      breed:      parseInt(n.getAttribute('data-info-breed'), 10) || 0,
    };
    n.parentNode.replaceChild(maak(opt), n);
  });
}

/* Bij het scrollen of het verkleinen van het venster klopt de plek niet meer; hem
   dan maar weghalen in plaats van hem verkeerd laten staan. */
window.addEventListener('scroll', verberg, true);
window.addEventListener('resize', verberg);
document.addEventListener('keydown', function(e){ if(e.key === 'Escape') verberg(); });

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', function(){ scan(); });
} else {
  scan();
}

window.InfoTeken = {maak:maak, zet:zet, scan:scan, toon:toon, verberg:verberg, open:openTab};
})();
