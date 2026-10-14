import { PHYSICS as P, LAUNCH, KOMBO, ECONOMY, FX, STAGE, CONTROLS, SPAWN } from '../data/balance.js';
import { Vehicle, countFlips } from '../physics/vehicle.js';
import { Objects } from '../physics/objects.js';
import { PLATEAU_H } from '../physics/track.js';
import { makeRng } from '../core/rng.js';
import { DEG } from '../core/math.js';
import { Launch } from './launch.js';

// Ruheposition des Autos in der Schleuder
export const REST = { x: LAUNCH.restX, y: PLATEAU_H + LAUNCH.restHeight, angle: LAUNCH.restAngleDeg * DEG };

const NOOP = () => {};
const NO_HOOKS = { popup: NOOP, sfx: NOOP, shake: NOOP, haptic: NOOP, fx: NOOP, end: NOOP };

// Eine Etappe: Abschuss → Flug/Fahrt → Ende. Reine Logik ohne DOM und three.js.
// Alles Sichtbare geht über `hooks` nach außen (Popups, Sound, Effekte, Ende).
// input: { hold, tilt, boost, aimKey, takeAimDrag() } (siehe platform/input.js)
export class Stage {
  constructor({ world, track, stats, seed, hooks }) {
    this.world = world;
    this.track = track;
    // Welt-Physik (z. B. Sand bremst stärker)
    this.stats = { ...stats, rollFriction: stats.rollFriction * (world.physics?.rollFriction ?? 1) };
    this.hooks = { ...NO_HOOKS, ...hooks };
    this.rng = makeRng(seed >>> 0);
    this.vehicle = new Vehicle(this.stats, world.gravity);
    this.vehicle.reset(REST.x, REST.y, REST.angle);
    this.objects = new Objects(world, track, this.rng.fork('objects').seed);
    this.objects.spawnUntil(SPAWN.initialAhead);

    // Wetter für diese Etappe auswürfeln
    const wr = this.rng.fork('weather');
    const wx = wr.weighted(world.weather || [STAGE.defaultWeather]);
    this.weather = { ...wx, base: wr.range(wx.wind[0], wx.wind[1]), gust: wx.gust || 0, phase: wr.next() * STAGE.gust.phaseRange };
    this.env = {
      wind: this.weather.base,
      lift: (x, alt) => this.objects.thermalAt(x, alt),
    };

    this.phase = 'aim';
    this.launch = new Launch(this.rng.fork('launch'));
    this.lastTick = 0;
    this.previewPts = Array.from({ length: LAUNCH.preview.points }, () => ({ x: 0, y: 0 }));
    this.ctl = { tilt: 0, boost: false };
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
    this.inThermal = false;
    this.ev = [];
  }

  // ---------- Abschuss ----------
  updateAim(realDt, input) {
    const L = this.launch;
    const dAngle = (input.takeAimDrag() * LAUNCH.dragSens + input.aimKey * CONTROLS.keyAngleRate * realDt) * DEG;
    const res = L.update(realDt, { hold: input.hold, dAngle });
    if (L.charging) {
      const tick = Math.floor(L.power * LAUNCH.stretchTicks);
      if (tick !== this.lastTick) {
        this.lastTick = tick;
        if (tick > 0) this.hooks.sfx('stretch', L.power);
      }
    }
    if (res === 'fire') { this.fire(); return; }
    if (res === 'cancel') this.hooks.popup('Zu schwach – nochmal halten!', 'info');
    this.placeInSling();
  }

  // Auto sichtbar in der Schleuder zurückziehen (nie in den Boden)
  placeInSling() {
    const L = this.launch;
    const v = this.vehicle;
    const pull = (L.charging ? L.power : 0) * LAUNCH.maxPullMeters;
    v.x = REST.x - Math.cos(L.angle) * pull;
    v.y = Math.max(REST.y - Math.sin(L.angle) * pull, this.track.heightAt(v.x) + P.rideHeight + LAUNCH.groundClearance);
    v.angle = L.angle;
  }

  get aiming() { return this.phase === 'aim' && this.launch.charging; }

