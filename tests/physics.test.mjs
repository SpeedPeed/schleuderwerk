// Physik-Tests: kein Durchtunneln, exakte Landung, weiche/harte Tempo-Grenze, Salto per Halten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYSICS as P, BASE_STATS as B } from '../www/src/data/balance.js';
import { Vehicle, thrustFactor, substepsFor, countFlips } from '../www/src/physics/vehicle.js';
import { Objects, segmentBox, segmentDist2 } from '../www/src/physics/objects.js';
import { Track } from '../www/src/physics/track.js';
import { WORLDS } from '../www/src/data/worlds.js';
import { baseStats } from '../www/src/items/statMods.js';
import { Stage } from '../www/src/stage/stage.js';
import { TAU, DEG } from '../www/src/core/math.js';

const G = 9.81;
const DT = P.dt;

// Strecke aus einer Funktion (stückweise linear, Punkte alle 2 m wie die echte Strecke)
function fnTrack(f, step = 2) {
  const at = (x) => {
    const i = Math.floor(x / step);
    const t = x / step - i;
    return f(i * step) * (1 - t) + f((i + 1) * step) * t;
  };
  return {
    heightAt: at,
    slopeAt: (x) => { const i = Math.floor(x / step); return (f((i + 1) * step) - f(i * step)) / step; },
    rampBetween: () => false,
  };
}
const flat = (h = 0) => fnTrack(() => h);

function makeVehicle(over = {}) {
  const s = { ...baseStats(), ...over };
  return new Vehicle(s, G);
}

// Balance-Werte für einen Test vorübergehend ändern (wie später im Dev-Menü)
function withPhysics(over, fn) {
  const old = {};
  for (const k of Object.keys(over)) { old[k] = P[k]; P[k] = over[k]; }
  try { return fn(); } finally { Object.assign(P, old); }
}

function emptyObjects(track) {
  return new Objects({ thermals: null, spawn: { weights: {}, gap: [10, 20], obstacles: {} } }, track, 1);
}

test('adaptive Teilschritte: höchstens maxStepDist pro Teilschritt, höchstens maxSubsteps', () => {
  assert.equal(substepsFor(0, DT), 1);
  assert.equal(substepsFor(30, DT), 1);
  assert.equal(substepsFor(150, DT), Math.ceil((150 * DT) / P.maxStepDist));
  assert.ok((150 * DT) / substepsFor(150, DT) <= P.maxStepDist + 1e-12);
  assert.equal(substepsFor(1e6, DT), P.maxSubsteps);
});

test('swept: Strecke gegen Box und Kreis', () => {
  // 20 m lange Strecke durch eine 2 m breite Box: Punktprüfung an den Enden fände nichts
  assert.ok(segmentBox(0, 5, 20, 5, 9, 0, 11, 10) >= 0);
  assert.equal(segmentBox(0, 15, 20, 15, 9, 0, 11, 10), -1);
  const t = segmentBox(0, 5, 20, 5, 9, 0, 11, 10);
  assert.ok(Math.abs(t - 0.45) < 1e-12, 'Eintrittspunkt bei x = 9');
  assert.ok(segmentDist2(0, 0, 10, 0, 5, 1) < 1.01);
  assert.ok(segmentDist2(0, 0, 10, 0, 15, 0) > 24);
});

test('(1) 150 m/s waagrecht: 2 m breites Hindernis wird getroffen (kein Durchtunneln)', () => {
  withPhysics({ hardSpeedCap: 200 }, () => {
    const track = flat(0);
    const objs = emptyObjects(track);
    objs.obstacles.push({ x: 60, y0: 45, w: 2, h: 10, type: 'tires', alive: true, passed: false });
    const v = makeVehicle({ drag: 0, lift: 0 });
    v.reset(0, 50, 0);
    v.launch(150, 0);
    const ev = [];
    let hit = null;
    let maxStep = 0;
    for (let i = 0; i < 120 && !hit; i++) {
      const x0 = v.x;
      v.step(DT, { tilt: 0, boost: false }, track, ev, undefined, objs);
      maxStep = Math.max(maxStep, (v.x - x0) / v.substeps);
      hit = ev.find((e) => e.type === 'hit');
    }
    assert.ok(hit, 'Hindernis muss getroffen werden');
    assert.ok(Math.abs(v.speed - 150) < 2, `Tempo war wirklich ~150 m/s (${v.speed})`);
    assert.ok(maxStep <= P.maxStepDist + 1e-9, `Teilschritt ${maxStep} m`);
  });

  // Auch ein einzelner riesiger Schritt (20 m) trifft dank Strecken-Prüfung
  const track = flat(0);
  const objs = emptyObjects(track);
  objs.obstacles.push({ x: 10, y0: 0, w: 2, h: 10, type: 'tires', alive: true, passed: false });
  const v = makeVehicle();
  v.reset(20, 5, 0);
  const ev = [];
  objs.collide(v, 0, 5, DT, ev);
  assert.ok(ev.some((e) => e.type === 'hit'));
});

