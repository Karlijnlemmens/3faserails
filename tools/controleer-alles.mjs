#!/usr/bin/env node
/* Alle controles in één keer, met één samenvatting en één afsluitcode.
 *
 * Gebruik, vanuit de hoofdmap van het project:
 *     node tools/controleer-alles.mjs            de vijf controles (ongeveer een minuut)
 *     node tools/controleer-alles.mjs --pdf      plus de PDF-regressie tegen de laatste commit
 *     node tools/controleer-alles.mjs --pdf-tegen /tmp/pdf-voor
 *                                                plus de PDF-regressie tegen een eerder gemaakte map
 *     node tools/controleer-alles.mjs --uitgebreid   ook de uitvoer van wat goed ging
 *
 * Het waren zeven losse commando's, en wat je met de hand draait sla je over als
 * je haast hebt. Wat elk script nakijkt staat in tools/LEESMIJ-pdf-controle.md.
 *
 * --pdf vergelijkt de werkmap met HEAD: het zet de laatste commit in een tijdelijke
 * git-worktree, laat daar én hier elke tool een PDF maken en vergelijkt die op
 * inhoud. Een verschil is niet per se fout - een wijziging die bewust iets aan de
 * PDF verandert hoort er een te geven - maar het hoort je niet te verrassen.
 *
 * Eindigt met afsluitcode 1 zodra één controle faalt.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv.slice(2);
const uitgebreid = arg.includes('--uitgebreid');
const pdfTegen = arg.includes('--pdf-tegen') ? arg[arg.indexOf('--pdf-tegen') + 1] : null;
const pdf = arg.includes('--pdf') || !!pdfTegen;

/* Op Windows heet Python meestal "python", elders "python3". */
const python = ['python3', 'python'].find(p => !spawnSync(p, ['--version']).error) || 'python3';

/* De 14 families waarvan de prijslijst nergens een lichtstroom noemt (LED-strips,
   een paar modules en spots). Niet op te lossen zonder gegevens te verzinnen, dus
   bekend en toegestaan - maar een vijftiende hoort op te vallen. Zakt het aantal,
   zet dit getal dan mee omlaag. */
const DATA_BEKEND = 14;

const CONTROLES = [
  ['rekenkern',        process.execPath, ['tools/controleer-logica.mjs']],
  ['suite',            process.execPath, ['tools/controleer-suite.mjs']],
  ['presenters',       process.execPath, ['tools/controleer-presenters.mjs']],
  ['families',         python,           ['vergelijker/controleer-families.py']],
  ['productdata',      python,           ['vergelijker/controleer-data.py', '--hoogstens', String(DATA_BEKEND)]],
];

const uitslag = [];
function draai(naam, cmd, args, opties = {}){
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opties });
  const tijd = ((Date.now() - t0) / 1000).toFixed(1) + ' s';
  const uit = (r.stdout || '') + (r.stderr || '');
  const goed = r.status === 0 && !r.error;
  /* De laatste niet-lege regel is bij elk script de samenvatting. */
  const slot = uit.trim().split('\n').filter(Boolean).pop() || (r.error ? String(r.error) : '');
  uitslag.push({ naam, goed, tijd, slot });
  console.log((goed ? '  goed  ' : '  MIS   ') + naam.padEnd(14) + tijd.padStart(7) + '   ' + slot);
  if(!goed || uitgebreid) console.log(uit.replace(/^/gm, '        | '));
  return { goed, uit };
}

console.log('Controles\n');
for(const [naam, cmd, args] of CONTROLES) draai(naam, cmd, args);

if(pdf){
  const werk = mkdtempSync(join(tmpdir(), 'pdf-controle-'));
  let voor = pdfTegen;
  let worktree = null;
  try{
    if(!voor){
      worktree = join(werk, 'head');
      const w = spawnSync('git', ['worktree', 'add', '--detach', worktree, 'HEAD'], { cwd: root, encoding: 'utf8' });
      if(w.status !== 0) throw new Error('git worktree lukte niet: ' + (w.stderr || w.error));
      voor = join(werk, 'voor');
      draai('pdf van HEAD', process.execPath, [join(worktree, 'tools/pdfbaseline.mjs'), voor], { cwd: worktree });
    }
    const na = join(werk, 'na');
    draai('pdf werkmap', process.execPath, ['tools/pdfbaseline.mjs', na]);
    /* pdfbaseline.mjs eindigt ook met 0 als een tool geen PDF gaf; dat staat in
       rapport.json, dus daar kijken we zelf. */
    for(const map of [voor, na]){
      const rapport = join(map, 'rapport.json');
      const fout = existsSync(rapport) ? JSON.parse(readFileSync(rapport, 'utf8')).filter(r => r.fout) : [{ naam: '?', fout: 'geen rapport.json' }];
      if(fout.length){
        uitslag.push({ naam: 'pdf maken', goed: false, slot: fout.map(r => r.naam + ': ' + r.fout).join('; ') });
        console.log('  MIS   pdf maken in ' + map + ': ' + fout.map(r => r.naam + ': ' + r.fout).join('; '));
      }
    }
    draai('pdf-regressie', process.execPath, ['tools/vergelijk.mjs', voor, na]);
  }catch(err){
    uitslag.push({ naam: 'pdf-regressie', goed: false, slot: String(err.message || err) });
    console.log('  MIS   pdf-regressie   ' + (err.message || err));
  }finally{
    if(worktree) spawnSync('git', ['worktree', 'remove', '--force', worktree], { cwd: root });
    rmSync(werk, { recursive: true, force: true });
  }
}

const mis = uitslag.filter(u => !u.goed);
console.log('\n' + (mis.length
  ? mis.length + ' van de ' + uitslag.length + ' controles MIS: ' + mis.map(u => u.naam).join(', ') + '.'
  : 'Alle ' + uitslag.length + ' controles goed.'));
process.exit(mis.length ? 1 : 0);
