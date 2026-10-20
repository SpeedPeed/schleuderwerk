// Paket C – Rezepte und Tag-Stärke (reine Logik, kein three.js, kein DOM).
//  - Rezepte (data/recipes.js): zwei bestimmte Items im Rucksack → Bonus (Stats, Auslöser, Regeln) wie ein Set-Bonus.
//    Einzige Stelle der Regel „Rezept aktiv“: activeRecipes(); die Quellen baut buildRecipeParts() für
//    items/inventory.js → applyInventory (Reihenfolge der Quellen: Chassis → Teile → Sets → Rezepte → Items).
//  - Tag-Stärke (balance.SYNERGY.tagStrength): jedes Item eines Tags macht alle Effekte dieses Tags +perItem stärker
//    (Brotato-Prinzip). Einzige Stelle: tagStrength()/strengthFactor(); angewandt in items/inventory.js auf Items,
//    Set-Boni und Rezepte.
import { SYNERGY } from '../data/balance.js';
import { RECIPES } from '../data/recipes.js';
import { itemById } from '../data/items.js';
import { TAG_IDS } from '../data/tags.js';
import { mergeRules } from './statMods.js';

const BY_ID = new Map(RECIPES.map((r) => [r.id, r]));
export const recipeById = (id) => BY_ID.get(id) || null;
export { RECIPES };

// ---------- Tag-Stärke ----------

// { tag: Zuschlag } aus der Tag-Zählung (items/inventory.js → tagCounts): perItem × min(n, maxItems)
export function tagStrength(counts = {}) {
  const T = SYNERGY.tagStrength;
  const out = {};
  for (const t of TAG_IDS) out[t] = T.perItem * Math.min(T.maxItems, Math.max(0, counts[t] || 0));
  return out;
}

// Faktor für eine Quelle mit diesen Tags: 1 + Zuschlag des stärksten Tags
export function strengthFactor(tags, strength) {
  let b = 0;
  for (const t of tags || []) if ((strength[t] || 0) > b) b = strength[t];
  return 1 + b;
}

// ---------- Rezepte ----------

// Tags eines Rezepts (Vereinigung der Tags beider Items)
export function recipeTags(recipe) {
  const s = new Set();
  for (const id of recipe.items) { const it = itemById(id); if (it) for (const t of it.tags) s.add(t); }
  return [...s];
}

// Item-IDs im Rucksack (Hybride: beide Teile). exclude: Set(Platz) – z. B. schlafendes Item (Schwarze Katze)
export function ownedItemIds(inventory = [], exclude = null) {
  const s = new Set();
  inventory.forEach((e, slot) => {
    if (!e || (exclude && exclude.has(slot))) return;
    if (itemById(e.itemId)) s.add(e.itemId);
    if (e.hybrid && itemById(e.hybrid)) s.add(e.hybrid);
  });
  return s;
}

// Aktive Rezepte: beide Items im Rucksack
export function activeRecipes(inventory = [], exclude = null) {
  const own = ownedItemIds(inventory, exclude);
  return RECIPES.filter((r) => r.items.every((id) => own.has(id)));
}

// Rezepte, in denen ein Item vorkommt
export const recipesWith = (itemId) => RECIPES.filter((r) => r.items.includes(itemId));

// Hinweise für ein angebotenes Item: [{ recipe, other, owned, completes }] – completes = das Item vervollständigt
// das Rezept (der Partner ist im Rucksack, das Rezept ist noch nicht aktiv)
export function recipeHints(itemId, inventory = []) {
  const own = ownedItemIds(inventory);
  return recipesWith(itemId).map((recipe) => {
    const other = recipe.items.find((id) => id !== itemId) || itemId;
    const owned = own.has(other);
    return { recipe, other, owned, completes: owned && !own.has(itemId) };
  });
}

// Quellen + Stat-Beiträge + Regeln der aktiven Rezepte. strength: tagStrength(); double: setBonusDouble wirkt NICHT
// (Rezepte sind keine Set-Boni)
export function buildRecipeParts(recipes, strength = {}) {
  const sources = [];
  const statRecipes = [];
  const rules = {};
  for (const r of recipes) {
    const scale = strengthFactor(recipeTags(r), strength);
    if (r.stats) statRecipes.push({ id: `recipe_${r.id}`, stats: r.stats, scale });
    mergeRules(rules, r.rules);
    if (!r.triggers || !r.triggers.length) continue;
    sources.push({
      uid: `recipe:${r.id}`, id: `recipe_${r.id}`, kind: 'recipe', name: r.name, icon: r.icon,
      tier: 1, scale, triggers: r.triggers, rules: r.rules || {},
    });
  }
  return { sources, statRecipes, rules };
}
