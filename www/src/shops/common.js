// Gemeinsame Helfer der Sonderknoten (Händler, Werkbank, Schwarzmarkt, Tankstelle, Ereignis, Schatz).
// Reine Logik ohne three.js und DOM. Der Zustand eines offenen Knotens liegt in run.current.shop (reines JSON →
// wird mit dem Run gespeichert; nach einem App-Neustart geht es mitten im Shop weiter).
import { SHOP } from '../data/balance.js';
import { itemById } from '../data/items.js';
import { makeRng, hashSeed } from '../core/rng.js';
import { runStats } from '../run/runState.js';
import { entryParts } from '../items/inventory.js';

const actKey = (act) => Math.max(1, Math.min(3, act | 0));

// Akt-Faktor der Preise
export const actMul = (act) => SHOP.actMul[actKey(act)] || 1;

// Grundpreis eines Items (Seltenheit × Akt-Faktor), ohne Rabatt
export function basePrice(itemId, act) {
  const def = itemById(itemId);
  if (!def) return 0;
  return Math.round((SHOP.price[def.rarity] ?? SHOP.price.common) * actMul(act));
}

// Händlerpreis: Grundpreis × (1 − Stat shopDiscount) (Einkaufswagen, Items), mind. 1
export function itemPrice(run, itemId) {
  const disc = runStats(run).shopDiscount || 0;
  return Math.max(1, Math.round(basePrice(itemId, run.act) * (1 - disc)));
}

// Preis einer Fähigkeit beim Händler
export function abilityPrice(run) {
  const disc = runStats(run).shopDiscount || 0;
  return Math.max(1, Math.round(SHOP.abilityPrice * actMul(run.act) * (1 - disc)));
}

// Zufall eines Sonderknotens: deterministisch aus Run-Seed, Akt, Knoten und Zweck (Neustart = gleiche Angebote)
export function shopRng(run, label) {
  const node = run.current ? run.current.node : 'kein-knoten';
  return makeRng(hashSeed(`${run.seed}:${run.act}:${node}:${label}`));
}

// Item-IDs im Inventar (Hybride: beide)
export const ownedIds = (run) => run.inventory.flatMap((e) => entryParts(e).map((p) => p.def.id));

// Zustand des offenen Sonderknotens; init() legt ihn beim ersten Öffnen an. Ergebnis: Zustand oder null
export function shopState(run, type, init) {
  const cur = run.current;
  if (!cur || cur.type !== type) return null;
  if (!cur.shop || cur.shop.type !== type) {
    cur.shop = { type, ...init() };
  }
  return cur.shop;
}
