// Phase 7: Tutorial (Auslösen, nur einmal, Zurücksetzen), Einstellungen im Spielstand, Zurück-Taste-Logik, Version.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Tutorial, TUTORIAL_STEPS, TUTORIAL_ORDER, tutorialWants, markSeen, resetTutorial, skipTutorial, tutorialProgress } from '../www/src/ui/tutorial.js';
import { backAction, BACK_ACTIONS } from '../www/src/ui/backButton.js';
import { defaultSave, migrate, exportSave, importSave } from '../www/src/save/save.js';
import { GAME_VERSION, RENDER, AUDIO, TUTORIAL } from '../www/src/data/balance.js';

// Tutorial mit Schein-Anzeige und sofort laufenden Zeitgebern (Zeit wird von Hand weitergedreht)
function makeTutorial(save = defaultSave(), allow = null) {
  const shown = [];
  let hidden = 0, persisted = 0;
  const timers = [];
  const t = new Tutorial({
    getSave: () => save,
    allow,
    persist: () => { persisted++; },
    view: { show: (step, id, n, total) => shown.push({ id, n, total, mode: step.mode }), hide: () => { hidden++; } },
    schedule: (fn, ms) => { const h = { fn, ms, done: false }; timers.push(h); return h; },
    cancel: (h) => { h.done = true; },
  });
  // alle fälligen Zeitgeber ausführen (auch neu entstehende), höchstens bis maxMs
  const run = (maxMs = Infinity) => {
    for (let guard = 0; guard < 50; guard++) {
      const h = timers.find((x) => !x.done && x.ms <= maxMs);
      if (!h) return;
      h.done = true;
      h.fn();
    }
  };
  return { t, save, shown, run, get hidden() { return hidden; }, get persisted() { return persisted; } };
}

test('Tutorial: höchstens 6 Hinweise (Paket A), jeder mit Text (1–3 Sätze), Symbol, Art und Ziel', () => {
  assert.deepEqual(TUTORIAL_ORDER, ['garage', 'map', 'launch', 'fly', 'items', 'lab']);
  assert.ok(TUTORIAL_ORDER.length <= 6);
  for (const [id, s] of Object.entries(TUTORIAL_STEPS)) {
    assert.ok(s.icon && s.title && s.text, id);
    assert.ok(['card', 'toast'].includes(s.mode), id);
    const sentences = s.text.replace(/<[^>]+>/g, '').split(/[.!?](\s|$)/).filter((x) => x && x.trim().length > 3).length;
    assert.ok(sentences >= 1 && sentences <= 3, `${id}: ${sentences} Sätze`);
    assert.ok(s.target, `${id} hebt ein Element hervor`);
  }
  // In der Etappe blockieren die Hinweise nichts (Toast) und sitzen als Sprechblase in der Bildmitte (nie über dem HUD)
  assert.deepEqual(TUTORIAL_ORDER.filter((id) => TUTORIAL_STEPS[id].mode === 'toast'), ['launch', 'fly']);
  for (const id of ['launch', 'fly']) assert.equal(TUTORIAL_STEPS[id].place, 'mid', id);
});

test('Tutorial: Etappen-Hinweise nur, wenn erlaubt (beim Zielen) – sonst warten sie; holdToasts schließt sie beim Abschuss', () => {
  let aiming = false;
  const k = makeTutorial(defaultSave(), (step) => step.mode !== 'toast' || aiming);
  k.t.trigger('launch');
  k.t.trigger('fly');
  k.run(TUTORIAL.showDelay * 1000);
  assert.equal(k.shown.length, 0, 'im Flug kein Hinweis');
  aiming = true;
  k.t.poke();
  assert.deepEqual(k.shown.map((x) => x.id), ['launch']);
  aiming = false;           // Abschuss
  k.t.holdToasts();
  assert.equal(k.t.isOpen, false);
  k.run(TUTORIAL.showDelay * 1000);
  assert.deepEqual(k.shown.map((x) => x.id), ['launch'], '„fly“ wartet auf das nächste Zielen');
  k.t.trigger('items');     // Karten-Hinweise sind immer erlaubt
  k.run(TUTORIAL.showDelay * 1000);
  assert.deepEqual(k.shown.map((x) => x.id), ['launch', 'items']);
  k.t.close();
  k.run(TUTORIAL.showDelay * 1000);   // im Flug: wartet weiter
  assert.deepEqual(k.shown.map((x) => x.id), ['launch', 'items']);
  aiming = true;
  k.t.poke();
  assert.deepEqual(k.shown.map((x) => x.id), ['launch', 'items', 'fly']);
});

