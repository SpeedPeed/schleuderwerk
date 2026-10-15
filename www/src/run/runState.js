// Roguelite-Run (ARCHITEKTUR.md §8): reiner, serialisierbarer Zustand + Aktionen. Kein three.js, kein DOM.
// Der Run liegt in save.run und wird nach jeder Aktion gespeichert (main.js) → nach App-Neustart fortsetzbar.
//
// Ablauf: newRun(save) → Karte Akt 1 → reachableNodes → enterNode → (Etappe: stageSpecFor → Stage →
//   applyStageResult | Sonderknoten: Logik in shops/*.js, Zustand in run.current.shop, Abschluss mit leaveNode)
//   → … → Boss → nächster Akt → … → Boss Akt 3 = Sieg. Haltbarkeit 0 = Niederlage. endRun(save, run) zahlt aus.
//
// Run-Zustand:
// { v, seed, ascension, chassisId, parts: {slot: {id, level}}, abilities, act, biome, bossIds: {act: id}, map,
//   pos: {floor, node}, current: {node, type, attempts} | null, visited: [ids], path: [ids],
//   durability, durabilityBase, bolts, inventory: [{itemId, tier, hybrid?, hybridTier?}], reserve,
//   pendingChoices: [{ context, items: [ids], skipBolts }], poolAll, runMods: {fuelMaxAdd, coolMul, durabilityMaxAdd},
//   counters: { trig: {perRun-Zähler}, rolls, events }, history, stats, earned: {scrap, blueprints, cores, actScrap},
//   bossesBeaten: [acts], over,
//   Phase 5: perks (Forschungs-Boni beim Run-Start), reserve: [{ itemId, price }] (beim Händler reserviert),
//   seenEvents: [ids], current.shop (Zustand des offenen Sonderknotens – speicherbar, Fortsetzen mitten im Shop) }
//
// Phase 4 – Items: Start-Item je Chassis (starterItem bzw. zufälliges base-Item des starterTag), nach jeder geschafften
// Etappe eine Item-Auswahl (pendingChoices; Seltenheit je Etappe/Elite/Boss, run/rewards.js → rollItemChoices) plus je
// eingesammelter Item-Kiste eine weitere; Überspringen gibt Schrauben, voller Rucksack → ersetzen oder ablehnen.
// Run-Ereignisse (runStart, nodeEnter, stageClear, itemGained, shopEnter) laufen über die Trigger-Engine mit einem
// ctx ohne Fahrzeug (emitRunEvent). Der Kodex im Spielstand (save.codex) merkt sich gesehene/besessene Items und Set-Boni.
import { RUN, REWARDS, ITEMS as BAL_ITEMS } from '../data/balance.js';
import { biomeForAct } from '../data/biomes.js';
import { SLOTS } from '../data/index.js';
import { ITEMS, itemById } from '../data/items.js';
import { makeRng, hashSeed } from '../core/rng.js';
import { generateActMap, mapNode, isStageType, BOSS_FLOOR } from '../map/mapGen.js';
import { generateStageSpec } from '../physics/trackGen.js';
import { buildLoadout } from '../garage/loadout.js';
import { markMilestone } from '../garage/progression.js';
import { computeStats } from '../items/statMods.js';
import { applyInventory, addEntry, makeEntry, isValidEntry, upgradeRandom, entryParts } from '../items/inventory.js';
import { dispatchRunEvent } from '../items/triggerEngine.js';
import { ModState } from '../items/modState.js';
import { stageRewards, runPayout, rollItemChoices, itemSkipBolts } from './rewards.js';
import { PERK_KEYS } from '../garage/research.js';

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
    research: { done: save && save.research ? [...save.research.done] : [...(run.research || [])] },
  };
}

// Ausrüstung des Runs: Forschungs-Boni vom Run-Start (run.perks), Fähigkeiten des Runs (auch gekaufte)
export function runLoadout(run, save = null) {
  return buildLoadout(runLoadoutSave(run, save), { perks: run.perks || {}, runAbilities: run.abilities });
}

// Werte der Run-Ausrüstung inkl. Items, Set-Boni (Biom des aktuellen Akts) und Run-Effekten (wie in der Etappe,
// ohne Buffs). Zwischengespeichert je Inventar/Akt/Run-Werte.
const statCache = new WeakMap();
export function runStats(run) {
  const key = JSON.stringify([run.chassisId, run.parts, run.act, run.inventory, run.runMods, run.perks]);
  const c = statCache.get(run);
  if (c && c.key === key) return c.stats;
  const lo = runLoadout(run);
  const setup = applyInventory(lo, run.inventory || [], { biome: biomeForAct(run.act) });
  const rm = run.runMods || {};
  const extra = [{ stats: { durabilityMax: { add: rm.durabilityMaxAdd || 0 }, fuelMax: { add: rm.fuelMaxAdd || 0 }, coolRate: { mul: rm.coolMul || 0 } } }];
  const stats = computeStats({ ...setup.statInput, extra });
  statCache.set(run, { key, stats, setup });
  return stats;
}

