// Gemeinsame Test-Helfer (keine Tests – tests/index.js lädt nur *.test.mjs)
import { Stage } from '../www/src/stage/stage.js';
import { Track } from '../www/src/physics/track.js';
import { WORLDS } from '../www/src/data/worlds.js';
import { buildLoadout } from '../www/src/garage/loadout.js';
import { defaultSave } from '../www/src/save/save.js';
import { unlockAll } from '../www/src/garage/garage.js';

// Strecke aus einer Funktion (stückweise linear, Punkte alle 2 m wie die echte Strecke)
export function fnTrack(f, step = 2) {
  const at = (x) => {
    const i = Math.floor(x / step);
    const t = x / step - i;
    return f(i * step) * (1 - t) + f((i + 1) * step) * t;
  };
  return {
    heightAt: at,
    slopeAt: (x) => { const i = Math.floor(x / step); return (f((i + 1) * step) - f(i * step)) / step; },
    rampBetween: () => false,
  };
}
export const flat = (h = 0) => fnTrack(() => h);

// Eingabe-Attrappe: Knöpfe halten / drücken, neigen
export function mockInput() {
  const st = { held: [false, false, false], presses: [0, 0, 0], tilt: 0, hold: false };
  return {
    st,
    get hold() { return st.hold; },
    get tilt() { return st.tilt; },
    aimKey: 0,
    takeAimDrag: () => 0,
    abilityHeld: (i) => st.held[i],
    takeAbilityPress: (i) => { const n = st.presses[i]; st.presses[i] = 0; return n; },
    press(i) { st.presses[i]++; },
  };
}

// Etappe mit Garage-Ausrüstung. opts: { chassis, abilities, research: true (alles erforscht), seed, world }
export function makeStage(opts = {}) {
  const save = defaultSave();
  if (opts.research !== false) unlockAll(save);
  if (opts.chassis) save.garage.chassis = opts.chassis;
  if (opts.abilities) save.garage.abilities = opts.abilities;
  if (opts.parts) for (const [slot, id] of Object.entries(opts.parts)) { save.garage.ownedParts.push(id); save.garage.parts[slot] = id; }
  const world = opts.world || WORLDS[0];
  const track = new Track(world);
  const events = [];
  let result = null;
  const stage = new Stage({
    world, track, loadout: buildLoadout(save), seed: opts.seed ?? 5,
    hooks: { end: (r) => { result = r; }, event: (name, data) => events.push({ name, data }) },
  });
  return { stage, events, get result() { return result; }, save };
}

// Etappe in die Luft bringen (hoch über dem Boden, damit nichts landet)
export function airborne(stage, y = 400, vx = 15, vy = 0) {
  stage.launchNow(0.5, 30);
  const v = stage.vehicle;
  v.y = stage.track.heightAt(v.x) + y;
  v.vx = vx; v.vy = vy; v.angle = 0; v.w = 0;
}

export function run(stage, input, seconds, dt = 1 / 60) {
  for (let t = 0; t < seconds - 1e-9; t += dt) stage.update(dt, input);
}
