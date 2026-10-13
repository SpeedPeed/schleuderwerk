import { PHYSICS as P, LAUNCH, KOMBO, ECONOMY, FX } from '../config/balance.js';
import { Car } from './car.js';
import { Objects } from './objects.js';
import { PLATEAU_H } from './terrain.js';

const DEG = Math.PI / 180;
export const REST = { x: 0, y: PLATEAU_H + 3.2 };

// Ein einzelner Run: Zielen -> Flug/Fahrt -> Ende.
// Gibt alles Sichtbare über `hooks` nach außen (Popups, Sound, Effekte, Ende).
export class Run {
  constructor({ world, terrain, stats, seed, hooks, save }) {
    this.world = world;
    this.terrain = terrain;
    this.stats = stats;
    this.hooks = hooks;
    this.save = save;
    this.car = new Car(stats, world.gravity);
    this.car.reset(REST.x, REST.y, 0.35);
    this.objects = new Objects(world, terrain, seed);
    this.objects.spawnUntil(300);

    this.phase = 'aim';
    this.aim = { active: false, power: 0, angle: 35 * DEG, band: 0.7, t: 0, lastTick: 0 };
    this.chain = { pts: 0, mult: 1, timer: 0 };
    this.tricks = 0;
    this.coins = 0;
    this.coinStreak = 0;
    this.coinStreakTimer = 0;
    this.maxAlt = 0;
    this.altMarks = 0;
    this.time = 0;
    this.acc = 0;
    this.timeScale = 1;
    this.slowmo = 0;
    this.stopTimer = 0;
    this.wreckTimer = -1;
    this.flipsInAir = 0;
    this.perfectLaunch = false;
    this.ev = [];
  }

  // ---------- Zielen mit der Schleuder ----------
  updateAim(realDt, input) {
    const a = this.aim;
    a.t += realDt;
    const k = 0.5 - 0.5 * Math.cos((a.t / LAUNCH.bandPeriod) * Math.PI * 2);
    a.band = LAUNCH.bandMin + (LAUNCH.bandMax - LAUNCH.bandMin) * k;

    if (input.down) {
      a.active = true;
      const dx = input.x - input.startX;
      const dy = input.y - input.startY;
      const full = Math.min(window.innerWidth, window.innerHeight) * LAUNCH.pullScreenFraction;
      a.power = Math.min(1, Math.hypot(dx, dy) / full);
      let ang = Math.atan2(dy, -dx);
      ang = Math.max(LAUNCH.minAngleDeg * DEG, Math.min(LAUNCH.maxAngleDeg * DEG, ang));
      a.angle = ang;
      const tick = Math.floor(a.power * 10);
      if (tick !== a.lastTick) { a.lastTick = tick; if (tick > 0) this.hooks.sfx('stretch', a.power); }
    } else if (a.active) {
      a.active = false;
      input.takeRelease();
      input.takeDX();
      if (a.power >= LAUNCH.minPower) this.fire();
      else a.power = 0;
    }
    const pull = a.power * LAUNCH.maxPullMeters;
    this.car.x = REST.x - Math.cos(a.angle) * pull;
    // nie in den Boden ziehen
    this.car.y = Math.max(REST.y - Math.sin(a.angle) * pull, this.terrain.heightAt(this.car.x) + P.rideHeight + 0.4);
    this.car.angle = a.active ? a.angle : 0.35;
  }

  get inPerfectBand() {
    return Math.abs(this.aim.power - this.aim.band) <= LAUNCH.bandWidth / 2;
  }

  fire() {
    const a = this.aim;
    const perfect = this.inPerfectBand;
    const speed = this.stats.launchSpeed * a.power * (perfect ? 1 + LAUNCH.perfectBonus : 1);
    this.car.launch(speed, a.angle);
    this.phase = 'fly';
    this.perfectLaunch = perfect;
    this.hooks.sfx('launch', a.power);
    this.hooks.haptic('medium');
    this.hooks.shake(0.25 * a.power);
    if (perfect) {
      this.trick('perfectLaunch', 'PERFEKTER ABSCHUSS!', 1, 'big');
      this.startSlowmo(0.35);
      this.hooks.sfx('perfect');
    }
  }

