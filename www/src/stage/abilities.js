// Fähigkeits-Slots einer Etappe (reine Logik ohne DOM und three.js).
//   mode 'hold': solange gehalten aktiv. Der Boost (Regel boostHold) schiebt in physics/vehicle.js und kostet
//                dort boostFuel/boostHeat pro Sekunde; andere Halte-Fähigkeiten kosten fuel/heat pro Sekunde.
//   mode 'tap':  ein Einsatz je Tippen; Kosten je Einsatz, Abklingzeit = cooldown × Stat abilityCooldown.
// Jeder Einsatz löst abilityUse {ability} aus – beim Boost erst, wenn der bezahlte Boost wirklich startet
// (stage/stage.js beim Ereignis boost {free:false}). Effekte laufen über items/effects.js (ctx der Etappe,
// ctx.source = { id: Fähigkeit, kind: 'ability' }).
// Sonderregeln: parachute + hardStop (Auswertung physics/vehicle.js), heatToThrust (Auswertung stage/stage.js).
// Nur in der Luft: Fallschirm, rules.airOnly und Fähigkeiten, deren Effekte nur Drall (spin) sind – am Boden
// kosten sie nichts. Fähigkeiten mit Hitzekosten sind gesperrt, wenn diese Kosten selbst überhitzen würden.
import { abilityById } from '../data/index.js';
import { runAll } from '../items/effects.js';

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

export const isBoostAbility = (def) => !!(def && def.rules && def.rules.boostHold);

// Wirkt die Fähigkeit nur in der Luft? (am Boden: nicht nutzbar, keine Kosten, keine Abklingzeit)
export function isAirOnly(def) {
  if (!def) return false;
  const r = def.rules || {};
  if (r.airOnly || r.parachute) return true;
  const fx = def.effects || [];
  return fx.length > 0 && fx.every((e) => e && e.fx === 'spin');
}

// Effekte einer Fähigkeit mit ihr als Quelle ausführen (boost-Ereignis meldet dann die Fähigkeits-ID)
function runAbilityEffects(def, stage) {
  const ctx = stage.ctx;
  const prev = ctx.source;
  ctx.source = { id: def.id, kind: 'ability' };
  try { runAll(def.effects, ctx, 1); } finally { ctx.source = prev; }
}

export class AbilityBar {
  // ids: Fähigkeits-IDs in Knopf-Reihenfolge (Spezialfähigkeit des Chassis zuletzt)
  constructor(ids = []) {
    this.slots = [];
    for (const id of ids) {
      const def = abilityById(id);
      if (!def) continue;
      this.slots.push({ def, cd: 0, cdMax: 0, held: false, wasHeld: false, special: !!def.chassis, uses: 0, view: { frac: 1, off: false, active: false, ready: true } });
    }
  }

  get length() { return this.slots.length; }

  // Index der Boost-Fähigkeit (für Leertaste/HUD), sonst -1
  get boostSlot() { return this.slots.findIndex((s) => isBoostAbility(s.def)); }

  // Wird der Boost gerade gehalten?
  get boostHeld() {
    for (const s of this.slots) if (s.held && isBoostAbility(s.def)) return true;
    return false;
  }

  cooldownOf(def, stats) { return num(def.cooldown) * (stats ? stats.abilityCooldown : 1); }

  // Würden die Hitzekosten eines Einsatzes selbst die Überhitzung auslösen? (nicht bei noOverheat/heatIsResource)
  wouldOverheat(def, vehicle) {
    const h = num(def.heat);
    if (h <= 0) return false;
    const r = vehicle.rules || {};
    if (r.noOverheat || r.heatIsResource) return false;
    const st = vehicle.stats;
    return vehicle.heat + h * (st.heatGain ?? 1) >= st.heatMax;
  }

  // Darf die Fähigkeit gerade benutzt werden? (Ressourcen, Abklingzeit, Sonderregeln)
  usable(s, vehicle) {
    const d = s.def;
    if (isBoostAbility(d)) return vehicle.canBoost;
    const needsPower = num(d.fuel) > 0 || num(d.heat) > 0;
    if (needsPower && vehicle.stall > 0) return false;                 // Überhitzungs-Stillstand
    if (num(d.fuel) > 0 && vehicle.fuel < (d.mode === 'hold' ? 1e-6 : num(d.fuel))) return false;
    if (d.mode === 'hold') return true;
    const chute = d.rules && d.rules.parachute;
    if (chute && vehicle.parachute > 0) return true;                    // offenen Schirm kappen geht immer
    if (s.cd > 0) return false;
    if (vehicle.onGround && isAirOnly(d)) return false;                 // Fallschirm, Drall … nur in der Luft
    if (this.wouldOverheat(d, vehicle)) return false;
    return true;
  }

