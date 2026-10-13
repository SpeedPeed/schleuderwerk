import { PHYSICS, ECONOMY } from '../config/balance.js';
import { UPGRADES } from '../config/upgrades.js';

// Berechnet die aktuellen Fahrzeugwerte aus den gekauften Upgrades.
export function computeStats(save) {
  const s = {
    launchSpeed: PHYSICS.baseLaunchSpeed,
    thrust: PHYSICS.baseThrust,
    boostMax: PHYSICS.baseBoost,
    drag: PHYSICS.baseDrag,
    lift: PHYSICS.baseLift,
    rollFriction: PHYSICS.baseRollFriction,
    landTolDeg: PHYSICS.baseLandTolDeg,
    hitSpeedKeep: PHYSICS.hitSpeedKeep,
    hp: PHYSICS.baseHp,
    mass: 1,
    magnet: 2,
  };
  for (const u of UPGRADES) u.apply(s, save.upgrades[u.id] || 0, u);
  return s;
}

// Preis, um von Stufe `level` auf `level + 1` zu kommen.
export function upgradeCost(u, level) {
  let c = u.base;
  for (let n = 1; n <= level; n++) {
    let f = u.factor;
    for (const t of ECONOMY.costTiers) if (n >= t.from) f += t.add;
    c *= f;
  }
  return Math.round(c);
}
