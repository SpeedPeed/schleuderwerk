import { el, fmt, show, icon } from './dom.js';
import { TXT } from '../data/texts.js';
import { KOMBO, RESOURCES, SOFTCAPS, ITEMS, STAGE } from '../data/balance.js';
import { liveStageScrap } from '../run/rewards.js';
import { DEG } from '../core/math.js';
import { itemBarHtml, esc } from './items.js';
import { abilityKeyLabel, modeLabel } from './inputMode.js';

// Höchstens so viele Fähigkeits-Slots wie die Soft-Caps erlauben, plus die Spezialfähigkeit des Chassis
export const MAX_ABILITY_BUTTONS = SOFTCAPS.abilitySlots.max + 1;

// Anzeige während der Etappe: Distanz, Höhe, Schrauben, Treibstoff/Hitze/Haltbarkeit, Fähigkeits-Knöpfe,
// Kombo, Boden-Pfeil und die Kraftleiste beim Zielen. Phase 4: Item-Leiste (Symbole hüpfen beim Auslösen),
// Feed-Zeile der letzten Auslösungen, „KETTENREAKTION ×n!“ ab Kettentiefe ITEMS.chainPopupDepth, Drehzahl (Rasenmäher).
// Phase 7: DOM wird nur bei Änderung angefasst (changed()), pro Bild entstehen keine neuen Objekte oder Funktionen;
// die Ketten-Einblendung wächst mit der Kettenlänge (--n). Bedienhinweise kommen vom Tutorial (ui/tutorial.js).
// Paket A: Etappen-Intro als Banner über der Zielansicht (nur beim Zielen), Schrott-Zähler mit dem Schrott dieser
// Etappe (wächst mit der Weite, run/rewards.js → liveStageScrap), Anzeige „×4“ beim Vorspulen (Tippen = Ende)
// und „Knapp: NN %“ nach der Hochrechnung.
// Paket B: Armaturenbrett vom Sperrmüll – Weite als Rollen-Zählwerk (ODO_DIGITS Ziffernrollen, nur transform),
// Tacho, Tank- und Hitze-Zeiger als Rundinstrumente (Nadel = transform), Haltbarkeit als Kette aus NUTS Schraubenmuttern.

const ODO_DIGITS = 5;
const NUTS = 10;
const NEEDLE = 240;                 // Zeigerausschlag der Rundinstrumente (Grad, −120 … +120)
const SPEED_MAX = 60;               // Tacho-Vollausschlag (m/s)
// Lage einer Ziffernrolle wie im echten Kilometerzähler: Rolle k dreht sich mit, sobald alle Rollen rechts davon auf 9 stehen
export function odoPositions(d, n = ODO_DIGITS) {
  const out = new Array(n);
  const v = Math.max(0, Math.min(10 ** n - 1, d));
  for (let k = 0; k < n; k++) {
    const p = 10 ** k;
    const whole = Math.floor(v / p) % 10;
    const rest = v % p;                       // Stand der Rollen rechts davon
    const turn = k === 0 ? v % 1 : Math.max(0, rest - (p - 1));   // letzte Einheit davor: mitdrehen
    out[n - 1 - k] = whole + turn;
  }
  return out;
}

