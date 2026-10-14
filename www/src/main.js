import * as THREE from 'three';
import { WORLDS, worldById } from './data/worlds.js';
import { FX, CAMERA, CONTROLS, STAGE, PHYSICS, SAVE } from './data/balance.js';
import { PARTS, abilityById, chassisById, chassisVisual } from './data/index.js';
import { loadSave, writeSave, exportSave, importSave, clearSave, defaultSave, getLoadIssue, allowOverwrite, getBackup } from './save/save.js';
import { buildLoadout, partIds } from './garage/loadout.js';
import * as garageLogic from './garage/garage.js';
import { addPlaytime, markMilestone } from './garage/progression.js';
import { Track } from './physics/track.js';
import { Stage, REST } from './stage/stage.js';
import { CameraRig } from './camera/cameraRig.js';
import { Input } from './platform/input.js';
import { createView } from './render/scene.js';
import { Slingshot, buildFlag } from './render/models.js';
import { buildVehicle } from './render/vehicleModel.js';
import { TrackView } from './render/trackView.js';
import { Background } from './render/background.js';
import { ObjectsView } from './render/objectsView.js';
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
import { confirmDialog, infoDialog } from './ui/dom.js';

// ---------- Grundaufbau ----------
let save = loadSave();
const canvas = document.getElementById('game');
const uiRoot = document.getElementById('ui');
const view = createView(canvas);
const origin = new Origin();

// Aktuelle Strecke/Welt (wird beim Wechsel komplett neu aufgebaut; Welten gibt es bis Phase 3)
let world, pal, track, trackView, background;
function setWorld(id) {
  if (!save.worlds.unlocked.includes(id)) id = 'steppe';
  world = worldById(id);
  pal = world.palette;
  save.worlds.current = world.id;
  if (!save.worlds.records[world.id]) save.worlds.records[world.id] = { bestDist: 0, bestHeight: 0, runs: 0 };
  if (trackView) trackView.dispose();
  if (background) background.dispose();
  view.applyPalette(pal);
  track = new Track(world);
  trackView = new TrackView(view.scene, track, world);
  background = new Background(view.scene, pal);
}
const worldRec = () => save.worlds.records[world.id];
setWorld(save.worlds.current);

const objectsView = new ObjectsView(view.scene);
const particles = new Particles(view.scene, FX.maxParticles);
const sling = new Slingshot(view.scene, track.heightAt(0), REST.y, pal);
const flag = buildFlag();
flag.visible = false;
view.scene.add(flag);
let flagX = 0, flagY = 0;

