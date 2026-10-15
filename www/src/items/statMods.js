// Stat-Pipeline: Basis → Chassis → Teile → Forschung → Items/Sets → Buffs → Soft-Caps.
// Modifikator-Form (überall gleich): { stat: { add, mul, xmul } }
//   Endwert = softcap( (Basis + Σadd) × (1 + Σmul) × Π xmul )
// `mul` addiert sich (gegen Zahlen-Explosion), `xmul` multipliziert. Grenzen: balance.SOFTCAPS.
// Reine Logik ohne three.js und DOM.
import { BASE_STATS, SOFTCAPS, GARAGE, ITEMS } from '../data/balance.js';
import { softcap, dimLevels } from '../core/math.js';
import { partById } from '../data/index.js';

// Alle Stat-Schlüssel (ARCHITEKTUR.md 4.11)
export const STATS = [
  'launchSpeed', 'launchPerfectBonus', 'sweetSpotWidth', 'mass', 'drag', 'lift', 'airControl', 'maxSpin', 'flipSpeed',
  'autoLevel', 'boostThrust', 'boostFuel', 'boostHeat', 'boostSelfDamage', 'driveAccel', 'driveFuel', 'driveHeat',
  'rollFriction', 'fuelMax', 'heatMax', 'heatGain', 'coolRate', 'durabilityMax', 'armor', 'impactThreshold', 'landTolDeg',
  'perfectLandDeg', 'magnet', 'speedSoftCap', 'luck', 'boltGain', 'scrapGain', 'itemSlots', 'abilitySlots',
  'abilityCooldown', 'bounce', 'shopDiscount', 'rerollDiscount', 'itemChoices', 'repairBonus',
];

// Leerer Sammler: je Stat { add, mul, xmul }
export function emptyAcc() {
  const acc = {};
  for (const k of STATS) acc[k] = { add: 0, mul: 0, xmul: 1 };
  return acc;
}

// Modifikatoren aufaddieren. scale skaliert add und mul (★-Stufen, Teile-Stufen), xmul wird mit xpow potenziert
// (★-Stufen lassen xmul unverändert, Teile-Stufen potenzieren es). Unbekannte Stat-Schlüssel werden ignoriert
// (Tippfehler in Inhaltsdaten sollen nichts zerstören).
export function applyMods(acc, mods, scale = 1, xpow = 1) {
  if (!mods) return acc;
  for (const k in mods) {
    const m = mods[k];
    const a = acc[k];
    if (!a || !m) continue;
    if (typeof m.add === 'number') a.add += m.add * scale;
    if (typeof m.mul === 'number') a.mul += m.mul * scale;
    if (typeof m.xmul === 'number') a.xmul *= xpow === 1 ? m.xmul : Math.pow(Math.max(0, m.xmul), xpow);
  }
  return acc;
}

// Grenzen eines Stats anwenden (SOFTCAPS)
export function limitStat(k, v) {
  const c = SOFTCAPS[k];
  if (!isFinite(v)) v = BASE_STATS[k] ?? 0;
  if (!c) return v;
  if (c.cap !== undefined) v = softcap(v, c.cap, c.pow || 2);
  if (c.min !== undefined && v < c.min) v = c.min;
  if (c.max !== undefined && v > c.max) v = c.max;
  if (c.round) v = Math.round(v);
  return v;
}

// Sammler → fertige Stats. base: Startwerte (Standard BASE_STATS)
export function finalize(acc, base = BASE_STATS, out = {}) {
  for (const k of STATS) {
    const a = acc[k];
    const b = base[k] ?? BASE_STATS[k] ?? 0;
    const c = SOFTCAPS[k];
    let f = 1 + a.mul;
    if (!(c && c.negative) && f < 0) f = 0;
    out[k] = limitStat(k, (b + a.add) * f * a.xmul);
  }
  // perfekte Landung kann nie großzügiger sein als eine saubere
  if (out.perfectLandDeg > out.landTolDeg) out.perfectLandDeg = out.landTolDeg;
  return out;
}

// Grundwerte ohne jede Ausrüstung (fertig begrenzt)
export function baseStats() {
  return finalize(emptyAcc());
}

// Effektive Stufen eines Teils (abnehmender Ertrag)
export const partDimLevels = (level) => dimLevels(Math.max(0, Math.min(GARAGE.maxPartLevel, level || 0)), GARAGE.dimDivisor);

// Modifikatoren eines Teils auf Stufe `level` in den Sammler legen
export function applyPart(acc, part, level = 0) {
  if (!part) return acc;
  applyMods(acc, part.stats);
  const dl = partDimLevels(level);
  if (dl > 0) applyMods(acc, part.perLevel, dl, dl);
  return acc;
}

// Chassis in den Sammler legen (inkl. Slot-Änderungen für Item- und Fähigkeits-Plätze)
export function applyChassis(acc, chassis) {
  if (!chassis) return acc;
  applyMods(acc, chassis.stats);
  const sl = chassis.slots || {};
  if (sl.items) acc.itemSlots.add += sl.items;
  if (sl.abilities) acc.abilitySlots.add += sl.abilities;
  return acc;
}

