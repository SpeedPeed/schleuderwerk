// Playtest-Analyse 1: Anatomie einer Etappe und Abwechslung der Strecken (headless, echte Etappen-Logik + Bot).
//  - Zeitanteile einer Etappe in Echtzeit (1/60-s-Bilder inkl. Zeitlupe): Flug, Boden, Auslaufen nach dem letzten
//    Sprung, Zeit nach Erreichen von Bronze, „tote“ Zeit (am Boden langsamer als 10 m/s, kein Treibstoff/Boost)
//  - Ereignisse pro Etappe: Landungen, Item-Auslösungen, Ketten ≥ 3 Glieder (das HUD zeigt dann „KETTENREAKTION“)
//  - Abwechslung: Bausteine je Etappe, Ähnlichkeit (Jaccard der Baustein-Mengen) zweier Etappen desselben Akts,
//    Anteil Etappen mit identischer Bausteinmenge, Zieltypen, Wetter
// Aufruf: node tools/playtest/anatomy.mjs [--n 40] [--json <Datei>]
import fs from 'node:fs';
import { BIOMES } from '../../www/src/data/biomes.js';
import { generateStageSpec } from '../../www/src/physics/trackGen.js';
import { makeRng } from '../../www/src/core/rng.js';
import { simSave, makeSimStage, playStage } from '../sim/bot.mjs';
import { SYNERGY, wantsTricks } from '../sim/items.mjs';
import { ITEMS as BAL } from '../../www/src/data/balance.js';
import { generateActMap } from '../../www/src/map/mapGen.js';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const N = Number(opt('n', 40));
const med = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const r1 = (x) => Math.round(x * 10) / 10;

// Etappe spielen und mitschneiden (Bot ruft stage.update mit dt = 1/60 auf → Bildzahl / 60 = Echtzeit)
function playRecorded({ biome, kind, floor, i, save, inventory = null }) {
  const bossId = kind === 'boss' ? biome.bosses[i % biome.bosses.length].id : null;
  const spec = generateStageSpec({ biome, kind, floor, rng: makeRng(`anat:${biome.id}:${kind}:${floor}:${i}`), bossId });
  const inv = inventory ? inventory.map((itemId) => ({ itemId, tier: 1 })) : null;
  const sim = makeSimStage({ spec, biome, save, seed: 4100 + i, inventory: inv, runInfo: { bolts: 40, counters: {} } });
  const st = sim.stage;
  const depthCount = {};
  let chainMoments = 0, lastChainT = -9;
  st.onEvent = (name, data, depth) => {
    depthCount[depth] = (depthCount[depth] || 0) + 1;
    // „spürbarer Moment“: Kette ab chainPopupDepth (HUD-Einblendung), höchstens alle chainPopupGap s gezählt
    if (depth >= BAL.chainPopupDepth && st.time - lastChainT > BAL.chainPopupGap) { chainMoments++; lastChainT = st.time; }
  };
  const tl = { frames: 0, air: 0, ground: 0, afterBronze: 0, dead: 0, lastAirFrame: 0, landings: 0, wasAir: false, slowmo: 0 };
  const origUpdate = st.update.bind(st);
  st.update = (dt, input) => {
    origUpdate(dt, input);
    if (st.phase !== 'fly') return;
    tl.frames++;
    const v = st.vehicle;
    if (st.timeScale < 0.99) tl.slowmo++;
    if (v.onGround) {
      tl.ground++;
      if (tl.wasAir) tl.landings++;
      tl.wasAir = false;
      if (Math.hypot(v.vx, v.vy) < 10 && !v.boosting) tl.dead++;
    } else { tl.air++; tl.lastAirFrame = tl.frames; tl.wasAir = true; }
    if (v.maxX >= st.target) tl.afterBronze++;
  };
  const r = playStage(st, () => sim.result, { seed: 61 * i + floor, tricks: wantsTricks(inv) });
  const f = 1 / 60;
  return {
    kind, floor, act: biome.act, ratio: r.dist / r.target, cleared: !!r.medal, medal: r.medal, reason: r.reason,
    real: tl.frames * f, sim: r.time, air: tl.air * f, ground: tl.ground * f, rollout: (tl.frames - tl.lastAirFrame) * f,
    afterBronze: tl.afterBronze * f, dead: tl.dead * f, landings: tl.landings, slowmo: tl.slowmo * f,
    triggers: r.itemTriggers, maxChain: r.maxChain, chainMoments,
    features: (spec.features || []).map((x) => x.type), weather: spec.weather && spec.weather.name,
  };
}

function summarize(rows) {
  return {
    n: rows.length,
    real: med(rows.map((r) => r.real)), air: med(rows.map((r) => r.air)), ground: med(rows.map((r) => r.ground)),
    rollout: med(rows.map((r) => r.rollout)), afterBronze: med(rows.filter((r) => r.cleared).map((r) => r.afterBronze)),
    dead: med(rows.map((r) => r.dead)), landings: med(rows.map((r) => r.landings)),
    airShare: avg(rows.map((r) => r.air / r.real)), rolloutShare: avg(rows.map((r) => r.rollout / r.real)),
    cleared: avg(rows.map((r) => (r.cleared ? 1 : 0))), ratio: med(rows.map((r) => r.ratio)),
    triggers: med(rows.map((r) => r.triggers)), maxChain: med(rows.map((r) => r.maxChain)), chainMoments: avg(rows.map((r) => r.chainMoments)),
    reasons: rows.reduce((o, r) => { o[r.reason] = (o[r.reason] || 0) + 1; return o; }, {}),
  };
}

