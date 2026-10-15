// Erfinder-Labor (V2-DESIGN.md §5): Forschung mit Blaupausen kaufen, Zustände der Knoten, Freischaltungen auflösen.
// Reine Logik ohne three.js und DOM. Daten: data/research.js (Kosten, requires, unlocks, pos), Zahlen: balance.RESEARCH.
//
// Spielstand: save.research = { done: [ids], levels: { id: Stufe } }
//   done    alle erforschten Knoten (wiederholbare ab Stufe 1) – genau diese Liste prüfen Garage (Teile, Fähigkeiten,
//           Chassis: unlock.research), Item-Pools (item.pool) und Karte (nodes.requiresResearch).
//   levels  Stufen der wiederholbaren „Feinschliff“-Knoten (fehlt ein Eintrag: 1 bei erforschten Knoten).
// Freischaltungen (unlocks): pool/items (Item-Pool), parts/abilities/chassis (Garage – Chassis kosten zusätzlich Kerne),
// nodes (Kartenknoten Werkbank/Schwarzmarkt), perks (dauerhafte Boni, je Stufe addiert, siehe researchPerks).
import { RESEARCH, BRANCHES } from '../data/research.js';
import { RESEARCH as BAL } from '../data/balance.js';
import { NODE_TYPES } from '../data/nodes.js';
import { chassisById, partById, abilityById } from '../data/index.js';
import { itemById } from '../data/items.js';

export { RESEARCH, BRANCHES };

const MAP = new Map(RESEARCH.map((r) => [r.id, r]));
export const researchById = (id) => MAP.get(id) || null;

// Alle Perk-Schlüssel (data/research.js Kopf) – choiceExtra ist vorbereitet (+ Items zur Wahl), in den Daten noch ungenutzt
export const PERK_KEYS = ['startBolts', 'itemSlots', 'abilitySlots', 'rerollDiscount', 'reserveSlots', 'startDurability', 'scrapGain', 'choiceExtra'];

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

function ensure(save) {
  if (!isObj(save.research)) save.research = { done: [], levels: {} };
  if (!Array.isArray(save.research.done)) save.research.done = [];
  if (!isObj(save.research.levels)) save.research.levels = {};
  return save.research;
}

// Erforschte Stufe eines Knotens (0 = nicht erforscht)
export function researchLevel(save, id) {
  const r = ensure(save);
  const node = researchById(id);
  const lv = r.levels[id];
  if (typeof lv === 'number' && lv > 0) return node && !node.repeatable ? 1 : Math.floor(lv);
  return r.done.includes(id) ? 1 : 0;
}

export const isResearched = (save, id) => researchLevel(save, id) > 0;

// Preis der Stufe `level` (0-basiert): einmalige Knoten cost, wiederholbare round(cost × costGrowth^level) – × RESEARCH.costMul
export function researchCost(node, level = 0) {
  if (!node) return Infinity;
  const g = node.repeatable ? Math.pow(node.repeatable.costGrowth, Math.max(0, level)) : 1;
  return Math.max(0, Math.round(node.cost * g * BAL.costMul));
}

// Zustand eines Knotens für Labor und Tests:
// { level, done, maxed, repeatable, max, missing: [ids], available, cost, canBuy, status: 'locked'|'available'|'done' }
export function researchState(save, node) {
  if (typeof node === 'string') node = researchById(node);
  const level = researchLevel(save, node.id);
  const max = node.repeatable ? node.repeatable.max : 1;
  const maxed = level >= max;
  const missing = node.requires.filter((id) => !isResearched(save, id));
  const available = missing.length === 0;
  const cost = maxed ? 0 : researchCost(node, level);
  const status = level > 0 && (maxed || !node.repeatable) ? 'done' : available ? 'available' : 'locked';
  return {
    level, done: level > 0, maxed, repeatable: !!node.repeatable, max, missing, available, cost,
    canBuy: available && !maxed && save.meta.blueprints >= cost,
    status,
  };
}

// Forschung kaufen (Blaupausen). Ergebnis: { ok, reason?: 'unknown'|'locked'|'maxed'|'blueprints', cost, level }
export function buyResearch(save, id) {
  const node = researchById(id);
  if (!node) return { ok: false, reason: 'unknown' };
  const st = researchState(save, node);
  if (st.maxed) return { ok: false, reason: 'maxed' };
  if (!st.available) return { ok: false, reason: 'locked', missing: st.missing };
  if (save.meta.blueprints < st.cost) return { ok: false, reason: 'blueprints', cost: st.cost };
  const r = ensure(save);
  save.meta.blueprints -= st.cost;
  if (!r.done.includes(id)) r.done.push(id);
  const level = st.level + 1;
  if (node.repeatable) r.levels[id] = level;
  return { ok: true, cost: st.cost, level, unlocks: node.unlocks };
}

