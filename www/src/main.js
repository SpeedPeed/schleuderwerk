import * as THREE from 'three';
import { BIOMES, biomeById } from './data/biomes.js';
import { FX, CAMERA, STAGE, PHYSICS, SAVE, RESOURCES, MAP } from './data/balance.js';
import * as BALANCE from './data/balance.js';
import { PARTS, abilityById, chassisById, chassisVisual, partById } from './data/index.js';
import { TAGS } from './data/tags.js';
import { loadSave, writeSave, exportSave, importSave, clearSave, defaultSave, getLoadIssue, allowOverwrite, getBackup } from './save/save.js';
import { buildLoadout, partIds } from './garage/loadout.js';
import * as garageLogic from './garage/garage.js';
import { addPlaytime, markMilestone, checkAllChassis, selectAscension, devUnlockAscension, ascensionState } from './garage/progression.js';
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
import { RunScreens, introBannerHtml } from './ui/runScreens.js';
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
import { Tutorial, TutorialView, tutorialProgress, resetTutorial, TUTORIAL_ORDER } from './ui/tutorial.js';
import { backAction } from './ui/backButton.js';
import { TXT } from './data/texts.js';
import { activeRecipes } from './items/recipes.js';
import { goalUnit } from './stage/goals.js';
import { FxOverlay } from './ui/fxOverlay.js';
import { applyInputMode, inputMode } from './ui/inputMode.js';
import { KeyNav } from './ui/keyNav.js';

// ---------- Grundaufbau ----------
let save = loadSave();
const canvas = document.getElementById('game');
const uiRoot = document.getElementById('ui');
// PC (Maus/Tastatur) oder Handy: Hinweise und Beschriftungen passend (html.kbd); muss vor dem Aufbau der Oberfläche stehen
applyInputMode(window, () => { if (state === 'garage') refreshGarage(); });
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
// Ziel-Flaggen: Bronze (= Ziel), Silber, Gold – Paket A: dazu Platin und Schrottkönig (Überweite)
const MF = FX.medalFlags;
const flags = {};
const FLAG_MEDALS = ['bronze', 'silver', 'gold', 'platin', 'king'];
for (const m of FLAG_MEDALS) {
  flags[m] = buildFlag(MF.colors[m]);
  flags[m].visible = false;
  view.scene.add(flags[m]);
}

const FLAG_LIST = Object.values(flags);

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
let flyPhaseT = -1;          // Sekunden seit dem Abschuss (-1 = noch nicht abgeschossen) – Tutorial-Hinweise im Flug
let cam = null;
let garageSpin = CAMERA.garage.startAngle;
let flashLevel = 0, flashTimer = 3;

// ---------- Oberfläche ----------
const fxOverlay = new FxOverlay(uiRoot);
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
// Paket B: Medaillen werden gestempelt (Stempel + Fanfare), Zählwerk = Ratsche, Währung fliegt zum Zähler
const runScreens = new RunScreens(uiRoot, {
  onTick: (kind, i) => { if (kind === 'medal') { sfx.stamp(); sfx.medal(i); platform.haptic('light'); } else sfx.ratchet(); },
  onFly: (from, to, ic) => fxOverlay.fly(from, to, ic, 3, () => sfx.screwDrop()),
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
  onSetting: (k, v, persist = true) => { save.settings[k] = v; applySettings(); if (persist) writeSave(save); },
  getTutorial: () => tutorialProgress(save),
  onTutorialReset: () => { resetTutorial(save); writeSave(save); },
  onExport: () => exportSave(save),
  onImport: (text) => {
    try {
      save = importSave(text);
      tutorial.clear();
      allowOverwrite();
      writeSave(save);
      afterSaveChange();
      setTimeout(reportMigration, 0);   // SW3-Texte: Umbau der Stufen erklären
      return null;
    } catch (e) {
      return e.message || 'Unbekannter Fehler';
    }
  },
  onReset: () => {
    clearSave();
    save = defaultSave();
    writeSave(save);
    tutorial.clear();
    afterSaveChange();
  },
  onDevMenu: () => { sfx.perfect(); devMenu.open(); },
  getBackup: () => getBackup(),
});
// Tutorial: Hinweise an den richtigen Momenten des ersten Runs (ui/tutorial.js), jeder nur einmal
const tutorialView = new TutorialView(uiRoot, { onOk: () => { sfx.click(); tutorial.close(); }, onSkip: () => { sfx.click(); tutorial.skipAll(); popups.show('Hinweise aus – in den Einstellungen wieder einschaltbar', 'info'); } });
// Paket A: Etappen-Hinweise (Sprechblasen) nur beim Zielen – nie im Flug über dem HUD
const tutorial = new Tutorial({
  getSave: () => save, persist: () => writeSave(save), view: tutorialView, onShow: () => sfx.tutorial(),
  allow: (step) => step.mode !== 'toast' || (state === 'stage' && !!stage && stage.phase === 'aim' && !paused),
});

