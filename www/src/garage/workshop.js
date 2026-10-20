// Paket E – Meta-Fortschritt: Werkstatt-Stufe (Konto-XP), Aufträge und Sammelalbum (Daten: data/workshop.js).
// Einzige Stelle der Regeln; aufgerufen am Run-Ende (run/runState.js → endRun → grantMeta). Reine Logik, kein DOM.
// Spielstand: save.workshop = { xp, level, contracts: { active: [ids], done, rolls }, album: { id: 1 } }
//   xp    Erfahrung innerhalb der aktuellen Stufe (läuft je Stufe von 0 bis levelCost(level))
import { WORKSHOP, workshopReward, WORKSHOP_PAINTS, CONTRACTS, CONTRACT_RULES, ALBUM, MASTERY } from '../data/workshop.js';
import { ITEMS } from '../data/items.js';
import { RECIPES } from '../data/recipes.js';
import { TAG_IDS, SET_LEVELS } from '../data/tags.js';
import { makeRng, hashSeed } from '../core/rng.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const r10 = (v) => Math.round(v / 10) * 10;

// XP für den Schritt von Stufe n auf n + 1
export const levelCost = (n) => r10(WORKSHOP.cost.base + WORKSHOP.cost.grow * Math.pow(Math.max(0, n - 1), WORKSHOP.cost.pow));

// Spielstand-Teil anlegen/reparieren (ältere Spielstände, kaputte Werte)
export function workshopState(save) {
  if (!isObj(save.workshop)) save.workshop = {};
  const w = save.workshop;
  w.level = Math.max(1, Math.min(WORKSHOP.maxLevel, Math.floor(Number(w.level) || 1)));
  w.xp = Math.max(0, Math.floor(Number(w.xp) || 0));
  if (!isObj(w.contracts)) w.contracts = {};
  const c = w.contracts;
  c.active = Array.isArray(c.active) ? c.active.filter((id, i, a) => CONTRACTS.some((x) => x.id === id) && a.indexOf(id) === i) : [];
  c.done = Math.max(0, Math.floor(Number(c.done) || 0));
  c.rolls = Math.max(0, Math.floor(Number(c.rolls) || 0));
  if (!isObj(w.album)) w.album = {};
  if (!isObj(w.mastery)) w.mastery = {};
  for (const [k, v] of Object.entries(w.mastery)) if (!(Number(v) >= 0)) delete w.mastery[k]; else w.mastery[k] = Math.floor(Number(v));
  fillContracts(w);
  return w;
}

// Chassis-Meisterschaft: { xp, level (0–5), next (XP bis zur nächsten Stufe oder null) }
export function masteryOf(save, chassisId) {
  const w = workshopState(save);
  const xp = w.mastery[chassisId] || 0;
  let level = 0;
  while (level < MASTERY.xp.length && xp >= MASTERY.xp[level]) level++;
  return { xp, level, next: level < MASTERY.xp.length ? MASTERY.xp[level] : null };
}

// Start-Vorteile der Meisterschaft für newRun (run/runState.js): { bolts, starterItem, extraBlueprint }
export function masteryPerks(save, chassisId) {
  const { level } = save && save.meta ? masteryOf(save, chassisId) : { level: 0 };
  return { bolts: (level >= 1 ? MASTERY.startBolts : 0) + (level >= 4 ? MASTERY.startBolts2 : 0), starterItem: level >= 2, extraBlueprint: level >= 3, level };
}

// Auftragsbrett auffüllen: aus den freigeschalteten (minLevel) Aufträgen, keine doppelten
function fillContracts(w) {
  const c = w.contracts;
  const pool = CONTRACTS.filter((x) => (x.minLevel || 0) <= w.level && !c.active.includes(x.id));
  while (c.active.length < CONTRACT_RULES.active && pool.length) {
    const rng = makeRng(hashSeed(`auftrag:${c.rolls++}`));
    const i = Math.floor(rng.next() * pool.length);
    c.active.push(pool[i].id);
    pool.splice(i, 1);
  }
}

export const contractById = (id) => CONTRACTS.find((x) => x.id === id) || null;

// Zusammenfassung eines beendeten Runs für XP und Aufträge (run.stats wird in run/runState.js mitgezählt)
export function runSummary(run, res = {}) {
  const s = run.stats || {};
  const m = s.medals || {};
  return {
    dist: Math.round(s.dist || 0),
    medals: (m.bronze || 0) + (m.silver || 0) + (m.gold || 0),
    gold: m.gold || 0,
    bosses: (run.bossesBeaten || []).length,
    flips: s.flips || 0,
    perfectLandings: s.perfect || 0,
    maxChain: s.maxChain || 0,
    bolts: s.boltsEarned || 0,
    recipes: s.recipes || 0,
    maxSet: s.maxSet || 0,
    elites: s.elites || 0,
    stageEvents: s.stageEvents || 0,
    goalGold: isObj(s.goalGold) ? s.goalGold : {},
    tagAtAct: isObj(s.tagAtAct) ? s.tagAtAct : {},
    won: !!(res.won ?? (run.over && run.over.won)),
    ascension: run.ascension || 0,
  };
}

