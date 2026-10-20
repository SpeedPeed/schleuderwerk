// Belohnungen im Run (reine Logik). Alle Zahlen: data/balance.js → REWARDS, KOMBO, RUN.emergency, ITEMS.
//  - stageRewards: Schrauben + Meta-Schrott + Blaupausen einer Etappe (nach Akt, Wertung, Knotenart) – Paket A
//    „Jeder Versuch zahlt“: Schrott = scrapPerM[Akt] × Weite × gradeMul[Wertung] × scrapKindMul[Knotenart], auch verfehlt
//    (Wertung 'miss'); gesicherte Trickpunkte → Schrauben/Schrott (KOMBO.boltsPer/scrapPer). Einzige Stelle der Regel.
//  - runPayout: Meta-Auszahlung des Runs (gesammelter Schrott, Schrauben-Rest → Schrott, Forschungs-Bonus
//    Feinschliff I auf allen Schrott, Blaupausen, Kerne). Paket A: Schrott/Blaupausen/Kerne werden schon während des
//    Runs gutgeschrieben (run/runState.js → settleRun); runPayout liefert die Summe (das Run-Ende zeigt sie nur noch)
//  - itemPool / rarityWeights / rollItemChoices: Item-Auswahl nach einer Etappe (Etappe/Elite/Boss/Item-Kiste)
//  - Paket C: choiceBias (Tag-Bias in Angeboten) und Garantien (Boss: mind. 1 Legendär; mind. 1 Angebot der stärksten
//    Tags) – einzige Stelle der Regeln: rollItemChoices
import { REWARDS, KOMBO, RUN, ITEMS as BAL, SYNERGY } from '../data/balance.js';
import { ITEMS } from '../data/items.js';
import { TAG_IDS } from '../data/tags.js';
import { ascensionScrapBonus } from '../garage/progression.js';
import { gradeFor } from '../physics/trackGen.js';
import { mutatorById } from '../data/mutators.js';

const actKey = (act) => Math.max(1, Math.min(3, act | 0));
const GOLDISH = new Set(['gold', 'platin', 'king']);

// Wertung eines Etappen-Ergebnisses: 'miss' (verfehlt/Totalschaden) | 'bronze' | 'silver' | 'gold' | 'platin' | 'king'
export function resultGrade(result) {
  if (!result || !result.cleared || !result.medal) return 'miss';
  if (result.grade && result.grade !== 'miss') return result.grade;
  return result.medals ? gradeFor(result.dist || 0, result.medals) : result.medal;
}

// Meta-Schrott für die Weite: scrapPerM[Akt] × Weite × gradeMul[Wertung] × scrapKindMul[Knotenart] (gerundet)
export function distanceScrap(act, kind, dist, grade = 'miss') {
  const a = actKey(act);
  const g = REWARDS.gradeMul[grade] ?? REWARDS.gradeMul.miss;
  return Math.max(0, Math.round(REWARDS.scrapPerM[a] * Math.max(0, dist || 0) * g * (REWARDS.scrapKindMul[kind] || 1)));
}

// HUD-Zähler „Schrott dieser Etappe“ während des Flugs: Weite bisher + Wertung bisher (+ Pickups)
export function liveStageScrap(act, kind, dist, medals, pickups = 0) {
  return distanceScrap(act, kind, dist, medals ? gradeFor(dist, medals) : 'miss') + Math.max(0, Math.round(pickups || 0));
}

// Kombo: gesicherte Trickpunkte → Schrauben und Schrott
export const comboRewards = (tricks) => ({
  bolts: Math.floor(Math.max(0, tricks || 0) / KOMBO.boltsPer),
  scrap: Math.floor(Math.max(0, tricks || 0) / KOMBO.scrapPer),
});

