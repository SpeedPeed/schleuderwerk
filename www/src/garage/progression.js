// Meta-Fortschritt: Spielzeit, Meilenstein-Zeitmessung (V2-DESIGN.md §8 „Fortschritt & Zielzeiten“), Schrottstufen
// (V2-DESIGN.md §4, data/ascension.js) und Run-Historie/Bestwerte (Garage → Reiter „Statistik“).
// meta.milestones[key] = Spielzeit in Sekunden beim ersten Erreichen. Reine Logik ohne three.js und DOM.
//
// Spielstand: save.ascension = { unlocked, best, selected, records: { '<Stufe>': { runs, wins, bestAct, bestStages, fastestWin } } }
//   unlocked  höchste wählbare Stufe (0 = Schrottstufen noch gesperrt; nach dem ersten Run-Sieg 1, danach höchste
//             geschaffte + 1, höchstens 15)
//   best      höchste Stufe, auf der ein Run gewonnen wurde (Schrottstufen-Lacke: data/cosmetics.js „ascension:N“)
//   selected  für den nächsten Run gewählte Stufe (0 … unlocked)
// save.history = [{ at, won, act, reason, ascension, chassis, stages, cleared, scrap, time }] – die letzten 10 Runs.
import { ASCENSION, ASCENSION_REWARDS } from '../data/ascension.js';
import { PROGRESSION, RUN } from '../data/balance.js';
import { CHASSIS } from '../data/index.js';

export const MAX_ASCENSION = ASCENSION.length;

// Bekannte Meilensteine (Anzeige im Dev-Menü). target = Zielzeit-Korridor in Sekunden (balance.PROGRESSION.targets)
export const MILESTONES = [
  { id: 'firstRunStart', name: 'Erster Run gestartet' },
  { id: 'firstRunEnd', name: 'Erster Run beendet', target: 'firstRun' },
  { id: 'firstBossAct1', name: 'Erster Akt-1-Boss besiegt', target: 'firstBossAct1' },
  { id: 'firstAct2', name: 'Erstmals in Akt 2' },
  { id: 'firstBossAct2', name: 'Erster Akt-2-Boss besiegt' },
  { id: 'firstAct3', name: 'Erstmals in Akt 3' },
  { id: 'firstBossAct3', name: 'Erster Akt-3-Boss besiegt' },
  { id: 'firstWin', name: 'Erster Run-Sieg', target: 'firstWin' },
  { id: 'allChassis', name: 'Alle Chassis', target: 'allChassis' },
  { id: 'ascension5', name: 'Sieg auf Schrottstufe 5' },
  { id: 'ascension10', name: 'Sieg auf Schrottstufe 10' },
  { id: 'ascension15', name: 'Sieg auf Schrottstufe 15 (alles)', target: 'ascension15' },
  { id: 'firstPartUpgrade', name: 'Erste Teile-Verbesserung' },
  { id: 'firstPartBought', name: 'Erstes Teil gekauft' },
  { id: 'firstChassisUnlocked', name: 'Erstes neues Chassis' },
  { id: 'firstResearch', name: 'Erste Forschung im Labor' },
  { id: 'firstPaint', name: 'Erste Lackierung gekauft' },
  { id: 'firstTestDrive', name: 'Erste Testfahrt (Dev)' },
];

// Zielzeit-Korridor eines Meilensteins: { min, max } in Sekunden oder null
export function milestoneTarget(m) {
  const t = m && m.target && PROGRESSION.targets[m.target];
  return t ? { min: t[0] * 3600, max: t[1] * 3600 } : null;
}

// Spielzeit (s) addieren
export function addPlaytime(save, seconds) {
  if (seconds > 0 && isFinite(seconds)) save.meta.totalPlaytime += seconds;
}

// Meilenstein beim ersten Erreichen mit der aktuellen Spielzeit stempeln. Ergebnis: true beim ersten Mal.
export function markMilestone(save, id) {
  const m = save.meta.milestones;
  if (m[id] !== undefined) return false;
  m[id] = Math.round(save.meta.totalPlaytime * 10) / 10;
  return true;
}

// Meilenstein „alle Chassis“ prüfen (nach jedem Chassis-Kauf)
export function checkAllChassis(save) {
  const owned = new Set(save.garage.ownedChassis);
  if (CHASSIS.every((c) => owned.has(c.id))) return markMilestone(save, 'allChassis');
  return false;
}

// Spielzeit lesbar: 3725 → „1 h 02 min“, 95 → „1 min 35 s“
export function fmtPlaytime(s) {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m > 0) return `${m} min ${String(sec).padStart(2, '0')} s`;
  return `${sec} s`;
}

// ---------- Schrottstufen ----------

const clampLevel = (n) => Math.max(0, Math.min(MAX_ASCENSION, Math.floor(Number(n) || 0)));

// Aktive Regeln auf Stufe `level` (kumulativ, Stufen 1..level). Fehlende Schlüssel = keine Wirkung.
export function ascensionMods(level) {
  const out = {};
  for (const a of ASCENSION.slice(0, clampLevel(level))) Object.assign(out, a.mods);
  return out;
}

// Liste der aktiven Erschwerungen (Anzeige im Run): [{ level, name, desc }]
export function ascensionList(level) {
  return ASCENSION.slice(0, clampLevel(level)).map((a) => ({ level: a.level, name: a.name, desc: a.desc }));
}

// Schrottstufen-Zustand im Spielstand (fehlende Felder ergänzen)
export function ascensionState(save) {
  const a = save.ascension || (save.ascension = { unlocked: 0, best: 0 });
  a.unlocked = clampLevel(a.unlocked);
  a.best = clampLevel(a.best);
  a.selected = Math.min(clampLevel(a.selected), a.unlocked);
  if (!a.records || typeof a.records !== 'object' || Array.isArray(a.records)) a.records = {};
  return a;
}

