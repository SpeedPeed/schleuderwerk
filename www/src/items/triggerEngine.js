// Trigger-Engine (ARCHITEKTUR.md §5): verteilt Ereignisse an die Auslöser (triggers) aller Quellen – Chassis, Teile,
// Set-Boni, Items – prüft Bedingungen (items/conditions.js) und Limits, führt die Effekte aus (items/effects.js) und
// meldet jede Auslösung an ctx.onTriggered(source, depth, info) (HUD: Symbol hüpft, ab Tiefe 3 „KETTENREAKTION ×n“).
//
//   const eng = new TriggerEngine({ sources, ctx, rules, queue?, mods?, runCounters? });
//   eng.emit('flip', { dir: 'back', count: 1 });   // reiht ein (Tiefe 0)
//   eng.update(dt);                                // Zeit (Abklingzeiten) + Buffs altern
//   eng.flush();                                   // Warteschlange abarbeiten (1× pro Physik-Schritt)
//   eng.statMods();                                // zeitweise Modifikatoren (Buffs, Stapel)
//
// Warteschlange und Buffs/Stapel/Zähler sind die Bausteine aus Phase 2 (items/eventQueue.js, items/modState.js) –
// die Etappe übergibt ihre eigenen (stage.queue, stage.mods), damit alles an einer Stelle liegt.
//   - Ereignisse aus Effekten (emit) bekommen depth + 1; depth > ITEMS.maxChainDepth → verworfen;
//     höchstens ITEMS.maxEventsPerFlush je Abarbeitung (Rest verworfen).
//   - Limits je Trigger: cooldown (s, Engine-Zeit), perStage (Zähler je Etappe), perRun (Zähler in runCounters,
//     kommt aus run.counters.trig und überlebt die Etappe).
//   - Quellen: { uid, id, kind: 'chassis'|'part'|'set'|'item', name, icon, slot?, tier, scale, scaleUp?, triggers, rules? }
//     scale = Faktor auf die skalierten Parameter (★ × tagBoost × Hybrid bzw. 2 bei setBonusDouble).
//   - Run-Kontext (runStart, nodeEnter, stageClear, itemGained, shopEnter): dieselbe Engine mit ctx ohne Fahrzeug.
//
// Regeln, die HIER ausgewertet werden (ARCHITEKTUR.md Anhang A):
//   healOnCleanLanding (Sofa)    – landing-Ereignis der Chassis-Quelle, vor den übrigen Auslösern
//   groundSpeedStacks (Rasenmäher) – Bruchlandung halbiert den groundTouch-Stapel der Chassis-Quelle
//   spinToSpeed (Gyro-Set 6)     – nach den landing-Auslösern der Set-Quelle: Schub je Salto
//   shockRecharge (Teslaspule)   – vor dem Verteilen eines shock-Ereignisses: Abklingzeiten aller shock-Trigger = 0
//   everyThirdTierUp (Klee)      – jede 3. Auslösung einer Item-Quelle mit dem Faktor der nächsten ★-Stufe
//   luckyEcho (Glück-Set 6)      – Item-Auslösung wird mit Glück-Chance ein zweites Mal ausgeführt
// Reine Logik ohne three.js und DOM.
import { ITEMS as BAL, RULES } from '../data/balance.js';
import { EventQueue } from './eventQueue.js';
import { ModState } from './modState.js';
import { runAll } from './effects.js';
import { checkConditions } from './conditions.js';

// Ketten-Log in der Konsole (Dev-Menü)
let chainLog = false;
export function setChainLog(on) { chainLog = !!on; }
export const chainLogOn = () => chainLog;

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

