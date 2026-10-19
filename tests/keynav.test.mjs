// PC-Version: Tastatur-Bedienung der Menüs (ui/keyNav.js), Eingabe-Art und Tasten-Texte (ui/inputMode.js),
// Tastatur-Varianten der Tutorial-Hinweise, Zurück-Taste für die Tastenübersicht.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keyLayer, primaryFor, shortcutFor, menuKey, pickSpatial, cycleIndex, arrowDir, LAYERS } from '../www/src/ui/keyNav.js';
import { prefersKeyboard, abilityKeyLabel, modeLabel, KEY_HELP, KEY_LINE, keyHelpHtml } from '../www/src/ui/inputMode.js';
import { TUTORIAL_STEPS, stepText } from '../www/src/ui/tutorial.js';
import { backAction, BACK_ACTIONS } from '../www/src/ui/backButton.js';
import { CONTROLS } from '../www/src/data/balance.js';

const S = (o = {}) => ({ captured: false, modal: false, tutorialCard: false, keys: false, devMenu: false, itemSheet: false, settings: false, pause: false, run: null, pickerOpen: false, state: 'garage', testResults: false, focused: false, typing: false, focusRange: false, ...o });
const K = (code, o = {}) => ({ code, key: code, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, repeat: false, ...o });
const key = (s, code, o) => menuKey(S(s), K(code, o));

test('Eingabe-Art: Maus/Tastatur (pointer: fine) oder kein Touch → PC, sonst Handy', () => {
  assert.equal(prefersKeyboard({ fine: true, maxTouchPoints: 0, touchEvents: false }), true);
  assert.equal(prefersKeyboard({ fine: true, maxTouchPoints: 10, touchEvents: true }), true, 'Laptop mit Touchscreen, aber Maus');
  assert.equal(prefersKeyboard({ fine: false, maxTouchPoints: 0, touchEvents: false }), true, 'keine Touch-Eingabe');
  assert.equal(prefersKeyboard({ fine: false, maxTouchPoints: 5, touchEvents: true }), false, 'Handy');
  assert.equal(prefersKeyboard(null), false);
});

test('Tasten-Texte: Fähigkeits-Knöpfe zeigen ihre Taste, Leertaste beim Boost', () => {
  assert.equal(abilityKeyLabel(0, 0), '1 · Leer');
  assert.equal(abilityKeyLabel(1, 0), '2');
  assert.equal(abilityKeyLabel(2, 2), '3 · Leer');
  assert.equal(CONTROLS.abilityKeys.length, 4, 'Ziffern 1–4');
  assert.equal(modeLabel('hold', true), 'halten');
  assert.equal(modeLabel('tap', true), 'drücken');
  assert.equal(modeLabel('tap', false), 'tippen');
  // Tastenübersicht: alle Gruppen mit Zeilen, als HTML mit <kbd>
  assert.deepEqual(KEY_HELP.map((g) => g.group), ['Etappe', 'Menüs', 'Bildschirme']);
  const html = keyHelpHtml();
  for (const g of KEY_HELP) for (const [k] of g.rows) assert.ok(html.includes(`<kbd>${k}</kbd>`), k);
  // Startbildschirm-Zeile steht so auch in index.html (nur am PC sichtbar)
  const index = readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
  assert.ok(index.includes(KEY_LINE), 'index.html enthält die Tastatur-Zeile');
  assert.match(index, /class="boot-keys kbd-only"/);
});

test('Tutorial: Tastatur-Varianten der Steuerungs-Hinweise (1–3 Sätze, keine Touch-Wörter)', () => {
  for (const id of ['garage', 'map', 'launch', 'fly', 'items', 'shop', 'lab']) assert.ok(TUTORIAL_STEPS[id].textKbd, id);
  for (const [id, s] of Object.entries(TUTORIAL_STEPS)) {
    const t = stepText(s, true);
    assert.equal(stepText(s, false), s.text, `${id}: Handy-Text unverändert`);
    assert.doesNotMatch(t, /Finger|[Tt]ipp|antipp|Bildschirmhälfte|ziehen ändert/, `${id}: ${t}`);
    const sentences = t.replace(/<[^>]+>/g, '').split(/[.!?](\s|$)/).filter((x) => x && x.trim().length > 3).length;
    assert.ok(sentences >= 1 && sentences <= 3, `${id}: ${sentences} Sätze`);
  }
  assert.match(stepText(TUTORIAL_STEPS.launch, true), /Leertaste halten.*↑\/↓.*grünen Bereich/);
  assert.match(stepText(TUTORIAL_STEPS.fly, true), /←.*→.*1–4/);
});

