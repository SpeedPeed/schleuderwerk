// Progressions- und Ökonomie-Simulator (Phase 6): Wie lange braucht eine Person bis zu den Meilensteinen aus
// V2-DESIGN §8 (erster Run, erster Akt-1-Boss, erster Sieg, alle Chassis, Schrottstufe 15)?
//
// Zwei Schritte:
//  1. --fit   Der Etappen-Bot (tools/sim/bot.mjs, echte Etappen-Logik) misst je Akt/Knotenart/Etage und Teile-Stufe
//             0/5/10/15/20 (alle Startteile) die Verteilung von Weite ÷ Ziel (log-normal: mu, sd), Schaden, Schrauben,
//             Schrott, Item-Kisten; dazu die Wirkung von Items (zufällige Builds je Anzahl, je Seltenheit, Set-Builds
//             2/4/6 eines Tags) und die Physik-Erschwerungen der Schrottstufen (Hitze +15 %, Treibstoff −10 %).
//             Ergebnis: tools/sim/progression-model.json (≈ 2–4 min).
//  2. Karriere  Eine Person spielt Run um Run mit der ECHTEN Run-Logik (run/runState.js, Karte, Händler, Werkbank,
//             Ereignisse, Schatz, Tankstelle, Belohnungen, Auszahlung, Schrottstufen); nur das Ergebnis einer Etappe wird
//             aus dem gefitteten Modell gewürfelt (Teile-Stufe, Items, Schrottstufe, Einarbeitung). Zwischen den Runs
//             kauft sie in der Garage nach fester Strategie (Forschung → Chassis → Teile-Stufen). Spielzeit je Etappe
//             und Knoten: SIM.sec. Deterministisch per Seed (Simulation in Sekunden).
//  Dazu die Regel „ein schlechter Run muss auch mit voller Meta scheitern können“: volle Meta (alle Startteile
//  Stufe 20, ganzer Forschungsbaum), keine bzw. schlechte Items → Sieg-Anteil (Ziel < 30 %); mit --bot zusätzlich mit
//  dem echten Bot (ganze Runs wie tools/sim/items.mjs).
//
// Aufruf: node tools/sim/progression.mjs [--fit] [--careers 6] [--bot]   → Konsole + Abschnitt „Progression“ in
//         docs/BALANCE.md (hinter der Marke <!-- progression -->).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BIOMES, biomeForAct } from '../../www/src/data/biomes.js';
import { ITEMS, itemById } from '../../www/src/data/items.js';
import { GARAGE, RUN, PROGRESSION, ITEMS as BAL_ITEMS, CONTROLS } from '../../www/src/data/balance.js';
import { CHASSIS, SLOTS, partById } from '../../www/src/data/index.js';
import { generateStageSpec, stageTarget, medalFor } from '../../www/src/physics/trackGen.js';
import { makeRng, hashSeed } from '../../www/src/core/rng.js';
import { defaultSave } from '../../www/src/save/save.js';
import * as RS from '../../www/src/run/runState.js';
import * as G from '../../www/src/garage/garage.js';
import * as LAB from '../../www/src/garage/research.js';
import { selectAscension, markMilestone, checkAllChassis, ascensionState, MAX_ASCENSION } from '../../www/src/garage/progression.js';
import { chooseStation } from '../../www/src/shops/gasStation.js';
import * as Dealer from '../../www/src/shops/scrapDealer.js';
import * as Workbench from '../../www/src/shops/workbench.js';
import * as TextEvent from '../../www/src/shops/textEvent.js';
import * as Treasure from '../../www/src/shops/treasure.js';
import { mapNode } from '../../www/src/map/mapGen.js';
import { entryParts, tierMult } from '../../www/src/items/inventory.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
export const MODEL_FILE = path.join(HERE, 'progression-model.json');
export const MARK = '<!-- progression -->';

// ---------- Annahmen der Simulation (keine Spielwerte) ----------
export const SIM = {
  // Spielzeit in Sekunden (inkl. Menüs, Intro, Auswertung)
  sec: {
    // Paket A (neu gemessen, docs/OVERHAUL.md „Umsetzungsstand Paket A“): Etappe ≈ 12 s Echtzeit (Vorspulen,
    // Hochrechnung), Intro als Banner beim Zielen (≈ 4 s), Ergebnis + Beute auf einem Bildschirm, Karte fährt bei nur
    // einem Weg selbst weiter. Lesezeit für Menschen wie bisher ≈ ×2,5 auf die Bot-Zeit der Menüs. (v1.0: 75 / 55 s)
    stage: 45,          // Etappe: Zielen mit Banner + Flug ≈ 16 s + Ergebnis lesen + Karte
    retry: 35,          // „Nochmal“ / Boss-Neuversuch (Karte entfällt)
    choice: 10,         // Item-Auswahl (je Auswahl)
    dealer: 35, workbench: 30, blackmarket: 20, event: 30, treasure: 15, station: 15,
    runStart: 10, runEnd: 25,   // Run-Start, Run-Ende-Bildschirm
    garage: 30,         // Garage zwischen zwei Runs (+ je Kauf/Verbesserung buy)
    buy: 3,
    tutorial: 15,       // je Etappe zusätzlich in den ersten CONTROLS.tutorialRuns Runs (Hinweise lesen, Steuerung lernen)
  },
  // Einarbeitung: der Bot spielt wie eine geübte Person; Neulinge fliegen anfangs kürzer.
  // Weite × (1 − (1 − start) · e^(−Spielzeit / tau))
  skill: { start: 0.88, tauH: 1.5 },
  maxHours: 90,
  fitLevels: [0, 3, 5, 8, 10],   // Slot-Stufen (Paket A: 0–10; früher Teile-Stufen 0/5/10/15/20)
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r3 = (x) => Math.round(x * 1000) / 1000;
const fmtH = (s) => (s === undefined || s === null ? '–' : `${(s / 3600).toFixed(s < 3600 ? 2 : 1).replace('.', ',')} h`);
const fmtMin = (s) => `${Math.round(s / 60)} min`;
const fmtPct = (x) => `${Math.round(x * 100)} %`;

// Zelle eines Knotens im Modell: s0…s5 (Etappe je Etage), e (Elite, gemessen auf Etage 3), b (Boss)
const cellOf = (kind, floor) => (kind === 'boss' ? 'b' : kind === 'elite' ? 'e' : `s${clamp(floor | 0, 0, 5)}`);
const CELLS = [['stage', 0], ['stage', 1], ['stage', 2], ['stage', 3], ['stage', 4], ['stage', 5], ['elite', 3], ['boss', 6]];

// Spielstand mit allen Slots (Startteile) auf Stufe L
export function levelSave(L) {
  const s = defaultSave();
  for (const slot of Object.keys(GARAGE.starterParts)) s.garage.slotLevels[slot] = L;
  return s;
}

// ======================================================================================
// 1. Fit mit dem Bot
// ======================================================================================

async function botTools() {
  return import('./bot.mjs');
}

// n Etappen einer Zelle spielen. inv(i) → Inventar, runMods: Run-Effekte. Ergebnis: Liste der Messwerte
function playCell(bot, { biome, kind, floor, save, n, inv = null, runMods = undefined, tag = 'fit', tricks = null }) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const bossId = kind === 'boss' ? biome.bosses[i % biome.bosses.length].id : null;
    const spec = generateStageSpec({ biome, kind, floor, rng: makeRng(`${tag}:${biome.id}:${kind}:${floor}:${i}`), bossId });
    const inventory = inv ? inv(i) : null;
    const sim = bot.makeSimStage({ spec, biome, save, seed: 7000 + i, inventory, runMods, runInfo: { bolts: 40, counters: {} } });
    const r = bot.playStage(sim.stage, () => sim.result, { seed: 31 * i + floor + 3, tricks: tricks ? tricks(inventory) : false });
    out.push({
      lr: Math.log(Math.max(0.05, r.dist / r.target)), dmg: r.damageTaken / Math.max(1, r.durabilityMax),
      bolts: r.bolts, scrap: r.scrap, crates: r.crates, bp: r.blueprints, fell: r.reason === 'fall' ? 1 : 0,
    });
  }
  return out;
}

