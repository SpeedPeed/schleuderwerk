// Paket A: „Was bringt die nächste Stufe?“ – misst mit dem Etappen-Bot (echte Etappen-Logik) für jedes Teil, wie viele
// Meter eine effektive Slot-Stufe auf einer Bezugs-Etappe bringt, und schreibt die Tabelle nach
// www/src/data/levelGains.js. Die Garage zeigt damit an jedem Verbessern-Knopf „+N m“ (garage/garage.js → levelGain).
//
// Verfahren: je Teil zwei Ausrüstungen – das Teil im Slot auf Stufe 0 bzw. GARAGE.maxPartLevel, alle anderen Slots mit
// den Startteilen auf Stufe 0 –, dieselben n Strecken und Abschüsse (gemeinsame Zufallszahlen) auf der Bezugs-Etappe
// REF; Meter je effektiver Stufe = (Ø Weite oben − Ø Weite unten) ÷ partDimLevels(max). Teile ohne messbaren Weitengewinn
// (Panzerung, Haltbarkeit) bekommen 0 – die Garage zeigt dort den Wert statt Metern.
// Aufruf: node tools/sim/levelGains.mjs [--n 24]   (≈ 30–60 s)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { biomeForAct } from '../../www/src/data/biomes.js';
import { PARTS } from '../../www/src/data/index.js';
import { GARAGE } from '../../www/src/data/balance.js';
import { generateStageSpec } from '../../www/src/physics/trackGen.js';
import { partDimLevels } from '../../www/src/items/statMods.js';
import { makeRng } from '../../www/src/core/rng.js';
import { simSave, makeSimStage, playStage } from './bot.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', '..', 'www', 'src', 'data', 'levelGains.js');
const args = process.argv.slice(2);
const N = Number((args[args.indexOf('--n') + 1]) || 24) || 24;
export const REF = { act: 1, kind: 'stage', floor: 3, label: 'Etage 4 in Akt 1' };

function meanDist(part, level) {
  const biome = biomeForAct(REF.act);
  const save = simSave('start');
  if (!save.garage.ownedParts.includes(part.id)) save.garage.ownedParts.push(part.id);
  save.garage.parts[part.slot] = part.id;
  save.garage.slotLevels[part.slot] = level;
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const spec = generateStageSpec({ biome, kind: REF.kind, floor: REF.floor, rng: makeRng(`stufen:${i}`) });
    const sim = makeSimStage({ spec, biome, save, seed: 9100 + i, runInfo: { bolts: 40, counters: {} } });
    sum += playStage(sim.stage, () => sim.result, { seed: 77 * i + 5 }).dist;
  }
  return sum / N;
}

const t0 = Date.now();
const gains = {};
for (const p of PARTS) {
  const lo = meanDist(p, 0), hi = meanDist(p, GARAGE.maxPartLevel);
  const per = (hi - lo) / partDimLevels(GARAGE.maxPartLevel);
  gains[p.id] = Math.max(0, Math.round(per * 100) / 100);
  console.log(`${p.id.padEnd(28)} Stufe 0: ${lo.toFixed(0)} m, Stufe ${GARAGE.maxPartLevel}: ${hi.toFixed(0)} m → ${gains[p.id]} m je effektive Stufe`);
}
const body = Object.entries(gains).map(([id, g]) => `    ${id}: ${g},`).join('\n');
fs.writeFileSync(OUT, `// Erzeugt von tools/sim/levelGains.mjs (${new Date().toISOString().slice(0, 10)}, ${N} Etappen je Messpunkt) – nicht von Hand ändern.
// Meter je effektiver Slot-Stufe (items/statMods.js → partDimLevels) auf der Bezugs-Etappe, gemessen mit dem Etappen-Bot
// (alle anderen Slots: Startteile auf Stufe 0). Die Garage zeigt damit an jedem Verbessern-Knopf „+N m“
// (garage/garage.js → levelGain). 0 = kein messbarer Weitengewinn (z. B. Panzerung: die Garage zeigt dann den Wert).
export const LEVEL_GAINS = {
  ref: ${JSON.stringify(REF.label)},
  parts: {
${body}
  },
};
`);
console.log(`geschrieben: ${OUT} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