test('Ebenen: immer die oberste (Dialog → Hinweis → Tasten → Dev → Inventar → Einstellungen → Pause → Run → Garage/Karte)', () => {
  assert.equal(keyLayer(S({ modal: true, tutorialCard: true, settings: true, run: 'choice' })), 'modal');
  assert.equal(keyLayer(S({ tutorialCard: true, run: 'intro' })), 'tutorial');
  assert.equal(keyLayer(S({ keys: true, settings: true, pause: true })), 'keys');
  assert.equal(keyLayer(S({ devMenu: true, settings: true })), 'dev');
  assert.equal(keyLayer(S({ itemSheet: true, run: 'choice' })), 'itemSheet');
  assert.equal(keyLayer(S({ settings: true, pause: true })), 'settings');
  assert.equal(keyLayer(S({ pause: true, state: 'stage' })), 'pause');
  assert.equal(keyLayer(S({ run: 'dealer', state: 'map' })), 'run');
  assert.equal(keyLayer(S({ pickerOpen: true })), 'picker');
  assert.equal(keyLayer(S()), 'garage');
  assert.equal(keyLayer(S({ state: 'map' })), 'map');
  assert.equal(keyLayer(S({ state: 'results', testResults: true })), 'results');
  assert.equal(keyLayer(S({ state: 'results' })), 'none', 'Etappe vorbei, Ergebnis noch nicht da');
  assert.equal(keyLayer(S({ state: 'stage' })), 'none');
  for (const s of [S(), S({ modal: true }), S({ state: 'stage' })]) assert.ok(LAYERS.includes(keyLayer(s)));
});

test('Hauptaktion (Enter ohne Auswahl) auf jedem Bildschirm', () => {
  const first = (layer, s) => primaryFor(layer, s)[0];
  assert.deepEqual(first('garage'), { sel: '[data-id=start]', how: 'click' }, 'RUN STARTEN');
  assert.deepEqual(first('run', { run: 'intro' }), { sel: '[data-a=go]', how: 'click' }, 'LOS');
  assert.equal(first('run', { run: 'result' }).sel, '[data-a=next]', 'Weiter');
  assert.deepEqual(primaryFor('run', { run: 'result' }).map((p) => p.sel), ['[data-a=next]', '[data-a=retry]', '[data-a=end]'], 'Neuversuch / Run beenden, wenn kein Weiter');
  assert.deepEqual(primaryFor('run', { run: 'treasure' }).map((p) => p.sel), ['[data-a=cont]', '[data-a=take]'], 'Nehmen');
  for (const k of ['dealer', 'workbench', 'blackmarket']) assert.equal(first('run', { run: k }).sel, '[data-a=leave]', k);
  assert.equal(first('run', { run: 'act' }).sel, '[data-a=next]');
  assert.equal(first('run', { run: 'end' }).sel, '[data-a=garage]');
  assert.equal(first('pause').sel, '[data-a=resume]');
  assert.equal(first('settings').sel, '[data-a=close]');
  assert.equal(first('tutorial').sel, '[data-a=ok]');
  assert.equal(first('modal').sel, '.btn-danger');
  // echte Entscheidungen: nur auswählen, nichts ungefragt nehmen
  for (const k of ['choice', 'replace', 'pick', 'station']) assert.equal(first('run', { run: k }).how, 'focus', k);
  assert.deepEqual(first('map'), { sel: '.mnode.reach', how: 'focus' });
  assert.equal(primaryFor('run', { run: 'event' }).at(-1).how, 'focus', 'Ereignis ohne Ergebnis: Antwort wählen');
  assert.deepEqual(primaryFor('none'), []);
});

