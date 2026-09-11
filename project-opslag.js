/* Werk bewaren - gedeeld door de tools van de suite.

   "Project opslaan" bakt het werk in een kopie van de tool zelf; dat blijft de
   manier om een project te bewaren en door te sturen. Maar dat is een bewuste
   handeling, en juist die vergeet je als je in het werk zit: één verkeerd gesloten
   tabblad en een intake van twintig posities is weg. Dit bestand vult dat gat met
   drie dingen die niets van de tool hoeven te weten:

     1. elke wijziging gaat (afgeremd) naar localStorage van deze browser;
     2. is er bij het openen werk blijven staan, dan biedt een balk bovenin aan het
        terug te halen;
     3. wie de pagina sluit met onopgeslagen werk krijgt de vraag van de browser.

   Gebruik, één keer per tool, nadat de staat is opgebouwd:

     ProjectOpslag.koppel({
       sleutel:     'armaturenboek',       // eigen hoekje in localStorage
       versie:      1,                     // zelfde nummer als in het opgeslagen bestand
       naam:        'het armaturenboek',   // hoe de tool in een melding heet
       maakPayload: () => ({st: ...}),     // precies wat "Project opslaan" wegschrijft
       herstel:     (payload) => {...},    // en hoe dat terugkomt
       isLeeg:      () => boolean,         // staat er nog niets ingevuld?
       omschrijf:   () => 'Hoofdstraat 12',// optioneel: wat er in de balk komt te staan
       licht:       (payload) => payload,  // optioneel: kleinere versie, zie hieronder
     });

   Daarna roept de tool ProjectOpslag.gewijzigd() aan waar hij nu al zijn scherm
   ververst, en ProjectOpslag.bewaard() zodra het werk in een bestand staat.

   Over 'licht': localStorage houdt ongeveer 5 MB per herkomst, en een geüploade
   presenter-PDF of een geplakte foto is zo een paar MB. Past de payload niet, dan
   wordt 'licht' geprobeerd - die laat het zware materiaal eruit - en anders stopt
   het bewaren stilletjes. Het bestand dat "Project opslaan" maakt kent die grens
   niet en houdt dus alles.

   Laden: een gewoon <script src="project-opslag.js">; geen module, want die weigert
   te laden vanaf schijf (file://). Het bestand brengt zijn eigen opmaak mee. */
