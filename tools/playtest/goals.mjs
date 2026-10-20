// Paket D – Einmessen der Etappen-Arten (stage/goals.js, balance.GOALS): Der Bot spielt Weitflug-Etappen je Akt und
// Etage mit typischen Ausrüstungen eines Runs (Slot-Stufe je Akt, Tag-Build mit 3–6 Items eines Tags + 1–2 andere) und
// schreibt Weite, Höhe, Trickpunkte,
// Pickups, Weite nach GOALS.sprint.timeLimit und Bruchlandungen mit. Für jede Art wird die Marke so gewählt, dass sie
// genauso oft erreicht wird wie die Weiten-Marke (Quantil-Abgleich): Bronze ↔ Zielmarke, Gold ↔ Gold-Marke.
// Ergebnis: Vorschlag für perTarget/gold je Art (Median über alle Zellen) und die Quoten mit den aktuellen Werten.
// Aufruf: node tools/playtest/goals.mjs [--n 16]
import { BIOMES } from '../../www/src/data/biomes.js';
import { ITEMS } from '../../www/src/data/items.js';
import { TAG_IDS } from '../../www/src/data/tags.js';
import { GOALS } from '../../www/src/data/balance.js';
import { generateStageSpec } from '../../www/src/physics/trackGen.js';
import { makeGoal } from '../../www/src/stage/goals.js';
import { makeRng } from '../../www/src/core/rng.js';
import { levelSave } from '../sim/progression.mjs';
import { makeSimStage, playStage } from '../sim/bot.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? Number(args[i + 1]) : d; };
const N = opt('n', 16);
const med = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
const quant = (a, q) => { const s = [...a].sort((x, y) => x - y); const x = Math.max(0, Math.min(1, q)) * (s.length - 1); const i = Math.floor(x); return s[i] + ((s[Math.min(s.length - 1, i + 1)] - s[i]) * (x - i)); };
const POOL = ITEMS.filter((i) => i.rarity !== 'cursed');
const LEVEL = { 1: 2, 2: 5, 3: 8 };
const T = GOALS.sprint.timeLimit;

function play(biome, kind, floor, i) {
  const rng = makeRng(`goals:${biome.id}:${kind}:${floor}:${i}`);
  const spec = generateStageSpec({ biome, kind, floor, rng });
  const tag = TAG_IDS[i % TAG_IDS.length];
  const own = POOL.filter((it) => it.tags.includes(tag)), other = POOL.filter((it) => !it.tags.includes(tag));
  rng.shuffle(own); rng.shuffle(other);
  const k = 2 + biome.act + (i % 2);   // Akt 1: 3–4, Akt 2: 4–5, Akt 3: 5–6 Items des Tags
  const inv = [...own.slice(0, k), ...other.slice(0, 1 + (i % 2))].map((it) => ({ itemId: it.id, tier: 1 + (biome.act > 2 && i % 3 === 0 ? 1 : 0) }));
  const sim = makeSimStage({ spec, biome, save: levelSave(LEVEL[biome.act]), seed: 9100 + i, inventory: inv, runInfo: { bolts: 30, counters: {} } });
  const st = sim.stage;
  let atT = null;
  const up = st.update.bind(st);
  st.update = (dt, input) => { up(dt, input); if (atT === null && st.time >= T) atT = st.vehicle.maxX; };
  const r = playStage(st, () => sim.result, { seed: 7 * i + floor, tricks: true });
  return { spec, dist: r.dist, height: r.height, stunt: r.tricks || 0, collect: r.goal ? r.goal.value : 0, pickups: st.pickupTotal, sprint: atT ?? r.dist, crashes: r.stunts ? r.stunts.crashes : 0 };
}

const types = ['height', 'stunt', 'collect', 'sprint'];
const sug = Object.fromEntries(types.map((t) => [t, { per: [], gold: [] }]));
const rates = Object.fromEntries([...types, 'distance', 'delivery'].map((t) => [t, { b: [], g: [] }]));
const t0 = Date.now();
for (const b of BIOMES) {
  for (const [kind, floor] of [['stage', 1], ['stage', 3], ['stage', 5], ['elite', 3]]) {
    const rows = [];
    for (let i = 0; i < N; i++) rows.push(play(b, kind, floor, i));
    const target = rows[0].spec.target, gold = rows[0].spec.medals.gold;
    const pB = rows.filter((r) => r.dist >= target).length / rows.length;
    const pG = rows.filter((r) => r.dist >= gold).length / rows.length;
    rates.distance.b.push(pB); rates.distance.g.push(pG);
    for (const t of types) {
      const vals = rows.map((r) => (t === 'collect' ? r.pickups : r[t]));
      const vb = quant(vals, 1 - pB), vg = quant(vals, 1 - pG);
      if (vb > 0) { sug[t].per.push(vb / target); sug[t].gold.push(vg / Math.max(1e-9, vb)); }
      // Quoten mit den aktuellen Werten
      const g = makeGoal(t, target, kind);
      rates[t].b.push(vals.filter((v) => v >= g.medals.bronze).length / vals.length);
      rates[t].g.push(vals.filter((v) => v >= g.medals.gold).length / vals.length);
    }
    const caps = GOALS.delivery.crashCaps;
    rates.delivery.b.push(rows.filter((r) => r.dist >= target && r.crashes <= caps.bronze).length / rows.length);
    rates.delivery.g.push(rows.filter((r) => r.dist >= gold && r.crashes <= caps.gold).length / rows.length);
    console.log(`Akt ${b.act} ${kind} E${floor}: Bronze ${(pB * 100).toFixed(0)} % Gold ${(pG * 100).toFixed(0)} % · Höhe ${med(rows.map((r) => r.height)).toFixed(0)} m · Tricks ${med(rows.map((r) => r.stunt)).toFixed(0)} · Pickups ${med(rows.map((r) => r.pickups))} · Weite@${T}s ${med(rows.map((r) => r.sprint)).toFixed(0)} · Bruch ${med(rows.map((r) => r.crashes))}`);
  }
}
const avg = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
console.log('\nVorschlag (Median über alle Zellen):');
for (const t of types) console.log(`  ${t.padEnd(8)} perTarget ${med(sug[t].per).toFixed(3)} · gold ×${med(sug[t].gold).toFixed(2)}`);
console.log('\nQuoten mit den aktuellen Werten (Ø Bronze / Gold):');
for (const [t, r] of Object.entries(rates)) console.log(`  ${t.padEnd(8)} ${(avg(r.b) * 100).toFixed(0)} % / ${(avg(r.g) * 100).toFixed(0)} %`);
console.log(`(${Math.round((Date.now() - t0) / 1000)} s)`);
