// Zentrale Zahlen-Datei: ALLE globalen Spielwerte stehen hier und dürfen frei verändert werden.
// Inhaltsgebundene Werte (Chassis, Teile, Fähigkeiten, Welten) stehen bei ihrem Inhalt in data/*.js.
// Einheiten: Meter, Sekunden, Radiant – außer wo „Deg“/„Grad“ dabeisteht.
// Diese Datei importiert nichts und wird auch von node --test geladen.

export const SAVE_VERSION = 3;
export const GAME_VERSION = '0.4.0';

// ---------- Speichern ----------
export const SAVE = {
  autosaveEvery: 15,       // Sekunden Spielzeit zwischen zwei automatischen Speicherungen
};

// ---------- Physik ----------
// Fahrzeugwerte, die Chassis/Teile/Items verändern können, stehen als Grundwerte in BASE_STATS (unten).
export const PHYSICS = {
  dt: 1 / 120,             // fester Physik-Zeitschritt
  maxStepDist: 0.5,        // adaptive Teilschritte: höchstens so viele Meter pro Teilschritt …
  maxSubsteps: 24,         // … und höchstens so viele Teilschritte pro Physik-Schritt
  speedSoftCap: 45,        // Standard der weichen Tempo-Grenze (Stat speedSoftCap): Schub wirkt darüber immer schwächer
  softCapPow: 4,           // Schubfaktor = 1 / (1 + (v / speedSoftCap)^softCapPow)
  hardSpeedCap: 90,        // absolute Obergrenze des Tempos (Richtung bleibt erhalten)
  landingIterations: 16,   // Genauigkeit der Landepunkt-Suche (Halbierungen)

  rideHeight: 0.9,         // Abstand Fahrzeugmitte -> Boden (Radunterkante aller Modelle)
  carRadius: 1.2,          // Kollisionsradius gegen Hindernisse, Ringe, Schrauben
  broadsideDrag: 3,        // Zusatz-Widerstand, wenn das Auto quer zur Flugrichtung steht (Luftbremse)
  maxLiftG: 2.5,           // Auftrieb höchstens so viele g

  // Neigen per Halten (linke Hälfte = Nase hoch, rechte Hälfte = Nase runter); Stärke = Stats airControl × flipSpeed
  tiltDamp: 2.2,           // ohne Eingabe läuft die Drehung so schnell aus (1/s)
  autoLevelMaxSpin: 3,     // Ausrichten (Stat autoLevel) nur, wenn sich das Auto langsamer als das dreht
  autoLevelMinSpeed: 3,    // erst ab diesem Tempo …
  autoLevelFullSpeed: 30,  // … volle Wirkung ab diesem Tempo

  // Landung (Toleranzen landTolDeg/perfectLandDeg sind Stats)
  bumpyLandDeg: 70,        // darüber: Bruchlandung
  cleanSpeedKeep: 0.98,
  bumpySpeedKeep: 0.75,
  crashSpeedKeep: 0.45,
  hitSpeedKeep: 0.6,       // Tempo nach Treffer an einem Hindernis
  hitBounceUp: 2,          // m/s nach oben bei einem Treffer in der Luft
  bounceMinSpeed: 2.5,     // Abprall (Stat bounce): erst ab so viel m/s Rückprall hebt die Kiste wieder ab

  // Boden
  takeoffClearance: 0.03,  // so weit muss das Auto über dem Boden sein, um abzuheben (pro 1/120 s)
  takeoffMinSpeed: 4,
  takeoffKink: 0.5,        // Kante: fällt die Bodenneigung um mehr als so viel (rad), hebt die Kiste ab
  driveMassExp: 0.5,       // Antrieb am Boden = driveAccel / mass^driveMassExp (Rollreibung ist masseunabhängig) →
                           // schwere Kisten fahren langsamer an, bleiben aber nicht stehen
  takeoffRampCheck: 4,     // Abheben zählt als Rampensprung, wenn die letzten 4 m Rampe waren
  jumpLift: 0.05,          // Sprung vom Boden: so weit wird die Kiste sofort angehoben (m)
  wheelRadius: 0.5,        // für die Raddrehung
  wheelSpinAir: 6,         // Raddrehung in der Luft (rad/s)
};

