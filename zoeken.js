/* Gedeelde zoekhulp voor de tools van de suite.

   Zoeken ging per tool op zijn eigen manier, en overal op dezelfde manier mis:
   de invoer werd als één stuk tekst gezocht ("rail wit" vond niets, "wit rail"
   evenmin), accenten telden mee ("plafonniere" vond niets waar "plafonnière"
   er negen vond) en een tikfout gaf een lege lijst zonder aanwijzing. Wat hier
   staat is het deel dat voor elke tool hetzelfde is: invoer gelijktrekken,
   in woorden knippen, een woord in een tekst terugvinden, en bij een lege
   uitkomst een suggestie doen. Wat een tool doorzoekt en hoe hij rangschikt
   blijft bij de tool zelf.

   Een gewoon <script src="zoeken.js">, geen module: modules laden niet vanaf
   schijf (file://). De functies staan op het hoogste niveau, net als in
   armatuur-groepen.js, zodat tools/controleer-logica.mjs ze kan uitsnijden. */

/* Kleine letters, accenten eraf, en de schrijfwijzen van maten en eenheden
   gelijk: "60 x 60" en "60×60" worden "60x60", "4000 K" wordt "4000k". Zo
   vinden invoer en tekst elkaar ongeacht hoe een van beide getypt is. */
function zoekNormaal(s){
  let t = String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/×/g, 'x');
  /* twee keer, want bij "60 x 60 x 10" slaat de eerste ronde de tweede x over */
  for(let i = 0; i < 2; i++) t = t.replace(/(\d)\s*x\s*(\d)/g, '$1x$2');
  return t.replace(/(\d)\s+(k|w|lm|mm|cm|v|ma)\b/g, '$1$2')
    .replace(/\s+/g, ' ').trim();
}

function zoekWoorden(s){
  return zoekNormaal(s).split(' ').filter(Boolean);
}

/* Een code zonder opmaak: kleine letters, alleen letters en cijfers. Nooit
   zomaar gebruiken om te vergelijken - zie codeKlopt(): in de catalogus
   verschillen 4030-P-HO en 4030-PHO alleen in een streepje en het zijn twee
   verschillende artikelen. */
function codeSleutel(s){
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/* Ziet dit woord eruit als een artikelnummer of barcode? Vijf cijfers op een
   rij of meer, en niet eindigend op een eenheid: "1043227" en "1043227-tc-da"
   wel, "13000lm" en "4000k" niet. Zo'n woord moet een-op-een kloppen en mag
   nooit als los stuk tekst ergens in passen - anders lift "104322" mee op
   1043227 en biedt de tool een artikel aan dat niemand intypte. */
function lijktCode(w){
  return /\d{5,}/.test(w) && !/\d(lm|k|w|mm|cm|v|ma)$/.test(w);
}

/* Komt dit woord in de tekst voor? Een woord met een cijfer erin moet op een
   plek staan waar geen cijfer voor staat, anders vindt "15w" ook 115W en
   "60x60" ook 160x60. Een woord zonder cijfers mag midden in een woord staan,
   zoals altijd al: "prisma" vindt "microprismatisch". Beide kanten horen door
   zoekNormaal() te zijn gegaan. */
function bevatWoord(tekst, w){
  if(!w) return true;
  if(!/\d/.test(w)) return tekst.includes(w);
  let i = tekst.indexOf(w);
  while(i >= 0){
    if(i === 0 || !/\d/.test(tekst[i - 1])) return true;
    i = tekst.indexOf(w, i + 1);
  }
  return false;
}

/* Een maat mag op meer manieren gelezen worden dan hij getypt is: omgedraaid
   ("120x30" is de 30x120) en in millimeters ("600x600" is de 60x60cm uit de
   prijslijst). Geeft het woord zelf plus die lezingen. */
function maatLezingen(w){
  const m = /^(\d+)x(\d+)(mm|cm)?$/.exec(w);
  if(!m) return [w];
  const a = +m[1], b = +m[2], uit = new Set([w, b + 'x' + a]);
  if(m[3] !== 'cm' && a >= 100 && b >= 100 && a % 10 === 0 && b % 10 === 0){
    uit.add(a / 10 + 'x' + b / 10); uit.add(b / 10 + 'x' + a / 10);
  }
  return [...uit];
}

/* Levenshtein-afstand met een plafond: boven `max` stoppen we met rekenen. */
function bewerkAfstand(a, b, max){
  if(Math.abs(a.length - b.length) > max) return max + 1;
  let vorige = Array.from({length: b.length + 1}, (_, j) => j);
  for(let i = 1; i <= a.length; i++){
    const rij = [i]; let laagste = i;
    for(let j = 1; j <= b.length; j++){
      rij[j] = Math.min(vorige[j] + 1, rij[j - 1] + 1,
                        vorige[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if(rij[j] < laagste) laagste = rij[j];
    }
    if(laagste > max) return max + 1;
    vorige = rij;
  }
  return vorige[b.length];
}

/* Het woord uit `woordenlijst` dat het dichtst bij `w` ligt, als dat dicht genoeg
   is: één letter verschil bij een kort woord, twee bij een langer. Bij gelijke
   afstand het kortste woord, dan alfabetisch - zodat de uitkomst niet van de
   volgorde van de lijst afhangt. Nooit voor een artikelnummer: een bijna-treffer
   op een nummer is het verkeerde artikel. */
function besteSuggestie(w, woordenlijst){
  if(!w || w.length < 3 || lijktCode(w) || /\d/.test(w)) return null;
  const max = w.length <= 4 ? 1 : 2;
  let beste = null, afstand = max + 1;
  for(const k of woordenlijst){
    if(k === w || k.length < 3) continue;
    const d = bewerkAfstand(w, k, max);
    if(d < afstand || (d === afstand && beste != null &&
       (k.length < beste.length || (k.length === beste.length && k < beste)))){
      beste = k; afstand = d;
    }
  }
  return afstand <= max ? beste : null;
}