export class Hud {
  constructor(root, { onPause }) {
    const abBtns = Array.from({ length: MAX_ABILITY_BUTTONS }, (_, i) =>
      `<button class="ability-btn ab-${i} hidden" data-id="ab${i}" aria-label="Fähigkeit ${i + 1}"><span data-id="abi${i}"></span><i class="ab-key" data-id="abk${i}">${i + 1}</i></button>`).join('');
    const drum = '<span class="odo-s">' + Array.from({ length: 11 }, (_, i) => `<span>${i % 10}</span>`).join('') + '</span>';
    const odo = Array.from({ length: ODO_DIGITS }, (_, i) => `<span class="odo-d" data-id="od${i}">${drum}</span>`).join('');
    const nuts = Array.from({ length: NUTS }, () => '<i class="nut"></i>').join('');
    this.el = el(`<div id="hud" class="hidden">
      <div class="tilt-zone tz-left hidden" data-id="tzl"><span>↺</span></div>
      <div class="tilt-zone tz-right hidden" data-id="tzr"><span>↻</span></div>
      <div class="hud-top">
        <button class="icon-btn hud-pause" data-id="pause" aria-label="Pause">${icon('pause')}<i class="key-badge kbd-only">Esc</i></button>
        <div class="hud-dist" data-id="dist" aria-label="Weite"><span class="odo">${odo}</span><small>m</small></div>
        <div class="hud-cnt">
          <div class="hud-bolts">${icon('schraube')}<span data-id="bolts">0</span></div>
          <div class="hud-bolts hud-scrap hidden" data-id="scrapbox">${icon('schrott')}<span data-id="scrap">0</span><small data-id="scrapadd"></small></div>
        </div>
      </div>
      <div class="hud-ff hidden" data-id="ff"><b data-id="fftext">×${STAGE.fastForward.scale}</b><small><span class="touch-only">${TXT.hud.tapEnd}</span><span class="kbd-only">${TXT.hud.keyEnd}</span></small></div>
      <div class="stage-banner card hidden" data-id="banner"></div>
      <div class="hud-sub">
        <span data-id="alt">↑ 0 m</span>
        <span data-id="wind" class="hud-wind"></span>
        <span>${icon('etappe')} <span data-id="best">0 m</span></span>
      </div>
      <div class="goal hidden" data-id="goal">
        <div class="goal-track"><div class="goal-fill" data-id="gfill"></div>
          <i class="gm gm-bronze" data-id="gm_bronze"></i><i class="gm gm-silver" data-id="gm_silver"></i><i class="gm gm-gold" data-id="gm_gold"></i>
          <b class="goal-car" data-id="gcar"></b>
        </div>
      </div>
      <div class="hud-items" data-id="items"></div>
      <div class="hud-feed" data-id="feed"></div>
      <div class="hud-chain hidden" data-id="chain"></div>
      <div class="combo hidden" data-id="combo"><div class="combo-mult" data-id="mult">×1,0</div><div class="combo-pts" data-id="pts">0</div></div>
      <div class="ground-ind hidden" data-id="ground">Boden ↓ 0 m</div>
      <div class="res-bars" data-id="bars">
        <div class="gauges">
          <div class="gauge g-speed" title="Tacho"><i class="g-needle" data-id="spd"></i><b>m/s</b></div>
          <div class="gauge g-fuel rb-fuel" data-id="fuelrow" title="Treibstoff"><i class="g-needle" data-id="fuel"></i>${icon('tank')}</div>
          <div class="gauge g-heat rb-heat" data-id="heatrow" title="Hitze"><i class="g-needle" data-id="heat"></i>${icon('hitze')}<em data-id="stall">${TXT.hud.overheat}</em></div>
        </div>
        <div class="nuts rb-dur" data-id="durrow" title="Haltbarkeit">${icon('schluessel')}<span class="nut-row" data-id="nuts">${nuts}</span><em data-id="durnum">100</em></div>
        <div class="rbar rb-rpm hidden" data-id="rpmrow"><b>${icon('antrieb')}</b><div class="rb-track"><div class="rb-fill" data-id="rpm"></div><em class="rb-num">Drehzahl</em></div></div>
      </div>
      ${abBtns}
      <div class="aim hidden" data-id="aim">
        <div class="power-meter">
          <div class="pm-band" data-id="band"></div>
          <div class="pm-fill" data-id="fill"></div>
        </div>
        <div class="aim-angle" data-id="angle">32°</div>
        <div class="aim-keys kbd-only"><b>Leertaste halten</b> = Kraft · <b>↑/↓</b> = Winkel · <b>loslassen</b> im grünen Bereich</div>
        <div class="weather" data-id="weather"></div>
      </div>
    </div>`);
    root.appendChild(this.el);
    this.q = {};
    this.el.querySelectorAll('[data-id]').forEach((e) => { this.q[e.dataset.id] = e; });
    this.q.pause.addEventListener('pointerdown', (e) => { e.stopPropagation(); onPause(); });
    this.odo = Array.from({ length: ODO_DIGITS }, (_, i) => this.q[`od${i}`].firstElementChild);
    this.odoBox = Array.from({ length: ODO_DIGITS }, (_, i) => this.q[`od${i}`]);
    this.nutEls = [...this.q.nuts.children];
    this.last = {};
    this.abilityCount = 0;
    this.feed = [];          // { text, t }
    this.chainShown = { n: 0, t: -1e9 };
  }

