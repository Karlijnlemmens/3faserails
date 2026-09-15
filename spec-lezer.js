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
     600x600 mm, Wit, 26 W, ...     een rij waarden zonder ook maar één label
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

/* Labels komen in het wild met van alles eromheen: "Maximum bulb wattage (W)",
   "Dimmable?", "Hoogte (mm) H", "Kleurweergave (CRI)". Voor het OPZOEKEN halen we
   die versiering eraf; de oorspronkelijke tekst blijft in de melding staan.

   De losse hoofdletter aan het eind is een tekeningverwijzing (H voor hoogte, D
   voor diameter) die op leveranciersbladen naast de maat staat. */
function schoonLabel(s){
  return String(s||'')
    .replace(/\([^)]*\)/g,' ')      /* elke haakjesgroep, niet alleen die aan het eind */
    .replace(/[?:]+$/,'')
    .replace(/\s{2,}/g,' ')
    .trim()
    .replace(/\s+[A-Z]$/,'')        /* "Hoogte  H" -> "Hoogte" */
    .trim();
}

/* Geplakte webpagina's brengen hun entiteiten mee (Ra&gt;90, UGR&lt;19) en soms
   ook hun opmaak: een waarde kan als <span ...>24h</span> binnenkomen. De tags
   gaan eruit, de tekst ertussen blijft staan. Eerst de tags, dan de entiteiten -
   andersom zou &lt;b&gt; als een echte tag behandeld worden. */
function ontHtml(s){
  return String(s||'')
    .replace(/<[^>]{0,400}>/g,'')
    .replace(/&(lt|gt|amp|quot|apos|nbsp|#39);/g,
      m=>({'&lt;':'<','&gt;':'>','&amp;':'&','&quot;':'"','&apos;':"'",'&#39;':"'",'&nbsp;':' '}[m]))
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n));
}

/* Een rij waarden zonder labels uit elkaar halen. Leveranciers zetten hun halve
   blad soms op één regel: "600x600 mm, Staal, Wit, 3600 lm, 26 W, IP 20/44 |
   Bescherming tegen vingers, IK02 | 0,2 J". Geknipt wordt op de komma, de
   puntkomma en de pijp - maar NIET binnen haakjes, want "(0.38, 0.38) SDCM <=3"
   is één waarde, en NIET tussen twee cijfers, want "0,2 J" is een getal en geen
   twee stukken. */
function splitsFragmenten(regel){
  const uit=[]; let diep=0, huidig='';
  for(let i=0;i<regel.length;i++){
    const c=regel[i];
    if(c==='('||c==='[') diep++;
    else if(c===')'||c===']') diep=Math.max(0,diep-1);
    const inGetal = c===',' && /\d/.test(regel[i-1]||'') && /\d/.test(regel[i+1]||'');
    if(diep===0 && !inGetal && (c===','||c===';'||c==='|')){ uit.push(huidig); huidig=''; continue; }
    huidig+=c;
  }
  uit.push(huidig);
  /* De punt aan het eind van een stuk is de punt van de ZIN: een rij waarden
     eindigt vaak op "... IP65, IK08." en dan is het laatste stuk "IK08." - dat
     past nergens meer op. Een punt tussen cijfers (2.55) blijft staan, want die
     hoort bij het getal. */
  return uit.map(x=>x.trim().replace(/\s*\.$/,'').trim()).filter(Boolean);
}

/* Bouwt een lezer voor een veldenlijst.

   opt.veldmap  [{v:'veldnaam', l:/label-patroon/, s:/alleen in deze groep/}]
                De volgorde telt: de eerste die past wint, dus zet een
                specifieke regel boven een algemene.
   opt.sectie   patroon dat een groepskop herkent ("Elektrische gegevens")
   opt.kop      true als de eerste regel de omschrijving van het armatuur is
                (bestekteksten beginnen daarmee); levert veld 'omschrijving'
   opt.fragmenten
                [{v:'veldnaam', p:/patroon/, l:'label voor de melding',
                  uit:(m,stuk)=>waarde, voeg:true, wint:true}]
                Ronde voor een regel die alleen WAARDEN bevat, zonder labels -
                zie de toelichting bij die ronde hieronder. `voeg` plakt een
                tweede treffer achter de eerste ("Insteekconnector, 4-polig"),
                `wint` laat een preciezere waarde een eerdere overschrijven
                (RAL9003 boven "Wit"); allebei alleen binnen deze ronde, een
                echt label wint altijd.
   opt.vrijeTekst
                [{v:'veldnaam', p:/patroon/, l:'label voor de melding', uit:(m)=>waarde}]
                Tweede leesronde over de lopende tekst, voor leveranciers die geen
                tabel aanleveren maar een verkooptekst met de gegevens erin
                ("13w 4000k 1900lm; lengte 600mm"). Zie de toelichting bij die
                ronde hieronder.
   opt.eenheidUitLabel
                staat de eenheid in het label en is de waarde een kaal getal, dan
                die eenheid erbij zetten: "Maximum bulb wattage (W)" met "60" wordt
                "60W". Standaard aan. Zet het uit als het blad het label mét eenheid
                toont, want dan komt hij er dubbel te staan.

   lees(tekst) geeft {uit, herkend, onbekend}:
     uit       {veld: waarde} - de eerste waarde wint, latere herhalingen niet
     herkend   [{label, waarde, veld, sectie}] om aan de gebruiker te tonen
     onbekend  [regels] die nergens onder vielen
     bijgezet  [veldnamen] waar de eenheid uit het label van de leverancier aan de
               waarde is geplakt; een blad dat die eenheid zelf al toont kan hem
               daar weghalen zonder aan de rest te komen */
