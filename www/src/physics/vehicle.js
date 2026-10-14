import { PHYSICS as P, KOMBO, RESOURCES as R, RULES, ITEMS } from '../data/balance.js';
import { wrapAngle, clamp, DEG, TAU } from '../core/math.js';

const NO_ENV = { wind: 0, lift: () => 0, heat: 0 };
const NO_RULES = {};

// Weiche Tempo-Grenze: Schubwirkung (Boost, Antrieb, Ring-Tempo, Effekte) wird mit diesem Faktor skaliert.
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

// Vereinfachte 2D-Physik des Fahrzeugs (Distanz x, Höhe y, Drehwinkel) in absoluten Koordinaten,
// inklusive Treibstoff, Hitze und Haltbarkeit. Alle Werte kommen aus dem Stat-Objekt (items/statMods.js).
// Ereignisse (Namen nach ARCHITEKTUR.md 4.2) werden in ein Array geschrieben – keine Rückrufe im Physikschritt.
//
// Regel-Schalter (rules), die HIER ausgewertet werden (ARCHITEKTUR.md Anhang A):
//   noOverheat (Kühlschrank), heatIsResource (Waschmaschine), lowGrip (Raketenschlitten),
//   Fähigkeiten-Regeln boostHold (Boost), parachute (Fallschirm), hardStop (Notbremse).
export class Vehicle {
  constructor(stats, gravity, rules = NO_RULES) {
    this.stats = stats;
    this.g = gravity;
    this.rules = rules || NO_RULES;
    this.ev = [];
    this.reset(0, 0, 0);
  }

