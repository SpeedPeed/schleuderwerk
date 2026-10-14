// Spielgefühl-Ziele der Balance (data/balance.js, PHASEN.md Phase 2 „Nachjustiert“):
// schwere Kisten fahren, Boost ist je Liter nicht schlechter als der Bodenantrieb, Dauer-Boost überhitzt,
// ein sauberer Abschuss kostet wenig Haltbarkeit, eine Testfahrt dauert ca. 20–30 s.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYSICS as P, RESOURCES as R, RULES } from '../www/src/data/balance.js';
import { Vehicle } from '../www/src/physics/vehicle.js';
import { WORLDS } from '../www/src/data/worlds.js';
import { CHASSIS } from '../www/src/data/index.js';
import { baseStats } from '../www/src/items/statMods.js';
import { makeStage, mockInput, fnTrack, flat } from './helpers.mjs';

const DEG = Math.PI / 180;
const G = 9.81;

test('jedes Chassis mit Startteilen fährt am Boden eine 3°-Steigung hinauf (beide Welten)', () => {
  const slope = Math.tan(3 * DEG);
  const hill = fnTrack((x) => x * slope);
  for (const w of WORLDS) for (const c of CHASSIS) {
    const t = makeStage({ chassis: c.id, world: w });
    const st = t.stage.stats;   // inkl. Welt-Rollreibung
    const v = new Vehicle(st, w.gravity, t.stage.rules);
    v.reset(0, P.rideHeight, 3 * DEG);
    v.onGround = true;
    v.s = 0;
    const ev = [];
    for (let i = 0; i < 2 / P.dt; i++) v.step(P.dt, { tilt: 0, boost: false }, hill, ev);
    assert.ok(v.s > 0.5, `${c.id} in ${w.id}: ${v.s.toFixed(2)} m/s nach 2 s (Antrieb ${v.driveAccelNet().toFixed(2)} m/s²)`);
  }
});

test('Boost: Tempo je Liter mindestens so gut wie der Bodenantrieb (jedes Chassis, Startteile)', () => {
  for (const c of CHASSIS) {
    const t = makeStage({ chassis: c.id });
    const st = t.stage.stats;
    const v = t.stage.vehicle;
    const boostPerL = st.boostThrust / st.mass / st.boostFuel;
    const drivePerL = v.driveAccelNet() / st.driveFuel;
    assert.ok(boostPerL >= drivePerL, `${c.id}: Boost ${boostPerL.toFixed(3)} < Antrieb ${drivePerL.toFixed(3)} m/s je Liter`);
  }
});

test('Dauer-Boost aus kalt überhitzt, bevor der Tank leer ist (Startteile; nicht Kühlschrank/Waschmaschine)', () => {
  for (const c of CHASSIS) {
    const t = makeStage({ chassis: c.id });
    if (t.stage.rules.noOverheat || t.stage.rules.heatIsResource) continue;
    const v = new Vehicle(t.stage.stats, G, t.stage.rules);
    v.reset(0, 1e5, 0);
    v.launch(20, 0);
    const ev = [];
    let overheat = false;
    while (v.fuel > 0 && !overheat) {
      v.step(P.dt, { tilt: 0, boost: true }, flat(0), ev);
      overheat = ev.some((e) => e.type === 'overheat');
    }
    assert.ok(overheat, `${c.id}: Tank leer (${v.fuel.toFixed(1)}) ohne Überhitzung, Hitze ${v.heat.toFixed(0)}`);
  }
});

// Landung aus der Höhe mit gegebenem Sinktempo (Grundwerte, ohne Panzerung)
function landingDamage(vy, angle) {
  const st = { ...baseStats(), drag: 0, lift: 0, armor: 0 };
  const v = new Vehicle(st, G);
  v.reset(0, P.rideHeight + 5, angle);
  v.vx = 0; v.vy = vy;
  const ev = [];
  for (let i = 0; i < 400 && !v.onGround; i++) { v.step(P.dt, { tilt: 0, boost: false }, flat(0), ev); v.angle = angle; v.w = 0; }
  const l = ev.find((e) => e.type === 'landing');
  return { quality: l.quality, frac: v.damageTaken / st.durabilityMax };
}

test('Schaden: sauberer Abschuss mit Landung ≤ 5 %, Bruchlandung 10–20 % der Haltbarkeit', () => {
  // Normaltempo einer Landung nach vollem Abschuss: ≈ 14 m/s bei 32°, ≈ 17 m/s bei 45° (perfekt)
  for (const impact of [14, 17]) {
    const r = landingDamage(-Math.sqrt(impact * impact - 2 * G * 5), 0);
    assert.equal(r.quality, 'perfect');
    assert.ok(r.frac <= 0.05, `sauber bei ${impact} m/s: ${(r.frac * 100).toFixed(1)} %`);
  }
  for (const impact of [14, 22]) {
    const r = landingDamage(-Math.sqrt(impact * impact - 2 * G * 5), Math.PI);
    assert.equal(r.quality, 'crash');
    assert.ok(r.frac >= 0.1 && r.frac <= 0.2, `Bruch bei ${impact} m/s: ${(r.frac * 100).toFixed(1)} %`);
  }
  assert.ok(R.obstacleDamage / 100 <= 0.1, 'Hindernis höchstens 10 %');
});

test('echte Testfahrt (Abschuss, Landung, Antrieb, Ausrollen): ca. 20–30 s, sauberer Abschuss ≤ 5 % Schaden', () => {
  for (const w of WORLDS) for (const chassis of ['seifenkiste', 'kuehlschrank', 'raketenschlitten']) {
    const t = makeStage({ chassis, world: w, seed: 3 });
    const s = t.stage;
    const input = mockInput();
    s.launchNow(1, 32, false);
    let firstLandingDmg = null;
    while (!t.result && s.time < 120) {
      // Spieler richtet die Nase zum Landen am Boden aus
      const v = s.vehicle;
      if (!v.onGround) {
        const d = Math.atan(s.track.slopeAt(v.x + v.vx * 0.25)) - v.angle;
        const u = d * 3 - v.w * 0.45;
        input.st.tilt = u > 0.15 ? 1 : u < -0.15 ? -1 : 0;
      } else input.st.tilt = 0;
      s.update(1 / 60, input);
      if (firstLandingDmg === null && t.events.some((e) => e.name === 'landing')) firstLandingDmg = v.damageTaken / s.stats.durabilityMax;
    }
    assert.ok(t.result, `${chassis}/${w.id}: Etappe endet`);
    assert.ok(t.result.time >= 15 && t.result.time <= 35, `${chassis}/${w.id}: ${t.result.time.toFixed(1)} s`);
    assert.ok(firstLandingDmg <= 0.05, `${chassis}/${w.id}: erste Landung ${(firstLandingDmg * 100).toFixed(1)} %`);
  }
});

test('Raketenschlitten (lowGrip) bleibt beim Antrieb unter dem normalen Chassis', () => {
  const a = makeStage({ chassis: 'seifenkiste' }).stage.vehicle;
  const b = makeStage({ chassis: 'raketenschlitten' }).stage.vehicle;
  assert.ok(b.driveAccelNet() < a.driveAccelNet());
  assert.ok(RULES.lowGrip.driveMul < 1);
});
