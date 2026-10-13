/* Armaturen uit een Excel-lijst inladen - gedeeld door het armaturenboek
   (armaturenboek.html) en de railtool (index.html), zodat beide het op dezelfde manier
   doen.

   Uit de lijst komen vijf kolommen: A de code van het armatuur (in de tool "Code", de
   aanduiding op de tekening), F het totale aantal, I de artikelcode, J de omschrijving
   en L de opmerking (die komt klein en rood naast de code op de presenter); de rest
   wordt genegeerd. Accessoires staan op de regel van hun armatuur, met een + tussen de
   artikelcodes en tussen de omschrijvingen. De artikelcode vult de naam in zoals hij dat
   bij intypen ook doet: uit de catalogus (catalogusNaam() in armatuur-rij.js). De
   omschrijving uit de lijst is er ter controle. Is hij woord voor woord gelijk aan die
   uit de catalogus, dan is er niets aan de hand; wijkt hij af, dan kiest de gebruiker
   per artikel welke blijft. Staat de artikelcode niet in de catalogus, dan komt de
   omschrijving uit de lijst.

   De regels komen in de lege regels van de tool, achter wat er al staat; er wordt niets
   overschreven.

   Een .xlsx is een zip met XML erin. Lezen gaat zonder bibliotheek: de inhoudsopgave van
   de zip aflopen, de onderdelen uitpakken met DecompressionStream('deflate-raw') en de
   cellen uit de XML halen. Een .csv (komma of puntkomma) mag ook; een oud .xls-bestand
   niet - dat moet eerst als .xlsx worden opgeslagen.

   Een gewoon <script src>, geen module: modules laden niet vanaf schijf. Laden na
   armatuur-rij.js, catalogus-data.js en melding.js. excelRijen(), csvRijen(),
   excelArmatuurRegels(), excelVergelijk() en woordVerschil() staan op het hoogste
   niveau, net als excelDelen(), zodat tools/controleer-logica.mjs ze kan uitsnijden. */

/* ---------------------------------------------------------------- lezen ---- */

/* De rijen van het eerste blad van een .xlsx (bytes: Uint8Array) als arrays van tekst,
   kolom A op plek 0; een lege cel is ''. Rij n van het blad staat op plek n-1. */
