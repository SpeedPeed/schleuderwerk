import { PHYSICS as P, LAUNCH, KOMBO, FX, STAGE, CONTROLS, SPAWN, RESOURCES as R, RULES } from '../data/balance.js';
import { Vehicle } from '../physics/vehicle.js';
import { Objects } from '../physics/objects.js';
import { PLATEAU_H } from '../physics/track.js';
import { makeRng } from '../core/rng.js';
import { DEG } from '../core/math.js';
import { Launch } from './launch.js';
import { AbilityBar } from './abilities.js';
import { testDriveReward } from './scoring.js';
import { EventQueue } from '../items/eventQueue.js';
import { ModState } from '../items/modState.js';
import { isEvent } from '../items/events.js';
import { computeStats, baseStats } from '../items/statMods.js';

// Ruheposition des Autos in der Schleuder
export const REST = { x: LAUNCH.restX, y: PLATEAU_H + LAUNCH.restHeight, angle: LAUNCH.restAngleDeg * DEG };

const NOOP = () => {};
const NO_HOOKS = { popup: NOOP, sfx: NOOP, shake: NOOP, haptic: NOOP, fx: NOOP, end: NOOP, event: NOOP };

// Eine Etappe: Abschuss → Flug/Fahrt → Ende. Reine Logik ohne DOM und three.js.
// Alles Sichtbare geht über `hooks` nach außen (Popups, Sound, Effekte, Ereignisse, Ende).
// input: { hold, tilt, aimKey, takeAimDrag(), abilityHeld(i), takeAbilityPress(i) } (siehe platform/input.js);
//        ältere Eingaben mit nur `boost` (gehalten) funktionieren auch.
//
// Ereignisse: Physik und Objekte schreiben Rohereignisse in this.ev; handle() reagiert darauf (Popups, Schaden,
// Tricks) und reiht die Trigger-Ereignisse (Namen nach ARCHITEKTUR.md 4.2) in this.queue ein. Die Warteschlange
// wird nach jedem Physik-Schritt abgearbeitet: hooks.event(name, data) und – ab Phase 4 – this.onEvent
// (Trigger-Engine, (name, data, depth)).
//
// Regeln, die HIER ausgewertet werden (ARCHITEKTUR.md Anhang A): collectScrapMass (Kollision, Pickups),
// heatToThrust (Fähigkeit Schleudergang).
export class Stage {
  // loadout: Ergebnis von garage/loadout.js buildLoadout(save); alternativ nur `stats` (fertige Werte, Tests).
  // durability: Start-Haltbarkeit (Run, ab Phase 3); sonst voll.
  constructor({ world, track, loadout = null, stats = null, seed = 1, hooks = {}, durability }) {
    this.world = world;
    this.track = track;
    this.hooks = { ...NO_HOOKS, ...hooks };
    this.rng = makeRng(seed >>> 0);

    // Ausrüstung und Werte: Garage-Werte + Welt-Physik + zeitweise Modifikatoren (Buffs, Stapel)
    const lo = loadout || { stats: stats || baseStats(), rules: {}, abilities: ['boost'], sources: [], statInput: null };
    this.loadout = lo;
    this.rules = lo.rules || {};
    this.statInput = lo.statInput || { base: lo.stats };
    this.worldMods = { stats: { rollFriction: { xmul: world.physics?.rollFriction ?? 1 } } };
    this.runMods = { stats: { durabilityMax: { add: 0 }, fuelMax: { add: 0 } } };
    this.mods = new ModState();
    this.stats = this.computeStats();

    this.ev = [];
    this.vehicle = new Vehicle(this.stats, world.gravity, this.rules);
    this.vehicle.reset(REST.x, REST.y, REST.angle);
    this.vehicle.ev = this.ev;
    if (durability !== undefined) this.vehicle.durability = Math.max(0, Math.min(durability, this.stats.durabilityMax));
    this.startDurability = this.vehicle.durability;

    const scrapPickups = this.rules.collectScrapMass ? RULES.collectScrapMass.pickups : 0;
    this.objects = new Objects(world, track, this.rng.fork('objects').seed, { scrapPickups });
    this.objects.spawnUntil(SPAWN.initialAhead);

    // Wetter für diese Etappe auswürfeln
    const wr = this.rng.fork('weather');
    const wx = wr.weighted(world.weather || [STAGE.defaultWeather]);
    this.weather = { ...wx, base: wr.range(wx.wind[0], wx.wind[1]), gust: wx.gust || 0, phase: wr.next() * STAGE.gust.phaseRange };
    this.env = {
      wind: this.weather.base,
      lift: (x, alt) => this.objects.thermalAt(x, alt),
      heat: world.physics?.ambientHeat || 0,
    };

    this.abilities = new AbilityBar(lo.abilities || []);
    this.queue = new EventQueue();
    this.eventCounts = {};
    this.onEvent = null;           // Phase 4: Trigger-Engine (name, data, depth)
    this.ctx = this.makeCtx();

    this.phase = 'aim';
    this.launch = new Launch(this.rng.fork('launch'), this.stats);
    this.lastTick = 0;
    this.previewPts = Array.from({ length: LAUNCH.preview.points }, () => ({ x: 0, y: 0 }));
    this.ctl = { tilt: 0, boost: false };
    this.chain = { pts: 0, mult: 1, timer: 0 };
    this.tricks = 0;
    this.bolts = 0;
    this.boltStreak = 0;
    this.boltStreakTimer = 0;
    this.scrapPickups = 0;
    this.scrapBonus = 0;
    this.maxAlt = 0;
    this.altMarks = 0;
    this.lastMilestone = 0;
    this.time = 0;
    this.acc = 0;
    this.timeScale = 1;
    this.slowmo = 0;
    this.stopTimer = 0;
    this.wreckTimer = -1;
    this.perfectLaunch = false;
    this.inThermal = false;
    this.stunts = { flips: 0, perfectLandings: 0, cleanLandings: 0, crashes: 0, nearMisses: 0, maxAirTime: 0, rings: 0 };
    this.emit('stageStart', {});
  }

