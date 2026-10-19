// Tastatur-Bedienung der Menüs (PC): Tab/Pfeiltasten bewegen einen sichtbaren Fokus innerhalb der OBERSTEN Ebene
// (Dialog, Hinweis, Tastenübersicht, Dev-Menü, Inventar, Einstellungen, Pause, Run-Overlay, Teile-Auswahl, Garage,
// Karte, Testfahrt-Ergebnis), Enter/Leertaste drückt den gewählten Knopf, Enter ohne Auswahl löst die Hauptaktion des
// Bildschirms aus (RUN STARTEN, LOS, Weiter, Nehmen …). Dazu Kürzel je Bildschirm (Garage Q/E, Karte Pfeile/I,
// Item-Auswahl 1/2/3/S, Ereignis/Tankstelle 1–4, K = Tastenübersicht, P = Pause).
// Während einer laufenden Etappe (input.captureKeys) gehören Leertaste/Pfeile/Ziffern nur dem Fahrzeug.
//
// Aufbau: reine Entscheidungen ohne DOM (keyLayer, primaryFor, shortcutFor, menuKey, pickSpatial → tests/keynav.test.mjs)
// und der Controller KeyNav (DOM: Fokus setzen, klicken, Fokus nach dem Neuzeichnen wiederfinden).
//
// Zustand s (main.js → navSnapshot): { captured, modal, tutorialCard, keys, devMenu, itemSheet, settings, pause,
//   run: Art des Run-Overlays oder null, pickerOpen, state, testResults, screen } – der Controller ergänzt
//   { focused (Fokus liegt auf einem Element der obersten Ebene), typing (Textfeld), focusRange (Schieberegler) }.

export const LAYERS = ['modal', 'tutorial', 'keys', 'dev', 'itemSheet', 'settings', 'pause', 'run', 'picker', 'garage', 'map', 'results', 'none'];

// Oberste bedienbare Ebene
export function keyLayer(s) {
  if (s.modal) return 'modal';
  if (s.tutorialCard) return 'tutorial';
  if (s.keys) return 'keys';
  if (s.devMenu) return 'dev';
  if (s.itemSheet) return 'itemSheet';
  if (s.settings) return 'settings';
  if (s.pause) return 'pause';
  if (s.run) return 'run';
  if (s.state === 'garage') return s.pickerOpen ? 'picker' : 'garage';
  if (s.state === 'map') return 'map';
  if (s.state === 'results' && s.testResults) return 'results';
  return 'none';
}

const C = (sel) => ({ sel, how: 'click' });
const F = (sel) => ({ sel, how: 'focus' });
// Hauptaktion je Run-Overlay: Liste { sel, how } – der erste vorhandene, sichtbare, nicht gesperrte Knopf zählt.
// how 'focus' = nur auswählen (bei echten Entscheidungen wird nichts ungefragt genommen).
const RUN_PRIMARY = {
  intro: [C('[data-a=go]')],
  result: [C('[data-a=next]'), C('[data-a=retry]'), C('[data-a=end]')],
  choice: [F('[data-pick]'), C('[data-a=skip]')],
  replace: [F('[data-rep]')],
  pick: [F('[data-pick]')],
  station: [F('[data-choice]')],
  act: [C('[data-a=next]')],
  end: [C('[data-a=garage]')],
  dealer: [C('[data-a=leave]')],
  workbench: [C('[data-a=leave]')],
  blackmarket: [C('[data-a=leave]')],
  event: [C('[data-a=pending]'), C('[data-a=cont]'), F('[data-opt]')],
  treasure: [C('[data-a=cont]'), C('[data-a=take]')],
};
const PRIMARY = {
  modal: [C('.btn-danger'), C('.btn-primary')],
  tutorial: [C('[data-a=ok]')],
  keys: [C('[data-a=close]')],
  dev: [C('[data-a=close]')],
  itemSheet: [C('[data-id=close]')],
  settings: [C('[data-a=close]')],
  pause: [C('[data-a=resume]')],
  picker: [F('.pcard')],
  garage: [C('[data-id=start]')],
  map: [F('.mnode.reach')],
  results: [C('[data-id=again]')],
};

