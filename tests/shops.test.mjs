// Phase 5 – Sonderknoten: Schrotthändler (Angebote, Preise, Rabatte, Reroll, Reservieren, Fähigkeit), Werkbank (★-Fusion,
// Hybrid ×0,75 + beide Tags + Set-Zählung, Zerlegen), Schwarzmarkt (alle Bezahlarten, Fluch entfernen), Tankstelle,
// Ereignisse (alle Effekt-Arten, Kosten, Auswahl je Akt, alle 26 Ereignisse), Schatz mit Haken, Run-Ende-Umrechnung,
// Speichern/Fortsetzen mitten in einem Shop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSave, migrate } from '../www/src/save/save.js';
import * as R from '../www/src/run/runState.js';
import * as D from '../www/src/shops/scrapDealer.js';
import * as W from '../www/src/shops/workbench.js';
import * as B from '../www/src/shops/blackMarket.js';
import * as G from '../www/src/shops/gasStation.js';
import * as E from '../www/src/shops/textEvent.js';
import * as T from '../www/src/shops/treasure.js';
import { basePrice, actMul } from '../www/src/shops/common.js';
import { SHOP, WORKBENCH, BLACKMARKET, STATION, TREASURE, REWARDS, ITEMS as BAL_ITEMS } from '../www/src/data/balance.js';
import { NODE_TYPES } from '../www/src/data/nodes.js';
import { TEXT_EVENTS } from '../www/src/data/textEvents.js';
import { itemById } from '../www/src/data/items.js';
import { cursedItemPool, abilityById } from '../www/src/data/index.js';
import { tagCounts, activeSets, applyInventory, isCursedEntry, hybridName, entryName } from '../www/src/items/inventory.js';
import { computeStats } from '../www/src/items/statMods.js';
import { completeAllResearch } from '../www/src/garage/research.js';
import { makeRng } from '../www/src/core/rng.js';
import { isStageType } from '../www/src/map/mapGen.js';

