import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require(new URL('../vendor/pdf-lib.min.js', import.meta.url).pathname);
const { PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream } = L;
const [pad, nr, uit] = process.argv.slice(2);
const doc = await PDFDocument.load(readFileSync(pad), { updateMetadata: false });
const page = doc.getPages()[+nr - 1];
const c = page.node.Contents();
const stukken = c instanceof PDFArray ? Array.from({length:c.size()},(_,i)=>c.get(i)) : [c];
let buf = Buffer.alloc(0);
for (const st of stukken) {
  const s = st instanceof PDFRawStream ? st : doc.context.lookup(st);
  buf = Buffer.concat([buf, Buffer.from(decodePDFRawStream(s).decode())]);
}
writeFileSync(uit, buf);
console.log(uit, buf.length, 'bytes');
