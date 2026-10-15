// Run-Effekte als Stat-Modifikator – dieselbe Rechnung im Run (run/runState.js → runStats) und in der Etappe
// (stage/stage.js): Tankstelle/Ereignisse (add/mul) und die Faktoren der Schrottstufe (xmul: Start-Haltbarkeit,
// max. Treibstoff, Hitzezunahme, Schrauben-Einnahmen). Fehlende Faktoren = 1 (ältere Runs). Reine Logik.
// runMods: { fuelMaxAdd, coolMul, durabilityMaxAdd, durabilityMaxMul, fuelMaxMul, heatGainMul, damageMul, boltMul }
const x = (v) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : 1);

export function runModStats(rm = {}) {
  rm = rm || {};
  return { stats: {
    durabilityMax: { add: rm.durabilityMaxAdd || 0, xmul: x(rm.durabilityMaxMul) },
    fuelMax: { add: rm.fuelMaxAdd || 0, xmul: x(rm.fuelMaxMul) },
    coolRate: { mul: rm.coolMul || 0 },
    heatGain: { xmul: x(rm.heatGainMul) },
    boltGain: { xmul: x(rm.boltMul) },
  } };
}

// Schrottstufe 8: Faktor auf allen erlittenen Schaden (physics/vehicle.js → damage, Ereignis-Schaden)
export const runDamageMul = (rm) => x(rm && rm.damageMul);
