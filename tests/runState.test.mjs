// Roguelite-Run (run/runState.js + run/rewards.js) mit simulierten Etappen-Ergebnissen:
// Sieg, Niederlage, Abschleppen + Neuversuch, Tankstelle, Sonderknoten verlassen, Aktwechsel, Auszahlung, Speichern/Fortsetzen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSave, migrate } from '../www/src/save/save.js';
import * as R from '../www/src/run/runState.js';
import { stageRewards, distanceScrap, comboRewards, resultGrade, liveStageScrap } from '../www/src/run/rewards.js';
import { REWARDS, RUN, STATION, KOMBO } from '../www/src/data/balance.js';
import { chooseStation } from '../www/src/shops/gasStation.js';
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
      if (o.missed) R.resolveMiss(run, 'land');   // Paket A: verfehlt → Notlandung
      log.push({ act: run.act, type: n.type, o });
    } else if (e.kind === 'station') {
      assert.ok(chooseStation(run, station).ok);
      log.push({ type: 'station' });
    } else {
      assert.ok(R.leaveNode(run).ok);
      log.push({ type: n.type });
    }
  }
  return { save, log };
}

test('Run: Sieg über drei Akte mit Aktwechsel, Meilensteinen und Auszahlung', () => {
  let save = defaultSave();
  save.run = R.newRun(save, { seed: 11 });
  const before = { ...save.meta };
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
  // Blaupausen: Boss 3/4/5 (+ Elite je 2, + Gold-Chance), Kerne: erster Boss-Sieg Akt 2 + 3, Sieg
  const elites = res.log.filter((l) => l.type === 'elite').length;
  const bpGold = res.log.filter((l) => l.o && l.o.rewards).reduce((a, l) => a + l.o.rewards.blueprints, 0);
  assert.equal(run.earned.blueprints, bpGold);
  assert.ok(run.earned.blueprints >= 3 + 4 + 5 + elites * REWARDS.blueprints.elite);
  assert.ok(run.earned.blueprints <= 3 + 4 + 5 + elites * REWARDS.blueprints.elite + res.log.filter((l) => l.o).length, 'Gold-Chance höchstens 1 je Etappe');
  assert.equal(run.earned.cores, REWARDS.firstBossCores[2] + REWARDS.firstBossCores[3] + REWARDS.winCores);
  // Paket A: Schrott, Blaupausen und Kerne sind schon während des Runs gutgeschrieben (nur der Schrauben-Rest fehlt)
  assert.equal(save.meta.scrap - before.scrap, run.earned.paid.scrap);
  assert.ok(run.earned.paid.scrap >= Math.round(run.earned.scrap) - 1 && run.earned.paid.scrap > 0);
  assert.equal(save.meta.blueprints - before.blueprints, run.earned.blueprints);
  assert.equal(save.meta.cores - before.cores, run.earned.cores);
  const end = R.endRun(save, run);
  assert.equal(save.run, null);
  assert.ok(end.won);
  // Paket E: dazu kommen Werkstatt-Stufen, Aufträge und Album (end.meta.total)
  assert.equal(save.meta.scrap - before.scrap, end.payout.scrap + (end.meta.total.scrap || 0), 'Run-Ende zahlt nur den Rest, Summe = Auszahlung + Meta');
  assert.equal(end.payout.scrap, Math.round(run.earned.scrap) + Math.floor(run.bolts * REWARDS.boltsToScrap));
  assert.equal(save.meta.blueprints - before.blueprints, run.earned.blueprints + (end.meta.total.blueprints || 0));
  assert.equal(save.meta.cores - before.cores, run.earned.cores + (end.meta.total.cores || 0));
  assert.equal(save.stats.totalScrap, end.payout.scrap);
  for (const m of ['firstBossAct1', 'firstAct2', 'firstBossAct2', 'firstAct3', 'firstBossAct3', 'firstRunEnd', 'firstWin']) assert.ok(m in save.meta.milestones, m);
  assert.equal(save.stats.runs, 1);
  assert.equal(save.stats.wins, 1);
  // zweiter Sieg: Kerne nur noch für den Sieg (erste Boss-Siege sind vorbei)
  save.run = R.newRun(save, { seed: 12 });
  play(save);
  assert.equal(save.run.earned.cores, REWARDS.winCores);
});