// ---------- Fahrzeug-Grundwerte (Stats) ----------
// Endwert = Soft-Cap( (Basis + Σadd) × (1 + Σmul) × Π xmul ) – siehe items/statMods.js.
// Chassis, Teile, Forschung, Items, Set-Boni und Buffs verändern diese Werte über Modifikatoren.
export const BASE_STATS = {
  // Abschuss
  launchSpeed: 22,         // m/s bei voller Kraft
  launchPerfectBonus: 0.15, // +15 % Tempo bei perfektem Abschuss
  sweetSpotWidth: 0.1,     // Breite der grünen Zone (Anteil der Kraftleiste)
  // Flug
  mass: 1,
  drag: 0.003,             // Luftwiderstand (quadratisch)
  lift: 0.0012,            // Grund-Auftrieb der Karosserie
  airControl: 14,          // Winkelbeschleunigung beim Neigen (rad/s²) → ca. 1 s pro Salto
  maxSpin: 8,              // höchste Drehgeschwindigkeit (rad/s)
  flipSpeed: 1,            // Faktor auf airControl
  autoLevel: 4.5,          // ohne Eingabe: schwaches Ausrichten in Flugrichtung (rad/s² bei 90° Abweichung)
  // Boost (Fähigkeit „boost“)
  boostThrust: 13,         // Schub (m/s² bei Masse 1)
  boostFuel: 16,           // Treibstoff pro Sekunde (Δv je Liter besser als der Bodenantrieb)
  boostHeat: 30,           // Hitze pro Sekunde (darf durch mul negativ werden = Boost kühlt)
  boostSelfDamage: 0,      // Haltbarkeit pro Boost-Sekunde (Flüche)
  // Antrieb & Boden
  driveAccel: 6,           // Antrieb am Boden (m/s² bei Masse 1, siehe PHYSICS.driveMassExp)
  driveFuel: 12,           // Treibstoff pro Sekunde Antrieb (voller Tank ≈ 10 s Bodenfahrt)
  driveHeat: 5,            // Hitze pro Sekunde Antrieb
  rollFriction: 2.5,       // Bremswirkung am Boden m/s²
  // Ressourcen
  fuelMax: 120,
  heatMax: 100,
  heatGain: 1,             // Faktor auf alle Hitzezunahmen
  coolRate: 10,            // Abkühlung pro Sekunde (Dauer-Boost: +30 − 10 = +20/s → Überhitzung nach 5 s)
  durabilityMax: 100,
  armor: 0,                // Schadensreduktion 0 … 0,6
  impactThreshold: 16,     // Aufprall-Normaltempo (m/s), ab dem eine Landung Schaden macht (Phase 3: 14 → 16, mehr Landungen je Etappe)
  // Landung
  landTolDeg: 25,          // saubere Landung bis zu diesem Winkel
  perfectLandDeg: 8,
  // Sammeln & Tempo
  magnet: 2,               // Sammelradius in m
  speedSoftCap: 45,        // weiche Tempo-Grenze (m/s)
  // Run & Meta
  luck: 0,
  boltGain: 1,
  scrapGain: 1,
  itemSlots: 6,
  abilitySlots: 2,
  abilityCooldown: 1,      // Faktor auf alle Abklingzeiten (< 1 = schneller)
  bounce: 0,               // Abprall bei Landungen (Anteil des Aufprall-Tempos)
  shopDiscount: 0,
  rerollDiscount: 0,
  itemChoices: 3,
  repairBonus: 0,
};

