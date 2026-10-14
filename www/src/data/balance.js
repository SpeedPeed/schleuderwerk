// Zentrale Zahlen-Datei: ALLE globalen Spielwerte stehen hier und dürfen frei verändert werden.
// Inhaltsgebundene Werte (einzelne Upgrades, Welten) stehen bei ihrem Inhalt in data/*.js.
// Einheiten: Meter, Sekunden, Radiant – außer wo „Deg“/„Grad“ dabeisteht.
// Diese Datei importiert nichts und wird auch von node --test geladen.

export const SAVE_VERSION = 2;
export const GAME_VERSION = '0.3.0';

// ---------- Physik ----------
export const PHYSICS = {
  dt: 1 / 120,             // fester Physik-Zeitschritt
  maxStepDist: 0.5,        // adaptive Teilschritte: höchstens so viele Meter pro Teilschritt …
  maxSubsteps: 24,         // … und höchstens so viele Teilschritte pro Physik-Schritt
  speedSoftCap: 45,        // ab hier wirkt Schub (Boost, Ring-Tempo) immer schwächer
  softCapPow: 4,           // Schubfaktor = 1 / (1 + (v / speedSoftCap)^softCapPow)
  hardSpeedCap: 90,        // absolute Obergrenze des Tempos (Richtung bleibt erhalten)
  landingIterations: 16,   // Genauigkeit der Landepunkt-Suche (Halbierungen)

  rideHeight: 0.9,         // Abstand Fahrzeugmitte -> Boden
  carRadius: 1.2,          // Kollisionsradius gegen Hindernisse, Ringe, Münzen
  baseMass: 1,
  baseLaunchSpeed: 22,     // m/s bei voller Kraft ohne Upgrades
  baseThrust: 13,          // Boost-Beschleunigung m/s²
  baseBoost: 100,          // Boost-Energie
  boostDrain: 25,          // Verbrauch pro Sekunde
  baseDrag: 0.003,         // Luftwiderstand (quadratisch)
  broadsideDrag: 3,        // Zusatz-Widerstand, wenn das Auto quer zur Flugrichtung steht (Luftbremse)
  baseLift: 0.0012,        // Grund-Auftrieb der Karosserie
  maxLiftG: 2.5,           // Auftrieb höchstens so viele g
  baseRollFriction: 2.5,   // Bremswirkung am Boden m/s²
  baseMagnet: 2,           // Münz-Sammelradius in m
  baseHp: 3,

  // Neigen per Halten (linke Hälfte = Nase hoch, rechte Hälfte = Nase runter)
  airControl: 14,          // Winkelbeschleunigung beim Halten (rad/s²) → ca. 1 s pro Salto
  maxSpin: 8,              // höchste Drehgeschwindigkeit (rad/s)
  tiltDamp: 2.2,           // ohne Eingabe läuft die Drehung so schnell aus (1/s)
  autoLevel: 4.5,          // ohne Eingabe: schwaches Ausrichten in Flugrichtung (rad/s² bei 90° Abweichung)
  autoLevelMaxSpin: 3,     // nur wenn sich das Auto langsamer als das dreht
  autoLevelMinSpeed: 3,    // erst ab diesem Tempo …
  autoLevelFullSpeed: 30,  // … volle Wirkung ab diesem Tempo

  // Landung
  baseLandTolDeg: 25,      // saubere Landung bis zu diesem Winkel
  perfectLandDeg: 8,
  bumpyLandDeg: 70,        // darüber: Bruchlandung
  cleanSpeedKeep: 0.98,
  bumpySpeedKeep: 0.75,
  crashSpeedKeep: 0.45,
  hitSpeedKeep: 0.6,       // Tempo nach Treffer an einem Hindernis
  hitBounceUp: 2,          // m/s nach oben bei einem Treffer in der Luft

  // Boden
  takeoffClearance: 0.03,  // so weit muss das Auto über dem Boden sein, um abzuheben (pro 1/120 s)
  takeoffMinSpeed: 4,
  takeoffRampCheck: 4,     // Abheben zählt als Rampensprung, wenn die letzten 4 m Rampe waren
  wheelRadius: 0.5,       // für die Raddrehung
  wheelSpinAir: 6,         // Raddrehung in der Luft (rad/s)
};

