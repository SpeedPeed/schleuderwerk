// Regel-Schalter (ARCHITEKTUR.md Anhang A) aus Chassis, Items und Set-Boni – jede Regel mindestens einmal.
// Die Phase-2-Regeln noOverheat, heatIsResource, lowGrip, collectScrapMass, boostHold, parachute, hardStop und
// heatToThrust prüft tests/resources.test.mjs; hier zusätzlich noOverheat als Item-Regel (Ewiger Eiszapfen).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYSICS as P, RESOURCES as R, RULES, ITEMS as BAL, BASE_STATS, FEATURES } from '../www/src/data/balance.js';
import { Vehicle, thrustFactor } from '../www/src/physics/vehicle.js';
import { Objects } from '../www/src/physics/objects.js';
import { baseStats } from '../www/src/items/statMods.js';
import { TriggerEngine } from '../www/src/items/triggerEngine.js';
import { applyInventory, buildSetParts, activeSets, tagCounts } from '../www/src/items/inventory.js';
import { Stage } from '../www/src/stage/stage.js';
import { Track } from '../www/src/physics/track.js';
import { BIOMES, biomeById } from '../www/src/data/biomes.js';
import { buildLoadout } from '../www/src/garage/loadout.js';
import { defaultSave } from '../www/src/save/save.js';
import { chassisById } from '../www/src/data/index.js';
import { itemById } from '../www/src/data/items.js';
import { setBonus } from '../www/src/data/tags.js';
import { makeRng } from '../www/src/core/rng.js';
import { DEG } from '../www/src/core/math.js';
import { flat, mockInput, run } from './helpers.mjs';

