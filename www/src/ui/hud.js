import { el, fmt, show } from './dom.js';
import { KOMBO, RESOURCES } from '../data/balance.js';
import { DEG } from '../core/math.js';

const MAX_ABILITY_BUTTONS = 3;

// Anzeige während der Etappe: Distanz, Höhe, Schrauben, Treibstoff/Hitze/Haltbarkeit, Fähigkeits-Knöpfe,
// Kombo, Boden-Pfeil und die Kraftleiste beim Zielen.
export class Hud {
  constructor(root, { onPause }) {
    const abBtns = Array.from({ length: MAX_ABILITY_BUTTONS }, (_, i) =>
      `<button class="ability-btn ab-${i} hidden" data-id="ab${i}" aria-label="Fähigkeit ${i + 1}"><span data-id="abi${i}">🚀</span><i class="ab-key">${i + 1}</i></button>`).join('');
    this.el = el(`<div id="hud" class="hidden">
      <div class="tilt-zone tz-left hidden" data-id="tzl"><span>↺</span></div>
      <div class="tilt-zone tz-right hidden" data-id="tzr"><span>↻</span></div>
      <div class="hud-top">
        <button class="icon-btn" data-id="pause" aria-label="Pause">❚❚</button>
        <div class="hud-dist"><span data-id="dist">0</span><small> m</small></div>
        <div class="hud-bolts">🔩 <span data-id="bolts">0</span></div>
      </div>
      <div class="hud-sub">
        <span data-id="alt">↑ 0 m</span>
        <span data-id="wind" class="hud-wind"></span>
        <span data-id="best">🏁 0 m</span>
      </div>
      <div class="combo hidden" data-id="combo"><div class="combo-mult" data-id="mult">×1,0</div><div class="combo-pts" data-id="pts">0</div></div>
      <div class="ground-ind hidden" data-id="ground">Boden ↓ 0 m</div>
      <div class="res-bars" data-id="bars">
        <div class="rbar rb-fuel"><b>⛽</b><div class="rb-track"><div class="rb-fill" data-id="fuel"></div></div></div>
        <div class="rbar rb-heat" data-id="heatrow"><b>🌡</b><div class="rb-track"><div class="rb-fill" data-id="heat"></div><em data-id="stall">ÜBERHITZT</em></div></div>
        <div class="rbar rb-dur"><b>🔧</b><div class="rb-track"><div class="rb-fill" data-id="dur"></div><em class="rb-num" data-id="durnum">100</em></div></div>
      </div>
      ${abBtns}
      <div class="aim hidden" data-id="aim">
        <div class="power-meter">
          <div class="pm-band" data-id="band"></div>
          <div class="pm-fill" data-id="fill"></div>
        </div>
        <div class="aim-angle" data-id="angle">32°</div>
        <div class="weather" data-id="weather"></div>
        <div class="aim-hint" data-id="aimhint"><b>Halten</b> = Kraft, <b>hoch/runter ziehen</b> = Winkel,<br><b>loslassen im grünen Bereich!</b></div>
      </div>
      <div class="hint hidden" data-id="flyhint"><b>Links halten</b> = Nase hoch · <b>Rechts halten</b> = Nase runter · Knöpfe unten = Fähigkeiten</div>
    </div>`);
    root.appendChild(this.el);
    this.q = {};
    this.el.querySelectorAll('[data-id]').forEach((e) => { this.q[e.dataset.id] = e; });
    this.q.pause.addEventListener('pointerdown', (e) => { e.stopPropagation(); onPause(); });
    this.last = {};
    this.abilityCount = 0;
  }

  // Fähigkeits-Knöpfe (werden von platform/input.js als 'ab0' … angemeldet)
  get abilityButtons() { return Array.from({ length: MAX_ABILITY_BUTTONS }, (_, i) => this.q[`ab${i}`]); }

