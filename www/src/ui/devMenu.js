import { el, fmt, show } from './dom.js';
import { BASE_STATS, PHYSICS, CAMERA, LAUNCH, RESOURCES, GARAGE, TESTDRIVE, RUN, GAME_VERSION } from '../data/balance.js';
import { MILESTONES, fmtPlaytime } from '../garage/progression.js';
import { BIOMES } from '../data/biomes.js';

// Werte, die live geändert werden können (Objekt, Schlüssel, Beschreibung).
// BASE_STATS wirkt sofort (laufende Etappe wird neu berechnet), alles andere sofort bzw. ab der nächsten Etappe.
const GROUPS = { BASE_STATS, PHYSICS, CAMERA, LAUNCH, RESOURCES, GARAGE, TESTDRIVE, RUN };
export const TWEAKS = [
  ['BASE_STATS', 'launchSpeed', 'Startkraft (m/s)'],
  ['BASE_STATS', 'airControl', 'Luftsteuerung'],
  ['BASE_STATS', 'boostThrust', 'Boost-Schub'],
  ['BASE_STATS', 'driveAccel', 'Antrieb'],
  ['BASE_STATS', 'fuelMax', 'Treibstoff'],
  ['BASE_STATS', 'coolRate', 'Kühlung/s'],
  ['BASE_STATS', 'durabilityMax', 'Haltbarkeit'],
  ['BASE_STATS', 'impactThreshold', 'Aufpralltoleranz'],
  ['PHYSICS', 'hardSpeedCap', 'harte Tempo-Grenze'],
  ['PHYSICS', 'tiltDamp', 'Dreh-Dämpfung'],
  ['CAMERA', 'minWidth', 'Kamera: kleinste Breite'],
  ['CAMERA', 'maxWidth', 'Kamera: größte Breite'],
  ['CAMERA', 'safeMargin', 'Kamera: Sicherheitsrand'],
  ['LAUNCH', 'chargePeriod', 'Abschuss: Pendeldauer'],
  ['RESOURCES', 'dmgPerMps', 'Aufprallschaden je m/s'],
  ['RESOURCES', 'overheatStall', 'Überhitzungs-Stillstand'],
  ['GARAGE', 'costGrowth', 'Preisanstieg je Stufe'],
  ['TESTDRIVE', 'distDiv', 'Testfahrt: Meter je ⚙'],
  ['RUN', 'towPenalty', 'Abschlepp-Strafe (Anteil)'],
];
const ORIGINAL = TWEAKS.map(([g, k]) => GROUPS[g][k]);