  // Punkte vom Abschuss bis zur Landung als Vorschau (Flugkurve)
  previewPath(n = 22, step = 0.06) {
    const a = this.aim;
    if (a.power < LAUNCH.minPower) return [];
    const sp = this.stats.launchSpeed * a.power;
    let x = this.car.x, y = this.car.y;
    let vx = sp * Math.cos(a.angle), vy = sp * Math.sin(a.angle);
    const k = this.stats.drag / this.stats.mass;
    const pts = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < 4; j++) {
        const h = step / 4;
        const v = Math.hypot(vx, vy);
        vx += -k * v * vx * h;
        vy += (-k * v * vy - this.world.gravity) * h;
        x += vx * h;
        y += vy * h;
      }
      pts.push({ x, y });
    }
    return pts;
  }

  // ---------- Kombo ----------
  trick(name, label, n = 1, kind = 'good') {
    const e = KOMBO.events[name];
    this.addChain(e.pts * n, e.mult * n, label, kind);
  }

  addChain(pts, mult, label, kind = 'good') {
    this.chain.pts += pts;
    this.chain.mult = Math.min(KOMBO.maxMult, this.chain.mult + mult);
    this.chain.timer = 0;
    this.hooks.popup(label, kind);
    this.hooks.sfx('trick', this.chain.mult);
  }

  bankChain(silent = false) {
    if (this.chain.pts <= 0) { this.chain = { pts: 0, mult: 1, timer: 0 }; return; }
    const v = Math.round(this.chain.pts * this.chain.mult);
    this.tricks += v;
    if (!silent) {
      this.hooks.popup(`+${v} Trickpunkte gesichert`, 'bank');
      this.hooks.sfx('bank');
    }
    this.chain = { pts: 0, mult: 1, timer: 0 };
  }

  loseChain() {
    if (this.chain.pts > 0) this.hooks.popup('Kombo verloren', 'bad');
    this.chain = { pts: 0, mult: 1, timer: 0 };
  }

  startSlowmo(t) { this.slowmo = Math.max(this.slowmo, t); }

  get altitude() { return this.car.y - P.rideHeight - this.terrain.heightAt(this.car.x); }

  // ---------- Hauptschleife ----------
  update(realDt, input) {
    if (this.phase === 'aim') { this.updateAim(realDt, input); return; }
    if (this.phase !== 'fly') return;

    if (this.slowmo > 0) { this.slowmo -= realDt; this.timeScale = FX.slowmoScale; }
    else this.timeScale = Math.min(1, this.timeScale + realDt * 4);
    this.acc += Math.min(realDt, 0.05) * this.timeScale;

    const release = input.takeRelease();
    const ctl = {
      touching: input.down,
      da: -input.takeDX() * P.rotateSens,
      flickW: release !== null ? -release * P.rotateSens : 0,
      boost: input.down && input.holdTime > P.boostDelay,
    };

    const car = this.car;
    const ev = this.ev;
    while (this.acc >= P.dt) {
      this.acc -= P.dt;
      car.step(P.dt, ctl, this.terrain, ev);
      ctl.da = 0;
      ctl.flickW = 0;
      this.objects.collide(car, this.stats, P.dt, ev);
      this.time += P.dt;
      this.afterStep(P.dt);
      for (const e of ev) this.handle(e);
      ev.length = 0;
      if (this.phase !== 'fly') return;
    }
    this.objects.spawnUntil(car.x + 300);
  }

  afterStep(dt) {
    const car = this.car;
    // Flugsalto live anzeigen (zählt erst bei sauberer Landung)
    if (!car.onGround) {
      const flips = Math.floor((Math.abs(car.rotAccum) + KOMBO.flipLeniencyDeg * DEG) / (Math.PI * 2));
      if (flips > this.flipsInAir) {
        this.flipsInAir = flips;
        this.hooks.popup(flips === 1 ? 'Salto …' : `${flips}× Salto …`, 'info');
        this.hooks.sfx('whoosh');
      }
    } else this.flipsInAir = 0;

    const alt = this.altitude;
    if (alt > this.maxAlt) this.maxAlt = alt;
    const marks = KOMBO.heightMarks;
    if (this.altMarks < marks.length && alt >= marks[this.altMarks]) {
      this.trick('height', `HÖHENRAUSCH ${marks[this.altMarks]} m`);
      this.altMarks++;
    }

    if (this.coinStreakTimer > 0) { this.coinStreakTimer -= dt; if (this.coinStreakTimer <= 0) this.coinStreak = 0; }

    if (car.onGround && this.chain.pts > 0) {
      this.chain.timer += dt;
      if (this.chain.timer > KOMBO.chainTimeout) this.bankChain();
    }

    // Ende?
    if (this.wreckTimer >= 0) {
      this.wreckTimer -= dt;
      if (this.wreckTimer < 0) this.finish('wreck');
      return;
    }
    if (car.onGround && Math.abs(car.s) < P.stopSpeed) {
      this.stopTimer += dt;
      if (this.stopTimer > P.stopTime) this.finish('stop');
    } else this.stopTimer = 0;
    if (this.time > P.maxRunTime) this.finish('time');
  }

  handle(e) {
    const h = this.hooks;
    const car = this.car;
    switch (e.type) {
      case 'coin': {
        this.coins += e.v * ECONOMY.coinValue;
        this.coinStreak++;
        this.coinStreakTimer = 1;
        h.sfx('coin', this.coinStreak);
        h.fx('coin', e.x, e.y);
        if (e.big) { h.popup('GOLDMÜNZE +5', 'good'); h.haptic('light'); }
        break;
      }
      case 'ring': {
        car.addSpeed(6);
        car.boost = Math.min(this.stats.boostMax, car.boost + this.stats.boostMax * 0.25);
        this.trick('ring', 'BOOST-RING!');
        h.sfx('ring');
        h.fx('ring', e.x, e.y);
        h.haptic('light');
        break;
      }
      case 'nearMiss':
        this.trick('nearMiss', 'KNAPP VORBEI!');
        break;
      case 'hit': {
        car.hit();
        this.loseChain();
        h.popup(car.hp > 0 ? 'Autsch!' : 'TOTALSCHADEN!', 'bad');
        h.sfx('crash', 1);
        h.fx('smash', e.x, e.y, { type: e.obstacle.type });
        h.shake(0.8);
        h.haptic('heavy');
        if (car.hp <= 0) this.wreckTimer = 0.8;
        break;
      }
      case 'takeoff':
        if (e.ramp) { h.sfx('whoosh'); h.fx('dust', car.x, car.y - P.rideHeight); }
        break;
      case 'landing':
        this.onLanding(e);
        break;
    }
  }

  onLanding(e) {
    const h = this.hooks;
    const big = e.airTime > KOMBO.minAirForLanding;
    h.fx('dust', e.x, e.y - P.rideHeight, { amount: Math.min(1, e.impact / 20) });
    h.sfx('land', Math.min(1, e.impact / 25));
    if (e.kind === 'crash') {
      this.loseChain();
      h.popup(this.car.hp > 0 ? 'Bruchlandung!' : 'TOTALSCHADEN!', 'bad');
      h.sfx('crash', 1);
      h.fx('smash', e.x, e.y, { type: 'car' });
      h.shake(0.9);
      h.haptic('heavy');
      if (this.car.hp <= 0) this.wreckTimer = 0.8;
      return;
    }
    if (e.kind === 'bumpy') {
      if (big) h.popup('Holprig …', 'info');
      if (e.flips > 0) h.popup('Salto nicht gestanden', 'bad');
      h.shake(Math.min(0.6, e.impact / 30));
      h.haptic('medium');
      return;
    }
    if (e.flips > 0) {
      const n = e.flips;
      const full = Math.min(n, KOMBO.flipsScored);
      const f = KOMBO.events.flip;
      this.addChain(f.pts * full + (n - full) * KOMBO.extraFlipPts, f.mult * full, n === 1 ? 'SALTO!' : `${n}× SALTO!`, 'big');
      if (n > 1) {
        const m = KOMBO.events.multiFlip;
        this.addChain(m.pts * (full - 1), m.mult, 'MEHRFACH-SALTO', 'good');
        this.startSlowmo(0.4);
      }
      h.haptic('success');
    }
    if (big) {
      if (e.kind === 'perfect') {
        this.trick('perfectLanding', 'PERFEKTE LANDUNG!', 1, 'big');
        this.startSlowmo(0.25);
        h.sfx('perfect');
      } else this.trick('cleanLanding', 'Saubere Landung');
    }
    h.shake(Math.min(0.5, e.impact / 35));
    if (e.impact > 8) h.haptic('light');
  }

  finish(reason) {
    if (this.phase === 'over') return;
    this.bankChain(true);
    this.phase = 'over';
    const dist = Math.max(0, Math.round(this.car.maxX));
    const height = Math.max(0, Math.round(this.maxAlt));
    const parts = {
      dist: Math.round(dist * ECONOMY.moneyPerMeter),
      height: Math.round(height * ECONOMY.moneyPerHeight),
      coins: this.coins,
      tricks: this.tricks,
    };
    const sum = parts.dist + parts.height + parts.coins + parts.tricks;
    const total = Math.round(sum * this.world.moneyFactor);
    this.hooks.end({ reason, dist, height, parts, total, factor: this.world.moneyFactor });
  }
}
