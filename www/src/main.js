import * as THREE from 'three';
import { BIOMES, biomeById } from './data/biomes.js';
import { FX, CAMERA, CONTROLS, STAGE, PHYSICS, SAVE } from './data/balance.js';
import { PARTS, abilityById, chassisById, chassisVisual } from './data/index.js';
import { loadSave, writeSave, exportSave, importSave, clearSave, defaultSave, getLoadIssue, allowOverwrite, getBackup } from './save/save.js';
import { buildLoadout, partIds } from './garage/loadout.js';
import * as garageLogic from './garage/garage.js';
import { addPlaytime, markMilestone } from './garage/progression.js';
import { Track } from './physics/track.js';
import { generateStageSpec, medalFor } from './physics/trackGen.js';
import { Stage, REST } from './stage/stage.js';
import * as runLogic from './run/runState.js';
import { mapNode, isStageType } from './map/mapGen.js';
import { makeRng, hashSeed } from './core/rng.js';
import { CameraRig } from './camera/cameraRig.js';
import { Input } from './platform/input.js';
import { createView } from './render/scene.js';
import { Slingshot, buildFlag } from './render/models.js';
import { buildVehicle } from './render/vehicleModel.js';
import { TrackView } from './render/trackView.js';
import { Background } from './render/background.js';
import { ObjectsView } from './render/objectsView.js';
import { FeaturesView } from './render/featuresView.js';
import { Rain } from './render/weather.js';
import { Particles } from './render/particles.js';
import { Origin } from './render/origin.js';
import { Sfx } from './audio/sfx.js';
import { platform } from './platform/platform.js';
import { Hud } from './ui/hud.js';
import { GarageScreen } from './ui/garage.js';
import { Results } from './ui/results.js';
import { Menus } from './ui/menus.js';
import { Popups } from './ui/popups.js';
import { DevMenu } from './ui/devMenu.js';
import { MapScreen } from './ui/map.js';
import { RunScreens } from './ui/runScreens.js';
import { ItemSheet } from './ui/items.js';
import { ShopScreens } from './ui/shops.js';
import * as Dealer from './shops/scrapDealer.js';
import * as Workbench from './shops/workbench.js';
import * as BlackMarket from './shops/blackMarket.js';
import * as GasStation from './shops/gasStation.js';
import * as TextEvent from './shops/textEvent.js';
import * as Treasure from './shops/treasure.js';
import * as researchLogic from './garage/research.js';
import { confirmDialog, infoDialog } from './ui/dom.js';
import { itemById, itemPools } from './data/items.js';
import { setChainLog } from './items/triggerEngine.js';

// ---------- Grundaufbau ----------
let save = loadSave();
const canvas = document.getElementById('game');
const uiRoot = document.getElementById('ui');
const view = createView(canvas);
const origin = new Origin();

// Aktuelles Biom + Strecke (wird für jede Etappe neu aufgebaut; in Garage/Karte eine Vorschau des Bioms)
let biome = null, pal = null, track = null, trackView = null, background = null, spec = null;
const featuresView = new FeaturesView(view.scene);
function setTrack(newSpec, b) {
  const palChanged = !biome || biome.palette !== b.palette;
  biome = b;
  pal = b.palette;
  spec = newSpec;
  if (trackView) trackView.dispose();
  view.applyPalette(pal);
  track = new Track(spec, biome);
  trackView = new TrackView(view.scene, track, biome);
  if (palChanged || !background) {
    if (background) background.dispose();
    background = new Background(view.scene, pal);
  }
  featuresView.clear();
}
// Vorschau-Strecke eines Bioms (Garage, Karte)
function setBiomeScene(id) {
  const b = biomeById(id) || BIOMES[0];
  if (biome === b && spec && spec.preview) return;
  const sp = generateStageSpec({ biome: b, kind: 'stage', floor: 0, rng: makeRng(`vorschau:${b.id}`) });
  sp.preview = true;
  setTrack(sp, b);
}
setBiomeScene(save.run ? save.run.biome : BIOMES[0].id);

const objectsView = new ObjectsView(view.scene);
const particles = new Particles(view.scene, FX.maxParticles);
const rain = new Rain(view.scene);
const sling = new Slingshot(view.scene, track.heightAt(0), REST.y, pal);
// Ziel-Flaggen: Bronze (= Ziel), Silber, Gold
const MF = FX.medalFlags;
const flags = {};
for (const m of ['bronze', 'silver', 'gold']) {
  flags[m] = buildFlag(MF.colors[m]);
  flags[m].visible = false;
  view.scene.add(flags[m]);
}

// ---------- Fahrzeug-Modell (Chassis + sichtbare Teile + Lackierung) ----------
let carModel = null;
let carKey = '';
let carVisual = chassisVisual(chassisById(save.garage.chassis));
// visual: { color, accent } einer Lackierung (data/cosmetics.js) oder null (Chassis-Farben)
function setVehicle(chassisId, parts, visual = garageLogic.paintVisual(save)) {
  const key = `${chassisId}|${Object.values(parts).join(',')}|${visual ? `${visual.color}${visual.accent}` : ''}`;
  if (key === carKey && carModel) return;
  const rotY = carModel ? carModel.rotation.y : CAMERA.garage.startAngle;
  if (carModel) {
    view.scene.remove(carModel);
    carModel.userData.dispose();
  }
  carModel = buildVehicle({ chassisId, parts, visual });
  carModel.rotation.y = rotY;
  carVisual = visual || chassisVisual(chassisById(chassisId));
  view.scene.add(carModel);
  carKey = key;
}
// override: Garage-Vorschau ({ chassis, parts } bzw. { paint: id|null } im Lack-Reiter)
function vehicleFromSave(override = null) {
  const lo = buildLoadout(save, override || {});
  let visual = garageLogic.paintVisual(save);
  if (override && 'paint' in override) {
    const p = garageLogic.paintById(override.paint);
    visual = p ? { color: p.colors.body, accent: p.colors.accent } : null;
  }
  setVehicle(lo.chassis.id, partIds(lo), visual);
}
vehicleFromSave();

// Punkte der Flugkurven-Vorschau beim Zielen
const TR = FX.trajectory;
const traj = new THREE.InstancedMesh(
  new THREE.IcosahedronGeometry(TR.size, 0),
  new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: TR.opacity }),
  TR.max,
);
traj.frustumCulled = false;
traj.count = 0;
view.scene.add(traj);
const _o = new THREE.Object3D();
const _v = new THREE.Vector3();

const camRig = new CameraRig();
const input = new Input(canvas);
const sfx = new Sfx();

// Zustände: 'garage' | 'map' | 'stage' | 'results' (Auswertung einer Etappe) | 'runEnd'
let state = 'garage';
let mode = 'run';          // Etappe gehört zum Run ('run') oder ist eine Testfahrt aus dem Dev-Menü ('test')
let paused = false;
let stage = null;
let flyHintTimer = 0;
let cam = null;
let garageSpin = CAMERA.garage.startAngle;
let flashLevel = 0, flashTimer = 3;

