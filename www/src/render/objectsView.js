import * as THREE from 'three';
import { part, merge, flatMatInstanced, shadowInstanced } from './models.js';
import { OBJ } from '../physics/objects.js';
import { RENDER } from '../data/balance.js';

const _o = new THREE.Object3D();

// Anzahl sichtbarer Instanzen setzen; leere InstancedMeshes werden gar nicht gezeichnet (spart Draw Calls)
function setCount(mesh, n) {
  mesh.count = n;
  mesh.visible = n > 0;
  if (n > 0) mesh.instanceMatrix.needsUpdate = true;
}

function instanced(geo, mat, max) {
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.count = 0;
  m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return m;
}

// Pickup-Modelle je Art (Kanister, Kühlpack, Reparaturset, Schrott, Item-Kiste, Blaupause)
function pickupGeos() {
  return {
    fuel: merge([
      part('box', '#d63a2f', { sx: 0.8, sy: 1.0, sz: 0.45 }, 0.1),
      part('box', '#a82a22', { y: 0.58, x: 0.18, sx: 0.36, sy: 0.18, sz: 0.3 }),
      part('cyl6', '#e8c83a', { y: 0.62, x: -0.2, sx: 0.1, sz: 0.1, sy: 0.25 }),
      part('box', '#f2f2f2', { z: 0.24, sx: 0.5, sy: 0.12, sz: 0.02 }),
    ]),
    cool: merge([
      part('box', '#e8f6ff', { sx: 0.95, sy: 0.6, sz: 0.55 }, 0.06),
      part('box', '#3fa9e0', { sx: 0.97, sy: 0.16, sz: 0.57 }),
      part('box', '#ffffff', { y: 0.36, sx: 0.4, sy: 0.12, sz: 0.2 }),
      part('ico', '#bfe8ff', { x: 0.55, y: 0.25, s: 0.18 }),
    ]),
    repair: merge([
      part('box', '#2f9e55', { sx: 0.9, sy: 0.55, sz: 0.5 }, 0.08),
      part('box', '#ffffff', { z: 0.26, sx: 0.42, sy: 0.12, sz: 0.02 }),
      part('box', '#ffffff', { z: 0.26, sx: 0.12, sy: 0.4, sz: 0.02 }),
      part('box', '#1f6e3b', { y: 0.33, sx: 0.4, sy: 0.1, sz: 0.12 }),
    ]),
    scrap: merge([
      part('box', '#9a4a2e', { sx: 0.7, sy: 0.4, sz: 0.6, ry: 0.3 }, 0.2),
      part('box', '#5b6e7a', { y: 0.3, x: 0.1, sx: 0.5, sy: 0.25, sz: 0.5, ry: -0.4, rz: 0.2 }, 0.2),
      part('cyl8', '#a36a2c', { y: 0.1, x: -0.3, rx: Math.PI / 2, sx: 0.2, sz: 0.2, sy: 0.4 }),
    ]),
    crate: merge([
      part('box', '#b07a3c', { s: 1.0 }, 0.1),
      part('box', '#7a5228', { sx: 1.04, sy: 0.14, sz: 1.04 }),
      part('box', '#7a5228', { sx: 0.14, sy: 1.04, sz: 1.04 }),
      part('box', '#ffd23f', { z: 0.53, sx: 0.32, sy: 0.32, sz: 0.02 }),
    ]),
    blueprint: merge([
      part('cyl8', '#3b74d6', { rz: Math.PI / 2, sx: 0.28, sz: 0.28, sy: 1.1 }, 0.05),
      part('box', '#e8f0ff', { y: -0.3, sx: 1.0, sy: 0.5, sz: 0.02 }),
      part('box', '#3b74d6', { y: -0.3, sx: 0.7, sy: 0.04, sz: 0.03 }),
      part('box', '#3b74d6', { y: -0.4, sx: 0.5, sy: 0.04, sz: 0.03 }),
    ]),
  };
}
export const PICKUP_KINDS = ['fuel', 'cool', 'repair', 'scrap', 'crate', 'blueprint'];