const summarizeCell = (rows) => ({
  mu: r3(mean(rows.map((r) => r.lr))), sd: r3(Math.max(0.05, sd(rows.map((r) => r.lr)))),
  lr: rows.map((r) => r3(r.lr)).sort((a, b) => a - b),   // Messwerte (log Weite ÷ Ziel), sortiert – empirische Verteilung
  dmg: rows.map((r) => r3(r.dmg)).sort((a, b) => a - b),
  bolts: r3(mean(rows.map((r) => r.bolts))), scrap: r3(mean(rows.map((r) => r.scrap))),
  crates: r3(mean(rows.map((r) => r.crates))), bp: r3(mean(rows.map((r) => r.bp))),
});

export async function fitModel({ n = 12, nItems = 10, log = console.log } = {}) {
  const bot = await botTools();
  const { wantsTricks } = await import('./items.mjs');
  const t0 = Date.now();
  const model = { v: 1, created: new Date().toISOString().slice(0, 10), n, levels: SIM.fitLevels, base: {}, items: {}, asc: {}, targets: {} };
  // Zielmarken zum Zeitpunkt der Messung: das Modell speichert Weite ÷ DIESE Ziele, damit spätere Änderungen der Zielmarken
  // (data/biomes.js) ohne neue Messung wirken
  for (const b of BIOMES) model.targets[b.act] = JSON.parse(JSON.stringify(b.targets));
  // a) ohne Items je Teile-Stufe
  for (const b of BIOMES) {
    model.base[b.act] = {};
    for (const L of SIM.fitLevels) {
      const save = levelSave(L);
      const cells = {};
      for (const [kind, floor] of CELLS) cells[cellOf(kind, floor)] = summarizeCell(playCell(bot, { biome: b, kind, floor, save, n }));
      model.base[b.act][L] = cells;
      log(`Fit Akt ${b.act} Stufe ${String(L).padStart(2)}: ${Object.entries(cells).map(([k, c]) => `${k} ×${Math.exp(c.mu).toFixed(2)}`).join(' ')}`);
    }
  }
  // b) Items (Slot-Stufe 5 = Mitte): zufällige Builds je Anzahl, je Seltenheit (4 Items), Set-Builds eines Tags (2/4/6)
  const save10 = levelSave(5);
  const pool = ITEMS.filter((i) => i.rarity !== 'cursed');
  const tags = [...new Set(pool.flatMap((i) => i.tags))];
  const cellsI = [['stage', 2], ['boss', 6]];
  for (const b of BIOMES) {
    const base = (kind, floor) => model.base[b.act][5][cellOf(kind, floor)].mu;
    const meas = (label, mk) => {
      const vals = [];
      for (const [kind, floor] of cellsI) {
        const rng = makeRng(`items:${label}:${b.id}:${kind}`);
        const rows = playCell(bot, { biome: b, kind, floor, save: save10, n: nItems, inv: () => mk(rng).map((itemId) => ({ itemId, tier: 1 })), tag: `fiti:${label}`, tricks: wantsTricks });
        vals.push(mean(rows.map((r) => r.lr)) - base(kind, floor));
      }
      return r3(mean(vals));
    };
    const pickN = (list, k) => (rng) => { const l = [...list]; rng.shuffle(l); return l.slice(0, k).map((i) => i.id); };
    const m = { random: {}, rarity: {}, set: {} };
    for (const k of [2, 4, 6]) m.random[k] = meas(`zufall${k}`, pickN(pool, k));
    for (const r of ['common', 'rare', 'epic', 'legendary']) m.rarity[r] = meas(`selten-${r}`, pickN(pool.filter((i) => i.rarity === r), 4));
    for (const s of [2, 4, 6]) {
      m.set[s] = meas(`set${s}`, (rng) => {
        const tag = rng.pick(tags.filter((t) => pool.filter((i) => i.tags.includes(t)).length >= s));
        return pickN(pool.filter((i) => i.tags.includes(tag)), s)(rng);
      });
    }
    model.items[b.act] = m;
    log(`Fit Items Akt ${b.act}: zufällig ${JSON.stringify(m.random)} Seltenheit ${JSON.stringify(m.rarity)} Set ${JSON.stringify(m.set)}`);
  }
  // c) Physik-Erschwerungen der Schrottstufen (Slot-Stufe 5, Akt 2 Etage 3 + Akt 3 Etage 0)
  const ascCells = [[biomeForAct(2), 'stage', 3], [biomeForAct(3), 'stage', 0]];
  const ascMeas = (runMods) => r3(mean(ascCells.map(([b, kind, floor]) => mean(playCell(bot, { biome: b, kind, floor, save: save10, n, runMods, tag: 'fita' }).map((r) => r.lr)) - model.base[b.act][5][cellOf(kind, floor)].mu)));
  model.asc.heat = ascMeas({ heatGainMul: 1.15 });
  model.asc.fuel = ascMeas({ fuelMaxMul: 0.9 });
  log(`Fit Schrottstufen: Hitze +15 % → ${model.asc.heat}, Treibstoff −10 % → ${model.asc.fuel} (log-Weite)`);
  // d) Streuung beim Neuversuch: dieselbe Strecke mit anderen Abschüssen (Anteil der Varianz innerhalb einer Strecke)
  const within = [];
  for (const [act, kind, floor, L] of [[1, 'boss', 6, 0], [1, 'stage', 3, 3], [2, 'stage', 2, 5], [2, 'boss', 6, 5], [3, 'stage', 0, 8], [3, 'boss', 6, 10]]) {
    const biome = biomeForAct(act);
    const save = levelSave(L);
    const vs = [];
    for (let t = 0; t < 4; t++) {
      const spec = generateStageSpec({ biome, kind, floor, rng: makeRng(`fitw:${act}:${kind}:${t}`), bossId: kind === 'boss' ? biome.bosses[t % 2].id : null });
      const lrs = [];
      for (let i = 0; i < 6; i++) {
        const sim = bot.makeSimStage({ spec, biome, save, seed: 300 + i });
        const r = bot.playStage(sim.stage, () => sim.result, { seed: 17 * i + t });
        lrs.push(Math.log(Math.max(0.05, r.dist / r.target)));
      }
      vs.push(sd(lrs) ** 2);
    }
    const tot = model.base[act][L][cellOf(kind, floor)].sd ** 2;
    within.push(clamp(mean(vs) / tot, 0, 1));
  }
  model.withinFrac = r3(mean(within));
  log(`Fit Neuversuch: Anteil der Streuung innerhalb derselben Strecke ${model.withinFrac}`);
  model.secs = Math.round((Date.now() - t0) / 1000);
  return model;
}

