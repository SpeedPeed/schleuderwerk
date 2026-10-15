// Roguelite-Run (ARCHITEKTUR.md §8): reiner, serialisierbarer Zustand + Aktionen. Kein three.js, kein DOM.
// Der Run liegt in save.run und wird nach jeder Aktion gespeichert (main.js) → nach App-Neustart fortsetzbar.
//
// Ablauf: newRun(save) → Karte Akt 1 → reachableNodes → enterNode → (Etappe: stageSpecFor → Stage →
//   applyStageResult | Tankstelle: chooseStation | Platzhalter: visitPlaceholder) → … → Boss → nächster Akt
//   → … → Boss Akt 3 = Sieg. Haltbarkeit 0 = Niederlage. endRun(save, run) zahlt Meta-Belohnungen aus.
//
// Run-Zustand:
// { v, seed, ascension, chassisId, parts: {slot: {id, level}}, abilities, act, biome, bossIds: {act: id}, map,
//   pos: {floor, node}, current: {node, type, attempts} | null, visited: [ids], path: [ids],
//   durability, durabilityBase, bolts, inventory, reserve, runMods: {fuelMaxAdd, coolMul, durabilityMaxAdd},
//   counters, history, stats, earned: {scrap, blueprints, cores, actScrap}, bossesBeaten: [acts], over }
import { RUN, REWARDS } from '../data/balance.js';
import { NODE_TYPES } from '../data/nodes.js';
import { biomeForAct } from '../data/biomes.js';
import { SLOTS } from '../data/index.js';
import { makeRng, hashSeed } from '../core/rng.js';
import { generateActMap, mapNode, isStageType, BOSS_FLOOR } from '../map/mapGen.js';
import { generateStageSpec } from '../physics/trackGen.js';
import { buildLoadout } from '../garage/loadout.js';
import { markMilestone } from '../garage/progression.js';
import { stageRewards, placeholderReward, runPayout } from './rewards.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// ---------- Aufbau ----------

// Pseudo-Spielstand für buildLoadout aus der Run-Ausrüstung (die Ausrüstung ist für den Run fest)
export function runLoadoutSave(run, save = null) {
  const parts = {}, partLevels = {};
  for (const slot of SLOTS) {
    const p = run.parts[slot];
    if (!p) continue;
    parts[slot] = p.id;
    partLevels[p.id] = p.level || 0;
  }
  return {
    garage: { chassis: run.chassisId, parts, partLevels, abilities: [...run.abilities] },
    research: { done: save && save.research ? [...save.research.done] : [] },
  };
}

export function runLoadout(run, save = null) {
  return buildLoadout(runLoadoutSave(run, save));
}

// Max. Haltbarkeit im Run (Garage-Wert beim Start + Run-Effekte)
export const durabilityMax = (run) => Math.max(1, run.durabilityBase + (run.runMods.durabilityMaxAdd || 0));

