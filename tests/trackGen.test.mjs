// Streckengenerator (physics/trackGen.js) + Bausteine in Strecke/Physik/Etappe:
// Determinismus, keine Überlappung, erste 40 m frei, Schluchten überwindbar, Looping, Blitz → shock, Endgründe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIOMES, biomeById } from '../www/src/data/biomes.js';
import { FEATURES, PHYSICS as P, STAGE, TRACK } from '../www/src/data/balance.js';
import { generateStageSpec, buildFeature, medalFor, FEATURE_TYPES } from '../www/src/physics/trackGen.js';
import { Track } from '../www/src/physics/track.js';
import { Vehicle } from '../www/src/physics/vehicle.js';
import { Objects, crusherLift } from '../www/src/physics/objects.js';
import { Stage } from '../www/src/stage/stage.js';
import { baseStats } from '../www/src/items/statMods.js';
import { makeRng } from '../www/src/core/rng.js';
import { CameraRig, projectNdc } from '../www/src/camera/cameraRig.js';
import { CAMERA } from '../www/src/data/balance.js';
import { mockInput } from './helpers.mjs';

const KINDS = [['stage', [0, 1, 2, 3, 4, 5]], ['elite', [2, 3, 4, 5]], ['boss', [6]]];

function eachSpec(n, fn) {
  for (const b of BIOMES) for (const [kind, floors] of KINDS) for (const floor of floors) {
    for (let s = 0; s < n; s++) {
      const spec = generateStageSpec({ biome: b, kind, floor, rng: makeRng(`t:${b.id}:${kind}:${floor}:${s}`), bossId: b.bosses[s % 2].id });
      fn(spec, b);
    }
  }
}

// Spezifikation mit genau den angegebenen Bausteinen (x0 je Baustein)
function customSpec(biome, list, base = {}) {
  const spec = generateStageSpec({ biome, kind: 'stage', floor: 0, rng: makeRng('eigene') });
  const r = makeRng('bau');
  spec.features = list.map(([type, x0, room = 200]) => buildFeature(type, biome, x0, room, 0.5, r));
  spec.hazards = list.map((l) => l[0]);
  return Object.assign(spec, base);
}

test('trackGen: deterministisch (gleicher Seed → gleiche Spezifikation und Strecke)', () => {
  for (const b of BIOMES) {
    const a = generateStageSpec({ biome: b, kind: 'elite', floor: 3, rng: makeRng(99) });
    const c = generateStageSpec({ biome: b, kind: 'elite', floor: 3, rng: makeRng(99) });
    assert.deepEqual(a, c);
    const ta = new Track(a, b), tc = new Track(c, b);
    for (let x = -50; x < 1500; x += 3.7) assert.equal(ta.heightAt(x), tc.heightAt(x));
    const d = generateStageSpec({ biome: b, kind: 'elite', floor: 3, rng: makeRng(100) });
    assert.notDeepEqual(a.features, d.features);
  }
});

test('trackGen: Bausteine überlappen nie, erste 40 m frei, Ziele und Medaillen stimmig', () => {
  let count = 0;
  eachSpec(40, (spec, b) => {
    const f = spec.features;
    for (let i = 0; i < f.length; i++) {
      assert.ok(FEATURE_TYPES.includes(f[i].type), f[i].type);
      assert.ok(f[i].x0 >= FEATURES.firstFree, `${b.id}: ${f[i].type} beginnt bei ${f[i].x0}`);
      assert.ok(f[i].x1 > f[i].x0);
      if (i > 0) assert.ok(f[i].x0 >= f[i - 1].x1, `${b.id}: Überlappung ${f[i - 1].type}/${f[i].type}`);
      count++;
    }
    assert.ok(spec.medals.gold > spec.target && spec.medals.bronze === spec.target);
    if (spec.kind === 'boss') assert.deepEqual(spec.medalList, ['bronze', 'gold']);
    else assert.ok(spec.medals.silver > spec.target && spec.medals.silver < spec.medals.gold);
    if (spec.kind === 'elite') assert.equal(spec.target, Math.round(b.targets.stage[spec.floor] * b.targets.eliteMult / 5) * 5);
    assert.ok(spec.features.length >= 1);
  });
  assert.ok(count > 2000);
  // Strecke: in den ersten 40 m nur Grund-Hügel, keine Hindernisse
  eachSpec(3, (spec, b) => {
    const t = new Track(spec, b);
    for (let x = 0; x < FEATURES.firstFree; x += 2) assert.equal(t.heightAt(x), t.base(x));
    const o = new Objects(b, t, 5, { spec });
    o.spawnUntil(400);
    assert.ok(o.obstacles.every((ob) => ob.x >= FEATURES.firstFree), 'Hindernis in den ersten 40 m');
  });
});