  fire() {
    const L = this.launch;
    const perfect = L.perfect;
    const speed = this.stats.launchSpeed * L.power * (perfect ? 1 + LAUNCH.perfectBonus : 1);
    this.vehicle.launch(speed, L.angle);
    this.phase = 'fly';
    this.perfectLaunch = perfect;
    this.hooks.sfx('launch', L.power);
    this.hooks.haptic('medium');
    this.hooks.shake(FX.shake.launch * L.power);
    if (perfect) {
      this.trick('perfectLaunch', 'PERFEKTER ABSCHUSS!', 1, 'big');
      this.startSlowmo(FX.slowmo.perfectLaunch);
      this.hooks.sfx('perfect');
    }
  }

  // Punkte der Flugkurve ab der aktuellen Kraft (Vorschau). Ergebnis: Anzahl gültiger Punkte in previewPts.
  previewPath() {
    const L = this.launch;
    const pv = LAUNCH.preview;
    if (!L.charging || L.power < LAUNCH.minPower) return 0;
    const sp = this.stats.launchSpeed * L.power;
    let x = this.vehicle.x, y = this.vehicle.y;
    let vx = sp * Math.cos(L.angle), vy = sp * Math.sin(L.angle);
    const k = this.stats.drag / this.stats.mass;
    const h = pv.step / pv.sub;
    for (let i = 0; i < pv.points; i++) {
      for (let j = 0; j < pv.sub; j++) {
        const rvx = vx - this.env.wind;
        const v = Math.hypot(rvx, vy);
        vx += -k * v * rvx * h;
        vy += (-k * v * vy - this.world.gravity) * h;
        x += vx * h;
        y += vy * h;
      }
      this.previewPts[i].x = x;
      this.previewPts[i].y = y;
    }
    return pv.points;
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

  get altitude() { return this.vehicle.y - P.rideHeight - this.track.heightAt(this.vehicle.x); }

  // ---------- Hauptschleife ----------
  update(realDt, input) {
    if (this.phase === 'aim') { this.updateAim(realDt, input); return; }
    if (this.phase !== 'fly') return;

    if (this.slowmo > 0) { this.slowmo -= realDt; this.timeScale = FX.slowmoScale; }
    else this.timeScale = Math.min(1, this.timeScale + realDt * FX.slowmoRecover);
    this.acc += Math.min(realDt, STAGE.maxFrameDt) * this.timeScale;

    const ctl = this.ctl;
    ctl.tilt = input.tilt;
    ctl.boost = input.boost;

    const v = this.vehicle;
    const ev = this.ev;
    const G = STAGE.gust;
    while (this.acc >= P.dt) {
      this.acc -= P.dt;
      v.step(P.dt, ctl, this.track, ev, this.env, this.objects);
      this.time += P.dt;
      const w = this.weather;
      this.env.wind = w.base + (w.gust ? w.gust * Math.sin(this.time * G.freqA + w.phase) * Math.sin(this.time * G.freqB + w.phase * G.phaseB) : 0);
      this.afterStep(P.dt);
      for (const e of ev) this.handle(e);
      ev.length = 0;
      if (this.phase !== 'fly') return;
    }
    this.objects.spawnUntil(v.x + SPAWN.ahead);
  }

  afterStep(dt) {
    const v = this.vehicle;
    // Flugsalto live anzeigen (zählt erst bei sauberer Landung)
    if (!v.onGround) {
      const flips = countFlips(v.rotAccum);
      if (flips > this.flipsInAir) {
        this.flipsInAir = flips;
        this.hooks.popup(flips === 1 ? 'Salto …' : `${flips}× Salto …`, 'info');
        this.hooks.sfx('whoosh');
      }
    } else this.flipsInAir = 0;

    const alt = this.altitude;
    if (alt > this.maxAlt) this.maxAlt = alt;
    const inThermal = !v.onGround && this.objects.thermalAt(v.x, alt) > 0;
    if (inThermal && !this.inThermal) { this.hooks.popup('AUFWIND ↑', 'info'); this.hooks.sfx('whoosh'); }
    this.inThermal = inThermal;
    const marks = KOMBO.heightMarks;
    if (this.altMarks < marks.length && alt >= marks[this.altMarks]) {
      this.trick('height', `HÖHENRAUSCH ${marks[this.altMarks]} m`);
      this.altMarks++;
    }

    if (this.coinStreakTimer > 0) { this.coinStreakTimer -= dt; if (this.coinStreakTimer <= 0) this.coinStreak = 0; }

    if (v.onGround && this.chain.pts > 0) {
      this.chain.timer += dt;
      if (this.chain.timer > KOMBO.chainTimeout) this.bankChain();
    }

    // Ende?
    if (this.wreckTimer >= 0) {
      this.wreckTimer -= dt;
      if (this.wreckTimer < 0) this.finish('wreck');
      return;
    }
    if (v.onGround && Math.abs(v.s) < STAGE.stopSpeed) {
      this.stopTimer += dt;
      if (this.stopTimer > STAGE.stopTime) this.finish('stop');
    } else this.stopTimer = 0;
    if (this.time > STAGE.maxTime) this.finish('time');
  }

  handle(e) {
    const h = this.hooks;
    const v = this.vehicle;
    switch (e.type) {
      case 'coin': {
        this.coins += e.v * ECONOMY.coinValue;
        this.coinStreak++;
        this.coinStreakTimer = STAGE.coinStreakTime;
        h.sfx('coin', this.coinStreak);
        h.fx('coin', e.x, e.y);
        if (e.big) { h.popup(`GOLDMÜNZE +${e.v}`, 'good'); h.haptic('light'); }
        break;
      }
      case 'ring': {
        v.addSpeed(STAGE.ringSpeed);
        v.boost = Math.min(this.stats.boostMax, v.boost + this.stats.boostMax * STAGE.ringBoostRefill);
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
        v.hit();
        this.loseChain();
        h.popup(v.hp > 0 ? 'Autsch!' : 'TOTALSCHADEN!', 'bad');
        h.sfx('crash', 1);
        h.fx('smash', e.x, e.y, { type: e.obstacle.type });
        h.shake(FX.shake.hit);
        h.haptic('heavy');
        if (v.hp <= 0) this.wreckTimer = STAGE.wreckDelay;
        break;
      }
      case 'takeoff':
        if (e.ramp) { h.sfx('whoosh'); h.fx('dust', v.x, v.y - P.rideHeight); }
        break;
      case 'landing':
        this.onLanding(e);
        break;
    }
  }

  onLanding(e) {
    const h = this.hooks;
    const big = e.airTime > KOMBO.minAirForLanding;
    h.fx('dust', e.x, e.y - P.rideHeight, { amount: Math.min(1, e.impact / FX.landDustDiv) });
    h.sfx('land', Math.min(1, e.impact / FX.landSoundDiv));
    if (e.kind === 'crash') {
      this.loseChain();
      h.popup(this.vehicle.hp > 0 ? 'Bruchlandung!' : 'TOTALSCHADEN!', 'bad');
      h.sfx('crash', 1);
      h.fx('smash', e.x, e.y, { type: 'car' });
      h.shake(FX.shake.crash);
      h.haptic('heavy');
      if (this.vehicle.hp <= 0) this.wreckTimer = STAGE.wreckDelay;
      return;
    }
    if (e.kind === 'bumpy') {
      if (big) h.popup('Holprig …', 'info');
      if (e.flips > 0) h.popup('Salto nicht gestanden', 'bad');
      h.shake(Math.min(FX.shake.bumpyMax, e.impact / FX.shake.bumpyDiv));
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
        this.startSlowmo(FX.slowmo.multiFlip);
      }
      h.haptic('success');
    }
    if (big) {
      if (e.kind === 'perfect') {
        this.trick('perfectLanding', 'PERFEKTE LANDUNG!', 1, 'big');
        this.startSlowmo(FX.slowmo.perfectLanding);
        h.sfx('perfect');
      } else this.trick('cleanLanding', 'Saubere Landung');
    }
    h.shake(Math.min(FX.shake.landMax, e.impact / FX.shake.landDiv));
    if (e.impact > FX.landHapticImpact) h.haptic('light');
  }

  finish(reason) {
    if (this.phase === 'over') return;
    this.bankChain(true);
    this.phase = 'over';
    const dist = Math.max(0, Math.round(this.vehicle.maxX));
    const height = Math.max(0, Math.round(this.maxAlt));
    const parts = {
      dist: Math.round(dist * ECONOMY.moneyPerMeter),
      height: Math.round(height * ECONOMY.moneyPerHeight),
      coins: this.coins,
      tricks: this.tricks,
    };
    const sum = parts.dist + parts.height + parts.coins + parts.tricks;
    const total = Math.round(sum * this.world.moneyFactor);
    this.hooks.end({ reason, dist, height, parts, total, factor: this.world.moneyFactor, world: this.world.id });
  }
}
