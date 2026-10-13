import * as THREE from 'three';
import { part, merge, flatMat } from './models.js';
import { OBJ } from '../game/objects.js';

const _o = new THREE.Object3D();

function instanced(geo, mat, max) {
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.count = 0;
  m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return m;
}

// Zeichnet Münzen, Ringe und Hindernisse als Instanzen (je Typ ein Draw Call).
export class ObjectsView {
  constructor(scene) {
    const coinGeo = merge([
      part('cyl8', '#ffd23f', { rx: Math.PI / 2, sx: 0.62, sz: 0.62, sy: 0.16 }),
      part('cyl8', '#ffae00', { rx: Math.PI / 2, sx: 0.36, sz: 0.36, sy: 0.2 }),
    ]);
    const coinMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#5a3a00' });
    this.coins = instanced(coinGeo, coinMat, 600);

    const ringGeo = merge([part(new THREE.TorusGeometry(OBJ.ringRadius, 0.3, 5, 18).toNonIndexed(), '#33e6ff')]);
    const ringMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#0b7a96' });
    this.rings = instanced(ringGeo, ringMat, 40);

    const t = OBJ.tires;
    const tireParts = [];
    for (let i = 0; i < 3; i++) {
      tireParts.push(part('cyl10', i % 2 ? '#2f2f35' : '#26262b', { y: 0.35 + i * 0.7, sx: t.w / 2, sz: t.w / 2, sy: 0.66, ry: i * 0.3 }, 0.1));
      tireParts.push(part('cyl10', '#e8b830', { y: 0.35 + i * 0.7, sx: t.w / 2 + 0.02, sz: t.w / 2 + 0.02, sy: 0.12, ry: i * 0.3 }));
    }
    this.tires = instanced(merge(tireParts), flatMat, 30);

    const s = OBJ.scrap;
    this.scrap = instanced(merge([
      part('box', '#9a4a2e', { y: 0.8, sx: s.w, sy: 1.6, sz: 2.2, ry: 0.1 }, 0.2),
      part('box', '#5b6e7a', { y: 2.3, sx: s.w * 0.9, sy: 1.4, sz: 2.0, ry: -0.15, rz: 0.05 }, 0.2),
      part('box', '#7d7f3a', { y: 3.7, sx: s.w * 0.8, sy: 1.3, sz: 1.8, ry: 0.2, rz: -0.06 }, 0.2),
      part('box', '#c03a2a', { y: 4.5, sx: 0.6, sy: 0.25, sz: 0.6 }),
    ]), flatMat, 30);

    const c = OBJ.cactus;
    this.cactus = instanced(merge([
      part('cyl6', '#4f8a4a', { y: c.h / 2, sx: 0.5, sz: 0.5, sy: c.h }, 0.12),
      part('cyl6', '#5c9a52', { x: 0.75, y: c.h * 0.62, sx: 0.3, sz: 0.3, sy: 1.4 }, 0.12),
      part('cyl6', '#5c9a52', { x: 0.45, y: c.h * 0.45, sx: 0.28, sz: 0.28, sy: 0.7, rz: Math.PI / 2 }, 0.12),
      part('cyl6', '#467d42', { x: -0.7, y: c.h * 0.72, sx: 0.28, sz: 0.28, sy: 1.1 }, 0.12),
      part('cyl6', '#467d42', { x: -0.42, y: c.h * 0.58, sx: 0.26, sz: 0.26, sy: 0.6, rz: Math.PI / 2 }, 0.12),
      part('cone5', '#ff6b8a', { y: c.h + 0.15, s: 0.3, sy: 0.3 }),
    ]), flatMat, 30);

    const pl = OBJ.pillar;
    this.pillar = instanced(merge([
      part(new THREE.CylinderGeometry(0.75, 1, 1, 6).toNonIndexed(), '#c2703f', { y: pl.h * 0.3, sx: pl.w / 2, sz: pl.w / 2.4, sy: pl.h * 0.6 }, 0.15),
      part(new THREE.CylinderGeometry(0.9, 0.75, 1, 6).toNonIndexed(), '#d08050', { y: pl.h * 0.8, sx: pl.w / 2, sz: pl.w / 2.4, sy: pl.h * 0.4, ry: 0.4 }, 0.15),
      part('box', '#e9a466', { y: pl.h * 0.6, sx: pl.w * 0.95, sy: 0.25, sz: pl.w * 0.8 }),
    ]), flatMat, 30);

    this.obstacleMeshes = { tires: this.tires, scrap: this.scrap, cactus: this.cactus, pillar: this.pillar };

    for (const m of [this.coins, this.rings, ...Object.values(this.obstacleMeshes)]) {
      m.castShadow = true;
      scene.add(m);
    }

    // Aufwind-Säulen: durchsichtige, flimmernde Röhren
    const thGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1, true);
    thGeo.translate(0, 0.5, 0);
    this.thermalMat = new THREE.MeshBasicMaterial({ color: '#fff6dc', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
    this.thermals = instanced(thGeo, this.thermalMat, 12);
    scene.add(this.thermals);
  }

  update(objects, camX, time) {
    const minX = camX - 70, maxX = camX + 160;
    let n = 0;
    if (objects) {
      for (const c of objects.coins) {
        if (!c.alive || c.x < minX || c.x > maxX || n >= 600) continue;
        _o.position.set(c.x, c.y, 0);
        _o.rotation.set(0, time * 3 + c.x * 0.3, 0);
        _o.scale.setScalar(c.big ? 1.9 : c.v > 1 ? 1.2 : 1);
        _o.updateMatrix();
        this.coins.setMatrixAt(n++, _o.matrix);
      }
    }
    this.coins.count = n;
    this.coins.instanceMatrix.needsUpdate = true;

    n = 0;
    if (objects) {
      for (const r of objects.rings) {
        if (r.x < minX || r.x > maxX) continue;
        _o.position.set(r.x, r.y, 0);
        _o.rotation.set(0, 1.15, 0);
        _o.scale.setScalar(r.passed ? 0.001 : 1 + Math.sin(time * 6 + r.x) * 0.04);
        _o.updateMatrix();
        this.rings.setMatrixAt(n++, _o.matrix);
      }
    }
    this.rings.count = n;
    this.rings.instanceMatrix.needsUpdate = true;

    const counts = {};
    for (const k of Object.keys(this.obstacleMeshes)) counts[k] = 0;
    if (objects) {
      for (const o of objects.obstacles) {
        if (!o.alive || o.x < minX || o.x > maxX) continue;
        const mesh = this.obstacleMeshes[o.type];
        if (!mesh) continue;
        _o.position.set(o.x, o.y0, 0);
        _o.rotation.set(0, 0, 0);
        _o.scale.setScalar(1);
        _o.updateMatrix();
        mesh.setMatrixAt(counts[o.type]++, _o.matrix);
      }
    }
    for (const [k, mesh] of Object.entries(this.obstacleMeshes)) {
      mesh.count = counts[k];
      mesh.instanceMatrix.needsUpdate = true;
    }

    n = 0;
    if (objects) {
      for (const th of objects.thermals) {
        if (th.x + th.w < minX || th.x - th.w > maxX) continue;
        _o.position.set(th.x, objects.ground(th.x) - 2, -1);
        _o.rotation.set(0, time * 0.5, 0);
        _o.scale.set(th.w, th.top * 1.6, th.w * 0.6);
        _o.updateMatrix();
        this.thermals.setMatrixAt(n++, _o.matrix);
      }
    }
    this.thermals.count = n;
    this.thermals.instanceMatrix.needsUpdate = true;
    this.thermalMat.opacity = 0.12 + Math.sin(time * 3) * 0.04;
  }
}
