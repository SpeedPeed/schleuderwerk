// Paket D – Mutatoren: Daten, Vergabe auf der Karte, Wirkung auf Spezifikation, Etappe und Belohnung.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MUTATORS, MUTATOR_RULES, mutatorById } from '../www/src/data/mutators.js';
import { STATS } from '../www/src/items/statMods.js';
import { BIOMES } from '../www/src/data/biomes.js';
import { generateStageSpec } from '../www/src/physics/trackGen.js';
import { generateActMap } from '../www/src/map/mapGen.js';
import { makeRng } from '../www/src/core/rng.js';
import { stageRewards } from '../www/src/run/rewards.js';
import { simSave, makeSimStage } from '../tools/sim/bot.mjs';

test('Mutatoren: Daten gültig (IDs eindeutig, bekannte Werte, Text, Symbol)', () => {
  assert.ok(MUTATORS.length >= 12);
  assert.equal(new Set(MUTATORS.map((m) => m.id)).size, MUTATORS.length);
  for (const m of MUTATORS) {
    assert.ok(m.name && m.desc && m.iconId, m.id);
    for (const k of Object.keys(m.stats || {})) assert.ok(STATS.includes(k), `${m.id}: Wert ${k}`);
    assert.equal(mutatorById(m.id), m);
  }
  assert.equal(mutatorById('gibtsnicht'), null);
});

test('Karte: jede Elite hat einen Mutator, Bosse nie, Akt 2 hat Etappen mit Mutator, deterministisch', () => {
  let stages = 0, withMut = 0;
  for (let i = 0; i < 30; i++) {
    const m = generateActMap(2, makeRng(`mk${i}`));
    for (const n of m.floors.flat()) {
      if (n.type === 'elite') assert.ok(mutatorById(n.mutator), `${n.id} Elite ohne Mutator`);
      if (n.type === 'stage') { stages++; if (n.mutator) withMut++; }
      if (n.mutator && n.type !== 'elite') assert.ok(!mutatorById(n.mutator).eliteOnly, 'nur-Elite-Mutator auf Etappe');
    }
    assert.equal(m.boss.mutator, undefined);
  }
  const share = withMut / stages;
  assert.ok(Math.abs(share - MUTATOR_RULES.stageChance) < 0.1, `Anteil ${share.toFixed(2)}`);
  assert.deepEqual(generateActMap(2, makeRng('gleich')), generateActMap(2, makeRng('gleich')));
});

test('Spezifikation: Goldrausch verschiebt die Marken, Sperrmülltag mehr Bausteine, Wind addiert, Boss ignoriert', () => {
  const b = BIOMES[1];
  const spec = (mutator, kind = 'stage') => generateStageSpec({ biome: b, kind, floor: 3, rng: makeRng('m'), mutator });
  const plain = spec(null), gold = spec('goldrausch');
  assert.ok(gold.target > plain.target && gold.medals.gold < plain.medals.gold);
  assert.ok(gold.medals.silver > gold.medals.bronze && gold.medals.silver < gold.medals.gold);
  assert.equal(gold.mutator, 'goldrausch');
  assert.ok(spec('sperrmuelltag').features.length >= plain.features.length);
  assert.ok(Math.abs(spec('gegensturm').weather.base - (plain.weather.base - 5)) < 1e-9);
  assert.equal(spec('goldrausch', 'boss').mutator, null);
});

test('Etappe: Mondschwerkraft senkt die Schwerkraft, Ölfilm die Landetoleranz, Spiegelverkehrt dreht das Neigen', () => {
  const b = BIOMES[0];
  const mk = (mutator) => makeSimStage({ spec: generateStageSpec({ biome: b, kind: 'elite', floor: 2, rng: makeRng('e'), mutator }), biome: b, save: simSave('start'), seed: 2 }).stage;
  const plain = mk(null);
  assert.ok(Math.abs(mk('mondschwerkraft').vehicle.gravity - plain.vehicle.gravity * 0.65) < 1e-9);
  assert.ok(Math.abs(mk('oelfilm').stats.landTolDeg - (plain.stats.landTolDeg - 5)) < 1e-9);
  assert.equal(mk('spiegelverkehrt').invertTilt, true);
  assert.ok(mk('funkenflug').setup.sources.some((s) => s.kind === 'mutator'));
});

test('Belohnung: harte Mutatoren zahlen mehr Grund-Schrauben', () => {
  const r = { dist: 600, medal: 'gold', medals: { bronze: 400, silver: 500, gold: 600 }, reason: 'stop', tricks: null, bolts: 0, scrap: 0 };
  const a = stageRewards(2, 'elite', r), m = stageRewards(2, 'elite', { ...r, mutator: 'spiegelverkehrt' });
  assert.ok(m.base.bolts > a.base.bolts && m.base.scrap > a.base.scrap);
});

// ---------- Paket D3: Etappen-Arten ----------
import { goalMedal, makeGoal, GOAL_TYPES, GOAL_INFO } from '../www/src/stage/goals.js';
import { generateActMap as gam } from '../www/src/map/mapGen.js';

