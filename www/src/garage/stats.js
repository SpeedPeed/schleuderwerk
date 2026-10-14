import { PHYSICS, ECONOMY } from '../data/balance.js';
import { UPGRADES } from '../data/upgrades.js';

// Fahrzeug-Grundwerte ohne Upgrades
export function baseStats() {
  return {
    launchSpeed: PHYSICS.baseLaunchSpeed,
    thrust: PHYSICS.baseThrust,
    boostMax: PHYSICS.baseBoost,
    drag: PHYSICS.baseDrag,
    lift: PHYSICS.baseLift,
    rollFriction: PHYSICS.baseRollFriction,
    landTolDeg: PHYSICS.baseLandTolDeg,
    hitSpeedKeep: PHYSICS.hitSpeedKeep,
    hp: PHYSICS.baseHp,
    mass: PHYSICS.baseMass,
    magnet: PHYSICS.baseMagnet,
    airControl: PHYSICS.airControl,
    maxSpin: PHYSICS.maxSpin,
    speedSoftCap: PHYSICS.speedSoftCap,
  };
}

// Berechnet die aktuellen Fahrzeugwerte aus den gekauften Upgrades.
export function computeStats(save) {
  const s = baseStats();
  for (const u of UPGRADES) u.apply(s, (save.upgrades && save.upgrades[u.id]) || 0, u);
  return s;
}

// Preis, um von Stufe `level` auf `level + 1` zu kommen.
export function upgradeCost(u, level) {
  return Math.round(u.base * Math.pow(ECONOMY.costGrowth, level));
}
