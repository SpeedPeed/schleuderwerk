import * as THREE from 'three';
import { FX } from '../data/balance.js';

const _o = new THREE.Object3D();
const _c = new THREE.Color();
const D = FX.particleDefaults;

// Farb-Texte nur einmal parsen: '#ff8a3d' → THREE.Color (geteilt, nie verändert)
const COLORS = new Map();
function colorOf(css) {
  let c = COLORS.get(css);
  if (!c) { c = new THREE.Color(css); COLORS.set(css, c); }
  return c;
}

// Ein gemeinsamer Partikel-Pool aus kleinen Low-Poly-Körpern (1 Draw Call).
// Feste Anzahl vorab angelegter Partikel – keine Allokationen pro Bild.
// Positionen sind absolut; gezeichnet wird relativ zum Render-Ursprung (Floating Origin).
export class Particles {
  constructor(scene, max) {
    this.max = max;
    const geo = new THREE.IcosahedronGeometry(0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    _c.set('#ffffff');
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, _c);
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.pool = Array.from({ length: max }, () => ({
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, g: 0, color: _c, rot: 0,
    }));
    this.count = 0;     // lebende Partikel liegen in pool[0 … count-1]
    this.oldest = 0;    // wird überschrieben, wenn der Pool voll ist
  }

  // o: { n, colors[], speed, spread (rad), dir (rad), life, size, gravity, z, zSpread, zSpeed, vx, vy, jitter }
  // Fehlende Werte kommen aus FX.particleDefaults.
  emit(x, y, o) {
    const n = o.n || D.n;
    for (let i = 0; i < n; i++) {
      let p;
      if (this.count < this.max) p = this.pool[this.count++];
      else { p = this.pool[this.oldest]; this.oldest = (this.oldest + 1) % this.max; }
      const dir = (o.dir ?? D.dir) + (Math.random() - 0.5) * (o.spread ?? D.spread);
      const sp = (o.speed ?? D.speed) * (0.4 + Math.random() * 0.8);
      const life = (o.life ?? D.life) * (0.6 + Math.random() * 0.6);
      p.x = x + (Math.random() - 0.5) * (o.jitter ?? D.jitter);
      p.y = y + (Math.random() - 0.5) * (o.jitter ?? D.jitter);
      p.z = (o.z ?? D.z) + (Math.random() - 0.5) * (o.zSpread ?? D.zSpread);
      p.vx = Math.cos(dir) * sp + (o.vx || 0);
      p.vy = Math.sin(dir) * sp + (o.vy || 0);
      p.vz = (Math.random() - 0.5) * (o.zSpeed ?? D.zSpeed);
      p.life = life;
      p.max = life;
      p.size = (o.size ?? D.size) * (0.6 + Math.random() * 0.8);
      p.g = o.gravity ?? D.gravity;
      p.color = colorOf(o.colors[Math.floor(Math.random() * o.colors.length)]);
      p.rot = Math.random() * 6;
    }
  }

  update(dt, originX = 0) {
    const pool = this.pool;
    let i = 0;
    while (i < this.count) {
      const p = pool[i];
      p.life -= dt;
      if (p.life <= 0) {
        // tauschen statt löschen: letzter lebender Partikel rückt nach
        this.count--;
        pool[i] = pool[this.count];
        pool[this.count] = p;
        continue;
      }
      p.vy -= p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += dt * 4;
      const k = p.life / p.max;
      _o.position.set(p.x - originX, p.y, p.z);
      _o.rotation.set(p.rot, p.rot * 0.7, 0);
      _o.scale.setScalar(p.size * (0.3 + 0.7 * k));
      _o.updateMatrix();
      this.mesh.setMatrixAt(i, _o.matrix);
      this.mesh.setColorAt(i, p.color);   // fertige THREE.Color aus dem Cache – kein Parsen pro Bild
      i++;
    }
    if (this.oldest >= this.count) this.oldest = 0;
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this.count = 0; this.oldest = 0; this.mesh.count = 0; }
}
