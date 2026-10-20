// Trigger-Engine (items/triggerEngine.js): Kettentiefe, Ereignisse je Abarbeitung, Limits (cooldown, perStage, perRun),
// charge-Zähler, chance mit Glück, Run-Kontext, Bedingungen (items/conditions.js) und die Pflicht-Kette
// Elektro + Gyro + Kühlung (Salto → Stromschlag → Gratis-Boost → Hitze → Kühlung → Tempo) in einer echten Etappe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TriggerEngine, dispatchRunEvent } from '../www/src/items/triggerEngine.js';
import { checkConditions, CONDITION_KEYS } from '../www/src/items/conditions.js';
import { ITEMS as BAL } from '../www/src/data/balance.js';
import { makeRng } from '../www/src/core/rng.js';
import { Stage } from '../www/src/stage/stage.js';
import { Track } from '../www/src/physics/track.js';
import { BIOMES } from '../www/src/data/biomes.js';
import { buildLoadout } from '../www/src/garage/loadout.js';
import { defaultSave } from '../www/src/save/save.js';
import { mockInput, run } from './helpers.mjs';

// Einfacher ctx mit Zählern (ohne Fahrzeug)
function fakeCtx(extra = {}) {
  const ctx = {
    rng: makeRng(1), source: null, depth: 0, bolts: 0, healed: 0, triggered: [],
    addBolts(n) { ctx.bolts += n; },
    heal(n) { ctx.healed += n; },
    luck: () => ctx.luckValue || 0,
    onTriggered(src, depth, info) { ctx.triggered.push({ id: src.id, depth, info }); },
    ...extra,
  };
  return ctx;
}
function engineWith(sources, ctx = fakeCtx(), opts = {}) {
  const eng = new TriggerEngine({ sources, ctx, ...opts });
  ctx.emit = (name, data) => eng.emit(name, data, (ctx.depth || 0) + 1);
  ctx.addStack = (k, s, m, max) => eng.mods.addStack(k, s, m, max);
  ctx.addBuff = (s, m, d) => eng.mods.addBuff(s, m, d, ctx.source);
  ctx.charge = (k, n, at) => eng.mods.charge(k, n, at);
  return { eng, ctx };
}
const src = (id, triggers, extra = {}) => ({ id, kind: 'item', name: id, icon: '•', tier: 1, triggers, ...extra });

test('Engine: Kette bricht bei Tiefe > maxChainDepth (8) ab', () => {
  // Selbst-Kette: shock → shock → … (ohne Limit)
  const { eng, ctx } = engineWith([src('a', [{ on: 'shock', do: [{ fx: 'bolts', amount: 1 }, { fx: 'emit', event: 'shock' }] }])]);
  eng.emit('shock', {});
  eng.flush();
  assert.equal(BAL.maxChainDepth, 8);
  assert.equal(ctx.bolts, BAL.maxChainDepth + 1, 'Tiefe 0 … 8 lösen aus');
  assert.equal(eng.maxDepth, 8);
  assert.equal(eng.queue.dropped, 1, 'Tiefe 9 verworfen');
});

test('Engine: höchstens maxEventsPerFlush (64) Ereignisse je Abarbeitung', () => {
  // Fächer: jedes Ereignis erzeugt zwei neue → ohne Grenze 2^9 − 1 Ereignisse
  const { eng, ctx } = engineWith([src('fan', [{ on: 'shock', do: [{ fx: 'bolts', amount: 1 }, { fx: 'emit', event: 'shock' }, { fx: 'emit', event: 'shock' }] }])]);
  eng.emit('shock', {});
  const n = eng.flush();
  assert.equal(BAL.maxEventsPerFlush, 64);
  assert.equal(n, 64);
  assert.equal(ctx.bolts, 64);
  assert.ok(eng.queue.dropped > 0);
  assert.equal(eng.queue.length, 0, 'Rest verworfen, Warteschlange leer');
});

