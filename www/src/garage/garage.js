// Garage-Aktionen auf dem Spielstand (Schema v4): Chassis kaufen/wählen, Teile kaufen/ausrüsten, Slots verbessern,
// Fähigkeiten wählen. Reine Logik ohne three.js und DOM – die Oberfläche ruft nur diese Funktionen auf.
// Alle Aktionen geben { ok, reason?, cost? } zurück und verändern `save` nur bei Erfolg.
// Paket A: Stufen gelten je Slot (save.garage.slotLevels, 0 … GARAGE.maxPartLevel = 10) – ein Teilwechsel behält die
// Stufe; jede Stufe wirkt doppelt (GARAGE.levelEffectMul) und kostet GARAGE.slotUpgradeBase × costGrowth^Stufe.
import { GARAGE } from '../data/balance.js';
import { PAINTS } from '../data/cosmetics.js';
import { LEVEL_GAINS } from '../data/levelGains.js';
import { partDimLevels } from '../items/statMods.js';
import {
  SLOTS, CHASSIS, PARTS, ABILITIES, chassisById, partById, abilityById, chassisUnlock, partUnlock, abilityUnlock,
  isStarterPart, starterPartFor, isSlotAbility, referencedResearch,
} from '../data/index.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// ---------- Abfragen ----------

export const researchDone = (save, id) => !id || (save.research && save.research.done.includes(id));

// Schema v3 (bis v1.0): Basispreis der Teile-Stufen = Kaufpreis, bei Startteilen GARAGE.starterUpgradeBase
// (nur noch für die Migration v3 → v4: bezahlten Schrott nachrechnen)
export function partBasePrice(part) {
  const s = partUnlock(part).scrap;
  return s > 0 ? s : GARAGE.starterUpgradeBase;
}

// Preis, um einen Slot von Stufe `level` auf `level + 1` zu bringen (für jedes Teil gleich)
export function upgradeCost(level) {
  return Math.round(GARAGE.slotUpgradeBase * Math.pow(GARAGE.costGrowth, Math.max(0, level | 0)));
}
// Summe der Preise bis Stufe `level`
export function upgradeCostTotal(level) {
  let c = 0;
  for (let l = 0; l < level; l++) c += upgradeCost(l);
  return c;
}

const clampLevel = (l) => Math.max(0, Math.min(GARAGE.maxPartLevel, Math.floor(Number(l) || 0)));
export const slotLevel = (save, slot) => clampLevel(save.garage.slotLevels && save.garage.slotLevels[slot]);
// Stufe eines Teils = Stufe seines Slots
export const partLevel = (save, id) => { const p = partById(id); return p ? slotLevel(save, p.slot) : 0; };

// Meter, die die nächste Stufe dieses Teils auf der Bezugs-Etappe bringt (Bot-Messung data/levelGains.js, abnehmender
// Ertrag wie in der Stat-Pipeline). Ergebnis: { m (gerundet, 0 = nicht messbar), ref (Bezugs-Etappe) }
export function levelGain(partId, level) {
  const per = LEVEL_GAINS.parts[partId] || 0;
  const L = Math.max(0, Math.min(GARAGE.maxPartLevel - 1, level | 0));
  return { m: Math.round(per * (partDimLevels(L + 1) - partDimLevels(L))), ref: LEVEL_GAINS.ref };
}

// Slot verbessern: { level, maxed, cost, canUpgrade }
export function slotState(save, slot) {
  const level = slotLevel(save, slot);
  const maxed = level >= GARAGE.maxPartLevel;
  const cost = maxed ? 0 : upgradeCost(level);
  return { level, maxed, cost, canUpgrade: !maxed && save.meta.scrap >= cost };
}

export function chassisState(save, c) {
  const u = chassisUnlock(c);
  const owned = save.garage.ownedChassis.includes(c.id);
  const researchOk = researchDone(save, u.research);
  return {
    owned,
    selected: save.garage.chassis === c.id,
    researchOk,
    research: u.research,
    cores: u.cores,
    canBuy: !owned && researchOk && save.meta.cores >= u.cores,
  };
}

export function partState(save, p) {
  const u = partUnlock(p);
  const owned = save.garage.ownedParts.includes(p.id);
  const level = slotLevel(save, p.slot);
  const maxed = level >= GARAGE.maxPartLevel;
  const researchOk = researchDone(save, u.research);
  const upCost = maxed ? 0 : upgradeCost(level);
  return {
    owned,
    equipped: save.garage.parts[p.slot] === p.id,
    level,
    maxed,
    researchOk,
    research: u.research,
    price: u.scrap,
    canBuy: !owned && researchOk && save.meta.scrap >= u.scrap,
    upgradeCost: upCost,
    canUpgrade: owned && !maxed && save.meta.scrap >= upCost,
  };
}

export function abilityState(save, a) {
  const u = abilityUnlock(a);
  const slot = save.garage.abilities.indexOf(a.id);
  return { unlocked: researchDone(save, u.research), research: u.research, slot, equipped: slot >= 0 };
}

// ---------- Chassis ----------