export function loadModel(file = MODEL_FILE) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ======================================================================================
// 2. Modell anwenden
// ======================================================================================

// Teile-Stufe der Run-Ausrüstung (Mittel der 7 Slots; Nicht-Startteile zählen mit ihrer Stufe)
export const runPartLevel = (run) => mean(SLOTS.map((s) => (run.parts[s] ? run.parts[s].level || 0 : 0)));

// Zelle bei Teile-Stufe L (linear zwischen den gemessenen Stufen)
function cellAt(model, act, cell, L) {
  const lv = model.levels;
  let i = 0;
  while (i < lv.length - 2 && L > lv[i + 1]) i++;
  const a = model.base[act][lv[i]][cell], b = model.base[act][lv[i + 1]][cell];
  const t = clamp((L - lv[i]) / (lv[i + 1] - lv[i]), 0, 1);
  const mix = (k) => a[k] + (b[k] - a[k]) * t;
  // Quantil q (0…1) der gemessenen Weiten (empirisch, linear zwischen den Messwerten und den beiden Stufen)
  const qOf = (list, q) => { const x = clamp(q, 0, 1) * (list.length - 1); const i = Math.floor(x); return list[i] + (list[Math.min(list.length - 1, i + 1)] - list[i]) * (x - i); };
  const quantile = a.lr && b.lr ? (q) => qOf(a.lr, q) + (qOf(b.lr, q) - qOf(a.lr, q)) * t : null;
  return { mu: mix('mu'), sd: mix('sd'), bolts: mix('bolts'), scrap: mix('scrap'), crates: mix('crates'), bp: mix('bp'), dmg: t < 0.5 ? a.dmg : b.dmg, quantile };
}

// Standard-Normalverteilung: Verteilungsfunktion (Abramowitz/Stegun 7.1.26)
function normCdf(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const k = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * k - 1.453152027) * k) + 1.421413741) * k - 0.284496736) * k + 0.254829592) * k * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

const interp = (pts, x) => {
  // pts: [[x, y]…] aufsteigend; darüber mit halber Steigung weiter
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  }
  const [x0, y0] = pts[pts.length - 2], [x1, y1] = pts[pts.length - 1];
  return y1 + (0.5 * (y1 - y0) * (x - x1)) / (x1 - x0);
};

// Wirkung des Inventars (log-Weite): effektive Anzahl (Seltenheit × ★-Faktor, Flüche als Gewöhnlich) + Set-Bonus
export function itemLog(model, act, inventory) {
  const m = model.items[act];
  if (!inventory || !inventory.length || !m) return 0;
  const w = (r) => (m.random[4] > 0 ? clamp((m.rarity[r] ?? m.random[4]) / m.random[4], 0.3, 3) : 1);
  let k = 0;
  const tags = {};
  for (const e of inventory) {
    for (const p of entryParts(e)) {
      const hm = entryParts(e).length > 1 ? BAL_ITEMS.tierMult[0] * 0.75 : 1;
      k += w(p.def.rarity === 'cursed' ? 'rare' : p.def.rarity) * tierMult(p.tier || e.tier || 1) * hm;
      for (const t of p.def.tags) tags[t] = (tags[t] || 0) + 1;
    }
  }
  const randomPts = [[0, 0], [2, m.random[2]], [4, m.random[4]], [6, m.random[6]]];
  const s = Math.max(0, ...Object.values(tags));
  const synPts = [[0, 0], [1, 0], [2, m.set[2] - m.random[2]], [4, m.set[4] - m.random[4]], [6, m.set[6] - m.random[6]]];
  return interp(randomPts, k) + Math.max(0, interp(synPts, Math.min(6, s)));
}

// Einarbeitung (log-Weite) bei Spielzeit t (s)
export const skillLog = (t) => Math.log(1 - (1 - SIM.skill.start) * Math.exp(-t / (SIM.skill.tauH * 3600)));

// Normalverteilter Zufall
const gauss = (rng) => Math.sqrt(-2 * Math.log(Math.max(1e-9, rng.next()))) * Math.cos(2 * Math.PI * rng.next());