test('trackGen: Medaillen nach Distanz', () => {
  const m = { bronze: 100, silver: 125, gold: 150 };
  assert.equal(medalFor(99, m), null);
  assert.equal(medalFor(100, m), 'bronze');
  assert.equal(medalFor(130, m), 'silver');
  assert.equal(medalFor(150, m), 'gold');
  assert.equal(medalFor(130, { bronze: 100, gold: 150 }), 'bronze');
});

// Fahrzeug rollt mit Tempo v0 auf die Schlucht zu (ohne Antrieb/Boost): drüben gelandet?
function crossGap(track, g, v0, biome) {
  const v = new Vehicle(baseStats(), biome.gravity);
  const x = g.rs - 6;
  v.reset(x, track.heightAt(x) + P.rideHeight, Math.atan(track.slopeAt(x)));
  v.onGround = true; v.s = v0; v.fuel = 0;
  const ev = [];
  for (let i = 0; i < 120 * 8; i++) {
    v.step(P.dt, { tilt: 0, boost: false }, track, ev);
    if (ev.some((e) => e.type === 'fall')) return 'fall';
    if (v.onGround && v.x > g.far) return 'ok';
  }
  return v.x > g.far ? 'ok' : 'stuck';
}

test('Schluchten: mit Anlauf (26 m/s, ohne Boost) immer überwindbar, zu langsam → Sturz', () => {
  let n = 0;
  eachSpec(8, (spec, b) => {
    const t = new Track(spec, b);
    for (const g of t.gaps) {
      n++;
      assert.equal(crossGap(t, g, 26, b), 'ok', `${b.id} ${spec.kind}: Schlucht ${g.width} m bei ${g.edge}`);
      assert.notEqual(crossGap(t, g, 9, b), 'ok', 'zu langsam kommt man nicht drüber');
      // Schluchtgrund tief genug, dass der Sturz vor dem Aufschlag gemeldet wird
      assert.ok(g.depth > FEATURES.gap.fallDepth + 5);
    }
  });
  assert.ok(n > 50, `${n} Schluchten geprüft`);
});

test('Endgrund fall: Schluchtsturz kostet 25 Haltbarkeit und beendet die Etappe', () => {
  const b = BIOMES[0];
  const spec = customSpec(b, [['gap', 60]]);
  let result = null;
  const st = new Stage({ biome: b, spec, stats: baseStats(), seed: 3, hooks: { end: (r) => { result = r; } } });
  const g = st.track.gaps[0];
  st.launchNow(0.5, 30);
  const v = st.vehicle;
  v.x = g.edge + 1; v.y = g.yr + g.h + 1; v.onGround = false; v.vx = 2; v.vy = 0; v.fuel = 0;
  const input = mockInput();
  for (let i = 0; i < 60 * 10 && !result; i++) st.update(1 / 60, input);
  assert.ok(result);
  assert.equal(result.reason, 'fall');
  assert.equal(result.damageTaken, FEATURES.gap.fallDamage);
  assert.equal(result.cleared, false);
});

