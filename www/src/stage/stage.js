import { PHYSICS as P, LAUNCH, KOMBO, FX, STAGE, CONTROLS, SPAWN, RESOURCES as R, RULES, ITEMS, FEATURES, PICKUPS, TESTDRIVE } from '../data/balance.js';
import { Vehicle } from '../physics/vehicle.js';
import { Objects } from '../physics/objects.js';
import { Track, PLATEAU_H } from '../physics/track.js';
import { generateStageSpec, medalFor } from '../physics/trackGen.js';
import { BIOMES } from '../data/biomes.js';
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
const warnedEvents = new Set();
function warnEvent(name) {
  if (warnedEvents.has(name)) return;
  warnedEvents.add(name);
  console.warn(`Unbekanntes Ereignis „${name}“ (Effekt emit) – verworfen`);
}
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
//
// Phase 3: Die Strecke kommt aus einer StageSpec (physics/trackGen.js) mit Zielmarke und Medaillen
// (spec.medals: bronze = Ziel, silver, gold). Endgründe: 'stop' (steht), 'wreck' (Haltbarkeit 0), 'fall'
// (Schluchtsturz, + FEATURES.gap.fallDamage), 'time' (STAGE.maxTime). Ergebnis nach ARCHITEKTUR.md §7.
export class Stage {
  // biome (alt: world): Biom aus data/biomes.js. spec: StageSpec (sonst einfache Etappe Etage 0 des Bioms).
  // track: fertige Strecke (sonst aus spec). loadout: garage/loadout.js buildLoadout; alternativ nur `stats` (Tests).
  // durability: Start-Haltbarkeit (aus dem Run); sonst voll. runMods: { fuelMaxAdd, coolMul, durabilityMaxAdd } (Run).
  constructor({ biome, world, spec = null, track = null, loadout = null, stats = null, seed = 1, hooks = {}, durability, runMods = {} }) {
    this.rng = makeRng(seed >>> 0);
    this.biome = biome || world || (track && track.biome) || BIOMES[0];
    this.world = this.biome;   // alter Name (Phase 1–2)
    this.spec = spec || (track && track.spec) || generateStageSpec({ biome: this.biome, kind: 'stage', floor: 0, rng: this.rng.fork('spec') });
    this.track = track || new Track(this.spec, this.biome);
    this.hooks = { ...NO_HOOKS, ...hooks };
    const bio = this.biome;

    // Ausrüstung und Werte: Garage-Werte + Welt-Physik + zeitweise Modifikatoren (Buffs, Stapel)
    const lo = loadout || { stats: stats || baseStats(), rules: {}, abilities: ['boost'], sources: [], statInput: null };
    this.loadout = lo;
    this.rules = lo.rules || {};
    this.statInput = lo.statInput || { base: lo.stats };
    this.worldMods = { stats: { rollFriction: { xmul: bio.physics?.rollFriction ?? 1 }, landTolDeg: { add: bio.physics?.landTolAdd || 0 } } };
    this.runMods = { stats: {
      durabilityMax: { add: runMods.durabilityMaxAdd || 0 },
      fuelMax: { add: runMods.fuelMaxAdd || 0 },
      coolRate: { mul: runMods.coolMul || 0 },
    } };
    this.mods = new ModState();
    this.stats = this.computeStats();

    this.ev = [];
    this.vehicle = new Vehicle(this.stats, bio.gravity, this.rules);
    this.vehicle.reset(REST.x, REST.y, REST.angle);
    this.vehicle.ev = this.ev;
    if (durability !== undefined) this.vehicle.durability = Math.max(0, Math.min(durability, this.stats.durabilityMax));
    this.startDurability = this.vehicle.durability;

    const scrapPickups = this.rules.collectScrapMass ? RULES.collectScrapMass.pickups : 0;
    this.objects = new Objects(bio, this.track, this.rng.fork('objects').seed, { scrapPickups, spec: this.spec });
    this.objects.spawnUntil(SPAWN.initialAhead);

    // Wetter steht in der StageSpec (deterministisch, im Etappen-Intro sichtbar)
    const wx = this.spec.weather || { ...STAGE.defaultWeather, base: 0, phase: 0 };
    this.weather = { ...wx, gust: wx.gust || 0, base: wx.base ?? 0, phase: wx.phase ?? 0 };
    this.ambientHeat = bio.physics?.ambientHeat || 0;
    this.env = {
      wind: this.weather.base,
      lift: (x, alt) => this.objects.thermalAt(x, alt),
      heat: this.ambientHeat,
      ax: 0,
      ay: 0,
    };

    // Ziel und Medaillen
    this.kind = this.spec.kind || 'stage';
    this.target = this.spec.target;
    this.medals = this.spec.medals;
    this.medalList = this.spec.medalList || ['bronze', 'silver', 'gold'];
    this.medal = null;            // bisher erreichte Medaille
    this.fallTimer = -1;
    this.fell = false;
    this.inWind = false;
    this.inHeat = false;

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
    this.scrap = 0;               // Meta-Schrott aus Pickups
    this.blueprints = 0;
    this.crates = 0;
    this.pickupCounts = { fuel: 0, cool: 0, repair: 0, scrap: 0, crate: 0, blueprint: 0 };
    this.shocks = 0;
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
    this.chuteOpen = false;
    this.stunts = { flips: 0, perfectLandings: 0, cleanLandings: 0, crashes: 0, nearMisses: 0, maxAirTime: 0, rings: 0, loops: 0 };
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

  // dauerhafte Änderung bis Etappenende (Effekte maxHp/maxFuel). Der aktuelle Wert steigt um genau so viel
  // wie das (fertig berechnete) Maximum und bleibt immer ≤ Maximum.
  addRunMod(stat, n) {
    if (!n) return;
    const before = this.stats[stat];
    this.runMods.stats[stat].add += n;
    this.recomputeStats();
    const gain = this.stats[stat] - before;
    const v = this.vehicle;
    if (stat === 'durabilityMax') {
      if (gain > 0) v.durability += gain;
      v.durability = Math.min(v.durability, this.stats.durabilityMax);
    } else if (stat === 'fuelMax') {
      const over = v.fuel > before + 1e-9;   // schon über dem Maximum betankt (fuel {over:true})
      if (gain > 0) v.addFuel(gain, over);
      v.fuel = Math.min(v.fuel, this.stats.fuelMax * (over ? ITEMS.overFuelMax : 1));
    }
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
      emit: (name, data) => {
        // Tippfehler in Inhaltsdaten sollen kein totes Ereignis erzeugen: unbekannte Namen einmal melden, verwerfen
        if (!isEvent(name)) { warnEvent(name); return; }
        st.emit(name, data, (ctx.depth || 0) + 1);
      },
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
        vy += (-k * v * vy - this.biome.gravity) * h;
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
    while (this.acc >= P.dt) {
      this.acc -= P.dt;
      this.abilities.update(P.dt, this);
      ctl.boost = this.abilities.boostHeld;
      this.mods.update(P.dt);
      if (this.mods.dirty) this.recomputeStats();
      this.updateEnv();
      v.step(P.dt, ctl, this.track, ev, this.env, this.objects);
      this.time += P.dt;
      this.objects.update(P.dt, v, ev);
      this.afterStep(P.dt);
      for (const e of ev) this.handle(e);
      ev.length = 0;
      this.checkWreck();
      this.flushEvents();
      if (this.phase !== 'fly') return;
    }
    this.objects.spawnUntil(v.x + SPAWN.ahead);
  }

  // Umgebung an der Fahrzeug-Position: Wetter-Wind (+ Böen) + Windzone, Biom-Hitze + Hitzefeld, Magnetkran
  updateEnv() {
    const v = this.vehicle;
    const w = this.weather;
    const G = STAGE.gust;
    const o = this.objects;
    this.env.wind = w.base + (w.gust ? w.gust * Math.sin(this.time * G.freqA + w.phase) * Math.sin(this.time * G.freqB + w.phase * G.phaseB) : 0) + o.windAt(v.x);
    const zoneHeat = o.heatAt(v.x);
    this.env.heat = this.ambientHeat + zoneHeat;
    o.magnetPull(v.x, v.y, this.env);
    const inWind = o.windAt(v.x) !== 0;
    if (inWind && !this.inWind) this.hooks.popup(o.windAt(v.x) > 0 ? 'RÜCKENWIND →' : '← GEGENWIND', 'info');
    this.inWind = inWind;
    const inHeat = zoneHeat > 0;
    if (inHeat && !this.inHeat) this.hooks.popup('HITZEFELD 🔥', 'info');
    this.inHeat = inHeat;
  }

  afterStep(dt) {
    const v = this.vehicle;
    const alt = this.altitude;
    // Medaillen-Marken überfahren
    const md = medalFor(v.maxX, this.medals);
    if (md && md !== this.medal) {
      this.medal = md;
      const first = this.medalList.indexOf(md) === 0;
      const names = { bronze: 'BRONZE', silver: 'SILBER', gold: 'GOLD' };
      this.hooks.popup(first ? `ZIEL ERREICHT! ${MEDAL_ICON[md]}` : `${names[md]}! ${MEDAL_ICON[md]}`, 'big');
      this.hooks.sfx('medal', this.medalList.indexOf(md));
      this.hooks.fx('medal', v.x, v.y, { medal: md });
      this.hooks.haptic('success');
    }
    if (alt > this.maxAlt) this.maxAlt = alt;
    if (!v.onGround && v.airTime > this.stunts.maxAirTime) this.stunts.maxAirTime = v.airTime;
    // Fallschirm zu (gekappt, gelandet, abgelaufen) → sein Auftriebs-Buff endet mit ihm
    const chute = v.parachute > 0;
    if (this.chuteOpen && !chute) this.abilities.parachuteClosed(this);
    this.chuteOpen = chute;
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
    if (this.fallTimer >= 0) {
      this.fallTimer -= dt;
      if (this.fallTimer < 0) this.finish('fall');
      return;
    }
    if (v.onGround && !v.loop && Math.abs(v.s) < STAGE.stopSpeed) {
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
      case 'pickup':
        this.onPickup(e);
        return;
      case 'fall':
        this.onFall(e);
        return;
      case 'shock':
        this.onShock(e);
        return;
      case 'lightningWarn':
        h.sfx('warn');
        return;
      case 'lightning':
        h.fx('lightning', e.x, e.y);
        h.sfx('zap');
        h.shake(FX.shake.lightning);
        return;
      case 'loopEnter':
        h.sfx('whoosh');
        return;
      case 'loop':
        if (e.done) {
          this.stunts.loops++;
          this.trick('loop', 'LOOPING!', 1, 'big');
          h.sfx('perfect');
          h.haptic('success');
        } else h.popup('Zu langsam für den Looping!', 'bad');
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
        this.emit('boost', e);
        if (!e.free) this.abilities.boostStarted(this);   // abilityUse {boost} erst beim echten Start
        return;
    }
    if (isEvent(e.type)) this.emit(e.type, e);
  }

  // Schrott eingesammelt (Pickup oder Regel collectScrapMass): Meta-Schrott + Ladung der Mülltonne
  collectScrap(x, y, value = 1) {
    this.scrapPickups++;
    this.scrap += value * (this.stats.scrapGain ?? 1);
    this.pickupCounts.scrap++;
    this.hooks.fx('scrap', x, y);
    this.hooks.sfx('bolt', 1);
    this.hooks.popup(`Schrott +${Math.round(value)} ⚙`, 'good');
    this.emit('pickup', { kind: 'scrap', x, y });
  }

  // Pickups: ⛽ Kanister, ❄ Kühlpack, 🔧 Reparaturset, ⚙ Schrott, 📦 Item-Kiste (Phase 4), 📘 Blaupause (Elite)
  onPickup(e) {
    const h = this.hooks;
    const v = this.vehicle;
    if (e.kind === 'scrap') { this.collectScrap(e.x, e.y, e.value || PICKUPS.scrap); return; }
    this.pickupCounts[e.kind] = (this.pickupCounts[e.kind] || 0) + 1;
    switch (e.kind) {
      case 'fuel': v.addFuel(PICKUPS.fuel); h.popup(`KANISTER +${PICKUPS.fuel} ⛽`, 'good'); break;
      case 'cool': v.cool(PICKUPS.cool); h.popup('KÜHLPACK ❄', 'good'); break;
      case 'repair': v.heal(PICKUPS.repair, this.ev); h.popup(`REPARATURSET +${PICKUPS.repair} 🔧`, 'good'); break;
      case 'crate': this.crates++; h.popup('ITEM-KISTE 📦', 'big'); break;
      case 'blueprint': this.blueprints++; h.popup('BLAUPAUSE! 📘', 'big'); break;
      default: break;
    }
    h.sfx('ring');
    h.fx('sparkle', e.x, e.y);
    h.haptic('light');
    this.emit('pickup', { kind: e.kind, x: e.x, y: e.y });
  }

  // Schluchtsturz: + Schaden, Etappe endet kurz danach
  onFall() {
    if (this.fell) return;
    this.fell = true;
    const h = this.hooks;
    this.loseChain();
    this.vehicle.damage(FEATURES.gap.fallDamage, 'fall', this.ev, { pierce: true });
    h.popup('ABGESTÜRZT!', 'bad');
    h.sfx('crash', 1);
    h.haptic('heavy');
    this.fallTimer = STAGE.fallDelay;
  }

  // Blitz eingeschlagen (Blitzzone): Ereignis shock + Schaden
  onShock(e) {
    const h = this.hooks;
    this.shocks++;
    this.emit('shock', { source: e.source || 'lightning' });
    this.vehicle.damage(FEATURES.lightning.damage, 'lightning', this.ev);
    this.vehicle.hitSlow(FEATURES.lightning.speedKeep);
    h.popup('⚡ STROMSCHLAG!', 'bad');
    h.fx('shock', this.vehicle.x, this.vehicle.y);
    h.haptic('heavy');
  }

  onHit(e) {
    const h = this.hooks;
    const v = this.vehicle;
    const o = e.obstacle;
    // Regel collectScrapMass (Mülltonne): Schrottberge schaden weniger, bremsen weniger und geben Schrott
    const scrapMass = !!this.rules.collectScrapMass && o.type === 'scrap';
    const C = RULES.collectScrapMass;
    const crusher = o.type === 'crusher';
    v.hitSlow(crusher ? FEATURES.crusher.speedKeep : scrapMass ? (P.hitSpeedKeep + 1) / 2 : P.hitSpeedKeep);
    const base = crusher ? FEATURES.crusher.damage : R.obstacleDamage;
    const dmg = v.damage(base * (scrapMass ? C.damageMul : 1), 'obstacle', this.ev);
    this.emit('collision', { kind: o.type, damage: dmg, x: e.x, y: e.y });
    if (scrapMass) this.collectScrap(e.x, e.y, TESTDRIVE.scrapPickupValue);
    this.loseChain();
    if (dmg > 0) h.popup(crusher ? 'GEPRESST!' : 'Autsch!', 'bad');
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

  // Etappe beenden. Ergebnis nach ARCHITEKTUR.md §7 (+ Zusatzangaben für Auswertung und Run)
  finish(reason) {
    if (this.phase === 'over') return;
    this.bankChain(true);
    this.phase = 'over';
    this.abilities.release();
    const v = this.vehicle;
    if (v.durability <= 0) reason = 'wreck';
    const dist = Math.max(0, Math.round(v.maxX));
    const height = Math.max(0, Math.round(this.maxAlt));
    const medal = reason === 'wreck' ? null : medalFor(dist, this.medals);
    this.emit('stageEnd', { medal, dist });
    this.flushEvents();
    const r = {
      reason,
      cleared: !!medal,
      medal,
      dist,
      target: this.target,
      medals: { ...this.medals },
      medalList: [...this.medalList],
      kind: this.kind,
      height,
      tricks: this.tricks,
      bolts: Math.floor(this.bolts),
      scrap: Math.round(this.scrap + this.scrapBonus),
      blueprints: this.blueprints,
      crates: this.crates,
      pickups: { ...this.pickupCounts },
      scrapPickups: this.scrapPickups,
      scrapBonus: this.scrapBonus,
      shocks: this.shocks,
      damageTaken: Math.round(v.damageTaken),
      durability: Math.max(0, Math.round(v.durability * 10) / 10),
      durabilityMax: Math.round(this.stats.durabilityMax),
      fuelLeft: Math.round(v.fuel),
      stunts: { ...this.stunts },
      time: this.time,
      biome: this.biome.id,
      world: this.biome.id,
    };
    // Testfahrt (Dev-Menü): Schrott wie in Phase 2
    const reward = testDriveReward(r, this.stats, this.biome);
    r.testDrive = reward;
    this.hooks.end(r);
  }
}

const MEDAL_ICON = { bronze: '🥉', silver: '🥈', gold: '🥇' };
