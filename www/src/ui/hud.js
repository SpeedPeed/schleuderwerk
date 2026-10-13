import { el, fmt, show } from './dom.js';
import { LAUNCH } from '../config/balance.js';

// Anzeige während des Runs: Distanz, Höhe, Münzen, Boost, Kombo und die Schleuder-Anzeige.
export class Hud {
  constructor(root, { onPause }) {
    this.el = el(`<div id="hud" class="hidden">
      <div class="hud-top">
        <button class="icon-btn" data-id="pause" aria-label="Pause">❚❚</button>
        <div class="hud-dist"><span data-id="dist">0</span><small> m</small></div>
        <div class="hud-coins">💰 <span data-id="coins">0</span></div>
      </div>
      <div class="hud-sub">
        <span data-id="alt">↑ 0 m</span>
        <span data-id="hp"></span>
        <span data-id="best">🏁 0 m</span>
      </div>
      <div class="combo hidden" data-id="combo"><div class="combo-mult" data-id="mult">×1,0</div><div class="combo-pts" data-id="pts">0</div></div>
      <div class="hud-bottom" data-id="boostbox">
        <div class="boost-label">BOOST</div>
        <div class="boost-bar"><div class="boost-fill" data-id="boost"></div></div>
      </div>
      <div class="aim hidden" data-id="aim">
        <div class="power-meter">
          <div class="pm-band" data-id="band"></div>
          <div class="pm-fill" data-id="fill"></div>
          <div class="pm-label">KRAFT</div>
        </div>
        <div class="aim-angle" data-id="angle">35°</div>
        <div class="aim-hint" data-id="aimhint">Finger aufs Display, <b>nach hinten ziehen</b><br>und loslassen!<br><small>Grüne Zone = perfekter Abschuss</small></div>
      </div>
      <div class="hint hidden" data-id="flyhint">👆 <b>Wischen</b> = drehen &nbsp;·&nbsp; <b>Halten</b> = Boost</div>
    </div>`);
    root.appendChild(this.el);
    this.q = {};
    this.el.querySelectorAll('[data-id]').forEach((e) => { this.q[e.dataset.id] = e; });
    this.q.pause.addEventListener('pointerdown', (e) => { e.stopPropagation(); onPause(); });
    this.last = {};
  }

  set(key, value, fn) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    fn(value);
  }

  show(on, { best = 0, tutorial = false } = {}) {
    show(this.el, on);
    this.last = {};
    this.q.best.textContent = `🏁 ${fmt(best)} m`;
    this.tutorial = tutorial;
    show(this.q.flyhint, false);
    show(this.q.combo, false);
  }

  showFlyHint(on) { show(this.q.flyhint, on); }

  update(run) {
    const q = this.q;
    const aiming = run.phase === 'aim';
    this.set('aiming', aiming, (v) => {
      show(q.aim, v);
      show(q.boostbox, !v);
      show(q.aimhint, v && this.tutorial);
    });
    if (aiming) {
      const a = run.aim;
      q.fill.style.height = `${a.power * 100}%`;
      q.band.style.bottom = `${(a.band - LAUNCH.bandWidth / 2) * 100}%`;
      q.band.style.height = `${LAUNCH.bandWidth * 100}%`;
      q.fill.classList.toggle('in-band', a.active && run.inPerfectBand);
      this.set('angle', Math.round((a.angle * 180) / Math.PI), (v) => { q.angle.textContent = `${v}°`; });
      return;
    }
    const car = run.car;
    this.set('dist', Math.max(0, Math.round(car.x)), (v) => { q.dist.textContent = fmt(v); });
    this.set('coins', run.coins, (v) => { q.coins.textContent = fmt(v); q.coins.parentElement.classList.remove('bump'); void q.coins.offsetWidth; q.coins.parentElement.classList.add('bump'); });
    this.set('alt', Math.max(0, Math.round(run.altitude)), (v) => { q.alt.textContent = `↑ ${fmt(v)} m`; });
    this.set('hp', car.hp, (v) => { q.hp.textContent = '❤'.repeat(Math.max(0, v)) + '♡'.repeat(Math.max(0, run.stats.hp - v)); });
    const b = Math.round((car.boost / run.stats.boostMax) * 100);
    this.set('boost', b, (v) => { q.boost.style.width = `${v}%`; });
    this.set('boosting', car.boosting, (v) => q.boost.classList.toggle('active', v));
    const ch = run.chain;
    this.set('comboOn', ch.pts > 0, (v) => show(q.combo, v));
    if (ch.pts > 0) {
      this.set('mult', ch.mult.toFixed(2), () => {
        q.mult.textContent = `×${ch.mult.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}`;
        q.combo.classList.remove('pulse'); void q.combo.offsetWidth; q.combo.classList.add('pulse');
      });
      this.set('pts', ch.pts, (v) => { q.pts.textContent = `${fmt(v)} Punkte`; });
      q.combo.style.setProperty('--t', String(Math.min(1, ch.timer / 2.5)));
    }
  }
}