const devMenu = new DevMenu(uiRoot, {
  getSave: () => save,
  getStage: () => stage,
  onCurrency: (kind, n) => {
    if (kind === 'bolts') { if (!save.run) return 'Kein Run aktiv'; save.run.bolts += n; writeSave(save); refreshGarage(); return `+${n} Schrauben (Run)`; }
    save.meta[kind] += n; writeSave(save); refreshGarage(); return null;
  },
  onTutorial: (what) => {
    if (what === 'reset') { resetTutorial(save); writeSave(save); return 'Tutorial zurückgesetzt – Hinweise erscheinen wieder'; }
    tutorial.skipAll();
    return 'Alle Hinweise aus';
  },
  getTutorial: () => tutorialProgress(save),
  onPerf: (on) => setPerfOverlay(on),
  getPerf: () => perfStats(),
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
  onAscension: () => { const n = devUnlockAscension(save); writeSave(save); refreshGarage(); return `Schrottstufen bis ${n} wählbar (Garage, über dem Start-Knopf)`; },
});

function applySettings() {
  const st = save.settings;
  sfx.setEnabled(st.sound);
  sfx.setVolumes(st.sfxVol, st.musicVol);
  platform.vibration = st.vibration;
  view.setShadows(st.shadows);
  view.setQuality(st.quality);
  fxOverlay.enabled = st.shake;
  if (stage) stage.slowmoEnabled = st.slowmo;
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
    selectAscension: (s, lv) => ({ ok: true, level: selectAscension(s, lv) }),
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
  if (name === 'buyChassis') { markMilestone(save, 'firstChassisUnlocked'); checkAllChassis(save); }
  if (name === 'buyPaint') markMilestone(save, 'firstPaint');
  writeSave(save);
  if (name === 'selectAscension') { sfx.click(); garage.render(save, garageInfo()); return res; }
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
  // Paket B: bezahlter Schrott fliegt vom Zähler zur Schublade
  if (name === 'upgradePart' || name === 'buyPart') fxOverlay.fly(document.querySelector('#garage .b-scrap'), args[1] || document.querySelector(`#garage .slot-row[data-slot="${(partById(args[0]) || {}).slot}"]`), 'schrott', 3);
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
  sfx.research();
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
      fxOverlay.flash('explosion');
      sfx.explosion();
      break;
    case 'overheat':
      particles.emit(x, y + 0.6, PFX.overheat);
      fxOverlay.flash('crash');
      break;
    case 'landPerfect':
      particles.emit(x, y + 0.2, PFX.landPerfect);
      fxOverlay.flash('perfectLanding');
      break;
    case 'landClean':
      particles.emit(x, y + 0.2, PFX.landClean);
      break;
    case 'victory':
      particles.emit(x, y + 1, PFX.victory);
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
      if (o.type === 'car') fxOverlay.flash('crash');
      const cols = o.type === 'scrap' ? pal.wreck : s.colors[o.type] || [carVisual.color, carVisual.accent, '#cccccc'];
      particles.emit(x, y, { ...s, colors: cols });
      break;
    }
    case 'sparkle':
      particles.emit(x, y, PFX.sparkle);
      break;
    case 'shock':
      particles.emit(x, y, PFX.shock);
      particles.emit(x, y, PFX.shock);
      fxOverlay.flash('shock');
      break;
    case 'medal': {
      // Gold: doppelt so viel Konfetti
      medalOpts.colors[0] = MF.colors[o.medal] || '#ffd23f';
      medalOpts.n = PFX.confetti.n * (o.medal === 'gold' ? 2 : 1);
      particles.emit(x, y + 1, medalOpts);
      fxOverlay.flash('medal');
      break;
    }
    case 'lightning':
      flashLevel = Math.max(flashLevel, FX.flash.strike);
      particles.emit(x, y + 0.5, PFX.strike);
      break;
  }
}

// Wiederverwendete Partikel-Einstellungen (keine neuen Objekte pro Effekt)
const medalOpts = { ...PFX.confetti, colors: ['#ffd23f', '#ffffff', '#ff8a3d'] };
const TB = PFX.tagBurst, CHN = PFX.chain;
const tagOpts = { n: TB.n, colors: ['#ffffff', '#ffffff'], speed: TB.speed, life: TB.life, gravity: TB.gravity, size: TB.size, jitter: TB.jitter, zSpread: TB.zSpread };
const chainOpts = { n: CHN.nBase, colors: CHN.colors, speed: CHN.speedBase, life: CHN.life, gravity: CHN.gravity, size: CHN.size, jitter: CHN.jitter, zSpread: CHN.zSpread };
const tagCache = new Map();   // Quelle (uid) → Tag-Id oder ''
function tagOfSource(src) {
  let t = tagCache.get(src.uid);
  if (t === undefined) {
    const def = src.kind === 'item' ? itemById(src.id) : src.kind === 'part' ? partById(src.id) : null;
    t = src.tag || (def && (def.tags ? def.tags[0] : def.tag)) || '';
    tagCache.set(src.uid, t);
  }
  return t;
}
const lastBurst = new Map();  // Quelle → Zeit der letzten Funken (gegen Partikel-Flut)
// Item/Set/Teil ausgelöst: Funken in der Tag-Farbe am Fahrzeug, Tag-Klang (höher mit der Kettentiefe)
function itemJuice(src, depth) {
  const v = stage && stage.vehicle;
  if (!v) return;
  const tag = tagOfSource(src);
  sfx.tag(tag, depth);
  const now = performance.now() / 1000;
  if (now - (lastBurst.get(src.uid) || -1) < FX.tagBurstGap) return;
  lastBurst.set(src.uid, now);
  const c = (TAGS[tag] && TAGS[tag].color) || '#ffffff';
  tagOpts.colors[0] = c;
  tagOpts.n = Math.min(TB.nMax, TB.n + depth * TB.nPerDepth);
  tagOpts.speed = TB.speed + depth * TB.speedPerDepth;
  particles.emit(v.x, v.y, tagOpts);
}
// Kettenreaktion: Funkenring wächst mit der Kettenlänge, Bildschirm blitzt (n = Kettenglieder)
function chainJuice(n) {
  const v = stage && stage.vehicle;
  if (v) {
    chainOpts.n = Math.min(CHN.nMax, CHN.nBase + n * CHN.nPerLink);
    chainOpts.speed = CHN.speedBase + n * CHN.speedPerLink;
    particles.emit(v.x, v.y, chainOpts);
  }
  fxOverlay.flash('chain', n);
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
  triggered: (src, depth, info) => { hud.itemTriggered(src, depth, info); if (!info || !info.recharge) itemJuice(src, depth); },
  // hud.chain() meldet false, wenn dieselbe Kette gerade schon gezeigt wurde (ITEMS.chainPopupGap)
  chain: (n, info) => { if (hud.chain(n, info)) { sfx.chain(n); chainJuice(n); platform.haptic('light'); } },
  // Paket A: Abschuss → Run-Knoten wird erst jetzt betreten (vorher: zurück zur Karte ohne Kosten)
  launched: () => onLaunched(),
  knapp: () => { sfx.denied(); platform.haptic('medium'); },
};

