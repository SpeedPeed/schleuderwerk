import * as THREE from 'three';
import { T_STEP, T_START, SURF } from '../physics/track.js';
import { hash1, noise1 } from '../core/rng.js';
import { RENDER } from '../data/balance.js';
import { flatMat, GeoBuilder, colorOf } from './models.js';

const CH = 48; // Höhenpunkte pro Stück (= 96 m)
// Tiefenreihen der Bodenfläche (z). Das Auto fährt bei z = 0.
const ROWS = [-18, -10, -4, -1.6, 1.6, 4.5];
const FRONT_Z = 4.5;
// gemeinsamer Bau-Puffer aller Gelände-Stücke (wächst bei Bedarf, wird nie freigegeben)
const BUILDER = new GeoBuilder(16384);

const PAD_COLORS = ['#7d8088', '#6f7279'];      // Stahlplatten unter Looping und Presse

// Erzeugt die sichtbare Landschaft stückweise aus der Höhenlinie.
// Jedes Stück baut seine Geometrie mit LOKALEN x-Koordinaten (relativ zum Stück-Anfang)
// und wird per mesh.position.x = Anfang - origin.x platziert (Floating Origin).
// Oberflächen (track.surf): Rampe, Schlucht (dunkler Grund, Felswände), Schlamm, Sand, Stahlplatte.
export class TrackView {
  constructor(scene, track, biome) {
    this.scene = scene;
    this.track = track;
    this.pal = biome.palette;
    this.decorList = Object.entries(biome.decor || {});
    this.chunks = new Map();
    this.placeChunk = this.placeChunk.bind(this);
  }

  dispose() {
    for (const mesh of this.chunks.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.chunks.clear();
  }

  // Welche Deko an dieser Stelle? (h = Zufallswert 0..1)
  decorType(h) {
    let acc = 0;
    for (const [k, v] of this.decorList) {
      acc += v;
      if (h < acc) return k;
    }
    return null;
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
    return this.track.heightAt(x) + this.rowOffset(z, x);
  }

  chunkX0(ci) { return T_START + ci * CH * T_STEP; }

  // camX: absolute Kamera-x, originX: Render-Ursprung
  update(camX, originX) {
    const first = Math.floor((camX - RENDER.chunkBehind - T_START) / T_STEP / CH);
    const last = Math.floor((camX + RENDER.chunkAhead - T_START) / T_STEP / CH);
    for (let ci = Math.max(0, first); ci <= last; ci++) {
      if (!this.chunks.has(ci)) this.chunks.set(ci, this.build(ci));
    }
    // Map.forEach statt for…of mit Zerlegung: keine Hilfs-Arrays pro Bild
    this.first = first;
    this.last = last;
    this.originX = originX;
    this.chunks.forEach(this.placeChunk);
  }

  // (gebunden im Konstruktor) Stück verschieben bzw. entsorgen, wenn es weit aus dem Bild ist
  placeChunk(mesh, ci) {
    if (ci < this.first - 1 || ci > this.last + 1) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      this.chunks.delete(ci);
    } else {
      mesh.position.x = this.chunkX0(ci) - this.originX;
    }
  }