export class TriggerEngine {
  constructor({ sources = [], ctx = {}, balance = BAL, rules = {}, queue = null, mods = null, runCounters = null } = {}) {
    this.balance = balance;
    this.queue = queue || new EventQueue(balance);
    this.mods = mods || new ModState();
    this.ctx = ctx;
    this.rules = rules || {};
    this.runCounters = runCounters || {};
    this.time = 0;
    this.limits = new Map();      // Trigger-Schlüssel → { readyAt, stage }
    this.fires = new Map();       // Item-Quelle → Auslösungen in dieser Etappe (everyThirdTierUp)
    this.echoReadyAt = new Map(); // Item-Quelle → nächstes mögliches Echo (luckyEcho)
    this.shockRechargeAt = -Infinity;
    this.healed = 0;
    this.healReadyAt = -Infinity;
    this.fired = 0;               // Auslösungen gesamt (Tests, Dev-Menü)
    this.echoes = 0;
    this.maxDepth = 0;            // größte Tiefe der letzten Abarbeitung
    this.maxFlush = 0;            // meiste Ereignisse in einer Abarbeitung
    this.log = [];                // letzte Auslösungen { name, event, depth } (Dev, Tests)
    this.setSources(sources);
  }

  setSources(sources) {
    this.sources = (sources || []).map((s, i) => ({
      ...s,
      uid: s.uid || `${s.kind || 'src'}:${s.id}:${i}`,
      scale: typeof s.scale === 'number' ? s.scale : num(s.tier) > 0 ? this.tierScale(s.tier) : 1,
      triggers: s.triggers || [],
      rules: s.rules || {},
    }));
    // Index: Ereignis → [{ src, trig, idx }] (Reihenfolge: Quellen wie übergeben, Chassis zuerst)
    this.byEvent = new Map();
    for (const src of this.sources) {
      src.triggers.forEach((trig, idx) => {
        if (!trig || !trig.on) return;
        if (!this.byEvent.has(trig.on)) this.byEvent.set(trig.on, []);
        this.byEvent.get(trig.on).push({ src, trig, idx, key: `${src.uid}#${idx}` });
      });
    }
  }

  tierScale(tier) {
    const t = Math.max(1, Math.min(this.balance.tierMult.length, Math.round(tier || 1)));
    return this.balance.tierMult[t - 1];
  }

  // ---------- Schnittstelle ----------
  emit(name, data = {}, depth = 0) { return this.queue.push(name, data, depth); }

  update(dt) {
    this.time += dt;
    this.mods.update(dt);
  }

  statMods() { return this.mods.mods(); }

  // Warteschlange abarbeiten. each(name, data, depth): optional vor jedem Verteilen (Zähler, Hooks)
  flush(each = null) {
    this.beginFlush();
    const n = this.queue.drain((name, data, depth) => {
      if (each) each(name, data, depth);
      this.dispatch(name, data, depth);
    });
    this.endFlush(n);
    return n;
  }

  beginFlush() { this.maxDepth = 0; }
  endFlush(n) { if (n > this.maxFlush) this.maxFlush = n; }

  // Neue Etappe: Zähler je Etappe zurücksetzen (Abklingzeiten laufen in Engine-Zeit weiter)
  resetStage() {
    for (const st of this.limits.values()) st.stage = 0;
    this.fires.clear();
    this.healed = 0;
  }

  // ---------- Verteilen ----------
  dispatch(name, data, depth = 0) {
    const ctx = this.ctx;
    if (depth > this.maxDepth) this.maxDepth = depth;
    if (name === 'stageStart') this.resetStage();
    if (name === 'shock' && this.rules.shockRecharge) this.shockRecharge(depth);
    const list = this.byEvent.get(name);
    if (!list && !(name === 'landing' && (this.rules.healOnCleanLanding || this.rules.groundSpeedStacks || this.rules.spinToSpeed))) return;
    const prevSrc = ctx.source, prevDepth = ctx.depth;
    try {
      // Chassis-Regeln beim landing-Ereignis laufen vor allen Auslösern
      if (name === 'landing') this.chassisLandingRules(data, depth);
      let lastSrc = null;
      for (const e of list || []) {
        if (lastSrc && e.src !== lastSrc) this.afterSource(lastSrc, name, data, depth);
        lastSrc = e.src;
        this.tryTrigger(e, name, data, depth);
      }
      if (lastSrc) this.afterSource(lastSrc, name, data, depth);
      // Set-Quelle mit spinToSpeed ohne eigene landing-Auslöser
      if (name === 'landing' && this.rules.spinToSpeed && !this.spinDone) this.spinToSpeed(data, depth);
      this.spinDone = false;
    } finally {
      ctx.source = prevSrc;
      ctx.depth = prevDepth;
    }
  }