// ---------- Oberfläche ----------
const popups = new Popups(uiRoot);
const hud = new Hud(uiRoot, { onPause: () => pauseGame() });
hud.abilityButtons.forEach((b, i) => input.bindButton(b, `ab${i}`));
const garage = new GarageScreen(uiRoot, {
  onAction: (name, ...args) => garageAction(name, ...args),
  onPreview: (ov) => { if (!save.run || (ov && 'paint' in ov)) vehicleFromSave(ov); },
  onResearch: (id) => researchAction(id),
  onSettings: () => { sfx.click(); menus.openSettings(); },
  onStart: () => { sfx.click(); save.run ? openMap() : startRun(); },
  onGiveUp: () => giveUpRun(),
  onDenied: (t) => { sfx.denied(); popups.show(t, 'info'); },
  onCompendium: () => { sfx.click(); itemSheet.openCompendium({ codex: save.codex }); },
});
const mapScreen = new MapScreen(uiRoot, {
  onNode: (id) => selectNode(id),
  onGarage: () => { sfx.click(); openGarage(); },
  onInventory: () => { sfx.click(); openInventory(); },
});
const itemSheet = new ItemSheet(uiRoot, {});
const runScreens = new RunScreens(uiRoot, {
  onTick: (kind, i) => { if (kind === 'medal') sfx.medal(i); else sfx.money(); },
});
const shopScreens = new ShopScreens(runScreens);
const results = new Results(uiRoot, {
  onGarage: () => { sfx.click(); openGarage(); },
  onAgain: () => { sfx.click(); startTestDrive(biome.id); },
  onTick: () => sfx.money(),
});
const menus = new Menus(uiRoot, {
  onResume: () => resumeGame(),
  onQuit: () => quitStage(),
  getSettings: () => save.settings,
  onSetting: (k, v) => { save.settings[k] = v; applySettings(); writeSave(save); },
  onExport: () => exportSave(save),
  onImport: (text) => {
    try {
      save = importSave(text);
      allowOverwrite();
      writeSave(save);
      afterSaveChange();
      return null;
    } catch (e) {
      return e.message || 'Unbekannter Fehler';
    }
  },
  onReset: () => {
    clearSave();
    save = defaultSave();
    writeSave(save);
    afterSaveChange();
  },
  onDevMenu: () => { sfx.perfect(); devMenu.open(); },
  getBackup: () => getBackup(),
});
const devMenu = new DevMenu(uiRoot, {
  getSave: () => save,
  getStage: () => stage,
  onCurrency: (kind, n) => { save.meta[kind] += n; writeSave(save); refreshGarage(); },
  onUnlockAll: () => { garageLogic.unlockAll(save); writeSave(save); refreshGarage(); },
  onResearch: () => { garageLogic.completeResearch(save); writeSave(save); refreshGarage(); },
  onResearchAll: () => { researchLogic.completeAllResearch(save); writeSave(save); refreshGarage(); },
  onForceNode: (type) => devForceNode(type),
  onGiftParts: () => { garageLogic.giftAllParts(save); writeSave(save); refreshGarage(); },
  onEndStage: () => {
    menus.closeSettings();
    if (paused) resumeGame();
    if (stage && stage.phase !== 'over') {
      if (stage.phase === 'aim') stage.launchNow(0.3);
      stage.finish('stop');
    }
  },
  onTweak: (group) => {
    if (group === 'BASE_STATS' && stage) stage.recomputeStats();
    refreshGarage();
  },
  onSkip: (medal) => devSkip(medal),
  onToBoss: () => devToBoss(),
  onNextAct: () => devNextAct(),
  onSetDurability: (n) => devSetDurability(n),
  onTestDrive: (id) => { menus.closeSettings(); startTestDrive(id); },
  onAddItem: (id) => devAddItem(id),
  onTierUp: (slot) => devTierUp(slot),
  onAllPool: () => devAllPool(),
  onChainLog: (on) => setChainLog(on),
});

function applySettings() {
  sfx.setEnabled(save.settings.sound);
  platform.vibration = save.settings.vibration;
  view.setShadows(save.settings.shadows);
}

function afterSaveChange() {
  applySettings();
  vehicleFromSave();
  if (state === 'garage' || state === 'map') openGarage();
  else refreshGarage();
}

function garageInfo() {
  const run = save.run;
  if (!run) return { run: null };
  const b = biomeById(run.biome);
  return { run: { act: run.act, biomeName: b.name, biomeIcon: b.icon, durability: run.durability, durabilityMax: runLogic.durabilityMax(run), bolts: run.bolts } };
}

function refreshGarage() {
  if (state === 'garage') garage.render(save, garageInfo());
  if (state === 'map' && save.run) mapScreen.render(save.run);
}

const fmtN = (n) => Math.round(n).toLocaleString('de-DE');

// ---------- Garage-Aktionen ----------
const DENIED = {
  scrap: 'Nicht genug Schrott ⚙',
  cores: 'Nicht genug Kerne 💠',
  blueprints: 'Nicht genug Blaupausen 📘',
  bolts: 'Nicht genug Schrauben 🔩',
  research: 'Erst im 🧪 Labor erforschen',
  locked: 'Noch nicht freigeschaltet',
  maxed: 'Höchste Stufe erreicht',
  ascension: 'Gibt es für einen Run-Sieg auf einer Schrottstufe',
};
function garageAction(name, ...args) {
  const fn = {
    buyPart: garageLogic.buyPart,
    upgradePart: garageLogic.upgradePart,
    equipPart: garageLogic.equipPart,
    buyChassis: garageLogic.buyChassis,
    selectChassis: garageLogic.selectChassis,
    setAbility: (s, i, id) => garageLogic.setAbility(s, i, id, buildLoadout(s).slots.abilities),
    buyPaint: garageLogic.buyPaint,
    equipPaint: garageLogic.equipPaint,
  }[name];
  if (!fn) return { ok: false };
  const res = fn(save, args[0], args[1]);
  const partId = name.endsWith('Part') ? args[0] : null;
  if (!res.ok) {
    sfx.denied();
    platform.haptic('light');
    if (DENIED[res.reason]) popups.show(DENIED[res.reason], 'info');
    if (partId) garage.flashPart(partId, 'nope');
    if (name === 'buyChassis') garage.flashChassis('nope');
    return res;
  }
  if (name === 'upgradePart') markMilestone(save, 'firstPartUpgrade');
  if (name === 'buyPart') markMilestone(save, 'firstPartBought');
  if (name === 'buyChassis') markMilestone(save, 'firstChassisUnlocked');
  if (name === 'buyPaint') markMilestone(save, 'firstPaint');
  writeSave(save);
  if (name === 'buyPaint' || name === 'equipPaint') {
    if (name === 'buyPaint') { sfx.buy(); platform.haptic('success'); emitFx('sparkle', REST.x, REST.y + 1); } else sfx.click();
    garage.paintSel = undefined;
    vehicleFromSave();
    garage.render(save, garageInfo());
    return res;
  }
  if (name === 'selectChassis') sfx.click();
  else if (name === 'equipPart' || name === 'setAbility') { sfx.click(); platform.haptic('light'); }
  else { sfx.buy(); platform.haptic('success'); emitFx('sparkle', REST.x, REST.y + 1); }
  if (name === 'setAbility') garage.closePicker(true);
  if (name === 'buyChassis') garage.viewId = args[0];
  vehicleFromSave(garage.previewOverride());   // im Teile-Unterblatt bleibt das angetippte Teil in der Vorschau
  garage.render(save, garageInfo());
  if (partId) garage.flashPart(partId);
  return res;
}

// Erfinder-Labor: Forschung kaufen
function researchAction(id) {
  const res = researchLogic.buyResearch(save, id);
  if (!res.ok) {
    sfx.denied();
    platform.haptic('light');
    popups.show(res.reason === 'locked' ? 'Erst die Voraussetzungen erforschen 🔒' : DENIED[res.reason] || 'Nicht möglich', 'info');
    garage.lab.flash(id, 'nope');
    return res;
  }
  markMilestone(save, 'firstResearch');
  writeSave(save);
  sfx.buy();
  platform.haptic('success');
  const node = researchLogic.researchById(id);
  popups.show(`🧪 ${node.icon} ${node.name}${node.repeatable ? ` – Stufe ${res.level}` : ''} erforscht!`, 'good');
  garage.render(save, garageInfo());
  garage.lab.flash(id);
  return res;
}

