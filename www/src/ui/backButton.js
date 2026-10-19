// Android-Zurück-Taste (und Esc am PC): entscheidet, was „zurück“ gerade bedeutet – immer die oberste Ebene.
// Reine Logik ohne DOM (tests/ui.test.mjs); main.js baut den Zustand (backSnapshot) und führt die Aktion aus.
//
// s: { modal, tutorial, keys (Tastenbelegung), devMenu, itemSheet, settings, state ('garage'|'map'|'stage'|'results'|'runEnd'), paused,
//      run: Art des Run-Overlays oder null ('intro'|'result'|'choice'|'replace'|'pick'|'station'|'act'|'end'|
//           'dealer'|'workbench'|'blackmarket'|'event'|'treasure'), runHasCont, runHasBack,
//      pickerOpen, tab, testResults }
// Ergebnis: Name der Aktion (siehe BACK_ACTIONS).
export const BACK_ACTIONS = [
  'closeModal',      // Bestätigungsdialog: wie „Abbrechen“
  'closeTutorial',   // Hinweis schließen
  'closeKeys',       // Tastenbelegung (PC) schließen
  'closeDev', 'closeItemSheet', 'closeSettings',
  'runBack',         // Overlay-Knopf „◀ Zurück“ (Ersetzen, Platz wählen)
  'runContinue',     // Overlay-Knopf „Weiter ▶“ (Ereignis/Schatz erledigt)
  'askLeaveShop',    // „Laden verlassen?“ → Weiter ▶
  'choiceHint',      // Item-Auswahl: nur über die Knöpfe (Hinweis zeigen)
  'shopHint',        // Ereignis/Tankstelle: erst entscheiden (Hinweis zeigen)
  'introBack',       // Etappen-Intro → Karte
  'runPrimary',      // Ergebnis/Akt-Übergang/Run-Ende: Haupt-Knopf (Weiter/Zur Garage)
  'closePicker', 'garageTab',
  'pause', 'resume',
  'mapToGarage',     // Karte → Garage (der Run bleibt gespeichert)
  'testResultsGarage',
  'exitAsk',         // Garage → „Spiel beenden?“
  'none',
];

const SHOPS = new Set(['dealer', 'workbench', 'blackmarket']);

export function backAction(s) {
  if (s.modal) return 'closeModal';
  if (s.tutorial) return 'closeTutorial';
  if (s.keys) return 'closeKeys';
  if (s.devMenu) return 'closeDev';
  if (s.itemSheet) return 'closeItemSheet';
  if (s.settings) return 'closeSettings';
  const r = s.run;
  if (r) {
    if (r === 'replace' || r === 'pick') return s.runHasBack ? 'runBack' : 'choiceHint';
    if (r === 'choice') return 'choiceHint';
    if (SHOPS.has(r)) return 'askLeaveShop';
    if (r === 'treasure') return s.runHasCont ? 'runContinue' : 'askLeaveShop';
    if (r === 'event') return s.runHasCont ? 'runContinue' : 'shopHint';
    if (r === 'station') return 'shopHint';
    if (r === 'intro') return 'introBack';
    if (r === 'result' || r === 'act' || r === 'end') return 'runPrimary';
  }
  if (s.state === 'stage') return s.paused ? 'resume' : 'pause';
  if (s.state === 'results') return s.testResults ? 'testResultsGarage' : 'none';
  if (s.state === 'garage') {
    if (s.pickerOpen) return 'closePicker';
    if (s.tab && s.tab !== 'garage') return 'garageTab';
    return 'exitAsk';
  }
  if (s.state === 'map') return 'mapToGarage';
  return 'none';
}
