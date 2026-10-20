// Spiel-Bot für den Balance-Simulator (headless, echte Etappen-Logik aus www/src).
// Spielt wie eine geübte Person: guter Abschuss (meist im grünen Bereich), richtet die Kiste vor der
// Landung am Boden aus, boostet in der Luft (mit Reserve), springt mit dem Hüpfer über Hindernisse, geschlossene
// Pressen und an Schluchtkanten, gibt bei Blitzwarnungen Gas.
// Option tricks (Phase 4, Items): dreht Rückwärtssaltos, solange bis zur Landung genug Zeit bleibt (Saltos lösen viele
// Item-Ketten aus), und richtet die Kiste danach wie gewohnt aus. Inventar über makeSimStage({ inventory }).
// Mit Regeln, die Überhitzen folgenlos machen (overheatAfterburner, noOverheat, heatIsResource), boostet er ohne Hitze-Reserve.
import { Stage } from '../../www/src/stage/stage.js';
import { Track } from '../../www/src/physics/track.js';
import { buildLoadout } from '../../www/src/garage/loadout.js';
import { defaultSave } from '../../www/src/save/save.js';
import { makeRng } from '../../www/src/core/rng.js';
import { FEATURES, PHYSICS, GARAGE } from '../../www/src/data/balance.js';
import { wrapAngle } from '../../www/src/core/math.js';

// Eingabe-Attrappe (wie platform/input.js)
export function botInput(n = 4) {
  const st = { held: Array(n).fill(false), presses: Array(n).fill(0), tilt: 0, hold: false, taps: 0 };
  return {
    st,
    get hold() { return st.hold; },
    get tilt() { return st.tilt; },
    aimKey: 0,
    takeAimDrag: () => 0,
    abilityHeld: (i) => !!st.held[i],
    takeAbilityPress: (i) => { const k = st.presses[i]; st.presses[i] = 0; return k; },
    takeTap: () => { const k = st.taps; st.taps = 0; return k; },
    press(i) { st.presses[i]++; },
  };
}

// Spielstände für die Simulation: 'start' = neuer Spielstand, 'gut' = alle Slots auf Stufe 5 von 10
// (Paket A; entspricht der früheren Teile-Stufe 10 von 20)
export function simSave(kind = 'start') {
  const s = defaultSave();
  if (kind === 'gut') for (const slot of Object.keys(GARAGE.starterParts)) s.garage.slotLevels[slot] = 5;
  return s;
}

// Etappe zur Spezifikation bauen
export function makeSimStage({ spec, biome, save, seed = 1, durability, runMods, hooks = {}, inventory = null, runInfo = null }) {
  const track = new Track(spec, biome);
  let result = null;
  const stage = new Stage({
    biome, spec, track, loadout: buildLoadout(save), seed, durability, runMods, inventory, runInfo,
    hooks: { ...hooks, end: (r) => { result = r; if (hooks.end) hooks.end(r); } },
  });
  return { stage, get result() { return result; } };
}