// ---------- Etappe ----------
// Gemeinsamer Start einer Etappe (Run oder Testfahrt)
// Paket A: banner (Intro über der Zielansicht) und scrap (Schrott-Zähler des Runs) gehen an das HUD
function beginStage(newSpec, loadout, { seed, durability, runMods, inventory = null, runInfo = null, farEnd = true, banner = null, scrap = null } = {}) {
  setVehicle(loadout.chassis.id, partIds(loadout));
  carModel.rotation.y = 0;
  setTrack(newSpec, biomeById(newSpec.biome));
  stage = new Stage({ biome, spec, track, loadout, seed, hooks, durability, runMods, inventory, runInfo, farEnd });
  stage.slowmoEnabled = save.settings.slowmo;
  flyPhaseT = -1;
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
  fxOverlay.reset();
  fxOverlay.veil();
  if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur();
  hud.show(true, {
    boostSlot: input.boostSlot,
    weather: stage.weather,
    abilities: stage.abilities.slots.map((s) => s.def),
    goal: { target: stage.goalMedals.bronze, medals: stage.goalMedals, medalList: stage.medalList, type: stage.goal.type, unit: goalUnit(stage.goal), timeLimit: stage.goal.timeLimit || 0, distMedals: stage.medals },
    items: inventory ? { inventory, napped: stage.nappedSlot } : null,
    banner, scrap,
  });
  if (stage.nappedSlot >= 0 && inventory) {
    const e = inventory[stage.nappedSlot];
    const d = e && itemById(e.itemId);
    if (d) popups.show(`🐈‍⬛ ${d.icon} ${d.name} schläft diese Etappe`, 'info');
  }
  for (const m of FLAG_MEDALS) {
    const x = stage.medalList.includes(m) || ((m === 'platin' || m === 'king') && farEnd) ? stage.medals[m] : undefined;
    flags[m].visible = x !== undefined;
    flags[m].userData.x = x;
    if (x !== undefined) flags[m].userData.y = track.refHeightAt(x);
  }
  platform.keepAwake(true);
  // Boss-Strecke: „BOSS“-Einblendung und Musik-Schleife (Platzhalter aus der Erkennungsmelodie)
  if (stage.boss) {
    fxOverlay.bossBanner(stage.boss.icon || '👹', stage.boss.name);
    sfx.startMusic(stage.boss.music);
  } else sfx.stopMusic();
  tutorial.trigger('launch');
  tutorial.trigger('fly');
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

// Etappe eines Run-Knotens starten (Paket A: ohne Intro-Bildschirm – das Intro ist ein Banner über der Zielansicht).
// Der Knoten wird erst beim Abschuss betreten (onLaunched); bis dahin führt „◀ Karte“/Zurück ohne Kosten zur Karte.
// Neuversuch (Knoten schon offen): neue Strecke (run/runState.js → stageSpecFor), neuer Abschuss.
let pendingNode = null;
function startRunStage(nodeId = null) {
  const run = save.run;
  if (!run) return;
  const id = nodeId || (run.current && run.current.node);
  const node = id && mapNode(run.map, id);
  if (!node) return;
  const entered = !!run.current && run.current.node === id;
  const sp = runLogic.stageSpecFor(run, node);
  mode = 'run';
  pendingNode = entered ? null : id;
  const attempts = entered ? run.current.attempts : 0;
  const su = runLogic.runStageSetup(run, save);
  const firstBoss = sp.kind === 'boss' && save.meta.milestones[`firstBossAct${run.act}`] === undefined;
  const banner = {
    html: introBannerHtml({
      spec: sp, node, attempts, durability: run.durability, durabilityMax: runLogic.durabilityMax(run), ascension: run.ascension || 0,
      towPct: runLogic.towPenaltyPct(run), firstBoss, twin: sp.kind === 'boss' && !!run.bossTwin, back: !entered,
    }),
    onBack: () => stageBackToMap(),
  };
  beginStage(sp, su.loadout, {
    seed: hashSeed(`${run.seed}:${node.id}:${attempts}`), durability: run.durability, runMods: run.runMods, inventory: su.inventory, runInfo: su.runInfo,
    banner, scrap: { total: save.meta.scrap, act: run.act, kind: sp.kind },
  });
}

// Abschuss einer Run-Etappe: Knoten jetzt betreten (Ereignis nodeEnter). Ändert das die Haltbarkeit/Schrauben (Items mit
// nodeEnter), übernimmt die Etappe die neuen Werte – vor dem ersten Physik-Schritt, also wie ein anderer Startwert.
function onLaunched() {
  hud.setBanner(null);
  tutorial.holdToasts();
  const run = save.run;
  if (mode !== 'run' || !run || !pendingNode || !stage) return;
  const id = pendingNode;
  pendingNode = null;
  const e = runLogic.enterNode(run, id);
  if (!e.ok) return;
  writeSave(save);
  reportRunEvents(e.events);
  const v = stage.vehicle;
  const dur = Math.max(0, Math.min(run.durability, stage.stats.durabilityMax));
  if (dur !== v.durability) { v.durability = dur; stage.startDurability = dur; if (stage.initArgs) stage.initArgs.durability = dur; }
  if (stage.runInfo && stage.runInfo.bolts !== run.bolts) { stage.runBolts = run.bolts; if (stage.initArgs && stage.initArgs.runInfo) stage.initArgs.runInfo.bolts = run.bolts; }
}

// Zielansicht (noch nicht abgeschossen) → zurück zur Karte, ohne den Knoten zu betreten
function stageBackToMap() {
  if (state !== 'stage' || !stage || stage.phase !== 'aim' || !pendingNode) return false;
  sfx.click();
  pendingNode = null;
  stage = null;
  openMap({ auto: false });
  return true;
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
  tutorial.dropToasts();
  fxOverlay.heat(0);
  sfx.stopMusic();
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

// Ergebnis in den Run übernehmen und anzeigen. Paket A: Belohnung ist sofort gutgeschrieben (HUD-Zähler), Ergebnis
// und Item-Auswahl liegen auf EINEM Bildschirm (Nehmen = weiter), verfehlt = Notlandung oder Nochmal.
function showRunResult(r) {
  const run = save.run;
  if (!run) { openGarage(); return; }
  state = 'results';
  const o = runLogic.applyStageResult(run, r, save);
  writeSave(save);
  if (o.credited && (o.credited.scrap || o.credited.blueprints)) {
    hud.setScrap(save.meta.scrap, 0);
    sfx.money();
  }
  later(() => {
    hud.show(false);
    if (o.cleared) { sfx.record(); platform.haptic('success'); }
    else if (!o.defeat) sfx.denied();
    reportRunEvents(o.events);
    const extra = () => ({ durability: run.durability, durabilityMax: runLogic.durabilityMax(run), towPct: runLogic.towPenaltyPct(run) });
    const after = () => afterStage(o, r);
    const present = () => {
      const ch = !o.defeat && !o.missed && !o.towed ? runLogic.pendingChoice(run) : null;
      const info = { inventory: run.inventory, parts: run.parts, slots: runLogic.itemSlots(run), remaining: run.pendingChoices.length };
      runScreens.stageResult(r, o, extra(), {
        choice: ch, info,
        onNext: () => { sfx.click(); after(); },
        onPick: (i) => {
          const res = runLogic.pickItem(run, save, i);
          if (!res.ok && res.reason === 'full') { sfx.click(); showReplace(ch, i, () => showChoices(after)); return; }
          if (res.ok) gotItem(res);
          writeSave(save);
          showChoices(after);
        },
        onSkip: () => {
          const sk = runLogic.skipChoice(run);
          writeSave(save);
          sfx.screwDrop();
          if (sk.ok && sk.bolts) popups.show(`+${fmtN(sk.bolts)} 🔩`, 'good');
          showChoices(after);
        },
        onInventory: () => { sfx.click(); openInventory(); },
        onLand: () => {
          sfx.click();
          const res = runLogic.resolveMiss(run, 'land');
          writeSave(save);
          if (res.ok) { popups.show(`🛬 Notlandung −${fmtN(res.penalty)} 🔧`, 'bad'); if (res.bolts) popups.show(`📦 Trostkiste +${fmtN(res.bolts)} 🔩`, 'good'); }
          if (res.defeat || run.over) { finishRun(); return; }
          continueMap();
        },
        onRetry: () => {
          sfx.click();
          if (o.missed) {
            const res = runLogic.resolveMiss(run, 'retry');
            writeSave(save);
            if (res.ok) popups.show(`↻ Nochmal −${fmtN(res.penalty)} 🔧 – neue Strecke`, 'info');
            if (res.defeat || run.over) { finishRun(); return; }
          }
          startRunStage();
        },
        onMap: () => { sfx.click(); openMap({ auto: false }); },
        onEnd: () => { sfx.click(); finishRun(); },
      });
      if (ch) tutorial.trigger('items');
    };
    present();
  }, r.instant ? 0.15 : 1);
}

// Nach Ergebnis und Item-Auswahl: Sieg → Run-Ende, Zwillingsboss → gleich weiter, Akt-Übergang, sonst Karte (automatisch
// weiter, wenn es nur einen Weg gibt)
function afterStage(o, r) {
  const run = save.run;
  if (!run) { openGarage(); return; }
  if (o.won || run.over) { finishRun(); return; }
  // Schrottstufe 15: nach der Boss-Beute sofort der Zwillingsboss
  if (o.secondBoss && run.current) { startRunStage(run.current.node); return; }
  if (o.nextAct) { runScreens.actTransition({ act: run.act, biome: run.biome, prevBiome: r.biome }, { onNext: () => { sfx.click(); continueMap(); } }); return; }
  continueMap();
}

// Karte öffnen und – wenn es genau einen nächsten Knoten gibt – nach MAP.autoAdvanceDelay automatisch dorthin
function continueMap() {
  openMap({ auto: true });
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
      sfx.screwDrop();
      if (r.ok && r.bolts) popups.show(`+${fmtN(r.bolts)} 🔩`, 'good');
      showChoices(then);
    },
    onInventory: () => { sfx.click(); openInventory(); },
  });
  tutorial.trigger('items');
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
  sfx.tapeTear();   // Karteikarte vom Klemmbrett gerissen
  sfx.buy();
  platform.haptic('success');
  const run = save.run;
  if (d && res.upgraded) popups.show(`${d.icon} ${TXT.synergy.upgraded(d.name, run.inventory[res.slot].tier)}`, 'big');
  else if (d) popups.show(`${d.icon} ${d.name}${res.replaced ? ' (ersetzt)' : ''}`, 'big');
  // Paket C: Rezept vervollständigt (das neue Item gehört zu einem jetzt aktiven Rezept)
  if (d && !res.upgraded && run) {
    for (const r of activeRecipes(run.inventory)) if (r.items.includes(d.id)) { popups.show(`${r.icon} Rezept: ${r.name}!`, 'big'); sfx.fusion(); }
  }
  reportRunEvents(res.events);
}