// Etappen-Ergebnis für den Run würfeln (Form wie stage.finish). opts.skill: false = geübt (Bot-Niveau)
export function simStageResult(model, run, spec, save, rng, opts = {}) {
  const act = run.act;
  const biome = biomeForAct(act);
  const c = cellAt(model, act, cellOf(spec.kind, spec.floor), opts.level ?? runPartLevel(run));
  const am = RS.runAsc(run);
  // Streuung: Strecken-Anteil (gleich für jeden Neuversuch derselben Strecke) + Abschuss-Anteil (je Versuch neu)
  const wf = model.withinFrac ?? 0.5;
  const zTrack = gauss(makeRng(hashSeed(`strecke:${spec.seed}:${spec.bossId || ''}`)));
  const z = Math.sqrt(1 - wf) * zTrack + Math.sqrt(wf) * gauss(rng);
  // empirische Verteilung der Messung (Quantil aus z), sonst log-normal
  let lr = (c.quantile ? c.quantile(normCdf(z)) : c.mu + c.sd * z) + itemLog(model, act, run.inventory);
  lr -= Math.log(opts.targetScale ? opts.targetScale(act, spec.kind) : 1);
  if (opts.skill !== false) lr += skillLog(save.meta.totalPlaytime);
  if (am.heatGainMul) lr += model.asc.heat || 0;
  if (am.fuelMaxMul) lr += model.asc.fuel || 0;
  // Modell: Weite ÷ Zielmarke der Messung (ohne Schrottstufe) → Weite in m; Medaille gegen die aktuellen Marken (spec)
  const fitBiome = model.targets && model.targets[act] ? { ...biome, targets: model.targets[act] } : biome;
  const dist = Math.exp(lr) * stageTarget(fitBiome, spec.kind, spec.floor, {});
  const max = RS.durabilityMax(run);
  const dmgFrac = c.dmg[Math.floor(rng.next() * c.dmg.length)] || 0;
  const damage = dmgFrac * max * ((run.runMods && run.runMods.damageMul) || 1);
  const durability = Math.max(0, run.durability - damage);
  const medal = medalFor(dist, spec.medals);
  const gain = Math.exp(lr - c.mu);
  const poisson = (l) => { let k = 0, p = Math.exp(-l), s = p; const u = rng.next(); while (u > s && k < 10) { k++; p *= l / k; s += p; } return k; };
  return {
    reason: durability <= 0 ? 'wreck' : 'stop', cleared: !!medal && durability > 0, medal: durability > 0 ? medal : null,
    dist, target: spec.target, medals: spec.medals, medalList: spec.medalList, kind: spec.kind, biome: spec.biome,
    bolts: Math.round(c.bolts * Math.min(2, gain) * ((run.runMods && run.runMods.boltMul) || 1)), scrap: Math.round(c.scrap * Math.min(2, gain)),
    blueprints: spec.blueprintX && dist >= spec.blueprintX ? 1 : 0, crates: poisson(c.crates * Math.min(2, gain)),
    damageTaken: run.durability - durability, durability, durabilityMax: max, stunts: { flips: 0, loops: 0 },
  };
}

// ======================================================================================
// 3. Spieler-Strategie
// ======================================================================================

const RAR = { common: 0, rare: 1, epic: 2, legendary: 3, cursed: 0 };
const tagCounts = (run) => {
  const c = {};
  for (const e of run.inventory) for (const p of entryParts(e)) for (const t of p.def.tags) c[t] = (c[t] || 0) + 1;
  return c;
};
// Wert eines Items für das Inventar (baut den stärksten Tag aus, Seltenheit)
const itemScore = (run, id) => {
  const it = itemById(id);
  if (!it) return -1;
  const c = tagCounts(run);
  return Math.max(...it.tags.map((t) => c[t] || 0)) * 6 + RAR[it.rarity] * 5 + it.tags.length * 2;
};
// Platz, der beim Ersetzen weichen muss (schwächster Tag, Flüche zuerst)
const weakestSlot = (run) => {
  const c = tagCounts(run);
  let slot = 0, low = Infinity;
  run.inventory.forEach((e, k) => {
    const ps = entryParts(e);
    const v = Math.max(...ps.flatMap((p) => p.def.tags.map((t) => c[t]))) * 6 + Math.max(...ps.map((p) => RAR[p.def.rarity])) * 5 + (e.tier || 1) * 8 - (ps.some((p) => p.def.rarity === 'cursed') ? 50 : 0);
    if (v < low) { low = v; slot = k; }
  });
  return slot;
};

function handleChoices(ctx) {
  const { run, save } = ctx;
  while (RS.pendingChoice(run)) {
    ctx.tick(SIM.sec.choice);
    const ch = RS.pendingChoice(run);
    if (ctx.noItems || !ch.items.length) { RS.skipChoice(run); continue; }
    let best = 0, bs = -Infinity;
    ch.items.forEach((id, i) => { const s = itemScore(run, id); if (s > bs) { bs = s; best = i; } });
    let res = RS.pickItem(run, save, best);
    if (!res.ok && res.reason === 'full') {
      // ersetzen nur, wenn das neue Item besser ist als das schwächste
      const slot = weakestSlot(run);
      res = itemScore(run, ch.items[best]) > 6 ? RS.pickItem(run, save, best, slot) : { ok: false };
    }
    if (!res.ok) RS.skipChoice(run);
  }
}

// Knotenwahl: Händler bei vollen Taschen, Schatz, Werkbank mit möglicher Fusion, Ereignis, Etappe; Elite nur gesund
function pickNode(ctx, reach) {
  const { run, rng } = ctx;
  const hp = run.durability / RS.durabilityMax(run);
  const score = (n) => {
    switch (n.type) {
      case 'station': return 10;
      case 'boss': return 10;
      case 'dealer': return ctx.noItems ? 0.5 : run.bolts >= 45 ? 4 : 1;
      case 'treasure': return ctx.noItems ? 0.5 : 3;
      case 'workbench': return ctx.noItems ? 0.5 : Workbench.fusionOptions(run).some((f) => f.kind === 'tier') ? 3 : 0.8;
      case 'event': return 2;
      case 'stage': return 2.2;
      case 'elite': return hp > 0.7 ? 2.4 : 0.6;
      case 'blackmarket': return 0.5;
      default: return 1;
    }
  };
  let best = reach[0], bs = -Infinity;
  for (const n of reach) { const s = score(n) + rng.next() * 0.8; if (s > bs) { bs = s; best = n; } }
  return best;
}

// Etappe (inkl. Neuversuche) spielen. Paket A: verfehlte Etappe/Elite → Notlandung (weiter auf der Karte); Boss →
// Neuversuch mit neuer Variante. ctx.stats.identical zählt Etappen-Starts mit derselben Strecke wie der Versuch davor.
function playStageNode(ctx, nodeId) {
  const { run, save, model, rng } = ctx;
  let prevKey = null;
  for (let guard = 0; guard < 40 && !run.over; guard++) {
    const cur = run.current;
    const spec = RS.stageSpecFor(run, mapNode(run.map, nodeId));
    const key = `${spec.seed}:${spec.bossId || ''}:${spec.target}`;
    if (key === prevKey) ctx.stats.identical = (ctx.stats.identical || 0) + 1;
    prevKey = key;
    ctx.tick((cur && cur.attempts > 0 ? SIM.sec.retry : SIM.sec.stage) + (ctx.stats.runs < CONTROLS.tutorialRuns ? SIM.sec.tutorial : 0));
    const result = simStageResult(model, run, spec, save, rng, ctx.stageOpts);
    const o = RS.applyStageResult(run, result, save);
    ctx.stats.stages++;
    if (o.missed) { RS.resolveMiss(run, ctx.retryMissed ? 'retry' : 'land'); if (run.current && !run.over) continue; return o; }
    if (o.towed && !o.defeat) continue;
    handleChoices(ctx);
    if (o.secondBoss) continue;   // Schrottstufe 15: Zwillingsboss
    return o;
  }
  return null;
}