// ---------- Grenzen der Stats ----------
// cap/pow: weiche Obergrenze (bis cap unverändert, darüber nur noch mit der pow-ten Wurzel), min/max: harte Grenzen,
// round: ganze Zahl, negative: (1 + Σmul) darf negativ werden (sonst wird der Faktor bei 0 abgeschnitten).
export const SOFTCAPS = {
  launchSpeed: { cap: 40, pow: 2, min: 5 },
  launchPerfectBonus: { min: 0, max: 0.6 },
  sweetSpotWidth: { min: 0.03, max: 0.3 },
  mass: { min: 0.3, max: 5 },
  drag: { min: 0.0003 },
  lift: { min: 0, max: 0.012 },
  airControl: { cap: 30, pow: 2, min: 3 },
  maxSpin: { cap: 14, pow: 2, min: 2 },
  flipSpeed: { cap: 2, pow: 2, min: 0.3 },
  boostThrust: { cap: 32, pow: 2 },
  boostHeat: { min: -60, negative: true },
  driveAccel: { cap: 10, pow: 2 },
  rollFriction: { min: 0.05 },
  fuelMax: { min: 10 },
  heatMax: { min: 20 },
  heatGain: { min: 0.2 },
  durabilityMax: { min: 10 },
  armor: { min: 0, max: 0.6 },
  impactThreshold: { min: 2 },
  landTolDeg: { cap: 45, pow: 2, min: 5, max: 69 },
  perfectLandDeg: { min: 1, max: 20 },
  magnet: { cap: 12, pow: 2 },
  speedSoftCap: { cap: 60, pow: 2, min: 20 },
  bounce: { min: 0, max: 0.6 },
  itemSlots: { min: 1, max: 10, round: true },
  abilitySlots: { min: 1, max: 3, round: true },
  abilityCooldown: { min: 0.35 },
  itemChoices: { min: 1, max: 5, round: true },
  shopDiscount: { min: 0, max: 0.6 },
  rerollDiscount: { min: 0, max: 0.8 },
};

// ---------- Garage (Chassis & Teile) ----------
export const GARAGE = {
  costGrowth: 1.15,        // Preis der nächsten Stufe = Basispreis × costGrowth^Stufe
  maxPartLevel: 20,
  dimDivisor: 30,          // Wirkung = perLevel × L / (1 + L / dimDivisor) → Stufe 20 ≈ 12 effektive Stufen
  starterUpgradeBase: 40,  // Basispreis der Startteile (kosten 0 Schrott)
  starterChassis: 'seifenkiste',
  starterAbilities: ['boost', 'sprung'],
  starterParts: {
    drive: 'drive_rasenmaehermotor',
    wheels: 'wheels_bobbycar',
    aero: 'aero_fahrtwind',
    armor: 'armor_pappe',
    tank: 'tank_kanister',
    cooling: 'cooling_fahrtwind',
    gadget: 'gadget_hupe',
  },
  migrateScrapDiv: 40,     // Spielstand v2 → v3: altes Geld / 40 = Startschrott …
  migrateScrapMax: 400,    // … höchstens 400
  // Werte-Übersicht in der Garage: Balken-Endwert je Stat
  statBars: [
    { stat: 'launchSpeed', name: 'Startkraft', max: 40, unit: 'm/s' },
    { stat: 'boostThrust', name: 'Schub', max: 32, unit: '' },
    { stat: 'fuelMax', name: 'Treibstoff', max: 200, unit: '' },
    { stat: 'coolRate', name: 'Kühlung', max: 40, unit: '/s' },
    { stat: 'durabilityMax', name: 'Haltbarkeit', max: 200, unit: '' },
    { stat: 'airControl', name: 'Luftsteuerung', max: 40, unit: '' },
    { stat: 'mass', name: 'Gewicht', max: 2.5, unit: '' },
  ],
};