// ---------- Effekte (Partikel-Vorlagen aus FX.particles) ----------
const PFX = FX.particles;
function emitFx(kind, x, y, o = {}) {
  switch (kind) {
    case 'bolt':
      particles.emit(x, y, PFX.bolt);
      break;
    case 'scrap':
      particles.emit(x, y, PFX.scrap);
      break;
    case 'ring':
      particles.emit(x, y, PFX.ring);
      break;
    case 'explosion':
      particles.emit(x, y, PFX.explosion);
      if (save.settings.shake) camRig.shake(FX.shake.hit);
      break;
    case 'steamBurst':
      particles.emit(x, y, PFX.steamBurst);
      break;
    case 'dust': {
      const d = PFX.dust;
      const a = o.amount ?? d.amount;
      particles.emit(x, y, {
        n: Math.round(d.nBase + a * d.nPerAmount), colors: [...pal.dirt, pal.grass[0]], dir: Math.PI / 2, spread: d.spread,
        speed: d.speedBase + a * d.speedPerAmount, life: d.life, gravity: d.gravity, size: d.size, zSpread: d.zSpread,
      });
      break;
    }
    case 'smash': {
      const s = PFX.smash;
      const cols = o.type === 'scrap' ? pal.wreck : s.colors[o.type] || [carVisual.color, carVisual.accent, '#cccccc'];
      particles.emit(x, y, { ...s, colors: cols });
      break;
    }
    case 'sparkle':
      particles.emit(x, y, PFX.sparkle);
      break;
    case 'shock':
      particles.emit(x, y, PFX.shock);
      break;
    case 'medal':
      particles.emit(x, y + 1, { ...PFX.confetti, colors: [MF.colors[o.medal] || '#ffd23f', '#ffffff', '#ff8a3d'] });
      break;
    case 'lightning':
      flashLevel = Math.max(flashLevel, FX.flash.strike);
      particles.emit(x, y + 0.5, PFX.strike);
      break;
  }
}

// Wiederverwendete Partikel-Einstellungen für Effekte, die jedes Bild entstehen
const BF = PFX.boostFlame, GD = PFX.groundDust, WD = PFX.windDust, ST = PFX.steam, DS = PFX.driveSmoke;
const flameOpts = { n: BF.n, colors: BF.colors, dir: 0, spread: BF.spread, speed: BF.speed, vx: 0, vy: 0, life: BF.life, size: BF.size, jitter: BF.jitter, zSpread: BF.zSpread, zSpeed: BF.zSpeed };
const smokeOpts = { ...DS, dir: 0, vx: 0, vy: 0 };
const groundDustOpts = { n: GD.n, colors: null, dir: Math.PI * GD.dir, spread: GD.spread, speed: GD.speed, life: GD.life, gravity: GD.gravity, size: GD.size, zSpread: GD.zSpread };
const windOpts = { n: 1, colors: null, speed: 0, vx: 0, vy: WD.vy, life: WD.life, size: WD.sizeBase, jitter: 0, zSpread: WD.zSpread, zSpeed: 0 };

const hooks = {
  popup: (t, k) => popups.show(t, k),
  sfx: (name, arg) => { if (typeof sfx[name] === 'function') sfx[name](arg); },
  shake: (a) => { if (save.settings.shake) camRig.shake(a); },
  haptic: (k) => platform.haptic(k),
  fx: (kind, x, y, o) => emitFx(kind, x, y, o),
  end: (r) => endStage(r),
  // Trigger-Engine: Item-Symbol hüpft, Feed-Zeile; ab Kettentiefe 3 „KETTENREAKTION ×n!“
  triggered: (src, depth, info) => hud.itemTriggered(src, depth, info),
  chain: (n) => { hud.chain(n); sfx.trick(n); platform.haptic('light'); },
};

// ---------- Etappe ----------
// Gemeinsamer Start einer Etappe (Run oder Testfahrt)
function beginStage(newSpec, loadout, { seed, durability, runMods, inventory = null, runInfo = null, farEnd = true } = {}) {
  setVehicle(loadout.chassis.id, partIds(loadout));
  carModel.rotation.y = 0;
  setTrack(newSpec, biomeById(newSpec.biome));
  stage = new Stage({ biome, spec, track, loadout, seed, hooks, durability, runMods, inventory, runInfo, farEnd });
  featuresView.build(track, stage.objects);
  rain.setActive(!!stage.weather.rain);
  state = 'stage';
  paused = false;
  input.reset();
  input.captureKeys = true;
  input.boostSlot = Math.max(0, stage.abilities.boostSlot);
  particles.clear();
  popups.clear();
  garage.show(false);
  results.show(false);
  mapScreen.show(false);
  runScreens.hide();
  menus.showPause(false, mode);
  hud.show(true, {
    tutorial: save.tutorial.runs < CONTROLS.tutorialRuns,
    weather: stage.weather,
    abilities: stage.abilities.slots.map((s) => s.def),
    goal: { target: stage.target, medals: stage.medals, medalList: stage.medalList },
    items: inventory ? { inventory, napped: stage.nappedSlot } : null,
  });
  if (stage.nappedSlot >= 0 && inventory) {
    const e = inventory[stage.nappedSlot];
    const d = e && itemById(e.itemId);
    if (d) popups.show(`🐈‍⬛ ${d.icon} ${d.name} schläft diese Etappe`, 'info');
  }
  for (const m of ['bronze', 'silver', 'gold']) {
    const x = stage.medalList.includes(m) ? stage.medals[m] : undefined;
    flags[m].visible = x !== undefined;
    flags[m].userData.x = x;
    if (x !== undefined) flags[m].userData.y = track.refHeightAt(x);
  }
  flyHintTimer = 0;
  platform.keepAwake(true);
}

// Testfahrt (Dev-Menü): Etappe (Standard: Etage 0) des Bioms mit der Garage-Ausrüstung, Schrott wie in Phase 2.
// opts (Konsole/Rauchtest): { kind, floor, bossId, seed }
function startTestDrive(biomeId, opts = {}) {
  const loadout = buildLoadout(save);
  if (!save.garage.ownedChassis.includes(loadout.chassis.id)) return;
  const b = biomeById(biomeId) || BIOMES[0];
  const seed = opts.seed ?? ((Math.random() * 2 ** 31) | 0);
  const sp = generateStageSpec({ biome: b, kind: opts.kind || 'stage', floor: opts.floor ?? 0, bossId: opts.bossId || null, rng: makeRng(seed) });
  mode = 'test';
  garage.closePicker(true);
  beginStage(sp, loadout, { seed, farEnd: false });   // Testfahrt: kein Ende bei „Ziel weit übertroffen“ (Weitflug-Test)
}

// Etappe des aktuellen Run-Knotens starten (auch Neuversuch: gleiche Strecke, neuer Abschuss)
function startRunStage() {
  const run = save.run;
  if (!run || !run.current) return;
  const node = mapNode(run.map, run.current.node);
  const sp = runLogic.stageSpecFor(run, node);
  mode = 'run';
  const su = runLogic.runStageSetup(run, save);
  beginStage(sp, su.loadout, { seed: hashSeed(`${run.seed}:${node.id}:${run.current.attempts}`), durability: run.durability, runMods: run.runMods, inventory: su.inventory, runInfo: su.runInfo });
}

function endStage(r) {
  const s = save.stats;
  s.bestDist = Math.max(s.bestDist, r.dist);
  s.bestHeight = Math.max(s.bestHeight, r.height);
  s.bestTricks = Math.max(s.bestTricks, r.tricks);
  save.tutorial.runs++;
  state = 'results';
  input.captureKeys = false;
  platform.keepAwake(false);
  if (mode === 'test') {
    save.meta.scrap += r.testDrive.total;
    s.totalScrap += r.testDrive.total;
    s.testDrives++;
    markMilestone(save, 'firstTestDrive');
    writeSave(save);
    const canUpgrade = PARTS.some((p) => {
      const st = garageLogic.partState(save, p);
      return (st.equipped && st.canUpgrade) || st.canBuy;
    });
    later(() => { hud.show(false); results.present(r, { canUpgrade }); });
    return;
  }
  showRunResult(r);
}

// Ergebnis in den Run übernehmen und anzeigen
function showRunResult(r) {
  const run = save.run;
  if (!run) { openGarage(); return; }
  state = 'results';
  const o = runLogic.applyStageResult(run, r, save);
  writeSave(save);
  later(() => {
    hud.show(false);
    if (o.cleared) { sfx.record(); platform.haptic('success'); }
    reportRunEvents(o.events);
    runScreens.stageResult(r, o, { durability: run.durability, durabilityMax: runLogic.durabilityMax(run) }, {
      onNext: () => {
        sfx.click();
        if (o.won) { finishRun(); return; }
        // erst die Item-Auswahl(en), dann Akt-Übergang bzw. Karte
        showChoices(() => {
          if (o.nextAct) runScreens.actTransition({ act: run.act, biome: run.biome, prevBiome: r.biome }, { onNext: () => { sfx.click(); openMap(); } });
          else openMap();
        });
      },
      onRetry: () => { sfx.click(); startRunStage(); },
      onMap: () => { sfx.click(); openMap(); },
      onEnd: () => { sfx.click(); finishRun(); },
    });
  });
}