// Höchste wählbare Stufe (0 = gesperrt)
export const maxAscension = (save) => ascensionState(save).unlocked;

// Stufe für den nächsten Run wählen (0 … unlocked). Ergebnis: gewählte Stufe
export function selectAscension(save, level) {
  const a = ascensionState(save);
  a.selected = Math.max(0, Math.min(a.unlocked, clampLevel(level)));
  return a.selected;
}

// Schrott-Faktor einer Stufe (+10 % je Stufe, additiv)
export const ascensionScrapBonus = (level) => clampLevel(level) * ASCENSION_REWARDS.scrapPerLevel;

// Kern-Belohnung für einen Sieg auf `level` (nur beim ERSTEN Sieg auf einer Meilenstein-Stufe 5/10/15)
export function ascensionCoreReward(save, level) {
  const lv = clampLevel(level);
  if (!ASCENSION_REWARDS.coreMilestones.includes(lv)) return 0;
  const rec = ascensionState(save).records[lv];
  return rec && rec.wins > 0 ? 0 : ASCENSION_REWARDS.coresPerMilestone;
}

// Lackierungen, die ein Sieg auf `level` neu freischaltet (data/cosmetics.js unlock „ascension:N“)
export function ascensionPaintsFor(paints, before, after) {
  return paints.filter((p) => {
    const m = /^ascension:(\d+)$/.exec(p.unlock || '');
    return m && Number(m[1]) > before && Number(m[1]) <= after;
  });
}

// Run-Ende eintragen: Schrottstufen freischalten (erster Sieg → Stufe 1, Sieg auf N → N+1), Bestwerte je Stufe,
// Meilensteine ascension5/10/15, Run-Historie (letzte PROGRESSION.historySize Runs).
// res: { won, act, reason, stages, cleared, scrap, chassis, time }. Ergebnis: { unlocked: neue Stufe | null, bestBefore }
export function recordRunEnd(save, run, res) {
  const a = ascensionState(save);
  const level = clampLevel(run.ascension);
  const out = { unlocked: null, bestBefore: a.best, level };
  const rec = a.records[level] || (a.records[level] = { runs: 0, wins: 0, bestAct: 0, bestStages: 0, fastestWin: 0 });
  rec.runs++;
  rec.bestAct = Math.max(rec.bestAct, res.won ? RUN.acts + 1 : res.act);
  rec.bestStages = Math.max(rec.bestStages, res.cleared || 0);
  if (res.won) {
    rec.wins++;
    if (res.time > 0 && (!rec.fastestWin || res.time < rec.fastestWin)) rec.fastestWin = Math.round(res.time);
    a.best = Math.max(a.best, level);
    const next = Math.min(MAX_ASCENSION, level + 1);
    if (next > a.unlocked) { a.unlocked = next; out.unlocked = next; }
    for (const m of [5, 10, 15]) if (level >= m) markMilestone(save, `ascension${m}`);
  }
  if (!Array.isArray(save.history)) save.history = [];
  save.history.unshift({
    at: Math.round(save.meta.totalPlaytime), won: !!res.won, act: res.act, reason: res.reason || '', ascension: level,
    chassis: run.chassisId, stages: res.stages || 0, cleared: res.cleared || 0, scrap: res.scrap || 0, time: Math.round(res.time || 0),
  });
  save.history.length = Math.min(save.history.length, PROGRESSION.historySize);
  return out;
}

// Dev-Menü: alle Schrottstufen freischalten (wählbar bis 15)
export function devUnlockAscension(save, level = MAX_ASCENSION) {
  const a = ascensionState(save);
  a.unlocked = Math.max(a.unlocked, clampLevel(level));
  return a.unlocked;
}

// Kurzfassung der aktiven Erschwerungen (Chips im Run): ['Ziele +8 %', 'Schaden +15 %', …]
const pctOf = (f) => Math.round(Math.abs(f - 1) * 100);
export function ascensionSummary(level) {
  const m = ascensionMods(level);
  const out = [];
  if (m.eliteWeightAdd) out.push('mehr Elite');
  if (m.targetMul) out.push(`Ziele +${pctOf(m.targetMul)} %`);
  if (m.towPenaltyAdd) out.push(`Abschleppen +${Math.round(m.towPenaltyAdd * 100)} %`);
  if (m.priceMul) out.push(`Preise +${pctOf(m.priceMul)} %`);
  if (m.repairMul) out.push(`Reparatur −${pctOf(m.repairMul)} %`);
  if (m.startCurse) out.push(`${m.startCurse} Start-Fluch`);
  if (m.bossTargetMul) out.push(`Bosse +${pctOf(m.bossTargetMul)} %`);
  if (m.damageMul) out.push(`Schaden +${pctOf(m.damageMul)} %`);
  if (m.itemChoicesAdd) out.push(`${m.itemChoicesAdd} Item zur Wahl`.replace('-', '−'));
  if (m.startDurabilityMul) out.push(`Haltbarkeit −${pctOf(m.startDurabilityMul)} %`);
  if (m.heatGainMul) out.push(`Hitze +${pctOf(m.heatGainMul)} %`);
  if (m.eliteHazards) out.push('Elite-Gefahren');
  if (m.boltMul) out.push(`Schrauben −${pctOf(m.boltMul)} %`);
  if (m.fuelMaxMul) out.push(`Treibstoff −${pctOf(m.fuelMaxMul)} %`);
  if (m.doubleBossAct3) out.push('Doppel-Boss Akt 3');
  return out;
}
