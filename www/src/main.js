import * as THREE from 'three';
import { WORLDS, worldById } from './config/worlds.js';
import { FX } from './config/balance.js';
import { UPGRADES } from './config/upgrades.js';
import { loadSave, writeSave, exportSave, importSave, clearSave, defaultSave } from './save/save.js';
import { computeStats, upgradeCost } from './game/stats.js';
import { Terrain } from './game/terrain.js';
import { Run, REST } from './game/run.js';
import { Input } from './game/input.js';
import { createView } from './render/scene.js';
import { buildCar, Slingshot, buildFlag } from './render/models.js';
import { TerrainView } from './render/terrainView.js';
import { Background } from './render/background.js';
import { ObjectsView } from './render/objectsView.js';
import { Particles } from './render/particles.js';
import { CameraRig } from './render/cameraRig.js';
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

// Aktuelle Welt (wird beim Weltwechsel komplett neu aufgebaut)
let world, pal, terrain, terrainView, background;
function setWorld(id) {
  if (!save.unlocked.includes(id)) id = 'steppe';
  world = worldById(id);
  pal = world.palette;
  save.world = world.id;
  if (!save.worlds[world.id]) save.worlds[world.id] = { bestDist: 0, bestHeight: 0, runs: 0 };
  if (terrainView) terrainView.dispose();
  if (background) background.dispose();
  view.applyPalette(pal);
  terrain = new Terrain(world);
  terrainView = new TerrainView(view.scene, terrain, world);
  background = new Background(view.scene, pal);
}
const worldRec = () => save.worlds[world.id];
setWorld(save.world);

const objectsView = new ObjectsView(view.scene);
const particles = new Particles(view.scene, FX.maxParticles);
const carModel = buildCar(pal.car);
view.scene.add(carModel);
const sling = new Slingshot(view.scene, terrain.heightAt(0), REST.y, pal);
const flag = buildFlag();
flag.visible = false;
view.scene.add(flag);

// Punkte der Flugkurven-Vorschau beim Zielen
const traj = new THREE.InstancedMesh(
  new THREE.IcosahedronGeometry(0.22, 0),
  new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 }),
  24,
);
traj.frustumCulled = false;
traj.count = 0;
view.scene.add(traj);
const _o = new THREE.Object3D();

const camRig = new CameraRig(view.camera);
const input = new Input(canvas);
const sfx = new Sfx();

let state = 'workshop'; // 'workshop' | 'run' | 'results'
let paused = false;
let run = null;
let stats = computeStats(save);
let flyHintTimer = 0;

