// Phase 5 – Erfinder-Labor (garage/research.js): Voraussetzungen, Kosten, Kauf mit Blaupausen, alle Freischaltarten
// (pool/items, parts, abilities, chassis + Kerne, nodes, perks), wiederholbare Feinschliff-Knoten, Speichern;
// Lackierungen (Endgame-Senke) und Labor-Layout (Raster, Linien).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSave, migrate } from '../www/src/save/save.js';
import {
  RESEARCH, BRANCHES, researchById, researchState, researchCost, buyResearch, researchPerks, perkStatMods, researchLevel,
  completeAllResearch, unlockList, PERK_KEYS,
} from '../www/src/garage/research.js';
import { buildLoadout } from '../www/src/garage/loadout.js';
import * as GL from '../www/src/garage/garage.js';
import * as R from '../www/src/run/runState.js';
import * as D from '../www/src/shops/scrapDealer.js';
import { itemPool } from '../www/src/run/rewards.js';
import { generateActMap } from '../www/src/map/mapGen.js';
import { makeRng } from '../www/src/core/rng.js';
import { chassisById, partById, abilityById, chassisUnlock } from '../www/src/data/index.js';
import { itemById } from '../www/src/data/items.js';
import { PAINTS } from '../www/src/data/cosmetics.js';
import { REWARDS, RESEARCH as BAL } from '../www/src/data/balance.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
// Spielstand mit Blaupausen, Knoten in Reihenfolge erforscht (inkl. aller Vorgänger)
function withResearch(ids, bp = 1000, save = defaultSave()) {
  save.meta.blueprints = bp;
  const want = new Set();
  const add = (id) => { if (want.has(id) || researchLevel(save, id)) return; for (const p of researchById(id).requires) add(p); want.add(id); };
  ids.forEach(add);
  for (const id of want) assert.ok(buyResearch(save, id).ok, id);
  return save;
}

test('Forschungsbaum: Daten konsistent (≈ 45+ Knoten, 5 Äste, Raster, Voraussetzungen existieren, keine Zyklen)', () => {
  assert.ok(RESEARCH.length >= 45, `${RESEARCH.length}`);
  assert.equal(Object.keys(BRANCHES).length, 5);
  const ids = new Set(RESEARCH.map((r) => r.id));
  assert.equal(ids.size, RESEARCH.length);
  const pos = new Set();
  for (const r of RESEARCH) {
    assert.ok(BRANCHES[r.branch], r.id);
    assert.ok(r.pos.x >= 0 && r.pos.x <= 8 && r.pos.y >= 0 && r.pos.y <= 12, r.id);
    const key = `${r.pos.x},${r.pos.y}`;
    assert.ok(!pos.has(key), `Rasterplatz doppelt: ${key}`);
    pos.add(key);
    for (const p of r.requires) assert.ok(ids.has(p), `${r.id} braucht ${p}`);
    assert.ok(unlockList(r).length >= 1, `${r.id} schaltet etwas frei`);
  }
  // jeder Knoten ist von den Wurzeln aus erreichbar (alles erforschbar)
  const save = defaultSave();
  save.meta.blueprints = 1e9;
  let progress = true;
  while (progress) {
    progress = false;
    for (const r of RESEARCH) if (researchState(save, r).status === 'available' && buyResearch(save, r.id).ok && !r.repeatable) progress = true;
  }
  for (const r of RESEARCH) assert.ok(researchLevel(save, r.id) > 0, `${r.id} erreichbar`);
});

