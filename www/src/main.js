import * as THREE from 'three';
import { WORLDS, worldById } from './data/worlds.js';
import { FX, CAMERA, CONTROLS, STAGE } from './data/balance.js';
import { UPGRADES } from './data/upgrades.js';
import { loadSave, writeSave, exportSave, importSave, clearSave, defaultSave } from './save/save.js';
import { computeStats, upgradeCost } from './garage/stats.js';
import { Track } from './physics/track.js';
import { Stage, REST } from './stage/stage.js';
import { CameraRig } from './camera/cameraRig.js';
import { Input } from './platform/input.js';
import { createView } from './render/scene.js';
import { buildCar, Slingshot, buildFlag } from './render/models.js';
import { TrackView } from './render/trackView.js';
import { Background } from './render/background.js';
import { ObjectsView } from './render/objectsView.js';
import { Particles } from './render/particles.js';
import { Origin } from './render/origin.js';
import { Sfx } from './audio/sfx.js';
import { platform } from './platform/platform.js';
import { Hud } from './ui/hud.js';
import { Workshop } from './ui/workshop.js';
import { Results } from './ui/results.js';
import { Menus } from './ui/menus.js';
import { Popups } from './ui/popups.js';
import { confirmDialog } from './ui/dom.js';

// ---------- Grundaufbau ----------
let save = loadSave();
const canvas = document.getElementById('game');
const uiRoot = document.getElementById('ui');
const view = createView(canvas);
const origin = new Origin();

// Aktuelle Welt (wird beim Weltwechsel komplett neu aufgebaut)
let world, pal, track, trackView, background;
function setWorld(id) {
  if (!save.unlocked.includes(id)) id = 'steppe';
  world = worldById(id);
  pal = world.palette;
  save.world = world.id;
  if (!save.worlds[world.id]) save.worlds[world.id] = { bestDist: 0, bestHeight: 0, runs: 0 };
  if (trackView) trackView.dispose();
  if (background) background.dispose();
  view.applyPalette(pal);
  track = new Track(world);
  trackView = new TrackView(view.scene, track, world);
  background = new Background(view.scene, pal);
}
const worldRec = () => save.worlds[world.id];
setWorld(save.world);

const objectsView = new ObjectsView(view.scene);
const particles = new Particles(view.scene, FX.maxParticles);
const carModel = buildCar(pal.car);
view.scene.add(carModel);
const sling = new Slingshot(view.scene, track.heightAt(0), REST.y, pal);
const flag = buildFlag();
flag.visible = false;
view.scene.add(flag);
let flagX = 0, flagY = 0;

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

let state = 'workshop'; // 'workshop' | 'stage' | 'results'
let paused = false;
let stage = null;
let stats = computeStats(save);
let flyHintTimer = 0;
let cam = null;

// ---------- Oberfläche ----------
const popups = new Popups(uiRoot);
const hud = new Hud(uiRoot, { onPause: () => pauseGame() });
input.bindButton(hud.boostButton, 'boost');
const workshop = new Workshop(uiRoot, {
  onWorld: (dir) => switchWorld(dir),
  onBuy: (u, card) => buy(u, card),
  onStart: () => { sfx.click(); startStage(); },
  onSettings: () => { sfx.click(); menus.openSettings(); },
});
const results = new Results(uiRoot, {
  onWorkshop: () => { sfx.click(); openWorkshop(); },
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
});

function applySettings() {
  sfx.setEnabled(save.settings.sound);
  platform.vibration = save.settings.vibration;
  view.setShadows(save.settings.shadows);
}

function afterSaveChange() {
  applySettings();
  stats = computeStats(save);
  setWorld(save.world);
  if (state === 'workshop') openWorkshop();
  else workshop.render(save, world, nextGoal());
}

// Weltauswahl in der Werkstatt (dir = -1 / +1)
function switchWorld(dir) {
  const i = WORLDS.findIndex((w) => w.id === world.id);
  const next = WORLDS[i + dir];
  if (!next) return;
  if (!save.unlocked.includes(next.id)) {
    sfx.denied();
    popups.show(`🔒 ${next.name}: ${unlockText(next)}`, 'info');
    return;
  }
  sfx.click();
  setWorld(next.id);
  writeSave(save);
  openWorkshop();
}

