import { PHYSICS as P, KOMBO } from '../data/balance.js';
import { wrapAngle, clamp, DEG, TAU } from '../core/math.js';

const NO_ENV = { wind: 0, lift: () => 0 };

// Weiche Tempo-Grenze: Schubwirkung (Boost, Ring-Tempo, später Items) wird mit diesem Faktor skaliert.
// 1 im Stand, 0,5 bei `cap`, darüber schnell gegen 0.
export function thrustFactor(v, cap = P.speedSoftCap, pow = P.softCapPow) {
  if (v <= 0) return 1;
  return 1 / (1 + Math.pow(v / cap, pow));
}

// Anzahl der Teilschritte, damit pro Teilschritt höchstens maxStepDist Meter zurückgelegt werden
export function substepsFor(v, dt) {
  return Math.min(P.maxSubsteps, Math.max(1, Math.ceil((Math.abs(v) * dt) / P.maxStepDist)));
}

// Volle Drehungen aus der aufsummierten Drehung (mit Kulanz, 335° zählen schon)
export function countFlips(rotAccum) {
  return Math.floor((Math.abs(rotAccum) + KOMBO.flipLeniencyDeg * DEG) / TAU);
}

// Vereinfachte 2D-Physik des Autos (Distanz x, Höhe y, Drehwinkel) in absoluten Koordinaten.
// Ereignisse (Landung, Abheben) werden in das Array `ev` geschrieben – keine Rückrufe im Physikschritt.
export class Vehicle {
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
      substeps: 1,
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

  get softCap() { return this.stats.speedSoftCap || P.speedSoftCap; }

  // Ein fester Physik-Schritt, zerlegt in Teilschritte von höchstens maxStepDist Metern.
  // ctl: { tilt: -1 | 0 | 1 (+1 = Nase hoch), boost: bool }
  // env: { wind (m/s, + = Rückenwind), lift(x, alt) -> Aufwind m/s² }
  // collider (optional): { collide(vehicle, x0, y0, dt, ev) } – prüft nach JEDEM Teilschritt
  //   die Strecke (x0, y0) → (x, y) gegen Hindernisse, Ringe und Münzen.
  step(dt, ctl, track, ev, env = NO_ENV, collider = null) {
    const boost = !!ctl.boost && this.boost > 0;
    this.boosting = boost;
    if (boost) this.boost = Math.max(0, this.boost - P.boostDrain * dt);
    const n = substepsFor(this.speed, dt);
    const h = dt / n;
    this.substeps = n;
    for (let i = 0; i < n; i++) {
      const x0 = this.x, y0 = this.y;
      if (this.onGround) this.stepGround(h, track, ev, boost, env);
      else this.stepAir(h, ctl, track, ev, boost, env);
      this.limitSpeed();
      if (collider) collider.collide(this, x0, y0, h, ev);
    }
    if (this.x > this.maxX) this.maxX = this.x;
  }

  stepAir(dt, ctl, track, ev, boost, env) {
    const st = this.stats;
    const m = st.mass;
    const a0 = this.angle;

    // Neigen per Halten: Eingabe beschleunigt die Drehung; ohne Eingabe läuft sie aus
    // und die Kiste richtet sich schwach in Flugrichtung aus.
    const tilt = ctl.tilt || 0;
    if (tilt !== 0) {
      this.w += tilt * (st.airControl || P.airControl) * dt;
    } else {
      this.w *= Math.exp(-P.tiltDamp * dt);
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > P.autoLevelMinSpeed && Math.abs(this.w) < P.autoLevelMaxSpin) {
        const diff = wrapAngle(Math.atan2(this.vy, this.vx) - this.angle);
        this.w += Math.sin(diff) * P.autoLevel * Math.min(1, sp / P.autoLevelFullSpeed) * dt;
      }
    }
    const maxSpin = st.maxSpin || P.maxSpin;
    this.w = clamp(this.w, -maxSpin, maxSpin);
    this.angle += this.w * dt;

    // Kräfte: Schwerkraft, Luftwiderstand (relativ zum Wind), Auftrieb, Thermik, Boost
    const sp = Math.hypot(this.vx, this.vy) || 1e-6;
    const aoa = wrapAngle(this.angle - Math.atan2(this.vy, this.vx));
    const sinA = Math.sin(aoa);
    const k = (st.drag * (1 + P.broadsideDrag * sinA * sinA)) / m;
    const rvx = this.vx - env.wind;
    const rsp = Math.hypot(rvx, this.vy);
    let ax = -k * rsp * rvx;
    let ay = -k * rsp * this.vy - this.g + env.lift(this.x, this.y - P.rideHeight - track.heightAt(this.x));
    if (Math.abs(aoa) < Math.PI / 2) {
      const L = Math.min(this.g * P.maxLiftG, (st.lift * sp * sp * Math.sin(2 * aoa)) / m);
      ax += L * (-this.vy / sp);
      ay += L * (this.vx / sp);
    }
    if (boost) {
      const T = (st.thrust / m) * thrustFactor(sp, this.softCap);
      ax += T * Math.cos(this.angle);
      ay += T * Math.sin(this.angle);
    }
    const x0 = this.x, y0 = this.y;
    this.vx += ax * dt;
    this.vy += ay * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.airTime += dt;
    this.rotAccum += wrapAngle(this.angle - a0);
    this.wheelSpin += P.wheelSpinAir * dt;

