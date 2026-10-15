// Garage: jede Chassis × jedes Teil (Stufe 0 und 20) ergibt endliche, plausible Werte; Garage-Aktionen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GARAGE, BASE_STATS } from '../www/src/data/balance.js';
import { CHASSIS, PARTS, ABILITIES, SLOTS, partsForSlot, chassisById, partById, abilityById, isStarterPart, chassisUnlock } from '../www/src/data/index.js';
import { buildLoadout } from '../www/src/garage/loadout.js';
import * as G from '../www/src/garage/garage.js';
import { defaultSave } from '../www/src/save/save.js';
import { STATS } from '../www/src/items/statMods.js';

// Plausible Grenzen je Stat (großzügig; prüft, dass keine Kombination aus dem Ruder läuft)
const BOUNDS = {
  launchSpeed: [5, 60], mass: [0.3, 5], drag: [0.0003, 0.02], lift: [0, 0.012], airControl: [3, 60], maxSpin: [2, 20],
  boostThrust: [0, 60], boostFuel: [0, 60], boostHeat: [-60, 120], driveAccel: [0, 15], driveFuel: [0, 30], driveHeat: [0, 30],
  rollFriction: [0.05, 10], fuelMax: [10, 400], heatMax: [20, 300], heatGain: [0.2, 3], coolRate: [0, 100],
  durabilityMax: [10, 400], armor: [0, 0.6], impactThreshold: [2, 30], landTolDeg: [5, 69], perfectLandDeg: [1, 20],
  magnet: [0, 20], speedSoftCap: [20, 90], itemSlots: [1, 10], abilitySlots: [1, 3], abilityCooldown: [0.35, 3], bounce: [0, 0.6],
};

function saveWith(chassis, slot, partId, level) {
  const s = defaultSave();
  s.garage.chassis = chassis;
  s.garage.ownedChassis.push(chassis);
  if (slot) {
    s.garage.parts[slot] = partId;
    s.garage.ownedParts.push(partId);
    s.garage.partLevels[partId] = level;
  }
  return s;
}

test('Daten: 9 Chassis, 7 Slots mit je genau einem Startteil, IDs eindeutig', () => {
  assert.equal(CHASSIS.length, 9);
  assert.equal(new Set(CHASSIS.map((c) => c.id)).size, 9);
  assert.equal(new Set(PARTS.map((p) => p.id)).size, PARTS.length);
  for (const slot of SLOTS) {
    const parts = partsForSlot(slot);
    assert.ok(parts.length >= 3, `${slot}: mindestens 3 Teile`);
    assert.equal(parts.filter(isStarterPart).length, 1, `${slot}: genau ein Startteil`);
    assert.equal(GARAGE.starterParts[slot], parts.find(isStarterPart).id, `${slot}: GARAGE.starterParts`);
  }
  for (const id of GARAGE.starterAbilities) assert.ok(abilityById(id), id);
});

test('jede Chassis × je ein Teil pro Slot auf Stufe 0 und 20: alle Stats endlich und plausibel', () => {
  let n = 0;
  for (const c of CHASSIS) {
    for (const p of PARTS) {
      for (const level of [0, GARAGE.maxPartLevel]) {
        const lo = buildLoadout(saveWith(c.id, p.slot, p.id, level));
        assert.equal(lo.chassis.id, c.id);
        assert.equal(lo.parts[p.slot].id, p.id);
        assert.equal(lo.parts[p.slot].level, level);
        for (const k of STATS) assert.ok(Number.isFinite(lo.stats[k]), `${c.id}/${p.id}/${level}: ${k} = ${lo.stats[k]}`);
        for (const [k, [a, b]] of Object.entries(BOUNDS)) {
          const v = lo.stats[k];
          assert.ok(v >= a - 1e-9 && v <= b + 1e-9, `${c.id}/${p.id}/St.${level}: ${k} = ${v} nicht in [${a}, ${b}]`);
        }
        assert.ok(lo.stats.perfectLandDeg <= lo.stats.landTolDeg);
        assert.ok(Number.isInteger(lo.stats.itemSlots) && Number.isInteger(lo.stats.abilitySlots));
        n++;
      }
    }
  }
  assert.equal(n, CHASSIS.length * PARTS.length * 2);
});

