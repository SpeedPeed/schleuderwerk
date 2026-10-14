// Test-Spion für render/models.js: wie das Original, merkt sich aber für jede Grundform (part) die Bounding-Box
// und für jedes merge() eine laufende Nummer. globalThis.__prims = [{ min, max, merge }].
import * as real from '../../www/src/render/models.js';

export const flatMat = real.flatMat;
export const flatMatInstanced = real.flatMatInstanced;
export const SHAPES = real.SHAPES;

const byGeo = new WeakMap();
globalThis.__prims = [];
let merges = 0;

export function part(shape, color, o = {}, jitter = 0, rng = Math.random) {
  const g = real.part(shape, color, o, jitter, rng);
  g.computeBoundingBox();
  const b = g.boundingBox;
  const rec = { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z], merge: -1 };
  globalThis.__prims.push(rec);
  byGeo.set(g, rec);
  return g;
}

export function merge(parts) {
  const id = merges++;
  for (const p of parts) { const r = byGeo.get(p); if (r) r.merge = id; }
  return real.merge(parts);
}