export function primaryFor(layer, s = {}) {
  if (layer === 'run') return RUN_PRIMARY[s.run] || [];
  return PRIMARY[layer] || [];
}

const DIGIT = /^(?:Digit|Numpad)([1-9])$/;

// Kürzel der Ebene: { type: 'click', sel } | { type: 'chassis', dir } | { type: 'mapMove', dir } | { type: 'keys' } | null
export function shortcutFor(layer, s, code) {
  const d = DIGIT.exec(code);
  const n = d ? Number(d[1]) - 1 : -1;
  if (code === 'KeyK' && layer !== 'modal' && layer !== 'tutorial') return layer === 'keys' ? { type: 'click', sel: '[data-a=close]' } : { type: 'keys' };
  if (layer === 'garage') {
    if (code === 'KeyQ' || (code === 'ArrowLeft' && !s.focused)) return { type: 'chassis', dir: -1 };
    if (code === 'KeyE' || (code === 'ArrowRight' && !s.focused)) return { type: 'chassis', dir: 1 };
  }
  if (layer === 'map') {
    const dir = ARROWS[code];
    if (dir) return { type: 'mapMove', dir };
    if (code === 'KeyI') return { type: 'click', sel: '[data-id=items]' };
  }
  if (layer === 'pause' && code === 'KeyP') return { type: 'click', sel: '[data-a=resume]' };
  if (layer === 'run') {
    const k = s.run;
    if (k === 'choice') {
      if (n >= 0) return { type: 'click', sel: `[data-pick="${n}"]` };
      if (code === 'KeyS') return { type: 'click', sel: '[data-a=skip]' };
      if (code === 'KeyI') return { type: 'click', sel: '[data-a=inv]' };
    }
    if (n >= 0) {
      if (k === 'event') return { type: 'click', sel: `[data-opt="${n}"]` };
      if (k === 'station') return { type: 'click', sel: '[data-choice]', nth: n };
      if (k === 'pick') return { type: 'click', sel: `[data-pick="${n}"]` };
      if (k === 'replace') return { type: 'click', sel: `[data-rep="${n}"]` };
    }
  }
  return null;
}

const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
export const arrowDir = (code) => ARROWS[code] || null;

// Entscheidung für einen Tastendruck. ev: { code, key, shiftKey, ctrlKey, altKey, metaKey, repeat }
// → null (nicht zuständig, Browser/Spiel machen weiter) oder { type, … } (Taste gehört der Menü-Bedienung):
//   'pause' · 'tab' {back} · 'move' {dir} · 'mapMove' {dir} · 'activate' · 'primary' {list} · 'click' {sel, nth?}
//   · 'chassis' {dir} · 'keys' · 'none' (nur abfangen, z. B. gehaltene Enter-/Leertaste)
export function menuKey(s, ev) {
  if (ev.ctrlKey || ev.altKey || ev.metaKey) return null;
  const code = ev.code;
  if (s.captured) return code === 'KeyP' && !ev.repeat ? { type: 'pause' } : null;
  if (s.typing) return null;
  const layer = keyLayer(s);
  if (layer === 'none') return null;
  const sc = shortcutFor(layer, s, code);
  if (sc) return ev.repeat && sc.type !== 'mapMove' ? { type: 'none' } : sc;
  if (code === 'Tab') return { type: 'tab', back: !!ev.shiftKey };
  if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
    if (ev.repeat) return { type: 'none' };
    if (s.focused) return { type: 'activate' };
    if (code === 'Space') return { type: 'none' };
    return { type: 'primary', list: primaryFor(layer, s) };
  }
  const dir = ARROWS[code];
  if (dir) {
    if (s.focusRange) return null;   // Schieberegler: Pfeile ändern den Wert
    return { type: 'move', dir };
  }
  return null;
}

