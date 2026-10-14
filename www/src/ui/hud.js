import { el, fmt, show } from './dom.js';
import { LAUNCH, KOMBO } from '../data/balance.js';
import { DEG } from '../core/math.js';

// Anzeige während der Etappe: Distanz, Höhe, Münzen, Boost-Knopf, Kombo, Boden-Pfeil und die Kraftleiste.
export class Hud {
  constructor(root, { onPause }) {
    this.el = el(`<div id="hud" class="hidden">
      <div class="tilt-zone tz-left hidden" data-id="tzl"><span>↺</span></div>
      <div class="tilt-zone tz-right hidden" data-id="tzr"><span>↻</span></div>
      <div class="hud-top">
        <button class="icon-btn" data-id="pause" aria-label="Pause">❚❚</button>
        <div class="hud-dist"><span data-id="dist">0</span><small> m</small></div>
        <div class="hud-coins">💰 <span data-id="coins">0</span></div>
      </div>
      <div class="hud-sub">
        <span data-id="alt">↑ 0 m</span>
        <span data-id="hp"></span>
        <span data-id="wind" class="hud-wind"></span>
        <span data-id="best">🏁 0 m</span>
      </div>
      <div class="combo hidden" data-id="combo"><div class="combo-mult" data-id="mult">×1,0</div><div class="combo-pts" data-id="pts">0</div></div>
      <div class="ground-ind hidden" data-id="ground">Boden ↓ 0 m</div>
      <div class="hud-bottom" data-id="boostbox">
        <div class="boost-label">BOOST</div>
        <div class="boost-bar"><div class="boost-fill" data-id="boost"></div></div>
      </div>
      <button class="ability-btn hidden" data-id="boostbtn" aria-label="Boost (halten)"><span>🔥</span></button>
      <div class="aim hidden" data-id="aim">
        <div class="power-meter">
          <div class="pm-band" data-id="band"></div>
          <div class="pm-fill" data-id="fill"></div>
        </div>
        <div class="aim-angle" data-id="angle">32°</div>
        <div class="weather" data-id="weather"></div>
        <div class="aim-hint" data-id="aimhint"><b>Halten</b> = Kraft, <b>hoch/runter ziehen</b> = Winkel,<br><b>loslassen im grünen Bereich!</b></div>
      </div>
      <div class="hint hidden" data-id="flyhint"><b>Links halten</b> = Nase hoch · <b>Rechts halten</b> = Nase runter · 🔥 = Boost</div>
    </div>`);
    root.appendChild(this.el);
    this.q = {};
    this.el.querySelectorAll('[data-id]').forEach((e) => { this.q[e.dataset.id] = e; });
    this.q.pause.addEventListener('pointerdown', (e) => { e.stopPropagation(); onPause(); });
    this.last = {};
  }

  // Der Boost-Knopf wird von platform/input.js als Fähigkeits-Knopf angemeldet
  get boostButton() { return this.q.boostbtn; }

  set(key, value, fn) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    fn(value);
  }

  show(on, { best = 0, tutorial = false, weather = null } = {}) {
    show(this.el, on);
    this.last = {};
    this.q.best.textContent = `🏁 ${fmt(best)} m`;
    this.weather = weather;
    const calm = !weather || (weather.wind[0] === 0 && weather.wind[1] === 0 && !weather.gust);
    show(this.q.weather, !calm);
    show(this.q.wind, !calm);
    if (!calm) {
      const b = Math.round(weather.base);
      const dir = weather.gust ? '↔' : b >= 0 ? '→' : '←';
      this.q.weather.innerHTML = `${weather.icon} <b>${weather.name}</b> ${dir} ${weather.gust ? `bis ${Math.round(weather.gust)}` : Math.abs(b)} m/s`
        + `<small>${weather.gust ? 'Wind wechselt ständig' : b >= 0 ? 'schiebt dich an – flach & weit fliegen!' : 'bremst – lieber hoch & mit Boost'}</small>`;
    }
    this.tutorial = tutorial;
    show(this.q.flyhint, false);
    show(this.q.combo, false);
    show(this.q.ground, false);
    show(this.q.tzl, false);
    show(this.q.tzr, false);
  }

  showFlyHint(on) { show(this.q.flyhint, on); }

  // view: { tilt, indicator } aus Eingabe und Kamera
  update(stage, view = {}) {
    const q = this.q;
    const aiming = stage.phase === 'aim';
    this.set('aiming', aiming, (v) => {
      show(q.aim, v);
      show(q.boostbox, !v);
      show(q.boostbtn, !v);
      show(q.aimhint, v && this.tutorial);
    });
    if (aiming) {
      const L = stage.launch;
      q.fill.style.height = `${L.power * 100}%`;
      this.set('band', L.sweet, () => {
        q.band.style.bottom = `${L.sweetLo * 100}%`;
        q.band.style.height = `${LAUNCH.sweetWidth * 100}%`;
      });
      q.fill.classList.toggle('in-band', L.charging && L.inSweetSpot);
      this.set('angle', Math.round(L.angle / DEG), (v) => { q.angle.textContent = `${v}°`; });
      return;
    }
    const v = stage.vehicle;
    const tilt = stage.phase === 'fly' ? view.tilt || 0 : 0;
    this.set('tilt', tilt, (t) => { show(q.tzl, t > 0); show(q.tzr, t < 0); });
    const ind = view.indicator;
    const groundOn = !!(ind && ind.show);
    this.set('groundOn', groundOn, (on) => show(q.ground, on));
    if (groundOn) this.set('groundText', ind.text, (t) => { q.ground.textContent = t; });

    this.set('dist', Math.max(0, Math.round(v.x)), (d) => { q.dist.textContent = fmt(d); });
    this.set('coins', stage.coins, (c) => { q.coins.textContent = fmt(c); q.coins.parentElement.classList.remove('bump'); void q.coins.offsetWidth; q.coins.parentElement.classList.add('bump'); });
    this.set('alt', Math.max(0, Math.round(stage.altitude)), (a) => { q.alt.textContent = `↑ ${fmt(a)} m`; });
    if (this.weather) {
      const w = Math.round(stage.env.wind);
      this.set('wind', w, (x) => { q.wind.textContent = `${x > 0 ? '→' : x < 0 ? '←' : '·'} ${Math.abs(x)} m/s`; });
    }
    this.set('hp', v.hp, (h) => { q.hp.textContent = '❤'.repeat(Math.max(0, h)) + '♡'.repeat(Math.max(0, stage.stats.hp - h)); });
    const b = Math.round((v.boost / stage.stats.boostMax) * 100);
    this.set('boost', b, (p) => {
      q.boost.style.width = `${p}%`;
      q.boostbtn.style.setProperty('--p', String(p / 100));
      q.boostbtn.classList.toggle('empty', p <= 0);
    });
    this.set('boosting', v.boosting, (on) => { q.boost.classList.toggle('active', on); q.boostbtn.classList.toggle('active', on); });
    const ch = stage.chain;
    this.set('comboOn', ch.pts > 0, (on) => show(q.combo, on));
    if (ch.pts > 0) {
      this.set('mult', ch.mult.toFixed(2), () => {
        q.mult.textContent = `×${ch.mult.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}`;
        q.combo.classList.remove('pulse'); void q.combo.offsetWidth; q.combo.classList.add('pulse');
      });
      this.set('pts', ch.pts, (p) => { q.pts.textContent = `${fmt(p)} Punkte`; });
      q.combo.style.setProperty('--t', String(Math.min(1, ch.timer / KOMBO.chainTimeout)));
    }
  }
}
