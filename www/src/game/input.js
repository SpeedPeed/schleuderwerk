// Ein-Finger-Eingabe: Ziehen (Schleuder), Wischen (Drehen), Halten (Boost).
export class Input {
  constructor(el) {
    this.reset();
    el.addEventListener('pointerdown', (e) => {
      if (this.id !== null) return;
      this.id = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* egal */ }
      const t = performance.now();
      this.down = true;
      this.x = this.startX = e.clientX;
      this.y = this.startY = e.clientY;
      this.downAt = t;
      this.samples = [{ t, x: e.clientX }];
      this.onDown && this.onDown();
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.id) return;
      this.dx += e.clientX - this.x;
      this.x = e.clientX;
      this.y = e.clientY;
      const t = performance.now();
      this.samples.push({ t, x: e.clientX });
      while (this.samples.length > 2 && t - this.samples[0].t > 100) this.samples.shift();
    });
    const up = (e) => {
      if (e.pointerId !== this.id) return;
      const t = performance.now();
      const recent = this.samples.filter((s) => t - s.t < 90);
      let vx = 0;
      if (recent.length >= 2) {
        const a = recent[0], b = recent[recent.length - 1];
        vx = (b.x - a.x) / Math.max(0.016, (b.t - a.t) / 1000);
      }
      this.releaseVX = vx;
      this.released = true;
      this.down = false;
      this.id = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  reset() {
    this.id = null;
    this.down = false;
    this.x = this.y = this.startX = this.startY = 0;
    this.downAt = 0;
    this.dx = 0;
    this.samples = [];
    this.released = false;
    this.releaseVX = 0;
  }

  get holdTime() { return this.down ? (performance.now() - this.downAt) / 1000 : 0; }

  takeDX() { const d = this.dx; this.dx = 0; return d; }

  takeRelease() {
    if (!this.released) return null;
    this.released = false;
    return this.releaseVX;
  }
}
