import { el, show, confirmDialog } from './dom.js';
import { GAME_VERSION } from '../config/balance.js';

// Pause-Menü und Einstellungen (inkl. Spielstand exportieren/importieren).
export class Menus {
  constructor(root, h) {
    this.root = root;
    this.h = h;
    this.pause = el(`<div id="pause" class="overlay hidden"><div class="card">
      <h2>Pause</h2>
      <div class="btn-col">
        <button class="btn btn-primary" data-a="resume">▶ Weiter</button>
        <button class="btn btn-secondary" data-a="settings">⚙ Einstellungen</button>
        <button class="btn btn-danger" data-a="quit">⏹ Run beenden</button>
      </div></div></div>`);
    this.pause.querySelector('[data-a=resume]').onclick = h.onResume;
    this.pause.querySelector('[data-a=settings]').onclick = () => this.openSettings();
    this.pause.querySelector('[data-a=quit]').onclick = h.onQuit;
    root.appendChild(this.pause);

    this.settings = el(`<div id="settings" class="overlay hidden"><div class="card">
      <h2>Einstellungen</h2>
      <div class="toggles">
        <label><input type="checkbox" data-k="sound"> 🔊 Ton</label>
        <label><input type="checkbox" data-k="vibration"> 📳 Vibration</label>
        <label><input type="checkbox" data-k="shake"> 💥 Bildschirmwackeln</label>
        <label><input type="checkbox" data-k="shadows"> 🌗 Schatten</label>
      </div>
      <h3>Spielstand</h3>
      <p class="small">Sichere den Text z. B. in einer Notiz. So geht beim Neuinstallieren nichts verloren.</p>
      <textarea data-id="text" rows="3" placeholder="Hier erscheint der Export – oder füge hier einen Spielstand zum Importieren ein."></textarea>
      <div class="btn-row">
        <button class="btn btn-secondary" data-a="export">📤 Exportieren</button>
        <button class="btn btn-secondary" data-a="import">📥 Importieren</button>
      </div>
      <div class="msg" data-id="msg"></div>
      <div class="btn-row">
        <button class="btn btn-danger small-btn" data-a="reset">🗑 Spielstand löschen</button>
        <button class="btn btn-primary" data-a="close">Fertig</button>
      </div>
      <div class="version">Schleuderwerk v${GAME_VERSION}</div>
    </div></div>`);
    root.appendChild(this.settings);
    const s = this.settings;
    this.text = s.querySelector('[data-id=text]');
    this.msg = s.querySelector('[data-id=msg]');
    s.querySelectorAll('input[data-k]').forEach((i) => {
      i.onchange = () => h.onSetting(i.dataset.k, i.checked);
    });
    s.querySelector('[data-a=close]').onclick = () => this.closeSettings();
    s.querySelector('[data-a=export]').onclick = async () => {
      this.text.value = h.onExport();
      this.text.select();
      let copied = false;
      try { await navigator.clipboard.writeText(this.text.value); copied = true; } catch (_) { /* egal */ }
      if (!copied) { try { copied = document.execCommand('copy'); } catch (_) { /* egal */ } }
      this.say(copied ? '✔ In die Zwischenablage kopiert.' : 'Text markieren und kopieren.');
    };
    s.querySelector('[data-a=import]').onclick = async () => {
      const t = this.text.value.trim();
      if (!t) { this.say('Bitte zuerst einen Spielstand-Text einfügen.'); return; }
      if (!(await confirmDialog(root, 'Aktuellen Spielstand durch den eingefügten ersetzen?', 'Ersetzen'))) return;
      const err = h.onImport(t);
      this.say(err ? `✖ ${err}` : '✔ Spielstand geladen!');
    };
    s.querySelector('[data-a=reset]').onclick = async () => {
      if (!(await confirmDialog(root, 'Wirklich ALLES löschen? Das kann nicht rückgängig gemacht werden.', 'Löschen'))) return;
      if (!(await confirmDialog(root, 'Ganz sicher? Tipp: vorher exportieren!', 'Endgültig löschen'))) return;
      h.onReset();
      this.say('Spielstand gelöscht.');
    };
  }

  say(t) { this.msg.textContent = t; }

  showPause(on) { show(this.pause, on); }

  openSettings() {
    const st = this.h.getSettings();
    this.settings.querySelectorAll('input[data-k]').forEach((i) => { i.checked = !!st[i.dataset.k]; });
    this.text.value = '';
    this.say('');
    show(this.settings, true);
  }

  closeSettings() { show(this.settings, false); }

  get settingsOpen() { return !this.settings.classList.contains('hidden'); }
}
