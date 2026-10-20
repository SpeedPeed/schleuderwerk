import { el, fmt, show, icon } from './dom.js';
import * as BAL from '../data/balance.js';
import { MILESTONES, fmtPlaytime, milestoneTarget, ascensionState, MAX_ASCENSION } from '../garage/progression.js';
import { BIOMES } from '../data/biomes.js';
import { ITEMS, RARITIES } from '../data/items.js';
import { TAGS } from '../data/tags.js';
import { entryName } from '../items/inventory.js';
import { chainLogOn } from '../items/triggerEngine.js';
import { NODE_TYPES } from '../data/nodes.js';

const { GAME_VERSION } = BAL;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// Alle Abschnitte von data/balance.js (exportierte Objekte) – jede Zahl (auch in verschachtelten Objekten und
// Zahlen-Listen) ist live änderbar. BASE_STATS wirkt sofort (laufende Etappe wird neu berechnet), alles andere sofort
// bzw. ab der nächsten Etappe/Aktion.
const GROUPS = Object.fromEntries(Object.entries(BAL).filter(([, v]) => isObj(v)));

// Alle Zahlen eines Abschnitts als Pfade: [['physics','dt'], ['REWARDS','bolts','1'], …]
function numberPaths(obj, path = [], out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number') out.push([...path, k]);
    else if (Array.isArray(v)) v.forEach((x, i) => { if (typeof x === 'number') out.push([...path, k, String(i)]); else if (isObj(x) || Array.isArray(x)) numberPaths(x, [...path, k, String(i)], out); });
    else if (isObj(v)) numberPaths(v, [...path, k], out);
  }
  return out;
}
const getPath = (g, p) => p.reduce((o, k) => (o == null ? o : o[k]), GROUPS[g]);
function setPath(g, p, v) {
  let o = GROUPS[g];
  for (let i = 0; i < p.length - 1; i++) o = o[p[i]];
  o[p[p.length - 1]] = v;
}
// Abschnitt → Liste der Zahlen-Pfade (einmal beim Laden), Originalwerte zum Zurücksetzen
export const ALL_TWEAKS = Object.fromEntries(Object.keys(GROUPS).map((g) => [g, numberPaths(GROUPS[g])]));
const ALL_ORIGINAL = new Map();
for (const [g, paths] of Object.entries(ALL_TWEAKS)) for (const p of paths) ALL_ORIGINAL.set(`${g}.${p.join('.')}`, getPath(g, p));
export const tweakCount = () => Object.values(ALL_TWEAKS).reduce((n, l) => n + l.length, 0);

// Häufig gebrauchte Werte (oben, immer sichtbar): Objekt, Schlüssel, Beschreibung
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
  ['TESTDRIVE', 'distDiv', 'Testfahrt: Meter je Schrott'],
  ['RUN', 'towPenalty', 'Abschlepp-Strafe (Anteil)'],
];
const ORIGINAL = TWEAKS.map(([g, k]) => GROUPS[g][k]);
const SECTION_NAMES = {
  PHYSICS: 'Physik', BASE_STATS: 'Fahrzeug-Grundwerte', SOFTCAPS: 'Stat-Grenzen', GARAGE: 'Garage', RESOURCES: 'Ressourcen',
  TESTDRIVE: 'Testfahrt', FEATURES: 'Streckenbausteine', PICKUPS: 'Pickups', MAP: 'Karte', RUN: 'Run', ASCENSION_RULES: 'Schrottstufen',
  PROGRESSION: 'Fortschritt (Zielzeiten)', REWARDS: 'Belohnungen', SHOP: 'Schrotthändler', WORKBENCH: 'Werkbank', BLACKMARKET: 'Schwarzmarkt',
  STATION: 'Tankstelle', EVENTS: 'Ereignisse', TREASURE: 'Schatzhaufen', RESEARCH: 'Forschung', ITEMS: 'Items', RULES: 'Regel-Schalter',
  LAUNCH: 'Abschuss', CAMERA: 'Kamera', ORIGIN: 'Floating Origin', TRACK: 'Strecke', OBJECTS: 'Objekte', SPAWN: 'Verteilung', STAGE: 'Etappe',
  CONTROLS: 'Steuerung', RENDER: 'Darstellung', KOMBO: 'Kombos', FX: 'Effekte', SAVE: 'Speichern', AUDIO: 'Ton', TUTORIAL: 'Tutorial',
};

