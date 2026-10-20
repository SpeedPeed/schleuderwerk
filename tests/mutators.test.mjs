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