test('Endgründe stop, wreck, time', () => {
  const b = BIOMES[0];
  const mk = () => {
    const box = { r: null };
    const st = new Stage({ biome: b, spec: customSpec(b, [['hills', 300]]), stats: baseStats(), seed: 4, hooks: { end: (r) => { box.r = r; } } });
    return [st, box];
  };
  const input = mockInput();
  // stop: Kiste steht
  let [st, box] = mk();
  st.launchNow(0.3, 20);
  for (let i = 0; i < 60 * 60 && !box.r; i++) st.update(1 / 60, input);
  assert.equal(box.r.reason, 'stop');
  // wreck: Haltbarkeit 0
  [st, box] = mk();
  st.launchNow(0.5, 30);
  st.vehicle.damage(1000, 'test', st.ev, { pierce: true });
  for (let i = 0; i < 120 && !box.r; i++) st.update(1 / 60, input);
  assert.equal(box.r.reason, 'wreck');
  assert.equal(box.r.cleared, false);
  assert.equal(box.r.medal, null);
  // time: Zeit abgelaufen
  [st, box] = mk();
  st.launchNow(1, 40);
  st.time = STAGE.maxTime - 0.01;
  for (let i = 0; i < 10 && !box.r; i++) st.update(1 / 60, input);
  assert.equal(box.r.reason, 'time');
  // Ergebnis-Felder nach ARCHITEKTUR §7
  for (const k of ['cleared', 'medal', 'dist', 'target', 'bolts', 'scrap', 'blueprints', 'stunts', 'damageTaken', 'reason', 'durability']) assert.ok(k in box.r, k);
});

