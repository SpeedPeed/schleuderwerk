import * as THREE from 'three';

// Kamera folgt dem Auto mit Vorausblick, zoomt mit Tempo/Höhe heraus und kann wackeln.
export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.x = 0; this.y = 8;
    this.width = 26;
    this.shakeAmt = 0;
    this.time = 0;
    this.look = new THREE.Vector3();
  }

  shake(a) { this.shakeAmt = Math.min(1.2, Math.max(this.shakeAmt, a)); }

  snap(x, y, width) { this.x = x; this.y = y; this.width = width; }

  // Gewünschte Ansicht: Mittelpunkt (tx, ty) und sichtbare Breite in Metern
  update(dt, tx, ty, width, speed = 5) {
    this.time += dt;
    const kp = 1 - Math.exp(-dt * speed);
    const kw = 1 - Math.exp(-dt * 2.2);
    this.x += (tx - this.x) * kp;
    this.y += (ty - this.y) * kp;
    this.width += (width - this.width) * kw;

    const cam = this.cam;
    const tanH = Math.tan((cam.fov * Math.PI) / 360);
    // Abstand so wählen, dass die gewünschte Breite sichtbar ist (Hochformat!) und mind. 18 m Höhe
    const dist = Math.max(this.width / (2 * tanH * cam.aspect), 18 / (2 * tanH));
    let sx = 0, sy = 0;
    if (this.shakeAmt > 0.001) {
      const a = this.shakeAmt * 0.6;
      sx = (Math.random() - 0.5) * a;
      sy = (Math.random() - 0.5) * a;
      this.shakeAmt *= Math.exp(-dt * 7);
    }
    cam.position.set(this.x - dist * 0.16 + sx, this.y + dist * 0.14 + sy, dist);
    this.look.set(this.x + sx * 0.5, this.y + sy * 0.5, 0);
    cam.lookAt(this.look);
    this.dist = dist;
  }
}
