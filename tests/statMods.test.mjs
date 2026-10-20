// Stat-Pipeline: add/mul/xmul, Soft-Caps und Grenzen, Teile-Stufen, Regeln und Quellen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_STATS, SOFTCAPS, GARAGE, ITEMS } from '../www/src/data/balance.js';
import {
  STATS, computeStats, baseStats, emptyAcc, applyMods, finalize, limitStat, partDimLevels, collectRules, collectSources, statDiff,
} from '../www/src/items/statMods.js';
import { chassisById, partById } from '../www/src/data/index.js';
import { softcap } from '../www/src/core/math.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const mods = (stats) => ({ stats });

test('STATS enthält das ganze Vokabular und BASE_STATS hat für jeden Stat einen Grundwert', () => {
  assert.equal(new Set(STATS).size, STATS.length);
  for (const k of STATS) assert.equal(typeof BASE_STATS[k], 'number', `Grundwert für ${k}`);
  for (const k of Object.keys(SOFTCAPS)) assert.ok(STATS.includes(k), `SOFTCAPS.${k} ist ein Stat`);
  const b = baseStats();
  for (const k of STATS) assert.ok(isFinite(b[k]), k);
  assert.equal(b.launchSpeed, BASE_STATS.launchSpeed);
  assert.equal(b.fuelMax, BASE_STATS.fuelMax);
  assert.equal(b.heatMax, 100);
  assert.equal(b.durabilityMax, 100);
});

test('Endwert = (Basis + Σadd) × (1 + Σmul) × Π xmul', () => {
  const s = computeStats({ extra: [
    mods({ fuelMax: { add: 20 } }),
    mods({ fuelMax: { mul: 0.1, add: 5 } }),
    mods({ fuelMax: { mul: 0.15 } }),
    mods({ fuelMax: { xmul: 1.5 } }),
    mods({ fuelMax: { xmul: 1.2 } }),
  ] });
  near(s.fuelMax, (BASE_STATS.fuelMax + 25) * (1 + 0.25) * 1.5 * 1.2);
  // mul addiert sich: 2 × +50 % = ×2 (nicht ×2,25)
  const m = computeStats({ extra: [mods({ coolRate: { mul: 0.5 } }), mods({ coolRate: { mul: 0.5 } })] });
  near(m.coolRate, BASE_STATS.coolRate * 2);
  // Reihenfolge egal
  const a = computeStats({ extra: [mods({ coolRate: { xmul: 2 } }), mods({ coolRate: { add: 5 } })] });
  const b = computeStats({ extra: [mods({ coolRate: { add: 5 } }), mods({ coolRate: { xmul: 2 } })] });
  near(a.coolRate, b.coolRate);
  near(a.coolRate, (BASE_STATS.coolRate + 5) * 2);
});

test('Soft-Caps: weich über cap, harte min/max-Grenzen, ganze Zahlen', () => {
  const C = SOFTCAPS.launchSpeed;
  const s = computeStats({ extra: [mods({ launchSpeed: { add: 80 - BASE_STATS.launchSpeed } })] });
  near(s.launchSpeed, softcap(80, C.cap, C.pow));
  assert.ok(s.launchSpeed < 80 && s.launchSpeed > C.cap);
  // unter dem Cap unverändert
  near(limitStat('launchSpeed', 30), 30);
  // Luftsteuerung hat ebenfalls einen Soft-Cap
  const ac = computeStats({ extra: [mods({ airControl: { xmul: 4 } })] });
  assert.ok(ac.airControl < BASE_STATS.airControl * 4 && ac.airControl > SOFTCAPS.airControl.cap);
  // Slots sind ganze Zahlen
  const sl = computeStats({ extra: [mods({ itemSlots: { add: 0.6 } })] });
  assert.equal(sl.itemSlots, 7);
});

test('armor höchstens 0,6, abilityCooldown mindestens 0,35', () => {
  assert.equal(computeStats({ extra: [mods({ armor: { add: 2 } })] }).armor, 0.6);
  assert.equal(computeStats({ extra: [mods({ armor: { add: -1 } })] }).armor, 0);
  assert.equal(computeStats({ extra: [mods({ abilityCooldown: { mul: -0.9 } })] }).abilityCooldown, 0.35);
  near(computeStats({ extra: [mods({ abilityCooldown: { mul: -0.3 } })] }).abilityCooldown, 0.7);
});

