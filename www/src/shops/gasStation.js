// ⛽ Tankstelle (Etage 5 jedes Akts, V2-DESIGN.md §4): eine Wahl für den Rest des Runs – Reparieren
// (+35 % der max. Haltbarkeit × (1 + Stat repairBonus)), Volltanken (+15 max. Treibstoff) oder Kühlerspülung
// (+20 % Kühlung). Zahlen: balance.STATION. Reine Logik ohne three.js und DOM. (Bis Phase 4 in run/runState.js.)
import { STATION } from '../data/balance.js';
import { healRun, addMaxFuel, leaveNode, repairFactor } from '../run/runState.js';

// Wahlmöglichkeiten mit Texten (Reparatur inkl. repairBonus)
export function stationOptions(run = null) {
  const f = run ? repairFactor(run) : 1;
  return [
    { id: 'repair', icon: '🔧', name: 'Reparieren', desc: `+${Math.round(STATION.repairPct * f * 100)} % Haltbarkeit` },
    { id: 'fuel', icon: '⛽', name: 'Volltanken', desc: `+${STATION.fuelMaxAdd} max. Treibstoff für den Run` },
    { id: 'cool', icon: '❄️', name: 'Kühlerspülung', desc: `+${Math.round(STATION.coolMul * 100)} % Kühlung für den Run` },
  ];
}

// Wahl treffen und Tankstelle verlassen. Ergebnis: { ok, choice, healed? }
export function chooseStation(run, choice) {
  const cur = run.current;
  if (!cur || cur.type !== 'station') return { ok: false, reason: 'noStation' };
  const out = { ok: true, choice };
  if (choice === 'repair') out.healed = Math.round(healRun(run, STATION.repairPct));
  else if (choice === 'fuel') addMaxFuel(run, STATION.fuelMaxAdd);
  else if (choice === 'cool') run.runMods.coolMul += STATION.coolMul;
  else return { ok: false, reason: 'choice' };
  run.stats.stations++;
  leaveNode(run);
  return out;
}