// ---------- Abschuss (Halten / Loslassen) ----------
export const LAUNCH = {
  chargePeriod: 1.6,       // Sekunden für einmal Kraft 0 → 100 % → 0
  angleMin: 10,            // Grad
  angleMax: 70,
  angleDefault: 32,
  dragSens: 120,           // Grad Winkeländerung pro Bildschirmhöhe senkrechtes Ziehen (hoch = steiler)
  sweetMin: 0.7,           // grüne Zone: Mitte liegt zufällig zwischen sweetMin und sweetMax …
  sweetMax: 0.9,
  sweetWidth: 0.1,         // … und ist so breit (Anteil der Kraftleiste)
  minPower: 0.12,          // darunter wird der Abschuss abgebrochen
  perfectBonus: 0.15,      // +15 % Tempo bei perfektem Abschuss
  maxPullMeters: 4.5,      // so weit wird das Auto sichtbar zurückgezogen
  restX: 0,                // Ruheposition des Autos in der Schleuder
  restHeight: 3.2,         // … über dem Schleuder-Hügel
  restAngleDeg: 20,
  groundClearance: 0.4,    // beim Zurückziehen nie näher an den Boden
  stretchTicks: 10,        // Knarz-Geräusch alle 10 % Kraft
  preview: { points: 22, step: 0.06, sub: 4 }, // Flugkurven-Vorschau
};

// ---------- Kamera (Logik in camera/cameraRig.js) ----------
export const CAMERA = {
  fovDeg: 45,
  near: 0.5,
  far: 2500,
  slantX: 0.16,            // Kamera steht dist·slantX links …
  slantY: 0.14,            // … und dist·slantY über dem Blickpunkt (leicht schräg)
  minWidth: 24,            // sichtbare Breite in m (langsam, am Boden) …
  maxWidth: 120,           // … größte sichtbare Breite (Querformat: × Seitenverhältnis)
  minHeight: 18,           // mind. so viel Höhe sichtbar (Querformat)
  zoomSpeedRef: 200,       // Tempo-Anteil des Zooms: bei diesem Tempo wäre maxWidth erreicht
  zoomK: 2.2,              // Härte des Zooms (1/s)
  followK: 6,              // Härte der Verfolgung (1/s)
  lookAhead: 0.35,         // Vorausschau = Geschwindigkeit × lookAhead (s) …
  lookFwd: 0.25,           // … höchstens dieser Anteil der Breite nach vorn
  lookBack: 0.1,           // … bzw. nach hinten
  lookUp: 0.12,            // … und dieser Anteil der Höhe nach oben
  lookDown: 0.32,          // … bzw. nach unten
  carBelowCenter: 0.14,    // Auto sitzt um diesen Anteil der Bildhöhe unter der Mitte (mehr Himmel)
  carRadius: 2.6,          // so groß ist das Auto für den Sicherheitsrahmen (m)
  safeMargin: 0.12,        // Sicherheitsrahmen: Auto bleibt mind. 12 % vom Bildrand entfernt
  groundPad: 0.08,         // Boden möglichst mind. 8 % über dem unteren Rand halten …
  groundFitTop: 0.3,       // … solange das Auto dafür nicht höher als 30 % unter den oberen Rand muss (HUD)
  groundRelease: 1.3,      // passt der Boden nicht mehr, wird er bis zum 1,3-Fachen der Höhe weich losgelassen
  indicatorEdge: 0.02,     // Boden-Pfeil, sobald der Boden (NDC) näher als das am unteren Rand liegt
  frameIterations: 4,      // Nachkorrekturen der harten Klemmung
  recenterNdc: 1.5,        // liegt das Auto weiter draußen (z. B. nach einem Sprung), wird direkt auf es zentriert
  shake: { max: 1.2, amp: 0.6, decay: 7, lookMul: 0.5, min: 0.001 },
  workshop: { widthPortrait: 15, widthLandscape: 26, offsetX: 1.2, lowerFrac: 0.2, snapLower: 6, k: 3 },
  aim: { offsetX: 8, offsetY: 10, width: 30, k: 3 },
};

// ---------- Floating Origin (render/origin.js) ----------
export const ORIGIN = {
  shiftEvery: 400,         // Render-Ursprung springt in diesen Schritten mit der Kamera mit
};