// Nächstes Freischalt-Ziel für die Anzeige in der Werkstatt
function nextGoal() {
  const w = WORLDS.find((x) => !save.unlocked.includes(x.id));
  if (!w) return null;
  const have = (save.worlds[w.unlock.world] || {}).bestDist || 0;
  return { name: w.name, text: unlockText(w), progress: Math.min(1, have / w.unlock.dist) };
}

function unlockText(w) {
  if (!w.unlock) return '';
  const from = worldById(w.unlock.world);
  const have = (save.worlds[from.id] || {}).bestDist || 0;
  return `${fmtN(w.unlock.dist)} m in „${from.name}“ (Rekord ${fmtN(have)} m)`;
}
const fmtN = (n) => Math.round(n).toLocaleString('de-DE');

// ---------- Effekte (Partikel-Vorlagen aus FX.particles) ----------
const PFX = FX.particles;
function emitFx(kind, x, y, o = {}) {
  switch (kind) {
    case 'coin':
      particles.emit(x, y, PFX.coin);
      break;
    case 'ring':
      particles.emit(x, y, PFX.ring);
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
      const cols = o.type === 'scrap' ? pal.wreck : s.colors[o.type] || [pal.car.body, pal.car.trim, '#cccccc'];
      particles.emit(x, y, { ...s, colors: cols });
      break;
    }
    case 'sparkle':
      particles.emit(x, y, PFX.sparkle);
      break;
  }
}

// Wiederverwendete Partikel-Einstellungen für Effekte, die jedes Bild entstehen
const BF = PFX.boostFlame, GD = PFX.groundDust, WD = PFX.windDust;
const flameOpts = { n: BF.n, colors: BF.colors, dir: 0, spread: BF.spread, speed: BF.speed, vx: 0, vy: 0, life: BF.life, size: BF.size, jitter: BF.jitter, zSpread: BF.zSpread, zSpeed: BF.zSpeed };
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
  stats = computeStats(save);
  stage = new Stage({ world, track, stats, seed: (Math.random() * 2 ** 31) | 0, hooks });
  state = 'stage';
  paused = false;
  input.reset();
  input.captureKeys = true;
  particles.clear();
  popups.clear();
  workshop.show(false);
  results.show(false);
  menus.showPause(false);
  hud.show(true, { best: worldRec().bestDist, tutorial: save.tutorial.runs < CONTROLS.tutorialRuns, weather: stage.weather });
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
  save.money += r.total;
  s.totalEarned += r.total;
  s.runs++;
  wr.runs++;
  wr.bestDist = Math.max(wr.bestDist, r.dist);
  wr.bestHeight = Math.max(wr.bestHeight, r.height);
  s.bestDist = Math.max(s.bestDist, r.dist);
  s.bestHeight = Math.max(s.bestHeight, r.height);
  s.bestTricks = Math.max(s.bestTricks, r.parts.tricks);
  // Neue Welten freischalten?
  const unlockedNow = [];
  for (const w of WORLDS) {
    if (save.unlocked.includes(w.id) || !w.unlock) continue;
    if (((save.worlds[w.unlock.world] || {}).bestDist || 0) >= w.unlock.dist) {
      save.unlocked.push(w.id);
      unlockedNow.push(w);
    }
  }
  save.tutorial.runs++;
  writeSave(save);
  state = 'results';
  input.captureKeys = false;
  platform.keepAwake(false);
  const canUpgrade = UPGRADES.some((u) => {
    const l = save.upgrades[u.id] || 0;
    return l < u.max && upgradeCost(u, l) <= save.money;
  });
  setTimeout(() => {
    if (state !== 'results') return;
    hud.show(false);
    results.present(r, { newDist, newHeight, canUpgrade, unlocked: unlockedNow });
    if (newDist || newHeight || unlockedNow.length) { sfx.record(); platform.haptic('success'); }
  }, FX.resultDelay * 1000);
}

function openWorkshop() {
  state = 'workshop';
  stage = null;
  paused = false;
  input.captureKeys = false;
  results.show(false);
  hud.show(false);
  menus.showPause(false);
  workshop.render(save, world, nextGoal());
  workshop.show(true);
  particles.clear();
  const W = CAMERA.workshop;
  camRig.snap(REST.x + W.offsetX, REST.y - W.snapLower, W.widthPortrait);
}