function maak(opt){
  opt = opt || {};
  const VELDMAP = opt.veldmap || [];
  const SECTIE  = opt.sectie || /$^/;
  const kopregel = opt.kop !== false;
  const eenheidErbij = opt.eenheidUitLabel !== false;
  const VRIJ = opt.vrijeTekst || [];
  const FRAG = opt.fragmenten || [];

  function pastLabel(s){
    return VELDMAP.some(x=>x.l.test(schoonLabel(s)));
  }
  /* Een losse regel telt alleen als label als hij niet ook een waarde kan zijn,
     anders wordt "UGR<19" voor het label "UGR" aangezien. In een tabelregel staat
     het label links van de tab en is die voorzichtigheid niet nodig - zie daar. */
  function isLabel(s){
    const k=schoonLabel(s);
    return !lijktWaarde(k) && pastLabel(k);
  }

  /* Een patroon dat aan het begin verankerd is (^) past alleen als het HELE stuk
     die waarde is: "3600 lm", "IK02", "600x600 mm". Een patroon zonder anker pakt
     een woord midden in een zin - "prisma" zit ook in "met microprismatische
     afdekking voor kantoren". Dat verschil is het enige harde onderscheid tussen
     een waardenrij en een zin met komma's, dus het telt hieronder mee. Een
     patroon mag het zelf zeggen met `anker`, anders lezen we het van de regexp
     af, zodat het niet uit de pas kan lopen met het patroon. */
  const vastAnker = (f) => f.anker !== undefined ? !!f.anker : f.p.source.charAt(0) === '^';

  /* Is deze regel zo'n rij losse waarden? Vijf drempels, en ze zijn er alle vijf
     om hetzelfde te voorkomen: dat een gewone zin met komma's erin uit elkaar
     getrokken wordt in plaats van als omschrijving te blijven staan.

       - drie stukken of meer;
       - nauwelijks dubbele punten, anders is het een bestektekst en hoort hij
         bij de gewone ronde;
       - geen stuk langer dan 60 tekens - een waarde is kort, een bijzin niet;
       - de HELFT van de stukken wordt herkend;
       - en minstens TWEE stukken zijn in hun geheel een waarde (een verankerd
         patroon). In "Recessed downlight, round, with a micro-prismatic diffuser
         for offices" passen er twee, maar allebei op een woord midden in een
         zinsdeel; dat is een omschrijving en geen lijst. */
  function fragmentStukken(regel){
    /* Alleen een TAB wijst op een geplakte tabel. Een rij spaties deed dat eerst
       ook, maar die zit net zo goed per ongeluk in een waardenrij ("... mm,  IP65")
       en daar viel de hele regel dan op stuk. De drempels hieronder houden een
       echte tabelregel toch al tegen: die levert één stuk op, geen drie. */
    if(!FRAG.length || /\t/.test(regel)) return null;
    const stukken = splitsFragmenten(regel);
    if(stukken.length < 3) return null;
    if(stukken.filter(x=>x.includes(':')).length * 3 > stukken.length) return null;
    if(stukken.some(x=>x.length > 60)) return null;
    const raak  = stukken.filter(x=>FRAG.some(f=>f.p.test(x))).length;
    const vast  = stukken.filter(x=>FRAG.some(f=>vastAnker(f) && f.p.test(x))).length;
    return (vast >= 2 && raak * 2 >= stukken.length) ? stukken : null;
  }

  /* Bestekteksten zetten meerdere "Label: waarde"-paren op één regel met komma's
     ertussen; die halen we uit elkaar. Alleen knippen waar na de komma een label
     staat dat we KENNEN - anders valt "Reflector, spot" uit elkaar, wordt
     "L70/B50>50,000" halverwege afgekapt, en gaat een waarde als
     "B10: 30, B16: 47, C10: 50, C16: 80" in vieren terwijl het één opgave is. */
  function splitsLabelparen(regel){
    const delen = regel.split(/,\s*(?=[^,:]{2,40}:)/);
    if(delen.length < 2) return delen;
    const uit = [delen[0]];
    for(let i=1;i<delen.length;i++){
      const kop = delen[i].slice(0, delen[i].indexOf(':')).trim();
      if(pastLabel(schoonLabel(kop)) || SECTIE.test(kop)) uit.push(delen[i]);
      else uit[uit.length-1] += ', ' + delen[i];
    }
    return uit;
  }

  function lees(tekst){
    const regels=ontHtml(tekst).split(/\r?\n/)
      .flatMap(splitsLabelparen)
      .map(s=>s.trim()).filter(Boolean);
    const uit={}, herkend=[], bijgezet=[]; let onbekend=[];
    /* Welke regels zijn een rij losse waarden? Die slaat de gewone ronde over -
       ook als kopregel, want dan zou de hele rij als omschrijving eindigen. */
    const fragRegel = regels.map(fragmentStukken);
    let sectie='';
    for(let i=0;i<regels.length;i++){
      if(fragRegel[i]) continue;
      let label=regels[i], waarde=null;

      /* Kopregel van een bestektekst: de omschrijving van het armatuur zelf.
         Alleen als de regel echt uit een stuk bestaat - een regel met een tab of
         een rij spaties is een tabelregel, en die hoort verderop gesplitst te
         worden in label en waarde. */
      if(kopregel && i===0 && !label.includes(':') && !/\t| {2,}/.test(label)
         && label.length>15 && /[a-z]/i.test(label) && !SECTIE.test(label)){
        uit.omschrijving=label;
        herkend.push({label:'Omschrijving',waarde:label,veld:'omschrijving',sectie});
        continue;
      }

      /* "Groep: Veld: waarde" - de bestektekst zet de groepsnaam ervoor.
         Groep onthouden en verder lezen alsof hij er niet stond. */
      const groep=label.match(/^([^:]{2,40}):\s*(.+:.+)$/);
      if(groep && SECTIE.test(groep[1].trim())){ sectie=groep[1].trim(); label=groep[2].trim(); }

      /* "Label: waarde" op een regel - alleen splitsen als het linkerdeel echt een
         label is. Een tab of een rij spaties doet hetzelfde werk als de dubbele
         punt: uit een tabel geplakt komt "Vermogensbereik (W)\t1 - 4" binnen. */
      const d=label.indexOf(':');
      if(d>0 && d<40 && isLabel(label.slice(0,d).trim())){
        waarde=label.slice(d+1).trim(); label=label.slice(0,d).trim();
      }
      if(waarde==null){
        /* Bij een tabelregel staat het label per definitie links van de tab, dus
           daar mag een cijfer in zonder dat het meteen een waarde wordt: veel
           normlabels dragen hun nummer mee ("Beschermingsklasse volgens IEC
           61140", "... per leidingbeveiligingsschakelaar B16"). */
        const kolom=label.match(/^(.{2,80}?)(?:\t+| {2,})(.+)$/);
        if(kolom && pastLabel(kolom[1].trim())){
          waarde=kolom[2].trim(); label=kolom[1].trim();
        }
      }
      /* Kopregel: onthouden en niets consumeren.

         Lastig geval: "Afmetingen" en "Optiek" kunnen allebei een kopje zijn en
         een veldnaam. Wat het onderscheidt is wat eronder staat - onder een kopje
         volgt een volgend label, onder een veldnaam een waarde. Daarom mag een
         regel die zelf een label is toch als kop gelden zodra de regel eronder
         ook een label of een kop is. */
      const volgende = regels[i+1];
      const volgtLabel = volgende!=null && (isLabel(volgende) || SECTIE.test(volgende));
      if(!waarde && SECTIE.test(label) && !/\d/.test(label) && label.length<40
         && (!isLabel(label) || volgtLabel)){
        sectie=label; continue;
      }
      /* Of de regel zelf een waarde is, beoordelen we op het SCHOONGEMAAKTE label -
         net als isLabel() hierboven. Het haakje is versiering en hoort niet mee te
         tellen: "ULOR (<1%)" is een label, ook al staan er cijfers en een < in. */
      const m=(waarde!=null || !lijktWaarde(schoonLabel(label)))
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
      if(eenheid && /^[A-Za-z\u00b0%]+$/.test(eenheid) && /^-?\d+([.,]\d+)?$/.test(waarde.trim())){
        waarde=waarde.trim()+eenheid;
        /* Onthouden dat WIJ die eenheid erbij zetten. Een blad dat de eenheid al in
           zijn eigen label toont kan hem dan weghalen, zonder daarbij een eenheid
           te raken die de leverancier zelf schreef. */
        if(uit[m.v]==null) bijgezet.push(m.v);
      }
      if(uit[m.v]==null){ uit[m.v]=waarde; herkend.push({label,waarde,veld:m.v,sectie}); }
    }

    /* Ronde voor de rijen losse waarden.

       Niet elke leverancier levert labels. Soms is het één regel met alleen
       waarden erop, in de volgorde van zijn eigen blad: "600x600 mm, Staal,
       Wit, 3600 lm, 26 W, 4000 K, UGR19, IP 20/44". Daar valt niets te
       splitsen in label en waarde - wat een stuk betekent zit in het stuk zelf.

       Daarom staan hier patronen: "lm" kan alleen lichtstroom zijn, "IK02"
       alleen slagvastheid. Wat geen patroon raakt gaat naar `onbekend`, zodat
       de tool het kan tonen; raden doet deze ronde net zomin als de andere.

       Een veld dat de gewone ronde al gevuld heeft blijft staan: een echt label
       weet meer dan een patroon. Binnen deze ronde mag een stuk wel bij een
       eerder stuk aanschuiven (`voeg`) of het overschrijven (`wint`). */
    if(FRAG.length){
      const vanLijst = new Set();
      regels.forEach((regel, i)=>{
        if(!fragRegel[i]) return;
        fragRegel[i].forEach(stuk=>{
          const r = FRAG.find(f=>f.p.test(stuk));
          if(!r){ onbekend.push(stuk); return; }
          const t = stuk.match(r.p);
          let w = r.uit ? r.uit(t, stuk) : stuk;
          w = String(w==null?'':w).trim();
          if(!w){ onbekend.push(stuk); return; }
          const bezet = uit[r.v]!=null, eigen = vanLijst.has(r.v);
          if(bezet && !(eigen && (r.voeg || r.wint))){ onbekend.push(stuk); return; }
          if(bezet && r.voeg){
            if(uit[r.v].toLowerCase().includes(w.toLowerCase())) return;
            w = uit[r.v] + ', ' + w;
          }
          uit[r.v] = w;
          vanLijst.add(r.v);
          const eerder = herkend.find(h=>h.veld===r.v && h.sectie==='uit de lijst');
          if(eerder) eerder.waarde = w;
          else herkend.push({label:r.l||r.v, waarde:w, veld:r.v, sectie:'uit de lijst'});
        });
      });
    }

    /* Derde ronde: lopende tekst.

       Lang niet elke leverancier levert een tabel. Vaak is het een verkooptekst
       met de gegevens erin verstopt, over meerdere regels afgebroken en met een
       rijtje achteraan: "... Vijf jaar garantie. 13w 4000k 1900lm; lengte 600mm".
       Splitsen op de dubbele punt helpt daar niet.

       Wat wel werkt is de EENHEID als anker: "lm" kan alleen lichtstroom zijn,
       "kg" alleen gewicht. Daarom staan hier patronen en geen labels, en daarom
       blijft een kaal getal zonder eenheid liggen - dat zou raden zijn.

       Deze ronde vult alleen wat de eerste ronde niet gevonden heeft: staat er
       een net label in de tekst, dan wint dat altijd. De regeleindes gaan er
       eerst uit, want de tekst is vaak midden in een zin afgebroken. */
    if(VRIJ.length){
      const vlak = ontHtml(tekst).replace(/\s*\n\s*/g,' ').replace(/\s{2,}/g,' ');
      VRIJ.forEach(r=>{
        if(uit[r.v]!=null) return;
        const m = vlak.match(r.p);
        if(!m) return;
        let w = r.uit ? r.uit(m) : m[1];
        if(w==null) return;
        w = String(w).trim();
        if(!w) return;
        uit[r.v]=w;
        herkend.push({label:r.l||r.v, waarde:w, veld:r.v, sectie:'uit de tekst'});
      });
      /* Bij een verkooptekst is bijna elke regel proza. Die allemaal als "niet
         herkend" tonen is ruis; alleen regels met een dubbele punt zijn een
         zichtbare poging tot een label, en die horen wel gemeld te worden. */
      if(herkend.some(h=>h.sectie==='uit de tekst'))
        onbekend = onbekend.filter(r=>r.includes(':'));
    }
    return {uit,herkend,onbekend,bijgezet};
  }

  return {lees, isLabel};
}

window.SpecLezer = {maak, lijktWaarde, schoonLabel, ontHtml, splitsFragmenten};
})();
