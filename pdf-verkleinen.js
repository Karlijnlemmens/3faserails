/* Een PDF onder een grootte krijgen door de foto's erin lichter te maken - gedeeld door
   het armaturenboek en de railtool, voor het projectenboek.

   Een projectenboek met veel armatuurtypen en een lichtplan uit DIALux komt al gauw
   boven de 10 MB, en dan weigeren mailservers hem. Wat daarin zwaar is, verschilt:
   - de presenters zijn bij het bakken al met Ghostscript gecomprimeerd; wat daar nog
     overblijft is voor een groot deel vectorwerk (tekeningen, tekst) - bij het
     familieblad van de Sigma G2 IP44 3,0 van de 3,4 MB - en dat kan niet kleiner
     zonder er een plaatje van te maken;
   - de foto's wel: in de jongste familiebladen 70-80% van het gewicht, en in een
     lichtplan de renderings, vaak op een resolutie ver boven wat een A4 laat zien.
   Dus: alleen afbeeldingen, en alleen als het boek boven de grens zit. Ze worden in
   stappen kleiner gemaakt (eerst alleen te grote JPEG's, dan steeds verder) tot het
   boek eronder zit; de eerste stap die volstaat wint, zodat er nooit meer kwaliteit
   weggaat dan nodig. Elke stap begint bij het origineel, niet bij de vorige stap.

   Wat het overslaat, omdat het er slechter van zou worden: CMYK en andere bijzondere
   kleurruimtes (de kleuren zouden verschuiven), een /Decode die iets doet (een neutrale,
   zoals Ghostscript die schrijft, mag), een kleurmasker, maskers zelf (een /SMask of
   /Mask hoort scherp te blijven), en afbeeldingen die niet 8 bits per kleur zijn. Een
   vlakke afbeelding (FlateDecode: een schema, een icoon) gaat pas in de latere stappen
   naar JPEG, en alleen als hij groot is; kleine foto's pas in de laatste.

   Gebruik: const r = await PdfVerkleinen.tot(bytes, 10);
            r.bytes, r.voor en r.na (in bytes), r.verkleind, r.gehaald
   Een gewoon <script src>, geen module; laden na vendor/pdf-lib.min.js.
   pngOntvoorspel() en decodeNeutraal() staan op het hoogste niveau, voor de controle. */

/* PNG-voorspellers (DecodeParms /Predictor 10-15) per rij terugdraaien: elke rij begint
   met een byte voor de soort (0 geen, 1 links, 2 boven, 3 gemiddelde, 4 Paeth). Op het
   hoogste niveau, zodat tools/controleer-logica.mjs hem kan testen. */
function pngOntvoorspel(data, kolommen, kleuren){
  const bpp = kleuren, rij = kolommen * kleuren, rijen = Math.floor(data.length / (rij + 1));
  const uit = new Uint8Array(rij * rijen);
  let vorige = new Uint8Array(rij);
  for(let r = 0, i = 0; r < rijen; r++){
    const soort = data[i++], huidig = uit.subarray(r * rij, (r + 1) * rij);
    for(let x = 0; x < rij; x++, i++){
      const a = x >= bpp ? huidig[x - bpp] : 0, b = vorige[x], c = x >= bpp ? vorige[x - bpp] : 0;
      let v = data[i];
      if(soort === 1) v += a;
      else if(soort === 2) v += b;
      else if(soort === 3) v += (a + b) >> 1;
      else if(soort === 4){ const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : pb <= pc ? b : c; }
      huidig[x] = v & 255;
    }
    vorige = huidig;
  }
  return uit;
}
/* Een /Decode die niets doet ([0 1] per kleur, zoals Ghostscript hem vaak schrijft) mag;
   een die kleuren omkeert of verschuift niet. getallen: de waarden, of null als er geen is. */
function decodeNeutraal(getallen, kleuren){
  if(!getallen) return true;
  return getallen.length === 2 * kleuren && getallen.every((g, i)=> g === i % 2);
}

