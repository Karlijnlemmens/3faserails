/* Het lichtplan van het "totaal projectboek" - gedeeld door het armaturenboek
   (armaturenboek.html) en de railtool (index.html), zodat beide het op dezelfde
   manier doen.

   Wie een lichtplan heeft (de PDF uit DIALux of AutoCAD), kiest die in het blok
   "Totaal projectboek". Het boek krijgt dan direct na de introductie - of direct na
   het voorblad, als er geen introductie is - het hoofdstukblad "Lichtberekening"
   (het aangeleverde ontwerp, ingebakken als presenters/lichtberekening.js) en
   daarachter de pagina's van het lichtplan zoals ze zijn.

   In de staat van de tool staat alleen st.lichtplan = {naam, paginas} (of null). De
   PDF zelf houdt dit bestand bij; de tool zet Lichtplan.pdf in zijn payload en geeft
   hem bij het herstellen terug met Lichtplan.zetPdf(). "Project opslaan" neemt hem
   altijd mee. Het hoekje van de browser (project-opslag.js) probeert eerst het hele
   project, maar houdt maar zo'n 5 MB - en een lichtplan is al gauw groter. Dan bewaart
   het de lichte versie, zonder de PDF: het hervatte project kent de naam maar niet het
   bestand. De tool zegt dan dat het opnieuw gekozen moet worden, en het boek gaat
   zonder lichtplan de deur uit (gemeten met een lichtplan van 12 MB).

   Een gewoon <script src>, geen module: modules laden niet vanaf schijf. Laden na
   vendor/pdf-lib.min.js, pdf-huisstijl.js en melding.js. lichtplanDelen() staat op
   het hoogste niveau, zodat tools/controleer-logica.mjs hem kan uitsnijden. */

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

const Lichtplan = (function(){
  'use strict';

  let pdf = null;          /* de PDF van het lichtplan, base64 */
  let o = null;            /* wat de tool bij koppel() meegaf */

  const staat = () => (o && o.st()) || {};
  const pagina = n => n + (n === 1 ? ' pagina' : ' pagina’s');
  function ingeladen(){ const lp = staat().lichtplan; return !!(lp && pdf); }
  function ontbreekt(){ const lp = staat().lichtplan; return !!(lp && !pdf); }

  function verf(){
    if(!o) return;
    const lp = staat().lichtplan, aanwezig = ingeladen();
    o.knop.textContent = lp ? 'Ander lichtplan kiezen' : 'Lichtplan (PDF) kiezen';
    o.naam.textContent = !lp ? ''
      : aanwezig ? '✓ ' + lp.naam + ' — ' + pagina(lp.paginas)
      : '⚠ ' + lp.naam + ' is niet meer ingeladen — kies het bestand opnieuw';
    o.naam.classList.toggle('mis', !!lp && !aanwezig);
    o.weg.hidden = !lp;
    if(o.overzicht) o.overzicht.textContent = aanwezig ? lp.paginas + ' p.' : '—';
  }

  async function kies(bestand){
    try{
      const bytes = new Uint8Array(await bestand.arrayBuffer());
      if(String.fromCharCode.apply(null, bytes.subarray(0, 5)) !== '%PDF-') throw new Error('dit is geen PDF-bestand');
      const d = await PDFLib.PDFDocument.load(bytes, {ignoreEncryption:true});
      /* pdf-lib kan een beveiligd PDF niet ontsleutelen: de pagina's komen er dan leeg
         of verminkt uit. Liever nu zeggen dan in het boek bij de klant. */
      if(d.isEncrypted) throw new Error('het is beveiligd. Sla het lichtplan op zonder beveiliging (of druk het af naar PDF) en kies het opnieuw');
      pdf = PdfHuisstijl.bytesToB64(bytes);
      staat().lichtplan = {naam: bestand.name, paginas: d.getPageCount()};
      verf(); o.opWijziging();
      Melding.goed('Lichtplan ingeladen: ' + pagina(staat().lichtplan.paginas) + '. Het komt in het boek na de introductie.');
    }catch(err){
      Melding.fout('Dit lichtplan kan niet in het boek: ' + (err && err.message || err) + '.', {bij: o.knop});
    }
  }
  function wis(){
    staat().lichtplan = null; pdf = null;
    verf();
  }

  /* De elementen van het blok en hoe de tool zich ververst:
       o.st()          de staat van de tool (st.lichtplan)
       o.knop          "Lichtplan (PDF) kiezen"
       o.bestand       het verborgen <input type="file">
       o.naam          waar de naam en het aantal pagina's komen
       o.weg           het kruisje
       o.overzicht     (niet verplicht) het getal in het overzicht rechts
       o.opWijziging() de tool ververst (armaturenboek: updateSummary, railtool: refresh) */
  function koppel(opties){
    o = opties;
    o.knop.addEventListener('click', () => o.bestand.click());
    o.bestand.addEventListener('change', e => {
      const bestand = e.target.files && e.target.files[0];
      e.target.value = '';
      if(bestand) kies(bestand);
    });
    o.weg.addEventListener('click', () => { wis(); o.opWijziging(); });
    verf();
  }

  /* Alle pagina's van het lichtplan achter in finalDoc, zoals ze zijn; geeft het aantal. */
  async function voegToe(finalDoc){
    try{
      const d = await PDFLib.PDFDocument.load(PdfHuisstijl.b64Bytes(pdf));
      const pgs = await finalDoc.copyPages(d, d.getPageIndices());
      pgs.forEach(p => finalDoc.addPage(p));
      return pgs.length;
    }catch(err){
      console.warn('Lichtplan kon niet worden ingevoegd:', err);
      Melding.fout('Het lichtplan kon niet in het boek worden gezet: ' + (err && err.message || err) + '.');
      return 0;
    }
  }

  const waarschuwing = () => 'Lichtplan "' + staat().lichtplan.naam
    + '" is niet meer ingeladen — kies het opnieuw bij Totaal projectboek.';
  const exportMelding = () => 'Het lichtplan "' + staat().lichtplan.naam + '" is niet meer ingeladen (een project '
    + 'dat je uit de browser hervat, neemt ingeladen PDF\'s niet mee). Kies het opnieuw bij "Totaal projectboek"; '
    + 'nu komt het boek zonder lichtplan.';

  /* opmaak van het blok, voor beide tools dezelfde */
  const stijl = document.createElement('style');
  stijl.textContent = `
  .lichtplan-keuze{display:flex; align-items:center; gap:10px; flex-wrap:wrap;}
  .lichtplan-keuze button{
    border:1.5px solid var(--blue); border-radius:8px; padding:7px 12px; background:#fff; color:var(--blue-dark);
    font-family:'Nunito Sans',sans-serif; font-size:12.5px; font-weight:700; cursor:pointer;
  }
  .lichtplan-keuze button:hover{background:var(--blue-light);}
  .lichtplan-keuze button.weg{border-color:var(--border); color:var(--slate); padding:4px 10px; font-size:15px; line-height:1;}
  .lichtplan-naam{font-size:12.5px; font-weight:700; color:var(--green, #1C7C54);}
  .lichtplan-naam.mis{color:#B0362B;}`;
  document.head.appendChild(stijl);

  return {
    koppel, verf, wis, ingeladen, ontbreekt, voegToe, waarschuwing, exportMelding,
    get pdf(){ return pdf; },
    zetPdf(b64){ pdf = b64 || null; verf(); },
  };
})();
