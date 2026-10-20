import { PHYSICS as P, LAUNCH, KOMBO, FX, STAGE, CONTROLS, SPAWN, RESOURCES as R, RULES, ITEMS, FEATURES, PICKUPS, TESTDRIVE, SYNERGY } from '../data/balance.js';
import { Vehicle } from '../physics/vehicle.js';
import { Objects } from '../physics/objects.js';
import { Track, PLATEAU_H } from '../physics/track.js';
import { generateStageSpec, medalFor, gradeFor } from '../physics/trackGen.js';
import { BIOMES } from '../data/biomes.js';
import { mutatorById } from '../data/mutators.js';
import { goalOf, goalValue, goalMedal, goalMedals, isDistanceGoal } from './goals.js';
import { makeRng } from '../core/rng.js';
import { DEG } from '../core/math.js';
import { Launch } from './launch.js';
import { AbilityBar } from './abilities.js';
import { testDriveReward } from './scoring.js';
import { EventQueue } from '../items/eventQueue.js';
import { ModState } from '../items/modState.js';
import { isEvent } from '../items/events.js';
import { computeStats, baseStats } from '../items/statMods.js';
import { TriggerEngine } from '../items/triggerEngine.js';
import { applyInventory, entryParts } from '../items/inventory.js';
import { runModStats, runDamageMul } from '../run/runMods.js';

// Ruheposition des Autos in der Schleuder
export const REST = { x: LAUNCH.restX, y: PLATEAU_H + LAUNCH.restHeight, angle: LAUNCH.restAngleDeg * DEG };

const NOOP = () => {};
const warnedEvents = new Set();
function warnEvent(name) {
  if (warnedEvents.has(name)) return;
  warnedEvents.add(name);
  console.warn(`Unbekanntes Ereignis „${name}“ (Effekt emit) – verworfen`);
}
const NO_HOOKS = { popup: NOOP, sfx: NOOP, shake: NOOP, haptic: NOOP, fx: NOOP, end: NOOP, event: NOOP, triggered: NOOP, chain: NOOP, launched: NOOP, knapp: NOOP };
const FF = STAGE.fastForward;
const copyJson = (v) => (v === undefined || v === null ? v : JSON.parse(JSON.stringify(v)));

// Eingaben eines Bildes als reine Daten (Paket A): die Etappe zeichnet sie auf, damit eine Schatten-Etappe den Lauf
// Bild für Bild exakt wiederholen kann (Hochrechnung „Knapp“). Leeres Bild = keine Eingabe (Sofort-Ende).
// (readAbilityInput fragt jede Fähigkeit genau einmal je Bild ab, takeAimDrag höchstens einmal.)
function frameInput(f) {
  return {
    hold: f.hold, tilt: f.tilt, aimKey: f.aimKey, boost: false,
    takeAimDrag: () => f.drag,
    abilityHeld: (i) => !!f.held[i],
    takeAbilityPress: (i) => f.presses[i] || 0,
  };
}
const EMPTY = [];
export const neutralFrame = (dt) => ({ dt, hold: false, tilt: 0, aimKey: 0, drag: 0, held: EMPTY, presses: EMPTY, tap: 0 });