test('swept: Schrauben und Ringe werden auch bei 150 m/s eingesammelt', () => {
  withPhysics({ hardSpeedCap: 200 }, () => {
    const track = flat(0);
    const objs = emptyObjects(track);
    for (let i = 0; i < 20; i++) objs.bolt(30 + i * 2.2, 50);
    objs.rings.push({ x: 90, y: 50, passed: false });
    const v = makeVehicle({ drag: 0, lift: 0, magnet: 0 });
    v.reset(0, 50, 0);
    v.launch(150, 0);
    const ev = [];
    const got = [];
    for (let i = 0; i < 100; i++) {
      v.step(DT, { tilt: 0, boost: false }, track, ev, undefined, objs);
      got.push(...ev);
      ev.length = 0;
      v.vy = 0; v.y = 50; // genau waagrecht halten
    }
    assert.equal(got.filter((e) => e.type === 'bolt').length, 20);
    assert.equal(got.filter((e) => e.type === 'ring').length, 1);
  });
});

test('(2) Sturzflug mit 150 m/s auf steilen Hang: Landung genau auf der Bodenlinie, nie darunter', () => {
  withPhysics({ hardSpeedCap: 200 }, () => {
    // steiler Hang (ca. 56°) mit Knicken
    const track = fnTrack((x) => (x < 0 ? 0 : x < 60 ? x * 1.5 : 90 + (x - 60) * 0.3));
    const groundLine = (x) => track.heightAt(x) + P.rideHeight;
    for (const dirDeg of [-60, -75, -45, -88]) {
      const v = makeVehicle({ drag: 0, lift: 0 });
      v.reset(-40, 260, dirDeg * DEG);
      v.launch(150, dirDeg * DEG);
      const ev = [];
      let landing = null;
      let minClear = Infinity;
      // Spion als „collider“: prüft nach JEDEM Teilschritt
      const spy = {
        collide(car, x0) {
          const clear = car.y - groundLine(car.x);
          if (clear < minClear) minClear = clear;
          if (!landing && car.onGround) {
            assert.ok(car.x >= Math.min(x0, car.x) - 1e-9, 'Landepunkt liegt auf der zurückgelegten Strecke');
          }
        },
      };
      for (let i = 0; i < 600 && !landing; i++) {
        const x0 = v.x, y0 = v.y;
        v.step(DT, { tilt: 0, boost: false }, track, ev, undefined, spy);
        landing = ev.find((e) => e.type === 'landing');
        if (landing) {
          // Landepunkt liegt zwischen alter und neuer Position und exakt auf der Bodenlinie
          assert.ok(Math.abs(landing.y - groundLine(landing.x)) < 1e-9, `Landung ${landing.y} vs ${groundLine(landing.x)}`);
          assert.ok(landing.x >= Math.min(x0, v.x) - 1e-9 && landing.x <= Math.max(x0, v.x) + 1e-9);
          assert.ok(y0 > groundLine(x0), 'vorher in der Luft');
          assert.ok(landing.impact > 50, `harter Aufprall gemessen (${landing.impact})`);
        }
      }
      assert.ok(landing, `Landung bei ${dirDeg}°`);
      assert.ok(minClear >= -1e-9, `nie unter der Bodenlinie (min ${minClear})`);
      // weiterfahren: bleibt auf der Linie
      for (let i = 0; i < 120; i++) {
        v.step(DT, { tilt: 0, boost: false }, track, ev, undefined, spy);
        assert.ok(v.y - groundLine(v.x) >= -1e-9);
      }
    }
  });
});

test('weiche Tempo-Grenze: Schubfaktor 1 → 0,5 bei speedSoftCap → klein', () => {
  assert.equal(thrustFactor(0), 1);
  assert.ok(Math.abs(thrustFactor(P.speedSoftCap) - 0.5) < 1e-12);
  assert.ok(thrustFactor(2 * P.speedSoftCap) < 0.06);
  // Ring-Tempo wird ebenfalls gedämpft
  const v = makeVehicle();
  v.reset(0, 100, 0);
  v.launch(80, 0);
  v.addSpeed(6);
  assert.ok(v.speed < 80 + 6 * 0.3, `Ring-Schub bei 80 m/s gedämpft (${v.speed})`);
});