test('Etappen-Arten: Marken je Art, Lieferung begrenzt durch Bruchlandungen, Karte verteilt Arten', () => {
  for (const t of GOAL_TYPES) assert.ok(GOAL_INFO[t] && GOAL_INFO[t].iconId, t);
  const h = makeGoal('height', 600, 'stage');
  assert.ok(h.medals.bronze > 0 && h.medals.silver > h.medals.bronze && h.medals.gold > h.medals.silver);
  assert.equal(makeGoal('distance', 600, 'stage'), null);
  assert.equal(makeGoal('sprint', 600, 'stage').timeLimit > 0, true);
  const spec = { goal: makeGoal('delivery', 600, 'stage'), medals: { bronze: 600, silver: 750, gold: 900 }, medalList: ['bronze', 'silver', 'gold'] };
  assert.equal(goalMedal(spec, 950, 0), 'gold');
  assert.equal(goalMedal(spec, 950, 2), 'silver');
  assert.equal(goalMedal(spec, 950, 3), 'bronze');
  assert.equal(goalMedal(spec, 950, 4), null);
  const seen = new Set();
  for (let i = 0; i < 20; i++) {
    const m = gam(2, makeRng(`goal${i}`));
    for (const n of m.floors.flat()) {
      if (n.floor === 0 && n.type === 'stage') assert.equal(n.goal, undefined, 'Etage 0 ist Weitflug');
      if (n.goal) seen.add(n.goal);
    }
  }
  assert.ok(seen.size >= 5, [...seen].join(','));
});

test('Etappe: Zeitrennen endet nach dem Zeitlimit, Höhenjagd wertet die Höhe', () => {
  const b = BIOMES[0];
  const spec = generateStageSpec({ biome: b, kind: 'stage', floor: 2, rng: makeRng('sp'), goal: 'sprint' });
  const st = makeSimStage({ spec, biome: b, save: simSave('gut'), seed: 4 }).stage;
  let res = null;
  st.hooks.end = (r) => { res = r; };
  st.fire();
  for (let i = 0; i < 60 * 20 && !res; i++) st.update(1 / 60, { hold: false, tilt: 0 });
  assert.ok(res && res.reason === 'time' && res.time <= spec.goal.timeLimit + 0.1, `${res && res.reason} ${res && res.time}`);
  assert.equal(res.goal.type, 'sprint');
  const hs = generateStageSpec({ biome: b, kind: 'stage', floor: 2, rng: makeRng('hs'), goal: 'height' });
  assert.equal(hs.goal.type, 'height');
});

// ---------- Paket D4: Ereignisse während der Etappe ----------
import { STAGE_EVENTS, STAGE_EVENT_RULES, stageEventById } from '../www/src/data/stageEvents.js';

test('Etappen-Ereignisse: ab Etage 2, Elite mehr, Boss nie, Abstand, Aufbau in der Strecke, Ankündigung', () => {
  const b = BIOMES[1];
  let total = 0;
  for (let i = 0; i < 40; i++) {
    const s0 = generateStageSpec({ biome: b, kind: 'stage', floor: 1, rng: makeRng(`ev${i}`) });
    assert.equal(s0.events.length, 0);
    const s = generateStageSpec({ biome: b, kind: 'stage', floor: 3, rng: makeRng(`ev${i}`) });
    assert.ok(s.events.length >= 1 && s.events.length <= 2);
    for (let k = 1; k < s.events.length; k++) assert.ok(s.events[k].x - s.events[k - 1].x >= STAGE_EVENT_RULES.minGap);
    for (const e of s.events) assert.ok(stageEventById(e.type));
    total += s.events.length;
    const boss = generateStageSpec({ biome: b, kind: 'boss', floor: 6, rng: makeRng(`ev${i}`) });
    assert.equal(boss.events.length, 0);
  }
  assert.ok(total > 40);
  const ids = new Set(STAGE_EVENTS.map((e) => e.id));
  assert.equal(ids.size, STAGE_EVENTS.length);
  // Aufbau: Schraubenwolke legt Schrauben, Tornado eine Aufwind-Säule; die Etappe kündigt beides an
  const spec = generateStageSpec({ biome: b, kind: 'stage', floor: 3, rng: makeRng('evb') });
  spec.events = [{ type: 'schraubenwolke', x: 300, seed: 5 }, { type: 'tornado', x: 450, seed: 6 }];
  const st = makeSimStage({ spec, biome: b, save: simSave('start'), seed: 1 }).stage;
  assert.ok(st.objects.bolts.filter((o) => Math.abs(o.x - 300) <= 13).length >= 18);
  assert.ok(st.objects.thermals.some((t) => t.x === 450));
  assert.ok(st.bossWarn.some((w) => /SCHRAUBENWOLKE/.test(w.text)) && st.bossWarn.some((w) => /TORNADO/.test(w.text)));
});
