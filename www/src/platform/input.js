import { CONTROLS } from '../data/balance.js';

// Eingabe: Multi-Touch per Pointer Events (mehrere Finger gleichzeitig) und Tastatur zum Testen am PC.
//  - Fähigkeits-Knöpfe (DOM, bindButton) haben Vorrang: Berührungen dort zählen nur für den Knopf.
//  - Alle anderen Berührungen auf der Spielfläche:
//      hold  = irgendein Finger liegt auf (Abschuss: Kraft laden)
//      tilt  = linke Hälfte gehalten → +1 (Nase hoch), rechte Hälfte → -1 (Nase runter), beide → 0
//      takeAimDrag() = senkrechtes Ziehen des ersten Fingers seit dem letzten Abruf,
//                      in Bildschirmhöhen (hoch = positiv → steiler)
//  - Tastatur: Leertaste = halten (Abschuss) bzw. Boost, ← / → = neigen, ↑ / ↓ = Winkel beim Zielen.
const KEYS = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

export class Input {
  constructor(surface, win = window) {
    this.surface = surface;
    this.win = win;
    this.pointers = new Map();  // pointerId -> { x, y }
    this.buttons = new Map();   // Knopfname -> Set(pointerId)
    this.buttonEls = new Map();
    this.keys = new Set();
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
    if (down) this.keys.add(e.code);
    else this.keys.delete(e.code);
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

  get boost() { return this.buttonHeld('boost') || this.keys.has('Space'); }

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
    for (const [name, s] of this.buttons) {
      s.clear();
      const el = this.buttonEls.get(name);
      if (el) el.classList.remove('held');
    }
  }
}