  // Nach den Auslösern einer Quelle (Regeln, die „nach den landing-Triggern der Set-Quelle“ wirken)
  afterSource(src, name, data, depth) {
    if (name === 'landing' && src.rules && src.rules.spinToSpeed && this.rules.spinToSpeed) this.spinToSpeed(data, depth);
  }

  tryTrigger(e, name, data, depth) {
    const { src, trig, key } = e;
    const ctx = this.ctx;
    if (trig.if && !checkConditions(trig.if, name, data, ctx)) return false;
    const lim = trig.limit;
    if (lim) {
      let st = this.limits.get(key);
      if (!st) { st = { readyAt: -Infinity, stage: 0 }; this.limits.set(key, st); }
      const runKey = `${src.kind}:${src.id}#${e.idx}`;
      if (lim.cooldown && this.time < st.readyAt - 1e-9) return false;
      if (lim.perStage && st.stage >= lim.perStage) return false;
      if (lim.perRun && (this.runCounters[runKey] || 0) >= lim.perRun) return false;
      if (lim.cooldown) st.readyAt = this.time + lim.cooldown;
      if (lim.perStage) st.stage++;
      if (lim.perRun) this.runCounters[runKey] = (this.runCounters[runKey] || 0) + 1;
    }
    // everyThirdTierUp: jede 3. Auslösung einer Item-Quelle mit dem Faktor der nächsten Stufe
    let scale = src.scale;
    let tierUp = false;
    if (src.kind === 'item' && this.rules.everyThirdTierUp) {
      const n = (this.fires.get(src.uid) || 0) + 1;
      this.fires.set(src.uid, n);
      if (n % RULES.everyThirdTierUp.every === 0) {
        const next = Math.round(src.tier || 1) + 1;
        scale = typeof src.scaleUp === 'number' ? src.scaleUp
          : next > this.balance.tierMult.length ? RULES.everyThirdTierUp.beyondMax : this.tierScale(next);
        tierUp = true;
      }
    }
    this.execute(src, trig.do, scale, depth);
    this.report(src, depth, name, tierUp ? { tierUp: true } : null);
    if (src.kind === 'item' && this.rules.luckyEcho) this.luckyEcho(src, trig.do, scale, depth, name);
    return true;
  }

  execute(src, list, scale, depth) {
    const ctx = this.ctx;
    ctx.source = src;
    ctx.depth = depth;
    runAll(list, ctx, scale);
  }

  report(src, depth, event, info = null) {
    this.fired++;
    const ctx = this.ctx;
    if (this.log.length >= 40) this.log.shift();
    this.log.push({ name: src.name || src.id, kind: src.kind, event, depth });
    if (chainLog) console.log(`${'  '.repeat(depth)}↳ [${depth}] ${event} → ${src.icon || ''} ${src.name || src.id}${info && info.echo ? ' (Echo ×2)' : ''}${info && info.tierUp ? ' (★+1)' : ''}`);
    if (typeof ctx.onTriggered === 'function') ctx.onTriggered(src, depth, info);
  }

  // ---------- Regeln ----------

  // Glück-Set 6: Echo einer Item-Auslösung (gleiche Tiefe, ohne Limits, kein Echo vom Echo, je Item max. 1 je s)
  luckyEcho(src, list, scale, depth, event) {
    const R = RULES.luckyEcho;
    const ctx = this.ctx;
    if (this.time < (this.echoReadyAt.get(src.uid) ?? -Infinity)) return;
    const dbl = !!this.rules.setBonusDouble;
    const luck = typeof ctx.luck === 'function' ? num(ctx.luck()) : 0;
    const p = Math.min(dbl ? R.pMaxDouble : R.pMax, (dbl ? R.pDouble : R.p) + luck * this.balance.luckPerPoint);
    const roll = ctx.rng ? ctx.rng.next() : Math.random();
    if (roll >= p) return;
    this.echoReadyAt.set(src.uid, this.time + R.cooldown);
    this.echoes++;
    this.execute(src, list, scale, depth);
    this.report(src, depth, event, { echo: true });
  }

