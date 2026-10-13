// Basis-Upgrades der Werkstatt.
// Kosten für die nächste Stufe: base × factor^(Stufe-1), ab Stufe 10/20 steiler (siehe ECONOMY.costTiers).
// apply(stats, stufe, upgrade) verändert die Fahrzeugwerte, label(stufe, upgrade) beschreibt die Wirkung.

const pct = (v) => `${Math.round(v * 100)} %`;

export const UPGRADES = [
  {
    id: 'katapult', name: 'Katapult-Kraft', icon: '🎯', branch: 'Katapult',
    base: 25, factor: 1.18, max: 30, perLevel: 0.06,
    apply: (s, l, u) => { s.launchSpeed *= 1 + u.perLevel * l; },
    label: (l, u) => `+${pct(u.perLevel * l)} Startgeschwindigkeit`,
  },
  {
    id: 'tank', name: 'Treibstofftank', icon: '⛽', branch: 'Treibstoff',
    base: 30, factor: 1.17, max: 30, perLevel: 0.10,
    apply: (s, l, u) => { s.boostMax *= 1 + u.perLevel * l; },
    label: (l, u) => `+${pct(u.perLevel * l)} Boost-Energie`,
  },
  {
    id: 'reifen', name: 'Reifen', icon: '🛞', branch: 'Reifen',
    base: 35, factor: 1.18, max: 30, perLevel: 0.05,
    apply: (s, l, u) => { s.rollFriction *= Math.pow(1 - u.perLevel, l); s.landTolDeg += 1.5 * l; },
    label: (l, u) => `−${pct(1 - Math.pow(1 - u.perLevel, l))} Rollreibung, +${(1.5 * l).toFixed(1).replace('.', ',')}° Landetoleranz`,
  },
  {
    id: 'motor', name: 'Motor-Schub', icon: '🔥', branch: 'Motor',
    base: 40, factor: 1.20, max: 30, perLevel: 0.08,
    apply: (s, l, u) => { s.thrust *= 1 + u.perLevel * l; },
    label: (l, u) => `+${pct(u.perLevel * l)} Boost-Kraft`,
  },
  {
    id: 'aero', name: 'Aerodynamik', icon: '💨', branch: 'Aerodynamik',
    base: 50, factor: 1.22, max: 30, perLevel: 0.04,
    apply: (s, l, u) => { s.drag *= Math.pow(1 - u.perLevel, l); },
    label: (l, u) => `−${pct(1 - Math.pow(1 - u.perLevel, l))} Luftwiderstand`,
  },
  {
    id: 'karosserie', name: 'Karosserie', icon: '🛡️', branch: 'Karosserie',
    base: 60, factor: 1.25, max: 20, perLevel: 0.02,
    apply: (s, l, u) => {
      s.hp += Math.floor((l + 3) / 4);
      s.mass *= 1 + u.perLevel * l;
      s.hitSpeedKeep = Math.min(0.9, s.hitSpeedKeep + 0.015 * l);
    },
    label: (l, u) => `+${Math.floor((l + 3) / 4)} Treffer, +${pct(u.perLevel * l)} Masse`,
  },
  {
    id: 'fluegel', name: 'Flügel', icon: '🪽', branch: 'Aerodynamik',
    base: 80, factor: 1.25, max: 20, perLevel: 0.25,
    apply: (s, l, u) => { s.lift *= 1 + u.perLevel * l; },
    label: (l, u) => `+${pct(u.perLevel * l)} Auftrieb beim Gleiten`,
  },
  {
    id: 'magnet', name: 'Münzmagnet', icon: '🧲', branch: 'Spezial',
    base: 100, factor: 1.30, max: 15, perLevel: 0.5,
    apply: (s, l, u) => { s.magnet += u.perLevel * l; },
    label: (l, u) => `+${(u.perLevel * l).toFixed(1).replace('.', ',')} m Sammelradius`,
  },
];
