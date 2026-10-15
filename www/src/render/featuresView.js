import * as THREE from 'three';
import { part, merge, flatMat } from './models.js';
import { PHYSICS, FEATURES } from '../data/balance.js';

// Sichtbare Streckenbausteine einer Etappe (aus track.features) und ihre beweglichen Teile (aus objects):
// Looping-Ring, Schrottpresse (Gerüst + Pressblock), Magnetkran (Turm, Ausleger, Magnet, Feld), Hitzefelder
// (glühender Boden + Flimmern), Windzonen (Windsäcke), Blitzzonen (Blitzableiter, Gewitterwolke, Warnring, Blitz),
// Warnschilder vor Schluchten, Blasen im Schlamm.
// Floating Origin: jedes Teil hat lokale Koordinaten um einen Anker (x) und wird mit x - origin.x platziert.

const _o = new THREE.Object3D();
const HAZARD = ['#f2c12e', '#26262b'];

// Blitz: Zickzack aus dünnen Kästen, Höhe 1 (wird auf die Wolkenhöhe skaliert)
function boltGeo() {
  const parts = [];
  let x = 0, y = 1;
  const pts = [[0, 1]];
  for (let i = 1; i <= 7; i++) {
    y = 1 - i / 7;
    x = i === 7 ? 0 : (i % 2 ? 1 : -1) * (0.04 + 0.05 * Math.sin(i * 2.1));
    pts.push([x, y]);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    parts.push(part('box', i % 2 ? '#fffbe0' : '#ffffff', { x: (ax + bx) / 2, y: (ay + by) / 2, sx: 0.012, sy: len, sz: 0.012, rz: -Math.atan2(bx - ax, by - ay) }));
  }
  return merge(parts);
}

