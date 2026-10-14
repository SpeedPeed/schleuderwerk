// Ressourcen-Physik: Antrieb & Treibstoff, Hitze & Überhitzung (inkl. Regeln noOverheat/heatIsResource/lowGrip),
// Aufprallschaden mit Panzerung, Fähigkeiten (Kosten, Abklingzeit, Boost nur mit Treibstoff).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYSICS as P, RESOURCES as R, BASE_STATS, RULES } from '../www/src/data/balance.js';
import { Vehicle } from '../www/src/physics/vehicle.js';
import { baseStats } from '../www/src/items/statMods.js';
import { flat, mockInput, makeStage, airborne, run } from './helpers.mjs';

const G = 9.81;
const DT = P.dt;
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} ≉ ${b} (±${eps})`);

function vehicle(over = {}, rules = {}) {
  return new Vehicle({ ...baseStats(), ...over }, G, rules);
}
function onGround(v, s = 0) {
  v.reset(0, P.rideHeight, 0);
  v.onGround = true;
  v.s = s;
}
function steps(v, seconds, ctl = { tilt: 0, boost: false }, track = flat(0)) {
  const ev = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) v.step(DT, ctl, track, ev);
  return ev;
}

test('Antrieb schiebt am Boden automatisch und verbraucht Treibstoff (und Hitze)', () => {
  const v = vehicle();
  onGround(v);
  const ev = steps(v, 2);
  assert.ok(v.driving, 'Antrieb läuft');
  near(v.fuel, BASE_STATS.fuelMax - BASE_STATS.driveFuel * 2, 0.05, 'Treibstoff');
  assert.ok(v.s > 1, `fährt los (${v.s.toFixed(2)} m/s)`);
  assert.equal(v.heat, 0, 'Kühlung (15/s) schafft die Antriebshitze (5/s)');
  assert.ok(!ev.some((e) => e.type === 'fuelEmpty'));
  // Hitze steigt, wenn die Kühlung nicht reicht
  const hot = vehicle({ coolRate: 0 });
  onGround(hot);
  steps(hot, 1);
  near(hot.heat, BASE_STATS.driveHeat, 0.05, 'Antriebshitze');
});

test('leerer Tank: fuelEmpty genau einmal, dann rollt die Kiste aus', () => {
  const v = vehicle();
  onGround(v, 10);
  v.fuel = 0.05;
  const ev = steps(v, 0.5);
  assert.equal(ev.filter((e) => e.type === 'fuelEmpty').length, 1);
  assert.equal(v.fuel, 0);
  assert.ok(!v.driving);
  const s0 = v.s;
  steps(v, 1);
  assert.ok(v.s < s0, 'rollt aus');
  // Fahrradpedale (driveFuel 0) fahren auch ohne Sprit
  const p = vehicle({ driveFuel: 0 });
  onGround(p);
  p.fuel = 0;
  steps(p, 0.5);
  assert.ok(p.driving && p.s > 0);
});

test('lowGrip (Raketenschlitten): Antrieb und Rollreibung am Boden halbiert', () => {
  const a = vehicle(), b = vehicle({}, { lowGrip: true });
  onGround(a); onGround(b);
  steps(a, 1); steps(b, 1);
  const accA = (BASE_STATS.driveAccel - BASE_STATS.rollFriction) / baseStats().mass;
  const accB = (BASE_STATS.driveAccel * RULES.lowGrip.driveMul - BASE_STATS.rollFriction * RULES.lowGrip.frictionMul) / baseStats().mass;
  near(a.s, accA, 0.05, 'normal');
  near(b.s, accB, 0.05, 'Kufen');
  assert.ok(b.s < a.s);
  // ohne Antrieb rollt der Schlitten weiter
  const c = vehicle({ driveAccel: 0 }), d = vehicle({ driveAccel: 0 }, { lowGrip: true });
  onGround(c, 10); onGround(d, 10);
  steps(c, 1); steps(d, 1);
  assert.ok(d.s > c.s);
});

test('Überhitzung → overheat, Stillstand (kein Boost/Antrieb), Schaden, Hitze fällt auf 50', () => {
  const v = vehicle();
  v.reset(0, 1e4, 0);
  v.launch(20, 0);
  v.heat = BASE_STATS.heatMax - 0.1;
  const ev = steps(v, 0.1, { tilt: 0, boost: true });
  assert.equal(ev.filter((e) => e.type === 'overheat').length, 1);
  assert.equal(v.heat < R.overheatResetHeat + 5, true, `Hitze ${v.heat}`);
  assert.ok(v.stall > R.overheatStall - 0.2);
  near(v.durability, BASE_STATS.durabilityMax - R.overheatDamage, 1e-9, 'Überhitzungsschaden (ohne Panzerung)');
  const dmg = ev.find((e) => e.type === 'damage');
  assert.equal(dmg.source, 'overheat');
  // während des Stillstands kein Boost
  steps(v, 0.5, { tilt: 0, boost: true });
  assert.equal(v.boosting, false);
  // am Boden kein Antrieb
  const g = vehicle();
  onGround(g, 5);
  g.stall = 1;
  steps(g, 0.2);
  assert.equal(g.driving, false);
  // nach Ablauf wieder Boost
  steps(v, R.overheatStall, { tilt: 0, boost: true });
  assert.equal(v.boosting, true);
});

test('noOverheat (Kühlschrank): Hitze wird gedeckelt, kein Ereignis, kein Stillstand, kein Schaden', () => {
  const v = vehicle({}, { noOverheat: true });
  v.reset(0, 1e4, 0);
  v.launch(20, 0);
  v.heat = 95;
  const ev = steps(v, 3, { tilt: 0, boost: true });
  assert.equal(v.heat, BASE_STATS.heatMax);
  assert.ok(!ev.some((e) => e.type === 'overheat' || e.type === 'damage'));
  assert.equal(v.stall, 0);
  assert.equal(v.boosting, true);
  assert.equal(v.durability, BASE_STATS.durabilityMax);
});

test('heatIsResource (Waschmaschine): overheat einmal, Hitze bleibt am Maximum, kein Stillstand/Schaden', () => {
  const v = vehicle({}, { heatIsResource: true });
  v.reset(0, 1e4, 0);
  v.launch(20, 0);
  v.heat = 95;
  let ev = steps(v, 3, { tilt: 0, boost: true });
  assert.equal(ev.filter((e) => e.type === 'overheat').length, 1);
  assert.equal(v.heat, BASE_STATS.heatMax);
  assert.equal(v.stall, 0);
  assert.equal(v.durability, BASE_STATS.durabilityMax);
  // erst nach Abkühlen unter 80 % wieder scharf
  v.heat = BASE_STATS.heatMax * R.heatResourceRearm - 1;
  steps(v, 0.05);
  v.heat = 99.9;
  ev = steps(v, 0.5, { tilt: 0, boost: true });
  assert.equal(ev.filter((e) => e.type === 'overheat').length, 1);
});

test('heatGain multipliziert Zunahmen, negative boostHeat kühlt', () => {
  const a = vehicle({ coolRate: 0, heatGain: 2 });
  a.reset(0, 1e4, 0); a.launch(20, 0);
  steps(a, 1, { tilt: 0, boost: true });
  near(a.heat, BASE_STATS.boostHeat * 2, 0.5);
  const b = vehicle({ coolRate: 0, boostHeat: -20 });
  b.reset(0, 1e4, 0); b.launch(20, 0);
  b.heat = 50;
  steps(b, 1, { tilt: 0, boost: true });
  near(b.heat, 30, 0.5);
});

// Landung aus der Höhe mit gegebenem Sinktempo, Nase waagrecht (perfekte Landung)
function dropLanding(over = {}, vy = -20, angle = 0, setup = null, h = 5) {
  const v = vehicle({ drag: 0, lift: 0, ...over });
  v.reset(0, P.rideHeight + h, angle);   // ≥ 0,15 s Flug, damit es eine echte Landung ist
  v.vx = 0; v.vy = vy;
  if (setup) setup(v);
  const ev = [];
  for (let i = 0; i < 200 && !v.onGround; i++) {
    v.step(DT, { tilt: 0, boost: false }, flat(0), ev);
    v.angle = angle; v.w = 0;
  }
  return { v, ev, landing: ev.find((e) => e.type === 'landing'), damage: ev.filter((e) => e.type === 'damage') };
}

test('Aufprallschaden: (Normaltempo − impactThreshold) × dmgPerMps, gemindert durch armor', () => {
  const plain = dropLanding({}, -20);
  assert.ok(plain.landing, 'landing-Ereignis');
  assert.equal(plain.landing.quality, 'perfect');
  const expect = (plain.landing.impact - BASE_STATS.impactThreshold) * R.dmgPerMps;
  assert.equal(plain.damage.length, 1);
  near(plain.damage[0].amount, expect, 1e-9);
  near(plain.v.durability, BASE_STATS.durabilityMax - expect, 1e-9);
  assert.ok(plain.ev.some((e) => e.type === 'groundTouch'));
  assert.ok(plain.ev.some((e) => e.type === 'perfectLanding'));

  const armored = dropLanding({ armor: 0.4 }, -20);
  near(armored.damage[0].amount, (armored.landing.impact - BASE_STATS.impactThreshold) * R.dmgPerMps * 0.6, 1e-9);
  // unter der Schwelle kein Schaden
  const soft = dropLanding({}, -4, 0, null, 2.5);
  assert.ok(soft.landing.impact < BASE_STATS.impactThreshold);
  assert.equal(soft.damage.length, 0);
  // Bruchlandung: Zuschlag
  const crash = dropLanding({}, -4, Math.PI, null, 2.5);
  assert.equal(crash.landing.quality, 'crash');
  near(crash.damage[0].amount, R.crashLandingDamage, 1e-9);
  // Schild: Abprall statt Schaden
  const sh = dropLanding({}, -20, 0, (v) => { v.shields = 1; });
  assert.equal(sh.damage.length, 0);
  assert.ok(sh.ev.some((e) => e.type === 'bounce'));
  assert.equal(sh.v.shields, 0);
});

test('Haltbarkeit 0 → Totalschaden beendet die Etappe', () => {
  const t = makeStage();
  const input = mockInput();
  airborne(t.stage);
  t.stage.vehicle.durability = 3;
  t.stage.vehicle.damage(10, 'test');
  run(t.stage, input, 2);
  assert.ok(t.result, 'Etappe vorbei');
  assert.equal(t.result.reason, 'wreck');
  assert.equal(t.result.durability, 0);
});

test('Tipp-Fähigkeit: Kosten je Einsatz, Abklingzeit × abilityCooldown, abilityUse-Ereignis', () => {
  const t = makeStage({ abilities: ['boost', 'sprung'] });
  const input = mockInput();
  airborne(t.stage);
  const v = t.stage.vehicle;
  const bar = t.stage.abilities;
  assert.equal(bar.slots[1].def.id, 'sprung');
  const fuel0 = v.fuel;
  const vy0 = v.vy;
  input.press(1);
  run(t.stage, input, 1 / 60);
  assert.equal(bar.slots[1].uses, 1);
  near(v.fuel, fuel0 - bar.slots[1].def.fuel, 1e-6, 'Treibstoff je Einsatz');
  assert.ok(v.vy > vy0 + 5, 'Sprung');
  assert.ok(t.events.some((e) => e.name === 'abilityUse' && e.data.ability === 'sprung'));
  const cd = bar.slots[1].def.cooldown * t.stage.stats.abilityCooldown;
  near(bar.slots[1].cd, cd - 1 / 60, 0.02, 'Abklingzeit');
  // während der Abklingzeit passiert nichts
  input.press(1);
  run(t.stage, input, 1 / 60);
  assert.equal(bar.slots[1].uses, 1);
  run(t.stage, input, cd);
  input.press(1);
  run(t.stage, input, 1 / 60);
  assert.equal(bar.slots[1].uses, 2);
  // schnellere Abklingzeit über den Stat
  const t2 = makeStage({ abilities: ['boost', 'sprung'] });
  t2.stage.mods.addBuff('abilityCooldown', { mul: -0.5 }, 100);
  t2.stage.recomputeStats();
  airborne(t2.stage);
  input.press(1);
  run(t2.stage, input, 1 / 60);
  near(t2.stage.abilities.slots[1].cd, bar.slots[1].def.cooldown * 0.5 - 1 / 60, 0.02);
});

test('Boost-Fähigkeit nur mit Treibstoff; kostet boostFuel/s; boost- und boostSecond-Ereignisse', () => {
  const t = makeStage({ abilities: ['boost', 'sprung'] });
  const input = mockInput();
  airborne(t.stage);
  const v = t.stage.vehicle;
  input.st.held[0] = true;
  run(t.stage, input, 1.5);
  assert.equal(v.boosting, true);
  near(v.fuel, BASE_STATS.fuelMax - t.stage.stats.boostFuel * 1.5, 0.6, 'Boost-Verbrauch');
  assert.equal(t.events.filter((e) => e.name === 'boost').length, 1);
  assert.equal(t.events.filter((e) => e.name === 'boostSecond').length, 1);
  assert.ok(t.events.some((e) => e.name === 'abilityUse' && e.data.ability === 'boost'));
  // leer → kein Boost, Knopf ausgegraut
  v.fuel = 0;
  run(t.stage, input, 0.2);
  assert.equal(v.boosting, false);
  assert.equal(t.stage.abilities.view(0, v).off, true);
  input.st.held[0] = false;
  run(t.stage, input, 0.1);
  v.fuel = 50;
  input.st.held[0] = true;
  run(t.stage, input, 0.1);
  assert.equal(v.boosting, true);
});

test('Spezialfähigkeit Schleudergang: Hitze → Schub, Hitze 0, ab 70 Explosion', () => {
  const t = makeStage({ chassis: 'waschmaschine' });
  const input = mockInput();
  airborne(t.stage, 400, 10, 0);
  const bar = t.stage.abilities;
  const i = bar.slots.findIndex((s) => s.def.id === 'schleudergang');
  assert.equal(i, 2, 'zusätzlicher dritter Knopf');
  const v = t.stage.vehicle;
  v.heat = 80;
  const sp0 = Math.hypot(v.vx, v.vy);
  input.press(i);
  run(t.stage, input, 1 / 60);
  assert.ok(Math.hypot(v.vx, v.vy) > sp0 + 6, 'Schub ≈ 8 m/s');
  assert.ok(v.heat < 1);
  assert.ok(t.events.some((e) => e.name === 'explosion'));
});

test('Fallschirm begrenzt das Sinktempo, Notbremse stoppt am Boden', () => {
  const t = makeStage({ abilities: ['fallschirm', 'notbremse'] });
  const input = mockInput();
  airborne(t.stage, 600, 5, -25);
  input.press(0);
  run(t.stage, input, 1.5);
  const v = t.stage.vehicle;
  assert.ok(v.parachute > 0);
  assert.ok(v.vy > -t.stage.abilities.slots[0].def.rules.parachute.maxSink - 0.5, `Sinktempo ${v.vy}`);
  // erneut tippen = kappen
  input.press(0);
  run(t.stage, input, 1 / 60);
  assert.equal(v.parachute, 0);

  const g = makeStage({ abilities: ['notbremse', 'boost'] });
  g.stage.launchNow(0.5, 30);
  const w = g.stage.vehicle;
  w.onGround = true; w.y = g.stage.track.heightAt(w.x) + P.rideHeight; w.s = 20;
  input.press(0);
  run(g.stage, input, RULES.hardStop.time + 0.05);
  assert.ok(Math.abs(w.s) < 0.5, `gebremst auf ${w.s}`);
  assert.ok(!w.driving, 'Antrieb pausiert');
});
