// Kleine Helfer für die HTML-Oberfläche.

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const fmt = (n) => Math.round(n).toLocaleString('de-DE');

// Große Zahlen kompakt: 12.300 -> 12,3 Tsd.
export function short(n) {
  n = Math.round(n);
  if (n < 100000) return fmt(n);
  const units = [[1e12, 'Bio.'], [1e9, 'Mrd.'], [1e6, 'Mio.'], [1e3, 'Tsd.']];
  for (const [v, u] of units) if (n >= v) return `${(n / v).toLocaleString('de-DE', { maximumFractionDigits: 1 })} ${u}`;
  return fmt(n);
}

export const show = (e, on = true) => e.classList.toggle('hidden', !on);

const escHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- Paket B: Icons, Handarbeit ----------
// Icon aus dem Sprite (www/index.html, erzeugt von tools/make-icons.mjs): <svg class="ic"><use href="#i-schraube"/></svg>
// Strichfarbe = Textfarbe (currentColor), Füllungen = Lack-Tokens. cls: zusätzliche Klassen (z. B. 'ic-lg').
export const icon = (id, cls = '') => `<svg class="ic${cls ? ` ${cls}` : ''}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

// Währung/Wert mit Icon: cur('schraube', 30) → Icon + Zahl (Zahl als Text, nicht escaped – nur Zahlen/fertige Texte)
export const cur = (id, v, cls = '') => `<span class="cur${cls ? ` ${cls}` : ''}">${icon(id)}<b>${v}</b></span>`;

// Emoji in Texten aus Spiellogik/Daten (Popups, Freischalt-Listen, Ereignis-Protokoll) → Sprite-Icons.
// (Tabelle als \u-Escapes: sie ersetzt Emoji, zeigt selbst keine.) Nur die Zeichen der Oberfläche (Währungen, Ressourcen) – Item-/Teile-Emoji bleiben Emoji (auf Papier-Etikett).
const EMOJI_ICONS = [
  ['\u{1F529}', 'schraube'], ['\u{2699}\u{FE0F}', 'schrott'], ['\u{2699}', 'schrott'], ['\u{1F4D8}', 'blaupause'], ['\u{1F4A0}', 'kern'], ['\u{1F527}', 'schluessel'],
  ['\u{26FD}', 'tank'], ['\u{1F321}\u{FE0F}', 'hitze'], ['\u{1F321}', 'hitze'], ['\u{1F512}', 'schloss'], ['\u{1F4CC}', 'pin'], ['\u{1F392}', 'rucksack'], ['\u{2620}\u{FE0F}', 'elite'], ['\u{2620}', 'elite'],
  ['\u{2714}', 'haken'], ['\u{1F4E6}', 'kiste'], ['\u{1F6EC}', 'etappe'], ['\u{21BB}', 'wuerfel'], ['\u{1F9EA}', 'labor'], ['\u{1F949}', 'bronze'], ['\u{1F948}', 'silber'], ['\u{1F947}', 'gold'],
];
const EMOJI_RE = new RegExp(EMOJI_ICONS.map(([e]) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
const EMOJI_MAP = Object.fromEntries(EMOJI_ICONS);
export const iconize = (text) => escHtml(text).replace(EMOJI_RE, (m) => icon(EMOJI_MAP[m]));
// dasselbe für fertiges HTML (Dialog-Texte aus main.js): nur die Emoji ersetzen, nichts escapen
const iconizeHtml = (html) => String(html).replace(EMOJI_RE, (m) => icon(EMOJI_MAP[m]));

// Deterministische Schräglage (Grad) aus einem Text, z. B. Item-ID: Karteikarten hängen leicht schief, aber immer gleich
export function tiltOf(seed, max = 2) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Math.round((((h >>> 0) % 1000) / 1000 * 2 - 1) * max * 10) / 10;
}

// Lesbare Schrift auf einer Lackfarbe: dunkle Tinte auf hellem Lack, Papier auf dunklem
export function inkOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return 'var(--oil)';
  const n = parseInt(m[1], 16);
  const lin = (c) => { c /= 255; return c <= 0.04 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.2 ? 'var(--oil)' : 'var(--paper)';
}

// Einfacher Bestätigungsdialog (Blechdeckel mit Notiz)
export function confirmDialog(root, text, yes = 'Ja', no = 'Abbrechen') {
  return new Promise((resolve) => {
    const d = el(`<div class="overlay modal"><div class="card dlg-card"><p>${iconizeHtml(text)}</p>
      <div class="btn-row"><button class="btn btn-secondary">${no}</button><button class="btn btn-danger">${yes}</button></div></div></div>`);
    const [bNo, bYes] = d.querySelectorAll('button');
    bNo.onclick = () => { d.remove(); resolve(false); };
    bYes.onclick = () => { d.remove(); resolve(true); };
    root.appendChild(d);
  });
}

// Einfacher Hinweis mit nur einem Knopf
export function infoDialog(root, text, ok = 'Alles klar') {
  return new Promise((resolve) => {
    const d = el(`<div class="overlay modal"><div class="card dlg-card"><p>${iconizeHtml(text)}</p>
      <div class="btn-row"><button class="btn btn-primary">${ok}</button></div></div></div>`);
    d.querySelector('button').onclick = () => { d.remove(); resolve(true); };
    root.appendChild(d);
  });
}
