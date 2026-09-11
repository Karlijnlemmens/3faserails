/* Korte meldingen - gedeeld door de tools van de suite.

   De suite deed alles met alert(): "Project opgeslagen", "vul eerst een armatuur in",
   "dit lijkt geen PDF". Een alert legt de tool stil tot je klikt, staat los van het
   veld waar het over gaat, en is weg zodra je hem wegklikt. Voor een bevestiging is
   dat te zwaar en tegelijk te vluchtig.

   Gebruik:

     Melding.goed('Project opgeslagen');            // groen, verdwijnt vanzelf
     Melding.letop('De RFQ-lijst is nog leeg');     // oranje
     Melding.fout('Dit lijkt geen PDF-bestand');    // rood, blijft langer staan
     Melding.toon('…', {soort:'goed', duur:6000, bij:invoerveld});

   'bij' zet de aandacht op het veld waar het over gaat: dat krijgt de focus en een
   rode rand zolang de melding staat. Zo hoort een foutmelding bij iets.

   Wat WEL een alert blijft: het moment waarop de tool niet verder kan (opslaan
   mislukt, de PDF kwam er niet uit) en de lijst met punten vóór een export - die
   lees je juist bewust door voordat iets naar een klant gaat.

   Laden: een gewoon <script src="melding.js">; geen module, want die weigert te laden
   vanaf schijf (file://). Het bestand brengt zijn eigen opmaak mee. */
(function(){
'use strict';

const STIJL = `
.meldingen{
  position:fixed; right:16px; bottom:16px; z-index:400;
  display:flex; flex-direction:column-reverse; gap:8px; max-width:min(420px, calc(100vw - 32px));
  pointer-events:none;
}
.melding-vak{
  pointer-events:auto; display:flex; align-items:flex-start; gap:10px;
  background:var(--white, #fff); color:var(--ink, #1C2534);
  border:1px solid var(--border, #DCE6F2); border-left:4px solid var(--slate, #5A6B84);
  border-radius:10px; padding:11px 13px; box-shadow:0 8px 22px rgba(30,42,74,.16);
  font-family:'Nunito Sans', system-ui, sans-serif; font-size:13px; line-height:1.45;
  animation:melding-in .16s ease-out;
}
.melding-vak.goed{border-left-color:var(--green, #22935F);}
.melding-vak.letop{border-left-color:var(--amber, #B9791C);}
.melding-vak.fout{border-left-color:var(--red, #D6362B);}
.melding-vak .tekst{flex:1;}
.melding-vak .weg{
  border:0; background:none; color:var(--slate, #5A6B84); cursor:pointer;
  font-size:15px; line-height:1; padding:0 2px; font-family:inherit;
}
.melding-vak .weg:hover{color:var(--ink, #1C2534);}
.melding-aandacht{
  outline:2px solid var(--red, #D6362B) !important;
  outline-offset:1px;
}
@keyframes melding-in{from{opacity:0; transform:translateY(6px);} to{opacity:1; transform:none;}}
@media (prefers-reduced-motion:reduce){ .melding-vak{animation:none;} }
`;

const DUUR = {goed:3500, letop:6000, fout:8000};
let lijst = null;

function opmaakEenmalig(){
  if(document.getElementById('melding-stijl')) return;
  const st = document.createElement('style');
  st.id = 'melding-stijl';
  st.textContent = STIJL;
  document.head.appendChild(st);
}
function vak(){
  if(lijst && lijst.isConnected) return lijst;
  opmaakEenmalig();
  lijst = document.createElement('div');
  lijst.className = 'meldingen';
  /* aria-live: een schermlezer leest de melding voor zonder dat de focus verspringt. */
  lijst.setAttribute('aria-live', 'polite');
  document.body.appendChild(lijst);
  return lijst;
}

function toon(tekst, opt){
  opt = opt || {};
  const soort = opt.soort || 'goed';
  const m = document.createElement('div');
  m.className = 'melding-vak ' + soort;
  const t = document.createElement('span');
  t.className = 'tekst';
  t.textContent = tekst;
  const weg = document.createElement('button');
  weg.type = 'button'; weg.className = 'weg'; weg.textContent = '×';
  weg.setAttribute('aria-label', 'Melding sluiten');
  m.appendChild(t); m.appendChild(weg);
  vak().appendChild(m);

  /* Het veld waar het over gaat krijgt de aandacht, en houdt die zolang de melding
     staat - anders moet je zelf zoeken waar het misging. */
  const veld = opt.bij || null;
  if(veld){
    try{ veld.focus({preventScroll:false}); }catch(err){ /* niet erg */ }
    veld.classList.add('melding-aandacht');
  }
  const sluit = ()=>{
    if(!m.isConnected) return;
    m.remove();
    if(veld) veld.classList.remove('melding-aandacht');
  };
  weg.addEventListener('click', sluit);
  const duur = opt.duur != null ? opt.duur : (DUUR[soort] || 4000);
  if(duur > 0) setTimeout(sluit, duur);
  return sluit;
}

window.Melding = {
  toon,
  goed:  (tekst, opt)=> toon(tekst, Object.assign({soort:'goed'},  opt||{})),
  letop: (tekst, opt)=> toon(tekst, Object.assign({soort:'letop'}, opt||{})),
  fout:  (tekst, opt)=> toon(tekst, Object.assign({soort:'fout'},  opt||{})),
};
})();
