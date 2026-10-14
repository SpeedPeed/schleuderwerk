// Alle Geräusche werden live mit der Web Audio API erzeugt, ganz ohne Audiodateien.

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
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
    this.master.gain.value = this.enabled ? 0.7 : 0;
    this.master.connect(comp);

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
    engFilter.connect(this.engGain).connect(this.master);
    this.engOsc.start();
    this.engOsc2.start();

    this.boostGain = this.noiseLoop('bandpass', 900, 0.8);
    this.windGain = this.noiseLoop('lowpass', 500, 0.5);
    this.windFilter = this.lastFilter;
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
    src.connect(f).connect(g).connect(this.master);
    src.start();
    this.lastFilter = f;
    return g;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.7 : 0, this.ctx.currentTime, 0.05);
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  // Jeden Frame: Motor/Boost/Wind an den Zustand anpassen
  loop({ active, speed = 0, boosting = false, air = false }) {
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
  }

  tone(freq, dur, { type = 'sine', vol = 0.25, slide = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  burst(dur, freq, { vol = 0.4, type = 'lowpass', slide = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // ---- einzelne Effekte ----
  // Schraube eingesammelt (Tonhöhe steigt mit der Serie)
  bolt(streak = 1) {
    const semi = PENTA[Math.min(PENTA.length - 1, streak - 1)];
    const f = 880 * Math.pow(2, semi / 12);
    this.tone(f, 0.07, { type: 'square', vol: 0.05 });
    this.tone(f * 2, 0.1, { type: 'triangle', vol: 0.1, delay: 0.03 });
  }
  jump() { this.tone(220, 0.18, { type: 'triangle', vol: 0.18, slide: 2.2 }); this.burst(0.12, 900, { vol: 0.12, type: 'bandpass' }); }
  ability() { this.tone(660, 0.08, { type: 'triangle', vol: 0.1 }); this.tone(990, 0.1, { type: 'sine', vol: 0.08, delay: 0.05 }); }
  overheat() { this.burst(0.8, 3500, { vol: 0.3, type: 'highpass', slide: 0.6 }); this.tone(330, 0.4, { type: 'sawtooth', vol: 0.08, slide: 0.5 }); }
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
  ring() { [0, 4, 7, 12].forEach((s, i) => this.tone(660 * Math.pow(2, s / 12), 0.12, { type: 'triangle', vol: 0.14, delay: i * 0.045 })); }
  trick(mult = 1) { const f = 440 * Math.min(3, 0.8 + mult * 0.25); this.tone(f, 0.1, { type: 'square', vol: 0.06 }); this.tone(f * 1.26, 0.16, { type: 'triangle', vol: 0.12, delay: 0.06 }); }
  perfect() { [0, 4, 7, 12, 16].forEach((s, i) => this.tone(523 * Math.pow(2, s / 12), 0.25, { type: 'triangle', vol: 0.1, delay: i * 0.03 })); }
  bank() { this.tone(1318, 0.08, { type: 'square', vol: 0.06 }); this.tone(1760, 0.2, { type: 'triangle', vol: 0.12, delay: 0.07 }); }
  buy() { [0, 4, 7, 12].forEach((s, i) => this.tone(392 * Math.pow(2, s / 12), 0.18, { type: 'square', vol: 0.07, delay: i * 0.06 })); }
  click() { this.tone(900, 0.04, { type: 'triangle', vol: 0.12 }); }
  denied() { this.tone(180, 0.15, { type: 'square', vol: 0.1 }); this.tone(140, 0.2, { type: 'square', vol: 0.1, delay: 0.1 }); }
  record() { [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => this.tone(523 * Math.pow(2, s / 12), 0.2, { type: 'square', vol: 0.07, delay: i * 0.09 })); }
  money() { this.tone(1500 + Math.random() * 300, 0.04, { type: 'square', vol: 0.03 }); }
}
