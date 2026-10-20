// Spielstand v4: Standard-Schema, Migration v2 → v3 → v4 (Paket A: Teile-Stufen → Slot-Stufen), Export/Import-Rundlauf,
// alte SW3-/SW2-Texte, laufender Run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_VERSION, GARAGE, AUDIO, RENDER } from '../www/src/data/balance.js';
import { SLOTS, partById } from '../www/src/data/index.js';
import { upgradeCostTotal, partState } from '../www/src/garage/garage.js';
import { partDimLevels } from '../www/src/items/statMods.js';
import { buildLoadout } from '../www/src/garage/loadout.js';
import { defaultSave, migrate, exportSave, importSave, SaveError, convertPartLevels, v3LevelToSlot, v3SpentFor } from '../www/src/save/save.js';
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

test('Standard-Spielstand hat das Schema v4', () => {
  const s = defaultSave();
  assert.equal(SAVE_VERSION, 4);
  assert.equal(s.version, 4);
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
  assert.ok(!('migrationNote' in m), 'kein Umbau-Hinweis bei v4');
});

test('Migration v2 → v3 → v4: Geld / 40 als Schrott, Einstellungen und Rekorde bleiben (Welten entfallen seit Phase 3)', () => {
  const s = migrate(V2());
  assert.equal(s.version, 4);
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
  assert.equal(v1.version, 4);
  assert.equal(v1.meta.scrap, 20);
  assert.equal(v1.stats.bestDist, 300);
  assert.throws(() => migrate({ version: 99 }), /neueren/);
  assert.throws(() => migrate(null), /gültig/);
});

test('Export/Import-Rundlauf mit Präfix SW4:', () => {
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
  assert.match(text, /^SW4:[A-Za-z0-9+/=]+$/);
  const back = importSave(`  ${text.slice(0, 20)}\n${text.slice(20)}  `);
  delete back.savedAt; delete s.savedAt;
  assert.deepEqual(back, { ...s, garage: { ...s.garage, slotLevels: { ...Object.fromEntries(SLOTS.map((k) => [k, 0])), tank: 7 } } });
});

// So sah ein Spielstand der Version 1.0.0 (Schema v3) mit Teile-Stufen 0–20 je Teil aus
const V3 = () => {
  const s = defaultSave();
  delete s.garage.slotLevels;
  s.version = 3;
  s.meta = { scrap: 100, blueprints: 7, cores: 2, totalPlaytime: 9000, milestones: { firstRunStart: 30, firstBossAct1: 4000 } };
  s.garage.ownedParts.push('tank_gurkenfass', 'drive_pedale');
  s.garage.parts.tank = 'tank_gurkenfass';
  s.garage.partLevels = { tank_gurkenfass: 7, tank_kanister: 12, drive_rasenmaehermotor: 20, drive_pedale: 3, aero_fahrtwind: 1 };
  s.research = { done: ['r_ability_magnetzug'], levels: {} };
  s.ascension = { unlocked: 2, best: 1, selected: 1, records: { 1: { runs: 3, wins: 1, bestAct: 4, bestStages: 20, fastestWin: 1500 } } };
  s.codex.items.feuer_buegeleisen = 2;
  s.stats.runs = 12;
  s.stats.bestDist = 777;
  s.history = [{ won: false, act: 2, scrap: 140 }];
  s.cosmetics = { owned: [], paint: null };
  s.settings.sound = false;
  return s;
};

test('Migration v3 → v4: Teile-Stufen → Slot-Stufen (mindestens gleich stark), zu viel Bezahltes zurück, Rest bleibt', () => {
  const old = V3();
  const c = convertPartLevels(old.garage.partLevels);
  const m = migrate(JSON.parse(JSON.stringify(old)));
  assert.equal(m.version, 4);
  assert.ok(!('partLevels' in m.garage));
  // je Slot die beste Stufe aller Teile, umgerechnet: Tank 12 → 6, Antrieb 20 → 10, Aero 1 → 1
  assert.equal(m.garage.slotLevels.tank, v3LevelToSlot(12));
  assert.equal(m.garage.slotLevels.tank, 6);
  assert.equal(m.garage.slotLevels.drive, GARAGE.maxPartLevel);
  assert.equal(m.garage.slotLevels.aero, 1);
  assert.equal(m.garage.slotLevels.wheels, 0);
  // Schrott: alles in einem Slot Bezahlte minus Preis der neuen Stufe kommt zurück
  const spentTank = v3SpentFor(partById('tank_gurkenfass'), 7) + v3SpentFor(partById('tank_kanister'), 12);
  assert.ok(c.refund >= spentTank - upgradeCostTotal(6));
  assert.equal(m.meta.scrap, 100 + c.refund);
  assert.ok(c.refund > 4000, `Erstattung ${c.refund}`);
  assert.deepEqual(m.migrationNote, { v: 4, refund: c.refund, slotLevels: c.slotLevels });
  // nichts anderes geht verloren
  assert.deepEqual(m.meta.milestones, old.meta.milestones);
  for (const k of ['blueprints', 'cores', 'totalPlaytime']) assert.equal(m.meta[k], old.meta[k], k);
  assert.deepEqual(m.research, old.research);
  assert.deepEqual(m.ascension, old.ascension);
  assert.deepEqual(m.codex, old.codex);
  assert.deepEqual(m.history, old.history);
  assert.equal(m.stats.runs, 12);
  assert.equal(m.stats.bestDist, 777);
  assert.equal(m.settings.sound, false);
  assert.deepEqual(m.garage.parts, old.garage.parts);
  assert.deepEqual([...m.garage.ownedParts].sort(), [...old.garage.ownedParts].sort());
  // ausgerüstete Teile wirken mindestens so stark wie vorher (gleiche Ausrüstung, alte vs. neue Stufe)
  const tank = buildLoadout(m).stats.fuelMax;
  const g = partById('tank_gurkenfass');
  assert.ok(tank >= g.stats.fuelMax.add + 120 + g.perLevel.fuelMax.add * (7 / (1 + 7 / 30)) - 1e-9);
  assert.equal(partState(m, partById('drive_pedale')).level, GARAGE.maxPartLevel, 'Stufe gilt für jedes Teil des Slots');
  // ein zweites Laden ändert nichts mehr
  const again = migrate(JSON.parse(JSON.stringify(m)));
  assert.equal(again.meta.scrap, m.meta.scrap);
  assert.deepEqual(again.garage.slotLevels, m.garage.slotLevels);
});