// Dauerhafte Boni aller erforschten Perk-Knoten (je Stufe addiert): { startBolts, itemSlots, … } (fehlende = 0)
export function researchPerks(save) {
  const out = {};
  for (const k of PERK_KEYS) out[k] = 0;
  if (!save || !save.research) return out;
  for (const node of RESEARCH) {
    const perks = node.unlocks && node.unlocks.perks;
    if (!perks) continue;
    const lv = researchLevel(save, node.id);
    if (!lv) continue;
    for (const [k, v] of Object.entries(perks)) if (typeof v === 'number') out[k] = (out[k] || 0) + v * lv;
  }
  return out;
}

// Perks als Stat-Modifikatoren für die Stat-Pipeline (items/statMods.js → input.research).
// startBolts, reserveSlots und scrapGain wirken nicht über Stats (Run-Start, Schrotthändler, Run-Auszahlung).
export function perkStatMods(perks = {}) {
  const stats = {};
  if (perks.itemSlots) stats.itemSlots = { add: perks.itemSlots };
  if (perks.abilitySlots) stats.abilitySlots = { add: perks.abilitySlots };
  if (perks.rerollDiscount) stats.rerollDiscount = { add: perks.rerollDiscount };
  if (perks.startDurability) stats.durabilityMax = { add: perks.startDurability };
  if (perks.choiceExtra) stats.itemChoices = { add: perks.choiceExtra };
  return Object.keys(stats).length ? [{ id: 'research', stats }] : [];
}

// Lesbare Liste der Freischaltungen eines Knotens: [{ kind, icon, text }]
const PERK_TEXT = {
  startBolts: (v) => `+${v} 🔩 beim Run-Start`,
  itemSlots: (v) => `+${v} Item-Slot`,
  abilitySlots: (v) => `+${v} Fähigkeits-Slot`,
  rerollDiscount: (v) => `−${Math.round(v * 100)} % Reroll-Preis`,
  reserveSlots: (v) => `+${v} Reservieren-Platz`,
  startDurability: (v) => `+${v} Start-Haltbarkeit`,
  scrapGain: (v) => `+${Math.round(v * 100)} % Schrott`,
  choiceExtra: (v) => `+${v} Item zur Wahl`,
};
export function unlockList(node) {
  const u = node.unlocks || {};
  const out = [];
  for (const id of u.items || []) { const it = itemById(id); if (it) out.push({ kind: 'item', icon: it.icon, text: it.name }); }
  for (const id of u.parts || []) { const p = partById(id); if (p) out.push({ kind: 'part', icon: p.icon, text: `Teil: ${p.name}` }); }
  for (const id of u.abilities || []) { const a = abilityById(id); if (a) out.push({ kind: 'ability', icon: a.icon, text: `Fähigkeit: ${a.name}` }); }
  for (const id of u.chassis || []) { const c = chassisById(id); if (c) out.push({ kind: 'chassis', icon: c.icon, text: `Chassis-Bauplan: ${c.name} (+ 💠)` }); }
  for (const t of u.nodes || []) { const n = NODE_TYPES[t]; if (n) out.push({ kind: 'node', icon: n.icon, text: `Kartenknoten: ${n.name}` }); }
  for (const [k, v] of Object.entries(u.perks || {})) out.push({ kind: 'perk', icon: '✨', text: PERK_TEXT[k] ? PERK_TEXT[k](v) + (node.repeatable ? ' je Stufe' : '') : `${k} +${v}` });
  return out;
}

// Lesbarer Name einer Forschungs-ID (Garage-Sperrhinweise)
export function researchName(id) {
  const n = researchById(id);
  return n ? n.name : id;
}

// Labor-Übersicht: Zähler für die Kopfzeile
export function researchProgress(save) {
  let done = 0, total = 0;
  for (const n of RESEARCH) {
    if (n.repeatable) continue;
    total++;
    if (isResearched(save, n.id)) done++;
  }
  return { done, total };
}

// Dev-Menü: ganzen Baum erforschen (einmalige Knoten; wiederholbare auf Stufe 1)
export function completeAllResearch(save) {
  const r = ensure(save);
  for (const n of RESEARCH) {
    if (!r.done.includes(n.id)) r.done.push(n.id);
    if (n.repeatable && !(r.levels[n.id] > 0)) r.levels[n.id] = 1;
  }
  return save;
}
