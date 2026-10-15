// Inventar eines Runs (ARCHITEKTUR.md §8 inventory: [{ itemId, tier, hybrid?, hybridTier? }]) und alles, was daraus
// für Etappe und Anzeige entsteht: Item-Slots, Stufen ★1–3, Tag-Zählung, aktive Set-Boni 2/4/6, Stat-Beiträge für die
// Stat-Pipeline (items/statMods.js), Trigger-Quellen für die Trigger-Engine, Beschreibungen mit Platzhaltern,
// Fusion und Hybride (reine Funktionen; die Werkbank-Oberfläche kommt in Phase 5).
//
// Regeln, die HIER ausgewertet werden (ARCHITEKTUR.md Anhang A):
//   setBonusDouble (Badewanne) – beim Aufbau der Set-Quellen: skalierte Schlüssel ×2 (Engine-Faktor), stack.max ×2,
//                                chance.p ×2 (≤ ITEMS.chanceMax), Set-Stats add/mul ×2; n/at/Limits/xmul bleiben.
//   tagBoost (Kühlschrank, Biome) – beim Aufbau der Item-Quellen: Items mit einem verstärkten Tag wirken ×(1 + Wert)
//                                auf passive Stats (add/mul) und skalierte Effekt-Parameter; Chassis- und Biom-Werte
//                                desselben Tags addieren sich, bei mehreren verstärkten Tags eines Items gilt der größte.
// Reine Logik ohne three.js und DOM.
import { ITEMS as BAL, RULES } from '../data/balance.js';
import { itemById, RARITIES } from '../data/items.js';
import { TAGS, TAG_IDS, SET_LEVELS, setBonus, setId } from '../data/tags.js';
import { NODE_TYPES } from '../data/nodes.js';
import { partById } from '../data/index.js';
import { SCALE_KEYS } from './effects.js';
import { mergeRules, resolveParts } from './statMods.js';

export const MAX_TIER = BAL.tierMult.length;

// Stufenfaktor ★1/★2/★3 (über ★3 hinaus: RULES.everyThirdTierUp.beyondMax)
export function tierMult(tier) {
  const t = Math.max(1, Math.round(tier || 1));
  if (t > MAX_TIER) return RULES.everyThirdTierUp.beyondMax;
  return BAL.tierMult[t - 1];
}

// Wirkung jedes Teils eines Hybrids (Werkbank-Parameter, data/nodes.js)
export const hybridMul = () => NODE_TYPES.workbench.params.hybridEffectMul;

// ---------- Einträge ----------

export const makeEntry = (itemId, tier = 1) => ({ itemId, tier: Math.max(1, Math.min(MAX_TIER, tier | 0 || 1)) });

// Definitionen eines Eintrags: [{ def, tier }] (Hybrid: zwei)
export function entryParts(entry) {
  const out = [];
  const a = entry && itemById(entry.itemId);
  if (a) out.push({ def: a, tier: entry.tier || 1 });
  const b = entry && entry.hybrid ? itemById(entry.hybrid) : null;
  if (b) out.push({ def: b, tier: entry.hybridTier || entry.tier || 1 });
  return out;
}

export const isHybrid = (entry) => !!(entry && entry.hybrid && itemById(entry.hybrid));

// Alle Tags eines Eintrags (Hybride und Items mit zwei Tags zählen für jeden ihrer Tags einmal)
export function entryTags(entry) {
  const s = new Set();
  for (const { def } of entryParts(entry)) for (const t of def.tags) s.add(t);
  return [...s];
}

export function entryName(entry) {
  return entryParts(entry).map(({ def }) => def.name).join(' + ');
}

export function entryIcon(entry) {
  return entryParts(entry).map(({ def }) => def.icon).join('');
}

// Seltenheit eines Eintrags (Hybrid: die höhere)
export function entryRarity(entry) {
  const order = ['common', 'rare', 'epic', 'legendary', 'cursed'];
  let best = 'common';
  for (const { def } of entryParts(entry)) if (order.indexOf(def.rarity) > order.indexOf(best)) best = def.rarity;
  return best;
}

export const isValidEntry = (e) => !!e && typeof e === 'object' && !!itemById(e.itemId) && (!e.hybrid || !!itemById(e.hybrid));

// ---------- Tag-Zählung und Set-Boni ----------

// Teile-Eingabe { slot: { id } | id } oder Loadout-Teile → Liste der Tag-Teile
function partTags(parts) {
  const out = [];
  for (const { part } of resolveParts(parts)) if (part.tag) out.push(part.tag);
  return out;
}