export function buyChassis(save, id) {
  const c = chassisById(id);
  if (!c) return { ok: false, reason: 'unknown' };
  const st = chassisState(save, c);
  if (st.owned) return { ok: false, reason: 'owned' };
  if (!st.researchOk) return { ok: false, reason: 'research' };
  if (save.meta.cores < st.cores) return { ok: false, reason: 'cores' };
  save.meta.cores -= st.cores;
  save.garage.ownedChassis.push(c.id);
  save.garage.chassis = c.id;
  return { ok: true, cost: st.cores };
}

export function selectChassis(save, id) {
  if (!chassisById(id) || !save.garage.ownedChassis.includes(id)) return { ok: false, reason: 'locked' };
  save.garage.chassis = id;
  return { ok: true };
}

// ---------- Teile ----------

export function buyPart(save, id) {
  const p = partById(id);
  if (!p) return { ok: false, reason: 'unknown' };
  const st = partState(save, p);
  if (st.owned) return { ok: false, reason: 'owned' };
  if (!st.researchOk) return { ok: false, reason: 'research' };
  if (save.meta.scrap < st.price) return { ok: false, reason: 'scrap' };
  save.meta.scrap -= st.price;
  save.garage.ownedParts.push(p.id);
  return { ok: true, cost: st.price };
}

export function equipPart(save, id) {
  const p = partById(id);
  if (!p) return { ok: false, reason: 'unknown' };
  if (!save.garage.ownedParts.includes(id)) return { ok: false, reason: 'locked' };
  save.garage.parts[p.slot] = id;
  return { ok: true };
}

// Slot verbessern (Stufe gilt für jedes Teil in diesem Slot)
export function upgradeSlot(save, slot) {
  if (!SLOTS.includes(slot)) return { ok: false, reason: 'unknown' };
  const st = slotState(save, slot);
  if (st.maxed) return { ok: false, reason: 'maxed' };
  if (save.meta.scrap < st.cost) return { ok: false, reason: 'scrap' };
  save.meta.scrap -= st.cost;
  if (!isObj(save.garage.slotLevels)) save.garage.slotLevels = {};
  save.garage.slotLevels[slot] = st.level + 1;
  return { ok: true, cost: st.cost, level: st.level + 1, slot };
}

// Verbessern über ein Teil (Oberfläche, Simulator): verbessert dessen Slot – nur mit einem eigenen Teil
export function upgradePart(save, id) {
  const p = partById(id);
  if (!p) return { ok: false, reason: 'unknown' };
  if (!save.garage.ownedParts.includes(p.id)) return { ok: false, reason: 'locked' };
  return upgradeSlot(save, p.slot);
}

// ---------- Fähigkeiten ----------

// Fähigkeit in Slot `index` legen; liegt sie schon in einem anderen Slot, tauschen beide.
export function setAbility(save, index, id, maxSlots = GARAGE.starterAbilities.length) {
  const a = abilityById(id);
  if (!a || !isSlotAbility(a)) return { ok: false, reason: 'unknown' };
  if (!abilityState(save, a).unlocked) return { ok: false, reason: 'research' };
  if (index < 0 || index >= maxSlots) return { ok: false, reason: 'slot' };
  const list = save.garage.abilities;
  while (list.length < maxSlots) list.push(null);
  const from = list.indexOf(id);
  if (from >= 0) list[from] = list[index];
  list[index] = id;
  return { ok: true };
}

// ---------- Lackierungen (Endgame-Senke, data/cosmetics.js) ----------
// Kauf mit Schrott oder Kernen; Schrottstufen-Lacke (cost null, unlock 'ascension:N') gehören einem, sobald ein Run auf
// Schrottstufe ≥ N gewonnen wurde (save.ascension.best). Rein kosmetisch – das Fahrzeugmodell zeigt die Farben.

const PAINT_MAP = new Map(PAINTS.map((p) => [p.id, p]));
export const paintById = (id) => PAINT_MAP.get(id) || null;
export { PAINTS };

// Bedingung „ascension:N“ → N (sonst 0)
const ascNeed = (p) => {
  const m = /^ascension:(\d+)$/.exec(p.unlock || '');
  return m ? Number(m[1]) : 0;
};

export function paintState(save, p) {
  const cost = p.cost || null;
  const need = ascNeed(p);
  const earned = !cost && need > 0 && ((save.ascension && save.ascension.best) || 0) >= need;
  const owned = save.cosmetics.owned.includes(p.id) || earned;
  const cur = cost ? (cost.scrap !== undefined ? 'scrap' : 'cores') : null;
  const price = cost ? cost[cur] : 0;
  return {
    owned, equipped: save.cosmetics.paint === p.id, currency: cur, price, ascension: need,
    canBuy: !owned && !!cost && save.meta[cur] >= price,
  };
}

export function buyPaint(save, id) {
  const p = paintById(id);
  if (!p) return { ok: false, reason: 'unknown' };
  const st = paintState(save, p);
  if (st.owned) return { ok: false, reason: 'owned' };
  if (!st.currency) return { ok: false, reason: 'ascension', need: st.ascension };
  if (save.meta[st.currency] < st.price) return { ok: false, reason: st.currency };
  save.meta[st.currency] -= st.price;
  save.cosmetics.owned.push(p.id);
  save.cosmetics.paint = p.id;
  return { ok: true, cost: st.price, currency: st.currency };
}