function playShop(ctx, kind) {
  const { run, save } = ctx;
  ctx.tick(SIM.sec[kind] || 20);
  if (kind === 'station') {
    chooseStation(run, run.durability < RS.durabilityMax(run) * 0.7 ? 'repair' : 'fuel');
    return;
  }
  if (kind === 'dealer' && !ctx.noItems) {
    const v = Dealer.dealerView(run);
    const offers = v.offers.filter((o) => !o.sold && o.canAfford).sort((a, b) => itemScore(run, b.itemId) - itemScore(run, a.itemId));
    for (const o of offers.slice(0, 2)) {
      if (run.bolts < o.price) continue;
      const full = run.inventory.length >= RS.itemSlots(run);
      if (full && itemScore(run, o.itemId) < 12) continue;
      Dealer.buyOffer(run, save, o.index, full ? weakestSlot(run) : null);
    }
  } else if (kind === 'workbench' && !ctx.noItems) {
    const opt = Workbench.fusionOptions(run).find((f) => f.kind === 'tier');
    if (opt) Workbench.fuseItems(run, save, opt.a, opt.b);
  } else if (kind === 'event') {
    const v = TextEvent.eventView(run);
    const hp = run.durability / RS.durabilityMax(run);
    const opts = v.options.filter((o) => o.available && !(o.chooseItem && !run.inventory.length));
    const safe = opts.filter((o) => hp > 0.5 || !/%/.test(o.costText));
    const o = (safe.length ? safe : opts)[0];
    if (o) {
      TextEvent.chooseOption(run, save, o.index, { slot: o.chooseItem ? weakestSlot(run) : undefined });
      let g = 0;
      while (TextEvent.eventView(run).pending.length && g++ < 5) TextEvent.resolvePending(run, save, weakestSlot(run));
      if (run.current && run.current.type === 'elite') { handleChoices(ctx); playStageNode(ctx, run.current.node); return; }
    }
    handleChoices(ctx);
  } else if (kind === 'treasure' && !ctx.noItems) {
    const st = Treasure.openTreasure(run);
    const hp = run.durability / RS.durabilityMax(run);
    if (!st.suspicious || st.hook !== 'damage' || hp > 0.4) { Treasure.takeTreasure(run, save); handleChoices(ctx); }
  }
  if (run.current && run.current.type === kind) RS.leaveNode(run);
}

// Einen ganzen Run spielen. Ergebnis: endRun-Ergebnis
export function playRun(ctx) {
  const { save } = ctx;
  const run = save.run;
  ctx.run = run;
  ctx.tick(SIM.sec.runStart);
  handleChoices(ctx);
  for (let step = 0; step < 200 && !run.over; step++) {
    const reach = RS.reachableNodes(run);
    if (!reach.length) break;
    const node = pickNode(ctx, reach);
    const e = RS.enterNode(run, node.id);
    if (!e.ok) break;
    if (e.kind === 'stage') playStageNode(ctx, node.id);
    else playShop(ctx, e.kind);
  }
  ctx.tick(SIM.sec.runEnd);
  return RS.endRun(save, run);
}

// Garage zwischen den Runs: Forschung (billigste zuerst, Feinschliff zuletzt), Chassis (sobald möglich),
// Teile-Stufen (billigste Verbesserung der ausgerüsteten Teile). Ergebnis: Anzahl Käufe
export function garageShopping(save, ctx = null) {
  let buys = 0;
  for (let g = 0; g < 200; g++) {
    const avail = LAB.RESEARCH.filter((n) => { const st = LAB.researchState(save, n); return st.canBuy && !n.repeatable; })
      .sort((a, b) => LAB.researchState(save, a).cost - LAB.researchState(save, b).cost);
    if (!avail.length) break;
    LAB.buyResearch(save, avail[0].id);
    markMilestone(save, 'firstResearch');
    buys++;
  }
  // wiederholbare Forschung (Feinschliff) erst, wenn der Baum fertig ist
  if (LAB.RESEARCH.every((n) => n.repeatable || LAB.isResearched(save, n.id))) {
    for (let g = 0; g < 50; g++) {
      const rep = LAB.RESEARCH.filter((n) => n.repeatable && LAB.researchState(save, n).canBuy).sort((a, b) => LAB.researchState(save, a).cost - LAB.researchState(save, b).cost);
      if (!rep.length) break;
      LAB.buyResearch(save, rep[0].id);
      buys++;
    }
  }
  // Chassis: billigstes kaufbares (wechselt nicht – Chassis sind Seitwärts-Schritte), danach zurück zur Seifenkiste
  const keep = save.garage.chassis;
  for (const c of [...CHASSIS].sort((a, b) => (a.unlock?.cores || 0) - (b.unlock?.cores || 0))) {
    if (G.chassisState(save, c).canBuy) { G.buyChassis(save, c.id); markMilestone(save, 'firstChassisUnlocked'); checkAllChassis(save); buys++; }
  }
  save.garage.chassis = keep;
  // Teile-Stufen: billigste Verbesserung eines ausgerüsteten Teils
  for (let g = 0; g < 400; g++) {
    let best = null, bc = Infinity;
    for (const slot of SLOTS) {
      const id = save.garage.parts[slot];
      const st = G.partState(save, partById(id));
      if (st.canUpgrade && st.upgradeCost < bc) { bc = st.upgradeCost; best = id; }
    }
    if (!best) break;
    G.upgradePart(save, best);
    markMilestone(save, 'firstPartUpgrade');
    buys++;
  }
  if (ctx) ctx.tick(SIM.sec.garage + buys * SIM.sec.buy);
  return buys;
}