// Fahrzeug am Boden mit Tempo v vor dem Looping, Stage-Schleife; prüft die Kamera-Garantie in jedem Schritt
function driveLoop(speed) {
  const b = biomeById('gewittersteppe');
  const spec = customSpec(b, [['loop', 80]]);
  const events = [];
  const popups = [];
  let result = null;
  const st = new Stage({ biome: b, spec, stats: { ...baseStats(), driveAccel: 0 }, seed: 2, hooks: { event: (n, d) => events.push({ n, d }), popup: (t) => popups.push(t), end: (r) => { result = r; } } });
  const l = st.track.loops[0];
  st.launchNow(0.3, 20);
  const v = st.vehicle;
  v.x = l.lx - 8; v.y = st.track.heightAt(v.x) + P.rideHeight; v.onGround = true; v.s = speed; v.angle = 0;
  const rig = new CameraRig();
  rig.snap(v.x, v.y, CAMERA.minWidth);
  const input = mockInput();
  let inLoop = false, maxY = -Infinity;
  const lim = 1 - 2 * CAMERA.safeMargin + 1e-6;
  const p = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 60 * 8 && !result; i++) {
    st.update(1 / 60, input);
    if (v.loop) inLoop = true;
    maxY = Math.max(maxY, v.y);
    const out = rig.update(1 / 60, { x: v.x, y: v.y, vx: v.vx, vy: v.vy, groundY: st.track.heightAt(v.x), aspect: 0.45, fovDeg: CAMERA.fovDeg });
    projectNdc(out, 0.45, CAMERA.fovDeg, v.x, v.y, 0, p);
    assert.ok(Math.abs(p.x) <= lim && Math.abs(p.y) <= lim, `Kamera verliert das Auto im Looping (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
    if (!v.loop && v.onGround && v.x > l.lx + 20) break;
  }
  return { st, l, events, popups, inLoop, maxY };
}

test('Looping: ab Mindesttempo durchfahren (Popup „LOOPING!“), zu langsam → zurückfallen; Kamera behält das Auto', () => {
  const fast = driveLoop(19);
  assert.ok(fast.inLoop, 'fährt in den Looping');
  assert.equal(fast.st.vehicle.loops, 1, 'Looping vollständig');
  assert.ok(fast.popups.includes('LOOPING!'));
  assert.ok(fast.maxY > fast.l.yr + 2 * fast.l.r, 'war oben im Ring');
  assert.ok(fast.st.vehicle.x > fast.l.lx && fast.st.vehicle.s > 5, 'fährt danach weiter');
  assert.equal(fast.st.stunts.loops, 1);
  const slow = driveLoop(11);
  assert.ok(slow.inLoop);
  assert.equal(slow.st.vehicle.loops, 0, 'kein vollständiger Looping');
  assert.ok(slow.popups.some((t) => /Zu langsam/.test(t)));
  assert.equal(slow.st.stunts.loops, 0);
});

test('Blitzzone: Warnung, dann Einschlag → Ereignis shock {source: lightning} und 6 Schaden', () => {
  const b = biomeById('gewittersteppe');
  const spec = customSpec(b, [['lightning', 60]]);
  const events = [];
  const st = new Stage({ biome: b, spec, stats: { ...baseStats(), driveAccel: 0, rollFriction: 0.05 }, seed: 9, hooks: { event: (n, d) => events.push({ n, d }) } });
  const z = st.track.features[0];
  st.launchNow(0.3, 20);
  const v = st.vehicle;
  v.x = (z.x0 + z.x1) / 2; v.y = st.track.heightAt(v.x) + P.rideHeight; v.onGround = true; v.s = 0.6;
  st.stopTimer = -1e9;   // nicht wegen Stillstand beenden
  const input = mockInput();
  let warned = false;
  for (let i = 0; i < 60 * 12 && !events.some((e) => e.n === 'shock'); i++) {
    st.update(1 / 60, input);
    st.stopTimer = -1e9;
    if (st.objects.strikes.some((s) => s.t > 0)) warned = true;
  }
  assert.ok(warned, 'Warnung vor dem Einschlag');
  const shock = events.find((e) => e.n === 'shock');
  assert.ok(shock, 'shock-Ereignis');
  assert.equal(shock.d.source, 'lightning');
  const dmg = events.find((e) => e.n === 'damage' && e.d.source === 'lightning');
  assert.ok(dmg && Math.abs(dmg.d.amount - FEATURES.lightning.damage) < 1e-9, 'Blitz kostet 6');
});

test('Schlamm bremst (×4 Reibung), Schrottpresse taktet und trifft geschlossen', () => {
  const b = BIOMES[0];
  const spec = customSpec(b, [['mud', 60, 30]]);
  const t = new Track(spec, b);
  const m = t.features[0];
  assert.equal(t.frictionAt((m.x0 + m.x1) / 2), 4);
  assert.equal(t.frictionAt(m.x0 - 5), 1);
  const c = { period: 3, open: 0.6, phase: 0 };
  assert.equal(crusherLift(c, 0.1), FEATURES.crusher.openY);
  assert.equal(crusherLift(c, 3 * 0.75), 0);
  const cs = customSpec(b, [['crusher', 60]]);
  const ct = new Track(cs, b);
  const o = new Objects(b, ct, 1, { spec: cs });
  const cr = o.crushers[0];
  cr.lift = 0;
  const v = new Vehicle(baseStats(), 9.81);
  v.reset(cr.x + 3, cr.y0 + P.rideHeight, 0);
  const ev = [];
  o.collide(v, cr.x - 3, cr.y0 + P.rideHeight, 1 / 120, ev);
  assert.ok(ev.some((e) => e.type === 'hit' && e.obstacle.type === 'crusher'));
  cr.cd = 0; cr.lift = FEATURES.crusher.openY;
  const ev2 = [];
  o.collide(v, cr.x - 3, cr.y0 + P.rideHeight, 1 / 120, ev2);
  assert.ok(!ev2.some((e) => e.type === 'hit'), 'offene Presse: drunter durch');
  assert.ok(TRACK.step > 0);
});