test('Engine: Limits cooldown, perStage, perRun', () => {
  const counters = {};
  const { eng, ctx } = engineWith([
    src('cd', [{ on: 'landing', limit: { cooldown: 2 }, do: [{ fx: 'bolts', amount: 1 }] }]),
    src('ps', [{ on: 'landing', limit: { perStage: 2 }, do: [{ fx: 'bolts', amount: 10 }] }]),
    src('pr', [{ on: 'landing', limit: { perRun: 1 }, do: [{ fx: 'bolts', amount: 100 }] }]),
  ], fakeCtx(), { runCounters: counters });
  const land = () => { eng.emit('landing', { quality: 'clean' }); eng.flush(); };
  land();                    // cd ✔ ps ✔ pr ✔
  assert.equal(ctx.bolts, 111);
  eng.update(1); land();     // cd ✗ ps ✔ pr ✗
  assert.equal(ctx.bolts, 121);
  eng.update(1.01); land();  // cd ✔ ps ✗ pr ✗
  assert.equal(ctx.bolts, 122);
  // neue Etappe: perStage zurückgesetzt, perRun bleibt (Zähler im Run)
  eng.emit('stageStart', {}); eng.flush();
  eng.update(3); land();
  assert.equal(ctx.bolts, 133);
  assert.equal(Object.values(counters).reduce((a, b) => a + b, 0), 1, 'perRun-Zähler steht im Run');
  const eng2 = engineWith([src('pr', [{ on: 'landing', limit: { perRun: 1 }, do: [{ fx: 'bolts', amount: 100 }] }])], fakeCtx(), { runCounters: counters });
  eng2.eng.emit('landing', {}); eng2.eng.flush();
  assert.equal(eng2.ctx.bolts, 0, 'perRun gilt auch in der nächsten Etappe');
});

test('Engine: charge-Zähler und stack über ModState', () => {
  const { eng, ctx } = engineWith([src('z', [{ on: 'flip', do: [
    { fx: 'charge', key: 'z', n: 1, at: 3, then: [{ fx: 'bolts', amount: 5 }] },
    { fx: 'stack', stat: 'boostThrust', mul: 0.1, max: 0.25 },
  ] }])]);
  for (let i = 0; i < 7; i++) { eng.emit('flip', { count: 1 }); eng.flush(); }
  assert.equal(ctx.bolts, 10, 'bei 3 und 6');
  const mods = eng.statMods();
  assert.equal(mods.length, 1);
  assert.ok(Math.abs(mods[0].stats.boostThrust.mul - 0.25) < 1e-9, 'Stapel gedeckelt');
});

test('Engine: chance mit Glück (p + Glück × luckPerPoint, höchstens chanceMax)', () => {
  const trial = (luck) => {
    const { eng, ctx } = engineWith([src('c', [{ on: 'pickup', do: [{ fx: 'chance', p: 0.2, then: [{ fx: 'bolts', amount: 1 }] }] }])]);
    ctx.luckValue = luck;
    for (let i = 0; i < 4000; i++) { eng.emit('pickup', { kind: 'bolt' }); eng.flush(); }
    return ctx.bolts / 4000;
  };
  const p0 = trial(0), p4 = trial(4), p99 = trial(99);
  assert.ok(Math.abs(p0 - 0.2) < 0.03, `ohne Glück ≈ 20 % (${p0})`);
  assert.ok(Math.abs(p4 - (0.2 + 4 * BAL.luckPerPoint)) < 0.03, `4 Glück ≈ 40 % (${p4})`);
  assert.ok(Math.abs(p99 - BAL.chanceMax) < 0.02, `gedeckelt (${p99})`);
});

test('Engine: ★-Faktor skaliert Effekte, onTriggered meldet Quelle und Tiefe', () => {
  const { eng, ctx } = engineWith([
    src('a', [{ on: 'launch', do: [{ fx: 'bolts', amount: 10 }, { fx: 'emit', event: 'shock' }] }], { tier: 3 }),
    src('b', [{ on: 'shock', do: [{ fx: 'bolts', amount: 1 }] }], { tier: 2 }),
  ]);
  eng.emit('launch', {});
  eng.flush();
  assert.ok(Math.abs(ctx.bolts - (10 * BAL.tierMult[2] + BAL.tierMult[1])) < 1e-9);
  assert.deepEqual(ctx.triggered.map((t) => [t.id, t.depth]), [['a', 0], ['b', 1]]);
});

