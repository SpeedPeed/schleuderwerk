import { CONTROLS } from '../data/balance.js';

// Eingabe: Multi-Touch per Pointer Events (mehrere Finger gleichzeitig) und Tastatur zum Testen am PC.
//  - Fähigkeits-Knöpfe (DOM, bindButton) haben Vorrang: Berührungen dort zählen nur für den Knopf.
//  - Alle anderen Berührungen auf der Spielfläche:
//      hold  = irgendein Finger liegt auf (Abschuss: Kraft laden)
//      tilt  = linke Hälfte gehalten → +1 (Nase hoch), rechte Hälfte → -1 (Nase runter), beide → 0
//      takeAimDrag() = senkrechtes Ziehen des ersten Fingers seit dem letzten Abruf,
//                      in Bildschirmhöhen (hoch = positiv → steiler)
//  - Fähigkeits-Knöpfe heißen 'ab0', 'ab1', … (Reihenfolge der Fähigkeiten): abilityHeld(i) = gehalten,
//    takeAbilityPress(i) = Anzahl neuer Drücke seit dem letzten Abruf (für Tipp-Fähigkeiten).
//  - Tastatur: Leertaste = halten (Abschuss) bzw. Boost (Fähigkeit boostSlot), 1–4 = Fähigkeit 1–4 (CONTROLS.abilityKeys),
//    ← / → = neigen, ↑ / ↓ = Winkel beim Zielen.
const KEYS = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ...CONTROLS.abilityKeys]);

export class Input {
  constructor(surface, win = window) {
    this.surface = surface;
    this.win = win;
    this.pointers = new Map();  // pointerId -> { x, y }
    this.buttons = new Map();   // Knopfname -> Set(pointerId)
    this.buttonEls = new Map();
    this.keys = new Set();
    this.presses = new Map();   // Knopfname -> Anzahl Drücke seit dem letzten Abruf
    this.boostSlot = 0;         // Leertaste im Flug = diese Fähigkeit (vom Spiel gesetzt)
    this.aimDY = 0;
    this.primary = null;
    this.captureKeys = false;   // nur im Spiel Leertaste/Pfeile abfangen (sonst bleiben Knöpfe bedienbar)

    surface.addEventListener('pointerdown', (e) => this.onDown(e));
    surface.addEventListener('pointermove', (e) => this.onMove(e));
    surface.addEventListener('pointerup', (e) => this.onUp(e));
    surface.addEventListener('pointercancel', (e) => this.onUp(e));
    surface.addEventListener('lostpointercapture', (e) => this.onUp(e));
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    win.addEventListener('keydown', (e) => this.onKey(e, true));
    win.addEventListener('keyup', (e) => this.onKey(e, false));
    win.addEventListener('blur', () => this.reset());
  }

  get width() { return this.win.innerWidth || 1; }
  get height() { return this.win.innerHeight || 1; }

  onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (this.pointers.has(e.pointerId)) return;
    try { this.surface.setPointerCapture(e.pointerId); } catch (_) { /* egal */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.primary === null) this.primary = e.pointerId;
  }

  onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    if (e.pointerId === this.primary) this.aimDY += (p.y - e.clientY) / this.height;
    p.x = e.clientX;
    p.y = e.clientY;
  }

  onUp(e) {
    if (!this.pointers.delete(e.pointerId)) return;
    if (this.primary === e.pointerId) {
      const next = this.pointers.keys().next();
      this.primary = next.done ? null : next.value;
    }
  }

  onKey(e, down) {
    if (!KEYS.has(e.code)) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (down) {
      if (!this.keys.has(e.code)) {
        const slot = CONTROLS.abilityKeys.indexOf(e.code);
        if (slot >= 0) this.press(`ab${slot}`);
        else if (e.code === 'Space') this.press(`ab${this.boostSlot}`);
      }
      this.keys.add(e.code);
    } else this.keys.delete(e.code);
    if (this.captureKeys) {
      e.preventDefault();
      if (t && t.tagName === 'BUTTON' && typeof t.blur === 'function') t.blur();
    }
  }

  // DOM-Knopf als Fähigkeits-Knopf anmelden (halten = aktiv). Hat Vorrang vor der Spielfläche.
  bindButton(el, name) {
    const held = new Set();
    this.buttons.set(name, held);
    this.buttonEls.set(name, el);
    const up = (e) => {
      held.delete(e.pointerId);
      el.classList.toggle('held', held.size > 0);
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* egal */ }
      held.add(e.pointerId);
      el.classList.add('held');
      this.press(name);
    });
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  buttonHeld(name) {
    const s = this.buttons.get(name);
    return !!s && s.size > 0;
  }

  press(name) { this.presses.set(name, (this.presses.get(name) || 0) + 1); }

  // Fähigkeit i gehalten? (Knopf, Zifferntaste oder – für den Boost-Slot – die Leertaste)
  abilityHeld(i) {
    return this.buttonHeld(`ab${i}`) || this.keys.has(CONTROLS.abilityKeys[i]) || (i === this.boostSlot && this.keys.has('Space'));
  }

  // Neue Drücke der Fähigkeit i seit dem letzten Abruf (setzt den Zähler zurück)
  takeAbilityPress(i) {
    const name = `ab${i}`;
    const n = this.presses.get(name) || 0;
    if (n) this.presses.set(name, 0);
    return n;
  }

  get hold() { return this.pointers.size > 0 || this.keys.has('Space'); }

  get tilt() {
    let left = this.keys.has('ArrowLeft');
    let right = this.keys.has('ArrowRight');
    const split = this.width * CONTROLS.splitX;
    for (const p of this.pointers.values()) {
      if (p.x < split) left = true;
      else right = true;
    }
    return left === right ? 0 : left ? 1 : -1;
  }

  get boost() { return this.abilityHeld(this.boostSlot); }

  get aimKey() { return (this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('ArrowDown') ? 1 : 0); }

  takeAimDrag() {
    const d = this.aimDY;
    this.aimDY = 0;
    return d;
  }

  // Alles loslassen (Etappenstart, Pause, Fenster verliert den Fokus)
  reset() {
    this.pointers.clear();
    this.primary = null;
    this.aimDY = 0;
    this.keys.clear();
    this.presses.clear();
    for (const [name, s] of this.buttons) {
      s.clear();
      const el = this.buttonEls.get(name);
      if (el) el.classList.remove('held');
    }
  }
}