// Anzahl je Tag: jedes Inventar-Item zählt 1 je eigenem Tag (Hybride und Zwei-Tag-Items für beide), jedes Garage-Teil
// mit `tag` zählt 1. Ergebnis: { feuer: n, … } (alle 10 Tags, auch 0)
export function tagCounts(inventory = [], parts = null) {
  const c = {};
  for (const t of TAG_IDS) c[t] = 0;
  for (const e of inventory) for (const t of entryTags(e)) if (t in c) c[t]++;
  for (const t of partTags(parts)) if (t in c) c[t]++;
  return c;
}

// Aktive Set-Boni: [{ tag, level, id: 'feuer4', bonus }] – Stufe 2 ab 2, 4 ab 4, 6 ab 6 (kumulativ)
export function activeSets(counts) {
  const out = [];
  for (const tag of TAG_IDS) {
    for (const level of SET_LEVELS) {
      if ((counts[tag] || 0) >= level && setBonus(tag, level)) out.push({ tag, level, id: setId(tag, level), bonus: setBonus(tag, level) });
    }
  }
  return out;
}

// Fortschritt je Tag für die Set-Übersicht: [{ tag, count, levels: [{ level, active, desc }], next }]
export function setOverview(counts) {
  return TAG_IDS.map((tag) => {
    const n = counts[tag] || 0;
    const levels = SET_LEVELS.map((level) => ({ level, active: n >= level, desc: setBonus(tag, level).desc }));
    const next = SET_LEVELS.find((l) => n < l) || null;
    return { tag, def: TAGS[tag], count: n, levels, next };
  });
}

// Welche Set-Stufen würde ein zusätzliches Item voranbringen? [{ tag, from, to, reaches: level|null }]
export function setProgressFor(itemId, inventory = [], parts = null) {
  const def = itemById(itemId);
  if (!def) return [];
  const c = tagCounts(inventory, parts);
  return def.tags.map((tag) => {
    const from = c[tag] || 0;
    const to = from + 1;
    const reaches = SET_LEVELS.includes(to) ? to : null;
    const next = SET_LEVELS.find((l) => to <= l) || null;
    return { tag, from, to, reaches, next };
  });
}

// ---------- Umformungen (setBonusDouble) ----------

const clone = (v) => JSON.parse(JSON.stringify(v));

// Effektliste für verdoppelte Set-Boni: stack.max ×2, chance.p ×2 (≤ ITEMS.chanceMax) – rekursiv in then
function doubleFxList(list) {
  for (const fx of list || []) {
    if (fx.fx === 'stack' && typeof fx.max === 'number') fx.max *= 2;
    if (fx.fx === 'chance' && typeof fx.p === 'number') fx.p = Math.min(BAL.chanceMax, fx.p * 2);
    if (fx.then) doubleFxList(fx.then);
  }
  return list;
}

function doubledTriggers(triggers) {
  const t = clone(triggers || []);
  for (const tr of t) doubleFxList(tr.do);
  return t;
}

// ---------- Verstärkung nach Tag (tagBoost) ----------

// Zusammengeführte tagBoost-Werte: Chassis-Regel (rules.tagBoost) + Biom (biome.tagBoost) – je Tag addiert
export function mergedTagBoost(rules = {}, biome = null) {
  const out = {};
  for (const src of [rules && rules.tagBoost, biome && biome.tagBoost]) {
    if (!src) continue;
    for (const [t, v] of Object.entries(src)) if (typeof v === 'number') out[t] = (out[t] || 0) + v;
  }
  return out;
}

// Faktor für einen Eintrag: 1 + größter Wert seiner Tags
export function boostFactor(tags, boost) {
  let b = 0;
  for (const t of tags) if (boost[t] > b) b = boost[t];
  return 1 + b;
}

// ---------- Aufbau für Etappe und Stat-Pipeline ----------