  // Eingabe eines Bildes: held = Knopf gehalten, presses = Anzahl neuer Drücke seit dem letzten Bild
  input(i, held, presses, stage) {
    const s = this.slots[i];
    if (!s) return;
    if (s.def.mode === 'hold') {
      s.held = !!held;
      if (s.held && !s.wasHeld) this.startHold(s, stage);
      s.wasHeld = s.held;
    } else {
      for (let k = 0; k < presses; k++) this.use(i, stage);
    }
  }

  // Halte-Fähigkeit beginnt (steigende Flanke). Der Boost zählt erst, wenn er wirklich startet (boostStarted).
  startHold(s, stage) {
    if (isBoostAbility(s.def)) return;
    const v = stage.vehicle;
    if (!this.usable(s, v)) return;
    s.uses++;
    stage.emit('abilityUse', { ability: s.def.id });
    runAbilityEffects(s.def, stage);
  }

  // Ein bezahlter Boost hat begonnen (Ereignis boost {free:false}) → Einsatz der Boost-Fähigkeit zählen
  boostStarted(stage) {
    const s = this.slots[this.boostSlot];
    if (!s) return;
    s.uses++;
    stage.emit('abilityUse', { ability: s.def.id });
  }

  // Tipp-Fähigkeit einsetzen. Ergebnis: true, wenn sie ausgelöst hat.
  use(i, stage) {
    const s = this.slots[i];
    if (!s || s.def.mode === 'hold') return false;
    const d = s.def;
    const v = stage.vehicle;
    const rules = d.rules || {};
    if (!this.usable(s, v)) return false;
    // Fallschirm offen → kappen (kostenlos, Abklingzeit läuft weiter)
    if (rules.parachute && v.parachute > 0) {
      v.toggleParachute(rules.parachute.dur, rules.parachute.maxSink);
      stage.hooks.popup('Schirm gekappt', 'info');
      return true;
    }
    v.useFuel(num(d.fuel));
    v.addHeat(num(d.heat));
    s.cdMax = this.cooldownOf(d, stage.stats);
    s.cd = s.cdMax;
    s.uses++;
    stage.emit('abilityUse', { ability: d.id });
    if (rules.parachute) v.toggleParachute(rules.parachute.dur, rules.parachute.maxSink);
    if (rules.hardStop) v.hardStop();
    if (rules.heatToThrust) stage.heatToThrust(rules.heatToThrust);
    runAbilityEffects(d, stage);
    stage.hooks.sfx('ability', d.id);
    return true;
  }

  // Fallschirm ist zu: zeitweise Boni der Fallschirm-Fähigkeit (z. B. Auftrieb) enden sofort
  parachuteClosed(stage) {
    for (const s of this.slots) if (s.def.rules && s.def.rules.parachute) stage.mods.removeSource(s.def.id);
  }

  // Abklingzeiten und Kosten der Halte-Fähigkeiten (1× pro Physik-Schritt)
  update(dt, stage) {
    const v = stage.vehicle;
    for (const s of this.slots) {
      if (s.cd > 0) s.cd = Math.max(0, s.cd - dt);
      if (s.def.mode !== 'hold' || isBoostAbility(s.def) || !s.held) continue;
      if (!this.usable(s, v)) { s.held = false; continue; }
      v.useFuel(num(s.def.fuel) * dt);
      v.addHeat(num(s.def.heat) * dt);
    }
  }

  // Abklingzeit verkürzen (Effekt refill): id = Fähigkeit oder null für alle, pct = Anteil der vollen Abklingzeit
  refill(id, pct, stats) {
    for (const s of this.slots) {
      if (id && s.def.id !== id) continue;
      const full = s.cdMax || this.cooldownOf(s.def, stats);
      s.cd = Math.max(0, s.cd - full * pct);
    }
  }

  // Zustand für das HUD (ohne Allokation): frac = Ring-Füllung 0…1, off = ausgegraut, active = läuft gerade
  view(i, vehicle) {
    const s = this.slots[i];
    const o = s.view;
    const d = s.def;
    if (isBoostAbility(d)) {
      o.frac = vehicle.fuelFrac;
      o.off = !vehicle.canBoost;
      o.active = vehicle.boosting && !vehicle.boostFree && s.held;
      o.ready = !o.off;
    } else {
      o.frac = s.cd > 0 && s.cdMax > 0 ? 1 - s.cd / s.cdMax : 1;
      o.off = !this.usable(s, vehicle) && s.cd <= 0;
      o.active = d.mode === 'hold' ? s.held : !!(d.rules && d.rules.parachute && vehicle.parachute > 0);
      o.ready = s.cd <= 0 && !o.off;
    }
    return o;
  }

  release() {
    for (const s of this.slots) { s.held = false; s.wasHeld = false; }
  }
}
