import { CAMERA } from '../data/balance.js';
import { clamp, lerp, approach, smoothstep, DEG } from '../core/math.js';
import { makeRng } from '../core/rng.js';

// Kamera-Logik OHNE three.js (testbar mit node --test).
// Ergebnis jeder Aktualisierung (`out`):
//   x, y, dist   – Kamera-Position (z = dist), leicht schräg links oberhalb des Blickpunkts
//   lookX, lookY – Blickpunkt auf der Ebene z = 0 (dort fährt das Auto)
//   width, height – sichtbare Breite/Höhe in Höhe des Blickpunkts (Näherung)
//   shakeX, shakeY – Wackel-Versatz (nur Darstellung, nicht Teil der Garantie)
//   indicator    – { show, side, text, dist }: Boden-Pfeil, wenn der Boden nicht im Bild ist
// Die Anwendung auf die THREE-Kamera passiert in main.js (inkl. Floating Origin).

// 8 Randpunkte des Auto-Kreises (alle 45°)
const RING = Array.from({ length: 8 }, (_, k) => [Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)]);
const _b = { fx: 0, fy: 0, fz: 0, rx: 0, rz: 0, ux: 0, uy: 0, uz: 0 };

// Kamera-Basis (vorwärts f, rechts r, oben u) wie THREE.Object3D.lookAt mit up = +y
function basis(cam, b) {
  let fx = cam.lookX - cam.x, fy = cam.lookY - cam.y, fz = -cam.dist;
  const fl = Math.hypot(fx, fy, fz);
  fx /= fl; fy /= fl; fz /= fl;
  // r = f × up = (-fz, 0, fx)
  let rx = -fz, rz = fx;
  const rl = Math.hypot(rx, rz);
  rx /= rl; rz /= rl;
  // u = r × f
  b.fx = fx; b.fy = fy; b.fz = fz;
  b.rx = rx; b.rz = rz;
  b.ux = -rz * fy;
  b.uy = rz * fx - rx * fz;
  b.uz = rx * fy;
  return b;
}

// Projiziert den Weltpunkt (px, py, pz) in Normalized Device Coordinates (-1 … 1 = Bildrand).
// cam: { x, y, dist, lookX, lookY }. out: { x, y, z } (z = Tiefe vor der Kamera in m)
export function projectNdc(cam, aspect, fovDeg, px, py, pz = 0, out = { x: 0, y: 0, z: 0 }) {
  const b = basis(cam, _b);
  const tanH = Math.tan((fovDeg * DEG) / 2);
  const dx = px - cam.x, dy = py - cam.y, dz = pz - cam.dist;
  const zc = dx * b.fx + dy * b.fy + dz * b.fz;
  const xc = dx * b.rx + dz * b.rz;
  const yc = dx * b.ux + dy * b.uy + dz * b.uz;
  out.x = xc / (zc * tanH * aspect);
  out.y = yc / (zc * tanH);
  out.z = zc;
  return out;
}

// Umkehrung: Bildpunkt (NDC) → Punkt auf der Ebene z = 0
export function unprojectToPlane(cam, aspect, fovDeg, nx, ny, out = { x: 0, y: 0 }) {
  const b = basis(cam, _b);
  const tanH = Math.tan((fovDeg * DEG) / 2);
  const ax = nx * tanH * aspect, ay = ny * tanH;
  const dx = b.fx + b.rx * ax + b.ux * ay;
  const dy = b.fy + b.uy * ay;
  const dz = b.fz + b.rz * ax + b.uz * ay;
  const t = -cam.dist / dz;
  out.x = cam.x + dx * t;
  out.y = cam.y + dy * t;
  return out;
}

export class CameraRig {
  constructor(cfg = CAMERA) {
    this.cfg = cfg;
    this.x = 0;           // Blickpunkt (vor der Klemmung weich verfolgt)
    this.y = 0;
    this.width = cfg.minWidth;
    this.shakeAmt = 0;
    this.rng = makeRng('kamera-wackeln');
    this.indM = -1;
    this._p = { x: 0, y: 0, z: 0 };
    this._q = { x: 0, y: 0 };
    this.out = {
      x: 0, y: 0, dist: 1, lookX: 0, lookY: 0, width: cfg.minWidth, height: cfg.minHeight,
      shakeX: 0, shakeY: 0,
      indicator: { show: false, side: 'bottom', text: '', dist: 0 },
    };
  }

  snap(x, y, width) { this.x = x; this.y = y; this.width = width; }

  shake(a) { this.shakeAmt = Math.min(this.cfg.shake.max, Math.max(this.shakeAmt, a)); }

