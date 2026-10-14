// Kamera-Tests: Das Auto liegt in JEDEM Schritt im Sicherheitsrahmen – bei jedem Seitenverhältnis,
// jedem Tempo (bis 90 m/s), jeder Höhe (bis 3000 m) und auch bei großen Zeitsprüngen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CameraRig, projectNdc, unprojectToPlane } from '../www/src/camera/cameraRig.js';
import { CAMERA } from '../www/src/data/balance.js';
import { makeRng } from '../www/src/core/rng.js';

const FOV = CAMERA.fovDeg;
const LIM = 1 - 2 * CAMERA.safeMargin;  // Rahmenkante in NDC
const EPS = 1e-6;
const ASPECTS = [0.45, 0.75, 1.0, 2.0];

// Unabhängige Projektion nach THREE-Konvention (Matrix4.lookAt + PerspectiveCamera), ohne three.js
function project(cam, aspect, px, py, pz = 0) {
  const ex = cam.x, ey = cam.y, ez = cam.dist;
  let zx = ex - cam.lookX, zy = ey - cam.lookY, zz = ez;               // z = eye - target
  let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
  let xx = zz, xy = 0, xz = -zx;                                       // x = up × z
  l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx; // y = z × x
  const dx = px - ex, dy = py - ey, dz = pz - ez;
  const vx = xx * dx + xy * dy + xz * dz;
  const vy = yx * dx + yy * dy + yz * dz;
  const vz = zx * dx + zy * dy + zz * dz;
  const t = Math.tan((FOV * Math.PI) / 360);
  return { x: vx / (t * aspect) / -vz, y: vy / t / -vz, depth: -vz };
}

const ground = (x) => 30 * Math.sin(x / 150) + 10 * Math.sin(x / 37) + 4 * Math.sin(x / 9);

function checkFrame(cam, aspect, x, y, info) {
  const R = CAMERA.carRadius;
  const pts = [[0, 0]];
  for (let k = 0; k < 16; k++) pts.push([Math.cos((k * Math.PI) / 8) * R, Math.sin((k * Math.PI) / 8) * R]);
  for (const [ox, oy] of pts) {
    const p = project(cam, aspect, x + ox, y + oy);
    if (!(p.depth > 0 && Math.abs(p.x) <= LIM + EPS && Math.abs(p.y) <= LIM + EPS)) {
      assert.fail(`Auto außerhalb des Sicherheitsrahmens (${info}): ndc ${p.x.toFixed(4)}, ${p.y.toFixed(4)}`);
    }
  }
}

function checkIndicator(cam, aspect, x, out, info) {
  const g = project(cam, aspect, x, ground(x));
  if (g.y < -1) assert.ok(out.indicator.show, `Boden unsichtbar, aber kein Indikator (${info})`);
  if (out.indicator.show) assert.match(out.indicator.text, /^Boden ↓ [\d.]+ m$/);
}

// Simuliert eine Flugbahn: next(state, dt, i) verändert x, alt, vx, vy
function fly(aspect, seed, steps, next, opts = {}) {
  const rng = makeRng(seed);
  const rig = new CameraRig();
  const s = { x: 0, alt: 2, vx: 0, vy: 0 };
  rig.snap(0, 8, CAMERA.minWidth);
  let lastOut = null;
  for (let i = 0; i < steps; i++) {
    const dt = opts.dt ? opts.dt(rng, i) : rng.next() < 0.25 ? 0.05 : rng.range(0.004, 0.05);
    next(s, dt, i, rng);
    s.alt = Math.max(0, Math.min(3000, s.alt));
    const sp = Math.hypot(s.vx, s.vy);
    if (sp > 90) { s.vx *= 90 / sp; s.vy *= 90 / sp; }
    const gy = ground(s.x);
    const y = gy + 0.9 + s.alt;
    const out = rig.update(dt, { x: s.x, y, vx: s.vx, vy: s.vy, groundY: gy, aspect, fovDeg: FOV });
    const info = `aspect ${aspect}, seed ${seed}, Schritt ${i}, alt ${s.alt.toFixed(0)}, v ${sp.toFixed(0)}`;
    checkFrame(out, aspect, s.x, y, info);
    checkIndicator(out, aspect, s.x, out, info);
    lastOut = { out, s: { ...s }, y };
  }
  return lastOut;
}

test('Projektion des Rigs stimmt mit THREE-Konvention überein; Rückprojektion ist exakt', () => {
  const cam = { x: 10 - 50 * 0.16, y: 20 + 50 * 0.14, dist: 50, lookX: 10, lookY: 20 };
  for (const aspect of ASPECTS) {
    for (const [px, py] of [[10, 20], [0, 0], [30, 5], [-5, 40]]) {
      const a = projectNdc(cam, aspect, FOV, px, py);
      const b = project(cam, aspect, px, py);
      assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9);
      const q = unprojectToPlane(cam, aspect, FOV, a.x, a.y);
      assert.ok(Math.abs(q.x - px) < 1e-7 && Math.abs(q.y - py) < 1e-7);
    }
    // Blickpunkt liegt in der Bildmitte
    const c = projectNdc(cam, aspect, FOV, 10, 20);
    assert.ok(Math.abs(c.x) < 1e-9 && Math.abs(c.y) < 1e-9);
  }
});