  // Item ausgelöst (Trigger-Engine): Symbol hüpfen lassen, Feed-Zeile. info: { echo, tierUp, recharge, rule }
  itemTriggered(src, depth, info = null) {
    const now = performance.now() / 1000;
    if (src.kind === 'item' && src.slot !== undefined) {
      const icon = this.q.items.querySelector(`.ib-slot[data-slot="${src.slot}"]`);
      if (icon) {
        icon.classList.remove('hop', 'echo', 'tierup');
        void icon.offsetWidth;
        icon.classList.add('hop');
        if (info && info.echo) icon.classList.add('echo');
        if (info && info.tierUp) icon.classList.add('tierup');
      }
    }
    if (info && info.recharge) return;
    const extra = info && info.echo ? ' ×2 (Glück)' : info && info.tierUp ? ' ★+1 (Glück)' : '';
    const label = `${src.icon || '•'} ${src.name || src.id}${extra}`;
    const f = this.feed;
    if (f.length && f[f.length - 1].label === label && now - f[f.length - 1].t < 0.5) { f[f.length - 1].n++; f[f.length - 1].t = now; }
    else f.push({ label, n: 1, t: now, depth });
    while (f.length > ITEMS.feedSize) f.shift();
    this.renderFeed();
  }

  renderFeed() {
    this.q.feed.innerHTML = this.feed.map((e) => `<div style="--d:${Math.min(4, e.depth)}">${e.depth > 0 ? '↳ '.repeat(Math.min(2, e.depth)) : ''}${esc(e.label)}${e.n > 1 ? ` ×${e.n}` : ''}</div>`).join('');
  }

  // Kettenreaktion (Paket C: jede gezählte Kette ≥ SYNERGY.chain.minLinks): „KETTENREAKTION ×n!“, nicht öfter als chainPopupGap
  // → true, wenn die Einblendung (neu) gezeigt wurde
  // Paket C: info { bolts, count, total } – die Kette zahlt Schrauben (Glieder²), der Zähler zeigt die Nachzahlung
  chain(n, info = null) {
    const now = performance.now() / 1000;
    const c = this.chainShown;
    if (now - c.t < ITEMS.chainPopupGap && n <= c.n) return false;
    c.n = n;
    c.t = now;
    const e = this.q.chain;
    const bolts = info && info.bolts > 0 ? ` <small>${TXT.synergy.chainBolts(info.bolts)} ${icon('schraube')}</small>` : '';
    e.innerHTML = `${TXT.hud.chain(n)}${bolts}`;
    e.style.setProperty('--n', String(Math.min(8, n)));
    show(e, true);
    e.classList.remove('go');
    void e.offsetWidth;
    e.classList.add('go');
    clearTimeout(this.chainTimer);
    this.chainTimer = setTimeout(() => show(e, false), 1400);
    return true;
  }

  // Fähigkeits-Knöpfe (werden von platform/input.js als 'ab0' … angemeldet)
  get abilityButtons() { return Array.from({ length: MAX_ABILITY_BUTTONS }, (_, i) => this.q[`ab${i}`]); }

  // true, wenn sich der Wert seit dem letzten Bild geändert hat (merkt ihn sich)
  changed(key, value) {
    if (this.last[key] === value) return false;
    this.last[key] = value;
    return true;
  }

