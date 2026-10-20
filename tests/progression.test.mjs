// Phase 6: Progressions-/Ökonomie-Simulator (tools/sim/progression.mjs) – deterministisch, Meilenstein-Zeiten in den
// Zielkorridoren aus V2-DESIGN §8 (mit Toleranz), Regel „schlechter Run scheitert auch mit voller Meta“.
// Nutzt das gespeicherte Bot-Modell tools/sim/progression-model.json (neu messen: node tools/sim/progression.mjs --fit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModel, simulateCareer, summarizeCareers, badRunCheck, itemLog, simStageResult, SIM } from '../tools/sim/progression.mjs';
import { PROGRESSION } from '../www/src/data/balance.js';
import { defaultSave } from '../www/src/save/save.js';
import * as R from '../www/src/run/runState.js';
import { makeRng } from '../www/src/core/rng.js';

const model = loadModel();
const CAREERS = 5;
let careers = null;
const getCareers = () => (careers ||= Array.from({ length: CAREERS }, (_, i) => simulateCareer(model, { seed: i + 1 })));

test('Simulator-Modell: alle Akte, Slot-Stufen 0–10, Zellen mit Messwerten; Items wirken positiv', () => {
  assert.deepEqual(model.levels, SIM.fitLevels);
  for (const act of [1, 2, 3]) {
    for (const L of model.levels) {
      for (const c of ['s0', 's1', 's2', 's3', 's4', 's5', 'e', 'b']) {
        const cell = model.base[act][L][c];
        assert.ok(cell && cell.lr.length >= 10 && isFinite(cell.mu) && cell.sd > 0, `Akt ${act} Stufe ${L} ${c}`);
      }
    }
    // mehr Slot-Stufen → weiter (Etage 0 und Boss)
    const top = model.levels[model.levels.length - 1];
    assert.ok(model.base[act][top].s0.mu > model.base[act][0].s0.mu);
    assert.ok(model.base[act][top].b.mu > model.base[act][0].b.mu);
    // Set 6 wirkt stärker als 6 zufällige Items
    assert.ok(model.items[act].set[6] > model.items[act].random[6] - 0.05);
  }
  assert.equal(itemLog(model, 2, []), 0);
  assert.ok(itemLog(model, 2, Array.from({ length: 6 }, () => ({ itemId: 'rakete_colaflaschen_rakete', tier: 1 }))) > 0);
});

test('Simulator: Etappen-Ergebnis hat die Form von stage.finish und berücksichtigt die Schrottstufe', () => {
  const save = defaultSave();
  save.run = R.newRun(save, { seed: 4 });
  const run = save.run;
  const spec = R.stageSpecFor(run, run.map.floors[0][0]);
  const r = simStageResult(model, run, spec, save, makeRng('x'));
  for (const k of ['reason', 'cleared', 'medal', 'dist', 'target', 'medals', 'kind', 'bolts', 'scrap', 'crates', 'damageTaken', 'durability']) assert.ok(k in r, k);
  // gleiche Würfel, höhere Zielmarke (Schrottstufe 2: Ziele × 1,12) → seltener geschafft (Etage 4, Akt 1)
  let a = 0, b = 0;
  const s2 = defaultSave();
  s2.run = R.newRun(s2, { seed: 4, ascension: 2 });
  const node = (r) => { const n = r.map.floors[4][0]; n.type = 'stage'; return n; };
  const sp0 = R.stageSpecFor(run, node(run)), sp2 = R.stageSpecFor(s2.run, node(s2.run));
  assert.ok(sp2.target > sp0.target);
  for (let i = 0; i < 300; i++) {
    if (simStageResult(model, run, sp0, save, makeRng(`r${i}`), { skill: false }).cleared) a++;
    if (simStageResult(model, s2.run, sp2, s2, makeRng(`r${i}`), { skill: false }).cleared) b++;
  }
  assert.ok(b < a && a > 0, `Etage 4 Akt 1: Stufe 0 ${a}/300, Stufe 2 ${b}/300`);
});

test('Simulator: deterministisch (gleicher Seed → gleiche Karriere)', () => {
  const a = simulateCareer(model, { seed: 3, maxHours: 4 });
  const b = simulateCareer(model, { seed: 3, maxHours: 4 });
  assert.deepEqual(a.milestones, b.milestones);
  assert.equal(a.runs, b.runs);
  assert.deepEqual(a.runLog, b.runLog);
});

test('Simulator: Meilenstein-Zeiten in den Zielkorridoren (V2-DESIGN §8, Toleranz ±25 %)', () => {
  const rows = summarizeCareers(getCareers());
  const tol = 0.25;
  for (const r of rows) {
    if (!r.target) continue;
    assert.ok(r.median !== null, `${r.name}: in allen Karrieren erreicht (${r.reached}/${CAREERS})`);
    const [lo, hi] = r.target;
    assert.ok(r.median >= lo * (1 - tol) && r.median <= hi * (1 + tol), `${r.name}: Median ${(r.median / 3600).toFixed(2)} h, Ziel ${(lo / 3600).toFixed(2)}–${(hi / 3600).toFixed(2)} h`);
  }
  // Reihenfolge stimmt: erster Run < Akt-1-Boss < Sieg < Schrottstufe 15
  const m = Object.fromEntries(rows.map((r) => [r.id, r.median]));
  assert.ok(m.firstRunEnd < m.firstBossAct1 && m.firstBossAct1 < m.firstWin && m.firstWin < m.ascension15);
  assert.deepEqual(Object.keys(PROGRESSION.targets).sort(), ['allChassis', 'ascension15', 'firstBossAct1', 'firstRun', 'firstWin']);
});

test('Simulator: erster Run endet meist in Akt 1–2', () => {
  const firsts = getCareers().map((c) => c.firstRun);
  const early = firsts.filter((r) => !r.won && r.act <= 2).length;
  assert.ok(early >= Math.ceil(CAREERS * 0.6), `${early}/${CAREERS} erste Runs enden in Akt 1–2`);
});

test('Regel: ein schlechter Run scheitert auch mit voller Meta (Sieg < 30 %)', () => {
  const bad = badRunCheck(model, { n: 80 });
  for (const [k, o] of Object.entries(bad)) assert.ok(o.win < 0.3, `${k}: Sieg ${Math.round(o.win * 100)} %`);
});