// Eine Etappe: Abschuss → Flug/Fahrt → Ende. Reine Logik ohne DOM und three.js.
// Alles Sichtbare geht über `hooks` nach außen (Popups, Sound, Effekte, Ereignisse, Ende).
// input: { hold, tilt, aimKey, takeAimDrag(), abilityHeld(i), takeAbilityPress(i) } (siehe platform/input.js);
//        ältere Eingaben mit nur `boost` (gehalten) funktionieren auch.
//
// Ereignisse: Physik und Objekte schreiben Rohereignisse in this.ev; handle() reagiert darauf (Popups, Schaden,
// Tricks) und reiht die Trigger-Ereignisse (Namen nach ARCHITEKTUR.md 4.2) in this.queue ein. Die Warteschlange
// wird nach jedem Physik-Schritt abgearbeitet: hooks.event(name, data, depth), die Trigger-Engine (this.engine,
// items/triggerEngine.js) und this.onEvent (Tests). Rohereignisse, die Effekte beim Abarbeiten auslösen (Heilung,
// Schaden, Abprall, Überhitzung …), gehören zur Kette und werden sofort mit Tiefe + 1 weitergegeben; ein Gratis-Boost
// meldet sein boost-Ereignis im nächsten Physik-Schritt mit der Tiefe des auslösenden Effekts + 1.
// Items: `inventory` (Run-Inventar) wird über items/inventory.js → applyInventory auf die Ausrüstung angewendet
// (Stats, Regeln, Set-Boni, Trigger-Quellen). Jede Auslösung geht an hooks.triggered(source, depth, info) (HUD),
// Paket C: jede gezählte Kette (≥ SYNERGY.chain.minLinks Glieder) an hooks.chain(n, { bolts, count, total }).
//
// Regeln, die HIER ausgewertet werden (ARCHITEKTUR.md Anhang A): collectScrapMass (Kollision, Pickups),
// heatToThrust (Fähigkeit Schleudergang), shockArc (Elektro-Set 6, beim shock-Ereignis), boltsAreFuel (Schrauben als
// Treibstoff über vehicle.fuelBackup), boltHoardThrust (Schraubenhort beim Neuberechnen der Stats), blackCatNap
// (Fluch: ein Item ruht, beim Zusammenstellen der Quellen), Paket C: chainLetter (Kettenbrief, chainStep).
//
// Phase 3: Die Strecke kommt aus einer StageSpec (physics/trackGen.js) mit Zielmarke und Medaillen
// (spec.medals: bronze = Ziel, silver, gold). Endgründe: 'stop' (steht), 'wreck' (Haltbarkeit 0), 'fall'
// (Schluchtsturz, + FEATURES.gap.fallDamage), 'time' (STAGE.maxTime), 'far' (Gold × STAGE.farMul erreicht, Phase 4).
// Ergebnis nach ARCHITEKTUR.md §7.
//
// Paket A – Vorspulen, Sofort-Ende, Hochrechnung (STAGE.fastForward): update() liest die Eingaben eines Bildes als
// Daten (frames, aufgezeichnet) und rechnet stepFrame(). Am Boden ohne Boost läuft die Etappe vorgespult (fastForward,
// gleiche Physik-Schritte, nur mehr je Bild). instantFinish() rechnet den Rest ohne Eingaben und ohne Darstellung
// (stumme Hooks) – das Ergebnis ist dasselbe wie beim Zusehen ohne Eingabe. project() baut eine Schatten-Etappe aus
// denselben Startwerten, wiederholt alle aufgezeichneten Bilder und rechnet sie zu Ende (Hochrechnung „Knapp: NN %“).
export class Stage {
  // biome (alt: world): Biom aus data/biomes.js. spec: StageSpec (sonst einfache Etappe Etage 0 des Bioms).
  // track: fertige Strecke (sonst aus spec). loadout: garage/loadout.js buildLoadout; alternativ nur `stats` (Tests).
  // durability: Start-Haltbarkeit (aus dem Run); sonst voll. runMods: { fuelMaxAdd, coolMul, durabilityMaxAdd, … } (Run, run/runMods.js).
  // inventory: Run-Inventar [{ itemId, tier, hybrid? }]. runInfo: { bolts (Run-Schrauben beim Start), counters (perRun-
  // Zähler der Trigger, wird verändert) } – null bei Testfahrten.
  // farEnd: Ende 'far' bei Gold × STAGE.farMul (Dev-Testfahrten schalten es ab).
  constructor({ biome, world, spec = null, track = null, loadout = null, stats = null, seed = 1, hooks = {}, durability, runMods = {}, inventory = null, runInfo = null, farEnd = true, shadow = false }) {
    // Startwerte für die Schatten-Etappe (Hochrechnung): veränderliche Eingaben als Kopie
    this.shadow = shadow;
    if (!shadow) {
      this.initArgs = {
        biome: biome || world, spec, loadout, stats, seed, durability, farEnd,
        runMods: copyJson(runMods) || {}, inventory: copyJson(inventory),
        runInfo: runInfo ? { bolts: runInfo.bolts, counters: copyJson(runInfo.counters) || {} } : null,
      };
    }
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
    this.runInfo = runInfo;
    this.farEnd = farEnd;
    this.runBolts = runInfo ? Math.max(0, runInfo.bolts || 0) : 0;
    this.boltsSpent = 0;
    this.bolts = 0;
    // Items und Set-Boni (Phase 4). Fluch blackCatNap: ein anderes Item ruht in dieser Etappe (zählt für Sets weiter)
    this.inventory = inventory || [];
    this.nappedSlot = this.pickNap(this.inventory);
    const setup = applyInventory({ ...lo, statInput: lo.statInput || { base: lo.stats } }, this.inventory, {
      biome: bio, exclude: new Set(this.nappedSlot >= 0 ? [this.nappedSlot] : []),
    });
    this.setup = setup;
    this.rules = setup.rules;
    this.statInput = setup.statInput;
    this.boltHoard = 0;
    this.hoardMods = { stats: { boostThrust: { mul: 0 } } };
    this.worldMods = { stats: { rollFriction: { xmul: bio.physics?.rollFriction ?? 1 }, landTolDeg: { add: bio.physics?.landTolAdd || 0 } } };
    // Paket D: Mutator der Etappe (data/mutators.js) – Werte, Schwerkraft, vertauschtes Neigen, eigene Auslöser
    this.mutator = mutatorById(this.spec.mutator);
    this.mutatorMods = { stats: (this.mutator && this.mutator.stats) || {} };
    this.invertTilt = !!(this.mutator && this.mutator.invertTilt);
    if (this.mutator && this.mutator.triggers) {
      setup.sources.push({ uid: `mutator:${this.mutator.id}`, id: `mutator_${this.mutator.id}`, kind: 'mutator', name: this.mutator.name, icon: '', tier: 1, scale: 1, triggers: this.mutator.triggers, rules: {} });
    }
    this.runMods = runModStats(runMods);
    this.mods = new ModState();
    this.updateBoltHoard(false);
    this.stats = this.computeStats();

    this.ev = [];
    this.vehicle = new Vehicle(this.stats, bio.gravity * ((this.mutator && this.mutator.gravityMul) || 1), this.rules);
    this.vehicle.reset(REST.x, REST.y, REST.angle);
    this.vehicle.ev = this.ev;
    this.vehicle.damageMul = runDamageMul(runMods);   // Schrottstufe 8 „Dosenblech“
    // Regel boltsAreFuel (Schraubenvergaser): leerer Tank wird mit Run-Schrauben bezahlt
    if (this.rules.boltsAreFuel) {
      const per = RULES.boltsAreFuel.fuelPerBolt;
      this.vehicle.fuelBackup = {
        available: () => this.availableBolts() >= 1,
        fuel: () => Math.floor(this.availableBolts()) * per,
        pay: () => { if (this.availableBolts() < 1) return 0; this.ctx.addBolts(-1); return per; },
      };
    }
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

    // Boss-Strecke: Daten des Bosses (Warnhinweise je Baustein-Art, Erkennungsmelodie)
    this.boss = this.spec.bossId ? (bio.bosses || []).find((b) => b.id === this.spec.bossId) || null : null;
    const warn = (this.boss && this.boss.warnings) || {};
    this.bossWarn = (this.spec.features || []).filter((f) => warn[f.type]).map((f) => ({ x: f.x0, text: warn[f.type] }));
    this.bossWarnIdx = 0;

    // Ziel und Medaillen
    this.kind = this.spec.kind || 'stage';
    this.target = this.spec.target;
    this.medals = this.spec.medals;
    this.medalList = this.spec.medalList || ['bronze', 'silver', 'gold'];
    // Paket D: Etappen-Art (stage/goals.js) – Marken in der Einheit des Ziels; Weitflug/Lieferung nutzen this.medals
    this.goal = goalOf(this.spec);
    this.goalMedals = goalMedals(this.spec);
    this.pickupTotal = 0;
    this.medal = null;            // bisher erreichte Medaille
    this.fallTimer = -1;
    this.fell = false;
    this.inWind = false;
    this.inHeat = false;

    this.abilities = new AbilityBar(lo.abilities || []);
    this.queue = new EventQueue();
    this.eventCounts = {};
    this.onEvent = null;           // zusätzlicher Beobachter (Tests): (name, data, depth)
    this.emitDepth = 0;            // Tiefe für Ereignisse aus Rohereignissen (beim Abarbeiten der Kette > 0)
    this.ctx = this.makeCtx();
    this.engine = new TriggerEngine({ sources: setup.sources, ctx: this.ctx, rules: this.rules, queue: this.queue, mods: this.mods, runCounters: runInfo ? runInfo.counters : null });
    this.triggerCount = 0;
    this.maxChain = 0;             // längste Kette (Glieder = Tiefe + 1)
    this.chains = 0;               // Paket C: gezählte Ketten (≥ SYNERGY.chain.minLinks Glieder) dieser Etappe
    this.chainBolts = 0;           // … und ihre Schrauben
    this.chainCur = null;          // laufende Kette { links, paid, counted, last }
    this.maxCountedChain = 0;
    this.arcReadyAt = -Infinity;   // shockArc

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
    this.slowmoEnabled = true;
    this.stopTimer = 0;
    this.wreckTimer = -1;
    this.perfectLaunch = false;
    this.inThermal = false;
    this.chuteOpen = false;
    this.stunts = { flips: 0, perfectLandings: 0, cleanLandings: 0, crashes: 0, nearMisses: 0, maxAirTime: 0, rings: 0, loops: 0 };
    // Paket A: Vorspulen, Sofort-Ende, Hochrechnung
    this.grade = 'miss';           // bisher erreichte Wertung (Platin/Schrottkönig = Überweite)
    this.groundTime = 0;           // so lange ununterbrochen am Boden (Spielzeit)
    this.fastForwardEnabled = true;
    this.fastForward = false;      // läuft die Etappe gerade vorgespult?
    this.instant = false;          // Sofort-Ende läuft (stumme Hooks, keine Eingaben)
    this.instantDone = false;      // Etappe wurde per Sofort-Ende beendet
    this.frames = shadow ? null : [];   // aufgezeichnete Bilder (Eingaben als Daten)
    this.upgradeLog = [];          // Ergebnisse von hooks.upgradeItem (die Schatten-Etappe bekommt dieselben)
    this.projected = false;        // Hochrechnung für den aktuellen „Tank leer“-Abschnitt schon gemacht
    this.projection = null;        // letztes Ergebnis der Hochrechnung
    this.knapp = null;             // { pct, dist, timer } – Bronze unerreichbar, Ende nach STAGE.fastForward.knappDelay
    this.settle = null;            // Ergebnis steht fest (Knapp oder ausgerollt ohne weiteren Sprung): { kind, pct, dist, grade, timer }
    this.airTotal = 0;             // Flugzeit gesamt (Hochrechnung: kommt noch ein Sprung?)
    this.emit('stageStart', {});
  }