// ---------- Ressourcen: Treibstoff, Hitze, Haltbarkeit ----------
export const RESOURCES = {
  overheatStall: 2.0,      // Sekunden ohne Boost/Antrieb nach Überhitzung
  overheatDamage: 3,       // Schaden durch Überhitzung (ignoriert Panzerung)
  overheatResetHeat: 50,   // Hitze nach der Überhitzung
  heatResourceRearm: 0.8,  // heatIsResource: overheat-Ereignis erst wieder, wenn die Hitze unter 80 % fiel
  heatWarn: 0.8,           // HUD: Hitze-Leiste blinkt ab 80 %
  dmgPerMps: 1,            // Aufprallschaden je m/s Normaltempo über impactThreshold
  crashLandingDamage: 10,  // Zusatzschaden bei Bruchlandung
  bumpyLandingDamage: 2,   // Zusatzschaden bei holpriger Landung
  obstacleDamage: 5,       // Hindernis gerammt
  minLandingAir: 0.15,     // Landung zählt (landing-Ereignis) erst nach so viel Flugzeit; sonst nur groundTouch
  selfDamageStep: 1,       // Dauer-Schaden (boostSelfDamage) wird in Schritten von 1 abgebucht
  damagePopupMin: 3,       // Schadens-Einblendung erst ab so viel Schaden
  shieldMinDamage: 2,      // Schilde (shield) fangen erst Schaden ab so viel ab (nach Panzerung); kleinerer geht normal durch
  durWarn: 0.5,            // HUD: Haltbarkeits-Leiste gelb unter 50 % …
  durCrit: 0.25,           // … und rot unter 25 %
};

// ---------- Testfahrt (seit Phase 3 nur noch im Dev-Menü: eine Etappe ohne Run) ----------
// Schrott-Belohnung = Distanz / distDiv + max. Höhe / heightDiv + Trickpunkte / trickDiv (+ Schrott-Pickups),
// danach × Welt-Faktor × Stat scrapGain, gerundet.
export const TESTDRIVE = {
  distDiv: 12,
  heightDiv: 25,
  trickDiv: 15,
  scrapPickupValue: 1,     // Schrott je eingesammeltem Schrott-Pickup (Mülltonne)
};

// ---------- Streckenbausteine (physics/trackGen.js → track.js / objects.js) ----------
// Inhaltsgebundene Werte (Längen, Höhen, Breiten je Biom) stehen in data/biomes.js; hier nur die globalen Regeln.
export const FEATURES = {
  firstFree: 40,           // die ersten 40 m nach der Schleuder bleiben frei
  regionGoldMul: 1.12,     // Bausteine liegen von firstFree bis Gold-Marke × 1,12 (danach nur Hügel und Rampen)
  slotPad: 8,              // Mindestabstand zwischen zwei Bausteinen (m)
  minSlot: 40,             // passt ein Baustein samt Abstand nicht in so viele Meter, entfällt er
  eliteDifficulty: 0.25,   // Elite-Etappe: Schwierigkeit + 0,25 …
  eliteExtra: 1,           // … und ein Baustein mehr
  bossDifficulty: 1,       // Boss-Strecken haben immer volle Schwierigkeit
  blend: 16,               // weicher Übergang (m) von der Landschaft auf eingeebnete Bausteine
  gap: { fallDepth: 12, fallDamage: 25, floorJitter: 3 },   // Sturz > 12 m unter die Kante → Ende 'fall' + 25 Schaden
  loop: { flat: 10, frictionDecel: 0.6, bolts: 9, minEnter: 1.5 }, // Looping: ebene Fläche ±10 m, Reibung im Ring (m/s²), Einfahrt ab 1,5 m/s
  crusher: { damage: 6, speedKeep: 0.45, flat: 9, gantryH: 7.5, blockH: 2.6, openY: 4.2, cooldown: 1.2 }, // Schrottpresse
  lightning: { warn: 1, damage: 6, radius: 3.5, every: [2.2, 3.4], lead: [0.25, 1.35], show: 0.18, speedKeep: 0.85 }, // Blitz: 1 s Warnung
  magnet: { pull: 9, radius: 15, height: 9, swing: 0.35 }, // Magnetkran: Zug (m/s²) bis Radius, Höhe des Magneten, Pendel (Hz)
  wind: { gustFreq: 0.9 },  // Böen in Windzonen
  trackTail: { rampEvery: [130, 260] }, // hinter dem Bausteinbereich: gelegentliche Rampen
};

// ---------- Pickups in der Etappe (physics/objects.js, stage/stage.js) ----------
export const PICKUPS = {
  radius: 1.6,             // Sammelradius (zzgl. Magnet)
  fuel: 30,                // ⛽ Kanister: + Treibstoff
  cool: 35,                // ❄ Kühlpack: − Hitze
  repair: 8,               // 🔧 Reparaturset: + Haltbarkeit (selten)
  scrap: 3,                // ⚙ Schrott-Häufchen: + Meta-Schrott
  altitude: [1.4, 9],      // Höhe über dem Boden
  blueprintChance: 0.35,   // Elite: Chance auf eine 📘 Blaupause in der Strecke
};

