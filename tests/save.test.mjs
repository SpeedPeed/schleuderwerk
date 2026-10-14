// Spielstand v3: Standard-Schema, Migration v2 → v3, Export/Import-Rundlauf, alte SW2-Texte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_VERSION, GARAGE } from '../www/src/data/balance.js';
import { defaultSave, migrate, exportSave, importSave } from '../www/src/save/save.js';
import { markMilestone, addPlaytime } from '../www/src/garage/progression.js';

const b64 = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj))));

// So sah ein Spielstand der Version 0.3.0 (Schema v2) aus
const V2 = () => ({
  version: 2,
  money: 10000,
  upgrades: { katapult: 12, motor: 4, tank: 7 },
  stats: { runs: 23, bestDist: 4100, bestHeight: 210, totalEarned: 54000, bestTricks: 880 },
  world: 'desert',
  worlds: { steppe: { bestDist: 4100, bestHeight: 210, runs: 20 }, desert: { bestDist: 900, bestHeight: 120, runs: 3 } },
  unlocked: ['steppe', 'desert'],
  settings: { sound: false, vibration: true, shake: false, shadows: true },
  tutorial: { runs: 23 },
  createdAt: 1700000000000,
  savedAt: 1700000500000,
});

test('Standard-Spielstand hat das Schema v3', () => {
  const s = defaultSave();
  assert.equal(SAVE_VERSION, 3);
  assert.equal(s.version, 3);
  for (const k of ['meta', 'garage', 'research', 'ascension', 'codex', 'cosmetics', 'settings', 'stats', 'run', 'tutorial']) assert.ok(k in s, k);
  assert.deepEqual(Object.keys(s.meta).sort(), ['blueprints', 'cores', 'milestones', 'scrap', 'totalPlaytime']);
  assert.deepEqual(Object.keys(s.garage).sort(), ['abilities', 'chassis', 'ownedChassis', 'ownedParts', 'partLevels', 'parts']);
  assert.equal(s.garage.chassis, GARAGE.starterChassis);
  assert.deepEqual(s.garage.parts, GARAGE.starterParts);
  assert.deepEqual(s.research.done, []);
  assert.equal(s.run, null);
  assert.ok(!('money' in s));
  // migrate auf einem frischen Stand ändert nichts Wesentliches
  const m = migrate(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(m.garage, s.garage);
  assert.deepEqual(m.meta, s.meta);
});

test('Migration v2 → v3: Geld / 40 als Schrott, Einstellungen und Rekorde bleiben', () => {
  const s = migrate(V2());
  assert.equal(s.version, 3);
  assert.equal(s.meta.scrap, 250);
  assert.equal(s.meta.cores, 0);
  assert.ok(!('money' in s) && !('upgrades' in s) && !('unlocked' in s));
  assert.deepEqual(s.settings, { sound: false, vibration: true, shake: false, shadows: true });
  assert.equal(s.stats.bestDist, 4100);
  assert.equal(s.stats.bestHeight, 210);
  assert.equal(s.stats.bestTricks, 880);
  assert.equal(s.stats.testDrives, 23);
  assert.deepEqual(s.worlds.unlocked, ['steppe', 'desert']);
  assert.equal(s.worlds.current, 'desert');
  assert.equal(s.worlds.records.desert.bestDist, 900);
  assert.equal(s.tutorial.runs, 23);
  assert.equal(s.createdAt, 1700000000000);
  assert.deepEqual(s.garage.parts, GARAGE.starterParts, 'Garage startet neu');
});

test('Migration: Startschrott höchstens 400, kaputtes Geld = 0, uralte Stände (ohne Version)', () => {
  assert.equal(migrate({ ...V2(), money: 1e7 }).meta.scrap, GARAGE.migrateScrapMax);
  assert.equal(migrate({ ...V2(), money: 'viel' }).meta.scrap, 0);
  assert.equal(migrate({ ...V2(), money: -50 }).meta.scrap, 0);
  const v1 = migrate({ money: 800, upgrades: {}, stats: { runs: 2, bestDist: 300, bestHeight: 20 }, settings: { sound: true } });
  assert.equal(v1.version, 3);
  assert.equal(v1.meta.scrap, 20);
  assert.equal(v1.worlds.records.steppe.bestDist, 300);
  assert.throws(() => migrate({ version: 99 }), /neueren/);
  assert.throws(() => migrate(null), /gültig/);
});

test('Export/Import-Rundlauf mit Präfix SW3:', () => {
  const s = defaultSave();
  s.meta.scrap = 1234;
  s.meta.cores = 2;
  s.garage.ownedParts.push('tank_gurkenfass');
  s.garage.parts.tank = 'tank_gurkenfass';
  s.garage.partLevels.tank_gurkenfass = 7;
  s.research.done.push('r_ability_magnetzug');
  s.garage.abilities = ['magnetzug', 'boost'];
  s.meta.milestones.firstTestDrive = 42;
  s.settings.sound = false;
  const text = exportSave(s);
  assert.match(text, /^SW3:[A-Za-z0-9+/=]+$/);
  const back = importSave(`  ${text.slice(0, 20)}\n${text.slice(20)}  `);
  delete back.savedAt; delete s.savedAt;
  assert.deepEqual(back, s);
});

test('Import alter SW2-Texte über die Migration', () => {
  const s = importSave(`SW2:${b64(V2())}`);
  assert.equal(s.version, 3);
  assert.equal(s.meta.scrap, 250);
  assert.equal(s.settings.sound, false);
  assert.ok(exportSave(s).startsWith('SW3:'));
  // auch ohne version-Feld im JSON zählt die Zahl im Präfix
  const noVer = V2();
  delete noVer.version;
  assert.equal(importSave(`SW2:${b64(noVer)}`).meta.scrap, 250);
  assert.throws(() => importSave('hallo'), /SW…/);
  assert.throws(() => importSave('SW3:%%%'), /beschädigt/);
  assert.throws(() => importSave(`SW3:${btoa('kein json')}`), /beschädigt/);
});

test('Spielzeit und Meilensteine (Zeitstempel beim ersten Erreichen)', () => {
  const s = defaultSave();
  addPlaytime(s, 61.25);
  addPlaytime(s, -5);
  addPlaytime(s, NaN);
  assert.equal(s.meta.totalPlaytime, 61.25);
  assert.equal(markMilestone(s, 'firstTestDrive'), true);
  addPlaytime(s, 100);
  assert.equal(markMilestone(s, 'firstTestDrive'), false);
  assert.equal(s.meta.milestones.firstTestDrive, 61.3);
  const m = migrate(JSON.parse(JSON.stringify(s)));
  assert.equal(m.meta.milestones.firstTestDrive, 61.3);
  assert.equal(m.meta.totalPlaytime, 161.25);
});
