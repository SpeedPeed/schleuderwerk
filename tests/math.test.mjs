// Tests für core/math.js und core/rng.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, lerp, smoothstep, wrapAngle, approach, dimReturn, softcap, TAU } from '../www/src/core/math.js';
import { makeRng, mulberry32, range, hash1, noise1 } from '../www/src/core/rng.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('clamp und lerp', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
  near(lerp(10, 20, 0.25), 12.5);
  near(lerp(10, 20, 0), 10);
  near(lerp(10, 20, 1), 20);
});

test('smoothstep ist an den Enden 0/1 und in der Mitte 0,5', () => {
  assert.equal(smoothstep(0, 1, -1), 0);
  assert.equal(smoothstep(0, 1, 2), 1);
  near(smoothstep(0, 1, 0.5), 0.5);
  near(smoothstep(10, 20, 15), 0.5);
});

test('wrapAngle bleibt in [-π, π) und ändert die Richtung nicht', () => {
  for (const a of [0, 1, -1, 3.5, -3.5, 10, -10, 100, TAU, -TAU]) {
    const w = wrapAngle(a);
    assert.ok(w >= -Math.PI && w < Math.PI, `${a} → ${w}`);
    near(Math.cos(w), Math.cos(a), 1e-9);
    near(Math.sin(w), Math.sin(a), 1e-9);
  }
});

test('approach: exponentiell, bildraten-unabhängig, stabil bei großen dt', () => {
  near(approach(0, 10, 5, 0), 0);
  near(approach(0, 10, 5, 1), 10 * (1 - Math.exp(-5)));
  // zwei halbe Schritte = ein ganzer Schritt
  const a = approach(approach(0, 10, 3, 0.05), 10, 3, 0.05);
  near(a, approach(0, 10, 3, 0.1), 1e-12);
  // überschießt nie
  assert.ok(approach(0, 10, 1000, 10) <= 10);
});

test('dimReturn: abnehmender Ertrag, Hälfte bei halfLevel, nie über max', () => {
  assert.equal(dimReturn(0, 1, 12), 0);
  near(dimReturn(12, 0.9, 12), 0.45);
  let prev = 0, prevGain = Infinity;
  for (let l = 1; l <= 100; l++) {
    const v = dimReturn(l, 1, 12);
    assert.ok(v > prev && v < 1);
    assert.ok(v - prev < prevGain, 'jede Stufe bringt weniger als die vorige');
    prevGain = v - prev;
    prev = v;
  }
});

test('softcap: unverändert bis cap, darüber gebremst und monoton', () => {
  assert.equal(softcap(30, 45, 4), 30);
  assert.equal(softcap(45, 45, 4), 45);
  near(softcap(90, 45, 4), 45 * Math.pow(2, 0.25));
  assert.ok(softcap(200, 45, 4) < 200 && softcap(200, 45, 4) > softcap(100, 45, 4));
});

test('makeRng: gleicher Seed = gleiche Folge, kompatibel zu mulberry32', () => {
  const a = makeRng(1234), b = makeRng(1234), m = mulberry32(1234);
  for (let i = 0; i < 50; i++) {
    const x = a.next();
    assert.equal(x, b.next());
    assert.equal(x, m());
  }
  assert.notEqual(makeRng(1).next(), makeRng(2).next());
  // Text-Seeds
  assert.equal(makeRng('abc').next(), makeRng('abc').next());
  // alte Helfer bleiben
  const r = mulberry32(7);
  const v = range(r, 5, 6);
  assert.ok(v >= 5 && v < 6);
  assert.ok(hash1(3) >= 0 && hash1(3) < 1);
  assert.ok(noise1(2.5) >= 0 && noise1(2.5) < 1);
});

test('makeRng: int, range, pick, weighted, shuffle', () => {
  const r = makeRng(99);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const n = r.int(2, 5);
    assert.ok(Number.isInteger(n) && n >= 2 && n <= 5);
    seen.add(n);
    const f = r.range(-1, 1);
    assert.ok(f >= -1 && f < 1);
  }
  assert.equal(seen.size, 4, 'alle Werte 2…5 kommen vor');
  const arr = ['a', 'b', 'c'];
  for (let i = 0; i < 100; i++) assert.ok(arr.includes(r.pick(arr)));

  // weighted: Objekt, Paare, Objekte mit weight
  const counts = { a: 0, b: 0 };
  for (let i = 0; i < 4000; i++) counts[r.weighted({ a: 3, b: 1 })]++;
  assert.ok(counts.a > counts.b * 2 && counts.a < counts.b * 4, JSON.stringify(counts));
  assert.equal(r.weighted([['nur', 1], ['nie', 0]]), 'nur');
  const o = { name: 'x', weight: 1 };
  assert.equal(r.weighted([o]), o);

  const sh = r.shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...sh].sort((x, y) => x - y), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('makeRng.fork: deterministisch und unabhängig vom Verbrauch', () => {
  const a = makeRng(42), b = makeRng(42);
  b.next(); b.next(); b.next();
  assert.equal(a.fork('wetter').next(), b.fork('wetter').next());
  assert.notEqual(a.fork('wetter').next(), a.fork('objekte').next());
});