// Karriere einer Person: Runs bis Schrottstufe 15 gewonnen (oder maxHours). Ergebnis: Meilensteine (s), Statistik
export function simulateCareer(model, { seed = 1, maxHours = SIM.maxHours, log = null } = {}) {
  const save = defaultSave();
  const rng = makeRng(`karriere:${seed}`);
  const ctx = {
    save, model, rng, run: null, noItems: false, stageOpts: {},
    stats: { runs: 0, wins: 0, stages: 0 },
    tick: (s) => { save.meta.totalPlaytime += s; },
  };
  const runs = [];
  while (save.meta.totalPlaytime < maxHours * 3600 && save.meta.milestones.ascension15 === undefined) {
    garageShopping(save, ctx);
    selectAscension(save, ascensionState(save).unlocked);   // immer die höchste freigeschaltete Stufe
    save.run = RS.newRun(save, { seed: rng.int(1, 2 ** 30) });
    markMilestone(save, 'firstRunStart');
    const res = playRun(ctx);
    ctx.stats.runs++;
    if (res.won) ctx.stats.wins++;
    runs.push({ t: save.meta.totalPlaytime, won: res.won, act: res.act, asc: res.ascension, scrap: res.payout.scrap });
    if (log) log(`${fmtH(save.meta.totalPlaytime)} Run ${ctx.stats.runs}: ${res.won ? 'SIEG' : `Akt ${res.act}`} ☠${res.ascension} ⚙${res.payout.scrap} St.${runPartLevel({ parts: Object.fromEntries(SLOTS.map((s) => [s, { level: G.partLevel(save, save.garage.parts[s]) }])) }).toFixed(1)}`);
  }
  return {
    seed,
    milestones: { ...save.meta.milestones },
    hours: save.meta.totalPlaytime / 3600,
    runs: ctx.stats.runs, wins: ctx.stats.wins, stages: ctx.stats.stages,
    firstRun: runs[0] || null,
    asc: ascensionState(save).best,
    scrap: save.meta.scrap, cores: save.meta.cores,
    partLevel: mean(SLOTS.map((s) => G.partLevel(save, save.garage.parts[s]))),
    chassis: save.garage.ownedChassis.length,
    runLog: runs,
  };
}

// „Ein schlechter Run muss auch mit voller Meta scheitern können“: alle Startteile Stufe 20, ganzer Baum erforscht,
// keine Items (immer Schrauben, keine Shops) bzw. schlechte Items (nur Gewöhnliche, kein Plan). Ergebnis: Sieg-Anteile
export function badRunCheck(model, { n = 200, seed = 1 } = {}) {
  const out = {};
  for (const mode of ['ohne', 'schlecht']) {
    let wins = 0;
    const acts = { 1: 0, 2: 0, 3: 0 };
    for (let i = 0; i < n; i++) {
      const save = levelSave(GARAGE.maxPartLevel);
      LAB.completeAllResearch(save);
      save.meta.totalPlaytime = 50 * 3600;   // geübt
      const rng = makeRng(`schlecht:${mode}:${seed}:${i}`);
      const ctx = { save, model, rng, run: null, noItems: mode === 'ohne', stageOpts: { skill: false }, stats: { runs: 0, wins: 0, stages: 0 }, tick: () => {} };
      save.run = RS.newRun(save, { seed: rng.int(1, 2 ** 30) });
      if (mode === 'schlecht') {
        // nur Gewöhnliche, zufällig – kein Plan, keine Shops
        ctx.noItems = true;
        save.run.inventory = [];
        const commons = ITEMS.filter((it) => it.rarity === 'common');
        for (let k = 0; k < 6; k++) RS.giveItem(save.run, save, rng.pick(commons).id, { force: true });
      }
      const res = playRun(ctx);
      if (res.won) wins++; else acts[res.act]++;
    }
    out[mode] = { win: wins / n, end: [1, 2, 3].map((a) => acts[a] / n) };
  }
  return out;
}

// Mehrere Karrieren zusammenfassen: Median je Meilenstein
export const KEY_MILESTONES = [
  ['firstRunEnd', 'Erster Run', 'firstRun'],
  ['firstBossAct1', 'Erster Akt-1-Boss besiegt', 'firstBossAct1'],
  ['firstWin', 'Erster Run-Sieg', 'firstWin'],
  ['allChassis', 'Alle Chassis', 'allChassis'],
  ['ascension5', 'Sieg auf Schrottstufe 5', null],
  ['ascension10', 'Sieg auf Schrottstufe 10', null],
  ['ascension15', 'Alles inkl. Schrottstufe 15', 'ascension15'],
];

export function summarizeCareers(careers) {
  const rows = KEY_MILESTONES.map(([id, name, target]) => {
    const vals = careers.map((c) => c.milestones[id]).filter((v) => v !== undefined);
    const med = vals.length === careers.length ? median(vals) : null;
    const tg = target ? PROGRESSION.targets[target].map((h) => h * 3600) : null;
    const ok = tg && med !== null ? med >= tg[0] && med <= tg[1] : null;
    return { id, name, target: tg, median: med, min: vals.length ? Math.min(...vals) : null, max: vals.length ? Math.max(...vals) : null, reached: vals.length, ok };
  });
  return rows;
}

