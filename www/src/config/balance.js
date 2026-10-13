// Zentrale Balancing-Werte. Alles hier darf frei verändert werden.

export const SAVE_VERSION = 2;
export const GAME_VERSION = '0.2.0';

// Physik (Einheiten: Meter, Sekunden, Radiant)
export const PHYSICS = {
  dt: 1 / 120,             // fester Physik-Zeitschritt
  rideHeight: 0.9,         // Abstand Fahrzeugmitte -> Boden
  carRadius: 1.2,          // Kollisionsradius gegen Hindernisse
  baseLaunchSpeed: 22,     // m/s bei voller Spannung ohne Upgrades
  baseThrust: 13,          // Boost-Beschleunigung m/s²
  baseBoost: 100,          // Boost-Energie
  boostDrain: 25,          // Verbrauch pro Sekunde
  boostDelay: 0.18,        // so lange halten, bis der Boost zündet (kurzes Wischen boostet nicht)
  baseDrag: 0.003,         // Luftwiderstand
  broadsideDrag: 3,        // Zusatz-Widerstand, wenn das Auto quer zur Flugrichtung steht (Luftbremse)
  baseLift: 0.0012,        // Grund-Auftrieb der Karosserie
  baseRollFriction: 2.5,   // Bremswirkung am Boden m/s²
  baseLandTolDeg: 25,      // saubere Landung bis zu diesem Winkel
  perfectLandDeg: 8,
  bumpyLandDeg: 70,        // darüber: Bruchlandung
  bumpySpeedKeep: 0.75,
  crashSpeedKeep: 0.45,
  hitSpeedKeep: 0.6,       // Tempo nach Treffer an einem Hindernis
  stopSpeed: 0.8,          // darunter gilt das Auto als gestoppt
  stopTime: 0.6,
  maxRunTime: 240,
  rotateSens: 0.012,       // Drehung in Radiant pro Pixel Wischen
  maxSpin: 10,           // max. Drehgeschwindigkeit nach einem Schwung (rad/s)
  airSpinDamp: 0.9,        // wie schnell eine Drehung in der Luft ausläuft
  autoLevel: 1.5,          // sanftes Ausrichten in Flugrichtung, wenn kein Finger auf dem Display ist
  baseHp: 3,
};

// Abschuss mit der Schleuder
export const LAUNCH = {
  minAngleDeg: 5,
  maxAngleDeg: 80,
  maxPullMeters: 4.5,      // so weit wird das Auto sichtbar zurückgezogen
  pullScreenFraction: 0.42,// Ziehweg für volle Kraft (Anteil der kürzeren Bildschirmseite)
  minPower: 0.12,          // darunter wird der Schuss abgebrochen
  perfectBonus: 0.15,      // +15 % Tempo bei perfektem Abschuss
  bandMin: 0.55,           // die Perfekt-Zone wandert zwischen diesen Kraftwerten
  bandMax: 0.96,
  bandWidth: 0.12,
  bandPeriod: 1.8,         // Sekunden für einmal hoch und runter
};

// Geld
export const ECONOMY = {
  moneyPerMeter: 0.5,
  moneyPerHeight: 1.0,
  coinValue: 1,
  // Kostenanstieg: Stufe 1-9 Faktor f, ab Stufe 10 f+0,08, ab Stufe 20 f+0,20
  costTiers: [{ from: 10, add: 0.08 }, { from: 20, add: 0.20 }],
};

// Kombos und Tricks (pts = Trickpunkte, mult = Erhöhung des Kombo-Multiplikators)
export const KOMBO = {
  chainTimeout: 2.5,       // Sekunden am Boden ohne Aktion -> Kombo wird gesichert
  minAirForLanding: 1.2,   // Landebonus erst ab dieser Flugzeit
  flipLeniencyDeg: 25,     // 335° zählen schon als Salto
  heightMarks: [50, 100, 250, 500, 1000],
  maxMult: 4,              // Obergrenze des Kombo-Multiplikators (später per Upgrade/Fahrer erhöhbar)
  flipsScored: 4,          // so viele Saltos pro Sprung zählen voll …
  extraFlipPts: 5,         // … jeder weitere bringt nur noch so viele Punkte (ohne Multiplikator)
  events: {
    perfectLaunch: { pts: 25, mult: 0.2 },
    flip: { pts: 40, mult: 0.25 },
    multiFlip: { pts: 60, mult: 0.35 },  // einmal pro Landung, ab 2 Saltos
    nearMiss: { pts: 20, mult: 0.15 },
    ring: { pts: 15, mult: 0.2 },
    cleanLanding: { pts: 10, mult: 0.1 },
    perfectLanding: { pts: 30, mult: 0.3 },
    height: { pts: 30, mult: 0.2 },
  },
};

export const FX = {
  maxParticles: 320,
  slowmoScale: 0.3,
  maxPixelRatio: 2,
};