  // abilities: Fähigkeits-Definitionen in Knopf-Reihenfolge.
  // goal: { target, medals: {bronze, silver?, gold}, medalList } → Zielbalken mit Medaillen-Marken
  // items: { inventory, slots, napped } → Item-Leiste
  // boostSlot: Fähigkeit der Leertaste (Tasten-Beschriftung am PC)
  // scrap: { total (Spielstand), act, kind } → Schrott-Zähler (Run); banner: { html, onBack } → Intro beim Zielen
  show(on, { best = 0, weather = null, abilities = [], goal = null, items = null, boostSlot = 0, scrap = null, banner = null } = {}) {
    show(this.el, on);
    this.scrap = scrap;
    show(this.q.scrapbox, !!scrap);
    if (scrap) { this.q.scrap.textContent = fmt(scrap.total); this.q.scrapadd.textContent = ''; }
    this.setBanner(banner);
    show(this.q.ff, false);
    this.last = {};
    this.feed = [];
    this.renderFeed();
    show(this.q.chain, false);
    this.chainShown = { n: 0, t: -1e9 };
    this.q.items.innerHTML = items && items.inventory.length ? itemBarHtml(items.inventory, items.inventory.length, items.napped ?? -1) : '';
    this.goal = goal;
    this.q.best.textContent = goal ? `Ziel ${fmt(goal.target)} m` : `${fmt(best)} m`;
    this.setOdo(0);
    show(this.q.goal, !!goal);
    if (goal) {
      this.goalMax = goal.medals.gold * 1.08;
      for (const m of ['bronze', 'silver', 'gold']) {
        const e = this.q[`gm_${m}`];
        const has = goal.medalList.includes(m) && goal.medals[m] !== undefined;
        show(e, has);
        e.classList.remove('got');
        if (has) { e.style.left = `${(goal.medals[m] / this.goalMax) * 100}%`; e.title = `${fmt(goal.medals[m])} m`; }
      }
    }
    this.weather = weather;
    const calm = !weather || (weather.wind[0] === 0 && weather.wind[1] === 0 && !weather.gust);
    show(this.q.weather, !calm);
    show(this.q.wind, !calm);
    if (!calm) {
      const b = Math.round(weather.base);
      const dir = weather.gust ? '←→' : b >= 0 ? '→' : '←';
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
      b.setAttribute('aria-label', `${a.name} (${modeLabel(a.mode)})`);
      this.q[`abk${i}`].textContent = abilityKeyLabel(i, boostSlot);
      b.classList.toggle('special', !!a.chassis);
      b.dataset.ability = a.id;
    }
    show(this.q.combo, false);
    show(this.q.ground, false);
    show(this.q.tzl, false);
    show(this.q.tzr, false);
  }

