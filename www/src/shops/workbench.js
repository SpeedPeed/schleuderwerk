// 🔧 Werkbank (V2-DESIGN.md §4, nur mit Forschung r_node_workbench): 2 gleiche Items mit gleicher ★ → ★+1 (max. ★3),
// 2 Items mit verschiedenen Tags → Hybrid (beide Tags, beide Effekte × WORKBENCH.hybridMul, ein Slot wird frei, Name aus
// beiden Namen), Zerlegen → Schrauben (WORKBENCH.scrapPct des Händler-Grundpreises je ★-Wert). Je Besuch
// WORKBENCH.fusionsPerVisit Fusion(en), Zerlegen unbegrenzt. Nutzt die reinen Funktionen fuseSame/makeHybrid
// (items/inventory.js). Reine Logik ohne three.js und DOM.
//
// Zustand (run.current.shop): { type: 'workbench', fusions }
import { WORKBENCH } from '../data/balance.js';
import { fuseSame, makeHybrid, entryParts, isHybrid, isValidEntry, MAX_TIER } from '../items/inventory.js';
import { durabilityMax, updateCodexSets, boltIncome } from '../run/runState.js';
import { basePrice, shopState } from './common.js';

export function openWorkbench(run) {
  return shopState(run, 'workbench', () => ({ fusions: 0 }));
}

export const fusionsLeft = (run) => {
  const st = openWorkbench(run);
  return st ? Math.max(0, WORKBENCH.fusionsPerVisit - st.fusions) : 0;
};

// Schrauben fürs Zerlegen: Summe der Teile, je Teil Grundpreis × 2^(★−1) (★2 = zwei Items, ★3 = vier) × scrapPct
export function scrapValue(run, entry) {
  let sum = 0;
  for (const { def, tier } of entryParts(entry)) sum += basePrice(def.id, run.act) * Math.pow(2, Math.max(0, (tier || 1) - 1));
  return Math.max(1, boltIncome(run, Math.round(sum * WORKBENCH.scrapPct)));   // Schrottstufe 13: × boltMul
}

// Was geht mit Platz a und b? { kind: 'tier'|'hybrid'|null, reason?, entry? (Vorschau) }
export function fusionPreview(run, a, b) {
  const ea = run.inventory[a], eb = run.inventory[b];
  if (a === b || !isValidEntry(ea) || !isValidEntry(eb)) return { kind: null, reason: 'slot' };
  if (ea.itemId === eb.itemId && !isHybrid(ea) && !isHybrid(eb)) {
    if ((ea.tier || 1) !== (eb.tier || 1)) return { kind: null, reason: 'tier' };
    const f = fuseSame(ea, eb);
    return f.ok ? { kind: 'tier', entry: f.entry } : { kind: null, reason: f.reason };
  }
  const h = makeHybrid(ea, eb);
  return h.ok ? { kind: 'hybrid', entry: h.entry } : { kind: null, reason: h.reason };
}

// Alle möglichen Fusionen (für die Anzeige): [{ a, b, kind, entry }] – Hybride in beiden Reihenfolgen nur einmal
export function fusionOptions(run) {
  const out = [];
  const inv = run.inventory;
  for (let a = 0; a < inv.length; a++) {
    for (let b = a + 1; b < inv.length; b++) {
      const p = fusionPreview(run, a, b);
      if (p.kind) out.push({ a, b, kind: p.kind, entry: p.entry });
    }
  }
  return out;
}

// Ergebnis an Platz a, Platz b wird frei
function combine(run, save, a, b, entry) {
  run.inventory[a] = entry;
  run.inventory.splice(b, 1);
  updateCodexSets(run, save);
  run.durability = Math.min(run.durability, durabilityMax(run));
}

// ★-Fusion zweier gleicher Items (gleiche ★). Ergebnis: { ok, reason?: 'used'|'slot'|'tier'|'maxed'|…, entry }
export function fuseItems(run, save, a, b) {
  if (!openWorkbench(run)) return { ok: false, reason: 'noShop' };
  if (fusionsLeft(run) <= 0) return { ok: false, reason: 'used' };
  const p = fusionPreview(run, a, b);
  if (p.kind !== 'tier') return { ok: false, reason: p.reason || 'different' };
  const ea = run.inventory[a], eb = run.inventory[b];
  const entry = { ...p.entry };
  if (ea.cleansed && eb.cleansed) entry.cleansed = true;
  combine(run, save, Math.min(a, b), Math.max(a, b), entry);
  run.current.shop.fusions++;
  return { ok: true, entry, tier: entry.tier };
}

// Hybrid aus a (erstes Item) und b. Ergebnis: { ok, reason?, entry }
export function hybridize(run, save, a, b) {
  if (!openWorkbench(run)) return { ok: false, reason: 'noShop' };
  if (fusionsLeft(run) <= 0) return { ok: false, reason: 'used' };
  const ea = run.inventory[a], eb = run.inventory[b];
  if (a === b || !isValidEntry(ea) || !isValidEntry(eb)) return { ok: false, reason: 'slot' };
  const h = makeHybrid(ea, eb);
  if (!h.ok) return h;
  // Flüche bleiben entfernt, wenn beide Teile „sauber“ sind (makeHybrid); sonst gilt cleansed nicht für den Hybrid
  combine(run, save, Math.min(a, b), Math.max(a, b), h.entry);
  run.current.shop.fusions++;
  return { ok: true, entry: h.entry };
}

// Zerlegen → Schrauben. Ergebnis: { ok, bolts, entry }
export function scrapItem(run, slot) {
  if (!openWorkbench(run)) return { ok: false, reason: 'noShop' };
  const e = run.inventory[slot];
  if (!e) return { ok: false, reason: 'slot' };
  const bolts = scrapValue(run, e);
  run.inventory.splice(slot, 1);
  run.bolts += bolts;
  run.stats.boltsEarned += bolts;
  run.durability = Math.min(run.durability, durabilityMax(run));
  return { ok: true, bolts, entry: e };
}

export { MAX_TIER };
