// Etappen-Auswertung (reine Logik). Phase 2: Schrott-Belohnung der Testfahrt.
// Medaillen und Run-Belohnungen kommen mit der Run-Karte (Phase 3).
import { TESTDRIVE } from '../data/balance.js';

// r: Etappen-Ergebnis { dist, height, tricks, scrapPickups, scrapBonus }
// Ergebnis: { parts: { dist, height, tricks, pickups }, factor, total } – alles in ⚙ Schrott
export function testDriveReward(r, stats = {}, world = {}) {
  const T = TESTDRIVE;
  const parts = {
    dist: Math.max(0, r.dist || 0) / T.distDiv,
    height: Math.max(0, r.height || 0) / T.heightDiv,
    tricks: Math.max(0, r.tricks || 0) / T.trickDiv,
    pickups: (r.scrapPickups || 0) * T.scrapPickupValue + (r.scrapBonus || 0),
  };
  const factor = (world.scrapFactor ?? 1) * (stats.scrapGain ?? 1);
  const sum = parts.dist + parts.height + parts.tricks + parts.pickups;
  const total = Math.max(0, Math.round(sum * factor));
  for (const k of Object.keys(parts)) parts[k] = Math.round(parts[k]);
  return { parts, factor, total };
}
