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

    for (const m of [this.coins, this.rings, this.tires, this.scrap]) {
      m.castShadow = true;
      scene.add(m);
    }
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

    let nt = 0, ns = 0;
    if (objects) {
      for (const o of objects.obstacles) {
        if (!o.alive || o.x < minX || o.x > maxX) continue;
        _o.position.set(o.x, o.y0, 0);
        _o.rotation.set(0, 0, 0);
        _o.scale.setScalar(1);
        _o.updateMatrix();
        if (o.type === 'tires') this.tires.setMatrixAt(nt++, _o.matrix);
        else this.scrap.setMatrixAt(ns++, _o.matrix);
      }
    }
    this.tires.count = nt;
    this.scrap.count = ns;
    this.tires.instanceMatrix.needsUpdate = true;
    this.scrap.instanceMatrix.needsUpdate = true;
  }
}
