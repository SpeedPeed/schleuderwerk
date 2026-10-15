// Garage-Auswahl → Fahrzeug-Grundwerte: Chassis + 7 Teile (mit Stufen) + Fähigkeiten.
// buildLoadout(save) liefert alles, was eine Etappe/ein Run braucht. Reine Logik ohne three.js und DOM.
import { GARAGE } from '../data/balance.js';
import { SLOTS, chassisById, partById, abilityById, starterPartFor, isSlotAbility, abilityUnlock } from '../data/index.js';
import { computeStats, collectRules, collectSources } from '../items/statMods.js';
import { researchPerks, perkStatMods } from './research.js';

// Teile-Eingabe für die Stat-Pipeline: { slot: { id, level } }
function partInput(garage, override = {}) {
  const out = {};
  for (const slot of SLOTS) {
    const ov = override[slot];
    let id = ov ? (typeof ov === 'string' ? ov : ov.id) : garage.parts && garage.parts[slot];
    let p = partById(id);
    if (!p || p.slot !== slot) { p = starterPartFor(slot); id = p ? p.id : null; }
    if (!p) continue;
    const lvl = ov && typeof ov === 'object' && ov.level !== undefined ? ov.level : (garage.partLevels && garage.partLevels[id]) || 0;
    out[slot] = { id, level: Math.max(0, Math.min(GARAGE.maxPartLevel, lvl)) };
  }
  return out;
}

// save: Spielstand v3. opts.chassis / opts.parts überschreiben die Auswahl (Vorschau in der Garage).
// opts.perks: Forschungs-Boni (Standard: aus save.research, im Run der Stand beim Run-Start = run.perks).
// opts.runAbilities: Fähigkeiten des Runs (beim Schrotthändler gekaufte brauchen keine Forschung).
// Ergebnis: { chassis, parts, abilities, special, stats, rules, sources, slots: { items, abilities }, statInput, perks }
export function buildLoadout(save, opts = {}) {
  const g = save.garage;
  const chassis = chassisById(opts.chassis || g.chassis) || chassisById(GARAGE.starterChassis);
  const parts = partInput(g, opts.parts || {});
  const perks = opts.perks || researchPerks(save);
  const statInput = { chassis, parts, research: perkStatMods(perks) };
  const stats = computeStats(statInput);
  const slots = { items: stats.itemSlots, abilities: stats.abilitySlots };

  // Fähigkeiten: nur freigeschaltete Slot-Fähigkeiten, höchstens abilitySlots, ohne Doppelte
  const done = (save.research && save.research.done) || [];
  const abilities = [];
  for (const id of opts.runAbilities || g.abilities || []) {
    if (abilities.length >= slots.abilities) break;
    const a = abilityById(id);
    if (!a || !isSlotAbility(a) || abilities.includes(id)) continue;
    const r = abilityUnlock(a).research;
    if (r && !done.includes(r) && !opts.runAbilities) continue;
    abilities.push(id);
  }
  // Spezialfähigkeit des Chassis: immer zusätzlich ausgerüstet
  const special = chassis.ability && abilityById(chassis.ability) ? chassis.ability : null;

  return {
    chassis,
    parts,
    abilities: special ? [...abilities, special] : abilities,
    special,
    stats,
    rules: collectRules(statInput),
    sources: collectSources(statInput),
    slots,
    statInput,
    perks,
  };
}

// Teile-IDs je Slot (für das 3D-Modell)
export function partIds(loadout) {
  const out = {};
  for (const slot of SLOTS) out[slot] = loadout.parts[slot] ? loadout.parts[slot].id : null;
  return out;
}