  // ---------- Werte ----------
  computeStats() {
    return computeStats({ ...this.statInput, extra: [this.worldMods, this.runMods], buffs: this.mods.mods() });
  }

  // Werte neu berechnen (Buffs/Stapel geändert, Dev-Menü, Run-Effekte)
  recomputeStats() {
    this.stats = this.computeStats();
    this.mods.dirty = false;
    if (this.vehicle) this.vehicle.stats = this.stats;
  }

  // dauerhafte Änderung bis Etappenende (Effekte maxHp/maxFuel)
  addRunMod(stat, n) {
    this.runMods.stats[stat].add += n;
    this.recomputeStats();
    if (stat === 'durabilityMax' && n > 0) this.vehicle.durability += n;
    if (stat === 'fuelMax' && n > 0) this.vehicle.addFuel(n);
  }

  // ---------- Ereignisse ----------
  // Trigger-Ereignis einreihen (Namen nach ARCHITEKTUR.md 4.2)
  emit(name, data = {}, depth = 0) { this.queue.push(name, data, depth); }

  flushEvents() {
    if (!this.queue.length) return;
    this.queue.drain((name, data, depth) => {
      this.eventCounts[name] = (this.eventCounts[name] || 0) + 1;
      this.hooks.event(name, data);
      if (this.onEvent) this.onEvent(name, data, depth);
    });
  }

  // Schnittstelle der Effekte zur Welt (ARCHITEKTUR.md §5)
  makeCtx() {
    const st = this;
    const ctx = {
      stage: st,
      get vehicle() { return st.vehicle; },
      rng: st.rng.fork('fx'),
      source: null,
      depth: 0,
      addBolts: (n) => st.addBolts(n),
      addScrap: (n) => { st.scrapBonus += n; },
      heal: (n) => st.vehicle.heal(n, st.ev),
      damage: (n, src = 'fx', opts = {}) => st.vehicle.damage(n, src, st.ev, opts),
      popup: (t, k) => st.hooks.popup(t, k),
      fx: (name, data) => st.hooks.fx(name, st.vehicle.x, st.vehicle.y, data),
      luck: () => st.stats.luck,
      emit: (name, data) => st.emit(name, data, (ctx.depth || 0) + 1),
      freeBoost: (dur, source) => st.vehicle.startFreeBoost(dur, source),
      addBuff: (stat, mod, dur) => st.mods.addBuff(stat, mod, dur, ctx.source),
      addStack: (key, stat, mod, max) => st.mods.addStack(key, stat, mod, max),
      charge: (key, n, at) => st.mods.charge(key, n, at),
      shield: (n) => { st.vehicle.shields += n; },
      slowmo: (dur) => st.startSlowmo(dur),
      refill: (id, pct) => st.abilities.refill(id, pct, st.stats),
      magnet: (radius, dur) => {
        const v = st.vehicle;
        v.magnetFxRadius = v.magnetFx > 0 ? Math.max(v.magnetFxRadius, radius) : radius;
        v.magnetFx = Math.max(v.magnetFx, dur);
      },
      maxHp: (n) => st.addRunMod('durabilityMax', n),
      maxFuel: (n) => st.addRunMod('fuelMax', n),
      upgradeItem: () => (st.hooks.upgradeItem ? st.hooks.upgradeItem() : false),
      maxDurability: () => st.stats.durabilityMax,
    };
    return ctx;
  }

