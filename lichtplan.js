/* Het lichtplan van het "totaal projectboek" - gedeeld door het armaturenboek
   (armaturenboek.html) en de railtool (index.html), zodat beide het op dezelfde
   manier doen.

   Wie een lichtplan heeft (de PDF uit DIALux of AutoCAD), kiest die in het blok
   "Totaal projectboek". Het boek krijgt dan direct na de introductie - of direct na
   het voorblad, als er geen introductie is - het hoofdstukblad "Lichtberekening"
   (het aangeleverde ontwerp, ingebakken als presenters/lichtberekening.js) en
   daarachter de pagina's van het lichtplan zoals ze zijn. Sinds oktober 2026 kunnen
   dat meer PDF's zijn (een lichtplan per verdieping, een los rapport): ze komen achter
   elkaar, in de volgorde van de lijst in het blok, achter dat ene hoofdstukblad.

   In de staat van de tool staat alleen st.lichtplan = [{naam, paginas}, ...] (of null
   als er geen is; een project van vóór oktober 2026 heeft daar {naam, paginas}, en
   lichtplanLijst() leest beide). De PDF's zelf houdt dit bestand bij; de tool zet
   Lichtplan.pdf in zijn payload en geeft ze bij het herstellen terug met
   Lichtplan.zetPdf(). "Project opslaan" neemt ze altijd mee. Het hoekje van de browser
   (project-opslag.js) probeert eerst het hele project, maar houdt maar zo'n 5 MB - en
   een lichtplan is al gauw groter. Dan bewaart het de lichte versie, zonder de PDF's:
   het hervatte project kent de namen maar niet de bestanden. De tool zegt dan welke
   opnieuw gekozen moeten worden, en het boek gaat zonder die lichtplannen de deur uit
   (gemeten met een lichtplan van 12 MB).

   Een opgeslagen projectbestand laadt dit bestand van de installatiemap, maar heeft
   zijn eigen, oude knoppen (een naam en een kruisje voor één lichtplan). koppel()
   werkt ook daarmee: dan komt de lijst onder de knop en blijven die twee verborgen.

   Een gewoon <script src>, geen module: modules laden niet vanaf schijf. Laden na
   vendor/pdf-lib.min.js, pdf-huisstijl.js en melding.js. lichtplanDelen() en
   lichtplanLijst() staan op het hoogste niveau, zodat tools/controleer-logica.mjs ze
   kan uitsnijden. */

/* De eigen pagina's van een tool, met het lichtplan erna de introductie tussen
   geschoven. naIntroductie is het aantal eigen pagina's tot en met de introductie
   (het voorblad telt mee), eigenTotaal het aantal eigen pagina's. De tool zet de
   presenters en de achterpagina's er zelf achter. Geen stuk zonder pagina's. */
function lichtplanDelen(naIntroductie, eigenTotaal, metLichtplan){
  const delen = metLichtplan
    ? [{bron:'eigen', van:0, tot:naIntroductie}, {bron:'lichtberekening'}, {bron:'lichtplan'},
       {bron:'eigen', van:naIntroductie, tot:eigenTotaal}]
    : [{bron:'eigen', van:0, tot:eigenTotaal}];
  return delen.filter(d => d.bron !== 'eigen' || d.tot > d.van);
}

/* De lichtplannen in de staat van een tool als lijst [{naam, paginas}]. Tot oktober 2026
   was er één: st.lichtplan was {naam, paginas} of null, en een opgeslagen project heeft
   dat nog. Een lege lijst staat in de staat als null, zodat "if(st.lichtplan)" in de
   tools blijft betekenen: er is een lichtplan. */
function lichtplanLijst(waarde){
  if(!waarde) return [];
  return (Array.isArray(waarde) ? waarde : [waarde]).filter(lp => lp && lp.naam);
}