// ---------- Items im Run ----------
// Ausgelöste Run-Ereignisse (stageClear, nodeEnter, itemGained …) kurz anzeigen
function reportRunEvents(logs) {
  for (const log of [].concat(logs || [])) {
    if (!log) continue;
    for (const t of log.triggered || []) popups.show(`${t.icon || '•'} ${t.name}`, 'info');
    if (log.bolts > 0) popups.show(`+${fmtN(log.bolts)} 🔩`, 'good');
    for (const i of log.upgraded || []) {
      const e = save.run && save.run.inventory[i];
      const d = e && itemById(e.itemId);
      if (d) popups.show(`★ ${d.icon} ${d.name} → ★${e.tier}`, 'big');
    }
  }
}

// Offene Item-Auswahlen nacheinander zeigen, danach then()
function showChoices(then) {
  const run = save.run;
  const ch = run && runLogic.pendingChoice(run);
  if (!ch) { then(); return; }
  const info = () => ({ inventory: run.inventory, parts: run.parts, slots: runLogic.itemSlots(run), remaining: run.pendingChoices.length });
  runScreens.itemChoice(ch, info(), {
    onPick: (i) => {
      const res = runLogic.pickItem(run, save, i);
      if (!res.ok && res.reason === 'full') { sfx.click(); showReplace(ch, i, then); return; }
      if (res.ok) gotItem(res);
      writeSave(save);
      showChoices(then);
    },
    onSkip: () => {
      const r = runLogic.skipChoice(run);
      writeSave(save);
      sfx.money();
      if (r.ok && r.bolts) popups.show(`+${fmtN(r.bolts)} 🔩`, 'good');
      showChoices(then);
    },
    onInventory: () => { sfx.click(); openInventory(); },
  });
}

// Voller Rucksack: ersetzen oder ablehnen
function showReplace(ch, index, then) {
  const run = save.run;
  runScreens.itemReplace({ itemId: ch.items[index], inventory: run.inventory, skipBolts: ch.skipBolts }, {
    onReplace: (slot) => {
      const res = runLogic.pickItem(run, save, index, slot);
      if (res.ok) gotItem(res);
      writeSave(save);
      showChoices(then);
    },
    onBack: () => { sfx.click(); showChoices(then); },
    onReject: () => {
      const r = runLogic.skipChoice(run);
      writeSave(save);
      if (r.ok && r.bolts) popups.show(`+${fmtN(r.bolts)} 🔩`, 'good');
      showChoices(then);
    },
  });
}

function gotItem(res) {
  const d = itemById(res.itemId);
  sfx.buy();
  platform.haptic('success');
  if (d) popups.show(`${d.icon} ${d.name}${res.replaced ? ' (ersetzt)' : ''}`, 'big');
  reportRunEvents(res.events);
}

function openInventory() {
  const run = save.run;
  if (!run) return;
  const v = runLogic.inventoryView(run);
  itemSheet.openInventory({ inventory: run.inventory, slots: v.slots, counts: v.counts, tagBoost: v.tagBoost, napped: -1 });
}

function later(fn) {
  setTimeout(() => { if (state === 'results') fn(); }, FX.resultDelay * 1000);
}

// ---------- Run ----------
function startRun() {
  const lo = buildLoadout(save);
  if (!save.garage.ownedChassis.includes(lo.chassis.id)) return;
  save.run = runLogic.newRun(save);
  markMilestone(save, 'firstRunStart');
  writeSave(save);
  openMap();
}

function openMap() {
  const run = save.run;
  if (!run) { openGarage(); return; }
  if (run.over) { finishRun(); return; }
  state = 'map';
  stage = null;
  paused = false;
  input.captureKeys = false;
  garage.closePicker(true);
  garage.show(false);
  results.show(false);
  hud.show(false);
  runScreens.hide();
  menus.showPause(false);
  hideFlags();
  rain.setActive(false);
  setBiomeScene(run.biome);
  const lo = runLogic.runLoadout(run, save);
  setVehicle(lo.chassis.id, partIds(lo));
  mapScreen.render(run);
  mapScreen.show(true);
  particles.clear();
  popups.clear();
  const G = CAMERA.garage;
  camRig.snap(REST.x, REST.y - G.widthPortrait, G.widthPortrait);
  // offene Item-Auswahl (z. B. nach einem Neustart der App), danach ein noch offener Sonderknoten (Fortsetzen im Shop)
  const shopOpen = () => run.current && !isStageType(run.current.type);
  if (runLogic.pendingChoice(run)) showChoices(() => { runScreens.hide(); mapScreen.render(run); if (shopOpen()) openShop(); });
  else if (shopOpen()) openShop();
}

// Knoten auf der Karte gewählt
function selectNode(id) {
  const run = save.run;
  if (!run) return;
  const node = mapNode(run.map, id);
  if (!node) return;
  sfx.click();
  if (isStageType(runLogic.nodeKind(run, node))) {
    // Intro (Knoten wird erst mit LOS betreten)
    const sp = runLogic.stageSpecFor(run, node);
    runScreens.intro({ spec: sp, node, attempts: run.current ? run.current.attempts : 0, durability: run.durability, durabilityMax: runLogic.durabilityMax(run) }, {
      onGo: () => {
        const e = runLogic.enterNode(run, id);
        if (!e.ok) { popups.show('Dieser Knoten ist gerade nicht erreichbar', 'info'); return; }
        writeSave(save);
        sfx.launch(0.4);
        startRunStage();
      },
      onBack: () => { sfx.click(); runScreens.hide(); },
    });
    return;
  }
  const e = runLogic.enterNode(run, id);
  if (!e.ok) return;
  writeSave(save);
  reportRunEvents(e.events);
  openShop();
}

// ---------- Sonderknoten (shops/*.js, Oberfläche ui/shops.js) ----------
// Alle Shops liegen als Overlay über der Karte (state 'map'); ihr Zustand steht in run.current.shop (wird gespeichert).
const SHOP_KINDS = ['dealer', 'workbench', 'blackmarket', 'event', 'treasure', 'station', 'pick'];
function openShop(keep = false) {
  const run = save.run;
  if (!run || !run.current) { openMap(); return; }
  const t = run.current.type;
  if (isStageType(t)) { selectNode(run.current.node); return; }
  if (t === 'dealer') shopDealer(keep);
  else if (t === 'workbench') shopWorkbench(keep);
  else if (t === 'blackmarket') shopBlackMarket(keep);
  else if (t === 'event') shopEvent();
  else if (t === 'treasure') shopTreasure();
  else if (t === 'station') shopStation();
}

// Sonderknoten verlassen → Karte (offene Item-Auswahlen kommen dort zuerst)
function leaveShop() {
  const run = save.run;
  if (!run) return;
  runLogic.leaveNode(run);
  writeSave(save);
  sfx.click();
  runScreens.hide();
  openMap();
}

// Rückmeldung nach einer Shop-Aktion; true = hat geklappt
function shopFeedback(res, okText = null, kind = 'good') {
  if (!res.ok) {
    sfx.denied();
    platform.haptic('light');
    const t = { bolts: 'Nicht genug Schrauben 🔩', full: 'Kein Platz frei', used: 'Pro Besuch nur eine Fusion', pay: 'So kannst du gerade nicht bezahlen', tier: 'Gleiche ★ nötig', maxed: 'Schon ★3', sameTags: 'Gleiche Tags – kein Hybrid möglich', hp: 'Zu wenig Haltbarkeit', fuel: 'Zu wenig Treibstoff', item: 'Kein Fundstück dabei' }[res.reason];
    popups.show(t || 'Nicht möglich', 'info');
    return false;
  }
  writeSave(save);
  if (okText) popups.show(okText, kind);
  if (save.run) mapScreen.render(save.run);
  return true;
}

// Voller Rucksack beim Kauf: Platz zum Ersetzen wählen
function pickReplace(itemId, onPick, onBack) {
  const run = save.run;
  shopScreens.pickSlot({ title: '🎒 Rucksack voll', text: `Welches Item soll <b>${(itemById(itemId) || {}).name}</b> Platz machen?`, inventory: run.inventory, label: 'Ersetzen', item: itemId }, { onPick, onBack });
}