test('Bedingungen: alle Schlüssel aus 4.4/4.11 werden ausgewertet', () => {
  assert.equal(CONDITION_KEYS.length, 20);
  const v = { onGround: false, loop: null, heat: 70, fuel: 30, durability: 20, speed: 25, stats: { fuelMax: 120, durabilityMax: 100 } };
  const ctx = { vehicle: v, chassisId: 'sofa' };
  const ok = (cond, ev, data) => checkConditions(cond, ev, data, ctx);
  assert.ok(ok({ perfect: true }, 'launch', { perfect: true }) && !ok({ perfect: true }, 'launch', { perfect: false }));
  assert.ok(ok({ quality: 'bumpy' }, 'landing', { quality: 'bumpy' }) && ok({ quality: ['clean', 'perfect'] }, 'landing', { quality: 'perfect' }));
  assert.ok(ok({ minImpact: 7 }, 'landing', { impact: 8 }) && !ok({ minImpact: 7 }, 'landing', { impact: 6 }));
  assert.ok(ok({ maxImpact: 7 }, 'groundTouch', { impact: 6 }));
  assert.ok(ok({ airborne: true }, 'flip', {}) && !ok({ grounded: true }, 'flip', {}));
  assert.ok(ok({ heatAbove: 60 }, 'boost', {}) && !ok({ heatBelow: 60 }, 'boost', {}));
  assert.ok(ok({ fuelBelow: 0.3 }, 'boost', {}) && ok({ hpBelow: 0.3 }, 'bounce', {}));
  assert.ok(ok({ minCount: 2 }, 'flip', { count: 2 }) && ok({ minCount: 2 }, 'landing', { flips: 3 }) && !ok({ minCount: 2 }, 'airSecond', { seconds: 1 }));
  assert.ok(ok({ dir: 'front' }, 'flip', { dir: 'front' }) && ok({ kind: 'scrap' }, 'pickup', { kind: 'scrap' }));
  assert.ok(ok({ ability: 'sprung' }, 'abilityUse', { ability: 'sprung' }) && ok({ free: true }, 'boost', { free: true }));
  assert.ok(ok({ source: 'lightning' }, 'shock', { source: 'lightning' }) && ok({ minSpeed: 20 }, 'boost', {}));
  assert.ok(ok({ nodeType: 'treasure' }, 'nodeEnter', { type: 'treasure' }) && ok({ medal: 'gold' }, 'stageClear', { medal: 'gold' }));
  assert.ok(ok({ chassis: 'sofa' }, 'stageStart', {}) && !ok({ chassis: 'badewanne' }, 'stageStart', {}));
  // Run-Kontext: ohne Fahrzeug nur hpBelow (ctx.hpFrac) und chassis
  const rctx = { vehicle: null, hpFrac: () => 0.2, chassisId: 'sofa' };
  assert.ok(checkConditions({ hpBelow: 0.3 }, 'stageClear', {}, rctx));
  assert.ok(!checkConditions({ heatAbove: 10 }, 'stageClear', {}, rctx));
});

test('Run-Kontext: Ereignis ohne Fahrzeug, Effekte wirken auf den Run', () => {
  const runState = { bolts: 0, hp: 50 };
  const ctx = {
    vehicle: null, rng: makeRng(3), source: null, depth: 0,
    addBolts: (n) => { runState.bolts += n; }, heal: (n) => { runState.hp += n; },
    hpFrac: () => runState.hp / 100, chassisId: 'seifenkiste', luck: () => 0,
  };
  dispatchRunEvent({
    sources: [src('kat', [{ on: 'stageClear', if: { medal: 'gold' }, do: [{ fx: 'bolts', amount: 5 }, { fx: 'heal', amount: 3 }, { fx: 'thrust', amount: 9 }] }])],
    ctx, rules: {},
  }, 'stageClear', { medal: 'gold', kind: 'stage' });
  assert.equal(runState.bolts, 5);
  assert.equal(runState.hp, 53);
  dispatchRunEvent({ sources: [src('kat', [{ on: 'stageClear', if: { medal: 'gold' }, do: [{ fx: 'bolts', amount: 5 }] }])], ctx, rules: {} }, 'stageClear', { medal: 'bronze' });
  assert.equal(runState.bolts, 5, 'Bedingung medal');
});