// ---------- Karte eines Akts (map/mapGen.js; Knotentypen in data/nodes.js) ----------
export const MAP = {
  floors: 6,               // Etagen 0–5, danach die Boss-Strecke (Etage 6)
  floorSizes: [[2, 0.5], [3, 0.4], [4, 0.1]], // Knoten je Etage mit Gewicht (≈ 15 Knoten je Akt)
  extraEdgeChance: 0.35,   // zusätzliche (kreuzungsfreie) Verbindung je Knotenpaar
};

// ---------- Run (run/runState.js) ----------
export const RUN = {
  acts: 3,
  towPenalty: 0.15,        // nicht geschafft: Abschleppen kostet 15 % der max. Haltbarkeit, dann Neuversuch
  version: 1,              // Format von save.run (älteres/fremdes Format wird verworfen)
};

// ---------- Run-Belohnungen (run/rewards.js) ----------
// Schrauben (Run-Währung) und Meta-Schrott je geschaffter Etappe: Grundwert je Akt × Medaillen-Faktor × Knoten-Faktor.
export const REWARDS = {
  bolts: { 1: 18, 2: 26, 3: 36 },
  scrap: { 1: 14, 2: 24, 3: 36 },
  medalMul: { bronze: 1, silver: 1.4, gold: 1.8 },
  kindMul: { stage: 1, elite: 1.6, boss: 3 },
  bossGoldBonus: 0.5,      // Boss: Gold gibt +50 % obendrauf (Boss kennt nur Bronze und Gold)
  blueprints: { elite: 1, boss: { 1: 3, 2: 4, 3: 5 } },
  firstBossCores: { 2: 1, 3: 1 }, // erster Boss-Sieg in Akt 2/3: Kerne
  winCores: 1,             // Run gewonnen: Kern(e)
  boltsToScrap: 0.1,       // übrige Schrauben → 10 % als Schrott am Run-Ende
  actScrap: { 1: 40, 2: 80, 3: 140 }, // Akt abgeschlossen: Bonus-Schrott
  placeholderBolts: { event: 10, treasure: 20, dealer: 0, workbench: 0, blackmarket: 0 }, // Platzhalter bis Phase 5
};

// ---------- Items, Effekte, Ereignis-Warteschlange ----------
export const ITEMS = {
  tierMult: [1, 1.6, 2.3], // Stufenfaktor ★1/★2/★3 auf skalierte Parameter (amount, pct, dur, radius, add, mul)
  maxChainDepth: 8,        // Ereignisse aus Effekten mit größerer Kettentiefe werden verworfen
  maxEventsPerFlush: 64,   // höchstens so viele Ereignisse pro Abarbeitung (1× pro Physik-Schritt)
  luckPerPoint: 0.05,      // chance: p + Glück × 0,05 …
  chanceMax: 0.95,         // … höchstens 95 %
  overFuelMax: 1.5,        // fuel {over:true}: Tank bis höchstens 150 % von fuelMax
  explosionJump: 0.4,      // Explosion: Sprung = amount × 0,4 (Schub nach vorn = amount)
};