const Lichtplan = (function(){
  'use strict';

  /* per lichtplan de PDF als base64, in de volgorde van de lijst; null = niet ingeladen.
     Kan even langer of korter zijn dan de lijst (zetPdf() komt bij het herstellen vóór
     de staat), dus altijd per plaats lezen, nooit inkorten op de lengte van de lijst. */
  let pdfs = [];
  let o = null;            /* wat de tool bij koppel() meegaf */

  const staat = () => (o && o.st()) || {};
  const lijst = () => lichtplanLijst(staat().lichtplan);
  const zetLijst = l => { staat().lichtplan = l.length ? l : null; };
  const pagina = n => n + (n === 1 ? ' pagina' : ' pagina’s');
  const namen = l => l.map(lp => '"' + lp.naam + '"').join(', ').replace(/, ([^,]*)$/, ' en $1');
  function ingeladen(){ return lijst().some((lp, i) => !!pdfs[i]); }
  function ontbreekt(){ return lijst().some((lp, i) => !pdfs[i]); }
  const ontbrekend = () => lijst().filter((lp, i) => !pdfs[i]);

  function knopje(tekst, titel, actie, uit){
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'klein'; b.textContent = tekst;
    b.title = titel; b.setAttribute('aria-label', titel); b.disabled = !!uit;
    b.addEventListener('click', actie);
    return b;
  }
  function verf(){
    if(!o) return;
    const l = lijst();
    o.knop.textContent = l.length ? '+ Nog een PDF toevoegen' : 'Lichtplan (PDF) kiezen';
    o.lijst.textContent = '';
    l.forEach((lp, i)=>{
      const rij = document.createElement('div'); rij.className = 'lichtplan-rij';
      const naam = document.createElement('span'); naam.className = 'lichtplan-naam';
      naam.textContent = pdfs[i] ? '✓ ' + lp.naam + ' — ' + pagina(lp.paginas)
        : '⚠ ' + lp.naam + ' is niet meer ingeladen — kies het bestand opnieuw';
      naam.classList.toggle('mis', !pdfs[i]);
      rij.appendChild(naam);
      if(l.length > 1){
        rij.appendChild(knopje('↑', lp.naam + ' eerder in het boek', ()=>verplaats(i, -1), i === 0));
        rij.appendChild(knopje('↓', lp.naam + ' later in het boek', ()=>verplaats(i, 1), i === l.length-1));
      }
      rij.appendChild(knopje('×', lp.naam + ' weghalen', ()=>haalWeg(i)));
      o.lijst.appendChild(rij);
    });
    if(o.overzicht){
      const p = l.reduce((s, lp, i)=> s + (pdfs[i] ? lp.paginas : 0), 0);
      o.overzicht.textContent = ingeladen() ? p + ' p.' : '—';
    }
  }

  /* Een of meer bestanden erbij. Heet er een zoals een lichtplan dat niet meer ingeladen
     is (een hervat project), dan komt het op die plaats terug; anders achteraan. */
  async function kies(bestanden){
    const goed = [], fout = [], al = [];
    for(const bestand of bestanden){
      try{
        const bytes = new Uint8Array(await bestand.arrayBuffer());
        if(String.fromCharCode.apply(null, bytes.subarray(0, 5)) !== '%PDF-') throw new Error('dit is geen PDF-bestand');
        const d = await PDFLib.PDFDocument.load(bytes, {ignoreEncryption:true});
        /* pdf-lib kan een beveiligd PDF niet ontsleutelen: de pagina's komen er dan leeg
           of verminkt uit. Liever nu zeggen dan in het boek bij de klant. */
        if(d.isEncrypted) throw new Error('het is beveiligd. Sla het op zonder beveiliging (of druk het af naar PDF) en kies het opnieuw');
        const l = lijst(), item = {naam: bestand.name, paginas: d.getPageCount()};
        const b64 = PdfHuisstijl.bytesToB64(bytes);
        /* hetzelfde bestand nog een keer gekozen: niet dubbel in het boek */
        if(pdfs.some((p, j)=> p === b64 && j < l.length)){ al.push(bestand.name); continue; }
        let i = l.findIndex((lp, j)=> lp.naam === bestand.name && !pdfs[j]);
        if(i < 0){ i = l.length; l.push(item); } else l[i] = item;
        pdfs[i] = b64;
        zetLijst(l);
        goed.push(item);
      }catch(err){
        fout.push(bestand.name + ': ' + (err && err.message || err));
      }
    }
    verf();
    if(goed.length) o.opWijziging();
    if(goed.length === 1)
      Melding.goed('Lichtplan ingeladen: ' + pagina(goed[0].paginas) + '. Het komt in het boek na de introductie.');
    else if(goed.length > 1)
      Melding.goed(goed.length + ' PDF\'s ingeladen (' + pagina(goed.reduce((s, x)=> s + x.paginas, 0))
        + '). Ze komen in het boek na de introductie, in de volgorde van de lijst.');
    if(al.length)
      Melding.letop((al.length === 1 ? al[0] + ' staat' : al.join(', ') + ' staan') + ' al in de lijst; niet nog een keer toegevoegd.');
    if(fout.length)
      Melding.fout((fout.length === 1 ? 'Dit bestand kan' : 'Deze bestanden kunnen') + ' niet in het boek: '
        + fout.join('; ') + '.', {bij: o.knop});
  }
  function haalWeg(i){
    const l = lijst(); l.splice(i, 1); pdfs.splice(i, 1);
    zetLijst(l); verf(); o.opWijziging();
  }
  function verplaats(i, r){
    const l = lijst(), j = i + r;
    if(j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]]; [pdfs[i], pdfs[j]] = [pdfs[j], pdfs[i]];
    zetLijst(l); verf(); o.opWijziging();
  }
  function wis(){
    staat().lichtplan = null; pdfs = [];
    verf();
  }

  /* De elementen van het blok en hoe de tool zich ververst:
       o.st()          de staat van de tool (st.lichtplan)
       o.knop          "Lichtplan (PDF) kiezen" / "+ Nog een PDF toevoegen"
       o.bestand       het verborgen <input type="file">
       o.lijst         waar de gekozen PDF's onder elkaar komen, met ↑ ↓ ×
       o.overzicht     (niet verplicht) het getal in het overzicht rechts
       o.opWijziging() de tool ververst (armaturenboek: updateSummary, railtool: refresh)
     Een opgeslagen projectbestand van vóór oktober 2026 geeft in plaats van o.lijst nog
     o.naam en o.weg mee (één lichtplan): die gaan dicht en de lijst komt onder de knop,
     in een vak met een vast id, zodat hij bij een volgende keer openen niet dubbel komt. */
  function koppel(opties){
    o = opties;
    if(!o.lijst){
      const id = o.bestand.id + '_lijst';
      o.lijst = document.getElementById(id);
      if(!o.lijst){
        o.lijst = document.createElement('div'); o.lijst.id = id; o.lijst.className = 'lichtplan-lijst';
        o.knop.parentNode.insertAdjacentElement('beforebegin', o.lijst);
      }
      if(o.naam) o.naam.hidden = true;
      if(o.weg) o.weg.hidden = true;
    }
    o.bestand.multiple = true;
    o.knop.addEventListener('click', () => o.bestand.click());
    o.bestand.addEventListener('change', e => {
      const bestanden = Array.from(e.target.files || []);
      e.target.value = '';
      if(bestanden.length) kies(bestanden);
    });
    verf();
  }

  /* De pagina's van alle ingeladen lichtplannen achter in finalDoc, in de volgorde van de
     lijst en zoals ze zijn; geeft het aantal. */
  async function voegToe(finalDoc){
    let n = 0;
    const l = lijst();
    for(let i = 0; i < l.length; i++){
      if(!pdfs[i]) continue;
      try{
        const d = await PDFLib.PDFDocument.load(PdfHuisstijl.b64Bytes(pdfs[i]));
        const pgs = await finalDoc.copyPages(d, d.getPageIndices());
        pgs.forEach(p => finalDoc.addPage(p));
        n += pgs.length;
      }catch(err){
        console.warn('Lichtplan kon niet worden ingevoegd:', err);
        Melding.fout('Het lichtplan "' + l[i].naam + '" kon niet in het boek worden gezet: ' + (err && err.message || err) + '.');
      }
    }
    return n;
  }

  const waarschuwing = () => { const m = ontbrekend();
    return (m.length === 1 ? 'Lichtplan ' + namen(m) + ' is' : 'Lichtplannen ' + namen(m) + ' zijn')
      + ' niet meer ingeladen — kies ' + (m.length === 1 ? 'het' : 'ze') + ' opnieuw bij Totaal projectboek.'; };
  const exportMelding = () => { const m = ontbrekend(), een = m.length === 1;
    return (een ? 'Het lichtplan ' + namen(m) + ' is' : 'De lichtplannen ' + namen(m) + ' zijn')
      + ' niet meer ingeladen (een project dat je uit de browser hervat, neemt ingeladen PDF\'s niet mee). '
      + 'Kies ' + (een ? 'het' : 'ze') + ' opnieuw bij "Totaal projectboek"; nu komt het boek zonder '
      + (een ? 'dat lichtplan.' : 'die lichtplannen.'); };

  /* opmaak van het blok, voor beide tools dezelfde; één keer, want een opgeslagen
     projectbestand bewaart de pagina inclusief dit stijlblok */
  const stijl = document.getElementById('lichtplan-stijl') || document.createElement('style');
  stijl.id = 'lichtplan-stijl';
  stijl.textContent = `
  .lichtplan-keuze{display:flex; align-items:center; gap:10px; flex-wrap:wrap;}
  .lichtplan-keuze button{
    border:1.5px solid var(--blue); border-radius:8px; padding:7px 12px; background:#fff; color:var(--blue-dark);
    font-family:'Nunito Sans',sans-serif; font-size:12.5px; font-weight:700; cursor:pointer;
  }
  .lichtplan-keuze button:hover{background:var(--blue-light);}
  .lichtplan-keuze button.weg{border-color:var(--border); color:var(--slate); padding:4px 10px; font-size:15px; line-height:1;}
  .lichtplan-lijst{display:flex; flex-direction:column; gap:6px; margin-bottom:8px;}
  .lichtplan-lijst:empty{display:none;}
  .lichtplan-rij{display:flex; align-items:center; gap:6px; flex-wrap:wrap;}
  .lichtplan-rij .lichtplan-naam{flex:1 1 220px; min-width:0; overflow-wrap:anywhere;}
  .lichtplan-rij button.klein{
    border:1.5px solid var(--border); border-radius:7px; background:#fff; color:var(--slate);
    font-family:'Nunito Sans',sans-serif; font-size:13px; line-height:1; padding:3px 8px; cursor:pointer;
  }
  .lichtplan-rij button.klein:hover:not(:disabled){border-color:var(--blue); color:var(--blue-dark);}
  .lichtplan-rij button.klein:disabled{opacity:.35; cursor:default;}
  .lichtplan-naam{font-size:12.5px; font-weight:700; color:var(--green, #1C7C54);}
  .lichtplan-naam.mis{color:#B0362B;}`;
  document.head.appendChild(stijl);

  return {
    koppel, verf, wis, ingeladen, ontbreekt, voegToe, waarschuwing, exportMelding,
    /* voor de payload: de PDF's in de volgorde van de lijst (null = niet ingeladen), of null */
    get pdf(){ const l = lijst(); return l.some((lp, i)=> pdfs[i]) ? l.map((lp, i)=> pdfs[i] || null) : null; },
    /* uit een payload: een lijst zoals hierboven, of - een project van vóór oktober 2026 -
       één base64-tekst */
    zetPdf(b64){ pdfs = Array.isArray(b64) ? b64.slice() : (b64 ? [b64] : []); verf(); },
  };
})();
