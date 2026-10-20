// Balance-Check der Items (Phase 4): Wie stark verschieben Items die Weite?
// Der Bot (tools/sim/bot.mjs; mit Salto-Items dreht er Saltos – tricks) spielt mit dem „guten“ Loadout (Startteile Stufe 10) je Akt die
// Etagen 0, 3, 5 und den Boss – ohne Items, mit zufälligen Builds aus 6 Items (★1, ohne Verfluchte) und mit
// Synergie-Builds (ein Tag-Set bzw. die Elektro-Ketten-Bauweise). Ziel (V2-DESIGN §8): gute Synergie-Builds schaffen
// Akt-3-Ziele, zufällige mittelmäßige Builds scheitern meist in Akt 2–3.
//
// Aufruf: node tools/sim/items.mjs [--n 10] [--random 24]   → Konsole + Abschnitt „Items“ in docs/BALANCE.md
// (der Abschnitt steht hinter der Marke <!-- items --> und bleibt erhalten, wenn calibrate.mjs die Datei neu schreibt)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BIOMES } from '../../www/src/data/biomes.js';
import { ITEMS } from '../../www/src/data/items.js';
import { generateStageSpec } from '../../www/src/physics/trackGen.js';
import { makeRng } from '../../www/src/core/rng.js';
import { simSave, makeSimStage, playStage } from './bot.mjs';
import * as RS from '../../www/src/run/runState.js';
import { chooseStation } from '../../www/src/shops/gasStation.js';
import { itemById } from '../../www/src/data/items.js';
import { Stage } from '../../www/src/stage/stage.js';
import { Track } from '../../www/src/physics/track.js';
import { biomeForAct } from '../../www/src/data/biomes.js';
import { mapNode, isStageType } from '../../www/src/map/mapGen.js';
import { hashSeed } from '../../www/src/core/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? Number(args[i + 1]) : def; };
const N = opt('n', 10);          // Etappen je Konfiguration (ohne Items / je Synergie-Build)
const NR = opt('random', 24);    // zufällige Builds je Konfiguration (je 1 Etappe)
const NRUNS = opt('runs', 16);   // ganze Runs je Auswahl-Strategie
const NS = opt('singles', 10);   // Etappen je Akt für die Einzel-Item-Messung
export const MARK = '<!-- items -->';

// Synergie-Builds (je 6 Items, ★1)
export const SYNERGY = {
  'Elektro-Kette': ['gyro_fahrraddynamo', 'elektro_blitzableiter', 'eis_kuehlerschlauch', 'elektro_peltier_kuehlbox', 'elektro_plasmakugel', 'elektro_zitteraal'],
  'Raketen-Set 6': ['rakete_colaflaschen_rakete', 'rakete_haarspray_turbo', 'rakete_reservekanister', 'rakete_zuendgeraet', 'rakete_mondrakete', 'rakete_feuerwerksbatterie'],
  'Gyro-Set 6': ['gyro_buerodrehstuhl', 'gyro_wasserwaage', 'gyro_jojo', 'gyro_karussellpferd', 'gyro_omas_kreisel', 'gyro_plattenspieler'],
  'Feuer-Set 6': ['feuer_zuendkerzen_kette', 'feuer_buegeleisen', 'feuer_grillanzuender', 'feuer_silvester_restposten', 'feuer_schweissgeraet', 'feuer_kachelofen'],
  'Hydraulik-Set 6': ['hydraulik_trabi_stossdaempfer', 'hydraulik_sofa_sprungfeder', 'hydraulik_gabelstapler_puffer', 'hydraulik_piezo_federbein', 'hydraulik_pressenstempel', 'hydraulik_gasfeder'],
};
const POOL = ITEMS.filter((i) => i.rarity !== 'cursed').map((i) => i.id);
const SAVE = simSave('gut');
const CONFIGS = [['stage', 0], ['stage', 3], ['stage', 5], ['boss', 6]];

const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const fmtR = (x) => x.toFixed(2).replace('.', ',');
const fmtPct = (x) => `${Math.round(x * 100)} %`;
const inv = (ids) => ids.map((itemId) => ({ itemId, tier: 1 }));