test('Enter/Leertaste: gewählten Knopf drücken, sonst Hauptaktion (Leertaste nie ungezielt)', () => {
  assert.deepEqual(key({ focused: true }, 'Enter'), { type: 'activate' });
  assert.deepEqual(key({ focused: true }, 'Space'), { type: 'activate' });
  assert.deepEqual(key({ focused: true }, 'NumpadEnter'), { type: 'activate' });
  const p = key({}, 'Enter');
  assert.equal(p.type, 'primary');
  assert.equal(p.list[0].sel, '[data-id=start]');
  assert.deepEqual(key({}, 'Space'), { type: 'none' }, 'Leertaste ohne Auswahl tut nichts (wird nur abgefangen)');
  assert.deepEqual(key({ focused: true }, 'Enter', { repeat: true }), { type: 'none' }, 'gehaltene Taste löst nicht mehrfach aus');
  assert.deepEqual(key({ run: 'result', state: 'results' }, 'Space', { repeat: true }), { type: 'none' }, 'Boost-Leertaste aus der Etappe drückt nicht „Weiter“');
  assert.equal(key({ run: 'intro', state: 'map' }, 'Enter').list[0].sel, '[data-a=go]');
});

test('Tab und Pfeiltasten bewegen den Fokus; Schieberegler und Textfelder behalten ihre Tasten', () => {
  assert.deepEqual(key({}, 'Tab'), { type: 'tab', back: false });
  assert.deepEqual(key({}, 'Tab', { shiftKey: true }), { type: 'tab', back: true });
  assert.deepEqual(key({ settings: true, focused: true }, 'ArrowDown'), { type: 'move', dir: 'down' });
  assert.equal(key({ settings: true, focused: true, focusRange: true }, 'ArrowLeft'), null, 'Lautstärke-Regler');
  assert.equal(key({ settings: true, typing: true }, 'Enter'), null, 'Spielstand-Textfeld');
  assert.equal(key({ settings: true, typing: true }, 'Space'), null);
  assert.equal(key({}, 'KeyA'), null, 'andere Tasten bleiben frei');
  assert.equal(key({}, 'Tab', { ctrlKey: true }), null, 'Browser-Kürzel bleiben frei');
  assert.equal(arrowDir('ArrowUp'), 'up');
  assert.equal(arrowDir('KeyW'), null);
});

test('Keine Konflikte mit dem Fahrzeug: in der laufenden Etappe gehören Leertaste/Pfeile/Ziffern dem Spiel', () => {
  const play = { captured: true, state: 'stage' };
  for (const c of ['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Digit1', 'Digit2', 'Enter', 'Tab', 'KeyK', 'KeyQ']) assert.equal(key(play, c), null, c);
  assert.deepEqual(key(play, 'KeyP'), { type: 'pause' });
  assert.equal(key(play, 'KeyP', { repeat: true }), null);
  // Pause: P/Enter = weiter
  assert.deepEqual(key({ state: 'stage', pause: true }, 'KeyP'), { type: 'click', sel: '[data-a=resume]' });
  assert.equal(key({ state: 'stage', pause: true }, 'Enter').list[0].sel, '[data-a=resume]');
});