  addBolts(n) {
    if (!(n > 0)) return;
    this.bolts += n * this.stats.boltGain;
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
    const speed = this.stats.launchSpeed * L.power * (perfect ? 1 + this.stats.launchPerfectBonus : 1);
    this.vehicle.launch(speed, L.angle);
    this.phase = 'fly';
    this.perfectLaunch = perfect;
    this.emit('launch', { power: L.power, perfect, angle: L.angle });
    if (perfect) this.emit('perfectLaunch', { power: L.power });
    this.hooks.sfx('launch', L.power);
    this.hooks.haptic('medium');
    this.hooks.shake(FX.shake.launch * L.power);
    if (perfect) {
      this.trick('perfectLaunch', 'PERFEKTER ABSCHUSS!', 1, 'big');
      this.startSlowmo(FX.slowmo.perfectLaunch);
      this.hooks.sfx('perfect');
    }
  }

  // Sofort abschießen (Tests, Dev-Menü): Kraft 0…1, Winkel in Grad
  launchNow(power = 1, angleDeg = LAUNCH.angleDefault, perfect = false) {
    if (this.phase !== 'aim') return;
    const L = this.launch;
    L.power = power;
    L.angle = angleDeg * DEG;
    L.fired = true;
    L.perfect = perfect;
    this.fire();
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

  // ---------- Fähigkeiten ----------
  // Knöpfe/Tasten eines Bildes lesen (Drücke während des Zielens verfallen)
  readAbilityInput(input, use) {
    const bar = this.abilities;
    for (let i = 0; i < bar.length; i++) {
      const presses = input.takeAbilityPress ? input.takeAbilityPress(i) : 0;
      if (!use) continue;
      const held = input.abilityHeld ? input.abilityHeld(i) : (i === bar.boostSlot && !!input.boost);
      bar.input(i, held, presses, this);
    }
  }

  // Regel heatToThrust (Schleudergang): Hitze → Sofort-Schub, ab RULES.heatToThrust.explodeAt zusätzlich explosion
  heatToThrust(factor) {
    const v = this.vehicle;
    const heat = v.heat;
    const amount = Math.max(RULES.heatToThrust.min, heat * factor);
    v.thrust(amount);
    v.heat = 0;
    this.hooks.popup(`SCHLEUDERGANG +${Math.round(amount)} m/s`, 'big');
    this.hooks.fx('steamBurst', v.x, v.y, { amount });
    if (heat >= RULES.heatToThrust.explodeAt) {
      this.emit('explosion', { amount });
      this.hooks.fx('explosion', v.x, v.y, { amount });
      this.hooks.sfx('explosion');
    }
  }

  // ---------- Hauptschleife ----------
  update(realDt, input) {
    if (this.phase === 'aim') {
      this.updateAim(realDt, input);
      this.readAbilityInput(input, false);
      this.flushEvents();
      return;
    }
    if (this.phase !== 'fly') return;

    if (this.slowmo > 0) { this.slowmo -= realDt; this.timeScale = FX.slowmoScale; }
    else this.timeScale = Math.min(1, this.timeScale + realDt * FX.slowmoRecover);
    this.acc += Math.min(realDt, STAGE.maxFrameDt) * this.timeScale;

    this.readAbilityInput(input, true);
    const ctl = this.ctl;
    ctl.tilt = input.tilt;

    const v = this.vehicle;
    const ev = this.ev;
    const G = STAGE.gust;
    while (this.acc >= P.dt) {
      this.acc -= P.dt;
      this.abilities.update(P.dt, this);
      ctl.boost = this.abilities.boostHeld;
      this.mods.update(P.dt);
      if (this.mods.dirty) this.recomputeStats();
      v.step(P.dt, ctl, this.track, ev, this.env, this.objects);
      this.time += P.dt;
      const w = this.weather;
      this.env.wind = w.base + (w.gust ? w.gust * Math.sin(this.time * G.freqA + w.phase) * Math.sin(this.time * G.freqB + w.phase * G.phaseB) : 0);
      this.afterStep(P.dt);
      for (const e of ev) this.handle(e);
      ev.length = 0;
      this.checkWreck();
      this.flushEvents();
      if (this.phase !== 'fly') return;
    }
    this.objects.spawnUntil(v.x + SPAWN.ahead);
  }

  afterStep(dt) {
    const v = this.vehicle;
    const alt = this.altitude;
    if (alt > this.maxAlt) this.maxAlt = alt;
    if (!v.onGround && v.airTime > this.stunts.maxAirTime) this.stunts.maxAirTime = v.airTime;
    const inThermal = !v.onGround && this.objects.thermalAt(v.x, alt) > 0;
    if (inThermal && !this.inThermal) { this.hooks.popup('AUFWIND ↑', 'info'); this.hooks.sfx('whoosh'); }
    this.inThermal = inThermal;
    const marks = KOMBO.heightMarks;
    if (this.altMarks < marks.length && alt >= marks[this.altMarks]) {
      this.trick('height', `HÖHENRAUSCH ${marks[this.altMarks]} m`);
      this.altMarks++;
    }
    // Meilenstein-Ereignis alle STAGE.milestoneEvery Meter
    const m = Math.floor(v.maxX / STAGE.milestoneEvery) * STAGE.milestoneEvery;
    if (m > this.lastMilestone) { this.lastMilestone = m; this.emit('milestone', { m }); }

    if (this.boltStreakTimer > 0) { this.boltStreakTimer -= dt; if (this.boltStreakTimer <= 0) this.boltStreak = 0; }

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

  // Haltbarkeit aufgebraucht → Totalschaden (Etappe endet kurz danach)
  checkWreck() {
    if (this.wreckTimer >= 0 || this.phase !== 'fly' || this.vehicle.durability > 0) return;
    this.wreckTimer = STAGE.wreckDelay;
    this.loseChain();
    this.hooks.popup('TOTALSCHADEN!', 'bad');
    this.hooks.sfx('crash', 1);
    this.hooks.fx('smash', this.vehicle.x, this.vehicle.y, { type: 'car' });
    this.hooks.haptic('heavy');
  }

  // Rohereignis aus Physik/Objekten/Effekten verarbeiten und als Trigger-Ereignis weitergeben
  handle(e) {
    const h = this.hooks;
    const v = this.vehicle;
    switch (e.type) {
      case 'bolt': {
        this.addBolts(e.v);
        this.boltStreak++;
        this.boltStreakTimer = STAGE.boltStreakTime;
        h.sfx('bolt', this.boltStreak);
        h.fx('bolt', e.x, e.y);
        if (e.big) { h.popup(`SCHRAUBENDOSE +${e.v} 🔩`, 'good'); h.haptic('light'); }
        this.emit('pickup', { kind: 'bolt', value: e.v, x: e.x, y: e.y });
        return;
      }
      case 'scrapPickup':
        this.collectScrap(e.x, e.y);
        return;
      case 'ring': {
        v.addSpeed(STAGE.ringSpeed);
        v.addFuel(this.stats.fuelMax * STAGE.ringFuelRefill);
        this.stunts.rings++;
        this.trick('ring', 'BOOST-RING!');
        h.sfx('ring');
        h.fx('ring', e.x, e.y);
        h.haptic('light');
        return;
      }
      case 'nearMiss':
        this.stunts.nearMisses++;
        this.trick('nearMiss', 'KNAPP VORBEI!');
        return;
      case 'hit':
        this.onHit(e);
        return;
      case 'takeoff':
        if (e.ramp) { h.sfx('whoosh'); h.fx('dust', v.x, v.y - P.rideHeight); }
        if (e.jump) h.sfx('jump');
        return;
      case 'landing':
        this.onLanding(e);
        break;
      case 'flip':
        h.popup(e.count === 1 ? 'Salto …' : `${e.count}× Salto …`, 'info');
        h.sfx('whoosh');
        break;
      case 'overheat':
        if (this.rules.noOverheat || this.rules.heatIsResource) h.popup('VOLLE HITZE!', 'info');
        else {
          h.popup('ÜBERHITZT! 🔥', 'bad');
          h.haptic('medium');
        }
        h.sfx('overheat');
        break;
      case 'fuelEmpty':
        h.popup('Tank leer – rollt aus …', 'info');
        h.sfx('empty');
        break;
      case 'damage':
        if (e.amount >= R.damagePopupMin && e.source !== 'crash') h.popup(`−${Math.round(e.amount)} 🔧`, 'bad');
        break;
      case 'bounce':
        h.popup('PLONK! Abgeprallt', 'good');
        h.sfx('bounce');
        break;
      case 'boost':
        if (e.free) h.popup('GRATIS-BOOST!', 'good');
        break;
    }
    if (isEvent(e.type)) this.emit(e.type, e);
  }

  // Schrott-Pickup (Regel collectScrapMass)
  collectScrap(x, y) {
    this.scrapPickups++;
    this.hooks.fx('scrap', x, y);
    this.hooks.sfx('bolt', 1);
    this.hooks.popup('Schrott eingesackt', 'good');
    this.emit('pickup', { kind: 'scrap', x, y });
  }

  onHit(e) {
    const h = this.hooks;
    const v = this.vehicle;
    const o = e.obstacle;
    // Regel collectScrapMass (Mülltonne): Schrottberge schaden weniger, bremsen weniger und geben Schrott
    const scrapMass = !!this.rules.collectScrapMass && o.type === 'scrap';
    const C = RULES.collectScrapMass;
    v.hitSlow(scrapMass ? (P.hitSpeedKeep + 1) / 2 : P.hitSpeedKeep);
    const dmg = v.damage(R.obstacleDamage * (scrapMass ? C.damageMul : 1), 'obstacle', this.ev);
    this.emit('collision', { kind: o.type, damage: dmg, x: e.x, y: e.y });
    if (scrapMass) this.collectScrap(e.x, e.y);
    this.loseChain();
    if (dmg > 0) h.popup('Autsch!', 'bad');
    h.sfx('crash', 1);
    h.fx('smash', e.x, e.y, { type: o.type });
    h.shake(FX.shake.hit);
    h.haptic('heavy');
  }

  onLanding(e) {
    const h = this.hooks;
    const big = e.airTime > KOMBO.minAirForLanding;
    h.fx('dust', e.x, e.y - P.rideHeight, { amount: Math.min(1, e.impact / FX.landDustDiv) });
    h.sfx('land', Math.min(1, e.impact / FX.landSoundDiv));
    if (e.quality === 'crash') {
      this.stunts.crashes++;
      this.loseChain();
      h.popup('Bruchlandung!', 'bad');
      h.sfx('crash', 1);
      h.fx('smash', e.x, e.y, { type: 'car' });
      h.shake(FX.shake.crash);
      h.haptic('heavy');
      return;
    }
    if (e.quality === 'bumpy') {
      if (big) h.popup('Holprig …', 'info');
      if (e.flips > 0) h.popup('Salto nicht gestanden', 'bad');
      h.shake(Math.min(FX.shake.bumpyMax, e.impact / FX.shake.bumpyDiv));
      h.haptic('medium');
      return;
    }
    if (e.flips > 0) {
      const n = e.flips;
      this.stunts.flips += n;
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
    if (e.quality === 'perfect') this.stunts.perfectLandings++;
    else this.stunts.cleanLandings++;
    if (big) {
      if (e.quality === 'perfect') {
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
    this.abilities.release();
    const v = this.vehicle;
    const dist = Math.max(0, Math.round(v.maxX));
    const height = Math.max(0, Math.round(this.maxAlt));
    this.emit('stageEnd', { medal: null, dist });
    this.flushEvents();
    const r = {
      reason,
      cleared: reason !== 'wreck',
      medal: null,
      dist,
      height,
      tricks: this.tricks,
      bolts: Math.floor(this.bolts),
      scrapPickups: this.scrapPickups,
      scrapBonus: this.scrapBonus,
      damageTaken: Math.round(v.damageTaken),
      durability: Math.max(0, Math.round(v.durability)),
      durabilityMax: Math.round(this.stats.durabilityMax),
      fuelLeft: Math.round(v.fuel),
      stunts: { ...this.stunts },
      time: this.time,
      world: this.world.id,
    };
    const reward = testDriveReward(r, this.stats, this.world);
    r.parts = reward.parts;
    r.factor = reward.factor;
    r.scrap = reward.total;
    this.hooks.end(r);
  }
}
