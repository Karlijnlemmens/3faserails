/* Vergelijkt twee mappen met PDF's op INHOUD in plaats van op bytes: per pagina de
   gedecodeerde tekenopdrachten, plus de ingesloten beelden en lettertypen. Zo blijft
   een verschuiving van objectnummers (andere insluitvolgorde) buiten beeld, terwijl
   elke wijziging in wat er getekend wordt wel opvalt. */
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require(new URL('../vendor/pdf-lib.min.js', import.meta.url).pathname);
const { PDFDocument, PDFArray, PDFRawStream, PDFDict, PDFName, decodePDFRawStream } = L;

const h = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);

function streamBytes(ctx, obj) {
  const s = obj instanceof PDFRawStream ? obj : ctx.lookup(obj);
  if (!(s instanceof PDFRawStream)) return null;
  try { return Buffer.from(decodePDFRawStream(s).decode()); }
  catch { return Buffer.from(s.contents); }
}

async function vinger(pad) {
  const doc = await PDFDocument.load(readFileSync(pad), { updateMetadata: false });
  const ctx = doc.context;
  const paginas = [];
  for (const page of doc.getPages()) {
    const c = page.node.Contents();
    let buf = Buffer.alloc(0);
    if (c instanceof PDFArray) {
      for (let i = 0; i < c.size(); i++) { const b = streamBytes(ctx, c.get(i)); if (b) buf = Buffer.concat([buf, b]); }
    } else { const b = streamBytes(ctx, c); if (b) buf = Buffer.concat([buf, b]); }

    /* Beelden en lettertypen: de inhoud telt, niet de naam die de PDF eraan geeft. */
    const res = page.node.Resources();
    const merken = [];
    for (const soort of ['XObject', 'Font']) {
      const d = res && res.lookup(PDFName.of(soort), PDFDict);
      if (!d) continue;
      const stukken = [];
      for (const [, ref] of d.entries()) {
        const o = ctx.lookup(ref);
        if (o instanceof PDFRawStream) stukken.push(soort + ':' + o.contents.length + ':' + h(Buffer.from(o.contents)));
        else if (o instanceof PDFDict) {
          const bf = o.lookup(PDFName.of('BaseFont'));
          /* Het subset-voorvoegsel (ABCDEF+) en het objectnummer achter de naam
             (Poppins-Bold-2114) hangen af van hoeveel er in het document staat,
             niet van wat er getekend wordt; de familienaam blijft over. */
          stukken.push(soort + ':' + String(bf || '').replace(/^\/[A-Z]{6}\+/, '/').replace(/-\d+$/, ''));
        }
      }
      merken.push(soort + '[' + stukken.sort().join('|') + ']');
    }
    /* pdf-lib verzint resource-namen (/Image-7264808453, /Poppins-Bold-3800713913)
       aan de hand van de insluitvolgorde; het nummer zegt niets over de tekening. */
    const kaal = buf.toString('latin1').replace(/\/(Image|[A-Za-z]+-[A-Za-z]+)-\d+/g, '/$1-N');
    paginas.push({ inhoud: h(Buffer.from(kaal, 'latin1')), lengte: buf.length, res: h(merken.join(';')) });
  }
  return { paginas, totaal: h(paginas.map(p => p.inhoud + p.res).join('#')) };
}

const [a, b] = process.argv.slice(2);
const namen = readdirSync(a).filter(f => f.endsWith('.pdf'));
let anders = 0;
for (const n of namen) {
  const va = await vinger(a + '/' + n), vb = await vinger(b + '/' + n);
  const ok = va.totaal === vb.totaal && va.paginas.length === vb.paginas.length;
  if (!ok) anders++;
  console.log((ok ? 'GELIJK  ' : 'ANDERS  ') + n.padEnd(24) + ` ${va.paginas.length}p ${va.totaal}  vs  ${vb.paginas.length}p ${vb.totaal}`);
  if (!ok) {
    const m = Math.max(va.paginas.length, vb.paginas.length);
    for (let i = 0; i < m; i++) {
      const pa = va.paginas[i], pb = vb.paginas[i];
      if (!pa || !pb || pa.inhoud !== pb.inhoud || pa.res !== pb.res)
        console.log(`   p${i + 1}: ${pa ? pa.inhoud + '/' + pa.lengte + 'b' : '-'}  vs  ${pb ? pb.inhoud + '/' + pb.lengte + 'b' : '-'}` +
          (pa && pb && pa.res !== pb.res ? '   (resources verschillen)' : ''));
    }
  }
}
console.log(`\n${namen.length - anders} gelijk, ${anders} anders`);
process.exit(anders ? 1 : 0);
