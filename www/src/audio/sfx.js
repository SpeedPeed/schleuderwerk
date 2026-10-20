// Alle Geräusche werden live mit der Web Audio API erzeugt, ganz ohne Audiodateien (Platzhalter-Klänge).
// Signalweg: Effekte → sfxBus ┐
//            Musik   → musicBus ┴→ master (Ton an/aus) → Kompressor → Ausgang
// Lautstärken (Einstellungen): setVolumes(effekte 0…1, musik 0…1). Zahlen: data/balance.js → AUDIO.
import { AUDIO } from '../data/balance.js';

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const semi = (s) => Math.pow(2, s / 12);

export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.sfxVol = AUDIO.defaultSfx;
    this.musicVol = AUDIO.defaultMusic;
    this.music = null;          // laufende Musik-Schleife { theme, step, next, paused }
    this.lastTag = {};          // Tag → letzte Auslösung (ctx-Zeit), gegen Klang-Flut bei Ketten
  }

  // Muss nach der ersten Berührung aufgerufen werden (Browser-Regel)
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? AUDIO.master : 0;
    this.master.connect(comp);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVol;
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVol;
    this.musicBus.connect(this.master);

    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Dauerschleifen: Motor, Boost, Fahrtwind
    this.engOsc = ctx.createOscillator();
    this.engOsc.type = 'sawtooth';
    this.engOsc2 = ctx.createOscillator();
    this.engOsc2.type = 'square';
    const engFilter = ctx.createBiquadFilter();
    engFilter.type = 'lowpass';
    engFilter.frequency.value = 420;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    this.engOsc.connect(engFilter);
    this.engOsc2.connect(g2).connect(engFilter);
    engFilter.connect(this.engGain).connect(this.sfxBus);
    this.engOsc.start();
    this.engOsc2.start();

    this.boostGain = this.noiseLoop('bandpass', 900, 0.8);
    this.windGain = this.noiseLoop('lowpass', 500, 0.5);
    this.windFilter = this.lastFilter;
    // vor dem Entsperren gewünschte Musik jetzt starten
    if (this.music) this.music.next = ctx.currentTime + 0.05;
  }

  noiseLoop(type, freq, q) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start();
    this.lastFilter = f;
    return g;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? AUDIO.master : 0, this.ctx.currentTime, 0.05);
  }

  // Lautstärken 0…1 (Einstellungen)
  setVolumes(sfx, music) {
    this.sfxVol = Math.max(0, Math.min(1, sfx));
    this.musicVol = Math.max(0, Math.min(1, music));
    if (!this.ctx) return;
    this.sfxBus.gain.setTargetAtTime(this.sfxVol, this.ctx.currentTime, 0.05);
    this.musicBus.gain.setTargetAtTime(this.musicVol, this.ctx.currentTime, 0.05);
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  // Jedes Bild: Motor/Boost/Wind an den Zustand anpassen, Musik nachplanen.
  // Argumente einzeln (kein Objekt pro Bild)
  loop(active, speed = 0, boosting = false, air = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const on = active ? 1 : 0;
    const f = 55 + Math.min(speed, 80) * 2.2 + (boosting ? 40 : 0);
    this.engOsc.frequency.setTargetAtTime(f, t, 0.08);
    this.engOsc2.frequency.setTargetAtTime(f * 0.501, t, 0.08);
    this.engGain.gain.setTargetAtTime(on * (boosting ? 0.16 : 0.06), t, 0.1);
    this.boostGain.gain.setTargetAtTime(on * (boosting ? 0.35 : 0), t, 0.05);
    this.windGain.gain.setTargetAtTime(on * (air ? Math.min(0.3, speed / 160) : Math.min(0.08, speed / 400)), t, 0.2);
    this.windFilter.frequency.setTargetAtTime(300 + speed * 12, t, 0.2);
    if (this.music) this.scheduleMusic();
  }

  // Ton: at = absolute ctx-Zeit (sonst jetzt + delay), bus = Ziel (Standard: Effekte)
  tone(freq, dur, { type = 'sine', vol = 0.25, slide = 0, delay = 0, at = 0, bus = null } = {}) {
    if (!this.ctx) return;
    const t = at || this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus || this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  burst(dur, freq, { vol = 0.4, type = 'lowpass', slide = 0, delay = 0, at = 0, bus = null, q = 1 } = {}) {
    if (!this.ctx) return;
    const t = at || this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus || this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // ---- einzelne Effekte (Etappe) ----
  // Schraube eingesammelt (Tonhöhe steigt mit der Serie)
  bolt(streak = 1) {
    const f = 880 * semi(PENTA[Math.min(PENTA.length - 1, streak - 1)]);
    this.tone(f, 0.07, { type: 'square', vol: 0.05 });
    this.tone(f * 2, 0.1, { type: 'triangle', vol: 0.1, delay: 0.03 });
  }
  jump() { this.tone(220, 0.18, { type: 'triangle', vol: 0.18, slide: 2.2 }); this.burst(0.12, 900, { vol: 0.12, type: 'bandpass' }); }
  ability() { this.tone(660, 0.08, { type: 'triangle', vol: 0.1 }); this.tone(990, 0.1, { type: 'sine', vol: 0.08, delay: 0.05 }); }
  overheat() {
    this.burst(0.9, 3500, { vol: 0.32, type: 'highpass', slide: 0.6 });
    this.tone(330, 0.45, { type: 'sawtooth', vol: 0.08, slide: 0.5 });
    this.tone(880, 0.12, { type: 'square', vol: 0.05, delay: 0.05 });
    this.tone(880, 0.12, { type: 'square', vol: 0.05, delay: 0.25 });
  }
  empty() { [0, 1, 2].forEach((i) => this.tone(120 - i * 15, 0.1, { type: 'square', vol: 0.08, delay: i * 0.14 })); }
  bounce() { this.tone(300, 0.2, { type: 'sine', vol: 0.25, slide: 1.8 }); this.tone(1200, 0.06, { type: 'square', vol: 0.05 }); }
  explosion() { this.burst(0.7, 900, { vol: 0.6, slide: 0.3 }); this.tone(55, 0.5, { type: 'sine', vol: 0.5, slide: 0.5 }); }
  stretch(p) { this.tone(110 + p * 260, 0.05, { type: 'triangle', vol: 0.08 }); }
  launch(p) {
    this.burst(0.5, 2500, { vol: 0.35 + p * 0.3, type: 'bandpass', slide: 0.15 });
    this.tone(160, 0.25, { type: 'sine', vol: 0.4, slide: 0.4 });
    this.tone(320 + p * 200, 0.15, { type: 'triangle', vol: 0.15, slide: 0.5 });
  }
  whoosh() { this.burst(0.3, 600, { vol: 0.2, type: 'bandpass', slide: 3 }); }
  land(i) {
    this.burst(0.18 + i * 0.2, 400 + i * 400, { vol: 0.2 + i * 0.4 });
    this.tone(90, 0.2, { vol: 0.2 + i * 0.3, slide: 0.5 });
  }
  crash() {
    this.burst(0.5, 1800, { vol: 0.6, slide: 0.2 });
    this.tone(70, 0.4, { type: 'square', vol: 0.25, slide: 0.5 });
    this.tone(140, 0.12, { type: 'sawtooth', vol: 0.1, slide: 0.3, delay: 0.05 });
  }
  ring() { [0, 4, 7, 12].forEach((s, i) => this.tone(660 * semi(s), 0.12, { type: 'triangle', vol: 0.14, delay: i * 0.045 })); }
  trick(mult = 1) { const f = 440 * Math.min(3, 0.8 + mult * 0.25); this.tone(f, 0.1, { type: 'square', vol: 0.06 }); this.tone(f * 1.26, 0.16, { type: 'triangle', vol: 0.12, delay: 0.06 }); }
  perfect() { [0, 4, 7, 12, 16].forEach((s, i) => this.tone(523 * semi(s), 0.25, { type: 'triangle', vol: 0.1, delay: i * 0.03 })); }
  bank() { this.tone(1318, 0.08, { type: 'square', vol: 0.06 }); this.tone(1760, 0.2, { type: 'triangle', vol: 0.12, delay: 0.07 }); }
  click() { this.metalButton(); }   // Paket B: jeder Knopf klingt nach Blech
  denied() { this.tone(180, 0.15, { type: 'square', vol: 0.1 }); this.tone(140, 0.2, { type: 'square', vol: 0.1, delay: 0.1 }); }
  record() { [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => this.tone(523 * semi(s), 0.2, { type: 'square', vol: 0.07, delay: i * 0.09 })); }
  money() { this.ratchet(); }       // Paket B: Zählwerk = Ratsche
  // Medaille erreicht (i = 0 Bronze, 1 Silber, 2 Gold): Fanfare, je Stufe höher und länger
  medal(i = 0) {
    [0, 4, 7, 12].forEach((s, k) => this.tone(440 * semi(s + i * 3), 0.22, { type: 'triangle', vol: 0.12, delay: k * 0.07 }));
    if (i >= 2) this.tone(440 * semi(19 + i * 3), 0.5, { type: 'triangle', vol: 0.1, delay: 0.3 });
  }
  // Warnung (Boss-Baustein, Blitz kündigt sich an)
  warn() { this.tone(1760, 0.05, { type: 'square', vol: 0.04 }); this.tone(1760, 0.05, { type: 'square', vol: 0.04, delay: 0.12 }); }
  zap() { this.burst(0.6, 4000, { vol: 0.45, type: 'highpass', slide: 0.3 }); this.tone(90, 0.5, { type: 'sawtooth', vol: 0.18, slide: 0.4 }); }

  // ---- Items: eigener Klang je Tag (Tonhöhe steigt mit der Kettentiefe) ----
  tag(id, depth = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - (this.lastTag[id] ?? -1) < AUDIO.tagGap) return;
    this.lastTag[id] = now;
    const k = semi(Math.min(AUDIO.chainMaxSemi, depth * AUDIO.chainStepSemi));
    switch (id) {
      case 'feuer': this.burst(0.25, 1400 * k, { vol: 0.22, slide: 0.35 }); this.tone(95 * k, 0.18, { type: 'sawtooth', vol: 0.07, slide: 0.6 }); break;
      case 'eis': this.tone(1760 * k, 0.18, { type: 'triangle', vol: 0.08 }); this.tone(2637 * k, 0.22, { type: 'sine', vol: 0.06, delay: 0.04 }); break;
      case 'elektro': [0, 1, 2].forEach((i) => this.tone(1200 * k, 0.03, { type: 'square', vol: 0.05, delay: i * 0.035 })); this.burst(0.12, 5000, { vol: 0.12, type: 'highpass' }); break;
      case 'gyro': [0, 4, 7].forEach((s, i) => this.tone(523 * k * semi(s), 0.07, { type: 'triangle', vol: 0.08, delay: i * 0.035 })); break;
      case 'magnet': this.tone(220 * k, 0.25, { type: 'sine', vol: 0.12, slide: 1.5 }); this.tone(330 * k, 0.2, { type: 'sine', vol: 0.06, slide: 0.7, delay: 0.05 }); break;
      case 'schrott': this.burst(0.12, 2500 * k, { vol: 0.25, type: 'bandpass', q: 6 }); this.tone(180 * k, 0.12, { type: 'square', vol: 0.06, slide: 0.7 }); break;
      case 'hydraulik': this.burst(0.3, 600 * k, { vol: 0.2, slide: 0.4 }); this.tone(70 * k, 0.22, { type: 'sine', vol: 0.18, slide: 1.3 }); break;
      case 'gummi': this.tone(260 * k, 0.2, { type: 'sine', vol: 0.18, slide: 2.2 }); break;
      case 'rakete': this.tone(200 * k, 0.25, { type: 'sawtooth', vol: 0.06, slide: 3 }); this.burst(0.25, 1500 * k, { vol: 0.15, type: 'bandpass', slide: 2 }); break;
      case 'gluck': [0, 4, 7].forEach((s, i) => this.tone(1047 * k * semi(s), 0.3, { type: 'triangle', vol: 0.06, delay: i * 0.05 })); break;
      default: this.tone(700 * k, 0.06, { type: 'triangle', vol: 0.08 });
    }
  }

  // Kettenreaktion: Arpeggio, je Kettenglied höher (n = Anzahl Glieder)
  chain(n = 3) {
    const base = AUDIO.chainBaseHz * semi(Math.min(AUDIO.chainMaxSemi, n * AUDIO.chainStepSemi));
    [0, 4, 7, 12].forEach((s, i) => this.tone(base * semi(s), 0.14, { type: i % 2 ? 'square' : 'triangle', vol: i % 2 ? 0.04 : 0.1, delay: i * 0.045 }));
    this.burst(0.18, 3000, { vol: 0.08, type: 'highpass', delay: 0.12 });
  }

  // ---- Shops, Werkbank, Labor ----
  buy() { [0, 4, 7, 12].forEach((s, i) => this.tone(392 * semi(s), 0.18, { type: 'square', vol: 0.07, delay: i * 0.06 })); }
  // Ladenglocke beim Betreten eines Sonderknotens
  shopEnter() { this.tone(1318, 0.35, { type: 'sine', vol: 0.12 }); this.tone(1046, 0.5, { type: 'sine', vol: 0.12, delay: 0.16 }); }
  // Reroll: Würfel klappern
  reroll() { [0, 1, 2, 3].forEach((i) => this.burst(0.04, 2200 + i * 300, { vol: 0.2, type: 'bandpass', q: 4, delay: i * 0.055 })); this.tone(660, 0.1, { type: 'triangle', vol: 0.08, delay: 0.24 }); }
  // Zerlegen/Verkaufen: Münzen
  sell() { [0, 1, 2].forEach((i) => this.tone(1800 - i * 200, 0.06, { type: 'square', vol: 0.04, delay: i * 0.05 })); }
  // Werkbank-Fusion: aufsteigender Wirbel + Akkord
  fusion() {
    this.tone(200, 0.5, { type: 'sawtooth', vol: 0.06, slide: 6 });
    this.burst(0.5, 400, { vol: 0.15, type: 'bandpass', slide: 8 });
    [0, 4, 7, 12].forEach((s) => this.tone(523 * semi(s), 0.6, { type: 'triangle', vol: 0.07, delay: 0.45 }));
  }
  // Forschung abgeschlossen: Blubbern + Akkord
  research() {
    for (let i = 0; i < 5; i++) this.tone(600 + Math.random() * 800, 0.06, { type: 'sine', vol: 0.08, slide: 1.6, delay: i * 0.06 });
    [0, 5, 9].forEach((s) => this.tone(659 * semi(s), 0.5, { type: 'triangle', vol: 0.07, delay: 0.32 }));
  }

  // ---- Paket B: Werkstatt-Klänge ----
  // Blechknopf: kurzes „Klack“ (Blech schlägt auf Blech) – alle Knöpfe der Oberfläche
  metalButton() {
    this.burst(0.05, 2600, { vol: 0.22, type: 'bandpass', q: 3 });
    this.tone(420, 0.06, { type: 'square', vol: 0.05, slide: 0.6 });
    this.tone(1750, 0.04, { type: 'triangle', vol: 0.05, delay: 0.012 });
  }
  // Ratsche (Zählwerk rattert hoch): ein Zahn
  ratchet() {
    this.burst(0.022, 3800 + Math.random() * 700, { vol: 0.14, type: 'bandpass', q: 8 });
    this.tone(2400, 0.015, { type: 'square', vol: 0.02 });
  }
  // Stempel: dumpfer Schlag + Papier-Knistern
  stamp() {
    this.tone(95, 0.18, { type: 'sine', vol: 0.4, slide: 0.55 });
    this.burst(0.12, 900, { vol: 0.35, slide: 0.4 });
    this.burst(0.06, 4200, { vol: 0.08, type: 'highpass', delay: 0.03 });
  }
  // Kreppband abreißen: rauschender Riss, der hochzieht
  tapeTear() {
    this.burst(0.2, 1200, { vol: 0.2, type: 'bandpass', q: 1.5, slide: 3.2 });
    for (let i = 0; i < 4; i++) this.burst(0.018, 3000 + i * 500, { vol: 0.07, type: 'bandpass', q: 6, delay: 0.03 + i * 0.035 });
  }
  // Schraube fällt in die Dose: helles „Ting“ + kurzes Klappern
  screwDrop() {
    this.tone(2900 + Math.random() * 300, 0.18, { type: 'triangle', vol: 0.07 });
    this.tone(4100, 0.08, { type: 'sine', vol: 0.03, delay: 0.01 });
    [0, 1, 2].forEach((i) => this.burst(0.02, 2200 + i * 400, { vol: 0.09, type: 'bandpass', q: 5, delay: 0.07 + i * 0.045 }));
  }

  // Tutorial-Hinweis erscheint: freundliches „Pling“
  tutorial() { this.tone(988, 0.12, { type: 'sine', vol: 0.1 }); this.tone(1319, 0.2, { type: 'sine', vol: 0.08, delay: 0.08 }); }

  // ---- Jingles ----
  victory() {
    const seq = [0, 4, 7, 12, 7, 12, 16, 19, 24];
    seq.forEach((s, i) => this.tone(523 * semi(s), i === seq.length - 1 ? 0.9 : 0.18, { type: 'square', vol: 0.07, delay: i * 0.11 }));
    [0, 4, 7].forEach((s) => this.tone(262 * semi(s), 1.2, { type: 'triangle', vol: 0.08, delay: seq.length * 0.11 - 0.1 }));
  }
  defeat() {
    [0, -1, -2, -3].forEach((s, i) => this.tone(392 * semi(s), i === 3 ? 0.8 : 0.32, { type: 'sawtooth', vol: 0.06, slide: i === 3 ? 0.85 : 0, delay: i * 0.34 }));
    this.tone(98, 1.4, { type: 'triangle', vol: 0.1, delay: 1.0, slide: 0.8 });
  }

  // Platzhalter-Erkennungsmelodie eines Bosses (data/biomes.js → bosses[].music: { wave, notes [Hz], beat [s] }):
  // Melodie zweimal, darunter ein dumpfer Schlag auf jedem zweiten Ton
  bossTheme(m) {
    if (!m || !Array.isArray(m.notes)) return;
    const beat = m.beat || 0.2;
    for (let r = 0; r < 2; r++) {
      m.notes.forEach((f, i) => {
        const delay = (r * m.notes.length + i) * beat;
        this.tone(f, beat * 0.9, { type: m.wave || 'square', vol: 0.09, delay });
        if (i % 2 === 0) this.burst(0.12, 140, { vol: 0.25, delay });
      });
    }
  }

  // ---- Boss-Musik: einfache Schleife aus der Erkennungsmelodie (Bass, Melodie, Schlagzeug) ----
  startMusic(m) {
    if (!m || !Array.isArray(m.notes) || !m.notes.length) return;
    if (this.music && this.music.theme === m) { this.music.paused = false; return; }
    this.music = { theme: m, step: 0, next: this.ctx ? this.ctx.currentTime + 0.1 : 0, paused: false };
  }
  stopMusic() { this.music = null; }
  pauseMusic(on) { if (this.music) { this.music.paused = on; if (!on && this.ctx) this.music.next = this.ctx.currentTime + 0.05; } }
  get musicPlaying() { return !!this.music && !this.music.paused; }

  // plant die Noten der nächsten AUDIO.music.lookahead Sekunden (aus loop())
  scheduleMusic() {
    const mu = this.music;
    if (!mu || mu.paused || !this.ctx) return;
    const M = AUDIO.music;
    const now = this.ctx.currentTime;
    if (mu.next < now) mu.next = now + 0.02;
    const th = mu.theme;
    const step = (th.beat || 60 / M.bpmDefault) / 2;   // Achtel
    const n = th.notes.length;
    while (mu.next < now + M.lookahead) {
      const s = mu.step, t = mu.next;
      const bar = Math.floor(s / 16) % 4;
      const up = bar === 3 ? 2 : 1;                      // jeder 4. Takt eine Oktave höher
      if (s % 2 === 0) this.tone(th.notes[(s / 2) % n] * up, step * 1.8, { type: th.wave || 'square', vol: M.leadVol, at: t, bus: this.musicBus });
      if (s % 16 === 0 || s % 16 === 6 || s % 16 === 10) this.tone(th.notes[0] / 2, step * 2.5, { type: 'triangle', vol: M.bassVol * 2, at: t, bus: this.musicBus });
      if (s % 4 === 0) this.burst(0.1, 160, { vol: M.drumVol, at: t, bus: this.musicBus });
      else if (s % 2 === 1) this.burst(0.03, 7000, { vol: M.drumVol * 0.25, type: 'highpass', at: t, bus: this.musicBus });
      mu.step++;
      mu.next += step;
    }
  }
}