test('Forschung: Voraussetzungen, Kosten mit Blaupausen, Zustände gesperrt/verfügbar/erforscht', () => {
  const save = defaultSave();
  save.meta.blueprints = 3;
  const wb = researchById('r_node_workbench');
  const hy = researchById('r_hydraulik_1');
  assert.equal(researchState(save, wb).status, 'available');
  assert.equal(researchState(save, hy).status, 'locked');
  assert.deepEqual(researchState(save, hy).missing, ['r_node_workbench']);
  assert.equal(buyResearch(save, hy.id).reason, 'locked');
  assert.equal(buyResearch(save, 'gibtsNicht').reason, 'unknown');
  const r = buyResearch(save, wb.id);
  assert.ok(r.ok && r.cost === wb.cost * BAL.costMul);
  assert.equal(save.meta.blueprints, 3 - wb.cost);
  assert.equal(researchState(save, wb).status, 'done');
  assert.equal(buyResearch(save, wb.id).reason, 'maxed');
  assert.equal(researchState(save, hy).status, 'available');
  save.meta.blueprints = 1;
  assert.equal(buyResearch(save, hy.id).reason, 'blueprints');
  assert.ok(!researchState(save, hy).canBuy);
  assert.deepEqual(save.research.done, ['r_node_workbench']);
});

test('Forschung: wiederholbare Feinschliff-Knoten – Kosten × costGrowth je Stufe, Höchststufe, Perks je Stufe', () => {
  const save = withResearch(['r_feinschliff_1'], 100000);
  const fs = researchById('r_feinschliff_1');
  assert.equal(researchLevel(save, fs.id), 1);
  assert.equal(researchState(save, fs).status, 'available', 'nach Stufe 1 weiter kaufbar');
  for (let k = 1; k < 4; k++) {
    const c = researchCost(fs, k);
    assert.equal(c, Math.round(fs.cost * Math.pow(fs.repeatable.costGrowth, k)));
    const bp = save.meta.blueprints;
    assert.ok(buyResearch(save, fs.id).ok);
    assert.equal(save.meta.blueprints, bp - c);
  }
  assert.equal(researchLevel(save, fs.id), 4);
  assert.equal(save.research.levels[fs.id], 4);
  near(researchPerks(save).scrapGain, 4 * fs.unlocks.perks.scrapGain);
  while (researchLevel(save, fs.id) < fs.repeatable.max) assert.ok(buyResearch(save, fs.id).ok);
  assert.equal(buyResearch(save, fs.id).reason, 'maxed');
  assert.equal(researchState(save, fs).status, 'done');
  // Speichern: Stufen bleiben
  const loaded = migrate(clone(save));
  assert.equal(researchLevel(loaded, fs.id), fs.repeatable.max);
});

