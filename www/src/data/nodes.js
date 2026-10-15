// Schleuderwerk 2 – Knotentypen der Akt-Karte (reine Daten, siehe V2-DESIGN.md §4 „Knotentypen“, ARCHITEKTUR.md §2 data/nodes.js)
//
// Karte je Akt: Etagen 0–5 mit 2–4 Knoten, danach Boss-Strecke (Etage 6).
// Felder:
//   name, icon, desc, color          Anzeige
//   weight                           Basisgewicht für die Zufallsauswahl (relativ; 0 = nie zufällig, nur über forcedFloors)
//   minFloor                         frühestes Stockwerk für die Zufallsauswahl
//   maxPerAct?                       Obergrenze je Akt
//   requiresResearch?                Forschungs-ID, ohne die der Typ nie erzeugt wird
//   forcedFloors?                    Etagen, auf denen ALLE Knoten diesen Typ haben
//   minPerAct?, guaranteeFloors?     Mindestanzahl je Akt, garantiert innerhalb [von, bis] (Etagen)
//   params?                          inhaltsgebundene Zahlen des Knotens (aus V2-DESIGN.md §4)
// Schrottstufen: ascension.js → eliteWeightAdd addiert auf elite.weight, doubleBossAct3 verdoppelt den Boss in Akt 3.

export const NODE_TYPES = {
  stage: {
    name: 'Etappe',
    icon: '🏁',
    desc: 'Eine ganz normale Strecke voller Schrott. Danach Item-Auswahl – oder ein Säckchen Schrauben.',
    color: '#d9a441',
    weight: 0.44,
    minFloor: 0,
    forcedFloors: [0],
    params: { itemChoices: 3, rarityPool: 'normal' },
  },
  elite: {
    name: 'Elite-Etappe',
    icon: '☠️',
    desc: 'Ziel +30 % und mehr Gefahren. Lohn: mindestens ein seltenes Item und 1 Blaupause. Nur für Mutige mit Klebeband.',
    color: '#c0392b',
    weight: 0.1,
    minFloor: 2,
    maxPerAct: 2,
    params: { targetMul: 1.3, minRarity: 'rare', blueprints: 1, extraHazards: true },
  },
  dealer: {
    name: 'Schrotthändler',
    icon: '🏪',
    desc: '5 Items und 1 Fähigkeit im Angebot. Neu würfeln kostet 10 Schrauben, jedes Mal 10 mehr. 1 Item reservierbar.',
    color: '#3f8fd2',
    weight: 0.1,
    minFloor: 1,
    minPerAct: 1,
    guaranteeFloors: [2, 4],
    params: { items: 5, abilities: 1, rerollBase: 10, rerollStep: 10, reserveSlots: 1 },
  },
  workbench: {
    name: 'Werkbank',
    icon: '🔧',
    desc: '2 gleiche Items → ★+1. 2 Items mit verschiedenen Tags → Hybrid. Oder zerlegen und Schrauben kassieren.',
    color: '#8a6d4b',
    weight: 0.07,
    minFloor: 1,
    maxPerAct: 2,
    requiresResearch: 'r_node_workbench',
    params: { fuseSameTierUp: 1, hybridEffectMul: 0.75 },
  },
  blackmarket: {
    name: 'Schwarzmarkt',
    icon: '🕳️',
    desc: '3 verfluchte Items aus dem Kofferraum. Bezahlt wird mit max. Haltbarkeit, max. Treibstoff oder Kernen.',
    color: '#5b2a86',
    weight: 0.05,
    minFloor: 2,
    maxPerAct: 1,
    requiresResearch: 'r_node_blackmarket',
    params: { items: 3, rarity: 'cursed', payWith: ['durabilityMax', 'fuelMax', 'cores'] },
  },
  station: {
    name: 'Tankstelle',
    icon: '⛽',
    desc: 'Wähle für den Run: Reparieren (+35 % Haltbarkeit), Volltanken (+15 max. Treibstoff) oder Kühlerspülung (+20 % Kühlung).',
    color: '#2e9e6a',
    weight: 0,
    minFloor: 5,
    forcedFloors: [5],
    params: { repairPct: 0.35, fuelMaxAdd: 15, coolMul: 0.2 },
  },
  event: {
    name: 'Ereignis',
    icon: '❓',
    desc: 'Irgendwas ist hier los. Eine Entscheidung, ein Risiko, und vielleicht ein sehr seltsamer Fund.',
    color: '#9b7fd1',
    weight: 0.18,
    minFloor: 1,
  },
  treasure: {
    name: 'Schatzhaufen',
    icon: '💰',
    desc: 'Ein Gratis-Item im Schrotthaufen! In 30 % der Fälle ist es „verdächtig“ und hat einen Haken.',
    color: '#e8c547',
    weight: 0.06,
    minFloor: 1,
    maxPerAct: 2,
    params: { suspiciousChance: 0.3 },
  },
  boss: {
    name: 'Boss-Strecke',
    icon: '👹',
    desc: 'Lange Strecke (Ziel ×1,6) mit fiesem Endgegner. Bronze heißt geschafft, Gold gibt einen Bonus obendrauf.',
    color: '#7a1f1f',
    weight: 0,
    minFloor: 6,
    maxPerAct: 1,
    forcedFloors: [6],
    params: { targetMul: 1.6, medals: ['bronze'], goldBonus: true },
  },
};