// Item-Quellen + Stat-Beiträge. opts: { tagBoost: {tag: wert}, exclude: Set(slot) }
// Ergebnis: { sources: [...], statItems: [{ item, scale }], rules }
export function buildItemParts(inventory = [], opts = {}) {
  const boost = opts.tagBoost || {};
  const exclude = opts.exclude || new Set();
  const sources = [];
  const statItems = [];
  const rules = {};
  inventory.forEach((entry, slot) => {
    if (exclude.has(slot)) return;
    const parts = entryParts(entry);
    if (!parts.length) return;
    const hyb = parts.length > 1 ? hybridMul() : 1;
    const f = boostFactor(entryTags(entry), boost) * hyb;
    for (const { def, tier } of parts) {
      const scale = tierMult(tier) * f;
      statItems.push({ item: def, scale, slot });
      mergeRules(rules, def.rules);
      if (def.curse) mergeRules(rules, def.curse.rules);
      const triggers = [...(def.triggers || []), ...((def.curse && def.curse.triggers) || [])];
      if (!triggers.length) continue;
      sources.push({
        uid: `item:${slot}:${def.id}`, id: def.id, kind: 'item', slot, name: def.name, icon: def.icon, rarity: def.rarity,
        tier, scale, scaleUp: tierMult(tier + 1) * f, triggers, rules: { ...(def.rules || {}), ...((def.curse && def.curse.rules) || {}) },
      });
    }
  });
  return { sources, statItems, rules };
}

// Set-Quellen + Stat-Beiträge der aktiven Set-Boni. double: Regel setBonusDouble
export function buildSetParts(sets, double = false) {
  const sources = [];
  const statSets = [];
  const rules = {};
  for (const s of sets) {
    const b = s.bonus;
    const tag = TAGS[s.tag];
    const sid = `set_${s.id}`;
    statSets.push({ id: sid, stats: b.stats || null, scale: double ? 2 : 1 });
    mergeRules(rules, b.rules);
    if (!b.triggers || !b.triggers.length) continue;
    sources.push({
      uid: `set:${s.id}`, id: sid, kind: 'set', tag: s.tag, level: s.level, name: `${tag.name}-Set ${s.level}`, icon: tag.icon,
      tier: 1, scale: double ? 2 : 1, triggers: double ? doubledTriggers(b.triggers) : b.triggers, rules: b.rules || {},
    });
  }
  return { sources, statSets, rules };
}

// Inventar auf eine Ausrüstung (garage/loadout.js → buildLoadout) anwenden.
// opts: { biome, exclude: Set(slot) – z. B. Fluch blackCatNap }
// Ergebnis: { statInput, rules, sources, items: [{ slot, entry, napped }], sets, counts, tagBoost }
export function applyInventory(loadout, inventory = [], opts = {}) {
  const baseRules = mergeRules({}, loadout.rules || {});
  const counts = tagCounts(inventory, loadout.parts || (loadout.statInput && loadout.statInput.parts));
  const sets = activeSets(counts);
  const tagBoost = mergedTagBoost(baseRules, opts.biome);
  const ip = buildItemParts(inventory, { tagBoost, exclude: opts.exclude });
  const sp = buildSetParts(sets, !!baseRules.setBonusDouble);
  const rules = mergeRules(mergeRules(mergeRules({}, baseRules), ip.rules), sp.rules);
  const statInput = { ...(loadout.statInput || {}), items: ip.statItems, sets: sp.statSets };
  // Quellen: Chassis (immer – für Regeln wie healOnCleanLanding und die Anzeige), Teile, Sets, Items
  const c = loadout.chassis;
  const chassisSrc = c ? [{ uid: `chassis:${c.id}`, id: c.id, kind: 'chassis', name: c.name, icon: c.icon, tier: 1, scale: 1, triggers: c.triggers || [], rules: c.rules || {} }] : [];
  const partSrc = (loadout.sources || []).filter((s) => s.kind === 'part').map((s) => {
    const p = partById(s.id);
    return { ...s, uid: `part:${s.id}`, name: p ? p.name : s.id, icon: p ? p.icon : '🔧', scale: 1, rules: (p && p.rules) || {} };
  });
  const items = inventory.map((entry, slot) => ({ slot, entry, napped: !!(opts.exclude && opts.exclude.has(slot)) }));
  return { statInput, rules, sources: [...chassisSrc, ...partSrc, ...sp.sources, ...ip.sources], items, sets, counts, tagBoost };
}

// ---------- Beschreibung ----------

// Erster Wert je skaliertem Schlüssel in einer Trigger-Liste (Reihenfolge wie im Inhalts-Prüfer)
function firstScaleValues(triggers) {
  const out = {};
  const walk = (list) => {
    for (const fx of list || []) {
      for (const k of SCALE_KEYS) if (typeof fx[k] === 'number' && out[k] === undefined) out[k] = fx[k];
      if (fx.then) walk(fx.then);
    }
  };
  for (const t of triggers || []) walk(t.do);
  return out;
}

