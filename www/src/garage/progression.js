// Meta-Fortschritt: Spielzeit und Meilenstein-Zeitmessung (V2-DESIGN.md §8 „Fortschritt & Zielzeiten“).
// meta.milestones[key] = Spielzeit in Sekunden beim ersten Erreichen. Reine Logik ohne three.js und DOM.

// Bekannte Meilensteine (Anzeige im Dev-Menü). Phase 2: erste Testfahrt, erstes Chassis, erste Teile-Stufe.
export const MILESTONES = [
  { id: 'firstTestDrive', name: 'Erste Testfahrt' },
  { id: 'firstPartUpgrade', name: 'Erste Teile-Verbesserung' },
  { id: 'firstPartBought', name: 'Erstes Teil gekauft' },
  { id: 'firstChassisUnlocked', name: 'Erstes neues Chassis' },
];

// Spielzeit (s) addieren
export function addPlaytime(save, seconds) {
  if (seconds > 0 && isFinite(seconds)) save.meta.totalPlaytime += seconds;
}

// Meilenstein beim ersten Erreichen mit der aktuellen Spielzeit stempeln. Ergebnis: true beim ersten Mal.
export function markMilestone(save, id) {
  const m = save.meta.milestones;
  if (m[id] !== undefined) return false;
  m[id] = Math.round(save.meta.totalPlaytime * 10) / 10;
  return true;
}

// Spielzeit lesbar: 3725 → „1 h 02 min“, 95 → „1 min 35 s“
export function fmtPlaytime(s) {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m > 0) return `${m} min ${String(sec).padStart(2, '0')} s`;
  return `${sec} s`;
}
