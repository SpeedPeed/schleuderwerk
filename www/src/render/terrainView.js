import * as THREE from 'three';
import { T_STEP, T_START } from '../game/terrain.js';
import { hash1, noise1 } from '../game/rng.js';
import { part, merge, flatMat } from './models.js';

const CH = 48; // Höhenpunkte pro Stück (= 96 m)
// Tiefenreihen der Bodenfläche (z). Das Auto fährt bei z = 0.
const ROWS = [-18, -10, -4, -1.6, 1.6, 4.5];
const FRONT_Z = 4.5;
const _c = new THREE.Color();

// Erzeugt die sichtbare Landschaft stückweise aus der Höhenlinie.
export class TerrainView {
  constructor(scene, terrain, pal) {
    this.scene = scene;
    this.terrain = terrain;
    this.pal = pal;
    this.chunks = new Map();
  }

  rowOffset(z, x) {
    if (Math.abs(z) <= 1.6) return 0;
    if (z === FRONT_Z) return -0.15;
    const n = noise1(x * 0.11 + z * 3.7);
    if (z === -4) return n * 0.4;
    if (z === -10) return n * 1.6;
    return 0.8 + n * 3.2;
  }

  topY(x, z) {
    return this.terrain.heightAt(x) + this.rowOffset(z, x);
  }