// Zahl deutsch formatiert (höchstens 1 Nachkommastelle)
export function fmtNum(v) {
  const r = Math.round(v * 10) / 10;
  return r.toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

function fill(text, vals, scale) {
  return String(text || '').replace(/\{([a-z]+)\}/g, (m, k) => (vals[k] !== undefined ? fmtNum(vals[k] * scale) : m));
}

// Beschreibung mit ersetzten Platzhaltern ({amount}, {dur} …) für Stufe `tier`.
// opts.scale: zusätzlicher Faktor (tagBoost, Hybrid). Ergebnis: { desc, curse?, name, icon, rarity, tags, tier }
export function describeItem(item, tier = 1, opts = {}) {
  const def = typeof item === 'string' ? itemById(item) : item;
  if (!def) return null;
  const scale = tierMult(tier) * (opts.scale || 1);
  return {
    id: def.id,
    name: def.name,
    icon: def.icon,
    rarity: def.rarity,
    rarityName: (RARITIES[def.rarity] || {}).name || def.rarity,
    color: (RARITIES[def.rarity] || {}).color || '#ccc',
    tags: [...def.tags],
    tier,
    desc: fill(def.desc, firstScaleValues(def.triggers), scale),
    curse: def.curse ? fill(def.curse.desc, firstScaleValues(def.curse.triggers), 1) : null,
    flavor: def.flavor || '',
  };
}

// Beschreibung eines Inventar-Eintrags (Hybrid: beide Texte, je ×0,75)
export function describeEntry(entry, opts = {}) {
  const parts = entryParts(entry);
  const hyb = parts.length > 1 ? hybridMul() : 1;
  return parts.map(({ def, tier }) => describeItem(def, tier, { scale: (opts.scale || 1) * hyb }));
}

// ---------- Slots, Hinzufügen, Fusion, Hybride ----------

export const isFull = (inventory, slots) => inventory.length >= slots;

// Eintrag hinzufügen bzw. Platz `replace` ersetzen. Ergebnis: { ok, reason?, slot, replaced? }
export function addEntry(inventory, entry, slots, replace = null) {
  if (!isValidEntry(entry)) return { ok: false, reason: 'unknown' };
  if (replace !== null && replace !== undefined) {
    if (!(replace >= 0 && replace < inventory.length)) return { ok: false, reason: 'slot' };
    const replaced = inventory[replace];
    inventory[replace] = entry;
    return { ok: true, slot: replace, replaced };
  }
  if (isFull(inventory, slots)) return { ok: false, reason: 'full' };
  inventory.push(entry);
  return { ok: true, slot: inventory.length - 1 };
}

// Zwei gleiche Items → ★+1 (höchste der beiden Stufen + 1, höchstens ★3). Ergebnis: { ok, entry? , reason? }
export function fuseSame(a, b) {
  if (!isValidEntry(a) || !isValidEntry(b)) return { ok: false, reason: 'unknown' };
  if (a.hybrid || b.hybrid) return { ok: false, reason: 'hybrid' };
  if (a.itemId !== b.itemId) return { ok: false, reason: 'different' };
  const tier = Math.max(a.tier || 1, b.tier || 1);
  if (tier >= MAX_TIER) return { ok: false, reason: 'maxed' };
  return { ok: true, entry: { itemId: a.itemId, tier: tier + 1 } };
}

// Zwei Items mit verschiedenen Tags → ein Hybrid mit beiden Tags und beiden Effekten (je × hybridMul, data/nodes.js)
export function makeHybrid(a, b) {
  if (!isValidEntry(a) || !isValidEntry(b)) return { ok: false, reason: 'unknown' };
  if (a.hybrid || b.hybrid) return { ok: false, reason: 'hybrid' };
  if (a.itemId === b.itemId) return { ok: false, reason: 'same' };
  const ta = itemById(a.itemId).tags, tb = itemById(b.itemId).tags;
  if (ta.every((t) => tb.includes(t)) && tb.every((t) => ta.includes(t))) return { ok: false, reason: 'sameTags' };
  return { ok: true, entry: { itemId: a.itemId, tier: a.tier || 1, hybrid: b.itemId, hybridTier: b.tier || 1 } };
}

// Zufälliges Item ★+1 (Effekt upgradeItem). Ergebnis: Platz oder -1 (alle schon ★3)
export function upgradeRandom(inventory, rng) {
  const can = [];
  inventory.forEach((e, i) => { if ((e.tier || 1) < MAX_TIER && isValidEntry(e)) can.push(i); });
  if (!can.length) return -1;
  const i = can[Math.floor((rng ? rng.next() : Math.random()) * can.length) % can.length];
  inventory[i] = { ...inventory[i], tier: (inventory[i].tier || 1) + 1 };
  return i;
}