const near = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} ≉ ${b}`);
const clone = (v) => JSON.parse(JSON.stringify(v));

// Neuer Run; opts: { seed, chassis, research: 'all' | [ids] }
function setup(opts = {}) {
  const save = defaultSave();
  if (opts.research === 'all') completeAllResearch(save);
  else if (opts.research) save.research.done.push(...opts.research);
  if (opts.chassis) { save.garage.chassis = opts.chassis; save.garage.ownedChassis.push(opts.chassis); }
  save.run = R.newRun(save, { seed: opts.seed ?? 7 });
  return { save, run: save.run };
}

// Nächsten erreichbaren Knoten auf `type` setzen und betreten
function enterAs(run, type) {
  const n = R.reachableNodes(run)[0];
  n.type = type;
  const e = R.enterNode(run, n.id);
  assert.ok(e.ok, e.reason);
  return e;
}

// ---------------------------------------------------------------------------------------------------------------
test('Zahlen: balance.js (maßgeblich) stimmt mit den Beschreibungen in data/nodes.js überein', () => {
  const p = NODE_TYPES;
  assert.equal(SHOP.items, p.dealer.params.items);
  assert.equal(SHOP.abilities, p.dealer.params.abilities);
  assert.equal(SHOP.rerollBase, p.dealer.params.rerollBase);
  assert.equal(SHOP.rerollStep, p.dealer.params.rerollStep);
  assert.equal(SHOP.reserveSlots, p.dealer.params.reserveSlots);
  assert.equal(WORKBENCH.hybridMul, p.workbench.params.hybridEffectMul);
  assert.equal(BLACKMARKET.items, p.blackmarket.params.items);
  assert.equal(STATION.repairPct, p.station.params.repairPct);
  assert.equal(STATION.fuelMaxAdd, p.station.params.fuelMaxAdd);
  assert.equal(STATION.coolMul, p.station.params.coolMul);
  assert.equal(TREASURE.suspiciousChance, p.treasure.params.suspiciousChance);
});

// ---------------------------------------------------------------------------------------------------------------
test('Schrotthändler: 5 Items + 1 Fähigkeit, Seltenheit nach Akt, Preise Seltenheit × Akt × Rabatt, deterministisch', () => {
  const { run } = setup({ research: 'all' });
  run.poolAll = true;
  run.bolts = 1000;
  enterAs(run, 'dealer');
  const v = D.dealerView(run);
  assert.equal(v.offers.length, SHOP.items);
  assert.ok(v.ability && abilityById(v.ability.id) && !run.abilities.includes(v.ability.id));
  for (const o of v.offers) {
    const def = itemById(o.itemId);
    assert.notEqual(def.rarity, 'cursed');
    assert.equal(o.price, Math.round(SHOP.price[def.rarity] * SHOP.actMul[1]));
  }
  assert.equal(new Set(v.offers.map((o) => o.itemId)).size, SHOP.items, 'keine Doppelten in der Auslage');
  // gleiche Auslage nach Speichern + Laden
  const v2 = D.dealerView(R.normalizeRun(clone(run)));
  assert.deepEqual(v2.offers.map((o) => o.itemId), v.offers.map((o) => o.itemId));
  // Akt-Faktor und Seltenheits-Verteilung je Akt (viele Händler)
  const counts = { 1: {}, 3: {} };
  for (const act of [1, 3]) {
    for (let s = 0; s < 120; s++) {
      const { run: r } = setup({ seed: 1000 + s, research: 'all' });
      r.poolAll = true;
      if (act === 3) { R.devNextAct(r); R.devNextAct(r); }
      enterAs(r, 'dealer');
      for (const o of D.dealerView(r).offers) {
        const def = itemById(o.itemId);
        counts[act][def.rarity] = (counts[act][def.rarity] || 0) + 1;
        if (act === 3) assert.equal(o.price, Math.round(SHOP.price[def.rarity] * actMul(3)));
      }
    }
  }
  const share = (c, r) => (c[r] || 0) / Object.values(c).reduce((a, b) => a + b, 0);
  near(share(counts[1], 'common'), SHOP.rarityWeights[1].common, 0.06, 'Akt 1 gewöhnlich');
  assert.ok(share(counts[3], 'epic') > share(counts[1], 'epic') + 0.08, 'Akt 3: mehr Episch');
  assert.ok(share(counts[3], 'common') < share(counts[1], 'common') - 0.15, 'Akt 3: weniger Gewöhnlich');
});

test('Schrotthändler: Einkaufswagen −20 %, Item-Rabatte addieren sich; Reroll 10 + 10 je Reroll und Forschungs-Rabatt', () => {
  const { run } = setup({ chassis: 'einkaufswagen', seed: 3 });
  run.inventory = [];   // Start-Item (Glück) könnte selbst Rabatt geben
  run.bolts = 500;
  enterAs(run, 'dealer');
  const v = D.dealerView(run);
  for (const o of v.offers) assert.equal(o.price, Math.max(1, Math.round(basePrice(o.itemId, 1) * 0.8)), 'Einkaufswagen −20 %');
  // Reroll: 10, 20, 30 …
  const costs = [];
  for (let i = 0; i < 3; i++) { const r = D.reroll(run); assert.ok(r.ok); costs.push(r.cost); }
  assert.deepEqual(costs, [10, 20, 30]);
  assert.equal(run.bolts, 500 - 60);
  // Reroll würfelt neu (deterministisch je Reroll-Zähler)
  // Item-Rabatt (Opas Glückspfennig shopDiscount +0,1) addiert sich zum Chassis-Rabatt
  R.giveItem(run, null, 'gluck_gluckspfennig');
  assert.equal(D.reroll(run).cost, 40);
  const o = D.dealerView(run).offers[0];
  assert.equal(o.price, Math.max(1, Math.round(basePrice(o.itemId, 1) * 0.7)));
  // Forschung r_perk_reroll_discount: −20 % auf Rerolls
  const s2 = setup({ research: ['r_gluck_1', 'r_perk_start_bolts', 'r_schrott_1', 'r_chassis_einkaufswagen', 'r_perk_reroll_discount'] });
  s2.run.bolts = 100;
  enterAs(s2.run, 'dealer');
  assert.equal(D.rerollCost(s2.run), 8);
  assert.ok(D.reroll(s2.run).ok);
  assert.equal(D.rerollCost(s2.run), 16);
  // nicht genug Schrauben
  s2.run.bolts = 3;
  assert.equal(D.reroll(s2.run).reason, 'bolts');
});

test('Schrotthändler: Kaufen, voller Rucksack → ersetzen, Fähigkeit ersetzt einen Slot für den Run, shopEnter', () => {
  const { save, run } = setup({ seed: 9 });
  run.bolts = 1000;
  run.inventory = [];
  R.giveItem(run, save, 'gluck_gluckspfennig', { force: true });   // shopEnter: +4 Schrauben
  const b0 = run.bolts;
  const e = enterAs(run, 'dealer');
  assert.ok(e.events.some((l) => l.bolts === 4), 'shopEnter löst Items aus');
  assert.equal(run.bolts, b0 + 4);
  const v = D.dealerView(run);
  const before = run.inventory.length;
  const r = D.buyOffer(run, save, 0);
  assert.ok(r.ok);
  assert.equal(run.inventory.length, before + 1);
  assert.equal(run.bolts, b0 + 4 - v.offers[0].price);
  assert.equal(D.buyOffer(run, save, 0).reason, 'sold');
  // Rucksack voll
  while (run.inventory.length < R.itemSlots(run)) R.giveItem(run, save, 'feuer_buegeleisen', { force: true });
  const full = D.buyOffer(run, save, 1);
  assert.equal(full.reason, 'full');
  const rep = D.buyOffer(run, save, 1, 0);
  assert.ok(rep.ok && run.inventory[0].itemId === v.offers[1].itemId);
  // Fähigkeit: ersetzt Slot 2 (auch ohne Forschung) – die Etappe bekommt sie
  const ab = v.ability.id;
  const a = D.buyAbility(run, 1);
  assert.ok(a.ok && a.replaced === 'sprung');
  assert.equal(run.abilities[1], ab);
  const lo = R.runLoadout(run, save);
  assert.ok(lo.abilities.includes(ab), 'Run-Ausrüstung enthält die gekaufte Fähigkeit');
  assert.equal(D.buyAbility(run, 0).reason, 'sold');
});

test('Schrotthändler: Reservieren hält ein Item für den nächsten Händler (Preis bleibt), Plätze + Forschung', () => {
  const { save, run } = setup({ seed: 12 });
  run.bolts = 0;
  enterAs(run, 'dealer');
  const v = D.dealerView(run);
  assert.equal(v.reserve.slots, SHOP.reserveSlots);
  const r = D.toggleReserve(run, 2);
  assert.ok(r.ok && r.reserved);
  assert.deepEqual(run.reserve, [{ itemId: v.offers[2].itemId, price: v.offers[2].price }]);
  assert.equal(D.buyOffer(run, save, 2).reason, 'reserved');
  assert.equal(D.toggleReserve(run, 3).reason, 'full', 'nur 1 Platz');
  // lösen und neu reservieren
  assert.ok(!D.toggleReserve(run, 2).reserved);
  assert.equal(run.reserve.length, 0);
  D.toggleReserve(run, 2);
  R.leaveNode(run);
  // nächster Händler: reserviertes Item liegt vorne in der Auslage, Preis gesichert (auch in Akt 2)
  R.devNextAct(run);
  enterAs(run, 'dealer');
  const v2 = D.dealerView(run);
  assert.equal(v2.offers.length, SHOP.items + 1);
  assert.ok(v2.offers[0].fromReserve);
  assert.equal(v2.offers[0].itemId, v.offers[2].itemId);
  assert.equal(v2.offers[0].price, v.offers[2].price, 'Preis aus Akt 1 gesichert');
  assert.equal(run.reserve.length, 0, 'Reservierung eingelöst');
  assert.equal(D.toggleReserve(run, 0).reason, 'fromReserve');
  // Reroll behält die eingelöste Reservierung
  run.bolts = 100;
  D.reroll(run);
  assert.equal(D.dealerView(run).offers[0].itemId, v.offers[2].itemId);
  run.bolts = 1000;
  assert.ok(D.buyOffer(run, save, 0).ok);
  // Forschung r_perk_reserve_slot: 2 Plätze
  const s2 = setup({ research: ['r_gluck_1', 'r_perk_start_bolts', 'r_schrott_1', 'r_chassis_einkaufswagen', 'r_perk_reroll_discount', 'r_perk_reserve_slot'] });
  enterAs(s2.run, 'dealer');
  assert.equal(D.reserveSlots(s2.run), 2);
  assert.ok(D.toggleReserve(s2.run, 0).ok && D.toggleReserve(s2.run, 1).ok);
  assert.equal(D.toggleReserve(s2.run, 2).reason, 'full');
});

// ---------------------------------------------------------------------------------------------------------------
test('Werkbank: ★-Fusion nur mit gleicher ★ (max. ★3), 1 Fusion je Besuch, Zerlegen unbegrenzt (40 % des Preises)', () => {
  const { save, run } = setup({ seed: 4 });
  run.inventory = [];
  for (const id of ['feuer_buegeleisen', 'feuer_buegeleisen', 'eis_bohnerwachs', 'feuer_buegeleisen']) R.giveItem(run, save, id);
  run.inventory[3].tier = 2;
  enterAs(run, 'workbench');
  assert.equal(W.fusionPreview(run, 0, 3).reason, 'tier', 'verschiedene ★');
  const opts = W.fusionOptions(run);
  assert.ok(opts.some((o) => o.kind === 'tier' && o.a === 0 && o.b === 1));
  assert.ok(opts.some((o) => o.kind === 'hybrid'));
  const f = W.fuseItems(run, save, 0, 1);
  assert.ok(f.ok && f.tier === 2);
  assert.equal(run.inventory.length, 3, 'ein Platz frei');
  assert.deepEqual(run.inventory.map((e) => [e.itemId, e.tier]), [['feuer_buegeleisen', 2], ['eis_bohnerwachs', 1], ['feuer_buegeleisen', 2]]);
  assert.equal(W.fuseItems(run, save, 0, 2).reason, 'used', '1 Fusion je Besuch');
  assert.equal(W.hybridize(run, save, 0, 1).reason, 'used');
  // Zerlegen: ★2 = 2 × Grundpreis × 40 %
  const val = W.scrapValue(run, run.inventory[2]);
  assert.equal(val, Math.round(basePrice('feuer_buegeleisen', 1) * 2 * WORKBENCH.scrapPct));
  const b0 = run.bolts;
  assert.ok(W.scrapItem(run, 2).ok);
  assert.ok(W.scrapItem(run, 1).ok);
  assert.equal(run.bolts, b0 + val + Math.round(basePrice('eis_bohnerwachs', 1) * WORKBENCH.scrapPct));
  assert.equal(run.inventory.length, 1);
  R.leaveNode(run);
  // nächster Besuch: wieder eine Fusion; ★2 + ★2 → ★3, ★3 + ★3 geht nicht
  R.giveItem(run, save, 'feuer_buegeleisen', { tier: 2 });
  enterAs(run, 'workbench');
  assert.equal(W.fusionsLeft(run), 1);
  assert.equal(W.fuseItems(run, save, 0, 1).tier, 3);
  R.leaveNode(run);
  R.giveItem(run, save, 'feuer_buegeleisen', { tier: 3 });
  enterAs(run, 'workbench');
  assert.equal(W.fuseItems(run, save, 0, 1).reason, 'maxed');
});

test('Werkbank: Hybrid – beide Tags, beide Effekte × 0,75, ein Slot frei, Set-Zählung, Name, speicherbar', () => {
  const { save, run } = setup({ seed: 5 });
  run.inventory = [];
  // 2 Feuer + 1 Elektro: Hybrid aus Feuer- und Elektro-Item zählt für beide Tags
  for (const id of ['feuer_zuendkerzen_kette', 'gyro_omas_kreisel', 'feuer_buegeleisen']) R.giveItem(run, save, id);
  enterAs(run, 'workbench');
  const before = tagCounts(run.inventory);
  const h = W.hybridize(run, save, 0, 1);
  assert.ok(h.ok);
  assert.equal(h.entry.name, 'Zündkerzen-Kreisel');
  assert.equal(entryName(run.inventory[0]), 'Zündkerzen-Kreisel');
  assert.equal(run.inventory.length, 2, 'ein Slot frei');
  const after = tagCounts(run.inventory);
  assert.equal(after.feuer, before.feuer);
  assert.equal(after.gyro, before.gyro);
  assert.ok(activeSets(after).some((s) => s.id === 'feuer2'), 'Feuer-Set 2 bleibt aktiv (Hybrid zählt)');
  // beide Effekte × 0,75: Stats und Auslöser beider Items
  const lo = R.runLoadout(run, save);
  const setupI = applyInventory(lo, run.inventory);
  const src = setupI.sources.filter((s) => s.kind === 'item' && s.slot === 0);
  assert.deepEqual(src.map((s) => s.id).sort(), ['feuer_zuendkerzen_kette', 'gyro_omas_kreisel'].sort());
  for (const s of src) near(s.scale, WORKBENCH.hybridMul, 1e-9);
  const statItems = setupI.statInput.items.filter((i) => i.slot === 0);
  assert.equal(statItems.length, 2);
  for (const si of statItems) near(si.scale, WORKBENCH.hybridMul, 1e-9);
  // gleiche Tags → kein Hybrid; Hybrid aus Hybrid → nein
  assert.equal(W.fusionPreview(run, 0, 1).reason, 'hybrid');
  // speichern + laden: Name und Hybrid bleiben
  save.run = run;
  const loaded = migrate(clone(save));
  assert.deepEqual(loaded.run.inventory[0], run.inventory[0]);
  assert.equal(entryName(loaded.run.inventory[0]), 'Zündkerzen-Kreisel');
  // Namen aus beiden Namen
  assert.equal(hybridName('Opas Bürodrehstuhl', 'Jo-Jo vom Jahrmarkt'), 'Bürodrehstuhl-Jo-Jo');
  assert.equal(hybridName('Verfluchter Turbolader', 'Hufeisen-Magnet'), 'Turbolader-Magnet');
});

// ---------------------------------------------------------------------------------------------------------------
test('Schwarzmarkt: 3 verfluchte Items aus dem Fluch-Pool, alle Bezahlarten, Fluch entfernen', () => {
  const { save, run } = setup({ seed: 6 });
  run.inventory = [];
  enterAs(run, 'blackmarket');
  const st = B.openBlackMarket(run);
  assert.equal(st.offers.length, BLACKMARKET.items);
  const pool = cursedItemPool([]).map((it) => it.id);
  for (const o of st.offers) assert.ok(pool.includes(o.itemId), `${o.itemId} aus r_curse_1 (ohne Forschung)`);
  // Haltbarkeit
  const max0 = R.durabilityMax(run);
  const r1 = B.buyCursed(run, save, 0, 'durability');
  assert.ok(r1.ok);
  near(R.durabilityMax(run), max0 - Math.round(max0 * BLACKMARKET.payDurabilityPct * 10) / 10, 0.11, 'max. Haltbarkeit −15 %');
  assert.ok(run.durability <= R.durabilityMax(run));
  // Treibstoff
  const fuelBefore = R.runStats(run).fuelMax;
  assert.ok(B.buyCursed(run, save, 1, 'fuel').ok);
  assert.equal(run.runMods.fuelMaxAdd, -BLACKMARKET.payFuelMax);
  assert.ok(R.runStats(run).fuelMax < fuelBefore);
  // Kerne: ohne Kern nicht möglich, mit Kern aus dem Spielstand
  assert.equal(B.buyCursed(run, save, 2, 'cores').reason, 'pay');
  save.meta.cores = 2;
  assert.ok(B.buyCursed(run, save, 2, 'cores').ok);
  assert.equal(save.meta.cores, 2 - BLACKMARKET.payCores);
  assert.equal(B.buyCursed(run, save, 2, 'fuel').reason, 'sold');
  assert.equal(run.inventory.length, 3);
  // Fluch entfernen: Item bleibt, Fluch-Stats fallen weg
  const slot = run.inventory.findIndex((e) => e.itemId === 'eis_ewiger_eiszapfen');
  if (slot < 0) R.giveItem(run, save, 'eis_ewiger_eiszapfen', { force: true });
  const s = run.inventory.findIndex((e) => e.itemId === 'eis_ewiger_eiszapfen');
  const fuelCursed = R.runStats(run).fuelMax;
  run.bolts = 0;
  assert.equal(B.removeCurse(run, s).reason, 'bolts');
  run.bolts = 200;
  const rc = B.removeCurse(run, s);
  assert.ok(rc.ok && rc.cost === Math.round(BLACKMARKET.removeCurseBolts * actMul(1)));
  assert.ok(run.inventory[s].cleansed && !isCursedEntry(run.inventory[s]));
  assert.ok(R.runStats(run).fuelMax > fuelCursed, 'Tank −20 % (Fluch) entfällt');
  assert.ok(!B.cursedSlots(run).includes(s));
  assert.equal(B.removeCurse(run, s).reason, 'notCursed');
  // Regel des Items bleibt (noOverheat), Fluch-Teil nicht
  const lo = R.runLoadout(run, save);
  assert.ok(applyInventory(lo, run.inventory).rules.noOverheat);
});

test('Schwarzmarkt: r_curse_2-Flüche erst mit Forschung; Bezahlen mit Haltbarkeit/Treibstoff nur mit genug Rest', () => {
  assert.ok(cursedItemPool([]).every((it) => it.pool === 'r_curse_1'));
  assert.equal(cursedItemPool([]).length, 4);
  assert.equal(cursedItemPool(['r_curse_2']).length, 8);
  const { save, run } = setup({ seed: 2 });
  enterAs(run, 'blackmarket');
  run.runMods.fuelMaxAdd = -(R.runStats(run).fuelMax - BLACKMARKET.minFuelLeft - 5);
  assert.ok(!B.payOptions(run, save).find((p) => p.id === 'fuel').can);
  assert.equal(B.buyCursed(run, save, 0, 'fuel').reason, 'pay');
});

// ---------------------------------------------------------------------------------------------------------------
test('Tankstelle: Reparieren × (1 + repairBonus), Volltanken, Kühlerspülung; Knoten danach besucht', () => {
  const { run } = setup({ seed: 8 });
  enterAs(run, 'station');
  run.durability = 20;
  const max = R.durabilityMax(run);
  const r = G.chooseStation(run, 'repair');
  assert.ok(r.ok);
  near(run.durability, Math.min(max, 20 + max * STATION.repairPct), 1e-9);
  assert.equal(run.current, null);
  assert.equal(run.stats.stations, 1);
  assert.equal(G.stationOptions(run)[0].desc, '+35 % Haltbarkeit');
});

// ---------------------------------------------------------------------------------------------------------------
test('Ereignisse: Auswahl je Akt, kein Ereignis doppelt im Run, deterministisch nach Seed', () => {
  for (const act of [1, 2, 3]) {
    const list = E.eventsForAct(act);
    assert.ok(list.length >= 8, `Akt ${act}: ${list.length}`);
  }
  assert.equal(TEXT_EVENTS.length, 26);
  const { run } = setup({ seed: 31 });
  const seen = new Set();
  for (let i = 0; i < 6; i++) {
    enterAs(run, 'event');
    const v = E.eventView(run);
    assert.ok(v.event.acts.includes(1));
    assert.ok(!seen.has(v.event.id), 'kein Ereignis doppelt');
    seen.add(v.event.id);
    E.chooseOption(run, null, v.options.length - 1);   // Weitergehen
    R.leaveNode(run);
  }
  // gleicher Seed → gleiches Ereignis, gleicher Ausgang
  const a = setup({ seed: 44 }), b = setup({ seed: 44 });
  enterAs(a.run, 'event'); enterAs(b.run, 'event');
  assert.equal(E.eventView(a.run).event.id, E.eventView(b.run).event.id);
  a.run.bolts = b.run.bolts = 100;
  const ra = E.chooseOption(a.run, a.save, 0, { slot: 0 }), rb = E.chooseOption(b.run, b.save, 0, { slot: 0 });
  assert.deepEqual(ra.result, rb.result);
});

test('Ereignisse: jede Effekt-Art', () => {
  const { save, run } = setup({ seed: 50, research: 'all' });
  enterAs(run, 'event');
  const st = run.current.shop || E.openEvent(run);
  const rng = makeRng(1);
  const log = [];
  const ap = (fx) => { log.length = 0; E.applyEffect(run, save, fx, rng, log, st); return log; };
  run.bolts = 10;
  ap({ bolts: 30 }); assert.equal(run.bolts, 40);
  ap({ bolts: -100 }); assert.equal(run.bolts, 0, 'nie unter 0');
  const sc = run.earned.scrap; ap({ scrap: 30 }); assert.equal(run.earned.scrap, sc + 30);
  const bp = run.earned.blueprints; ap({ blueprints: 1 }); assert.equal(run.earned.blueprints, bp + 1);
  const co = run.earned.cores; ap({ cores: 1 }); assert.equal(run.earned.cores, co + 1);
  const max = R.durabilityMax(run);
  run.durability = 50; ap({ hpPct: 0.1 }); near(run.durability, 50 + max * 0.1, 1e-9);
  run.durability = 5; ap({ hpPct: -0.5 }); assert.equal(run.durability, 1, 'Ereignis-Schaden beendet den Run nicht');
  ap({ maxHp: 6 }); near(R.durabilityMax(run), max + 6, 1e-9); assert.equal(run.durability, 7, 'max. Haltbarkeit + füllt auf');
  ap({ maxHp: -4 }); near(R.durabilityMax(run), max + 2, 1e-9);
  ap({ maxFuel: 10 }); ap({ maxFuel: -6 }); assert.equal(run.runMods.fuelMaxAdd, 4);
  run.inventory = [];
  ap({ item: { rarity: 'rare', tag: 'elektro' } });
  assert.equal(run.inventory.length, 1);
  const d = itemById(run.inventory[0].itemId);
  assert.ok(d.rarity === 'rare' && d.tags.includes('elektro'), d.id);
  ap({ item: {} }); assert.equal(run.inventory.length, 2);
  ap({ item: { rarity: 'legendary' } }); assert.equal(itemById(run.inventory[2].itemId).rarity, 'legendary');
  ap({ upgradeItem: 'random' }); assert.ok(run.inventory.some((e) => e.tier === 2));
  ap({ upgradeItem: 'choose' }); assert.deepEqual(st.pending, [{ kind: 'upgradeItem' }]);
  assert.ok(E.resolvePending(run, save, 2).ok); assert.equal(run.inventory[2].tier, 2); assert.equal(st.pending.length, 0);
  ap({ removeItem: 'choose' }); assert.ok(E.resolvePending(run, save, 2).ok); assert.equal(run.inventory.length, 2);
  ap({ removeItem: 'random' }); assert.equal(run.inventory.length, 1);
  ap({ curse: true }); assert.equal(run.inventory.length, 2); assert.equal(itemById(run.inventory[1].itemId).rarity, 'cursed');
  ap({ removeCurse: true }); assert.ok(run.inventory[1].cleansed);
  ap({ removeCurse: true }); assert.match(log[0].text, /Kein Fluch/);
  ap({ nothing: true }); assert.equal(log.length, 1);
  // voller Rucksack: Item → Auswahl (ersetzen/ablehnen), Fluch verdrängt ein nicht verfluchtes Item
  while (run.inventory.length < R.itemSlots(run)) R.giveItem(run, save, 'gluck_kleeblatt', { force: true });
  const p0 = run.pendingChoices.length;
  ap({ item: {} });
  assert.equal(run.pendingChoices.length, p0 + 1);
  assert.equal(run.pendingChoices[p0].context, 'event');
  assert.equal(run.pendingChoices[p0].skipBolts, 0);
  const n = run.inventory.length;
  ap({ curse: true });
  assert.equal(run.inventory.length, n);
  assert.match(log[0].text, /verdrängt/);
  // stage: 'elite' → Knoten wird zur Elite-Etappe
  ap({ stage: 'elite' });
  assert.ok(st.elite);
});

test('Ereignisse: Kosten (Schrauben, Haltbarkeit, Treibstoff, Item zufällig/gewählt) und Wählbarkeit', () => {
  const { save, run } = setup({ seed: 61 });
  enterAs(run, 'event');
  const opt = (cost) => ({ cost, outcomes: [{ p: 1, text: '', effects: [{ nothing: true }] }] });
  run.bolts = 5;
  assert.equal(E.optionState(run, opt({ bolts: 10 })).reason, 'bolts');
  run.bolts = 10;
  assert.ok(E.optionState(run, opt({ bolts: 10 })).available);
  run.durability = R.durabilityMax(run) * 0.1;
  assert.equal(E.optionState(run, opt({ hpPct: 0.1 })).reason, 'hp', 'Haltbarkeit danach nicht > 0');
  run.durability = R.durabilityMax(run);
  assert.ok(E.optionState(run, opt({ hpPct: 0.1 })).available);
  run.inventory = [];
  assert.equal(E.optionState(run, opt({ item: 'random' })).reason, 'item');
  // echtes Ereignis mit Item-Kosten „choose“: Platz Pflicht
  const ev = TEXT_EVENTS.find((e) => e.id === 'ev_altmetall_kalle');
  run.current.shop = { type: 'event', eventId: ev.id, result: null, pending: [], elite: false };
  R.giveItem(run, save, 'feuer_buegeleisen');
  R.giveItem(run, save, 'eis_bohnerwachs');
  assert.equal(E.chooseOption(run, save, 0).reason, 'slot');
  const b0 = run.bolts;
  const r = E.chooseOption(run, save, 0, { slot: 1 });
  assert.ok(r.ok);
  assert.deepEqual(run.inventory.map((e) => e.itemId), ['feuer_buegeleisen']);
  assert.ok(run.bolts > b0);
  assert.equal(E.chooseOption(run, save, 1).reason, 'done');
});

test('Ereignisse: { stage: "elite" } startet eine Elite-Etappe mit Elite-Belohnung', () => {
  const { save, run } = setup({ seed: 70 });
  const e = enterAs(run, 'event');
  const ev = TEXT_EVENTS.find((x) => x.id === 'ev_seifenkisten_rivale');
  run.current.shop = { type: 'event', eventId: ev.id, result: null, pending: [], elite: false };
  const k = ev.options.findIndex((o) => o.outcomes.some((out) => out.effects.some((f) => f.stage === 'elite')));
  const r = E.chooseOption(run, save, k);
  assert.ok(r.ok && r.elite);
  assert.equal(R.nodeKind(run, e.node), 'elite');
  const e2 = R.enterNode(run, e.node.id);
  assert.equal(e2.kind, 'stage');
  assert.equal(e2.spec.kind, 'elite');
  const res = { reason: 'stop', cleared: true, medal: 'bronze', dist: e2.spec.medals.bronze, target: e2.spec.target, medals: e2.spec.medals, medalList: e2.spec.medalList, kind: 'elite', bolts: 0, scrap: 0, blueprints: 0, crates: 0, damageTaken: 0, durability: run.durability, stunts: { flips: 0, loops: 0 } };
  const o = R.applyStageResult(run, res, save);
  assert.ok(o.cleared && o.kind === 'elite');
  assert.equal(o.rewards.blueprints, REWARDS.blueprints.elite);
  assert.equal(run.pendingChoices[0].context, 'elite');
  assert.ok(run.visited.includes(e.node.id));
  assert.equal(R.leaveNode(run).ok, false);
});

test('Ereignisse: alle 26 Ereignisse × alle Optionen laufen fehlerfrei durch (jeder Ausgang)', () => {
  let n = 0;
  for (const ev of TEXT_EVENTS) {
    ev.options.forEach((opt, oi) => {
      opt.outcomes.forEach((out, k) => {
        const { save, run } = setup({ seed: 100 + n, research: 'all' });
        R.devNextAct(run); if (!ev.acts.includes(2)) { /* Akt egal für die Effekte */ }
        run.bolts = 200;
        for (const id of ['feuer_buegeleisen', 'eis_bohnerwachs']) R.giveItem(run, save, id);
        enterAs(run, 'event');
        run.current.shop = { type: 'event', eventId: ev.id, result: null, pending: [], elite: false };
        const r = E.chooseOption(run, save, oi, { slot: 0, roll: k });
        assert.ok(r.ok, `${ev.id} #${oi}: ${r.reason}`);
        assert.equal(r.result.text, out.text);
        while (r.pending.length) assert.ok(E.resolvePending(run, save, 0).ok);
        assert.ok(run.durability >= 1 && isFinite(run.durability) && run.bolts >= 0);
        n++;
      });
      const sum = opt.outcomes.reduce((a, o) => a + o.p, 0);
      near(sum, 1, 1e-6, `${ev.id} Wahrscheinlichkeiten`);
    });
    assert.ok(ev.options.some((o) => !o.cost), `${ev.id}: sichere Option`);
  }
  assert.ok(n > 150, `${n} Ausgänge`);
});