// ---------- Markdown ----------
export function progressionSection({ careers, rows, bad, botBad = null, model, secs }) {
  const L = [];
  L.push(MARK);
  L.push('## Progression & Ökonomie (Phase 6, mit Paket A nachgemessen)');
  L.push('');
  L.push(`> Erzeugt von \`node tools/sim/progression.mjs\` (${careers.length} Karrieren, Modell vom ${model.created} mit ${model.n} Etappen je Zelle; Rechenzeit ${secs} s). Modell neu messen: \`--fit\`.`);
  L.push('');
  L.push('**Verfahren.** Der Bot misst je Akt, Knotenart/Etage und Slot-Stufe 0/3/5/8/10 (alle Slots) die Weite ÷ Ziel (log-normal), Schaden, Schrauben, Schrott und Item-Kisten; dazu die Wirkung von Items (zufällige Builds mit 2/4/6 Items, 4 Items je Seltenheit, Set-Builds 2/4/6 eines Tags) und der Schrottstufen-Physik. Die Karriere läuft mit der echten Run-Logik (Karte, Händler, Werkbank, Ereignisse, Schatz, Tankstelle, Item-Auswahl mit Synergie-Strategie, Belohnungen, Schrottstufen); nur das Etappen-Ergebnis wird aus dem Modell gewürfelt. Zwischen den Runs: Forschung (billigste zuerst), Chassis sobald bezahlbar, dann die billigste Slot-Verbesserung. Nach dem ersten Sieg spielt die Person immer die höchste freigeschaltete Schrottstufe. Paket A: verfehlte Etappen enden mit Notlandung (die Person nimmt nie „Nochmal“), jeder Neuversuch hat eine neue Strecke (eigene Streuung).');
  L.push('');
  L.push(`**Annahmen:** Etappe ${SIM.sec.stage} s (Neuversuch ${SIM.sec.retry} s; in den ersten ${CONTROLS.tutorialRuns} Runs + ${SIM.sec.tutorial} s für Hinweise), Item-Auswahl ${SIM.sec.choice} s, Händler ${SIM.sec.dealer} s, Ereignis ${SIM.sec.event} s, Werkbank ${SIM.sec.workbench} s, Schatz/Tankstelle ${SIM.sec.treasure} s, Garage ${SIM.sec.garage} s + ${SIM.sec.buy} s je Kauf, Run-Ende ${SIM.sec.runEnd} s. Einarbeitung: Weite × ${String(SIM.skill.start).replace('.', ',')} am Anfang, nach ≈ ${String(SIM.skill.tauH).replace('.', ',')} h zu 63 % aufgeholt (Bot-Niveau).`);
  L.push('');
  L.push('| Meilenstein | Ziel (V2-DESIGN §8) | Median | Spanne | im Korridor |');
  L.push('|---|---|---|---|---|');
  for (const r of rows) {
    const tg = r.target ? (r.id === 'firstRunEnd' ? `${fmtMin(r.target[0])}–${fmtMin(r.target[1])}` : `${fmtH(r.target[0])}–${fmtH(r.target[1])}`) : '–';
    const f = (s) => (s === null ? '–' : r.id === 'firstRunEnd' ? fmtMin(s) : fmtH(s));
    L.push(`| ${r.name} | ${tg} | ${f(r.median)} | ${f(r.min)} – ${f(r.max)} (${r.reached}/${careers.length}) | ${r.ok === null ? '–' : r.ok ? '✔' : '✗'} |`);
  }
  L.push('');
  const c0 = careers.map((c) => c.firstRun).filter(Boolean);
  const first12 = c0.filter((r) => !r.won && r.act <= 2).length;
  L.push(`- Erster Run: endet in ${first12}/${c0.length} Karrieren in Akt 1–2 (Akte: ${c0.map((r) => (r.won ? 'Sieg' : r.act)).join(', ')}).`);
  L.push(`- Runs bis Schrottstufe 15: Median ${median(careers.map((c) => c.runs))}, Siege ${median(careers.map((c) => c.wins))}, Etappen ${median(careers.map((c) => c.stages))}; am Ende Ø Slot-Stufe ${median(careers.map((c) => c.partLevel)).toFixed(1).replace('.', ',')}, ${median(careers.map((c) => c.chassis))}/9 Chassis, ${Math.round(median(careers.map((c) => c.scrap)))} ⚙ übrig (Senken: Lackierungen ≈ 103.000 ⚙, weitere Teile und deren Stufen – kauft die simulierte Person nicht).`);
  L.push('');
  L.push('**Schlechter Run mit voller Meta** (alle Slots Stufe 10, ganzer Forschungsbaum, Modell ohne Einarbeitung):');
  L.push('');
  L.push('| Items | Sieg | Ende Akt 1 | Akt 2 | Akt 3 |');
  L.push('|---|---|---|---|---|');
  for (const [k, o] of Object.entries(bad)) L.push(`| ${k === 'ohne' ? 'keine (immer Schrauben, keine Shops)' : '6 zufällige Gewöhnliche, kein Plan'} | ${fmtPct(o.win)} | ${o.end.map(fmtPct).join(' | ')} |`);
  if (botBad) L.push(`| keine – echter Bot, ganze Runs (${botBad.n}) | ${fmtPct(botBad.win)} | ${botBad.end.map(fmtPct).join(' | ')} |`);
  L.push('');
  L.push(`Regel „ein schlechter Run muss auch mit voller Meta scheitern können“ (Sieg < 30 %): ${Object.values(bad).every((o) => o.win < 0.3) && (!botBad || botBad.win < 0.3) ? '✔ erfüllt' : '✗ verletzt'}.`);
  L.push('');
  L.push('**Mit dem Simulator nachgezogen (Phase 6)** – mit den Werten aus Phase 5 lag der erste Akt-1-Boss bei 0,3–1,0 h, der erste Sieg bei 2,8–6,7 h, Schrottstufe 15 bei ≈ 20–24 h (Median je 3–16 Karrieren), und „alle Chassis“ wurde nie erreicht (30 💠 Kosten, ≈ 20 💠 bis Schrottstufe 15):');
  L.push('');
  L.push('| Wert | vorher | jetzt | Wirkung |');
  L.push('|---|---|---|---|');
  L.push('| Akt-1-Boss-Ziel (`biomes.js`) | 510 m | 570 m (×1,12) | erster Akt-1-Boss in den Korridor 1–2 h |');
  L.push('| Akt-2-Ziele / Boss | 490–570 / 625 m | 520–605 / 660 m (×1,06) | erster Sieg in den Korridor 6–10 h |');
  L.push('| Akt-3-Ziele / Boss | 560–665 / 730 m | 565–670 / 740 m (×1,01) | Zwischenstand ×1,1 machte Schrottstufe 15 zu langsam (> 50 h) – fast zurückgenommen |');
  L.push('| `GARAGE.chassisCoreMul` (neu) | – (2–6 💠, Σ 30) | 0,4 (1–2 💠, Σ 12) | alle Chassis ≈ 25 h statt nie |');
  L.push('| Einzel-Items (Bot-Ausreißer) | Nadeldose, Blitzableiter, Perpetuum Mobile, Schraubenvergaser | siehe PHASEN.md Phase 6 | ohne Items mit voller Meta gewann der Bot vorher ≈ 12 % der Runs allein mit der Nadeldose als Start-Item |');
  L.push('');
  L.push('Unverändert geprüft (Phase 6): Kerne je Sieg (1) – 2 Kerne je Sieg machten Kerne inflationär.');
  L.push('');
  L.push('**Paket A (docs/OVERHAUL.md „Umsetzungsstand Paket A“)** – jeder Versuch zahlt, Notlandung statt identischem Neuversuch, Boss-Neuversuch mit neuer Variante und −5 % Ziel, Slot-Stufen 0–10 (60 × 1,32^L), schnellere Etappen (SIM.sec 75 → 45 s). Damit wurden Runs deutlich ergiebiger und leichter; ohne Gegengewicht lagen erster Sieg bei ≈ 1,8 h und Schrottstufe 15 bei ≈ 17 h (6 Karrieren). Nachgezogen:');
  L.push('');
  L.push('| Wert | vorher | jetzt | Wirkung |');
  L.push('|---|---|---|---|');
  L.push('| `RESEARCH.costMul` | 1 | 1,5 | viel mehr Blaupausen (Gold-Chance, Boss-Begegnung, Elite 2) – der Baum wäre nach ≈ 10 h fertig |');
  L.push('| Schrottstufe 2 `targetMul` / 7 `bossTargetMul` | 1,08 / 1,15 | 1,12 / 1,22 | Langzeitkurve: Schrottstufe 15 wieder 30–50 h |');
  L.push('| Akt-3-Boss-Ziel (`biomes.js`) | 740 m | 830 m | erster Sieg ≈ 3 h statt ≈ 2 h (Boss-Neuversuche werden bis −15 % leichter) |');
  L.push('| Zielkorridore (`PROGRESSION.targets`) | erster Run 10–15 min, Akt-1-Boss 1–2 h, Sieg 6–10 h, alle Chassis 20–30 h | 8–15 min, 0,5–1 h, 3–5 h, 15–25 h | Ziele aus OVERHAUL §5/§6 (Paket A: erster Boss ≤ 45 min; Gesamtbild: Sieg 3–5 h); Schrottstufe 15 bleibt 30–50 h |');
  L.push('');
  return L.join('\n');
}