function shopDealer(keep = false) {
  const run = save.run;
  const v = Dealer.dealerView(run);
  shopScreens.dealer(v, run, {
    onBuy: (i) => {
      const buy = (replace = null) => {
        const r = Dealer.buyOffer(run, save, i, replace);
        if (!r.ok && r.reason === 'full') { sfx.click(); pickReplace(v.offers[i].itemId, (slot) => buy(slot), () => shopDealer(true)); return; }
        if (shopFeedback(r)) { gotItem(r); }
        shopDealer(true);
      };
      buy();
    },
    onAbility: () => {
      if (!v.ability || v.ability.sold) return;
      if (run.bolts < v.ability.price) { shopFeedback({ ok: false, reason: 'bolts' }); return; }
      sfx.click();
      shopScreens.pickAbility({ abilities: run.abilities, slots: v.abilitySlots, newId: v.ability.id }, {
        onPick: (slot) => {
          const r = Dealer.buyAbility(run, slot);
          if (shopFeedback(r, `${abilityById(v.ability.id).icon} ${abilityById(v.ability.id).name} in Slot ${slot + 1}`)) { sfx.buy(); platform.haptic('success'); }
          shopDealer(true);
        },
        onBack: () => { sfx.click(); shopDealer(true); },
      });
    },
    onReroll: () => {
      const r = Dealer.reroll(run);
      if (shopFeedback(r, `↻ Neu gewürfelt (−${fmtN(r.cost)} 🔩)`, 'info')) sfx.money();
      shopDealer(false);
    },
    onReserve: (i) => {
      const r = Dealer.toggleReserve(run, i);
      if (!r.ok && r.reason === 'full') { sfx.denied(); popups.show('Kein Reservieren-Platz frei (Forschung: +1)', 'info'); return; }
      if (shopFeedback(r, r.reserved ? '📌 Für den nächsten Händler reserviert' : 'Reservierung gelöst', 'info')) sfx.click();
      shopDealer(true);
    },
    onLeave: () => leaveShop(),
    onInventory: () => { sfx.click(); openInventory(); },
  }, keep);
}

function shopWorkbench(keep = false) {
  const run = save.run;
  const d = { inventory: run.inventory, options: Workbench.fusionOptions(run), fusionsLeft: Workbench.fusionsLeft(run), scrap: run.inventory.map((e) => Workbench.scrapValue(run, e)), bolts: run.bolts };
  shopScreens.workbench(d, {
    onFuse: (a, b, kind) => {
      const r = kind === 'tier' ? Workbench.fuseItems(run, save, a, b) : Workbench.hybridize(run, save, a, b);
      if (shopFeedback(r, kind === 'tier' ? `★ ${itemById(r.entry.itemId).name} → ★${r.entry.tier}` : `🧬 Hybrid: ${r.entry && r.entry.name}`, 'big')) {
        sfx.buy(); platform.haptic('success'); emitFx('sparkle', REST.x, REST.y + 1);
      }
      shopWorkbench(true);
    },
    onScrap: async (i) => {
      const e = run.inventory[i];
      const yes = await confirmDialog(uiRoot, `${itemById(e.itemId).name} zerlegen? Das Item ist danach weg (+${fmtN(Workbench.scrapValue(run, e))} 🔩).`, 'Zerlegen');
      if (!yes || !save.run) return;
      const r = Workbench.scrapItem(run, i);
      if (shopFeedback(r, `🔩 +${fmtN(r.bolts)} Schrauben`)) sfx.money();
      shopWorkbench(true);
    },
    onLeave: () => leaveShop(),
  }, keep);
}

function shopBlackMarket(keep = false) {
  const run = save.run;
  const st = BlackMarket.openBlackMarket(run);
  const d = { offers: st.offers, pay: BlackMarket.payOptions(run, save), cursed: BlackMarket.cursedSlots(run), removeCost: BlackMarket.removeCurseCost(run), inventory: run.inventory, bolts: run.bolts, cores: save.meta.cores };
  shopScreens.blackMarket(d, run, {
    onBuy: (i, pay) => {
      const buy = (replace = null) => {
        const r = BlackMarket.buyCursed(run, save, i, pay, replace);
        if (!r.ok && r.reason === 'full') { sfx.click(); pickReplace(st.offers[i].itemId, (slot) => buy(slot), () => shopBlackMarket(true)); return; }
        if (shopFeedback(r)) gotItem(r);
        shopBlackMarket(true);
      };
      buy();
    },
    onRemoveCurse: (slot) => {
      const r = BlackMarket.removeCurse(run, slot);
      if (shopFeedback(r, '✨ Fluch entfernt – die Stärken bleiben')) { sfx.buy(); platform.haptic('success'); }
      shopBlackMarket(true);
    },
    onLeave: () => leaveShop(),
  }, keep);
}

function shopEvent() {
  const run = save.run;
  const v = TextEvent.eventView(run);
  if (!v) { openShop(); return; }
  const after = (r) => {
    if (!r.ok) { shopFeedback(r); shopEvent(); return; }
    writeSave(save);
    const good = r.result.log.filter((l) => l.good === true).length, bad = r.result.log.filter((l) => l.good === false).length;
    if (good >= bad) { sfx.buy(); platform.haptic('success'); } else { sfx.crash(); platform.haptic('heavy'); }
    mapScreen.render(run);
    shopEvent();
  };
  shopScreens.event(v, {
    onOption: (i) => {
      const o = v.options[i];
      if (o.chooseItem) {
        sfx.click();
        shopScreens.pickSlot({ title: 'Welches Fundstück gibst du ab?', inventory: run.inventory, label: 'Abgeben' }, {
          onPick: (slot) => after(TextEvent.chooseOption(run, save, i, { slot })),
          onBack: () => { sfx.click(); shopEvent(); },
        });
        return;
      }
      after(TextEvent.chooseOption(run, save, i));
    },
    onPending: () => {
      const p = v.pending[0];
      const up = p.kind === 'upgradeItem';
      shopScreens.pickSlot({ title: up ? '★ Welches Fundstück steigt auf?' : '🗑️ Welches Fundstück gibst du ab?', inventory: run.inventory, label: up ? '★ +1' : 'Abgeben', allowed: (i) => !up || (run.inventory[i].tier || 1) < 3 }, {
        onPick: (slot) => {
          const r = TextEvent.resolvePending(run, save, slot);
          if (shopFeedback(r)) sfx.buy();
          shopEvent();
        },
      });
    },
    onContinue: () => {
      sfx.click();
      if (v.elite && run.current && isStageType(run.current.type)) {
        // Elite-Etappe direkt aus dem Ereignis: erst offene Auswahlen, dann Intro
        showChoices(() => { runScreens.hide(); selectNode(run.current.node); });
        return;
      }
      leaveShop();
    },
  });
}

function shopTreasure() {
  const run = save.run;
  const st = Treasure.openTreasure(run);
  shopScreens.treasure(st, run, {
    onTake: () => {
      const r = Treasure.takeTreasure(run, save);
      if (!r.ok) { shopFeedback(r); return; }
      writeSave(save);
      if (st.hook) { sfx.crash(); platform.haptic('heavy'); } else { sfx.buy(); platform.haptic('success'); }
      mapScreen.render(run);
      shopTreasure();
    },
    onLeave: () => { Treasure.leaveTreasure(run); writeSave(save); sfx.click(); runScreens.hide(); openMap(); },
    onContinue: () => leaveShop(),
  });
}

function shopStation() {
  const run = save.run;
  runScreens.station(GasStation.stationOptions(run), { durability: run.durability, durabilityMax: runLogic.durabilityMax(run) }, {
    onChoose: (choice) => {
      const r = GasStation.chooseStation(run, choice);
      if (!r.ok) return;
      sfx.buy();
      platform.haptic('success');
      writeSave(save);
      popups.show(choice === 'repair' ? `Repariert +${fmtN(r.healed)} 🔧` : choice === 'fuel' ? 'Tank vergrößert ⛽' : 'Kühler gespült ❄', 'good');
      openMap();
    },
  });
}