// ---------------------------------------------------------------------------------------------------------------
test('Schatz: Gratis-Item, 30 % verdächtig mit Haken (Schaden / Fluch / Schrauben), Liegen lassen', () => {
  let sus = 0;
  const hooks = {};
  const N = 400;
  for (let s = 0; s < N; s++) {
    const { run } = setup({ seed: 2000 + s });
    enterAs(run, 'treasure');
    const st = T.openTreasure(run);
    assert.ok(st.itemId && itemById(st.itemId).rarity !== 'cursed');
    if (st.suspicious) { sus++; hooks[st.hook] = (hooks[st.hook] || 0) + 1; assert.ok(st.hint.length > 5); } else assert.equal(st.hook, null);
  }
  near(sus / N, TREASURE.suspiciousChance, 0.06, 'Anteil verdächtig');
  assert.deepEqual(Object.keys(hooks).sort(), ['bolts', 'curse', 'damage']);
  // jeder Haken
  for (const hook of ['damage', 'curse', 'bolts', null]) {
    const { save, run } = setup({ seed: 3 });
    run.bolts = 60;
    enterAs(run, 'treasure');
    const st = T.openTreasure(run);
    st.suspicious = !!hook; st.hook = hook;
    const inv0 = run.inventory.length, dur0 = run.durability, max = R.durabilityMax(run);
    const r = T.takeTreasure(run, save);
    assert.ok(r.ok);
    assert.ok(run.inventory.some((e) => e.itemId === st.itemId));
    if (hook === 'damage') near(run.durability, dur0 - max * TREASURE.hooks.damage.pct, 1e-9);
    if (hook === 'curse') { assert.equal(run.inventory.length, inv0 + 2); assert.ok(run.inventory.some((e) => isCursedEntry(e))); }
    if (hook === 'bolts') assert.equal(run.bolts, 60 - 30);
    if (!hook) { assert.equal(run.bolts, 60); assert.equal(run.durability, dur0); }
    assert.equal(T.takeTreasure(run, save).reason, 'done');
    assert.ok(R.leaveNode(run).ok);
  }
  // Liegen lassen: nichts passiert, Knoten besucht
  const { run } = setup({ seed: 4 });
  const e = enterAs(run, 'treasure');
  const inv = run.inventory.length;
  assert.ok(T.leaveTreasure(run).ok);
  assert.equal(run.inventory.length, inv);
  assert.ok(run.visited.includes(e.node.id));
});

