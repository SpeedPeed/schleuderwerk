// 🕳 Schwarzmarkt (V2-DESIGN.md §4, nur mit Forschung r_node_blackmarket): 3 verfluchte Items (Fluch-Pool:
// data/index.js → cursedItemPool), bezahlt wahlweise mit −15 % max. Haltbarkeit, −15 max. Treibstoff (beides für den
// Run) oder 1 Kern (💠 aus dem Spielstand). Dazu „Fluch entfernen“ gegen Schrauben: das Item behält seine Stärken,
// Fluch-Stats/-Regeln/-Auslöser entfallen (entry.cleansed). Zahlen: balance.BLACKMARKET. Reine Logik ohne three.js/DOM.
//
// Zustand (run.current.shop): { type: 'blackmarket', offers: [{ itemId, sold }] }
import { BLACKMARKET } from '../data/balance.js';
import { cursedItemPool } from '../data/index.js';
import { rollItemChoices } from '../run/rewards.js';
import { durabilityMax, runStats, giveItem, addMaxDurability, addMaxFuel } from '../run/runState.js';
import { isCursedEntry } from '../items/inventory.js';
import { actMul, shopRng, ownedIds, shopState, priceMul } from './common.js';

export function openBlackMarket(run) {
  return shopState(run, 'blackmarket', () => {
    const ids = rollItemChoices({
      rng: shopRng(run, 'schwarzmarkt'), count: BLACKMARKET.items, weights: { cursed: 1 },
      pool: cursedItemPool(run.research || [], !!run.poolAll), owned: ownedIds(run), ownedWeight: 0,
    });
    return { offers: ids.map((itemId) => ({ itemId, sold: false })) };
  });
}

// Bezahlarten: [{ id: 'durability'|'fuel'|'cores', icon, label, amount, can }]
export function payOptions(run, save) {
  const maxDur = durabilityMax(run);
  const dur = Math.round(maxDur * BLACKMARKET.payDurabilityPct * 10) / 10;
  const fuelMax = runStats(run).fuelMax;
  const cores = save && save.meta ? save.meta.cores : 0;
  return [
    { id: 'durability', icon: '🔧', label: `−${Math.round(BLACKMARKET.payDurabilityPct * 100)} % max. Haltbarkeit`, amount: dur, can: maxDur - dur >= BLACKMARKET.minDurabilityLeft },
    { id: 'fuel', icon: '⛽', label: `−${BLACKMARKET.payFuelMax} max. Treibstoff`, amount: BLACKMARKET.payFuelMax, can: fuelMax - BLACKMARKET.payFuelMax >= BLACKMARKET.minFuelLeft },
    { id: 'cores', icon: '💠', label: `${BLACKMARKET.payCores} Kern`, amount: BLACKMARKET.payCores, can: cores >= BLACKMARKET.payCores },
  ];
}

// Verfluchtes Item kaufen. pay: 'durability'|'fuel'|'cores', replace: Platz bei vollem Rucksack.
// Ergebnis: { ok, reason?: 'index'|'sold'|'pay'|'full'|…, itemId, pay, amount }
export function buyCursed(run, save, index, pay, replace = null) {
  const st = openBlackMarket(run);
  if (!st) return { ok: false, reason: 'noShop' };
  const o = st.offers[index];
  if (!o) return { ok: false, reason: 'index' };
  if (o.sold) return { ok: false, reason: 'sold' };
  const opt = payOptions(run, save).find((p) => p.id === pay);
  if (!opt || !opt.can) return { ok: false, reason: 'pay' };
  const res = giveItem(run, save, o.itemId, { replace });
  if (!res.ok) return { ...res, itemId: o.itemId };
  if (pay === 'durability') addMaxDurability(run, -opt.amount);
  else if (pay === 'fuel') addMaxFuel(run, -opt.amount);
  else save.meta.cores -= opt.amount;
  o.sold = true;
  return { ...res, ok: true, itemId: o.itemId, pay, amount: opt.amount };
}

// Preis fürs Fluch-Entfernen (Schrauben × Akt-Faktor)
export const removeCurseCost = (run) => Math.round(BLACKMARKET.removeCurseBolts * actMul(run.act) * priceMul(run));

// Plätze mit (noch) wirksamem Fluch
export const cursedSlots = (run) => run.inventory.map((e, i) => (isCursedEntry(e) ? i : -1)).filter((i) => i >= 0);

// Fluch eines Items entfernen. Ergebnis: { ok, reason?: 'slot'|'notCursed'|'bolts', cost }
export function removeCurse(run, slot) {
  if (!openBlackMarket(run)) return { ok: false, reason: 'noShop' };
  const e = run.inventory[slot];
  if (!e) return { ok: false, reason: 'slot' };
  if (!isCursedEntry(e)) return { ok: false, reason: 'notCursed' };
  const cost = removeCurseCost(run);
  if (run.bolts < cost) return { ok: false, reason: 'bolts', cost };
  run.bolts -= cost;
  e.cleansed = true;
  run.durability = Math.min(run.durability, durabilityMax(run));
  return { ok: true, cost };
}