// Neuen Run aus der aktuellen Garage-Auswahl. opts: { seed, ascension }
export function newRun(save, opts = {}) {
  const seed = (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0;
  const lo = buildLoadout(save);
  const parts = {};
  for (const slot of SLOTS) if (lo.parts[slot]) parts[slot] = { id: lo.parts[slot].id, level: lo.parts[slot].level };
  const run = {
    v: RUN.version,
    seed,
    ascension: opts.ascension || 0,
    chassisId: lo.chassis.id,
    parts,
    abilities: lo.abilities.filter((id) => id !== lo.special),
    act: 1,
    biome: null,
    bossIds: {},
    map: null,
    pos: { floor: -1, node: null },
    current: null,
    visited: [],
    path: [],
    durability: lo.stats.durabilityMax,
    durabilityBase: lo.stats.durabilityMax,
    bolts: 0,
    inventory: [],
    reserve: [],
    runMods: { fuelMaxAdd: 0, coolMul: 0, durabilityMaxAdd: 0 },
    counters: {},
    history: [],
    stats: {
      stages: 0, cleared: 0, tows: 0, medals: { bronze: 0, silver: 0, gold: 0 }, dist: 0, bestDist: 0,
      damage: 0, boltsEarned: 0, stations: 0, crates: 0, flips: 0, loops: 0, nodes: 0,
    },
    earned: { scrap: 0, blueprints: 0, cores: 0, actScrap: 0 },
    bossesBeaten: [],
    over: null,
    research: save && save.research ? [...save.research.done] : [],
  };
  setupAct(run, 1);
  return run;
}

// Karte und Boss eines Akts auswürfeln (deterministisch aus Run-Seed und Akt)
function setupAct(run, act) {
  const biome = biomeForAct(act);
  const rng = makeRng(hashSeed(`${run.seed}:akt:${act}`));
  const bossId = rng.fork('boss').pick(biome.bosses).id;
  run.act = act;
  run.biome = biome.id;
  run.bossIds[act] = bossId;
  run.map = generateActMap(act, rng.fork('karte'), { research: run.research || [], bossId });
  run.pos = { floor: -1, node: null };
  run.current = null;
  run.path = [];
}

// Ist ein gespeicherter Run brauchbar? (Format, Pflichtfelder) – sonst wird er verworfen
export function isValidRun(run) {
  return isObj(run) && run.v === RUN.version && isObj(run.map) && Array.isArray(run.map.floors) && isObj(run.map.boss)
    && typeof run.act === 'number' && typeof run.durability === 'number' && isObj(run.parts) && Array.isArray(run.visited)
    && isObj(run.pos) && isObj(run.stats) && isObj(run.earned) && isObj(run.runMods);
}

// ---------- Abfragen ----------

export const currentBiome = (run) => biomeForAct(run.act);

// Knoten, die als Nächstes gewählt werden können (läuft gerade ein Knoten, nur dieser)
export function reachableNodes(run) {
  if (run.over) return [];
  if (run.current) return [mapNode(run.map, run.current.node)].filter(Boolean);
  if (run.pos.floor < 0) return [...run.map.floors[0]];
  const here = mapNode(run.map, run.pos.node);
  return here ? here.next.map((id) => mapNode(run.map, id)).filter(Boolean) : [];
}

export const canEnter = (run, id) => reachableNodes(run).some((n) => n.id === id);

// Etappen-Spezifikation eines Knotens (deterministisch: Run-Seed + Akt + Knoten → derselbe Neuversuch)
export function stageSpecFor(run, node) {
  const n = typeof node === 'string' ? mapNode(run.map, node) : node;
  if (!n || !isStageType(n.type)) return null;
  const rng = makeRng(hashSeed(`${run.seed}:${run.act}:${n.id}`));
  return generateStageSpec({
    biome: currentBiome(run), kind: n.type, floor: n.floor, act: run.act, rng,
    bossId: n.type === 'boss' ? run.bossIds[run.act] || n.bossId : null, mods: {},
  });
}

// ---------- Aktionen ----------

// Knoten betreten. Ergebnis: { ok, node, kind: 'stage'|'station'|'placeholder', spec? } oder { ok: false, reason }
export function enterNode(run, id) {
  if (run.over) return { ok: false, reason: 'over' };
  if (run.current && run.current.node !== id) return { ok: false, reason: 'busy' };
  if (!run.current && !canEnter(run, id)) return { ok: false, reason: 'unreachable' };
  const node = mapNode(run.map, id);
  if (!run.current) {
    run.current = { node: id, type: node.type, attempts: 0 };
    run.pos = { floor: node.floor, node: id };
    run.path.push(id);
    run.stats.nodes++;
  }
  if (isStageType(node.type)) return { ok: true, node, kind: 'stage', spec: stageSpecFor(run, node) };
  if (node.type === 'station') return { ok: true, node, kind: 'station', options: stationOptions() };
  return { ok: true, node, kind: 'placeholder', reward: placeholderReward(node.type) };
}

// Knoten abschließen (Boss → nächster Akt bzw. Sieg)
function completeNode(run) {
  const id = run.current.node;
  const node = mapNode(run.map, id);
  run.visited.push(id);
  run.pos = { floor: node.floor, node: id };
  run.current = null;
  return node;
}

// Ergebnis einer Etappe übernehmen. save (optional): Meilensteine stempeln, erste Boss-Siege → Kerne.
// Ergebnis: { cleared, medal, rewards, towed, towPenalty, defeat, actComplete, nextAct, won, attempts }
export function applyStageResult(run, result, save = null) {
  const cur = run.current;
  if (!cur || !isStageType(cur.type)) return { ok: false, reason: 'noStage' };
  const kind = cur.type;
  const s = run.stats;
  const out = { ok: true, kind, cleared: !!result.cleared, medal: result.medal || null, towed: false, towPenalty: 0, defeat: false, actComplete: false, nextAct: null, won: false };
  run.durability = Math.max(0, Math.min(durabilityMax(run), result.durability));
  s.stages++;
  s.dist += result.dist || 0;
  s.bestDist = Math.max(s.bestDist, result.dist || 0);
  s.damage += result.damageTaken || 0;
  s.crates += result.crates || 0;
  if (result.stunts) { s.flips += result.stunts.flips || 0; s.loops += result.stunts.loops || 0; }
  const rw = stageRewards(run.act, kind, result);
  out.rewards = rw;
  run.bolts += rw.bolts;
  s.boltsEarned += rw.bolts;
  run.earned.scrap += rw.scrap;
  run.earned.blueprints += rw.blueprints;
  run.history.push({ act: run.act, node: cur.node, kind, dist: result.dist, target: result.target, medal: out.medal, reason: result.reason });

  if (result.reason === 'wreck' || run.durability <= 0) {
    out.defeat = true;
    run.over = { won: false, reason: 'wreck', act: run.act };
    return out;
  }
  if (!out.cleared) {
    // Abschleppen: Strafe, dann Neuversuch derselben Etappe
    const pen = Math.round(durabilityMax(run) * RUN.towPenalty * 10) / 10;
    out.towed = true;
    out.towPenalty = pen;
    run.durability = Math.max(0, run.durability - pen);
    s.tows++;
    cur.attempts++;
    out.attempts = cur.attempts;
    if (run.durability <= 0) {
      out.defeat = true;
      run.over = { won: false, reason: 'tow', act: run.act };
    }
    return out;
  }
  s.cleared++;
  s.medals[out.medal] = (s.medals[out.medal] || 0) + 1;
  completeNode(run);
  if (kind === 'boss') {
    out.actComplete = true;
    run.bossesBeaten.push(run.act);
    const actBonus = REWARDS.actScrap[run.act] || 0;
    run.earned.scrap += actBonus;
    run.earned.actScrap += actBonus;
    out.actBonus = actBonus;
    // erster Boss-Sieg dieses Akts (laut Meilenstein im Spielstand) → Kerne
    if (save && markMilestone(save, `firstBossAct${run.act}`) && REWARDS.firstBossCores[run.act]) {
      run.earned.cores += REWARDS.firstBossCores[run.act];
      out.cores = REWARDS.firstBossCores[run.act];
    }
    if (run.act >= RUN.acts) {
      out.won = true;
      run.earned.cores += REWARDS.winCores;
      run.over = { won: true, reason: 'win', act: run.act };
    } else {
      out.nextAct = run.act + 1;
      setupAct(run, run.act + 1);
      if (save) markMilestone(save, `firstAct${run.act}`);
    }
  }
  return out;
}

// Tankstelle: Wahl für den Run (Zahlen aus data/nodes.js → station.params)
export function stationOptions() {
  const p = NODE_TYPES.station.params;
  return [
    { id: 'repair', icon: '🔧', name: 'Reparieren', desc: `+${Math.round(p.repairPct * 100)} % Haltbarkeit` },
    { id: 'fuel', icon: '⛽', name: 'Volltanken', desc: `+${p.fuelMaxAdd} max. Treibstoff für den Run` },
    { id: 'cool', icon: '❄️', name: 'Kühlerspülung', desc: `+${Math.round(p.coolMul * 100)} % Kühlung für den Run` },
  ];
}

export function chooseStation(run, choice) {
  const cur = run.current;
  if (!cur || cur.type !== 'station') return { ok: false, reason: 'noStation' };
  const p = NODE_TYPES.station.params;
  const out = { ok: true, choice };
  if (choice === 'repair') {
    const before = run.durability;
    run.durability = Math.min(durabilityMax(run), run.durability + durabilityMax(run) * p.repairPct);
    out.healed = Math.round(run.durability - before);
  } else if (choice === 'fuel') run.runMods.fuelMaxAdd += p.fuelMaxAdd;
  else if (choice === 'cool') run.runMods.coolMul += p.coolMul;
  else return { ok: false, reason: 'choice' };
  run.stats.stations++;
  completeNode(run);
  return out;
}

// Platzhalter-Knoten (bis Phase 5): kleiner Bonus, Knoten gilt als besucht
export function visitPlaceholder(run) {
  const cur = run.current;
  if (!cur || isStageType(cur.type) || cur.type === 'station') return { ok: false, reason: 'noPlaceholder' };
  const rw = placeholderReward(cur.type);
  run.bolts += rw.bolts;
  run.stats.boltsEarned += rw.bolts;
  completeNode(run);
  return { ok: true, type: cur.type, bolts: rw.bolts };
}

// Aufgeben (Pause-Menü / Garage)
export function giveUp(run) {
  if (!run.over) run.over = { won: false, reason: 'giveup', act: run.act };
  run.current = null;
  return run.over;
}

// Run beenden: Meta-Auszahlung, Statistik, Meilensteine; save.run wird null.
// Ergebnis: { won, reason, act, payout: { scrap, blueprints, cores, rows }, stats }
export function endRun(save, run = save.run) {
  if (!run) return null;
  if (!run.over) giveUp(run);
  const payout = runPayout(run);
  save.meta.scrap += payout.scrap;
  save.meta.blueprints += payout.blueprints;
  save.meta.cores += payout.cores;
  const st = save.stats;
  st.runs = (st.runs || 0) + 1;
  st.totalScrap = (st.totalScrap || 0) + payout.scrap;
  st.totalBolts = (st.totalBolts || 0) + run.stats.boltsEarned;
  st.bestDist = Math.max(st.bestDist || 0, run.stats.bestDist);
  st.bestAct = Math.max(st.bestAct || 0, run.over.won ? RUN.acts + 1 : run.act);
  if (run.over.won) st.wins = (st.wins || 0) + 1;
  markMilestone(save, 'firstRunEnd');
  if (run.over.won) markMilestone(save, 'firstWin');
  save.run = null;
  return { won: run.over.won, reason: run.over.reason, act: run.act, payout, stats: { ...run.stats, medals: { ...run.stats.medals } }, bolts: run.bolts };
}

// ---------- Dev-Menü ----------

// Direkt vor den Boss springen (Position: ein Knoten der letzten Etage)
export function devJumpToBoss(run) {
  const last = run.map.floors[BOSS_FLOOR - 1];
  run.current = null;
  run.pos = { floor: BOSS_FLOOR - 1, node: last[0].id };
  if (!run.visited.includes(last[0].id)) run.visited.push(last[0].id);
}

// Nächsten Akt beginnen (ohne Boss-Belohnung)
export function devNextAct(run) {
  if (run.act >= RUN.acts) return false;
  setupAct(run, run.act + 1);
  return true;
}

export function devSetDurability(run, n) {
  run.durability = Math.max(0, Math.min(durabilityMax(run), Number(n) || 0));
}

