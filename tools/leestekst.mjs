/* Zet de glyph-codes uit een pagina-contentstream terug om naar leesbare tekst via
   de ToUnicode-tabel van het lettertype. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require(new URL('../vendor/pdf-lib.min.js', import.meta.url).pathname);
const { PDFDocument, PDFArray, PDFRawStream, PDFDict, PDFName, decodePDFRawStream } = L;

const [pad, nr, zoek] = process.argv.slice(2);
const doc = await PDFDocument.load(readFileSync(pad), { updateMetadata: false });
const page = doc.getPages()[+nr - 1];
const ctx = doc.context;

/* ToUnicode per fontnaam */
const kaart = {};
const fonts = page.node.Resources().lookup(PDFName.of('Font'), PDFDict);
for (const [k, ref] of fonts.entries()) {
  const f = ctx.lookup(ref);
  const tu = f.lookup(PDFName.of('ToUnicode'));
  if (!tu) continue;
  const s = tu instanceof PDFRawStream ? tu : ctx.lookup(tu);
  const cmap = Buffer.from(decodePDFRawStream(s).decode()).toString('latin1');
  const m = {};
  for (const mm of cmap.matchAll(/<([0-9a-fA-F]{4})>\s*<([0-9a-fA-F]{4,})>/g))
    m[mm[1].toLowerCase()] = String.fromCharCode(parseInt(mm[2].slice(0, 4), 16));
  kaart[k.toString()] = m;
}

const c = page.node.Contents();
const stukken = c instanceof PDFArray ? Array.from({ length: c.size() }, (_, i) => c.get(i)) : [c];
let buf = Buffer.alloc(0);
for (const st of stukken) {
  const s = st instanceof PDFRawStream ? st : ctx.lookup(st);
  buf = Buffer.concat([buf, Buffer.from(decodePDFRawStream(s).decode())]);
}
const txt = buf.toString('latin1');

let font = null, tm = null;
for (const regel of txt.split('\n')) {
  let m;
  if ((m = /^(\/\S+)\s+[\d.]+\s+Tf$/.exec(regel.trim()))) font = m[1];
  else if ((m = /^1 0 0 1 ([\d.-]+) ([\d.-]+) Tm$/.exec(regel.trim()))) tm = [m[1], m[2]];
  else if ((m = /^<([0-9a-fA-F]*)>\s*Tj$/.exec(regel.trim()))) {
    const hex = m[1]; const mp = kaart[font] || {};
    let s = '';
    for (let i = 0; i < hex.length; i += 4) s += mp[hex.slice(i, i + 4).toLowerCase()] ?? '?';
    if (!zoek || (tm && tm[1].startsWith(zoek))) console.log(`x=${tm?.[0]} y=${tm?.[1]}  ${JSON.stringify(s)}`);
  }
}
