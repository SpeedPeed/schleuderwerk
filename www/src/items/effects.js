// Effekt-Bibliothek: alle `fx` aus ARCHITEKTUR.md 4.3 / 4.11.
// Jeder Effekt: { fx: '<name>', ...params } → run(fx, ctx, tierMult).
// Zahlen-Parameter in SCALE_KEYS (amount, pct, dur, radius, add, mul) werden mit tierMult (★-Stufe) skaliert.
//
// ctx ist die EINZIGE Schnittstelle zur Welt (geliefert von stage/stage.js, später auch vom Run):
//   ctx.vehicle                    Fahrzeug (null im Run-Kontext → physikalische Effekte entfallen)
//   ctx.rng                        Zufall { next() }
//   ctx.source, ctx.depth          auslösende Quelle und Kettentiefe (Trigger-Engine)
//   ctx.addBolts(n) ctx.addScrap(n) ctx.heal(n) ctx.damage(n, src, {pierce}) ctx.popup(text, kind) ctx.fx(name, data) ctx.luck()
//   ctx.emit(event, data)          Ereignis einreihen (Kette, depth + 1)
//   ctx.freeBoost(dur, source)     Gratis-Boost
//   ctx.addBuff(stat, {add,mul}, dur)  ctx.addStack(key, stat, {add,mul}, max)  ctx.charge(key, n, at) → bool
//   ctx.shield(n) ctx.slowmo(dur) ctx.refill(abilityId|null, pct) ctx.magnet(radius, dur)
//   ctx.maxHp(n) ctx.maxFuel(n) ctx.upgradeItem()   (Run-Effekte)
// Reine Logik ohne three.js und DOM.
import { ITEMS } from '../data/balance.js';

export const SCALE_KEYS = ['amount', 'pct', 'dur', 'radius', 'add', 'mul'];

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const call = (ctx, name, ...args) => (ctx && typeof ctx[name] === 'function' ? ctx[name](...args) : undefined);

// { add, mul } eines buff/stack-Effekts, skaliert
const modOf = (fx, t) => ({ add: num(fx.add) * t, mul: num(fx.mul) * t });

// Wahrscheinlichkeit inkl. Glück (balance.ITEMS.luckPerPoint), höchstens ITEMS.chanceMax
export function chanceP(p, luck) {
  return Math.max(0, Math.min(ITEMS.chanceMax, num(p) + num(luck) * ITEMS.luckPerPoint));
}