// Run beenden → Auszahlung → Run-Ende-Bildschirm
function finishRun() {
  if (!save.run) { openGarage(); return; }
  const res = runLogic.endRun(save, save.run);
  writeSave(save);
  state = 'runEnd';
  stage = null;
  paused = false;
  input.captureKeys = false;
  platform.keepAwake(false);
  hud.show(false);
  mapScreen.show(false);
  results.show(false);
  menus.showPause(false);
  if (res.won) sfx.record(); else sfx.crash();
  runScreens.runEnd(res, { onGarage: () => { sfx.click(); openGarage(); } });
}

async function giveUpRun() {
  if (!save.run) return;
  const yes = await confirmDialog(uiRoot, 'Run wirklich aufgeben? Gesammelter Schrott und Blaupausen werden trotzdem ausgezahlt.', 'Aufgeben');
  if (!yes || !save.run) return;
  if (stage) { stage.phase = 'over'; stage = null; }
  runLogic.giveUp(save.run);
  finishRun();
}

function openGarage() {
  state = 'garage';
  stage = null;
  paused = false;
  input.captureKeys = false;
  results.show(false);
  hud.show(false);
  mapScreen.show(false);
  runScreens.hide();
  menus.showPause(false);
  hideFlags();
  rain.setActive(false);
  setBiomeScene(save.run ? save.run.biome : BIOMES[0].id);
  vehicleFromSave();
  if (carModel.userData.setScrap) carModel.userData.setScrap(0);
  garage.viewId = save.garage.chassis;
  garage.render(save, garageInfo());
  garage.show(true);
  particles.clear();
  popups.clear();
  const G = CAMERA.garage;
  camRig.snap(REST.x, REST.y - G.widthPortrait, G.widthPortrait);
}

function hideFlags() { for (const m in flags) flags[m].visible = false; }

function pauseGame() {
  if (state !== 'stage' || paused) return;
  paused = true;
  input.captureKeys = false;
  input.reset();
  menus.showPause(true, mode);
  sfx.loop({ active: false });
}

function resumeGame() {
  paused = false;
  menus.showPause(false);
  menus.closeSettings();
  input.reset();
  input.captureKeys = state === 'stage';
}

// Pause → „Run aufgeben“ bzw. „Testfahrt beenden“
function quitStage() {
  if (mode === 'run' && save.run) { giveUpRun(); return; }
  menus.showPause(false);
  paused = false;
  if (!stage || stage.phase === 'aim') { openGarage(); return; }
  stage.finish('stop');
}

// ---------- Dev-Menü: Run-Werkzeuge ----------
// Etappe überspringen: läuft eine Run-Etappe, endet sie mit der gewünschten Distanz; auf der Karte wird der
// erste erreichbare Knoten genommen (Tankstelle → Reparieren, Platzhalter → besucht).
function devSkip(medal) {
  const run = save.run;
  if (!run) return 'Kein Run aktiv';
  const distFor = (sp) => (medal === 'miss' ? Math.round(sp.target * 0.6) : sp.medals[medal] ?? sp.medals.gold);
  if (state === 'stage' && stage && mode === 'run' && stage.phase !== 'over') {
    menus.closeSettings();
    if (paused) resumeGame();
    if (stage.phase === 'aim') stage.launchNow(0.3);
    stage.vehicle.maxX = distFor(stage.spec);
    stage.finish('stop');
    return `Etappe beendet (${medal})`;
  }
  if (state !== 'map' && state !== 'garage') return 'Nur auf der Karte oder in einer Etappe';
  runScreens.hide();
  const reach = runLogic.reachableNodes(run);
  const node = reach.find((n) => isStageType(n.type)) || reach[0];
  if (!node) return 'Kein Knoten erreichbar';
  const e = runLogic.enterNode(run, node.id);
  if (!e.ok) return `Knoten nicht betretbar (${e.reason})`;
  if (e.kind === 'station') { GasStation.chooseStation(run, 'repair'); writeSave(save); openMap(); return 'Tankstelle: Reparieren'; }
  if (e.kind !== 'stage') { runLogic.leaveNode(run); writeSave(save); openMap(); return `${node.type}: verlassen`; }
  const dist = distFor(e.spec);
  const md = medalFor(dist, e.spec.medals);
  const r = {
    reason: 'stop', cleared: !!md, medal: md, dist, target: e.spec.target, medals: e.spec.medals, medalList: e.spec.medalList, kind: e.spec.kind,
    height: 0, tricks: 0, bolts: 0, scrap: 0, blueprints: 0, crates: 0, damageTaken: 0, durability: run.durability,
    durabilityMax: runLogic.durabilityMax(run), stunts: { flips: 0, loops: 0 }, time: 0, biome: e.spec.biome,
  };
  mapScreen.show(false);
  garage.show(false);
  showRunResult(r);
  return `Etappe übersprungen (${md || 'verfehlt'})`;
}

function devToBoss() {
  const run = save.run;
  if (!run) return 'Kein Run aktiv';
  runLogic.devJumpToBoss(run);
  writeSave(save);
  if (state === 'map') openMap();
  return 'Position vor dem Boss';
}

function devNextAct() {
  const run = save.run;
  if (!run) return 'Kein Run aktiv';
  if (!runLogic.devNextAct(run)) return 'Schon im letzten Akt';
  writeSave(save);
  if (state === 'map') openMap();
  return `Akt ${run.act}: ${biomeById(run.biome).name}`;
}

function devAddItem(id) {
  const run = save.run;
  if (!run) return 'Kein Run aktiv';
  const res = runLogic.devAddItem(run, save, id);
  writeSave(save);
  if (state === 'map') mapScreen.render(run);
  const d = itemById(id);
  return res.ok ? `${d.icon} ${d.name} hinzugefügt (${run.inventory.length} Items${state === 'stage' ? ', wirkt ab der nächsten Etappe' : ''})` : `Nicht möglich (${res.reason})`;
}

function devTierUp(slot) {
  const run = save.run;
  if (!run) return 'Kein Run aktiv';
  if (!runLogic.devTierUp(run, slot)) return 'Kein Item auf diesem Platz oder schon ★3';
  writeSave(save);
  if (state === 'map') mapScreen.render(run);
  const e = run.inventory[slot];
  return `${itemById(e.itemId).name} → ★${e.tier}`;
}

function devAllPool() {
  const pools = itemPools();
  save.research.done = [...new Set([...save.research.done, ...pools])];
  if (save.run) { save.run.poolAll = true; save.run.research = [...new Set([...(save.run.research || []), ...pools])]; }
  writeSave(save);
  return `${pools.length} Item-Pools freigeschaltet – alle Items können angeboten werden`;
}

// Dev: alle gerade wählbaren Knoten bekommen den Typ `type` (Rauchtest: jeden Knotentyp einmal besuchen)
function devForceNode(type) {
  const run = save.run;
  if (!run) return 'Kein Run aktiv';
  if (run.current) return 'Erst den laufenden Knoten abschließen';
  const reach = runLogic.reachableNodes(run);
  if (!reach.length || reach[0].type === 'boss') return 'Nächster Knoten ist der Boss';
  for (const n of reach) n.type = type;
  writeSave(save);
  if (state === 'map') { runScreens.hide(); mapScreen.render(run); }
  return `${reach.length} Knoten → ${type}`;
}

function devSetDurability(n) {
  const run = save.run;
  if (!run || !isFinite(n)) return 'Kein Run aktiv';
  runLogic.devSetDurability(run, n);
  writeSave(save);
  if (state === 'map') mapScreen.render(run);
  return `Haltbarkeit = ${Math.round(run.durability)}`;
}

platform.onPauseResume(
  () => { pauseGame(); sfx.suspend(); writeSave(save); },
  () => { sfx.resume(); },
);

