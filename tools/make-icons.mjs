// Paket B – Icon-Sprite „Schrottplatz-Werkstatt“: erzeugt www/assets/icons.svg (≈ 57 Symbole) und bettet dieselben
// <symbol>s in www/index.html ein (zwischen <!-- ICONS:BEGIN --> und <!-- ICONS:END -->), damit Browser, APK (offline)
// und die PC-Einzeldatei sie ohne Nachladen haben. Benutzt wird ein Icon über ui/dom.js → icon('schraube').
//
// Zeichenstil: 24×24-Raster, Strichstärke 2,5, runde Enden, Strich = currentColor (passt sich Papier/Blech an),
// Füllungen in Lack-Tönen über die CSS-Tokens (style="fill:var(--paint-yellow)"). Jede Linie und jeder Kreis bekommt
// ein leichtes, deterministisches Zittern (Zufall aus der Icon-ID) – sieht gezeichnet aus, ist aber bei jedem Bau gleich.
//
// Aufruf: node tools/make-icons.mjs   (danach index.html prüfen; Größe wird ausgegeben)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_SVG = path.join(ROOT, 'www', 'assets', 'icons.svg');
const INDEX = path.join(ROOT, 'www', 'index.html');

// ---------- Zufall & Zittern ----------
function rng(seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}
const r2 = (v) => Math.round(v * 10) / 10;   // 0,1 Einheiten Genauigkeit reichen (24er-Raster)

// Catmull-Rom → kubische Bézier-Kurven (weicher Stift-Strich)
function smooth(pts, closed) {
  const n = pts.length;
  if (n < 2) return '';
  const P = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${r2(pts[0][0])} ${r2(pts[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const t = 0.16;
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += `C${r2(c1[0])} ${r2(c1[1])} ${r2(c2[0])} ${r2(c2[1])} ${r2(p2[0])} ${r2(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}

// Polylinie mit Zittern: Kanten werden unterteilt (≈ 3,5 Einheiten), Zwischenpunkte quer versetzt
function wobble(pts, closed, rnd, amp = 0.32) {
  const out = [];
  const n = pts.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.round(len / 3.5));
    const nx = -(b[1] - a[1]) / (len || 1), ny = (b[0] - a[0]) / (len || 1);
    for (let j = 0; j < k; j++) {
      const t = j / k;
      const off = j === 0 ? (rnd() - 0.5) * amp * 0.6 : (rnd() - 0.5) * 2 * amp;
      out.push([a[0] + (b[0] - a[0]) * t + nx * off, a[1] + (b[1] - a[1]) * t + ny * off]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  // Ecken bleiben Ecken: bei geraden Linienzügen nur die Unterteilungspunkte glätten
  return out;
}

// Kantige Polylinie (Ecken erhalten): jede Kante einzeln geglättet
function sharp(pts, closed, rnd, amp) {
  const n = pts.length;
  const segs = closed ? n : n - 1;
  let d = '';
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const w = wobble([a, b], false, rnd, amp);
    const s = smooth(w, false);
    d += i === 0 ? s : s.replace(/^M[^C]*/, `L${r2(a[0])} ${r2(a[1])}`);
  }
  return closed ? `${d}Z` : d;
}

const PAINT = {
  yellow: 'var(--paint-yellow)', red: 'var(--paint-red)', green: 'var(--paint-green)', blue: 'var(--paint-blue)',
  rust: 'var(--rust-500)', rust3: 'var(--rust-300)', steel: 'var(--steel-300)', steel5: 'var(--steel-500)', steel7: 'var(--steel-700)',
  paper: 'var(--paper)', oil: 'var(--oil)', ink: 'currentColor', tape: 'var(--tape)',
  fire: 'var(--tag-feuer)', ice: 'var(--tag-eis)', gyro: 'var(--tag-gyro)', luck: 'var(--tag-gluck)', magnet: 'var(--tag-magnet)',
  bronze: 'var(--medal-bronze)', silver: 'var(--medal-silver)', gold: 'var(--medal-gold)', platin: 'var(--medal-platin)',
  none: 'none',
};
const style = (o) => {
  const fill = PAINT[o.f || 'none'] || 'none';
  const parts = fill === 'none' ? [] : [`fill:${fill}`];   // Standard am <svg>: fill none
  if (o.s === 0) parts.push('stroke:none');
  else if (o.st) parts.push(`stroke:${PAINT[o.st]}`);
  if (o.w) parts.push(`stroke-width:${o.w}`);
  if (o.o) parts.push(`opacity:${o.o}`);
  return parts.length ? ` style="${parts.join(';')}"` : '';
};

// ---------- Zeichen-Bausteine (in einem Icon über ctx) ----------
function makeCtx(id) {
  const rnd = rng(id);
  const els = [];
  const amp = 0.3;
  const add = (d, o = {}) => els.push(`<path d="${d}"${style(o)}/>`);
  const ctx = {
    // Linie / Linienzug (offen) mit runden Ecken
    line: (pts, o = {}) => add(smooth(wobble(pts, false, rnd, o.a ?? amp), false), o),
    // Vieleck mit erhaltenen Ecken
    poly: (pts, o = {}) => add(sharp(pts, true, rnd, o.a ?? amp), o),
    // Linienzug mit Ecken (offen)
    polyline: (pts, o = {}) => add(sharp(pts, false, rnd, o.a ?? amp), o),
    // weiche geschlossene Form durch Punkte
    blob: (pts, o = {}) => add(smooth(wobble(pts, true, rnd, o.a ?? amp * 0.6), true), o),
    // Kreis/Ellipse, leicht unrund
    circle: (cx, cy, r, o = {}) => {
      const ry = o.ry ?? r;
      const n = Math.max(8, Math.round((r + ry) * 1.6));
      const pts = [];
      const a0 = rnd() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * Math.PI * 2;
        const j = 1 + (rnd() - 0.5) * (o.a ?? 0.07);
        pts.push([cx + Math.cos(a) * r * j, cy + Math.sin(a) * ry * j]);
      }
      add(smooth(pts, true), o);
    },
    // Bogen (Grad, 0 = rechts, im Uhrzeigersinn wie SVG)
    arc: (cx, cy, r, from, to, o = {}) => {
      const n = Math.max(3, Math.round(Math.abs(to - from) / 20));
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
        const j = 1 + (rnd() - 0.5) * 0.05;
        pts.push([cx + Math.cos(a) * r * j, cy + Math.sin(a) * (o.ry ?? r) * j]);
      }
      add(smooth(pts, false), o);
    },
    // abgerundetes Rechteck
    rect: (x, y, w, h, o = {}) => {
      const rr = Math.min(o.r ?? 1.2, w / 2, h / 2);
      const pts = [
        [x + rr, y], [x + w - rr, y], [x + w, y + rr], [x + w, y + h - rr], [x + w - rr, y + h], [x + rr, y + h], [x, y + h - rr], [x, y + rr],
      ];
      add(sharp(pts, true, rnd, o.a ?? amp * 0.7), o);
    },
    dot: (cx, cy, r = 1, o = {}) => els.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r}"${style({ f: 'ink', s: 0, ...o })}/>`),
    // Text-Zeichen (Medaillen-Buchstaben)
    text: (x, y, t, o = {}) => els.push(`<text x="${x}" y="${y}" text-anchor="middle" font-family="Saira Stencil One, Impact, sans-serif" font-size="${o.size || 9}"${style({ f: o.f || 'ink', s: 0 })}>${t}</text>`),
    raw: (s) => els.push(s),
  };
  return { ctx, els };
}

// Zahnrad (Mittelpunkt, Radius innen/außen, Zähne)
function gearPts(cx, cy, ri, ro, n, phase = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    const w = (Math.PI / n) * 0.55;
    for (const [ang, rad] of [[a - w * 1.25, ri], [a - w * 0.7, ro], [a + w * 0.7, ro], [a + w * 1.25, ri]]) pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
  }
  return pts;
}
// Stern
function starPts(cx, cy, ro, ri, n = 5) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const rr = i % 2 ? ri : ro;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}