  update(camX) {
    const first = Math.floor((camX - 160 - T_START) / T_STEP / CH);
    const last = Math.floor((camX + 320 - T_START) / T_STEP / CH);
    for (let ci = Math.max(0, first); ci <= last; ci++) {
      if (!this.chunks.has(ci)) this.chunks.set(ci, this.build(ci));
    }
    for (const [ci, mesh] of this.chunks) {
      if (ci < first - 1 || ci > last + 1) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        this.chunks.delete(ci);
      }
    }
  }

  build(ci) {
    const t = this.terrain;
    const pal = this.pal;
    const i0 = ci * CH;
    const i1 = i0 + CH;
    t.ensure(T_START + (i1 + 2) * T_STEP);
    const pos = [];
    const col = [];
    const rnd = (k) => hash1(k);
    let seedK = ci * 1000;

    const tri = (a, b, c, color, jit = 0.08) => {
      _c.set(color);
      const k = 1 + (rnd(seedK++) - 0.5) * jit;
      pos.push(...a, ...b, ...c);
      for (let j = 0; j < 3; j++) col.push(_c.r * k, _c.g * k, _c.b * k);
    };
    const quad = (a, b, c, d, color, jit) => { tri(a, b, c, color, jit); tri(a, c, d, color, jit); };
    const pick = (arr, k) => arr[Math.floor(rnd(k) * arr.length) % arr.length];

    for (let i = i0; i < i1; i++) {
      const xa = T_START + i * T_STEP;
      const xb = xa + T_STEP;
      const isRamp = t.ramp[i] && t.ramp[i + 1];
      // Bodenfläche (Reihen von hinten nach vorne)
      for (let r = 0; r < ROWS.length - 1; r++) {
        const z0 = ROWS[r], z1 = ROWS[r + 1];
        const a = [xa, this.topY(xa, z0), z0];
        const b = [xa, this.topY(xa, z1), z1];
        const c = [xb, this.topY(xb, z1), z1];
        const d = [xb, this.topY(xb, z0), z0];
        let color = pick(pal.grass, i * 13 + r);
        if (isRamp) color = z0 === -1.6 ? pal.ramp[i % 2] : pal.dirt[r % pal.dirt.length];
        quad(a, b, c, d, color, 0.12);
      }
      // Vorderkante (Erdschnitt)
      const ya = this.topY(xa, FRONT_Z), yb = this.topY(xb, FRONT_Z);
      quad([xa, ya, FRONT_Z], [xa, ya - 0.9, FRONT_Z], [xb, yb - 0.9, FRONT_Z], [xb, yb, FRONT_Z], pal.grassEdge, 0.05);
      quad([xa, ya - 0.9, FRONT_Z], [xa, ya - 5, FRONT_Z], [xb, yb - 5, FRONT_Z], [xb, yb - 0.9, FRONT_Z], pick(pal.dirt, i), 0.1);
      quad([xa, ya - 5, FRONT_Z], [xa, -60, FRONT_Z], [xb, -60, FRONT_Z], [xb, yb - 5, FRONT_Z], pal.deepDirt, 0.06);
      // Hügel im Hintergrund
      const hb = (x) => t.heightAt(x) * 0.5 + 4 + noise1(x / 23) * 10 + noise1(x / 7.5) * 2.5;
      const yba = this.topY(xa, -18), ybb = this.topY(xb, -18);
      quad([xa, hb(xa), -42], [xa, yba, -18], [xb, ybb, -18], [xb, hb(xb), -42], pick(pal.hills, i * 7), 0.1);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const parts = [geo, ...this.decor(i0, i1)];
    const mesh = new THREE.Mesh(merge(parts), flatMat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  decor(i0, i1) {
    const pal = this.pal;
    const parts = [];
    const r = (k) => hash1(k);
    for (let i = i0; i < i1; i++) {
      const x = T_START + i * T_STEP + 1;
      if (x < 12 && x > -12) continue; // Platz für die Schleuder
      // Strommasten geben ein Gefühl für Tempo
      if (i % 15 === 0) {
        const y = this.topY(x, -7);
        parts.push(part('cyl6', pal.pole, { x, y: y + 4, z: -7, sx: 0.18, sz: 0.18, sy: 8 }));
        parts.push(part('box', pal.pole, { x, y: y + 7.4, z: -7, sx: 0.2, sy: 0.2, sz: 3 }));
      }
      const h = r(i * 7.3 + 1.1);
      const z = -5 - r(i * 3.1) * 10;
      const y = this.topY(x, z > -7 ? -4 : -10) - 0.1;
      const k = i * 11.7;
      if (h < 0.11) {
        const s = 0.5 + r(k) * 1.2;
        parts.push(part('ico', pal.rock[i % pal.rock.length], { x, y: y + s * 0.4, z, s, sy: s * 0.7, ry: r(k + 1) * 6 }, 0.15));
      } else if (h < 0.21) {
        const s = 0.6 + r(k) * 0.8;
        parts.push(part('dodeca', pal.bush[i % pal.bush.length], { x, y: y + s * 0.6, z, s }, 0.15));
        parts.push(part('dodeca', pal.bush[(i + 1) % pal.bush.length], { x: x + s * 0.8, y: y + s * 0.4, z: z + 0.3, s: s * 0.7 }, 0.15));
      } else if (h < 0.26) {
        // Autowrack
        const c = pal.wreck[i % pal.wreck.length];
        const ry = (r(k) - 0.5) * 1.2;
        const rz = (r(k + 2) - 0.5) * 0.3;
        parts.push(part('box', c, { x, y: y + 0.55, z: z - 2, sx: 3.6, sy: 0.9, sz: 1.7, ry, rz }, 0.2));
        parts.push(part('box', c, { x: x - 0.3, y: y + 1.25, z: z - 2, sx: 1.7, sy: 0.6, sz: 1.5, ry, rz: rz + 0.1 }, 0.2));
        parts.push(part('cyl8', '#2a2a2e', { x: x + 2.2, y: y + 0.4, z: z - 0.8, sx: 0.5, sz: 0.5, sy: 0.35, rz: 1.4 }));
      } else if (h < 0.29) {
        // Reifenhaufen
        parts.push(part('cyl10', '#2c2c30', { x, y: y + 0.2, z, sx: 0.8, sz: 0.8, sy: 0.35 }));
        parts.push(part('cyl10', '#34343a', { x: x + 0.3, y: y + 0.55, z: z + 0.2, sx: 0.8, sz: 0.8, sy: 0.35, rz: 0.2 }));
      }
      // kleine Steine vorne
      if (r(i * 5.3 + 9) < 0.07) {
        const s = 0.25 + r(i) * 0.35;
        parts.push(part('ico', pal.rock[(i + 1) % pal.rock.length], { x, y: this.topY(x, FRONT_Z) + s * 0.3, z: 3.4, s }, 0.15));
      }
    }
    return parts;
  }
}
