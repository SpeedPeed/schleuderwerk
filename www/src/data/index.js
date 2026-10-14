// Zugriffs-Helfer und Adapter für die Inhaltsdaten (Chassis, Teile, Fähigkeiten).
// Die Inhaltsdateien chassis.js, parts.js und abilities.js werden später durch korrigierte Fassungen
// ersetzt (IDs bleiben gleich). Deshalb passen wir ihr Format NUR hier im Code an, nie in den Dateien.
// Reine Logik: kein three.js, kein DOM.
import { CHASSIS } from './chassis.js';
import { PARTS } from './parts.js';
import { ABILITIES } from './abilities.js';
import { GARAGE } from './balance.js';

export { CHASSIS, PARTS, ABILITIES };

// Die 7 Teile-Slots in Anzeige-Reihenfolge
export const SLOTS = ['drive', 'wheels', 'aero', 'armor', 'tank', 'cooling', 'gadget'];

export const SLOT_INFO = {
  drive: { name: 'Antrieb', icon: '⚙️' },
  wheels: { name: 'Räder', icon: '🛞' },
  aero: { name: 'Aerodynamik', icon: '💨' },
  armor: { name: 'Panzerung', icon: '🛡️' },
  tank: { name: 'Tank', icon: '⛽' },
  cooling: { name: 'Kühlung', icon: '❄️' },
  gadget: { name: 'Gadget', icon: '🔧' },
};

const byId = (list) => {
  const m = new Map();
  for (const e of list) m.set(e.id, e);
  return m;
};
const CHASSIS_MAP = byId(CHASSIS);
const PART_MAP = byId(PARTS);
const ABILITY_MAP = byId(ABILITIES);

export const chassisById = (id) => CHASSIS_MAP.get(id) || null;
export const partById = (id) => PART_MAP.get(id) || null;
export const abilityById = (id) => ABILITY_MAP.get(id) || null;
export const partsForSlot = (slot) => PARTS.filter((p) => p.slot === slot);

// ---------- Adapter (fehlende Felder mit sinnvollen Standardwerten) ----------

// Freischalt-Bedingung eines Chassis: { research: id|null, cores: n }
export function chassisUnlock(c) {
  const u = (c && c.unlock) || {};
  return { research: u.research || null, cores: Math.max(0, u.cores || 0) };
}

// Freischalt-Bedingung eines Teils: { research: id|null, scrap: n }
export function partUnlock(p) {
  const u = (p && p.unlock) || {};
  return { research: u.research || null, scrap: Math.max(0, u.scrap || 0) };
}

// Freischalt-Bedingung einer Fähigkeit: { research: id|null }
export function abilityUnlock(a) {
  const u = (a && a.unlock) || {};
  return { research: u.research || null };
}

// Startteil = kostet keinen Schrott und braucht keine Forschung
export const isStarterPart = (p) => {
  const u = partUnlock(p);
  return u.scrap === 0 && !u.research;
};

// Startteil je Slot: zuerst GARAGE.starterParts, sonst das erste kostenlose Teil des Slots
export function starterPartFor(slot) {
  const want = partById(GARAGE.starterParts[slot]);
  if (want && want.slot === slot) return want;
  return partsForSlot(slot).find(isStarterPart) || partsForSlot(slot)[0] || null;
}

// Fähigkeiten, die man in einen Slot legen darf (Spezialfähigkeiten eines Chassis nicht)
export const isSlotAbility = (a) => !!a && !a.chassis;

// Chassis-Farben für das Modell (visual ist optional)
export function chassisVisual(c) {
  const v = (c && c.visual) || {};
  return { color: v.color || '#c8843a', accent: v.accent || '#d94a3a' };
}

// Alle Forschungs-IDs, die Chassis, Teile und Fähigkeiten als Bedingung nennen (Dev-Menü „alles freischalten“)
export function referencedResearch() {
  const s = new Set();
  for (const c of CHASSIS) if (chassisUnlock(c).research) s.add(chassisUnlock(c).research);
  for (const p of PARTS) if (partUnlock(p).research) s.add(partUnlock(p).research);
  for (const a of ABILITIES) if (abilityUnlock(a).research) s.add(abilityUnlock(a).research);
  return [...s];
}

// Lesbarer Name einer Forschungs-ID, solange es den Forschungsbaum (Phase 5) noch nicht gibt:
// r_chassis_badewanne → „Bauplan Badewanne“, r_part_wheels_kugellager → „Bauplan Kugellager-Rollen“
export function researchLabel(id) {
  if (!id) return '';
  const m = /^r_(chassis|part|ability)_(.+)$/.exec(id);
  if (m) {
    const target = m[1] === 'chassis' ? chassisById(m[2]) : m[1] === 'part' ? partById(m[2]) : abilityById(m[2]);
    if (target) return `Bauplan ${target.name}`;
  }
  return id;
}