// Räumlich nächstes Element in Richtung dir. rects: [{ x, y, w, h }], from: Index des aktuellen Elements.
// Kandidaten liegen in Richtung dir (Mittelpunkt mindestens 4 px weiter); Wertung = Abstand in Richtung + 2 × quer dazu.
// Keiner in dieser Richtung → Reihenfolge im Dokument (hoch/links = vorheriges, runter/rechts = nächstes), -1 am Ende.
export function pickSpatial(rects, from, dir) {
  if (!rects.length) return -1;
  if (from < 0 || from >= rects.length) return 0;
  const a = rects[from];
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
  let best = -1, bestScore = Infinity;
  for (let i = 0; i < rects.length; i++) {
    if (i === from) continue;
    const r = rects[i];
    const bx = r.x + r.w / 2, by = r.y + r.h / 2;
    const dx = bx - ax, dy = by - ay;
    let along, ortho;
    if (dir === 'right') { along = dx; ortho = Math.abs(dy); } else if (dir === 'left') { along = -dx; ortho = Math.abs(dy); } else if (dir === 'down') { along = dy; ortho = Math.abs(dx); } else { along = -dy; ortho = Math.abs(dx); }
    if (along < 4) continue;
    // in der Reihe/Spalte überlappende Elemente bevorzugen
    const overlap = dir === 'left' || dir === 'right' ? Math.min(a.y + a.h, r.y + r.h) - Math.max(a.y, r.y) > 0 : Math.min(a.x + a.w, r.x + r.w) - Math.max(a.x, r.x) > 0;
    const score = along + (overlap ? 0 : 2 * ortho + 1000);
    if (score < bestScore) { bestScore = score; best = i; }
  }
  if (best >= 0) return best;
  const step = dir === 'up' || dir === 'left' ? -1 : 1;
  const j = from + step;
  return j >= 0 && j < rects.length ? j : -1;
}

// Nächster Index im Kreis (Tab, Karten-Knoten)
export function cycleIndex(len, cur, step) {
  if (!len) return -1;
  if (cur < 0) return step < 0 ? len - 1 : 0;
  return (cur + step + len) % len;
}

// ---------- Controller (DOM) ----------
const FOCUSABLE = 'button, input, textarea, select, [tabindex], .slot-row, .g-pick .pcard, .g-paints .pcard';
const TEXT_TYPES = new Set(['text', 'search', 'number', 'email', 'password', 'tel', 'url', '']);

function visible(el) {
  if (!el || !el.getClientRects || !el.getClientRects().length) return false;
  if (el.closest('.hidden')) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.pointerEvents !== 'none';
}
const usable = (el) => visible(el) && !el.disabled && el.getAttribute('aria-hidden') !== 'true';

// Wiedererkennung nach dem Neuzeichnen: Tag + data-Attribute (ohne Zähler)
function signature(el) {
  const d = Object.keys(el.dataset || {}).filter((k) => k !== 'count').sort().map((k) => `${k}=${el.dataset[k]}`).join('&');
  return `${el.tagName}|${d}|${d ? '' : (el.className || '').toString().split(' ')[0]}`;
}

// h: { snapshot() → s, rootFor(layer) → Element|null, onAction(type, …) für 'pause' | 'keys' | 'chassis' (dir) }
export class KeyNav {
  constructor(h, win = window) {
    this.h = h;
    this.win = win;
    this.doc = win.document;
    this.last = null;   // zuletzt ausgeführte Entscheidung (Rauchtest/Diagnose)
    win.addEventListener('keydown', (e) => this.onKey(e));
    this.doc.addEventListener('focusout', (e) => { if (e.target && e.target.classList) e.target.classList.remove('kf'); });
    // Maus/Touch: keine Tastatur-Markierung mehr zeigen
    win.addEventListener('pointerdown', () => { const a = this.doc.activeElement; if (a && a.classList) a.classList.remove('kf'); }, { capture: true });
  }