export function writeSection(text) {
  const file = path.join(ROOT, 'docs', 'BALANCE.md');
  let doc = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const i = doc.indexOf(MARK);
  if (i >= 0) {
    // Abschnitt bis zur nächsten Marke (oder Dateiende) ersetzen
    const rest = doc.slice(i + MARK.length);
    const j = rest.indexOf('<!-- ');
    // Abschnitt bis zur nächsten Marke ersetzen, alles danach (z. B. <!-- paket-a -->, Leistung) bleibt stehen
    const after = j >= 0 ? rest.slice(j) : '';
    doc = `${doc.slice(0, i).trimEnd()}\n\n${text}${after ? `\n\n${after}` : '\n'}`;
    fs.writeFileSync(file, doc);
    return;
  }
  doc = `${doc.trimEnd()}\n\n${text}`;
  fs.writeFileSync(file, doc);
}

// Echter Bot: volle Meta, keine Items, ganze Runs
export async function botBadCheck(n = 12) {
  const bot = await botTools();
  const { Stage } = await import('../../www/src/stage/stage.js');
  const { Track } = await import('../../www/src/physics/track.js');
  let wins = 0;
  const acts = { 1: 0, 2: 0, 3: 0 };
  for (let i = 0; i < n; i++) {
    const save = levelSave(GARAGE.maxPartLevel);
    LAB.completeAllResearch(save);
    const run = RS.newRun(save, { seed: 900 + i });
    let stages = 0;
    for (let step = 0; step < 150 && !run.over; step++) {
      const reach = RS.reachableNodes(run);
      const node = reach.find((x) => x.type === 'station') || reach.find((x) => x.type === 'stage' || x.type === 'boss') || reach[0];
      const e = RS.enterNode(run, node.id);
      if (e.kind === 'station') { chooseStation(run, run.durability < RS.durabilityMax(run) * 0.7 ? 'repair' : 'fuel'); continue; }
      if (e.kind !== 'stage') { if (run.current && run.current.type === e.kind) RS.leaveNode(run); continue; }
      for (let a = 0; a < 30 && !run.over && run.current; a++) {
        const su = RS.runStageSetup(run, save);
        const biome = biomeForAct(run.act);
        const spec = RS.stageSpecFor(run, mapNode(run.map, run.current.node));
        let result = null;
        const stage = new Stage({ biome, spec, track: new Track(spec, biome), loadout: su.loadout, seed: hashSeed(`${run.seed}:${run.current.node}:${run.current.attempts}`), durability: run.durability, runMods: run.runMods, inventory: su.inventory, runInfo: su.runInfo, hooks: { end: (r) => { result = r; } } });
        bot.playStage(stage, () => result, { seed: i * 31 + stages++ });
        const o = RS.applyStageResult(run, result, save);
        if (o.missed) RS.resolveMiss(run, 'land');
        while (RS.pendingChoice(run)) RS.skipChoice(run);
        if (!o.towed && !o.secondBoss) break;
      }
    }
    if (run.over && run.over.won) wins++; else acts[run.over ? run.over.act : run.act]++;
  }
  return { n, win: wins / n, end: [1, 2, 3].map((a) => acts[a] / n) };
}

// ---------- Kommandozeile ----------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? Number(args[i + 1]) : def; };
  const t0 = Date.now();
  let model;
  if (args.includes('--fit') || !fs.existsSync(MODEL_FILE)) {
    model = await fitModel({ n: opt('n', 12), nItems: opt('ni', 10) });
    fs.writeFileSync(MODEL_FILE, JSON.stringify(model));
    console.log(`Modell gespeichert: ${MODEL_FILE} (${model.secs} s)`);
  } else model = loadModel();
  const nc = opt('careers', 6);
  const careers = [];
  for (let s = 1; s <= nc; s++) {
    const c = simulateCareer(model, { seed: s, log: args.includes('--verbose') ? console.log : null });
    careers.push(c);
    console.log(`Karriere ${s}: ${KEY_MILESTONES.map(([id, name]) => `${name} ${c.milestones[id] !== undefined ? fmtH(c.milestones[id]) : '–'}`).join(' · ')} | ${c.runs} Runs, ${c.wins} Siege`);
  }
  const rows = summarizeCareers(careers);
  for (const r of rows) console.log(`${r.name.padEnd(30)} Median ${r.median === null ? '–' : fmtH(r.median)}  ${r.ok === null ? '' : r.ok ? '✔' : '✗'}`);
  const bad = badRunCheck(model, { n: opt('bad', 200) });
  console.log(`Schlechter Run, volle Meta: ${Object.entries(bad).map(([k, o]) => `${k} Sieg ${fmtPct(o.win)}`).join(' · ')}`);
  const botBad = args.includes('--bot') ? await botBadCheck(opt('botruns', 12)) : null;
  if (botBad) console.log(`Echter Bot, volle Meta, keine Items: Sieg ${fmtPct(botBad.win)} (${botBad.n} Runs)`);
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  if (!args.includes('--no-write')) {
    writeSection(progressionSection({ careers, rows, bad, botBad, model, secs }));
    console.log(`Abschnitt „Progression“ in docs/BALANCE.md geschrieben (${secs} s)`);
  }
}
