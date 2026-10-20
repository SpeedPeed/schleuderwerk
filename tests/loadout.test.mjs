// Garage: jede Chassis × jedes Teil (Stufe 0 und 20) ergibt endliche, plausible Werte; Garage-Aktionen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GARAGE, BASE_STATS } from '../www/src/data/balance.js';
import { CHASSIS, PARTS, ABILITIES, SLOTS, partsForSlot, chassisById, partById, abilityById, isStarterPart, chassisUnlock } from '../www/src/data/index.js';
import { buildLoadout } from '../www/src/garage/loadout.js';
import * as G from '../www/src/garage/garage.js';
import { defaultSave } from '../www/src/save/save.js';
import { STATS, partDimLevels } from '../www/src/items/statMods.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

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
    s.garage.slotLevels[slot] = level;
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

test('jede Chassis × je ein Teil pro Slot auf Stufe 0 und Höchststufe: alle Stats endlich und plausibel', () => {
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

test('Garage-Aktionen: kaufen, ausrüsten, Slot verbessern (60 × 1,32^Stufe, Stufe gilt je Slot)', () => {
  const s = defaultSave();
  assert.equal(G.upgradeCost(0), 60);
  assert.equal(G.upgradeCost(1), Math.round(60 * 1.32));
  assert.equal(G.upgradeCost(3), Math.round(GARAGE.slotUpgradeBase * GARAGE.costGrowth ** 3));
  const total = G.upgradeCostTotal(GARAGE.maxPartLevel);
  assert.ok(total > 2700 && total < 2900, `Summe bis Stufe 10 ≈ 2.800 ⚙ (${total})`);

  assert.deepEqual(G.upgradePart(s, 'tank_kanister'), { ok: false, reason: 'scrap' });
  s.meta.scrap = 1000;
  const up = G.upgradePart(s, 'tank_kanister');
  assert.equal(up.ok, true);
  assert.equal(up.slot, 'tank');
  assert.equal(s.meta.scrap, 1000 - 60);
  assert.equal(G.partLevel(s, 'tank_kanister'), 1);
  assert.equal(G.slotLevel(s, 'tank'), 1);
  assert.equal(buildLoadout(s).stats.fuelMax > BASE_STATS.fuelMax, true);
  assert.equal(G.upgradePart(s, 'tank_gurkenfass').reason, 'locked', 'nur über ein eigenes Teil');

  assert.equal(G.equipPart(s, 'tank_gurkenfass').ok, false, 'nicht gekauft');
  const b = G.buyPart(s, 'tank_gurkenfass');
  assert.equal(b.ok, true);
  assert.equal(s.meta.scrap, 1000 - 60 - 400);
  assert.equal(G.buyPart(s, 'tank_gurkenfass').reason, 'owned');
  assert.equal(G.equipPart(s, 'tank_gurkenfass').ok, true);
  assert.equal(s.garage.parts.tank, 'tank_gurkenfass');
  // Teilwechsel behält die Slot-Stufe (kein Rückschritt): Gurkenfass +40, dazu Stufe 1 seines perLevel × 2
  const gurke = partById('tank_gurkenfass');
  assert.equal(G.partLevel(s, 'tank_gurkenfass'), 1);
  near(buildLoadout(s).stats.fuelMax, BASE_STATS.fuelMax + 40 + gurke.perLevel.fuelMax.add * 2 / (1 + 1 / GARAGE.dimDivisor), 1e-6);

  // Forschung fehlt
  assert.equal(G.buyPart(s, 'drive_elektromotor').reason, 'research');
  // Höchststufe
  s.meta.scrap = 1e9;
  s.garage.slotLevels.tank = GARAGE.maxPartLevel;
  assert.equal(G.upgradePart(s, 'tank_kanister').reason, 'maxed');
  assert.equal(G.upgradeSlot(s, 'quatsch').reason, 'unknown');
});

test('Slot-Stufen: doppelte Wirkung je Stufe, Höchststufe 10 = alte Stufe 20; Meter-Anzeige aus der Bot-Messung', () => {
  assert.equal(GARAGE.maxPartLevel, 10);
  // Wirkung: 2 × L / (1 + L / 15) → Stufe 10 = 12 effektive Stufen (wie früher Stufe 20 mit 20 / (1 + 20 / 30))
  near(partDimLevels(1), 2 / (1 + 1 / 15), 1e-9);
  near(partDimLevels(GARAGE.maxPartLevel), 12, 1e-9);
  // jede Stufe wirkt spürbar: Stufe 1 bringt so viel wie früher fast 2 Stufen
  assert.ok(partDimLevels(1) > 1.8);
  // Meter je Stufe: Antrieb bringt messbar Weite, abnehmender Ertrag
  const g0 = G.levelGain('drive_rasenmaehermotor', 0), g9 = G.levelGain('drive_rasenmaehermotor', 9);
  assert.ok(g0.m >= 1, `Rasenmäher Stufe 1: +${g0.m} m`);
  assert.ok(g9.m <= g0.m, 'abnehmender Ertrag');
  assert.ok(typeof g0.ref === 'string' && g0.ref.length > 3);
  for (const p of PARTS) assert.ok(G.levelGain(p.id, 0).m >= 0, p.id);
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
  s.garage.slotLevels = { tank: 99, drive: 2.7, quatsch: 3 };
  s.garage.partLevels = { tank_kanister: 5 };   // Schema v3 – wird ohne Migration verworfen
  s.garage.abilities = ['quatsch', 'sprung', 'sprung'];
  G.sanitizeGarage(s);
  assert.equal(s.garage.chassis, GARAGE.starterChassis);
  assert.equal(s.garage.parts.drive, GARAGE.starterParts.drive);
  assert.equal(s.garage.parts.tank, GARAGE.starterParts.tank);
  assert.deepEqual(s.garage.slotLevels, { drive: 2, wheels: 0, aero: 0, armor: 0, tank: GARAGE.maxPartLevel, cooling: 0, gadget: 0 });
  assert.equal(s.garage.partLevels, undefined);
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
