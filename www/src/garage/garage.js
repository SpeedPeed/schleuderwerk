// Garage-Aktionen auf dem Spielstand (Schema v3): Chassis kaufen/wählen, Teile kaufen/ausrüsten/verbessern,
// Fähigkeiten wählen. Reine Logik ohne three.js und DOM – die Oberfläche ruft nur diese Funktionen auf.
// Alle Aktionen geben { ok, reason?, cost? } zurück und verändern `save` nur bei Erfolg.
import { GARAGE } from '../data/balance.js';
import {
  SLOTS, CHASSIS, PARTS, ABILITIES, chassisById, partById, abilityById, chassisUnlock, partUnlock, abilityUnlock,
  isStarterPart, starterPartFor, isSlotAbility, referencedResearch,
} from '../data/index.js';

// ---------- Abfragen ----------

export const researchDone = (save, id) => !id || (save.research && save.research.done.includes(id));

// Basispreis eines Teils für Stufen: Kaufpreis, bei Startteilen GARAGE.starterUpgradeBase
export function partBasePrice(part) {
  const s = partUnlock(part).scrap;
  return s > 0 ? s : GARAGE.starterUpgradeBase;
}

// Preis, um ein Teil von Stufe `level` auf `level + 1` zu bringen
export function upgradeCost(part, level) {
  return Math.round(partBasePrice(part) * Math.pow(GARAGE.costGrowth, level));
}

export const partLevel = (save, id) => Math.max(0, Math.min(GARAGE.maxPartLevel, (save.garage.partLevels && save.garage.partLevels[id]) || 0));

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
  const level = partLevel(save, p.id);
  const maxed = level >= GARAGE.maxPartLevel;
  const researchOk = researchDone(save, u.research);
  const upCost = maxed ? 0 : upgradeCost(p, level);
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

export function upgradePart(save, id) {
  const p = partById(id);
  if (!p) return { ok: false, reason: 'unknown' };
  const st = partState(save, p);
  if (!st.owned) return { ok: false, reason: 'locked' };
  if (st.maxed) return { ok: false, reason: 'maxed' };
  if (save.meta.scrap < st.upgradeCost) return { ok: false, reason: 'scrap' };
  save.meta.scrap -= st.upgradeCost;
  save.garage.partLevels[id] = st.level + 1;
  return { ok: true, cost: st.upgradeCost, level: st.level + 1 };
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

// ---------- Aufräumen & Dev ----------

// Spielstand-Garage gegen die aktuellen Inhaltsdaten prüfen (Inhalte können sich ändern, IDs bleiben)
export function sanitizeGarage(save) {
  const g = save.garage;
  g.ownedChassis = [...new Set((g.ownedChassis || []).filter((id) => chassisById(id)))];
  if (!g.ownedChassis.includes(GARAGE.starterChassis) && chassisById(GARAGE.starterChassis)) g.ownedChassis.unshift(GARAGE.starterChassis);
  if (!chassisById(g.chassis) || !g.ownedChassis.includes(g.chassis)) g.chassis = g.ownedChassis[0] || CHASSIS[0].id;
  const owned = new Set((g.ownedParts || []).filter((id) => partById(id)));
  for (const p of PARTS) if (isStarterPart(p)) owned.add(p.id);
  g.parts = g.parts && typeof g.parts === 'object' ? g.parts : {};
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
  for (const [id, l] of Object.entries(g.partLevels || {})) {
    if (partById(id) && isFinite(l)) levels[id] = Math.max(0, Math.min(GARAGE.maxPartLevel, Math.floor(l)));
  }
  g.partLevels = levels;
  const ab = (Array.isArray(g.abilities) ? g.abilities : []).map((id) => {
    const a = abilityById(id);
    return a && isSlotAbility(a) && researchDone(save, abilityUnlock(a).research) ? id : null;
  });
  // doppelte entfernen
  for (let i = 0; i < ab.length; i++) if (ab[i] && ab.indexOf(ab[i]) !== i) ab[i] = null;
  if (!ab.some(Boolean)) for (let i = 0; i < GARAGE.starterAbilities.length; i++) ab[i] = GARAGE.starterAbilities[i];
  g.abilities = ab;
  return save;
}

// Dev-Menü: alle Forschungs-Bedingungen erfüllen (→ alle Fähigkeiten verfügbar, alle Teile kaufbar)
// und alle Chassis besitzen. Teile bleiben zu kaufen (Schrott gibt es im Dev-Menü).
export function unlockAll(save) {
  const done = new Set(save.research.done);
  for (const id of referencedResearch()) done.add(id);
  save.research.done = [...done];
  for (const c of CHASSIS) if (!save.garage.ownedChassis.includes(c.id)) save.garage.ownedChassis.push(c.id);
  return save;
}

// Dev-Menü: alle Teile besitzen
export function giftAllParts(save) {
  for (const p of PARTS) if (!save.garage.ownedParts.includes(p.id)) save.garage.ownedParts.push(p.id);
  return save;
}

export { ABILITIES };