// ---------- Abwechslung der Strecken ----------
function variety() {
  const out = {};
  for (const b of BIOMES) {
    const sets = [];
    const counts = {};
    const weather = {};
    for (let i = 0; i < 200; i++) {
      const floor = i % 6;
      const spec = generateStageSpec({ biome: b, kind: 'stage', floor, rng: makeRng(`var:${b.id}:${i}`) });
      const types = (spec.features || []).map((x) => x.type);
      const set = [...new Set(types)].sort();
      sets.push(set);
      for (const t of types) counts[t] = (counts[t] || 0) + 1;
      const w = spec.weather ? spec.weather.name : '–';
      weather[w] = (weather[w] || 0) + 1;
    }
    let jac = 0, same = 0, pairs = 0;
    for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < Math.min(sets.length, i + 7); j++) {
      const A = new Set(sets[i]), B = new Set(sets[j]);
      const inter = [...A].filter((x) => B.has(x)).length;
      const uni = new Set([...A, ...B]).size || 1;
      jac += inter / uni; if (sets[i].join() === sets[j].join()) same++; pairs++;
    }
    const featN = avg(sets.map((s) => s.length));
    out[b.id] = { name: b.name, distinctFeatureTypes: Object.keys(counts).length, featureTypesPerStage: r1(featN), meanJaccardNeighbours: Math.round((jac / pairs) * 100) / 100, identicalSetShare: Math.round((same / pairs) * 100) / 100, counts, weather };
  }
  return out;
}

// ---------- Karte: wie viele echte Weg-Entscheidungen? ----------
function mapChoices() {
  const deg = [], diff = [];
  for (let i = 0; i < 300; i++) {
    const m = generateActMap(1 + (i % 3), makeRng(`map:${i}`), { research: ['r_node_workbench', 'r_node_blackmarket'] });
    for (const fl of m.floors) for (const n of fl) {
      if (!n.next || n.floor >= 5) continue;
      deg.push(n.next.length);
      const types = new Set(n.next.map((id) => m.floors.flat().find((x) => x.id === id).type));
      diff.push(types.size >= 2 ? 1 : 0);
    }
  }
  return { meanOut: avg(deg), oneWay: avg(deg.map((d) => +(d === 1))), diffTypes: avg(diff) };
}

const t0 = Date.now();
const save0 = simSave('start');
const saveG = simSave('gut');
const result = { configs: {}, variety: variety() };
const CONF = [['stage', 0], ['stage', 3], ['stage', 5], ['elite', 3], ['boss', 6]];
for (const b of BIOMES) {
  for (const [kind, floor] of CONF) {
    const save = b.act === 1 ? save0 : saveG;
    const rowsNo = Array.from({ length: N }, (_, i) => playRecorded({ biome: b, kind, floor, i, save }));
    const rowsSyn = Array.from({ length: Math.ceil(N / 2) }, (_, i) => playRecorded({ biome: b, kind, floor, i, save: saveG, inventory: Object.values(SYNERGY)[i % 5] }));
    result.configs[`${b.act}:${kind}:${floor}`] = { ohne: summarize(rowsNo), set6: summarize(rowsSyn) };
    const s = result.configs[`${b.act}:${kind}:${floor}`].ohne, y = result.configs[`${b.act}:${kind}:${floor}`].set6;
    console.log(`Akt ${b.act} ${kind.padEnd(5)} E${floor}: Echtzeit ${r1(s.real)} s (Flug ${r1(s.air)} s = ${Math.round(s.airShare * 100)} %, Auslauf nach letztem Sprung ${r1(s.rollout)} s = ${Math.round(s.rolloutShare * 100)} %, nach Bronze ${r1(s.afterBronze)} s, tot ${r1(s.dead)} s, Landungen ${s.landings}) geschafft ${Math.round(s.cleared * 100)} % · Set-6: Echtzeit ${r1(y.real)} s, Auslöser ${y.triggers}, Kette max ${y.maxChain}, Ketten-Momente ${r1(y.chainMoments)}/Etappe`);
  }
}
console.log('\nAbwechslung (200 Etappen je Biom):');
for (const v of Object.values(result.variety)) console.log(`  ${v.name}: ${v.distinctFeatureTypes} Bausteintypen, ${v.featureTypesPerStage} je Etappe, Jaccard Nachbarn ${v.meanJaccardNeighbours}, identische Menge ${Math.round(v.identicalSetShare * 100)} %, Wetter ${JSON.stringify(v.weather)}`);
result.map = mapChoices();
console.log(`Karte: Ø ${result.map.meanOut.toFixed(2)} Nachfolger je Knoten, ${Math.round(result.map.oneWay * 100)} % Einbahn (genau 1 Nachfolger), ${Math.round(result.map.diffTypes * 100)} % mit Wahl zwischen verschiedenen Knotenarten`);
console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
const jf = opt('json', null);
if (jf) fs.writeFileSync(jf, JSON.stringify(result, null, 1));
