// Paket E – Werkstatt-Stufe, Aufträge, Sammelalbum (garage/workshop.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSave } from '../www/src/save/save.js';
import { workshopState, levelCost, grantMeta, contractMet, runXp, albumProgress } from '../www/src/garage/workshop.js';
import { CONTRACTS, CONTRACT_RULES, WORKSHOP, workshopReward, ALBUM } from '../www/src/data/workshop.js';
import { PAINTS } from '../www/src/data/cosmetics.js';
import { ITEMS } from '../www/src/data/items.js';

const fakeRun = (o = {}) => ({ stats: { dist: 4000, medals: { bronze: 2, silver: 1, gold: 3 }, flips: 12, perfect: 9, maxChain: 5, boltsEarned: 200, elites: 1, stageEvents: 3, goalGold: { height: 1 }, tagAtAct: { 1: { gummi: 3 } }, ...o }, bossesBeaten: [1], ascension: 0, over: { won: false } });

test('Werkstatt: Stufenkosten steigen, Belohnungen gültig, Lacke vorhanden', () => {
  for (let n = 1; n < WORKSHOP.maxLevel; n++) assert.ok(levelCost(n + 1) >= levelCost(n));
  for (let n = 2; n <= WORKSHOP.maxLevel; n++) {
    const rw = workshopReward(n);
    assert.ok(rw && (rw.scrap || rw.blueprints || rw.cores), `Stufe ${n}`);
    if (rw.paint) assert.ok(PAINTS.some((p) => p.id === rw.paint), rw.paint);
  }
});

test('Auftragsbrett: neuer Spielstand hat 3 verschiedene Aufträge, Bedingungen greifen', () => {
  const s = defaultSave();
  const w = workshopState(s);
  assert.equal(w.contracts.active.length, CONTRACT_RULES.active);
  assert.equal(new Set(w.contracts.active).size, CONTRACT_RULES.active);
  const sum = { perfectLandings: 9, gold: 3, maxChain: 5, tagAtAct: { 1: { gummi: 3 } }, goalGold: { height: 1 }, won: false, ascension: 0 };
  assert.ok(contractMet(CONTRACTS.find((c) => c.id === 'c_perfekt_8'), sum));
  assert.ok(!contractMet(CONTRACTS.find((c) => c.id === 'c_perfekt_15'), sum));
  assert.ok(contractMet(CONTRACTS.find((c) => c.id === 'c_gummi_akt1'), sum));
  assert.ok(contractMet(CONTRACTS.find((c) => c.id === 'c_hoehe_gold'), sum));
  assert.ok(!contractMet(CONTRACTS.find((c) => c.id === 'c_sieg'), sum));
});

test('Run-Ende: XP, Stufenaufstieg mit Belohnung, erfüllter Auftrag wird ersetzt', () => {
  const s = defaultSave();
  const w = workshopState(s);
  w.contracts.active = ['c_perfekt_8', 'c_sieg', 'c_boss_2'];
  const scrap0 = s.meta.scrap;
  const res = grantMeta(s, fakeRun());
  assert.ok(res.xp > 0 && res.contracts.some((c) => c.id === 'c_perfekt_8'));
  assert.ok(!w.contracts.active.includes('c_perfekt_8') && w.contracts.active.length === CONTRACT_RULES.active);
  assert.ok(res.levelTo > res.levelFrom, `Stufe ${res.levelFrom} → ${res.levelTo}`);
  assert.equal(s.meta.scrap - scrap0, res.total.scrap || 0);
  assert.equal(runXp({ dist: 5000, medals: 0, bosses: 0, won: false }), 100);
});

test('Sammelalbum: Schwellen nach Kodex, jede nur einmal', () => {
  const s = defaultSave();
  assert.equal(albumProgress(s).items, 0);
  for (const it of ITEMS.slice(0, 12)) s.codex.items[it.id] = 1;
  const a = grantMeta(s, fakeRun());
  assert.ok(a.album.some((x) => x.id === 'a_items_10'));
  const b = grantMeta(s, fakeRun());
  assert.ok(!b.album.some((x) => x.id === 'a_items_10'), 'nur einmal');
  assert.ok(ALBUM.every((x) => x.reward && (x.reward.scrap || x.reward.blueprints || x.reward.cores)));
});