// Eine Etappe mit dem Bot spielen. Ergebnis: Etappen-Ergebnis (stage.finish)
// tapAfter (Paket A, Messung tools/playtest/anatomy.mjs): läuft die Etappe so viele Sekunden (Echtzeit) vorgespult und
// ist voraus nichts mehr zu sehen (keine Rampe/Schlucht/Looping in 80 m, kein Hindernis/keine Presse in 25 m – sonst
// käme noch ein Sprung bzw. würde der Bot Anlauf nehmen oder hüpfen), tippt der Bot – Sofort-Ende wie eine Person, die das Ausrollen nicht abwarten will
// (null = nie). Ab da rechnet die Etappe ohne Eingaben zu Ende.
export function playStage(stage, getResult, { seed = 1, maxTime = 200, skill = 1, tricks = false, trickTime = 1.7, tapAfter = null } = {}) {
  const r = makeRng(`bot:${seed}`);
  const input = botInput(stage.abilities.length);
  const bar = stage.abilities;
  const boostSlot = bar.boostSlot;
  const jumpSlot = bar.slots.findIndex((s) => s.def.id === 'sprung');
  // Abschuss: meist perfekt, sonst kräftig
  const perfect = r.chance(0.6 * skill);
  const power = perfect ? stage.launch.sweet : r.range(0.78, 0.98);
  stage.launchNow(power, r.range(30, 42), perfect);
  const dt = 1 / 60;
  let jumpCd = 0;
  let flipFrom = null;      // tricks: Drehung zu Beginn des laufenden Saltos
  // Überhitzen ohne Folgen (Feuer-Set 6 Nachbrenner, Kühlschrank, Waschmaschine): Hitze als Waffe – der Bot boostet
  // dann ohne Hitze-Reserve (sonst nutzt er den Feuer-Kreislauf nie)
  const R = stage.rules || {};
  const heatFree = !!(R.overheatAfterburner || R.noOverheat || R.heatIsResource);
  const heatOk = (v, st, f) => heatFree || v.heat < st.heatMax * f;
  let ffFor = 0;
  while (!getResult() && stage.time < maxTime) {
    if (tapAfter !== null) {
      const v = stage.vehicle, o = stage.objects;
      // sichtbar voraus (≈ 80 m): Rampe, Schlucht, Looping → da kommt noch ein Sprung; Hindernis/Presse → hüpfen
      const busy = (stage.spec.features || []).some((f) => (f.type === 'ramp' || f.type === 'gap' || f.type === 'loop') && f.x1 > v.x && f.x0 - v.x < 80)
        || stage.track.gaps.some((g) => g.edge > v.x && g.rs - 60 < v.x)
        || o.obstacles.some((ob) => ob.alive && ob.x > v.x && ob.x - v.x < 25) || o.crushers.some((c) => c.x > v.x && c.x - v.x < 25);
      ffFor = stage.fastForward && !busy ? ffFor + dt : 0;
    }
    if (tapAfter !== null && ffFor >= tapAfter) input.st.taps = 1;
    const v = stage.vehicle;
    const st = stage.stats;
    const o = stage.objects;
    input.st.tilt = 0;
    let boost = false;
    jumpCd -= dt;
    if (!v.onGround && !v.loop) {
      // Landung vorbereiten: Nase auf die Hangneigung am Landepunkt
      const lead = Math.min(0.6, Math.max(0.15, (v.y - stage.track.heightAt(v.x)) / 40));
      const d = wrapAngle(Math.atan(stage.track.slopeAt(v.x + v.vx * lead)) - v.angle);
      const u = d * 3 - v.w * 0.45;
      input.st.tilt = u > 0.15 ? 1 : u < -0.15 ? -1 : 0;
      // Saltos: ein ganzer Rückwärtssalto wird nur begonnen, wenn bis zur Landung genug Zeit bleibt (ballistisch
      // geschätzt); danach übernimmt das Ausrichten (Kulanz 25° + Abbremsen)
      if (tricks) {
        const h = Math.max(0, v.y - PHYSICS.rideHeight - stage.track.heightAt(v.x + v.vx * 0.5));
        const g = stage.biome.gravity;
        const tLand = (v.vy + Math.sqrt(Math.max(0, v.vy * v.vy + 2 * g * h))) / g;
        if (flipFrom === null && tLand > trickTime) flipFrom = v.rotAccum;
        if (flipFrom !== null) {
          if (v.rotAccum - flipFrom < Math.PI * 2 - 0.9) input.st.tilt = 1;
          else flipFrom = null;
        }
      }
    } else if (flipFrom !== null) flipFrom = null;
    if (!v.onGround && !v.loop) {
      // Boost nach vorn (nicht steil nach oben – das kostet nur Landeschaden)
      const fwd = Math.abs(v.angle) < 0.35 || (v.angle < 0 && v.angle > -0.6);
      // Hitze als Waffe: dann bis zum Überhitzen durchboosten (kleine Reserve für Schluchten)
      boost = heatFree ? fwd && v.fuel > st.fuelMax * 0.1 : fwd && v.fuel > st.fuelMax * 0.35 && v.vy > -4 && heatOk(v, st, 0.72);
    }
    if (v.onGround && boostSlot >= 0) {
      // Vor einer Schlucht Anlauf nehmen
      const g = stage.track.gaps.find((x) => x.rs - 40 < v.x && v.x < x.edge);
      if (g && v.fuel > 0 && v.s < 22 && heatOk(v, st, 0.8)) boost = true;
    }
    // Blitzwarnung vor/auf dem Fahrzeug → Gas geben
    for (const s of o.strikes) {
      if (s.t > 0 && Math.abs(v.x + v.vx * s.t - s.x) < FEATURES.lightning.radius * 1.6 && heatOk(v, st, 0.85)) boost = true;
    }
    input.st.held[boostSlot] = boost && boostSlot >= 0;
    // Hüpfer: Hindernis/Presse kurz voraus, Schluchtkante
    if (jumpSlot >= 0 && v.onGround && jumpCd <= 0) {
      const sp = Math.max(4, v.s);
      const near = (x, w) => x - w / 2 - v.x > 0 && x - w / 2 - v.x < sp * 0.42 + PHYSICS.carRadius;
      let want = o.obstacles.some((ob) => ob.alive && near(ob.x, ob.w))
        || o.crushers.some((c) => near(c.x, c.w) && c.lift < FEATURES.crusher.openY * 0.9);
      const g = stage.track.gapAt ? stage.track.gaps.find((x) => x.edge - v.x > 0 && x.edge - v.x < sp * 0.12 + 0.5) : null;
      if (g) want = true;
      if (want) { input.press(jumpSlot); jumpCd = 0.6; }
    }
    stage.update(dt, input);
  }
  if (!getResult()) stage.finish('time');
  return getResult();
}
