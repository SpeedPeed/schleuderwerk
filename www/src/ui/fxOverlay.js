// Bildschirm-Effekte über dem 3D-Bild (DOM, CSS-Animationen): kurzes Aufblitzen (Landung, Medaille, Stromschlag,
// Explosion, Kettenreaktion), roter Hitze-Rand (pulsiert bei Überhitzung), „BOSS“-Einblendung und Konfetti beim
// Run-Sieg. Alle Elemente werden einmal angelegt und nur umgeschaltet – keine neuen Knoten pro Effekt.
import { el, show } from './dom.js';
import { FX } from '../data/balance.js';

export class FxOverlay {
  constructor(root) {
    this.flashEl = el('<div id="fxflash" aria-hidden="true"></div>');
    this.heatEl = el('<div id="fxheat" aria-hidden="true"></div>');
    this.banner = el('<div id="fxbanner" class="hidden" aria-live="polite"><small data-id="sub"></small><b data-id="name"></b></div>');
    const pieces = Array.from({ length: FX.confettiPieces }, (_, i) => `<i style="--i:${i}"></i>`).join('');
    this.confetti = el(`<div id="confetti" class="hidden" aria-hidden="true">${pieces}</div>`);
    this.veilEl = el('<div id="veil" aria-hidden="true"></div>');
    root.append(this.flashEl, this.heatEl, this.banner, this.confetti, this.veilEl);
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

  // alles aus (Bildschirmwechsel)
  reset() {
    this.heat(0);
    show(this.banner, false);
  }
}
