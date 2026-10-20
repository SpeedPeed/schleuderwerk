// Phase 6: Schrottstufen 1–15 (jede Regel einzeln), Freischaltung/Belohnungen, Bestwerte/Historie, Meilensteine,
// Boss-Varianten (gültige, unterschiedliche Strecken, Warnhinweise), Spielstand-Migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSave, migrate } from '../www/src/save/save.js';
import * as R from '../www/src/run/runState.js';
import { ASCENSION, ASCENSION_REWARDS } from '../www/src/data/ascension.js';
import { RUN, REWARDS, STATION, SHOP, BLACKMARKET, ASCENSION_RULES, STAGE, FEATURES } from '../www/src/data/balance.js';
import { BIOMES, biomeForAct, bossById } from '../www/src/data/biomes.js';
import { itemById } from '../www/src/data/items.js';
import { CHASSIS } from '../www/src/data/index.js';
import { PAINTS } from '../www/src/data/cosmetics.js';
import {
  ascensionMods, ascensionList, ascensionSummary, selectAscension, maxAscension, devUnlockAscension, recordRunEnd,
  checkAllChassis, MILESTONES, milestoneTarget, MAX_ASCENSION,
} from '../www/src/garage/progression.js';
import { paintState, unlockAll } from '../www/src/garage/garage.js';
import { generateActMap } from '../www/src/map/mapGen.js';
import { generateStageSpec, stageTarget } from '../www/src/physics/trackGen.js';
import { makeRng } from '../www/src/core/rng.js';
import { chooseStation, stationOptions } from '../www/src/shops/gasStation.js';
import { openDealer, rerollCost } from '../www/src/shops/scrapDealer.js';
import { itemPrice, basePrice } from '../www/src/shops/common.js';
import { removeCurseCost } from '../www/src/shops/blackMarket.js';
import { Stage } from '../www/src/stage/stage.js';
import { Track } from '../www/src/physics/track.js';
import { stageRewards } from '../www/src/run/rewards.js';