export class FeaturesView {
  constructor(scene) {
    this.scene = scene;
    this.statics = [];      // { mesh, x }
    this.blocks = [];       // Pressblöcke { mesh, piston, x, crusher }
    this.cranes = [];       // { head, cable, field, x, arm, magnet }
    this.shimmers = [];     // { mesh, x, phase }
    this.strikeMat = new THREE.MeshBasicMaterial({ color: '#ffe36a', transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
    this.ringGeo = new THREE.RingGeometry(FEATURES.lightning.radius * 0.75, FEATURES.lightning.radius, 20);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.warns = [];
    this.boltMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.boltGeo = boltGeo();
    this.bolts = [];
    this.fieldMat = new THREE.MeshBasicMaterial({ color: '#7fd4ff', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
    this.heatMat = new THREE.MeshBasicMaterial({ color: '#ff7a2e', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    this.glowMat = new THREE.MeshBasicMaterial({ color: '#ff5a1f', transparent: true, opacity: 0.32, depthWrite: false });
  }

  add(parts, x, list = this.statics, mat = flatMat) {
    const mesh = new THREE.Mesh(merge(parts), mat);
    mesh.castShadow = mat === flatMat;
    mesh.receiveShadow = mat === flatMat;
    this.scene.add(mesh);
    const e = { mesh, x };
    list.push(e);
    return e;
  }

  clear() {
    for (const list of [this.statics, this.blocks, this.shimmers]) {
      for (const e of list) { this.scene.remove(e.mesh); e.mesh.geometry.dispose(); if (e.piston) { this.scene.remove(e.piston); e.piston.geometry.dispose(); } }
      list.length = 0;
    }
    for (const c of this.cranes) for (const m of [c.head, c.cable, c.field]) { this.scene.remove(m); m.geometry.dispose(); }
    this.cranes.length = 0;
    for (const m of [...this.warns, ...this.bolts]) this.scene.remove(m);
    this.warns.length = 0;
    this.bolts.length = 0;
  }

  // Alle Bausteine der Strecke aufbauen
  build(track, objects) {
    this.clear();
    if (!track || !track.features) return;
    const H = (x) => track.heightAt(x);
    for (const f of track.features) {
      switch (f.type) {
        case 'loop': this.buildLoop(f); break;
        case 'crusher': this.buildCrusher(f, objects); break;
        case 'magnetZone': this.buildCrane(f, H); break;
        case 'heatZone': this.buildHeat(f, H); break;
        case 'wind': this.buildWind(f, H); break;
        case 'lightning': this.buildLightning(f, H); break;
        case 'gap': this.buildSign(f.x0 + 4, H(f.x0 + 4)); break;
        case 'mud': this.buildMud(f, H); break;
        default: break;
      }
    }
  }

  buildLoop(f) {
    const R = f.r + PHYSICS.rideHeight;
    const cy = f.yr + PHYSICS.rideHeight + f.r;
    const open = 0.9;   // unten offen (dort fährt man ein und aus)
    const parts = [];
    for (const z of [-1.15, 1.15]) {
      const g = new THREE.TorusGeometry(R + 0.2, 0.22, 6, 40, Math.PI * 2 - open).toNonIndexed();
      parts.push(part(g, z > 0 ? '#d9452f' : '#e8e8e8', { y: 0, z, rz: -Math.PI / 2 + open / 2 }));
    }
    // Querbohlen
    for (let k = 0; k < 22; k++) {
      const a = -Math.PI / 2 + open / 2 + (k / 21) * (Math.PI * 2 - open);
      parts.push(part('box', k % 2 ? '#8a6d4b' : '#7a5d3d', { x: Math.cos(a) * (R + 0.42), y: Math.sin(a) * (R + 0.42), sx: 0.35, sy: 0.18, sz: 2.6, rz: a + Math.PI / 2 }));
    }
    // Stützen
    for (const sx of [-1, 1]) {
      parts.push(part('box', '#5a5f68', { x: sx * (R + 0.6), y: -cy + f.yr + (cy - f.yr) / 2, z: -1.9, sx: 0.35, sy: cy - f.yr, sz: 0.35 }));
      parts.push(part('box', '#5a5f68', { x: sx * (R + 0.6), y: -cy + f.yr + (cy - f.yr) / 2, z: 1.9, sx: 0.35, sy: cy - f.yr, sz: 0.35 }));
    }
    const e = this.add(parts, f.lx);
    e.y = cy;
  }

  buildCrusher(f, objects) {
    const C = FEATURES.crusher;
    const y0 = f.yr;
    const w = f.w;
    const parts = [];
    for (const sx of [-1, 1]) for (const z of [-2.3, 2.3]) {
      parts.push(part('box', '#5a5f68', { x: sx * (w / 2 + 0.55), y: y0 + C.gantryH / 2, z, sx: 0.5, sy: C.gantryH, sz: 0.5 }, 0.1));
    }
    parts.push(part('box', '#4a4f57', { y: y0 + C.gantryH + 0.4, sx: w + 1.8, sy: 0.8, sz: 5.2 }, 0.08));
    for (let k = 0; k < 6; k++) parts.push(part('box', HAZARD[k % 2], { x: -w / 2 - 0.6 + (k + 0.5) * ((w + 1.2) / 6), y: y0 + C.gantryH + 0.4, z: 2.62, sx: (w + 1.2) / 6, sy: 0.5, sz: 0.04 }));
    this.add(parts, f.cx);
    // Pressblock (beweglich)
    const bp = [part('box', '#3f444c', { y: C.blockH / 2, sx: w, sy: C.blockH, sz: 3.8 }, 0.06)];
    for (let k = 0; k < 5; k++) bp.push(part('box', HAZARD[k % 2], { x: -w / 2 + (k + 0.5) * (w / 5), y: 0.2, z: 1.92, sx: w / 5, sy: 0.35, sz: 0.04 }));
    const block = this.add(bp, f.cx, this.blocks);
    block.crusher = objects ? objects.crushers.find((c) => Math.abs(c.x - f.cx) < 0.01) : null;
    block.y0 = y0;
    const piston = new THREE.Mesh(merge([part('cyl8', '#c9ccd2', { y: 0.5, sx: 0.35, sz: 0.35, sy: 1 })]), flatMat);
    this.scene.add(piston);
    block.piston = piston;
  }

  buildCrane(f, H) {
    const M = FEATURES.magnet;
    const tx = f.x1 + 6;
    const base = H(tx);
    const top = base + M.height + 8;
    const parts = [];
    parts.push(part('box', '#d9a441', { x: 0, y: (base + top) / 2, z: -7, sx: 1.4, sy: top - base, sz: 1.4 }, 0.08));
    for (let k = 0; k < 6; k++) parts.push(part('box', '#26262b', { y: base + (k + 0.5) * ((top - base) / 6), z: -6.28, sx: 1.42, sy: 0.25, sz: 0.04, rz: 0.6 }));
    const armL = tx - f.x0 + 6;
    parts.push(part('box', '#d9a441', { x: -armL / 2, y: top, z: -7, sx: armL, sy: 0.9, sz: 1.0 }, 0.08));
    parts.push(part('box', '#4a4f57', { x: -armL / 2, y: top + 0.6, z: -7, sx: armL, sy: 0.25, sz: 0.4 }));
    parts.push(part('box', '#3f444c', { x: 2.2, y: top + 1, z: -7, sx: 3, sy: 2, sz: 2 }, 0.06));
    this.add(parts, tx);
    const head = new THREE.Mesh(merge([
      part('cyl10', '#2c2f36', { sx: 1.7, sz: 1.7, sy: 0.9 }, 0.05),
      part('cyl10', '#c0392b', { y: -0.5, sx: 1.75, sz: 1.75, sy: 0.18 }),
      part('box', '#5a5f68', { y: 0.7, sx: 0.4, sy: 0.6, sz: 0.4 }),
    ]), flatMat);
    head.castShadow = true;
    const cable = new THREE.Mesh(merge([part('cyl6', '#1d1f24', { y: 0.5, sx: 0.08, sz: 0.08, sy: 1 })]), flatMat);
    const fg = new THREE.ConeGeometry(M.radius * 0.55, M.height, 14, 1, true);
    fg.translate(0, -M.height / 2, 0);
    const field = new THREE.Mesh(fg, this.fieldMat);
    for (const m of [head, cable, field]) this.scene.add(m);
    this.cranes.push({ head, cable, field, top, magnet: null, x0: f.x0, x1: f.x1 });
  }

  buildHeat(f, H) {
    // glühender Boden (Streifen) + flimmernde Luft
    const pos = [];
    for (let x = f.x0; x < f.x1; x += 2) {
      const a = H(x) + 0.08, b = H(x + 2) + 0.08;
      const la = x - f.x0, lb = la + 2;
      pos.push(la, a, -3, la, a, 3, lb, b, 3, la, a, -3, lb, b, 3, lb, b, -3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const glow = new THREE.Mesh(g, this.glowMat);
    this.scene.add(glow);
    this.shimmers.push({ mesh: glow, x: f.x0, phase: 0, glow: true });
    const n = Math.max(2, Math.round((f.x1 - f.x0) / 16));
    for (let k = 0; k < n; k++) {
      const x = f.x0 + ((k + 0.5) / n) * (f.x1 - f.x0);
      const pg = new THREE.PlaneGeometry(9, 7, 1, 3);
      const m = new THREE.Mesh(pg, this.heatMat);
      m.userData.baseY = H(x) + 3.4;
      this.scene.add(m);
      this.shimmers.push({ mesh: m, x, phase: k * 1.7, z: -1.5 + (k % 3) * 1.5 });
    }
  }

  buildWind(f, H) {
    const dir = Math.sign(f.wind) || 1;
    for (const x of [f.x0 + 2, f.x1 - 2]) {
      const y = H(x);
      const parts = [part('cyl6', '#8a8f96', { y: y + 3, z: -3.5, sx: 0.12, sz: 0.12, sy: 6 })];
      for (let k = 0; k < 4; k++) {
        parts.push(part('cyl8', k % 2 ? '#ffffff' : '#ff6b2d', { x: dir * (0.45 + k * 0.5), y: y + 5.6 - k * 0.12, z: -3.5, sx: 0.42 - k * 0.07, sz: 0.42 - k * 0.07, sy: 0.5, rz: -dir * (Math.PI / 2 - 0.15) }));
      }
      this.add(parts, x);
    }
  }

  buildLightning(f, H) {
    for (const x of [f.x0 + 1, f.x1 - 1]) {
      const y = H(x);
      this.add([
        part('cyl6', '#8a8f96', { y: y + 4.5, z: -4.5, sx: 0.1, sz: 0.1, sy: 9 }),
        part('cone5', '#c8ccd4', { y: y + 9.4, z: -4.5, s: 0.18, sy: 0.8 }),
        part('box', '#f2c12e', { y: y + 2.2, z: -4.4, sx: 0.7, sy: 0.7, sz: 0.04, rz: Math.PI / 4 }),
      ], x);
    }
    // Gewitterwolke über der Zone
    const cx = (f.x0 + f.x1) / 2;
    const cy = H(cx) + 34;
    const parts = [];
    const n = Math.max(3, Math.round((f.x1 - f.x0) / 14));
    for (let k = 0; k < n; k++) {
      const x = -((f.x1 - f.x0) / 2) + ((k + 0.5) / n) * (f.x1 - f.x0);
      const s = 7 + ((k * 37) % 5);
      parts.push(part('ico', k % 2 ? '#3a4150' : '#2e3440', { x, y: cy + (k % 2) * 2, z: -14, s, sy: s * 0.55 }, 0.08));
    }
    this.add(parts, cx);
  }

  buildSign(x, y) {
    this.add([
      part('cyl6', '#6b4a2b', { y: y + 1.2, z: -2.8, sx: 0.1, sz: 0.1, sy: 2.4 }),
      part('box', HAZARD[0], { y: y + 2.5, z: -2.75, sx: 1.2, sy: 1.2, sz: 0.06, rz: Math.PI / 4 }),
      part('box', HAZARD[1], { y: y + 2.6, z: -2.7, sx: 0.14, sy: 0.55, sz: 0.04 }),
      part('box', HAZARD[1], { y: y + 2.2, z: -2.7, sx: 0.14, sy: 0.14, sz: 0.04 }),
    ], x);
  }

  buildMud(f, H) {
    const parts = [];
    for (let x = f.x0 + 3; x < f.x1 - 2; x += 5.5) {
      const k = Math.sin(x * 12.9898) * 43758.5453;
      const r = k - Math.floor(k);
      parts.push(part('ico', '#3a2a1a', { x: x - f.x0, y: H(x) + 0.05, z: -1 + r * 3, s: 0.25 + r * 0.25, sy: 0.12 }, 0.1));
    }
    if (parts.length) this.add(parts, f.x0);
  }

  // Jedes Bild: Positionen relativ zum Ursprung, bewegliche Teile aus objects
  update(objects, time, originX) {
    for (const e of this.statics) {
      e.mesh.position.x = e.x - originX;
      if (e.y !== undefined) e.mesh.position.y = e.y;
    }
    const C = FEATURES.crusher;
    for (const b of this.blocks) {
      const lift = b.crusher ? b.crusher.lift : C.openY;
      const by = b.y0 + lift;
      b.mesh.position.set(b.x - originX, by, 0);
      const top = b.y0 + C.gantryH;
      const len = Math.max(0.1, top - (by + C.blockH));
      b.piston.position.set(b.x - originX, by + C.blockH, 0);
      b.piston.scale.set(1, len, 1);
    }
    for (let i = 0; i < this.cranes.length; i++) {
      const c = this.cranes[i];
      const m = objects && objects.magnets[i];
      if (!m) continue;
      c.head.position.set(m.hx - originX, m.hy + 0.5, 0);
      c.cable.position.set(m.hx - originX, m.hy + 0.9, 0);
      c.cable.scale.set(1, Math.max(0.1, c.top - m.hy - 0.9), 1);
      c.field.position.set(m.hx - originX, m.hy, 0);
      c.field.material.opacity = 0.1 + 0.07 * Math.sin(time * 8);
    }
    for (const s of this.shimmers) {
      if (s.glow) { s.mesh.position.x = s.x - originX; s.mesh.material.opacity = 0.22 + 0.1 * Math.sin(time * 3); continue; }
      s.mesh.position.set(s.x - originX, s.mesh.userData.baseY + Math.sin(time * 1.3 + s.phase) * 0.4, s.z);
      s.mesh.scale.set(1 + 0.08 * Math.sin(time * 5 + s.phase), 1 + 0.12 * Math.sin(time * 3.3 + s.phase), 1);
    }
    this.heatMat.opacity = 0.08 + 0.05 * Math.sin(time * 4.1);
    // Blitze: Warnring (pulsierend) bzw. Blitz
    let nw = 0, nb = 0;
    if (objects) {
      for (const s of objects.strikes) {
        if (s.t > 0) {
          const m = this.warns[nw] || this.addPooled(this.warns, new THREE.Mesh(this.ringGeo, this.strikeMat));
          m.visible = true;
          m.position.set(s.x - originX, s.y + 0.15, 0);
          const k = 1 - s.t / FEATURES.lightning.warn;
          m.scale.setScalar(0.6 + 0.4 * k + 0.08 * Math.sin(time * 30));
          nw++;
        } else if (s.flash > 0) {
          const m = this.bolts[nb] || this.addPooled(this.bolts, new THREE.Mesh(this.boltGeo, this.boltMat));
          m.visible = true;
          m.position.set(s.x - originX, s.y, 0);
          m.scale.set(60, 40, 60);
          nb++;
        }
      }
    }
    this.strikeMat.opacity = 0.45 + 0.35 * Math.abs(Math.sin(time * 14));
    for (let i = nw; i < this.warns.length; i++) this.warns[i].visible = false;
    for (let i = nb; i < this.bolts.length; i++) this.bolts[i].visible = false;
  }

  addPooled(list, mesh) {
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    list.push(mesh);
    return mesh;
  }
}
