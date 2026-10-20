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
// Paket A: höchstens 6 Hinweise; Etappen-Hinweise sind kleine Sprechblasen (place 'mid') und erscheinen nur, solange
// h.allow(step) es erlaubt (main.js: beim Zielen) – nie im Flug über dem HUD. Ein nicht erlaubter Hinweis bleibt
// eingereiht, bis poke() ihn bei passender Gelegenheit zeigt.
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
  launch: {
    icon: '🎯', title: 'Abschuss & Ziel', mode: 'toast', place: 'mid', target: '#hud .power-meter',
    text: '<b>Finger irgendwo halten</b> – die Kraft pendelt, hoch/runter ziehen = Winkel. <b>Loslassen im grünen Bereich!</b> Jeder Meter bringt ⚙ Schrott, die Zielmarke 🥉 und mehr.',
    textKbd: '<b>Leertaste halten</b> = Kraft (pendelt), <b>↑/↓</b> = Winkel. <b>Loslassen im grünen Bereich!</b> Jeder Meter bringt ⚙ Schrott, die Zielmarke 🥉 und mehr.',
  },
  fly: {
    icon: '🪂', title: 'Fliegen & Ausrollen', mode: 'toast', place: 'mid', target: '#hud .ab-0',
    text: 'In der Luft: <b>links halten</b> = Nase hoch, <b>rechts</b> = runter – gerade landen. Runde Knöpfe = Fähigkeiten (🚀 Boost halten). Rollt die Kiste aus, spult das Spiel vor – <b>Tippen</b> beendet sofort.',
    textKbd: 'In der Luft: <b>←</b> = Nase hoch, <b>→</b> = runter – gerade landen. <b>Leertaste halten</b> = 🚀 Boost, <b>1–4</b> = Fähigkeiten. Rollt die Kiste aus, spult das Spiel vor – <b>Leertaste</b> beendet sofort.',
  },
  items: {
    icon: '🎁', title: 'Items & Tags', mode: 'card', place: 'bottom', target: '#runui .ch-cards',
    text: 'Wähle ein Item. Die farbigen Chips sind <b>Tags</b>: 2, 4 oder 6 Items mit gleichem Tag schalten <b>Set-Boni</b> frei. Im 🎒 Rucksack siehst du deine Sets.',
    textKbd: 'Nimm ein Item mit <b>1/2/3</b> (<b>S</b> = überspringen). Die farbigen Chips sind <b>Tags</b>: 2, 4 oder 6 Items mit gleichem Tag schalten <b>Set-Boni</b> frei.',
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

  // nächsten Hinweis aus der Warteschlange zeigen (der erste, den h.allow gerade erlaubt; die anderen warten)
  next() {
    if (this.current) return;
    const save = this.h.getSave();
    for (let k = 0; k < this.queue.length; k++) {
      const id = this.queue[k];
      if (!tutorialWants(save, id)) { this.queue.splice(k--, 1); continue; }
      const step = TUTORIAL_STEPS[id];
      if (this.h.allow && !this.h.allow(step, id)) continue;
      this.queue.splice(k, 1);
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

  // Wartende Hinweise erneut prüfen (z. B. Etappe wieder beim Zielen) – zeigt höchstens einen
  poke() {
    if (!this.current && this.timer === null && this.queue.length) this.next();
  }

  // Sichtbaren Etappen-Hinweis schließen, wenn er gerade nicht erlaubt ist (Abschuss → Flug); Warteschlange bleibt
  holdToasts() {
    const step = this.currentStep;
    if (step && step.mode === 'toast' && this.h.allow && !this.h.allow(step, this.current)) this.close();
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
