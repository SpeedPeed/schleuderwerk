// Playtest-Analyse 3: Ökonomie & Fortschrittsgefühl über die Spielzeit (Karrieren-Simulator aus tools/sim/progression.mjs:
// echte Run-Logik, Etappen-Ergebnis aus dem gefitteten Bot-Modell, Kaufstrategie Forschung → Chassis → Teile).
// Schnappschüsse nach 0,5/1/3/5/10 h: verdienter Schrott (gesamt und pro Stunde), Teile-Stufen, Forschungen, Item-Pool,
// Chassis, Siege, bestes Akt; dazu Schrott je Run und „Fortschritt pro Run“ (was ein Run kaufen kann).
// Zeitannahmen: tools/sim/progression.mjs → SIM.sec (Etappe 75 s inkl. Menüs). --stageSec überschreibt die Etappenzeit.
// Aufruf: node tools/playtest/economy.mjs [--careers 8] [--hours 10] [--json <Datei>]
import fs from 'node:fs';
import { loadModel, garageShopping, playRun, SIM, runPartLevel } from '../sim/progression.mjs';
import { defaultSave } from '../../www/src/save/save.js';
import { makeRng } from '../../www/src/core/rng.js';
import * as RS from '../../www/src/run/runState.js';
import * as G from '../../www/src/garage/garage.js';
import { SLOTS, partById } from '../../www/src/data/index.js';
import { selectAscension, ascensionState, markMilestone } from '../../www/src/garage/progression.js';
import { itemPool } from '../../www/src/run/rewards.js';
import { GARAGE } from '../../www/src/data/balance.js';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const CAREERS = Number(opt('careers', 8));
const HOURS = Number(opt('hours', 10));
if (opt('stageSec', null)) SIM.sec.stage = Number(opt('stageSec'));
const CHECK = [0.5, 1, 3, 5, 10].filter((h) => h <= HOURS);
const med = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };

function career(model, seed) {
  const save = defaultSave();
  const rng = makeRng(`oeko:${seed}`);
  let earned = 0, spentParts = 0, wins = 0, bestAct = 0, runs = 0;
  const ctx = { save, model, rng, run: null, noItems: false, stageOpts: {}, stats: { runs: 0, wins: 0, stages: 0 }, tick: (s) => { save.meta.totalPlaytime += s; } };
  const snaps = {};
  const runLog = [];
  let ci = 0;
  const snapshot = () => ({
    h: save.meta.totalPlaytime / 3600, earned, perHour: earned / Math.max(1e-9, save.meta.totalPlaytime / 3600), runs, wins, bestAct,
    partLevel: SLOTS.reduce((s, sl) => s + G.partLevel(save, save.garage.parts[sl]), 0) / SLOTS.length,
    research: save.research.done.length, pool: itemPool(save.research.done).length, chassis: save.garage.ownedChassis.length,
    blueprints: save.meta.blueprints, scrapLeft: save.meta.scrap, stages: ctx.stats.stages,
  });
  while (save.meta.totalPlaytime < HOURS * 3600) {
    const before = save.meta.scrap;
    garageShopping(save, ctx);
    spentParts += Math.max(0, before - save.meta.scrap);
    selectAscension(save, ascensionState(save).unlocked);
    save.run = RS.newRun(save, { seed: rng.int(1, 2 ** 30) });
    markMilestone(save, 'firstRunStart');
    const t0 = save.meta.totalPlaytime;
    const st0 = ctx.stats.stages;
    const res = playRun(ctx);
    runs++; ctx.stats.runs++;
    if (res.won) wins++;
    bestAct = Math.max(bestAct, res.won ? 4 : res.act);
    earned += res.payout.scrap;
    runLog.push({ min: (save.meta.totalPlaytime - t0) / 60, scrap: res.payout.scrap, bp: res.payout.blueprints, act: res.won ? 4 : res.act, stages: ctx.stats.stages - st0 });
    while (ci < CHECK.length && save.meta.totalPlaytime >= CHECK[ci] * 3600) { snaps[CHECK[ci]] = snapshot(); ci++; }
  }
  return { snaps, runLog };
}

const model = loadModel();
const res = Array.from({ length: CAREERS }, (_, i) => career(model, i + 1));
console.log(`Etappe ${SIM.sec.stage} s, Neuversuch ${SIM.sec.retry} s, Item-Wahl ${SIM.sec.choice} s (Annahmen tools/sim/progression.mjs)`);
const rows = [];
for (const h of CHECK) {
  const s = res.map((r) => r.snaps[h]).filter(Boolean);
  const row = { h, earned: med(s.map((x) => x.earned)), perHour: med(s.map((x) => x.perHour)), runs: med(s.map((x) => x.runs)), wins: med(s.map((x) => x.wins)), bestAct: med(s.map((x) => x.bestAct)), partLevel: med(s.map((x) => x.partLevel)), research: med(s.map((x) => x.research)), pool: med(s.map((x) => x.pool)), chassis: med(s.map((x) => x.chassis)) };
  rows.push(row);
  console.log(`${String(h).padStart(4)} h: Schrott verdient ${Math.round(row.earned)} (${Math.round(row.perHour)}/h), Runs ${row.runs}, Siege ${row.wins}, bestes Akt ${row.bestAct}, Ø Teile-Stufe ${row.partLevel.toFixed(1)}, Forschungen ${row.research}, Item-Pool ${row.pool}, Chassis ${row.chassis}`);
}
// Schrott je Run in den ersten 10 Runs
const first = Array.from({ length: 10 }, (_, k) => res.map((r) => r.runLog[k]).filter(Boolean));
console.log('Runs 1–10 (Median): ' + first.map((a, k) => `#${k + 1}: ${Math.round(med(a.map((x) => x.min)))} min, ${Math.round(med(a.map((x) => x.scrap)))} ⚙, ${med(a.map((x) => x.bp))} 📘, Akt ${med(a.map((x) => x.act))}`).join(' · '));
// Kaufkraft: Kosten der Startteile-Verbesserungen
const cum = (L) => { let c = 0; for (let l = 0; l < L; l++) c += Math.round(GARAGE.starterUpgradeBase * GARAGE.costGrowth ** l); return c; };
console.log(`Kosten alle 7 Startteile auf Stufe 5/10/20: ${7 * cum(5)} / ${7 * cum(10)} / ${7 * cum(20)} ⚙`);
const jf = opt('json', null);
if (jf) fs.writeFileSync(jf, JSON.stringify({ rows, first: first.map((a) => ({ min: med(a.map((x) => x.min)), scrap: med(a.map((x) => x.scrap)), bp: med(a.map((x) => x.bp)), act: med(a.map((x) => x.act)) })) }, null, 1));
