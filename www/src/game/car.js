import { PHYSICS as P, KOMBO } from '../config/balance.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

const NO_ENV = { wind: 0, lift: () => 0 };

export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

// Vereinfachte 2D-Physik des Autos (Distanz x, Höhe y, Drehwinkel).
export class Car {
  constructor(stats, gravity) {
    this.stats = stats;
    this.g = gravity;
    this.reset(0, 0, 0);
  }

  reset(x, y, angle) {
    Object.assign(this, {
      x, y, angle,
      vx: 0, vy: 0, w: 0, s: 0,
      onGround: false,
      boost: this.stats.boostMax,
      hp: this.stats.hp,
      airTime: 0,
      rotAccum: 0,
      boosting: false,
      maxX: x,
      wheelSpin: 0,
    });
  }

  launch(speed, angle) {
    this.vx = speed * Math.cos(angle);
    this.vy = speed * Math.sin(angle);
    this.angle = angle;
    this.onGround = false;
    this.airTime = 0;
    this.rotAccum = 0;
    this.w = 0;
  }

  get speed() { return this.onGround ? Math.abs(this.s) : Math.hypot(this.vx, this.vy); }

  // ctl: { touching, da (Drehung durch Wischen), flickW (Schwung beim Loslassen), boost }
  // env: { wind (m/s, + = Rückenwind), lift(x, alt) -> Aufwind m/s² }
  step(dt, ctl, terrain, ev, env = NO_ENV) {
    const boost = ctl.boost && this.boost > 0;
    this.boosting = boost;
    if (boost) this.boost = Math.max(0, this.boost - P.boostDrain * dt);
    if (this.onGround) this.stepGround(dt, terrain, ev, boost, env);
    else this.stepAir(dt, ctl, terrain, ev, boost, env);
    if (this.x > this.maxX) this.maxX = this.x;
  }

  stepAir(dt, ctl, terrain, ev, boost, env) {
    const st = this.stats;
    const m = st.mass;
    const a0 = this.angle;

    // Drehung: Finger auf dem Display = direkte Kontrolle, sonst Schwung + sanftes Ausrichten
    if (ctl.touching) {
      this.angle += ctl.da;
      this.w = 0;
    } else {
      if (ctl.flickW) this.w = Math.max(-P.maxSpin, Math.min(P.maxSpin, ctl.flickW));
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > 3 && Math.abs(this.w) < 3) {
        const diff = wrapAngle(Math.atan2(this.vy, this.vx) - this.angle);
        this.w += Math.sin(diff) * P.autoLevel * Math.min(1, sp / 30) * dt * 3;
      }
      this.angle += this.w * dt;
      this.w *= Math.exp(-P.airSpinDamp * dt);
    }

    // Kräfte: Schwerkraft, Luftwiderstand (relativ zum Wind), Auftrieb, Thermik, Boost
    const sp = Math.hypot(this.vx, this.vy) || 1e-6;
    const aoa = wrapAngle(this.angle - Math.atan2(this.vy, this.vx));
    const sinA = Math.sin(aoa);
    const k = (st.drag * (1 + P.broadsideDrag * sinA * sinA)) / m;
    const rvx = this.vx - env.wind;
    const rsp = Math.hypot(rvx, this.vy);
    let ax = -k * rsp * rvx;
    let ay = -k * rsp * this.vy - this.g + env.lift(this.x, this.y - P.rideHeight - terrain.heightAt(this.x));
    if (Math.abs(aoa) < Math.PI / 2) {
      const L = Math.min(this.g * 2.5, (st.lift * sp * sp * Math.sin(2 * aoa)) / m);
      ax += L * (-this.vy / sp);
      ay += L * (this.vx / sp);
    }
    if (boost) {
      const T = st.thrust / m;
      ax += T * Math.cos(this.angle);
      ay += T * Math.sin(this.angle);
    }
    this.vx += ax * dt;
    this.vy += ay * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.airTime += dt;
    this.rotAccum += wrapAngle(this.angle - a0);
    this.wheelSpin += 6 * dt;

    const gy = terrain.heightAt(this.x) + P.rideHeight;
    if (this.y <= gy) this.land(terrain, gy, ev);
  }

  land(terrain, gy, ev) {
    const st = this.stats;
    const g = Math.atan(terrain.slopeAt(this.x));
    const diff = Math.abs(wrapAngle(this.angle - g)) / DEG;
    const c = Math.cos(g), s = Math.sin(g);
    const vt = this.vx * c + this.vy * s;
    const vn = -this.vx * s + this.vy * c;
    const flips = Math.floor((Math.abs(this.rotAccum) + KOMBO.flipLeniencyDeg * DEG) / TAU);

    let kind;
    if (diff <= P.perfectLandDeg) kind = 'perfect';
    else if (diff <= st.landTolDeg) kind = 'clean';
    else if (diff <= P.bumpyLandDeg) kind = 'bumpy';
    else kind = 'crash';

    const keep = kind === 'bumpy' ? P.bumpySpeedKeep : kind === 'crash' ? P.crashSpeedKeep : 0.98;
    this.s = vt * keep;
    this.onGround = true;
    this.y = gy;
    this.angle = g;
    this.w = 0;
    if (kind === 'crash') this.hp -= 1;
    ev.push({ type: 'landing', kind, impact: Math.max(0, -vn), flips, airTime: this.airTime, x: this.x, y: this.y });
    this.rotAccum = 0;
  }

  stepGround(dt, terrain, ev, boost, env) {
    const st = this.stats;
    const m = st.mass;
    const g0 = Math.atan(terrain.slopeAt(this.x));
    let s = this.s;
    if (boost) s += (st.thrust / m) * dt;
    s -= this.g * Math.sin(g0) * dt;
    const f = st.rollFriction * Math.cos(g0) * dt;
    s = Math.abs(s) <= f ? 0 : s - Math.sign(s) * f;
    const rs = s - env.wind * Math.cos(g0);
    s -= (st.drag / m) * rs * Math.abs(rs) * dt;
    this.s = s;

    const vx = s * Math.cos(g0);
    const vy = s * Math.sin(g0);
    const nx = this.x + vx * dt;
    const ny = this.y + vy * dt + 0.5 * (env.lift(this.x, 0) - this.g) * dt * dt;
    const gy = terrain.heightAt(nx) + P.rideHeight;
    this.wheelSpin += (s / 0.5) * dt;

    // Abheben über Kuppen und Rampen
    if (ny > gy + 0.03 && Math.abs(s) > 4) {
      this.onGround = false;
      this.x = nx; this.y = ny;
      this.vx = vx; this.vy = vy;
      this.angle = g0;
      this.w = 0;
      this.airTime = 0;
      this.rotAccum = 0;
      ev.push({ type: 'takeoff', ramp: terrain.rampBetween(this.x - 4, this.x) });
      return;
    }
    this.x = nx;
    this.y = gy;
    this.vx = vx; this.vy = vy;
    this.angle = Math.atan(terrain.slopeAt(nx));
  }

  hit() {
    const keep = this.stats.hitSpeedKeep;
    if (this.onGround) this.s *= keep;
    else { this.vx *= keep; this.vy = this.vy * keep + 2; }
    this.hp -= 1;
  }

  addSpeed(dv) {
    if (this.onGround) { this.s += dv * Math.sign(this.s || 1); return; }
    const sp = Math.hypot(this.vx, this.vy) || 1;
    const f = (sp + dv) / sp;
    this.vx *= f;
    this.vy *= f;
  }
}
