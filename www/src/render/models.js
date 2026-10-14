import * as THREE from 'three';

// Alle Modelle entstehen per Code aus Grundformen. Mehrere Teile werden zu EINER Geometrie
// mit Vertex-Farben zusammengefügt -> wenige Draw Calls, flacher Low-Poly-Look.

export const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
// Eigenes Material für InstancedMeshes: teilen sich normale und instanzierte Meshes ein Material, wählt three.js
// bei jedem Wechsel das Shader-Programm neu aus (jedes Bild).
export const flatMatInstanced = flatMat.clone();

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

// Basisformen einmal anlegen und dann nur noch kopieren
export const SHAPES = {
  box: new THREE.BoxGeometry(1, 1, 1).toNonIndexed(),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8).toNonIndexed(),
  cyl10: new THREE.CylinderGeometry(1, 1, 1, 10).toNonIndexed(),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6).toNonIndexed(),
  cone5: new THREE.ConeGeometry(1, 1, 5).toNonIndexed(),
  cone7: new THREE.ConeGeometry(1, 1, 7).toNonIndexed(),
  ico: new THREE.IcosahedronGeometry(1, 0),       // Polyeder sind schon ohne Index
  ico1: new THREE.IcosahedronGeometry(1, 1),      // feinerer Polyeder (z. B. rollende Bälle)
  dodeca: new THREE.DodecahedronGeometry(1, 0),
  tetra: new THREE.TetrahedronGeometry(1, 0),
};

// Ein Teil: Form + Farbe + Lage. jitter variiert die Helligkeit je Dreieck leicht.
export function part(shape, color, o = {}, jitter = 0, rng = Math.random) {
  const g = (typeof shape === 'string' ? SHAPES[shape] : shape).clone();
  _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
  _q.setFromEuler(_e);
  _p.set(o.x || 0, o.y || 0, o.z || 0);
  _s.set(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1);
  _m.compose(_p, _q, _s);
  g.applyMatrix4(_m);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i += 3) {
    const k = jitter ? 1 + (rng() - 0.5) * jitter : 1;
    for (let j = 0; j < 3 && i + j < n; j++) {
      col[(i + j) * 3] = _c.r * k;
      col[(i + j) * 3 + 1] = _c.g * k;
      col[(i + j) * 3 + 2] = _c.b * k;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function merge(parts) {
  let total = 0;
  for (const p of parts) total += p.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3);
    col.set(p.attributes.color.array, o * 3);
    o += p.attributes.position.count;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// ---------- Schleuder ----------
const _up = new THREE.Vector3(0, 1, 0);
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();

// Alle Teile hängen an `root`. Innen wird in absoluten Koordinaten gerechnet,
// root.position.x = -origin.x verschiebt alles zum Render-Ursprung (Floating Origin).
export class Slingshot {
  constructor(scene, groundY, restY, pal) {
    this.root = new THREE.Group();
    scene.add(this.root);
    this.restY = restY;
    this.postX = 2.9; // Gabel steht vor dem Auto, das Auto wird nach hinten gezogen
    const wood = '#7a5232', dark = '#5a3a20';
    const postH = restY - groundY + 1.2;
    const parts = [
      part('box', '#8e6a44', { x: 0, y: groundY + 0.25, sx: 9, sy: 0.5, sz: 6.5 }, 0.15),
      part('box', '#6f5236', { x: 0, y: groundY - 0.6, sx: 8.6, sy: 1.4, sz: 6.1 }, 0.1),
    ];
    for (const z of [2.4, -2.4]) {
      parts.push(part('cyl8', wood, { x: this.postX, y: groundY + postH / 2, z, sx: 0.32, sz: 0.32, sy: postH }, 0.15));
      parts.push(part('cyl8', dark, { x: this.postX, y: groundY + postH + 0.2, z, sx: 0.45, sz: 0.45, sy: 0.4 }));
      parts.push(part('box', wood, { x: this.postX + 1.1, y: groundY + postH * 0.42, z, sx: 0.25, sy: postH * 0.9, sz: 0.25, rz: 0.45 }));
    }
    parts.push(part('box', dark, { x: this.postX, y: groundY + 0.9, sx: 0.35, sy: 0.35, sz: 5.0 }));
    const mesh = new THREE.Mesh(merge(parts), flatMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);

    this.topY = groundY + postH;
    const bandGeo = new THREE.CylinderGeometry(0.09, 0.09, 1, 5);
    bandGeo.translate(0, 0.5, 0);
    const bandMat = new THREE.MeshLambertMaterial({ color: '#c0392b', flatShading: true });
    this.bands = [2.4, -2.4].map((z) => {
      const m = new THREE.Mesh(bandGeo, bandMat);
      m.userData.z = z;
      this.root.add(m);
      return m;
    });
    const pouchGeo = merge([part('box', '#4a2d1c', { sx: 0.35, sy: 1.1, sz: 2.4 })]);
    this.pouch = new THREE.Mesh(pouchGeo, flatMat);
    this.root.add(this.pouch);
    this.end = new THREE.Vector3(this.postX, this.topY, 0);
    this.vel = new THREE.Vector3();
  }

  setOrigin(originX) { this.root.position.x = -originX; }

  // attached: Band hängt am Auto; sonst schwingt es zurück in die Ruhelage (car in absoluten Koordinaten,
  // car.back = Abstand Fahrzeugmitte → Heck, dort sitzt die Schlaufe)
  update(dt, car, attached) {
    if (attached) {
      const back = car.back || 2.3;
      this.end.set(car.x - Math.cos(car.angle) * back, car.y - Math.sin(car.angle) * back, 0);
      this.vel.set(0, 0, 0);
    } else {
      const k = 160, d = 9;
      this.vel.x += ((this.postX - this.end.x) * k - this.vel.x * d) * dt;
      this.vel.y += ((this.topY - this.end.y) * k - this.vel.y * d) * dt;
      this.end.addScaledVector(this.vel, dt);
    }
    for (const b of this.bands) {
      _from.set(this.postX, this.topY + 0.1, b.userData.z);
      _to.set(this.end.x, this.end.y, Math.sign(b.userData.z) * 1.15); // seitlich am Auto vorbei
      _to.sub(_from);
      const len = _to.length() || 0.01;
      b.position.copy(_from);
      b.quaternion.setFromUnitVectors(_up, _to.normalize());
      b.scale.set(1, len, 1);
    }
    this.pouch.position.copy(this.end);
    this.pouch.rotation.z = attached ? car.angle : 0;
  }
}

// ---------- Rekord-Flagge ----------
export function buildFlag() {
  const g = merge([
    part('cyl6', '#e8e8e8', { y: 3, sx: 0.12, sz: 0.12, sy: 6 }),
    part('box', '#e8313d', { x: 1.0, y: 5.3, sx: 2.0, sy: 1.2, sz: 0.08 }),
    part('box', '#ffffff', { x: 0.6, y: 5.3, sx: 0.4, sy: 1.22, sz: 0.1 }),
    part('box', '#ffffff', { x: 1.4, y: 5.3, sx: 0.4, sy: 1.22, sz: 0.1 }),
    part('cyl6', '#555555', { y: 0.15, sx: 0.5, sz: 0.5, sy: 0.3 }),
  ]);
  const m = new THREE.Mesh(g, flatMat);
  m.castShadow = true;
  return m;
}
