import { makeRng } from '../core/rng.js';
import { smoothstep, DEG } from '../core/math.js';
import { TRACK, FEATURES } from '../data/balance.js';
import { biomeById } from '../data/biomes.js';
import { generateStageSpec } from './trackGen.js';

// Die Strecke ist eine Höhenlinie mit einem Punkt alle T_STEP Meter (absolute x-Koordinaten).
export const T_STEP = TRACK.step;
export const T_START = TRACK.start;
export const PLATEAU_H = TRACK.plateauH;

// Oberflächen je Höhenpunkt (für Darstellung und Reibung)
export const SURF = { normal: 0, ramp: 1, gap: 2, mud: 3, sand: 4, pad: 5 };

// Strecke einer Etappe aus der StageSpec (physics/trackGen.js): Grund-Hügel des Bioms + Bausteine
// (Rampen, Schluchten, eingeebnete Flächen für Looping/Presse, Hügel, Schlamm/Sand). Hinter dem Bausteinbereich
// geht es mit Hügeln und gelegentlichen Rampen endlos weiter.
// Kompatibel: new Track(biome) baut eine einfache Etappe (Etage 0) des Bioms.
export class Track {
  constructor(spec, biome = null) {
    if (!spec || !Array.isArray(spec.features)) {
      biome = spec;
      spec = generateStageSpec({ biome, kind: 'stage', floor: 0, rng: makeRng(`strecke:${biome.id}`) });
    }
    this.spec = spec;
    this.biome = biome || biomeById(spec.biome);
    this.terrain = this.biome.terrain;
    this.rng = makeRng(spec.seed >>> 0);
    this.phases = this.terrain.hills.map(() => this.rng.next() * Math.PI * 2);
    // Bausteine (sortiert) mit Bezugshöhe yr für eingeebnete Abschnitte
    this.features = spec.features.map((f) => ({ ...f })).sort((a, b) => a.x0 - b.x0);
    for (const f of this.features) {
      const anchor = f.type === 'gap' ? f.edge : f.type === 'loop' ? f.lx : f.type === 'crusher' ? f.cx : null;
      if (anchor !== null) f.yr = this.base(anchor);
    }
    this.gaps = this.features.filter((f) => f.type === 'gap');
    this.loops = this.features.filter((f) => f.type === 'loop');
    this.featureEnd = this.features.length ? this.features[this.features.length - 1].x1 : 0;
    this.h = [];       // Höhen
    this.ramp = [];    // 1 = Punkt gehört zu einer Rampe (auch Schlucht-Absprung)
    this.surf = [];    // Oberfläche (SURF)
    this.ramps = [];
    this.fi = 0;       // Baustein-Zeiger für ensure()
    this.curRamp = null;
    this.nextRamp = Math.max(spec.length || 0, this.featureEnd) + this.rng.range(20, 60);
    this.ensure(TRACK.initialLength);
  }

  get xEnd() { return T_START + (this.h.length - 1) * T_STEP; }

  // Grund-Hügel ohne Bausteine
  base(x) {
    const t = this.terrain;
    const amp = Math.min(1, TRACK.ampBase + Math.max(0, x) / t.ampGrowth);
    let y = 0;
    for (let i = 0; i < t.hills.length; i++) y += t.hills[i][0] * Math.sin(x / t.hills[i][1] + this.phases[i]);
    y *= amp;
    if (x <= TRACK.plateauEnd) return PLATEAU_H;
    if (x < TRACK.blendEnd) {
      const k = smoothstep(TRACK.plateauEnd, TRACK.blendEnd, x);
      return PLATEAU_H * (1 - k) + y * k;
    }
    return y;
  }