test('Chassis-Eigenheiten: Badewanne 5 Item-Plätze, Einkaufswagen 60 Haltbarkeit, Spezialfähigkeit, Regeln', () => {
  const lo = (id) => buildLoadout(saveWith(id));
  assert.equal(lo('badewanne').slots.items, 5);
  assert.equal(lo('badewanne').stats.itemSlots, 5);
  assert.equal(lo('seifenkiste').slots.items, 6);
  assert.equal(lo('einkaufswagen').stats.durabilityMax, 60);
  const wm = lo('waschmaschine');
  assert.equal(wm.special, 'schleudergang');
  assert.deepEqual(wm.abilities, ['boost', 'sprung', 'schleudergang']);
  assert.equal(wm.slots.abilities, 2);
  assert.equal(wm.rules.heatIsResource, true);
  assert.equal(lo('kuehlschrank').rules.noOverheat, true);
  assert.equal(lo('raketenschlitten').rules.lowGrip, true);
  assert.ok(lo('raketenschlitten').stats.airControl > lo('seifenkiste').stats.airControl * 1.8);
  assert.equal(lo('muelltonne').rules.collectScrapMass, true);
  assert.ok(lo('kuehlschrank').stats.mass > lo('seifenkiste').stats.mass);
  // Startausstattung
  const start = buildLoadout(defaultSave());
  assert.equal(start.chassis.id, GARAGE.starterChassis);
  assert.deepEqual(start.abilities, GARAGE.starterAbilities);
  assert.ok(start.sources.some((s) => s.id === 'gadget_hupe'));
});

test('Fahrradpedale: Antrieb ohne Sprit und Hitze', () => {
  const lo = buildLoadout(saveWith('seifenkiste', 'drive', 'drive_pedale', 0));
  assert.equal(lo.stats.driveFuel, 0);
  assert.equal(lo.stats.driveHeat, 0);
  assert.ok(lo.stats.driveAccel < BASE_STATS.driveAccel);
});

test('Fähigkeiten im Loadout: nur freigeschaltete, höchstens abilitySlots, keine Doppelten', () => {
  const s = defaultSave();
  s.garage.abilities = ['magnetzug', 'boost', 'boost', 'sprung'];
  assert.deepEqual(buildLoadout(s).abilities, ['boost', 'sprung'], 'Magnetzug braucht Forschung');
  s.research.done.push('r_ability_magnetzug');
  assert.deepEqual(buildLoadout(s).abilities, ['magnetzug', 'boost']);
});

test('Garage-Aktionen: kaufen, ausrüsten, verbessern (Preis × 1,15 je Stufe)', () => {
  const s = defaultSave();
  const kan = partById('tank_kanister');
  assert.equal(G.upgradeCost(kan, 0), GARAGE.starterUpgradeBase);
  assert.equal(G.upgradeCost(kan, 1), Math.round(GARAGE.starterUpgradeBase * GARAGE.costGrowth));
  assert.equal(G.upgradeCost(partById('tank_gurkenfass'), 3), Math.round(400 * GARAGE.costGrowth ** 3));

  assert.deepEqual(G.upgradePart(s, 'tank_kanister'), { ok: false, reason: 'scrap' });
  s.meta.scrap = 1000;
  const up = G.upgradePart(s, 'tank_kanister');
  assert.equal(up.ok, true);
  assert.equal(s.meta.scrap, 1000 - GARAGE.starterUpgradeBase);
  assert.equal(G.partLevel(s, 'tank_kanister'), 1);
  assert.equal(buildLoadout(s).stats.fuelMax > BASE_STATS.fuelMax, true);

  assert.equal(G.equipPart(s, 'tank_gurkenfass').ok, false, 'nicht gekauft');
  const b = G.buyPart(s, 'tank_gurkenfass');
  assert.equal(b.ok, true);
  assert.equal(s.meta.scrap, 1000 - GARAGE.starterUpgradeBase - 400);
  assert.equal(G.buyPart(s, 'tank_gurkenfass').reason, 'owned');
  assert.equal(G.equipPart(s, 'tank_gurkenfass').ok, true);
  assert.equal(s.garage.parts.tank, 'tank_gurkenfass');
  assert.equal(buildLoadout(s).stats.fuelMax, BASE_STATS.fuelMax + 40);

  // Forschung fehlt
  assert.equal(G.buyPart(s, 'drive_elektromotor').reason, 'research');
  // Höchststufe
  s.meta.scrap = 1e9;
  s.garage.partLevels.tank_kanister = GARAGE.maxPartLevel;
  assert.equal(G.upgradePart(s, 'tank_kanister').reason, 'maxed');
});

