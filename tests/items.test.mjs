// Items: Inhaltsdaten (Validator), Inventar (Tags, Sets 2/4/6, Hybride, Badewanne, Beschreibungen), Item-Auswahl
// (Gewichte je Kontext, Pool), Run-Integration (Start-Item, Auswahl nach der Etappe, voller Rucksack, Kodex) und der
// Belastungstest: alle 88 Items ★3 gleichzeitig in einer simulierten Etappe von 60 s.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ITEMS, itemById, itemPools } from '../www/src/data/items.js';
import { TAGS, TAG_IDS } from '../www/src/data/tags.js';
import { ITEMS as BAL, BASE_STATS, REWARDS } from '../www/src/data/balance.js';
import { CHASSIS, partById } from '../www/src/data/index.js';
import {
  tagCounts, activeSets, applyInventory, describeItem, fuseSame, makeHybrid, addEntry, tierMult, entryTags, setProgressFor, upgradeRandom,
} from '../www/src/items/inventory.js';
import { computeStats } from '../www/src/items/statMods.js';
import { rollItemChoices, rarityWeights, itemPool } from '../www/src/run/rewards.js';
import * as R from '../www/src/run/runState.js';
import { defaultSave, migrate } from '../www/src/save/save.js';
import { buildLoadout } from '../www/src/garage/loadout.js';
import { makeRng } from '../www/src/core/rng.js';
import { BIOMES } from '../www/src/data/biomes.js';
import { generateStageSpec } from '../www/src/physics/trackGen.js';
import { Stage } from '../www/src/stage/stage.js';
import { Track } from '../www/src/physics/track.js';
import { simSave } from '../tools/sim/bot.mjs';
import { mockInput } from './helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const near = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} ≉ ${b}`);

test('Inhaltsdaten: Validator (tools/validateContent.mjs) ohne Fehler, 88 Items, 10 Tags', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'validateContent.mjs'), '--json'], { encoding: 'utf8' });
  const res = JSON.parse(out);
  assert.deepEqual(res.errors, [], res.errors.map((e) => `${e.where}: ${e.msg}`).join('\n'));
  assert.equal(res.stats.items, 88);
  assert.equal(ITEMS.length, 88);
  assert.equal(new Set(ITEMS.map((i) => i.id)).size, 88);
  assert.deepEqual(Object.keys(TAGS), TAG_IDS);
  for (const t of TAG_IDS) assert.deepEqual(Object.keys(TAGS[t].sets), ['2', '4', '6']);
});

test('Inventar: Tag-Zählung (Zwei-Tag-Items und Hybride zählen doppelt, Tag-Teile 1), Sets 2/4/6', () => {
  const inv = [
    { itemId: 'elektro_blitzableiter', tier: 1 },
    { itemId: 'gyro_fahrraddynamo', tier: 1 },           // gyro + elektro
    { itemId: 'elektro_fernbedienungs_akku', tier: 1, hybrid: 'feuer_zuendkerzen_kette', hybridTier: 1 }, // Hybrid
  ];
  const c = tagCounts(inv, { drive: { id: 'drive_elektromotor' } });
  assert.equal(c.elektro, 4, '3 Items + Elektromotor');
  assert.equal(c.gyro, 1);
  assert.equal(c.feuer, 1);
  const sets = activeSets(c).map((s) => s.id);
  assert.deepEqual(sets, ['elektro2', 'elektro4']);
  assert.deepEqual(activeSets({ ...c, elektro: 6 }).filter((s) => s.tag === 'elektro').map((s) => s.level), [2, 4, 6]);
  assert.deepEqual(entryTags(inv[2]).sort(), ['elektro', 'feuer']);
  // Set-Fortschritt für die Auswahl-Karte
  const pr = setProgressFor('elektro_peltier_kuehlbox', [inv[0]]);
  assert.deepEqual(pr.map((p) => [p.tag, p.to, p.reaches]), [['elektro', 2, 2], ['eis', 1, null]]);
});

