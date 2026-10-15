// Effekt-Bibliothek: jeder fx einmal (mit dem ctx einer echten Etappe), Stufen-Skalierung, Ereignis-Warteschlange.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, BASE_STATS } from '../www/src/data/balance.js';
import { run, runAll, FX_NAMES, SCALE_KEYS, chanceP } from '../www/src/items/effects.js';
import { EventQueue } from '../www/src/items/eventQueue.js';
import { ModState } from '../www/src/items/modState.js';
import { EVENTS, STAGE_EVENTS } from '../www/src/items/events.js';
import { makeStage, mockInput, airborne, run as runStage } from './helpers.mjs';

const near = (a, b, eps = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} ≉ ${b}`);

function flying() {
  const t = makeStage();
  airborne(t.stage);
  return { ...t, ctx: t.stage.ctx, v: t.stage.vehicle, input: mockInput() };
}
const counted = (t, name) => t.events.filter((e) => e.name === name);

const tested = new Set();
function fx(name, fn) {
  tested.add(name);
  test(`fx ${name}`, fn);
}

fx('thrust', () => {
  const t = flying();
  const sp = Math.hypot(t.v.vx, t.v.vy);
  run({ fx: 'thrust', amount: 6 }, t.ctx);
  assert.ok(Math.hypot(t.v.vx, t.v.vy) > sp + 4, 'schneller (weiche Grenze dämpft leicht)');
});

fx('jump', () => {
  const t = flying();
  t.v.vy = -10;
  run({ fx: 'jump', amount: 9 }, t.ctx);
  near(t.v.vy, -1, 1e-9, 'Item-Sprung in der Luft: reiner Impuls (ITEMS.effectJumpCancelFall = 0)');
  t.v.vy = -10;
  const prev = t.ctx.source;
  t.ctx.source = { id: 'sprung', kind: 'ability' };
  run({ fx: 'jump', amount: 9 }, t.ctx);
  t.ctx.source = prev;
  near(t.v.vy, 9, 1e-9, 'Fähigkeit Hüpfer: Doppelsprung hebt Fallen auf');
  // am Boden: abheben
  t.v.onGround = true;
  t.v.s = 10;
  run({ fx: 'jump', amount: 5 }, t.ctx);
  assert.equal(t.v.onGround, false);
  assert.ok(t.v.vy >= 5 - 1e-9);
});

fx('boost', () => {
  const t = flying();
  const fuel = t.v.fuel;
  run({ fx: 'boost', dur: 1 }, t.ctx);
  runStage(t.stage, t.input, 0.5);
  assert.equal(t.v.boosting, true);
  assert.equal(t.v.fuel, fuel, 'Gratis-Boost kostet keinen Treibstoff');
  const b = counted(t, 'boost');
  assert.equal(b.length, 1);
  assert.equal(b[0].data.free, true);
  runStage(t.stage, t.input, 0.7);
  assert.equal(t.v.boosting, false);
});

fx('explosion', () => {
  const t = flying();
  const vx = t.v.vx;
  run({ fx: 'explosion', amount: 5 }, t.ctx);
  assert.ok(t.v.vx > vx + 3);
  t.stage.flushEvents();
  assert.equal(counted(t, 'explosion')[0].data.amount, 5);
});

fx('heal', () => {
  const t = flying();
  t.v.durability = 50;
  run({ fx: 'heal', amount: 10 }, t.ctx);
  near(t.v.durability, 60);
  run({ fx: 'heal', pct: 0.1 }, t.ctx);
  near(t.v.durability, 60 + t.stage.stats.durabilityMax * 0.1);
  run({ fx: 'heal', amount: 1000 }, t.ctx);
  near(t.v.durability, t.stage.stats.durabilityMax, 1e-9, 'höchstens Maximum');
  runStage(t.stage, t.input, 1 / 60);
  assert.equal(counted(t, 'heal').length, 3);
});

fx('selfDamage', () => {
  const t = flying();
  t.v.shields = 2;
  const d0 = t.v.durability;
  run({ fx: 'selfDamage', amount: 7 }, t.ctx);
  near(t.v.durability, d0 - 7, 1e-9, 'ignoriert Panzerung und Schild');
  assert.equal(t.v.shields, 2);
});

fx('cool', () => {
  const t = flying();
  t.v.heat = 50;
  run({ fx: 'cool', amount: 20 }, t.ctx);
  near(t.v.heat, 30);
  run({ fx: 'cool', amount: 100 }, t.ctx);
  assert.equal(t.v.heat, 0);
});

fx('heat', () => {
  const t = flying();
  run({ fx: 'heat', amount: 20 }, t.ctx);
  near(t.v.heat, 20 * t.stage.stats.heatGain);
});

fx('fuel', () => {
  const t = flying();
  t.v.fuel = 10;
  run({ fx: 'fuel', amount: 15 }, t.ctx);
  near(t.v.fuel, 25);
  run({ fx: 'fuel', amount: 500 }, t.ctx);
  near(t.v.fuel, t.stage.stats.fuelMax);
  run({ fx: 'fuel', amount: 500, over: true }, t.ctx);
  near(t.v.fuel, t.stage.stats.fuelMax * ITEMS.overFuelMax, 1e-9, 'über das Maximum');
});

fx('bolts', () => {
  const t = flying();
  run({ fx: 'bolts', amount: 3 }, t.ctx);
  near(t.stage.bolts, 3 * t.stage.stats.boltGain);
});

fx('scrap', () => {
  const t = flying();
  run({ fx: 'scrap', amount: 4 }, t.ctx);
  near(t.stage.scrapBonus, 4);
});

fx('magnet', () => {
  const t = flying();
  run({ fx: 'magnet', radius: 12, dur: 1 }, t.ctx);
  assert.equal(t.v.magnetRadius, 12);
  runStage(t.stage, t.input, 1.1);
  assert.equal(t.v.magnetRadius, t.stage.stats.magnet);
});

fx('buff', () => {
  const t = flying();
  const c0 = t.stage.stats.coolRate;
  run({ fx: 'buff', stat: 'coolRate', mul: 0.5, dur: 1 }, t.ctx);
  runStage(t.stage, t.input, 1 / 60);
  near(t.stage.stats.coolRate, c0 * 1.5, 1e-6);
  assert.equal(t.v.stats.coolRate, t.stage.stats.coolRate, 'Fahrzeug nutzt die neuen Werte');
  runStage(t.stage, t.input, 1.1);
  near(t.stage.stats.coolRate, c0, 1e-9, 'Buff abgelaufen');
});

fx('stack', () => {
  const t = flying();
  const d0 = t.stage.stats.driveAccel;
  for (let i = 0; i < 30; i++) run({ fx: 'stack', key: 'test', stat: 'driveAccel', mul: 0.03, max: 0.6 }, t.ctx);
  runStage(t.stage, t.input, 1 / 60);
  near(t.stage.stats.driveAccel, d0 * 1.6, 1e-6, 'bis max');
});

fx('charge', () => {
  const t = flying();
  const ch = { fx: 'charge', key: 'k', n: 1, at: 3, then: [{ fx: 'bolts', amount: 5 }] };
  run(ch, t.ctx); run(ch, t.ctx);
  assert.equal(t.stage.bolts, 0);
  run(ch, t.ctx);
  near(t.stage.bolts, 5 * t.stage.stats.boltGain);
  run(ch, t.ctx);
  near(t.stage.bolts, 5 * t.stage.stats.boltGain, 1e-9, 'Zähler wieder bei 0');
});

fx('emit', () => {
  const t = flying();
  t.ctx.depth = 2;
  const depths = [];
  t.stage.onEvent = (name, data, depth) => { if (name === 'pickup') depths.push(depth); };
  run({ fx: 'emit', event: 'pickup', data: { kind: 'scrap' } }, t.ctx);
  t.stage.flushEvents();
  const p = counted(t, 'pickup');
  assert.equal(p.length, 1);
  assert.equal(p[0].data.kind, 'scrap');
  assert.deepEqual(depths, [3], 'Kettentiefe + 1');
});

fx('shield', () => {
  const t = flying();
  run({ fx: 'shield', n: 2 }, t.ctx);
  assert.equal(t.v.shields, 2);
  const d0 = t.v.durability;
  t.ctx.damage(10, 'test');
  assert.equal(t.v.durability, d0);
  assert.equal(t.v.shields, 1);
});

fx('spin', () => {
  const t = flying();
  t.v.w = 0;
  run({ fx: 'spin', amount: 6 }, t.ctx);
  near(t.v.w, 6);
});

fx('slowmo', () => {
  const t = flying();
  run({ fx: 'slowmo', dur: 0.8 }, t.ctx);
  assert.ok(t.stage.slowmo >= 0.8);
});

fx('refill', () => {
  const t = flying();
  const s = t.stage.abilities.slots[1];
  t.input.press(1);
  runStage(t.stage, t.input, 1 / 60);
  const cd = s.cd;
  assert.ok(cd > 1);
  run({ fx: 'refill', ability: s.def.id, pct: 0.5 }, t.ctx);
  near(s.cd, cd - s.cdMax * 0.5);
  run({ fx: 'refill', pct: 1 }, t.ctx);
  assert.equal(s.cd, 0);
});

fx('chance', () => {
  const t = flying();
  run({ fx: 'chance', p: 1, then: [{ fx: 'bolts', amount: 2 }] }, t.ctx);
  near(t.stage.bolts, 2);
  run({ fx: 'chance', p: 0, then: [{ fx: 'bolts', amount: 2 }] }, t.ctx);
  near(t.stage.bolts, 2, 1e-9, 'p 0 ohne Glück löst nie aus');
  near(chanceP(0.2, 2), 0.2 + 2 * ITEMS.luckPerPoint);
  assert.equal(chanceP(0.9, 100), ITEMS.chanceMax);
});

fx('maxHp', () => {
  const t = flying();
  const m0 = t.stage.stats.durabilityMax, d0 = t.v.durability;
  run({ fx: 'maxHp', amount: 20 }, t.ctx);
  near(t.stage.stats.durabilityMax, m0 + 20);
  near(t.v.durability, d0 + 20);
});

fx('maxFuel', () => {
  const t = flying();
  const m0 = t.stage.stats.fuelMax;
  run({ fx: 'maxFuel', amount: 15 }, t.ctx);
  near(t.stage.stats.fuelMax, m0 + 15);
  near(t.v.fuel, m0 + 15);
});

fx('upgradeItem', () => {
  let called = 0;
  run({ fx: 'upgradeItem' }, { upgradeItem: () => { called++; } });
  assert.equal(called, 1);
  const t = flying();
  assert.doesNotThrow(() => run({ fx: 'upgradeItem' }, t.ctx), 'ohne Items (Phase 2) passiert nichts');
});

test('jeder fx aus ARCHITEKTUR 4.3/4.11 ist implementiert und getestet', () => {
  const expected = ['thrust', 'jump', 'boost', 'explosion', 'heal', 'selfDamage', 'cool', 'heat', 'fuel', 'bolts', 'scrap', 'magnet',
    'buff', 'stack', 'charge', 'emit', 'shield', 'spin', 'slowmo', 'refill', 'chance', 'maxHp', 'maxFuel', 'upgradeItem'];
  assert.deepEqual([...FX_NAMES].sort(), [...expected].sort());
  for (const n of expected) assert.ok(tested.has(n), `Test für ${n}`);
  assert.deepEqual(SCALE_KEYS, ['amount', 'pct', 'dur', 'radius', 'add', 'mul']);
});

test('Stufenfaktor (★) skaliert amount/dur/…, physikalische Effekte ohne Fahrzeug entfallen', () => {
  const t = flying();
  run({ fx: 'bolts', amount: 2 }, t.ctx, ITEMS.tierMult[1]);
  near(t.stage.bolts, 2 * ITEMS.tierMult[1]);
  runAll([{ fx: 'magnet', radius: 5, dur: 1 }], t.ctx, ITEMS.tierMult[2]);
  near(t.v.magnetRadius, 5 * ITEMS.tierMult[2]);
  // Run-Kontext ohne Fahrzeug: nichts stürzt ab
  const runCtx = { vehicle: null, rng: { next: () => 0.5 }, addBolts() {}, luck: () => 0 };
  for (const name of FX_NAMES) assert.doesNotThrow(() => run({ fx: name, amount: 1, dur: 1, stat: 'luck', add: 1, then: [] }, runCtx), name);
  assert.doesNotThrow(() => run({ fx: 'gibtsNicht' }, t.ctx));
});

test('Ereignis-Warteschlange: FIFO, Kettentiefe ≤ 8, höchstens 64 je Abarbeitung', () => {
  assert.ok(STAGE_EVENTS.includes('boostSecond') && EVENTS.includes('runStart'));
  const q = new EventQueue();
  const seen = [];
  q.push('a', {}, 0);
  q.push('b', {}, 0);
  q.drain((n, d, depth) => {
    seen.push(`${n}${depth}`);
    if (depth < 20) q.push(n, d, depth + 1);   // Endloskette
  });
  assert.equal(seen.slice(0, 4).join(','), 'a0,b0,a1,b1');
  assert.equal(seen.length, 2 * (ITEMS.maxChainDepth + 1), 'Tiefe > 8 verworfen');
  assert.ok(q.dropped >= 2);
  const q2 = new EventQueue();
  for (let i = 0; i < 100; i++) q2.push('x');
  assert.equal(q2.drain(() => {}), ITEMS.maxEventsPerFlush);
  assert.equal(q2.length, 0);
});

test('ModState: Buffs altern, Stapel bis max, Zähler', () => {
  const m = new ModState();
  m.addBuff('coolRate', { mul: 0.2 }, 1);
  assert.equal(m.dirty, true);
  assert.deepEqual(m.mods(), [{ stats: { coolRate: { add: 0, mul: 0.2 } } }]);
  m.dirty = false;
  m.update(0.5);
  assert.equal(m.dirty, false);
  m.update(0.6);
  assert.equal(m.dirty, true);
  assert.equal(m.mods().length, 0);
  for (let i = 0; i < 10; i++) m.addStack('k', 'mass', { mul: -0.1 }, 0.3);
  near(m.stacks.get('k').mul, -0.3);
  assert.equal(m.charge('c', 2, 3), false);
  assert.equal(m.charge('c', 1, 3), true);
  assert.equal(m.charge('c', 1, 3), false);
  assert.ok(BASE_STATS.coolRate > 0);
});

test('emit: unbekannte Ereignis-Namen (Tippfehler in Inhaltsdaten) werden verworfen statt still weitergereicht', () => {
  const t = flying();
  const warn = console.warn;
  const warned = [];
  console.warn = (m) => warned.push(String(m));
  try {
    run({ fx: 'emit', event: 'tippfehler', data: {} }, t.ctx);
    run({ fx: 'emit', event: 'tippfehler', data: {} }, t.ctx);
  } finally { console.warn = warn; }
  t.stage.flushEvents();
  assert.equal(counted(t, 'tippfehler').length, 0);
  assert.equal(warned.filter((m) => m.includes('tippfehler')).length, 1, 'nur einmal gewarnt');
});

test('maxHp/maxFuel: der aktuelle Wert steigt um die echte Änderung des Maximums und bleibt ≤ Maximum', () => {
  // Einkaufswagen: durabilityMax × 0,6 → +10 Basis sind nur +6 Maximum
  const t = makeStage({ chassis: 'einkaufswagen' });
  airborne(t.stage);
  const v = t.stage.vehicle;
  const m0 = t.stage.stats.durabilityMax;
  run({ fx: 'maxHp', amount: 10 }, t.stage.ctx);
  near(t.stage.stats.durabilityMax, m0 + 6, 1e-9);
  near(v.durability, t.stage.stats.durabilityMax, 1e-9, 'voll, aber nicht darüber');
  // negativ: Maximum sinkt, aktueller Wert wird gekürzt
  const s = makeStage();
  airborne(s.stage);
  run({ fx: 'maxHp', amount: -20 }, s.stage.ctx);
  near(s.stage.vehicle.durability, s.stage.stats.durabilityMax, 1e-9);
  run({ fx: 'maxFuel', amount: -30 }, s.stage.ctx);
  assert.ok(s.stage.vehicle.fuel <= s.stage.stats.fuelMax + 1e-9);
});