test('Run: verfehlt = Notlandung (−10 %, Trostkiste, weiter auf der Karte, keine Auswahl) oder Nochmal (−15 %, neue Strecke)', () => {
  const save = defaultSave();
  const run = R.newRun(save, { seed: 5 });
  save.run = run;
  const n = R.reachableNodes(run)[0];
  const e = R.enterNode(run, n.id);
  const max = R.durabilityMax(run);
  const d0 = run.durability;
  const s0 = save.meta.scrap;
  const o = R.applyStageResult(run, fake(run, e.spec, 'miss'), save);
  assert.ok(o.missed && !o.towed && !o.cleared && !o.defeat);
  assert.equal(o.grade, 'miss');
  // jeder Versuch zahlt: Weite × 0,5 (sofort gutgeschrieben)
  assert.equal(o.rewards.base.scrap, distanceScrap(1, 'stage', Math.round(e.spec.target * 0.5), 'miss'));
  assert.ok(save.meta.scrap - s0 >= o.rewards.base.scrap && o.rewards.base.scrap > 0);
  assert.equal(o.rewards.base.bolts, Math.round(REWARDS.bolts[1] * RUN.emergency.boltMul), 'Teil-Belohnung Schrauben');
  assert.equal(run.pendingChoices.length, 0, 'keine Item-Auswahl');
  assert.equal(o.emergency.penalty, Math.round(max * RUN.emergency.penalty * 10) / 10);
  assert.equal(o.retry.penalty, Math.round(max * RUN.towPenalty * 10) / 10);
  assert.ok(Math.abs(run.durability - (d0 - 3)) < 1e-9, 'Strafe erst nach der Entscheidung');
  assert.ok(run.current.missed);
  assert.equal(R.enterNode(run, n.id).reason, 'decide', 'erst entscheiden');
  assert.equal(R.applyStageResult(run, fake(run, e.spec, 'gold'), save).reason, 'decide');
  // Nochmal: −15 %, NEUE Strecke (gleiche Art und Etage)
  const r1 = R.resolveMiss(run, 'retry');
  assert.ok(r1.ok && r1.choice === 'retry');
  assert.ok(Math.abs(run.durability - (d0 - 3 - o.retry.penalty)) < 1e-9);
  assert.equal(run.current.node, n.id, 'Knoten bleibt aktiv');
  assert.equal(run.current.attempts, 1);
  assert.deepEqual(R.reachableNodes(run).map((x) => x.id), [n.id], 'nur der Neuversuch');
  const spec2 = R.enterNode(run, n.id).spec;
  assert.notEqual(spec2.seed, e.spec.seed, 'neuer Strecken-Seed');
  assert.equal(spec2.kind, e.spec.kind);
  assert.equal(spec2.floor, e.spec.floor);
  assert.equal(spec2.target, e.spec.target, 'gleiche Art/Etage → gleiche Zielmarke');
  // wieder verfehlt → Notlandung: −10 %, Trostkiste, Knoten besucht, weiter auf der Karte
  R.applyStageResult(run, fake(run, spec2, 'miss'), save);
  const d1 = run.durability, b1 = run.bolts;
  const r2 = R.resolveMiss(run, 'land');
  assert.ok(r2.ok && r2.choice === 'land');
  assert.equal(r2.penalty, Math.round(max * RUN.emergency.penalty * 10) / 10);
  assert.ok(Math.abs(run.durability - (d1 - r2.penalty)) < 1e-9);
  assert.equal(r2.bolts, RUN.emergency.crateBolts[1]);
  assert.equal(run.bolts - b1, RUN.emergency.crateBolts[1]);
  assert.equal(run.current, null);
  assert.ok(run.visited.includes(n.id));
  assert.ok(R.reachableNodes(run).every((x) => x.floor === 1), 'weiter auf der nächsten Etage');
  assert.equal(run.stats.emergencies, 1);
  assert.equal(R.resolveMiss(run, 'land').reason, 'none');
  // immer verfehlen + Notlandung → Niederlage (Haltbarkeit 0)
  let guard = 0;
  while (!run.over && guard++ < 80) {
    const m = R.reachableNodes(run)[0];
    const ee = R.enterNode(run, m.id);
    if (ee.kind === 'stage') { const oo = R.applyStageResult(run, fake(run, ee.spec, 'miss'), save); if (oo.missed) R.resolveMiss(run, 'land'); }
    else if (ee.kind === 'station') chooseStation(run, 'fuel');
    else R.leaveNode(run);
  }
  assert.ok(run.over && !run.over.won);
  assert.ok(['emergency', 'tow'].includes(run.over.reason), run.over.reason);
  assert.equal(run.durability, 0);
  const end = R.endRun(save, run);
  assert.ok(!end.won);
  assert.equal(save.run, null);
  assert.ok('firstRunEnd' in save.meta.milestones);
});

