// Tutorial: kurze, überspringbare Hinweise an den richtigen Momenten des ersten Runs.
// Jeder Hinweis erscheint höchstens einmal (Fortschritt im Spielstand: save.tutorial.seen = { id: 1 },
// save.tutorial.off = alle Hinweise aus). Zurücksetzen in den Einstellungen.
//
// Aufbau:
//   - TUTORIAL_STEPS / TUTORIAL_ORDER – die Hinweise (Daten)
//   - tutorialWants / markSeen / resetTutorial / skipTutorial / tutorialProgress – reine Logik auf dem Spielstand
//   - Tutorial – Warteschlange + Anzeige-Steuerung (Anzeige über einen „view“-Adapter → mit node --test testbar)
//   - TutorialView – die DOM-Anzeige (Karte mit Abdunklung bzw. „Toast“ während der Etappe)
// Arten: 'card' (Garage, Karte, Shops: dunkelt ab, „Verstanden ✔“) und 'toast' (Etappe: blockiert nichts,
// verschwindet nach TUTORIAL.toastTime Sekunden oder per Antippen).
import { el, show } from './dom.js';
import { TUTORIAL } from '../data/balance.js';
import { inputMode } from './inputMode.js';

export const TUTORIAL_STEPS = {
  garage: {
    icon: '🔧', title: 'Deine Garage', mode: 'card', place: 'top', target: '#garage [data-id=start]',
    text: 'Hier baust du deine Kiste: ◀ ▶ wählt das Chassis, darunter rüstest du Teile aus und verbesserst sie mit ⚙ Schrott. Unten wählst du zwei Fähigkeiten – dann <b>RUN STARTEN</b>!',
    textKbd: 'Hier baust du deine Kiste: <b>Q/E</b> wechselt das Chassis, mit <b>Tab/Pfeiltasten</b> wählst du Teile und Fähigkeiten, <b>Enter</b> drückt den markierten Knopf. Ohne Auswahl startet <b>Enter</b> den Run – RUN STARTEN!',
  },
  map: {
    icon: '🗺', title: 'Die Karte', mode: 'card', place: 'top', target: '#map .mnode.reach',
    text: 'Tippe einen <b>pulsierenden Knoten</b> an. ⚑ Etappen bringen Items, 🛒 Händler und 🔧 Werkbank helfen beim Bauen. Ganz oben wartet der Boss des Akts.',
    textKbd: 'Wähle mit den <b>Pfeiltasten</b> einen pulsierenden Knoten, <b>Enter</b> betritt ihn. ⚑ Etappen bringen Items, 🛒 Händler und 🔧 Werkbank helfen beim Bauen – ganz oben wartet der Boss.',
  },
  goal: {
    icon: '🏁', title: 'Zielmarke & Medaillen', mode: 'card', place: 'top', target: '#runui .ri-target',
    text: 'Erreichst du die Zielmarke, gibt es 🥉 Bronze – Silber und Gold bringen mehr. Schaffst du sie nicht, wirst du <b>abgeschleppt</b>: das kostet Haltbarkeit, dann darfst du nochmal.',
    textKbd: 'Erreichst du die Zielmarke, gibt es 🥉 Bronze – Silber und Gold bringen mehr. Schaffst du sie nicht, wirst du <b>abgeschleppt</b> und darfst nochmal. <b>Enter</b> = LOS!',
  },
  launch: {
    icon: '🎯', title: 'Abschuss', mode: 'toast', place: 'top', target: '#hud .power-meter',
    text: '<b>Finger irgendwo halten</b> – die Kraft pendelt. Hoch/runter ziehen ändert den Winkel. <b>Loslassen im grünen Bereich!</b>',
    textKbd: '<b>Leertaste halten</b> = Kraft (pendelt), <b>↑/↓</b> = Winkel. <b>Loslassen im grünen Bereich!</b>',
  },
  fly: {
    icon: '🪂', title: 'Fliegen', mode: 'toast', place: 'top', target: '#hud .ab-0',
    text: '<b>Links halten</b> = Nase hoch, <b>rechts halten</b> = Nase runter – möglichst gerade landen. Die runden Knöpfe unten rechts sind deine Fähigkeiten (🚀 Boost halten).',
    textKbd: '<b>←</b> = Nase hoch, <b>→</b> = Nase runter – möglichst gerade landen. <b>Leertaste halten</b> = 🚀 Boost, <b>1–4</b> = deine Fähigkeiten.',
  },
  resources: {
    icon: '⛽', title: 'Treibstoff, Hitze, Haltbarkeit', mode: 'toast', place: 'top', target: '#hud .res-bars',
    text: 'Unten links: ⛽ Treibstoff für Antrieb und Boost, 🌡 Hitze – bei 100 % überhitzt die Kiste, 🔧 Haltbarkeit gilt für den <b>ganzen Run</b>.',
  },
  items: {
    icon: '🎁', title: 'Items & Tags', mode: 'card', place: 'bottom', target: '#runui .ch-cards',
    text: 'Wähle ein Item. Die farbigen Chips sind <b>Tags</b>: 2, 4 oder 6 Items mit gleichem Tag schalten <b>Set-Boni</b> frei. Im 🎒 Rucksack siehst du deine Sets.',
    textKbd: 'Nimm ein Item mit <b>1/2/3</b> (<b>S</b> = überspringen). Die farbigen Chips sind <b>Tags</b>: 2, 4 oder 6 Items mit gleichem Tag schalten <b>Set-Boni</b> frei.',
  },
  shop: {
    icon: '🛒', title: 'Schrotthändler', mode: 'card', place: 'bottom', target: '#runui .sh-bar',
    text: 'Bezahlt wird mit 🔩 Schrauben aus dem Run. ↻ würfelt das Angebot neu, 📌 reserviert ein Item für den nächsten Händler. <b>Weiter ▶</b> verlässt den Laden.',
    textKbd: 'Bezahlt wird mit 🔩 Schrauben aus dem Run. ↻ würfelt neu, 📌 reserviert ein Item für den nächsten Händler (Tab/Pfeile wählen, Enter kauft). <b>Enter</b> ohne Auswahl = Weiter ▶.',
  },
  workbench: {
    icon: '🔧', title: 'Werkbank', mode: 'card', place: 'bottom', target: '#runui .wb-opts',
    text: 'Zwei gleiche Items mit gleichen ★ verschmelzen zu <b>★+1</b>. Zwei Items mit verschiedenen Tags werden ein <b>Hybrid</b> mit beiden Wirkungen. Zerlegen bringt Schrauben.',
  },
  lab: {
    icon: '🧪', title: 'Erfinder-Labor', mode: 'card', place: 'bottom', target: '#garage [data-tab=lab]',
    text: 'Dein erster Run ist vorbei! Im Reiter <b>🧪 Labor</b> erforschst du mit 📘 Blaupausen neue Items, Teile, Chassis und Kartenknoten.',
    textKbd: 'Dein erster Run ist vorbei! Im Reiter <b>🧪 Labor</b> (mit Tab erreichbar) erforschst du mit 📘 Blaupausen neue Items, Teile, Chassis und Kartenknoten.',
  },
};
export const TUTORIAL_ORDER = Object.keys(TUTORIAL_STEPS);