// ---------- Strecke (physics/track.js) ----------
export const TRACK = {
  step: 2,                 // ein Höhenpunkt alle 2 m
  start: -80,              // Strecke beginnt hier (hinter der Schleuder)
  plateauH: 5,             // Hügel, auf dem die Schleuder steht
  plateauEnd: 6,
  blendEnd: 34,            // weicher Übergang vom Hügel in die Landschaft
  ampBase: 0.35,           // Hügel-Stärke am Anfang (wächst mit world.terrain.ampGrowth)
  minRampLength: 4,        // m
  initialLength: 800,
  ensureAhead: 400,        // so weit im Voraus wird die Strecke erzeugt
  ensureMargin: 4,
};

// ---------- Objekte & Kollision (physics/objects.js) ----------
export const OBJECTS = {
  coinPickup: 1.4,         // Sammelradius einer Münze (+ Autoradius-unabhängig)
  bigCoinPickupMul: 1.5,
  ringRadius: 3.0,
  ringInset: 0.4,          // Treffer-Fenster = ringRadius - ringInset
  magnetSpeed: 25,         // m/s, mit denen angezogene Münzen fliegen (+ Autotempo)
  thermalEdgePow: 4,       // Aufwind wird zum Säulenrand hin weicher (je größer, desto schärfer der Rand)
  nearMissClearance: 2.2,  // so knapp über ein Hindernis = „Knapp vorbei!“
  cleanupEvery: 0.5,       // Sekunden
  cleanupBehind: 80,       // Objekte so weit hinter dem Auto werden entfernt
  // Hitboxen der Hindernisse (Breite, Höhe)
  tires: { w: 1.9, h: 2.1 },
  scrap: { w: 3.0, h: 4.6 },
  cactus: { w: 1.6, h: 3.8 },
  pillar: { w: 3.2, h: 6.0 },
};

export const SPAWN = {
  startX: 30,
  initialAhead: 300,
  ahead: 300,              // so weit vor dem Auto werden Objekte erzeugt
  coinAlt: { min: 3, base: 10, perM: 0.03, max: 70 },
  ringAlt: { min: 6, base: 8, perM: 0.02, max: 45 },
  bigCoinAlt: { min: 20, base: 30, perM: 0.05 },
  bigCoinValue: 5,
  arc: { nMin: 5, nRand: 5, spacing: 2.2, bumpMin: 2, bumpMax: 6 },
  groundRow: { nMin: 6, nRand: 5, spacing: 2.2, height: 1.1 },
  riskCoins: { count: 3, spacing: 2.2, above: 1.5, value: 2 },
  rampClearBefore: 10,     // keine Hindernisse so nah an Rampen …
  rampClearAfter: 14,
  rampArcAlt: 4,           // … stattdessen ein Münzbogen in dieser Höhe
};

// ---------- Etappe (stage/stage.js) ----------
export const STAGE = {
  maxFrameDt: 0.05,        // längere Bildpausen werden gekürzt
  maxTime: 240,
  stopSpeed: 0.8,          // darunter gilt das Auto als gestoppt …
  stopTime: 0.6,           // … nach so vielen Sekunden
  wreckDelay: 0.8,
  coinStreakTime: 1,
  ringSpeed: 6,            // Tempo-Schub eines Boost-Rings (unterliegt der weichen Grenze)
  ringBoostRefill: 0.25,   // Anteil der Boost-Energie
  gust: { freqA: 0.8, freqB: 0.31, phaseB: 2, phaseRange: 10 },
  defaultWeather: { name: 'Windstill', icon: '☀️', weight: 1, wind: [0, 0] },
};

// ---------- Geld & Upgrades ----------
export const ECONOMY = {
  moneyPerMeter: 0.5,
  moneyPerHeight: 1.0,
  coinValue: 1,
  costGrowth: 1.15,        // Preis = Basispreis × costGrowth^Stufe
  halfLevel: 12,           // Wirkung = dimReturn(Stufe, Maximalwirkung, halfLevel)
};

// ---------- Steuerung ----------
export const CONTROLS = {
  splitX: 0.5,             // Grenze linke/rechte Bildschirmhälfte
  keyAngleRate: 45,        // Grad/s mit Pfeil hoch/runter beim Zielen
  tutorialRuns: 3,         // so viele Runs lang werden Hinweise gezeigt
  flyHintTime: 5,          // Sekunden
};

