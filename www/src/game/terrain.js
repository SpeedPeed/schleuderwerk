import { mulberry32, range } from './rng.js';

// Die Strecke ist eine Höhenlinie mit einem Punkt alle T_STEP Meter.
export const T_STEP = 2;
export const T_START = -80;
export const PLATEAU_H = 5;    // Hügel, auf dem die Schleuder steht
const PLATEAU_END = 6;
const BLEND_END = 34;
const DEG = Math.PI / 180;

const smooth = (t) => t * t * (3 - 2 * t);

export class Terrain {
  constructor(world) {
    this.world = world;
    this.rng = mulberry32(world.seed);
    this.phases = world.terrain.hills.map(() => this.rng() * Math.PI * 2);
    this.h = [];       // Höhen
    this.ramp = [];    // 1 = Punkt gehört zu einer Rampe
    this.ramps = [];
    this.curRamp = null;
    this.nextRamp = world.terrain.firstRampX;
    this.ensure(800);
  }

  get xEnd() { return T_START + (this.h.length - 1) * T_STEP; }

  base(x) {
    const t = this.world.terrain;
    const amp = Math.min(1, 0.35 + Math.max(0, x) / t.ampGrowth);
    let y = 0;
    t.hills.forEach(([A, L], i) => { y += A * Math.sin(x / L + this.phases[i]); });
    y *= amp;
    if (x <= PLATEAU_END) return PLATEAU_H;
    if (x < BLEND_END) {
      const k = smooth((x - PLATEAU_END) / (BLEND_END - PLATEAU_END));
      return PLATEAU_H * (1 - k) + y * k;
    }
    return y;
  }

  ensure(xMax) {
    const t = this.world.terrain;
    const r = this.rng;
    while (this.h.length < 2 || this.xEnd < xMax) {
      const x = T_START + this.h.length * T_STEP;
      let y = this.base(x);
      let isRamp = 0;
      if (!this.curRamp && x >= this.nextRamp) {
        const H = range(r, t.rampHeight[0], t.rampHeight[1]);
        const ang = range(r, t.rampAngleDeg[0], t.rampAngleDeg[1]) * DEG;
        const L = Math.max(4, Math.round(H / Math.tan(ang) / T_STEP) * T_STEP);
        this.curRamp = { x0: x, x1: x + L, H };
        this.ramps.push(this.curRamp);
      }
      if (this.curRamp) {
        const cr = this.curRamp;
        if (x <= cr.x1) {
          y += ((x - cr.x0) / (cr.x1 - cr.x0)) * cr.H;
          isRamp = 1;
        } else {
          this.nextRamp = x + range(r, t.rampEvery[0], t.rampEvery[1]);
          this.curRamp = null;
        }
      }
      this.h.push(y);
      this.ramp.push(isRamp);
    }
  }

  index(x) {
    if (x > this.xEnd - 4) this.ensure(x + 400);
    const f = (x - T_START) / T_STEP;
    if (f <= 0) return [0, 0];
    const i = Math.floor(f);
    return [i, f - i];
  }

  heightAt(x) {
    const [i, t] = this.index(x);
    return this.h[i] * (1 - t) + this.h[i + 1] * t;
  }

  slopeAt(x) {
    const [i] = this.index(x);
    return (this.h[i + 1] - this.h[i]) / T_STEP;
  }

  // Liegt irgendein Teil von [x0, x1] auf einer Rampe?
  rampBetween(x0, x1) {
    for (let x = x0; x <= x1; x += T_STEP) {
      const [i] = this.index(x);
      if (this.ramp[i] || this.ramp[i + 1]) return true;
    }
    return false;
  }
}