function openInventory() {
  const run = save.run;
  if (!run) return;
  const v = runLogic.inventoryView(run);
  itemSheet.openInventory({ inventory: run.inventory, slots: v.slots, counts: v.counts, tagBoost: v.tagBoost, recipes: v.recipes, napped: -1 });
}

// mul: Faktor auf FX.resultDelay (Sofort-Ende: fast keine Pause – das Ergebnis steht ja schon fest)
function later(fn, mul = 1) {
  setTimeout(() => { if (state === 'results') fn(); }, FX.resultDelay * 1000 * mul);
}

// ---------- Run ----------
function startRun() {
  const lo = buildLoadout(save);
  if (!save.garage.ownedChassis.includes(lo.chassis.id)) return;
  save.run = runLogic.newRun(save, { blueprint: true });   // Paket C: Bauplan-Start (erste Auswahl beim Öffnen der Karte)
  markMilestone(save, 'firstRunStart');
  writeSave(save);
  openMap();
}

let autoTimer = null;
function openMap({ auto = false } = {}) {
  const run = save.run;
  if (!run) { openGarage(); return; }
  if (run.over) { finishRun(); return; }
  clearTimeout(autoTimer);
  state = 'map';
  stage = null;
  pendingNode = null;
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
  // PC: ersten erreichbaren Knoten markieren (Pfeiltasten wählen, Enter betritt)
  const focusMap = () => { if (inputMode.kbd) requestAnimationFrame(() => { if (state === 'map' && !runScreens.open) keyNav.autoFocus('.mnode.reach'); }); };
  focusMap();
  particles.clear();
  popups.clear();
  tutorial.dropToasts();
  fxOverlay.reset();
  sfx.stopMusic();
  const G = CAMERA.garage;
  camRig.snap(REST.x, REST.y - G.widthPortrait, G.widthPortrait);
  // offene Item-Auswahl (z. B. nach einem Neustart der App), danach ein noch offener Sonderknoten (Fortsetzen im Shop)
  const shopOpen = () => run.current && !isStageType(run.current.type);
  if (run.current && run.current.missed) { showMissDecision(); return; }
  if (runLogic.pendingChoice(run)) { showChoices(() => { runScreens.hide(); mapScreen.render(run); if (shopOpen()) openShop(); else { if (!autoAdvance(auto)) tutorial.trigger('map'); focusMap(); } }); return; }
  if (shopOpen()) { openShop(); return; }
  if (!autoAdvance(auto)) tutorial.trigger('map');
}

