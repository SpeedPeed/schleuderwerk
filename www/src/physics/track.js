import { makeRng } from '../core/rng.js';
import { smoothstep, DEG } from '../core/math.js';
import { TRACK } from '../data/balance.js';

// Die Strecke ist eine Höhenlinie mit einem Punkt alle T_STEP Meter (absolute x-Koordinaten).
export const T_STEP = TRACK.step;
export const T_START = TRACK.start;
export const PLATEAU_H = TRACK.plateauH;

export class Track {
  constructor(world) {
    this.world = world;
    this.rng = makeRng(world.seed);
    this.phases = world.terrain.hills.map(() => this.rng.next() * Math.PI * 2);
    this.h = [];       // Höhen
    this.ramp = [];    // 1 = Punkt gehört zu einer Rampe
    this.ramps = [];
    this.curRamp = null;
    this.nextRamp = world.terrain.firstRampX;
    this.ensure(TRACK.initialLength);
  }

  get xEnd() { return T_START + (this.h.length - 1) * T_STEP; }

  base(x) {
    const t = this.world.terrain;
    const amp = Math.min(1, TRACK.ampBase + Math.max(0, x) / t.ampGrowth);
    let y = 0;
    t.hills.forEach(([A, L], i) => { y += A * Math.sin(x / L + this.phases[i]); });
    y *= amp;
    if (x <= TRACK.plateauEnd) return PLATEAU_H;
    if (x < TRACK.blendEnd) {
      const k = smoothstep(TRACK.plateauEnd, TRACK.blendEnd, x);
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
        const H = r.range(t.rampHeight[0], t.rampHeight[1]);
        const ang = r.range(t.rampAngleDeg[0], t.rampAngleDeg[1]) * DEG;
        const L = Math.max(TRACK.minRampLength, Math.round(H / Math.tan(ang) / T_STEP) * T_STEP);
        this.curRamp = { x0: x, x1: x + L, H };
        this.ramps.push(this.curRamp);
      }
      if (this.curRamp) {
        const cr = this.curRamp;
        if (x <= cr.x1) {
          y += ((x - cr.x0) / (cr.x1 - cr.x0)) * cr.H;
          isRamp = 1;
        } else {
          this.nextRamp = x + r.range(t.rampEvery[0], t.rampEvery[1]);
          this.curRamp = null;
        }
      }
      this.h.push(y);
      this.ramp.push(isRamp);
    }
  }

  // Index des Höhenpunkts links von x; erzeugt die Strecke bei Bedarf weiter (ohne Allokation)
  index(x) {
    if (x > this.xEnd - TRACK.ensureMargin) this.ensure(x + TRACK.ensureAhead);
    const f = (x - T_START) / T_STEP;
    return f <= 0 ? 0 : Math.floor(f);
  }

  heightAt(x) {
    const i = this.index(x);
    const t = i === 0 && x <= T_START ? 0 : (x - T_START) / T_STEP - i;
    return this.h[i] * (1 - t) + this.h[i + 1] * t;
  }

  slopeAt(x) {
    const i = this.index(x);
    return (this.h[i + 1] - this.h[i]) / T_STEP;
  }

  // Liegt irgendein Teil von [x0, x1] auf einer Rampe?
  rampBetween(x0, x1) {
    for (let x = x0; x <= x1; x += T_STEP) {
      const i = this.index(x);
      if (this.ramp[i] || this.ramp[i + 1]) return true;
    }
    return false;
  }
}