const G = 9.81;
const DT = P.dt;
const near = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} ≉ ${b} (±${eps})`);
const NO = { tilt: 0, boost: false };
const BOOST = { tilt: 0, boost: true };

function vehicle(rules = {}, over = {}) {
  return new Vehicle({ ...baseStats(), ...over }, G, rules);
}
function steps(v, seconds, ctl = NO, track = flat(0), collider = null) {
  const ev = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) v.step(DT, ctl, track, ev, undefined, collider);
  return ev;
}
function air(v, { y = 50, vx = 20, vy = 0, angle = 0 } = {}) {
  v.reset(0, y, angle);
  v.onGround = false;
  v.vx = vx; v.vy = vy; v.w = 0;
}
function ground(v, s = 0) {
  v.reset(0, P.rideHeight, 0);
  v.onGround = true;
  v.s = s;
}
// Landung aus kurzer Höhe mit Winkel/Tempo; Ergebnis: Rohereignisse bis zur Landung
function land(v, { angleDeg = 0, vx = 15, vy = -10, heat = 0, rot = 0 } = {}) {
  v.reset(0, P.rideHeight + 0.2, angleDeg * DEG);
  v.onGround = false;
  v.vx = vx; v.vy = vy; v.w = 0; v.airTime = 1; v.rotAccum = rot; v.heat = heat;
  const ev = [];
  for (let i = 0; i < 200 && !v.onGround; i++) v.step(DT, NO, flat(0), ev);
  return ev;
}
const landing = (ev) => ev.find((e) => e.type === 'landing');
const dmgOf = (ev) => ev.filter((e) => e.type === 'damage').reduce((a, e) => a + e.amount, 0);

// Trigger-Engine mit Attrappen-ctx
function engine(sources, rules = {}, extra = {}) {
  const thrusts = [];
  const ctx = {
    rng: makeRng(1), source: null, depth: 0, healed: 0, bolts: 0,
    vehicle: { thrust: (dv) => thrusts.push(dv), onGround: false, heat: 0, stats: {} },
    heal(n) { ctx.healed += n; }, addBolts(n) { ctx.bolts += n; }, luck: () => 0, triggered: [],
    onTriggered(s, d, info) { ctx.triggered.push({ id: s.id, d, info }); },
    ...extra,
  };
  const eng = new TriggerEngine({ sources, ctx, rules });
  ctx.addStack = (k, s, m, max) => eng.mods.addStack(k, s, m, max);
  ctx.emit = (n, d) => eng.emit(n, d, ctx.depth + 1);
  const ev = (name, data = {}) => { eng.emit(name, data); eng.flush(); };
  return { eng, ctx, thrusts, ev };
}

// Etappe mit Garage-Ausrüstung + zusätzlichen Regeln / Inventar
function stageWith({ rules = {}, chassis = null, inventory = null, runInfo = null, biome = BIOMES[0], seed = 3 } = {}) {
  const save = defaultSave();
  if (chassis) { save.garage.chassis = chassis; save.garage.ownedChassis.push(chassis); }
  const lo = buildLoadout(save);
  lo.rules = { ...lo.rules, ...rules };
  return new Stage({ biome, track: new Track(biome), loadout: lo, seed, inventory, runInfo });
}

// ================= Chassis-Regeln =================

test('healOnCleanLanding (Sofa): 3 je saubere/perfekte Landung, max. 1× je 0,5 s und 15 je Etappe', () => {
  const sofa = chassisById('sofa');
  const { eng, ctx, ev } = engine([{ id: 'sofa', kind: 'chassis', triggers: [], rules: sofa.rules }], sofa.rules);
  ev('landing', { quality: 'clean' });
  assert.equal(ctx.healed, 3);
  ev('landing', { quality: 'perfect' });
  assert.equal(ctx.healed, 3, 'innerhalb 0,5 s nicht erneut');
  ev('landing', { quality: 'bumpy' });
  eng.update(0.6);
  ev('landing', { quality: 'crash' });
  assert.equal(ctx.healed, 3, 'holprig/Bruch heilen nicht');
  for (let i = 0; i < 10; i++) { eng.update(0.6); ev('landing', { quality: 'perfect' }); }
  assert.equal(ctx.healed, RULES.healOnCleanLanding.maxPerStage, 'Deckel je Etappe');
  ev('stageStart');
  eng.update(0.6);
  ev('landing', { quality: 'clean' });
  assert.equal(ctx.healed, 18, 'neue Etappe');
});

test('groundSpeedStacks (Rasenmäher): Bodenberührung stapelt Antrieb, Bruchlandung halbiert auf 0,03-Schritte', () => {
  const c = chassisById('rasenmaeher');
  const { eng, ev } = engine([{ id: c.id, kind: 'chassis', triggers: c.triggers, rules: c.rules }], c.rules);
  for (let i = 0; i < 7; i++) { ev('groundTouch', { impact: 3 }); eng.update(0.5); }
  const key = `${c.id}:driveAccel`;
  near(eng.mods.stackOf(key).mul, 0.21, 1e-9, '7 × 0,03');
  ev('landing', { quality: 'crash', flips: 0 });
  near(eng.mods.stackOf(key).mul, 0.09, 1e-9, '0,21/2 = 0,105 → 0,09');
  ev('landing', { quality: 'clean', flips: 0 });
  near(eng.mods.stackOf(key).mul, 0.09, 1e-9, 'saubere Landung halbiert nicht');
  // in der Etappe: Drehzahl-Anzeige 0…1
  const st = stageWith({ chassis: 'rasenmaeher' });
  assert.equal(st.chassisStackFrac(), 0);
});

test('setBonusDouble (Badewanne): Set-Stats und Effekte ×2, stack.max ×2, chance.p ×2', () => {
  const sets = activeSets({ ...tagCounts([]), feuer: 2, gummi: 4, gluck: 4 });
  const single = buildSetParts(sets, false);
  const dbl = buildSetParts(sets, true);
  assert.equal(single.statSets[0].scale, 1);
  assert.equal(dbl.statSets[0].scale, 2);
  for (const s of dbl.sources) assert.equal(s.scale, 2);
  // Glück-Set 4 enthält chance → p verdoppelt (≤ chanceMax); die Inhaltsdaten bleiben unverändert
  const pOf = (srcs) => Number(JSON.stringify(srcs.find((x) => x.id === 'set_gluck4').triggers).match(/"p":([\d.]+)/)[1]);
  const p1 = pOf(single.sources), p2 = pOf(dbl.sources);
  near(p2, Math.min(BAL.chanceMax, p1 * 2), 1e-9, 'chance.p');
  assert.equal(pOf([{ id: 'set_gluck4', triggers: setBonus('gluck', 4).triggers }]), p1, 'Inhaltsdaten unverändert');
  // Badewanne mit 2 Feuer-Items: Feuer-Set 2 (+12 % Boost-Schub) wirkt doppelt
  const save = defaultSave();
  save.garage.chassis = 'badewanne'; save.garage.ownedChassis.push('badewanne');
  const inv = [{ itemId: 'feuer_zuendkerzen_kette', tier: 1 }, { itemId: 'feuer_grillanzuender', tier: 1 }];
  const tub = buildLoadout(save);
  const a = applyInventory(tub, inv);
  const base = buildLoadout(defaultSave());
  const b = applyInventory(base, inv);
  assert.ok(a.rules.setBonusDouble && !b.rules.setBonusDouble);
  const setTub = a.statInput.sets.find((s) => s.id === 'set_feuer2');
  const setNorm = b.statInput.sets.find((s) => s.id === 'set_feuer2');
  assert.equal(setTub.scale, 2);
  assert.equal(setNorm.scale, 1);
  // Item-Slots: Badewanne −1
  assert.equal(tub.stats.itemSlots, BASE_STATS.itemSlots - 1);
});

test('tagBoost (Kühlschrank Eis +50 %, Biome Feuer/Elektro +25 %): skalierte Werte der Items', () => {
  const save = defaultSave();
  save.garage.chassis = 'kuehlschrank'; save.garage.ownedChassis.push('kuehlschrank');
  const fridge = buildLoadout(save);
  const inv = [{ itemId: 'eis_kuehlerschlauch', tier: 1 }, { itemId: 'feuer_zuendkerzen_kette', tier: 2 }, { itemId: 'elektro_peltier_kuehlbox', tier: 1 }];
  const setup = applyInventory(fridge, inv, { biome: biomeById('gluewueste') });
  const by = (id) => setup.sources.find((s) => s.id === id);
  near(by('eis_kuehlerschlauch').scale, 1.5, 1e-9, 'Eis +50 %');
  near(by('feuer_zuendkerzen_kette').scale, BAL.tierMult[1] * 1.25, 1e-9, 'Feuer ★2 in der Glutwüste');
  near(by('elektro_peltier_kuehlbox').scale, 1.5, 1e-9, 'Hybrid Elektro/Eis zählt als Eis');
  // passive Stats: Eis-Bohnerwachs ohne/mit Kühlschrank
  const st = (lo) => applyInventory(lo, [{ itemId: 'eis_bohnerwachs', tier: 1 }]).statInput.items[0].scale;
  assert.equal(st(buildLoadout(defaultSave())), 1);
  assert.equal(st(fridge), 1.5);
  // Gewittersteppe: Elektro +25 %
  const storm = applyInventory(buildLoadout(defaultSave()), [{ itemId: 'elektro_blitzableiter', tier: 1 }], { biome: biomeById('gewittersteppe') });
  near(storm.sources.find((s) => s.kind === 'item').scale, 1.25, 1e-9);
});

// ================= Set-Regeln (Set 6) =================

test('shockArc (Elektro-Set 6): Stromschlag zerstört das nächste Hindernis und holt Pickups', () => {
  const st = stageWith({ rules: { shockArc: true } });
  st.launchNow(0.5, 30);
  const v = st.vehicle;
  v.y = st.track.heightAt(v.x) + 30;
  st.objects.obstacles.length = 0;
  st.objects.addObstacle(v.x + 6, 'scrap');
  st.objects.addObstacle(v.x + 30, 'scrap');
  st.objects.addPickup(v.x + 2, v.y + 3, 'fuel');
  const ob = st.objects.obstacles;
  st.emit('shock', { source: 'test' });
  st.flushEvents();
  assert.ok(!ob[0].alive, 'nächstes Hindernis (≤ 8 m) zerstört');
  assert.ok(ob[1].alive, 'weiter entferntes bleibt');
  assert.equal(st.pickupCounts.fuel, 1, 'Pickup eingesammelt');
  assert.equal(st.eventCounts.collision || 0, 0, 'kein collision-Ereignis');
  // höchstens 1 Lichtbogen je 0,5 s
  st.objects.addObstacle(v.x + 4, 'scrap');
  st.emit('shock', {}); st.flushEvents();
  assert.ok(ob[ob.length - 1].alive);
});

test('spinToSpeed (Gyro-Set 6): Schub je Salto nach perfekter/sauberer Landung', () => {
  const set = { id: 'set_gyro6', kind: 'set', triggers: setBonus('gyro', 6).triggers, rules: { spinToSpeed: true } };
  const t = engine([set], { spinToSpeed: true });
  t.ev('landing', { quality: 'perfect', flips: 3 });
  t.ev('landing', { quality: 'clean', flips: 2 });
  t.ev('landing', { quality: 'perfect', flips: 9 });
  t.ev('landing', { quality: 'bumpy', flips: 3 });
  assert.deepEqual(t.thrusts, [12, 4, 20]);
  const d = engine([set], { spinToSpeed: true, setBonusDouble: true });
  d.ev('landing', { quality: 'perfect', flips: 1 });
  assert.deepEqual(d.thrusts, [RULES.spinToSpeed.perFlipDouble]);
});

test('overheatAfterburner (Feuer-Set 6): Überhitzung ohne Sperre/Schaden → 2 s Nachbrenner mit ×1,5 Schub, alle 8 s', () => {
  const v = vehicle({ overheatAfterburner: true });
  air(v);
  const ev = [];
  v.ev = ev;
  v.addHeat(200);
  assert.ok(ev.some((e) => e.type === 'overheat'));
  assert.equal(v.stall, 0, 'keine Sperre');
  assert.equal(v.durability, BASE_STATS.durabilityMax, 'kein Schaden');
  near(v.heat, R.overheatResetHeat, 1e-9);
  assert.equal(v.freeBoost, RULES.overheatAfterburner.dur);
  const ev2 = steps(v, 0.1);
  assert.ok(ev2.some((e) => e.type === 'boost' && e.free && e.source === 'set_feuer'));
  near(v.boostAccel(10), (v.stats.boostThrust / v.stats.mass) * thrustFactor(10, v.thrustCap) * RULES.overheatAfterburner.thrustMul, 1e-9, 'Schub ×1,5');
  near(v.heat, Math.max(0, R.overheatResetHeat - v.stats.coolRate * 0.1), 0.2, 'Nachbrenner heizt nicht');
  // innerhalb der Abklingzeit: normale Überhitzung
  steps(v, 2);
  v.addHeat(200);
  assert.ok(v.stall > 0, 'zweite Überhitzung innerhalb 8 s sperrt');
  assert.ok(v.durability < BASE_STATS.durabilityMax);
});

test('coldGlide (Eis-Set 6): unter 40 Hitze Rollreibung × 0,25, Schlamm bremst nicht', () => {
  const roll = (rules, heat, friction = 1) => {
    const v = vehicle(rules, { driveAccel: 0, drag: 0.0003, coolRate: 0 });
    ground(v, 12);
    v.heat = heat;
    const tr = { ...flat(0), frictionAt: () => friction };
    steps(v, 1, NO, tr);
    return 12 - v.s;
  };
  const normal = roll({}, 0);
  const cold = roll({ coldGlide: true }, 0);
  const warm = roll({ coldGlide: true }, 45);
  near(cold, normal * RULES.coldGlide.frictionMul, 0.15, 'Bremsung ×0,25');
  near(warm, normal, 0.05, 'ab 40 Hitze normal');
  near(roll({ coldGlide: true }, 0, 4), cold, 0.05, 'Schlamm wirkt nicht');
});

test('impactToThrust (Hydraulik-Set 6): Aufprallschaden wird zu Schub, Bruchlandung halbiert', () => {
  const a = vehicle(), b = vehicle({ impactToThrust: true });
  const evA = land(a, { vy: -26 }), evB = land(b, { vy: -26 });
  const lost = dmgOf(evA);
  assert.ok(lost > 5, `Vergleich: ${lost} Schaden ohne Regel`);
  assert.equal(dmgOf(evB), 0, 'kein Aufprallschaden');
  assert.ok(b.s > a.s + 4, `Schub (${a.s.toFixed(1)} → ${b.s.toFixed(1)})`);
  const c = vehicle(), d = vehicle({ impactToThrust: true });
  const dc = dmgOf(land(c, { vy: -26, angleDeg: 110 })), dd = dmgOf(land(d, { vy: -26, angleDeg: 110 }));
  const impactPart = dc - R.crashLandingDamage;
  near(dd, impactPart * RULES.impactToThrust.crashMul + R.crashLandingDamage, 0.01, 'Bruch: Aufprallteil halbiert');
});

test('gapTrampoline (Gummi-Set 6): erster Schluchtsturz wird zum Trampolin, der zweite zählt', () => {
  const gap = { edge: 10, far: 30, yr: 0, depth: 30 };
  const track = { ...flat(-40), gapAt: (x) => (x > gap.edge && x < gap.far ? gap : null) };
  const v = vehicle({ gapTrampoline: true });
  v.reset(15, -FEATURES.gap.fallDepth - 1, 0);
  v.onGround = false; v.vx = 6; v.vy = -8;
  const ev = [];
  v.step(DT, NO, track, ev);
  assert.ok(ev.some((e) => e.type === 'bounce' && e.source === 'gap'), 'Trampolin');
  assert.ok(!ev.some((e) => e.type === 'fall'));
  assert.ok(v.vy >= RULES.gapTrampoline.minVy && v.vx >= RULES.gapTrampoline.minVx);
  // ballistisch hinter die Kante (ohne Luftwiderstand)
  const tFlight = (v.vy + Math.sqrt(v.vy ** 2 - 2 * G * (gap.yr + P.rideHeight - v.y))) / G;
  assert.ok(v.x + v.vx * tFlight >= gap.far + RULES.gapTrampoline.beyond);
  v.reset(15, -FEATURES.gap.fallDepth - 1, 0);
  v.trampolines = 1;
  const ev2 = [];
  v.step(DT, NO, track, ev2);
  assert.ok(ev2.some((e) => e.type === 'fall'), 'zweiter Sturz normal');
});

test('mutualAttraction (Magnet-Set 6): Pickup vor der Kiste zieht nach vorn/oben (nur Luft)', () => {
  const v = vehicle({ mutualAttraction: true });
  air(v, { y: 20, vx: 10 });
  const objs = new Objects({ spawn: { weights: {} } }, flat(0), 1);
  objs.addPickup(v.x + 4, v.y + 2, 'fuel');
  v.ruleForces(objs);
  assert.ok(v.ruleAirOnlyAx > 0 && v.ruleAirOnlyAy > 0);
  // hinter der Kiste / zu weit / am Boden: nichts
  const o2 = new Objects({ spawn: { weights: {} } }, flat(0), 1);
  o2.addPickup(v.x - 3, v.y, 'fuel');
  o2.addPickup(v.x + 50, v.y, 'fuel');
  v.ruleForces(o2);
  assert.equal(v.ruleAirOnlyAx, 0);
  ground(v, 5);
  v.ruleForces(objs);
  assert.equal(v.ruleAirOnlyAx, 0);
});

test('wreckingBall (Schrott-Set 6): ab 16 m/s wird das Hindernis zerstört, sonst normale Kollision', () => {
  const run1 = (speed, rules) => {
    const v = vehicle(rules);
    ground(v, speed);
    const objs = new Objects({ spawn: { weights: {} } }, flat(0), 1);
    objs.addObstacle(2, 'scrap');
    const ev = [];
    v.x = 0;
    objs.collide(v, -1, v.y, DT, ev);
    v.x = 3;
    objs.collide(v, 0, v.y, DT, ev);
    return { ev, v, objs };
  };
  const fast = run1(20, { wreckingBall: true });
  const w = fast.ev.find((e) => e.type === 'wreck');
  assert.ok(w && w.scrap === RULES.wreckingBall.scrap);
  near(fast.v.s, 20 * RULES.wreckingBall.speedKeep, 1e-9);
  assert.ok(!fast.objs.obstacles[0].alive);
  assert.ok(!fast.ev.some((e) => e.type === 'hit'));
  assert.ok(run1(10, { wreckingBall: true }).ev.some((e) => e.type === 'hit'), 'zu langsam');
  assert.ok(run1(13, { wreckingBall: true, setBonusDouble: true }).ev.some((e) => e.type === 'wreck'), 'Badewanne: ab 12 m/s');
  // In der Etappe: collision mit damage 0 und 2 Schrott-Pickups
  const st = stageWith({ rules: { wreckingBall: true } });
  st.launchNow(0.5, 30);
  st.handle({ type: 'wreck', x: 5, y: 1, obstacle: { type: 'scrap' }, scrap: 2 });
  st.flushEvents();
  assert.equal(st.eventCounts.collision, 1);
  assert.equal(st.pickupCounts.scrap, 2);
  assert.equal(st.vehicle.damageTaken, 0);
});

test('boostOvercap (Raketen-Set 6): während eines Boosts weiche Grenze × 1,4', () => {
  const v = vehicle({ boostOvercap: true });
  air(v, { vx: 50 });
  assert.equal(v.thrustCap, v.softCap);
  steps(v, 0.05, BOOST);
  assert.ok(v.boosting);
  near(v.thrustCap, v.softCap * RULES.boostOvercap.capMul, 1e-9);
  const d = vehicle({ boostOvercap: true, setBonusDouble: true });
  air(d, { vx: 50 });
  steps(d, 0.05, BOOST);
  near(d.thrustCap, d.softCap * RULES.boostOvercap.capMulDouble, 1e-9);
});

test('luckyEcho (Glück-Set 6): Item-Auslösung wird zweimal ausgeführt (max. 1 Echo je Item und s)', () => {
  const it = { id: 'x', kind: 'item', tier: 1, triggers: [{ on: 'pickup', do: [{ fx: 'bolts', amount: 1 }] }] };
  const t = engine([it], { luckyEcho: true }, { rng: { next: () => 0 } });
  t.ev('pickup', { kind: 'bolt' });
  assert.equal(t.ctx.bolts, 2, 'Echo');
  t.ev('pickup', { kind: 'bolt' });
  assert.equal(t.ctx.bolts, 3, 'Echo-Abklingzeit');
  t.eng.update(1.01);
  t.ev('pickup', { kind: 'bolt' });
  assert.equal(t.ctx.bolts, 5);
  assert.ok(t.ctx.triggered.some((x) => x.info && x.info.echo));
  // Set-Quellen echoen nicht; ohne Glück-Chance kein Echo
  const s = engine([{ ...it, kind: 'set' }], { luckyEcho: true }, { rng: { next: () => 0 } });
  s.ev('pickup', {});
  assert.equal(s.ctx.bolts, 1);
  const n = engine([it], { luckyEcho: true }, { rng: { next: () => 0.99 } });
  n.ev('pickup', {});
  assert.equal(n.ctx.bolts, 1);
});

// ================= Legendäre Items =================

test('heatIsFuel (Perpetuum Mobile): Boost/Antrieb verbrauchen Hitze statt Treibstoff; Notbetrieb aus dem Tank', () => {
  const v = vehicle({ heatIsFuel: true }, { coolRate: 0 });
  air(v);
  steps(v, 1, BOOST);
  near(v.fuel, BASE_STATS.fuelMax, 1e-9, 'kein Treibstoff');
  near(v.heat, BASE_STATS.boostFuel + BASE_STATS.boostHeat, 0.6, 'Verbrauch als Hitze');
  // Bodenantrieb
  const g = vehicle({ heatIsFuel: true }, { coolRate: 0 });
  ground(g);
  steps(g, 1);
  near(g.fuel, BASE_STATS.fuelMax, 1e-9);
  near(g.heat, BASE_STATS.driveFuel + BASE_STATS.driveHeat, 0.3);
  // Überhitzungssperre: Notbetrieb aus dem Tank (Boost läuft weiter, kostet Treibstoff)
  const s = vehicle({ heatIsFuel: true });
  air(s);
  s.stall = 1;
  steps(s, 0.5, BOOST);
  assert.ok(s.boosting && s.fuel < BASE_STATS.fuelMax - 5, 'Notbetrieb');
  // negative Boost-Hitze zählt als 0
  const n = vehicle({ heatIsFuel: true }, { coolRate: 0, boostHeat: -20 });
  air(n);
  steps(n, 1, BOOST);
  near(n.heat, BASE_STATS.boostFuel, 0.6);
});

test('flipsNeverCrash (Schiffskompass): mit Salto wird aus Bruch holprig', () => {
  const a = landing(land(vehicle({ flipsNeverCrash: true }), { angleDeg: 110, rot: 2 * Math.PI }));
  assert.equal(a.quality, 'bumpy');
  const b = landing(land(vehicle({ flipsNeverCrash: true }), { angleDeg: 110 }));
  assert.equal(b.quality, 'crash', 'ohne Salto normal');
});

test('boostHorizontal (Wasserwaagen-Rakete): Boost in der Luft immer waagrecht', () => {
  const a = vehicle(), b = vehicle({ boostHorizontal: true });
  air(a, { angle: 80 * DEG, vx: 10 }); air(b, { angle: 80 * DEG, vx: 10 });
  steps(a, 0.5, BOOST); steps(b, 0.5, BOOST);
  assert.ok(b.vx > a.vx + 3, `waagrecht schneller (${a.vx.toFixed(1)} / ${b.vx.toFixed(1)})`);
  assert.ok(b.vy < a.vy, 'kein Schub nach oben');
});

test('perfectLaunchLowGrav (Levitron): nach perfektem Abschuss Schwerkraft × 0,65 bis zur Bodenberührung', () => {
  const v = vehicle({ perfectLaunchLowGrav: true });
  v.reset(0, 50, 0);
  v.launch(20, 0.5, true);
  near(v.gravity, G * RULES.perfectLaunchLowGrav.gravityMul, 1e-9);
  const w = vehicle({ perfectLaunchLowGrav: true });
  w.launch(20, 0.5, false);
  near(w.gravity, G, 1e-9, 'ohne perfekten Abschuss');
  land(v);
  near(v.gravity, G, 1e-9, 'nach der Landung');
});

test('allLandingsPerfect + doubleDamage (Hubstützen): jede Landung perfekt, Schaden ×2; mit noPerfectLanding normal', () => {
  const ev = land(vehicle({ allLandingsPerfect: true }), { angleDeg: 50 });
  assert.equal(landing(ev).quality, 'perfect');
  assert.ok(ev.some((e) => e.type === 'perfectLanding'));
  const a = vehicle(), b = vehicle({ doubleDamage: true });
  near(dmgOf(land(b, { vy: -26 })), 2 * dmgOf(land(a, { vy: -26 })), 1e-6, 'Schaden doppelt');
  const both = landing(land(vehicle({ allLandingsPerfect: true, noPerfectLanding: true }), { angleDeg: 50 }));
  assert.equal(both.quality, 'bumpy', 'heben sich auf');
});

test('noPerfectLanding (Gummihuhn): perfekt wird sauber', () => {
  const ev = land(vehicle({ noPerfectLanding: true }), { angleDeg: 1 });
  assert.equal(landing(ev).quality, 'clean');
  assert.ok(!ev.some((e) => e.type === 'perfectLanding'));
});

test('iceLanding (Schlittschuhkufen): unter 50 Hitze kein Tempoverlust beim Aufprall', () => {
  const a = vehicle(), b = vehicle({ iceLanding: true }), c = vehicle({ iceLanding: true });
  land(a, { vx: 15, vy: -8 }); land(b, { vx: 15, vy: -8 }); land(c, { vx: 15, vy: -8, heat: 60 });
  near(b.s, Math.hypot(15, 8 - G * DT), 0.3, 'voller Betrag');
  assert.ok(b.s > a.s + 1);
  near(c.s, a.s, 0.05, 'heiß: normal');
});

test('boltsAreFuel (Schraubenvergaser): leerer Tank wird mit Schrauben bezahlt (1 je 4 Treibstoff)', () => {
  const st = stageWith({ rules: { boltsAreFuel: true }, runInfo: { bolts: 3, counters: {} } });
  st.launchNow(0.5, 30);
  const v = st.vehicle;
  v.y = st.track.heightAt(v.x) + 200; v.vy = 0; v.angle = 0;
  v.fuel = 0;
  const input = mockInput();
  input.st.held[0] = true;
  run(st, input, 0.5);
  assert.ok(st.boltsSpent >= 2, `Schrauben verbrannt (${st.boltsSpent})`);
  assert.equal(st.eventCounts.fuelEmpty || 0, 0, 'noch Schrauben da → kein fuelEmpty');
  run(st, input, 1.5);
  assert.equal(st.availableBolts(), 0);
  assert.equal(st.eventCounts.fuelEmpty, 1, 'erst ohne Schrauben');
  assert.ok(!v.boosting);
});

test('boltHoardThrust (Schraubenvergaser): Boost-Schub +1 % je 5 Schrauben, max. +30 %', () => {
  const base = stageWith({}).stats.boostThrust;
  const a = stageWith({ rules: { boltHoardThrust: true }, runInfo: { bolts: 52, counters: {} } });
  near(a.stats.boostThrust, base * 1.1, 1e-6);
  const b = stageWith({ rules: { boltHoardThrust: true }, runInfo: { bolts: 999, counters: {} } });
  near(b.stats.boostThrust, base * (1 + RULES.boltHoardThrust.max), 1e-6);
  a.addBolts(10);
  a.recomputeStats();
  near(a.stats.boostThrust, base * 1.12, 1e-6, 'neu berechnet');
});

test('shockRecharge (Teslaspule): Stromschlag setzt Stromschlag-Abklingzeiten zurück (max. 1× je 3 s)', () => {
  const it = { id: 'blitz', kind: 'item', tier: 1, triggers: [{ on: 'shock', limit: { cooldown: 5 }, do: [{ fx: 'bolts', amount: 1 }] }] };
  const t = engine([it], { shockRecharge: true });
  t.ev('shock', {});
  t.ev('shock', {});
  assert.equal(t.ctx.bolts, 2, 'zweiter Schlag dank Zurücksetzen');
  t.eng.update(1);
  t.ev('shock', {});
  assert.equal(t.ctx.bolts, 2, 'Regel hat 3 s Abklingzeit');
  t.eng.update(2.1);
  t.ev('shock', {});
  assert.equal(t.ctx.bolts, 3);
  const n = engine([it], {});
  n.ev('shock', {}); n.ev('shock', {});
  assert.equal(n.ctx.bolts, 1, 'ohne Regel');
});

test('everyThirdTierUp (Dreiblatt-Klee): jede 3. Auslösung einer Item-Quelle mit nächster ★-Stufe', () => {
  const it = { id: 'x', kind: 'item', tier: 1, triggers: [{ on: 'flip', do: [{ fx: 'thrust', amount: 10 }] }] };
  const t = engine([it, { id: 's', kind: 'set', tier: 1, triggers: [{ on: 'flip', do: [{ fx: 'thrust', amount: 1 }] }] }], { everyThirdTierUp: true });
  for (let i = 0; i < 6; i++) t.ev('flip', { count: 1 });
  const items = t.thrusts.filter((x) => x >= 10);
  assert.deepEqual(items.map((x) => Math.round(x * 10) / 10), [10, 10, 16, 10, 10, 16]);
  assert.ok(t.thrusts.filter((x) => x < 10).every((x) => x === 1), 'Set-Quellen nicht betroffen');
  const s3 = engine([{ ...it, tier: 3, scaleUp: undefined }], { everyThirdTierUp: true });
  for (let i = 0; i < 3; i++) s3.ev('flip', {});
  near(s3.thrusts[2], 10 * RULES.everyThirdTierUp.beyondMax, 1e-9, '★3 → 3,0');
});

test('obstacleBounce (Hüpfburg): Hindernis ohne Schaden, Abprall nach oben/vorn', () => {
  const v = vehicle({ obstacleBounce: true });
  ground(v, 12);
  const objs = new Objects({ spawn: { weights: {} } }, flat(0), 1);
  objs.addObstacle(2, 'scrap');
  const ev = [];
  v.x = 3;
  objs.collide(v, 0, v.y, DT, ev);
  assert.ok(ev.some((e) => e.type === 'bounce' && e.source === 'huepfburg'));
  assert.ok(!ev.some((e) => e.type === 'hit'));
  assert.ok(!v.onGround && v.vy >= RULES.obstacleBounce.vy && v.vx > 12);
  assert.ok(objs.obstacles[0].alive, 'Hindernis bleibt');
  const ev2 = [];
  objs.collide(v, 0, v.y, DT, ev2);
  assert.equal(ev2.length, 0, '1 s kein erneuter Treffer');
  // wreckingBall hat Vorrang
  const w = vehicle({ obstacleBounce: true, wreckingBall: true });
  ground(w, 20);
  const o2 = new Objects({ spawn: { weights: {} } }, flat(0), 1);
  o2.addObstacle(2, 'scrap');
  const ev3 = [];
  w.x = 3;
  o2.collide(w, 0, w.y, DT, ev3);
  assert.ok(ev3.some((e) => e.type === 'wreck'));
});

// ================= Flüche =================

test('blackCatNap (Schwarze Katze): ein anderes Item ruht in der Etappe (zählt für Sets weiter)', () => {
  const inv = [{ itemId: 'gluck_schwarze_katze', tier: 1 }, { itemId: 'feuer_buegeleisen', tier: 1 }, { itemId: 'feuer_zuendkerzen_kette', tier: 1 }];
  const seen = new Set();
  for (let seed = 1; seed < 30; seed++) {
    const st = stageWith({ inventory: inv, seed });
    assert.ok(st.nappedSlot === 1 || st.nappedSlot === 2);
    seen.add(st.nappedSlot);
    const ids = st.setup.sources.filter((s) => s.kind === 'item').map((s) => s.slot);
    assert.ok(!ids.includes(st.nappedSlot), 'Auslöser ruhen');
    assert.ok(!st.statInput.items.some((x) => x.slot === st.nappedSlot), 'Stats ruhen');
    assert.ok(st.setup.sets.some((s) => s.id === 'feuer2'), 'Set zählt weiter');
  }
  assert.equal(seen.size, 2, 'gleichverteilt über beide');
  assert.equal(stageWith({ inventory: [inv[0]] }).nappedSlot, -1, 'allein: nichts');
});

test('noOverheat als Item-Regel (Ewiger Eiszapfen), obstacleMagnet (Geisterbahn-Magnet), endlessSpin (Spieluhr)', () => {
  const st = stageWith({ inventory: [{ itemId: 'eis_ewiger_eiszapfen', tier: 1 }] });
  assert.ok(st.rules.noOverheat && st.vehicle.rules.noOverheat);
  const ev = [];
  st.vehicle.ev = ev;
  st.vehicle.addHeat(500);
  assert.ok(!ev.some((e) => e.type === 'overheat'));
  // obstacleMagnet: Hindernis ≤ 6 m vor der Kiste zieht
  const v = vehicle({ obstacleMagnet: true });
  air(v, { y: 3, vx: 5 });
  const objs = new Objects({ spawn: { weights: {} } }, flat(0), 1);
  objs.addObstacle(v.x + 4, 'scrap');
  v.ruleForces(objs);
  near(Math.hypot(v.ruleAx, v.ruleAy), RULES.obstacleMagnet.accel, 1e-9);
  assert.ok(v.ruleAx > 0);
  const far = new Objects({ spawn: { weights: {} } }, flat(0), 1);
  far.addObstacle(v.x + 9, 'scrap');
  v.ruleForces(far);
  assert.equal(v.ruleAx, 0);
  // endlessSpin: ohne Eingabe bleibt die Drehung
  const s = vehicle({ endlessSpin: true }), n = vehicle();
  air(s, { y: 500 }); air(n, { y: 500 });
  s.w = 3; n.w = 3;
  steps(s, 1); steps(n, 1);
  near(s.w, 3, 1e-9);
  assert.ok(Math.abs(n.w) < 1);
});

test('Regeln aus Items/Sets landen in stage.rules und vehicle.rules (Anhang A vollständig)', () => {
  // alle Regel-Namen der Inhaltsdaten sind bekannt und haben eine Auswertungsstelle (Anhang A)
  const known = new Set(['boostHold', 'parachute', 'hardStop', 'heatToThrust', 'healOnCleanLanding', 'setBonusDouble', 'groundSpeedStacks',
    'collectScrapMass', 'noOverheat', 'tagBoost', 'lowGrip', 'heatIsResource', 'shockArc', 'spinToSpeed', 'overheatAfterburner', 'coldGlide',
    'impactToThrust', 'gapTrampoline', 'heatIsFuel', 'flipsNeverCrash', 'obstacleBounce', 'boostHorizontal', 'perfectLaunchLowGrav',
    'allLandingsPerfect', 'doubleDamage', 'boltsAreFuel', 'boltHoardThrust', 'shockRecharge', 'everyThirdTierUp', 'iceLanding', 'blackCatNap',
    'noPerfectLanding', 'obstacleMagnet', 'endlessSpin', 'mutualAttraction', 'wreckingBall', 'boostOvercap', 'luckyEcho']);
  const found = new Set();
  const add = (r) => { for (const k of Object.keys(r || {})) found.add(k); };
  for (const id of ['feuer_perpetuum_mobile', 'gyro_schiffskompass', 'gummi_huepfburg', 'rakete_wasserwaagen_rakete', 'magnet_levitron', 'hydraulik_hubstuetzen',
    'schrott_schraubenvergaser', 'elektro_teslaspule', 'gluck_dreiblatt_klee', 'eis_schlittschuhkufen', 'gluck_schwarze_katze', 'eis_ewiger_eiszapfen',
    'gummi_gummihuhn', 'magnet_geisterbahn_magnet', 'gyro_spieluhr']) {
    const it = itemById(id);
    add(it.rules); add(it.curse && it.curse.rules);
  }
  for (const t of ['feuer', 'eis', 'elektro', 'gyro', 'magnet', 'schrott', 'hydraulik', 'gummi', 'rakete', 'gluck']) add(setBonus(t, 6).rules);
  for (const k of found) assert.ok(known.has(k), `Regel ${k} hat eine Auswertungsstelle`);
  // Hubstützen über das Inventar: Regeln kommen im Fahrzeug an
  const st = stageWith({ inventory: [{ itemId: 'hydraulik_hubstuetzen', tier: 1 }] });
  assert.ok(st.vehicle.rules.allLandingsPerfect && st.vehicle.rules.doubleDamage);
});
