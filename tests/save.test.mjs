// Spielstand v3: Standard-Schema, Migration v2 → v3, Export/Import-Rundlauf, alte SW2-Texte, laufender Run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_VERSION, GARAGE, AUDIO, RENDER } from '../www/src/data/balance.js';
import { SLOTS } from '../www/src/data/index.js';
import { defaultSave, migrate, exportSave, importSave, SaveError } from '../www/src/save/save.js';
import { markMilestone, addPlaytime } from '../www/src/garage/progression.js';
import { newRun, reachableNodes, enterNode } from '../www/src/run/runState.js';

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
  assert.deepEqual(Object.keys(s.garage).sort(), ['abilities', 'chassis', 'ownedChassis', 'ownedParts', 'parts', 'slotLevels']);
  assert.equal(s.garage.chassis, GARAGE.starterChassis);
  assert.deepEqual(s.garage.parts, GARAGE.starterParts);
  assert.deepEqual(s.research.done, []);
  assert.equal(s.run, null);
  assert.ok(!('money' in s));
  // migrate auf einem frischen Stand ändert nichts Wesentliches
  const m = migrate(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(m.garage, { ...s.garage, slotLevels: Object.fromEntries(SLOTS.map((k) => [k, 0])) });
  assert.deepEqual(m.meta, s.meta);
});

test('Migration v2 → v3: Geld / 40 als Schrott, Einstellungen und Rekorde bleiben (Welten entfallen seit Phase 3)', () => {
  const s = migrate(V2());
  assert.equal(s.version, 3);
  assert.equal(s.meta.scrap, 250);
  assert.equal(s.meta.cores, 0);
  assert.ok(!('money' in s) && !('upgrades' in s) && !('unlocked' in s));
  // alte Einstellungen bleiben, neue (Phase 7) kommen mit Standardwerten dazu
  assert.deepEqual(s.settings, { sound: false, vibration: true, shake: false, shadows: true, slowmo: true, sfxVol: AUDIO.defaultSfx, musicVol: AUDIO.defaultMusic, quality: RENDER.defaultQuality });
  assert.equal(s.stats.bestDist, 4100);
  assert.equal(s.stats.bestHeight, 210);
  assert.equal(s.stats.bestTricks, 880);
  assert.equal(s.stats.testDrives, 23);
  assert.ok(!('worlds' in s), 'Welten gibt es seit Phase 3 nicht mehr (Biome sind Akte eines Runs)');
  assert.equal(s.run, null);
  assert.equal(s.tutorial.runs, 23);
  assert.equal(s.tutorial.off, true, 'wer schon gespielt hat, bekommt keine Tutorial-Hinweise');
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
  assert.equal(v1.stats.bestDist, 300);
  assert.throws(() => migrate({ version: 99 }), /neueren/);
  assert.throws(() => migrate(null), /gültig/);
});