// ---------------------------------------------------------------------------------------------------------------
test('Run-Ende: übrige Schrauben werden zu 10 % in Schrott umgewandelt', () => {
  const { save, run } = setup({ seed: 90 });
  run.bolts = 257;
  run.earned.scrap = 100;
  const scrap0 = save.meta.scrap;
  const end = R.endRun(save, run);
  assert.equal(REWARDS.boltsToScrap, 0.1);
  assert.equal(end.payout.scrap, 100 + 25);
  assert.equal(save.meta.scrap, scrap0 + 125);
  assert.ok(end.payout.rows.some((r) => /Schrauben-Rest/.test(r.label) && r.scrap === 25));
});

test('Speichern/Fortsetzen mitten in einem Shop: gleicher Zustand, gleiche Angebote, gleiche Ergebnisse', () => {
  for (const type of ['dealer', 'workbench', 'blackmarket', 'event', 'treasure', 'station']) {
    const { save, run } = setup({ seed: 123, research: 'all' });
    run.bolts = 300;
    const e = enterAs(run, type);
    // Shop öffnen und eine Aktion machen
    if (type === 'dealer') { D.dealerView(run); D.reroll(run); D.toggleReserve(run, 0); }
    if (type === 'workbench') { R.giveItem(run, save, run.inventory[0].itemId); W.fuseItems(run, save, 0, 1); }
    if (type === 'blackmarket') B.openBlackMarket(run);
    if (type === 'event') E.openEvent(run);
    if (type === 'treasure') T.openTreasure(run);
    // App-Neustart
    const loaded = migrate(clone(save));
    const r2 = loaded.run;
    assert.deepEqual(r2.current, run.current, `${type}: Zustand gespeichert`);
    assert.deepEqual(R.reachableNodes(r2).map((n) => n.id), [e.node.id], 'nur der offene Knoten');
    const e2 = R.enterNode(r2, e.node.id);
    assert.equal(e2.kind, type);
    if (type === 'dealer') {
      assert.deepEqual(D.dealerView(r2).offers, D.dealerView(run).offers);
      assert.deepEqual(r2.reserve, run.reserve);
      assert.equal(D.reroll(r2).cost, D.reroll(run).cost);
      assert.deepEqual(D.dealerView(r2).offers.map((o) => o.itemId), D.dealerView(run).offers.map((o) => o.itemId));
    }
    if (type === 'workbench') assert.equal(W.fusionsLeft(r2), 0, 'Fusion des Besuchs bleibt verbraucht');
    if (type === 'blackmarket') assert.deepEqual(B.openBlackMarket(r2).offers, B.openBlackMarket(run).offers);
    if (type === 'event') {
      assert.equal(E.eventView(r2).event.id, E.eventView(run).event.id);
      const a = E.chooseOption(run, save, 0, { slot: 0 }), b = E.chooseOption(r2, loaded, 0, { slot: 0 });
      assert.deepEqual(b.result, a.result);
    }
    if (type === 'treasure') {
      assert.deepEqual(T.openTreasure(r2), T.openTreasure(run));
      T.takeTreasure(run, save); T.takeTreasure(r2, loaded);
      assert.deepEqual(r2.inventory, run.inventory);
    }
    if (type === 'station') assert.ok(G.chooseStation(r2, 'fuel').ok);
  }
});

