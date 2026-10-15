// Zeitweise Stat-Modifikatoren einer Etappe: Buffs (mit Dauer), Stapel (bis Etappenende) und Zähler (charge).
// Wird von den Effekten (items/effects.js) über ctx befüllt; die Etappe holt mods() und rechnet die Stats neu,
// sobald `dirty` gesetzt ist. Die Trigger-Engine (items/triggerEngine.js) nutzt denselben Zustand (statMods()).
// Reine Logik ohne three.js und DOM.

export class ModState {
  constructor() {
    this.buffs = [];            // { stat, add, mul, t, source }
    this.stacks = new Map();    // key → { stat, add, mul, maxAdd, maxMul, count }
    this.charges = new Map();   // key → aktueller Zählerstand
    this.dirty = false;
  }

  // Zeitweiser Bonus. mod: { add?, mul? }
  addBuff(stat, mod, dur, source = null) {
    if (!(dur > 0)) return;
    this.buffs.push({ stat, add: mod.add || 0, mul: mod.mul || 0, t: dur, source });
    this.dirty = true;
  }

  // Dauerhafter Bonus bis Etappenende, stapelbar bis max (gleiches Vorzeichen wie der Schritt).
  // Ergebnis: true, wenn sich der Stapel verändert hat.
  addStack(key, stat, mod, max = Infinity) {
    let s = this.stacks.get(key);
    if (!s) { s = { stat, add: 0, mul: 0, count: 0 }; this.stacks.set(key, s); }
    const lim = Math.abs(max ?? Infinity);
    const step = (cur, d) => {
      if (!d) return cur;
      const nv = cur + d;
      return Math.sign(nv) * Math.min(Math.abs(nv), lim);
    };
    const a = step(s.add, mod.add || 0);
    const m = step(s.mul, mod.mul || 0);
    if (a === s.add && m === s.mul) return false;
    s.add = a;
    s.mul = m;
    s.count++;
    this.dirty = true;
    return true;
  }

  // Stapel um einen Faktor verkleinern (z. B. halbieren). step (optional): auf volle Schritte abrunden (Betrag)
  scaleStack(key, f, step = 0) {
    const s = this.stacks.get(key);
    if (!s) return;
    const q = (v) => (step > 0 ? Math.sign(v) * Math.floor(Math.abs(v * f) / step + 1e-9) * step : v * f);
    s.add = q(s.add);
    s.mul = q(s.mul);
    this.dirty = true;
  }

  // Wert eines Stapels { add, mul } oder null
  stackOf(key) { return this.stacks.get(key) || null; }

  // Zähler: +n; erreicht er `at`, wird er auf 0 gesetzt und true zurückgegeben
  charge(key, n = 1, at = 1) {
    const c = (this.charges.get(key) || 0) + n;
    if (c >= at) { this.charges.set(key, 0); return true; }
    this.charges.set(key, c);
    return false;
  }

  // Alle Buffs einer Quelle (id oder { id }) entfernen, z. B. wenn der Fallschirm vorzeitig endet
  removeSource(id) {
    let removed = false;
    for (let i = this.buffs.length - 1; i >= 0; i--) {
      const src = this.buffs[i].source;
      if (src === id || (src && src.id === id)) { this.buffs.splice(i, 1); removed = true; }
    }
    if (removed) this.dirty = true;
    return removed;
  }

  // Buffs altern lassen
  update(dt) {
    let removed = false;
    for (let i = this.buffs.length - 1; i >= 0; i--) {
      const b = this.buffs[i];
      b.t -= dt;
      if (b.t <= 0) { this.buffs.splice(i, 1); removed = true; }
    }
    if (removed) this.dirty = true;
  }

  // Aktuelle Modifikatoren als Liste [{ stats: { stat: { add, mul } } }] (Format von statMods.applyMods)
  mods() {
    const out = [];
    for (const b of this.buffs) out.push({ stats: { [b.stat]: { add: b.add, mul: b.mul } } });
    for (const s of this.stacks.values()) out.push({ stats: { [s.stat]: { add: s.add, mul: s.mul } } });
    return out;
  }

  // Für die Trigger-Engine: Alias nach ARCHITEKTUR.md §5
  statMods() { return this.mods(); }

  get active() { return this.buffs.length + this.stacks.size; }

  reset() {
    this.buffs.length = 0;
    this.stacks.clear();
    this.charges.clear();
    this.dirty = true;
  }
}