test('Zufällige Flugbahnen (bis 90 m/s, bis 3000 m, dt bis 0,05): Auto immer im Rahmen', () => {
  for (const aspect of ASPECTS) {
    for (let seed = 1; seed <= 6; seed++) {
      fly(aspect, seed * 101 + Math.round(aspect * 10), 2500, (s, dt, i, rng) => {
        s.vx += rng.range(-60, 60) * dt;
        s.vy += rng.range(-80, 80) * dt;
        if (rng.next() < 0.004) { s.vx = rng.range(-90, 90); s.vy = rng.range(-90, 90); } // abrupter Richtungswechsel
        if (rng.next() < 0.002) s.alt = rng.range(0, 3000);                              // Sprung (Teleport)
        s.x += s.vx * dt;
        s.alt += s.vy * dt;
        if (s.alt <= 0) { s.alt = 0; s.vy = Math.abs(s.vy) * 0.5; }
        if (s.alt >= 3000) s.vy = -Math.abs(s.vy);
      });
    }
  }
});

test('Extreme Flugbahnen: Rakete auf 3000 m, Sturzflug, Tiefflug mit 90 m/s, Umkehr', () => {
  for (const aspect of ASPECTS) {
    const phases = (s, dt, i) => {
      if (i < 1300) { s.vx = 5; s.vy = 90; }               // senkrecht hoch
      else if (i < 2600) { s.vx = 20; s.vy = -88; }        // Sturzflug
      else if (i < 3200) { s.vx = 90; s.vy = 0; s.alt = 0.5; } // Tiefflug
      else if (i < 3500) { s.vx = -90; s.vy = 0; }         // abrupte Umkehr
      else { s.vx = 60; s.vy = 70; }                       // schräg hoch
      s.x += s.vx * dt;
      s.alt += s.vy * dt;
    };
    fly(aspect, 7, 4200, phases, { dt: (rng, i) => (i % 7 === 0 ? 0.05 : 1 / 60) });
    fly(aspect, 8, 4200, phases, { dt: () => 0.05 });
  }
});

test('Boden-Indikator: hoch oben sichtbar, im Tiefflug aus', () => {
  for (const aspect of ASPECTS) {
    // lange in 2500 m Höhe
    const hi = fly(aspect, 3, 400, (s, dt) => { s.vx = 40; s.vy = 0; s.alt = 2500; s.x += s.vx * dt; }, { dt: () => 1 / 60 });
    assert.ok(hi.out.indicator.show, `Indikator in 2500 m (aspect ${aspect})`);
    assert.match(hi.out.indicator.text, /Boden ↓ 2\.50\d m/);
    // Tiefflug: Boden ist im Bild, kein Indikator
    const lo = fly(aspect, 4, 400, (s, dt) => { s.vx = 30; s.vy = 0; s.alt = 3; s.x += s.vx * dt; }, { dt: () => 1 / 60 });
    assert.equal(lo.out.indicator.show, false, `kein Indikator im Tiefflug (aspect ${aspect})`);
    const g = project(lo.out, aspect, lo.s.x, ground(lo.s.x));
    assert.ok(g.y > -1 && g.y < 1, 'Boden sichtbar');
  }
});

test('Zoom: schneller und höher = weiter weg, innerhalb min/max', () => {
  const rig = new CameraRig();
  const slow = rig.update(1, { x: 0, y: 1, vx: 5, vy: 0, groundY: 0, aspect: 0.45, fovDeg: FOV });
  for (let i = 0; i < 100; i++) rig.update(0.05, { x: 0, y: 1, vx: 5, vy: 0, groundY: 0, aspect: 0.45, fovDeg: FOV });
  const wSlow = rig.width;
  for (let i = 0; i < 100; i++) rig.update(0.05, { x: 0, y: 1, vx: 90, vy: 0, groundY: 0, aspect: 0.45, fovDeg: FOV });
  const wFast = rig.width;
  for (let i = 0; i < 100; i++) rig.update(0.05, { x: 0, y: 3000, vx: 0, vy: 0, groundY: 0, aspect: 0.45, fovDeg: FOV });
  const wHigh = rig.width;
  assert.ok(slow.dist > 0);
  assert.ok(wSlow >= CAMERA.minWidth - 1e-9 && wSlow < wFast && wFast < wHigh && wHigh <= CAMERA.maxWidth + 1e-9);
});

test('Feste Ansichten (Werkstatt/Zielen) halten das Auto ebenfalls im Rahmen', () => {
  for (const aspect of ASPECTS) {
    const rig = new CameraRig();
    rig.snap(500, 300, 15); // absichtlich weit weg
    const car = { x: 0, y: 8 };
    const out = rig.frame(0.016, { x: 8, y: 18, width: 30, k: 3, aspect, fovDeg: FOV, car });
    checkFrame(out, aspect, car.x, car.y, `frame aspect ${aspect}`);
    assert.equal(out.indicator.show, false);
  }
});