// Paket A: Hat der aktuelle Knoten nur einen Nachfolger, fährt die Karte nach MAP.autoAdvanceDelay von selbst weiter
// (Etappe → Zielansicht mit Banner, Sonderknoten → öffnet). Ergebnis: true, wenn weitergefahren wird.
function autoAdvance(auto) {
  const run = save.run;
  if (!auto || !run || run.current || run.pos.floor < 0) return false;
  const reach = runLogic.reachableNodes(run);
  if (reach.length !== 1) return false;
  const id = reach[0].id;
  mapScreen.highlight?.(id);
  autoTimer = setTimeout(() => { if (state === 'map' && save.run === run && !run.current && !runScreens.open && !tutorial.isOpen) selectNode(id); }, MAP.autoAdvanceDelay * 1000);
  return true;
}

// Verfehlte Etappe nach einem Neustart der App: Entscheidung Notlandung/Nochmal nachholen
function showMissDecision() {
  const run = save.run;
  const max = runLogic.durabilityMax(run);
  runScreens.missDecision({
    emergency: { penalty: Math.round(max * runLogic.emergencyPenaltyPct(run) * 10) / 10, bolts: runLogic.consolationBolts(run) },
    retry: { penalty: Math.round(max * runLogic.towPenaltyPct(run) * 10) / 10 },
  }, {
    onLand: () => { sfx.click(); const res = runLogic.resolveMiss(run, 'land'); writeSave(save); runScreens.hide(); if (res.defeat || run.over) finishRun(); else continueMap(); },
    onRetry: () => { sfx.click(); const res = runLogic.resolveMiss(run, 'retry'); writeSave(save); runScreens.hide(); if (res.defeat || run.over) finishRun(); else startRunStage(); },
  });
}

