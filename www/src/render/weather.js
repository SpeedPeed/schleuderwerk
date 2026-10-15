import * as THREE from 'three';
import { FX } from '../data/balance.js';

const _o = new THREE.Object3D();

// Regen (Gewittersteppe): dünne Striche als Instanzen um den Kamera-Blickpunkt, schräg nach dem Wind.
// Positionen werden relativ zur Kamera gehalten (kein Floating-Origin-Problem).
export class Rain {
  constructor(scene) {
    const R = FX.rain;
    this.n = R.drops;
    const geo = new THREE.BoxGeometry(0.05, 1, 0.05);
    const mat = new THREE.MeshBasicMaterial({ color: R.color, transparent: true, opacity: R.opacity, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.n);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.visible = false;
    scene.add(this.mesh);
    // Tropfen in einem Würfel um die Kamera: relative Lage 0…1 je Achse
    this.drops = Array.from({ length: this.n }, (_, i) => ({ u: Math.random(), v: Math.random(), w: Math.random(), s: 0.8 + Math.random() * 0.4, i }));
    this.on = false;
  }

  setActive(on) { this.on = on; this.mesh.visible = on; }

  // cam: Kamera-Ausgabe (lookX/lookY absolut, width/height), wind (m/s), originX
  update(dt, cam, wind, originX) {
    if (!this.on || !cam) return;
    const R = FX.rain;
    const W = cam.width * 1.3, H = cam.height * 1.3;
    const fall = R.speed / H;
    const slant = Math.atan2(wind * R.windMul, R.speed);
    const len = Math.min(R.maxLen, Math.max(R.minLen, cam.height * R.lenPerHeight));
    for (const d of this.drops) {
      d.v -= fall * d.s * dt;
      d.u += (wind * R.windMul * dt) / W;
      if (d.v < 0) { d.v += 1; d.u = Math.random(); }
      d.u -= Math.floor(d.u);
      _o.position.set(cam.lookX - originX + (d.u - 0.5) * W, cam.lookY + (d.v - 0.5) * H, (d.w - 0.5) * R.depth);
      _o.rotation.set(0, 0, slant);
      _o.scale.set(1, len, 1);
      _o.updateMatrix();
      this.mesh.setMatrixAt(d.i, _o.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