  // Teslaspule: vor dem Verteilen eines shock-Ereignisses alle laufenden shock-Abklingzeiten auf 0 (max. 1× je 3 s)
  shockRecharge(depth) {
    if (this.time < this.shockRechargeAt) return;
    const list = this.byEvent.get('shock') || [];
    let any = false;
    for (const e of list) {
      const st = this.limits.get(e.key);
      if (st && e.trig.limit && e.trig.limit.cooldown && this.time < st.readyAt) { st.readyAt = -Infinity; any = true; }
    }
    if (!any) return;
    this.shockRechargeAt = this.time + RULES.shockRecharge.cooldown;
    const seen = new Set();
    for (const e of list) {
      if (seen.has(e.src) || e.src.kind !== 'item') continue;
      seen.add(e.src);
      if (typeof this.ctx.onTriggered === 'function') this.ctx.onTriggered(e.src, depth, { recharge: true });
    }
  }

  // Sofa (healOnCleanLanding) und Rasenmäher (groundSpeedStacks) – Chassis-Quelle beim landing-Ereignis
  chassisLandingRules(data, depth) {
    const src = this.sources.find((s) => s.kind === 'chassis');
    if (!src) return;
    const q = data && data.quality;
    const ctx = this.ctx;
    const heal = num(this.rules.healOnCleanLanding);
    if (heal > 0 && (q === 'clean' || q === 'perfect')) {
      const H = RULES.healOnCleanLanding;
      if (this.time >= this.healReadyAt - 1e-9 && this.healed < H.maxPerStage) {
        const amount = Math.min(heal, H.maxPerStage - this.healed);
        this.healed += amount;
        this.healReadyAt = this.time + H.interval;
        ctx.source = src;
        ctx.depth = depth;
        if (typeof ctx.heal === 'function') ctx.heal(amount);
        this.report(src, depth, 'landing', { rule: 'healOnCleanLanding' });
      }
    }
    if (this.rules.groundSpeedStacks && q === 'crash') {
      // Stapel des groundTouch-Auslösers der Chassis-Quelle (Schlüssel wie fx stack: „<id>:<stat>“)
      for (const t of src.triggers) {
        if (t.on !== 'groundTouch') continue;
        for (const fx of t.do || []) {
          if (fx.fx !== 'stack') continue;
          const key = fx.key || `${src.id}:${fx.stat}`;
          const s = this.mods.stackOf(key);
          if (!s) continue;
          this.mods.scaleStack(key, RULES.groundSpeedStacks.crashMul, Math.abs(num(fx.mul) || num(fx.add)) * src.scale);
          this.report(src, depth, 'landing', { rule: 'groundSpeedStacks' });
        }
      }
    }
  }

  // Gyro-Set 6: Schub je Salto nach perfekter/sauberer Landung
  spinToSpeed(data, depth) {
    this.spinDone = true;
    const q = data && data.quality;
    if (q !== 'perfect' && q !== 'clean') return;
    const R = RULES.spinToSpeed;
    const flips = Math.min(R.maxFlips, Math.max(0, Math.floor(num(data.flips))));
    if (!flips) return;
    const per = (this.rules.setBonusDouble ? R.perFlipDouble : R.perFlip) * (q === 'clean' ? R.cleanMul : 1);
    const v = this.ctx.vehicle;
    if (v) v.thrust(per * flips);
    const src = this.sources.find((s) => s.rules && s.rules.spinToSpeed);
    if (src) this.report(src, depth, 'landing', { rule: 'spinToSpeed' });
  }
}

// Run-Kontext: ein Ereignis sofort verteilen (ctx ohne Fahrzeug). Ergebnis: Engine (für Zähler/Log)
export function dispatchRunEvent({ sources, ctx, rules, runCounters }, name, data = {}) {
  const eng = new TriggerEngine({ sources, ctx, rules, runCounters });
  ctx.emit = (ev, d) => eng.emit(ev, d, (ctx.depth || 0) + 1);
  eng.emit(name, data, 0);
  eng.flush();
  return eng;
}