// Erfahrung eines Runs (WORKSHOP.xp)
export function runXp(sum, contractsDone = 0) {
  const X = WORKSHOP.xp;
  return Math.round(sum.dist / X.perMeters + sum.medals * X.perMedal + sum.bosses * X.perBoss + contractsDone * X.perContract + (sum.won ? X.perWin : 0));
}

// Ist ein Auftrag mit dieser Run-Zusammenfassung erfüllt?
export function contractMet(c, sum) {
  switch (c.type) {
    case 'stat': return (sum[c.key] || 0) >= c.n;
    case 'tagAct': return ((sum.tagAtAct[c.act] || {})[c.tag] || 0) >= c.n;
    case 'goalGold': return !!sum.goalGold[c.goal];
    case 'win': return sum.won && sum.ascension >= (c.ascension || 0);
    default: return false;
  }
}

// Fortschritt des Sammelalbums (Kodex): { items, recipes, sets } und Gesamtzahlen
export function albumProgress(save) {
  const codex = save.codex || {};
  const items = ITEMS.filter((it) => ((codex.items || {})[it.id] || 0) > 0).length;
  const recipes = Object.keys(codex.recipes || {}).length;
  const sets = Object.keys(codex.sets || {}).length;
  return { items, recipes, sets, total: { items: ITEMS.length, recipes: RECIPES.length, sets: TAG_IDS.length * SET_LEVELS.length } };
}

const albumNeed = (a, p) => (a.n === 'all' ? p.total[a.type] : a.n);

// Belohnung gutschreiben (Spielstand) – { scrap, blueprints, cores, paint }
function credit(save, rw, sum) {
  if (!rw) return;
  const m = save.meta;
  for (const k of ['scrap', 'blueprints', 'cores']) if (rw[k]) { m[k] = (m[k] || 0) + rw[k]; sum[k] = (sum[k] || 0) + rw[k]; }
  if (rw.paint) {
    if (!isObj(save.cosmetics)) save.cosmetics = { owned: [], paint: null };
    if (!Array.isArray(save.cosmetics.owned)) save.cosmetics.owned = [];
    if (!save.cosmetics.owned.includes(rw.paint)) save.cosmetics.owned.push(rw.paint);
    (sum.paints ||= []).push(rw.paint);
  }
}

// Am Run-Ende: Aufträge prüfen, Album prüfen, XP gutschreiben, Stufen aufsteigen. Ergebnis für die Anzeige:
// { xp, levelFrom, levelTo, xpNow, xpNeed, levels: [{ level, reward }], contracts: [{ id, text, reward }],
//   album: [{ id, text, reward }], total: { scrap, blueprints, cores, paints } }
export function grantMeta(save, run, res = {}) {
  const w = workshopState(save);
  const sum = runSummary(run, res);
  const total = {};
  // Aufträge
  const contracts = [];
  for (const id of [...w.contracts.active]) {
    const c = contractById(id);
    if (!c || !contractMet(c, sum)) continue;
    credit(save, c.reward, total);
    contracts.push({ id: c.id, text: c.text, reward: c.reward });
    w.contracts.active = w.contracts.active.filter((x) => x !== id);
    w.contracts.done++;
  }
  // Album
  const album = [];
  const p = albumProgress(save);
  for (const a of ALBUM) {
    if (w.album[a.id] || p[a.type] < albumNeed(a, p)) continue;
    w.album[a.id] = 1;
    credit(save, a.reward, total);
    album.push({ id: a.id, text: a.text, reward: a.reward });
  }
  // Erfahrung und Stufen
  const xp = runXp(sum, contracts.length);
  const levelFrom = w.level;
  const levels = [];
  w.xp += xp;
  while (w.level < WORKSHOP.maxLevel && w.xp >= levelCost(w.level)) {
    w.xp -= levelCost(w.level);
    w.level++;
    const rw = workshopReward(w.level);
    credit(save, rw, total);
    levels.push({ level: w.level, reward: rw });
  }
  if (w.level >= WORKSHOP.maxLevel) w.xp = 0;
  // Chassis-Meisterschaft: das gefahrene Chassis bekommt dieselbe XP
  const cid = run.chassisId;
  const mFrom = cid ? masteryOf(save, cid).level : 0;
  if (cid) w.mastery[cid] = (w.mastery[cid] || 0) + xp;
  const mastery = cid ? { chassis: cid, from: mFrom, ...masteryOf(save, cid) } : null;
  fillContracts(w);
  return { xp, levelFrom, levelTo: w.level, xpNow: w.xp, xpNeed: levelCost(w.level), levels, contracts, album, total, mastery };
}

// Anzeige der nächsten Belohnung (Garage, Run-Ende)
export const nextReward = (save) => { const w = workshopState(save); return w.level >= WORKSHOP.maxLevel ? null : workshopReward(w.level + 1); };

export { WORKSHOP_PAINTS };