test('(3) 60 s Dauerboost: Tempo ≤ hardSpeedCap und nahe speedSoftCap', () => {
  const run = (over, airborne) => {
    // unendlich Treibstoff, keine Überhitzung – hier geht es nur um die Tempo-Grenzen
    const v = makeVehicle({ fuelMax: 1e9, heatMax: 1e9, ...over });
    const track = flat(airborne ? -1e7 : 0);
    if (airborne) { v.reset(0, 1e5, 0); v.launch(20, 0); } else { v.reset(0, P.rideHeight, 0); v.onGround = true; }
    const ev = [];
    let maxSpeed = 0;
    for (let i = 0; i < 60 / DT; i++) {
      v.step(DT, { tilt: 0, boost: true }, track, ev);
      if (airborne) { v.angle = Math.atan2(v.vy, v.vx); v.w = 0; } // Nase in Flugrichtung halten
      maxSpeed = Math.max(maxSpeed, v.speed);
    }
    return { end: v.speed, max: maxSpeed };
  };
  const cap = P.speedSoftCap;
  // Grundwerte am Boden: nähert sich der weichen Grenze, nicht weit darüber
  const base = run({}, false);
  assert.ok(base.max <= P.hardSpeedCap);
  assert.ok(base.end > cap * 0.8 && base.end < cap * 1.3, `Boden, Grundwerte: ${base.end.toFixed(1)} m/s`);
  // Boost-Schub verdoppelt und Luftwiderstand −45 %
  const tuned = run({ boostThrust: B.boostThrust * 2, drag: B.drag * 0.55 }, false);
  assert.ok(tuned.end > cap && tuned.end < cap * 1.45, `Boden, ausgebaut: ${tuned.end.toFixed(1)} m/s`);
  // absurd viel Schub: weiche Grenze bremst, harte Grenze hält
  const crazy = run({ boostThrust: B.boostThrust * 20, drag: B.drag * 0.2 }, false);
  assert.ok(crazy.max <= P.hardSpeedCap + 1e-9, `hart begrenzt: ${crazy.max}`);
  // Sturzflug mit Boost in der Luft: harte Grenze
  const dive = run({ boostThrust: B.boostThrust * 20, drag: B.drag * 0.2 }, true);
  assert.ok(dive.max <= P.hardSpeedCap + 1e-9, `Luft, hart begrenzt: ${dive.max}`);
});

test('(4) Neigen per Halten: ein Salto dauert 0,7–1,5 s', () => {
  for (const tilt of [1, -1]) {
    const v = makeVehicle();
    v.reset(0, 1e4, 0);
    v.launch(25, 0.3);
    const track = flat(0);
    const ev = [];
    let t = 0;
    while (Math.abs(v.rotAccum) < TAU && t < 5) {
      v.step(DT, { tilt, boost: false }, track, ev);
      t += DT;
    }
    assert.ok(t >= 0.7 && t <= 1.5, `Salto (tilt ${tilt}) in ${t.toFixed(2)} s`);
    assert.equal(Math.sign(v.rotAccum), tilt, 'links halten = Nase hoch (gegen den Uhrzeigersinn)');
    assert.ok(Math.abs(v.w) <= B.maxSpin + 1e-9);
    assert.equal(countFlips(v.rotAccum), 1);
  }
  // ohne Eingabe läuft die Drehung aus
  const v = makeVehicle();
  v.reset(0, 1e4, 0);
  v.launch(25, 0);
  v.w = B.maxSpin;
  for (let i = 0; i < 2 / DT; i++) v.step(DT, { tilt: 0, boost: false }, flat(0), []);
  assert.ok(Math.abs(v.w) < P.autoLevelMaxSpin, `ausgelaufen: ${v.w}`);
});

test('Landung wird klassifiziert (perfekt / sauber / Bruch)', () => {
  const track = flat(0);
  const kinds = [];
  for (const ang of [0, 15 * DEG, 120 * DEG]) {
    const v = makeVehicle({ drag: 0, lift: 0 });
    v.reset(0, 5, ang);
    v.vx = 10; v.vy = -5;
    const ev = [];
    let landing = null;
    for (let i = 0; i < 300 && !landing; i++) {
      v.step(DT, { tilt: 0, boost: false }, track, ev);
      v.angle = ang; v.w = 0;
      landing = ev.find((e) => e.type === 'landing');
    }
    kinds.push(landing.quality);
  }
  assert.deepEqual(kinds, ['perfect', 'clean', 'crash']);
});

test('Etappe: Abschuss per Halten/Loslassen, Flug endet sicher', () => {
  const world = WORLDS[0];
  const track = new Track(world);
  let result = null;
  const st = new Stage({ world, track, stats: baseStats(), seed: 7, hooks: { end: (r) => { result = r; } } });
  let hold = false, drag = 0;
  const input = { get hold() { return hold; }, tilt: 0, boost: false, aimKey: 0, takeAimDrag() { const d = drag; drag = 0; return d; } };
  st.update(1 / 60, input); // einmal loslassen = scharf
  hold = true;
  drag = 0.1; // hoch ziehen → steiler
  st.update(1 / 60, input);
  assert.ok(st.launch.angle > 32 * DEG, 'Winkel wurde steiler');
  // halten, bis die Kraft in der grünen Zone ist
  let n = 0;
  while (!st.launch.inSweetSpot && n++ < 1000) st.update(1 / 240, input);
  hold = false;
  st.update(1 / 60, input);
  assert.equal(st.phase, 'fly');
  assert.ok(st.perfectLaunch, 'perfekter Abschuss im Sweet Spot');
  input.tilt = 1;
  for (let i = 0; i < 60 * 30 && !result; i++) {
    if (i === 60) input.tilt = 0;
    input.boost = i > 120 && i < 240;
    st.update(1 / 60, input);
  }
  for (let i = 0; i < 60 * 240 && !result; i++) st.update(1 / 60, input);
  assert.ok(result, 'Etappe endet');
  assert.ok(result.dist > 20, `Distanz ${result.dist}`);
});