// ---------- Darstellung ----------
export const RENDER = {
  maxPixelRatio: 1.5,
  fogNear: 60,             // Nebel beginnt bei Kamera-Abstand + fogNear …
  fogFar: 650,             // … und ist bei Kamera-Abstand + fogFar voll
  hemiIntensity: 1.6,
  sunIntensity: 2.4,
  sunOffset: { x: 25, y: 45, z: 35 },
  shadowMapSize: 1024,
  shadowHalf: 28,          // halbe Größe der Schattenkamera (m)
  shadowNear: 1,
  shadowFar: 160,
  shadowBias: -0.0008,
  shadowNormalBias: 0.05,
  chunkBehind: 160,        // Gelände-Stücke so weit hinter …
  chunkAhead: 320,         // … und vor der Kamera
  objectsBehind: 70,
  objectsAhead: 160,
};

// ---------- Kombos und Tricks (pts = Trickpunkte, mult = Erhöhung des Kombo-Multiplikators) ----------
export const KOMBO = {
  chainTimeout: 2.5,       // Sekunden am Boden ohne Aktion -> Kombo wird gesichert
  minAirForLanding: 1.2,   // Landebonus erst ab dieser Flugzeit
  flipLeniencyDeg: 25,     // 335° zählen schon als Salto
  heightMarks: [50, 100, 250, 500, 1000],
  maxMult: 4,              // Obergrenze des Kombo-Multiplikators
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

// ---------- Effekte (Zeitlupe, Wackeln, Partikel) ----------
export const FX = {
  maxParticles: 320,
  slowmoScale: 0.3,
  slowmoRecover: 4,        // so schnell läuft die Zeitlupe aus (1/s)
  slowmo: { perfectLaunch: 0.35, multiFlip: 0.4, perfectLanding: 0.25 },
  shake: { launch: 0.25, hit: 0.8, crash: 0.9, bumpyMax: 0.6, bumpyDiv: 30, landMax: 0.5, landDiv: 35 },
  landDustDiv: 20,         // Staubmenge = Aufprall / landDustDiv
  landSoundDiv: 25,
  landHapticImpact: 8,
  resultDelay: 0.7,        // Sekunden bis zur Auswertung
  idleBob: { amp: 0.05, freq: 2 },
  flag: { minDist: 20, z: -2.4 },
  trajectory: { max: 24, size: 0.22, opacity: 0.85, shrinkPad: 4 },
  particles: {
    coin: { n: 6, colors: ['#ffd23f', '#fff3a0', '#ffae00'], speed: 5, life: 0.4, size: 0.35 },
    ring: { n: 18, colors: ['#33e6ff', '#ffffff', '#9ff4ff'], speed: 9, life: 0.6, size: 0.4, jitter: 3 },
    dust: { amount: 0.4, nBase: 8, nPerAmount: 16, spread: 2.6, speedBase: 3, speedPerAmount: 7, life: 0.8, gravity: 7, size: 0.5, zSpread: 3 },
    smash: {
      n: 26, speed: 11, life: 1.1, gravity: 16, size: 0.55, jitter: 1.5, zSpread: 3,
      colors: { tires: ['#26262b', '#3a3a40', '#e8b830'], cactus: ['#4f8a4a', '#5c9a52', '#ff6b8a'], pillar: ['#c2703f', '#d08050', '#e9a466'] },
    },
    sparkle: { n: 26, colors: ['#ffd23f', '#ffffff', '#ff8a3d'], speed: 7, life: 0.9, gravity: 5, size: 0.35, jitter: 2 },
    boostFlame: { back: 2.3, down: 0.2, n: 2, colors: ['#fff17a', '#ffa22e', '#ff5a1f'], spread: 0.5, speed: 9, inherit: 0.7, life: 0.28, size: 0.5, jitter: 0.3, zSpread: 0.6, zSpeed: 0.5 },
    groundDust: { minSpeed: 8, chance: 0.4, dx: -1.4, dy: -0.9, n: 1, dir: 0.75, spread: 0.8, speed: 3, life: 0.6, gravity: 3, size: 0.45, zSpread: 2.2 },
    windDust: { minWind: 0.5, chancePerWind: 0.06, spreadX: 1.2, windMul: 3, vy: -0.5, life: 1.4, sizeBase: 0.18, sizePerWidth: 0.004, zSpread: 6 },
  },
};