function near(a, b, eps = 1e-9) { assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`); }

test('Freischaltungen: Item-Pool (pool/items), Teile, Fähigkeiten, Chassis (Forschung + Kerne), Kartenknoten', () => {
  // pool / items
  const save = withResearch(['r_gyro_1']);
  const pool = itemPool(save.research.done).map((i) => i.id);
  for (const id of researchById('r_gyro_1').unlocks.items) assert.ok(pool.includes(id), id);
  assert.ok(!itemPool([]).some((i) => i.id === 'gyro_jojo'));
  // Teile: kaufbar nur mit Forschung
  const part = partById('wheels_kugellager');
  assert.ok(!GL.partState(defaultSave(), part).researchOk);
  const s2 = withResearch(['r_part_wheels_kugellager']);
  s2.meta.scrap = 1e6;
  assert.ok(GL.partState(s2, part).researchOk);
  assert.ok(GL.buyPart(s2, part.id).ok);
  // Fähigkeiten
  const s3 = withResearch(['r_ability_gyrokick']);
  assert.ok(GL.abilityState(s3, abilityById('gyrokick')).unlocked);
  assert.ok(GL.setAbility(s3, 1, 'gyrokick').ok);
  assert.equal(GL.setAbility(defaultSave(), 1, 'gyrokick').reason, 'research');
  // Chassis: Forschung + Kerne
  const c = chassisById('einkaufswagen');
  const s4 = defaultSave();
  s4.meta.cores = 10;
  assert.equal(GL.buyChassis(s4, c.id).reason, 'research');
  const s5 = withResearch(['r_chassis_einkaufswagen']);
  assert.equal(GL.buyChassis(s5, c.id).reason, 'cores');
  s5.meta.cores = chassisUnlock(c).cores;   // Kerne × GARAGE.chassisCoreMul
  assert.ok(GL.buyChassis(s5, c.id).ok);
  assert.equal(s5.meta.cores, 0);
  assert.equal(s5.garage.chassis, c.id);
  // Kartenknoten: Werkbank/Schwarzmarkt nur mit Forschung
  const count = (research) => {
    const n = { workbench: 0, blackmarket: 0 };
    for (let k = 0; k < 300; k++) {
      const m = generateActMap(1 + (k % 3), makeRng(k), { research });
      for (const row of m.floors) for (const node of row) if (node.type in n) n[node.type]++;
    }
    return n;
  };
  assert.deepEqual(count([]), { workbench: 0, blackmarket: 0 });
  const wb = count(['r_node_workbench']);
  assert.ok(wb.workbench > 50 && wb.blackmarket === 0, JSON.stringify(wb));
  const all = count(['r_node_workbench', 'r_node_blackmarket']);
  assert.ok(all.workbench > 50 && all.blackmarket > 30, JSON.stringify(all));
  // im Run: Forschung zum Run-Start zählt
  const s6 = withResearch(['r_node_workbench', 'r_node_blackmarket']);
  let found = 0;
  for (let k = 0; k < 40; k++) {
    s6.run = R.newRun(s6, { seed: k });
    for (const row of s6.run.map.floors) for (const node of row) if (node.type === 'workbench' || node.type === 'blackmarket') found++;
  }
  assert.ok(found > 10);
});

test('Freischaltungen: alle Perks wirken (startBolts, itemSlots, abilitySlots, rerollDiscount, reserveSlots, startDurability, scrapGain, choiceExtra)', () => {
  const base = defaultSave();
  const lo0 = buildLoadout(base);
  const save = withResearch(['r_perk_start_bolts', 'r_perk_item_slot', 'r_perk_ability_slot', 'r_perk_reroll_discount', 'r_perk_reserve_slot', 'r_feinschliff_1', 'r_feinschliff_2', 'r_feinschliff_3']);
  const p = researchPerks(save);
  assert.deepEqual(Object.keys(p).sort(), [...PERK_KEYS].sort());
  assert.equal(p.startBolts, 15 + 3);
  assert.equal(p.itemSlots, 1);
  assert.equal(p.abilitySlots, 1);
  near(p.rerollDiscount, 0.2);
  assert.equal(p.reserveSlots, 1);
  assert.equal(p.startDurability, 2);
  near(p.scrapGain, 0.02);
  // Garage-Werte
  const lo = buildLoadout(save);
  assert.equal(lo.slots.items, lo0.slots.items + 1);
  assert.equal(lo.slots.abilities, 3);
  near(lo.stats.durabilityMax, lo0.stats.durabilityMax + 2);
  near(lo.stats.rerollDiscount, 0.2);
  // Run-Start
  const run = R.newRun(save, { seed: 3 });
  save.run = run;
  assert.equal(run.bolts, 18);
  assert.equal(R.itemSlots(run), lo0.slots.items + 1);
  near(run.durability, lo0.stats.durabilityMax + 2);
  const n = R.reachableNodes(run)[0];
  n.type = 'dealer';
  R.enterNode(run, n.id);
  assert.equal(D.rerollCost(run), 8);
  assert.equal(D.reserveSlots(run), 2);
  // scrapGain: + Anteil auf allen Schrott am Run-Ende
  run.earned.scrap = 500;
  run.bolts = 0;
  const pay = R.endRun(save, run).payout;
  assert.equal(pay.scrap, 500 + Math.round(500 * 0.02));
  // choiceExtra (vorbereitet): + Items zur Wahl
  const stats = perkStatMods({ choiceExtra: 1 })[0].stats;
  assert.deepEqual(stats.itemChoices, { add: 1 });
  const lo2 = buildLoadout(defaultSave(), { perks: { choiceExtra: 1 } });
  assert.equal(lo2.stats.itemChoices, lo0.stats.itemChoices + 1);
  // Run-Perks sind ab dem Start fest (späterer Kauf ändert den laufenden Run nicht)
  const s2 = withResearch(['r_perk_start_bolts']);
  s2.run = R.newRun(s2, { seed: 1 });
  const slots = R.itemSlots(s2.run);
  withResearch(['r_perk_item_slot'], 1000, s2);
  assert.equal(researchPerks(s2).itemSlots, 1);
  assert.equal(R.itemSlots(s2.run), slots);
  assert.equal(R.itemSlots(R.newRun(s2, { seed: 2 })), slots + 1, 'gilt ab dem nächsten Run');
});

test('Forschung: Dev „ganzer Baum“ und Spielstand-Migration (levels)', () => {
  const save = defaultSave();
  completeAllResearch(save);
  for (const r of RESEARCH) assert.equal(researchLevel(save, r.id), 1);
  const old = clone(defaultSave());
  delete old.research.levels;
  old.research.done = ['r_feinschliff_1'];
  const m = migrate(old);
  assert.deepEqual(m.research.levels, {});
  assert.equal(researchLevel(m, 'r_feinschliff_1'), 1);
  const bad = clone(defaultSave());
  bad.research.levels = { r_feinschliff_1: 'x', r_feinschliff_2: 3.7, r_feinschliff_3: -1 };
  assert.deepEqual(migrate(bad).research.levels, { r_feinschliff_2: 3 });
});

test('Lackierungen: Kauf mit Schrott/Kernen, Anlegen, Schrottstufen-Lacke, Modellfarben', () => {
  const save = defaultSave();
  const scrapPaint = PAINTS.find((p) => p.cost && p.cost.scrap);
  const corePaint = PAINTS.find((p) => p.cost && p.cost.cores);
  const ascPaint = PAINTS.find((p) => !p.cost);
  assert.equal(GL.buyPaint(save, scrapPaint.id).reason, 'scrap');
  save.meta.scrap = scrapPaint.cost.scrap;
  assert.ok(GL.buyPaint(save, scrapPaint.id).ok);
  assert.equal(save.meta.scrap, 0);
  assert.equal(save.cosmetics.paint, scrapPaint.id);
  assert.deepEqual(GL.paintVisual(save), { color: scrapPaint.colors.body, accent: scrapPaint.colors.accent });
  assert.equal(GL.buyPaint(save, scrapPaint.id).reason, 'owned');
  assert.equal(GL.buyPaint(save, corePaint.id).reason, 'cores');
  save.meta.cores = corePaint.cost.cores;
  assert.ok(GL.buyPaint(save, corePaint.id).ok);
  assert.ok(GL.equipPaint(save, scrapPaint.id).ok);
  assert.ok(GL.equipPaint(save, null).ok);
  assert.equal(GL.paintVisual(save), null);
  assert.equal(GL.buyPaint(save, ascPaint.id).reason, 'ascension');
  assert.equal(GL.equipPaint(save, ascPaint.id).reason, 'locked');
  save.ascension.best = 15;
  assert.ok(GL.paintState(save, ascPaint).owned);
  assert.ok(GL.equipPaint(save, ascPaint.id).ok);
  // Speichern: Besitz und Lack bleiben, unbekannte IDs fliegen raus
  const s = clone(save);
  s.cosmetics.owned.push('p_gibtsnicht');
  const m = migrate(s);
  assert.deepEqual(m.cosmetics.owned, [scrapPaint.id, corePaint.id]);
  assert.equal(m.cosmetics.paint, ascPaint.id);
  // Endgame-Senke: Summe aller Lacke
  const sum = PAINTS.reduce((a, p) => a + ((p.cost && p.cost.scrap) || 0), 0);
  assert.ok(sum > 50000, `${sum} Schrott`);
  assert.ok(REWARDS.boltsToScrap > 0);
  assert.ok(itemById('gyro_jojo'));
});
