// Roguelite-Run (run/runState.js + run/rewards.js) mit simulierten Etappen-Ergebnissen:
// Sieg, Niederlage, Abschleppen + Neuversuch, Tankstelle, Platzhalter, Aktwechsel, Auszahlung, Speichern/Fortsetzen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSave, migrate } from '../www/src/save/save.js';
import * as R from '../www/src/run/runState.js';
import { stageRewards } from '../www/src/run/rewards.js';
import { REWARDS, RUN } from '../www/src/data/balance.js';
import { NODE_TYPES } from '../www/src/data/nodes.js';
import { isStageType } from '../www/src/map/mapGen.js';
import { Stage } from '../www/src/stage/stage.js';
import { biomeById } from '../www/src/data/biomes.js';

// Gefälschtes Etappen-Ergebnis zur Spezifikation
function fake(run, spec, medal, extra = {}) {
  const dist = medal === 'miss' ? Math.round(spec.target * 0.5) : spec.medals[medal] ?? spec.medals.gold;
  const m = medal === 'miss' ? null : (medal === 'silver' && spec.kind === 'boss' ? 'bronze' : medal);
  return {
    reason: 'stop', cleared: !!m, medal: m, dist, target: spec.target, medals: spec.medals, medalList: spec.medalList, kind: spec.kind,
    bolts: 4, scrap: 2, blueprints: 0, crates: 1, damageTaken: 3, durability: run.durability - 3, stunts: { flips: 1, loops: 0 }, ...extra,
  };
}

// Ganzen Run spielen; pick(run, nodes) wählt den Knoten, medalFor(spec) die Medaille
function play(save, { medal = () => 'gold', station = 'repair', roundtrip = false, maxSteps = 400 } = {}) {
  const log = [];
  for (let i = 0; i < maxSteps && !save.run.over; i++) {
    if (roundtrip) save = migrate(JSON.parse(JSON.stringify(save)));   // App-Neustart nach jeder Aktion
    const run = save.run;
    const n = R.reachableNodes(run)[0];
    const e = R.enterNode(run, n.id);
    assert.ok(e.ok, e.reason);
    if (e.kind === 'stage') {
      const o = R.applyStageResult(run, fake(run, e.spec, medal(e.spec, run)), save);
      log.push({ act: run.act, type: n.type, o });
    } else if (e.kind === 'station') {
      assert.ok(R.chooseStation(run, station).ok);
      log.push({ type: 'station' });
    } else {
      assert.ok(R.visitPlaceholder(run).ok);
      log.push({ type: n.type });
    }
  }
  return { save, log };
}

test('Run: Sieg über drei Akte mit Aktwechsel, Meilensteinen und Auszahlung', () => {
  let save = defaultSave();
  save.run = R.newRun(save, { seed: 11 });
  assert.equal(save.run.durability, save.run.durabilityBase);
  assert.equal(save.run.biome, 'schrottplatz');
  const res = play(save);
  save = res.save;
  const run = save.run;
  assert.ok(run.over && run.over.won, 'gewonnen');
  assert.deepEqual(run.bossesBeaten, [1, 2, 3]);
  const acts = [...new Set(res.log.filter((l) => l.act).map((l) => l.act))];
  assert.deepEqual(acts, [1, 2, 3]);
  const bossLog = res.log.filter((l) => l.type === 'boss');
  assert.equal(bossLog.length, 3);
  assert.equal(bossLog[0].o.nextAct, 2);
  assert.equal(bossLog[1].o.nextAct, 3);
  assert.ok(bossLog[2].o.won);
  // jeder Akt: Etage 0 … 5 + Boss besucht, Tankstelle auf Etage 5
  assert.equal(res.log.filter((l) => l.type === 'station').length, 3);
  // Blaupausen: Boss 3/4/5 (+ Elite je 1), Kerne: erster Boss-Sieg Akt 2 + 3, Sieg
  const elites = res.log.filter((l) => l.type === 'elite').length;
  assert.equal(run.earned.blueprints, 3 + 4 + 5 + elites * REWARDS.blueprints.elite);
  assert.equal(run.earned.cores, REWARDS.firstBossCores[2] + REWARDS.firstBossCores[3] + REWARDS.winCores);
  const before = { ...save.meta };
  const end = R.endRun(save, run);
  assert.equal(save.run, null);
  assert.ok(end.won);
  assert.equal(save.meta.scrap - before.scrap, end.payout.scrap);
  assert.equal(end.payout.scrap, Math.round(run.earned.scrap) + Math.floor(run.bolts * REWARDS.boltsToScrap));
  assert.equal(save.meta.blueprints - before.blueprints, run.earned.blueprints);
  assert.equal(save.meta.cores - before.cores, run.earned.cores);
  for (const m of ['firstBossAct1', 'firstAct2', 'firstBossAct2', 'firstAct3', 'firstBossAct3', 'firstRunEnd', 'firstWin']) assert.ok(m in save.meta.milestones, m);
  assert.equal(save.stats.runs, 1);
  assert.equal(save.stats.wins, 1);
  // zweiter Sieg: Kerne nur noch für den Sieg (erste Boss-Siege sind vorbei)
  save.run = R.newRun(save, { seed: 12 });
  play(save);
  assert.equal(save.run.earned.cores, REWARDS.winCores);
});

