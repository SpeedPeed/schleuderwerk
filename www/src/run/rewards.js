// Belohnungen im Run (reine Logik). Alle Zahlen: data/balance.js → REWARDS, ITEMS.
//  - stageRewards: Schrauben + Meta-Schrott + Blaupausen einer Etappe (nach Akt, Medaille, Knotenart)
//  - runPayout: Meta-Auszahlung am Run-Ende (gesammelter Schrott, Schrauben-Rest → Schrott, Forschungs-Bonus
//    Feinschliff I auf allen Schrott, Blaupausen, Kerne)
//  - itemPool / rarityWeights / rollItemChoices: Item-Auswahl nach einer Etappe (Etappe/Elite/Boss/Item-Kiste)
import { REWARDS, ITEMS as BAL } from '../data/balance.js';
import { ITEMS } from '../data/items.js';
import { ascensionScrapBonus } from '../garage/progression.js';

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

// Meta-Auszahlung am Run-Ende. run.earned: { scrap, blueprints, cores } (während des Runs gesammelt).
// Ergebnis: { scrap, blueprints, cores, rows: [{ label, scrap?, blueprints?, cores? }] }
export function runPayout(run) {
  const e = run.earned || { scrap: 0, blueprints: 0, cores: 0 };
  const rows = [];
  rows.push({ label: 'Etappen & Pickups', scrap: Math.round(e.scrap - (e.actScrap || 0)) });
  if (e.actScrap) rows.push({ label: 'Akte abgeschlossen', scrap: e.actScrap });
  const boltScrap = Math.floor(Math.max(0, run.bolts) * REWARDS.boltsToScrap);
  if (boltScrap > 0) rows.push({ label: `Schrauben-Rest (${Math.floor(run.bolts)} 🔩 × ${Math.round(REWARDS.boltsToScrap * 100)} %)`, scrap: boltScrap });
  // Forschung (Feinschliff I, Perk scrapGain): + Anteil auf allen Schrott des Runs
  const gain = (run.perks && run.perks.scrapGain) || 0;
  const perkScrap = gain > 0 ? Math.round((Math.round(e.scrap) + boltScrap) * gain) : 0;
  if (perkScrap > 0) rows.push({ label: `Feinschliff (+${Math.round(gain * 100)} % Schrott)`, scrap: perkScrap });
  // Schrottstufe: +10 % Schrott je Stufe auf allen Schrott des Runs (wie Feinschliff)
  const asc = ascensionScrapBonus(run.ascension || 0);
  const ascScrap = asc > 0 ? Math.round((Math.round(e.scrap) + boltScrap) * asc) : 0;
  if (ascScrap > 0) rows.push({ label: `Schrottstufe ${run.ascension} (+${Math.round(asc * 100)} % Schrott)`, scrap: ascScrap });
  if (e.blueprints) rows.push({ label: 'Blaupausen', blueprints: e.blueprints });
  const ascCores = e.ascCores || 0;
  if (e.cores - ascCores > 0) rows.push({ label: 'Kerne', cores: e.cores - ascCores });
  if (ascCores) rows.push({ label: `Erster Sieg auf Schrottstufe ${run.ascension}`, cores: ascCores });
  return {
    scrap: Math.round(e.scrap) + boltScrap + perkScrap + ascScrap,
    blueprints: e.blueprints || 0,
    cores: e.cores || 0,
    rows,
  };
}

// ---------- Item-Auswahl ----------

// Items im Zufallspool: pool 'base' + Items, deren Pool-Forschung erledigt ist (research: Liste der Forschungs-IDs).
// all: Dev-Menü „alle Items in den Pool“. Verfluchte Items kommen nie in die Auswahl (Schwarzmarkt, Ereignisse, Schatz-Haken: cursedItemPool).
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

// Auswahl würfeln: count verschiedene Items aus dem Pool. owned: Item-IDs im Inventar (Gewicht ownedWeight,
// Standard ITEMS.ownedWeight = 0 → erscheinen nicht). Je Platz wird zuerst die Seltenheit nach Gewicht gezogen (nur
// Seltenheiten mit noch verfügbaren Items), danach ein Item dieser Seltenheit gleichverteilt.
// Phase 5 (Händler, Ereignisse, Schatz): weights ersetzt die Seltenheits-Gewichte des Kontexts, filter(item) grenzt den
// Pool ein (z. B. Tag), pool ersetzt den Pool ganz. Ergebnis: Liste von Item-IDs (kürzer, wenn der Pool leer ist).
export function rollItemChoices({ rng, context = 'stage', act = 1, count = 3, research = [], all = false, owned = [], weights = null, ownedWeight = BAL.ownedWeight, filter = null, pool = null }) {
  const ownedSet = new Set(owned);
  let list = (pool || itemPool(research, all)).filter((it) => (!ownedSet.has(it.id) || ownedWeight > 0) && (!filter || filter(it)));
  const w = weights || rarityWeights(context, act);
  const out = [];
  for (let k = 0; k < count && list.length; k++) {
    // Seltenheiten des Kontexts mit verfügbaren Items; sonst alle verbleibenden Items (Rückfall)
    const avail = {};
    for (const [r, wr] of Object.entries(w)) if (wr > 0 && list.some((it) => it.rarity === r)) avail[r] = wr;
    let cand;
    if (Object.keys(avail).length) {
      const r = rng.weighted(avail);
      cand = list.filter((it) => it.rarity === r);
    } else cand = list;
    // gleichverteilt, bereits besessene mit ownedWeight
    const wts = cand.map((it) => (ownedSet.has(it.id) ? ownedWeight : 1));
    const sum = wts.reduce((a, b) => a + b, 0);
    let u = rng.next() * sum;
    let pick = cand[cand.length - 1];
    for (let i = 0; i < cand.length; i++) { u -= wts[i]; if (u <= 0) { pick = cand[i]; break; } }
    out.push(pick.id);
    list = list.filter((it) => it !== pick);
  }
  return out;
}

// Schrauben für „Überspringen“ (bzw. Ablehnen bei vollem Rucksack)
export const itemSkipBolts = (act) => REWARDS.itemSkipBolts[Math.max(1, Math.min(3, act | 0))] || 0;