test('Kürzel: Garage Q/E (ohne Auswahl ←/→), Karte Pfeile/I, Item-Auswahl 1/2/3/S, Ereignis/Tankstelle Ziffern, K', () => {
  assert.deepEqual(key({}, 'KeyQ'), { type: 'chassis', dir: -1 });
  assert.deepEqual(key({}, 'KeyE'), { type: 'chassis', dir: 1 });
  assert.deepEqual(key({}, 'ArrowLeft'), { type: 'chassis', dir: -1 });
  assert.deepEqual(key({}, 'ArrowRight'), { type: 'chassis', dir: 1 });
  assert.deepEqual(key({ focused: true }, 'ArrowRight'), { type: 'move', dir: 'right' }, 'mit Auswahl: Fokus bewegen');
  assert.deepEqual(key({ focused: true }, 'KeyE'), { type: 'chassis', dir: 1 }, 'Q/E immer');
  assert.deepEqual(key({}, 'ArrowDown'), { type: 'move', dir: 'down' });
  assert.equal(key({ pickerOpen: true }, 'KeyQ'), null, 'nicht in der Teile-Auswahl');

  for (const [c, dir] of [['ArrowLeft', 'left'], ['ArrowRight', 'right'], ['ArrowUp', 'up'], ['ArrowDown', 'down']]) assert.deepEqual(key({ state: 'map' }, c), { type: 'mapMove', dir });
  assert.deepEqual(key({ state: 'map' }, 'ArrowRight', { repeat: true }), { type: 'mapMove', dir: 'right' }, 'gehaltener Pfeil wandert weiter');
  assert.deepEqual(key({ state: 'map' }, 'KeyI'), { type: 'click', sel: '[data-id=items]' });

  const ch = { state: 'results', run: 'choice' };
  assert.deepEqual(key(ch, 'Digit1'), { type: 'click', sel: '[data-pick="0"]' });
  assert.deepEqual(key(ch, 'Digit3'), { type: 'click', sel: '[data-pick="2"]' });
  assert.deepEqual(key(ch, 'Numpad2'), { type: 'click', sel: '[data-pick="1"]' });
  assert.deepEqual(key(ch, 'KeyS'), { type: 'click', sel: '[data-a=skip]' });
  assert.deepEqual(key(ch, 'Digit1', { repeat: true }), { type: 'none' }, 'gehaltene Ziffer nimmt nicht zweimal');
  assert.deepEqual(key({ state: 'map', run: 'event' }, 'Digit2'), { type: 'click', sel: '[data-opt="1"]' });
  assert.deepEqual(key({ state: 'map', run: 'station' }, 'Digit3'), { type: 'click', sel: '[data-choice]', nth: 2 });
  assert.equal(key({ state: 'map', run: 'dealer' }, 'Digit1'), null, 'im Laden keine Ziffern-Käufe');

  assert.deepEqual(key({}, 'KeyK'), { type: 'keys' });
  assert.deepEqual(key({ state: 'stage', pause: true }, 'KeyK'), { type: 'keys' });
  assert.deepEqual(key({ keys: true, settings: true }, 'KeyK'), { type: 'click', sel: '[data-a=close]' });
  assert.equal(key({ modal: true }, 'KeyK'), null);
  assert.equal(key({ tutorialCard: true }, 'KeyK'), null);
});

test('Räumliche Navigation: nächstes Element in Pfeilrichtung, sonst Dokument-Reihenfolge', () => {
  // 2×2-Raster + ein breiter Knopf darunter
  const R = [
    { x: 0, y: 0, w: 100, h: 40 }, { x: 120, y: 0, w: 100, h: 40 },
    { x: 0, y: 60, w: 100, h: 40 }, { x: 120, y: 60, w: 100, h: 40 },
    { x: 0, y: 120, w: 220, h: 50 },
  ];
  assert.equal(pickSpatial(R, 0, 'right'), 1);
  assert.equal(pickSpatial(R, 1, 'left'), 0);
  assert.equal(pickSpatial(R, 0, 'down'), 2);
  assert.equal(pickSpatial(R, 3, 'up'), 1);
  assert.equal(pickSpatial(R, 3, 'down'), 4);
  assert.equal(pickSpatial(R, 4, 'up'), 2, 'überlappende Spalte, nächster');
  assert.equal(pickSpatial(R, 1, 'right'), 2, 'nichts rechts → nächstes im Dokument');
  assert.equal(pickSpatial(R, 0, 'up'), -1, 'am Anfang bleibt der Fokus');
  assert.equal(pickSpatial(R, -1, 'down'), 0, 'ohne Fokus: erstes Element');
  assert.equal(pickSpatial([], 0, 'down'), -1);
  assert.equal(cycleIndex(3, 2, 1), 0);
  assert.equal(cycleIndex(3, 0, -1), 2);
  assert.equal(cycleIndex(3, -1, 1), 0);
  assert.equal(cycleIndex(3, -1, -1), 2);
  assert.equal(cycleIndex(0, -1, 1), -1);
});

test('Zurück-Taste (Esc): Tastenübersicht schließt vor Einstellungen/Pause', () => {
  const base = { modal: false, tutorial: false, keys: false, devMenu: false, itemSheet: false, settings: false, state: 'stage', paused: true, run: null, runHasCont: false, runHasBack: false, pickerOpen: false, tab: 'garage', testResults: false };
  assert.ok(BACK_ACTIONS.includes('closeKeys'));
  assert.equal(backAction({ ...base, keys: true, settings: true }), 'closeKeys');
  assert.equal(backAction({ ...base, keys: true, tutorial: true }), 'closeTutorial');
  assert.equal(backAction({ ...base, keys: true, modal: true }), 'closeModal');
  assert.equal(backAction({ ...base }), 'resume');
});
