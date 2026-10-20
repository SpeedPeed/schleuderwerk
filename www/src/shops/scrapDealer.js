// 🛒 Schrotthändler (V2-DESIGN.md §4): 5 Items (Seltenheit nach Akt) + 1 Fähigkeit (ersetzt einen Fähigkeits-Slot für
// den Run). Preise: Seltenheit × Akt-Faktor × (1 − Stat shopDiscount). Neu würfeln: 10 + 10 je Reroll
// × (1 − Stat rerollDiscount). Reservieren: ein Angebot wartet beim nächsten Händler des Runs zum gleichen Preis
// (Plätze: SHOP.reserveSlots + Forschung reserveSlots). Zahlen: balance.SHOP. Reine Logik ohne three.js und DOM.
//
// Zustand (run.current.shop): { type: 'dealer', rerolls, offers: [{ itemId, price, sold, fromReserve?, reservedNext? }],
//   ability: { id, price, sold } | null }
// Reservierungen für den NÄCHSTEN Händler stehen in run.reserve ([{ itemId, price }]); beim Öffnen eines Händlers
// wandern sie als Angebote „reserviert“ in dessen Auslage (run.reserve wird dabei geleert).
import { SHOP } from '../data/balance.js';
import { ABILITIES, abilityById, isSlotAbility } from '../data/index.js';
import { rollItemChoices } from '../run/rewards.js';
import { runStats, giveItem, itemSlots, runChoiceBias } from '../run/runState.js';
import { itemPrice, abilityPrice, shopRng, ownedIds, shopState, priceMul } from './common.js';

const actKey = (act) => Math.max(1, Math.min(3, act | 0));

// Neue Auslage würfeln (Items + Fähigkeit) – ohne die aus einer Reservierung stammenden Angebote
function rollStock(run, rerolls) {
  const rng = shopRng(run, `haendler:${rerolls}`);
  const ids = rollItemChoices({
    rng, count: SHOP.items, act: run.act, research: run.research || [], all: !!run.poolAll,
    weights: SHOP.rarityWeights[actKey(run.act)], owned: ownedIds(run), ownedWeight: SHOP.ownedWeight,
    bias: runChoiceBias(run),   // Paket C: Tag-Bias auch beim Händler (mind. 1 Angebot der stärksten Tags)
  });
  const offers = ids.map((itemId) => ({ itemId, price: itemPrice(run, itemId), sold: false }));
  const abil = ABILITIES.filter((a) => isSlotAbility(a) && !run.abilities.includes(a.id));
  const ability = SHOP.abilities > 0 && abil.length ? { id: rng.fork('faehigkeit').pick(abil).id, price: abilityPrice(run), sold: false } : null;
  return { offers, ability };
}

// Händler öffnen (bzw. offenen Zustand holen). Beim ersten Öffnen: Reservierungen einlösen, Auslage würfeln.
export function openDealer(run) {
  return shopState(run, 'dealer', () => {
    const reserved = (run.reserve || []).map((r) => ({ itemId: r.itemId, price: r.price, sold: false, fromReserve: true }));
    run.reserve = [];
    const stock = rollStock(run, 0);
    return { rerolls: 0, offers: [...reserved, ...stock.offers], ability: stock.ability };
  });
}

export const reserveSlots = (run) => SHOP.reserveSlots + Math.max(0, Math.round((run.perks && run.perks.reserveSlots) || 0));

// Preis des nächsten Rerolls
export function rerollCost(run, st = run.current && run.current.shop) {
  const n = st ? st.rerolls : 0;
  const disc = runStats(run).rerollDiscount || 0;
  return Math.max(0, Math.round((SHOP.rerollBase + SHOP.rerollStep * n) * (1 - disc) * priceMul(run)));
}