// Lack anlegen (null = Originalfarben des Chassis)
export function equipPaint(save, id) {
  if (id === null) { save.cosmetics.paint = null; return { ok: true }; }
  const p = paintById(id);
  if (!p) return { ok: false, reason: 'unknown' };
  if (!paintState(save, p).owned) return { ok: false, reason: 'locked' };
  save.cosmetics.paint = id;
  return { ok: true };
}

// Farben fürs Modell: { color, accent } des angelegten Lacks oder null (Chassis-Farben)
export function paintVisual(save) {
  const p = save && save.cosmetics ? paintById(save.cosmetics.paint) : null;
  return p ? { color: p.colors.body, accent: p.colors.accent } : null;
}

// ---------- Aufräumen & Dev ----------

// Spielstand-Garage gegen die aktuellen Inhaltsdaten prüfen (Inhalte können sich ändern, IDs bleiben)
export function sanitizeGarage(save) {
  if (!isObj(save.garage)) save.garage = {};
  if (!isObj(save.research) || !Array.isArray(save.research.done)) save.research = { done: [], levels: {} };
  if (!isObj(save.research.levels)) save.research.levels = {};
  if (!isObj(save.cosmetics)) save.cosmetics = { owned: [], paint: null };
  if (!Array.isArray(save.cosmetics.owned)) save.cosmetics.owned = [];
  save.cosmetics.owned = [...new Set(save.cosmetics.owned.filter((id) => paintById(id)))];
  if (save.cosmetics.paint && !(paintById(save.cosmetics.paint) && paintState(save, paintById(save.cosmetics.paint)).owned)) save.cosmetics.paint = null;
  const g = save.garage;
  for (const k of ['ownedChassis', 'ownedParts', 'abilities']) if (!Array.isArray(g[k])) g[k] = [];
  if (!isObj(g.parts)) g.parts = {};
  if (!isObj(g.slotLevels)) g.slotLevels = {};
  g.ownedChassis = [...new Set(g.ownedChassis.filter((id) => chassisById(id)))];
  if (!g.ownedChassis.includes(GARAGE.starterChassis) && chassisById(GARAGE.starterChassis)) g.ownedChassis.unshift(GARAGE.starterChassis);
  if (!chassisById(g.chassis) || !g.ownedChassis.includes(g.chassis)) g.chassis = g.ownedChassis[0] || CHASSIS[0].id;
  const owned = new Set(g.ownedParts.filter((id) => partById(id)));
  for (const p of PARTS) if (isStarterPart(p)) owned.add(p.id);
  for (const slot of SLOTS) {
    const p = partById(g.parts[slot]);
    if (!p || p.slot !== slot || !owned.has(p.id)) {
      const st = starterPartFor(slot);
      g.parts[slot] = st ? st.id : null;
      if (st) owned.add(st.id);
    }
  }
  g.ownedParts = [...owned];
  const levels = {};
  for (const slot of SLOTS) levels[slot] = typeof g.slotLevels[slot] === 'number' && isFinite(g.slotLevels[slot]) ? clampLevel(g.slotLevels[slot]) : 0;
  g.slotLevels = levels;
  delete g.partLevels;   // Schema v3 (Stufen je Teil) – Umrechnung in save/save.js → migrateV3toV4
  const ab = g.abilities.map((id) => {
    const a = abilityById(id);
    return a && isSlotAbility(a) && researchDone(save, abilityUnlock(a).research) ? id : null;
  });
  // doppelte entfernen
  for (let i = 0; i < ab.length; i++) if (ab[i] && ab.indexOf(ab[i]) !== i) ab[i] = null;
  if (!ab.some(Boolean)) for (let i = 0; i < GARAGE.starterAbilities.length; i++) ab[i] = GARAGE.starterAbilities[i];
  g.abilities = ab;
  return save;
}

// Dev-Menü: alle Forschungs-Bedingungen erfüllen (→ alle Fähigkeiten verfügbar, Teile kaufbar, Chassis mit
// Kernen kaufbar). Abkürzung am Erfinder-Labor vorbei (garage/research.js → completeAllResearch erforscht den ganzen Baum).
export function completeResearch(save) {
  const done = new Set(save.research.done);
  for (const id of referencedResearch()) done.add(id);
  save.research.done = [...done];
  return save;
}

// Dev-Menü: alle Forschungs-Bedingungen erfüllen und alle Chassis besitzen.
// Teile bleiben zu kaufen (Schrott gibt es im Dev-Menü).
export function unlockAll(save) {
  completeResearch(save);
  for (const c of CHASSIS) if (!save.garage.ownedChassis.includes(c.id)) save.garage.ownedChassis.push(c.id);
  return save;
}

// Dev-Menü: alle Teile besitzen
export function giftAllParts(save) {
  for (const p of PARTS) if (!save.garage.ownedParts.includes(p.id)) save.garage.ownedParts.push(p.id);
  return save;
}

export { ABILITIES };