test('Export/Import-Rundlauf mit Präfix SW3:', () => {
  const s = defaultSave();
  s.meta.scrap = 1234;
  s.meta.cores = 2;
  s.garage.ownedParts.push('tank_gurkenfass');
  s.garage.parts.tank = 'tank_gurkenfass';
  s.garage.slotLevels.tank = 7;
  s.research.done.push('r_ability_magnetzug');
  s.garage.abilities = ['magnetzug', 'boost'];
  s.meta.milestones.firstTestDrive = 42;
  s.settings.sound = false;
  const text = exportSave(s);
  assert.match(text, /^SW3:[A-Za-z0-9+/=]+$/);
  const back = importSave(`  ${text.slice(0, 20)}\n${text.slice(20)}  `);
  delete back.savedAt; delete s.savedAt;
  assert.deepEqual(back, { ...s, garage: { ...s.garage, slotLevels: { ...Object.fromEntries(SLOTS.map((k) => [k, 0])), tank: 7 } } });
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

test('Migration repariert falsch typisierte Felder statt abzustürzen (beschädigte/fremde Stände)', () => {
  const broken = [
    { version: 3, meta: 'x' },
    { version: 3, garage: 'x', research: 'x', worlds: 'x' },
    { version: 3, garage: { ownedChassis: 'seifenkiste', ownedParts: 'x', parts: 5, partLevels: [3], abilities: 'boost' } },
    { version: 3, worlds: { records: { steppe: {}, desert: 'x' }, unlocked: [null, 5, {}, 'desert', 'mond'], current: 7 } },
    { version: 3, stats: { bestDist: 'abc', testDrives: -3 }, settings: 'x', tutorial: 'x', meta: { milestones: { a: 'x', b: 12 } } },
    { version: 2, worlds: { desert: 'x' }, unlocked: [null, 5, {}], money: 4000, stats: 'x', settings: [1] },
    { version: 3, run: 'x', cosmetics: { owned: 'x', paint: 5 }, codex: [], ascension: { unlocked: 'x' } },
  ];
  for (const b of broken) {
    let s;
    assert.doesNotThrow(() => { s = migrate(JSON.parse(JSON.stringify(b))); }, JSON.stringify(b));
    assert.equal(s.version, 3);
    assert.equal(typeof s.meta.scrap, 'number');
    assert.ok(Array.isArray(s.garage.ownedChassis) && s.garage.ownedChassis.includes(GARAGE.starterChassis));
    assert.ok(Array.isArray(s.garage.ownedParts));
    assert.ok(!('worlds' in s));
    for (const k of Object.keys(s.stats)) assert.ok(Number.isFinite(s.stats[k]), `stats.${k}`);
    assert.equal(typeof s.settings.sound, 'boolean');
    assert.equal(typeof s.tutorial.runs, 'number');
    assert.equal(s.run, null, 'unbrauchbarer Run wird verworfen');
  }
  const w = migrate({ version: 3, stats: { bestDist: 100 }, worlds: { records: { steppe: { bestDist: 700 }, desert: 'x' }, unlocked: ['steppe', 'desert', 'mond'] } });
  assert.ok(!('worlds' in w));
  assert.equal(w.stats.bestDist, 700, 'Bestweite aus den alten Welt-Rekorden');
  assert.equal(migrate({ version: 3, meta: { milestones: { a: 'x', b: 12 } } }).meta.milestones.b, 12);
  assert.ok(!('a' in migrate({ version: 3, meta: { milestones: { a: 'x' } } }).meta.milestones));
});

test('Migration: unlesbare Versionsnummer gilt als alter Stand (Geld wird zu Schrott); neuere Version → SaveError', () => {
  assert.equal(migrate({ version: 'abc', money: 4000 }).meta.scrap, 100);
  try {
    migrate({ version: 4, meta: { scrap: 5000 } });
    assert.fail('kein Fehler');
  } catch (e) {
    assert.ok(e instanceof SaveError);
    assert.equal(e.code, 'newer');
  }
  // Import: technische Fehler erscheinen nie roh
  assert.throws(() => importSave(`SW3:${b64({ version: 4 })}`), /neueren/);
});

test('Laufender Run übersteht Speichern/Laden (JSON, Export/Import); fremdes Run-Format wird verworfen', () => {
  const s = defaultSave();
  s.run = newRun(s, { seed: 77 });
  const first = reachableNodes(s.run)[0];
  enterNode(s.run, first.id);
  const back = migrate(JSON.parse(JSON.stringify(s)));
  assert.ok(back.run, 'Run bleibt erhalten');
  assert.deepEqual(back.run, s.run);
  assert.equal(back.run.current.node, first.id);
  assert.deepEqual(reachableNodes(back.run).map((n) => n.id), [first.id], 'derselbe Knoten läuft weiter');
  const imp = importSave(exportSave(s));
  assert.deepEqual(imp.run, s.run);
  assert.equal(migrate({ version: 3, run: { v: 0, act: 1 } }).run, null);
  assert.equal(migrate({ version: 3, run: { ...s.run, map: 'x' } }).run, null);
});