// Max. Haltbarkeit im Run (Garage-Werte + Items + Run-Effekte, gleiche Rechnung wie in der Etappe)
export const durabilityMax = (run) => Math.max(1, Math.round(runStats(run).durabilityMax * 10) / 10);

// Item-Plätze des Runs (Stat itemSlots, Badewanne −1)
export const itemSlots = (run) => Math.max(1, Math.round(runStats(run).itemSlots));

// Alles, was eine Etappe des Runs braucht (main.js, Bot): Ausrüstung, Inventar, Run-Infos
export function runStageSetup(run, save = null) {
  return {
    loadout: runLoadout(run, save),
    inventory: run.inventory || [],
    runInfo: { bolts: run.bolts, counters: (run.counters.trig ||= {}) },
    runMods: run.runMods,
    durability: run.durability,
  };
}

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
    perks: { ...lo.perks },
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
    bolts: lo.perks.startBolts || 0,
    inventory: [],
    reserve: [],
    seenEvents: [],
    pendingChoices: [],
    poolAll: !!BAL_ITEMS.devAllPools,
    runMods: { fuelMaxAdd: 0, coolMul: 0, durabilityMaxAdd: 0 },
    counters: { trig: {}, rolls: 0, events: 0 },
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
  // Start-Item des Chassis
  const start = starterItemFor(lo.chassis, run.seed);
  if (start) giveItem(run, save, start);
  run.durability = durabilityMax(run);
  emitRunEvent(run, save, 'runStart', {});
  run.durability = Math.min(run.durability, durabilityMax(run));
  return run;
}

// Start-Item: chassis.starterItem, sonst ein zufälliges 'base'-Item des starterTag (deterministisch aus dem Seed)
export function starterItemFor(chassis, seed) {
  if (!chassis) return null;
  if (chassis.starterItem && itemById(chassis.starterItem)) return chassis.starterItem;
  const tag = chassis.starterTag;
  const list = ITEMS.filter((it) => it.pool === 'base' && it.rarity !== 'cursed' && it.tags[0] === tag);
  const any = list.length ? list : ITEMS.filter((it) => it.pool === 'base' && it.tags.includes(tag));
  if (!any.length) return null;
  return makeRng(hashSeed(`${seed}:start-item`)).pick(any).id;
}