// ---------- Oberfläche ----------
const popups = new Popups(uiRoot);
const hud = new Hud(uiRoot, { onPause: () => pauseGame() });
const workshop = new Workshop(uiRoot, {
  onWorld: (dir) => switchWorld(dir),
  onBuy: (u, card) => buy(u, card),
  onStart: () => { sfx.click(); startRun(); },
  onSettings: () => { sfx.click(); menus.openSettings(); },
});
const results = new Results(uiRoot, {
  onWorkshop: () => { sfx.click(); openWorkshop(); },
  onAgain: () => { sfx.click(); startRun(); },
  onTick: () => sfx.money(),
});
const menus = new Menus(uiRoot, {
  onResume: () => resumeGame(),
  onQuit: () => quitRun(),
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

// ---------- Effekte ----------
function emitFx(kind, x, y, o = {}) {
  switch (kind) {
    case 'coin':
      particles.emit(x, y, { n: 6, colors: ['#ffd23f', '#fff3a0', '#ffae00'], speed: 5, life: 0.4, size: 0.35 });
      break;
    case 'ring':
      particles.emit(x, y, { n: 18, colors: ['#33e6ff', '#ffffff', '#9ff4ff'], speed: 9, life: 0.6, size: 0.4, jitter: 3 });
      break;
    case 'dust': {
      const a = o.amount ?? 0.4;
      particles.emit(x, y, { n: Math.round(8 + a * 16), colors: [...pal.dirt, pal.grass[0]], dir: Math.PI / 2, spread: 2.6, speed: 3 + a * 7, life: 0.8, gravity: 7, size: 0.5, zSpread: 3 });
      break;
    }
    case 'smash': {
      const cols = {
        tires: ['#26262b', '#3a3a40', '#e8b830'],
        scrap: pal.wreck,
        cactus: ['#4f8a4a', '#5c9a52', '#ff6b8a'],
        pillar: ['#c2703f', '#d08050', '#e9a466'],
      }[o.type] || [pal.car.body, pal.car.trim, '#cccccc'];
      particles.emit(x, y, { n: 26, colors: cols, speed: 11, life: 1.1, gravity: 16, size: 0.55, jitter: 1.5, zSpread: 3 });
      break;
    }
    case 'sparkle':
      particles.emit(x, y, { n: 26, colors: ['#ffd23f', '#ffffff', '#ff8a3d'], speed: 7, life: 0.9, gravity: 5, size: 0.35, jitter: 2 });
      break;
  }
}

const hooks = {
  popup: (t, k) => popups.show(t, k),
  sfx: (name, arg) => { if (typeof sfx[name] === 'function') sfx[name](arg); },
  shake: (a) => { if (save.settings.shake) camRig.shake(a); },
  haptic: (k) => platform.haptic(k),
  fx: (kind, x, y, o) => emitFx(kind, x, y, o),
  end: (r) => endRun(r),
};

// ---------- Spielablauf ----------
function startRun() {
  stats = computeStats(save);
  run = new Run({ world, terrain, stats, seed: (Math.random() * 2 ** 31) | 0, hooks, save });
  state = 'run';
  paused = false;
  input.reset();
  particles.clear();
  popups.clear();
  workshop.show(false);
  results.show(false);
  menus.showPause(false);
  hud.show(true, { best: worldRec().bestDist, tutorial: save.tutorial.runs < 3, weather: run.weather });
  const bd = worldRec().bestDist;
  flag.visible = bd > 20;
  flag.position.set(bd, terrain.heightAt(bd), -2.4);
  flyHintTimer = 0;
  platform.keepAwake(true);
}

function endRun(r) {
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
  platform.keepAwake(false);
  const canUpgrade = UPGRADES.some((u) => {
    const l = save.upgrades[u.id] || 0;
    return l < u.max && upgradeCost(u, l) <= save.money;
  });
  setTimeout(() => {
    hud.show(false);
    results.present(r, { newDist, newHeight, canUpgrade, unlocked: unlockedNow });
    if (newDist || newHeight || unlockedNow.length) { sfx.record(); platform.haptic('success'); }
  }, 700);
}

function openWorkshop() {
  state = 'workshop';
  run = null;
  paused = false;
  results.show(false);
  hud.show(false);
  menus.showPause(false);
  workshop.render(save, world, nextGoal());
  workshop.show(true);
  particles.clear();
  camRig.snap(REST.x + 1.2, REST.y - 6, 15);
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
  if (state !== 'run' || paused) return;
  paused = true;
  menus.showPause(true);
  sfx.loop({ active: false });
}

function resumeGame() {
  paused = false;
  menus.showPause(false);
  menus.closeSettings();
  input.reset();
}

function quitRun() {
  menus.showPause(false);
  paused = false;
  if (!run || run.phase === 'aim') { openWorkshop(); return; }
  run.finish('stop');
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
  if (state === 'run') { paused ? resumeGame() : pauseGame(); return; }
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

// ---------- Hauptschleife ----------
let last = performance.now();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;

  if (state === 'run' && run && !paused) run.update(dt, input);
  const vdt = paused ? 0 : dt * (run && state === 'run' ? run.timeScale : 1);

  // Auto-Position
  let cx = REST.x, cy = REST.y + Math.sin(t * 2) * 0.05, ca = 0.35;
  const car = run ? run.car : null;
  if (car) { cx = car.x; cy = car.y; ca = car.angle; }
  carModel.position.set(cx, cy, 0);
  carModel.rotation.z = ca;
  const spin = car ? car.wheelSpin : 0;
  for (const w of carModel.userData.wheels) w.rotation.z = -spin;

  const attached = !run || run.phase === 'aim';
  sling.update(Math.max(vdt, 0.001), { x: cx, y: cy, angle: ca }, attached);

  // Boost-Flamme und Staub
  if (car && state === 'run' && !paused && run.phase === 'fly') {
    if (car.boosting) {
      const rx = car.x - Math.cos(ca) * 2.3, ry = car.y - Math.sin(ca) * 2.3 - 0.2;
      particles.emit(rx, ry, { n: 2, colors: ['#fff17a', '#ffa22e', '#ff5a1f'], dir: ca + Math.PI, spread: 0.5, speed: 9, vx: car.vx * 0.7, vy: car.vy * 0.7, life: 0.28, size: 0.5, jitter: 0.3, zSpread: 0.6, zSpeed: 0.5 });
    }
    if (car.onGround && Math.abs(car.s) > 8 && Math.random() < 0.4) {
      particles.emit(car.x - 1.4, car.y - 0.9, { n: 1, colors: pal.dirt, dir: Math.PI * 0.75, spread: 0.8, speed: 3, life: 0.6, gravity: 3, size: 0.45, zSpread: 2.2 });
    }
  }
  // Wind sichtbar machen: feine Sandkörner/Staub ziehen durchs Bild
  if (run && state === 'run' && !paused && Math.abs(run.env.wind) > 0.5 && Math.random() < Math.abs(run.env.wind) * 0.06) {
    const w = camRig.width;
    const h = w / Math.min(view.camera.aspect, 1.6);
    particles.emit(camRig.x + (Math.random() - 0.5) * w * 1.2, camRig.y + (Math.random() - 0.5) * h, {
      n: 1, colors: [pal.skyBottom, '#ffffff', pal.grass[0]], speed: 0, vx: run.env.wind * 3, vy: -0.5,
      life: 1.4, size: 0.18 + w * 0.004, jitter: 0, zSpread: 6, zSpeed: 0,
    });
  }
  particles.update(vdt);

  // Flugkurven-Vorschau
  let nTraj = 0;
  if (run && run.phase === 'aim' && run.aim.active) {
    const pts = run.previewPath();
    pts.forEach((p, i) => {
      _o.position.set(p.x, p.y, 0);
      _o.scale.setScalar(1 - i / (pts.length + 4));
      _o.updateMatrix();
      traj.setMatrixAt(nTraj++, _o.matrix);
    });
  }
  traj.count = nTraj;
  traj.instanceMatrix.needsUpdate = true;

  // Kamera
  const aspect = view.camera.aspect;
  if (!run) {
    // Werkstatt: Auto oben im Bild, darunter die Upgrade-Liste
    const w = aspect < 1 ? 15 : 26;
    camRig.update(dt, REST.x + 1.2, REST.y - (w / aspect) * 0.2, w, 3);
  } else if (run.phase === 'aim') {
    camRig.update(dt, REST.x + 8, REST.y + 10, 30, 3);
  } else {
    const sp = car.speed;
    const vx = car.onGround ? car.s * Math.cos(ca) : car.vx;
    const vy = car.onGround ? car.s * Math.sin(ca) : car.vy;
    const alt = Math.max(0, run.altitude);
    const width = clamp(24 + sp * 0.45 + alt * 0.12, 24, 110);
    const height = width / Math.min(aspect, 1.6);
    const tx = car.x + clamp(vx * 0.35, -width * 0.1, width * 0.25);
    // Auto eher im unteren Bilddrittel: mehr Himmel zum Vorausschauen, weniger Erdreich
    const ty = car.y + height * 0.14 + clamp(vy * 0.3, -height * 0.32, height * 0.12);
    camRig.update(dt, tx, ty, width, 6);
  }
  terrainView.update(camRig.x);
  background.update(camRig.x, camRig.y);
  objectsView.update(run ? run.objects : null, camRig.x, t);
  view.followSun(cx, cy);
  view.scene.fog.near = camRig.dist + 60;
  view.scene.fog.far = camRig.dist + 650;

  // HUD und Sound
  if (state === 'run' && run) {
    hud.update(run);
    if (run.phase === 'fly' && save.tutorial.runs < 3) {
      flyHintTimer += dt;
      hud.showFlyHint(flyHintTimer < 5);
    }
  }
  sfx.loop({
    active: !!(car && state === 'run' && !paused && run.phase === 'fly'),
    speed: car ? car.speed : 0,
    boosting: car ? car.boosting : false,
    air: car ? !car.onGround : false,
  });

  view.renderer.render(view.scene, view.camera);
}

applySettings();
openWorkshop();
requestAnimationFrame(frame);

// Für Tests in der Browser-Konsole
window.__game = { get run() { return run; }, get save() { return save; }, startRun, terrain, input };