// result: Etappen-Ergebnis (stage.finish). kind: 'stage' | 'elite' | 'boss'. roll (0…1): Zufallszahl für die
// Blaupausen-Chance bei Gold oder besser (deterministisch aus dem Run, run/runState.js).
// Ergebnis: { bolts, scrap, blueprints, grade, combo: { bolts, scrap }, base: { bolts, scrap, blueprints } } –
// inkl. der in der Etappe gesammelten Schrauben/Schrott/Blaupausen.
// firstEncounter: erste Begegnung mit diesem Boss im Run (nur dann zahlt ein verlorener Boss eine Blaupause)
export function stageRewards(act, kind, result, { roll = 1, firstEncounter = true } = {}) {
  const a = actKey(act);
  const grade = resultGrade(result);
  // Paket D: Etappen-Arten mit eigener Einheit zahlen Weiten-Schrott nach der „gleichwertigen Weite“
  // (Ziel-Erfüllung × Zielmarke) – ein Zeitrennen endet nach 8 s und soll nicht weniger bringen als ein Weitflug
  const g = result.goal;
  const dist = g && g.medals && g.medals.bronze && g.type !== 'distance' && g.type !== 'delivery' && result.target
    ? Math.max(result.dist || 0, (g.value / g.medals.bronze) * result.target) : result.dist;
  const base = { bolts: 0, scrap: distanceScrap(a, kind, dist, grade), blueprints: 0 };
  const km = REWARDS.kindMul[kind] || 1;
  if (grade !== 'miss') {
    const mm = REWARDS.medalMul[result.medal] || 1;
    const gold = kind === 'boss' && result.medal === 'gold' ? 1 + REWARDS.bossGoldBonus : 1;
    // Boss: Bronze zählt voll, Gold gibt den Bonus (Medaillen-Faktor gilt dort nicht)
    const mul = kind === 'boss' ? km * gold : km * mm;
    base.bolts = Math.round(REWARDS.bolts[a] * mul);
    if (kind === 'elite') base.blueprints = REWARDS.blueprints.elite;
    if (kind === 'boss') base.blueprints = REWARDS.blueprints.boss[a] || 0;
    if (GOLDISH.has(grade) && roll < REWARDS.blueprints.goldChance) base.blueprints += 1;
  } else if (kind === 'boss') {
    // jede Boss-Begegnung zahlt eine Blaupause – auch verloren (Neuversuche gehören zur selben Begegnung)
    base.blueprints = firstEncounter ? REWARDS.blueprints.bossLost : 0;
  } else if (result.reason !== 'wreck') {
    // Notlandung: Teil-Belohnung (Schrauben × RUN.emergency.boltMul)
    base.bolts = Math.round(REWARDS.bolts[a] * km * RUN.emergency.boltMul);
  }
  // Paket D: harte Mutatoren zahlen mehr (rewardMul auf Grund-Schrauben und Weiten-Schrott)
  const mut = mutatorById(result.mutator);
  if (mut && mut.rewardMul) { base.bolts = Math.round(base.bolts * mut.rewardMul); base.scrap = Math.round(base.scrap * mut.rewardMul); }
  const combo = comboRewards(result.tricks);
  return {
    bolts: base.bolts + combo.bolts + Math.max(0, Math.floor(result.bolts || 0)),
    scrap: base.scrap + combo.scrap + Math.max(0, Math.round(result.scrap || 0)),
    blueprints: base.blueprints + Math.max(0, result.blueprints || 0),
    grade,
    combo,
    base,
  };
}