// Saltos lohnen sich nur mit Items, die auf Saltos/Landungen nach Saltos reagieren (sonst kosten sie nur Weite) – und
// erst ab TRICK_MIN Punkten (Gyro-Item 2, anderes Salto-Item 1): ein einzelnes Salto-Item ohne Gyro (z. B. die
// Zündkerzen-Kette im Feuer-Set, 3 Saltos für 0,8 s Boost) wiegt die verlorene
// Weite nicht auf, so würde auch eine geübte Person nicht spielen
export const TRICK_MIN = 2;
export function wantsTricks(inventory) {
  let n = 0;
  for (const e of inventory || []) {
    const it = itemById(e.itemId);
    if (!it) continue;
    // Gyro-Items leben von Saltos (zählen doppelt), andere Salto-Auslöser einfach
    if (it.tags.includes('gyro')) n += 2;
    else if ((it.triggers || []).some((t) => t.on === 'flip' || (t.if && t.if.minCount))) n++;
  }
  return n >= TRICK_MIN;
}

function randomBuild(rng) {
  const ids = [...POOL];
  rng.shuffle(ids);
  return ids.slice(0, 6);
}

function play(biome, kind, floor, items, i, tag) {
  const bossId = kind === 'boss' ? biome.bosses[i % biome.bosses.length].id : null;
  const spec = generateStageSpec({ biome, kind, floor, rng: makeRng(`items:${biome.id}:${kind}:${floor}:${i}`), bossId });
  const inventory = items ? inv(items) : null;
  const sim = makeSimStage({ spec, biome, save: SAVE, seed: 9000 + i, inventory, runInfo: { bolts: 40, counters: {} } });
  const r = playStage(sim.stage, () => sim.result, { seed: 77 * i + floor + tag, tricks: wantsTricks(inventory) });
  return { ratio: r.dist / r.target, cleared: !!r.medal, dmg: r.damageTaken / r.durabilityMax, chain: sim.stage.maxChain, trig: sim.stage.triggerCount };
}

function summarize(rows) {
  return {
    ratio: median(rows.map((r) => r.ratio)),
    cleared: rows.filter((r) => r.cleared).length / rows.length,
    dmg: median(rows.map((r) => r.dmg)),
    chain: Math.max(...rows.map((r) => r.chain)),
    trig: median(rows.map((r) => r.trig)),
  };
}

export function measureAll() {
  const out = [];
  for (const b of BIOMES) {
    for (const [kind, floor] of CONFIGS) {
      const row = { biome: b, kind, floor, builds: {} };
      row.builds['ohne Items'] = summarize(Array.from({ length: N }, (_, i) => play(b, kind, floor, null, i, 0)));
      const rng = makeRng(`zufall:${b.id}:${kind}:${floor}`);
      row.builds['zufällig (6)'] = summarize(Array.from({ length: NR }, (_, i) => play(b, kind, floor, randomBuild(rng), i, 1)));
      const syn = {};
      for (const [name, ids] of Object.entries(SYNERGY)) {
        syn[name] = summarize(Array.from({ length: N }, (_, i) => play(b, kind, floor, ids, i, 2)));
        row.builds[name] = syn[name];
      }
      // beste Synergie dieser Konfiguration
      const best = Object.entries(syn).sort((x, y) => y[1].ratio - x[1].ratio)[0];
      row.best = best[0];
      out.push(row);
      console.log(`${b.id.padEnd(15)} ${kind.padEnd(5)} E${floor}  ${Object.entries(row.builds).map(([k, v]) => `${k}: ×${fmtR(v.ratio)} ${fmtPct(v.cleared)}`).join(' | ')}`);
    }
  }
  return out;
}

// ---------- ganze Runs ----------
// Strategien für die Item-Auswahl: 'zufällig' (irgendein Angebot), 'synergie' (Angebot, das den stärksten Tag des
// Inventars weiter ausbaut; Gleichstand → höhere Seltenheit), 'ohne' (immer Schrauben). Alle Pools sind offen
// (später Spielstand mit erledigter Forschung). Voller Rucksack: zufällig ersetzen bzw. das Item mit dem schwächsten Tag.
const RAR = { common: 0, rare: 1, epic: 2, legendary: 3 };
function choose(run, choice, policy, rng) {
  if (policy === 'ohne' || !choice.items.length) return -1;
  if (policy === 'zufällig') return Math.floor(rng.next() * choice.items.length);
  const counts = {};
  for (const e of run.inventory) for (const t of itemById(e.itemId).tags) counts[t] = (counts[t] || 0) + 1;
  let best = -1, bs = -Infinity;
  choice.items.forEach((id, i) => {
    const it = itemById(id);
    const sc = Math.max(...it.tags.map((t) => counts[t] || 0)) * 6 + RAR[it.rarity] * 5 + it.tags.length * 2;
    if (sc > bs) { bs = sc; best = i; }
  });
  return best;
}

