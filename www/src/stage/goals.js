// Paket D – Etappen-Arten: Jede Etappe hat ein Ziel (spec.goal) mit eigenen Medaillen-Marken in seiner Einheit.
// Die Weiten-Marken (spec.target/spec.medals) bleiben daneben bestehen: Sie bestimmen Schrott-Belohnung, das Ende
// bei Überweite und das Simulator-Modell. Reine Logik (kein DOM, kein three.js).
//
// spec.goal = { type, medals: { bronze, silver?, gold }, timeLimit?, crashCaps? }
//   distance  Weitflug: maximale Weite (wie bisher, keine eigenen Marken – es gelten spec.medals)
//   height    Höhenjagd: höchste Flughöhe über Grund (m)
//   stunt     Stunt-Show: Trickpunkte (gesicherte Kombos + laufende Kombo)
//   collect   Schrottsammler: eingesammelte Pickups (Schrauben, Schrott, Kanister …)
//   sprint    Zeitrennen: Weite nach timeLimit Sekunden Flug (die Etappe endet dann)
//   delivery  Lieferung: Weite wie Weitflug, aber jede Bruchlandung kostet: Gold höchstens crashCaps.gold
//             Bruchlandungen, Silber crashCaps.silver, Bronze crashCaps.bronze
import { GOALS as G } from '../data/balance.js';

// Medaille für einen Wert (wie physics/trackGen.js → medalFor; hier eigenständig, weil trackGen diese Datei lädt)
function medalFor(v, medals) {
  if (!medals) return null;
  if (v >= medals.gold) return 'gold';
  if (medals.silver !== undefined && v >= medals.silver) return 'silver';
  if (v >= medals.bronze) return 'bronze';
  return null;
}

export const GOAL_TYPES = ['distance', 'height', 'stunt', 'collect', 'sprint', 'delivery'];

// Anzeige-Daten je Art (Name, Symbol aus dem Sprite, Einheit, Kurzbeschreibung)
export const GOAL_INFO = {
  distance: { name: 'Weitflug', iconId: 'etappe', unit: 'm', desc: 'So weit wie möglich – die Weite zählt.' },
  height: { name: 'Höhenjagd', iconId: 'aero', unit: 'm hoch', desc: 'Hoch hinaus! Die größte Flughöhe zählt.' },
  stunt: { name: 'Stunt-Show', iconId: 'stern', unit: 'Punkte', desc: 'Saltos, Landungen, Kombos – Trickpunkte zählen.' },
  collect: { name: 'Schrottsammler', iconId: 'schraube', unit: 'Pickups', desc: 'Sammle ein, was herumliegt: Pickups zählen.' },
  sprint: { name: 'Zeitrennen', iconId: 'zeit', unit: 'm', desc: 'Wie weit kommst du in der Zeit? Danach ist Schluss.' },
  delivery: { name: 'Lieferung', iconId: 'kiste', unit: 'm', desc: 'Omas Vase fährt mit: Bruchlandungen kosten Medaillen.' },
};

export const goalOf = (spec) => (spec && spec.goal && GOAL_INFO[spec.goal.type] ? spec.goal : { type: 'distance' });
export const isDistanceGoal = (goal) => !goal || goal.type === 'distance' || goal.type === 'delivery';

// Marken einer Etappe in der Einheit ihres Ziels
export const goalMedals = (spec) => {
  const g = goalOf(spec);
  return g.medals && g.type !== 'distance' && g.type !== 'delivery' ? g.medals : spec.medals;
};

// Aktueller Wert des Ziels. s: { dist, height, tricks, pickups, time } (Etappe oder Ergebnis)
export function goalValue(goal, s) {
  switch (goal.type) {
    case 'height': return s.height || 0;
    case 'stunt': return s.tricks || 0;
    case 'collect': return s.pickups || 0;
    default: return s.dist || 0;   // distance, sprint, delivery
  }
}

// Medaille für einen Wert. crashes: Bruchlandungen (Lieferung)
export function goalMedal(spec, value, crashes = 0) {
  const g = goalOf(spec);
  const list = spec.medalList || ['bronze', 'silver', 'gold'];
  let m = medalFor(value, goalMedals(spec));
  if (m && g.type === 'delivery') {
    const caps = g.crashCaps || G.delivery.crashCaps;
    const order = list.filter((x) => x !== 'silver' || caps.silver !== undefined);
    // höchste Medaille, die Weite UND Bruchlandungen erlauben
    let best = null;
    for (const x of order) if (order.indexOf(x) <= order.indexOf(m) && crashes <= (caps[x] ?? Infinity)) best = x;
    m = best;
  }
  return m;
}

// Ziel einer Etappe würfeln (map/mapGen.js legt die Art fest, hier werden die Marken berechnet).
// Die Marken folgen der Weiten-Zielmarke target (m) mit festen Verhältnissen je Art (balance.GOALS, mit dem Bot
// eingemessen: tools/playtest/goals.mjs), damit eine Höhenjagd ungefähr so schwer ist wie ein Weitflug derselben Etage.
export function makeGoal(type, target, kind) {
  if (!type || type === 'distance' || !G[type]) return null;
  const c = G[type];
  if (type === 'delivery') return { type, crashCaps: { ...c.crashCaps } };
  const rnd = (v) => Math.max(1, Math.round(v / c.round) * c.round);
  const bronze = rnd(c.perTarget * target);
  const medals = { bronze, gold: Math.max(bronze + c.round, rnd(bronze * c.gold)) };
  if (kind !== 'boss') medals.silver = rnd((bronze + medals.gold) / 2);
  const goal = { type, medals };
  if (type === 'sprint') goal.timeLimit = c.timeLimit;
  return goal;
}

// Text für Anzeigen: „120 m hoch“, „450 Punkte“ …
export const goalUnit = (goal) => (GOAL_INFO[goalOf({ goal }).type] || GOAL_INFO.distance).unit;

// Kurzbeschreibung des Ziels mit Zahlen (Intro, Karte): z. B. „Zeitrennen: 8 s Flug“, „Lieferung: Gold ≤ 1 Bruchlandung“
export function goalRule(goal) {
  if (!goal) return '';
  if (goal.type === 'sprint') return `Nach ${goal.timeLimit} s Flug ist Schluss – die Weite bis dahin zählt.`;
  if (goal.type === 'delivery') { const c = goal.crashCaps || {}; return `Bruchlandungen erlaubt: Bronze ${c.bronze}, Silber ${c.silver}, Gold ${c.gold}.`; }
  return GOAL_INFO[goal.type] ? GOAL_INFO[goal.type].desc : '';
}