test('Inventar: Stat-Beiträge mit ★-Faktor, Hybrid ×0,75, Fluch-Teil unskaliert', () => {
  const lo = buildLoadout(defaultSave());
  const s0 = lo.stats;
  const st = (inv) => computeStats(applyInventory(lo, inv).statInput);
  // Bügeleisen: boostThrust mul 0,1 je Stufe (Phase 6: 0,08 → 0,1)
  near(st([{ itemId: 'feuer_buegeleisen', tier: 1 }]).boostThrust, s0.boostThrust * 1.1, 1e-9);
  near(st([{ itemId: 'feuer_buegeleisen', tier: 3 }]).boostThrust, s0.boostThrust * (1 + 0.1 * BAL.tierMult[2]), 1e-9);
  near(st([{ itemId: 'gyro_wasserwaage', tier: 1, hybrid: 'feuer_buegeleisen', hybridTier: 1 }]).boostThrust, s0.boostThrust * (1 + 0.1 * 0.75), 1e-9, 'Hybrid');
  // Verfluchter Turbolader: Fluch-Stats (xmul) wirken unskaliert
  const tl = itemById('rakete_verfluchter_turbolader');
  assert.ok(tl.curse && tl.curse.stats);
  const a = st([{ itemId: tl.id, tier: 1 }]), b = st([{ itemId: tl.id, tier: 3 }]);
  for (const [k, m] of Object.entries(tl.curse.stats)) if (m.xmul && !(tl.stats && tl.stats[k])) near(a[k], b[k], 1e-9, `Fluch ${k}`);
});

test('Inventar: Badewanne 5 Plätze, voller Rucksack → ersetzen; Fusion und Hybride als reine Funktionen', () => {
  const save = defaultSave();
  save.garage.chassis = 'badewanne';
  save.garage.ownedChassis.push('badewanne');
  const run = R.newRun(save, { seed: 2 });
  assert.equal(R.itemSlots(run), 5);
  assert.equal(run.inventory.length, 1, 'Start-Item');
  const ids = ITEMS.filter((i) => i.pool === 'base').map((i) => i.id).filter((id) => id !== run.inventory[0].itemId);
  for (let i = 0; i < 4; i++) assert.ok(R.giveItem(run, save, ids[i]).ok);
  assert.equal(R.giveItem(run, save, ids[4]).reason, 'full');
  const rep = R.giveItem(run, save, ids[4], { replace: 2 });
  assert.ok(rep.ok && rep.replaced.itemId === ids[1] && run.inventory[2].itemId === ids[4]);
  // Fusion / Hybrid
  const f = fuseSame({ itemId: 'feuer_buegeleisen', tier: 1 }, { itemId: 'feuer_buegeleisen', tier: 2 });
  assert.deepEqual(f.entry, { itemId: 'feuer_buegeleisen', tier: 3 });
  assert.equal(fuseSame({ itemId: 'feuer_buegeleisen', tier: 3 }, { itemId: 'feuer_buegeleisen', tier: 1 }).reason, 'maxed');
  assert.equal(fuseSame({ itemId: 'feuer_buegeleisen', tier: 1 }, { itemId: 'eis_bohnerwachs', tier: 1 }).reason, 'different');
  const h = makeHybrid({ itemId: 'feuer_buegeleisen', tier: 2 }, { itemId: 'eis_bohnerwachs', tier: 1 });
  assert.ok(h.ok);
  assert.deepEqual(h.entry, { itemId: 'feuer_buegeleisen', tier: 2, hybrid: 'eis_bohnerwachs', hybridTier: 1, name: 'Bügeleisen-Bohnerwachs' });
  assert.equal(makeHybrid({ itemId: 'feuer_buegeleisen', tier: 1 }, { itemId: 'feuer_grillanzuender', tier: 1 }).reason, 'sameTags');
  const setup = applyInventory(buildLoadout(defaultSave()), [h.entry]);
  const srcs = setup.sources.filter((s) => s.kind === 'item');
  near(srcs.find((s) => s.id === 'feuer_buegeleisen').scale, BAL.tierMult[1] * 0.75, 1e-9);
  // upgradeItem
  const inv = [{ itemId: 'feuer_buegeleisen', tier: 3 }, { itemId: 'eis_bohnerwachs', tier: 1 }];
  assert.equal(upgradeRandom(inv, makeRng(1)), 1);
  assert.equal(inv[1].tier, 2);
  assert.equal(addEntry([], { itemId: 'gibtsnicht', tier: 1 }, 6).reason, 'unknown');
});