// Fehlende Felder älterer Runs (Phase 3) ergänzen, unbekannte Items verwerfen
export function normalizeRun(run) {
  if (!isObj(run)) return run;
  if (!Array.isArray(run.inventory)) run.inventory = [];
  run.inventory = run.inventory.filter(isValidEntry).map((e) => ({ ...e, tier: Math.max(1, Math.min(3, e.tier | 0 || 1)) }));
  if (!Array.isArray(run.pendingChoices)) run.pendingChoices = [];
  run.pendingChoices = run.pendingChoices.filter((p) => isObj(p) && Array.isArray(p.items)).map((p) => ({ ...p, items: p.items.filter((id) => itemById(id)) }));
  if (!isObj(run.counters)) run.counters = {};
  if (!isObj(run.counters.trig)) run.counters.trig = {};
  run.counters.rolls = run.counters.rolls | 0;
  run.counters.events = run.counters.events | 0;
  run.poolAll = !!run.poolAll;
  // Phase 5: Forschungs-Boni (ältere Runs: keine), Reservierungen, gesehene Ereignisse
  if (!isObj(run.perks)) run.perks = {};
  for (const k of PERK_KEYS) if (typeof run.perks[k] !== 'number' || !isFinite(run.perks[k])) run.perks[k] = 0;
  if (!Array.isArray(run.reserve)) run.reserve = [];
  run.reserve = run.reserve.filter((r) => isObj(r) && itemById(r.itemId)).map((r) => ({ itemId: r.itemId, price: Math.max(0, Number(r.price) || 0) }));
  if (!Array.isArray(run.seenEvents)) run.seenEvents = [];
  if (!Array.isArray(run.research)) run.research = [];
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

// Art eines Knotens: die Kartenart – außer der laufende Knoten wurde umgewandelt (Ereignis „{ stage: 'elite' }“ →
// run.current.type = 'elite', der Knoten wird zur Elite-Etappe mit Elite-Belohnung)
export function nodeKind(run, node) {
  const n = typeof node === 'string' ? mapNode(run.map, node) : node;
  if (!n) return null;
  return run.current && run.current.node === n.id ? run.current.type : n.type;
}

// Etappen-Spezifikation eines Knotens (deterministisch: Run-Seed + Akt + Knoten → derselbe Neuversuch)
export function stageSpecFor(run, node) {
  const n = typeof node === 'string' ? mapNode(run.map, node) : node;
  const kind = n && nodeKind(run, n);
  if (!n || !isStageType(kind)) return null;
  const rng = makeRng(hashSeed(`${run.seed}:${run.act}:${n.id}`));
  return generateStageSpec({
    biome: currentBiome(run), kind, floor: n.floor, act: run.act, rng,
    bossId: kind === 'boss' ? run.bossIds[run.act] || n.bossId : null, mods: {},
  });
}

// ---------- Aktionen ----------

// Knoten betreten. Ergebnis: { ok, node, kind, spec?, events } oder { ok: false, reason }
//   kind: 'stage' (Etappe/Elite/Boss, spec) | 'station' | 'dealer' | 'workbench' | 'blackmarket' | 'event' | 'treasure'
// Sonderknoten: die Logik liegt in shops/*.js (Zustand run.current.shop, legt der Shop beim ersten Öffnen an),
// abgeschlossen wird mit leaveNode. Ist der Knoten schon offen (Fortsetzen), bleibt sein Zustand erhalten.
export function enterNode(run, id) {
  if (run.over) return { ok: false, reason: 'over' };
  if (run.current && run.current.node !== id) return { ok: false, reason: 'busy' };
  if (!run.current && !canEnter(run, id)) return { ok: false, reason: 'unreachable' };
  const node = mapNode(run.map, id);
  const events = [];
  if (!run.current) {
    run.current = { node: id, type: node.type, attempts: 0 };
    run.pos = { floor: node.floor, node: id };
    run.path.push(id);
    run.stats.nodes++;
    events.push(emitRunEvent(run, null, 'nodeEnter', { type: node.type }));
    if (node.type === 'dealer') events.push(emitRunEvent(run, null, 'shopEnter', {}));
  }
  const kind = nodeKind(run, node);
  if (isStageType(kind)) return { ok: true, node, kind: 'stage', spec: stageSpecFor(run, node), events };
  return { ok: true, node, kind, events };
}

// Sonderknoten verlassen (Händler, Werkbank, Schwarzmarkt, Tankstelle, Ereignis, Schatz): Knoten gilt als besucht
export function leaveNode(run) {
  const cur = run.current;
  if (!cur || isStageType(cur.type)) return { ok: false, reason: 'noShop' };
  const type = cur.type;
  completeNode(run);
  return { ok: true, type };
}

// Knoten abschließen (Boss → nächster Akt bzw. Sieg)
export function completeNode(run) {
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
  // Schrauben, die in der Etappe als Treibstoff verbrannt wurden (Regel boltsAreFuel), gehen vom Run-Stand ab
  run.bolts = Math.max(0, run.bolts + rw.bolts - Math.max(0, result.boltsSpent || 0));
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
  out.events = emitRunEvent(run, save, 'stageClear', { medal: out.medal, kind });
  const act = run.act;
  completeNode(run);
  // Item-Auswahl: 1 nach der Etappe (Kontext = Knotenart) + 1 je Item-Kiste (nicht nach dem letzten Boss)
  const lastBoss = kind === 'boss' && act >= RUN.acts;
  if (!lastBoss) {
    queueChoice(run, save, kind, act);
    for (let i = 0; i < Math.max(0, result.crates || 0); i++) queueChoice(run, save, 'crate', act);
    out.choices = run.pendingChoices.length;
  }
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

// ---------- Items ----------

// Run-Kontext der Trigger-Engine: ctx ohne Fahrzeug, Effekte wirken auf den Run-Zustand
function runCtx(run, save, rng, log) {
  const st = runStats(run);
  const ctx = {
    vehicle: null,
    rng,
    source: null,
    depth: 0,
    chassisId: run.chassisId,
    addBolts: (n) => {
      const v = n > 0 ? n * st.boltGain : n;
      run.bolts = Math.max(0, run.bolts + v);
      if (v > 0) run.stats.boltsEarned += v;
      log.bolts += v;
    },
    addScrap: (n) => { run.earned.scrap += Math.max(0, n) * st.scrapGain; },
    heal: (n) => { run.durability = Math.min(durabilityMax(run), run.durability + Math.max(0, n)); },
    damage: (n) => { run.durability = Math.max(0, run.durability - Math.max(0, n)); },
    popup: (t) => log.popups.push(t),
    fx: () => {},
    luck: () => st.luck,
    hpFrac: () => run.durability / durabilityMax(run),
    maxDurability: () => durabilityMax(run),
    maxHp: (n) => {
      const before = durabilityMax(run);
      run.runMods.durabilityMaxAdd += n;
      const gain = durabilityMax(run) - before;
      if (gain > 0) run.durability += gain;
      run.durability = Math.min(run.durability, durabilityMax(run));
    },
    maxFuel: (n) => { run.runMods.fuelMaxAdd += n; },
    upgradeItem: () => {
      const i = upgradeRandom(run.inventory, rng);
      if (i >= 0) log.upgraded.push(i);
      return i >= 0;
    },
    // Etappen-Effekte (Buffs, Stapel, Zähler) haben im Run keine Wirkung über das Ereignis hinaus
    addBuff: () => {}, addStack: () => {}, charge: (k, n, at) => log.mods.charge(k, n, at),
    freeBoost: () => {}, shield: () => {}, slowmo: () => {}, refill: () => {}, magnet: () => {},
    onTriggered: (src) => log.triggered.push({ id: src.id, kind: src.kind, name: src.name, icon: src.icon, slot: src.slot }),
  };
  return ctx;
}

// Run-Ereignis über die Trigger-Engine verteilen (runStart, nodeEnter, stageClear, itemGained, shopEnter).
// Ergebnis: { triggered: [{ id, name, icon, slot }], bolts, popups, upgraded: [slot] }
export function emitRunEvent(run, save, name, data = {}) {
  normalizeRun(run);
  const log = { triggered: [], bolts: 0, popups: [], upgraded: [], mods: new ModState() };
  if (!run.inventory.length) return log;
  const rng = makeRng(hashSeed(`${run.seed}:ereignis:${run.counters.events++}`));
  const setup = applyInventory(runLoadout(run), run.inventory, { biome: biomeForAct(run.act) });
  const sources = setup.sources.filter((s) => s.kind === 'item' || s.kind === 'set' || s.kind === 'chassis');
  dispatchRunEvent({ sources, ctx: runCtx(run, save, rng, log), rules: setup.rules, runCounters: run.counters.trig }, name, data);
  delete log.mods;
  return log;
}

// Kodex: Item gesehen (1) / besessen (2); aktive Set-Boni
function codexItem(save, id, level) {
  if (!save || !save.codex) return;
  const c = save.codex.items;
  c[id] = Math.max(typeof c[id] === 'number' ? c[id] : 0, level);
}
export function updateCodexSets(run, save) {
  if (!save || !save.codex) return;
  runStats(run);
  for (const s of statCache.get(run).setup.sets) save.codex.sets[s.id] = 1;
}

// Aufbau des Inventars für die Anzeige (Karte, Inventar-Ansicht): { items, sets, counts, slots }
export function inventoryView(run) {
  runStats(run);
  const setup = statCache.get(run).setup;
  return { items: setup.items, sets: setup.sets, counts: setup.counts, slots: itemSlots(run), tagBoost: setup.tagBoost };
}

// Item direkt ins Inventar (Start-Item, Händler, Dev-Menü). replace: Platz, der ersetzt wird. Ergebnis wie addEntry
export function giveItem(run, save, itemId, { tier = 1, replace = null, force = false } = {}) {
  normalizeRun(run);
  const slots = force ? Infinity : itemSlots(run);
  const res = addEntry(run.inventory, makeEntry(itemId, tier), slots, replace);
  if (!res.ok) return res;
  codexItem(save, itemId, 2);
  updateCodexSets(run, save);
  res.events = emitRunEvent(run, save, 'itemGained', { itemId });
  run.durability = Math.min(run.durability, durabilityMax(run));
  return res;
}

// Ein bestimmtes Item als Auswahl anbieten (Ereignis/Schatz/Händler bei vollem Rucksack): Nehmen (ersetzt) oder Ablehnen.
export function offerItem(run, save, itemId, context = 'event', skipBolts = 0) {
  normalizeRun(run);
  const choice = { context, items: [itemId], skipBolts };
  run.pendingChoices.push(choice);
  codexItem(save, itemId, 1);
  return choice;
}

// Item geben – passt es nicht mehr in den Rucksack, wird es als Auswahl angeboten (ersetzen oder ablehnen).
// Ergebnis: { ok, slot?, queued?, events? }
export function giveOrOffer(run, save, itemId, context = 'event', tier = 1) {
  const res = giveItem(run, save, itemId, { tier });
  if (res.ok) return res;
  if (res.reason === 'full') { offerItem(run, save, itemId, context); return { ok: true, queued: true }; }
  return res;
}

// Neue Auswahl würfeln und anhängen (context: 'stage' | 'elite' | 'boss' | 'crate')
export function queueChoice(run, save, context, act = run.act) {
  normalizeRun(run);
  const rng = makeRng(hashSeed(`${run.seed}:auswahl:${run.counters.rolls++}`));
  const count = Math.max(1, Math.round(runStats(run).itemChoices));
  const items = rollItemChoices({
    rng, context, act, count, research: run.research || [], all: !!run.poolAll || !!BAL_ITEMS.devAllPools,
    owned: run.inventory.flatMap((e) => entryParts(e).map((p) => p.def.id)),
  });
  const choice = { context, items, skipBolts: itemSkipBolts(act) };
  run.pendingChoices.push(choice);
  for (const id of items) codexItem(save, id, 1);
  return choice;
}

export const pendingChoice = (run) => (run && run.pendingChoices && run.pendingChoices.length ? run.pendingChoices[0] : null);

// Item der obersten Auswahl nehmen. replace: Inventar-Platz (bei vollem Rucksack Pflicht).
// Ergebnis: { ok, reason?: 'full'|'none'|'index', itemId, slot, replaced?, events }
export function pickItem(run, save, index, replace = null) {
  const ch = pendingChoice(run);
  if (!ch) return { ok: false, reason: 'none' };
  const itemId = ch.items[index];
  if (!itemId) return { ok: false, reason: 'index' };
  const res = giveItem(run, save, itemId, { replace });
  if (!res.ok) return { ...res, itemId };
  run.pendingChoices.shift();
  return { ...res, itemId };
}

// Auswahl überspringen (oder bei vollem Rucksack ablehnen): + Schrauben
export function skipChoice(run) {
  const ch = pendingChoice(run);
  if (!ch) return { ok: false, reason: 'none' };
  run.pendingChoices.shift();
  run.bolts += ch.skipBolts || 0;
  run.stats.boltsEarned += ch.skipBolts || 0;
  return { ok: true, bolts: ch.skipBolts || 0 };
}

// ---------- Run-Werte ändern (Sonderknoten, Ereignisse) ----------

// Schrauben ± (Einnahmen zählen in die Statistik; nie unter 0). Ergebnis: tatsächliche Änderung
export function addRunBolts(run, n) {
  const before = run.bolts;
  run.bolts = Math.max(0, run.bolts + n);
  if (n > 0) run.stats.boltsEarned += n;
  return run.bolts - before;
}

// Haltbarkeit heilen (Anteil der max. Haltbarkeit × (1 + Stat repairBonus)). Ergebnis: geheilte Punkte
export function healRun(run, pct) {
  const max = durabilityMax(run);
  const before = run.durability;
  run.durability = Math.min(max, run.durability + max * pct * (1 + (runStats(run).repairBonus || 0)));
  return run.durability - before;
}

// Schaden außerhalb der Etappe (Anteil der max. Haltbarkeit), nie unter minLeft. Ergebnis: Schaden
export function damageRun(run, pct, minLeft = 1) {
  const before = run.durability;
  run.durability = Math.max(Math.min(before, minLeft), run.durability - durabilityMax(run) * pct);
  return before - run.durability;
}

// Max. Haltbarkeit für den Run ± n (ein Plus füllt auch die aktuelle auf). Ergebnis: Änderung der max. Haltbarkeit
export function addMaxDurability(run, n) {
  const before = durabilityMax(run);
  run.runMods.durabilityMaxAdd += n;
  const after = durabilityMax(run);
  if (after > before) run.durability += after - before;
  run.durability = Math.max(Math.min(run.durability, 1), Math.min(run.durability, after));
  return after - before;
}

// Max. Treibstoff für den Run ± n
export function addMaxFuel(run, n) {
  run.runMods.fuelMaxAdd += n;
  return n;
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

// Item hinzufügen (auch über die Slot-Grenze hinaus) bzw. ★ eines Platzes erhöhen
export function devAddItem(run, save, itemId, tier = 1) {
  return giveItem(run, save, itemId, { tier, force: true });
}

export function devTierUp(run, slot) {
  const e = run.inventory[slot];
  if (!e || (e.tier || 1) >= 3) return false;
  e.tier = (e.tier || 1) + 1;
  return true;
}