// Android-Zurück-Taste: schließt immer die oberste Ebene
let exitAsked = false;
platform.onBackButton(async () => {
  const modal = uiRoot.querySelector('.modal');
  if (modal) { (modal.querySelector('.btn-secondary') || modal.querySelector('.btn-primary'))?.click(); return; }
  if (devMenu.isOpen) { devMenu.close(); return; }
  if (itemSheet.isOpen) { itemSheet.close(); return; }
  if (runScreens.open && runScreens.kind === 'replace') { runScreens.card.querySelector('[data-a=back]')?.click(); return; }
  if (runScreens.open && runScreens.kind === 'choice') return;   // Auswahl nur über die Knöpfe beenden
  if (runScreens.open && runScreens.kind === 'pick') { runScreens.card.querySelector('[data-a=back]')?.click(); return; }
  if (runScreens.open && SHOP_KINDS.includes(runScreens.kind)) return;   // Shops nur über „Weiter“ verlassen
  if (menus.settingsOpen) { menus.closeSettings(); return; }
  if (state === 'garage' && garage.pickerOpen) { garage.closePicker(); return; }
  if (state === 'garage' && garage.tab !== 'garage') { garage.setTab('garage'); return; }
  if (state === 'stage') { paused ? resumeGame() : pauseGame(); return; }
  if (state === 'map' && runScreens.kind === 'intro') { runScreens.hide(); return; }
  if (state === 'map') { openGarage(); return; }
  if (state === 'results' || state === 'runEnd') {
    const b = (runScreens.open && runScreens.card.querySelector('.btn-primary')) || (!results.el.classList.contains('hidden') && results.el.querySelector('[data-id=garage]'));
    if (b) b.click();
    return;
  }
  if (exitAsked) return;
  exitAsked = true;
  const yes = await confirmDialog(uiRoot, 'Spiel beenden?', 'Beenden');
  exitAsked = false;
  if (yes) { writeSave(save); platform.exitApp(); }
});
platform.markNative();

// Ton darf erst nach der ersten Berührung starten
window.addEventListener('pointerdown', () => sfx.unlock(), { capture: true });
window.addEventListener('keydown', () => sfx.unlock(), { capture: true });

// ---------- Darstellungs-Helfer ----------
// Bodenkontakt am Hang: Winkel aus den Bodenhöhen unter Vorder- und Hinterachse, Höhe = Sehne + rideHeight
// senkrecht dazu (die Physik rechnet mit einem Punkt; ohne das sinken die Räder an Hängen und Knicken ein).
function groundPose(x, out) {
  const d = carModel.userData.axleHalf;
  const hF = track.heightAt(x + d), hR = track.heightAt(x - d);
  const ang = Math.atan2(hF - hR, 2 * d);
  out.angle = ang;
  out.y = (hF + hR) / 2 + PHYSICS.rideHeight / Math.cos(ang);
}

// Garagen-Kamera: Breite und Lage so, dass das ganze Modell (auch hohe Aufbauten) in der Vorschau-Fläche
// sitzt – berechnet aus der tatsächlichen Lage von .g-preview (inkl. Statusleisten-Abstand der App).
// Die Radunterkante bleibt an einer festen Stelle, nur zu hohe Modelle werden kleiner gezeigt.
const fitOut = { w: 0, ndcY: 0 };
function garageFit(aspect, portrait) {
  const G = CAMERA.garage;
  const top = carModel.userData.top, bot = PHYSICS.rideHeight;
  if (portrait) {
    const pv = garage.previewNdc();
    let hh = G.widthPortrait / aspect / 2;
    if (!pv) { fitOut.w = G.widthPortrait; fitOut.ndcY = G.carNdcY; return fitOut; }
    const span = Math.max(G.fitMinSpan, pv.top - pv.bottom - 2 * G.fitPad);
    hh = Math.max(hh, (top + bot) / span);
    fitOut.w = hh * 2 * aspect;
    fitOut.ndcY = pv.bottom + G.fitPad + bot / hh;
    return fitOut;
  }
  let hh = G.widthLandscape / aspect / 2;
  hh = Math.max(hh, top / Math.max(G.fitMinSpan, G.topNdcLandscape - G.carNdcYLandscape));
  fitOut.w = hh * 2 * aspect;
  fitOut.ndcY = G.carNdcYLandscape;
  return fitOut;
}

