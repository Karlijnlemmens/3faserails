/* Minimale PNG-lezer, zonder externe pakketten (alleen zlib uit Node zelf).
 *
 * Wordt gebruikt door maak-merkbestanden.mjs om de huisstijlkleuren uit het logo af te
 * lezen, zodat die niet met de hand overgenomen hoeven te worden. Ondersteunt de
 * gewone gevallen waarin een logo geexporteerd wordt: 8 bits per kanaal, RGB/RGBA/
 * grijs/palet, niet-interlaced. Lukt het niet, dan geeft lees() null terug - de
 * aanroeper slaat het aflezen dan gewoon over.
 */
import { inflateSync } from 'node:zlib';

const PAETH = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
};

export function lees(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  let o = 8, ihdr = null, palet = null, alfaPalet = null;
  const idat = [];
  while (o + 8 <= buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('latin1', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        w: data.readUInt32BE(0), h: data.readUInt32BE(4),
        diepte: data[8], kleurtype: data[9], interlace: data[12],
      };
    } else if (type === 'PLTE') palet = data;
    else if (type === 'tRNS') alfaPalet = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  if (!ihdr || !idat.length) return null;
  if (ihdr.diepte !== 8 || ihdr.interlace !== 0) return null;

  const kanalen = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.kleurtype];
  if (!kanalen) return null;
  if (ihdr.kleurtype === 3 && !palet) return null;

  let ruw;
  try { ruw = inflateSync(Buffer.concat(idat)); } catch { return null; }

  const bpp = kanalen, stride = ihdr.w * bpp;
  if (ruw.length < (stride + 1) * ihdr.h) return null;
  const vlak = Buffer.alloc(stride * ihdr.h);
  for (let ry = 0; ry < ihdr.h; ry++) {
    const filter = ruw[ry * (stride + 1)];
    const bron = ruw.subarray(ry * (stride + 1) + 1, ry * (stride + 1) + 1 + stride);
    const rij = vlak.subarray(ry * stride, (ry + 1) * stride);
    const boven = ry ? vlak.subarray((ry - 1) * stride, ry * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? rij[i - bpp] : 0;
      const b = boven ? boven[i] : 0;
      const c = (boven && i >= bpp) ? boven[i - bpp] : 0;
      let v = bron[i];
      if (filter === 1) v += a; else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1; else if (filter === 4) v += PAETH(a, b, c);
      rij[i] = v & 0xff;
    }
  }

  /* naar RGBA */
  const uit = Buffer.alloc(ihdr.w * ihdr.h * 4);
  for (let i = 0, n = ihdr.w * ihdr.h; i < n; i++) {
    let r, g, b, a = 255;
    const p = i * bpp;
    if (ihdr.kleurtype === 2) { r = vlak[p]; g = vlak[p + 1]; b = vlak[p + 2]; }
    else if (ihdr.kleurtype === 6) { r = vlak[p]; g = vlak[p + 1]; b = vlak[p + 2]; a = vlak[p + 3]; }
    else if (ihdr.kleurtype === 0) { r = g = b = vlak[p]; }
    else if (ihdr.kleurtype === 4) { r = g = b = vlak[p]; a = vlak[p + 1]; }
    else { const idx = vlak[p]; r = palet[idx * 3]; g = palet[idx * 3 + 1]; b = palet[idx * 3 + 2];
           if (alfaPalet && idx < alfaPalet.length) a = alfaPalet[idx]; }
    uit[i * 4] = r; uit[i * 4 + 1] = g; uit[i * 4 + 2] = b; uit[i * 4 + 3] = a;
  }
  return { w: ihdr.w, h: ihdr.h, data: uit };
}

const hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0').toUpperCase()).join('');

/* Zoekt de opvallendste kleuren in een logo: verzadigde kleuren eerst (dat is het
   merkaccent), daarna de donkerste en lichtste tint. Zwart/wit/grijs worden apart
   gehouden, want die zeggen niets over de huisstijl. */
export function kleuren(afb) {
  /* Groeperen op grove stappen zodat anti-aliasing niet duizend varianten oplevert,
     maar per groep het echte gemiddelde bijhouden - anders zou de merkkleur
     verschuiven door het afronden. */
  const groepen = new Map();
  for (let i = 0; i < afb.data.length; i += 4) {
    if (afb.data[i + 3] < 200) continue;
    const r = afb.data[i], g = afb.data[i + 1], b = afb.data[i + 2];
    const k = ((r & 0xf8) << 16) | ((g & 0xf8) << 8) | (b & 0xf8);
    let v = groepen.get(k);
    if (!v) groepen.set(k, v = { r: 0, g: 0, b: 0, n: 0 });
    v.r += r; v.g += g; v.b += b; v.n++;
  }
  const lijst = [...groepen.values()].map(v => {
    const r = Math.round(v.r / v.n), g = Math.round(v.g / v.n), b = Math.round(v.b / v.n);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    return { r, g, b, n: v.n, hex: hex(r, g, b), verzadiging: max === 0 ? 0 : (max - min) / max, helderheid: max / 255 };
  });
  const kleurrijk = lijst.filter(c => c.verzadiging > 0.35 && c.helderheid > 0.15)
    .sort((a, b) => b.n - a.n).slice(0, 4);
  const neutraal = lijst.filter(c => c.verzadiging <= 0.35)
    .sort((a, b) => b.n - a.n).slice(0, 3);
  return { accenten: kleurrijk, neutralen: neutraal };
}