(function(){
'use strict';

const VOORVOEGSEL = 'distrilight:';
const WACHT = 1000;          /* ms na de laatste wijziging voor we wegschrijven */

const STIJL = `
.opslagbalk{
  position:sticky; top:0; z-index:130; display:flex; align-items:center; gap:12px;
  flex-wrap:wrap; padding:10px 16px; margin:0 0 4px;
  background:var(--blue-light, #EAF3FC); border-bottom:1px solid var(--border, #DCE6F2);
  font-family:'Nunito Sans', system-ui, sans-serif; font-size:13px; color:var(--ink, #1C2534);
}
.opslagbalk b{font-weight:800;}
.opslagbalk .tijd{color:var(--slate, #5A6B84);}
.opslagbalk .knoppen{display:flex; gap:8px; margin-left:auto;}
.opslagbalk button{
  border:1.5px solid var(--border, #DCE6F2); background:var(--white, #fff);
  color:var(--blue-dark, #2C72BA); border-radius:999px; padding:7px 14px;
  font-family:inherit; font-size:12.5px; font-weight:800; cursor:pointer;
}
.opslagbalk button.hoofd{background:var(--blue, #3E8EDE); border-color:var(--blue, #3E8EDE); color:#fff;}
.opslagbalk button:hover{border-color:var(--blue, #3E8EDE);}
`;

let opt = null;          /* wat de tool heeft meegegeven */
let vuil = false;        /* is er werk dat nog in geen enkel bestand staat? */
let stopMetBewaren = false;
let teller = null;

function opmaakEenmalig(){
  if(document.getElementById('opslagbalk-stijl')) return;
  const st = document.createElement('style');
  st.id = 'opslagbalk-stijl';
  st.textContent = STIJL;
  document.head.appendChild(st);
}

function sleutel(){ return VOORVOEGSEL + opt.sleutel; }

function tijdTekst(ms){
  const d = new Date(ms), nu = new Date();
  const klok = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  const zelfdeDag = d.toDateString() === nu.toDateString();
  if(zelfdeDag) return 'vandaag ' + klok;
  const dag = String(d.getDate()).padStart(2,'0') + '-' + String(d.getMonth()+1).padStart(2,'0');
  return dag + ' ' + klok;
}

/* ---------------- wegschrijven ---------------- */

function schrijf(){
  if(!opt || stopMetBewaren) return;
  let payload;
  try{ payload = opt.maakPayload(); }catch(err){ return; }   /* halve staat: volgende keer beter */
  const omslag = {
    versie: opt.versie,
    tijd: Date.now(),
    omschrijving: (opt.omschrijf && opt.omschrijf()) || '',
    payload,
  };
  if(probeer(omslag)) return;
  /* Te groot: nog eens zonder het zware materiaal. */
  if(opt.licht){
    try{
      omslag.payload = opt.licht(payload);
      omslag.afgeslankt = true;
      if(probeer(omslag)) return;
    }catch(err){ /* dan niet */ }
  }
  /* Niet gelukt. Niet elke toetsaanslag opnieuw proberen: dat kost alleen tijd. */
  stopMetBewaren = true;
  try{ localStorage.removeItem(sleutel()); }catch(err){ /* ook goed */ }
  console.warn('Automatisch bewaren staat uit: het project past niet in de opslag van de browser. '
             + '"Project opslaan" werkt gewoon.');
}
function probeer(omslag){
  try{ localStorage.setItem(sleutel(), JSON.stringify(omslag)); return true; }
  catch(err){ return false; }
}

function gewijzigd(){
  if(!opt) return;
  vuil = true;
  clearTimeout(teller);
  teller = setTimeout(schrijf, WACHT);
}

/* Het werk staat in een bestand: niets meer om voor te waarschuwen, en het
   bewaarde hoekje mag leeg. */
function bewaard(){
  vuil = false;
  clearTimeout(teller);
  try{ localStorage.removeItem(sleutel()); }catch(err){ /* niets aan te doen */ }
}

/* ---------------- terughalen ---------------- */

function lees(){
  try{
    const ruw = localStorage.getItem(sleutel());
    if(!ruw) return null;
    const omslag = JSON.parse(ruw);
    return (omslag && omslag.payload) ? omslag : null;
  }catch(err){ return null; }
}

function balk(omslag){
  opmaakEenmalig();
  const vak = document.createElement('div');
  vak.className = 'opslagbalk';
  const wat = omslag.omschrijving ? ' van ' + omslag.omschrijving : '';
  vak.innerHTML =
    '<span><b>Er staat nog werk open</b>' + esc(wat)
    + ' <span class="tijd">— laatst gewijzigd ' + esc(tijdTekst(omslag.tijd))
    + (omslag.afgeslankt ? ', zonder de geüploade bestanden' : '') + '.</span></span>'
    + '<span class="knoppen"><button type="button" class="hoofd">Verder waar je gebleven was</button>'
    + '<button type="button">Weggooien</button></span>';
  const [door, weg] = vak.querySelectorAll('button');
  door.addEventListener('click', ()=>{
    try{ opt.herstel(omslag.payload); }
    catch(err){
      console.error('Terughalen mislukt:', err);
      alert('Het bewaarde werk kon niet worden teruggehaald: ' + (err && err.message ? err.message : err));
    }
    vak.remove();
  });
  weg.addEventListener('click', ()=>{
    try{ localStorage.removeItem(sleutel()); }catch(err){ /* laat maar */ }
    vak.remove();
  });
  document.body.insertBefore(vak, document.body.firstChild);
}
function esc(t){
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ---------------- versies ---------------- */

/* Het versienummer stond al in elk opgeslagen bestand maar werd nergens gelezen.
   Verandert de vorm van de staat, dan hoort hier een migratie te komen; tot die tijd
   is dit vooral een nette melding in plaats van een half ingevuld scherm. */
function controleer(payload, versie, naam){
  if(!payload || typeof payload !== 'object') return false;
  const gevonden = Number(payload.versie || 1);
  if(gevonden > Number(versie)){
    alert('Dit bestand is opgeslagen met een nieuwere versie van ' + (naam || 'deze tool') + ' '
        + '(versie ' + gevonden + ', deze tool kent ' + versie + '). '
        + 'Het wordt wel geopend, maar er kan informatie ontbreken.');
  }
  return true;
}

/* ---------------- koppelen ---------------- */

function koppel(instellingen){
  opt = instellingen;
  /* Alleen aanbieden als de tool zelf leeg opent: een dubbelgeklikt projectbestand
     komt al ingevuld binnen, en dan zou de balk alleen maar in de weg staan. */
  const omslag = lees();
  if(omslag && (!opt.isLeeg || opt.isLeeg())){
    if(controleer(omslag.payload, opt.versie, opt.naam)) balk(omslag);
  }
  /* Wegschrijven mag niet wachten op de afteller als het tabblad naar de achtergrond
     gaat of sluit - dan is het juist het moment waarop het ertoe doet. */
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden && vuil) schrijf(); });
  window.addEventListener('pagehide', ()=>{ if(vuil) schrijf(); });
  window.addEventListener('beforeunload', (e)=>{
    if(!vuil || (opt.isLeeg && opt.isLeeg())) return;
    if(vuil) schrijf();
    e.preventDefault();
    e.returnValue = '';   /* de browser toont zijn eigen tekst; deze is nodig */
  });
}

window.ProjectOpslag = {koppel, gewijzigd, bewaard, controleer, lees};
})();