// ---------- Hauptschleife ----------
let last = performance.now();
let saveTimer = 0;
const carPos = { x: 0, y: 0, angle: 0, back: 2 };
const camTarget = { x: 0, y: 0, vx: 0, vy: 0, groundY: 0, aspect: 1, fovDeg: CAMERA.fovDeg, alt: 0 };
const frameView = { x: 0, y: 0, width: 0, k: 0, aspect: 1, fovDeg: CAMERA.fovDeg, car: null };
const hudView = { tilt: 0, indicator: null };
const flashRng = makeRng('blitz-aufleuchten');

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(STAGE.maxFrameDt, Math.max(0, (now - last) / 1000));
  last = now;
  const t = now / 1000;

  // Spielzeit mitzählen (nur sichtbar und nicht pausiert), regelmäßig sichern
  if (!document.hidden && !paused) {
    addPlaytime(save, dt);
    saveTimer += dt;
    if (saveTimer > SAVE.autosaveEvery) { saveTimer = 0; writeSave(save); }
  }

  const playing = state === 'stage' && stage && !paused;
  if (playing) stage.update(dt, input);
  const vdt = paused ? 0 : dt * (stage && state === 'stage' ? stage.timeScale : 1);

  // Fahrzeug-Position (absolute Koordinaten); in der Garage steht es auf dem Hügel und der Aufbau wippt leicht
  const v = stage ? stage.vehicle : null;
  carPos.x = REST.x;
  carPos.y = track.heightAt(REST.x) + PHYSICS.rideHeight;
  carPos.angle = 0;
  carPos.back = carModel.userData.rear;
  const bob = v ? 0 : (1 + Math.sin(t * FX.idleBob.freq)) * FX.idleBob.amp;
  carModel.userData.upper.position.y = bob / carModel.scale.y;   // nur der Aufbau, die Räder bleiben am Boden
  if (v) {
    carPos.x = v.x; carPos.y = v.y; carPos.angle = v.angle;
    if (v.onGround) groundPose(v.x, carPos);
  }

  // Kamera-Logik (ohne three) → Floating Origin → THREE-Kamera
  const aspect = view.camera.aspect;
  if (!stage) {
    // Garage/Karte: Fahrzeug groß in der Vorschau-Fläche (Querformat: links), dreht sich langsam
    const G = CAMERA.garage;
    const portrait = aspect < 1;
    const fit = garageFit(aspect, portrait);
    const w = fit.w;
    const h = w / aspect;
    frameView.x = REST.x - (portrait ? 0 : G.carNdcXLandscape) * (w / 2);
    frameView.y = carPos.y - fit.ndcY * (h / 2);
    frameView.width = w;
    frameView.k = G.k;
    frameView.aspect = aspect;
    frameView.car = null;
    cam = camRig.frame(dt, frameView);
    garageSpin += dt * G.spin;
  } else if (stage.phase === 'aim') {
    const A = CAMERA.aim;
    frameView.x = REST.x + A.offsetX;
    frameView.y = REST.y + A.offsetY;
    frameView.width = A.width;
    frameView.k = A.k;
    frameView.aspect = aspect;
    frameView.car = carPos;
    cam = camRig.frame(dt, frameView);
  } else {
    camTarget.x = v.x;
    camTarget.y = v.y;
    camTarget.vx = v.vx;
    camTarget.vy = v.vy;
    camTarget.groundY = track.heightAt(v.x);
    camTarget.alt = Math.max(0, stage.altitude);
    camTarget.aspect = aspect;
    cam = camRig.update(dt, camTarget);
  }
  origin.update(cam.lookX);
  const ox = origin.x;
  const lm = CAMERA.shake.lookMul;
  view.camera.position.set(cam.x - ox + cam.shakeX, cam.y + cam.shakeY, cam.dist);
  view.camera.lookAt(cam.lookX - ox + cam.shakeX * lm, cam.lookY + cam.shakeY * lm, 0);

  // Fahrzeug, Schleuder, Flaggen (Render-Koordinaten = absolut - origin.x)
  carModel.position.set(carPos.x - ox, carPos.y, 0);
  carModel.rotation.z = carPos.angle;
  carModel.rotation.y = stage ? 0 : garageSpin;
  const spin = v ? v.wheelSpin : t * FX.garageWheelSpin;
  for (const w of carModel.userData.wheels) w.rotation.z = -spin;
  const spinning = !v || v.boosting || v.driving;
  for (const s of carModel.userData.spinners) if (spinning) s.mesh.rotation.x += s.speed * Math.max(vdt, dt * FX.idleSpinnerMul);
  if (stage && carModel.userData.setScrap) carModel.userData.setScrap(stage.scrapPickups);
  const attached = !!stage && stage.phase === 'aim';
  sling.root.visible = !!stage;   // in der Garage steht das Fahrzeug frei (Schleuder würde die Vorschau verdecken)
  sling.setOrigin(ox);
  sling.update(Math.max(vdt, 0.001), carPos, attached);
  for (const m in flags) {
    const f = flags[m];
    if (f.visible) f.position.set(f.userData.x - ox, f.userData.y, MF.z);
  }

  // Boost-Flamme, Antriebs-Rauch, Dampf bei Hitze und Staub
  if (v && playing && stage.phase === 'fly') {
    const ca = v.angle, c = Math.cos(ca), s = Math.sin(ca);
    const ex = carModel.userData.exhaust;
    const px = v.x + c * ex.x - s * ex.y, py = v.y + s * ex.x + c * ex.y;
    if (v.boosting) {
      flameOpts.dir = ca + Math.PI;
      flameOpts.vx = v.vx * BF.inherit;
      flameOpts.vy = v.vy * BF.inherit;
      particles.emit(px, py, flameOpts);
    } else if (v.driving && Math.random() < DS.chance) {
      smokeOpts.dir = ca + Math.PI * DS.dirOffset;
      smokeOpts.vx = v.vx * DS.inherit;
      smokeOpts.vy = v.vy * DS.inherit;
      particles.emit(px, py, smokeOpts);
    }
    if ((v.stall > 0 || v.heatFrac > ST.heatFrac) && Math.random() < ST.chance) particles.emit(v.x, v.y + ST.dy, ST);
    if (v.onGround && Math.abs(v.s) > GD.minSpeed && Math.random() < GD.chance) {
      groundDustOpts.colors = track.frictionAt(v.x) > 2 ? pal.mud : pal.dirt;
      particles.emit(v.x + GD.dx, v.y + GD.dy, groundDustOpts);
    }
  }
  // Wind sichtbar machen: feine Sandkörner/Staub ziehen durchs Bild (Windzonen: mehr und heller)
  if (playing && Math.abs(stage.env.wind) > WD.minWind && Math.random() < Math.abs(stage.env.wind) * (stage.inWind ? FX.windStreak.chancePerWind : WD.chancePerWind)) {
    if (windOpts.pal !== pal) { windOpts.pal = pal; windOpts.colors = [pal.skyBottom, '#ffffff', pal.grass[0]]; }
    windOpts.vx = stage.env.wind * WD.windMul;
    windOpts.size = WD.sizeBase + cam.width * WD.sizePerWidth;
    particles.emit(cam.lookX + (Math.random() - 0.5) * cam.width * WD.spreadX, cam.lookY + (Math.random() - 0.5) * cam.height, windOpts);
  }
  particles.update(vdt, ox);

  // Gewitter: zufälliges Aufleuchten im Hintergrund, Blitz-Einschläge (emitFx) leuchten stärker
  if (pal.storm && state === 'stage' && !paused) {
    flashTimer -= dt;
    if (flashTimer <= 0) {
      flashTimer = flashRng.range(FX.flash.every[0], FX.flash.every[1]);
      flashLevel = Math.max(flashLevel, FX.flash.ambient * flashRng.range(0.5, 1));
    }
  }
  flashLevel = Math.max(0, flashLevel - dt * FX.flash.decay * Math.max(0.2, flashLevel));
  view.flash(flashLevel);

  // Flugkurven-Vorschau
  let nTraj = 0;
  if (stage && stage.phase === 'aim') {
    const n = Math.min(stage.previewPath(), TR.max);
    const pts = stage.previewPts;
    for (let i = 0; i < n; i++) {
      _o.position.set(pts[i].x - ox, pts[i].y, 0);
      _o.scale.setScalar(1 - i / (n + TR.shrinkPad));
      _o.updateMatrix();
      traj.setMatrixAt(nTraj++, _o.matrix);
    }
  }
  traj.count = nTraj;
  traj.instanceMatrix.needsUpdate = true;

  // Welt um die Kamera herum
  trackView.update(cam.lookX, ox);
  background.update(cam.lookX, cam.lookY, ox);
  objectsView.update(stage ? stage.objects : null, cam.lookX, t, ox);
  featuresView.update(stage ? stage.objects : null, t, ox);
  rain.update(vdt, cam, stage ? stage.env.wind : 0, ox);
  view.followSun(carPos.x - ox, carPos.y);
  view.setFog(cam.dist);

  // HUD und Sound
  if (state === 'stage' && stage) {
    hudView.tilt = input.tilt;
    hudView.indicator = cam.indicator;
    hud.update(stage, hudView);
    if (stage.phase === 'fly' && save.tutorial.runs < CONTROLS.tutorialRuns) {
      flyHintTimer += dt;
      hud.showFlyHint(flyHintTimer < CONTROLS.flyHintTime);
    }
  }
  sfx.loop({
    active: !!(v && playing && stage.phase === 'fly'),
    speed: v ? v.speed : 0,
    boosting: v ? v.boosting : false,
    air: v ? !v.onGround : false,
  });

  view.renderer.render(view.scene, view.camera);
}

applySettings();
openGarage();
requestAnimationFrame(frame);
reportLoadIssue();

// Spielstand ließ sich nicht laden → Hinweis. Der Rohtext liegt im Backup (Einstellungen → „Backup anzeigen“).
// Stammt er aus einer neueren Version, wird erst gespeichert, wenn die Person „Neu anfangen“ bestätigt.
async function reportLoadIssue() {
  const issue = getLoadIssue();
  if (!issue) return;
  if (issue.kind === 'newer') {
    const yes = await confirmDialog(uiRoot, 'Dein Spielstand stammt aus einer neueren Spielversion und kann hier nicht geladen werden. Er bleibt unverändert gespeichert. Hier neu anfangen? (Der alte Stand liegt dann im Backup.)', 'Neu anfangen');
    if (yes) { allowOverwrite(); writeSave(save); popups.show('Neuer Spielstand – der alte liegt im Backup', 'info'); }
    else popups.show('Es wird nichts gespeichert, bis du neu anfängst', 'info');
  } else {
    await infoDialog(uiRoot, 'Dein Spielstand war beschädigt und konnte nicht geladen werden. Der Rohtext ist gesichert (Einstellungen → „Backup anzeigen“). Es geht mit einem neuen Spielstand weiter.');
  }
}

// Für Tests (Playwright-Rauchtest) und die Browser-Konsole
window.__game = {
  get stage() { return stage; },
  get state() { return state; },
  get mode() { return mode; },
  get paused() { return paused; },
  get save() { return save; },
  get run() { return save.run; },
  get track() { return track; },
  get biome() { return biome; },
  get origin() { return origin.x; },
  get camera() { return cam; },
  get model() { return carModel; },
  input,
  garage,
  devMenu,
  mapScreen,
  runScreens,
  startRun,
  openMap,
  openGarage,
  startTestDrive,
  devSkip,
  devToBoss,
  devNextAct,
  devSetDurability,
  devAddItem,
  devAllPool,
  devForceNode,
  openShop,
  runLogic,
  researchLogic,
  shops: { Dealer, Workbench, BlackMarket, GasStation, TextEvent, Treasure },
  hud,
  itemSheet,
  setChainLog,
  reachable: () => (save.run ? runLogic.reachableNodes(save.run).map((n) => ({ id: n.id, type: n.type, floor: n.floor })) : []),
  loadout: () => buildLoadout(save),
  abilityById,
  // Bildschirmposition des Autos in CSS-Pixeln (echte THREE-Projektion des gerenderten Bildes)
  carScreen() {
    view.camera.updateMatrixWorld();
    _v.copy(carModel.position).project(view.camera);
    return {
      x: ((_v.x + 1) / 2) * window.innerWidth,
      y: ((1 - _v.y) / 2) * window.innerHeight,
      ndcX: _v.x,
      ndcY: _v.y,
    };
  },
};