  // ---------- Werte ----------
  computeStats() {
    return computeStats({ ...this.statInput, extra: [this.worldMods, this.mutatorMods, this.runMods, this.hoardMods], buffs: this.mods.mods() });
  }

  // Fluch blackCatNap (Schwarze Katze): gleichverteilt eines der ANDEREN Items wählen (nicht von Glück beeinflusst)
  pickNap(inventory) {
    let cat = -1;
    inventory.forEach((e, i) => {
      for (const { def } of entryParts(e)) if ((def.rules && def.rules.blackCatNap) || (!e.cleansed && def.curse && def.curse.rules && def.curse.rules.blackCatNap)) cat = cat < 0 ? i : cat;
    });
    if (cat < 0) return -1;
    const others = [];
    inventory.forEach((e, i) => { if (i !== cat && entryParts(e).length) others.push(i); });
    if (!others.length) return -1;
    const r = this.rng.fork('katze');
    return others[Math.floor(r.next() * others.length) % others.length];
  }

  // Schrauben, über die die Etappe verfügen kann (Run-Stand + in der Etappe gesammelte − verbrannte)
  availableBolts() { return this.runBolts + this.bolts - this.boltsSpent; }

  // Regel boltHoardThrust (Schraubenhort): boostThrust +1 % je RULES.boltHoardThrust.per Schrauben (max. RULES.boltHoardThrust.max), nicht mit ★ skaliert
  updateBoltHoard(recompute = true) {
    if (!this.rules.boltHoardThrust) return;
    const B = RULES.boltHoardThrust;
    const v = Math.min(B.max, Math.floor(Math.max(0, this.availableBolts()) / B.per) * B.mul);
    if (Math.abs(v - this.boltHoard) < 1e-9) return;
    this.boltHoard = v;
    this.hoardMods.stats.boostThrust.mul = v;
    if (recompute) this.mods.dirty = true;
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
  // Trigger-Ereignis einreihen (Namen nach ARCHITEKTUR.md 4.2). Ohne Tiefe: die der laufenden Kette (emitDepth)
  emit(name, data = {}, depth = this.emitDepth) { this.queue.push(name, data, depth); }

  // Warteschlange abarbeiten (1× pro Physik-Schritt): Zähler, Hooks, Trigger-Engine, Regel shockArc,
  // Rohereignisse aus Effekten mit Tiefe + 1
  flushEvents() {
    if (!this.queue.length) return;
    const eng = this.engine;
    eng.beginFlush();
    const n = this.queue.drain((name, data, depth) => {
      this.eventCounts[name] = (this.eventCounts[name] || 0) + 1;
      this.hooks.event(name, data, depth);
      eng.dispatch(name, data, depth);
      if (this.onEvent) this.onEvent(name, data, depth);
      if (name === 'shock' && this.rules.shockArc && this.phase === 'fly') this.shockArc();
      if (this.ev.length) this.handleRaw(depth + 1);
    });
    eng.endFlush(n);
    const links = eng.maxDepth + 1;
    if (links > this.maxChain) this.maxChain = links;
    this.chainStep(links);
  }

  // Paket C – Ketten sichtbar & belohnt (Zahlen: SYNERGY.chain; einzige Stelle der Regel). Abarbeitungen mit Tiefe ≥ 1,
  // die innerhalb von joinTime aufeinander folgen, bilden eine Kette (ein Gratis-Boost meldet sich einen Schritt später).
  // Ab minLinks Gliedern zählt sie: Zähler stage.chains, Ereignis chain {links} (neue Wurzel, Tiefe 0), Schrauben
  // round((boltsPerLink · Glieder)²) abzüglich schon gezahlter (wächst die Kette, wird nachgezahlt; je Etappe höchstens
  // maxBoltsPerStage) und Kombo (komboPts je neues Glied, +komboMult je Glied ab minLinks). HUD: hooks.chain(n, info).
  chainStep(links) {
    const C = SYNERGY.chain;
    if (links < 2) return;
    let c = this.chainCur;
    if (!c || this.time - c.last > C.joinTime + 1e-9) c = this.chainCur = { links: 1, paid: 0, counted: false, last: this.time };
    c.last = this.time;
    if (links <= c.links) return;
    const prev = c.links;
    c.links = links;
    if (links < C.minLinks) return;
    if (!c.counted) {
      c.counted = true;
      this.chains++;
      this.emit('chain', { links }, 0);
    }
    // Regel chainLetter (Kettenbrief): doppelte Schrauben und doppelter Deckel
    const mul = this.rules.chainLetter ? 2 : 1;
    const want = Math.round((C.boltsPerLink * links) ** 2) * mul;
    const pay = Math.max(0, Math.min(want - c.paid, C.maxBoltsPerStage * mul - this.chainBolts));
    c.paid = Math.max(c.paid, want);
    if (pay > 0) { this.chainBolts += pay; this.addBolts(pay); }
    // Kombo: Trickpunkte je neues Glied, Multiplikator je Glied ab minLinks (ohne eigene Einblendung – das HUD zeigt die Kette)
    const k = this.chain;
    k.pts += C.komboPts * (links - (prev < C.minLinks ? 0 : prev));
    k.mult = Math.min(KOMBO.maxMult, k.mult + C.komboMult * (links - Math.max(prev, C.minLinks - 1)));
    k.timer = 0;
    if (links > this.maxCountedChain) this.maxCountedChain = links;
    this.hooks.chain(links, { bolts: pay, count: this.chains, total: this.chainBolts });
  }

  // Rohereignisse, die beim Abarbeiten entstanden sind, als Teil der Kette verarbeiten
  handleRaw(depth) {
    const prev = this.emitDepth;
    this.emitDepth = depth;
    const ev = this.ev;
    for (let i = 0; i < ev.length; i++) this.handle(ev[i]);
    ev.length = 0;
    this.emitDepth = prev;
  }

  // Auslösung einer Quelle (Trigger-Engine → ctx.onTriggered)
  onTriggered(src, depth, info) {
    this.triggerCount++;
    this.hooks.triggered(src, depth, info);
  }

  // Regel shockArc (Elektro-Set 6): Lichtbogen zerstört das nächste Hindernis voraus und holt Pickups im Umkreis
  shockArc() {
    const A = RULES.shockArc;
    if (this.time < this.arcReadyAt) return;
    this.arcReadyAt = this.time + A.cooldown;
    const v = this.vehicle;
    const res = this.objects.arcStrike(v.x, v.y, this.rules.setBonusDouble ? A.rangeDouble : A.range, this.ev);
    if (res.target) {
      this.hooks.fx('shock', res.target.x, res.target.y);
      this.hooks.fx('smash', res.target.x, res.target.y, { type: 'scrap' });
      this.hooks.popup('LICHTBOGEN! ⚡', 'good');
    }
  }

  // Drehzahl-Anzeige des Rasenmähers (groundSpeedStacks): Stapel / max (0…1) oder null
  chassisStackFrac() {
    if (!this.rules.groundSpeedStacks || !this.loadout.chassis) return null;
    const c = this.loadout.chassis;
    for (const t of c.triggers || []) {
      if (t.on !== 'groundTouch') continue;
      for (const fx of t.do || []) {
        if (fx.fx !== 'stack' || !fx.max) continue;
        const st = this.mods.stackOf(fx.key || `${c.id}:${fx.stat}`);
        return st ? Math.min(1, Math.abs(st.mul || st.add) / fx.max) : 0;
      }
    }
    return null;
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
      chassisId: st.loadout.chassis ? st.loadout.chassis.id : null,
      onTriggered: (src, depth, info) => st.onTriggered(src, depth, info),
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
      // Gratis-Boost: sein boost-Ereignis (nächster Physik-Schritt) gehört zur Kette des auslösenden Effekts
      freeBoost: (dur, source) => {
        const v = st.vehicle;
        v.startFreeBoost(dur, source);
        v.freeBoostDepth = Math.max(v.freeBoostDepth || 0, (ctx.depth || 0) + 1);
      },
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
      upgradeItem: () => st.upgradeItemHook(),
      maxDurability: () => st.stats.durabilityMax,
    };
    return ctx;
  }

