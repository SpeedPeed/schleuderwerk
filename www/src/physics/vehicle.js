import { PHYSICS as P, KOMBO, RESOURCES as R, RULES, ITEMS, FEATURES } from '../data/balance.js';
import { wrapAngle, clamp, DEG, TAU } from '../core/math.js';

const NO_ENV = { wind: 0, lift: () => 0, heat: 0, ax: 0, ay: 0 };
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
// Regel-Schalter (rules), die HIER ausgewertet werden (ARCHITEKTUR.md Anhang A, Parameter balance.RULES):
//   noOverheat (Kühlschrank, Eiszapfen), heatIsResource (Waschmaschine), lowGrip (Raketenschlitten),
//   Fähigkeiten-Regeln boostHold (Boost), parachute (Fallschirm), hardStop (Notbremse),
//   Phase 4: overheatAfterburner (Feuer-Set 6), coldGlide (Eis-Set 6), impactToThrust (Hydraulik-Set 6),
//   gapTrampoline (Gummi-Set 6), heatIsFuel (Perpetuum Mobile), flipsNeverCrash (Schiffskompass),
//   boostHorizontal (Wasserwaagen-Rakete), perfectLaunchLowGrav (Levitron), allLandingsPerfect + doubleDamage
//   (Hubstützen), iceLanding (Schlittschuhkufen), noPerfectLanding (Gummihuhn), obstacleMagnet (Geisterbahn-Magnet),
//   endlessSpin (Spieluhr), mutualAttraction (Magnet-Set 6), boostOvercap (Raketen-Set 6),
//   Paket C: crashBounce (Gummibärchen-Reifen, land), lowGravHigh (Gravitations-Gartenzwerg, Luft-Schritt),
//   airDrive (Zweitakt-Herz, updateResources + Luft-Schritt).
//   setBonusDouble wählt bei Set-Regeln die „…Double“-Parameter.
// Schrauben als Treibstoff (boltsAreFuel) entscheidet die Etappe: sie setzt `fuelBackup` ({ available(), pay() }).
// Streckenbausteine (Phase 3): Oberflächen-Reibung (track.frictionAt: Schlamm/Sand), Looping (geskriptet, stepLoop),
// Schluchtsturz (Ereignis 'fall', sobald das Fahrzeug FEATURES.gap.fallDepth unter der Kante ist),
// Zusatzbeschleunigung env.ax/ay (Magnetkran).
export class Vehicle {
  constructor(stats, gravity, rules = NO_RULES) {
    this.stats = stats;
    this.g = gravity;
    this.rules = rules || NO_RULES;
    this.ev = [];
    this.damageMul = 1;        // Schrottstufe 8: Faktor auf jeden Schaden (setzt stage/stage.js aus den Run-Effekten)
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
      parachuteSink: 0,      // wird beim Öffnen aus der Fähigkeit gesetzt
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
      // Streckenbausteine
      loop: null,            // laufender Looping { lx, cx, cy, r, phi, v, dir }
      loops: 0,              // vollständig durchfahrene Loopings
      fell: false,           // Schluchtsturz gemeldet
      // Regeln (Phase 4)
      clock: 0,              // Fahrzeug-Zeit (s) für Abklingzeiten der Regeln
      afterburn: 0,          // overheatAfterburner: Restdauer des Nachbrenners (s)
      afterburnReadyAt: -Infinity,
      lowGrav: 0,            // perfectLaunchLowGrav: Restdauer der verringerten Schwerkraft (s)
      trampolines: 0,        // gapTrampoline: schon genutzte Rettungen in dieser Etappe
      freeBoostDepth: 0,     // Kettentiefe des Effekts, der den Gratis-Boost gestartet hat (für das boost-Ereignis)
      ruleAx: 0,             // Zusatzbeschleunigung aus Regeln (obstacleMagnet, mutualAttraction)
      ruleAy: 0,
      ruleAirOnlyAx: 0,
      ruleAirOnlyAy: 0,
    });
  }

  launch(speed, angle, perfect = false) {
    this.vx = speed * Math.cos(angle);
    this.vy = speed * Math.sin(angle);
    this.angle = angle;
    this.onGround = false;
    this.startAir();
    this.w = 0;
    // Regel perfectLaunchLowGrav (Levitron): verringerte Schwerkraft bis zur ersten Bodenberührung (max. maxTime)
    if (perfect && this.rules.perfectLaunchLowGrav) this.lowGrav = RULES.perfectLaunchLowGrav.maxTime;
  }

  // Schwerkraft im Luft-Schritt (Regel perfectLaunchLowGrav)
  get gravity() { return this.lowGrav > 0 ? this.g * RULES.perfectLaunchLowGrav.gravityMul : this.g; }

  startAir() {
    this.airTime = 0;
    this.rotAccum = 0;
    this.flipsInAir = 0;
    this.airSeconds = 0;
  }

  get speed() { return this.onGround ? Math.abs(this.s) : Math.hypot(this.vx, this.vy); }

  get softCap() { return this.stats.speedSoftCap || P.speedSoftCap; }

  // Weiche Grenze für Boost-Schub und Sofort-Schub (Regel boostOvercap: während eines Boosts × capMul)
  get thrustCap() {
    const r = this.rules;
    if (r.boostOvercap && this.boosting) return this.softCap * (r.setBonusDouble ? RULES.boostOvercap.capMulDouble : RULES.boostOvercap.capMul);
    return this.softCap;
  }

  // Beschleunigung des Boosts (m/s²) bei Tempo sp – inkl. Nachbrenner (overheatAfterburner)
  boostAccel(sp) {
    const st = this.stats;
    const ab = this.afterburn > 0 && this.boostFree ? RULES.overheatAfterburner.thrustMul : 1;
    return (st.boostThrust / st.mass) * thrustFactor(Math.max(0, sp), this.thrustCap) * ab;
  }

  // ---------- Treibstoff (inkl. Schrauben als Treibstoff, Regel boltsAreFuel – Etappe setzt fuelBackup) ----------
  get backupFuel() { return this.fuelBackup && this.fuelBackup.available() ? this.fuelBackup.fuel() : 0; }

  // verfügbarer Treibstoff (Tank + Schrauben-Reserve)
  get fuelAvailable() { return this.fuel + this.backupFuel; }

  // Treibstoff verbrauchen; reicht der Tank nicht, wird mit Schrauben nachgefüllt (je Schraube ein 4er-Block)
  consumeFuel(a) {
    if (!(a > 0)) return;
    if (this.fuel < a && this.fuelBackup) {
      let guard = 0;
      while (this.fuel < a && this.fuelBackup.available() && guard++ < 100) {
        const f = this.fuelBackup.pay();
        if (!(f > 0)) break;
        this.fuel += f;
      }
    }
    this.fuel = Math.max(0, this.fuel - a);
  }

  // heatIsFuel: läuft der Verbrauch gerade als Hitze? (sonst Notbetrieb aus dem Tank: Überhitzungssperre oder
  // Hitze bei noOverheat/heatIsResource am Maximum)
  get heatFuelMode() {
    const r = this.rules;
    if (!r.heatIsFuel) return false;
    if (this.stall > 0) return false;
    if ((r.noOverheat || r.heatIsResource) && this.heat >= this.stats.heatMax - 1e-9) return false;
    return true;
  }

  // Sammelradius inkl. zeitweisem Magnetfeld
  get magnetRadius() { return Math.max(this.stats.magnet, this.magnetFx > 0 ? this.magnetFxRadius : 0); }

  get heatFrac() { return this.stats.heatMax > 0 ? this.heat / this.stats.heatMax : 0; }
  get fuelFrac() { return this.stats.fuelMax > 0 ? Math.min(1, this.fuel / this.stats.fuelMax) : 0; }
  get durabilityFrac() { return this.stats.durabilityMax > 0 ? this.durability / this.stats.durabilityMax : 0; }

  // Kann ein Boost mit Treibstoff starten? (Fähigkeit „boost“, Regel boostHold; heatIsFuel: ohne Treibstoff bzw. im
  // Notbetrieb trotz Überhitzungssperre aus dem Tank)
  get canBoost() {
    if (this.heatFuelMode) return true;
    if (this.stall > 0 && !this.rules.heatIsFuel) return false;
    return this.fuel > 0 || this.backupFuel > 0;
  }

  // Ein fester Physik-Schritt, zerlegt in Teilschritte von höchstens maxStepDist Metern.
  // ctl: { tilt: -1 | 0 | 1 (+1 = Nase hoch), boost: bool (Boost-Fähigkeit gehalten) }
  // env: { wind (m/s, + = Rückenwind), lift(x, alt) -> Aufwind m/s², heat: Umgebungshitze pro s }
  // collider (optional): { collide(vehicle, x0, y0, dt, ev) } – prüft nach JEDEM Teilschritt
  //   die Strecke (x0, y0) → (x, y) gegen Hindernisse, Ringe und Schrauben.
  step(dt, ctl, track, ev, env = NO_ENV, collider = null) {
    this.ev = ev;
    this.updateResources(dt, ctl, ev, env);
    this.ruleForces(collider);
    const n = substepsFor(this.speed, dt);
    const h = dt / n;
    this.substeps = n;
    for (let i = 0; i < n; i++) {
      const x0 = this.x, y0 = this.y;
      if (this.loop) this.stepLoop(h, track, ev);
      else if (this.onGround) this.stepGround(h, track, ev, env);
      else this.stepAir(h, ctl, track, ev, env);
      this.limitSpeed();
      if (collider) collider.collide(this, x0, y0, h, ev);
    }
    if (this.x > this.maxX) this.maxX = this.x;
    this.checkFall(track, ev);
  }

  // Schluchtsturz: mehr als FEATURES.gap.fallDepth unter der Kante → Ereignis 'fall' (einmal).
  // Regel gapTrampoline (Gummi-Set 6): die ersten 1 (bzw. 2 mit setBonusDouble) Stürze je Etappe werden zum Trampolin.
  checkFall(track, ev) {
    if (this.fell || !track.gapAt) return;
    const g = track.gapAt(this.x);
    if (g && this.y < g.yr - FEATURES.gap.fallDepth) {
      const T = RULES.gapTrampoline;
      if (this.rules.gapTrampoline && this.trampolines < (this.rules.setBonusDouble ? T.perStageDouble : T.perStage)) {
        this.trampolines++;
        this.trampoline(g);
        ev.push({ type: 'bounce', source: 'gap', x: this.x, y: this.y });
        return;
      }
      this.fell = true;
      ev.push({ type: 'fall', x: this.x, y: this.y, gap: g });
    }
  }

  // Trampolin aus der Schlucht: ballistische Bahn bis hinter die gegenüberliegende Kante (ohne Luftwiderstand gerechnet,
  // deshalb mit etwas Reserve)
  trampoline(g) {
    const T = RULES.gapTrampoline;
    const G = this.g;
    const prevVx = Math.max(0, this.onGround ? this.s * Math.cos(this.angle) : this.vx);
    this.loop = null;
    this.onGround = false;
    const dh = Math.max(0, g.yr + P.rideHeight - this.y);
    const vy = Math.max(T.minVy, Math.sqrt(2 * G * dh) * 1.15 + 1);
    const tFlight = (vy + Math.sqrt(Math.max(0, vy * vy - 2 * G * dh))) / G;
    const need = (g.far + T.beyond - this.x) / Math.max(0.1, tFlight);
    this.vx = Math.max(need * 1.2, T.minVx, prevVx);
    this.vy = vy;
    this.angle = T.angleDeg * DEG;
    this.w = 0;
    this.startAir();
    this.limitSpeed();
  }

  // Zusatzkräfte aus Regeln (1× pro Physik-Schritt): obstacleMagnet (Hindernisse ziehen an, Luft + Boden),
  // mutualAttraction (nur Luft: nächster Pickup vor der Kiste zieht nach vorn/oben, unterliegt der weichen Grenze)
  ruleForces(collider) {
    this.ruleAx = 0; this.ruleAy = 0; this.ruleAirOnlyAx = 0; this.ruleAirOnlyAy = 0;
    const r = this.rules;
    if (!collider || !(r.obstacleMagnet || r.mutualAttraction)) return;
    if (r.obstacleMagnet && collider.nearestObstacle) {
      const M = RULES.obstacleMagnet;
      const o = collider.nearestObstacle(this.x, this.y, M.range);
      if (o) {
        const dx = o.x - this.x, dy = o.y - this.y, d = Math.hypot(dx, dy) || 1;
        this.ruleAx += (M.accel * dx) / d;
        this.ruleAy += (M.accel * dy) / d;
      }
    }
    if (r.mutualAttraction && !this.onGround && !this.loop && collider.nearestPickupAhead) {
      const A = RULES.mutualAttraction;
      const p = collider.nearestPickupAhead(this.x, this.y, A.rangeMul * this.stats.magnet);
      if (p) {
        const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1;
        const a = (r.setBonusDouble ? A.accelDouble : A.accel) * thrustFactor(this.speed, this.softCap);
        this.ruleAirOnlyAx = Math.max(0, (a * dx) / d);
        this.ruleAirOnlyAy = Math.max(0, (a * dy) / d);
      }
    }
  }

  // Treibstoff, Hitze, Überhitzung, Boost- und Antriebs-Entscheidung (1× pro Physik-Schritt)
  updateResources(dt, ctl, ev, env) {
    const st = this.stats;
    const rules = this.rules;
    this.clock += dt;
    if (this.stall > 0) this.stall = Math.max(0, this.stall - dt);
    // Gratis-Boost läuft im Überhitzungs-Stillstand nicht ab (sonst verpufft er ungenutzt)
    else if (this.freeBoost > 0) this.freeBoost = Math.max(0, this.freeBoost - dt);
    if (this.afterburn > 0 && this.freeBoost <= 0) this.afterburn = 0;
    if (this.lowGrav > 0) this.lowGrav = Math.max(0, this.lowGrav - dt);
    if (this.magnetFx > 0) this.magnetFx = Math.max(0, this.magnetFx - dt);
    if (this.drivePause > 0) this.drivePause = Math.max(0, this.drivePause - dt);
    if (this.brakeArmed > 0) this.brakeArmed = Math.max(0, this.brakeArmed - dt);
    if (this.parachute > 0) this.parachute = Math.max(0, this.parachute - dt);

    // Boost: Gratis-Boost (Effekt) oder Boost-Fähigkeit mit Treibstoff; Überhitzung sperrt beides
    // (heatIsFuel: der Verbrauch wird zu Hitze, siehe heatFuelMode)
    const heatFuel = this.heatFuelMode;
    const wasBoosting = this.boosting;
    const free = this.freeBoost > 0 && this.stall <= 0;
    const paid = !free && !!ctl.boost && this.canBoost;
    this.boosting = free || paid;
    if (this.boosting && (!wasBoosting || this.boostFree !== free)) {
      // Start eines Boosts – auch der nahtlose Wechsel Gratis ↔ bezahlt zählt als neuer Boost
      if (!wasBoosting) { this.boostTime = 0; this.boostSeconds = 0; }
      this.boostFree = free;
      ev.push({ type: 'boost', free, source: free ? this.freeBoostSource || 'fx' : 'boost', depth: free ? this.freeBoostDepth : 0 });
      if (free) this.freeBoostDepth = 0;
    }
    let fuelUse = 0;
    let heatGain = 0;
    if (this.boosting) {
      this.boostTime += dt;
      const secs = Math.floor(this.boostTime);
      if (secs > this.boostSeconds) { this.boostSeconds = secs; ev.push({ type: 'boostSecond' }); }
      if (paid) fuelUse += st.boostFuel * dt;
      // Nachbrenner (overheatAfterburner) erzeugt keine Hitze; heatIsFuel: negative Boost-Hitze zählt als 0
      if (!(this.afterburn > 0 && free)) heatGain += (heatFuel && paid ? Math.max(0, st.boostHeat) : st.boostHeat) * dt;
      if (st.boostSelfDamage > 0) {
        this.selfDmgAcc += st.boostSelfDamage * dt;
        if (this.selfDmgAcc >= R.selfDamageStep) {
          this.damage(this.selfDmgAcc, 'boost', ev, { pierce: true });
          this.selfDmgAcc = 0;
        }
      }
    }

    // Antrieb: am Boden automatisch, solange Treibstoff da ist (oder der Antrieb keinen braucht)
    const stalled = this.stall > 0 && !rules.heatIsFuel;
    // heatIsFuel mit RULES.heatIsFuel.drive = false (Phase 6): nur der Boost läuft über Hitze, der Antrieb zahlt Treibstoff
    const heatDrive = heatFuel && !!RULES.heatIsFuel.drive;
    // Regel airDrive (Zweitakt-Herz): der Antrieb läuft auch in der Luft (Verbrauch/Hitze × RULES.airDrive)
    const airDrive = !!rules.airDrive && !this.onGround && !this.loop;
    this.driving = (this.onGround || !!this.loop || airDrive) && st.driveAccel > 0 && !stalled && this.drivePause <= 0 && this.brake <= 0
      && (this.fuel > 0 || st.driveFuel <= 0 || heatDrive || this.backupFuel > 0);
    let driveFuel = 0;
    if (this.driving) {
      driveFuel = st.driveFuel * dt * (airDrive ? RULES.airDrive.fuelMul : 1);
      heatGain += st.driveHeat * dt * (airDrive ? RULES.airDrive.heatMul : 1);
    }

    // Treibstoff (heatIsFuel: Verbrauch als Hitze, 1 Treibstoff = RULES.heatIsFuel.heatPerFuel Hitze)
    if (heatFuel) { heatGain += (fuelUse + (heatDrive ? driveFuel : 0)) * RULES.heatIsFuel.heatPerFuel; fuelUse = heatDrive ? 0 : driveFuel; } else fuelUse += driveFuel;
    if (fuelUse > 0) this.consumeFuel(fuelUse);
    if (this.fuel <= 0 && this.backupFuel <= 0) {
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
    // Feuer-Set 6 (overheatAfterburner): Nachbrenner statt Sperre und Schaden (max. 1× je cooldown s)
    const A = RULES.overheatAfterburner;
    if (rules.overheatAfterburner && this.clock >= this.afterburnReadyAt) {
      ev.push({ type: 'overheat', afterburner: true });
      this.afterburnReadyAt = this.clock + A.cooldown;
      this.heat = Math.min(R.overheatResetHeat, st.heatMax);
      this.freeBoost = Math.max(this.freeBoost, A.dur);
      this.freeBoostSource = 'set_feuer';
      this.afterburn = A.dur;
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
    } else if (!this.rules.endlessSpin) {   // Fluch endlessSpin: keine Dämpfung, kein Ausrichten
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
    const alt = this.y - P.rideHeight - track.heightAt(this.x);
    // Regel lowGravHigh (Gravitations-Gartenzwerg): über RULES.lowGravHigh.above m Höhe weniger Schwerkraft
    const grav = this.rules.lowGravHigh && alt > RULES.lowGravHigh.above ? this.gravity * RULES.lowGravHigh.gravityMul : this.gravity;
    let ay = -k * rsp * this.vy - grav + env.lift(this.x, alt) + (env.ay || 0);
    ax += (env.ax || 0) + this.ruleAx + this.ruleAirOnlyAx;
    ay += this.ruleAy + this.ruleAirOnlyAy;
    if (Math.abs(aoa) < Math.PI / 2) {
      const L = Math.min(this.g * P.maxLiftG, (st.lift * sp * sp * Math.sin(2 * aoa)) / m);
      ax += L * (-this.vy / sp);
      ay += L * (this.vx / sp);
    }
    // Regel airDrive (Zweitakt-Herz): Antrieb in der Luft waagrecht nach vorn (× accelMul, weiche Tempo-Grenze)
    if (this.driving && this.rules.airDrive) ax += this.driveAccelNet() * RULES.airDrive.accelMul * thrustFactor(Math.max(0, this.vx), this.softCap);
    if (this.boosting) {
      const T = this.boostAccel(sp);
      // Regel boostHorizontal (Wasserwaagen-Rakete): Schub in der Luft immer waagrecht nach vorn
      if (this.rules.boostHorizontal) ax += T;
      else {
        ax += T * Math.cos(this.angle);
        ay += T * Math.sin(this.angle);
      }
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

    const real = airTime >= R.minLandingAir;
    const rules = this.rules;
    let quality;
    if (diff <= st.perfectLandDeg) quality = 'perfect';
    else if (diff <= st.landTolDeg) quality = 'clean';
    else if (diff <= P.bumpyLandDeg) quality = 'bumpy';
    else quality = 'crash';
    // Regeln der Landungs-Einstufung: allLandingsPerfect (Hubstützen) und noPerfectLanding (Gummihuhn) heben sich auf
    const allPerfect = !!rules.allLandingsPerfect && !rules.noPerfectLanding;
    const noPerfect = !!rules.noPerfectLanding && !rules.allLandingsPerfect;
    if (allPerfect && real) quality = 'perfect';
    if (noPerfect && quality === 'perfect') quality = 'clean';
    // flipsNeverCrash (Schiffskompass): mit mindestens einem Salto wird aus einer Bruchlandung eine holprige
    if (rules.flipsNeverCrash && quality === 'crash' && flips >= 1) quality = 'bumpy';
    // crashBounce (Gummibärchen-Reifen): Bruchlandung wird ein Abpraller – holprig, aber mit RULES.crashBounce.speedKeep
    const crashBounce = !!rules.crashBounce && real && quality === 'crash';
    if (crashBounce) quality = 'bumpy';

    const keep = crashBounce ? RULES.crashBounce.speedKeep : quality === 'bumpy' ? P.bumpySpeedKeep : quality === 'crash' ? P.crashSpeedKeep : P.cleanSpeedKeep;
    this.s = vt * keep;
    // iceLanding (Schlittschuhkufen): unter 50 Hitze kein Tempoverlust durch den Aufprall
    const I = RULES.iceLanding;
    if (rules.iceLanding && quality !== 'crash' && this.heat < I.heatBelow) {
      const sp = Math.hypot(this.vx, this.vy);
      this.s = (vt >= 0 ? 1 : -1) * Math.min(sp, Math.abs(vt) + I.maxGain);
    }
    this.onGround = true;
    this.lowGrav = 0;
    this.vx = this.s * c;
    this.vy = this.s * s;
    this.angle = g;
    this.w = 0;
    this.parachute = 0;

    ev.push({ type: 'groundTouch', impact, x: this.x, y: this.y });
    if (real) {
      const e = { type: 'landing', quality, impact, airTime, flips, x: this.x, y: this.y };
      ev.push(e);
      if (quality === 'perfect') ev.push({ ...e, type: 'perfectLanding' });
    }

    // Aufprallschaden: Normaltempo über impactThreshold, plus Zuschlag für holprige/Bruchlandungen; Abprall dämpft
    const bounce = st.bounce || 0;
    let impactDmg = impact > st.impactThreshold ? (impact - st.impactThreshold) * R.dmgPerMps : 0;
    // impactToThrust (Hydraulik-Set 6): Aufprallschaden wird zu Schub (Bruchlandung: nur verringert)
    let impactThrust = 0;
    if (rules.impactToThrust && impactDmg > 0) {
      const T = RULES.impactToThrust;
      const dbl = !!rules.setBonusDouble;
      if (quality === 'crash') impactDmg *= dbl ? T.crashMulDouble : T.crashMul;
      else {
        impactThrust = Math.min(dbl ? T.maxDouble : T.max, impactDmg * (dbl ? T.perPointDouble : T.perPoint));
        impactDmg = 0;
      }
    }
    let dmg = impactDmg;
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
    if (impactThrust > 0) this.thrust(impactThrust);
    if (crashBounce) ev.push({ type: 'bounce', source: 'crashBounce' });
  }

  stepGround(dt, track, ev, env) {
    const st = this.stats;
    const m = st.mass;
    const lowGrip = !!this.rules.lowGrip;
    const LG = RULES.lowGrip;
    // Neigung des Abschnitts, auf dem die Kiste gerade fährt (steht sie genau auf einem Stützpunkt, zählt der
    // Abschnitt, von dem sie kommt – sonst „klebt“ sie an einer Schluchtkante und fährt die Wand hinunter)
    const g0 = Math.atan(track.slopeAt(this.x - (this.s >= 0 ? 1e-4 : -1e-4)));
    let s = this.s;
    if (this.boosting) s += this.boostAccel(s) * dt;
    if (this.driving) s += this.driveAccelNet(lowGrip) * thrustFactor(Math.max(0, s), this.softCap) * dt;
    s -= this.g * Math.sin(g0) * dt;
    const eax = (env.ax || 0) + this.ruleAx, eay = (env.ay || 0) + this.ruleAy;
    if (eax || eay) s += (eax * Math.cos(g0) + eay * Math.sin(g0)) * dt;
    // coldGlide (Eis-Set 6): unter 40 Hitze Rollreibung × 0,25, Schlamm/Sand bremsen nicht
    const cold = !!this.rules.coldGlide && this.heat < RULES.coldGlide.heatBelow;
    const surf = cold ? 1 : track.frictionAt ? track.frictionAt(this.x) : 1;
    const f = st.rollFriction * surf * (lowGrip ? LG.frictionMul : 1) * (cold ? RULES.coldGlide.frictionMul : 1) * Math.cos(g0) * dt;
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

    // Looping-Einfahrt überfahren (nur vorwärts am Boden) → geskriptete Kreisfahrt
    if (s > 0 && track.loopBetween) {
      const l = track.loopBetween(this.x, nx);
      if (l) {
        if (s >= FEATURES.loop.minEnter) { this.enterLoop(l, s); return; }
        this.s = -s * 0.5;   // zu langsam: prallt an der Auffahrt ab
        return;
      }
    }

    // Abheben über Kuppen und Rampen (Schwelle passend zur Teilschritt-Länge)
    const minTake = P.takeoffMinSpeed * (lowGrip ? LG.takeoffMul : 1);
    // … auch an scharfen Kanten (Rampen-/Schluchtkante: Neigung fällt um mehr als takeoffKink ab)
    const kink = s > 0 && g0 - Math.atan(track.slopeAt(nx + 1e-4)) > P.takeoffKink && ny > gy - 0.05;
    if ((ny > gy + P.takeoffClearance * (dt / P.dt) || kink) && Math.abs(s) > minTake) {
      this.onGround = false;
      this.x = nx; this.y = Math.max(ny, gy);
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

  // ---------- Looping (geskriptet) ----------
  // Einfahrt am Fuß des Rings (lx); das Fahrzeug folgt dem Kreis (Mittelpunkt cx/cy, Radius r) mit Energieerhaltung,
  // Antrieb/Boost schieben, Reibung bremst. Bei zu wenig Tempo rollt es im unteren Halbkreis zurück bzw. löst sich
  // im oberen Halbkreis (Normalkraft < 0) und fällt frei. Ereignis 'loop' { done: true } bei vollständiger Runde.
  enterLoop(l, speed) {
    const r = l.r;
    this.loop = { lx: l.lx, cx: l.lx, cy: l.yr + P.rideHeight + r, r, phi: -Math.PI / 2, v: speed, dir: 1, ground: l.yr + P.rideHeight };
    this.onGround = false;
    this.x = l.lx;
    this.y = this.loop.ground;
    this.angle = 0;
    this.w = 0;
    this.ev.push({ type: 'loopEnter', x: this.x, y: this.y, speed });
  }

  stepLoop(dt, track, ev) {
    const L = this.loop;
    const st = this.stats;
    const g = this.g;
    // Schub (Antrieb/Boost) nur vorwärts; rollt die Kiste zurück, lässt der Fahrer es laufen
    let thrust = 0;
    if (L.dir > 0) {
      if (this.driving) thrust += this.driveAccelNet() * thrustFactor(L.v, this.softCap);
      if (this.boosting) thrust += this.boostAccel(L.v);
    }
    L.v += (-g * Math.cos(L.phi) * L.dir + thrust - FEATURES.loop.frictionDecel) * dt;
    if (L.v <= 0) { L.dir = -L.dir; L.v = -L.v; }
    L.phi += (L.dir * L.v * dt) / L.r;
    const tx = -Math.sin(L.phi) * L.dir, ty = Math.cos(L.phi) * L.dir;
    this.x = L.cx + L.r * Math.cos(L.phi);
    this.y = L.cy + L.r * Math.sin(L.phi);
    this.angle = L.phi + Math.PI / 2;
    this.vx = tx * L.v;
    this.vy = ty * L.v;
    this.wheelSpin += (L.dir * L.v / P.wheelRadius) * dt;
    // oben gelöst? (Normalkraft v²/r − g·sin φ < 0) → freier Fall
    if (Math.sin(L.phi) > 0 && (L.v * L.v) / L.r < g * Math.sin(L.phi)) {
      this.loop = null;
      this.onGround = false;
      this.startAir();
      ev.push({ type: 'loop', done: false, x: this.x, y: this.y });
      return;
    }
    // ganz herum → weiter am Boden
    if (L.dir > 0 && L.phi >= Math.PI * 1.5) {
      this.exitLoop(track, L.lx + 0.01, L.v);
      this.loops++;
      ev.push({ type: 'loop', done: true, x: this.x, y: this.y });
      return;
    }
    // zurückgerollt → rückwärts aus der Einfahrt
    if (L.dir < 0 && (L.phi <= -Math.PI / 2 || (L.v < FEATURES.loop.minEnter && L.phi < -Math.PI / 2 + 0.3))) {
      this.exitLoop(track, L.lx - 0.01, -L.v);
      ev.push({ type: 'loop', done: false, back: true, x: this.x, y: this.y });
    }
  }

  exitLoop(track, x, s) {
    this.loop = null;
    this.onGround = true;
    this.x = x;
    this.y = track.heightAt(x) + P.rideHeight;
    const g0 = Math.atan(track.slopeAt(x));
    this.angle = g0;
    this.s = s;
    this.vx = s * Math.cos(g0);
    this.vy = s * Math.sin(g0);
    this.w = 0;
  }

  // Beschleunigung des Antriebs am Boden (m/s², vor der weichen Tempo-Grenze): driveAccel / mass^driveMassExp.
  // Die Rollreibung bremst unabhängig von der Masse – mit driveMassExp < 1 kommen auch schwere Kisten in Fahrt.
  driveAccelNet(lowGrip = !!this.rules.lowGrip) {
    const st = this.stats;
    return (st.driveAccel * (lowGrip ? RULES.lowGrip.driveMul : 1)) / Math.pow(st.mass, P.driveMassExp);
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

  // Schaden nehmen. Panzerung (armor) mindert ihn; ein Schild macht aus Schaden ab RESOURCES.shieldMinDamage
  // (nach Panzerung) einen Abprall (bounce) – Kleinstschaden geht normal durch und verbraucht keinen Schild.
  // opts.pierce: ignoriert Schild und Panzerung (Überhitzung, Flüche). Ergebnis: tatsächlicher Schaden.
  damage(amount, source, ev = this.ev, opts = {}) {
    if (!(amount > 0)) return 0;
    // doubleDamage (Hubstützen): jeder Haltbarkeitsverlust nach Panzerung × RULES.doubleDamage.mul
    // damageMul (Schrottstufe 8): × auf jeden Schaden vor der Panzerung
    const a = amount * (this.damageMul || 1) * (opts.pierce ? 1 : 1 - this.stats.armor) * (this.rules.doubleDamage ? RULES.doubleDamage.mul : 1);
    if (!opts.pierce && this.shields > 0 && a >= R.shieldMinDamage) {
      this.shields--;
      ev.push({ type: 'bounce', source });
      return 0;
    }
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
    if (this.loop) this.loop.v *= keep;
    else if (this.onGround) this.s *= keep;
    else { this.vx *= keep; this.vy = this.vy * keep + P.hitBounceUp; }
  }

  // ---------- Ressourcen & Effekte ----------

  addHeat(a) {
    if (!(a > 0)) return;
    this.heat += a * this.stats.heatGain;
    this.checkOverheat(this.ev);
  }

  cool(a) { if (a > 0) this.heat = Math.max(0, this.heat - a); }

  useFuel(a) { this.consumeFuel(a); }

  // Treibstoff +; over: bis ITEMS.overFuelMax × fuelMax (sonst bis fuelMax; mehr Vorhandenes bleibt)
  addFuel(a, over = false) {
    if (!(a > 0)) return;
    const cap = this.stats.fuelMax * (over ? ITEMS.overFuelMax : 1);
    if (this.fuel < cap) this.fuel = Math.min(cap, this.fuel + a);
    if (this.fuel > 0) this.fuelWasEmpty = false;
  }

  // Gratis-Boost (ohne Treibstoff, mit Hitze); das boost-Ereignis {free:true} folgt im nächsten Physik-Schritt
  // (auch wenn gerade ein bezahlter Boost läuft – updateResources() meldet den Wechsel).
  startFreeBoost(dur, source = 'fx') {
    if (!(dur > 0)) return;
    if (this.freeBoost <= 0) this.freeBoostSource = source;
    this.freeBoost = Math.max(this.freeBoost, dur);
  }

  // Sofort-Schub in Blickrichtung (unterliegt der weichen Tempo-Grenze; boostOvercap während eines Boosts)
  thrust(dv) {
    if (!dv) return;
    dv *= thrustFactor(this.speed, this.thrustCap);
    if (this.loop) this.loop.v = Math.max(0, this.loop.v + dv * this.loop.dir);
    else if (this.onGround) this.s += dv;
    else {
      this.vx += dv * Math.cos(this.angle);
      this.vy += dv * Math.sin(this.angle);
    }
    this.limitSpeed();
  }

  // Impuls nach oben: am Boden abheben, in der Luft Doppelsprung. cancelFall: Anteil einer Fallgeschwindigkeit, der
  // aufgehoben wird (1 = Fallen ganz aufgehoben – Fähigkeit Hüpfer; Item-Effekte: ITEMS.effectJumpCancelFall)
  jump(dv, cancelFall = 1) {
    if (!(dv > 0) || this.loop) return;
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
      this.vy = (this.vy < 0 ? this.vy * (1 - cancelFall) : this.vy) + dv;
    }
    this.limitSpeed();
  }

  addSpin(w) { if (!this.onGround) this.w += w; }

  // Tempo um einen Faktor ändern (Abrissbirne wreckingBall: Hindernis durchbrochen)
  scaleSpeed(k) {
    if (this.loop) this.loop.v *= k;
    else if (this.onGround) this.s *= k;
    else { this.vx *= k; this.vy *= k; }
  }

  // Abprall an einem Hindernis (Hüpfburg obstacleBounce): nach oben mindestens vy, nach vorn + vx (weiche Grenze)
  obstacleBounce(vy, vx) {
    if (this.loop) { this.loop.v *= P.hitSpeedKeep; return; }
    if (this.onGround) {
      this.vx = this.s * Math.cos(this.angle);
      this.vy = this.s * Math.sin(this.angle);
      this.onGround = false;
      this.y += P.jumpLift;
      this.w = 0;
      this.startAir();
    }
    this.vy = Math.max(this.vy, vy);
    this.vx += vx * thrustFactor(this.speed, this.softCap);
    this.limitSpeed();
  }

  // Tempo-Schub entlang der Bewegung (z. B. Boost-Ring) – unterliegt der weichen Tempo-Grenze
  addSpeed(dv) {
    dv *= thrustFactor(this.speed, this.softCap);
    if (this.loop) this.loop.v += dv;
    else if (this.onGround) {
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