// ---------- Regel-Schalter (Parameter; Auswertungsstellen siehe ARCHITEKTUR.md Anhang A) ----------
export const RULES = {
  lowGrip: { driveMul: 0.5, frictionMul: 0.5, takeoffMul: 0.5 },     // Raketenschlitten (Kufen)
  parachute: { approach: 25, dragMul: 3 },                           // Fallschirm: Sinktempo-Führung m/s², Luftwiderstand ×3
  hardStop: { time: 0.25, lowGripTime: 0.5, drivePause: 0.5, armTime: 3 }, // Notbremse
  heatToThrust: { min: 1, explodeAt: 70 },                           // Schleudergang
  collectScrapMass: { damageMul: 1 / 3, pickups: 6, minAlt: 0.6, maxAlt: 1.5, pickupEvery: [40, 90], maxPieces: 12 }, // Mülltonne
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
  // Breite der Zone und Tempo-Bonus sind Stats (sweetSpotWidth, launchPerfectBonus)
  minPower: 0.12,          // darunter wird der Abschuss abgebrochen
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
  // Garage: große 3D-Vorschau oben; das Fahrzeug dreht sich langsam (spin rad/s). Hochformat: Radunterkante
  // fitPad (NDC) über der Unterkante der Vorschau-Fläche (.g-preview), hohe Modelle werden kleiner gezeigt, damit
  // die Oberkante fitPad unter deren Oberkante bleibt (Breite mind. widthPortrait). Ohne Vorschau-Fläche gilt carNdcY.
  // Querformat: Garage-Liste rechts, Fahrzeug links bei (carNdcXLandscape, carNdcYLandscape), Oberkante ≤ topNdcLandscape.
  garage: {
    widthPortrait: 10, widthLandscape: 17, carNdcY: 0.55, carNdcYLandscape: 0.05, carNdcXLandscape: -0.42, k: 3, spin: 0.45, startAngle: -0.5,
    fitPad: 0.04, fitMinSpan: 0.2, topNdcLandscape: 0.85,
  },
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
  boltPickup: 1.4,         // Sammelradius einer Schraube (unabhängig vom Autoradius)
  bigBoltPickupMul: 1.5,
  scrapPickup: 1.6,        // Sammelradius eines Schrott-Pickups (Mülltonne)
  ringRadius: 3.0,
  ringInset: 0.4,          // Treffer-Fenster = ringRadius - ringInset
  magnetSpeed: 25,         // m/s, mit denen angezogene Schrauben fliegen (+ Autotempo)
  thermalEdgePow: 4,       // Aufwind wird zum Säulenrand hin weicher (je größer, desto schärfer der Rand)
  nearMissClearance: 2.2,  // so knapp über ein Hindernis = „Knapp vorbei!“
  cleanupEvery: 0.5,       // Sekunden
  cleanupBehind: 80,       // Objekte so weit hinter dem Auto werden entfernt
  // Hitboxen der Hindernisse (Breite, Höhe)
  // (Höhen so, dass der Hüpfer drüberkommt – Schrottberge der Bausteine haben eigene Höhen, siehe data/biomes.js)
  tires: { w: 1.9, h: 2.1 },
  scrap: { w: 3.0, h: 2.4 },
  cactus: { w: 1.6, h: 3.0 },
  pillar: { w: 3.2, h: 6.0 },
  scrapModelH: 4.6,        // Höhe des Schrottberg-Modells (wird auf die Hitbox-Höhe skaliert)
};

export const SPAWN = {
  startX: 30,
  initialAhead: 300,
  ahead: 300,              // so weit vor dem Auto werden Objekte erzeugt
  boltAlt: { min: 3, base: 10, perM: 0.03, max: 70 },
  ringAlt: { min: 6, base: 8, perM: 0.02, max: 45 },
  bigBoltAlt: { min: 20, base: 30, perM: 0.05 },
  bigBoltValue: 5,         // Schraubendose = 5 Schrauben
  arc: { nMin: 5, nRand: 5, spacing: 2.2, bumpMin: 2, bumpMax: 6 },
  groundRow: { nMin: 6, nRand: 5, spacing: 2.2, height: 1.1 },
  riskBolts: { count: 3, spacing: 2.2, above: 1.5, value: 2 },
  rampClearBefore: 10,     // keine Hindernisse so nah an Rampen …
  rampClearAfter: 14,
  rampArcAlt: 4,           // … stattdessen ein Schraubenbogen in dieser Höhe
};