export function simulateRun(seed, policy) {
  const save = simSave('gut');
  const run = RS.newRun(save, { seed });
  run.poolAll = true;
  const rng = makeRng(`wahl:${seed}:${policy}`);
  let stages = 0;
  for (let step = 0; step < 120 && !run.over; step++) {
    const reach = RS.reachableNodes(run);
    const node = reach.find((n) => n.type === 'station') || reach.find((n) => isStageType(n.type) && n.type !== 'elite') || reach[0];
    const e = RS.enterNode(run, node.id);
    if (e.kind === 'station') { chooseStation(run, run.durability < RS.durabilityMax(run) * 0.6 ? 'repair' : 'fuel'); continue; }
    if (e.kind !== 'stage') { RS.leaveNode(run); continue; }   // Sonderknoten (Phase 5): der Bot geht nur durch
    const su = RS.runStageSetup(run, save);
    const biome = biomeForAct(run.act);
    let result = null;
    const stage = new Stage({ biome, spec: e.spec, track: new Track(e.spec, biome), loadout: su.loadout, seed: hashSeed(`${seed}:${node.id}:${run.current.attempts}`), durability: run.durability, runMods: run.runMods, inventory: su.inventory, runInfo: su.runInfo, hooks: { end: (r) => { result = r; } } });
    playStage(stage, () => result, { seed: seed * 31 + stages, tricks: wantsTricks(run.inventory) });
    stages++;
    const o = RS.applyStageResult(run, result, save);
    if (o.missed) RS.resolveMiss(run, 'land');   // Paket A: verfehlt → Notlandung, weiter auf der Karte
    while (RS.pendingChoice(run)) {
      const ch = RS.pendingChoice(run);
      const i = choose(run, ch, policy, rng);
      if (i < 0) { RS.skipChoice(run); continue; }
      let res = RS.pickItem(run, save, i);
      if (!res.ok && res.reason === 'full') {
        // ersetzen: zufällig bzw. das Item mit dem am wenigsten vertretenen Tag
        let slot = Math.floor(rng.next() * run.inventory.length);
        if (policy === 'synergie') {
          const counts = {};
          for (const x of run.inventory) for (const t of itemById(x.itemId).tags) counts[t] = (counts[t] || 0) + 1;
          let low = Infinity;
          run.inventory.forEach((x, k) => { const c = Math.max(...itemById(x.itemId).tags.map((t) => counts[t])); if (c < low) { low = c; slot = k; } });
        }
        res = RS.pickItem(run, save, i, slot);
      }
      if (!res.ok) RS.skipChoice(run);
    }
  }
  return { act: run.over ? run.over.act : run.act, won: !!(run.over && run.over.won), stages, items: run.inventory.length, tows: run.stats.tows };
}

export function measureRuns() {
  const out = {};
  for (const policy of ['ohne', 'zufällig', 'synergie']) {
    const rs = Array.from({ length: NRUNS }, (_, i) => simulateRun(500 + i, policy));
    out[policy] = {
      n: rs.length,
      win: rs.filter((r) => r.won).length / rs.length,
      end: [1, 2, 3].map((a) => rs.filter((r) => !r.won && r.act === a).length / rs.length),
      tows: median(rs.map((r) => r.tows)),
      stages: median(rs.map((r) => r.stages)),
    };
    const o = out[policy];
    console.log(`Runs ${policy.padEnd(9)} Sieg ${fmtPct(o.win)}  Ende Akt 1/2/3: ${o.end.map(fmtPct).join(' / ')}  Abschleppen (Median) ${o.tows}  Etappen ${o.stages}`);
  }
  return out;
}

