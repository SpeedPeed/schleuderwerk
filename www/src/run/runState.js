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
//   Phase 6: ascension (Schrottstufe 0–15, Regeln: runAsc), runMods zusätzlich mit Faktoren aus der Schrottstufe
//   (durabilityMaxMul, fuelMaxMul, heatGainMul, damageMul, boltMul), bossTwin (Doppel-Boss Akt 3: zweite Boss-Strecke läuft),
//   startPlaytime (Spielzeit beim Start → Run-Dauer in der Historie),
//   Phase 5: perks (Forschungs-Boni beim Run-Start), reserve: [{ itemId, price }] (beim Händler reserviert),
//   seenEvents: [ids], current.shop (Zustand des offenen Sonderknotens – speicherbar, Fortsetzen mitten im Shop) }
//
// Paket A – Tempo & Belohnung:
//   - jeder Versuch zahlt (run/rewards.js → stageRewards); Schrott/Blaupausen/Kerne gehen SOFORT in den Spielstand
//     (settleRun, bezahlt-Zähler run.earned.paid), das Run-Ende zahlt nur noch den Rest (Schrauben-Rest → Schrott)
//   - verfehlte Etappe/Elite: run.current.missed = true → Entscheidung resolveMiss(run, 'land' | 'retry'):
//     „Notlandung“ (−RUN.emergency.penalty max. Haltbarkeit, Trostkiste mit Schrauben, weiter auf der Karte) oder
//     „Nochmal“ (−RUN.towPenalty, NEUE Strecke: Seed mit run.current.attempts)
//   - Boss verfehlt: Abschleppen (−RUN.towPenalty), Neuversuch mit neu gewürfelter Boss-Variante (neuer Seed) und
//     Ziel −RUN.bossRetry.targetCut je Neuversuch (höchstens maxCuts) – „Der Boss ist auch müde“
//   - Teile-Stufen gelten je Slot: run.parts = { slot: { id, level } } mit level = Slot-Stufe beim Run-Start
//
// Phase 4 – Items: Start-Item je Chassis (starterItem bzw. zufälliges base-Item des starterTag), nach jeder geschafften
// Etappe eine Item-Auswahl (pendingChoices; Seltenheit je Etappe/Elite/Boss, run/rewards.js → rollItemChoices) plus je
// eingesammelter Item-Kiste eine weitere; Überspringen gibt Schrauben, voller Rucksack → ersetzen oder ablehnen.
// Run-Ereignisse (runStart, nodeEnter, stageClear, itemGained, shopEnter) laufen über die Trigger-Engine mit einem
// ctx ohne Fahrzeug (emitRunEvent). Der Kodex im Spielstand (save.codex) merkt sich gesehene/besessene Items und Set-Boni.
import { RUN, REWARDS, ITEMS as BAL_ITEMS, SYNERGY } from '../data/balance.js';
import { biomeForAct } from '../data/biomes.js';
import { SLOTS, cursedItemPool } from '../data/index.js';
import { ITEMS, itemById } from '../data/items.js';
import { makeRng, hashSeed } from '../core/rng.js';
import { generateActMap, mapNode, isStageType, BOSS_FLOOR } from '../map/mapGen.js';
import { generateStageSpec } from '../physics/trackGen.js';
import { buildLoadout } from '../garage/loadout.js';
import { markMilestone, ascensionMods, ascensionState, ascensionCoreReward, recordRunEnd } from '../garage/progression.js';
import { computeStats } from '../items/statMods.js';
import { applyInventory, addEntry, makeEntry, isValidEntry, upgradeRandom, entryParts, MAX_TIER } from '../items/inventory.js';
import { TAG_IDS } from '../data/tags.js';
import { dispatchRunEvent } from '../items/triggerEngine.js';
import { ModState } from '../items/modState.js';
import { stageRewards, runPayout, rollItemChoices, itemSkipBolts, choiceBias } from './rewards.js';
import { runModStats, runDamageMul } from './runMods.js';

export { runModStats };
import { PERK_KEYS } from '../garage/research.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// ---------- Aufbau ----------