// ---------- Etappe (stage/stage.js) ----------
export const STAGE = {
  maxFrameDt: 0.05,        // längere Bildpausen werden gekürzt
  maxTime: 240,
  stopSpeed: 2,            // darunter gilt das Auto als gestoppt …
  stopTime: 0.6,           // … nach so vielen Sekunden
  wreckDelay: 0.8,
  fallDelay: 0.7,          // Schluchtsturz: so lange fällt die Kiste noch sichtbar, dann Ende 'fall'
  boltStreakTime: 1,
  ringSpeed: 6,            // Tempo-Schub eines Boost-Rings (unterliegt der weichen Grenze)
  ringFuelRefill: 0.25,    // Anteil des maximalen Treibstoffs
  milestoneEvery: 100,     // Ereignis milestone alle 100 m
  gust: { freqA: 0.8, freqB: 0.31, phaseB: 2, phaseRange: 10 },
  defaultWeather: { name: 'Windstill', icon: '☀️', weight: 1, wind: [0, 0] },
};

// ---------- Steuerung ----------
export const CONTROLS = {
  splitX: 0.5,             // Grenze linke/rechte Bildschirmhälfte
  keyAngleRate: 45,        // Grad/s mit Pfeil hoch/runter beim Zielen
  abilityKeys: ['Digit1', 'Digit2', 'Digit3', 'Digit4'], // Tastatur: Fähigkeit 1–4 (Leertaste = Boost)
  devTaps: 7,              // so oft schnell hintereinander auf die Versionsnummer tippen → Dev-Menü …
  devTapGap: 1.0,          // … mit höchstens so vielen Sekunden zwischen zwei Taps
  tutorialRuns: 3,         // so viele Runs lang werden Hinweise gezeigt
  flyHintTime: 5,          // Sekunden
};

// ---------- Darstellung ----------
export const RENDER = {
  maxPixelRatio: 1.5,
  vehicleScale: 1.2,       // Fahrzeug-Modelle werden so stark vergrößert (Radunterkante bleibt auf rideHeight)
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
    loop: { pts: 35, mult: 0.3 },
  },
};

