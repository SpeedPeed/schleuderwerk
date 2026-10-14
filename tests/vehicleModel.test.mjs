// Fahrzeug-Modelle (render/vehicleModel.js, mit echtem three.js): Jedes Teil sitzt auf jedem Chassis fest
// (kein Schweben), steckt nicht im Boden, und Teile verschiedener Slots durchdringen sich kaum.
// Geprüft wird mit den Bounding-Boxen der Grundformen (tests/support/modelsSpy.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./support/hooks.mjs', import.meta.url);
const { buildVehicle, wheelSpec } = await import('../www/src/render/vehicleModel.js');
const { CHASSIS, SLOTS, partsForSlot } = await import('../www/src/data/index.js');
const { PHYSICS, RENDER } = await import('../www/src/data/balance.js');

const GROUND = -PHYSICS.rideHeight / RENDER.vehicleScale;
const TOL = 0.03;            // so nah müssen sich zwei Grundformen kommen, um als verbunden zu gelten
const MAX_OVERLAP = 0.02;    // höchstes AABB-Schnittvolumen zweier Teile verschiedener Slots (Modell-Einheiten³)
const WHEEL_IDS = partsForSlot('wheels').map((p) => p.id);   // Radgröße verschiebt alle Anker (b, axle)

const near = (a, b, t) => a.min[0] <= b.max[0] + t && b.min[0] <= a.max[0] + t && a.min[1] <= b.max[1] + t
  && b.min[1] <= a.max[1] + t && a.min[2] <= b.max[2] + t && b.min[2] <= a.max[2] + t;
const ivol = (a, b) => {
  let v = 1;
  for (let i = 0; i < 3; i++) {
    const d = Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]);
    if (d <= 0) return 0;
    v *= d;
  }
  return v;
};

// Grundformen eines Baus: Aufbau (body) in Reihenfolge, Propeller/Turbinen an ihre Position verschoben
function capture(chassisId, parts) {
  const start = globalThis.__prims.length;
  const g = buildVehicle({ chassisId, parts });
  const prims = globalThis.__prims.slice(start);
  const bodyMerge = prims[0].merge;
  const body = prims.filter((p) => p.merge === bodyMerge);
  const spin = [];
  for (const s of g.userData.spinners) {
    const p = s.mesh.position;
    const own = prims.filter((q) => q.merge !== bodyMerge && q.merge < bodyMerge);
    for (const q of own) spin.push({ min: [q.min[0] + p.x, q.min[1] + p.y, q.min[2] + p.z], max: [q.max[0] + p.x, q.max[1] + p.y, q.max[2] + p.z] });
  }
  const spec = wheelSpec(parts.wheels);
  const wheels = g.userData.wheels.map((w) => {
    const hz = spec.kind === 'ball' ? spec.r : spec.w / 2 + 0.05;
    const { x, y, z } = w.position;
    return { min: [x - spec.r, y - spec.r, z - hz], max: [x + spec.r, y + spec.r, z + hz] };
  });
  g.userData.dispose();
  return { body, spin, wheels, userData: g.userData };
}

const results = [];
for (const c of CHASSIS) for (const wheels of WHEEL_IDS) {
  const base = capture(c.id, { wheels });
  const anchor = [...base.body, ...base.wheels];
  const parts = {};
  for (const slot of SLOTS) {
    if (slot === 'wheels') continue;
    for (const p of partsForSlot(slot)) {
      const cap = capture(c.id, { wheels, [slot]: p.id });
      parts[p.id] = { slot, prims: [...cap.body.slice(base.body.length), ...cap.spin] };
    }
  }
  results.push({ c, wheels, base, anchor, parts });
}

test('Modelle: Oberkante und halber Radstand stehen in userData (Garagen-Kamera, Bodenkontakt)', () => {
  for (const { c, base } of results) {
    assert.ok(base.userData.top > 0.5 && base.userData.top < 6, `${c.id}: top ${base.userData.top}`);
    assert.ok(base.userData.axleHalf > 0.3 && base.userData.axleHalf < 2, `${c.id}: axleHalf ${base.userData.axleHalf}`);
    assert.ok(base.userData.upper, `${c.id}: Aufbau-Gruppe`);
  }
});

test('Modelle: kein Teil schwebt und keins steckt im Boden (jedes Chassis × jedes Teil)', () => {
  const bad = [];
  for (const { c, wheels, anchor, parts } of results) {
    for (const [id, { prims }] of Object.entries(parts)) {
      assert.ok(prims.length > 0, `${c.id}/${id}: Teil ist sichtbar`);
      const mn = Math.min(...prims.map((p) => p.min[1]));
      if (mn < GROUND - 0.005) bad.push(`${c.id}+${wheels}/${id}: ${(GROUND - mn).toFixed(3)} im Boden`);
      // Verbundenheit: von Chassis/Fahrer/Rädern aus über Grundformen des Teils erreichbar
      const att = prims.map(() => false);
      let changed = true;
      while (changed) {
        changed = false;
        prims.forEach((p, i) => {
          if (att[i]) return;
          if (anchor.some((a) => near(a, p, TOL)) || prims.some((q, j) => att[j] && near(q, p, TOL))) { att[i] = true; changed = true; }
        });
      }
      const n = att.filter((a) => !a).length;
      if (n) bad.push(`${c.id}+${wheels}/${id}: ${n}/${prims.length} Grundformen schweben`);
    }
  }
  assert.deepEqual(bad, []);
});

test(`Modelle: Teile verschiedener Slots durchdringen sich kaum (AABB-Schnitt ≤ ${MAX_OVERLAP})`, () => {
  const bad = [];
  for (const { c, wheels, parts } of results) {
    if (wheels !== 'wheels_bobbycar') continue;
    const ids = Object.keys(parts);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const A = parts[ids[i]], B = parts[ids[j]];
      if (A.slot === B.slot) continue;
      let v = 0;
      for (const p of A.prims) for (const q of B.prims) v += ivol(p, q);
      if (v > MAX_OVERLAP) bad.push(`${c.id}: ${ids[i]} ↔ ${ids[j]} ${v.toFixed(3)}`);
    }
  }
  assert.deepEqual(bad, []);
});
