import * as THREE from 'three';

const _o = new THREE.Object3D();
const _c = new THREE.Color();

// Ein gemeinsamer Partikel-Pool aus kleinen Low-Poly-Würfeln (1 Draw Call).
export class Particles {
  constructor(scene, max) {
    this.max = max;
    const geo = new THREE.IcosahedronGeometry(0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, _c.set('#ffffff'));
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.list = [];
  }

  // o: { n, colors[], speed, spread (rad), dir (rad), life, size, gravity, z }
  emit(x, y, o) {
    const n = o.n || 8;
    for (let i = 0; i < n; i++) {
      if (this.list.length >= this.max) this.list.shift();
      const dir = (o.dir ?? Math.PI / 2) + (Math.random() - 0.5) * (o.spread ?? Math.PI * 2);
      const sp = (o.speed ?? 6) * (0.4 + Math.random() * 0.8);
      const life = (o.life ?? 0.8) * (0.6 + Math.random() * 0.6);
      this.list.push({
        x: x + (Math.random() - 0.5) * (o.jitter ?? 0.4),
        y: y + (Math.random() - 0.5) * (o.jitter ?? 0.4),
        z: (o.z ?? 0) + (Math.random() - 0.5) * (o.zSpread ?? 1.5),
        vx: Math.cos(dir) * sp + (o.vx || 0),
        vy: Math.sin(dir) * sp + (o.vy || 0),
        vz: (Math.random() - 0.5) * (o.zSpeed ?? 2),
        life, max: life,
        size: (o.size ?? 0.4) * (0.6 + Math.random() * 0.8),
        g: o.gravity ?? 0,
        color: o.colors[Math.floor(Math.random() * o.colors.length)],
        rot: Math.random() * 6,
      });
    }
  }

  update(dt) {
    let n = 0;
    const keep = [];
    for (const p of this.list) {
      p.life -= dt;
      if (p.life <= 0) continue;
      keep.push(p);
      p.vy -= p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += dt * 4;
      const k = p.life / p.max;
      _o.position.set(p.x, p.y, p.z);
      _o.rotation.set(p.rot, p.rot * 0.7, 0);
      _o.scale.setScalar(p.size * (0.3 + 0.7 * k));
      _o.updateMatrix();
      this.mesh.setMatrixAt(n, _o.matrix);
      this.mesh.setColorAt(n, _c.set(p.color));
      n++;
    }
    this.list = keep;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this.list = []; }
}