// Pseudo-Spielstand für buildLoadout aus der Run-Ausrüstung (die Ausrüstung ist für den Run fest)
export function runLoadoutSave(run, save = null) {
  const parts = {}, slotLevels = {};
  for (const slot of SLOTS) {
    const p = run.parts[slot];
    if (!p) continue;
    parts[slot] = p.id;
    slotLevels[slot] = p.level || 0;
  }
  return {
    garage: { chassis: run.chassisId, parts, slotLevels, abilities: [...run.abilities] },
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
  const extra = [runModStats(rm)];
  const stats = computeStats({ ...setup.statInput, extra });
  statCache.set(run, { key, stats, setup });
  return stats;
}

// Regeln der Schrottstufe des Runs (data/ascension.js, kumulativ) – zwischengespeichert je Stufe
const ascCache = new Map();
export function runAsc(run) {
  const lv = (run && run.ascension) | 0;
  if (!ascCache.has(lv)) ascCache.set(lv, Object.freeze(ascensionMods(lv)));
  return ascCache.get(lv);
}

// Abschlepp-Strafe (Anteil der max. Haltbarkeit): RUN.towPenalty + Schrottstufe towPenaltyAdd – gilt für „Nochmal“
// und den Boss-Neuversuch
export const towPenaltyPct = (run) => RUN.towPenalty + (runAsc(run).towPenaltyAdd || 0);
// Notlandung (verfehlte Etappe/Elite, weiter auf der Karte): RUN.emergency.penalty + Schrottstufe towPenaltyAdd
export const emergencyPenaltyPct = (run) => RUN.emergency.penalty + (runAsc(run).towPenaltyAdd || 0);
// Trostkiste der Notlandung: Schrauben je Akt (× Schrottstufe boltMul)
export const consolationBolts = (run) => boltIncome(run, RUN.emergency.crateBolts[Math.max(1, Math.min(RUN.acts, run.act | 0))] || 0);
// Boss-Neuversuch: Ziel-Faktor („Der Boss ist auch müde“), attempts = bisherige Fehlversuche
export const bossTiredMul = (attempts) => 1 - RUN.bossRetry.targetCut * Math.min(RUN.bossRetry.maxCuts, Math.max(0, attempts | 0));

// Schrauben-Einnahmen × Schrottstufe boltMul (Etappen-Belohnung, Überspringen, Ereignisse, Zerlegen)
export const boltIncome = (run, n) => (n > 0 ? Math.round(n * (runAsc(run).boltMul || 1)) : n);

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

// Neuen Run aus der aktuellen Garage-Auswahl. opts: { seed, ascension, blueprint } – ohne ascension gilt die in der
// Garage gewählte Schrottstufe (save.ascension.selected, höchstens die freigeschaltete); blueprint: Paket C Bauplan-Start.
export function newRun(save, opts = {}) {
  const seed = (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0;
  const lo = buildLoadout(save);
  const asc = save && save.meta ? ascensionState(save) : null;
  const level = Math.max(0, Math.min(15, opts.ascension ?? (asc ? asc.selected : 0)) | 0);
  const am = ascensionMods(level);
  const parts = {};
  for (const slot of SLOTS) if (lo.parts[slot]) parts[slot] = { id: lo.parts[slot].id, level: lo.parts[slot].level };
  const run = {
    v: RUN.version,
    seed,
    ascension: level,
    startPlaytime: save && save.meta ? save.meta.totalPlaytime : 0,
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
    blueprintTag: null,
    pendingChoices: [],
    poolAll: !!BAL_ITEMS.devAllPools,
    runMods: {
      fuelMaxAdd: 0, coolMul: 0, durabilityMaxAdd: 0,
      durabilityMaxMul: am.startDurabilityMul || 1, fuelMaxMul: am.fuelMaxMul || 1, heatGainMul: am.heatGainMul || 1,
      damageMul: am.damageMul || 1, boltMul: am.boltMul || 1,
    },
    counters: { trig: {}, rolls: 0, events: 0 },
    history: [],
    stats: {
      stages: 0, cleared: 0, tows: 0, medals: { bronze: 0, silver: 0, gold: 0 }, dist: 0, bestDist: 0,
      damage: 0, boltsEarned: 0, stations: 0, crates: 0, flips: 0, loops: 0, nodes: 0,
    },
    earned: { scrap: 0, blueprints: 0, cores: 0, actScrap: 0, paid: { scrap: 0, blueprints: 0, cores: 0 } },
    bossesBeaten: [],
    over: null,
    research: save && save.research ? [...save.research.done] : [],
  };
  setupAct(run, 1);
  // Paket C: Bauplan-Start (opts.blueprint, main.js und Simulatoren) – 1 aus 3 Bauplänen (Episch-„Motor“-Item eines
  // Tags, Lieblings-Tag des Chassis immer dabei) als erste Auswahl (context 'blueprint'); ohne opts.blueprint (Tests,
  // Dev) das Start-Item des Chassis wie bisher
  const plans = opts.blueprint ? blueprintOptions(lo.chassis, run.seed) : [];
  if (plans.length) {
    run.pendingChoices.push({ context: 'blueprint', items: plans, skipBolts: 0 });
    for (const id of plans) codexItem(save, id, 1);
  } else {
    const start = starterItemFor(lo.chassis, run.seed);
    if (start) giveItem(run, save, start);
  }
  // Schrottstufe 6 „Omas Erbstück“: zufällige verfluchte Items zum Start (Fluch-Pool wie Ereignis-Flüche)
  for (let i = 0; i < (am.startCurse || 0); i++) {
    const pool = cursedItemPool(run.research).filter((it) => !run.inventory.some((e) => e.itemId === it.id));
    if (pool.length) giveItem(run, save, makeRng(hashSeed(`${run.seed}:start-fluch:${i}`)).pick(pool).id, { force: true });
  }
  run.durability = durabilityMax(run);
  emitRunEvent(run, save, 'runStart', {});
  run.durability = Math.min(run.durability, durabilityMax(run));
  return run;
}

// Paket C – Bauplan-Start: SYNERGY.blueprint.options Baupläne = je das Grundpool-Item der Seltenheit
// SYNERGY.blueprint.rarity („Motor“) eines Tags; der Lieblings-Tag des Chassis (starterTag) ist immer dabei, die übrigen
// Tags werden aus dem Run-Seed gezogen. Ergebnis: Item-IDs (Reihenfolge: Chassis-Tag zuerst)
export function blueprintOptions(chassis, seed) {
  const B = SYNERGY.blueprint;
  const motor = (tag) => ITEMS.find((it) => it.pool === 'base' && it.rarity === B.rarity && it.tags[0] === tag) || null;
  const rng = makeRng(hashSeed(`${seed}:bauplan`));
  const tags = TAG_IDS.filter((t) => motor(t));
  const fav = chassis && tags.includes(chassis.starterTag) ? chassis.starterTag : null;
  const rest = tags.filter((t) => t !== fav);
  rng.shuffle(rest);
  return [...(fav ? [fav] : []), ...rest].slice(0, B.options).map((t) => motor(t).id);
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
  // Paket C: Bauplan-Tag (Tag-Bias × SYNERGY.bias.blueprintMul); ältere Runs: keiner
  if (typeof run.blueprintTag !== 'string' || !TAG_IDS.includes(run.blueprintTag)) run.blueprintTag = null;
  if (!Array.isArray(run.research)) run.research = [];
  // Paket A: schon gutgeschriebene Run-Belohnung (ältere Runs: noch nichts – alles kommt am Run-Ende)
  if (isObj(run.earned)) {
    if (!isObj(run.earned.paid)) run.earned.paid = { scrap: 0, blueprints: 0, cores: 0 };
    for (const k of ['scrap', 'blueprints', 'cores']) if (typeof run.earned.paid[k] !== 'number' || !isFinite(run.earned.paid[k])) run.earned.paid[k] = 0;
  }
  if (isObj(run.current)) { run.current.attempts = run.current.attempts | 0; run.current.missed = !!run.current.missed; }
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
  run.map = generateActMap(act, rng.fork('karte'), { research: run.research || [], bossId, eliteWeightAdd: runAsc(run).eliteWeightAdd || 0 });
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

// Etappen-Spezifikation eines Knotens (deterministisch: Run-Seed + Akt + Knoten). Paket A: jeder Neuversuch
// (run.current.attempts > 0) bekommt einen NEUEN Strecken-Seed – keine identische Wiederholung; beim Boss zusätzlich
// Ziel × bossTiredMul (die Boss-Variante würfelt applyStageResult neu).
export function stageSpecFor(run, node) {
  const n = typeof node === 'string' ? mapNode(run.map, node) : node;
  const kind = n && nodeKind(run, n);
  if (!n || !isStageType(kind)) return null;
  const twin = kind === 'boss' && run.bossTwin ? ':zwilling' : '';
  const attempts = run.current && run.current.node === n.id ? run.current.attempts | 0 : 0;
  const retry = attempts > 0 ? `:neu${attempts}` : '';
  const rng = makeRng(hashSeed(`${run.seed}:${run.act}:${n.id}${twin}${retry}`));
  const am = runAsc(run);
  const tired = kind === 'boss' ? bossTiredMul(attempts) : 1;
  return generateStageSpec({
    biome: currentBiome(run), kind, floor: n.floor, act: run.act, rng,
    bossId: kind === 'boss' ? run.bossIds[run.act] || n.bossId : null,
    mods: { targetMul: am.targetMul || 1, bossTargetMul: (am.bossTargetMul || 1) * tired, eliteHazards: !!am.eliteHazards },
  });
}

// ---------- Aktionen ----------

// Knoten betreten. Ergebnis: { ok, node, kind, spec?, events } oder { ok: false, reason }
//   kind: 'stage' (Etappe/Elite/Boss, spec) | 'station' | 'dealer' | 'workbench' | 'blackmarket' | 'event' | 'treasure'
// Sonderknoten: die Logik liegt in shops/*.js (Zustand run.current.shop, legt der Shop beim ersten Öffnen an),
// abgeschlossen wird mit leaveNode. Ist der Knoten schon offen (Fortsetzen), bleibt sein Zustand erhalten.
export function enterNode(run, id) {
  if (run.over) return { ok: false, reason: 'over' };
  if (run.current && run.current.missed) return { ok: false, reason: 'decide' };   // erst Notlandung oder Nochmal
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

// Paket A: Run-Belohnung sofort gutschreiben – Summe laut runPayout (ohne Schrauben-Rest, außer final) minus schon
// bezahlt (run.earned.paid). Ohne Spielstand passiert nichts (dann zahlt endRun alles). Ergebnis: gutgeschriebene Werte.
export function settleRun(run, save, final = false) {
  const e = run.earned;
  if (!isObj(e.paid)) e.paid = { scrap: 0, blueprints: 0, cores: 0 };
  const p = runPayout(run, { boltRest: final });
  const d = { scrap: 0, blueprints: 0, cores: 0, payout: p };
  if (!save || !save.meta) return d;
  for (const k of ['scrap', 'blueprints', 'cores']) {
    d[k] = Math.max(0, Math.round(p[k] - e.paid[k]));
    e.paid[k] += d[k];
    save.meta[k] += d[k];
  }
  if (save.stats) save.stats.totalScrap = (save.stats.totalScrap || 0) + d.scrap;
  return d;
}

// Ergebnis einer Etappe übernehmen. save (optional): Meilensteine stempeln, erste Boss-Siege → Kerne, Belohnung sofort
// gutschreiben (settleRun). Ergebnis: { cleared, medal, grade, rewards, credited, missed, towed, towPenalty, defeat,
// actComplete, nextAct, won, attempts, bossReroll }
// Verfehlt (Etappe/Elite): missed = true, run.current bleibt offen, bis resolveMiss entscheidet (Notlandung/Nochmal).
export function applyStageResult(run, result, save = null) {
  const cur = run.current;
  if (!cur || !isStageType(cur.type)) return { ok: false, reason: 'noStage' };
  if (cur.missed) return { ok: false, reason: 'decide' };
  const kind = cur.type;
  const s = run.stats;
  const out = { ok: true, kind, cleared: !!result.cleared, medal: result.medal || null, towed: false, missed: false, towPenalty: 0, defeat: false, actComplete: false, nextAct: null, won: false };
  run.durability = Math.max(0, Math.min(durabilityMax(run), result.durability));
  s.stages++;
  s.dist += result.dist || 0;
  s.bestDist = Math.max(s.bestDist, result.dist || 0);
  s.damage += result.damageTaken || 0;
  s.crates += result.crates || 0;
  if (result.stunts) { s.flips += result.stunts.flips || 0; s.loops += result.stunts.loops || 0; }
  const roll = makeRng(hashSeed(`${run.seed}:blaupause:${s.stages}`)).next();
  const rw = stageRewards(run.act, kind, result, { roll, firstEncounter: !(cur.attempts > 0) });
  out.grade = rw.grade;
  // Schrottstufe 13: Schrauben-Belohnung der Etappe × boltMul (gesammelte Schrauben sind schon über boltGain gekürzt)
  if (rw.base.bolts) { const b = boltIncome(run, rw.base.bolts); rw.bolts += b - rw.base.bolts; rw.base.bolts = b; }
  out.rewards = rw;
  // Schrauben, die in der Etappe als Treibstoff verbrannt wurden (Regel boltsAreFuel), gehen vom Run-Stand ab
  run.bolts = Math.max(0, run.bolts + rw.bolts - Math.max(0, result.boltsSpent || 0));
  s.boltsEarned += rw.bolts;
  run.earned.scrap += rw.scrap;
  run.earned.blueprints += rw.blueprints;
  run.history.push({ act: run.act, node: cur.node, kind, dist: result.dist, target: result.target, medal: out.medal, grade: rw.grade, reason: result.reason });
  const credit = () => { out.credited = settleRun(run, save); };

  if (result.reason === 'wreck' || run.durability <= 0) {
    out.defeat = true;
    run.over = { won: false, reason: 'wreck', act: run.act };
    credit();
    return out;
  }
  if (!out.cleared && kind !== 'boss') {
    // Notlandung oder Nochmal: die Person entscheidet (resolveMiss); bis dahin bleibt der Knoten offen
    cur.missed = true;
    out.missed = true;
    out.attempts = cur.attempts;
    out.emergency = { penalty: Math.round(durabilityMax(run) * emergencyPenaltyPct(run) * 10) / 10, pct: emergencyPenaltyPct(run), bolts: consolationBolts(run) };
    out.retry = { penalty: Math.round(durabilityMax(run) * towPenaltyPct(run) * 10) / 10, pct: towPenaltyPct(run) };
    credit();
    return out;
  }
  if (!out.cleared) {
    // Boss: Abschleppen (Strafe), dann Neuversuch – neue Boss-Variante, neue Strecke, Ziel −5 % („auch müde“)
    const pen = Math.round(durabilityMax(run) * towPenaltyPct(run) * 10) / 10;
    out.towed = true;
    out.towPenalty = pen;
    run.durability = Math.max(0, run.durability - pen);
    s.tows++;
    cur.attempts++;
    out.attempts = cur.attempts;
    if (!run.bossTwin) {
      const b = biomeForAct(run.act);
      const pick = makeRng(hashSeed(`${run.seed}:boss-neu:${run.act}:${cur.attempts}`)).pick(b.bosses);
      run.bossIds[run.act] = pick.id;
      out.bossReroll = { id: pick.id, name: pick.name, icon: pick.icon, targetMul: bossTiredMul(cur.attempts) };
    }
    if (run.durability <= 0) {
      out.defeat = true;
      run.over = { won: false, reason: 'tow', act: run.act };
    }
    credit();
    return out;
  }
  s.cleared++;
  s.medals[out.medal] = (s.medals[out.medal] || 0) + 1;
  out.events = emitRunEvent(run, save, 'stageClear', { medal: out.medal, kind });
  const act = run.act;
  // Schrottstufe 15 „Doppelter Ärger“: der erste Boss in Akt 3 öffnet sofort die zweite Boss-Strecke (andere Variante)
  const twinNext = kind === 'boss' && act >= RUN.acts && !!runAsc(run).doubleBossAct3 && !run.bossTwin;
  if (twinNext) cur.attempts = 0;
  else completeNode(run);
  // Item-Auswahl: 1 nach der Etappe (Kontext = Knotenart) + 1 je Item-Kiste (nicht nach dem letzten Boss)
  const lastBoss = kind === 'boss' && act >= RUN.acts && !twinNext;
  if (!lastBoss) {
    queueChoice(run, save, kind, act);
    for (let i = 0; i < Math.max(0, result.crates || 0); i++) queueChoice(run, save, 'crate', act);
    out.choices = run.pendingChoices.length;
  }
  if (twinNext) {
    const b = biomeForAct(act);
    const other = b.bosses.find((x) => x.id !== run.bossIds[act]) || b.bosses[0];
    run.bossTwin = true;
    run.bossIds[act] = other.id;
    if (save && markMilestone(save, `firstBossAct${act}`) && REWARDS.firstBossCores[act]) {
      run.earned.cores += REWARDS.firstBossCores[act];
      out.cores = REWARDS.firstBossCores[act];
    }
    out.secondBoss = { id: other.id, name: other.name, icon: other.icon };
    credit();
    return out;
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
  credit();
  return out;
}

// Entscheidung nach einer verfehlten Etappe/Elite (run.current.missed):
//   'land'  – Notlandung: −emergencyPenaltyPct der max. Haltbarkeit, Trostkiste (Schrauben), Knoten gilt als besucht,
//             weiter auf der Karte (keine Item-Auswahl)
//   'retry' – Nochmal: −towPenaltyPct, neue Strecke (gleiche Art/Etage, anderer Seed), Knoten bleibt offen
// Ergebnis: { ok, choice, penalty, bolts?, defeat, attempts? }
export function resolveMiss(run, choice = 'land') {
  const cur = run.current;
  if (!cur || !cur.missed) return { ok: false, reason: 'none' };
  const retry = choice === 'retry';
  const pen = Math.round(durabilityMax(run) * (retry ? towPenaltyPct(run) : emergencyPenaltyPct(run)) * 10) / 10;
  run.durability = Math.max(0, run.durability - pen);
  cur.missed = false;
  const out = { ok: true, choice: retry ? 'retry' : 'land', penalty: pen, defeat: false };
  if (retry) {
    run.stats.tows++;
    cur.attempts++;
    out.attempts = cur.attempts;
  } else {
    run.stats.emergencies = (run.stats.emergencies || 0) + 1;
    out.bolts = addRunBolts(run, RUN.emergency.crateBolts[Math.max(1, Math.min(RUN.acts, run.act | 0))] || 0);
    completeNode(run);
  }
  if (run.durability <= 0) {
    out.defeat = true;
    run.over = { won: false, reason: retry ? 'tow' : 'emergency', act: run.act };
    run.current = null;
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
  const sources = setup.sources.filter((s) => s.kind === 'item' || s.kind === 'set' || s.kind === 'recipe' || s.kind === 'chassis');
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
  const setup = statCache.get(run).setup;
  for (const s of setup.sets) save.codex.sets[s.id] = 1;
  // Paket C: gebaute Rezepte (Kompendium zeigt unbekannte als Silhouette)
  if (!save.codex.recipes || typeof save.codex.recipes !== 'object') save.codex.recipes = {};
  for (const r of setup.recipes || []) save.codex.recipes[r.id] = 1;
}

// Aufbau des Inventars für die Anzeige (Karte, Inventar-Ansicht): { items, sets, counts, slots, tagBoost, strength, recipes }
export function inventoryView(run) {
  runStats(run);
  const setup = statCache.get(run).setup;
  return { items: setup.items, sets: setup.sets, counts: setup.counts, slots: itemSlots(run), tagBoost: setup.tagBoost, strength: setup.strength, recipes: setup.recipes };
}

// Paket C: Tag-Bias der Angebote (run/rewards.js → choiceBias) aus Rucksack + Garage-Teilen und dem Bauplan-Tag
export function runChoiceBias(run) {
  runStats(run);
  return choiceBias(statCache.get(run).setup.counts, run.blueprintTag);
}

// Item-IDs, die in Angeboten nie erscheinen: schon auf ★3 oder Teil eines Hybrids (Nehmen würde kein ★+1 ergeben)
export function choiceExclude(run) {
  const out = [];
  for (const e of run.inventory || []) {
    if (e.hybrid) { out.push(e.itemId, e.hybrid); continue; }
    if ((e.tier || 1) >= MAX_TIER) out.push(e.itemId);
  }
  return out;
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
  const count = Math.max(1, Math.round(runStats(run).itemChoices) + (runAsc(run).itemChoicesAdd || 0));
  const items = rollItemChoices({
    rng, context, act, count, research: run.research || [], all: !!run.poolAll || !!BAL_ITEMS.devAllPools,
    owned: run.inventory.flatMap((e) => entryParts(e).map((p) => p.def.id)), exclude: choiceExclude(run),
    bias: runChoiceBias(run), guarantee: (BAL_ITEMS.guarantee && BAL_ITEMS.guarantee[context]) || null,
  });
  const choice = { context, items, skipBolts: boltIncome(run, itemSkipBolts(act)) };
  run.pendingChoices.push(choice);
  for (const id of items) codexItem(save, id, 1);
  return choice;
}

export const pendingChoice = (run) => (run && run.pendingChoices && run.pendingChoices.length ? run.pendingChoices[0] : null);

// Item der obersten Auswahl nehmen. replace: Inventar-Platz (bei vollem Rucksack Pflicht).
// Ergebnis: { ok, reason?: 'full'|'none'|'index', itemId, slot, replaced?, events }
// Paket C: Ist das Item schon im Rucksack (kein Hybrid, unter ★3), wird es ★+1 statt einen Platz zu belegen
// (Ergebnis upgraded: true, slot). Bauplan-Auswahl (context 'blueprint') merkt sich den Tag (Tag-Bias).
export function pickItem(run, save, index, replace = null) {
  const ch = pendingChoice(run);
  if (!ch) return { ok: false, reason: 'none' };
  const itemId = ch.items[index];
  if (!itemId) return { ok: false, reason: 'index' };
  const dup = run.inventory.findIndex((e) => e.itemId === itemId && !e.hybrid && (e.tier || 1) < MAX_TIER);
  if (dup >= 0 && (replace === null || replace === undefined)) {
    run.inventory[dup] = { ...run.inventory[dup], tier: (run.inventory[dup].tier || 1) + 1 };
    run.pendingChoices.shift();
    codexItem(save, itemId, 2);
    updateCodexSets(run, save);
    return { ok: true, itemId, slot: dup, upgraded: true, events: emitRunEvent(run, save, 'itemGained', { itemId }) };
  }
  const res = giveItem(run, save, itemId, { replace });
  if (!res.ok) return { ...res, itemId };
  run.pendingChoices.shift();
  if (ch.context === 'blueprint') { const it = itemById(itemId); run.blueprintTag = it ? it.tags[0] : null; }
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
  n = boltIncome(run, n);
  run.bolts = Math.max(0, run.bolts + n);
  if (n > 0) run.stats.boltsEarned += n;
  return run.bolts - before;
}

// Reparatur-Faktor außerhalb der Etappe: (1 + Stat repairBonus) × Schrottstufe repairMul
export const repairFactor = (run) => (1 + (runStats(run).repairBonus || 0)) * (runAsc(run).repairMul || 1);

// Haltbarkeit heilen (Anteil der max. Haltbarkeit × Reparatur-Faktor). Ergebnis: geheilte Punkte
export function healRun(run, pct) {
  const max = durabilityMax(run);
  const before = run.durability;
  run.durability = Math.min(max, run.durability + max * pct * repairFactor(run));
  return run.durability - before;
}

// Schaden außerhalb der Etappe (Anteil der max. Haltbarkeit), nie unter minLeft. Ergebnis: Schaden
export function damageRun(run, pct, minLeft = 1) {
  const before = run.durability;
  const mul = runDamageMul(run.runMods);   // Schrottstufe 8: erlittener Schaden × damageMul
  run.durability = Math.max(Math.min(before, minLeft), run.durability - durabilityMax(run) * pct * mul);
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
  // Schrottstufen: erster Sieg auf Stufe 5/10/15 → Kern (wird mit ausgezahlt)
  if (run.over.won && save && save.meta) {
    const c = ascensionCoreReward(save, run.ascension);
    if (c) { run.earned.cores += c; run.earned.ascCores = (run.earned.ascCores || 0) + c; }
  }
  // Rest gutschreiben (Schrauben-Rest, Run-Ende-Kerne; der Rest ging schon während des Runs in den Spielstand)
  const payout = settleRun(run, save, true).payout;
  const st = save.stats;
  st.runs = (st.runs || 0) + 1;
  st.totalBolts = (st.totalBolts || 0) + run.stats.boltsEarned;
  st.bestDist = Math.max(st.bestDist || 0, run.stats.bestDist);
  st.bestAct = Math.max(st.bestAct || 0, run.over.won ? RUN.acts + 1 : run.act);
  if (run.over.won) st.wins = (st.wins || 0) + 1;
  st.stagesCleared = (st.stagesCleared || 0) + run.stats.cleared;
  st.bossesBeaten = (st.bossesBeaten || 0) + run.bossesBeaten.length;
  st.totalFlips = (st.totalFlips || 0) + (run.stats.flips || 0);
  markMilestone(save, 'firstRunEnd');
  if (run.over.won) markMilestone(save, 'firstWin');
  const time = Math.max(0, save.meta.totalPlaytime - (run.startPlaytime || 0));
  const asc = recordRunEnd(save, run, { won: run.over.won, act: run.act, reason: run.over.reason, stages: run.stats.stages, cleared: run.stats.cleared, scrap: payout.scrap, time });
  save.run = null;
  return { won: run.over.won, reason: run.over.reason, act: run.act, ascension: run.ascension || 0, unlockedAscension: asc.unlocked, payout, stats: { ...run.stats, medals: { ...run.stats.medals } }, bolts: run.bolts, time };
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

