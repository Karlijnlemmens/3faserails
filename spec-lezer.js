/* Gedeelde plak-en-lees-parser voor leveranciersspecificaties.

   Stond eerst alleen in de armatuurvergelijker. De DLC-tool heeft precies
   hetzelfde nodig - een brok tekst van een leverancier omzetten naar velden -
   maar met een andere veldenlijst. Daarom staat de parser hier en geeft elke
   tool zijn eigen kaart mee.

   Wat de parser aankan, en waarom dat meer is dan "splitsen op de dubbele punt":

     Label: waarde                  op een regel
     Label                          label op een regel, waarde op de volgende
     waarde
     Groep: Label: waarde           bestekteksten zetten de groepsnaam ervoor
     Label (W)                      eenheid in het label, kaal getal als waarde
     a, b: 1, c: 2                  bestektekst met komma's op een enkele regel
     Ra&gt;90                     geplakt uit een webpagina, met entiteiten

   Wat hij NIET doet is raden. Een regel die hij niet thuis kan brengen komt in
   `onbekend` terecht, zodat de tool hem kan tonen en de gebruiker zelf kan
   beslissen. Stil laten vallen is het ergste wat zo'n parser kan doen.

   Laden: een gewoon <script src="spec-lezer.js">; geen module, want die weigert
   te laden als de tool vanaf schijf (file://) wordt geopend. */
(function(){
'use strict';

/* Een regel met cijfers of vergelijkingstekens is een waarde, geen label -
   anders wordt "UGR<19" voor het label "UGR" aangezien. */
function lijktWaarde(s){ return /[\d<>=]/.test(s) || /^(ja|nee|yes|no)$/i.test(s); }

/* Labels komen in het wild met een eenheid of een vraagteken erachter:
   "Maximum bulb wattage (W)", "Dimmable?", "Cut-out (mm)". Voor het opzoeken
   halen we die eraf; de oorspronkelijke tekst blijft in de melding staan. */
function schoonLabel(s){
  return String(s||'').replace(/\s*\([^)]*\)\s*$/,'').replace(/[?:]+$/,'').trim();
}

/* Geplakte webpagina's brengen hun entiteiten mee: Ra&gt;90, UGR&lt;19. */
function ontHtml(s){
  return String(s||'')
    .replace(/&(lt|gt|amp|quot|apos|nbsp|#39);/g,
      m=>({'&lt;':'<','&gt;':'>','&amp;':'&','&quot;':'"','&apos;':"'",'&#39;':"'",'&nbsp;':' '}[m]))
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n));
}

/* Bouwt een lezer voor een veldenlijst.

   opt.veldmap  [{v:'veldnaam', l:/label-patroon/, s:/alleen in deze groep/}]
                De volgorde telt: de eerste die past wint, dus zet een
                specifieke regel boven een algemene.
   opt.sectie   patroon dat een groepskop herkent ("Elektrische gegevens")
   opt.kop      true als de eerste regel de omschrijving van het armatuur is
                (bestekteksten beginnen daarmee); levert veld 'omschrijving'
   opt.eenheidUitLabel
                staat de eenheid in het label en is de waarde een kaal getal, dan
                die eenheid erbij zetten: "Maximum bulb wattage (W)" met "60" wordt
                "60W". Standaard aan. Zet het uit als het blad het label mét eenheid
                toont, want dan komt hij er dubbel te staan.

   lees(tekst) geeft {uit, herkend, onbekend}:
     uit       {veld: waarde} - de eerste waarde wint, latere herhalingen niet
     herkend   [{label, waarde, veld, sectie}] om aan de gebruiker te tonen
     onbekend  [regels] die nergens onder vielen */
function maak(opt){
  opt = opt || {};
  const VELDMAP = opt.veldmap || [];
  const SECTIE  = opt.sectie || /$^/;
  const kopregel = opt.kop !== false;
  const eenheidErbij = opt.eenheidUitLabel !== false;

  function isLabel(s){
    const k=schoonLabel(s);
    return !lijktWaarde(k) && VELDMAP.some(x=>x.l.test(k));
  }

  function lees(tekst){
    const regels=ontHtml(tekst).split(/\r?\n/)
      /* Bestekteksten staan op een regel met komma's ertussen. Alleen knippen
         waar na de komma een nieuw "Label:" begint, anders valt "Reflector, spot"
         uit elkaar en wordt "L70/B50>50,000" halverwege afgekapt. */
      .flatMap(r=>r.split(/,\s*(?=[^,:]{2,40}:)/))
      .map(s=>s.trim()).filter(Boolean);
    const uit={}, herkend=[], onbekend=[];
    let sectie='';
    for(let i=0;i<regels.length;i++){
      let label=regels[i], waarde=null;

      /* Kopregel van een bestektekst: de omschrijving van het armatuur zelf. */
      if(kopregel && i===0 && !label.includes(':') && label.length>15
         && /[a-z]/i.test(label) && !SECTIE.test(label)){
        uit.omschrijving=label;
        herkend.push({label:'Omschrijving',waarde:label,veld:'omschrijving',sectie});
        continue;
      }

      /* "Groep: Veld: waarde" - de bestektekst zet de groepsnaam ervoor.
         Groep onthouden en verder lezen alsof hij er niet stond. */
      const groep=label.match(/^([^:]{2,40}):\s*(.+:.+)$/);
      if(groep && SECTIE.test(groep[1].trim())){ sectie=groep[1].trim(); label=groep[2].trim(); }

      /* "Label: waarde" op een regel - alleen splitsen als het linkerdeel echt een label is */
      const d=label.indexOf(':');
      if(d>0 && d<40 && isLabel(label.slice(0,d).trim())){
        waarde=label.slice(d+1).trim(); label=label.slice(0,d).trim();
      }
      /* kopregel: onthouden en niets consumeren */
      if(!waarde && SECTIE.test(label) && !/\d/.test(label) && label.length<40 && !isLabel(label)){
        sectie=label; continue;
      }
      const m=(waarde!=null || !lijktWaarde(label))
        ? VELDMAP.find(x=>x.l.test(schoonLabel(label)) && (!x.s || x.s.test(sectie))) : null;
      if(!m){ onbekend.push(label); continue; }
      if(waarde==null){
        const volg=regels[i+1];
        if(volg && !isLabel(volg) && !SECTIE.test(volg)){ waarde=volg; i++; }
      }
      if(waarde==null){ onbekend.push(label); continue; }
      /* Staat de eenheid in het label en is de waarde een kaal getal, dan hoort
         hij erbij: "Maximum bulb wattage (W)" met "60" wordt 60W. */
      const eenheid=eenheidErbij ? (label.match(/\(([^)]{1,4})\)\s*$/)||[])[1] : null;
      if(eenheid && /^[A-Za-z\u00b0%]+$/.test(eenheid) && /^-?\d+([.,]\d+)?$/.test(waarde.trim()))
        waarde=waarde.trim()+eenheid;
      if(uit[m.v]==null){ uit[m.v]=waarde; herkend.push({label,waarde,veld:m.v,sectie}); }
    }
    return {uit,herkend,onbekend};
  }

  return {lees, isLabel};
}

window.SpecLezer = {maak, lijktWaarde, schoonLabel, ontHtml};
})();