// Text eines Hinweises: am PC (Tastatur) die Variante textKbd, falls vorhanden
export const stepText = (step, kbd = false) => (kbd && step.textKbd) || step.text;

// ---------- reine Logik auf dem Spielstand ----------
function tut(save) {
  if (!save.tutorial || typeof save.tutorial !== 'object') save.tutorial = { runs: 0, seen: {}, off: false };
  if (!save.tutorial.seen || typeof save.tutorial.seen !== 'object') save.tutorial.seen = {};
  return save.tutorial;
}
// Soll der Hinweis id (noch) gezeigt werden?
export function tutorialWants(save, id) {
  const t = tut(save);
  return !!TUTORIAL_STEPS[id] && !t.off && t.seen[id] !== 1;
}
export function markSeen(save, id) { tut(save).seen[id] = 1; }
// Alle Hinweise wieder zeigen (Einstellungen)
export function resetTutorial(save) {
  const t = tut(save);
  t.seen = {};
  t.off = false;
}
// Alle Hinweise aus („Alle Hinweise aus“ im Hinweis)
export function skipTutorial(save) { tut(save).off = true; }
export function tutorialProgress(save) {
  const t = tut(save);
  const seen = TUTORIAL_ORDER.filter((id) => t.seen[id] === 1).length;
  return { seen, total: TUTORIAL_ORDER.length, off: !!t.off, done: !!t.off || seen === TUTORIAL_ORDER.length };
}

// ---------- Warteschlange + Anzeige ----------
// h: { getSave() → Spielstand, persist() → speichern, view: { show(step, id, n, total), hide() },
//      schedule(fn, ms) → Zeitgeber (Standard setTimeout), cancel(handle), onShow(id) }
export class Tutorial {
  constructor(h) {
    this.h = h;
    this.queue = [];
    this.current = null;      // id des sichtbaren Hinweises
    this.timer = null;
    this.hideTimer = null;
    this.schedule = h.schedule || ((fn, ms) => setTimeout(fn, ms));
    this.cancel = h.cancel || ((t) => clearTimeout(t));
  }

  get isOpen() { return this.current !== null; }
  get currentStep() { return this.current ? TUTORIAL_STEPS[this.current] : null; }

  // Hinweis auslösen (erscheint nach TUTORIAL.showDelay, wenn er noch nicht gezeigt wurde). → true = eingereiht
  trigger(id) {
    const save = this.h.getSave();
    if (!tutorialWants(save, id) || this.current === id || this.queue.includes(id)) return false;
    this.queue.push(id);
    if (!this.current && this.timer === null) this.timer = this.schedule(() => { this.timer = null; this.next(); }, TUTORIAL.showDelay * 1000);
    return true;
  }

