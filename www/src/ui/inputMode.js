// Eingabe-Art der Oberfläche: Touch (Handy) oder Maus/Tastatur (PC).
// Am PC (pointer: fine bzw. kein Touch) zeigen Hinweise, Tutorial-Texte und HUD-Beschriftungen die Tasten;
// <html> bekommt die Klasse „kbd“ (CSS: .kbd-only / .touch-only). Die Steuerung selbst funktioniert immer mit beidem.
// Reine Logik + Texte (ohne DOM) → tests/keynav.test.mjs; applyInputMode() setzt die Klasse im Browser.

export const inputMode = { kbd: false };

// env: { fine: matchMedia('(pointer: fine)'), maxTouchPoints, touchEvents: 'ontouchstart' in window }
export function prefersKeyboard(env) {
  if (!env) return false;
  if (env.fine) return true;
  return !(env.maxTouchPoints > 0) && !env.touchEvents;
}

// Im Browser: Art bestimmen, Klasse setzen, bei Änderung (z. B. Maus angesteckt) erneut. onChange(kbd) optional.
export function applyInputMode(win = window, onChange = null) {
  const mq = win.matchMedia ? win.matchMedia('(pointer: fine)') : null;
  const set = () => {
    const on = prefersKeyboard({ fine: !!(mq && mq.matches), maxTouchPoints: win.navigator.maxTouchPoints || 0, touchEvents: 'ontouchstart' in win });
    const changed = on !== inputMode.kbd;
    inputMode.kbd = on;
    win.document.documentElement.classList.toggle('kbd', on);
    if (changed && onChange) onChange(on);
  };
  set();
  if (mq && mq.addEventListener) mq.addEventListener('change', set);
  return inputMode.kbd;
}

// Fähigkeits-Modus als Text („halten“ bzw. „tippen“ / am PC „drücken“)
export const modeLabel = (mode, kbd = inputMode.kbd) => (mode === 'hold' ? 'halten' : kbd ? 'drücken' : 'tippen');

// Tasten-Beschriftung des Fähigkeits-Knopfs i (Leertaste gehört zur Boost-Fähigkeit)
export function abilityKeyLabel(i, boostSlot = 0) {
  const n = String(i + 1);
  return i === boostSlot ? `${n} · Leer` : n;
}

// Eine Zeile für den Startbildschirm / die Garage
export const KEY_LINE = 'Tastatur: Leertaste halten = Abschuss/Boost · ←/→ neigen · ↑/↓ Winkel · 1–4 Fähigkeiten · Enter = OK · Esc = zurück · K = alle Tasten';

// Tastenbelegung (Pause/Einstellungen → „Tastenbelegung“, README)
export const KEY_HELP = [
  { group: 'Etappe', rows: [
    ['Leertaste halten', 'Abschuss: Kraft laden – loslassen im grünen Bereich'],
    ['↑ / ↓', 'Winkel beim Zielen (steiler / flacher)'],
    ['← / →', 'im Flug neigen: Nase hoch / Nase runter'],
    ['Leertaste (im Flug)', 'Boost halten (Fähigkeit mit Rakete)'],
    ['1 – 4', 'Fähigkeit 1–4 (halten bzw. drücken)'],
    ['Esc / P', 'Pause'],
  ] },
  { group: 'Menüs', rows: [
    ['Tab / Umschalt+Tab', 'nächster / vorheriger Knopf'],
    ['Pfeiltasten', 'Auswahl bewegen'],
    ['Enter / Leertaste', 'gewählten Knopf drücken'],
    ['Enter (nichts gewählt)', 'Hauptaktion: RUN STARTEN, LOS, Weiter, Nehmen …'],
    ['Esc', 'zurück / schließen'],
    ['K', 'diese Tastenübersicht'],
  ] },
  { group: 'Bildschirme', rows: [
    ['Garage: Q / E', 'Chassis wechseln (ohne Auswahl auch ← / →)'],
    ['Karte: Pfeiltasten', 'erreichbaren Knoten wählen, Enter = betreten'],
    ['Karte: I', 'Rucksack (Inventar)'],
    ['Item-Auswahl: 1 / 2 / 3', 'Item nehmen'],
    ['Item-Auswahl: S', 'überspringen'],
    ['Ereignis / Tankstelle: 1 – 4', 'Antwort wählen'],
  ] },
];

export function keyHelpHtml(esc = (s) => s) {
  return KEY_HELP.map((g) => `<h3>${esc(g.group)}</h3><div class="kh-rows">${g.rows.map(([k, t]) => `<div class="kh-row"><kbd>${esc(k)}</kbd><span>${esc(t)}</span></div>`).join('')}</div>`).join('');
}
