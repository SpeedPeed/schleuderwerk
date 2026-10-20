// Paket D – Mutatoren (Balatro-Boss-Blind-Prinzip): eine Sonderregel für eine Etappe, sichtbar auf der Karte und im
// Etappen-Intro. Vergabe beim Erzeugen der Karte (map/mapGen.js → assignMutators): jede Elite bekommt einen,
// normale Etappen ab MUTATOR_RULES.stageMinAct mit MUTATOR_RULES.stageChance, Bosse nie.
// Reine Daten. Felder (alle optional außer id/name/iconId/desc):
//   stats        Stat-Modifikatoren wie bei Items ({ stat: { add | mul | xmul } }), wirken die ganze Etappe
//   gravityMul   Faktor auf die Schwerkraft des Bioms
//   wind         m/s, wird zum Grundwind des Wetters addiert (+ = Rückenwind, − = Gegenwind)
//   gust         m/s zusätzliche Böen
//   medals       { bronze, gold }: Faktoren auf die Medaillen-Marken (Silber liegt dazwischen)
//   featureMul   Faktor auf die Zahl der Streckenbausteine
//   invertTilt   Neigen ist vertauscht
//   triggers     Auslöser wie bei Items (Quelle kind 'mutator', ★1)
//   eliteOnly    nur auf Elite-Etappen
//   rewardMul    Faktor auf Schrauben und Schrott der Etappe (Ausgleich für harte Mutatoren)

export const MUTATOR_RULES = {
  stageChance: 0.3,        // normale Etappe ab stageMinAct: Anteil mit Mutator
  stageMinAct: 2,
  act1Chance: 0.12,        // Akt 1 (ab Etage 2): ein kleiner Vorgeschmack
};

export const MUTATORS = [
  {
    id: 'mondschwerkraft', name: 'Mondschwerkraft', iconId: 'stern',
    desc: 'Schwerkraft −35 %. Lange Sprünge, schwammige Landungen.',
    gravityMul: 0.65,
  },
  {
    id: 'oelfilm', name: 'Ölfilm', iconId: 'tonne',
    desc: 'Landetoleranz −5°, aber die Kiste rollt doppelt so leicht.',
    stats: { landTolDeg: { add: -5 }, rollFriction: { mul: -0.5 } },
  },
  {
    id: 'gegensturm', name: 'Gegensturm', iconId: 'wind',
    desc: 'Kräftiger Gegenwind mit Böen. Dafür 15 % mehr Beute.',
    wind: -5, gust: 2, rewardMul: 1.15,
  },
  {
    id: 'rueckenwind', name: 'Rückenwind-Express', iconId: 'wind',
    desc: 'Rückenwind schiebt mit – aber die Gold-Marke liegt 10 % weiter.',
    wind: 5, medals: { gold: 1.1 },
  },
  {
    id: 'schraubenregen', name: 'Schraubenregen', iconId: 'schraube',
    desc: 'Doppelte Schrauben, aber nur 70 % Treibstoff.',
    stats: { boltGain: { mul: 1 }, fuelMax: { xmul: 0.7 } },
  },
  {
    id: 'heisser_tag', name: 'Heißer Tag', iconId: 'hitze',
    desc: 'Hitze steigt 50 % schneller. Feuer-Kisten freuen sich.',
    stats: { heatGain: { mul: 0.5 } },
  },
  {
    id: 'sperrmuelltag', name: 'Sperrmülltag', iconId: 'schrott',
    desc: 'Anderthalbmal so viele Hindernisse, dafür 50 % mehr Schrott.',
    featureMul: 1.5, stats: { scrapGain: { mul: 0.5 } },
  },
  {
    id: 'klebeboden', name: 'Klebeboden', iconId: 'raeder',
    desc: 'Der Boden klebt: Rollreibung ×2. Was zählt, ist der Flug.',
    stats: { rollFriction: { mul: 1 } },
  },
  {
    id: 'goldrausch', name: 'Goldrausch', iconId: 'gold',
    desc: 'Gold-Marke −15 %, aber Bronze +10 %.',
    medals: { bronze: 1.1, gold: 0.85 },
  },
  {
    id: 'funkenflug', name: 'Funkenflug', iconId: 'feuer',
    desc: 'Jede Landung zündet eine Explosion (4 m/s, alle 2 s) – und heizt 10.',
    triggers: [{ on: 'landing', limit: { cooldown: 2 }, do: [{ fx: 'explosion', amount: 4 }, { fx: 'heat', amount: 10 }] }],
  },
  {
    id: 'federwerk', name: 'Federwerk', iconId: 'gummi',
    desc: 'Alles federt: Abprallkraft +25 %, Panzerung −10 %.',
    stats: { bounce: { add: 0.25 }, armor: { add: -0.1 } },
  },
  {
    id: 'leichtbau', name: 'Leichtbau', iconId: 'aero',
    desc: 'Masse −20 % und Luftsteuerung +20 %, aber Haltbarkeit −25 %.',
    stats: { mass: { mul: -0.2 }, airControl: { mul: 0.2 }, durabilityMax: { xmul: 0.75 } },
  },
  {
    id: 'spiegelverkehrt', name: 'Spiegelverkehrt', iconId: 'wuerfel', eliteOnly: true,
    desc: 'Neigen ist vertauscht! Dafür 25 % mehr Beute.',
    invertTilt: true, rewardMul: 1.25,
  },
  {
    id: 'sturmflut', name: 'Sturmflut', iconId: 'sturm', eliteOnly: true,
    desc: 'Starke Böen von allen Seiten und weniger Treibstoff (−15 %).',
    gust: 5, stats: { fuelMax: { xmul: 0.85 } }, rewardMul: 1.1,
  },
];

const BY_ID = new Map(MUTATORS.map((m) => [m.id, m]));
export const mutatorById = (id) => (id && BY_ID.get(id)) || null;