  // nächsten Hinweis aus der Warteschlange zeigen
  next() {
    if (this.current) return;
    const save = this.h.getSave();
    while (this.queue.length) {
      const id = this.queue.shift();
      if (!tutorialWants(save, id)) continue;
      const step = TUTORIAL_STEPS[id];
      this.current = id;
      markSeen(save, id);
      if (this.h.persist) this.h.persist();
      const p = tutorialProgress(save);
      if (this.h.view) this.h.view.show(step, id, p.seen, p.total);
      if (this.h.onShow) this.h.onShow(id);
      if (step.mode === 'toast') this.hideTimer = this.schedule(() => { this.hideTimer = null; if (this.current === id) this.close(); }, TUTORIAL.toastTime * 1000);
      return;
    }
  }

  // sichtbaren Hinweis schließen („Verstanden“, Antippen, Zurück-Taste) → danach der nächste
  close() {
    if (!this.current) return;
    this.current = null;
    if (this.hideTimer !== null) { this.cancel(this.hideTimer); this.hideTimer = null; }
    if (this.h.view) this.h.view.hide();
    if (this.queue.length && this.timer === null) this.timer = this.schedule(() => { this.timer = null; this.next(); }, TUTORIAL.showDelay * 1000);
  }

  // Alle Hinweise aus (auch die eingereihten)
  skipAll() {
    skipTutorial(this.h.getSave());
    if (this.h.persist) this.h.persist();
    this.queue = [];
    this.close();
  }

  // Etappen-Hinweise verwerfen (Etappe vorbei): eingereihte und sichtbare Toasts
  dropToasts() {
    this.queue = this.queue.filter((id) => TUTORIAL_STEPS[id].mode !== 'toast');
    if (this.current && TUTORIAL_STEPS[this.current].mode === 'toast') this.close();
  }

  // Spielstand ersetzt (Import, Löschen): nichts mehr anzeigen
  clear() {
    this.queue = [];
    if (this.timer !== null) { this.cancel(this.timer); this.timer = null; }
    this.close();
  }
}

// ---------- DOM-Anzeige ----------
export class TutorialView {
  constructor(root, { onOk, onSkip }) {
    this.el = el(`<div id="tutorial" class="hidden">
      <div class="tut-scrim" data-id="scrim"></div>
      <div class="tut-card" data-id="card" role="dialog" aria-live="polite">
        <div class="tut-head"><span class="tut-icon" data-id="icon"></span><b data-id="title"></b><small data-id="count"></small></div>
        <p class="tut-text" data-id="text"></p>
        <div class="tut-btns" data-id="btns">
          <button class="btn btn-secondary tut-skip" data-a="skip">Alle Hinweise aus</button>
          <button class="btn btn-primary tut-ok" data-a="ok">Verstanden ✔<small class="kbd-only"> Enter</small></button>
        </div>
        <div class="tut-tap" data-id="tap"><span class="touch-only">antippen zum Schließen</span><span class="kbd-only">verschwindet von selbst · Esc schließt</span></div>
      </div>
    </div>`);
    root.appendChild(this.el);
    this.q = {};
    this.el.querySelectorAll('[data-id]').forEach((e) => { this.q[e.dataset.id] = e; });
    this.el.querySelector('[data-a=ok]').onclick = (e) => { e.stopPropagation(); onOk(); };
    this.el.querySelector('[data-a=skip]').onclick = (e) => { e.stopPropagation(); onSkip(); };
    // Toast: Antippen schließt (Karte selbst, nicht die Spielfläche)
    this.q.card.addEventListener('pointerdown', (e) => { if (this.mode === 'toast') { e.stopPropagation(); onOk(); } });
    this.target = null;
    this.mode = null;
  }

  show(step, id, n, total) {
    const q = this.q;
    this.mode = step.mode;
    q.icon.textContent = step.icon;
    q.title.textContent = step.title;
    q.count.textContent = `${n}/${total}`;
    q.text.innerHTML = stepText(step, inputMode.kbd);
    this.el.className = `mode-${step.mode} place-${step.place || 'bottom'}`;
    this.el.dataset.step = id;
    show(q.scrim, step.mode !== 'toast');
    show(q.btns, step.mode !== 'toast');
    show(q.tap, step.mode === 'toast');
    this.mark(step.target);
    show(this.el, true);
  }

  // Ziel-Element hervorheben (leuchtender Rahmen)
  mark(sel) {
    if (this.target) this.target.classList.remove('tut-target');
    this.target = sel ? document.querySelector(sel) : null;
    if (this.target) this.target.classList.add('tut-target');
  }

  hide() {
    this.mark(null);
    this.mode = null;
    show(this.el, false);
  }
}