// Knoten auf der Karte gewählt
function selectNode(id) {
  const run = save.run;
  if (!run) return;
  const node = mapNode(run.map, id);
  if (!node) return;
  sfx.click();
  clearTimeout(autoTimer);
  if (run.current && run.current.missed) { showMissDecision(); return; }
  if (isStageType(runLogic.nodeKind(run, node))) {
    // Paket A: direkt in die Zielansicht (Intro als Banner); der Knoten wird erst beim Abschuss betreten
    if (!run.current && !runLogic.canEnter(run, id)) { popups.show('Dieser Knoten ist gerade nicht erreichbar', 'info'); return; }
    startRunStage(id);
    return;
  }
  const e = runLogic.enterNode(run, id);
  if (!e.ok) return;
  writeSave(save);
  reportRunEvents(e.events);
  sfx.shopEnter();
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
  continueMap();
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
      if (shopFeedback(r, `↻ Neu gewürfelt (−${fmtN(r.cost)} 🔩)`, 'info')) sfx.reroll();
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
        sfx.fusion(); platform.haptic('success'); emitFx('sparkle', REST.x, REST.y + 1); fxOverlay.flash('medal');
      }
      shopWorkbench(true);
    },
    onScrap: async (i) => {
      const e = run.inventory[i];
      const yes = await confirmDialog(uiRoot, `${itemById(e.itemId).name} zerlegen? Das Item ist danach weg (+${fmtN(Workbench.scrapValue(run, e))} 🔩).`, 'Zerlegen');
      if (!yes || !save.run) return;
      const row = document.querySelector(`#runui .irow[data-slot="${i}"]`);
      const from = row ? row.getBoundingClientRect() : null;
      const r = Workbench.scrapItem(run, i);
      if (shopFeedback(r, `🔩 +${fmtN(r.bolts)} Schrauben`)) sfx.sell();
      shopWorkbench(true);
      // Paket B: die Schrauben fliegen in die Dose (Zähler oben)
      if (r.ok && from) fxOverlay.fly(from, document.querySelector('#runui .sh-bar .b-bolt'), 'schraube', 4, () => sfx.screwDrop());
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
  const v = TextEvent.eventView(run, save);
  if (!v) { openShop(); return; }
  const after = (r) => {
    if (!r.ok) { shopFeedback(r); shopEvent(); return; }
    runLogic.settleRun(run, save);   // Paket A: Schrott/Blaupausen/Kerne aus dem Ereignis sofort gutschreiben
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
  tutorial.dropToasts();
  fxOverlay.reset();
  sfx.stopMusic();
  if (res.won) {
    sfx.victory();
    fxOverlay.confettiBurst();
    emitFx('victory', carPos.x, carPos.y);
    platform.haptic('success');
  } else sfx.defeat();
  runScreens.runEnd(res, { onGarage: () => { sfx.click(); openGarage(); } });
}

async function giveUpRun() {
  if (!save.run) return;
  const yes = await confirmDialog(uiRoot, TXT.dialog.giveUp, TXT.dialog.giveUpYes);
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
  tutorial.dropToasts();
  fxOverlay.reset();
  sfx.stopMusic();
  const G = CAMERA.garage;
  camRig.snap(REST.x, REST.y - G.widthPortrait, G.widthPortrait);
  // erster Besuch: Garage erklären; nach dem ersten Run: das Labor
  tutorial.trigger(save.stats.runs >= 1 ? 'lab' : 'garage');
}

function hideFlags() { for (const m in flags) flags[m].visible = false; }

function pauseGame() {
  if (state !== 'stage' || paused) return;
  paused = true;
  input.captureKeys = false;
  input.reset();
  tutorial.dropToasts();   // Etappen-Hinweis nicht über Pause-Menü/Tastenübersicht liegen lassen
  menus.showPause(true, mode);
  sfx.loop(false);
  sfx.pauseMusic(true);
}

function resumeGame() {
  paused = false;
  menus.showPause(false);
  menus.closeSettings();
  input.reset();
  input.captureKeys = state === 'stage';
  sfx.pauseMusic(false);
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
    // Paket D: Etappen-Arten – auch den Wert des Ziels setzen (Höhe, Trickpunkte, Pickups)
    const gm = stage.goalMedals, gv = medal === 'miss' ? Math.round(gm.bronze * 0.6) : gm[medal] ?? gm.gold;
    if (stage.goal.type === 'height') stage.maxAlt = gv;
    else if (stage.goal.type === 'stunt') stage.tricks = gv;
    else if (stage.goal.type === 'collect') stage.pickupTotal = gv;
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
  const g = e.spec.goal && e.spec.goal.medals ? e.spec.goal : null;
  const r = {
    goal: g ? { type: g.type, value: medal === 'miss' ? Math.round(g.medals.bronze * 0.6) : g.medals[medal] ?? g.medals.gold, medals: { ...g.medals } } : null,
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

// Android-Zurück-Taste (am PC: Esc): schließt immer die oberste Ebene. Die Entscheidung trifft ui/backButton.js.
function backSnapshot() {
  const rk = runScreens.open ? runScreens.kind : null;
  return {
    modal: !!uiRoot.querySelector('.modal'),
    // ein Etappen-Hinweis (Toast) liegt unter der Tastenübersicht → Esc schließt zuerst die Übersicht
    tutorial: tutorial.isOpen && !(menus.keysOpen && tutorialView.mode === 'toast'),
    keys: menus.keysOpen,
    devMenu: devMenu.isOpen,
    itemSheet: itemSheet.isOpen,
    settings: menus.settingsOpen,
    state,
    paused,
    run: rk,
    runHasCont: !!(rk && runScreens.card.querySelector('[data-a=cont]')),
    runHasBack: !!(rk && runScreens.card.querySelector('[data-a=back]')),
    runHasPick: !!(rk && runScreens.card.querySelector('[data-pick]')),
    aimBack: state === 'stage' && !paused && !!stage && stage.phase === 'aim' && !!pendingNode,
    pickerOpen: state === 'garage' && garage.pickerOpen,
    tab: garage.tab,
    testResults: state === 'results' && !results.el.classList.contains('hidden'),
  };
}
let exitAsked = false;
async function handleBack() {
  const a = backAction(backSnapshot());
  const click = (sel) => { const b = runScreens.card.querySelector(sel); if (b) b.click(); };
  switch (a) {
    case 'closeModal': { const m = uiRoot.querySelector('.modal'); (m.querySelector('.btn-secondary') || m.querySelector('.btn-primary'))?.click(); break; }
    case 'closeTutorial': tutorial.close(); break;
    case 'closeKeys': menus.closeKeys(); break;
    case 'closeDev': devMenu.close(); break;
    case 'closeItemSheet': itemSheet.close(); break;
    case 'closeSettings': menus.closeSettings(); break;
    case 'runBack': click('[data-a=back]'); break;
    case 'runContinue': click('[data-a=cont]'); break;
    case 'askLeaveShop': {
      const kind = runScreens.kind;
      const yes = await confirmDialog(uiRoot, kind === 'treasure' ? TXT.dialog.leaveTreasure : TXT.dialog.leaveShop, kind === 'treasure' ? TXT.dialog.leaveTreasureYes : TXT.dialog.leaveShopYes);
      if (yes && runScreens.open && runScreens.kind === kind) click('[data-a=leave]');
      break;
    }
    case 'choiceHint': popups.show(TXT.hints.choice, 'info'); break;
    case 'shopHint': popups.show(TXT.hints.shop, 'info'); break;
    case 'introBack': click('[data-a=back]'); break;
    case 'stageBack': stageBackToMap(); break;
    case 'runPrimary': runScreens.card.querySelector('.btn-row .btn-primary')?.click(); break;
    case 'closePicker': garage.closePicker(); break;
    case 'garageTab': garage.setTab('garage'); break;
    case 'pause': pauseGame(); break;
    case 'resume': resumeGame(); break;
    case 'mapToGarage': sfx.click(); openGarage(); break;
    case 'testResultsGarage': results.el.querySelector('[data-id=garage]')?.click(); break;
    case 'exitAsk': {
      if (exitAsked) break;
      exitAsked = true;
      const yes = await confirmDialog(uiRoot, TXT.dialog.exitGame, TXT.dialog.exitYes);
      exitAsked = false;
      if (yes) { writeSave(save); platform.exitApp(); }
      break;
    }
    default: break;
  }
  return a;
}
platform.onBackButton(() => { handleBack(); });
// Esc am PC wirkt wie die Zurück-Taste (nicht beim Tippen in einem Textfeld)
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.repeat) return;
  const t = e.target;
  if (t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['checkbox', 'range', 'button'].includes(t.type)))) return;
  e.preventDefault();
  handleBack();
});
platform.markNative();