// Meta-Auszahlung des Runs. run.earned: { scrap, blueprints, cores } (während des Runs gesammelt).
// boltRest: Schrauben-Rest → Schrott mitrechnen (erst am Run-Ende; während des Runs zahlt settleRun ohne ihn).
// Ergebnis: { scrap, blueprints, cores, rows: [{ label, scrap?, blueprints?, cores? }] }
export function runPayout(run, { boltRest = true } = {}) {
  const e = run.earned || { scrap: 0, blueprints: 0, cores: 0 };
  const rows = [];
  rows.push({ label: 'Etappen, Pickups & Kombos', scrap: Math.round(e.scrap - (e.actScrap || 0)) });
  if (e.actScrap) rows.push({ label: 'Akte abgeschlossen', scrap: e.actScrap });
  const boltScrap = boltRest ? Math.floor(Math.max(0, run.bolts) * REWARDS.boltsToScrap) : 0;
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

// ---------- Paket C: Tag-Bias ----------
// Bias aus der Tag-Zählung des Rucksacks (items/inventory.js → tagCounts, inkl. Garage-Teilen mit Tag):
// { counts, top: [bis zu SYNERGY.bias.topTags Tags mit Zähler ≥ 1, stärkste zuerst], blueprintTag }
export function choiceBias(counts = {}, blueprintTag = null) {
  const top = TAG_IDS.filter((t) => (counts[t] || 0) > 0).sort((a, b) => (counts[b] || 0) - (counts[a] || 0) || TAG_IDS.indexOf(a) - TAG_IDS.indexOf(b))
    .slice(0, SYNERGY.bias.topTags);
  return { counts: { ...counts }, top, blueprintTag: blueprintTag || null };
}

// Gewicht eines Items durch den Bias: min(max, 1 + perItem × Zähler seines stärksten Tags) × blueprintMul (Bauplan-Tag)
export function biasWeight(item, bias) {
  if (!bias || !item) return 1;
  const B = SYNERGY.bias;
  let n = 0;
  for (const t of item.tags) n = Math.max(n, bias.counts[t] || 0);
  let w = Math.min(B.max, 1 + B.perItem * n);
  if (bias.blueprintTag && item.tags.includes(bias.blueprintTag)) w *= B.blueprintMul;
  return w;
}

// Ein Item aus cand ziehen (Gewicht: ownedWeight bei besessenen × Bias)
function pickWeighted(rng, cand, ownedSet, ownedWeight, bias) {
  const wts = cand.map((it) => (ownedSet.has(it.id) ? ownedWeight : 1) * biasWeight(it, bias));
  const sum = wts.reduce((a, b) => a + b, 0);
  let u = rng.next() * sum;
  let pick = cand[cand.length - 1];
  for (let i = 0; i < cand.length; i++) { u -= wts[i]; if (u <= 0) { pick = cand[i]; break; } }
  return pick;
}

// Seltenheit nach Gewicht (nur Seltenheiten mit Items in list) und Kandidaten dieser Seltenheit; Rückfall: ganze Liste
function rollCandidates(rng, list, w) {
  const avail = {};
  for (const [r, wr] of Object.entries(w)) if (wr > 0 && list.some((it) => it.rarity === r)) avail[r] = wr;
  if (!Object.keys(avail).length) return list;
  const r = rng.weighted(avail);
  return list.filter((it) => it.rarity === r);
}

// Auswahl würfeln: count verschiedene Items aus dem Pool. owned: Item-IDs im Inventar (Gewicht ownedWeight; Paket C:
// ITEMS.ownedWeight 0,35 – Nehmen macht das Item ★+1), exclude: Item-IDs, die nie erscheinen (★3, Hybrid-Teile).
// Je Platz wird zuerst die Seltenheit nach Gewicht gezogen (nur Seltenheiten mit noch verfügbaren Items), danach ein
// Item dieser Seltenheit (gleichverteilt × Bias). Paket C:
//   bias (choiceBias): Gewichte nach Tag-Zähler, und mind. SYNERGY.bias.guarantee Angebot(e) mit einem der top-Tags
//     (ersetzt notfalls das letzte freie Angebot; Seltenheit wie gewürfelt, sonst die nächste mit Items dieser Tags)
//   guarantee ({ legendary: 1 }): so viele Plätze werden zuerst mit dieser Seltenheit gefüllt (falls im Pool)
// Phase 5 (Händler, Ereignisse, Schatz): weights ersetzt die Seltenheits-Gewichte des Kontexts, filter(item) grenzt den
// Pool ein (z. B. Tag), pool ersetzt den Pool ganz. Ergebnis: Liste von Item-IDs (kürzer, wenn der Pool leer ist).
export function rollItemChoices({ rng, context = 'stage', act = 1, count = 3, research = [], all = false, owned = [], exclude = [], weights = null, ownedWeight = BAL.ownedWeight, filter = null, pool = null, bias = null, guarantee = null, tagGuarantee = true }) {
  const ownedSet = new Set(owned);
  const excl = new Set(exclude);
  let list = (pool || itemPool(research, all)).filter((it) => !excl.has(it.id) && (!ownedSet.has(it.id) || ownedWeight > 0) && (!filter || filter(it)));
  const w = weights || rarityWeights(context, act);
  const out = [];
  const fixed = new Set();   // Plätze aus Garantien (werden vom Tag-Garant nicht ersetzt)
  const take = (pick, keep = false) => { if (keep) fixed.add(out.length); out.push(pick.id); list = list.filter((it) => it !== pick); };
  // Garantierte Seltenheiten zuerst (Boss: Legendär)
  for (const [r, n] of Object.entries(guarantee || {})) {
    for (let k = 0; k < n && out.length < count; k++) {
      const cand = list.filter((it) => it.rarity === r);
      if (!cand.length) break;
      take(pickWeighted(rng, cand, ownedSet, ownedWeight, bias), true);
    }
  }
  while (out.length < count && list.length) take(pickWeighted(rng, rollCandidates(rng, list, w), ownedSet, ownedWeight, bias));
  // Tag-Garantie: mindestens `guarantee` Angebote mit einem der stärksten Tags
  const top = bias && tagGuarantee ? bias.top : [];
  if (top.length && out.length) {
    const hasTop = (id) => { const it = ITEMS.find((x) => x.id === id); return !!it && it.tags.some((t) => top.includes(t)); };
    let have = out.filter(hasTop).length;
    for (let slot = out.length - 1; slot >= 0 && have < SYNERGY.bias.guarantee; slot--) {
      if (fixed.has(slot) || hasTop(out[slot])) continue;
      // nur Seltenheiten, die der Kontext erlaubt (Elite nie Gewöhnlich, Boss nur Episch/Legendär)
      const topList = list.filter((it) => (w[it.rarity] || 0) > 0 && it.tags.some((t) => top.includes(t)));
      if (!topList.length) break;
      // Seltenheit des ersetzten Angebots, sonst nach Gewicht unter den vorhandenen
      const old = ITEMS.find((x) => x.id === out[slot]);
      let cand = topList.filter((it) => old && it.rarity === old.rarity);
      if (!cand.length) cand = rollCandidates(rng, topList, w);
      const pick = pickWeighted(rng, cand, ownedSet, ownedWeight, bias);
      list = list.filter((it) => it !== pick);
      if (old) list.push(old);
      out[slot] = pick.id;
      have++;
    }
  }
  return out;
}

// Schrauben für „Überspringen“ (bzw. Ablehnen bei vollem Rucksack)
export const itemSkipBolts = (act) => REWARDS.itemSkipBolts[Math.max(1, Math.min(3, act | 0))] || 0;