export const EFFECTS = {
  // Sofort-Schub in Blickrichtung (unterliegt der weichen Tempo-Grenze)
  thrust(fx, ctx, t) { if (ctx.vehicle) ctx.vehicle.thrust(num(fx.amount) * t); },
  // Impuls nach oben (am Boden: abheben, in der Luft: Doppelsprung)
  // (in der Luft hebt nur die Fähigkeit Hüpfer das Fallen ganz auf; Item-Sprünge sind Impulse – sonst ließe sich mit
  //  Salto-Sprüngen endlos schweben, siehe ITEMS.effectJumpCancelFall)
  jump(fx, ctx, t) { if (ctx.vehicle) ctx.vehicle.jump(num(fx.amount) * t, ctx.source && ctx.source.kind === 'ability' ? 1 : ITEMS.effectJumpCancelFall); },
  // Gratis-Boost ohne Treibstoff (löst boost {free:true} aus)
  boost(fx, ctx, t) { call(ctx, 'freeBoost', num(fx.dur) * t, fx.source || (ctx.source && ctx.source.id) || 'fx'); },
  // Schub nach vorn + kleiner Sprung, löst explosion {amount} aus
  explosion(fx, ctx, t) {
    const a = num(fx.amount) * t;
    if (ctx.vehicle) {
      ctx.vehicle.thrust(a);
      ctx.vehicle.jump(a * ITEMS.explosionJump, ITEMS.effectJumpCancelFall);
    }
    call(ctx, 'fx', 'explosion', { amount: a });
    call(ctx, 'emit', 'explosion', { amount: a });
  },
  // Haltbarkeit + (amount oder pct von durabilityMax)
  heal(fx, ctx, t) {
    let a = num(fx.amount) * t;
    if (fx.pct !== undefined) {
      const max = ctx.vehicle ? ctx.vehicle.stats.durabilityMax : num(call(ctx, 'maxDurability'));
      a += num(fx.pct) * t * max;
    }
    if (a > 0) call(ctx, 'heal', a);
  },
  // Haltbarkeit − (Flüche): ignoriert Panzerung und Schilde
  selfDamage(fx, ctx, t) { call(ctx, 'damage', num(fx.amount) * t, 'self', { pierce: true }); },
  cool(fx, ctx, t) { if (ctx.vehicle) ctx.vehicle.cool(num(fx.amount) * t); },
  heat(fx, ctx, t) { if (ctx.vehicle) ctx.vehicle.addHeat(num(fx.amount) * t); },
  // Treibstoff + (mit over:true auch über das Maximum, bis ITEMS.overFuelMax × fuelMax)
  fuel(fx, ctx, t) { if (ctx.vehicle) ctx.vehicle.addFuel(num(fx.amount) * t, !!fx.over); },
  bolts(fx, ctx, t) { call(ctx, 'addBolts', num(fx.amount) * t); },
  scrap(fx, ctx, t) { call(ctx, 'addScrap', num(fx.amount) * t); },
  // zeitweises Magnetfeld
  magnet(fx, ctx, t) { call(ctx, 'magnet', num(fx.radius) * t, num(fx.dur) * t); },
  // zeitweiser Stat-Bonus
  buff(fx, ctx, t) { call(ctx, 'addBuff', fx.stat, modOf(fx, t), num(fx.dur) * t); },
  // dauerhafter Bonus bis Etappenende, stapelbar bis max (max wird nicht mit ★ skaliert)
  stack(fx, ctx, t) {
    const key = fx.key || `${(ctx.source && ctx.source.id) || 'fx'}:${fx.stat}`;
    call(ctx, 'addStack', key, fx.stat, modOf(fx, t), fx.max === undefined ? Infinity : num(fx.max));
  },
  // Zähler; bei `at` → then ausführen, Zähler auf 0
  charge(fx, ctx, t) {
    if (call(ctx, 'charge', fx.key || 'charge', fx.n === undefined ? 1 : num(fx.n), fx.at === undefined ? 1 : num(fx.at))) runAll(fx.then, ctx, t);
  },
  // anderes Ereignis auslösen (Kette!)
  emit(fx, ctx) { call(ctx, 'emit', fx.event, { ...(fx.data || {}) }); },
  // die nächsten n Schadensquellen werden zu bounce
  shield(fx, ctx) { call(ctx, 'shield', Math.max(1, Math.round(fx.n === undefined ? 1 : num(fx.n)))); },
  // Drehimpuls (rad/s, + = Nase hoch)
  spin(fx, ctx, t) { if (ctx.vehicle) ctx.vehicle.addSpin(num(fx.amount) * t); },
  // Zeitlupe (nur Gefühl)
  slowmo(fx, ctx, t) { call(ctx, 'slowmo', num(fx.dur) * t); },
  // Fähigkeits-Abklingzeit um pct verkürzen (ability fehlt = alle)
  refill(fx, ctx, t) { call(ctx, 'refill', fx.ability || null, fx.pct === undefined ? 1 : Math.min(1, num(fx.pct) * t)); },
  // Wahrscheinlichkeit (Glück erhöht p)
  chance(fx, ctx, t) {
    const p = chanceP(fx.p, call(ctx, 'luck'));
    const roll = ctx.rng ? ctx.rng.next() : Math.random();
    if (roll < p) runAll(fx.then, ctx, t);
  },
  // nur im Run-Kontext sinnvoll; in der Etappe gelten sie bis zum Ende der Etappe/Testfahrt
  maxHp(fx, ctx, t) { call(ctx, 'maxHp', num(fx.amount) * t); },
  maxFuel(fx, ctx, t) { call(ctx, 'maxFuel', num(fx.amount) * t); },
  upgradeItem(fx, ctx) { call(ctx, 'upgradeItem'); },
};

export const FX_NAMES = Object.keys(EFFECTS);

const warned = new Set();

// Einen Effekt ausführen. tierMult = Stufenfaktor (★1 = 1).
export function run(fx, ctx, tierMult = 1) {
  if (!fx) return;
  const f = EFFECTS[fx.fx];
  if (!f) {
    if (!warned.has(fx.fx)) { warned.add(fx.fx); console.warn(`Unbekannter Effekt „${fx.fx}“`); }
    return;
  }
  f(fx, ctx, tierMult);
}

// Mehrere Effekte nacheinander
export function runAll(list, ctx, tierMult = 1) {
  if (!list) return;
  for (const fx of list) run(fx, ctx, tierMult);
}
