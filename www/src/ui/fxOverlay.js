// Bildschirm-Effekte über dem 3D-Bild (DOM, CSS-Animationen): kurzes Aufblitzen (Landung, Medaille, Stromschlag,
// Explosion, Kettenreaktion), roter Hitze-Rand (pulsiert bei Überhitzung), „BOSS“-Einblendung und Konfetti beim
// Run-Sieg. Alle Elemente werden einmal angelegt und nur umgeschaltet – keine neuen Knoten pro Effekt.
// Paket B: fly() – Währung fliegt als Sprite-Icon zum Zähler (ein kleiner Pool aus FLY_POOL Elementen, nur transform,
// Web-Animations-API); bei „Bewegung reduzieren“ (prefers-reduced-motion) nicht.
import { el, show, icon } from './dom.js';

const FLY_POOL = 12;
import { FX } from '../data/balance.js';

export class FxOverlay {
  constructor(root) {
    this.flashEl = el('<div id="fxflash" aria-hidden="true"></div>');
    this.heatEl = el('<div id="fxheat" aria-hidden="true"></div>');
    this.banner = el('<div id="fxbanner" class="hidden" aria-live="polite"><small data-id="sub"></small><b data-id="name"></b></div>');
    const pieces = Array.from({ length: FX.confettiPieces }, (_, i) => `<i style="--i:${i}"></i>`).join('');
    this.confetti = el(`<div id="confetti" class="hidden" aria-hidden="true">${pieces}</div>`);
    this.veilEl = el('<div id="veil" aria-hidden="true"></div>');
    this.flyEls = Array.from({ length: FLY_POOL }, () => el('<div class="fly-ic hidden" aria-hidden="true"></div>'));
    this.flyNext = 0;
    root.append(this.flashEl, this.heatEl, this.banner, this.confetti, this.veilEl, ...this.flyEls);
    this.heatLevel = 0;
    this.enabled = true;     // Einstellung „Bildschirmwackeln & Blitze“ (shake) schaltet das Aufblitzen mit ab
  }

  // kurzes Aufblitzen: kind aus FX.screenFlash, n = Kettenlänge (nur 'chain')
  flash(kind, n = 0) {
    if (!this.enabled) return;
    const f = FX.screenFlash[kind];
    if (!f) return;
    const a = kind === 'chain' ? Math.min(f.max, f.a + Math.max(0, n - 3) * f.perLink) : f.a;
    const e = this.flashEl;
    e.style.setProperty('--c', f.color);
    e.style.setProperty('--a', String(a));
    e.classList.remove('go');
    void e.offsetWidth;   // Animation neu starten
    e.classList.add('go');
  }

  // Hitze-Rand: 0 aus, 1 Warnung (ab RESOURCES.heatWarn), 2 überhitzt (Stillstand)
  heat(level) {
    if (level === this.heatLevel) return;
    this.heatLevel = level;
    this.heatEl.className = level === 2 ? 'stall' : level === 1 ? 'warn' : '';
  }

  // Boss-Strecke beginnt: große Einblendung
  bossBanner(icon, name) {
    this.banner.querySelector('[data-id=sub]').textContent = 'BOSS-STRECKE';
    this.banner.querySelector('[data-id=name]').textContent = `${icon} ${name}`;
    show(this.banner, true);
    this.banner.classList.remove('go');
    void this.banner.offsetWidth;
    this.banner.classList.add('go');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => show(this.banner, false), FX.bossBanner * 1000);
    this.flash('boss');
  }

  // Konfetti (Run-Sieg): die Stücke bekommen zufällige Lage, Farbe und Verzögerung
  confettiBurst() {
    const cols = FX.particles.victory.colors;
    for (const p of this.confetti.children) {
      p.style.setProperty('--x', `${(Math.random() * 100).toFixed(1)}vw`);
      p.style.setProperty('--d', `${(Math.random() * 0.8).toFixed(2)}s`);
      p.style.setProperty('--r', `${Math.round(Math.random() * 720 - 360)}deg`);
      p.style.setProperty('--c', cols[Math.floor(Math.random() * cols.length)]);
    }
    show(this.confetti, true);
    this.confetti.classList.remove('go');
    void this.confetti.offsetWidth;
    this.confetti.classList.add('go');
    clearTimeout(this.confettiTimer);
    this.confettiTimer = setTimeout(() => show(this.confetti, false), FX.confettiTime * 1000);
  }

  // Übergang in eine Etappe: kurz abdunkeln und aufblenden (verdeckt den Aufbau der Strecke)
  veil() {
    const e = this.veilEl;
    e.classList.remove('go');
    void e.offsetWidth;
    e.classList.add('go');
  }

  // Währung fliegt vom Element (oder DOMRect) from zum Zähler to (n Stück, leicht versetzt, im Bogen). onLand(): bei der Ankunft
  // (Klang „Schraube fällt in die Dose“). → false, wenn nichts geflogen ist (keine Lage, Bewegung reduziert)
  fly(from, to, iconId = 'schraube', n = 3, onLand = null) {
    if (!from || !to) return false;
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    const rect = (x) => (x.getBoundingClientRect ? x.getBoundingClientRect() : x);   // Element oder fertige Lage (DOMRect)
    const a = rect(from), b = rect(to);
    if (!a.width || !b.width) return false;
    const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
    for (let i = 0; i < n; i++) {
      const e = this.flyEls[this.flyNext];
      this.flyNext = (this.flyNext + 1) % FLY_POOL;
      e.innerHTML = icon(iconId);
      show(e, true);
      const dx = (Math.random() - 0.5) * 40, lift = 40 + Math.random() * 40;
      const mx = (x0 + x1) / 2 + dx, my = Math.min(y0, y1) - lift;
      if (!e.animate) { show(e, false); continue; }
      const anim = e.animate([
        { transform: `translate(${x0}px, ${y0}px) scale(0.6) rotate(0deg)`, opacity: 0 },
        { transform: `translate(${mx}px, ${my}px) scale(1.15) rotate(${180 + dx * 3}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${x1}px, ${y1}px) scale(0.8) rotate(360deg)`, opacity: 1 },
      ], { duration: 480 + i * 70, delay: i * 60, easing: 'cubic-bezier(.4,.1,.6,1)', fill: 'both' });
      anim.onfinish = () => { show(e, false); if (i === n - 1 && onLand) onLand(); };
    }
    return true;
  }

  // alles aus (Bildschirmwechsel)
  reset() {
    this.heat(0);
    show(this.banner, false);
  }
}
