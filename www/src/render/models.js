import * as THREE from 'three';

// Alle Modelle entstehen per Code aus Grundformen. Mehrere Teile werden zu EINER Geometrie
// mit Vertex-Farben zusammengefügt -> wenige Draw Calls, flacher Low-Poly-Look.

export const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
// Eigenes Material für InstancedMeshes: teilen sich normale und instanzierte Meshes ein Material, wählt three.js
// bei jedem Wechsel das Shader-Programm neu aus (jedes Bild).
export const flatMatInstanced = flatMat.clone();
// Dasselbe Problem im Schattenpass: three.js nutzt dort EIN Tiefen-Material für alle Objekte und wechselt bei jedem
// Wechsel zwischen InstancedMesh und Mesh das Shader-Programm (inkl. Neuberechnung der Programm-Parameter).
// Instanzierte Schattenwerfer bekommen deshalb ein eigenes Tiefen-Material (shadowInstanced).
export const instancedDepthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
export function shadowInstanced(mesh) {
  mesh.castShadow = true;
  mesh.customDepthMaterial = instancedDepthMat;
  return mesh;
}

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

// Farb-Texte nur einmal parsen ('#ff8a3d' → THREE.Color, geteilt, nie verändert)
const COLORS = new Map();
export function colorOf(css) {
  let c = COLORS.get(css);
  if (!c) { c = new THREE.Color(css); COLORS.set(css, c); }
  return c;
}

// Baut eine Geometrie (Positionen + Vertex-Farben) direkt in einen wiederverwendeten Puffer – ohne Zwischen-Arrays und
// ohne geklonte Teil-Geometrien (Gelände-Stücke entstehen während der Fahrt; jede Allokation dort wäre eine GC-Spitze).
// Ergebnis von geometry(): eine BufferGeometry mit passgenauen Kopien, wie merge([...]).
const _v3 = new THREE.Vector3();
export class GeoBuilder {
  constructor(capVerts = 8192) {
    this.pos = new Float32Array(capVerts * 3);
    this.col = new Float32Array(capVerts * 3);
    this.n = 0;   // Anzahl Ecken
  }

  reset() { this.n = 0; return this; }

  ensure(extra) {
    const need = (this.n + extra) * 3;
    if (need <= this.pos.length) return;
    let cap = this.pos.length;
    while (cap < need) cap *= 2;
    const p = new Float32Array(cap), c = new Float32Array(cap);
    p.set(this.pos.subarray(0, this.n * 3));
    c.set(this.col.subarray(0, this.n * 3));
    this.pos = p;
    this.col = c;
  }

  vert(x, y, z, r, g, b) {
    const i = this.n * 3;
    this.pos[i] = x; this.pos[i + 1] = y; this.pos[i + 2] = z;
    this.col[i] = r; this.col[i + 1] = g; this.col[i + 2] = b;
    this.n++;
  }

  // Viereck a-b-c-d als zwei Dreiecke (a,b,c) + (a,c,d); a/b liegen bei x = xa, c/d bei x = xb.
  // Jedes Dreieck bekommt eine eigene Helligkeits-Abweichung (k1, k2).
  quad(xa, xb, ya, za, yb, zb, yc, zc, yd, zd, color, k1, k2) {
    this.ensure(6);
    const r = color.r, g = color.g, b = color.b;
    this.vert(xa, ya, za, r * k1, g * k1, b * k1);
    this.vert(xa, yb, zb, r * k1, g * k1, b * k1);
    this.vert(xb, yc, zc, r * k1, g * k1, b * k1);
    this.vert(xa, ya, za, r * k2, g * k2, b * k2);
    this.vert(xb, yc, zc, r * k2, g * k2, b * k2);
    this.vert(xb, yd, zd, r * k2, g * k2, b * k2);
  }

  // wie part(): Grundform transformieren und einfärben (jitter je Dreieck), direkt in den Puffer
  part(shape, color, o = {}, jitter = 0, rng = Math.random) {
    const src = (typeof shape === 'string' ? SHAPES[shape] : shape).attributes.position;
    const cnt = src.count;
    this.ensure(cnt);
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
    _q.setFromEuler(_e);
    _p.set(o.x || 0, o.y || 0, o.z || 0);
    _s.set(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1);
    _m.compose(_p, _q, _s);
    const c = typeof color === 'string' ? colorOf(color) : color;
    let k = 1;
    for (let i = 0; i < cnt; i++) {
      if (i % 3 === 0) k = jitter ? 1 + (rng() - 0.5) * jitter : 1;
      _v3.fromBufferAttribute(src, i).applyMatrix4(_m);
      this.vert(_v3.x, _v3.y, _v3.z, c.r * k, c.g * k, c.b * k);
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, this.n * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, this.n * 3), 3));
    g.computeVertexNormals();
    return g;
  }
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

// ---------- Ziel-/Medaillen-Flagge (Farbe: Bronze, Silber, Gold) ----------
export function buildFlag(color = '#e8313d', stripe = '#ffffff') {
  const g = merge([
    part('cyl6', '#e8e8e8', { y: 3.5, sx: 0.14, sz: 0.14, sy: 7 }),
    part('box', color, { x: 1.2, y: 6.2, sx: 2.4, sy: 1.4, sz: 0.08 }),
    part('box', stripe, { x: 0.7, y: 6.2, sx: 0.4, sy: 1.42, sz: 0.1 }),
    part('box', stripe, { x: 1.7, y: 6.2, sx: 0.4, sy: 1.42, sz: 0.1 }),
    part('ico', color, { y: 7.1, s: 0.3 }),
    part('cyl6', '#555555', { y: 0.15, sx: 0.5, sz: 0.5, sy: 0.3 }),
  ]);
  const m = new THREE.Mesh(g, flatMat);
  m.castShadow = true;
  return m;
}
