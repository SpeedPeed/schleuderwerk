// Basis-Upgrades der Werkstatt (Übergangslösung bis zur Garage in Phase 2).
// Kosten für die nächste Stufe: base × ECONOMY.costGrowth^Stufe (siehe garage/stats.js).
// Wirkung mit abnehmendem Ertrag: dimReturn(Stufe, Maximalwirkung, ECONOMY.halfLevel) –
// bei Stufe 12 ist die Hälfte der Maximalwirkung erreicht, die Maximalwirkung selbst nie ganz.
// apply(stats, stufe, upgrade) verändert die Fahrzeugwerte, label(stufe, upgrade) beschreibt die Wirkung.
import { ECONOMY } from './balance.js';
import { dimReturn } from '../core/math.js';

const pct = (v) => `${Math.round(v * 100)} %`;
const num = (v) => v.toFixed(1).replace('.', ',');
const eff = (l, max) => dimReturn(l, max, ECONOMY.halfLevel);

export const UPGRADES = [
  {
    id: 'katapult', name: 'Katapult-Kraft', icon: '🎯', branch: 'Katapult',
    base: 50, max: 30, effect: 0.9,             // max. +90 % Startgeschwindigkeit
    apply: (s, l, u) => { s.launchSpeed *= 1 + eff(l, u.effect); },
    label: (l, u) => `+${pct(eff(l, u.effect))} Startgeschwindigkeit`,
  },
  {
    id: 'tank', name: 'Treibstofftank', icon: '⛽', branch: 'Treibstoff',
    base: 60, max: 30, effect: 1.5,             // max. +150 % Boost-Energie
    apply: (s, l, u) => { s.boostMax *= 1 + eff(l, u.effect); },
    label: (l, u) => `+${pct(eff(l, u.effect))} Boost-Energie`,
  },
  {
    id: 'reifen', name: 'Reifen', icon: '🛞', branch: 'Reifen',
    base: 70, max: 30, effect: 0.5, landTol: 20, // max. −50 % Rollreibung, +20° Landetoleranz
    apply: (s, l, u) => { s.rollFriction *= 1 - eff(l, u.effect); s.landTolDeg += eff(l, u.landTol); },
    label: (l, u) => `−${pct(eff(l, u.effect))} Rollreibung, +${num(eff(l, u.landTol))}° Landetoleranz`,
  },
  {
    id: 'motor', name: 'Motor-Schub', icon: '🔥', branch: 'Motor',
    base: 80, max: 30, effect: 1.0,             // max. +100 % Boost-Kraft
    apply: (s, l, u) => { s.thrust *= 1 + eff(l, u.effect); },
    label: (l, u) => `+${pct(eff(l, u.effect))} Boost-Kraft`,
  },
  {
    id: 'aero', name: 'Aerodynamik', icon: '💨', branch: 'Aerodynamik',
    base: 100, max: 30, effect: 0.45,           // max. −45 % Luftwiderstand
    apply: (s, l, u) => { s.drag *= 1 - eff(l, u.effect); },
    label: (l, u) => `−${pct(eff(l, u.effect))} Luftwiderstand`,
  },
  {
    id: 'karosserie', name: 'Karosserie', icon: '🛡️', branch: 'Karosserie',
    base: 120, max: 20, hpAt: [4, 10, 16],      // +1 Treffer bei Stufe 4, 10 und 16
    mass: 0.4, hitKeep: 0.3, hitKeepMax: 0.9,   // max. +40 % Masse, Tempo nach Treffer max. +0,3 (höchstens 0,9)
    apply: (s, l, u) => {
      s.hp += u.hpAt.filter((n) => l >= n).length;
      s.mass *= 1 + eff(l, u.mass);
      s.hitSpeedKeep = Math.min(u.hitKeepMax, s.hitSpeedKeep + eff(l, u.hitKeep));
    },
    label: (l, u) => `+${u.hpAt.filter((n) => l >= n).length} Treffer, +${pct(eff(l, u.mass))} Masse`,
  },
  {
    id: 'fluegel', name: 'Flügel', icon: '🪽', branch: 'Aerodynamik',
    base: 160, max: 20, effect: 2.5,            // max. +250 % Auftrieb
    apply: (s, l, u) => { s.lift *= 1 + eff(l, u.effect); },
    label: (l, u) => `+${pct(eff(l, u.effect))} Auftrieb beim Gleiten`,
  },
  {
    id: 'magnet', name: 'Münzmagnet', icon: '🧲', branch: 'Spezial',
    base: 200, max: 15, effect: 6,              // max. +6 m Sammelradius
    apply: (s, l, u) => { s.magnet += eff(l, u.effect); },
    label: (l, u) => `+${num(eff(l, u.effect))} m Sammelradius`,
  },
];