test('Migration v3 → v4: niemand verliert Wert – Wirkung ≥ alt, Erstattung = bezahlt − neuer Preis (je Stufe 0–20)', () => {
  for (let L = 0; L <= GARAGE.v3MaxPartLevel; L++) {
    const n = v3LevelToSlot(L);
    assert.ok(n >= 0 && n <= GARAGE.maxPartLevel);
    assert.ok(partDimLevels(n) >= L / (1 + L / GARAGE.v3DimDivisor) - 1e-9, `Stufe ${L} → ${n}: Wirkung`);
    if (n > 0) assert.ok(partDimLevels(n - 1) < L / (1 + L / GARAGE.v3DimDivisor), `Stufe ${L} → ${n}: kleinste passende Stufe`);
    for (const id of ['drive_rasenmaehermotor', 'tank_gurkenfass', 'drive_elektromotor']) {
      const c = convertPartLevels({ [id]: L });
      const spent = v3SpentFor(partById(id), L);
      assert.equal(c.refund, Math.max(0, spent - upgradeCostTotal(n)), `${id} Stufe ${L}`);
      assert.ok(c.refund + upgradeCostTotal(n) >= spent, 'bezahlter Schrott steckt in Stufe + Erstattung');
    }
  }
  assert.deepEqual(convertPartLevels({}).slotLevels, Object.fromEntries(SLOTS.map((k) => [k, 0])));
  assert.equal(convertPartLevels({ quatsch: 5, tank_kanister: 'x', drive_pedale: -3 }).refund, 0, 'Unbekanntes/Kaputtes zählt nicht');
});

test('Import alter SW3-Texte (v1.0) über die Migration; laufender Run behält Ausrüstung mit umgerechneten Stufen', () => {
  const old = V3();
  old.run = newRun(migrate(JSON.parse(JSON.stringify(V3()))), { seed: 3 });
  for (const slot of SLOTS) old.run.parts[slot].level = 0;
  old.run.parts.drive.level = 20;
  old.run.parts.tank.level = 12;
  delete old.run.earned.paid;   // v1.0 kannte die bezahlt-Zähler noch nicht
  const m = importSave(`SW3:${b64(old)}`);
  assert.equal(m.version, 4);
  assert.equal(m.garage.slotLevels.drive, GARAGE.maxPartLevel);
  assert.equal(m.meta.scrap, 100 + convertPartLevels(old.garage.partLevels).refund);
  assert.ok(m.run, 'Run bleibt');
  assert.equal(m.run.parts.drive.level, GARAGE.maxPartLevel);
  assert.equal(m.run.parts.tank.level, 6);
  assert.deepEqual(m.run.earned.paid, { scrap: 0, blueprints: 0, cores: 0 }, 'alter Run: Auszahlung komplett am Run-Ende');
  assert.ok(exportSave(m).startsWith('SW4:'));
});

test('Import alter SW2-Texte über die Migration', () => {
  const s = importSave(`SW2:${b64(V2())}`);
  assert.equal(s.version, 4);
  assert.equal(s.meta.scrap, 250);
  assert.equal(s.settings.sound, false);
  assert.ok(exportSave(s).startsWith('SW4:'));
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
    assert.equal(s.version, 4);
    assert.equal(typeof s.meta.scrap, 'number');
    for (const k of SLOTS) assert.ok(Number.isInteger(s.garage.slotLevels[k]), `slotLevels.${k}`);
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
    migrate({ version: 5, meta: { scrap: 5000 } });
    assert.fail('kein Fehler');
  } catch (e) {
    assert.ok(e instanceof SaveError);
    assert.equal(e.code, 'newer');
  }
  // Import: technische Fehler erscheinen nie roh
  assert.throws(() => importSave(`SW4:${b64({ version: 5 })}`), /neueren/);
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