  // Intro-Banner (nur beim Zielen sichtbar); null = keiner
  setBanner(banner) {
    const q = this.q;
    this.bannerOn = !!banner;
    q.banner.innerHTML = banner ? banner.html : '';
    show(q.banner, !!banner);
    const b = q.banner.querySelector('[data-a=back]');
    if (b && banner.onBack) b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); banner.onBack(); });
  }

  // Rollen-Zählwerk: d in Metern (Kommastellen drehen die letzte Rolle weich mit), führende Nullen gedimmt
  setOdo(d) {
    const pos = odoPositions(d);
    const lead = Math.max(1, String(Math.floor(Math.max(0, d))).length);
    for (let i = 0; i < ODO_DIGITS; i++) {
      const p = Math.round(pos[i] * 50) / 50;
      if (this.changed(ODO_KEY[i], p)) this.odo[i].style.transform = `translateY(${-p * 34}px)`;
      const dim = ODO_DIGITS - i > lead;
      if (this.changed(ODO_LEAD[i], dim)) this.odoBox[i].classList.toggle('lead', dim);
    }
  }

  // Schrott-Zähler: Spielstand + Schrott dieser Etappe (n), mit kurzem Hüpfer bei Änderung
  setScrap(total, add = 0) {
    const q = this.q;
    if (this.changed('scrapTotal', total)) q.scrap.textContent = fmt(total);
    if (this.changed('scrapAdd', add)) {
      q.scrapadd.textContent = add > 0 ? ` +${fmt(add)}` : '';
      const b = q.scrapbox;
      b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
    }
  }

  // view: { tilt, indicator } aus Eingabe und Kamera
  update(stage, view) {
    const q = this.q;
    const aiming = stage.phase === 'aim';
    if (this.changed('aiming', aiming)) {
      if (!aiming && this.bannerOn) show(q.banner, false);
      show(q.aim, aiming);
      show(q.bars, !aiming);
      for (let i = 0; i < MAX_ABILITY_BUTTONS; i++) show(q[`ab${i}`], !aiming && i < this.abilityCount);
    }
    if (aiming) {
      const L = stage.launch;
      const pw = Math.round(L.power * 200);
      if (this.changed('power', pw)) q.fill.style.height = `${pw / 2}%`;
      if (this.changed('band', L.sweet)) {
        q.band.style.bottom = `${L.sweetLo * 100}%`;
        q.band.style.height = `${L.width * 100}%`;
      }
      const inBand = L.charging && L.inSweetSpot;
      if (this.changed('inBand', inBand)) q.fill.classList.toggle('in-band', inBand);
      const ang = Math.round(L.angle / DEG);
      if (this.changed('angle', ang)) q.angle.textContent = `${ang}°`;
      return;
    }
    const v = stage.vehicle;
    const tilt = stage.phase === 'fly' ? view.tilt || 0 : 0;
    if (this.changed('tilt', tilt)) { show(q.tzl, tilt > 0); show(q.tzr, tilt < 0); }
    const ind = view.indicator;
    const groundOn = !!(ind && ind.show);
    if (this.changed('groundOn', groundOn)) show(q.ground, groundOn);
    if (groundOn && this.changed('groundText', ind.text)) q.ground.textContent = ind.text;

    this.setOdo(Math.max(0, v.x));
    if (this.goal) {
      const f = Math.max(0, Math.min(1, v.maxX / this.goalMax));
      const p = Math.round(f * 400);
      if (this.changed('gfill', p)) { q.gfill.style.width = `${p / 4}%`; q.gcar.style.left = `${p / 4}%`; }
      const ml = this.goal.medalList;
      for (let i = 0; i < ml.length; i++) {
        const m = ml[i];
        const got = v.maxX >= this.goal.medals[m];
        if (this.changed(GM_KEY[m], got)) q[GM_KEY[m]].classList.toggle('got', got);
      }
    }
    const bolts = Math.floor(stage.bolts);
    if (this.changed('bolts', bolts)) {
      q.bolts.textContent = fmt(bolts);
      const b = q.bolts.parentElement;
      b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
    }
    // Schrott dieser Etappe (Weite × Wertung + Pickups) und Vorspulen/Knapp
    if (this.scrap) this.setScrap(this.scrap.total, liveStageScrap(this.scrap.act, this.scrap.kind, v.maxX, this.goal ? this.goal.medals : null, stage.scrap + stage.scrapBonus));
    const ffOn = stage.phase === 'fly' && (stage.fastForward || !!stage.settle);
    if (this.changed('ffOn', ffOn)) show(q.ff, ffOn);
    const fft = stage.knapp ? TXT.hud.knapp(stage.knapp.pct) : stage.settle ? `${fmt(stage.settle.dist)} m` : `×${STAGE.fastForward.scale}`;
    if (ffOn && this.changed('fft', fft)) { q.fftext.innerHTML = `${stage.knapp ? '' : icon('vorspulen')}${fft}`; q.ff.classList.toggle('knapp', !!stage.knapp); }
    const alt = Math.max(0, Math.round(stage.altitude));
    if (this.changed('alt', alt)) q.alt.textContent = `↑ ${fmt(alt)} m`;
    if (this.weather) {
      const w = Math.round(stage.env.wind);
      if (this.changed('wind', w)) q.wind.textContent = `${w > 0 ? '→' : w < 0 ? '←' : '·'} ${Math.abs(w)} m/s`;
    }

    // Rundinstrumente: Tacho, Tank, Hitze (Nadel −120° … +120°)
    const sp = Math.round(Math.min(1, v.speed / SPEED_MAX) * 120);
    if (this.changed('spd', sp)) q.spd.style.transform = `rotate(${(sp / 120) * NEEDLE - NEEDLE / 2}deg)`;
    const fp = Math.round(Math.max(0, Math.min(1, v.fuelFrac)) * 120);
    if (this.changed('fuel', fp)) {
      q.fuel.style.transform = `rotate(${(fp / 120) * NEEDLE - NEEDLE / 2}deg)`;
      q.fuelrow.classList.toggle('empty', fp <= 0);
    }
    const hf = Math.max(0, Math.min(1, v.heatFrac));
    const hp = Math.round(hf * 120);
    if (this.changed('heat', hp)) q.heat.style.transform = `rotate(${(hp / 120) * NEEDLE - NEEDLE / 2}deg)`;
    const warn = hf >= RESOURCES.heatWarn;
    if (this.changed('heatWarn', warn)) q.heatrow.classList.toggle('warn', warn);
    const stall = v.stall > 0;
    if (this.changed('stall', stall)) { show(q.stall, stall); q.heatrow.classList.toggle('stalled', stall); }
    const df = Math.max(0, Math.min(1, v.durabilityFrac));
    const dp = Math.ceil(df * NUTS - 1e-6);
    if (this.changed('dur', dp)) for (let i = 0; i < NUTS; i++) this.nutEls[i].classList.toggle('off', i >= dp);
    // Farbe: grün → gelb unter RESOURCES.durWarn → rot unter RESOURCES.durCrit (Klassen in style.css)
    const dl = df < RESOURCES.durCrit ? 2 : df < RESOURCES.durWarn ? 1 : 0;
    if (this.changed('durLevel', dl)) {
      q.durrow.classList.toggle('warn', dl === 1);
      q.durrow.classList.toggle('crit', dl === 2);
    }
    const dn = Math.ceil(v.durability);
    if (this.changed('durnum', dn)) q.durnum.textContent = fmt(dn);
    // Drehzahl-Anzeige (Rasenmäher, Regel groundSpeedStacks)
    const rpm = stage.chassisStackFrac ? stage.chassisStackFrac() : null;
    if (this.changed('rpmOn', rpm !== null)) show(q.rpmrow, rpm !== null);
    if (rpm !== null) {
      const rp = Math.round(rpm * 100);
      if (this.changed('rpm', rp)) q.rpm.style.width = `${rp}%`;
    }
    // Feed: alte Zeilen ausblenden
    if (this.feed.length && performance.now() / 1000 - this.feed[0].t > ITEMS.feedTime) { this.feed.shift(); this.renderFeed(); }

    // Fähigkeits-Knöpfe: Ring = Abklingzeit bzw. Treibstoff (Boost), grau = nicht nutzbar
    const bar = stage.abilities;
    for (let i = 0; i < this.abilityCount && i < bar.length; i++) {
      const s = bar.view(i, v);
      const b = q[AB_KEY[i]];
      const k = AB_KEYS[i];
      const p = Math.round(s.frac * 100);
      if (this.changed(k.p, p)) b.style.setProperty('--p', String(p / 100));
      if (this.changed(k.o, s.off)) b.classList.toggle('off', s.off);
      if (this.changed(k.a, s.active)) b.classList.toggle('active', s.active);
      if (this.changed(k.r, s.ready)) b.classList.toggle('ready', s.ready);
    }

    const ch = stage.chain;
    const comboOn = ch.pts > 0;
    if (this.changed('comboOn', comboOn)) show(q.combo, comboOn);
    if (comboOn) {
      const mult = Math.round(ch.mult * 100);
      if (this.changed('mult', mult)) {
        q.mult.textContent = `×${ch.mult.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}`;
        q.combo.classList.remove('pulse'); void q.combo.offsetWidth; q.combo.classList.add('pulse');
      }
      if (this.changed('pts', ch.pts)) q.pts.textContent = `${fmt(ch.pts)} Punkte`;
      const tq = Math.round(Math.min(1, ch.timer / KOMBO.chainTimeout) * 50);
      if (this.changed('ctime', tq)) q.combo.style.setProperty('--t', String(tq / 50));
    }
  }
}

// Schlüssel einmal anlegen (keine Texte pro Bild zusammensetzen)
const GM_KEY = { bronze: 'gm_bronze', silver: 'gm_silver', gold: 'gm_gold' };
const ODO_KEY = Array.from({ length: ODO_DIGITS }, (_, i) => `odo${i}`);
const ODO_LEAD = Array.from({ length: ODO_DIGITS }, (_, i) => `odl${i}`);
const AB_KEY = Array.from({ length: MAX_ABILITY_BUTTONS }, (_, i) => `ab${i}`);
const AB_KEYS = Array.from({ length: MAX_ABILITY_BUTTONS }, (_, i) => ({ p: `abp${i}`, o: `abo${i}`, a: `aba${i}`, r: `abr${i}` }));