test('Tutorial: Auslösen zeigt den Hinweis nach der Verzögerung und merkt ihn sich', () => {
  const k = makeTutorial();
  assert.equal(tutorialWants(k.save, 'garage'), true);
  assert.equal(k.t.trigger('garage'), true);
  assert.equal(k.shown.length, 0, 'erst nach TUTORIAL.showDelay');
  k.run(TUTORIAL.showDelay * 1000);
  assert.deepEqual(k.shown.map((s) => s.id), ['garage']);
  assert.equal(k.t.isOpen, true);
  assert.equal(k.save.tutorial.seen.garage, 1, 'beim Zeigen als gesehen gespeichert');
  assert.ok(k.persisted >= 1);
  assert.equal(k.shown[0].n, 1);
  assert.equal(k.shown[0].total, TUTORIAL_ORDER.length);
});

test('Tutorial: jeder Hinweis erscheint nur einmal (auch nach Neustart mit gespeichertem Stand)', () => {
  const k = makeTutorial();
  k.t.trigger('map');
  k.run();
  k.t.close();
  assert.equal(k.t.trigger('map'), false, 'schon gesehen');
  k.run();
  assert.equal(k.shown.filter((s) => s.id === 'map').length, 1);
  // Neustart: Spielstand exportieren/importieren → Fortschritt bleibt
  const again = makeTutorial(importSave(exportSave(k.save)));
  assert.equal(again.t.trigger('map'), false);
  assert.equal(again.t.trigger('garage'), true);
  // doppelt auslösen, während er wartet → nur einmal eingereiht
  assert.equal(again.t.trigger('garage'), false);
  again.run();
  assert.equal(again.shown.length, 1);
});

test('Tutorial: Warteschlange – mehrere Hinweise nacheinander, Toasts schließen sich selbst', () => {
  const k = makeTutorial();
  k.t.trigger('launch');
  k.t.trigger('fly');
  k.run(TUTORIAL.showDelay * 1000);
  assert.deepEqual(k.shown.map((s) => s.id), ['launch']);
  assert.equal(k.shown[0].mode, 'toast');
  // Toast verschwindet nach TUTORIAL.toastTime von selbst, dann kommt der nächste
  k.run(TUTORIAL.toastTime * 1000);
  assert.deepEqual(k.shown.map((s) => s.id), ['launch', 'fly']);
  assert.ok(k.hidden >= 1);
});

test('Tutorial: dropToasts verwirft Etappen-Hinweise, Karten-Hinweise bleiben', () => {
  const k = makeTutorial();
  k.t.trigger('launch');
  k.t.trigger('fly');
  k.t.trigger('items');
  k.run(TUTORIAL.showDelay * 1000);   // „launch“ sichtbar
  k.t.dropToasts();
  assert.equal(k.t.isOpen, false);
  k.run(TUTORIAL.showDelay * 1000);
  assert.deepEqual(k.shown.map((s) => s.id), ['launch', 'items'], '„fly“ verworfen (noch nicht gesehen → kommt in der nächsten Etappe)');
  assert.equal(tutorialWants(k.save, 'fly'), true);
});

test('Tutorial: „Alle Hinweise aus“ und Zurücksetzen (Einstellungen)', () => {
  const k = makeTutorial();
  k.t.trigger('garage');
  k.t.trigger('map');
  k.run(TUTORIAL.showDelay * 1000);
  k.t.skipAll();
  assert.equal(k.save.tutorial.off, true);
  assert.equal(k.t.isOpen, false);
  k.run();
  assert.equal(k.shown.length, 1, 'eingereihte Hinweise entfallen');
  assert.equal(k.t.trigger('shop'), false, 'aus = nichts mehr');
  assert.equal(tutorialProgress(k.save).done, true);
  resetTutorial(k.save);
  assert.equal(k.save.tutorial.off, false);
  assert.deepEqual(k.save.tutorial.seen, {});
  assert.equal(k.t.trigger('garage'), true, 'nach dem Zurücksetzen erscheint der Hinweis wieder');
  k.run();
  assert.equal(k.shown.filter((s) => s.id === 'garage').length, 2);
});