// ---------- Einzel-Items (Phase 6) ----------
// Jedes nicht verfluchte Item allein (★1) gegen „ohne Items“: Akt 2 und 3, Etage 2, gutes Loadout; Wirkung = Faktor auf
// den Mittelwert der log-Weite. Ausreißer: Gewöhnlich > +15 %, Selten > +20 %, Episch > +30 %, Legendär > +100 %.
export const SINGLE_LIMIT = { common: 0.15, rare: 0.2, epic: 0.3, legendary: 1.0 };
export function measureSingles(n = NS) {
  const meas = (inventory) => {
    const lrs = [];
    for (const act of [2, 3]) {
      const b = BIOMES.find((x) => x.act === act);
      for (let i = 0; i < n; i++) {
        const spec = generateStageSpec({ biome: b, kind: 'stage', floor: 2, rng: makeRng(`single:${act}:${i}`) });
        const sim = makeSimStage({ spec, biome: b, save: SAVE, seed: 7000 + i, inventory, runInfo: { bolts: 40, counters: {} } });
        const r = playStage(sim.stage, () => sim.result, { seed: 31 * i + 5, tricks: wantsTricks(inventory) });
        lrs.push(Math.log(Math.max(0.05, r.dist / r.target)));
      }
    }
    return lrs.reduce((a, x) => a + x, 0) / lrs.length;
  };
  const base = meas(null);
  const out = ITEMS.filter((i) => i.rarity !== 'cursed').map((it) => ({ id: it.id, name: it.name, icon: it.icon, rarity: it.rarity, gain: Math.exp(meas([{ itemId: it.id, tier: 1 }]) - base) - 1 }));
  out.sort((a, b) => b.gain - a.gain);
  for (const r of out) r.outlier = r.gain > (SINGLE_LIMIT[r.rarity] ?? 1);
  console.log(`Einzel-Items: ${out.slice(0, 8).map((r) => `${r.id} ${fmtPct(r.gain)}`).join(' · ')} | Ausreißer: ${out.filter((r) => r.outlier).map((r) => r.id).join(', ') || 'keine'}`);
  return out;
}