// ---------- Die Icons ----------
const ICONS = {
  // ===== Währungen =====
  schraube: (c) => { // Schraube: Sechskant-Kopf + Gewinde, schräg (Seitenansicht)
    c.rotate = -38;
    c.rect(6, 2, 12, 6, { f: 'steel', r: 1 });
    c.line([[10, 2.5], [10, 7.5]], { w: 1.4, st: 'oil' }); c.line([[14, 2.5], [14, 7.5]], { w: 1.4, st: 'oil' });
    c.poly([[9, 8], [15, 8], [15, 19.5], [12, 22.5], [9, 19.5]], { f: 'steel' });
    for (const y of [11, 14, 17]) c.line([[9.3, y + 1.2], [14.7, y - 0.6]], { w: 1.3, st: 'oil' });
  },
  schrott: (c) => { // Schrott: Zahnrad, angerostet
    c.poly(gearPts(12, 12, 6.6, 9.6, 8, 0.2), { f: 'rust3' });
    c.circle(12, 12, 3, { f: 'oil' });
  },
  blaupause: (c) => { // Blaupause: gerollter Plan
    c.poly([[5, 5], [19.5, 4], [19.5, 17], [5, 18]], { f: 'blue' });
    c.circle(5, 11.5, 2.6, { ry: 6.6, f: 'blue' });
    c.line([[8.5, 8.5], [16.5, 8]], { w: 1.4 }); c.line([[8.5, 11.5], [14, 11.2]], { w: 1.4 }); c.line([[8.5, 14.5], [16, 14.2]], { w: 1.4 });
    c.line([[19.5, 17], [20.5, 20], [6, 20.5]], { w: 1.6 });
  },
  kern: (c) => { // Kern: leuchtender Kristall
    c.poly([[12, 2.5], [19, 9], [12, 21.5], [5, 9]], { f: 'ice' });
    c.line([[5, 9], [19, 9]], { w: 1.5 }); c.line([[12, 2.5], [9.5, 9], [12, 21.5]], { w: 1.4 }); c.line([[12, 2.5], [14.5, 9], [12, 21.5]], { w: 1.4 });
  },

  // ===== Tags =====
  feuer: (c) => {
    c.blob([[12, 2.5], [15.5, 7.5], [18.5, 12], [17.5, 17.5], [12, 21], [6.5, 17.5], [5.5, 12.5], [8.5, 9], [10, 11]], { f: 'fire' });
    c.blob([[12, 12], [14.5, 15], [13.5, 18.5], [12, 19], [10, 18], [9.8, 15.5]], { f: 'yellow', w: 1.6 });
  },
  eis: (c) => {
    for (const a of [0, 60, 120]) {
      const r = (a * Math.PI) / 180;
      c.line([[12 - Math.cos(r) * 9, 12 - Math.sin(r) * 9], [12 + Math.cos(r) * 9, 12 + Math.sin(r) * 9]]);
    }
    for (const a of [0, 60, 120, 180, 240, 300]) {
      const r = (a * Math.PI) / 180;
      const x = 12 + Math.cos(r) * 6.2, y = 12 + Math.sin(r) * 6.2;
      const l = r + 0.9, l2 = r - 0.9;
      c.line([[x + Math.cos(l) * 2.4, y + Math.sin(l) * 2.4], [x, y], [x + Math.cos(l2) * 2.4, y + Math.sin(l2) * 2.4]], { w: 1.7 });
    }
    c.circle(12, 12, 2, { f: 'ice', w: 1.6 });
  },
  elektro: (c) => c.poly([[13.5, 2], [5, 13.5], [11, 13.5], [9.5, 22], [19, 9.5], [12.8, 9.5]], { f: 'yellow' }),
  gyro: (c) => { // Kreisel
    c.poly([[4, 9.5], [20, 9.5], [12.5, 21]], { f: 'gyro' });
    c.circle(12, 9.5, 8, { ry: 2.4, f: 'gyro' });
    c.line([[12, 7], [12, 2.5]], { w: 2.6 });
    c.arc(12, 9.5, 10.5, 200, 250, { ry: 4, w: 1.5 }); c.arc(12, 9.5, 10.5, -70, -20, { ry: 4, w: 1.5 });
  },
  magnet: (c) => { // Hufeisen
    c.blob([[4, 4], [9, 4], [9, 13], [12, 15.5], [15, 13], [15, 4], [20, 4], [20, 13.5], [12, 21], [4, 13.5]], { f: 'magnet', a: 0.12 });
    c.rect(4, 4, 5, 4, { f: 'steel', r: 0.6 }); c.rect(15, 4, 5, 4, { f: 'steel', r: 0.6 });
  },
  tonne: (c) => { // Schrott-Tag: Mülltonne mit Deckel
    c.poly([[5.5, 8], [18.5, 8], [17, 21], [7, 21]], { f: 'steel5' });
    c.rect(3.5, 5, 17, 3, { f: 'steel', r: 1 });
    c.line([[10, 5], [10.5, 3], [13.5, 3], [14, 5]], { w: 1.8 });
    c.line([[9.5, 11], [10, 18]], { w: 1.5 }); c.line([[14.5, 11], [14, 18]], { w: 1.5 });
  },
  hydraulik: (c) => { // Tropfen + Kolben
    c.blob([[12, 2.5], [17.5, 11], [18, 15.5], [15.5, 19.5], [12, 20.5], [8.5, 19.5], [6, 15.5], [6.5, 11]], { f: 'blue', a: 0.1 });
    c.arc(12, 14.5, 3.6, 120, 200, { w: 1.6 });
  },
  gummi: (c) => { // Flummi mit Sprung-Strichen
    c.circle(14, 10, 6.2, { f: 'green' });
    c.arc(14, 10, 3.6, 200, 280, { w: 1.6 });
    c.line([[3, 17], [6.5, 21]], { w: 1.8 }); c.line([[6.5, 15], [9.5, 19]], { w: 1.8 });
    c.line([[2.5, 22], [12, 22]], { w: 1.8 });
  },
  rakete: (c) => {
    c.blob([[19.5, 4.5], [17, 11.5], [11.5, 17], [7, 12.5], [12.5, 7]], { f: 'steel', a: 0.1 });
    c.circle(15, 9, 1.7, { f: 'blue', w: 1.5 });
    c.poly([[9, 10.5], [5, 10], [3, 13], [7.5, 13.5]], { f: 'red' }); c.poly([[13.5, 15], [14, 19], [11, 21], [10.5, 16.5]], { f: 'red' });
    c.blob([[7, 17], [4, 20], [3.5, 20.5], [4.5, 19], [6.5, 15.8]], { f: 'fire', w: 1.6 });
  },
  gluck: (c) => { // Kleeblatt
    for (const [x, y] of [[12, 7.5], [16.5, 12], [12, 16.5], [7.5, 12]]) c.circle(x, y, 3.7, { f: 'luck' });
    c.line([[12, 12], [14, 17], [17.5, 21.5]], { w: 2.4 });
  },

  // ===== Knotenarten =====
  etappe: (c) => { // Zielfahne
    c.line([[5, 2.5], [5.5, 21.5]], { w: 2.6 });
    c.poly([[5.5, 3.5], [19.5, 4.5], [18.5, 13.5], [5.5, 13]], { f: 'paper' });
    for (const [x, y] of [[5.6, 3.6], [12.5, 4], [9, 8.3], [16, 8.6]]) c.raw(`<rect x="${x}" y="${y}" width="3.5" height="4.3" style="fill:var(--oil)"/>`);
  },
  elite: (c) => { // Totenkopf
    c.blob([[12, 2.8], [18.5, 5.5], [19.5, 11], [16.5, 15.5], [16, 19], [8, 19], [7.5, 15.5], [4.5, 11], [5.5, 5.5]], { f: 'paper', a: 0.12 });
    c.circle(9, 10.5, 2.2, { f: 'oil', s: 0 }); c.circle(15, 10.5, 2.2, { f: 'oil', s: 0 });
    c.poly([[12, 13], [13, 15], [11, 15]], { f: 'oil', st: 'oil', w: 1 });
    c.line([[10, 19], [10, 16.5]], { w: 1.4, st: 'oil' }); c.line([[14, 19], [14, 16.5]], { w: 1.4, st: 'oil' }); c.line([[12, 19], [12, 16.5]], { w: 1.4, st: 'oil' });
  },
  haendler: (c) => { // Laden mit Markise
    c.rect(4, 11, 16, 10, { f: 'steel5', r: 0.6 });
    c.poly([[2.5, 5], [21.5, 5], [21.5, 9], [2.5, 9]], { f: 'red' });
    for (const x of [7, 11.5, 16]) c.raw(`<path d="M${x} 5.4h2.6v3.3h-2.6z" style="fill:var(--paper)"/>`);
    c.arc(4.8, 9, 2.3, 0, 180, { w: 1.6 }); c.arc(9.4, 9, 2.3, 0, 180, { w: 1.6 }); c.arc(14.6, 9, 2.3, 0, 180, { w: 1.6 }); c.arc(19.2, 9, 2.3, 0, 180, { w: 1.6 });
    c.rect(9.5, 14, 5, 7, { f: 'yellow', r: 0.4 });
  },
  werkbank: (c) => { // Werkbank: Hammer und Schraubendreher gekreuzt
    c.line([[5, 21], [17.5, 7.5]], { w: 3.6 });
    c.poly([[13, 3], [18.5, 2.5], [22, 7], [20.5, 8.5], [17.5, 6.5], [14.5, 9.5]], { f: 'steel' });
    c.poly([[17.5, 21.5], [19.5, 19.5], [11.5, 11.5], [9.5, 13.5]], { f: 'red' });
    c.line([[10, 12.5], [4, 6.5]], { w: 1.8 }); c.line([[4, 6.5], [2.8, 4.2]], { w: 1.4 });
  },
  schwarzmarkt: (c) => { // offener Kofferraum mit Kram
    c.poly([[3, 12], [21, 12], [19.5, 20.5], [4.5, 20.5]], { f: 'steel7' });
    c.poly([[3, 12], [6, 4], [20, 4], [21, 12]], { f: 'gyro' });
    c.dot(9, 9, 1.2); c.dot(12, 7.5, 1); c.dot(15.5, 9.5, 1.3);
    c.line([[10, 16], [14, 16]], { w: 1.8 });
  },
  tankstelle: (c) => { // Zapfsäule
    c.rect(4, 4, 10, 17, { f: 'green', r: 1.2 });
    c.rect(6, 6.5, 6, 4.5, { f: 'paper', r: 0.6, w: 1.6, st: 'oil' });
    c.line([[14, 9], [17.5, 10], [18, 17], [19.5, 18], [20, 7], [17.5, 4.5]], { w: 1.8 });
    c.line([[2.5, 21], [15.5, 21]], { w: 2.4 });
  },
  ereignis: (c) => { // Fragezeichen auf Zettel
    c.poly([[4, 3.5], [20, 4.5], [19, 20.5], [5, 19.5]], { f: 'paper' });
    c.line([[9, 9], [10, 6.5], [13, 6], [15, 7.5], [14.5, 10], [12, 11.5], [12, 14]], { w: 2.4, st: 'oil' });
    c.dot(12, 17, 1.4, { f: 'oil' });
  },
  schatz: (c) => { // Schatzkiste
    c.rect(3.5, 11, 17, 10, { f: 'rust', r: 0.8 });
    c.blob([[3.5, 11], [4.5, 6.5], [12, 4.5], [19.5, 6.5], [20.5, 11]], { f: 'rust3', a: 0.1 });
    c.line([[3.5, 14.5], [20.5, 14.5]], { w: 1.6 });
    c.rect(10, 12.5, 4, 4.5, { f: 'yellow', r: 0.5, w: 1.6 });
  },
  boss: (c) => { // Teufelskopf mit Hörnern
    c.blob([[12, 5], [18, 8], [19, 14], [15.5, 20], [12, 21], [8.5, 20], [5, 14], [6, 8]], { f: 'red', a: 0.1 });
    c.line([[6.5, 8.5], [3.5, 5.5], [3, 2]], { w: 2.2 }); c.line([[17.5, 8.5], [20.5, 5.5], [21, 2]], { w: 2.2 });
    c.poly([[7.5, 11], [11, 12.5], [8.5, 14]], { f: 'yellow', w: 1.4 }); c.poly([[16.5, 11], [13, 12.5], [15.5, 14]], { f: 'yellow', w: 1.4 });
    c.line([[9, 17], [10.5, 18], [12, 17], [13.5, 18], [15, 17]], { w: 1.6 });
  },

  // ===== Teile-Slots =====
  antrieb: (c) => { // Motorblock mit Kolben
    c.rect(4, 9, 14, 10, { f: 'steel5', r: 1 });
    c.rect(6.5, 4.5, 4, 4.5, { f: 'steel', r: 0.5, w: 1.8 }); c.rect(11.5, 4.5, 4, 4.5, { f: 'steel', r: 0.5, w: 1.8 });
    c.line([[18, 12], [21, 12], [21, 16], [18, 16]], { w: 1.8 });
    c.line([[7, 13], [15, 13]], { w: 1.4 }); c.line([[7, 15.5], [15, 15.5]], { w: 1.4 });
  },
  raeder: (c) => {
    c.circle(12, 12, 9.2, { f: 'oil' });
    c.circle(12, 12, 4.4, { f: 'steel' });
    for (const a of [0, 72, 144, 216, 288]) { const r = (a * Math.PI) / 180; c.dot(12 + Math.cos(r) * 2.4, 12 + Math.sin(r) * 2.4, 0.8, { f: 'oil' }); }
  },
  aero: (c) => { // Heckflügel
    c.blob([[2.5, 9], [12, 5.5], [21.5, 6.5], [21, 9.5], [12, 10], [3, 11.5]], { f: 'red', a: 0.1 });
    c.line([[8, 10.5], [8, 17]], { w: 2.2 }); c.line([[16, 9.8], [16, 17]], { w: 2.2 });
    c.line([[4, 17.5], [20, 17.5]], { w: 2.4 });
    c.line([[2, 20.5], [7, 20.5]], { w: 1.4 }); c.line([[10, 21], [17, 21]], { w: 1.4 });
  },
  panzerung: (c) => { // Schild aus Blech mit Nieten
    c.blob([[12, 2.5], [19.5, 5], [19, 13], [12, 21.5], [5, 13], [4.5, 5]], { f: 'steel', a: 0.08 });
    for (const [x, y] of [[8, 6.5], [16, 6.5], [12, 16]]) c.dot(x, y, 1.1);
    c.line([[12, 4], [12, 13]], { w: 1.4 });
  },
  tank: (c) => { // Benzinkanister
    c.poly([[5, 6], [15, 6], [19, 10], [19, 21], [5, 21]], { f: 'red' });
    c.rect(15.5, 2.5, 3.5, 3, { f: 'steel', r: 0.5, w: 1.6 });
    c.line([[7, 3.5], [11, 3.5], [11, 6]], { w: 1.8 });
    c.line([[8, 10], [16, 18]], { w: 1.6 }); c.line([[16, 10], [8, 18]], { w: 1.6 });
  },
  kuehlung: (c) => { // Lüfterrad
    c.circle(12, 12, 9.5, { f: 'ice', w: 2 });
    for (const a of [0, 120, 240]) {
      const r = (a * Math.PI) / 180;
      c.blob([[12, 12], [12 + Math.cos(r) * 7.5, 12 + Math.sin(r) * 7.5], [12 + Math.cos(r + 0.7) * 6, 12 + Math.sin(r + 0.7) * 6]], { f: 'paper', w: 1.6, a: 0.05 });
    }
    c.circle(12, 12, 1.6, { f: 'oil', s: 0 });
  },
  gadget: (c) => { // Kistchen mit Antenne und Knopf
    c.rect(4, 9, 16, 12, { f: 'yellow', r: 1.2 });
    c.circle(9, 15, 2.3, { f: 'red', w: 1.6, st: 'oil' });
    c.line([[13.5, 13], [17.5, 13]], { w: 1.5, st: 'oil' }); c.line([[13.5, 16.5], [17.5, 16.5]], { w: 1.5, st: 'oil' });
    c.line([[16, 9], [18, 3]], { w: 1.8 }); c.circle(18.2, 2.9, 1.2, { f: 'red', w: 1.2 });
  },

  // ===== Medaillen =====
  bronze: (c) => medal(c, 'bronze', 'B'),
  silber: (c) => medal(c, 'silver', 'S'),
  gold: (c) => medal(c, 'gold', 'G'),
  platin: (c) => medal(c, 'platin', 'P'),
  krone: (c) => { // Schrottkönig
    c.poly([[3, 8], [8, 12], [12, 4], [16, 12], [21, 8], [19, 19], [5, 19]], { f: 'gold' });
    c.line([[5, 19], [19, 19]], { w: 2.4 });
    c.dot(12, 14.5, 1.4, { f: 'red' });
  },

  // ===== Oberfläche =====
  pause: (c) => { c.rect(5.5, 4, 4.5, 16, { f: 'ink', r: 0.8 }); c.rect(14, 4, 4.5, 16, { f: 'ink', r: 0.8 }); },
  regler: (c) => { // Einstellungen: drei Schieberegler
    c.line([[4, 6], [20, 6]], { w: 1.8 }); c.line([[4, 12], [20, 12]], { w: 1.8 }); c.line([[4, 18], [20, 18]], { w: 1.8 });
    c.rect(13, 3.5, 4, 5, { f: 'yellow', r: 0.6, w: 1.8 }); c.rect(6, 9.5, 4, 5, { f: 'red', r: 0.6, w: 1.8 }); c.rect(14.5, 15.5, 4, 5, { f: 'steel', r: 0.6, w: 1.8 });
  },
  rucksack: (c) => {
    c.blob([[7, 6], [17, 6], [19.5, 10], [19.5, 20.5], [4.5, 20.5], [4.5, 10]], { f: 'green', a: 0.08 });
    c.arc(12, 6.5, 3.6, 180, 360, { w: 2 });
    c.rect(8, 13, 8, 5.5, { f: 'tape', r: 0.8, w: 1.8 });
  },
  buch: (c) => { // Kompendium
    c.poly([[4, 4], [18, 3.5], [19, 19], [5, 20]], { f: 'red' });
    c.line([[7.5, 4], [8.5, 19.8]], { w: 1.6 });
    c.line([[5, 20], [5.5, 21.5], [19.5, 20.5], [19, 19]], { w: 1.6 });
    c.rect(10.5, 7, 6, 3.5, { f: 'paper', r: 0.4, w: 1.4, st: 'oil' });
  },
  labor: (c) => { // Erlenmeyerkolben
    c.poly([[9.5, 3], [14.5, 3], [14.5, 9], [20, 19.5], [19, 21], [5, 21], [4, 19.5], [9.5, 9]], { f: 'paper' });
    c.blob([[7.3, 14], [16.7, 14], [19.5, 19.5], [18.5, 20.5], [5.5, 20.5], [4.5, 19.5]], { f: 'green', w: 1.4, a: 0.05 });
    c.line([[8.5, 3], [15.5, 3]], { w: 2.4 });
    c.dot(11, 17, 1, { f: 'paper' }); c.dot(14, 18.5, 0.8, { f: 'paper' });
  },
  lack: (c) => { // Farbdose mit Tropfen
    c.rect(5, 7, 14, 14, { f: 'steel', r: 1 });
    c.blob([[5, 7], [19, 7], [19, 10.5], [15, 11], [14.5, 14.5], [13, 15], [12.5, 11.5], [8, 11.5], [5, 10.5]], { f: 'red', w: 1.6, a: 0.05 });
    c.arc(12, 7, 7, 180, 360, { ry: 4.5, w: 1.6 });
  },
  statistik: (c) => { // Klemmbrett mit Balken
    c.rect(4, 4, 16, 18, { f: 'rust3', r: 1 });
    c.rect(6.5, 6.5, 11, 13.5, { f: 'paper', r: 0.4, w: 1.4 });
    c.rect(9, 2.5, 6, 3, { f: 'steel', r: 0.6, w: 1.6 });
    c.line([[9, 18], [9, 14]], { w: 2.2, st: 'oil' }); c.line([[12, 18], [12, 11]], { w: 2.2, st: 'red' }); c.line([[15, 18], [15, 9.5]], { w: 2.2, st: 'oil' });
  },
  zurueck: (c) => { c.line([[19.5, 19], [19, 12], [15, 8.5], [5, 9]], { w: 2.8 }); c.polyline([[9, 4.5], [4.5, 9], [9, 13.5]], { w: 2.8 }); },
  weiter: (c) => { c.line([[4, 12], [19, 12]], { w: 2.8 }); c.polyline([[13.5, 6], [19.5, 12], [13.5, 18]], { w: 2.8 }); },
  schliessen: (c) => { c.line([[5.5, 5.5], [18.5, 18.5]], { w: 3 }); c.line([[18.5, 5.5], [5.5, 18.5]], { w: 3 }); },
  wuerfel: (c) => { // Neu würfeln
    c.rect(4, 4, 16, 16, { f: 'paper', r: 3 });
    for (const [x, y] of [[8.5, 8.5], [15.5, 8.5], [12, 12], [8.5, 15.5], [15.5, 15.5]]) c.dot(x, y, 1.4, { f: 'oil' });
  },
  schloss: (c) => { // Sperren
    c.arc(12, 10, 4.6, 180, 360, { w: 2.6 });
    c.line([[7.4, 10], [7.4, 11]], { w: 2.6 }); c.line([[16.6, 10], [16.6, 11]], { w: 2.6 });
    c.rect(4.5, 11, 15, 10, { f: 'yellow', r: 1.2 });
    c.dot(12, 15, 1.5, { f: 'oil' }); c.line([[12, 15], [12, 18]], { w: 1.8, st: 'oil' });
  },
  pin: (c) => { // Reißzwecke (Reservieren)
    c.circle(13.5, 8.5, 5.5, { f: 'red' });
    c.line([[10, 12.5], [4, 20.5]], { w: 2.2 });
    c.arc(13.5, 8.5, 3, 200, 270, { w: 1.4 });
  },
  haken: (c) => c.polyline([[4, 12.5], [9.5, 18], [20, 5.5]], { w: 3.2 }),
  karte: (c) => { // gefaltete Karte
    c.poly([[3, 6], [9, 3.5], [15, 6], [21, 3.5], [21, 18], [15, 20.5], [9, 18], [3, 20.5]], { f: 'blue' });
    c.line([[9, 3.5], [9, 18]], { w: 1.5 }); c.line([[15, 6], [15, 20.5]], { w: 1.5 });
    c.line([[5, 15], [8, 11], [12, 13], [17, 8.5]], { w: 1.5 }); c.dot(18, 8, 1.3, { f: 'red' });
  },
  garage: (c) => { // Garagentor
    c.poly([[2.5, 10], [12, 3], [21.5, 10]], { f: 'none' });
    c.rect(5, 10, 14, 11, { f: 'steel5', r: 0.4 });
    c.line([[7, 13.5], [17, 13.5]], { w: 1.4 }); c.line([[7, 16.5], [17, 16.5]], { w: 1.4 }); c.line([[7, 19.5], [17, 19.5]], { w: 1.4 });
  },
  schluessel: (c) => { // Haltbarkeit: Schraubenschlüssel
    c.line([[6.5, 17.5], [15, 9]], { w: 4 });
    c.blob([[14, 5.5], [17, 2.8], [21, 4.5], [18.5, 7], [19.5, 9], [21.5, 8], [20, 11.5], [16.5, 11.5], [13, 9.5]], { f: 'steel', w: 2, a: 0.06 });
    c.circle(5.5, 18.5, 2.8, { f: 'steel', w: 2 });
  },
  hitze: (c) => { // Thermometer
    c.line([[12, 4], [12, 15]], { w: 6.5 });
    c.line([[12, 4.2], [12, 15]], { w: 2.4, st: 'paper', a: 0.05 });
    c.circle(12, 17.5, 4, { f: 'red' });
    c.line([[12, 9], [12, 15]], { w: 2.4, st: 'red', a: 0.05 });
    c.line([[15.5, 6], [17.5, 6]], { w: 1.4 }); c.line([[15.5, 9], [17.5, 9]], { w: 1.4 }); c.line([[15.5, 12], [17.5, 12]], { w: 1.4 });
  },
  stern: (c) => c.poly(starPts(12, 12.5, 10, 4.3), { f: 'yellow' }),
  zeit: (c) => { // Stoppuhr
    c.circle(12, 13.5, 7.8, { f: 'paper' });
    c.line([[12, 13.5], [12, 9]], { w: 2, st: 'oil' }); c.line([[12, 13.5], [15, 15]], { w: 2, st: 'red' });
    c.rect(10, 2.5, 4, 2.5, { f: 'steel', r: 0.5, w: 1.6 });
    c.line([[18, 6], [19.5, 4.5]], { w: 2 });
  },
  wind: (c) => {
    c.line([[3, 9], [14, 9], [16.5, 7], [15.5, 4.5], [13, 4.5]], { w: 2.2 });
    c.line([[3, 14], [18, 14], [20.5, 16], [19.5, 19], [17, 19]], { w: 2.2 });
    c.line([[5, 11.5], [10, 11.5]], { w: 1.6 });
  },
  ton: (c) => { // Lautsprecher
    c.poly([[3, 9], [7, 9], [12.5, 4.5], [12.5, 19.5], [7, 15], [3, 15]], { f: 'steel' });
    c.arc(13, 12, 4, -50, 50, { w: 2 }); c.arc(13, 12, 7.5, -50, 50, { w: 2 });
  },
  pokal: (c) => { // Run-Sieg
    c.blob([[6, 3.5], [18, 3.5], [17.5, 9], [14.5, 13], [9.5, 13], [6.5, 9]], { f: 'gold', a: 0.06 });
    c.arc(6, 7, 2.8, 90, 270, { w: 1.8 }); c.arc(18, 7, 2.8, -90, 90, { w: 1.8 });
    c.line([[12, 13], [12, 17]], { w: 2.4 });
    c.rect(7, 17, 10, 4, { f: 'rust', r: 0.6 });
  },
  kiste: (c) => { // Item-Kiste
    c.poly([[3, 8], [12, 4.5], [21, 8], [21, 18], [12, 21.5], [3, 18]], { f: 'rust3' });
    c.line([[3, 8], [12, 11.5], [21, 8]], { w: 1.8 }); c.line([[12, 11.5], [12, 21.5]], { w: 1.8 });
    c.line([[7.5, 6.2], [16.5, 9.8]], { w: 1.4 });
  },
  bleistift: (c) => { // Opa Gerds Bleistift
    c.poly([[17, 3], [21, 7], [9, 19], [5, 15]], { f: 'yellow' });
    c.poly([[5, 15], [9, 19], [3.5, 20.5]], { f: 'paper', w: 1.8 });
    c.dot(3.8, 20.2, 0.9);
    c.line([[15, 5], [19, 9]], { w: 1.5 });
  },
  info: (c) => { c.circle(12, 12, 9.5, { f: 'paper' }); c.dot(12, 7.5, 1.5, { f: 'oil' }); c.line([[12, 11], [12, 17.5]], { w: 2.8, st: 'oil' }); },
  plus: (c) => { c.line([[12, 4.5], [12, 19.5]], { w: 3 }); c.line([[4.5, 12], [19.5, 12]], { w: 3 }); },
  pfeil_hoch: (c) => { c.line([[12, 20], [12, 5]], { w: 2.8 }); c.polyline([[6, 10.5], [12, 4.5], [18, 10.5]], { w: 2.8 }); },
  tastatur: (c) => {
    c.rect(2.5, 6.5, 19, 11, { f: 'steel', r: 1.4 });
    for (const x of [5.5, 9, 12.5, 16]) c.dot(x + 0.8, 10, 0.9);
    c.line([[7, 14], [17, 14]], { w: 1.8 });
  },
  vorspulen: (c) => { c.poly([[3, 5], [12, 12], [3, 19]], { f: 'ink' }); c.poly([[12, 5], [21, 12], [12, 19]], { f: 'ink' }); },
  schlafen: (c) => { c.polyline([[5, 5], [11, 5], [5, 12], [11, 12]], { w: 2 }); c.polyline([[13, 11], [19, 11], [13, 19], [19, 19]], { w: 2 }); },
  handy: (c) => { c.rect(6.5, 2.5, 11, 19, { f: 'steel7', r: 2 }); c.rect(8.5, 5, 7, 12, { f: 'paper', r: 0.5, w: 1.4 }); c.dot(12, 19.2, 0.9); },
  wueste: (c) => { // Wüste: Kaktus vor Sonne
    c.circle(17, 6.5, 4, { f: 'yellow' });
    c.blob([[10, 21], [10, 6], [11.5, 4], [13, 6], [13, 21]], { f: 'green', a: 0.05 });
    c.line([[10, 13], [6.5, 13], [6, 9]], { w: 2.6 }); c.line([[13, 15], [16.5, 15], [17, 11.5]], { w: 2.6 });
    c.line([[3, 21.5], [21, 21.5]], { w: 2 });
  },
  sturm: (c) => { // Gewitter: Wolke mit Blitz
    c.blob([[5, 14], [4, 10.5], [7, 8], [9.5, 4.5], [14.5, 4.5], [17, 8], [20.5, 9.5], [20, 14]], { f: 'steel5', a: 0.06 });
    c.poly([[12.5, 12], [9, 17.5], [12, 17.5], [10.5, 22], [15.5, 15.5], [12.5, 15.5], [14, 12]], { f: 'yellow', w: 1.6 });
  },
  opa: (c) => { // Opa Gerd: Schiebermütze, Schnurrbart
    c.circle(12, 13.5, 7.5, { f: 'rust3' });
    c.blob([[3.5, 10], [6, 4.5], [13, 3], [19.5, 5.5], [20.5, 9], [12, 8.5]], { f: 'steel5', a: 0.05 });
    c.line([[3.5, 10], [12, 8.6], [21, 9.3]], { w: 2 });
    c.dot(9.3, 12.5, 1, { f: 'oil' }); c.dot(14.7, 12.5, 1, { f: 'oil' });
    c.blob([[12, 15], [16.5, 16], [15.5, 17.8], [12, 16.8], [8.5, 17.8], [7.5, 16]], { f: 'paper', w: 1.4, a: 0.03 });
  },
  wagen: (c) => { // Einkaufswagen-Kiste (Startbild)
    c.poly([[2.5, 5], [5.5, 5], [7.5, 15], [19, 15], [21, 8], [6.2, 8]], { f: 'none' });
    c.poly([[6.6, 8.5], [20.4, 8.5], [18.6, 14.5], [7.6, 14.5]], { f: 'red', w: 1.4 });
    c.circle(9, 19, 2, { f: 'oil' }); c.circle(17.5, 19, 2, { f: 'oil' });
  },
};