// ---------- Fahrzeug-Modell (Chassis + sichtbare Teile) ----------
let carModel = null;
let carKey = '';
let carVisual = chassisVisual(chassisById(save.garage.chassis));
function setVehicle(chassisId, parts) {
  const key = `${chassisId}|${Object.values(parts).join(',')}`;
  if (key === carKey && carModel) return;
  const rotY = carModel ? carModel.rotation.y : CAMERA.garage.startAngle;
  if (carModel) {
    view.scene.remove(carModel);
    carModel.userData.dispose();
  }
  carModel = buildVehicle({ chassisId, parts });
  carModel.rotation.y = rotY;
  carVisual = chassisVisual(chassisById(chassisId));
  view.scene.add(carModel);
  carKey = key;
}
function vehicleFromSave(override = null) {
  const lo = buildLoadout(save, override || {});
  setVehicle(lo.chassis.id, partIds(lo));
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

let state = 'garage'; // 'garage' | 'stage' | 'results'
let paused = false;
let stage = null;
let flyHintTimer = 0;
let cam = null;
let garageSpin = CAMERA.garage.startAngle;

// ---------- Oberfläche ----------
const popups = new Popups(uiRoot);
const hud = new Hud(uiRoot, { onPause: () => pauseGame() });
hud.abilityButtons.forEach((b, i) => input.bindButton(b, `ab${i}`));
const garage = new GarageScreen(uiRoot, {
  onAction: (name, ...args) => garageAction(name, ...args),
  onPreview: (ov) => vehicleFromSave(ov),
  onSettings: () => { sfx.click(); menus.openSettings(); },
  onStart: () => { sfx.click(); startStage(); },
  onWorld: (dir) => switchWorld(dir),
  onDenied: (t) => { sfx.denied(); popups.show(t, 'info'); },
});
const results = new Results(uiRoot, {
  onGarage: () => { sfx.click(); openGarage(); },
  onAgain: () => { sfx.click(); startStage(); },
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
  onGiftParts: () => { garageLogic.giftAllParts(save); writeSave(save); refreshGarage(); },
  onUnlockWorlds: () => {
    for (const w of WORLDS) if (!save.worlds.unlocked.includes(w.id)) save.worlds.unlocked.push(w.id);
    writeSave(save);
    refreshGarage();
  },
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
});

function applySettings() {
  sfx.setEnabled(save.settings.sound);
  platform.vibration = save.settings.vibration;
  view.setShadows(save.settings.shadows);
}

function afterSaveChange() {
  applySettings();
  setWorld(save.worlds.current);
  vehicleFromSave();
  if (state === 'garage') openGarage();
  else refreshGarage();
}

function garageInfo() {
  const i = WORLDS.findIndex((w) => w.id === world.id);
  const next = WORLDS[i + 1];
  const nextLocked = !!next && !save.worlds.unlocked.includes(next.id);
  return {
    worldName: world.name,
    worldIndex: i,
    worldCount: save.worlds.unlocked.length > 1 || nextLocked ? WORLDS.length : 1,
    prevOk: i > 0,
    nextOk: !!next,
    nextLocked,
    nextName: next ? next.name : '',
    nextText: next ? unlockText(next) : '',
    factor: world.scrapFactor || 1,
  };
}

function refreshGarage() {
  if (state === 'garage') garage.render(save, garageInfo());
}

// Weltauswahl in der Garage (dir = -1 / +1)
function switchWorld(dir) {
  const i = WORLDS.findIndex((w) => w.id === world.id);
  const next = WORLDS[i + dir];
  if (!next) return;
  if (!save.worlds.unlocked.includes(next.id)) {
    sfx.denied();
    popups.show(`🔒 ${next.name}: ${unlockText(next)}`, 'info');
    return;
  }
  sfx.click();
  setWorld(next.id);
  writeSave(save);
  openGarage();
}

function unlockText(w) {
  if (!w.unlock) return '';
  const from = worldById(w.unlock.world);
  const have = (save.worlds.records[from.id] || {}).bestDist || 0;
  return `${fmtN(w.unlock.dist)}\u00a0m in „${from.name}“ (Rekord ${fmtN(have)}\u00a0m)`;
}
const fmtN = (n) => Math.round(n).toLocaleString('de-DE');

// ---------- Garage-Aktionen ----------
const DENIED = {
  scrap: 'Nicht genug Schrott ⚙',
  cores: 'Nicht genug Kerne 💠',
  research: 'Erst im Labor erforschen (kommt bald)',
  locked: 'Noch nicht freigeschaltet',
  maxed: 'Höchste Stufe erreicht',
};
function garageAction(name, ...args) {
  const fn = {
    buyPart: garageLogic.buyPart,
    upgradePart: garageLogic.upgradePart,
    equipPart: garageLogic.equipPart,
    buyChassis: garageLogic.buyChassis,
    selectChassis: garageLogic.selectChassis,
    setAbility: (s, i, id) => garageLogic.setAbility(s, i, id, buildLoadout(s).slots.abilities),
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
  writeSave(save);
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
};

// ---------- Spielablauf ----------
function startStage() {
  const loadout = buildLoadout(save);
  if (!save.garage.ownedChassis.includes(loadout.chassis.id)) return;
  garage.closePicker(true);
  setVehicle(loadout.chassis.id, partIds(loadout));
  carModel.rotation.y = 0;
  stage = new Stage({ world, track, loadout, seed: (Math.random() * 2 ** 31) | 0, hooks });
  state = 'stage';
  paused = false;
  input.reset();
  input.captureKeys = true;
  input.boostSlot = Math.max(0, stage.abilities.boostSlot);
  particles.clear();
  popups.clear();
  garage.show(false);
  results.show(false);
  menus.showPause(false);
  hud.show(true, {
    best: worldRec().bestDist,
    tutorial: save.tutorial.runs < CONTROLS.tutorialRuns,
    weather: stage.weather,
    abilities: stage.abilities.slots.map((s) => s.def),
  });
  const bd = worldRec().bestDist;
  flag.visible = bd > FX.flag.minDist;
  flagX = bd;
  flagY = track.heightAt(bd);
  flyHintTimer = 0;
  platform.keepAwake(true);
}

function endStage(r) {
  const s = save.stats;
  const wr = worldRec();
  const newDist = r.dist > wr.bestDist && wr.runs > 0;
  const newHeight = r.height > wr.bestHeight && wr.runs > 0;
  save.meta.scrap += r.scrap;
  s.totalScrap += r.scrap;
  s.totalBolts += r.bolts;
  s.testDrives++;
  wr.runs++;
  wr.bestDist = Math.max(wr.bestDist, r.dist);
  wr.bestHeight = Math.max(wr.bestHeight, r.height);
  s.bestDist = Math.max(s.bestDist, r.dist);
  s.bestHeight = Math.max(s.bestHeight, r.height);
  s.bestTricks = Math.max(s.bestTricks, r.tricks);
  markMilestone(save, 'firstTestDrive');
  // Neue Strecken freischalten? (Welten bis Phase 3)
  const unlockedNow = [];
  for (const w of WORLDS) {
    if (save.worlds.unlocked.includes(w.id) || !w.unlock) continue;
    if (((save.worlds.records[w.unlock.world] || {}).bestDist || 0) >= w.unlock.dist) {
      save.worlds.unlocked.push(w.id);
      unlockedNow.push(w);
    }
  }
  save.tutorial.runs++;
  writeSave(save);
  state = 'results';
  input.captureKeys = false;
  platform.keepAwake(false);
  const canUpgrade = PARTS.some((p) => {
    const st = garageLogic.partState(save, p);
    return (st.equipped && st.canUpgrade) || st.canBuy;
  });
  setTimeout(() => {
    if (state !== 'results') return;
    hud.show(false);
    results.present(r, { newDist, newHeight, canUpgrade, unlocked: unlockedNow });
    if (newDist || newHeight || unlockedNow.length) { sfx.record(); platform.haptic('success'); }
  }, FX.resultDelay * 1000);
}

function openGarage() {
  state = 'garage';
  stage = null;
  paused = false;
  input.captureKeys = false;
  results.show(false);
  hud.show(false);
  menus.showPause(false);
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

function pauseGame() {
  if (state !== 'stage' || paused) return;
  paused = true;
  input.captureKeys = false;
  input.reset();
  menus.showPause(true);
  sfx.loop({ active: false });
}

function resumeGame() {
  paused = false;
  menus.showPause(false);
  menus.closeSettings();
  input.reset();
  input.captureKeys = state === 'stage';
}

function quitStage() {
  menus.showPause(false);
  paused = false;
  if (!stage || stage.phase === 'aim') { openGarage(); return; }
  stage.finish('stop');
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
  if (menus.settingsOpen) { menus.closeSettings(); return; }
  if (state === 'garage' && garage.pickerOpen) { garage.closePicker(); return; }
  if (state === 'stage') { paused ? resumeGame() : pauseGame(); return; }
  if (state === 'results') { openGarage(); return; }
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
    // Garage: Fahrzeug groß in der Vorschau-Fläche (Querformat: links), dreht sich langsam
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

  // Fahrzeug, Schleuder, Flagge (Render-Koordinaten = absolut - origin.x)
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
  flag.position.set(flagX - ox, flagY, FX.flag.z);

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
      groundDustOpts.colors = pal.dirt;
      particles.emit(v.x + GD.dx, v.y + GD.dy, groundDustOpts);
    }
  }
  // Wind sichtbar machen: feine Sandkörner/Staub ziehen durchs Bild
  if (playing && Math.abs(stage.env.wind) > WD.minWind && Math.random() < Math.abs(stage.env.wind) * WD.chancePerWind) {
    if (windOpts.pal !== pal) { windOpts.pal = pal; windOpts.colors = [pal.skyBottom, '#ffffff', pal.grass[0]]; }
    windOpts.vx = stage.env.wind * WD.windMul;
    windOpts.size = WD.sizeBase + cam.width * WD.sizePerWidth;
    particles.emit(cam.lookX + (Math.random() - 0.5) * cam.width * WD.spreadX, cam.lookY + (Math.random() - 0.5) * cam.height, windOpts);
  }
  particles.update(vdt, ox);

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
  get paused() { return paused; },
  get save() { return save; },
  get track() { return track; },
  get origin() { return origin.x; },
  get camera() { return cam; },
  get model() { return carModel; },
  input,
  garage,
  devMenu,
  startStage,
  openGarage,
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