// ---------- Effekte (Zeitlupe, Wackeln, Partikel) ----------
export const FX = {
  maxParticles: 320,
  // Standardwerte eines Partikel-Ausstoßes (render/particles.js), wenn die Vorlage nichts angibt
  particleDefaults: { n: 8, dir: 1.5708, spread: 6.2832, speed: 6, life: 0.8, jitter: 0.4, zSpread: 1.5, zSpeed: 2, size: 0.4, z: 0, gravity: 0 },
  slowmoScale: 0.3,
  slowmoRecover: 4,        // so schnell läuft die Zeitlupe aus (1/s)
  slowmo: { perfectLaunch: 0.35, multiFlip: 0.4, perfectLanding: 0.25 },
  shake: { launch: 0.25, hit: 0.8, crash: 0.9, bumpyMax: 0.6, bumpyDiv: 30, landMax: 0.5, landDiv: 35, lightning: 0.5 },
  landDustDiv: 20,         // Staubmenge = Aufprall / landDustDiv
  landSoundDiv: 25,
  landHapticImpact: 8,
  resultDelay: 0.7,        // Sekunden bis zur Auswertung
  resultCount: { base: 500, perScrap: 4, max: 1400 }, // Hochzählen der Belohnung: Dauer in ms
  garageWheelSpin: 2,      // Raddrehung in der Garage (rad/s)
  idleSpinnerMul: 0.3,     // Propeller/Turbinen drehen ohne Antrieb mit diesem Anteil weiter (Garage, Zeitlupe)
  idleBob: { amp: 0.05, freq: 2 },
  flag: { minDist: 20, z: -2.4 },
  trajectory: { max: 24, size: 0.22, opacity: 0.85, shrinkPad: 4 },
  rain: { drops: 260, color: '#c9d8f0', opacity: 0.45, speed: 38, windMul: 1.4, depth: 30, minLen: 0.8, maxLen: 3, lenPerHeight: 0.025 },
  // Blitz-Aufleuchten (Gewittersteppe): zufällig im Hintergrund alle every [min, max] s, bei Einschlägen stärker
  flash: { every: [4, 11], ambient: 0.55, strike: 1, decay: 5, hemiMul: 2.2 },
  medalFlags: { z: -2.4, colors: { bronze: '#cd7f32', silver: '#c9d1da', gold: '#ffd23f' } },
  windStreak: { chancePerWind: 0.12, colors: ['#ffffff', '#e8f4ff'] },
  particles: {
    bolt: { n: 6, colors: ['#d7dde3', '#ffffff', '#9aa4ae'], speed: 5, life: 0.4, size: 0.35 },
    scrap: { n: 10, colors: ['#9a4a2e', '#5b6e7a', '#a36a2c'], speed: 6, life: 0.6, gravity: 9, size: 0.4 },
    explosion: { n: 30, colors: ['#fff17a', '#ffa22e', '#ff5a1f', '#5a4a40'], speed: 12, life: 0.7, gravity: 4, size: 0.6, jitter: 1 },
    // Dampf bei Hitze ab heatFrac (oder im Stillstand), dy m über der Fahrzeugmitte
    steam: { n: 1, colors: ['#ffffff', '#e6eef5', '#cfd8e0'], dir: 1.5708, spread: 0.8, speed: 3, life: 0.9, gravity: -2, size: 0.45, zSpread: 1, chance: 0.5, heatFrac: 0.9, dy: 0.8 },
    steamBurst: { n: 14, colors: ['#ffffff', '#e6eef5', '#cfd8e0'], dir: 1.5708, spread: 6.2832, speed: 6, life: 0.9, gravity: -2, size: 0.45, zSpread: 1 }, // Schleudergang
    // Antriebs-Rauch: Richtung = Fahrzeugwinkel + dirOffset × π, erbt inherit × Fahrzeugtempo
    driveSmoke: { n: 1, colors: ['#8a8f96', '#a7acb2', '#6e737a'], spread: 0.6, speed: 1.5, life: 0.5, gravity: -1.5, size: 0.28, zSpread: 0.4, chance: 0.18, dirOffset: 0.85, inherit: 0.5 },
    ring: { n: 18, colors: ['#33e6ff', '#ffffff', '#9ff4ff'], speed: 9, life: 0.6, size: 0.4, jitter: 3 },
    dust: { amount: 0.4, nBase: 8, nPerAmount: 16, spread: 2.6, speedBase: 3, speedPerAmount: 7, life: 0.8, gravity: 7, size: 0.5, zSpread: 3 },
    smash: {
      n: 26, speed: 11, life: 1.1, gravity: 16, size: 0.55, jitter: 1.5, zSpread: 3,
      colors: { tires: ['#26262b', '#3a3a40', '#e8b830'], cactus: ['#4f8a4a', '#5c9a52', '#ff6b8a'], pillar: ['#c2703f', '#d08050', '#e9a466'] },
    },
    sparkle: { n: 26, colors: ['#ffd23f', '#ffffff', '#ff8a3d'], speed: 7, life: 0.9, gravity: 5, size: 0.35, jitter: 2 },
    shock: { n: 26, colors: ['#fff6a0', '#7fd4ff', '#ffffff'], speed: 11, life: 0.45, gravity: 0, size: 0.3, jitter: 1.2 },
    strike: { n: 22, colors: ['#ffffff', '#fff6a0', '#5a4a40'], dir: 1.5708, spread: 2.4, speed: 9, life: 0.7, gravity: 12, size: 0.45, jitter: 1 },
    confetti: { n: 40, dir: 1.5708, spread: 2.2, speed: 12, life: 1.4, gravity: 9, size: 0.35, jitter: 2, zSpread: 4 },
    boostFlame: { n: 2, colors: ['#fff17a', '#ffa22e', '#ff5a1f'], spread: 0.5, speed: 9, inherit: 0.7, life: 0.28, size: 0.5, jitter: 0.3, zSpread: 0.6, zSpeed: 0.5 },
    groundDust: { minSpeed: 8, chance: 0.4, dx: -1.4, dy: -0.9, n: 1, dir: 0.75, spread: 0.8, speed: 3, life: 0.6, gravity: 3, size: 0.45, zSpread: 2.2 },
    windDust: { minWind: 0.5, chancePerWind: 0.06, spreadX: 1.2, windMul: 3, vy: -0.5, life: 1.4, sizeBase: 0.18, sizePerWidth: 0.004, zSpread: 6 },
  },
};
