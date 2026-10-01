/* Een Excel-werkboek (.xlsx) lezen zonder npm - voor de scripts in tools/, nooit door
 * de app geladen.
 *
 * Een xlsx is een zip met XML erin. Node heeft geen zipreader, maar meer dan de
 * centrale inhoudsopgave aflopen en per onderdeel inflateRaw draaien is het niet.
 * Gebruikt door maak-bandraster-beelden.mjs (de celafbeeldingen van de
 * bandraster-intake) en controleer-logica.mjs (de codeparen van de railtool tegen
 * docs/bronnen/PCODES LCODES.xlsx).
 */
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

/* Alle onderdelen van de zip: naam -> Buffer. */
export function zipLees(buf){
  const eocd = (() => {
    for(let i = buf.length - 22; i >= 0; i--) if(buf.readUInt32LE(i) === 0x06054b50) return i;
    throw new Error('Geen zip: het einde van de inhoudsopgave ontbreekt.');
  })();
  let p = buf.readUInt32LE(eocd + 16);
  const aantal = buf.readUInt16LE(eocd + 10), uit = new Map();
  for(let i = 0; i < aantal; i++){
    if(buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Beschadigde inhoudsopgave in de zip.');
    const nLen = buf.readUInt16LE(p + 28), eLen = buf.readUInt16LE(p + 30), cLen = buf.readUInt16LE(p + 32);
    const naam = buf.toString('utf8', p + 46, p + 46 + nLen);
    const lokaal = buf.readUInt32LE(p + 42);
    const methode = buf.readUInt16LE(p + 10), gepakt = buf.readUInt32LE(p + 20);
    const lnLen = buf.readUInt16LE(lokaal + 26), leLen = buf.readUInt16LE(lokaal + 28);
    const start = lokaal + 30 + lnLen + leLen;
    const rauw = buf.subarray(start, start + gepakt);
    uit.set(naam, methode === 0 ? Buffer.from(rauw) : inflateRawSync(rauw));
    p += 46 + nLen + eLen + cLen;
  }
  return uit;
}

const ontsnap = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/* De rijen van een blad als arrays van tekst, kolom A op plek 0; een lege cel is ''.
   blad is het nummer van xl/worksheets/sheetN.xml (het eerste blad is meestal 1). */
export function bladRijen(pad, blad = 1){
  const zip = zipLees(readFileSync(pad));
  const tekst = naam => {
    const b = zip.get(naam);
    if(!b) throw new Error('Ontbreekt in het werkboek: ' + naam);
    return b.toString('utf8');
  };
  const gedeeld = zip.has('xl/sharedStrings.xml')
    ? Array.from(tekst('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g),
        m => Array.from(m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g), t => ontsnap(t[1])).join(''))
    : [];
  const kolom = letters => letters.split('').reduce((s, c) => s * 26 + c.charCodeAt(0) - 64, 0) - 1;
  return Array.from(tekst('xl/worksheets/sheet' + blad + '.xml').matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g), r => {
    const rij = [];
    for(const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
      const type = (/\bt="(\w+)"/.exec(c[2]) || [])[1], binnen = c[3] || '';
      const v = (/<v>([\s\S]*?)<\/v>/.exec(binnen) || [])[1];
      const inline = (/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(binnen) || [])[1];
      rij[kolom(c[1])] = type === 's' ? gedeeld[+v] : inline !== undefined ? ontsnap(inline) : v !== undefined ? ontsnap(v) : '';
    }
    return Array.from(rij, x => x === undefined ? '' : x);
  });
}