// Zeichnet Schrauben, Pickups, Ringe, Hindernisse und Aufwind-Säulen als Instanzen (je Typ ein Draw Call).
export class ObjectsView {
  constructor(scene) {
    // Schraube: Sechskantkopf + Schaft mit Gewinde-Ringen (Run-Währung 🔩)
    const boltGeo = merge([
      part('cyl6', '#d7dde3', { y: 0.32, sx: 0.4, sz: 0.4, sy: 0.2 }),
      part('cyl8', '#aab3bc', { y: -0.1, sx: 0.15, sz: 0.15, sy: 0.7 }),
      part('cyl8', '#8a939c', { y: -0.05, sx: 0.18, sz: 0.18, sy: 0.05 }),
      part('cyl8', '#8a939c', { y: -0.22, sx: 0.18, sz: 0.18, sy: 0.05 }),
      part('box', '#5a636c', { y: 0.43, sx: 0.36, sy: 0.04, sz: 0.06 }),
    ]);
    const boltMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#3a4450' });
    this.bolts = instanced(boltGeo, boltMat, 600);

    // Pickups: je Art ein instanziertes Modell
    const pg = pickupGeos();
    const pmat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#2a2018' });
    this.pickups = {};
    for (const k of PICKUP_KINDS) this.pickups[k] = instanced(pg[k], pmat, 40);

    const ringGeo = merge([part(new THREE.TorusGeometry(OBJ.ringRadius, 0.3, 5, 18).toNonIndexed(), '#33e6ff')]);
    const ringMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#0b7a96' });
    this.rings = instanced(ringGeo, ringMat, 40);

    const t = OBJ.tires;
    const tireParts = [];
    for (let i = 0; i < 3; i++) {
      tireParts.push(part('cyl10', i % 2 ? '#2f2f35' : '#26262b', { y: 0.35 + i * 0.7, sx: t.w / 2, sz: t.w / 2, sy: 0.66, ry: i * 0.3 }, 0.1));
      tireParts.push(part('cyl10', '#e8b830', { y: 0.35 + i * 0.7, sx: t.w / 2 + 0.02, sz: t.w / 2 + 0.02, sy: 0.12, ry: i * 0.3 }));
    }
    this.tires = instanced(merge(tireParts), flatMatInstanced, 30);

    // Schrottberg-Modell in voller Höhe (OBJ.scrapModelH), wird je Hindernis auf dessen Höhe skaliert
    const s = { w: OBJ.scrap.w };
    this.scrap = instanced(merge([
      part('box', '#9a4a2e', { y: 0.8, sx: s.w, sy: 1.6, sz: 2.2, ry: 0.1 }, 0.2),
      part('box', '#5b6e7a', { y: 2.3, sx: s.w * 0.9, sy: 1.4, sz: 2.0, ry: -0.15, rz: 0.05 }, 0.2),
      part('box', '#7d7f3a', { y: 3.7, sx: s.w * 0.8, sy: 1.3, sz: 1.8, ry: 0.2, rz: -0.06 }, 0.2),
      part('box', '#c03a2a', { y: 4.5, sx: 0.6, sy: 0.25, sz: 0.6 }),
    ]), flatMatInstanced, 30);

    const c = OBJ.cactus;
    this.cactus = instanced(merge([
      part('cyl6', '#4f8a4a', { y: c.h / 2, sx: 0.5, sz: 0.5, sy: c.h }, 0.12),
      part('cyl6', '#5c9a52', { x: 0.75, y: c.h * 0.62, sx: 0.3, sz: 0.3, sy: 1.4 }, 0.12),
      part('cyl6', '#5c9a52', { x: 0.45, y: c.h * 0.45, sx: 0.28, sz: 0.28, sy: 0.7, rz: Math.PI / 2 }, 0.12),
      part('cyl6', '#467d42', { x: -0.7, y: c.h * 0.72, sx: 0.28, sz: 0.28, sy: 1.1 }, 0.12),
      part('cyl6', '#467d42', { x: -0.42, y: c.h * 0.58, sx: 0.26, sz: 0.26, sy: 0.6, rz: Math.PI / 2 }, 0.12),
      part('cone5', '#ff6b8a', { y: c.h + 0.15, s: 0.3, sy: 0.3 }),
    ]), flatMatInstanced, 30);

    const pl = OBJ.pillar;
    this.pillar = instanced(merge([
      part(new THREE.CylinderGeometry(0.75, 1, 1, 6).toNonIndexed(), '#c2703f', { y: pl.h * 0.3, sx: pl.w / 2, sz: pl.w / 2.4, sy: pl.h * 0.6 }, 0.15),
      part(new THREE.CylinderGeometry(0.9, 0.75, 1, 6).toNonIndexed(), '#d08050', { y: pl.h * 0.8, sx: pl.w / 2, sz: pl.w / 2.4, sy: pl.h * 0.4, ry: 0.4 }, 0.15),
      part('box', '#e9a466', { y: pl.h * 0.6, sx: pl.w * 0.95, sy: 0.25, sz: pl.w * 0.8 }),
    ]), flatMatInstanced, 30);

    this.obstacleMeshes = { tires: this.tires, scrap: this.scrap, cactus: this.cactus, pillar: this.pillar };

    this.modelH = { tires: OBJ.tires.h, scrap: OBJ.scrapModelH, cactus: OBJ.cactus.h, pillar: OBJ.pillar.h };
    // für update(): Listen/Zähler einmal anlegen (keine Objekte pro Bild)
    this.obstacleKeys = Object.keys(this.obstacleMeshes);
    this.obstacleCounts = {};
    this.pickupCounts = {};
    for (const m of [this.bolts, this.rings, ...Object.values(this.pickups), ...Object.values(this.obstacleMeshes)]) {
      shadowInstanced(m);
      scene.add(m);
    }

    // Aufwind-Säulen: durchsichtige, flimmernde Röhren. forceSinglePass: durchsichtig + beidseitig würde three.js sonst
    // jedes Bild in zwei Durchgängen mit material.needsUpdate zeichnen (Shader-Programm wird jedes Mal neu gewählt).
    // Gilt genauso für die durchsichtigen Zonen in featuresView.js.
    const thGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1, true);
    thGeo.translate(0, 0.5, 0);
    this.thermalMat = new THREE.MeshBasicMaterial({ color: '#fff6dc', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
    this.thermals = instanced(thGeo, this.thermalMat, 12);
    scene.add(this.thermals);
  }

  // camX: absolute Kamera-x, originX: Render-Ursprung (alle Positionen relativ dazu)
  update(objects, camX, time, originX = 0) {
    const minX = camX - RENDER.objectsBehind, maxX = camX + RENDER.objectsAhead;
    let n = 0;
    if (objects) {
      for (let i150 = 0; i150 < objects.bolts.length; i150++) {
        const c = objects.bolts[i150];
        if (!c.alive || c.x < minX || c.x > maxX || n >= 600) continue;
        _o.position.set(c.x - originX, c.y, 0);
        _o.rotation.set(0.35, time * 3 + c.x * 0.3, 0.25);
        _o.scale.setScalar(c.big ? 1.9 : c.v > 1 ? 1.2 : 1);
        _o.updateMatrix();
        this.bolts.setMatrixAt(n++, _o.matrix);
      }
    }
    setCount(this.bolts, n);

    const pc = this.pickupCounts;
    for (const k of PICKUP_KINDS) pc[k] = 0;
    if (objects) {
      for (let i164 = 0; i164 < objects.pickups.length; i164++) {
        const c = objects.pickups[i164];
        if (!c.alive || c.x < minX || c.x > maxX) continue;
        const mesh = this.pickups[c.kind];
        if (!mesh || pc[c.kind] >= 40) continue;
        _o.position.set(c.x - originX, c.y + Math.sin(time * 3 + c.x) * 0.15, 0);
        _o.rotation.set(0.2, time * 1.6 + c.x, 0);
        _o.scale.setScalar(c.kind === 'scrap' ? 1.1 : 1.25);
        _o.updateMatrix();
        mesh.setMatrixAt(pc[c.kind]++, _o.matrix);
      }
    }
    for (const k of PICKUP_KINDS) setCount(this.pickups[k], pc[k]);

    n = 0;
    if (objects) {
      for (let i179 = 0; i179 < objects.rings.length; i179++) {
        const r = objects.rings[i179];
        if (r.x < minX || r.x > maxX) continue;
        _o.position.set(r.x - originX, r.y, 0);
        _o.rotation.set(0, 1.15, 0);
        _o.scale.setScalar(r.passed ? 0.001 : 1 + Math.sin(time * 6 + r.x) * 0.04);
        _o.updateMatrix();
        this.rings.setMatrixAt(n++, _o.matrix);
      }
    }
    setCount(this.rings, n);

    const counts = this.obstacleCounts;
    for (const k of this.obstacleKeys) counts[k] = 0;
    if (objects) {
      for (let i193 = 0; i193 < objects.obstacles.length; i193++) {
        const o = objects.obstacles[i193];
        if (!o.alive || o.x < minX || o.x > maxX) continue;
        const mesh = this.obstacleMeshes[o.type];
        if (!mesh) continue;
        _o.position.set(o.x - originX, o.y0, 0);
        _o.rotation.set(0, 0, 0);
        const sy = o.h / (this.modelH[o.type] || o.h);
        _o.scale.set(o.w / (OBJ[o.type] ? OBJ[o.type].w : o.w), sy, 1);
        _o.updateMatrix();
        mesh.setMatrixAt(counts[o.type]++, _o.matrix);
      }
    }
    for (const k of this.obstacleKeys) setCount(this.obstacleMeshes[k], counts[k]);

    n = 0;
    if (objects) {
      for (let i209 = 0; i209 < objects.thermals.length; i209++) {
        const th = objects.thermals[i209];
        if (th.x + th.w < minX || th.x - th.w > maxX) continue;
        _o.position.set(th.x - originX, objects.ground(th.x) - 2, -1);
        _o.rotation.set(0, time * 0.5, 0);
        _o.scale.set(th.w, th.top * 1.6, th.w * 0.6);
        _o.updateMatrix();
        this.thermals.setMatrixAt(n++, _o.matrix);
      }
    }
    setCount(this.thermals, n);
    this.thermalMat.opacity = 0.12 + Math.sin(time * 3) * 0.04;
  }
}