// Markdown-Abschnitt
export function itemsSection(rows, secs, runs = null, singles = null) {
  const names = ['ohne Items', 'zufällig (6)', ...Object.keys(SYNERGY)];
  const L = [];
  L.push(MARK);
  L.push('## Items (Phase 4, Phase 6 nachgemessen)');
  L.push('');
  L.push(`> Erzeugt von \`node tools/sim/items.mjs\` (${N} Etappen je Build, ${NR} zufällige Builds je Zeile; Rechenzeit ${secs} s).`);
  L.push('');
  L.push('Bot wie bei den Zielmarken; mit Salto-Items (ein Gyro-Item oder mindestens zwei andere Items mit Auslöser auf flip bzw. minCount) dreht er zusätzlich Rückwärtssaltos, wenn bis zur Landung > 1,7 s bleiben; ist Überhitzen folgenlos (Feuer-Set 6 Nachbrenner, Kühlschrank, Waschmaschine), boostet er ohne Hitze-Reserve bis zum Überhitzen. Gutes Loadout (Startteile Stufe 10), volle Haltbarkeit je Etappe, 40 Run-Schrauben. **Zufällig (6)** = 6 zufällige nicht verfluchte Items ★1 je Etappe (mittelmäßiger Build ohne Plan). Synergie-Builds = 6 Items eines Tags (Set 2/4/6) bzw. die Elektro-Ketten-Bauweise (Salto → Stromschlag → Gratis-Boost → Kühlung). Zellen: Median Distanz ÷ Ziel · geschafft (mind. Bronze).');
  L.push('');
  L.push(`| Akt | Art | Etage | ${names.join(' | ')} |`);
  L.push(`|---|---|---|${names.map(() => '---').join('|')}|`);
  for (const r of rows) {
    L.push(`| ${r.biome.act} ${r.biome.icon} | ${r.kind === 'boss' ? 'Boss' : 'Etappe'} | ${r.kind === 'boss' ? '–' : r.floor} | ${names.map((n) => { const v = r.builds[n]; return `×${fmtR(v.ratio)} · ${fmtPct(v.cleared)}`; }).join(' | ')} |`);
  }
  L.push('');
  const pick = (act, kind, floor) => rows.find((r) => r.biome.act === act && r.kind === kind && r.floor === floor);
  const lines = [];
  for (const act of [1, 2, 3]) {
    const e = [0, 3, 5].map((f) => pick(act, 'stage', f));
    const avg = (n) => e.reduce((s, r) => s + r.builds[n].cleared, 0) / e.length;
    const bestSyn = Object.keys(SYNERGY).sort((x, y) => avg(y) - avg(x))[0];
    lines.push(`- Akt ${act}: ohne Items ${fmtPct(avg('ohne Items'))}, zufällig ${fmtPct(avg('zufällig (6)'))}, beste Synergie (${bestSyn}) ${fmtPct(avg(bestSyn))} der Etappen geschafft (Etage 0/3/5); Boss: ohne ${fmtPct(pick(act, 'boss', 6).builds['ohne Items'].cleared)}, zufällig ${fmtPct(pick(act, 'boss', 6).builds['zufällig (6)'].cleared)}, beste Synergie ${fmtPct(Math.max(...Object.keys(SYNERGY).map((n) => pick(act, 'boss', 6).builds[n].cleared)))}.`);
  }
  if (runs) {
    L.push('### Ganze Runs');
    L.push('');
    L.push(`${NRUNS} Runs je Strategie mit derselben Bot-Fahrweise, gutem Loadout und allen Item-Pools (Wegwahl: Tankstelle, sonst normale Etappe; Tankstelle repariert unter 60 %). Strategie der Item-Auswahl: **ohne** = immer Schrauben, **zufällig** = irgendein Angebot, **Synergie** = Angebot, das den stärksten Tag ausbaut (gewichtet mit der Seltenheit).`);
    L.push('');
    L.push('| Auswahl | Sieg | Ende in Akt 1 | Akt 2 | Akt 3 | Abschleppen (Median) |');
    L.push('|---|---|---|---|---|---|');
    for (const [k, o] of Object.entries(runs)) L.push(`| ${k} | ${fmtPct(o.win)} | ${o.end.map(fmtPct).join(' | ')} | ${String(o.tows).replace('.', ',')} |`);
    L.push('');
  }
  if (singles) {
    const RN = { common: 'Gewöhnlich', rare: 'Selten', epic: 'Episch', legendary: 'Legendär' };
    L.push('### Einzel-Items (Phase 6)');
    L.push('');
    L.push(`Jedes Item allein (★1) gegen „ohne Items“ (Akt 2 + 3, Etage 2, je ${NS} Etappen). Grenzen für Ausreißer: Gewöhnlich +15 %, Selten +20 %, Episch +30 %, Legendär +100 %. Gyro-Items liegen allein im Minus, weil der Bot mit einem Gyro-Item Saltos dreht (die Saltos lohnen sich erst mit weiteren Salto-Items).`);
    L.push('');
    L.push('| Item | Seltenheit | Weite | Ausreißer |');
    L.push('|---|---|---|---|');
    for (const r of [...singles.slice(0, 12), ...singles.slice(-4)]) L.push(`| ${r.icon} ${r.name} | ${RN[r.rarity] || r.rarity} | ${r.gain >= 0 ? '+' : ''}${fmtPct(r.gain)} | ${r.outlier ? '✗' : '–'} |`);
    L.push('');
  }
  L.push('### Ergebnis');
  L.push('');
  L.push(...lines);
  if (runs) {
    const r = runs['zufällig'], o = runs.ohne, y = runs.synergie;
    L.push(`- Ganze Runs: ohne Items ${fmtPct(o.win)} Siege (${fmtPct(1 - o.win)} scheitern), zufällige Builds scheitern zu ${fmtPct(r.end[1] + r.end[2])} in Akt 2–3 (${fmtPct(r.end[0])} in Akt 1, ${fmtPct(r.win)} Siege), Synergie-Auswahl ${fmtPct(y.win)} Siege bei ${String(y.tows).replace('.', ',')} statt ${String(r.tows).replace('.', ',')} Abschlepp-Vorgängen (Median).`);
  }
  L.push('');
  return L.join('\n');
}

// docs/BALANCE.md: Abschnitt hinter MARK ersetzen bzw. anhängen
export function writeSection(text) {
  const file = path.join(ROOT, 'docs', 'BALANCE.md');
  let doc = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const i = doc.indexOf(MARK);
  let tail = '';
  if (i >= 0) {
    // nur bis zur nächsten Marke ersetzen (z. B. <!-- progression --> von tools/sim/progression.mjs bleibt erhalten)
    const rest = doc.slice(i + MARK.length);
    const j = rest.indexOf('<!-- ');
    tail = j >= 0 ? rest.slice(j) : '';
    doc = doc.slice(0, i).trimEnd();
  }
  doc = `${doc.trimEnd()}\n\n${text}${tail ? `\n${tail}` : ''}`;
  fs.writeFileSync(file, doc);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t0 = Date.now();
  const rows = measureAll();
  const runs = measureRuns();
  const singles = measureSingles();
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  writeSection(itemsSection(rows, secs, runs, singles));
  console.log(`\nAbschnitt „Items“ in docs/BALANCE.md geschrieben (${secs} s)`);
}