  set(key, value, fn) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    fn(value);
  }

  // abilities: Fähigkeits-Definitionen in Knopf-Reihenfolge
  show(on, { best = 0, tutorial = false, weather = null, abilities = [] } = {}) {
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
    this.abilityCount = Math.min(MAX_ABILITY_BUTTONS, abilities.length);
    for (let i = 0; i < MAX_ABILITY_BUTTONS; i++) {
      const b = this.q[`ab${i}`];
      const a = abilities[i];
      b.classList.add('hidden');
      b.classList.remove('active', 'off', 'held', 'special');
      if (!a) continue;
      this.q[`abi${i}`].textContent = a.icon;
      b.setAttribute('aria-label', `${a.name} (${a.mode === 'hold' ? 'halten' : 'tippen'})`);
      b.classList.toggle('special', !!a.chassis);
      b.dataset.ability = a.id;
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
      show(q.bars, !v);
      for (let i = 0; i < MAX_ABILITY_BUTTONS; i++) show(q[`ab${i}`], !v && i < this.abilityCount);
      show(q.aimhint, v && this.tutorial);
    });
    if (aiming) {
      const L = stage.launch;
      q.fill.style.height = `${L.power * 100}%`;
      this.set('band', L.sweet, () => {
        q.band.style.bottom = `${L.sweetLo * 100}%`;
        q.band.style.height = `${L.width * 100}%`;
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
    this.set('bolts', Math.floor(stage.bolts), (c) => { q.bolts.textContent = fmt(c); q.bolts.parentElement.classList.remove('bump'); void q.bolts.offsetWidth; q.bolts.parentElement.classList.add('bump'); });
    this.set('alt', Math.max(0, Math.round(stage.altitude)), (a) => { q.alt.textContent = `↑ ${fmt(a)} m`; });
    if (this.weather) {
      const w = Math.round(stage.env.wind);
      this.set('wind', w, (x) => { q.wind.textContent = `${x > 0 ? '→' : x < 0 ? '←' : '·'} ${Math.abs(x)} m/s`; });
    }

    // Ressourcen-Leisten
    this.set('fuel', Math.round(v.fuelFrac * 200), (p) => {
      q.fuel.style.width = `${p / 2}%`;
      q.fuel.parentElement.parentElement.classList.toggle('empty', p <= 0);
    });
    const hf = Math.max(0, Math.min(1, v.heatFrac));
    this.set('heat', Math.round(hf * 200), (p) => { q.heat.style.width = `${p / 2}%`; });
    this.set('heatWarn', hf >= RESOURCES.heatWarn, (on) => q.heatrow.classList.toggle('warn', on));
    this.set('stall', v.stall > 0, (on) => { show(q.stall, on); q.heatrow.classList.toggle('stalled', on); });
    const df = Math.max(0, Math.min(1, v.durabilityFrac));
    this.set('dur', Math.round(df * 200), (p) => {
      q.dur.style.width = `${p / 2}%`;
      q.dur.style.background = p > 100 ? '' : p > 50 ? 'linear-gradient(90deg, #ffb23f, #ffd23f)' : 'linear-gradient(90deg, #ff3a3a, #ff7a3d)';
    });
    this.set('durnum', Math.ceil(v.durability), (d) => { q.durnum.textContent = fmt(d); });

    // Fähigkeits-Knöpfe: Ring = Abklingzeit bzw. Treibstoff (Boost), grau = nicht nutzbar
    const bar = stage.abilities;
    for (let i = 0; i < this.abilityCount && i < bar.length; i++) {
      const s = bar.view(i, v);
      const b = q[`ab${i}`];
      this.set(`abp${i}`, Math.round(s.frac * 100), (p) => b.style.setProperty('--p', String(p / 100)));
      this.set(`abo${i}`, s.off, (on) => b.classList.toggle('off', on));
      this.set(`aba${i}`, s.active, (on) => b.classList.toggle('active', on));
      this.set(`abr${i}`, s.ready, (on) => b.classList.toggle('ready', on));
    }

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