test('Tutorial: Fortschritt zählt gesehene Hinweise; unbekannte Hinweise werden ignoriert', () => {
  const s = defaultSave();
  assert.deepEqual(tutorialProgress(s), { seen: 0, total: TUTORIAL_ORDER.length, off: false, done: false });
  markSeen(s, 'garage');
  markSeen(s, 'map');
  assert.equal(tutorialProgress(s).seen, 2);
  for (const id of TUTORIAL_ORDER) markSeen(s, id);
  assert.equal(tutorialProgress(s).done, true);
  assert.equal(tutorialWants(s, 'gibtsnicht'), false);
  skipTutorial(s);
  assert.equal(tutorialProgress(s).off, true);
});

test('Spielstand: Tutorial-Fortschritt und neue Einstellungen werden migriert und geprüft', () => {
  // neuer Spielstand: Tutorial an
  const n = migrate(JSON.parse(JSON.stringify(defaultSave())));
  assert.equal(n.tutorial.off, false);
  // Spielstand aus Phase 6 (ohne tutorial.seen) mit gespielten Runs: keine Hinweise mehr
  const old = defaultSave();
  delete old.tutorial.seen;
  delete old.tutorial.off;
  old.stats.runs = 4;
  delete old.settings.sfxVol;
  delete old.settings.quality;
  const m = migrate(old);
  assert.equal(m.tutorial.off, true);
  assert.deepEqual(m.tutorial.seen, {});
  assert.equal(m.settings.sfxVol, AUDIO.defaultSfx);
  assert.equal(m.settings.quality, RENDER.defaultQuality);
  // Phase-6-Stand ohne Spielerfahrung: Tutorial bleibt an
  const fresh = defaultSave();
  delete fresh.tutorial.seen;
  assert.equal(migrate(fresh).tutorial.off, false);
  // falsche Werte werden repariert
  const bad = defaultSave();
  bad.settings.sfxVol = 7;
  bad.settings.musicVol = -2;
  bad.settings.quality = 'ultra';
  bad.settings.slowmo = 'ja';
  bad.tutorial.seen = { garage: 1, map: 'x', fly: true };
  const r = migrate(bad);
  assert.equal(r.settings.sfxVol, 1);
  assert.equal(r.settings.musicVol, 0);
  assert.equal(r.settings.quality, RENDER.defaultQuality);
  assert.equal(r.settings.slowmo, true);
  assert.deepEqual(r.tutorial.seen, { garage: 1 });
});

test('Einstellungen: Lautstärke und Grafikqualität überstehen Export/Import', () => {
  const s = defaultSave();
  s.settings.sfxVol = 0.35;
  s.settings.musicVol = 0.1;
  s.settings.quality = 'low';
  s.settings.slowmo = false;
  const back = importSave(exportSave(s));
  assert.equal(back.settings.sfxVol, 0.35);
  assert.equal(back.settings.musicVol, 0.1);
  assert.equal(back.settings.quality, 'low');
  assert.equal(back.settings.slowmo, false);
  // Qualitätsstufen: Pixel-Ratio steigt, „Mittel“ = bisheriger Höchstwert
  assert.ok(RENDER.pixelRatio.low < RENDER.pixelRatio.mid && RENDER.pixelRatio.mid < RENDER.pixelRatio.high);
  assert.equal(RENDER.pixelRatio.mid, RENDER.maxPixelRatio);
});

// ---------- Zurück-Taste ----------
const base = { modal: false, tutorial: false, devMenu: false, itemSheet: false, settings: false, state: 'garage', paused: false, run: null, runHasCont: false, runHasBack: false, pickerOpen: false, tab: 'garage', testResults: false };
const back = (o) => backAction({ ...base, ...o });

