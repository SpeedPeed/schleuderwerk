// Kleiner, reproduzierbarer Zufallsgenerator (gleicher Seed = gleiche Zahlen).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const range = (rng, a, b) => a + (b - a) * rng();

// Deterministisches "Rauschen" für Deko und Hintergrund-Hügel
export function hash1(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash1(i) * (1 - u) + hash1(i + 1) * u;
}

// Text (oder Zahl) → 32-Bit-Seed (FNV-1a mit Nachmischung)
export function hashSeed(v) {
  const s = String(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}

// Zufall mit Seed und bequemen Helfern. fork(label) leitet einen unabhängigen Generator ab
// (z. B. Run-Seed → Wetter, Abschuss, Objekte), egal wie viele Zahlen schon gezogen wurden.
// next() liefert dieselbe Folge wie mulberry32(seed) – bestehende Strecken bleiben gleich.
export function makeRng(seed) {
  const s0 = (typeof seed === 'number' ? seed : hashSeed(seed)) >>> 0;
  const next = mulberry32(s0);
  return {
    seed: s0,
    next,
    // ganze Zahl von a bis einschließlich b
    int(a, b) { return a + Math.floor(next() * (b - a + 1)); },
    // Kommazahl von a bis b
    range(a, b) { return a + (b - a) * next(); },
    chance(p) { return next() < p; },
    pick(arr) { return arr[Math.floor(next() * arr.length)]; },
    // { schlüssel: gewicht } → schlüssel · [[wert, gewicht], …] → wert · [{ weight, … }, …] → Objekt
    weighted(objOrPairs) {
      const entries = Array.isArray(objOrPairs)
        ? objOrPairs.map((e) => (Array.isArray(e) ? e : [e, e.weight]))
        : Object.entries(objOrPairs);
      let total = 0;
      for (const e of entries) total += Math.max(0, e[1]);
      let roll = next() * total;
      for (const e of entries) {
        roll -= Math.max(0, e[1]);
        if (roll < 0) return e[0];
      }
      return entries.length ? entries[entries.length - 1][0] : undefined;
    },
    // Fisher-Yates: mischt das Array an Ort und Stelle und gibt es zurück
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
      }
      return arr;
    },
    fork(label) { return makeRng(hashSeed(`${s0}:${label}`)); },
  };
}