test('describeItem: Platzhalter mit skalierten Werten (★1/★2/★3)', () => {
  const it = itemById('feuer_zuendkerzen_kette');   // {dur} = 1,2 (Phase 6: 0,8 → 1,2)
  assert.match(describeItem(it, 1).desc, /Gratis-Boost 1,2 s/);
  assert.match(describeItem(it, 2).desc, /Gratis-Boost 1,9 s/);
  assert.match(describeItem(it, 3).desc, /Gratis-Boost 2,8 s/);
  for (const i of ITEMS) {
    for (const t of [1, 2, 3]) {
      const d = describeItem(i, t);
      assert.ok(!/\{[a-z]+\}/.test(d.desc), `${i.id}: Platzhalter übrig (${d.desc})`);
      if (d.curse) assert.ok(!/\{[a-z]+\}/.test(d.curse));
    }
  }
  assert.equal(tierMult(4), 3);
});

test('Item-Auswahl: Gewichte je Kontext, Pool nur base + erforschte Pools, nie verflucht, keine Doppelten', () => {
  assert.deepEqual(Object.keys(rarityWeights('boss', 1)).sort(), ['epic', 'legendary']);
  assert.ok(!('common' in rarityWeights('elite', 1)));
  assert.ok(rarityWeights('stage', 3).epic > rarityWeights('stage', 1).epic, 'spätere Akte: seltener häufiger');
  const base = itemPool([]);
  assert.ok(base.every((i) => i.pool === 'base' && i.rarity !== 'cursed'));
  assert.equal(base.length, 20);
  const all = itemPool([], true);
  assert.equal(all.length, 80, 'alle außer den 8 Verfluchten');
  // Häufigkeiten (alle Pools offen): Etappe überwiegend gewöhnlich, Elite nie gewöhnlich, Boss nur Episch/Legendär
  const counts = (context) => {
    const c = { common: 0, rare: 0, epic: 0, legendary: 0, cursed: 0 };
    const rng = makeRng(`w:${context}`);
    for (let i = 0; i < 1500; i++) for (const id of rollItemChoices({ rng, context, act: 1, count: 1, all: true })) c[itemById(id).rarity]++;
    return c;
  };
  const st = counts('stage'), el = counts('elite'), bo = counts('boss');
  near(st.common / 1500, BAL.rarityWeights.stage.common, 0.05, 'Etappe gewöhnlich');
  near(st.rare / 1500, BAL.rarityWeights.stage.rare, 0.05, 'Etappe selten');
  assert.equal(el.common, 0);
  assert.equal(bo.common + bo.rare, 0);
  near(bo.legendary / 1500, BAL.rarityWeights.boss.legendary, 0.05, 'Boss legendär');
  for (const c of [st, el, bo]) assert.equal(c.cursed, 0);
  // nur base-Pool: Boss fällt auf vorhandene Seltenheiten zurück (keine Episch/Legendär im base-Pool)
  const b = rollItemChoices({ rng: makeRng(5), context: 'boss', count: 3 });
  assert.equal(b.length, 3);
  assert.ok(b.every((id) => itemById(id).pool === 'base'));
  // keine Doppelten, besessene Items erscheinen nicht
  for (let k = 0; k < 50; k++) {
    const ch = rollItemChoices({ rng: makeRng(k), count: 4, research: itemPools(), owned: ['feuer_buegeleisen'] });
    assert.equal(new Set(ch).size, ch.length);
    assert.ok(!ch.includes('feuer_buegeleisen'));
  }
});

test('Run: Start-Item je Chassis (starterTag → base-Item des Tags)', () => {
  for (const c of CHASSIS) {
    const save = defaultSave();
    save.garage.chassis = c.id;
    save.garage.ownedChassis.push(c.id);
    const run = R.newRun(save, { seed: 9 });
    assert.equal(run.inventory.length, 1, c.id);
    const it = itemById(run.inventory[0].itemId);
    assert.equal(it.pool, 'base');
    assert.equal(it.tags[0], c.starterTag, `${c.id}: ${it.id}`);
    assert.equal(save.codex.items[it.id], 2, 'Kodex: besessen');
  }
});

