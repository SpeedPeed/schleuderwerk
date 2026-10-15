// Belohnungen im Run (reine Logik). Alle Zahlen: data/balance.js → REWARDS, ITEMS.
//  - stageRewards: Schrauben + Meta-Schrott + Blaupausen einer Etappe (nach Akt, Medaille, Knotenart)
//  - placeholderReward: kleiner Bonus der Platzhalter-Knoten bis Phase 5
//  - runPayout: Meta-Auszahlung am Run-Ende (gesammelter Schrott, Schrauben-Rest → Schrott, Blaupausen, Kerne)
//  - itemPool / rarityWeights / rollItemChoices: Item-Auswahl nach einer Etappe (Etappe/Elite/Boss/Item-Kiste)
import { REWARDS, ITEMS as BAL } from '../data/balance.js';
import { ITEMS } from '../data/items.js';

const actKey = (act) => Math.max(1, Math.min(3, act | 0));

// result: Etappen-Ergebnis (stage.finish). kind: 'stage' | 'elite' | 'boss'.
// Ergebnis: { bolts, scrap, blueprints, base: { bolts, scrap, blueprints } } – inkl. der in der Etappe gesammelten.
export function stageRewards(act, kind, result) {
  const a = actKey(act);
  const base = { bolts: 0, scrap: 0, blueprints: 0 };
  if (result.cleared && result.medal) {
    const mm = REWARDS.medalMul[result.medal] || 1;
    const km = REWARDS.kindMul[kind] || 1;
    const gold = kind === 'boss' && result.medal === 'gold' ? 1 + REWARDS.bossGoldBonus : 1;
    // Boss: Bronze zählt voll, Gold gibt den Bonus (Medaillen-Faktor gilt dort nicht)
    const mul = kind === 'boss' ? km * gold : km * mm;
    base.bolts = Math.round(REWARDS.bolts[a] * mul);
    base.scrap = Math.round(REWARDS.scrap[a] * mul);
    if (kind === 'elite') base.blueprints = REWARDS.blueprints.elite;
    if (kind === 'boss') base.blueprints = REWARDS.blueprints.boss[a] || 0;
  }
  return {
    bolts: base.bolts + Math.max(0, Math.floor(result.bolts || 0)),
    scrap: base.scrap + Math.max(0, Math.round(result.scrap || 0)),
    blueprints: base.blueprints + Math.max(0, result.blueprints || 0),
    base,
  };
}

// Platzhalter-Knoten (Händler, Werkbank, Schwarzmarkt, Ereignis, Schatz) bis Phase 5
export function placeholderReward(type) {
  return { bolts: REWARDS.placeholderBolts[type] || 0 };
}

// Meta-Auszahlung am Run-Ende. run.earned: { scrap, blueprints, cores } (während des Runs gesammelt).
// Ergebnis: { scrap, blueprints, cores, rows: [{ label, scrap?, blueprints?, cores? }] }
export function runPayout(run) {
  const e = run.earned || { scrap: 0, blueprints: 0, cores: 0 };
  const rows = [];
  rows.push({ label: 'Etappen & Pickups', scrap: Math.round(e.scrap - (e.actScrap || 0)) });
  if (e.actScrap) rows.push({ label: 'Akte abgeschlossen', scrap: e.actScrap });
  const boltScrap = Math.floor(Math.max(0, run.bolts) * REWARDS.boltsToScrap);
  if (boltScrap > 0) rows.push({ label: `Schrauben-Rest (${Math.floor(run.bolts)} 🔩 × ${Math.round(REWARDS.boltsToScrap * 100)} %)`, scrap: boltScrap });
  if (e.blueprints) rows.push({ label: 'Blaupausen', blueprints: e.blueprints });
  if (e.cores) rows.push({ label: 'Kerne', cores: e.cores });
  return {
    scrap: Math.round(e.scrap) + boltScrap,
    blueprints: e.blueprints || 0,
    cores: e.cores || 0,
    rows,
  };
}

// ---------- Item-Auswahl ----------

// Items im Zufallspool: pool 'base' + Items, deren Pool-Forschung erledigt ist (research: Liste der Forschungs-IDs).
// all: Dev-Menü „alle Items in den Pool“. Verfluchte Items kommen nie in die Auswahl (Schwarzmarkt/Schatz, Phase 5).
export function itemPool(research = [], all = false) {
  const done = new Set(research || []);
  return ITEMS.filter((it) => it.rarity !== 'cursed' && (all || it.pool === 'base' || done.has(it.pool)));
}

// Gewichte je Seltenheit für Kontext ('stage' | 'elite' | 'boss' | 'crate') und Akt (balance.ITEMS.rarityWeights/-ActMul)
export function rarityWeights(context = 'stage', act = 1) {
  const base = BAL.rarityWeights[context] || BAL.rarityWeights.stage;
  const mul = BAL.rarityActMul[act] || {};
  const out = {};
  for (const [r, w] of Object.entries(base)) if (w > 0) out[r] = w * (mul[r] ?? 1);
  return out;
}

// Auswahl würfeln: count verschiedene Items aus dem Pool. owned: Item-IDs im Inventar (Gewicht ITEMS.ownedWeight).
// Je Platz wird zuerst die Seltenheit nach Gewicht gezogen (nur Seltenheiten mit noch verfügbaren Items),
// danach ein Item dieser Seltenheit gleichverteilt. Ergebnis: Liste von Item-IDs (kann kürzer sein, wenn der Pool leer ist).
export function rollItemChoices({ rng, context = 'stage', act = 1, count = 3, research = [], all = false, owned = [] }) {
  const ownedSet = new Set(owned);
  let pool = itemPool(research, all).filter((it) => !ownedSet.has(it.id) || BAL.ownedWeight > 0);
  const weights = rarityWeights(context, act);
  const out = [];
  for (let k = 0; k < count && pool.length; k++) {
    // Seltenheiten des Kontexts mit verfügbaren Items; sonst alle verbleibenden Items (Rückfall)
    const avail = {};
    for (const [r, w] of Object.entries(weights)) if (pool.some((it) => it.rarity === r)) avail[r] = w;
    let cand;
    if (Object.keys(avail).length) {
      const r = rng.weighted(avail);
      cand = pool.filter((it) => it.rarity === r);
    } else cand = pool;
    // gleichverteilt, bereits besessene mit ownedWeight
    const wts = cand.map((it) => (ownedSet.has(it.id) ? BAL.ownedWeight : 1));
    const sum = wts.reduce((a, b) => a + b, 0);
    let u = rng.next() * sum;
    let pick = cand[cand.length - 1];
    for (let i = 0; i < cand.length; i++) { u -= wts[i]; if (u <= 0) { pick = cand[i]; break; } }
    out.push(pick.id);
    pool = pool.filter((it) => it !== pick);
  }
  return out;
}

// Schrauben für „Überspringen“ (bzw. Ablehnen bei vollem Rucksack)
export const itemSkipBolts = (act) => REWARDS.itemSkipBolts[Math.max(1, Math.min(3, act | 0))] || 0;