// Kurze Hilfe (aufklappbar oben im Menü)
const HELP = [
  ['Währungen', 'Schrott, Blaupausen, Kerne für die Garage; Schrauben nur im laufenden Run.'],
  ['Freischalten', '„Forschung erfüllen“ erfüllt nur die Bedingungen (kaufen musst du noch), „Ganzen Baum erforschen“ erforscht alles. „Alles freischalten“ schenkt Chassis und Fähigkeiten.'],
  ['Run', '„Etappe: Gold/Bronze/verfehlt“ beendet die laufende Etappe bzw. spielt auf der Karte den nächsten Knoten mit diesem Ergebnis (Shops werden übersprungen). „Zum Boss“ setzt dich vor den Boss, „Nächster Akt“ wechselt den Akt. „Typ erzwingen“ macht alle wählbaren Knoten zu diesem Typ.'],
  ['Items', 'Item suchen (Name, ID oder Tag) → hinzufügen; Stufe erhöhen auf einem Inventar-Platz. Ketten-Log schreibt jede Auslösung in die Konsole (F12).'],
  ['Werte live', 'Jede Zahl aus data/balance.js ist hier änderbar (↺ = Originalwert). Fahrzeug-Grundwerte wirken sofort, alles andere ab der nächsten Etappe. Änderungen gelten bis zum Neuladen.'],
  ['Meilensteine', 'Spielzeit bis zu jedem Meilenstein mit Zielkorridor: grün = im Korridor, gelb = zu früh, rot = zu spät.'],
  ['Leistung', '„Leistungsanzeige“ zeigt oben Bilder/s, Bildzeit, Logik-/Render-Zeit, Draw Calls, Dreiecke und Partikel.'],
];