test('Zurück-Taste: oberste Ebene zuerst (Dialog → Hinweis → Dev-Menü → Inventar → Einstellungen)', () => {
  assert.equal(back({ modal: true, tutorial: true, devMenu: true, settings: true }), 'closeModal');
  assert.equal(back({ tutorial: true, devMenu: true, state: 'stage' }), 'closeTutorial');
  assert.equal(back({ devMenu: true, settings: true }), 'closeDev');
  assert.equal(back({ itemSheet: true, run: 'choice' }), 'closeItemSheet');
  assert.equal(back({ settings: true, state: 'stage', paused: true }), 'closeSettings');
  for (const s of [{}, { modal: true }, { state: 'stage' }, { state: 'map', run: 'dealer' }]) assert.ok(BACK_ACTIONS.includes(back(s)));
});

test('Zurück-Taste: Garage → Teile-Auswahl/Reiter schließen, sonst „Spiel beenden?“', () => {
  assert.equal(back({ pickerOpen: true }), 'closePicker');
  assert.equal(back({ tab: 'lab' }), 'garageTab');
  assert.equal(back({ tab: 'stats' }), 'garageTab');
  assert.equal(back({}), 'exitAsk');
});

test('Zurück-Taste: Karte → Garage, Etappe → Pause ↔ weiter', () => {
  assert.equal(back({ state: 'map' }), 'mapToGarage');
  assert.equal(back({ state: 'map', run: 'intro' }), 'introBack');
  assert.equal(back({ state: 'stage' }), 'pause');
  assert.equal(back({ state: 'stage', paused: true }), 'resume');
  // Paket A: Zielansicht mit Intro-Banner (Knoten noch nicht betreten) → zurück zur Karte, ohne Kosten
  assert.equal(back({ state: 'stage', aimBack: true }), 'stageBack');
  assert.equal(back({ state: 'stage', aimBack: true, paused: true }), 'resume');
  assert.equal(back({ state: 'results', testResults: true }), 'testResultsGarage');
});

test('Zurück-Taste: Run-Bildschirme', () => {
  assert.equal(back({ state: 'results', run: 'result' }), 'runPrimary');
  assert.equal(back({ state: 'map', run: 'act' }), 'runPrimary');
  assert.equal(back({ state: 'runEnd', run: 'end' }), 'runPrimary');
  assert.equal(back({ state: 'map', run: 'choice' }), 'choiceHint', 'Item-Auswahl nur über die Knöpfe');
  assert.equal(back({ state: 'results', run: 'result', runHasPick: true }), 'choiceHint', 'Ergebnis mit Beute: erst wählen');
  assert.equal(back({ state: 'map', run: 'replace', runHasBack: true }), 'runBack');
  assert.equal(back({ state: 'map', run: 'pick', runHasBack: true }), 'runBack');
  assert.equal(back({ state: 'map', run: 'pick', runHasBack: false }), 'choiceHint');
  for (const shop of ['dealer', 'workbench', 'blackmarket']) assert.equal(back({ state: 'map', run: shop }), 'askLeaveShop');
  assert.equal(back({ state: 'map', run: 'treasure' }), 'askLeaveShop');
  assert.equal(back({ state: 'map', run: 'treasure', runHasCont: true }), 'runContinue');
  assert.equal(back({ state: 'map', run: 'event' }), 'shopHint', 'Ereignis: erst entscheiden');
  assert.equal(back({ state: 'map', run: 'event', runHasCont: true }), 'runContinue');
  assert.equal(back({ state: 'map', run: 'station' }), 'shopHint');
});

// ---------- Version & App-Bau ----------
test('Version 1.0.0 überall gleich (package.json, Spiel), App-Name „Schleuderwerk“', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const cap = JSON.parse(readFileSync(new URL('../capacitor.config.json', import.meta.url), 'utf8'));
  assert.equal(pkg.version, '1.0.0');
  assert.equal(GAME_VERSION, pkg.version);
  assert.equal(cap.appName, 'Schleuderwerk');
  assert.equal(cap.webDir, 'www');
  for (const dep of ['@capacitor/app', '@capacitor/haptics', '@capacitor/android', '@capacitor/core']) assert.ok(pkg.dependencies[dep], dep);
});
