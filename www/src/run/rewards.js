// Belohnungen im Run (reine Logik). Alle Zahlen: data/balance.js → REWARDS.
//  - stageRewards: Schrauben + Meta-Schrott + Blaupausen einer Etappe (nach Akt, Medaille, Knotenart)
//  - placeholderReward: kleiner Bonus der Platzhalter-Knoten bis Phase 5
//  - runPayout: Meta-Auszahlung am Run-Ende (gesammelter Schrott, Schrauben-Rest → Schrott, Blaupausen, Kerne)
import { REWARDS } from '../data/balance.js';

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