// Tastatur-Bedienung der Menüs (ui/keyNav.js): oberste Ebene, Hauptaktion, Kürzel. In der laufenden Etappe nur P = Pause.
function navSnapshot() {
  const rk = runScreens.open ? runScreens.kind : null;
  return {
    captured: input.captureKeys,
    modal: !!uiRoot.querySelector('.modal'),
    tutorialCard: tutorial.isOpen && tutorialView.mode === 'card',
    keys: menus.keysOpen,
    devMenu: devMenu.isOpen,
    itemSheet: itemSheet.isOpen,
    settings: menus.settingsOpen,
    pause: state === 'stage' && paused && menus.pauseOpen,
    run: rk,
    pickerOpen: state === 'garage' && garage.pickerOpen,
    state,
    testResults: state === 'results' && !results.el.classList.contains('hidden'),
    screen: rk ? `run:${rk}` : `${state}:${garage.tab}:${garage.pickerOpen}`,
  };
}
function navRoot(layer) {
  switch (layer) {
    case 'modal': { const m = uiRoot.querySelectorAll('.modal'); return m[m.length - 1] || null; }
    case 'tutorial': return tutorialView.q.card;
    case 'keys': return menus.keys;
    case 'dev': return devMenu.el;
    case 'itemSheet': return itemSheet.el;
    case 'settings': return menus.settings;
    case 'pause': return menus.pause;
    case 'run': return runScreens.el;
    case 'picker': return garage.q.pick;
    case 'garage': return garage.el;
    case 'map': return mapScreen.el;
    case 'results': return results.el;
    default: return null;
  }
}
const keyNav = new KeyNav({
  snapshot: navSnapshot,
  rootFor: navRoot,
  onAction: (type, arg) => {
    if (type === 'pause') pauseGame();
    else if (type === 'keys') { sfx.click(); menus.openKeys(); }
    else if (type === 'chassis') {
      const b = garage.q[arg < 0 ? 'cprev' : 'cnext'];
      if (b && b.offsetParent !== null) b.click();
    }
  },
});

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
  const t0 = performance.now();
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
  const vdt = paused ? 0 : dt * (stage && state === 'stage' ? stage.playScale : 1);

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
  for (let i = 0; i < FLAG_LIST.length; i++) {
    const f = FLAG_LIST[i];
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
    if (playing && stage.phase === 'aim') tutorial.poke();   // Sprechblasen nur beim Zielen
    if (playing && stage.phase === 'fly') {
      if (flyPhaseT < 0) flyPhaseT = 0;
      flyPhaseT += dt;
      // roter Hitze-Rand: pulsiert bei Überhitzung
      fxOverlay.heat(v.stall > 0 && !stage.rules.noOverheat ? 2 : v.heatFrac >= RESOURCES.heatWarn ? 1 : 0);
    } else if (!playing) fxOverlay.heat(0);
  }
  // Vorspulen: Motor klingt höher (Tempo × Vorspul-Faktor)
  sfx.loop(!!(v && playing && stage.phase === 'fly'), v ? v.speed * (stage.fastForward ? STAGE.fastForward.scale * 0.5 : 1) : 0, v ? v.boosting : false, v ? !v.onGround : false);

  const tUpd = performance.now();
  view.renderer.render(view.scene, view.camera);
  perfSample(t0, tUpd - t0, performance.now() - tUpd);
}