// Verstecktes Entwickler-Menü (7× schnell auf die Versionsnummer in den Einstellungen tippen).
// h: { getSave(), getStage(), onCurrency(kind, n), onResearch(), onUnlockAll(), onGiftParts(), onEndStage(),
//      onTweak(group, key), onSkip('gold'|'bronze'|'miss'), onToBoss(), onNextAct(), onSetDurability(n), onTestDrive(biomeId),
//      onAddItem(id) → Text, onTierUp(slot) → Text, onAllPool() → Text, onChainLog(on),
//      onResearchAll(), onForceNode(type) → Text }
export class DevMenu {
  constructor(root, h) {
    this.h = h;
    this.el = el(`<div id="devmenu" class="overlay hidden"><div class="card dev-card">
      <h2>Hinterzimmer</h2>
      <details class="dev-sec dev-help"><summary>${icon('info')} Hilfe – was macht was?</summary>
        ${HELP.map(([t, d]) => `<p class="small"><b>${t}:</b> ${d}</p>`).join('')}
      </details>
      <h3>Währungen</h3>
      <div class="dev-grid">
        <button class="btn btn-secondary" data-a="scrap1k">+1.000 ${icon('schrott')}</button>
        <button class="btn btn-secondary" data-a="scrap10k">+10.000 ${icon('schrott')}</button>
        <button class="btn btn-secondary" data-a="bp">+10 ${icon('blaupause')}</button>
        <button class="btn btn-secondary" data-a="cores">+3 ${icon('kern')}</button>
        <button class="btn btn-secondary" data-a="bolts">+100 ${icon('schraube')} (Run)</button>
      </div>
      <h3>Freischalten</h3>
      <div class="dev-grid">
        <button class="btn btn-secondary" data-a="research">Forschung erfüllen</button>
        <button class="btn btn-secondary" data-a="researchAll">Ganzen Baum erforschen</button>
        <button class="btn btn-secondary" data-a="unlock">Alles freischalten</button>
        <button class="btn btn-secondary" data-a="gift">Alle Teile geschenkt</button>
        <button class="btn btn-secondary" data-a="asc">Schrottstufen 1–${MAX_ASCENSION} freischalten</button>
        <button class="btn btn-danger" data-a="end">Etappe sofort beenden</button>
      </div>
      <h3>Run</h3>
      <div class="dev-grid">
        <button class="btn btn-secondary" data-a="skipGold">Etappe: Gold</button>
        <button class="btn btn-secondary" data-a="skipBronze">Etappe: Bronze</button>
        <button class="btn btn-secondary" data-a="skipMiss">Etappe: verfehlt</button>
        <button class="btn btn-secondary" data-a="boss">Zum Boss</button>
        <button class="btn btn-secondary" data-a="act">Nächster Akt</button>
      </div>
      <div class="dev-tw dev-tier"><span>Nächste Knoten<small>Typ erzwingen</small></span><select data-id="ntype">${Object.entries(NODE_TYPES).filter(([t]) => t !== 'boss').map(([t, d]) => `<option value="${t}">${d.icon} ${d.name}</option>`).join('')}</select><button class="icon-btn small" data-a="force" aria-label="Erzwingen">${icon('haken')}</button></div>
      <label class="dev-tw"><span>Haltbarkeit setzen<small>run.durability</small></span>
        <input type="number" step="any" inputmode="decimal" data-id="dur"><button class="icon-btn small" data-a="setdur" aria-label="Setzen">${icon('haken')}</button></label>
      <h3>Items (Run)</h3>
      <div class="dev-items">
        <input type="search" data-id="isearch" placeholder="Item suchen (Name, ID, Tag) …" autocomplete="off">
        <select data-id="ilist" size="6"></select>
        <div class="dev-grid">
          <button class="btn btn-secondary" data-a="iadd">Item hinzufügen</button>
          <button class="btn btn-secondary" data-a="ipool">Alle Items in den Pool</button>
        </div>
        <div class="dev-tw dev-tier"><span>Stufe erhöhen<small>Inventar-Platz</small></span><select data-id="islot"></select><button class="icon-btn small" data-a="itier" aria-label="Stufe erhöhen">${icon('stern')}</button></div>
        <label class="dev-check"><input type="checkbox" data-id="ilog"> Ketten-Log in der Konsole</label>
      </div>
      <h3>Tutorial & Leistung</h3>
      <div class="dev-grid">
        <button class="btn btn-secondary" data-a="tutReset">Tutorial zurücksetzen</button>
        <button class="btn btn-secondary" data-a="tutOff">Alle Hinweise aus</button>
      </div>
      <label class="dev-check"><input type="checkbox" data-id="perf"> Leistungsanzeige</label>
      <div class="dev-perf small" data-id="perfTxt"></div>
      <h3>Testfahrt (ohne Run)</h3>
      <div class="dev-grid">${BIOMES.map((b) => `<button class="btn btn-secondary" data-test="${b.id}">${b.icon} ${b.name}</button>`).join('')}</div>
      <div class="msg" data-id="msg"></div>
      <h3>Werte live ändern</h3>
      <div class="dev-tweaks" data-id="tweaks"></div>
      <div class="dev-sections" data-id="sections"></div>
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
    on('bolts', () => { this.say(h.onCurrency('bolts', 100) || ''); });
    on('tutReset', () => { this.say(h.onTutorial ? h.onTutorial('reset') : ''); });
    on('tutOff', () => { this.say(h.onTutorial ? h.onTutorial('off') : ''); });
    on('research', () => { h.onResearch(); this.say('Forschungs-Bedingungen erfüllt – Chassis jetzt mit Kernen kaufbar, Teile mit Schrott'); });
    on('researchAll', () => { h.onResearchAll(); this.say('Ganzer Forschungsbaum erforscht (Feinschliff Stufe 1) – Werkbank/Schwarzmarkt ab dem nächsten Akt bzw. Run'); });
    on('force', () => { this.say(h.onForceNode(this.q.ntype.value)); });
    on('unlock', () => { h.onUnlockAll(); this.say('Alle Chassis, Fähigkeiten und Forschungs-Bedingungen freigeschaltet'); });
    on('asc', () => { this.say(h.onAscension ? h.onAscension() : ''); });
    on('gift', () => { h.onGiftParts(); this.say('Alle Teile gehören dir'); });
    on('end', () => { h.onEndStage(); this.close(); });
    on('skipGold', () => { this.say(h.onSkip('gold')); this.closeIfDone(); });
    on('skipBronze', () => { this.say(h.onSkip('bronze')); this.closeIfDone(); });
    on('skipMiss', () => { this.say(h.onSkip('miss')); this.closeIfDone(); });
    on('boss', () => { this.say(h.onToBoss()); });
    on('act', () => { this.say(h.onNextAct()); });
    on('setdur', () => { this.say(h.onSetDurability(Number(String(this.q.dur.value).replace(',', '.')))); });
    this.el.querySelectorAll('[data-test]').forEach((b) => { b.onclick = () => { h.onTestDrive(b.dataset.test); this.close(); }; });
    // Items: Liste mit Suche
    const fillList = () => {
      const qs = String(this.q.isearch.value || '').trim().toLowerCase();
      const list = ITEMS.filter((it) => !qs || it.name.toLowerCase().includes(qs) || it.id.includes(qs) || it.tags.some((t) => t.includes(qs) || (TAGS[t] && TAGS[t].name.toLowerCase().includes(qs))));
      this.q.ilist.innerHTML = list.map((it) => `<option value="${it.id}">${it.icon} ${it.name} · ${(RARITIES[it.rarity] || {}).name || it.rarity}</option>`).join('');
      if (list.length) this.q.ilist.value = list[0].id;
    };
    this.q.isearch.oninput = fillList;
    fillList();
    on('iadd', () => { const id = this.q.ilist.value; this.say(id ? h.onAddItem(id) : 'Kein Item gewählt'); });
    on('ipool', () => { this.say(h.onAllPool()); });
    on('itier', () => { this.say(h.onTierUp(Number(this.q.islot.value))); });
    this.q.perf.onchange = () => { this.say(h.onPerf ? h.onPerf(this.q.perf.checked) : ''); };
    this.q.ilog.onchange = () => { h.onChainLog(this.q.ilog.checked); this.say(this.q.ilog.checked ? 'Ketten-Log an (Konsole, F12)' : 'Ketten-Log aus'); };
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

    // Alle Abschnitte von balance.js: aufklappbar, Felder werden erst beim Aufklappen angelegt
    this.q.sections.innerHTML = Object.keys(ALL_TWEAKS).filter((g) => ALL_TWEAKS[g].length).map((g) => `<details class="dev-sec" data-g="${g}">
      <summary>${SECTION_NAMES[g] || g} <small>${g} · ${ALL_TWEAKS[g].length}</small></summary><div class="dev-tweaks"></div></details>`).join('');
    this.q.sections.querySelectorAll('details').forEach((d) => {
      d.ontoggle = () => { if (d.open && !d.dataset.built) this.buildSection(d); };
    });
  }

  // Zahlenfelder eines balance.js-Abschnitts anlegen
  buildSection(d) {
    const g = d.dataset.g;
    const box = d.querySelector('.dev-tweaks');
    d.dataset.built = '1';
    box.innerHTML = ALL_TWEAKS[g].map((p, i) => `<label class="dev-tw"><span>${p.join(' › ')}<small>${g}.${p.join('.')}</small></span>
      <input type="number" step="any" inputmode="decimal" data-p="${i}" value="${getPath(g, p)}">
      <button class="icon-btn small" data-pr="${i}" aria-label="Zurücksetzen">↺</button></label>`).join('');
    box.querySelectorAll('input').forEach((inp) => {
      inp.onchange = () => {
        const p = ALL_TWEAKS[g][Number(inp.dataset.p)];
        const v = Number(String(inp.value).replace(',', '.'));
        if (!isFinite(v)) { inp.value = String(getPath(g, p)); return; }
        setPath(g, p, v);
        this.h.onTweak(g, p.join('.'));
        this.say(`${g}.${p.join('.')} = ${v}`);
      };
    });
    box.querySelectorAll('[data-pr]').forEach((b) => {
      b.onclick = (e) => {
        e.preventDefault();
        const p = ALL_TWEAKS[g][Number(b.dataset.pr)];
        const v = ALL_ORIGINAL.get(`${g}.${p.join('.')}`);
        setPath(g, p, v);
        b.parentElement.querySelector('input').value = String(v);
        this.h.onTweak(g, p.join('.'));
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
    // Meilensteine mit Zielzeit-Korridor (V2-DESIGN §8): grün = im Korridor, gelb = zu früh, rot = zu spät
    const msRow = (m) => {
      const t = milestoneTarget(m);
      const v = ms[m.id];
      const cls = t && v !== undefined ? (v < t.min ? 'early' : v > t.max ? 'late' : 'ok') : '';
      const corr = t ? `<small>Ziel ${fmtPlaytime(t.min)} – ${fmtPlaytime(t.max)}</small>` : '';
      return `<div class="dev-row ${cls}"><span>${m.name}${corr}</span><b>${v !== undefined ? fmtPlaytime(v) : '–'}</b></div>`;
    };
    const asc = ascensionState(save);
    this.q.ms.innerHTML = `<div class="dev-row"><span>Spielzeit gesamt</span><b>${fmtPlaytime(save.meta.totalPlaytime)}</b></div>`
      + `<div class="dev-row"><span>Schrottstufen: freigeschaltet / gewonnen / gewählt</span><b>${asc.unlocked} / ${asc.best} / ${asc.selected}</b></div>`
      + MILESTONES.map(msRow).join('')
      + Object.keys(ms).filter((k) => !MILESTONES.some((m) => m.id === k)).map((k) => `<div class="dev-row"><span>${k}</span><b>${fmtPlaytime(ms[k])}</b></div>`).join('');
    const counts = (stage && stage.eventCounts) || this.lastCounts || {};
    if (stage) this.lastCounts = stage.eventCounts;
    const keys = Object.keys(counts);
    this.q.ev.innerHTML = keys.length ? keys.map((k) => `<span class="dev-chip">${k} <b>${fmt(counts[k])}</b></span>`).join('') : '<span class="small">noch keine Etappe gefahren</span>';
    this.el.querySelector('[data-a=end]').disabled = !(stage && stage.phase !== 'over');
    const run = save.run;
    for (const a of ['skipGold', 'skipBronze', 'skipMiss', 'boss', 'act', 'setdur', 'iadd', 'itier', 'force', 'bolts']) this.el.querySelector(`[data-a=${a}]`).disabled = !run;
    if (this.h.getPerf) {
      const p = this.h.getPerf();
      this.q.perfTxt.textContent = `Jetzt: ${p.fps} fps · ${p.calls} Draw Calls · ${p.triangles} Dreiecke · ${p.geometries} Geometrien · ${p.programs} Shader · Pixel-Ratio ${p.pixelRatio} (${p.quality})`;
    }
    if (this.h.getTutorial) {
      const t = this.h.getTutorial();
      this.el.querySelector('[data-a=tutReset]').title = `${t.seen}/${t.total} Hinweise gesehen${t.off ? ', aus' : ''}`;
    }
    const inv = run ? run.inventory || [] : [];
    this.q.islot.innerHTML = inv.map((e, i) => `<option value="${i}">${i + 1}: ${entryName(e)} ★${e.tier || 1}</option>`).join('') || '<option value="-1">– leer –</option>';
    this.q.ilog.checked = chainLogOn();
    if (run && document.activeElement !== this.q.dur) this.q.dur.value = String(Math.round(run.durability));
  }

  open() {
    this.say('');
    this.refresh();
    show(this.el, true);
  }

  close() {
    // Fokus aus dem Menü nehmen (sonst landen Pfeil-/Leertaste weiter im versteckten Eingabefeld)
    const a = document.activeElement;
    if (a && this.el.contains(a) && typeof a.blur === 'function') a.blur();
    show(this.el, false);
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }
}