// Anzeige: { offers: [{ …, canAfford }], ability, rerollCost, reserve: { used, slots, list }, bolts, abilitySlots }
export function dealerView(run) {
  const st = openDealer(run);
  if (!st) return null;
  const bolts = run.bolts;
  return {
    offers: st.offers.map((o, i) => ({ ...o, index: i, canAfford: bolts >= o.price })),
    ability: st.ability ? { ...st.ability, def: abilityById(st.ability.id), canAfford: bolts >= st.ability.price } : null,
    rerollCost: rerollCost(run, st),
    rerolls: st.rerolls,
    reserve: { used: run.reserve.length, slots: reserveSlots(run), list: [...run.reserve] },
    bolts,
    abilitySlots: Math.max(1, Math.round(runStats(run).abilitySlots)),
    itemSlots: itemSlots(run),
  };
}

// Item kaufen. replace: Inventar-Platz bei vollem Rucksack. Ergebnis: { ok, reason?: 'index'|'sold'|'reserved'|'bolts'|'full', itemId, price, events }
export function buyOffer(run, save, index, replace = null) {
  const st = openDealer(run);
  if (!st) return { ok: false, reason: 'noShop' };
  const o = st.offers[index];
  if (!o) return { ok: false, reason: 'index' };
  if (o.sold) return { ok: false, reason: 'sold' };
  if (o.reservedNext) return { ok: false, reason: 'reserved' };
  if (run.bolts < o.price) return { ok: false, reason: 'bolts', price: o.price };
  const res = giveItem(run, save, o.itemId, { replace });
  if (!res.ok) return { ...res, itemId: o.itemId };
  run.bolts -= o.price;
  o.sold = true;
  return { ...res, ok: true, itemId: o.itemId, price: o.price };
}

// Fähigkeit kaufen: ersetzt Slot `slot` für den Rest des Runs. Ergebnis: { ok, reason?, id, replaced }
export function buyAbility(run, slot) {
  const st = openDealer(run);
  if (!st || !st.ability) return { ok: false, reason: 'none' };
  const a = st.ability;
  if (a.sold) return { ok: false, reason: 'sold' };
  const slots = Math.max(1, Math.round(runStats(run).abilitySlots));
  if (!(slot >= 0 && slot < slots)) return { ok: false, reason: 'slot' };
  if (run.bolts < a.price) return { ok: false, reason: 'bolts', price: a.price };
  while (run.abilities.length < slots) run.abilities.push(null);
  const replaced = run.abilities[slot] || null;
  run.abilities[slot] = a.id;
  run.bolts -= a.price;
  a.sold = true;
  return { ok: true, id: a.id, replaced, price: a.price };
}

// Neu würfeln (Items + Fähigkeit; Angebote aus Reservierungen bleiben). Ergebnis: { ok, reason?, cost }
export function reroll(run) {
  const st = openDealer(run);
  if (!st) return { ok: false, reason: 'noShop' };
  const cost = rerollCost(run, st);
  if (run.bolts < cost) return { ok: false, reason: 'bolts', cost };
  run.bolts -= cost;
  st.rerolls++;
  const stock = rollStock(run, st.rerolls);
  st.offers = [...st.offers.filter((o) => o.fromReserve), ...stock.offers];
  st.ability = stock.ability;
  return { ok: true, cost };
}

// Angebot für den nächsten Händler reservieren (Preis bleibt) bzw. Reservierung lösen. Ergebnis: { ok, reason?, reserved }
export function toggleReserve(run, index) {
  const st = openDealer(run);
  if (!st) return { ok: false, reason: 'noShop' };
  const o = st.offers[index];
  if (!o || o.sold) return { ok: false, reason: 'index' };
  if (o.fromReserve) return { ok: false, reason: 'fromReserve' };   // schon eingelöste Reservierung: hier kaufen oder verfallen
  if (o.reservedNext) {
    const k = run.reserve.findIndex((r) => r.itemId === o.itemId && r.price === o.price);
    if (k >= 0) run.reserve.splice(k, 1);
    o.reservedNext = false;
    return { ok: true, reserved: false };
  }
  if (run.reserve.length >= reserveSlots(run)) return { ok: false, reason: 'full' };
  run.reserve.push({ itemId: o.itemId, price: o.price });
  o.reservedNext = true;
  return { ok: true, reserved: true };
}