test('Run: Auswahl nach geschaffter Etappe (+1 je Item-Kiste), Nehmen/Überspringen, Kodex, Speichern', () => {
  const save = defaultSave();
  const run = R.newRun(save, { seed: 4 });
  save.run = run;
  const n = R.reachableNodes(run)[0];
  const e = R.enterNode(run, n.id);
  const res = { reason: 'stop', cleared: true, medal: 'gold', dist: e.spec.medals.gold, target: e.spec.target, medals: e.spec.medals, medalList: e.spec.medalList, kind: 'stage', bolts: 3, scrap: 1, blueprints: 0, crates: 2, damageTaken: 0, durability: run.durability, stunts: {} };
  const o = R.applyStageResult(run, res, save);
  assert.equal(o.choices, 3, '1 + 2 Kisten');
  assert.deepEqual(run.pendingChoices.map((c) => c.context), ['stage', 'crate', 'crate']);
  const ch = R.pendingChoice(run);
  assert.equal(ch.items.length, BASE_STATS.itemChoices);
  for (const id of ch.items) assert.ok(save.codex.items[id] >= 1, 'gesehen');
  // speichern/laden mit offener Auswahl
  const loaded = migrate(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(loaded.run.pendingChoices, run.pendingChoices);
  const take = ch.items[1];
  const p = R.pickItem(run, save, 1);
  assert.ok(p.ok);
  assert.equal(run.inventory[run.inventory.length - 1].itemId, take);
  assert.equal(save.codex.items[take], 2);
  const b0 = run.bolts;
  const sk = R.skipChoice(run);
  assert.equal(run.bolts - b0, REWARDS.itemSkipBolts[1]);
  assert.equal(sk.bolts, REWARDS.itemSkipBolts[1]);
  assert.equal(run.pendingChoices.length, 1);
  // nicht geschafft → keine Auswahl
  const run2 = R.newRun(save, { seed: 5 });
  const e2 = R.enterNode(run2, R.reachableNodes(run2)[0].id);
  R.applyStageResult(run2, { ...res, cleared: false, medal: null, dist: 1, durability: run2.durability, target: e2.spec.target }, save);
  assert.equal(run2.pendingChoices.length, 0);
});

test('Run: Elite-Auswahl mind. Selten, Boss Episch/Legendär (Pools offen), Run-Ereignisse über Items', () => {
  const save = defaultSave();
  const run = R.newRun(save, { seed: 7 });
  run.poolAll = true;
  for (let i = 0; i < 20; i++) {
    const el = R.queueChoice(run, save, 'elite');
    assert.ok(el.items.every((id) => itemById(id).rarity !== 'common'));
    const bo = R.queueChoice(run, save, 'boss');
    assert.ok(bo.items.every((id) => ['epic', 'legendary'].includes(itemById(id).rarity)));
  }
  // stageClear: Schrottwürfel (+1 max. Haltbarkeit je Etappe), Rabattmarkenheft (Gold +5 Schrauben)
  const r2 = R.newRun(save, { seed: 8 });
  R.giveItem(r2, save, 'schrott_schrottwuerfel');
  R.giveItem(r2, save, 'gluck_rabattmarkenheft');
  const max0 = R.durabilityMax(r2);
  const b0 = r2.bolts;
  const log = R.emitRunEvent(r2, save, 'stageClear', { medal: 'gold', kind: 'stage' });
  near(R.durabilityMax(r2), max0 + 1, 1e-9, 'maxHp');
  assert.equal(r2.bolts - b0, 5);
  assert.ok(log.triggered.some((t) => t.id === 'schrott_schrottwuerfel'));
  // Rabattmarkenheft: +1 Item zur Wahl
  assert.equal(R.queueChoice(r2, save, 'stage').items.length, BASE_STATS.itemChoices + 1);
});

test('Belastung: alle 88 Items ★3 in einer simulierten Etappe (60 s) – keine Ausnahme, Ereignisse begrenzt, Werte endlich', () => {
  const inv = ITEMS.map((it) => ({ itemId: it.id, tier: 3 }));
  for (const biome of BIOMES) {
    const spec = generateStageSpec({ biome, kind: 'boss', floor: 6, rng: makeRng(`last:${biome.id}`), bossId: biome.bosses[0].id });
    let result = null;
    let maxPerFlush = 0;
    let triggers = 0;
    const stage = new Stage({
      biome, spec, track: new Track(spec, biome), loadout: buildLoadout(simSave('gut')), seed: 11, inventory: inv, farEnd: false,
      runInfo: { bolts: 40, counters: {} },
      hooks: { end: (r) => { result = r; }, triggered: () => { triggers++; } },
    });
    const drain = stage.queue.drain.bind(stage.queue);
    stage.queue.drain = (fn) => { const n = drain(fn); maxPerFlush = Math.max(maxPerFlush, n); return n; };
    const v = stage.vehicle;
    // 60 s fahren: zufällig neigen, boosten, Fähigkeiten tippen; Haltbarkeit/Treibstoff auffüllen (Flüche!) und
    // die Etappe nicht durch Stillstand/Sturz enden lassen
    const rng = makeRng(`eingabe:${biome.id}`);
    const input = mockInput();
    stage.launchNow(1, 38, true);
    const dt = 1 / 60;
    for (let i = 0; stage.time < 60 && i < 20000; i++) {   // Spielzeit (Zeitlupe verlangsamt sie)
      const t = stage.time;
      if (rng.next() < 0.05) input.st.tilt = [-1, 0, 1][Math.floor(rng.next() * 3)];
      input.st.held[0] = rng.next() < 0.6;
      if (rng.next() < 0.02) input.press(1);
      v.durability = v.stats.durabilityMax;
      v.fuel = Math.max(v.fuel, 30);
      stage.stopTimer = 0;
      stage.fallTimer = -1;
      stage.wreckTimer = -1;
      stage.update(dt, input);
      assert.equal(stage.phase, 'fly', `Etappe läuft (t = ${t.toFixed(2)})`);
    }
    assert.ok(stage.time >= 59.9, `gefahren ${stage.time.toFixed(1)} s`);
    stage.finish('time');
    const r = result;
    assert.ok(r, 'Ergebnis');
    assert.ok(maxPerFlush <= BAL.maxEventsPerFlush, `Ereignisse je Abarbeitung ${maxPerFlush}`);
    assert.ok(triggers > 100, `Auslösungen ${triggers}`);
    for (const [k, x] of Object.entries(stage.stats)) assert.ok(Number.isFinite(x), `Stat ${k} = ${x}`);
    for (const k of ['x', 'y', 'vx', 'vy', 'angle', 'w', 's', 'fuel', 'heat', 'durability']) assert.ok(Number.isFinite(v[k]), `${k} = ${v[k]}`);
    assert.ok(Number.isFinite(r.dist) && Number.isFinite(r.bolts) && Number.isFinite(r.scrap));
    assert.ok(stage.maxChain <= BAL.maxChainDepth + 1);
  }
});

test('Etappe endet bei Gold × STAGE.farMul (Grund „far“), Testfahrten ohne diese Grenze', async () => {
  const { STAGE } = await import('../www/src/data/balance.js');
  const biome = BIOMES[0];
  const spec = generateStageSpec({ biome, kind: 'stage', floor: 0, rng: makeRng('weit') });
  const mk = (farEnd) => {
    let res = null;
    const st = new Stage({ biome, spec, track: new Track(spec, biome), loadout: buildLoadout(defaultSave()), seed: 2, farEnd, hooks: { end: (r) => { res = r; } } });
    st.launchNow(0.6, 30);
    st.vehicle.maxX = spec.medals.gold * STAGE.farMul + 1;
    st.update(1 / 60, mockInput());
    return { st, get res() { return res; } };
  };
  const a = mk(true);
  assert.equal(a.res && a.res.reason, 'far');
  assert.equal(a.res.medal, 'gold');
  const b = mk(false);
  assert.equal(b.res, null);
  assert.equal(b.st.phase, 'fly');
});