const PdfVerkleinen = (function(){
  'use strict';

  /* De stappen: de langste zijde in pixels, de JPEG-kwaliteit, vanaf hoe groot een foto
     meedoet (kleiner loont het opnieuw maken niet) en vanaf hoe groot een vlakke
     afbeelding (FlateDecode) naar JPEG mag. 2000 px over een A4-breedte is zo'n 240 dpi,
     1200 px nog 145 dpi - op papier en scherm nog netjes. */
  const STAPPEN = [
    {max:2000, q:0.85, vanaf:40*1024, vlakVanaf:Infinity},
    {max:1600, q:0.78, vanaf:40*1024, vlakVanaf:300*1024},
    {max:1200, q:0.70, vanaf:40*1024, vlakVanaf:100*1024},
    /* het laatste redmiddel, alleen als de drie hiervoor niet genoeg zijn: op 1000 px is
       een foto over een halve A4 nog 250 dpi, een rendering over de hele breedte ~95; en
       nu doen ook de kleine foto's mee (in een boek met veel typen samen een paar MB) */
    {max:1000, q:0.60, vanaf:12*1024, vlakVanaf:60*1024},
  ];
  const KLEIN = Math.min(...STAPPEN.map(s=>s.vanaf));

  const N = n => PDFLib.PDFName.of(n);

  /* De kleurruimte als 'rgb', 'grijs' of null (overslaan). */
  function kleurruimte(ctx, waarde){
    const cs = ctx.lookup(waarde);
    if(cs instanceof PDFLib.PDFName){
      const s = cs.asString();
      return s === '/DeviceRGB' ? 'rgb' : s === '/DeviceGray' ? 'grijs' : null;
    }
    if(cs instanceof PDFLib.PDFArray && cs.size() === 2 && String(ctx.lookup(cs.get(0))) === '/ICCBased'){
      const icc = ctx.lookup(cs.get(1));
      const n = icc && icc.dict ? Number(String(icc.dict.get(N('N')))) : 0;
      return n === 3 ? 'rgb' : n === 1 ? 'grijs' : null;
    }
    return null;
  }

  /* Welke afbeeldingen in aanmerking komen, met wat er nodig is om ze opnieuw te maken. */
  function kandidaten(doc){
    const ctx = doc.context, maskers = new Set(), uit = [];
    const alle = ctx.enumerateIndirectObjects();
    for(const [, obj] of alle){
      const d = obj && obj.dict;
      if(!d) continue;
      for(const k of ['SMask', 'Mask']){
        const m = d.get(N(k));
        if(m instanceof PDFLib.PDFRef) maskers.add(m.toString());
      }
    }
    for(const [ref, obj] of alle){
      if(!(obj instanceof PDFLib.PDFRawStream)) continue;
      const d = obj.dict;
      if(String(d.get(N('Subtype'))) !== '/Image' || maskers.has(ref.toString())) continue;
      if(String(d.get(N('ImageMask'))) === 'true') continue;
      if(d.get(N('Mask')) instanceof PDFLib.PDFArray) continue;
      const filt = ctx.lookup(d.get(N('Filter')));
      const f = filt instanceof PDFLib.PDFArray ? (filt.size() === 1 ? String(ctx.lookup(filt.get(0))) : '') : String(filt);
      if(f !== '/DCTDecode' && f !== '/FlateDecode') continue;
      const bpc = Number(String(d.get(N('BitsPerComponent')) || '8'));
      if(bpc !== 8) continue;
      const kleur = kleurruimte(ctx, d.get(N('ColorSpace')));
      const dec = ctx.lookup(d.get(N('Decode')));
      const getallen = !dec ? null : dec instanceof PDFLib.PDFArray ? dec.asArray().map(g=> Number(String(g))) : [NaN];
      if(!kleur || !decodeNeutraal(getallen, kleur === 'rgb' ? 3 : 1)) continue;
      if(obj.contents.length < KLEIN) continue;
      uit.push({ref, dict:d, inhoud:obj.contents, jpeg: f === '/DCTDecode', kleur,
        w: Number(String(d.get(N('Width')))), h: Number(String(d.get(N('Height')))),
        parms: ctx.lookup(d.get(N('DecodeParms')))});
    }
    return uit;
  }

  async function inflate(bytes){
    const ds = new DecompressionStream('deflate');
    const uit = new Response(new Blob([bytes]).stream().pipeThrough(ds));
    return new Uint8Array(await uit.arrayBuffer());
  }
  /* De afbeelding als iets wat op een canvas kan. */
  async function decodeer(k){
    if(k.jpeg) return createImageBitmap(new Blob([k.inhoud], {type:'image/jpeg'}));
    let px = await inflate(k.inhoud);
    const kleuren = k.kleur === 'rgb' ? 3 : 1;
    const voorspeller = k.parms && k.parms.get ? Number(String(k.parms.get(N('Predictor')) || '1')) : 1;
    if(voorspeller >= 10) px = pngOntvoorspel(px, k.w, kleuren);
    else if(voorspeller !== 1) throw new Error('voorspeller ' + voorspeller);
    if(px.length < k.w * k.h * kleuren) throw new Error('te weinig pixels');
    const beeld = new ImageData(k.w, k.h);
    for(let i = 0, j = 0; i < k.w * k.h; i++){
      const r = px[j], g = kleuren === 3 ? px[j + 1] : r, b = kleuren === 3 ? px[j + 2] : r;
      beeld.data[i*4] = r; beeld.data[i*4 + 1] = g; beeld.data[i*4 + 2] = b; beeld.data[i*4 + 3] = 255;
      j += kleuren;
    }
    return createImageBitmap(beeld);
  }

  /* Opnieuw als JPEG, op hoogstens max px langs de langste zijde. null als het niet
     kleiner wordt (dan blijft het origineel). */
  async function maakOpnieuw(k, stap){
    if(k.inhoud.length < stap.vanaf) return null;
    if(!k.jpeg && k.inhoud.length < stap.vlakVanaf) return null;
    const schaal = Math.min(1, stap.max / Math.max(k.w, k.h));
    if(k.jpeg && schaal === 1 && stap.q >= 0.85) return null;   /* de eerste stap: alleen te grote */
    const bron = await decodeer(k);
    const w = Math.max(1, Math.round(k.w * schaal)), h = Math.max(1, Math.round(k.h * schaal));
    const doek = document.createElement('canvas'); doek.width = w; doek.height = h;
    const g = doek.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.imageSmoothingQuality = 'high';
    g.drawImage(bron, 0, 0, w, h);
    if(bron.close) bron.close();
    const blob = await new Promise(ok => doek.toBlob(ok, 'image/jpeg', stap.q));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if(bytes.length > k.inhoud.length * 0.9) return null;
    return {w, h, bytes};
  }

  /* De nieuwe afbeelding in de plaats van de oude: dezelfde woordenlijst (een /SMask
     blijft gewoon hangen, ook als die een andere maat heeft), met een andere filter,
     maat en kleurruimte. */
  function zetIn(doc, k, nieuw){
    const d = k.dict.clone(doc.context);
    d.set(N('Filter'), N('DCTDecode'));
    d.set(N('Width'), PDFLib.PDFNumber.of(nieuw.w));
    d.set(N('Height'), PDFLib.PDFNumber.of(nieuw.h));
    d.set(N('ColorSpace'), N('DeviceRGB'));
    d.set(N('BitsPerComponent'), PDFLib.PDFNumber.of(8));
    d.delete(N('DecodeParms'));
    d.delete(N('Decode'));
    doc.context.assign(k.ref, PDFLib.PDFRawStream.of(d, nieuw.bytes));
  }

  async function tot(bytes, doelMB){
    const doel = doelMB * 1048576;
    const voor = bytes.length;
    if(voor <= doel) return {bytes, voor, na:voor, verkleind:false, gehaald:true};
    let beste = bytes;
    for(const stap of STAPPEN){
      const doc = await PDFLib.PDFDocument.load(bytes, {updateMetadata:false});
      let aantal = 0;
      for(const k of kandidaten(doc)){
        try{
          const nieuw = await maakOpnieuw(k, stap);
          if(nieuw){ zetIn(doc, k, nieuw); aantal++; }
        }catch(err){ /* deze laten we zoals hij is */ }
      }
      if(!aantal) continue;
      const uit = await doc.save({useObjectStreams:true});
      if(uit.length < beste.length) beste = uit;
      if(uit.length <= doel) break;
    }
    return {bytes:beste, voor, na:beste.length, verkleind: beste !== bytes, gehaald: beste.length <= doel};
  }

  return {tot, STAPPEN};
})();