const near = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} ≈ ${b}`);

// Run auf Schrottstufe lv (Seed fest)
function runAt(lv, seed = 7) {
  const save = defaultSave();
  devUnlockAscension(save);
  selectAscension(save, lv);
  save.run = R.newRun(save, { seed });
  return { save, run: save.run };
}

// Knoten einer Art auf der aktuellen Karte
const nodeOf = (run, type) => run.map.floors.flat().find((n) => n.type === type);

// Gefälschtes Etappen-Ergebnis
function fake(run, spec, medal, extra = {}) {
  const dist = medal === 'miss' ? Math.round(spec.target * 0.5) : spec.medals[medal] ?? spec.medals.gold;
  const m = medal === 'miss' ? null : medal;
  return {
    reason: 'stop', cleared: !!m, medal: m, dist, target: spec.target, medals: spec.medals, medalList: spec.medalList, kind: spec.kind,
    bolts: 0, scrap: 0, blueprints: 0, crates: 0, damageTaken: 0, durability: run.durability, stunts: { flips: 0, loops: 0 }, ...extra,
  };
}

// Ganzen Run gewinnen (alle Etappen Gold, Sonderknoten verlassen)
function winRun(save) {
  const run = save.run;
  for (let i = 0; i < 400 && !run.over; i++) {
    const n = R.reachableNodes(run)[0];
    const e = R.enterNode(run, n.id);
    if (e.kind === 'stage') R.applyStageResult(run, fake(run, e.spec, 'gold'), save);
    else if (e.kind === 'station') chooseStation(run, 'repair');
    else R.leaveNode(run);
    while (R.pendingChoice(run)) R.skipChoice(run);
  }
  return run;
}

// ---------- Daten & Grundfunktionen ----------

test('Schrottstufen: 15 Stufen, kumulativ, jeder Schlüssel genau einmal; Zusammenfassung je Stufe', () => {
  assert.equal(ASCENSION.length, 15);
  assert.equal(MAX_ASCENSION, 15);
  assert.deepEqual(ascensionMods(0), {});
  const keys = ASCENSION.flatMap((a) => Object.keys(a.mods));
  assert.equal(new Set(keys).size, keys.length);
  for (let lv = 1; lv <= 15; lv++) {
    assert.equal(Object.keys(ascensionMods(lv)).length, lv, `Stufe ${lv}: ${lv} Regeln aktiv`);
    assert.equal(ascensionList(lv).length, lv);
    assert.equal(ascensionSummary(lv).length, lv);
  }
  assert.ok(ascensionMods(15).doubleBossAct3);
});

// ---------- je Regel ein Test ----------

test('Stufe 1 eliteWeightAdd: mehr Elite-Etappen auf der Karte', () => {
  const count = (add) => {
    let n = 0;
    for (let s = 0; s < 300; s++) n += generateActMap(1, makeRng(`elite:${s}`), { eliteWeightAdd: add }).floors.flat().filter((x) => x.type === 'elite').length;
    return n;
  };
  const base = count(0), more = count(ascensionMods(1).eliteWeightAdd);
  assert.ok(more > base * 1.2, `Elite ${base} → ${more}`);
  // im Run: die Karte wird mit dem Zuschlag erzeugt (gleicher Seed, Stufe 0 vs. 1 über viele Seeds)
  let a = 0, b = 0;
  for (let s = 0; s < 80; s++) {
    a += runAt(0, s).run.map.floors.flat().filter((x) => x.type === 'elite').length;
    b += runAt(1, s).run.map.floors.flat().filter((x) => x.type === 'elite').length;
  }
  assert.ok(b > a, `Run-Karten: ${a} → ${b}`);
});

test('Stufe 2 targetMul: alle Zielmarken × 1,08', () => {
  const r0 = runAt(1).run, r2 = runAt(2).run;
  const n = r0.map.floors[0][0];
  const s0 = R.stageSpecFor(r0, n), s2 = R.stageSpecFor(r2, r2.map.floors[0][0]);
  assert.equal(s2.target, Math.round((biomeForAct(1).targets.stage[0] * 1.08) / 5) * 5);
  assert.ok(s2.target > s0.target);
});

test('Stufe 3 towPenaltyAdd: Nochmal kostet 20 % statt 15 %, Notlandung 15 % statt 10 %', () => {
  const { save, run } = runAt(3);
  near(R.towPenaltyPct(run), RUN.towPenalty + 0.05);
  near(R.emergencyPenaltyPct(run), RUN.emergency.penalty + 0.05);
  const e = R.enterNode(run, run.map.floors[0][0].id);
  const max = R.durabilityMax(run);
  const o = R.applyStageResult(run, fake(run, e.spec, 'miss'), save);
  assert.ok(o.missed && !o.towed);
  near(o.retry.penalty, Math.round(max * 0.2 * 10) / 10);
  near(o.emergency.penalty, Math.round(max * 0.15 * 10) / 10);
  const before = run.durability;
  const res = R.resolveMiss(run, 'retry');
  near(res.penalty, Math.round(max * 0.2 * 10) / 10);
  near(run.durability, before - res.penalty);
});

test('Stufe 4 priceMul: Händler-, Reroll- und Fluch-Entfernen-Preise × 1,1', () => {
  const { run } = runAt(4);
  const { run: r3 } = runAt(3);
  const id = 'feuer_buegeleisen';
  assert.equal(itemPrice(run, id), Math.round(basePrice(id, 1) * 1.1));
  assert.equal(itemPrice(r3, id), basePrice(id, 1));
  assert.equal(rerollCost(run, { rerolls: 0 }), Math.round(SHOP.rerollBase * 1.1));
  assert.equal(removeCurseCost(run), Math.round(BLACKMARKET.removeCurseBolts * 1.1));
  // Händler-Auslage nutzt den Preis
  run.current = { node: run.map.floors[2][0].id, type: 'dealer', attempts: 0 };
  const st = openDealer(run);
  for (const o of st.offers) assert.equal(o.price, itemPrice(run, o.itemId));
});

test('Stufe 5 repairMul: Reparaturen außerhalb der Etappe heilen 25 % weniger', () => {
  const { run } = runAt(5);
  const { run: r4 } = runAt(4);
  for (const r of [run, r4]) { r.durability = 10; r.current = { node: 'x', type: 'station', attempts: 0 }; r.map.floors[0][0].id = 'x'; }
  const h5 = chooseStation(run, 'repair').healed, h4 = chooseStation(r4, 'repair').healed;
  near(h5, Math.round(R.durabilityMax(run) * STATION.repairPct * 0.75), 1);
  near(h4, Math.round(R.durabilityMax(r4) * STATION.repairPct), 1);
  assert.match(stationOptions(runAt(5).run)[0].desc, /\+26 %/);
});

test('Stufe 6 startCurse: jeder Run startet mit einem verfluchten Item', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const { run } = runAt(6, seed);
    const cursed = run.inventory.filter((e) => itemById(e.itemId).rarity === 'cursed');
    assert.equal(cursed.length, 1, `Seed ${seed}`);
  }
  assert.equal(runAt(5).run.inventory.filter((e) => itemById(e.itemId).rarity === 'cursed').length, 0);
});

test('Stufe 7 bossTargetMul: Boss-Zielmarken zusätzlich × 1,06', () => {
  const b = biomeForAct(1);
  const { run } = runAt(7);
  const spec = R.stageSpecFor(run, run.map.boss);
  assert.equal(spec.target, Math.round((b.targets.boss * 1.06 * 1.08) / 5) * 5);
  assert.equal(stageTarget(b, 'stage', 0, ascensionMods(7)), Math.round((b.targets.stage[0] * 1.08) / 5) * 5, 'normale Etappen nur × targetMul');
});

test('Stufe 8 damageMul: erlittener Schaden × 1,15 (Etappe und Ereignisse)', () => {
  const { run } = runAt(8);
  const { run: r7 } = runAt(7);
  assert.equal(run.runMods.damageMul, 1.15);
  const mk = (r) => {
    const biome = biomeForAct(1);
    const spec = generateStageSpec({ biome, kind: 'stage', floor: 0, rng: makeRng('dmg') });
    const su = R.runStageSetup(r);
    return new Stage({ biome, spec, track: new Track(spec, biome), loadout: su.loadout, seed: 3, durability: r.durability, runMods: r.runMods, inventory: [] });
  };
  const s8 = mk(run), s7 = mk(r7);
  const d8 = s8.vehicle.damage(10, 'test', [], { pierce: true }), d7 = s7.vehicle.damage(10, 'test', [], { pierce: true });
  near(d8, 11.5);
  near(d7, 10);
  const before = run.durability;
  const dmg = R.damageRun(run, 0.1);
  near(dmg, R.durabilityMax(run) * 0.1 * 1.15, 1e-6);
  assert.ok(run.durability < before);
});

test('Stufe 9 itemChoicesAdd: nur 2 Items zur Wahl', () => {
  const { save, run } = runAt(9);
  const { save: s8, run: r8 } = runAt(8);
  // Stat itemChoices (3, manche Flüche +1) minus 1
  const n9 = Math.round(R.runStats(run).itemChoices), n8 = Math.round(R.runStats(r8).itemChoices);
  assert.equal(n9, n8, 'gleicher Start-Fluch');
  assert.equal(R.queueChoice(run, save, 'stage').items.length, n9 - 1);
  assert.equal(R.queueChoice(r8, s8, 'stage').items.length, n8);
});

test('Stufe 10 startDurabilityMul: Start-Haltbarkeit −10 % (max. und aktuell)', () => {
  const { run } = runAt(10);
  const { run: r9 } = runAt(9);
  near(R.durabilityMax(run), Math.round(R.durabilityMax(r9) * 0.9 * 10) / 10, 0.11);
  near(run.durability, R.durabilityMax(run), 1e-9);
});

test('Stufe 11 heatGainMul: alle Hitzezunahmen × 1,15 (Run-Werte und Etappe)', () => {
  const { run } = runAt(11);
  const { run: r10 } = runAt(10);
  near(R.runStats(run).heatGain, R.runStats(r10).heatGain * 1.15, 1e-9);
  const biome = biomeForAct(1);
  const spec = generateStageSpec({ biome, kind: 'stage', floor: 0, rng: makeRng('heat') });
  const su = R.runStageSetup(run);
  const st = new Stage({ biome, spec, track: new Track(spec, biome), loadout: su.loadout, seed: 3, durability: run.durability, runMods: run.runMods, inventory: [] });
  near(st.stats.heatGain, 1.15, 1e-9);
  st.vehicle.heat = 0;
  st.vehicle.addHeat(10);
  near(st.vehicle.heat, 11.5, 1e-9);
});

test('Stufe 12 eliteHazards: Elite-Etappen mit mehr Gefahren und Böen', () => {
  let extra = 0, danger0 = 0, danger1 = 0;
  for (const b of BIOMES) {
    for (let s = 0; s < 30; s++) {
      const mk = (mods) => generateStageSpec({ biome: b, kind: 'elite', floor: 3, rng: makeRng(`eh:${b.id}:${s}`), mods });
      const a = mk({}), c = mk({ eliteHazards: true });
      assert.equal(c.weather.gust, a.weather.gust + ASCENSION_RULES.eliteGust);
      extra += c.features.length - a.features.length;
      const dz = (sp) => sp.features.filter((f) => ['gap', 'mud', 'scrapPile', 'crusher', 'heatZone', 'lightning', 'magnetZone'].includes(f.type)).length;
      danger0 += dz(a);
      danger1 += dz(c);
      // normale Etappen bleiben unverändert
      const n0 = generateStageSpec({ biome: b, kind: 'stage', floor: 3, rng: makeRng(`eh:${b.id}:${s}`), mods: {} });
      const n1 = generateStageSpec({ biome: b, kind: 'stage', floor: 3, rng: makeRng(`eh:${b.id}:${s}`), mods: { eliteHazards: true } });
      assert.deepEqual(n1, n0);
    }
  }
  assert.ok(extra > 0, `mehr Bausteine (${extra})`);
  assert.ok(danger1 > danger0 * 1.2, `mehr Gefahren ${danger0} → ${danger1}`);
  // im Run: Elite-Spezifikation bekommt die Regel
  const { run } = runAt(12);
  const node = run.map.floors[3][0];
  node.type = 'elite';
  assert.equal(R.stageSpecFor(run, node).weather.gust >= ASCENSION_RULES.eliteGust, true);
});

test('Stufe 13 boltMul: Schrauben-Einnahmen −15 % (Etappen-Belohnung, Überspringen, Etappe)', () => {
  const { save, run } = runAt(13);
  const { save: s12, run: r12 } = runAt(12);
  near(R.runStats(run).boltGain, R.runStats(r12).boltGain * 0.85, 1e-9);
  const play = (r, s) => {
    const e = R.enterNode(r, r.map.floors[0][0].id);
    return R.applyStageResult(r, fake(r, e.spec, 'gold'), s);
  };
  const o13 = play(run, save), o12 = play(r12, s12);
  assert.equal(o13.rewards.base.bolts, Math.round(o12.rewards.base.bolts * 0.85));
  assert.equal(R.pendingChoice(run).skipBolts, Math.round(REWARDS.itemSkipBolts[1] * 0.85));
  assert.equal(R.pendingChoice(r12).skipBolts, REWARDS.itemSkipBolts[1]);
  const b0 = run.bolts;
  R.addRunBolts(run, 20);
  assert.equal(run.bolts - b0, 17);
});

test('Stufe 14 fuelMaxMul: max. Treibstoff −10 %', () => {
  const { run } = runAt(14);
  const { run: r13 } = runAt(13);
  near(R.runStats(run).fuelMax, R.runStats(r13).fuelMax * 0.9, 1e-6);
});

test('Stufe 15 doubleBossAct3: Akt 3 endet mit beiden Boss-Varianten hintereinander', () => {
  const { save, run } = runAt(15, 3);
  // direkt nach Akt 3 vor den Boss
  R.devNextAct(run); R.devNextAct(run);
  R.devJumpToBoss(run);
  const first = run.bossIds[3];
  const e = R.enterNode(run, run.map.boss.id);
  assert.equal(e.spec.bossId, first);
  const o = R.applyStageResult(run, fake(run, e.spec, 'gold'), save);
  assert.ok(!o.won, 'erster Boss beendet den Run nicht');
  assert.ok(o.secondBoss && o.secondBoss.id !== first, 'Zwillingsboss');
  assert.ok(R.pendingChoice(run), 'Boss-Beute nach dem ersten Boss');
  assert.equal(R.pendingChoice(run).context, 'boss');
  while (R.pendingChoice(run)) R.skipChoice(run);
  assert.equal(run.current.node, run.map.boss.id, 'Boss-Knoten bleibt offen');
  assert.deepEqual(R.reachableNodes(run).map((n) => n.id), [run.map.boss.id]);
  const spec2 = R.stageSpecFor(run, run.map.boss);
  assert.equal(spec2.bossId, o.secondBoss.id);
  // Neuversuch nach Abschleppen bleibt beim zweiten Boss
  const t = R.applyStageResult(run, fake(run, spec2, 'miss'), save);
  assert.ok(t.towed);
  assert.equal(R.stageSpecFor(run, run.map.boss).bossId, o.secondBoss.id);
  const w = R.applyStageResult(run, fake(run, spec2, 'gold'), save);
  assert.ok(w.won, 'zweiter Boss = Sieg');
  assert.deepEqual(run.bossesBeaten, [3]);
  // Stufe 14: nur ein Boss
  const s14 = runAt(14, 3);
  R.devNextAct(s14.run); R.devNextAct(s14.run); R.devJumpToBoss(s14.run);
  const e14 = R.enterNode(s14.run, s14.run.map.boss.id);
  assert.ok(R.applyStageResult(s14.run, fake(s14.run, e14.spec, 'gold'), s14.save).won);
});

// ---------- Freischaltung, Belohnungen, Bestwerte ----------

test('Schrottstufen: nach dem ersten Sieg freigeschaltet, wählbar bis höchste geschaffte + 1', () => {
  const save = defaultSave();
  assert.equal(maxAscension(save), 0);
  assert.equal(selectAscension(save, 5), 0, 'gesperrt');
  save.run = R.newRun(save, { seed: 1 });
  assert.equal(save.run.ascension, 0);
  // Niederlage schaltet nichts frei
  R.giveUp(save.run);
  R.endRun(save, save.run);
  assert.equal(maxAscension(save), 0);
  // Sieg auf Stufe 0 → Stufe 1
  save.run = R.newRun(save, { seed: 2 });
  winRun(save);
  const res = R.endRun(save, save.run);
  assert.equal(res.unlockedAscension, 1);
  assert.equal(maxAscension(save), 1);
  assert.equal(save.ascension.best, 0);
  assert.equal(selectAscension(save, 4), 1);
  // Sieg auf Stufe 1 → 2; der Run übernimmt die gewählte Stufe
  save.run = R.newRun(save, { seed: 3 });
  assert.equal(save.run.ascension, 1);
  winRun(save);
  R.endRun(save, save.run);
  assert.equal(maxAscension(save), 2);
  assert.equal(save.ascension.best, 1);
  assert.ok(paintState(save, PAINTS.find((p) => p.unlock === 'ascension:1')).owned, 'Ehrenrost-Lack');
  // Niedrigere Stufe gewinnen senkt nichts
  selectAscension(save, 0);
  save.run = R.newRun(save, { seed: 4 });
  winRun(save);
  R.endRun(save, save.run);
  assert.equal(maxAscension(save), 2);
  assert.equal(save.ascension.best, 1);
});

test('Schrottstufen-Belohnung: +10 % Schrott je Stufe, erster Sieg auf 5/10/15 → +1 Kern und Lack, Meilenstein', () => {
  const save = defaultSave();
  devUnlockAscension(save);
  selectAscension(save, 5);
  save.run = R.newRun(save, { seed: 9 });
  winRun(save);
  const run = save.run;
  const scrap = Math.round(run.earned.scrap) + Math.floor(run.bolts * REWARDS.boltsToScrap);
  const cores0 = save.meta.cores;
  const coresRun = run.earned.cores - run.earned.paid.cores;   // Paket A: Kerne aus dem Run sind schon gutgeschrieben
  const res = R.endRun(save, run);
  const row = res.payout.rows.find((r) => /Schrottstufe 5 \(\+50 %/.test(r.label));
  assert.ok(row, 'Zeile Schrottstufe');
  assert.equal(row.scrap, Math.round(scrap * 0.5));
  assert.ok(res.payout.rows.some((r) => /Erster Sieg auf Schrottstufe 5/.test(r.label) && r.cores === ASCENSION_REWARDS.coresPerMilestone));
  assert.equal(save.meta.cores, cores0 + coresRun + 1);
  assert.ok(save.meta.milestones.ascension5 !== undefined);
  assert.ok(paintState(save, PAINTS.find((p) => p.unlock === 'ascension:5')).owned);
  // zweiter Sieg auf Stufe 5: kein Kern mehr
  selectAscension(save, 5);
  save.run = R.newRun(save, { seed: 10 });
  winRun(save);
  const res2 = R.endRun(save, save.run);
  assert.ok(!res2.payout.rows.some((r) => /Erster Sieg/.test(r.label)));
  // Bestwerte je Stufe
  const rec = save.ascension.records[5];
  assert.equal(rec.runs, 2);
  assert.equal(rec.wins, 2);
  assert.equal(rec.bestAct, RUN.acts + 1);
});

test('Run-Historie: letzte 10 Runs, neueste zuerst; Statistik-Summen', () => {
  const save = defaultSave();
  for (let i = 0; i < 12; i++) {
    save.meta.totalPlaytime += 100;
    save.run = R.newRun(save, { seed: 100 + i });
    R.giveUp(save.run);
    R.endRun(save, save.run);
  }
  assert.equal(save.history.length, 10);
  assert.ok(save.history[0].at >= save.history[1].at);
  assert.equal(save.history[0].won, false);
  assert.equal(save.stats.runs, 12);
  assert.equal(save.ascension.records[0].runs, 12);
  // Migration behält Historie und Bestwerte, repariert Unsinn
  const m = migrate(JSON.parse(JSON.stringify({ ...save, ascension: { unlocked: 99, best: 3, selected: 50, records: { 2: { runs: 'x', wins: 1 }, 99: {} } }, history: [1, { won: true }] })));
  assert.equal(m.ascension.unlocked, 15);
  assert.equal(m.ascension.selected, 15);
  assert.deepEqual(Object.keys(m.ascension.records), ['2']);
  assert.equal(m.ascension.records[2].runs, 0);
  assert.equal(m.history.length, 1);
  const d = migrate({ version: 3 });
  assert.deepEqual(d.ascension, { unlocked: 0, best: 0, selected: 0, records: {} });
  assert.deepEqual(d.history, []);
});

test('Meilensteine: Zielzeiten, alle Chassis, Schrottstufen 5/10/15', () => {
  for (const id of ['firstRunEnd', 'firstBossAct1', 'firstWin', 'allChassis', 'ascension5', 'ascension10', 'ascension15']) {
    assert.ok(MILESTONES.some((m) => m.id === id), id);
  }
  const t = milestoneTarget(MILESTONES.find((m) => m.id === 'firstWin'));
  assert.deepEqual(t, { min: 2.5 * 3600, max: 5 * 3600 });   // Paket A: OVERHAUL §6 3–5 h; Paket C/D: 2,5–5 h
  const save = defaultSave();
  save.meta.totalPlaytime = 1234;
  assert.equal(checkAllChassis(save), false);
  unlockAll(save);
  assert.equal(save.garage.ownedChassis.length, CHASSIS.length);
  assert.equal(checkAllChassis(save), true);
  assert.equal(save.meta.milestones.allChassis, 1234);
  // Sieg auf Stufe 15 stempelt alle drei Schrottstufen-Meilensteine
  const s = defaultSave();
  s.run = R.newRun(s, { seed: 1, ascension: 15 });
  const rec = recordRunEnd(s, s.run, { won: true, act: 3, cleared: 20, stages: 22 });
  assert.equal(rec.unlocked, 15);
  for (const m of ['ascension5', 'ascension10', 'ascension15']) assert.ok(s.meta.milestones[m] !== undefined, m);
});

// ---------- Bosse ----------

test('Bosse: 12 Varianten (Paket D: 6 neue) mit Intro, Tipps, Warnhinweisen und Musik; gültige, eindeutig verschiedene Strecken', () => {
  const all = BIOMES.flatMap((b) => b.bosses.map((x) => ({ b, boss: x })));
  assert.equal(all.length, 12);
  const shapes = new Set();
  for (const { b, boss } of all) {
    assert.ok(boss.intro && boss.intro.length > 40, `${boss.id}: Intro`);
    assert.ok(Array.isArray(boss.tips) && boss.tips.length >= 2, `${boss.id}: Tipps`);
    assert.ok(boss.music && boss.music.notes.length >= 4 && boss.music.beat > 0, `${boss.id}: Musik`);
    assert.equal(bossById(boss.id), boss);
    for (const t of Object.keys(boss.warnings)) assert.ok(boss.sequence.includes(t), `${boss.id}: Warnung für ${t} ohne Baustein`);
    const counts = {};
    for (const t of boss.sequence) counts[t] = (counts[t] || 0) + 1;
    shapes.add(JSON.stringify(Object.entries(counts).filter(([t]) => t !== 'ramp' && t !== 'hills').sort()));
    for (let s = 0; s < 40; s++) {
      const spec = generateStageSpec({ biome: b, kind: 'boss', floor: 6, rng: makeRng(`boss:${boss.id}:${s}`), bossId: boss.id, mods: s % 2 ? ascensionMods(15) : {} });
      assert.equal(spec.bossId, boss.id);
      assert.deepEqual(spec.medalList, ['bronze', 'gold']);
      let prev = FEATURES.firstFree;
      for (const f of spec.features) {
        assert.ok(f.x0 >= prev - 1e-9 && f.x1 > f.x0 && f.x1 <= spec.length + 1, `${boss.id}: Baustein ${f.type} liegt sauber`);
        prev = f.x1;
      }
      // der Charakter des Bosses bleibt: mindestens 2/3 der Bausteine der Folge sind in der Strecke
      const kinds = spec.features.map((f) => f.type);
      const core = Object.keys(boss.warnings);
      for (const t of core) assert.ok(kinds.includes(t), `${boss.id}: ${t} fehlt (Seed ${s})`);
      assert.ok(spec.features.length >= Math.ceil(boss.sequence.length * 2 / 3), `${boss.id}: ${spec.features.length} Bausteine`);
      if (boss.weather) assert.equal(spec.weather.name, boss.weather);
      if (boss.params.lightning && boss.params.lightning.every) for (const f of spec.features.filter((x) => x.type === 'lightning')) assert.deepEqual(f.every, boss.params.lightning.every);
    }
  }
  assert.equal(shapes.size, 12, 'jede Boss-Strecke hat eine eigene Bausteinmischung');
});

test('Boss-Strecke: Warnhinweise in der Etappe vor jedem gefährlichen Baustein', () => {
  const b = biomeForAct(1);
  const boss = b.bosses.find((x) => x.id === 'schrottpresse');
  const spec = generateStageSpec({ biome: b, kind: 'boss', floor: 6, rng: makeRng('warn'), bossId: boss.id });
  const popups = [];
  const sounds = [];
  const st = new Stage({ biome: b, spec, track: new Track(spec, b), seed: 4, hooks: { popup: (t, k) => popups.push({ t, k }), sfx: (n) => sounds.push(n) } });
  assert.equal(st.boss, boss);
  const expect = spec.features.filter((f) => boss.warnings[f.type]).length;
  assert.equal(st.bossWarn.length, expect);
  st.launchNow(1, 35);
  st.vehicle.maxX = spec.length;
  st.afterStep(1 / 120);
  const warns = popups.filter((p) => p.k === 'warn');
  assert.equal(warns.length, expect);
  assert.ok(warns.some((w) => /Presse/.test(w.t)));
  assert.ok(sounds.includes('warn'));
  assert.ok(STAGE.bossWarnLead > 0);
});

test('Boss-Belohnung: Episch/Legendär-Auswahl, Blaupausen 3/4/5, Kerne beim ersten Sieg in Akt 2/3', () => {
  for (const act of [1, 2, 3]) {
    const rw = stageRewards(act, 'boss', { cleared: true, medal: 'bronze', bolts: 0, scrap: 0, blueprints: 0 });
    assert.equal(rw.blueprints, REWARDS.blueprints.boss[act]);
  }
  assert.deepEqual(REWARDS.blueprints.boss, { 1: 3, 2: 4, 3: 5 });
  const save = defaultSave();
  save.run = R.newRun(save, { seed: 5 });
  const run = save.run;
  R.devJumpToBoss(run);
  let e = R.enterNode(run, run.map.boss.id);
  R.applyStageResult(run, fake(run, e.spec, 'bronze'), save);
  const ch = R.pendingChoice(run);
  assert.equal(ch.context, 'boss');
  for (const id of ch.items) assert.ok(['epic', 'legendary'].includes(itemById(id).rarity) || itemById(id).pool === 'base', id);
  while (R.pendingChoice(run)) R.skipChoice(run);
  R.devJumpToBoss(run);
  e = R.enterNode(run, run.map.boss.id);
  const o = R.applyStageResult(run, fake(run, e.spec, 'bronze'), save);
  assert.equal(o.cores, REWARDS.firstBossCores[2]);
});
