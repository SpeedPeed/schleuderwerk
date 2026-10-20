// Paket A – Tempo: Vorspulen (STAGE.fastForward), Sofort-Ende per Tippen und Hochrechnung „Knapp“ (Schatten-Etappe).
// Alles muss deterministisch sein: gleiche Physik-Schritte, gleiches Ergebnis – egal ob zugesehen, vorgespult oder
// sofort beendet. Dazu die Überweite-Wertungen Platin/Schrottkönig.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIOMES } from '../www/src/data/biomes.js';
import { STAGE, REWARDS } from '../www/src/data/balance.js';
import { generateStageSpec, gradeFor, stageMedals } from '../www/src/physics/trackGen.js';
import { makeRng } from '../www/src/core/rng.js';
import { neutralFrame } from '../www/src/stage/stage.js';
import { simSave, makeSimStage, botInput, playStage } from '../tools/sim/bot.mjs';

const FF = STAGE.fastForward;
const KEYS = ['reason', 'dist', 'medal', 'grade', 'time', 'bolts', 'scrap', 'damageTaken', 'durability', 'fuelLeft', 'tricks', 'maxChain', 'itemTriggers'];
const pick = (r) => Object.fromEntries(KEYS.map((k) => [k, r[k]]));

function stageFor(biome, i, { floor = 3, save = simSave('start') } = {}) {
  const spec = generateStageSpec({ biome, kind: 'stage', floor, rng: makeRng(`tempo:${biome.id}:${i}`) });
  return makeSimStage({ spec, biome, save, seed: 500 + i, runInfo: { bolts: 20, counters: {} } });
}

// Ohne Eingaben bis zum Ende (wie Zusehen); mode: 'watch' (×1) | 'ff' (Vorspulen) | 'instant' (Sofort-Ende im Ausrollen)
function neutralRun(biome, i, mode) {
  const sim = stageFor(biome, i);
  const st = sim.stage;
  st.fastForwardEnabled = mode !== 'watch';
  st.launchNow(0.92, 34, true);
  const input = botInput(st.abilities.length);
  let frames = 0, ffFrames = 0;
  while (!sim.result && frames < 60000) {
    if (mode === 'instant' && st.fastForward) { st.instantFinish(); break; }
    st.update(1 / 60, input);
    frames++;
    if (st.fastForward) ffFrames++;
  }
  return { r: sim.result, frames, ffFrames, st };
}

test('Vorspulen und Sofort-Ende ändern das Ergebnis nicht (gleiche Physik-Schritte)', () => {
  for (const b of BIOMES) {
    for (let i = 0; i < 4; i++) {
      const w = neutralRun(b, i, 'watch'), f = neutralRun(b, i, 'ff'), s = neutralRun(b, i, 'instant');
      assert.deepEqual(pick(f.r), pick(w.r), `${b.id} ${i}: Vorspulen`);
      assert.deepEqual(pick(s.r), pick(w.r), `${b.id} ${i}: Sofort-Ende`);
      assert.ok(f.frames < w.frames, `${b.id} ${i}: vorgespult kürzer (${f.frames} < ${w.frames} Bilder)`);
      assert.ok(f.ffFrames > 0, 'Vorspulen war aktiv');
      assert.equal(s.st.instantDone, true);
      assert.equal(s.r.instant, true);
    }
  }
});

test('Vorspulen: erst nach STAGE.fastForward.minGroundTime am Boden, nicht mit gehaltenem Boost, ×scale je Bild', () => {
  const sim = stageFor(BIOMES[0], 1);
  const st = sim.stage;
  st.launchNow(0.92, 34, true);
  const input = botInput(st.abilities.length);
  let sawAirFF = false, sawEarly = false, sawFF = false;
  while (!sim.result) {
    // entschieden wird zu Beginn des Bildes (Zustand nach dem letzten Bild)
    const ground = st.vehicle.onGround, gt = st.groundTime;
    st.update(1 / 60, input);
    if (st.phase !== 'fly') break;
    if (st.fastForward) {
      sawFF = true;
      if (!ground) sawAirFF = true;
      if (gt < FF.minGroundTime - 1e-9) sawEarly = true;
      assert.equal(st.playScale, st.timeScale * FF.scale);
      // Boost halten beendet das Vorspulen sofort (nächstes Bild)
      if (st.vehicle.canBoost && st.abilities.boostSlot >= 0) {
        input.st.held[st.abilities.boostSlot] = true;
        st.update(1 / 60, input);
        assert.equal(st.fastForward, false, 'Boost gehalten → kein Vorspulen');
        input.st.held[st.abilities.boostSlot] = false;
      }
    }
  }
  assert.ok(sawFF);
  assert.ok(!sawAirFF, 'nie in der Luft');
  assert.ok(!sawEarly, 'erst nach minGroundTime');
  assert.equal(FF.scale, 4);
  assert.equal(FF.minGroundTime, 0.8);
});