test('Karte: keine Platzhalter mehr – jeder Sonderknoten hat seinen Shop', () => {
  const { run } = setup({ seed: 5, research: 'all' });
  const kinds = new Set();
  for (let i = 0; i < 300 && !run.over; i++) {
    const n = R.reachableNodes(run).find((x) => !isStageType(x.type)) || R.reachableNodes(run)[0];
    const e = R.enterNode(run, n.id);
    if (e.kind === 'stage') {
      const s = e.spec;
      R.applyStageResult(run, { reason: 'stop', cleared: true, medal: 'gold', dist: s.medals.gold, target: s.target, medals: s.medals, medalList: s.medalList, kind: s.kind, bolts: 0, scrap: 0, blueprints: 0, crates: 0, damageTaken: 0, durability: run.durability, stunts: { flips: 0, loops: 0 } });
      while (R.pendingChoice(run)) R.skipChoice(run);
      continue;
    }
    kinds.add(e.kind);
    assert.ok(['dealer', 'workbench', 'blackmarket', 'event', 'treasure', 'station'].includes(e.kind), e.kind);
    if (e.kind === 'station') G.chooseStation(run, 'repair'); else R.leaveNode(run);
  }
  assert.ok(kinds.size >= 4, [...kinds].join());
  assert.equal(BAL_ITEMS.ownedWeight, 0);
});