  build(ci) {
    const t = this.track;
    const pal = this.pal;
    const i0 = ci * CH;
    const i1 = i0 + CH;
    const x0 = this.chunkX0(ci);
    t.ensure(T_START + (i1 + 2) * T_STEP);
    // alles direkt in den gemeinsamen Puffer (keine Zwischen-Arrays, keine geklonten Teil-Geometrien)
    const gb = BUILDER.reset();
    let seedK = ci * 1000;
    const jit = (j) => 1 + (hash1(seedK++) - 0.5) * j;
    const quad = (la, lb, ya, za, yb, zb, yc, zc, yd, zd, color, j = 0.08) => {
      const k1 = jit(j), k2 = jit(j);
      gb.quad(la, lb, ya, za, yb, zb, yc, zc, yd, zd, colorOf(color), k1, k2);
    };
    const pick = (arr, k) => arr[Math.floor(hash1(k) * arr.length) % arr.length];

    for (let i = i0; i < i1; i++) {
      const xa = T_START + i * T_STEP;       // absolut (für Höhen und Rauschen)
      const xb = xa + T_STEP;
      const la = xa - x0, lb = xb - x0;      // lokal (für die Geometrie)
      const sa = t.surf[i], sb = t.surf[i + 1];
      const isRamp = t.ramp[i] && t.ramp[i + 1];
      const gapA = sa === SURF.gap, gapB = sb === SURF.gap;
      const wall = gapA !== gapB;            // Schlucht-Kante: steile Felswand
      const surf = sa === sb ? sa : (sa === SURF.normal ? sb : sa);
      // Bodenfläche (Reihen von hinten nach vorne)
      for (let r = 0; r < ROWS.length - 1; r++) {
        const z0 = ROWS[r], z1 = ROWS[r + 1];
        let color = pick(pal.grass, i * 13 + r);
        const strip = z0 >= -4 && z1 <= FRONT_Z;   // Fahrspur und Vordergrund
        if (wall) color = pick(pal.gapWall, i * 3 + r);
        else if (gapA && gapB) color = r % 2 ? pal.gapFloor : pick(pal.gapWall, i + r);
        else if (isRamp) color = z0 === -1.6 ? pal.ramp[i % 2] : pal.dirt[r % pal.dirt.length];
        else if (surf === SURF.mud && strip) color = pick(pal.mud, i * 7 + r);
        else if (surf === SURF.sand && strip) color = pick(pal.sand, i * 5 + r);
        else if (surf === SURF.pad && z0 >= -1.6 && z1 <= 1.6) color = PAD_COLORS[i % 2];
        quad(la, lb, this.topY(xa, z0), z0, this.topY(xa, z1), z1, this.topY(xb, z1), z1, this.topY(xb, z0), z0, color, wall || gapA ? 0.06 : 0.12);
      }
      // Vorderkante (Erdschnitt)
      const ya = this.topY(xa, FRONT_Z), yb = this.topY(xb, FRONT_Z);
      const bottom = Math.min(-60, Math.min(ya, yb) - 12);
      const edgeCol = gapA || gapB ? pick(pal.gapWall, i) : surf === SURF.mud ? pal.mud[0] : pal.grassEdge;
      const F = FRONT_Z;
      quad(la, lb, ya, F, ya - 0.9, F, yb - 0.9, F, yb, F, edgeCol, 0.05);
      quad(la, lb, ya - 0.9, F, ya - 5, F, yb - 5, F, yb - 0.9, F, pick(pal.dirt, i), 0.1);
      quad(la, lb, ya - 5, F, bottom, F, bottom, F, yb - 5, F, pal.deepDirt, 0.06);
      // Hügel im Hintergrund (ohne Schlucht-Einschnitt)
      quad(la, lb, this.hillY(xa), -42, this.topY(xa, -18), -18, this.topY(xb, -18), -18, this.hillY(xb), -42, pick(pal.hills, i * 7), 0.1);
    }
    this.decor(gb, i0, i1, x0);
    const mesh = new THREE.Mesh(gb.geometry(), flatMat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  hillY(x) { return this.track.refHeightAt(x) * 0.5 + 4 + noise1(x / 23) * 10 + noise1(x / 7.5) * 2.5; }

  decor(gb, i0, i1, x0) {
    const pal = this.pal;
    const r = (k) => hash1(k);
    for (let i = i0; i < i1; i++) {
      const x = T_START + i * T_STEP + 1;    // absolut
      const lx = x - x0;                      // lokal
      if (x < 12 && x > -12) continue; // Platz für die Schleuder
      const sf = this.track.surf[i];
      if (sf === SURF.gap || this.track.surf[i + 1] === SURF.gap) continue;   // nichts in die Schlucht stellen
      // Strommasten geben ein Gefühl für Tempo
      if (i % 15 === 0) {
        const y = this.topY(x, -7);
        gb.part('cyl6', pal.pole, { x: lx, y: y + 4, z: -7, sx: 0.18, sz: 0.18, sy: 8 });
        gb.part('box', pal.pole, { x: lx, y: y + 7.4, z: -7, sx: 0.2, sy: 0.2, sz: 3 });
      }
      const h = r(i * 7.3 + 1.1);
      const z = -5 - r(i * 3.1) * 10;
      const y = this.topY(x, z > -7 ? -4 : -10) - 0.1;
      const k = i * 11.7;
      const type = this.decorType(h);
      if (type === 'rock') {
        const s = 0.5 + r(k) * 1.2;
        gb.part('ico', pal.rock[i % pal.rock.length], { x: lx, y: y + s * 0.4, z, s, sy: s * 0.7, ry: r(k + 1) * 6 }, 0.15);
      } else if (type === 'bush') {
        const s = 0.6 + r(k) * 0.8;
        gb.part('dodeca', pal.bush[i % pal.bush.length], { x: lx, y: y + s * 0.6, z, s }, 0.15);
        gb.part('dodeca', pal.bush[(i + 1) % pal.bush.length], { x: lx + s * 0.8, y: y + s * 0.4, z: z + 0.3, s: s * 0.7 }, 0.15);
      } else if (type === 'cactus') {
        const s = 0.8 + r(k) * 0.7;
        const c = pal.cactus[i % pal.cactus.length];
        gb.part('cyl6', c, { x: lx, y: y + 1.6 * s, z, sx: 0.35 * s, sz: 0.35 * s, sy: 3.2 * s }, 0.12);
        gb.part('cyl6', c, { x: lx + 0.55 * s, y: y + 2.0 * s, z, sx: 0.22 * s, sz: 0.22 * s, sy: 1.2 * s }, 0.12);
        gb.part('cyl6', c, { x: lx + 0.3 * s, y: y + 1.45 * s, z, sx: 0.2 * s, sz: 0.2 * s, sy: 0.7 * s, rz: Math.PI / 2 }, 0.12);
        gb.part('cyl6', c, { x: lx - 0.5 * s, y: y + 2.4 * s, z, sx: 0.2 * s, sz: 0.2 * s, sy: 1.0 * s }, 0.12);
        gb.part('cyl6', c, { x: lx - 0.28 * s, y: y + 1.95 * s, z, sx: 0.18 * s, sz: 0.18 * s, sy: 0.6 * s, rz: Math.PI / 2 }, 0.12);
      } else if (type === 'wreck') {
        // Autowrack
        const c = pal.wreck[i % pal.wreck.length];
        const ry = (r(k) - 0.5) * 1.2;
        const rz = (r(k + 2) - 0.5) * 0.3;
        gb.part('box', c, { x: lx, y: y + 0.55, z: z - 2, sx: 3.6, sy: 0.9, sz: 1.7, ry, rz }, 0.2);
        gb.part('box', c, { x: lx - 0.3, y: y + 1.25, z: z - 2, sx: 1.7, sy: 0.6, sz: 1.5, ry, rz: rz + 0.1 }, 0.2);
        gb.part('cyl8', '#2a2a2e', { x: lx + 2.2, y: y + 0.4, z: z - 0.8, sx: 0.5, sz: 0.5, sy: 0.35, rz: 1.4 });
      } else if (type === 'tires') {
        // Reifenhaufen
        gb.part('cyl10', '#2c2c30', { x: lx, y: y + 0.2, z, sx: 0.8, sz: 0.8, sy: 0.35 });
        gb.part('cyl10', '#34343a', { x: lx + 0.3, y: y + 0.55, z: z + 0.2, sx: 0.8, sz: 0.8, sy: 0.35, rz: 0.2 });
      }
      // kleine Steine vorne
      if (r(i * 5.3 + 9) < 0.07) {
        const s = 0.25 + r(i) * 0.35;
        gb.part('ico', pal.rock[(i + 1) % pal.rock.length], { x: lx, y: this.topY(x, FRONT_Z) + s * 0.3, z: 3.4, s }, 0.15);
      }
    }
  }
}
