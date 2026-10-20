import { el, show, confirmDialog, icon } from './dom.js';
import { TXT } from '../data/texts.js';
import { GAME_VERSION, CONTROLS } from '../data/balance.js';
import { keyHelpHtml } from './inputMode.js';

// Pause-Menü und Einstellungen (inkl. Spielstand exportieren/importieren).
// Paket B: Werkzeugkasten-Deckel mit Typenschild; Schalter als Kippschalter (style.css → .toggles input).
export class Menus {
  constructor(root, h) {
    this.root = root;
    this.h = h;
    this.pause = el(`<div id="pause" class="overlay hidden"><div class="card">
      <h2>${TXT.pause.title}</h2>
      <div class="btn-col">
        <button class="btn btn-primary" data-a="resume">${icon('weiter')} ${TXT.pause.resume}</button>
        <button class="btn btn-secondary" data-a="settings">${icon('regler')} ${TXT.pause.settings}</button>
        <button class="btn btn-secondary kbd-only" data-a="keys">${icon('tastatur')} ${TXT.pause.keys}</button>
        <button class="btn btn-danger" data-a="quit">${TXT.pause.quitTest}</button>
      </div>
      <p class="small kbd-only pause-keys">${TXT.pause.keyLine}</p></div></div>`);
    this.pause.querySelector('[data-a=resume]').onclick = h.onResume;
    this.pause.querySelector('[data-a=settings]').onclick = () => this.openSettings();
    this.pause.querySelector('[data-a=quit]').onclick = h.onQuit;
    this.pause.querySelector('[data-a=keys]').onclick = () => this.openKeys();
    root.appendChild(this.pause);

    this.settings = el(`<div id="settings" class="overlay hidden"><div class="card">
      <h2>${TXT.settings.title}</h2>
      <h3>Ton</h3>
      <div class="toggles">
        <label><input type="checkbox" data-k="sound"> ${icon('ton')} Ton an</label>
      </div>
      <label class="slider"><span>Effekte</span><input type="range" min="0" max="100" step="5" data-v="sfxVol" aria-label="Lautstärke Effekte"><b data-id="sfxVolTxt"></b></label>
      <label class="slider"><span>Musik</span><input type="range" min="0" max="100" step="5" data-v="musicVol" aria-label="Lautstärke Musik"><b data-id="musicVolTxt"></b></label>
      <h3>Spielgefühl</h3>
      <div class="toggles">
        <label><input type="checkbox" data-k="vibration"> Vibration</label>
        <label><input type="checkbox" data-k="shake"> Bildschirmwackeln & Blitze</label>
        <label><input type="checkbox" data-k="slowmo"> Zeitlupe bei Stunts</label>
      </div>
      <h3>Grafik</h3>
      <div class="seg" data-id="quality" role="radiogroup" aria-label="Grafikqualität">
        <button class="seg-btn" data-q="low">Niedrig</button><button class="seg-btn" data-q="mid">Mittel</button><button class="seg-btn" data-q="high">Hoch</button>
      </div>
      <p class="small">Niedrig = schneller und sparsamer (weniger Bildpunkte). Schatten kosten ebenfalls Leistung.</p>
      <div class="toggles">
        <label><input type="checkbox" data-k="shadows"> Schatten</label>
      </div>
      <h3 class="kbd-only">Tastatur</h3>
      <div class="btn-col kbd-only"><button class="btn btn-secondary" data-a="keys">${icon('tastatur')} ${TXT.pause.keys}</button></div>
      <h3>Tutorial</h3>
      <p class="small" data-id="tutTxt"></p>
      <div class="btn-col"><button class="btn btn-secondary" data-a="tutReset">${icon('opa')} Hinweise wieder zeigen</button></div>
      <h3>Spielstand</h3>
      <p class="small">Sichere den Text z. B. in einer Notiz. So geht beim Neuinstallieren nichts verloren.</p>
      <textarea data-id="text" rows="3" placeholder="Hier erscheint der Export – oder füge hier einen Spielstand zum Importieren ein."></textarea>
      <div class="btn-row">
        <button class="btn btn-secondary" data-a="export">Exportieren</button>
        <button class="btn btn-secondary" data-a="import">Importieren</button>
      </div>
      <div class="msg" data-id="msg"></div>
      <div class="btn-col"><button class="btn btn-secondary small-btn hidden" data-a="backup">Backup anzeigen (nicht ladbarer Spielstand)</button></div>
      <div class="btn-row">
        <button class="btn btn-danger small-btn" data-a="reset">${icon('tonne')} Spielstand löschen</button>
        <button class="btn btn-primary" data-a="close">${TXT.settings.done}</button>
      </div>
      <div class="version" data-id="version">Schleuderwerk v${GAME_VERSION}${typeof window !== 'undefined' && window.SW_PC_BUILD ? ' · PC-Version' : ''}</div>
    </div></div>`);
    root.appendChild(this.settings);
    const s = this.settings;
    s.querySelector('[data-a=keys]').onclick = () => this.openKeys();

    // Tastenbelegung (PC): eigene Ebene über Pause/Einstellungen
    this.keys = el(`<div id="keys" class="overlay hidden"><div class="card keys-card">
      <h2>${TXT.pause.keys}</h2>
      ${keyHelpHtml()}
      <div class="btn-row"><button class="btn btn-primary" data-a="close">${TXT.settings.done}</button></div>
    </div></div>`);
    this.keys.querySelector('[data-a=close]').onclick = () => this.closeKeys();
    this.keys.addEventListener('click', (e) => { if (e.target === this.keys) this.closeKeys(); });
    root.appendChild(this.keys);
    this.text = s.querySelector('[data-id=text]');
    this.msg = s.querySelector('[data-id=msg]');
    s.querySelectorAll('input[data-k]').forEach((i) => {
      i.onchange = () => h.onSetting(i.dataset.k, i.checked);
    });
    // Lautstärke: beim Ziehen sofort hörbar (ohne Speichern), beim Loslassen gespeichert
    s.querySelectorAll('input[data-v]').forEach((i) => {
      const txt = s.querySelector(`[data-id=${i.dataset.v}Txt]`);
      i.oninput = () => { txt.textContent = `${i.value} %`; h.onSetting(i.dataset.v, Number(i.value) / 100, false); };
      i.onchange = () => h.onSetting(i.dataset.v, Number(i.value) / 100, true);
    });
    s.querySelectorAll('[data-q]').forEach((b) => {
      b.onclick = () => { h.onSetting('quality', b.dataset.q); this.markQuality(b.dataset.q); };
    });
    s.querySelector('[data-a=tutReset]').onclick = () => {
      if (h.onTutorialReset) h.onTutorialReset();
      this.refreshTutorial();
      this.say('Alles klar – die Hinweise erscheinen wieder an den passenden Stellen.');
    };
    s.querySelector('[data-a=close]').onclick = () => this.closeSettings();
    // Verstecktes Dev-Menü: CONTROLS.devTaps× schnell hintereinander auf die Versionsnummer tippen
    this.taps = 0;
    this.lastTap = 0;
    s.querySelector('[data-id=version]').addEventListener('click', () => {
      const now = performance.now();
      this.taps = now - this.lastTap <= CONTROLS.devTapGap * 1000 ? this.taps + 1 : 1;
      this.lastTap = now;
      if (this.taps >= CONTROLS.devTaps) {
        this.taps = 0;
        if (h.onDevMenu) h.onDevMenu();
      }
    });
    s.querySelector('[data-a=export]').onclick = async () => {
      this.text.value = h.onExport();
      this.text.select();
      let copied = false;
      try { await navigator.clipboard.writeText(this.text.value); copied = true; } catch (_) { /* egal */ }
      if (!copied) { try { copied = document.execCommand('copy'); } catch (_) { /* egal */ } }
      this.say(copied ? 'In die Zwischenablage kopiert.' : 'Text markieren und kopieren.');
    };
    s.querySelector('[data-a=import]').onclick = async () => {
      const t = this.text.value.trim();
      if (!t) { this.say('Bitte zuerst einen Spielstand-Text einfügen.'); return; }
      if (!(await confirmDialog(root, 'Aktuellen Spielstand durch den eingefügten ersetzen?', 'Ersetzen'))) return;
      const err = h.onImport(t);
      this.say(err ? `Fehler: ${err}` : 'Spielstand geladen!');
    };
    // Rohtext eines Spielstands, der sich nicht laden ließ (save.js → BACKUP_KEY), zum Kopieren anzeigen
    this.backupBtn = s.querySelector('[data-a=backup]');
    this.backupBtn.onclick = () => {
      const raw = h.getBackup ? h.getBackup() : null;
      if (!raw) { this.say('Kein Backup vorhanden.'); return; }
      this.text.value = raw;
      this.text.select();
      this.say('Backup (Rohtext) – kopieren und aufbewahren.');
    };
    s.querySelector('[data-a=reset]').onclick = async () => {
      if (!(await confirmDialog(root, 'Wirklich ALLES löschen? Das kann nicht rückgängig gemacht werden.', 'Löschen'))) return;
      if (!(await confirmDialog(root, 'Ganz sicher? Tipp: vorher exportieren!', 'Endgültig löschen'))) return;
      h.onReset();
      this.say('Spielstand gelöscht.');
    };
  }