// ---------- Leistungsmessung (Dev-Menü „Leistungsanzeige“, Rauchtest, docs/PHASEN.md) ----------
// Gleitende Mittel: Bildzeit, Logik-Zeit (alles vor dem Rendern), Render-Zeit (Befehle an die GPU), Draw Calls
const perf = { fps: 0, frameMs: 0, updateMs: 0, renderMs: 0, calls: 0, triangles: 0, lastT: 0, el: null, shownAt: 0 };
function perfSample(now, upd, ren) {
  const k = 0.05;
  if (perf.lastT) {
    const fm = now - perf.lastT;
    perf.frameMs += (fm - perf.frameMs) * k;
  }
  perf.lastT = now;
  perf.updateMs += (upd - perf.updateMs) * k;
  perf.renderMs += (ren - perf.renderMs) * k;
  const info = view.renderer.info.render;
  perf.calls = info.calls;
  perf.triangles = info.triangles;
  if (perf.el && now - perf.shownAt > 500) {
    perf.shownAt = now;
    const p = perfStats();
    perf.el.textContent = `${p.fps} fps · ${p.frameMs} ms · Logik ${p.updateMs} ms · Render ${p.renderMs} ms · ${p.calls} Draw Calls · ${p.triangles} Dreiecke · ${p.particles} Partikel · PR ${p.pixelRatio}`;
  }
}
function perfStats() {
  const m = view.renderer.info.memory;
  const r1 = (x) => Math.round(x * 10) / 10;
  return {
    fps: perf.frameMs > 0 ? Math.round(1000 / perf.frameMs) : 0, frameMs: r1(perf.frameMs), updateMs: r1(perf.updateMs), renderMs: r1(perf.renderMs),
    calls: perf.calls, triangles: perf.triangles, geometries: m.geometries, textures: m.textures, programs: view.renderer.info.programs.length,
    particles: particles.count, pixelRatio: view.renderer.getPixelRatio(), quality: view.quality,
  };
}
function setPerfOverlay(on) {
  if (on && !perf.el) { perf.el = document.createElement('div'); perf.el.id = 'perf'; uiRoot.appendChild(perf.el); }
  if (!on && perf.el) { perf.el.remove(); perf.el = null; }
  return on ? 'Leistungsanzeige an (oben)' : 'Leistungsanzeige aus';
}

applySettings();
openGarage();
requestAnimationFrame(frame);
reportLoadIssue();
reportMigration();
// Startbildschirm (index.html) ausblenden, sobald das erste Bild gezeichnet ist
requestAnimationFrame(() => requestAnimationFrame(() => {
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.classList.add('done');
  setTimeout(() => boot.remove(), 600);
}));

// Paket A: Spielstand v3 → v4 umgebaut (Teile-Stufen → Slot-Stufen) → einmal erklären, was passiert ist
function reportMigration() {
  const n = save.migrationNote;
  if (!n) return;
  delete save.migrationNote;
  writeSave(save);
  const any = Object.values(n.slotLevels || {}).some((l) => l > 0);
  if (!any && !n.refund) return;
  infoDialog(uiRoot, `Umbau in der Werkstatt: Stufen gelten jetzt je Slot (0–${BALANCE.GARAGE.maxPartLevel}, doppelte Wirkung je Stufe) – ein Teilwechsel behält die Stufe. Deine Stufen wurden mindestens gleich stark übernommen${n.refund > 0 ? `, zu viel Bezahltes kommt zurück: +${fmtN(n.refund)} ⚙` : ''}.`);
}

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
  get view() { return view; },
  input,
  keyNav,
  inputMode,
  menus,
  tutorial,
  tutorialSteps: TUTORIAL_ORDER.length,
  fxOverlay,
  sfx,
  handleBack,
  backSnapshot,
  perf: perfStats,
  setPerfOverlay,
  applySettings,
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
  selectNode,
  balance: BALANCE,
  devUnlockAscension: () => { const n = devUnlockAscension(save); writeSave(save); refreshGarage(); return n; },
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