test('Run: Abschleppen (15 % max. Haltbarkeit), Neuversuch derselben Strecke, Niederlage durch Abschleppen', () => {
  const save = defaultSave();
  const run = R.newRun(save, { seed: 5 });
  save.run = run;
  const n = R.reachableNodes(run)[0];
  const e = R.enterNode(run, n.id);
  const max = R.durabilityMax(run);
  const d0 = run.durability;
  const o = R.applyStageResult(run, fake(run, e.spec, 'miss'), save);
  assert.ok(o.towed && !o.cleared && !o.defeat);
  assert.equal(o.towPenalty, Math.round(max * RUN.towPenalty * 10) / 10);
  assert.ok(Math.abs(run.durability - (d0 - 3 - o.towPenalty)) < 1e-9);
  assert.equal(run.current.node, n.id, 'Knoten bleibt aktiv');
  assert.equal(run.current.attempts, 1);
  assert.deepEqual(R.reachableNodes(run).map((x) => x.id), [n.id], 'nur Neuversuch möglich');
  assert.equal(R.enterNode(run, R.reachableNodes(run)[0].id).ok, true);
  assert.deepEqual(R.stageSpecFor(run, n), e.spec, 'gleiche Strecke beim Neuversuch');
  assert.ok(!R.enterNode(run, run.map.floors[0].find((x) => x.id !== n.id).id).ok, 'anderer Knoten gesperrt');
  // geschafft → weiter
  const o2 = R.applyStageResult(run, fake(run, e.spec, 'bronze'), save);
  assert.ok(o2.cleared && !o2.towed);
  assert.equal(run.current, null);
  assert.ok(run.visited.includes(n.id));
  // immer verfehlen → Niederlage durch Abschleppen
  let guard = 0;
  while (!run.over && guard++ < 50) {
    const m = R.reachableNodes(run)[0];
    const ee = R.enterNode(run, m.id);
    if (ee.kind === 'stage') R.applyStageResult(run, fake(run, ee.spec, 'miss'), save);
    else if (ee.kind === 'station') R.chooseStation(run, 'fuel');
    else R.visitPlaceholder(run);
  }
  assert.ok(run.over && !run.over.won);
  assert.equal(run.over.reason, 'tow');
  assert.equal(run.durability, 0);
  const end = R.endRun(save, run);
  assert.ok(!end.won);
  assert.equal(save.run, null);
  assert.ok('firstRunEnd' in save.meta.milestones);
});

test('Run: Totalschaden in der Etappe = Niederlage', () => {
  const save = defaultSave();
  const run = R.newRun(save, { seed: 6 });
  const e = R.enterNode(run, R.reachableNodes(run)[0].id);
  const o = R.applyStageResult(run, fake(run, e.spec, 'miss', { reason: 'wreck', durability: 0 }), save);
  assert.ok(o.defeat);
  assert.equal(run.over.reason, 'wreck');
  assert.deepEqual(R.reachableNodes(run), []);
});