// Verstecktes Entwickler-Menü (7× schnell auf die Versionsnummer in den Einstellungen tippen).
// h: { getSave(), getStage(), onCurrency(kind, n), onResearch(), onUnlockAll(), onGiftParts(), onEndStage(),
//      onTweak(group, key), onSkip('gold'|'bronze'|'miss'), onToBoss(), onNextAct(), onSetDurability(n), onTestDrive(biomeId) }
export class DevMenu {
  constructor(root, h) {
    this.h = h;
    this.el = el(`<div id="devmenu" class="overlay hidden"><div class="card dev-card">
      <h2>🛠 Dev-Menü</h2>
      <h3>Währungen</h3>
      <div class="dev-grid">
        <button class="btn btn-secondary" data-a="scrap1k">+1.000 ⚙</button>
        <button class="btn btn-secondary" data-a="scrap10k">+10.000 ⚙</button>
        <button class="btn btn-secondary" data-a="bp">+10 📘</button>
        <button class="btn btn-secondary" data-a="cores">+3 💠</button>
      </div>
      <h3>Freischalten</h3>
      <div class="dev-grid">
        <button class="btn btn-secondary" data-a="research">📘 Forschung erfüllen</button>
        <button class="btn btn-secondary" data-a="unlock">🔓 Alles freischalten</button>
        <button class="btn btn-secondary" data-a="gift">🎁 Alle Teile geschenkt</button>
        <button class="btn btn-danger" data-a="end">⏹ Etappe sofort beenden</button>
      </div>
      <h3>Run</h3>
      <div class="dev-grid">
        <button class="btn btn-secondary" data-a="skipGold">⏭ Etappe: 🥇 Gold</button>
        <button class="btn btn-secondary" data-a="skipBronze">⏭ Etappe: 🥉 Bronze</button>
        <button class="btn btn-secondary" data-a="skipMiss">⏭ Etappe: verfehlt</button>
        <button class="btn btn-secondary" data-a="boss">👹 Zum Boss</button>
        <button class="btn btn-secondary" data-a="act">➡ Nächster Akt</button>
      </div>
      <label class="dev-tw"><span>Haltbarkeit setzen<small>run.durability</small></span>
        <input type="number" step="any" inputmode="decimal" data-id="dur"><button class="icon-btn small" data-a="setdur" aria-label="Setzen">✔</button></label>
      <h3>Testfahrt (ohne Run)</h3>
      <div class="dev-grid">${BIOMES.map((b) => `<button class="btn btn-secondary" data-test="${b.id}">${b.icon} ${b.name}</button>`).join('')}</div>
      <div class="msg" data-id="msg"></div>
      <h3>Werte live ändern</h3>
      <div class="dev-tweaks" data-id="tweaks"></div>
      <h3>Meilensteine (Spielzeit)</h3>
      <div class="dev-ms" data-id="ms"></div>
      <h3>Ereignisse der letzten Etappe</h3>
      <div class="dev-ev" data-id="ev"></div>
      <div class="btn-row"><button class="btn btn-primary" data-a="close">Schließen</button></div>
      <div class="version">Schleuderwerk v${GAME_VERSION} · Dev</div>
    </div></div>`);
    root.appendChild(this.el);
    this.q = {};
    this.el.querySelectorAll('[data-id]').forEach((e) => { this.q[e.dataset.id] = e; });
    const on = (a, fn) => { this.el.querySelector(`[data-a=${a}]`).onclick = () => { fn(); this.refresh(); }; };
    on('scrap1k', () => { h.onCurrency('scrap', 1000); this.say('+1.000 Schrott'); });
    on('scrap10k', () => { h.onCurrency('scrap', 10000); this.say('+10.000 Schrott'); });
    on('bp', () => { h.onCurrency('blueprints', 10); this.say('+10 Blaupausen'); });
    on('cores', () => { h.onCurrency('cores', 3); this.say('+3 Kerne'); });
    on('research', () => { h.onResearch(); this.say('Forschungs-Bedingungen erfüllt – Chassis jetzt mit 💠 kaufbar, Teile mit ⚙'); });
    on('unlock', () => { h.onUnlockAll(); this.say('Alle Chassis, Fähigkeiten und Forschungs-Bedingungen freigeschaltet'); });
    on('gift', () => { h.onGiftParts(); this.say('Alle Teile gehören dir'); });
    on('end', () => { h.onEndStage(); this.close(); });
    on('skipGold', () => { this.say(h.onSkip('gold')); this.closeIfDone(); });
    on('skipBronze', () => { this.say(h.onSkip('bronze')); this.closeIfDone(); });
    on('skipMiss', () => { this.say(h.onSkip('miss')); this.closeIfDone(); });
    on('boss', () => { this.say(h.onToBoss()); });
    on('act', () => { this.say(h.onNextAct()); });
    on('setdur', () => { this.say(h.onSetDurability(Number(String(this.q.dur.value).replace(',', '.')))); });
    this.el.querySelectorAll('[data-test]').forEach((b) => { b.onclick = () => { h.onTestDrive(b.dataset.test); this.close(); }; });
    this.el.querySelector('[data-a=close]').onclick = () => this.close();

    this.q.tweaks.innerHTML = TWEAKS.map(([g, k, label], i) => `<label class="dev-tw">
      <span>${label}<small>${g}.${k}</small></span>
      <input type="number" step="any" inputmode="decimal" data-i="${i}">
      <button class="icon-btn small" data-r="${i}" aria-label="Zurücksetzen">↺</button></label>`).join('');
    this.q.tweaks.querySelectorAll('input').forEach((inp) => {
      inp.onchange = () => {
        const i = Number(inp.dataset.i);
        const v = Number(String(inp.value).replace(',', '.'));
        if (!isFinite(v)) { this.refresh(); return; }
        const [g, k] = TWEAKS[i];
        GROUPS[g][k] = v;
        h.onTweak(g, k);
        this.say(`${g}.${k} = ${v}`);
      };
    });
    this.q.tweaks.querySelectorAll('[data-r]').forEach((b) => {
      b.onclick = (e) => {
        e.preventDefault();
        const i = Number(b.dataset.r);
        const [g, k] = TWEAKS[i];
        GROUPS[g][k] = ORIGINAL[i];
        h.onTweak(g, k);
        this.refresh();
      };
    });
  }

  say(t) { this.q.msg.textContent = t || ''; }

  // Nach „Etappe überspringen“: Menü schließen, damit Ergebnis/Karte sichtbar sind (Option keepOpen fürs Testen)
  closeIfDone() { if (!this.keepOpen) this.close(); }

  refresh() {
    const save = this.h.getSave();
    const stage = this.h.getStage();
    this.q.tweaks.querySelectorAll('input').forEach((inp) => {
      const [g, k] = TWEAKS[Number(inp.dataset.i)];
      if (document.activeElement !== inp) inp.value = String(GROUPS[g][k]);
    });
    const ms = save.meta.milestones;
    this.q.ms.innerHTML = `<div class="dev-row"><span>Spielzeit gesamt</span><b>${fmtPlaytime(save.meta.totalPlaytime)}</b></div>`
      + MILESTONES.map((m) => `<div class="dev-row"><span>${m.name}</span><b>${ms[m.id] !== undefined ? fmtPlaytime(ms[m.id]) : '–'}</b></div>`).join('')
      + Object.keys(ms).filter((k) => !MILESTONES.some((m) => m.id === k)).map((k) => `<div class="dev-row"><span>${k}</span><b>${fmtPlaytime(ms[k])}</b></div>`).join('');
    const counts = (stage && stage.eventCounts) || this.lastCounts || {};
    if (stage) this.lastCounts = stage.eventCounts;
    const keys = Object.keys(counts);
    this.q.ev.innerHTML = keys.length ? keys.map((k) => `<span class="dev-chip">${k} <b>${fmt(counts[k])}</b></span>`).join('') : '<span class="small">noch keine Etappe gefahren</span>';
    this.el.querySelector('[data-a=end]').disabled = !(stage && stage.phase !== 'over');
    const run = save.run;
    for (const a of ['skipGold', 'skipBronze', 'skipMiss', 'boss', 'act', 'setdur']) this.el.querySelector(`[data-a=${a}]`).disabled = !run;
    if (run && document.activeElement !== this.q.dur) this.q.dur.value = String(Math.round(run.durability));
  }

  open() {
    this.say('');
    this.refresh();
    show(this.el, true);
  }

  close() { show(this.el, false); }

  get isOpen() { return !this.el.classList.contains('hidden'); }
}