  // Effekt upgradeItem (Run-Item ★+1, macht main.js): Ergebnis merken; die Schatten-Etappe bekommt dieselben Ergebnisse
  upgradeItemHook() {
    if (this.shadow) return this.upgradeLog.length ? this.upgradeLog.shift() : false;
    const r = this.hooks.upgradeItem ? !!this.hooks.upgradeItem() : false;
    this.upgradeLog.push(r);
    return r;
  }

  // Schrauben + (× boltGain) bzw. − (n < 0: verbrennen, Regel boltsAreFuel – nie unter 0)
  addBolts(n) {
    if (n < 0) {
      this.boltsSpent += Math.min(-n, Math.max(0, this.availableBolts()));
      this.updateBoltHoard();
      return;
    }
    if (!(n > 0)) return;
    this.bolts += n * this.stats.boltGain;
    this.updateBoltHoard();
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
    this.vehicle.launch(speed, L.angle, perfect);
    this.phase = 'fly';
    this.hooks.launched();
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
    // als Bild aufzeichnen, damit die Schatten-Etappe (Hochrechnung) denselben Abschuss wiederholt
    if (this.frames) this.frames.push({ ...neutralFrame(0), launch: [power, angleDeg, perfect] });
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

  // Zeitlupe (Einstellung „Zeitlupe“ aus → slowmoEnabled = false, main.js)
  startSlowmo(t) { if (this.slowmoEnabled) this.slowmo = Math.max(this.slowmo, t); }

  // Paket D: aktueller Wert des Etappen-Ziels (Weite, Höhe, Trickpunkte inkl. laufender Kombo, Pickups)
  get goalNow() {
    return goalValue(this.goal, { dist: this.vehicle.maxX, height: this.maxAlt, tricks: this.tricks + Math.round(this.chain.pts * this.chain.mult), pickups: this.pickupTotal });
  }

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
      this.hooks.fx('explosion', v.x, v.y, { amount });   // Ton und Aufblitzen macht main.js → emitFx
    }
  }

  // ---------- Hauptschleife ----------
  // Ein Bild: Eingaben als Daten lesen (und aufzeichnen), dann rechnen
  update(realDt, input) {
    if (this.phase === 'over') return;
    const f = this.readFrame(realDt, input);
    this.stepFrame(f);
    if (this.frames) this.frames.push(f);
  }

  // Eingaben eines Bildes (gleiche Abfragen wie bisher: Zieh-Weg nur beim Zielen, jede Fähigkeit einmal)
  readFrame(realDt, input) {
    const n = this.abilities.length;
    const held = n ? new Array(n) : EMPTY, presses = n ? new Array(n) : EMPTY;
    const aim = this.phase === 'aim';
    const f = { dt: realDt, hold: !!input.hold, tilt: input.tilt || 0, aimKey: aim ? input.aimKey || 0 : 0, drag: aim && input.takeAimDrag ? input.takeAimDrag() : 0, held, presses, tap: input.takeTap ? input.takeTap() : 0 };
    for (let i = 0; i < n; i++) {
      presses[i] = input.takeAbilityPress ? input.takeAbilityPress(i) : 0;
      held[i] = input.abilityHeld ? !!input.abilityHeld(i) : (i === this.abilities.boostSlot && !!input.boost);
    }
    return f;
  }

  // Tank leer (auch keine Schrauben-Reserve der Regel boltsAreFuel)
  get fuelOut() {
    const v = this.vehicle;
    return v.fuel <= 1e-6 && !(v.fuelBackup && v.fuelBackup.available());
  }

  // Darf gerade per Tippen/Leertaste sofort beendet werden? (Ausrollen: Vorspulen oder langsam am Boden)
  get canFinish() {
    if (this.phase !== 'fly' || this.instant || this.wreckTimer >= 0 || this.fallTimer >= 0) return false;
    const v = this.vehicle;
    return this.fastForward || !!this.settle || (v.onGround && !v.loop && Math.abs(v.s) < FF.maxSpeedForFinish);
  }

  // Tempo der Darstellung (Zeitlupe × Vorspulen) – main.js für Partikel, Räder, Kamera
  get playScale() { return this.timeScale * (this.fastForward ? FF.scale : 1); }

  stepFrame(f) {
    const realDt = f.dt;
    if (f.launch) { if (this.phase === 'aim') this.launchNow(...f.launch); return; }
    const input = frameInput(f);
    if (this.phase === 'aim') {
      this.updateAim(realDt, input);
      this.readAbilityInput(input, false);
      this.flushEvents();
      return;
    }
    if (this.phase !== 'fly') return;
    // Sofort-Ende per Tippen (Ausrollen) bzw. nach „Knapp“
    if (f.tap > 0 && this.canFinish) { this.instantFinish(); return; }
    if (this.settle && !this.instant) {
      this.settle.timer -= realDt;
      if (this.settle.timer <= 0) { this.instantFinish(); return; }
    }
    this.checkProjection();

    // Ergebnis steht fest („Knapp“ bzw. hochgerechnet): bis zum Ende keine Eingaben mehr (Hochrechnung = Ende)
    const live = this.settle || this.instant ? frameInput(neutralFrame(realDt)) : input;
    this.readAbilityInput(live, true);
    if (this.slowmo > 0) { this.slowmo -= realDt; this.timeScale = FX.slowmoScale; }
    else this.timeScale = Math.min(1, this.timeScale + realDt * FX.slowmoRecover);
    const v0 = this.vehicle;
    this.fastForward = this.fastForwardEnabled && v0.onGround && !v0.loop && this.groundTime >= FF.minGroundTime && !this.abilities.boostHeld;
    this.acc += Math.min(realDt, STAGE.maxFrameDt) * this.timeScale * (this.fastForward ? FF.scale : 1);

    const ctl = this.ctl;
    ctl.tilt = this.invertTilt ? -live.tilt : live.tilt;

    const v = this.vehicle;
    const ev = this.ev;
    while (this.acc >= P.dt) {
      this.acc -= P.dt;
      this.abilities.update(P.dt, this);
      ctl.boost = this.abilities.boostHeld;
      this.engine.update(P.dt);   // Abklingzeiten der Trigger, Buffs altern
      if (this.mods.dirty) this.recomputeStats();
      this.updateEnv();
      v.step(P.dt, ctl, this.track, ev, this.env, this.objects);
      this.time += P.dt;
      this.objects.update(P.dt, v, ev);
      this.afterStep(P.dt);
      for (let i = 0; i < ev.length; i++) this.handle(ev[i]);
      ev.length = 0;
      this.checkWreck();
      this.flushEvents();
      if (this.phase !== 'fly') return;
    }
    this.objects.spawnUntil(v.x + SPAWN.ahead);
  }

  // Sofort-Ende: den Rest ohne Eingaben und ohne Darstellung rechnen (gleiche Physik-Schritte wie beim Zusehen).
  // Nur end/event/upgradeItem bleiben aktiv, alle sichtbaren Hooks sind stumm. Ergebnis über hooks.end.
  instantFinish() {
    if (this.phase !== 'fly' || this.instant) return;
    const real = this.hooks;
    this.hooks = { ...NO_HOOKS, end: real.end, event: real.event, upgradeItem: real.upgradeItem };
    this.instant = true;
    this.readAbilityInput(frameInput(neutralFrame(0)), true);   // gehaltene Fähigkeiten loslassen
    const fr = neutralFrame(FF.finishFrame);
    let n = 0;
    while (this.phase === 'fly' && n++ < FF.maxSteps) this.stepFrame(fr);
    this.instantDone = true;
    this.hooks = real;
    if (this.phase === 'fly') this.finish('time');
  }

  // Hochrechnung: ohne Treibstoff am Boden (sobald die Kiste aufsetzt) einmal je „Tank leer“-Abschnitt hochrechnen
  // (Schatten-Etappe).
  //  - Bronze bleibt unerreichbar → „Knapp: NN %“ und Ende nach STAGE.fastForward.knappDelay
  //  - kein weiterer Sprung mehr (Flugzeit < fastForward.minAir) → das Ergebnis steht fest: „Hochgerechnet: NN m“,
  //    Ende nach knappDelay (sonst rollt die Kiste nur noch aus – Paket A: Auslaufen ≤ 15 % der Etappe)
  checkProjection() {
    if (this.shadow || !this.frames || this.settle || this.instant) return;
    const v = this.vehicle;
    if (!this.fuelOut) { this.projected = false; return; }
    // (ohne Mindest-Bodenzeit: die Hochrechnung sieht auch, ob die Kiste noch einmal abhebt)
    if (this.projected || !v.onGround || v.loop || this.wreckTimer >= 0 || this.fallTimer >= 0) return;
    this.projected = true;
    const r = this.project();
    this.projection = r;
    if (!r || r.reason === 'wreck') return;
    const pct = isDistanceGoal(this.goal) ? Math.min(99, Math.floor((r.dist / Math.max(1, this.target)) * 100))
      : Math.min(99, Math.floor((r.goal.value / Math.max(1, this.goalMedals.bronze)) * 100));
    if (!r.medal) {
      this.knapp = { pct, dist: r.dist, timer: FF.knappDelay };
      this.settle = { kind: 'knapp', pct, dist: r.dist, grade: 'miss', timer: FF.knappDelay };
      this.hooks.popup(`KNAPP: ${pct} %`, 'bad');
      this.hooks.knapp(pct, r);
    } else if (r.moreAir < FF.minAir) {
      this.settle = { kind: 'done', pct, dist: r.dist, grade: r.grade, timer: FF.settleDelay };
      this.hooks.popup(`HOCHGERECHNET: ${r.dist} m ${MEDAL_ICON[r.grade] || ''}`, 'info');
    }
  }

  // Schatten-Etappe: gleiche Startwerte, alle bisherigen Bilder wiederholen, dann ohne Eingaben zu Ende rechnen.
  // Ergebnis: Etappen-Ergebnis oder null (Schatten nicht deckungsgleich, z. B. nach Eingriffen aus dem Dev-Menü).
  project() {
    if (!this.initArgs || !this.frames) return null;
    let result = null;
    const a = this.initArgs;
    const sh = new Stage({ ...a, runMods: copyJson(a.runMods), inventory: copyJson(a.inventory), runInfo: a.runInfo ? { bolts: a.runInfo.bolts, counters: copyJson(a.runInfo.counters) } : null, shadow: true, hooks: { end: (r) => { result = r; } } });
    sh.slowmoEnabled = this.slowmoEnabled;
    sh.fastForwardEnabled = this.fastForwardEnabled;
    sh.upgradeLog = [...this.upgradeLog];
    for (const f of this.frames) { sh.stepFrame(f); if (sh.phase === 'over') break; }
    const v = this.vehicle, w = sh.vehicle;
    if (sh.phase !== 'fly' || sh.time !== this.time || w.x !== v.x || w.y !== v.y || w.vx !== v.vx || w.durability !== v.durability) return null;
    const air0 = sh.airTotal;
    sh.instantFinish();
    if (result) result.moreAir = sh.airTotal - air0;   // Flugzeit, die noch kommt
    return result;
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
    // Boss-Strecke: Warnhinweis kurz vor jedem gefährlichen Baustein (data/biomes.js → bosses[].warnings)
    while (this.bossWarnIdx < this.bossWarn.length && v.maxX >= this.bossWarn[this.bossWarnIdx].x - STAGE.bossWarnLead) {
      this.hooks.popup(this.bossWarn[this.bossWarnIdx++].text, 'warn');
      this.hooks.sfx('warn');
    }
    // Medaillen-Marken überfahren (Paket D: in der Einheit des Ziels)
    const md = isDistanceGoal(this.goal) ? medalFor(v.maxX, this.medals) : medalFor(this.goalNow, this.goalMedals);
    if (md && md !== this.medal) {
      this.medal = md;
      const first = this.medalList.indexOf(md) === 0;
      const names = { bronze: 'BRONZE', silver: 'SILBER', gold: 'GOLD' };
      this.hooks.popup(first ? `ZIEL ERREICHT! ${MEDAL_ICON[md]}` : `${names[md]}! ${MEDAL_ICON[md]}`, 'big');
      this.hooks.sfx('medal', this.medalList.indexOf(md));
      this.hooks.fx('medal', v.x, v.y, { medal: md });
      this.hooks.haptic('success');
    }
    // Überweite: Platin (Gold × 1,5) – Schrottkönig (Gold × 2) beendet die Etappe ('far')
    if (this.goal.type === 'distance' && this.medal === 'gold' && this.medals.platin && this.grade !== 'platin' && this.grade !== 'king' && v.maxX >= this.medals.platin) {
      this.grade = 'platin';
      this.hooks.popup(`PLATIN! ${MEDAL_ICON.platin}`, 'big');
      this.hooks.sfx('medal', this.medalList.length);
      this.hooks.fx('medal', v.x, v.y, { medal: 'platin' });
    }
    if (alt > this.maxAlt) this.maxAlt = alt;
    if (v.onGround && !v.loop) this.groundTime += dt;
    else this.groundTime = 0;
    if (!v.onGround && !v.loop) this.airTotal += dt;
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
    // Paket D: Zeitrennen – nach timeLimit Sekunden Flug ist Schluss
    else if (this.goal.timeLimit && this.time >= this.goal.timeLimit) {
      this.hooks.popup('ZEIT UM!', 'info');
      this.finish('time');
    }
    // Ziel weit übertroffen (Gold × STAGE.farMul) → Etappe endet, statt endlos weiterzulaufen
    else if (this.farEnd && this.medals && this.medals.gold && v.maxX >= this.medals.gold * STAGE.farMul) {
      this.hooks.popup(`SCHROTTKÖNIG! ${MEDAL_ICON.king}`, 'big');
      this.finish('far');
    }
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
        this.pickupTotal++;
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
          h.fx('overheat', v.x, v.y);
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
        h.popup(e.source === 'gap' ? 'TRAMPOLIN! 🤸' : e.source === 'huepfburg' ? 'HÜPFBURG! 🏰' : 'PLONK! Abgeprallt', 'good');
        h.sfx('bounce');
        break;
      case 'boost':
        if (e.free) h.popup('GRATIS-BOOST!', 'good');
        this.emit('boost', { free: e.free, source: e.source }, Math.max(this.emitDepth, e.depth || 0));
        if (!e.free) this.abilities.boostStarted(this);   // abilityUse {boost} erst beim echten Start
        return;
      case 'wreck':
        this.onWreck(e);
        return;
    }
    if (isEvent(e.type)) this.emit(e.type, e);
  }

  // Schrott eingesammelt (Pickup oder Regel collectScrapMass): Meta-Schrott + Ladung der Mülltonne
  collectScrap(x, y, value = 1) {
    this.scrapPickups++;
    this.pickupTotal++;
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
    this.pickupTotal++;
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

  // Regel wreckingBall (Schrott-Set 6): Hindernis durchbrochen – collision ohne Schaden, Schrott fällt heraus
  onWreck(e) {
    const h = this.hooks;
    this.emit('collision', { kind: e.obstacle.type, damage: 0, wrecked: true, x: e.x, y: e.y });
    for (let i = 0; i < (e.scrap || 0); i++) this.collectScrap(e.x, e.y, TESTDRIVE.scrapPickupValue);
    h.popup('ABRISSBIRNE! 💥', 'big');
    h.sfx('crash', 0.6);
    h.fx('smash', e.x, e.y, { type: e.obstacle.type });
    h.shake(FX.shake.hit * 0.5);
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
    if (big) h.fx(e.quality === 'perfect' ? 'landPerfect' : 'landClean', e.x, e.y - P.rideHeight);
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
    // Paket D: Medaille nach der Etappen-Art (Weitflug wie bisher; Lieferung: Bruchlandungen begrenzen)
    const goalVal = Math.round(this.goalNow);
    const medal = reason === 'wreck' ? null : this.goal.type === 'distance' ? medalFor(dist, this.medals) : goalMedal(this.spec, this.goal.type === 'delivery' ? dist : goalVal, this.stunts.crashes);
    const grade = !medal ? 'miss' : this.goal.type === 'distance' || (this.goal.type === 'delivery' && medal === 'gold') ? gradeFor(dist, this.medals) : medal;
    this.emit('stageEnd', { medal, dist });
    this.flushEvents();
    const r = {
      reason,
      cleared: !!medal,
      medal,
      grade,
      dist,
      target: this.target,
      medals: { ...this.medals },
      medalList: [...this.medalList],
      kind: this.kind,
      height,
      tricks: this.tricks,
      bolts: Math.floor(this.bolts),
      boltsSpent: Math.ceil(this.boltsSpent),
      itemTriggers: this.triggerCount,
      maxChain: this.maxChain,
      chains: this.chains,
      chainBolts: this.chainBolts,
      napped: this.nappedSlot,
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
      instant: this.instant,
      knapp: this.knapp ? this.knapp.pct : null,
      settled: !!this.settle,
      biome: this.biome.id,
      world: this.biome.id,
      mutator: this.spec.mutator || null,
      goal: { type: this.goal.type, value: goalVal, medals: { ...this.goalMedals } },
    };
    // Testfahrt (Dev-Menü): Schrott wie in Phase 2
    const reward = testDriveReward(r, this.stats, this.biome);
    r.testDrive = reward;
    this.hooks.end(r);
  }
}

const MEDAL_ICON = { bronze: '🥉', silver: '🥈', gold: '🥇', platin: '💿', king: '👑' };