// parts: { slot: { id, level } } oder { slot: partId } → Liste [{ part, level }]
export function resolveParts(parts) {
  const out = [];
  if (!parts) return out;
  for (const slot in parts) {
    const e = parts[slot];
    if (!e) continue;
    const id = typeof e === 'string' ? e : e.id;
    const part = (typeof e === 'object' && e.def) || partById(id);
    if (part) out.push({ part, level: typeof e === 'object' ? e.level || 0 : 0 });
  }
  return out;
}

const tierOf = (t) => ITEMS.tierMult[Math.max(0, Math.min(ITEMS.tierMult.length - 1, (t || 1) - 1))];

// Sammler aus allen Quellen aufbauen.
// input: { chassis, parts:{slot:{id, level}}, research?:[{stats}], items?:[{item, tier} | {item, scale}],
//          sets?:[{stats, scale?}], buffs?:[{stats}], extra?:[{stats}] }
// Items: scale (aus items/inventory.js: ★-Faktor × tagBoost × Hybrid) ersetzt den reinen ★-Faktor; der Fluch-Teil
// (item.curse.stats) wirkt immer unskaliert. Sets: scale = 2 mit der Regel setBonusDouble.
export function buildAcc(input = {}) {
  const acc = emptyAcc();
  applyChassis(acc, input.chassis);
  for (const { part, level } of resolveParts(input.parts)) applyPart(acc, part, level);
  for (const r of input.research || []) applyMods(acc, r && r.stats);
  for (const it of input.items || []) {
    const item = it.item || it;
    applyMods(acc, item.stats, typeof it.scale === 'number' ? it.scale : tierOf(it.tier));
    if (item.curse) applyMods(acc, item.curse.stats);
  }
  for (const s of input.sets || []) applyMods(acc, s && s.stats, s && s.scale ? s.scale : 1);
  for (const e of input.extra || []) applyMods(acc, e && e.stats);
  for (const b of input.buffs || []) applyMods(acc, b && b.stats);
  return acc;
}

// Fertige Stats aus allen Quellen. input.base ersetzt BASE_STATS als Startwerte (z. B. für Tests).
export function computeStats(input = {}) {
  return finalize(buildAcc(input), input.base || BASE_STATS);
}

// Regeln zusammenführen: true bleibt true, Zahlen addieren sich, Objekte werden je Schlüssel addiert/überschrieben
export function mergeRules(into, rules) {
  if (!rules) return into;
  for (const k in rules) {
    const v = rules[k];
    const cur = into[k];
    if (typeof v === 'number') into[k] = (typeof cur === 'number' ? cur : 0) + v;
    else if (typeof v === 'boolean') into[k] = !!cur || v;
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = cur && typeof cur === 'object' ? { ...cur } : {};
      for (const kk in v) o[kk] = typeof v[kk] === 'number' && typeof o[kk] === 'number' ? o[kk] + v[kk] : v[kk];
      into[k] = o;
    } else if (v !== undefined) into[k] = v;
  }
  return into;
}

// Alle Regel-Schalter von Chassis und Teilen (+ Items/Sets, falls angegeben; im Run baut items/inventory.js → applyInventory
// die vollständigen Regeln inkl. Hybriden und ausgeschlossener Items)
export function collectRules(input = {}) {
  const r = {};
  mergeRules(r, input.chassis && input.chassis.rules);
  for (const { part } of resolveParts(input.parts)) mergeRules(r, part.rules);
  for (const it of input.items || []) {
    const item = it.item || it;
    mergeRules(r, item.rules);
    if (item.curse) mergeRules(r, item.curse.rules);
  }
  for (const s of input.sets || []) mergeRules(r, s && s.rules);
  return r;
}

// Quellen mit Auslösern von Chassis und Teilen (+ einfache Item-/Set-Listen) für die Trigger-Engine: { id, kind, triggers, tier, stats }.
// Im Run ergänzt items/inventory.js → applyInventory die Item- und Set-Quellen (mit Skalierung, Hybriden, setBonusDouble).
export function collectSources(input = {}) {
  const out = [];
  const c = input.chassis;
  if (c && c.triggers && c.triggers.length) out.push({ id: c.id, kind: 'chassis', triggers: c.triggers, tier: 1, stats: c.stats || null });
  for (const { part, level } of resolveParts(input.parts)) {
    if (part.triggers && part.triggers.length) out.push({ id: part.id, kind: 'part', triggers: part.triggers, tier: 1, level, stats: part.stats || null });
  }
  for (const it of input.items || []) {
    const item = it.item || it;
    const trig = [...(item.triggers || []), ...((item.curse && item.curse.triggers) || [])];
    if (trig.length) out.push({ id: item.id, kind: 'item', triggers: trig, tier: it.tier || 1, stats: item.stats || null });
  }
  for (const s of input.sets || []) {
    if (s && s.triggers && s.triggers.length) out.push({ id: s.id || 'set', kind: 'set', triggers: s.triggers, tier: 1, stats: s.stats || null });
  }
  return out;
}

// Unterschiede zweier Stat-Objekte (für die Werte-Vergleiche in der Garage)
export function statDiff(a, b, eps = 1e-6) {
  const out = [];
  for (const k of STATS) {
    if (Math.abs((a[k] ?? 0) - (b[k] ?? 0)) > eps * Math.max(1, Math.abs(a[k] ?? 0))) out.push({ stat: k, from: a[k], to: b[k] });
  }
  return out;
}