test('Run: Boss verfehlt → Neuversuch mit neuer Variante, neuem Seed und Ziel −5 % je Versuch (max. 3×)', () => {
  const save = defaultSave();
  const run = R.newRun(save, { seed: 8 });
  save.run = run;
  R.devJumpToBoss(run);
  const boss = R.reachableNodes(run)[0];
  assert.equal(boss.type, 'boss');
  const e = R.enterNode(run, boss.id);
  const max = R.durabilityMax(run);
  const t0 = e.spec.target;
  const bp0 = save.meta.blueprints;
  const o = R.applyStageResult(run, fake(run, e.spec, 'miss'), save);
  assert.ok(o.towed && !o.missed);
  assert.equal(o.towPenalty, Math.round(max * RUN.towPenalty * 10) / 10);
  assert.equal(o.rewards.base.blueprints, REWARDS.blueprints.bossLost, 'Boss-Begegnung zahlt eine Blaupause');
  assert.equal(save.meta.blueprints - bp0, REWARDS.blueprints.bossLost, 'sofort gutgeschrieben');
  assert.ok(o.bossReroll && o.bossReroll.id === run.bossIds[1]);
  const specs = [e.spec];
  for (let k = 1; k <= 4; k++) {
    run.durability = max;   // genug Haltbarkeit für weitere Versuche
    const sp = R.enterNode(run, boss.id).spec;
    specs.push(sp);
    assert.equal(sp.bossId, run.bossIds[1]);
    const cut = Math.min(k, RUN.bossRetry.maxCuts) * RUN.bossRetry.targetCut;
    assert.ok(Math.abs(sp.target - Math.round((t0 * (1 - cut)) / 5) * 5) <= 5, `Versuch ${k + 1}: Ziel ${sp.target} ≈ ${t0} × ${1 - cut}`);
    const ok = R.applyStageResult(run, fake(run, sp, 'miss'), save);
    assert.equal(ok.rewards.base.blueprints, 0, 'Neuversuch derselben Begegnung: keine weitere Blaupause');
  }
  // keine zwei identischen Strecken hintereinander
  for (let k = 1; k < specs.length; k++) assert.ok(specs[k].seed !== specs[k - 1].seed || specs[k].bossId !== specs[k - 1].bossId);
  assert.equal(specs[4].target, specs[3].target, 'höchstens 3 × −5 %');
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
  const p = STATION;
  for (const choice of ['repair', 'fuel', 'cool']) {
    const run = R.newRun(save, { seed: 8 });
    // bis zur Tankstelle (Etage 5) vorspielen, Haltbarkeit niedrig
    let e;
    for (let i = 0; i < 20; i++) {
      const n = R.reachableNodes(run)[0];
      e = R.enterNode(run, n.id);
      if (e.kind === 'station') break;
      if (e.kind === 'stage') R.applyStageResult(run, fake(run, e.spec, 'gold', { durability: 30 }));
      else R.leaveNode(run);
    }
    assert.equal(e.kind, 'station');
    const max = R.durabilityMax(run);
    const r = chooseStation(run, choice);
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

test('Run: Sonderknoten öffnen ihren Shop-Typ und gelten nach dem Verlassen als besucht (keine Platzhalter mehr)', () => {
  const save = defaultSave();
  const run = R.newRun(save, { seed: 21 });
  const seen = {};
  for (let i = 0; i < 200 && !run.over; i++) {
    const ns = R.reachableNodes(run);
    const n = ns.find((x) => !isStageType(x.type) && x.type !== 'station') || ns[0];
    const e = R.enterNode(run, n.id);
    if (e.kind === 'stage') { R.applyStageResult(run, fake(run, e.spec, 'gold')); continue; }
    assert.equal(e.kind, n.type, 'Knotenart = Shop-Art');
    if (e.kind === 'station') { chooseStation(run, 'repair'); continue; }
    const b = run.bolts;
    assert.ok(R.leaveNode(run).ok);
    assert.equal(run.bolts, b, 'Verlassen ohne Bonus');
    assert.ok(run.visited.includes(n.id));
    assert.equal(run.current, null);
    seen[n.type] = (seen[n.type] || 0) + 1;
  }
  assert.ok(Object.keys(seen).length >= 2, JSON.stringify(seen));
  assert.equal(typeof R.visitPlaceholder, 'undefined');
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

test('Belohnungen: jeder Versuch zahlt – Schrott = scrapPerM[Akt] × Weite × Wertungsfaktor (Beispiele aus OVERHAUL §5)', () => {
  // Beispiele Akt 1: 280 m verfehlt = 17 ⚙, 330 m Bronze = 40 ⚙, 495 m Gold = 89 ⚙, 700 m Platin = 168 ⚙
  assert.equal(distanceScrap(1, 'stage', 280, 'miss'), 17);
  assert.equal(distanceScrap(1, 'stage', 330, 'bronze'), 40);
  assert.equal(distanceScrap(1, 'stage', 495, 'gold'), 89);
  assert.equal(distanceScrap(1, 'stage', 700, 'platin'), 168);
  assert.deepEqual(REWARDS.gradeMul, { miss: 0.5, bronze: 1, silver: 1.25, gold: 1.5, platin: 2, king: 3 });
  assert.deepEqual(REWARDS.scrapPerM, { 1: 0.12, 2: 0.16, 3: 0.22 });
  assert.ok(distanceScrap(3, 'stage', 500, 'gold') > distanceScrap(2, 'stage', 500, 'gold'));
  // Wertung aus den Marken: Platin = Gold × 1,5, Schrottkönig = Gold × 2
  const medals = { bronze: 400, silver: 500, gold: 600, platin: 900, king: 1200 };
  const r = (dist) => resultGrade({ cleared: dist >= 400, medal: dist >= 600 ? 'gold' : dist >= 500 ? 'silver' : dist >= 400 ? 'bronze' : null, dist, medals });
  assert.deepEqual([r(300), r(400), r(550), r(650), r(950), r(1250)], ['miss', 'bronze', 'silver', 'gold', 'platin', 'king']);
  assert.equal(liveStageScrap(1, 'stage', 950, medals, 3), distanceScrap(1, 'stage', 950, 'platin') + 3);
  // Kombo: 1 🔩 je 15, 1 ⚙ je 40 gesicherte Trickpunkte
  assert.deepEqual(comboRewards(130), { bolts: Math.floor(130 / KOMBO.boltsPer), scrap: Math.floor(130 / KOMBO.scrapPer) });
  const withCombo = stageRewards(1, 'stage', { cleared: false, medal: null, dist: 280, tricks: 130, bolts: 0, scrap: 0, blueprints: 0 });
  assert.equal(withCombo.scrap, 17 + 3);
  assert.equal(withCombo.bolts, Math.round(REWARDS.bolts[1] * RUN.emergency.boltMul) + 8);
  // Blaupausen: Gold oder besser 25 % (Zufallszahl roll), Elite 2, Boss verloren 1 (nur erste Begegnung)
  const g = { cleared: true, medal: 'gold', grade: 'gold', dist: 600, medals, bolts: 0, scrap: 0, blueprints: 0 };
  assert.equal(stageRewards(1, 'stage', g, { roll: 0.1 }).blueprints, 1);
  assert.equal(stageRewards(1, 'stage', g, { roll: 0.3 }).blueprints, 0);
  assert.equal(stageRewards(1, 'stage', { ...g, medal: 'silver', grade: 'silver' }, { roll: 0 }).blueprints, 0);
  assert.equal(stageRewards(1, 'elite', { ...g, medal: 'bronze', grade: 'bronze' }).blueprints, REWARDS.blueprints.elite);
  assert.equal(stageRewards(2, 'boss', { cleared: false, medal: null, dist: 300, bolts: 0, scrap: 0, blueprints: 0 }).blueprints, 1);
  assert.equal(stageRewards(2, 'boss', { cleared: false, medal: null, dist: 300, bolts: 0, scrap: 0, blueprints: 0 }, { firstEncounter: false }).blueprints, 0);
  // Totalschaden: Weite zahlt (× 0,5), aber keine Notlandungs-Schrauben
  const wr = stageRewards(1, 'stage', { cleared: false, medal: null, dist: 280, reason: 'wreck', bolts: 0, scrap: 0, blueprints: 0 });
  assert.deepEqual([wr.scrap, wr.bolts], [17, 0]);
});

test('Belohnungen: Medaille, Knotenart und Akt', () => {
  const base = { cleared: true, bolts: 0, scrap: 0, blueprints: 0, dist: 500 };
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
  assert.deepEqual([miss.bolts, miss.scrap, miss.blueprints], [7 + Math.round(REWARDS.bolts[1] * RUN.emergency.boltMul), 3, 1], 'gesammeltes zählt auch ohne Ziel');
});

test('Run: Ausrüstung ist ab dem Start fest', () => {
  const save = defaultSave();
  const run = R.newRun(save, { seed: 1 });
  const lo1 = R.runLoadout(run, save);
  save.garage.slotLevels.drive = 9;
  const lo2 = R.runLoadout(run, save);
  assert.deepEqual(lo2.stats, lo1.stats);
  assert.equal(run.abilities.join(), 'boost,sprung');
});