// ---------- Pflicht-Kette in einer echten Etappe ----------
test('Kette Elektro + Gyro + Kühlung: Salto → Stromschlag → Gratis-Boost → Hitze → Kühlung → Tempo', () => {
  const save = defaultSave();
  const biome = BIOMES[0];
  const log = [];
  const stage = new Stage({
    biome, track: new Track(biome), loadout: buildLoadout(save), seed: 4,
    inventory: [{ itemId: 'gyro_fahrraddynamo', tier: 1 }, { itemId: 'elektro_blitzableiter', tier: 1 }, { itemId: 'eis_kuehlerschlauch', tier: 1 }],
    hooks: { triggered: (s, depth) => log.push({ id: s.id, depth, t: stage.time }) },
  });
  const events = [];
  stage.onEvent = (name, data, depth) => events.push({ name, data, depth, t: stage.time });
  // hoch in der Luft, heiß (über 60), dann links halten bis zum Salto
  stage.launchNow(0.5, 30);
  const v = stage.vehicle;
  v.y = stage.track.heightAt(v.x) + 400; v.vx = 20; v.vy = 0; v.angle = 0; v.w = 0;
  v.heat = 75;
  const input = mockInput();
  input.st.tilt = 1;
  let i = 0;
  while (!events.some((e) => e.name === 'boost' && e.data.free) && i++ < 400) {
    if (v.heat < 75) v.heat = 75;        // Hitze halten, bis der Boost startet
    run(stage, input, 1 / 60);
  }
  const flip = events.find((e) => e.name === 'flip');
  const shock = events.find((e) => e.name === 'shock');
  const boost = events.find((e) => e.name === 'boost' && e.data.free);
  assert.ok(flip && shock && boost, `Ereignisse: ${events.map((e) => e.name).join(',')}`);
  assert.equal(flip.depth, 0);
  assert.equal(shock.depth, 1, 'Salto → Stromschlag (Fahrraddynamo)');
  assert.equal(shock.data.source, 'dynamo');
  assert.equal(boost.depth, 2, 'Stromschlag → Gratis-Boost (Blitzableiter), Kette geht weiter');
  assert.ok(boost.t >= shock.t);
  // Kühlerschlauch reagiert im selben Schritt auf den Boost über 60 Hitze: −30 Hitze, Schub, höhere Tempogrenze
  const capBefore = buildLoadout(save).stats.speedSoftCap;
  const k = log.find((l) => l.id === 'eis_kuehlerschlauch');
  assert.ok(k, `ausgelöst: ${log.map((l) => l.id).join(',')}`);
  assert.equal(k.depth, 2);
  assert.ok(v.heat < 75 - 15, `Hitze → Kühlung (75 → ${v.heat.toFixed(1)})`);
  run(stage, input, 1 / 60);
  assert.ok(stage.stats.speedSoftCap > capBefore * 1.1, `Tempo: Tempogrenze ${capBefore} → ${stage.stats.speedSoftCap}`);
  assert.ok(stage.maxChain >= 3, `Kette mit ${stage.maxChain} Gliedern`);
  // Reihenfolge der Items (dazwischen wirkt das Elektro-Set 2: Stromschlag schiebt an)
  assert.deepEqual(log.filter((l) => !l.id.startsWith('set_') && !l.id.startsWith('recipe_')).slice(0, 3).map((l) => l.id), ['gyro_fahrraddynamo', 'elektro_blitzableiter', 'eis_kuehlerschlauch']);
  // Paket C: Blitzableiter + Fahrraddynamo = Rezept „Gewittermaschine“ (Stromschlag schiebt an)
  assert.ok(log.some((l) => l.id === 'recipe_gewittermaschine' && l.depth === 1), 'Rezept Gewittermaschine aktiv');
  assert.ok(log.some((l) => l.id === 'set_elektro2' && l.depth === 1), 'Elektro-Set 2 (2 Elektro-Items)');
});

// ---------- Auslöser von Chassis und Garage-Teilen wirken in der Etappe ----------
test('Chassis- und Teile-Auslöser: Raketenschlitten (Gratis-Boost), Hupe (Schrauben), Topfdeckel (Schild)', () => {
  const save = defaultSave();
  save.garage.chassis = 'raketenschlitten';
  save.garage.ownedChassis = [...new Set([...save.garage.ownedChassis, 'raketenschlitten'])];
  save.garage.parts.gadget = 'gadget_hupe';
  save.garage.parts.armor = 'armor_topfdeckel';
  save.garage.ownedParts = [...new Set([...save.garage.ownedParts, 'gadget_hupe', 'armor_topfdeckel'])];
  const lo = buildLoadout(save);
  assert.equal(lo.chassis.id, 'raketenschlitten');
  const biome = BIOMES[0];
  const log = [];
  const stage = new Stage({ biome, track: new Track(biome), loadout: lo, seed: 7, hooks: { triggered: (s, depth) => log.push({ id: s.id, kind: s.kind, depth }) } });
  const events = [];
  stage.onEvent = (name, data, depth) => events.push({ name, data, depth });
  assert.ok(stage.setup.sources.some((s) => s.kind === 'part' && s.id === 'gadget_hupe'), 'Teil-Quelle Hupe');
  // stageStart → Topfdeckel gibt 1 Schild
  run(stage, mockInput(), 1 / 60);
  assert.ok(stage.vehicle.shields >= 1, `Schilde ${stage.vehicle.shields}`);
  assert.ok(log.some((l) => l.id === 'armor_topfdeckel' && l.kind === 'part'));
  // perfekter Abschuss → Hupe +2 Schrauben, Raketenschlitten startet einen Gratis-Boost
  const bolts0 = stage.bolts;
  stage.launchNow(0.9, 30, true);
  for (let i = 0; i < 8; i++) run(stage, mockInput(), 1 / 60);
  assert.ok(stage.bolts >= bolts0 + 2 - 1e-9, `Schrauben ${bolts0} → ${stage.bolts}`);
  assert.ok(log.some((l) => l.id === 'gadget_hupe' && l.kind === 'part'), 'Hupe ausgelöst');
  assert.ok(log.some((l) => l.id === 'raketenschlitten' && l.kind === 'chassis'), 'Raketenschlitten ausgelöst');
  const fb = events.find((e) => e.name === 'boost' && e.data.free);
  assert.ok(fb, 'Gratis-Boost des Raketenschlittens');
  assert.equal(fb.depth, 1, 'perfectLaunch (0) → Gratis-Boost (1)');
});