  say(t) { this.msg.textContent = t; }

  // mode 'run': „Run aufgeben“, sonst (Testfahrt im Dev-Menü) „Testfahrt beenden“
  showPause(on, mode = null) {
    if (mode) this.pause.querySelector('[data-a=quit]').textContent = mode === 'run' ? TXT.pause.quitRun : TXT.pause.quitTest;
    show(this.pause, on);
  }

  markQuality(q) {
    this.settings.querySelectorAll('[data-q]').forEach((b) => {
      b.classList.toggle('on', b.dataset.q === q);
      b.setAttribute('aria-checked', String(b.dataset.q === q));
    });
  }

  refreshTutorial() {
    const p = this.h.getTutorial ? this.h.getTutorial() : null;
    this.settings.querySelector('[data-id=tutTxt]').textContent = !p ? ''
      : p.off ? `Hinweise ausgeschaltet (${p.seen} von ${p.total} gesehen).` : `${p.seen} von ${p.total} Hinweisen gesehen – jeder erscheint nur einmal.`;
  }

  openSettings() {
    const st = this.h.getSettings();
    this.settings.querySelectorAll('input[data-k]').forEach((i) => { i.checked = !!st[i.dataset.k]; });
    this.settings.querySelectorAll('input[data-v]').forEach((i) => {
      i.value = String(Math.round((st[i.dataset.v] ?? 1) * 100));
      this.settings.querySelector(`[data-id=${i.dataset.v}Txt]`).textContent = `${i.value} %`;
    });
    this.markQuality(st.quality);
    this.refreshTutorial();
    this.settings.querySelector('.card').scrollTop = 0;
    this.text.value = '';
    this.say('');
    show(this.backupBtn, !!(this.h.getBackup && this.h.getBackup()));
    show(this.settings, true);
  }

  closeSettings() { show(this.settings, false); }

  openKeys() { show(this.keys, true); this.keys.querySelector('.card').scrollTop = 0; }
  closeKeys() { show(this.keys, false); }
  get keysOpen() { return !this.keys.classList.contains('hidden'); }
  get pauseOpen() { return !this.pause.classList.contains('hidden'); }

  get settingsOpen() { return !this.settings.classList.contains('hidden'); }
}