  state() {
    const s0 = this.h.snapshot();
    const layer = keyLayer(s0);
    const root = layer === 'none' ? null : this.h.rootFor(layer, s0);
    const a = this.doc.activeElement;
    const typing = !!a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && TEXT_TYPES.has(String(a.type || '').toLowerCase()))) && visible(a);
    const focused = !!(root && a && a !== this.doc.body && root.contains(a) && a.matches(FOCUSABLE) && usable(a));
    const focusRange = !!(focused && a.tagName === 'INPUT' && a.type === 'range');
    return { s: { ...s0, typing, focused, focusRange }, layer, root, active: a };
  }

  onKey(e) {
    if (e.key === 'Escape') return;   // Esc: main.js → handleBack
    const st = this.state();
    const act = menuKey(st.s, e);
    if (!act) return;
    e.preventDefault();
    this.last = { ...act, layer: st.layer };
    this.run(act, st);
  }

  list(root) { return root ? [...root.querySelectorAll(FOCUSABLE)].filter(usable) : []; }

  focusEl(el) {
    if (!el) return false;
    if (el.tabIndex < 0 && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
    if (this.doc.activeElement !== el) return false;
    el.classList.add('kf');
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) { /* egal */ }
    return true;
  }

  find(root, sel, nth = 0) {
    if (!root) return null;
    const all = [...root.querySelectorAll(sel)].filter(usable);
    return all[nth] || null;
  }

  // Klick mit anschließender Fokus-Wiederherstellung (der Bildschirm wird oft neu gezeichnet)
  click(el, st, keepFocus) {
    if (!el) return;
    const sig = signature(el);
    const idx = this.list(st.root).indexOf(el);
    const screen = st.s.screen;
    const layer = st.layer;
    el.click();
    if (!keepFocus) return;
    this.win.setTimeout(() => {
      const now = this.state();
      if (now.layer !== layer || now.s.screen !== screen || now.s.focused) return;
      const l = this.list(now.root);
      const same = l.find((x) => signature(x) === sig);
      if (same) this.focusEl(same);
      else if (idx >= 0 && l.length) this.focusEl(l[Math.min(idx, l.length - 1)]);
    }, 0);
  }

  run(act, st) {
    const { root, active } = st;
    switch (act.type) {
      case 'pause': this.h.onAction('pause'); break;
      case 'keys': this.h.onAction('keys'); break;
      case 'chassis': this.h.onAction('chassis', act.dir); break;
      case 'activate': this.click(active, st, true); break;
      case 'click': this.click(this.find(root, act.sel, act.nth || 0), st, false); break;
      case 'primary':
        for (const p of act.list) {
          const el = this.find(root, p.sel);
          if (!el) continue;
          if (p.how === 'focus') this.focusEl(el); else this.click(el, st, false);
          break;
        }
        break;
      case 'tab': {
        const l = this.list(root);
        const i = cycleIndex(l.length, st.s.focused ? l.indexOf(active) : -1, act.back ? -1 : 1);
        if (i >= 0) this.focusEl(l[i]);
        break;
      }
      case 'mapMove': {
        const nodes = root ? [...root.querySelectorAll('.mnode.reach')].filter(usable) : [];
        nodes.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
        const cur = nodes.indexOf(active);
        const i = cycleIndex(nodes.length, cur, act.dir === 'left' || act.dir === 'up' ? -1 : 1);
        if (i >= 0) this.focusEl(nodes[cur < 0 ? 0 : i]);
        break;
      }
      case 'move': {
        const l = this.list(root);
        if (!st.s.focused) {
          // noch nichts gewählt: zuerst die Hauptaktion (bzw. das erste Element) markieren
          const p = primaryFor(st.layer, st.s).map((x) => this.find(root, x.sel)).find(Boolean);
          this.focusEl(p || l[0]);
          break;
        }
        const rects = l.map((x) => { const r = x.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
        const i = pickSpatial(rects, l.indexOf(active), act.dir);
        if (i >= 0) this.focusEl(l[i]);
        break;
      }
      default: break;
    }
  }

  // Erstes passendes Element markieren (z. B. erreichbarer Knoten beim Öffnen der Karte), wenn noch nichts gewählt ist
  autoFocus(sel) {
    const st = this.state();
    if (!st.root || st.s.focused) return false;
    return this.focusEl(this.find(st.root, sel));
  }
}