  // Abstand, damit `width` sichtbar ist – mindestens minHeight Höhe (Querformat)
  distFor(width, aspect, tanH) {
    return Math.max(width / (2 * tanH * aspect), this.cfg.minHeight / (2 * tanH));
  }

  pose(dist, aspect, tanH) {
    const o = this.out, c = this.cfg;
    o.x = this.x - dist * c.slantX;
    o.y = this.y + dist * c.slantY;
    o.dist = dist;
    o.lookX = this.x;
    o.lookY = this.y;
    o.height = 2 * dist * tanH;
    o.width = o.height * aspect;
  }

  // HARTE GARANTIE: Kamera und Blickpunkt so verschieben, dass alle Randpunkte des Autos
  // (Kreis mit Radius R um px, py) mit echter Perspektive im Sicherheitsrahmen liegen.
  keepInFrame(px, py, R, aspect, fovDeg, tanH, dist) {
    const c = this.cfg;
    const lim = 1 - 2 * c.safeMargin;   // Rahmenkante in NDC (12 % vom Rand = 0,76)
    const goal = lim - 1e-4;            // minimal nach innen zielen (Rundungsreserve)
    const p = this._p, q = this._q;
    // Vorstufe: Auto weit draußen oder hinter der Kamera (z. B. nach einem Sprung) → Blickpunkt aufs Auto
    this.pose(dist, aspect, tanH);
    projectNdc(this.out, aspect, fovDeg, px, py, 0, p);
    if (!(p.z > 0) || Math.abs(p.x) > c.recenterNdc || Math.abs(p.y) > c.recenterNdc) {
      this.x = px;
      this.y = py;
    }
    for (let it = 0; it < c.frameIterations; it++) {
      this.pose(dist, aspect, tanH);
      const e = this.extent(px, py, R, aspect, fovDeg);
      let sx = 0, sy = 0;
      if (e.maxX > goal) sx = goal - e.maxX;
      else if (e.minX < -goal) sx = -goal - e.minX;
      if (e.maxY > goal) sy = goal - e.maxY;
      else if (e.minY < -goal) sy = -goal - e.minY;
      if (sx === 0 && sy === 0) return;
      // Den Bildpunkt suchen, an dem das Auto landen soll, und die Kamera parallel verschieben
      projectNdc(this.out, aspect, fovDeg, px, py, 0, p);
      unprojectToPlane(this.out, aspect, fovDeg, p.x + sx, p.y + sy, q);
      this.x += px - q.x;
      this.y += py - q.y;
    }
    this.pose(dist, aspect, tanH);
    // Rückfall (sollte nie nötig sein): Auto genau in die Bildmitte
    const e = this.extent(px, py, R, aspect, fovDeg);
    if (e.maxX > lim || e.minX < -lim || e.maxY > lim || e.minY < -lim) {
      this.x = px;
      this.y = py;
      this.pose(dist, aspect, tanH);
    }
  }

  // Ausdehnung des Auto-Kreises im Bild (NDC) bei der aktuellen Pose
  extent(px, py, R, aspect, fovDeg) {
    const p = this._p, e = this._e || (this._e = { minX: 0, maxX: 0, minY: 0, maxY: 0 });
    e.minX = Infinity; e.maxX = -Infinity; e.minY = Infinity; e.maxY = -Infinity;
    for (let k = 0; k < RING.length; k++) {
      const cx = RING[k][0], cy = RING[k][1];
      projectNdc(this.out, aspect, fovDeg, px + cx * R, py + cy * R, 0, p);
      if (p.x < e.minX) e.minX = p.x;
      if (p.x > e.maxX) e.maxX = p.x;
      if (p.y < e.minY) e.minY = p.y;
      if (p.y > e.maxY) e.maxY = p.y;
    }
    return e;
  }

  updateShake(dt) {
    const s = this.cfg.shake;
    const o = this.out;
    if (this.shakeAmt > s.min) {
      const a = this.shakeAmt * s.amp;
      o.shakeX = (this.rng.next() - 0.5) * a;
      o.shakeY = (this.rng.next() - 0.5) * a;
      this.shakeAmt *= Math.exp(-dt * s.decay);
    } else {
      o.shakeX = 0;
      o.shakeY = 0;
    }
  }

  // Boden-Indikator: Liegt der Boden unter dem Auto unterhalb des Bildrands?
  updateIndicator(gx, gy, alt, aspect, fovDeg) {
    const ind = this.out.indicator;
    const p = projectNdc(this.out, aspect, fovDeg, gx, gy, 0, this._p);
    ind.show = p.y < -1 + this.cfg.indicatorEdge;
    ind.dist = alt;
    if (ind.show) {
      const m = Math.round(alt);
      if (m !== this.indM) {
        this.indM = m;
        ind.text = `Boden ↓ ${m.toLocaleString('de-DE')} m`;
      }
    }
  }