test('Chassis kaufen: Forschung + Kerne; Fähigkeiten tauschen', () => {
  const s = defaultSave();
  assert.equal(G.selectChassis(s, 'badewanne').ok, false);
  assert.equal(G.buyChassis(s, 'badewanne').reason, 'research');
  s.research.done.push('r_chassis_badewanne');
  assert.equal(G.buyChassis(s, 'badewanne').reason, 'cores');
  s.meta.cores = 5;
  assert.equal(G.buyChassis(s, 'badewanne').ok, true);
  assert.equal(s.meta.cores, 5 - chassisUnlock(chassisById('badewanne')).cores);
  assert.equal(s.garage.chassis, 'badewanne');
  assert.equal(G.selectChassis(s, 'seifenkiste').ok, true);

  assert.equal(G.setAbility(s, 0, 'sprung', 2).ok, true);
  assert.deepEqual(s.garage.abilities, ['sprung', 'boost'], 'getauscht');
  assert.equal(G.setAbility(s, 1, 'magnetzug', 2).reason, 'research');
  assert.equal(G.setAbility(s, 0, 'schleudergang', 2).reason, 'unknown', 'Spezialfähigkeit nicht in Slots');
});

test('Dev: alles freischalten macht Forschung, Chassis und Fähigkeiten verfügbar, Teile kaufbar', () => {
  const s = defaultSave();
  G.unlockAll(s);
  for (const c of CHASSIS) assert.ok(G.chassisState(s, c).owned, c.id);
  for (const p of PARTS) assert.ok(G.partState(s, p).researchOk, p.id);
  for (const a of ABILITIES) assert.ok(G.abilityState(s, a).unlocked, a.id);
  assert.ok(!G.partState(s, partById('drive_pedale')).owned, 'Teile bleiben zu kaufen');
  G.giftAllParts(s);
  for (const p of PARTS) assert.ok(G.partState(s, p).owned, p.id);
});

test('sanitizeGarage repariert unbekannte IDs', () => {
  const s = defaultSave();
  s.garage.chassis = 'gibtsnicht';
  s.garage.parts.drive = 'wheels_bobbycar';
  s.garage.parts.tank = 'tank_gurkenfass';   // nicht besessen
  s.garage.partLevels = { tank_kanister: 99, quatsch: 3 };
  s.garage.abilities = ['quatsch', 'sprung', 'sprung'];
  G.sanitizeGarage(s);
  assert.equal(s.garage.chassis, GARAGE.starterChassis);
  assert.equal(s.garage.parts.drive, GARAGE.starterParts.drive);
  assert.equal(s.garage.parts.tank, GARAGE.starterParts.tank);
  assert.deepEqual(s.garage.partLevels, { tank_kanister: GARAGE.maxPartLevel });
  assert.deepEqual(s.garage.abilities, [null, 'sprung', null]);
});

test('Fähigkeiten: volle Slots (Soft-Cap) + Spezialfähigkeit haben alle einen HUD-Knopf und eine Taste', async () => {
  const { SOFTCAPS, CONTROLS } = await import('../www/src/data/balance.js');
  const { MAX_ABILITY_BUTTONS } = await import('../www/src/ui/hud.js');
  const s = defaultSave();
  G.unlockAll(s);
  s.garage.chassis = 'waschmaschine';
  const keep = BASE_STATS.abilitySlots;
  BASE_STATS.abilitySlots = SOFTCAPS.abilitySlots.max;
  try {
    const slots = buildLoadout(s).slots.abilities;
    for (let i = 0; i < slots; i++) G.setAbility(s, i, ['boost', 'sprung', 'gyrokick'][i], slots);
    const lo = buildLoadout(s);
    assert.equal(lo.abilities.length, SOFTCAPS.abilitySlots.max + 1, 'Slots + Schleudergang');
    assert.ok(MAX_ABILITY_BUTTONS >= lo.abilities.length, 'HUD-Knöpfe');
    assert.ok(CONTROLS.abilityKeys.length >= lo.abilities.length, 'Tasten');
  } finally { BASE_STATS.abilitySlots = keep; }
});