test('Run: Tankstelle (Reparieren / Volltanken / Kühlerspülung) wirkt für den Run, auch in der Etappe', () => {
  const save = defaultSave();
  const p = NODE_TYPES.station.params;
  for (const choice of ['repair', 'fuel', 'cool']) {
    const run = R.newRun(save, { seed: 8 });
    // bis zur Tankstelle (Etage 5) vorspielen, Haltbarkeit niedrig
    let e;
    for (let i = 0; i < 20; i++) {
      const n = R.reachableNodes(run)[0];
      e = R.enterNode(run, n.id);
      if (e.kind === 'station') break;
      if (e.kind === 'stage') R.applyStageResult(run, fake(run, e.spec, 'gold', { durability: 30 }));
      else R.visitPlaceholder(run);
    }
    assert.equal(e.kind, 'station');
    const max = R.durabilityMax(run);
    const r = R.chooseStation(run, choice);
    assert.ok(r.ok);
    if (choice === 'repair') assert.ok(Math.abs(run.durability - Math.min(max, 30 + max * p.repairPct)) < 1e-9);
    if (choice === 'fuel') assert.equal(run.runMods.fuelMaxAdd, p.fuelMaxAdd);
    if (choice === 'cool') assert.equal(run.runMods.coolMul, p.coolMul);
    // Etappe mit den Run-Werten
    const lo = R.runLoadout(run, save);
    const st = new Stage({ biome: biomeById(run.biome), loadout: lo, runMods: run.runMods, durability: run.durability, seed: 1 });
    if (choice === 'fuel') assert.ok(Math.abs(st.stats.fuelMax - (lo.stats.fuelMax + p.fuelMaxAdd)) < 1e-9);
    if (choice === 'cool') assert.ok(Math.abs(st.stats.coolRate - lo.stats.coolRate * (1 + p.coolMul)) < 1e-9);
    assert.ok(Math.abs(st.vehicle.durability - run.durability) < 1e-9, 'Haltbarkeit kommt vom Run');
  }
});

test('Run: Platzhalter-Knoten geben ihren kleinen Bonus und gelten als besucht', () => {
  const save = defaultSave();
  const run = R.newRun(save, { seed: 21 });
  const seen = {};
  for (let i = 0; i < 200 && !run.over; i++) {
    const ns = R.reachableNodes(run);
    const n = ns.find((x) => !isStageType(x.type) && x.type !== 'station') || ns[0];
    const e = R.enterNode(run, n.id);
    if (e.kind === 'placeholder') {
      const b = run.bolts;
      const r = R.visitPlaceholder(run);
      assert.equal(run.bolts - b, REWARDS.placeholderBolts[n.type] || 0);
      assert.ok(run.visited.includes(n.id));
      seen[n.type] = r.bolts;
    } else if (e.kind === 'station') R.chooseStation(run, 'repair');
    else R.applyStageResult(run, fake(run, e.spec, 'gold'));
  }
  assert.ok(Object.keys(seen).length >= 2, JSON.stringify(seen));
  if ('event' in seen) assert.equal(seen.event, 10);
  if ('treasure' in seen) assert.equal(seen.treasure, 20);
});

test('Run: Speichern/Fortsetzen nach jeder Aktion ergibt denselben Verlauf', () => {
  const a = defaultSave();
  a.run = R.newRun(a, { seed: 33 });
  const b = JSON.parse(JSON.stringify(a));
  const medal = (spec) => (spec.floor % 2 ? 'silver' : 'gold');
  const ra = play(a, { medal });
  const rb = play(b, { medal, roundtrip: true });
  assert.deepEqual(rb.save.run, ra.save.run);
});

test('Belohnungen: Medaille, Knotenart und Akt', () => {
  const base = { cleared: true, bolts: 0, scrap: 0, blueprints: 0 };
  const b1 = stageRewards(1, 'stage', { ...base, medal: 'bronze' });
  const g1 = stageRewards(1, 'stage', { ...base, medal: 'gold' });
  const g3 = stageRewards(3, 'stage', { ...base, medal: 'gold' });
  const e1 = stageRewards(1, 'elite', { ...base, medal: 'bronze' });
  const boss = stageRewards(2, 'boss', { ...base, medal: 'bronze' });
  const bossG = stageRewards(2, 'boss', { ...base, medal: 'gold' });
  assert.ok(g1.bolts > b1.bolts && g1.scrap > b1.scrap);
  assert.ok(g3.bolts > g1.bolts);
  assert.ok(e1.bolts > b1.bolts && e1.blueprints === REWARDS.blueprints.elite);
  assert.equal(boss.blueprints, REWARDS.blueprints.boss[2]);
  assert.ok(bossG.scrap > boss.scrap);
  const miss = stageRewards(1, 'stage', { cleared: false, medal: null, bolts: 7, scrap: 3, blueprints: 1 });
  assert.deepEqual([miss.bolts, miss.scrap, miss.blueprints], [7, 3, 1], 'gesammeltes zählt auch ohne Ziel');
});

test('Run: Ausrüstung ist ab dem Start fest', () => {
  const save = defaultSave();
  const run = R.newRun(save, { seed: 1 });
  const lo1 = R.runLoadout(run, save);
  save.garage.partLevels[save.garage.parts.drive] = 15;
  const lo2 = R.runLoadout(run, save);
  assert.deepEqual(lo2.stats, lo1.stats);
  assert.equal(run.abilities.join(), 'boost,sprung');
});