  // Flugkamera. t = { x, y, vx, vy, groundY, aspect, fovDeg, alt? }
  // groundY = Höhe der Bodenlinie unter dem Auto; alt (optional) = angezeigte Höhe über Grund.
  update(dt, t) {
    const c = this.cfg;
    const aspect = t.aspect, fovDeg = t.fovDeg;
    const tanH = Math.tan((fovDeg * DEG) / 2);
    const R = c.carRadius;
    const speed = Math.hypot(t.vx, t.vy);
    const alt = Math.max(0, t.y - t.groundY);

    // Zoom: Tempo-Anteil oder so weit, dass Auto + Boden ins Bild passen (höchstens maxWidth).
    // Dabei soll das Auto nicht höher als groundFitTop unter den oberen Rand rücken (dort ist das HUD).
    // Im Querformat wird der Bereich mit dem Seitenverhältnis gestreckt (dann gilt er für die Höhe).
    const wide = Math.max(1, aspect);
    const usable = 1 - c.groundFitTop - c.groundPad;
    const needW = ((alt + R) / usable) * aspect / wide;
    const fAlt = clamp((needW - c.minWidth) / (c.maxWidth - c.minWidth), 0, 1);
    const fSpeed = clamp(speed / c.zoomSpeedRef, 0, 1);
    this.width = approach(this.width, lerp(c.minWidth, c.maxWidth, Math.max(fSpeed, fAlt)) * wide, c.zoomK, dt);
    const dist = this.distFor(this.width, aspect, tanH);
    const H = 2 * dist * tanH, W = H * aspect;

    // Weiche Verfolgung mit Vorausschau in Bewegungsrichtung
    let tx = t.x + clamp(t.vx * c.lookAhead, -W * c.lookBack, W * c.lookFwd);
    const tyCar = t.y + H * c.carBelowCenter + clamp(t.vy * c.lookAhead, -H * c.lookDown, H * c.lookUp);
    // Boden möglichst im Bild: Kamera senken, bis der Boden groundPad über dem unteren Rand liegt –
    // höchstens so weit, dass das Auto bis groundFitTop an den oberen Rand rückt. Passt der Boden
    // auch so nicht mehr ins Bild, wird er weich losgelassen (Auto wieder nahe der Mitte, Boden-Pfeil).
    const tyComfort = t.y + R - H * (0.5 - c.groundFitTop);
    const tyGround = Math.max(t.groundY + H * (0.5 - c.groundPad), tyComfort);
    const fit = H * usable;
    const release = smoothstep(fit, fit * c.groundRelease, alt + R);
    let ty = lerp(Math.min(tyCar, tyGround), tyCar, release);
    // Schon das Ziel hält das Auto (ungefähr) im Sicherheitsrahmen – das Auto hat Vorrang vor dem Boden
    const halfW = Math.max(0, W * (0.5 - c.safeMargin) - R);
    const halfH = Math.max(0, H * (0.5 - c.safeMargin) - R);
    tx = clamp(tx, t.x - halfW, t.x + halfW);
    ty = clamp(ty, t.y - halfH, t.y + halfH);
    this.x = approach(this.x, tx, c.followK, dt);
    this.y = approach(this.y, ty, c.followK, dt);

    // Danach die harte Klemmung: Das Auto hat immer Vorrang
    this.keepInFrame(t.x, t.y, R, aspect, fovDeg, tanH, dist);
    this.updateShake(dt);
    this.updateIndicator(t.x, t.groundY, t.alt ?? alt, aspect, fovDeg);
    return this.out;
  }

  // Feste Ansicht (Werkstatt, Zielen): v = { x, y, width, k, aspect, fovDeg, car? }
  // Mit `car` ({ x, y }) gilt dieselbe Garantie wie im Flug.
  frame(dt, v) {
    const c = this.cfg;
    const tanH = Math.tan((v.fovDeg * DEG) / 2);
    this.x = approach(this.x, v.x, v.k, dt);
    this.y = approach(this.y, v.y, v.k, dt);
    this.width = approach(this.width, v.width, c.zoomK, dt);
    const dist = this.distFor(this.width, v.aspect, tanH);
    if (v.car) this.keepInFrame(v.car.x, v.car.y, c.carRadius, v.aspect, v.fovDeg, tanH, dist);
    else this.pose(dist, v.aspect, tanH);
    this.updateShake(dt);
    this.out.indicator.show = false;
    return this.out;
  }
}