  // Höhe und Oberfläche eines Punkts innerhalb eines Bausteins → this._y, this._s
  featurePoint(f, x, b) {
    let y = b, s = SURF.normal;
    switch (f.type) {
      case 'hills': {
        const u = (x - f.x0) / (f.x1 - f.x0);
        const hump = Math.sin(Math.PI * u * f.humps);
        y = b + f.amp * hump * hump * Math.sin(Math.PI * u);
        break;
      }
      case 'ramp':
        if (x >= f.rs && x <= f.lip) { y = b + ((x - f.rs) / (f.lip - f.rs)) * f.h; s = SURF.ramp; }
        break;
      case 'gap':
        if (x < f.rs) y = b + (f.yr - b) * smoothstep(f.x0, f.rs, x);
        else if (x <= f.edge) { y = f.yr + ((x - f.rs) / (f.edge - f.rs)) * f.h; s = SURF.ramp; }
        else if (x < f.far) {
          // Schluchtgrund: leicht unruhig
          const j = FEATURES.gap.floorJitter;
          y = f.yr - f.depth + Math.sin(x * 0.7) * j * 0.5 + Math.sin(x * 0.23) * j * 0.5;
          s = SURF.gap;
        } else y = f.yr + (b - f.yr) * smoothstep(f.far, f.x1, x);
        break;
      case 'loop':
      case 'crusher': {
        const c = f.type === 'loop' ? f.lx : f.cx;
        const flat = f.type === 'loop' ? FEATURES.loop.flat : FEATURES.crusher.flat;
        const a = c - flat, e = c + flat;
        let k;
        if (x < a) k = smoothstep(f.x0, a, x);
        else if (x > e) k = 1 - smoothstep(e, f.x1, x);
        else { k = 1; s = SURF.pad; }
        y = b + (f.yr - b) * k;
        break;
      }
      case 'mud':
        if (x > f.x0 && x < f.x1) s = SURF.mud;
        break;
      case 'sand':
        if (x > f.x0 && x < f.x1) s = SURF.sand;
        break;
      default:
        break;
    }
    this._y = y;
    this._s = s;
  }

  ensure(xMax) {
    const t = this.terrain;
    const r = this.rng;
    const fs = this.features;
    while (this.h.length < 2 || this.xEnd < xMax) {
      const x = T_START + this.h.length * T_STEP;
      let y = this.base(x);
      let s = SURF.normal;
      while (this.fi < fs.length && fs[this.fi].x1 < x) this.fi++;
      const f = this.fi < fs.length && fs[this.fi].x0 <= x ? fs[this.fi] : null;
      if (f) {
        this.featurePoint(f, x, y);
        y = this._y;
        s = this._s;
      } else if (x > this.featureEnd) {
        // Hinter den Bausteinen: gelegentliche Rampen (wie bisher)
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
            s = SURF.ramp;
          } else {
            this.nextRamp = x + r.range(FEATURES.trackTail.rampEvery[0], FEATURES.trackTail.rampEvery[1]);
            this.curRamp = null;
          }
        }
      }
      this.h.push(y);
      this.ramp.push(s === SURF.ramp ? 1 : 0);
      this.surf.push(s);
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

  // Baustein, dessen Platzbedarf x enthält (oder null)
  featureAt(x) {
    const fs = this.features;
    let lo = 0, hi = fs.length - 1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (fs[m].x1 < x) lo = m + 1;
      else if (fs[m].x0 > x) hi = m - 1;
      else return fs[m];
    }
    return null;
  }

  // Schlucht über x (zwischen den Kanten) oder null
  gapAt(x) {
    for (const g of this.gaps) if (x > g.edge && x < g.far) return g;
    return null;
  }

  // Höhe ohne Schlucht-Einschnitt (Kantenhöhe) – zum Platzieren von Schrauben/Pickups
  refHeightAt(x) {
    const g = this.gapAt(x);
    return g ? g.yr : this.heightAt(x);
  }

  // Reibungsfaktor der Oberfläche (Schlamm/Sand); 1 = normal
  frictionAt(x) {
    const f = this.featureAt(x);
    if (!f || (f.type !== 'mud' && f.type !== 'sand')) return 1;
    return x > f.x0 && x < f.x1 ? f.friction : 1;
  }

  // Looping, dessen Einfahrt lx in (x0, x1] liegt (Vorwärtsfahrt) – oder null
  loopBetween(x0, x1) {
    for (const l of this.loops) if (l.lx > x0 && l.lx <= x1) return l;
    return null;
  }
}