async function excelRijen(bytes){
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for(let i = bytes.length - 22; i >= 0 && i >= bytes.length - 65557; i--) if(dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
  if(eocd < 0) throw new Error('dit is geen Excel-bestand (.xlsx)');
  const tekst = new TextDecoder('utf-8');
  const delen = new Map();
  let p = dv.getUint32(eocd + 16, true);
  for(let i = 0, n = dv.getUint16(eocd + 10, true); i < n; i++){
    if(dv.getUint32(p, true) !== 0x02014b50) throw new Error('het bestand is beschadigd');
    const methode = dv.getUint16(p + 10, true), gepakt = dv.getUint32(p + 20, true);
    const nLen = dv.getUint16(p + 28, true), eLen = dv.getUint16(p + 30, true), cLen = dv.getUint16(p + 32, true);
    const lokaal = dv.getUint32(p + 42, true);
    const naam = tekst.decode(bytes.subarray(p + 46, p + 46 + nLen));
    const start = lokaal + 30 + dv.getUint16(lokaal + 26, true) + dv.getUint16(lokaal + 28, true);
    delen.set(naam, {methode, rauw: bytes.subarray(start, start + gepakt)});
    p += 46 + nLen + eLen + cLen;
  }
  const lees = async naam => {
    const d = delen.get(naam);
    if(!d) return null;
    if(d.methode === 0) return tekst.decode(d.rauw);
    if(d.methode !== 8) throw new Error('het bestand is ingepakt op een manier die de tool niet kent');
    try{
      const uit = new Response(new Blob([d.rauw]).stream().pipeThrough(new DecompressionStream('deflate-raw')));
      return tekst.decode(new Uint8Array(await uit.arrayBuffer()));
    }catch(err){ throw new Error('het bestand is beschadigd'); }
  };
  const ontsnap = s => s.replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  /* de tekst van een <si> of <is>: alle <t>'s, zonder de uitspraakhulp (<rPh>) */
  const tekstVan = xml => ontsnap((xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').match(/<t\b[^>]*>[\s\S]*?<\/t>|<t\b[^>]*\/>/g) || [])
    .map(t => t.replace(/^<t\b[^>]*>|<\/t>$|^<t\b[^>]*\/>$/g, '')).join(''));
  /* het eerste blad: workbook.xml noemt de bladen in volgorde, de rels zeggen waar ze staan */
  let blad = 'xl/worksheets/sheet1.xml';
  const wb = await lees('xl/workbook.xml'), rels = await lees('xl/_rels/workbook.xml.rels');
  const eerste = wb && wb.match(/<sheet\b[^>]*\br:id="([^"]+)"/);
  if(eerste && rels){
    const rel = (rels.match(/<Relationship\b[^>]*>/g) || []).find(r => r.includes('Id="' + eerste[1] + '"'));
    const doel = rel && (rel.match(/Target="([^"]+)"/) || [])[1];
    if(doel) blad = doel.startsWith('/') ? doel.slice(1) : 'xl/' + doel.replace(/^\.\//, '');
  }
  const gedeeld = ((await lees('xl/sharedStrings.xml')) || '').match(/<si\b[\s\S]*?<\/si>|<si\/>/g) || [];
  const teksten = gedeeld.map(tekstVan);
  const xml = await lees(blad);
  if(xml === null) throw new Error('het eerste blad is niet gevonden');
  const kolom = ref => [...ref.replace(/\d+$/, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  const rijen = [];
  for(const rij of xml.match(/<row\b[\s\S]*?<\/row>|<row\b[^>]*\/>/g) || []){
    const nr = +((rij.match(/^<row\b[^>]*\br="(\d+)"/) || [])[1] || rijen.length + 1);
    const cellen = [];
    for(const c of rij.match(/<c\b[^>]*\/>|<c\b[\s\S]*?<\/c>/g) || []){
      const ref = (c.match(/^<c\b[^>]*\br="([A-Z]+\d+)"/) || [])[1];
      if(!ref) continue;
      const soort = (c.match(/^<c\b[^>]*\bt="([^"]+)"/) || [])[1] || 'n';
      const v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let w = '';
      if(soort === 's') w = v !== undefined ? (teksten[+v] || '') : '';
      else if(soort === 'inlineStr') w = tekstVan((c.match(/<is>[\s\S]*?<\/is>/) || [''])[0]);
      else if(v !== undefined) w = ontsnap(v);
      cellen[kolom(ref)] = w;
    }
    rijen[nr - 1] = Array.from(cellen, x => x || '');
  }
  return Array.from(rijen, r => r || []);
}

/* De rijen van een .csv (tekst): puntkomma of komma, wat er in de eerste regel het meest
   staat; tekst tussen aanhalingstekens mag scheidingstekens en "" bevatten. */
function csvRijen(tekst){
  tekst = String(tekst).replace(/^﻿/, '');
  const eerste = tekst.split(/\r?\n/)[0] || '';
  const sch = (eerste.match(/;/g) || []).length >= (eerste.match(/,/g) || []).length ? ';' : ',';
  const rijen = []; let rij = [], veld = '', aanh = false;
  for(let i = 0; i < tekst.length; i++){
    const c = tekst[i];
    if(aanh){
      if(c === '"' && tekst[i + 1] === '"'){ veld += '"'; i++; }
      else if(c === '"') aanh = false;
      else veld += c;
    } else if(c === '"') aanh = true;
    else if(c === sch){ rij.push(veld); veld = ''; }
    else if(c === '\n' || c === '\r'){
      if(c === '\r' && tekst[i + 1] === '\n') i++;
      rij.push(veld); rijen.push(rij); rij = []; veld = '';
    } else veld += c;
  }
  if(veld !== '' || rij.length){ rij.push(veld); rijen.push(rij); }
  return rijen;
}

/* ------------------------------------------------------ de armaturen eruit ---- */

/* A de code, F het totale aantal, I de artikelcode(s), J de omschrijving(en), L de
   opmerking - zoals inside sales de lijst maakt (B tot en met E zijn de aantallen per
   ruimte, G het armatuur uit het bestek, H en K een voorbeeldplaatje). */
const EXCEL_KOLOM = {code:0, aantal:5, artikelcode:8, omschrijving:9, opmerking:11};   /* A, F, I, J, L */
const enkel = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/* De armaturen uit de rijen: {rij, code, artikelcode, codes, omschrijving, aantal,
   opmerking}; rij is het rijnummer in Excel. Een rij zonder artikelcode en zonder
   omschrijving telt niet (een lege regel, een tussenkop met alleen iets in kolom A, een
   regel met alleen een 0 in de totaalkolom), en een kopregel ook niet: daar staat in
   kolom I of J een kolomnaam.
   Een armatuur met accessoires staat op één regel, met een + tussen de artikelcodes:
   "1000947-OS + 1000282" is het armatuur 1000947-OS met accessoire 1000282. codes is
   die reeks, het armatuur voorop; de omschrijvingen staan op dezelfde manier in J en
   worden pas met de catalogus erbij gesplitst (excelDelen()). Het aantal is het totaal
   uit kolom F, 0 als er niets of geen getal staat. */
const EXCEL_KOPWOORD = /^(artikel ?(code|nummer|nr\.?)|art\.? ?(nr\.?|nummer|code)|omschrijving|beschrijving|description|item ?(number|code)|sku|code|type)$/i;
function excelArmatuurRegels(rijen){
  const uit = [];
  rijen.forEach((r, i) => {
    const veld = k => enkel(r[EXCEL_KOLOM[k]]);
    const regel = {rij: i + 1, code: veld('code'), artikelcode: veld('artikelcode'), omschrijving: veld('omschrijving')};
    if(!regel.artikelcode && !regel.omschrijving) return;
    if(EXCEL_KOPWOORD.test(regel.artikelcode) || EXCEL_KOPWOORD.test(regel.omschrijving)) return;
    regel.codes = regel.artikelcode.split('+').map(enkel).filter(Boolean);
    if(!regel.codes.length) regel.codes = [''];
    const n = parseFloat(veld('aantal').replace(',', '.'));
    regel.aantal = isFinite(n) && n > 0 ? Math.round(n) : 0;
    regel.opmerking = veld('opmerking');
    uit.push(regel);
  });
  return uit;
}

/* De omschrijving uit J in stukken, één per artikelcode: [{artikelcode, omschrijving}].
   Ook in J staat een + tussen de stukken, maar een omschrijving kan zelf een + hebben
   ("2-CCT + bewegingssensor", "UGR<19 +Osram Driver"), dus niet elke + is een grens. De
   catalogus beslist: van alle manieren om te knippen wint die waarbij de stukken het
   minst verschillen van de namen in de catalogus (woorden die er in het ene wel en in
   het andere niet staan). Weet de catalogus het niet - een code die er niet in staat -
   dan wint de knip met de meeste stukken, en daarna die met de grenzen zo ver
   mogelijk naar achteren: een armatuur heeft vaker een + in zijn naam dan een
   accessoire. Zijn er minder stukken dan codes, dan blijft de omschrijving van de
   laatste leeg. */
function excelDelen(regel, catalogus){
  const codes = regel.codes && regel.codes.length ? regel.codes : [enkel(regel.artikelcode)];
  const t = enkel(regel.omschrijving), n = codes.length;
  if(n === 1) return [{artikelcode: codes[0], omschrijving: t}];
  const cat = codes.map(c => enkel(catalogusNaam(c, catalogus) || ''));
  const plussen = [];
  for(let i = 0; i < t.length; i++) if(t[i] === '+') plussen.push(i);
  const knip = sneden => {
    const d = []; let van = 0;
    sneden.forEach(p => { d.push(t.slice(van, p).trim()); van = p + 1; });
    d.push(t.slice(van).trim());
    while(d.length < n) d.push('');
    return d;
  };
  const kosten = d => d.reduce((k, stuk, i) => {
    if(!cat[i] || !stuk) return k;
    const [a, b] = woordVerschil(cat[i], stuk);
    return k + a.filter(w => !w.mee).length + b.filter(w => !w.mee).length;
  }, 0);
  let beste = knip([]), besteK = kosten(beste), stappen = 0;
  /* in oplopende volgorde; bij gelijke kosten wint de laatste, dus meer stukken en
     grenzen verder naar achteren */
  const probeer = (van, gekozen, aantal) => {
    if(++stappen > 20000) return;
    if(gekozen.length === aantal){
      const d = knip(gekozen), k = kosten(d);
      if(k <= besteK){ besteK = k; beste = d; }
      return;
    }
    for(let i = van; i < plussen.length; i++) probeer(i + 1, gekozen.concat(plussen[i]), aantal);
  };
  for(let aantal = 1; aantal <= Math.min(n - 1, plussen.length); aantal++) probeer(0, [], aantal);
  return codes.map((c, i) => ({artikelcode: c, omschrijving: beste[i]}));
}

/* De omschrijving uit de lijst naast die uit de catalogus, per artikel (een stuk uit
   excelDelen()). "Gelijk" is woord voor woord, op spaties na (de catalogus maakt van een
   dubbele spatie al een enkele).
     {soort:'gelijk',   naam}                beide hetzelfde
     {soort:'anders',   catalogus, excel}    de gebruiker kiest
     {soort:'catalogus', naam}               geen omschrijving in de lijst
     {soort:'excel',    naam}                artikelcode niet in de catalogus
     {soort:'leeg',     naam:''}             geen van beide */
function excelVergelijk(regel, catalogus){
  const cat = enkel(catalogusNaam(regel.artikelcode, catalogus) || ''), xl = enkel(regel.omschrijving);
  if(cat && xl) return cat === xl ? {soort:'gelijk', naam:cat} : {soort:'anders', catalogus:cat, excel:xl};
  if(cat) return {soort:'catalogus', naam:cat};
  if(xl) return {soort:'excel', naam:xl};
  return {soort:'leeg', naam:''};
}

/* Waar twee omschrijvingen verschillen, per woord: [{w, mee}] voor elk van beide, mee =
   false waar het woord in de andere niet op die plek staat (langste gemeenschappelijke
   reeks). Om een verschil van één teken in een lange omschrijving te kunnen zien. */
function woordVerschil(a, b){
  const x = enkel(a).split(' ').filter(Boolean), y = enkel(b).split(' ').filter(Boolean);
  const L = Array.from({length: x.length + 1}, () => new Array(y.length + 1).fill(0));
  for(let i = x.length - 1; i >= 0; i--) for(let j = y.length - 1; j >= 0; j--)
    L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ma = x.map(w => ({w, mee:false})), mb = y.map(w => ({w, mee:false}));
  for(let i = 0, j = 0; i < x.length && j < y.length;){
    if(x[i] === y[j]){ ma[i].mee = mb[j].mee = true; i++; j++; }
    else if(L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  return [ma, mb];
}

/* ------------------------------------------------------------- in de tool ---- */

const ArmaturenExcel = (function(){
  'use strict';
  let o = null;   /* wat de tool bij koppel() meegaf */

  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'})[c]);
  const metVerschil = woorden => woorden.map(x => x.mee ? esc(x.w) : '<mark>' + esc(x.w) + '</mark>').join(' ');

  async function leesBestand(bestand){
    const bytes = new Uint8Array(await bestand.arrayBuffer());
    if(bytes[0] === 0x50 && bytes[1] === 0x4B) return excelRijen(bytes);
    if(/\.csv$/i.test(bestand.name) || /^text\//.test(bestand.type)){
      let t = new TextDecoder('utf-8').decode(bytes);
      if(t.includes('�')) t = new TextDecoder('windows-1252').decode(bytes);   /* Excel schrijft csv vaak zo */
      return csvRijen(t);
    }
    if(bytes[0] === 0xD0 && bytes[1] === 0xCF) throw new Error('dit is een oud Excel-bestand (.xls). Sla het in Excel op als .xlsx en kies het opnieuw');
    throw new Error('dit is geen Excel-bestand (.xlsx) of .csv');
  }

  /* De regels in de lege regels van de tool, achter wat er al staat: de code, de
     artikelcode, de naam, het aantal, de opmerking en de accessoires. Bij een verschil
     staat eerst de omschrijving uit de catalogus erin; de keuze volgt in het venster.
     Een accessoire krijgt het aantal van zijn regel: "1000947-OS + 1000282" met 8 in
     de totaalkolom is acht keer het paneel met zijn noodmodule. */
  function vul(regels){
    const telling = {gelijk:0, anders:0, catalogus:0, excel:0, leeg:0}, verschillen = [];
    let plek = 0, accessoires = 0;
    regels.forEach(regel => {
      const ids = o.regelIds();
      while(plek < ids.length && !armSlotLeeg(o.regel(ids[plek]))) plek++;
      const id = plek < ids.length ? ids[plek] : o.nieuweRegel();
      plek++;
      const s = o.regel(id), delen = excelDelen(regel);
      const namen = delen.map((d, i) => {
        const v = excelVergelijk(d);
        telling[v.soort]++;
        if(v.soort === 'anders') verschillen.push({id, regel, deel: i, artikelcode: d.artikelcode, catalogus: v.catalogus, excel: v.excel, keuze: null});
        const naam = v.soort === 'anders' ? v.catalogus : v.naam;
        return {naam, auto: (v.soort === 'excel' || v.soort === 'leeg') ? '' : naam};
      });
      s.aanduiding = regel.code;
      s[o.artikelVeld()] = delen[0].artikelcode;
      s.name = namen[0].naam;
      s.naamUitCatalogus = namen[0].auto;
      s.groep = '';
      s.qty = regel.aantal;
      s.opmerking = regel.opmerking;
      s.accessoires = delen.slice(1).map((d, i) => ({code: d.artikelcode, name: namen[i + 1].naam, naamUitCatalogus: namen[i + 1].auto, qty: regel.aantal}));
      accessoires += s.accessoires.length;
    });
    return {telling, verschillen, accessoires};
  }

  /* Waar een gekozen naam heen gaat: deel 0 is het armatuur, 1 en verder zijn de
     accessoires. Een gekozen omschrijving uit de lijst is een eigen naam: die blijft
     staan als de artikelcode later verandert. */
  function zetKeuze(v){
    const s = o.regel(v.id), doel = v.deel ? (s.accessoires || [])[v.deel - 1] : s;
    if(!doel) return;
    doel.name = v.keuze === 'excel' ? v.excel : v.catalogus;
    doel.naamUitCatalogus = v.keuze === 'excel' ? '' : v.catalogus;
  }

  /* De keuze per verschil, in een venster dat pas dicht gaat als alles gekozen is. */
  function kies(verschillen, klaar){
    const dlg = document.createElement('dialog'); dlg.className = 'axl-venster';
    dlg.innerHTML = '<h3>De omschrijving wijkt af van de catalogus</h3>'
      + '<p class="axl-uitleg">Bij ' + (verschillen.length === 1 ? 'dit artikel' : 'deze ' + verschillen.length + ' artikelen')
      + ' is de omschrijving in de Excel-lijst niet woord voor woord gelijk aan die in de catalogus. Kies per artikel welke blijft; '
      + 'wat verschilt, is gemarkeerd.</p>'
      + '<div class="axl-alles"><button type="button" data-alles="catalogus">Overal de catalogus</button>'
      + '<button type="button" data-alles="excel">Overal de Excel-lijst</button></div>'
      + '<div class="axl-lijst"></div>'
      + '<div class="axl-voet"><span class="axl-nog"></span><button type="button" class="axl-ok" disabled>Overnemen</button></div>';
    const lijst = dlg.querySelector('.axl-lijst'), ok = dlg.querySelector('.axl-ok'), nog = dlg.querySelector('.axl-nog');
    const bij = () => {
      const open = verschillen.filter(v => !v.keuze).length;
      ok.disabled = open > 0;
      nog.textContent = open ? 'Nog ' + open + ' te kiezen' : '';
    };
    verschillen.forEach((v, i) => {
      const [wc, wx] = woordVerschil(v.catalogus, v.excel);
      const blok = document.createElement('fieldset'); blok.className = 'axl-regel';
      blok.innerHTML = '<legend>' + esc(v.regel.code || 'Regel ' + v.regel.rij) + ' &middot; ' + (v.deel ? 'accessoire ' : '') + esc(v.artikelcode)
        + ' <span>(Excel-rij ' + v.regel.rij + ')</span></legend>'
        + '<label><input type="radio" name="axl' + i + '" value="catalogus"><b>Catalogus</b><span>' + metVerschil(wc) + '</span></label>'
        + '<label><input type="radio" name="axl' + i + '" value="excel"><b>Excel-lijst</b><span>' + metVerschil(wx) + '</span></label>';
      blok.querySelectorAll('input').forEach(r => r.addEventListener('change', () => { v.keuze = r.value; bij(); }));
      lijst.appendChild(blok);
    });
    dlg.querySelectorAll('[data-alles]').forEach(b => b.addEventListener('click', () => {
      verschillen.forEach((v, i) => { v.keuze = b.dataset.alles; dlg.querySelector('input[name="axl' + i + '"][value="' + v.keuze + '"]').checked = true; });
      bij();
    }));
    /* Esc sluit het venster niet: er moet gekozen worden */
    dlg.addEventListener('cancel', e => e.preventDefault());
    ok.addEventListener('click', () => { dlg.close(); dlg.remove(); klaar(); });
    document.body.appendChild(dlg);
    bij();
    dlg.showModal();
  }

  async function laad(bestand){
    let regels;
    try{ regels = excelArmatuurRegels(await leesBestand(bestand)); }
    catch(err){ Melding.fout(bestand.name + ' kon niet worden ingelezen: ' + (err && err.message || err) + '.', {bij: o.knop}); return; }
    if(!regels.length){
      Melding.letop('In ' + bestand.name + ' staan geen armaturen: de tool leest de code uit kolom A, het aantal uit F, de artikelcode uit I, '
        + 'de omschrijving uit J en de opmerking uit L - een regel telt als er in I of J iets staat.', {bij: o.knop});
      return;
    }
    const {telling, verschillen, accessoires} = vul(regels);
    o.herbouw(); o.opWijziging();
    const kop = regels.length + (regels.length === 1 ? ' armatuur' : ' armaturen')
      + (accessoires ? ' met ' + accessoires + (accessoires === 1 ? ' accessoire' : ' accessoires') : '') + ' ingeladen uit ' + bestand.name;
    const delen = [];
    if(telling.gelijk) delen.push(telling.gelijk + ' gelijk aan de catalogus');
    if(telling.catalogus) delen.push(telling.catalogus + ' zonder omschrijving in de lijst, naam uit de catalogus');
    if(telling.excel) delen.push(telling.excel + ' niet in de catalogus, omschrijving uit de lijst (controleer die)');
    if(telling.leeg) delen.push(telling.leeg + ' niet in de catalogus en zonder omschrijving: vul de naam zelf in');
    /* niet in de catalogus: dan heeft niets de omschrijving gecontroleerd. Een lange
       melding, dus hij blijft langer staan dan een gewone. */
    const meld = () => (telling.excel || telling.leeg ? Melding.letop : Melding.goed)(kop + ': ' + delen.join(' · ') + '.', {duur: 12000});
    if(!verschillen.length){ meld(); return; }
    kies(verschillen, () => {
      verschillen.forEach(zetKeuze);
      o.herbouw(); o.opWijziging();
      const xl = verschillen.filter(v => v.keuze === 'excel').length, cat = verschillen.length - xl;
      delen.push(verschillen.length + ' afwijkend, gehouden: ' + [cat ? cat + '× de catalogus' : '', xl ? xl + '× de Excel-lijst' : ''].filter(Boolean).join(', '));
      meld();
    });
  }

  /* De tool geeft mee:
       o.knop, o.bestand    de knop "Excel inladen" en het verborgen <input type="file">
       o.regelIds()         de ids van de armatuurregels, in volgorde
       o.regel(id)          de staat van een regel ({aanduiding, name, code, ...})
       o.nieuweRegel()      een regel erbij; geeft zijn id
       o.artikelVeld()      waar de artikelcode in gaat ('code', of 'codeDali' bij DALI)
       o.herbouw()          de lijst opnieuw tekenen
       o.opWijziging()      de tool ververst */
  function koppel(opties){
    o = opties;
    o.knop.addEventListener('click', () => o.bestand.click());
    o.bestand.addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if(f) laad(f);
    });
  }

  /* Een projectbestand is de pagina zoals hij stond; is er opgeslagen terwijl het venster
     open stond, dan zit het erin - zonder werkende knoppen. Weg ermee. Het staat achteraan
     in <body>, na dit script, dus pas als de pagina helemaal gelezen is. */
  const ruimOp = () => document.querySelectorAll('.axl-venster').forEach(d => d.remove());
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ruimOp); else ruimOp();

  /* opmaak van de knop en het venster, één keer; een opgeslagen projectbestand bewaart dit blok */
  const stijl = document.getElementById('axl-stijl') || document.createElement('style');
  stijl.id = 'axl-stijl';
  stijl.textContent = `
  .axl-keuze{display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin:0 0 10px;}
  .axl-keuze button{border:1.5px solid var(--blue, #3E8EDE); border-radius:8px; padding:7px 12px; background:#fff;
    color:var(--blue-dark, #1F5FA3); font-family:'Nunito Sans',sans-serif; font-size:12.5px; font-weight:700; cursor:pointer;}
  .axl-keuze button:hover{background:var(--blue-light, #EAF3FC);}
  .axl-keuze span{font-size:12px; color:var(--slate, #5A6B84);}
  .axl-venster{border:none; border-radius:14px; padding:22px 24px; width:min(760px, 94vw); max-height:86vh;
    font-family:'Nunito Sans',sans-serif; color:var(--ink, #12213D); box-shadow:0 18px 50px rgba(11,24,48,.35);}
  .axl-venster::backdrop{background:rgba(11,24,48,.55);}
  .axl-venster h3{margin:0 0 6px; font-size:17px;}
  .axl-uitleg{margin:0 0 12px; font-size:13px; color:var(--slate, #5A6B84); line-height:1.5;}
  .axl-alles{display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;}
  .axl-venster button{border:1.5px solid var(--blue, #3E8EDE); border-radius:8px; padding:6px 12px; background:#fff;
    color:var(--blue-dark, #1F5FA3); font-family:inherit; font-size:12.5px; font-weight:700; cursor:pointer;}
  .axl-venster button:hover{background:var(--blue-light, #EAF3FC);}
  .axl-venster button.axl-ok{background:var(--blue, #3E8EDE); color:#fff;}
  .axl-venster button.axl-ok:disabled{opacity:.4; cursor:default;}
  .axl-lijst{display:flex; flex-direction:column; gap:10px; margin-bottom:12px;}
  .axl-regel{border:1.5px solid var(--border, #D5DEEA); border-radius:10px; padding:8px 12px 10px; margin:0;}
  .axl-regel legend{font-size:12.5px; font-weight:800; padding:0 4px;}
  .axl-regel legend span{font-weight:600; color:var(--slate, #5A6B84);}
  .axl-regel label{display:grid; grid-template-columns:auto 92px 1fr; gap:8px; align-items:baseline; font-size:12.5px;
    padding:4px 2px; cursor:pointer; line-height:1.45;}
  .axl-regel label b{font-weight:700;}
  .axl-regel mark{background:#FFE08A; border-radius:3px; padding:0 2px;}
  .axl-voet{display:flex; justify-content:flex-end; align-items:center; gap:12px;}
  .axl-nog{font-size:12.5px; color:var(--slate, #5A6B84);}`;
  document.head.appendChild(stijl);

  return {koppel};
})();