function medal(c, paint, letter) {
  c.poly([[7, 2], [11, 2], [12.5, 8], [10, 9]], { f: 'red', w: 1.6 });
  c.poly([[17, 2], [13, 2], [11.5, 8], [14, 9]], { f: 'blue', w: 1.6 });
  c.circle(12, 15, 6.8, { f: paint });
  c.text(12, 18.4, letter, { size: 9.5 });
}

// ---------- Bauen ----------
const symbols = [];
for (const [id, draw] of Object.entries(ICONS)) {
  const { ctx, els } = makeCtx(id);
  draw(ctx);
  const body = ctx.rotate ? `<g transform="rotate(${ctx.rotate} 12 12)">${els.join('')}</g>` : els.join('');
  symbols.push(`<symbol id="i-${id}" viewBox="0 0 24 24">${body}</symbol>`);
}
// Strich-Grundwerte (fill none, stroke currentColor, 2,5, rund) setzt style.css an svg.ic – sie erben in die <use>-Kopie.
const sprite = `<svg xmlns="http://www.w3.org/2000/svg" id="icon-sprite" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">${symbols.join('')}</svg>`;

fs.mkdirSync(path.dirname(OUT_SVG), { recursive: true });
fs.writeFileSync(OUT_SVG, `<!-- Erzeugt von tools/make-icons.mjs – nicht von Hand ändern. Farben über die CSS-Tokens aus www/style.css. -->\n${sprite}\n`);

let html = fs.readFileSync(INDEX, 'utf8');
const B = '<!-- ICONS:BEGIN (tools/make-icons.mjs) -->', E = '<!-- ICONS:END -->';
const i = html.indexOf(B), j = html.indexOf(E);
if (i < 0 || j < 0) throw new Error('index.html: Marken ICONS:BEGIN/END fehlen');
html = `${html.slice(0, i + B.length)}\n  ${sprite}\n  ${html.slice(j)}`;
fs.writeFileSync(INDEX, html);
export const ICON_IDS = Object.keys(ICONS);
console.log(`✔ ${Object.keys(ICONS).length} Icons → ${path.relative(ROOT, OUT_SVG)} (${(Buffer.byteLength(sprite) / 1024).toFixed(1)} KB), in index.html eingebettet`);