function buy(u, card) {
  const l = save.upgrades[u.id] || 0;
  if (l >= u.max) return;
  const cost = upgradeCost(u, l);
  if (save.money < cost) {
    sfx.denied();
    platform.haptic('light');
    card.classList.remove('nope');
    void card.offsetWidth;
    card.classList.add('nope');
    return;
  }
  save.money -= cost;
  save.upgrades[u.id] = l + 1;
  writeSave(save);
  stats = computeStats(save);
  sfx.buy();
  platform.haptic('success');
  workshop.render(save, world, nextGoal());
  workshop.flash(card);
  emitFx('sparkle', REST.x, REST.y + 1);
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
  if (!stage || stage.phase === 'aim') { openWorkshop(); return; }
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
  if (modal) { modal.querySelector('.btn-secondary')?.click(); return; }
  if (menus.settingsOpen) { menus.closeSettings(); return; }
  if (state === 'stage') { paused ? resumeGame() : pauseGame(); return; }
  if (state === 'results') { openWorkshop(); return; }
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

// ---------- Hauptschleife ----------
let last = performance.now();
const carPos = { x: 0, y: 0, angle: 0 };
const camTarget = { x: 0, y: 0, vx: 0, vy: 0, groundY: 0, aspect: 1, fovDeg: CAMERA.fovDeg, alt: 0 };
const frameView = { x: 0, y: 0, width: 0, k: 0, aspect: 1, fovDeg: CAMERA.fovDeg, car: null };
const hudView = { tilt: 0, indicator: null };

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(STAGE.maxFrameDt, Math.max(0, (now - last) / 1000));
  last = now;
  const t = now / 1000;

  const playing = state === 'stage' && stage && !paused;
  if (playing) stage.update(dt, input);
  const vdt = paused ? 0 : dt * (stage && state === 'stage' ? stage.timeScale : 1);

  // Auto-Position (absolute Koordinaten)
  const v = stage ? stage.vehicle : null;
  carPos.x = REST.x;
  carPos.y = REST.y + Math.sin(t * FX.idleBob.freq) * FX.idleBob.amp;
  carPos.angle = REST.angle;
  if (v) { carPos.x = v.x; carPos.y = v.y; carPos.angle = v.angle; }

  // Kamera-Logik (ohne three) → Floating Origin → THREE-Kamera
  const aspect = view.camera.aspect;
  if (!stage) {
    const W = CAMERA.workshop;
    const w = aspect < 1 ? W.widthPortrait : W.widthLandscape;
    frameView.x = REST.x + W.offsetX;
    frameView.y = REST.y - (w / aspect) * W.lowerFrac;
    frameView.width = w;
    frameView.k = W.k;
    frameView.aspect = aspect;
    frameView.car = null;
    cam = camRig.frame(dt, frameView);
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

  // Auto, Schleuder, Flagge (Render-Koordinaten = absolut - origin.x)
  carModel.position.set(carPos.x - ox, carPos.y, 0);
  carModel.rotation.z = carPos.angle;
  const spin = v ? v.wheelSpin : 0;
  for (const w of carModel.userData.wheels) w.rotation.z = -spin;
  const attached = !stage || stage.phase === 'aim';
  sling.setOrigin(ox);
  sling.update(Math.max(vdt, 0.001), carPos, attached);
  flag.position.set(flagX - ox, flagY, FX.flag.z);

  // Boost-Flamme und Staub
  if (v && playing && stage.phase === 'fly') {
    const ca = v.angle;
    if (v.boosting) {
      flameOpts.dir = ca + Math.PI;
      flameOpts.vx = v.vx * BF.inherit;
      flameOpts.vy = v.vy * BF.inherit;
      particles.emit(v.x - Math.cos(ca) * BF.back, v.y - Math.sin(ca) * BF.back - BF.down, flameOpts);
    }
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
openWorkshop();
requestAnimationFrame(frame);

// Für Tests (Playwright-Rauchtest) und die Browser-Konsole
window.__game = {
  get stage() { return stage; },
  get state() { return state; },
  get paused() { return paused; },
  get save() { return save; },
  get track() { return track; },
  get origin() { return origin.x; },
  get camera() { return cam; },
  input,
  startStage,
  openWorkshop,
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
