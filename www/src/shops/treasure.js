// 💰 Schatzhaufen (V2-DESIGN.md §4): ein Gratis-Item. In TREASURE.suspiciousChance der Fälle ist der Haufen
// „verdächtig“ (Hinweis sichtbar, dafür besser bestückt) und hat einen Haken: Schaden (Anteil der max. Haltbarkeit),
// ein verfluchtes Item dazu oder Schrauben weg. Wahl: „Nehmen“ oder „Liegen lassen“. Zahlen: balance.TREASURE.
// Reine Logik ohne three.js und DOM.
//
// Zustand (run.current.shop): { type: 'treasure', itemId, suspicious, hook: 'damage'|'curse'|'bolts'|null, hint,
//   result: null | { taken, log: [{ icon, text, good }] } }
import { TREASURE } from '../data/balance.js';
import { itemById } from '../data/items.js';
import { rollItemChoices, rarityWeights } from '../run/rewards.js';
import { giveOrOffer, damageRun, leaveNode } from '../run/runState.js';
import { entryName } from '../items/inventory.js';
import { addCurse } from './textEvent.js';
import { shopRng, ownedIds, shopState } from './common.js';

// Hinweise auf den Haken (sichtbar, verraten aber nicht genau, was passiert)
export const HOOK_HINTS = {
  damage: 'Unter dem Haufen knarzt eine gespannte Sprungfeder …',
  curse: 'Irgendetwas darin kichert leise.',
  bolts: 'Daneben sitzt eine Elster und beobachtet deine Schraubendose.',
};

export function openTreasure(run) {
  return shopState(run, 'treasure', () => {
    const rng = shopRng(run, 'schatz');
    const suspicious = rng.chance(TREASURE.suspiciousChance);
    const ids = rollItemChoices({
      rng: rng.fork('item'), count: 1, act: run.act, research: run.research || [], all: !!run.poolAll,
      weights: rarityWeights(suspicious ? TREASURE.suspiciousContext : TREASURE.context, run.act), owned: ownedIds(run), ownedWeight: 0,
    });
    const hook = suspicious ? rng.fork('haken').weighted(Object.fromEntries(Object.entries(TREASURE.hooks).map(([k, v]) => [k, v.weight]))) : null;
    return { itemId: ids[0] || null, suspicious, hook, hint: hook ? HOOK_HINTS[hook] : '', result: null };
  });
}

// Nehmen: Item ins Inventar (voller Rucksack → Auswahl mit Ersetzen), bei verdächtigem Haufen den Haken auslösen.
// Ergebnis: { ok, result }
export function takeTreasure(run, save) {
  const st = openTreasure(run);
  if (!st) return { ok: false, reason: 'noShop' };
  if (st.result) return { ok: false, reason: 'done' };
  const log = [];
  const rng = shopRng(run, 'schatz:nehmen');
  if (st.itemId) {
    const res = giveOrOffer(run, save, st.itemId, 'treasure');
    const d = itemById(st.itemId);
    log.push({ icon: d.icon, text: res.queued ? `${d.name} – Rucksack voll: gleich ersetzen oder ablehnen` : `Gefunden: ${d.name}`, good: true });
  }
  if (st.hook === 'damage') {
    const dmg = damageRun(run, TREASURE.hooks.damage.pct, 1);
    log.push({ icon: '🔧', text: `Die Feder schnellt hoch: −${Math.round(dmg * 10) / 10} Haltbarkeit`, good: false });
  } else if (st.hook === 'curse') {
    const r = addCurse(run, save, rng);
    if (r) log.push({ icon: '☠', text: `Ein Fluch kommt mit: ${itemById(r.itemId).name}${r.replaced ? ` (verdrängt ${entryName(r.replaced)})` : ''}`, good: false });
  } else if (st.hook === 'bolts') {
    const h = TREASURE.hooks.bolts;
    const lost = Math.min(run.bolts, Math.max(h.min, Math.round(run.bolts * h.pct)));
    run.bolts -= lost;
    log.push({ icon: '🔩', text: `Die Elster klaut ${lost} Schrauben`, good: false });
  }
  st.result = { taken: true, log };
  return { ok: true, result: st.result };
}

// Liegen lassen (Knoten gilt als besucht)
export function leaveTreasure(run) {
  const st = openTreasure(run);
  if (st && !st.result) st.result = { taken: false, log: [] };
  return leaveNode(run);
}