  reset(x, y, angle) {
    const st = this.stats;
    Object.assign(this, {
      x, y, angle,
      vx: 0, vy: 0, w: 0, s: 0,
      onGround: false,
      // Ressourcen
      fuel: st.fuelMax,
      heat: 0,
      durability: st.durabilityMax,
      stall: 0,              // Überhitzungs-Stillstand (s): kein Boost, kein Antrieb
      overheatArmed: true,   // heatIsResource: nächstes overheat-Ereignis erlaubt
      fuelWasEmpty: false,
      damageTaken: 0,
      healed: 0,
      selfDmgAcc: 0,
      // Boost & Antrieb
      boosting: false,
      boostFree: false,
      boostTime: 0,
      boostSeconds: 0,
      freeBoost: 0,          // Restdauer eines Gratis-Boosts (s)
      freeBoostSource: null,
      driving: false,
      // Fähigkeiten & Effekte
      shields: 0,
      parachute: 0,          // Restdauer des Fallschirms (s)
      parachuteSink: 4,
      brake: 0,              // laufende Notbremsung (s)
      brakeRate: 0,
      brakeArmed: 0,         // Notbremse in der Luft getippt: greift bei Bodenkontakt innerhalb dieser Zeit
      drivePause: 0,
      magnetFx: 0,           // zeitweises Magnetfeld (s) …
      magnetFxRadius: 0,     // … mit diesem Radius
      // Flug
      airTime: 0,
      rotAccum: 0,
      flipsInAir: 0,
      airSeconds: 0,
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
    this.startAir();
    this.w = 0;
  }

  startAir() {
    this.airTime = 0;
    this.rotAccum = 0;
    this.flipsInAir = 0;
    this.airSeconds = 0;
  }

  get speed() { return this.onGround ? Math.abs(this.s) : Math.hypot(this.vx, this.vy); }

  get softCap() { return this.stats.speedSoftCap || P.speedSoftCap; }

  // Sammelradius inkl. zeitweisem Magnetfeld
  get magnetRadius() { return Math.max(this.stats.magnet, this.magnetFx > 0 ? this.magnetFxRadius : 0); }

  get heatFrac() { return this.stats.heatMax > 0 ? this.heat / this.stats.heatMax : 0; }
  get fuelFrac() { return this.stats.fuelMax > 0 ? Math.min(1, this.fuel / this.stats.fuelMax) : 0; }
  get durabilityFrac() { return this.stats.durabilityMax > 0 ? this.durability / this.stats.durabilityMax : 0; }

  // Kann ein Boost mit Treibstoff starten? (Fähigkeit „boost“, Regel boostHold)
  get canBoost() { return this.fuel > 0 && this.stall <= 0; }

  // Ein fester Physik-Schritt, zerlegt in Teilschritte von höchstens maxStepDist Metern.
  // ctl: { tilt: -1 | 0 | 1 (+1 = Nase hoch), boost: bool (Boost-Fähigkeit gehalten) }
  // env: { wind (m/s, + = Rückenwind), lift(x, alt) -> Aufwind m/s², heat: Umgebungshitze pro s }
  // collider (optional): { collide(vehicle, x0, y0, dt, ev) } – prüft nach JEDEM Teilschritt
  //   die Strecke (x0, y0) → (x, y) gegen Hindernisse, Ringe und Schrauben.
  step(dt, ctl, track, ev, env = NO_ENV, collider = null) {
    this.ev = ev;
    this.updateResources(dt, ctl, ev, env);
    const n = substepsFor(this.speed, dt);
    const h = dt / n;
    this.substeps = n;
    for (let i = 0; i < n; i++) {
      const x0 = this.x, y0 = this.y;
      if (this.onGround) this.stepGround(h, track, ev, env);
      else this.stepAir(h, ctl, track, ev, env);
      this.limitSpeed();
      if (collider) collider.collide(this, x0, y0, h, ev);
    }
    if (this.x > this.maxX) this.maxX = this.x;
  }

  // Treibstoff, Hitze, Überhitzung, Boost- und Antriebs-Entscheidung (1× pro Physik-Schritt)
  updateResources(dt, ctl, ev, env) {
    const st = this.stats;
    const rules = this.rules;
    if (this.stall > 0) this.stall = Math.max(0, this.stall - dt);
    if (this.freeBoost > 0) this.freeBoost = Math.max(0, this.freeBoost - dt);
    if (this.magnetFx > 0) this.magnetFx = Math.max(0, this.magnetFx - dt);
    if (this.drivePause > 0) this.drivePause = Math.max(0, this.drivePause - dt);
    if (this.brakeArmed > 0) this.brakeArmed = Math.max(0, this.brakeArmed - dt);
    if (this.parachute > 0) this.parachute = Math.max(0, this.parachute - dt);

    // Boost: Gratis-Boost (Effekt) oder Boost-Fähigkeit mit Treibstoff; Überhitzung sperrt beides
    const wasBoosting = this.boosting;
    const free = this.freeBoost > 0 && this.stall <= 0;
    const paid = !free && !!ctl.boost && this.canBoost;
    this.boosting = free || paid;
    if (this.boosting && !wasBoosting) {
      this.boostFree = free;
      this.boostTime = 0;
      this.boostSeconds = 0;
      ev.push({ type: 'boost', free, source: free ? this.freeBoostSource || 'fx' : 'boost' });
    }
    let fuelUse = 0;
    let heatGain = 0;
    if (this.boosting) {
      this.boostTime += dt;
      const secs = Math.floor(this.boostTime);
      if (secs > this.boostSeconds) { this.boostSeconds = secs; ev.push({ type: 'boostSecond' }); }
      if (paid) fuelUse += st.boostFuel * dt;
      heatGain += st.boostHeat * dt;
      if (st.boostSelfDamage > 0) {
        this.selfDmgAcc += st.boostSelfDamage * dt;
        if (this.selfDmgAcc >= R.selfDamageStep) {
          this.damage(this.selfDmgAcc, 'boost', ev, { pierce: true });
          this.selfDmgAcc = 0;
        }
      }
    }

    // Antrieb: am Boden automatisch, solange Treibstoff da ist (oder der Antrieb keinen braucht)
    this.driving = this.onGround && st.driveAccel > 0 && this.stall <= 0 && this.drivePause <= 0 && this.brake <= 0
      && (this.fuel > 0 || st.driveFuel <= 0);
    if (this.driving) {
      fuelUse += st.driveFuel * dt;
      heatGain += st.driveHeat * dt;
    }

    // Treibstoff
    if (fuelUse > 0) this.fuel = Math.max(0, this.fuel - fuelUse);
    if (this.fuel <= 0) {
      if (!this.fuelWasEmpty) { this.fuelWasEmpty = true; ev.push({ type: 'fuelEmpty' }); }
    } else this.fuelWasEmpty = false;

    // Hitze: Zunahmen × heatGain (negative Boost-Hitze kühlt unverändert), Umgebung, Kühlung
    heatGain += (env.heat || 0) * dt;
    const gain = heatGain > 0 ? heatGain * st.heatGain : heatGain;
    this.heat = Math.max(0, this.heat + gain - st.coolRate * dt);
    this.checkOverheat(ev);
    if (rules.heatIsResource && !this.overheatArmed && this.heat < st.heatMax * R.heatResourceRearm) this.overheatArmed = true;
  }

  // Hitze am Maximum? Regeln noOverheat / heatIsResource, sonst Überhitzung mit Stillstand und Schaden
  checkOverheat(ev) {
    const st = this.stats;
    if (this.heat < st.heatMax) return;
    const rules = this.rules;
    if (rules.noOverheat) { this.heat = st.heatMax; return; }
    if (rules.heatIsResource) {
      this.heat = st.heatMax;
      if (this.overheatArmed) { this.overheatArmed = false; ev.push({ type: 'overheat' }); }
      return;
    }
    ev.push({ type: 'overheat' });
    this.stall = R.overheatStall;
    this.heat = Math.min(R.overheatResetHeat, st.heatMax);
    this.boosting = false;
    this.driving = false;
    this.damage(R.overheatDamage, 'overheat', ev, { pierce: true });
  }

  stepAir(dt, ctl, track, ev, env) {
    const st = this.stats;
    const m = st.mass;
    const a0 = this.angle;

    // Neigen per Halten: Eingabe beschleunigt die Drehung; ohne Eingabe läuft sie aus
    // und die Kiste richtet sich schwach in Flugrichtung aus.
    const tilt = ctl.tilt || 0;
    if (tilt !== 0) {
      this.w += tilt * st.airControl * st.flipSpeed * dt;
    } else {
      this.w *= Math.exp(-P.tiltDamp * dt);
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > P.autoLevelMinSpeed && Math.abs(this.w) < P.autoLevelMaxSpin) {
        const diff = wrapAngle(Math.atan2(this.vy, this.vx) - this.angle);
        this.w += Math.sin(diff) * st.autoLevel * Math.min(1, sp / P.autoLevelFullSpeed) * dt;
      }
    }
    this.w = clamp(this.w, -st.maxSpin, st.maxSpin);
    this.angle += this.w * dt;

    // Kräfte: Schwerkraft, Luftwiderstand (relativ zum Wind), Auftrieb, Thermik, Boost
    const sp = Math.hypot(this.vx, this.vy) || 1e-6;
    const aoa = wrapAngle(this.angle - Math.atan2(this.vy, this.vx));
    const sinA = Math.sin(aoa);
    const chute = this.parachute > 0;
    const k = (st.drag * (1 + P.broadsideDrag * sinA * sinA) * (chute ? RULES.parachute.dragMul : 1)) / m;
    const rvx = this.vx - env.wind;
    const rsp = Math.hypot(rvx, this.vy);
    let ax = -k * rsp * rvx;
    let ay = -k * rsp * this.vy - this.g + env.lift(this.x, this.y - P.rideHeight - track.heightAt(this.x));
    if (Math.abs(aoa) < Math.PI / 2) {
      const L = Math.min(this.g * P.maxLiftG, (st.lift * sp * sp * Math.sin(2 * aoa)) / m);
      ax += L * (-this.vy / sp);
      ay += L * (this.vx / sp);
    }
    if (this.boosting) {
      const T = (st.boostThrust / m) * thrustFactor(sp, this.softCap);
      ax += T * Math.cos(this.angle);
      ay += T * Math.sin(this.angle);
    }
    const x0 = this.x, y0 = this.y;
    this.vx += ax * dt;
    this.vy += ay * dt;
    // Fallschirm (Regel parachute): Sinktempo weich auf parachuteSink begrenzen, Steigen bleibt unberührt
    if (chute && this.vy < -this.parachuteSink) this.vy = Math.min(-this.parachuteSink, this.vy + RULES.parachute.approach * dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.airTime += dt;
    this.rotAccum += wrapAngle(this.angle - a0);
    this.wheelSpin += P.wheelSpinAir * dt;

    // Salto sofort melden (zählt für Tricks erst bei sauberer Landung)
    const flips = countFlips(this.rotAccum);
    if (flips > this.flipsInAir) {
      this.flipsInAir = flips;
      ev.push({ type: 'flip', dir: this.rotAccum > 0 ? 'back' : 'front', count: flips });
    }
    const secs = Math.floor(this.airTime);
    if (secs > this.airSeconds) { this.airSeconds = secs; ev.push({ type: 'airSecond', seconds: secs }); }

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
    const impact = Math.max(0, -vn);
    const airTime = this.airTime;

    let quality;
    if (diff <= st.perfectLandDeg) quality = 'perfect';
    else if (diff <= st.landTolDeg) quality = 'clean';
    else if (diff <= P.bumpyLandDeg) quality = 'bumpy';
    else quality = 'crash';

    const keep = quality === 'bumpy' ? P.bumpySpeedKeep : quality === 'crash' ? P.crashSpeedKeep : P.cleanSpeedKeep;
    this.s = vt * keep;
    this.onGround = true;
    this.vx = this.s * c;
    this.vy = this.s * s;
    this.angle = g;
    this.w = 0;
    this.parachute = 0;

    ev.push({ type: 'groundTouch', impact, x: this.x, y: this.y });
    const real = airTime >= R.minLandingAir;
    if (real) {
      const e = { type: 'landing', quality, impact, airTime, flips, x: this.x, y: this.y };
      ev.push(e);
      if (quality === 'perfect') ev.push({ ...e, type: 'perfectLanding' });
    }

    // Aufprallschaden: Normaltempo über impactThreshold, plus Zuschlag für holprige/Bruchlandungen; Abprall dämpft
    const bounce = st.bounce || 0;
    let dmg = impact > st.impactThreshold ? (impact - st.impactThreshold) * R.dmgPerMps : 0;
    if (real && quality === 'crash') dmg += R.crashLandingDamage;
    else if (real && quality === 'bumpy') dmg += R.bumpyLandingDamage;
    dmg *= 1 - bounce;
    if (dmg > 0) this.damage(dmg, quality === 'crash' ? 'crash' : 'landing', ev);
    this.rotAccum = 0;
    this.flipsInAir = 0;

    // Notbremse in der Luft gezogen → greift jetzt
    if (this.brakeArmed > 0) { this.brakeArmed = 0; this.startBrake(); }

    // Abprall (Stat bounce): ein Teil des Aufpralls wirft die Kiste wieder hoch
    const rebound = bounce * impact;
    if (quality !== 'crash' && rebound >= P.bounceMinSpeed) {
      this.onGround = false;
      this.vx = this.s * c - rebound * s;
      this.vy = this.s * s + rebound * c;
      this.startAir();
      ev.push({ type: 'takeoff', ramp: false, bounce: true });
    }
  }

  stepGround(dt, track, ev, env) {
    const st = this.stats;
    const m = st.mass;
    const lowGrip = !!this.rules.lowGrip;
    const LG = RULES.lowGrip;
    const g0 = Math.atan(track.slopeAt(this.x));
    let s = this.s;
    if (this.boosting) s += (st.boostThrust / m) * thrustFactor(Math.max(0, s), this.softCap) * dt;
    if (this.driving) s += (st.driveAccel * (lowGrip ? LG.driveMul : 1) / m) * thrustFactor(Math.max(0, s), this.softCap) * dt;
    s -= this.g * Math.sin(g0) * dt;
    const f = st.rollFriction * (lowGrip ? LG.frictionMul : 1) * Math.cos(g0) * dt;
    s = Math.abs(s) <= f ? 0 : s - Math.sign(s) * f;
    const rs = s - env.wind * Math.cos(g0);
    s -= (st.drag / m) * rs * Math.abs(rs) * dt;
    // Notbremse (Regel hardStop): Bodentempo linear auf 0
    if (this.brake > 0) {
      const d = this.brakeRate * dt;
      s = Math.abs(s) <= d ? 0 : s - Math.sign(s) * d;
      this.brake -= dt;
      if (this.brake <= 0) { this.brake = 0; this.drivePause = RULES.hardStop.drivePause; }
    }
    this.s = s;

    const vx = s * Math.cos(g0);
    const vy = s * Math.sin(g0);
    const nx = this.x + vx * dt;
    const ny = this.y + vy * dt + 0.5 * (env.lift(this.x, 0) - this.g) * dt * dt;
    const gy = track.heightAt(nx) + P.rideHeight;
    this.wheelSpin += (s / P.wheelRadius) * dt;

    // Abheben über Kuppen und Rampen (Schwelle passend zur Teilschritt-Länge)
    const minTake = P.takeoffMinSpeed * (lowGrip ? LG.takeoffMul : 1);
    if (ny > gy + P.takeoffClearance * (dt / P.dt) && Math.abs(s) > minTake) {
      this.onGround = false;
      this.x = nx; this.y = ny;
      this.vx = vx; this.vy = vy;
      this.angle = g0;
      this.w = 0;
      this.startAir();
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

  // ---------- Schaden & Heilung ----------

  // Schaden nehmen. Schilde machen daraus einen Abprall (bounce), Panzerung (armor) mindert ihn.
  // opts.pierce: ignoriert Schild und Panzerung (Überhitzung, Flüche). Ergebnis: tatsächlicher Schaden.
  damage(amount, source, ev = this.ev, opts = {}) {
    if (!(amount > 0)) return 0;
    if (!opts.pierce && this.shields > 0) {
      this.shields--;
      ev.push({ type: 'bounce', source });
      return 0;
    }
    const a = amount * (opts.pierce ? 1 : 1 - this.stats.armor);
    const before = this.durability;
    this.durability = Math.max(0, this.durability - a);
    const real = before - this.durability;
    this.damageTaken += real;
    ev.push({ type: 'damage', amount: real, source });
    return real;
  }

  heal(amount, ev = this.ev) {
    if (!(amount > 0)) return 0;
    const before = this.durability;
    this.durability = Math.min(this.stats.durabilityMax, this.durability + amount);
    const real = this.durability - before;
    if (real > 0) { this.healed += real; ev.push({ type: 'heal', amount: real }); }
    return real;
  }

  get wrecked() { return this.durability <= 0; }

  // Hindernis getroffen: Tempo verlieren (keep = Anteil, der bleibt)
  hitSlow(keep = P.hitSpeedKeep) {
    if (this.onGround) this.s *= keep;
    else { this.vx *= keep; this.vy = this.vy * keep + P.hitBounceUp; }
  }

  // ---------- Ressourcen & Effekte ----------

  addHeat(a) {
    if (!(a > 0)) return;
    this.heat += a * this.stats.heatGain;
    this.checkOverheat(this.ev);
  }

  cool(a) { if (a > 0) this.heat = Math.max(0, this.heat - a); }

  useFuel(a) { if (a > 0) this.fuel = Math.max(0, this.fuel - a); }

  // Treibstoff +; over: bis ITEMS.overFuelMax × fuelMax (sonst bis fuelMax; mehr Vorhandenes bleibt)
  addFuel(a, over = false) {
    if (!(a > 0)) return;
    const cap = this.stats.fuelMax * (over ? ITEMS.overFuelMax : 1);
    if (this.fuel < cap) this.fuel = Math.min(cap, this.fuel + a);
    if (this.fuel > 0) this.fuelWasEmpty = false;
  }

  // Gratis-Boost (ohne Treibstoff, mit Hitze); das boost-Ereignis folgt im nächsten Physik-Schritt
  startFreeBoost(dur, source = 'fx') {
    if (!(dur > 0)) return;
    if (this.freeBoost <= 0) this.freeBoostSource = source;
    this.freeBoost = Math.max(this.freeBoost, dur);
    if (this.boosting && !this.boostFree) this.boosting = false; // neu starten → boost {free:true}
  }

  // Sofort-Schub in Blickrichtung (unterliegt der weichen Tempo-Grenze)
  thrust(dv) {
    if (!dv) return;
    dv *= thrustFactor(this.speed, this.softCap);
    if (this.onGround) this.s += dv;
    else {
      this.vx += dv * Math.cos(this.angle);
      this.vy += dv * Math.sin(this.angle);
    }
    this.limitSpeed();
  }

  // Impuls nach oben: am Boden abheben, in der Luft Doppelsprung (Fallen wird aufgehoben)
  jump(dv) {
    if (!(dv > 0)) return;
    if (this.onGround) {
      const g0 = this.angle;
      this.vx = this.s * Math.cos(g0);
      this.vy = this.s * Math.sin(g0) + dv;
      this.onGround = false;
      this.y += P.jumpLift;
      this.w = 0;
      this.startAir();
      this.ev.push({ type: 'takeoff', ramp: false, jump: true });
    } else {
      this.vy = Math.max(this.vy, 0) + dv;
    }
    this.limitSpeed();
  }

  addSpin(w) { if (!this.onGround) this.w += w; }

  // Tempo-Schub entlang der Bewegung (z. B. Boost-Ring) – unterliegt der weichen Tempo-Grenze
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

  // ---------- Fähigkeiten-Regeln ----------

  // Fallschirm (Regel parachute): nur in der Luft. Ergebnis: 'open' | 'cut' | null (am Boden: nichts)
  toggleParachute(dur, maxSink) {
    if (this.parachute > 0) { this.parachute = 0; return 'cut'; }
    if (this.onGround) return null;
    this.parachute = dur;
    this.parachuteSink = maxSink;
    return 'open';
  }

  // Notbremse (Regel hardStop): am Boden sofort, in der Luft „scharf“ bis zum nächsten Bodenkontakt
  hardStop() {
    if (this.onGround) this.startBrake();
    else this.brakeArmed = RULES.hardStop.armTime;
  }

  startBrake() {
    const t = this.rules.lowGrip ? RULES.hardStop.lowGripTime : RULES.hardStop.time;
    this.brake = t;
    this.brakeRate = Math.abs(this.s) / t;
  }
}