test('Tippen beim Ausrollen = Sofort-Ende (Bild mit tap), im Flug wirkungslos', () => {
  const base = neutralRun(BIOMES[1], 2, 'watch').r;
  const sim = stageFor(BIOMES[1], 2);
  const st = sim.stage;
  st.launchNow(0.92, 34, true);
  const input = botInput(st.abilities.length);
  let taps = 0;
  input.takeTap = () => { const n = taps; taps = 0; return n; };
  // im Flug tippen: nichts passiert
  for (let k = 0; k < 30; k++) st.update(1 / 60, input);
  taps = 1;
  st.update(1 / 60, input);
  assert.equal(st.phase, 'fly', 'Tippen in der Luft beendet nichts');
  while (!st.fastForward && !sim.result) st.update(1 / 60, input);
  assert.ok(st.canFinish);
  taps = 1;
  st.update(1 / 60, input);
  assert.ok(sim.result, 'Etappe sofort beendet');
  assert.deepEqual(pick(sim.result), pick(base));
});

test('Hochrechnung „Knapp“: ohne Treibstoff und ohne Bronze → Schatten-Etappe = tatsächliches Ende, Ende nach knappDelay', () => {
  let knapps = 0;
  for (const b of BIOMES) {
    for (let i = 0; i < 8; i++) {
      const sim = stageFor(b, 40 + i, { save: simSave(b.act === 1 ? 'start' : 'gut') });
      const st = sim.stage;
      let knappAt = null;
      const orig = st.update.bind(st);
      st.update = (dt, inp) => { orig(dt, inp); if (st.knapp && knappAt === null) knappAt = st.time; };
      const r = playStage(st, () => sim.result, { seed: i });
      if (r.knapp === null) continue;
      knapps++;
      assert.ok(!r.medal && r.reason !== 'wreck', 'Knapp nur ohne Bronze');
      assert.equal(st.projection.dist, r.dist, `${b.id} ${i}: Hochrechnung = Ergebnis`);
      assert.equal(st.projection.time, r.time);
      assert.equal(r.knapp, Math.min(99, Math.floor((r.dist / r.target) * 100)));
      // Ende per Sofort-Ende nach knappDelay (Echtzeit) – oder vorher von selbst (stehen geblieben)
      assert.ok(r.instant || r.time - knappAt <= FF.knappDelay * FF.scale + 0.05, `${b.id} ${i}: Ende ${r.time} nach Knapp ${knappAt}`);
      assert.ok(r.time >= knappAt, 'Ende nach der Hochrechnung');
    }
  }
  assert.ok(knapps >= 6, `Knapp kam ${knapps}× vor`);
});

test('Aufzeichnung: Abschuss und Bilder werden aufgezeichnet; die Schatten-Etappe ist deckungsgleich', () => {
  const sim = stageFor(BIOMES[2], 3);
  const st = sim.stage;
  st.launchNow(0.8, 30, false);
  assert.deepEqual(st.frames[0].launch, [0.8, 30, false]);
  const input = botInput(st.abilities.length);
  for (let k = 0; k < 200; k++) st.update(1 / 60, input);
  assert.equal(st.frames.length, 201);
  const r = st.project();
  assert.ok(r, 'Schatten deckungsgleich');
  // die echte Etappe läuft unverändert weiter und kommt zum selben Ende
  while (!sim.result) st.update(1 / 60, input);
  assert.deepEqual(pick(sim.result), pick(r));
  assert.equal(neutralFrame(0.1).dt, 0.1);
});

test('Überweite: Platin = Gold × 1,5, Schrottkönig = Gold × 2 (= Ende „far“), Wertung im Ergebnis', () => {
  const m = stageMedals(BIOMES[0], 'stage', 400).medals;
  assert.equal(m.platin, Math.round(m.gold * REWARDS.gradeMarks.platin));
  assert.equal(m.king, Math.round(m.gold * REWARDS.gradeMarks.king));
  assert.equal(REWARDS.gradeMarks.king, STAGE.farMul, 'Schrottkönig = Ende „far“');
  assert.equal(gradeFor(399, m), 'miss');
  assert.equal(gradeFor(m.gold, m), 'gold');
  assert.equal(gradeFor(m.platin, m), 'platin');
  assert.equal(gradeFor(m.king + 5, m), 'king');
  assert.ok(!stageMedals(BIOMES[0], 'stage', 400).medalList.includes('platin'), 'Medaillen-Liste bleibt Bronze/Silber/Gold');
  // Etappe mit winzigen Marken: endet mit „far“ und Wertung Schrottkönig
  const b = BIOMES[0];
  const spec = generateStageSpec({ biome: b, kind: 'stage', floor: 0, rng: makeRng('koenig') });
  const t = 40;
  spec.target = t;
  spec.medals = { bronze: t, silver: 50, gold: 60, platin: 90, king: 120 };
  const sim = makeSimStage({ spec, biome: b, save: simSave('start'), seed: 3 });
  sim.stage.launchNow(1, 34, true);
  const input = botInput(sim.stage.abilities.length);
  while (!sim.result) sim.stage.update(1 / 60, input);
  assert.equal(sim.result.reason, 'far');
  assert.equal(sim.result.grade, 'king');
  assert.equal(sim.result.medal, 'gold');
});