test('negative boostHeat ist erlaubt (Boost kühlt), andere Stats werden nicht negativ', () => {
  const s = computeStats({ extra: [mods({ boostHeat: { mul: -1.5 } })] });
  near(s.boostHeat, BASE_STATS.boostHeat * -0.5);
  assert.ok(s.boostHeat < 0);
  assert.equal(computeStats({ extra: [mods({ boostHeat: { mul: -10 } })] }).boostHeat, SOFTCAPS.boostHeat.min);
  // driveAccel: Faktor (1 + Σmul) wird bei 0 abgeschnitten
  assert.equal(computeStats({ extra: [mods({ driveAccel: { mul: -2 } })] }).driveAccel, 0);
  // xmul 0 schaltet ab (Fahrradpedale: kein Sprit)
  assert.equal(computeStats({ extra: [mods({ driveFuel: { xmul: 0 } })] }).driveFuel, 0);
});

test('perfectLandDeg nie größer als landTolDeg', () => {
  const s = computeStats({ extra: [mods({ landTolDeg: { add: -15 }, perfectLandDeg: { add: 8 } })] });
  assert.ok(s.perfectLandDeg <= s.landTolDeg);
});

test('Slot-Stufen: doppelte Wirkung, abnehmender Ertrag 2 × L / (1 + L / dimDivisor), Stufe 10 = 12', () => {
  near(partDimLevels(0), 0);
  near(partDimLevels(10), GARAGE.levelEffectMul * 10 / (1 + 10 / GARAGE.dimDivisor));
  near(partDimLevels(10), 12, 1e-9);
  assert.equal(partDimLevels(99), partDimLevels(GARAGE.maxPartLevel), 'über Höchststufe wird gekappt');
  const wheels = partById('wheels_bobbycar');
  const s0 = computeStats({ parts: { wheels: { id: wheels.id, level: 0 } } });
  const s10 = computeStats({ parts: { wheels: { id: wheels.id, level: 10 } } });
  near(s10.landTolDeg - s0.landTolDeg, wheels.perLevel.landTolDeg.add * 12, 1e-9);
});

test('Item-Stufen (★) skalieren add/mul, nicht xmul', () => {
  const item = { id: 'x', stats: { coolRate: { mul: 0.1 }, mass: { xmul: 1.3 } } };
  const s3 = computeStats({ items: [{ item, tier: 3 }] });
  near(s3.coolRate, BASE_STATS.coolRate * (1 + 0.1 * ITEMS.tierMult[2]));
  near(s3.mass, BASE_STATS.mass * 1.3);
});

test('Chassis-Slots: Badewanne hat einen Item-Platz weniger', () => {
  assert.equal(computeStats({ chassis: chassisById('badewanne') }).itemSlots, BASE_STATS.itemSlots - 1);
  assert.equal(computeStats({ chassis: chassisById('seifenkiste') }).itemSlots, BASE_STATS.itemSlots);
});

test('Regeln und Quellen werden gesammelt', () => {
  const r = collectRules({ chassis: chassisById('kuehlschrank'), parts: { gadget: 'gadget_hupe' } });
  assert.equal(r.noOverheat, true);
  assert.deepEqual(r.tagBoost, { eis: 0.5 });
  const r2 = collectRules({ chassis: chassisById('sofa') });
  assert.equal(r2.healOnCleanLanding, 3);
  const src = collectSources({ chassis: chassisById('rasenmaeher'), parts: { gadget: { id: 'gadget_hupe', level: 3 }, wheels: 'wheels_bobbycar' } });
  assert.deepEqual(src.map((s) => [s.id, s.kind, s.tier]), [['rasenmaeher', 'chassis', 1], ['gadget_hupe', 'part', 1]]);
  assert.ok(src.every((s) => Array.isArray(s.triggers) && s.triggers.length > 0));
});

test('applyMods ignoriert unbekannte Stats, statDiff findet Änderungen', () => {
  const acc = emptyAcc();
  applyMods(acc, { gibtsNicht: { add: 5 }, magnet: { add: 1 } });
  const s = finalize(acc);
  near(s.magnet, BASE_STATS.magnet + 1);
  const d = statDiff(baseStats(), s);
  assert.deepEqual(d.map((x) => x.stat), ['magnet']);
});