    // Landung: Wurde die Bodenlinie zwischen alter und neuer Position gekreuzt?
    // Dann den Kreuzungspunkt auf der Strecke (x0, y0) → (x, y) per Halbierung suchen.
    const rh = P.rideHeight;
    if (this.y - (track.heightAt(this.x) + rh) <= 0) {
      let t = 1;
      if (y0 - (track.heightAt(x0) + rh) > 0) {
        const dx = this.x - x0, dy = this.y - y0;
        let lo = 0, hi = 1;
        for (let i = 0; i < P.landingIterations; i++) {
          const mid = (lo + hi) * 0.5;
          if (y0 + dy * mid - (track.heightAt(x0 + dx * mid) + rh) > 0) lo = mid;
          else hi = mid;
        }
        t = hi;
      }
      this.x = x0 + (this.x - x0) * t;
      this.y = track.heightAt(this.x) + rh;
      this.land(track, ev);
    }
  }

  land(track, ev) {
    const st = this.stats;
    const g = Math.atan(track.slopeAt(this.x));
    const diff = Math.abs(wrapAngle(this.angle - g)) / DEG;
    const c = Math.cos(g), s = Math.sin(g);
    const vt = this.vx * c + this.vy * s;
    const vn = -this.vx * s + this.vy * c;
    const flips = countFlips(this.rotAccum);

    let kind;
    if (diff <= P.perfectLandDeg) kind = 'perfect';
    else if (diff <= st.landTolDeg) kind = 'clean';
    else if (diff <= P.bumpyLandDeg) kind = 'bumpy';
    else kind = 'crash';

    const keep = kind === 'bumpy' ? P.bumpySpeedKeep : kind === 'crash' ? P.crashSpeedKeep : P.cleanSpeedKeep;
    this.s = vt * keep;
    this.onGround = true;
    this.vx = this.s * c;
    this.vy = this.s * s;
    this.angle = g;
    this.w = 0;
    if (kind === 'crash') this.hp -= 1;
    ev.push({ type: 'landing', kind, impact: Math.max(0, -vn), flips, airTime: this.airTime, x: this.x, y: this.y });
    this.rotAccum = 0;
  }

  stepGround(dt, track, ev, boost, env) {
    const st = this.stats;
    const m = st.mass;
    const g0 = Math.atan(track.slopeAt(this.x));
    let s = this.s;
    if (boost) s += (st.thrust / m) * thrustFactor(Math.max(0, s), this.softCap) * dt;
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
    const gy = track.heightAt(nx) + P.rideHeight;
    this.wheelSpin += (s / P.wheelRadius) * dt;

    // Abheben über Kuppen und Rampen (Schwelle passend zur Teilschritt-Länge)
    if (ny > gy + P.takeoffClearance * (dt / P.dt) && Math.abs(s) > P.takeoffMinSpeed) {
      this.onGround = false;
      this.x = nx; this.y = ny;
      this.vx = vx; this.vy = vy;
      this.angle = g0;
      this.w = 0;
      this.airTime = 0;
      this.rotAccum = 0;
      ev.push({ type: 'takeoff', ramp: track.rampBetween(this.x - P.takeoffRampCheck, this.x) });
      return;
    }
    this.x = nx;
    this.y = gy;
    this.vx = vx; this.vy = vy;
    this.angle = Math.atan(track.slopeAt(nx));
  }

  // Harte Tempo-Grenze: Betrag klemmen, Richtung bleibt
  limitSpeed() {
    const cap = P.hardSpeedCap;
    if (this.onGround) {
      if (this.s > cap) this.s = cap;
      else if (this.s < -cap) this.s = -cap;
      return;
    }
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > cap) {
      const k = cap / sp;
      this.vx *= k;
      this.vy *= k;
    }
  }

  hit() {
    const keep = this.stats.hitSpeedKeep;
    if (this.onGround) this.s *= keep;
    else { this.vx *= keep; this.vy = this.vy * keep + P.hitBounceUp; }
    this.hp -= 1;
  }

  // Tempo-Schub (z. B. Boost-Ring) – unterliegt der weichen Tempo-Grenze
  addSpeed(dv) {
    dv *= thrustFactor(this.speed, this.softCap);
    if (this.onGround) {
      this.s += dv * Math.sign(this.s || 1);
    } else {
      const sp = Math.hypot(this.vx, this.vy) || 1;
      const f = (sp + dv) / sp;
      this.vx *= f;
      this.vy *= f;
    }
    this.limitSpeed();
  }
}
