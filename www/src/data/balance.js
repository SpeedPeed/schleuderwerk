// Zentrale Zahlen-Datei: ALLE globalen Spielwerte stehen hier und dürfen frei verändert werden.
// Inhaltsgebundene Werte (Chassis, Teile, Fähigkeiten, Welten) stehen bei ihrem Inhalt in data/*.js.
// Einheiten: Meter, Sekunden, Radiant – außer wo „Deg“/„Grad“ dabeisteht.
// Diese Datei importiert nichts und wird auch von node --test geladen.

export const SAVE_VERSION = 5;   // Paket C: v5 (Set-Stufen 2/3/5 im Kodex, Rezepte)
export const GAME_VERSION = '1.0.0';

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
// Paket A: Stufen gelten je SLOT (save.garage.slotLevels), nicht je Teil – ein Teilwechsel behält die Stufe.
// Wirkung einer Stufe = levelEffectMul × perLevel des ausgerüsteten Teils (abnehmender Ertrag, items/statMods.js →
// partDimLevels): eff(L) = levelEffectMul × L / (1 + L / dimDivisor) → Stufe 10 = 12 „alte“ Stufen (wie früher Stufe 20).
// Kosten der nächsten Stufe = slotUpgradeBase × costGrowth^L (60, 79, 105 … Summe bis 10 ≈ 2.800 ⚙ je Slot).
export const GARAGE = {
  costGrowth: 1.32,        // Preis der nächsten Stufe = slotUpgradeBase × costGrowth^Stufe
  maxPartLevel: 10,        // höchste Slot-Stufe (Name aus Schema v3: gilt jetzt je Slot)
  dimDivisor: 15,          // abnehmender Ertrag: L / (1 + L / dimDivisor)
  levelEffectMul: 2,       // doppelte Wirkung je Stufe (perLevel × 2) gegenüber den Stufen 0–20 bis v1.0
  slotUpgradeBase: 60,     // Preis der ersten Slot-Stufe (für jedes Teil gleich)
  starterUpgradeBase: 40,  // Schema v3: Basispreis der Teile-Stufen von Startteilen (nur noch für die Migration v3 → v4)
  v3CostGrowth: 1.15,      // Schema v3: Kostenwachstum der Teile-Stufen (Migration v3 → v4: bezahlten Schrott nachrechnen)
  v3MaxPartLevel: 20,      // Schema v3: höchste Teile-Stufe
  v3DimDivisor: 30,        // Schema v3: abnehmender Ertrag der Teile-Stufen
  chassisCoreMul: 0.4,     // Faktor auf die Kern-Preise der Chassis (data/chassis.js → unlock.cores; data/index.js → chassisUnlock,
                           // gerundet, mind. 1 → 1/1/1/1/2/2/2/2 💠). Phase 6: Simulator – alle Chassis nach ≈ 26 h (V2-DESIGN §8: ≈ 25 h)
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
  floorSizes: [[2, 0.1], [3, 0.6], [4, 0.3]],   // Knoten je Etage mit Gewicht (Paket D: mehr Breite, ≈ 18 Knoten je Akt)
  extraEdgeChance: 0.35,   // zusätzliche (kreuzungsfreie) Verbindung je Knotenpaar
  branchChance: 1,         // Paket D: Knoten mit nur einem Nachfolger bekommt mit dieser Chance einen zweiten (kreuzungsfrei)
  siblingSameMul: 0.12,   // Paket D: Gewicht einer Knotenart, die ein Geschwister-Knoten (gleicher Vorgänger) schon hat
  autoAdvanceDelay: 0.6,   // Paket A: nur ein Nachfolger → die Karte fährt nach so vielen Sekunden selbst weiter
};

// ---------- Paket D: Etappen-Arten (stage/goals.js, map/mapGen.js) ----------
// perTarget: Bronze-Marke = perTarget × Weiten-Zielmarke (m) der Etappe; gold: Gold = Bronze × gold; round: Rundung.
// Eingemessen mit dem Bot (tools/playtest/goals.mjs): gleiche Bronze-Quote wie ein Weitflug derselben Etappe.
// weights: Anteil der Arten auf normalen Etappen (Etage 0 immer Weitflug, Boss immer Weitflug);
// eliteWeights: Elite-Etappen.
export const GOALS = {
  height: { perTarget: 0.04, gold: 1.35, round: 1 },      // Akt 1 ≈ 18–25 m, Akt 3 ≈ 40–55 m Flughöhe
  stunt: { perTarget: 1.45, gold: 2.5, round: 10 },       // Bot-Messung: Gold ×3,15 bei gleicher Quote – etwas leichter
  collect: { perTarget: 0.043, gold: 1.5, round: 1 },     // ≈ 20–45 Pickups
  sprint: { perTarget: 0.21, gold: 1.2, round: 5, timeLimit: 8 },   // Weite nach 8 s Flug
  delivery: { crashCaps: { bronze: 3, silver: 2, gold: 1 } },
  weights: { distance: 2, height: 1.2, stunt: 1, collect: 1.2, sprint: 1, delivery: 1 },
  eliteWeights: { distance: 2, height: 1, stunt: 1, collect: 1, sprint: 1, delivery: 1 },
};

// ---------- Run (run/runState.js) ----------
export const RUN = {
  acts: 3,
  towPenalty: 0.15,        // Neuversuch („Nochmal“ nach verfehlter Etappe, Boss-Neuversuch): 15 % der max. Haltbarkeit
  version: 1,              // Format von save.run (älteres/fremdes Format wird verworfen)
  // Paket A: Verfehlte Etappe/Elite = „Notlandung“ – weiter auf der Karte statt dieselbe Strecke nochmal
  emergency: {
    penalty: 0.1,          // −10 % der max. Haltbarkeit
    crateBolts: { 1: 10, 2: 14, 3: 18 }, // Trostkiste: Schrauben je Akt (× Schrottstufe boltMul)
    boltMul: 0.5,          // Teil-Belohnung: Schrauben der Etappe × 0,5 (Schrott über REWARDS.gradeMul.miss)
  },
  // Boss verfehlt: Neuversuch mit neu gewürfelter Boss-Variante (neuer Strecken-Seed) und Ziel −5 % je Neuversuch
  bossRetry: { targetCut: 0.05, maxCuts: 3 }, // „Der Boss ist auch müde“ – höchstens 3 × 5 % = −15 %
};

// ---------- Schrottstufen (data/ascension.js: Regeln je Stufe; hier nur die Parameter der Sonderregeln) ----------
export const ASCENSION_RULES = {
  eliteHazardExtra: 1,     // eliteHazards: Elite-Etappen bekommen so viele zusätzliche Bausteine …
  eliteDangerMul: 2,       // … gefährliche Bausteine (Pressen, Schrottberge, Schluchten …) werden so viel häufiger gewürfelt …
  eliteGust: 4,            // … und das Wetter bekommt so viele m/s Böen dazu
};

// ---------- Fortschritt (garage/progression.js, Simulator tools/sim/progression.mjs) ----------
export const PROGRESSION = {
  // Zielzeiten laut V2-DESIGN §8 in Stunden Spielzeit [von, bis] – Anzeige im Dev-Menü, Prüfung im Simulator
  targets: {
    firstRun: [8 / 60, 15 / 60],    // erster Run beendet (meist in Akt 1–2; Paket A: schnellere Etappen → ab 8 min)
    firstBossAct1: [0.5, 1],        // erster Akt-1-Boss besiegt (Paket A: ≤ 45 min statt 1–2 h)
    firstWin: [2.5, 5],             // erster Run-Sieg (Paket A: 3–5 h statt 6–10 h; Paket C/D: 2,5–5 h – starke Builds dürfen früher gewinnen)
    allChassis: [15, 25],           // alle Chassis (Paket A: mehr Siege → mehr Kerne; OVERHAUL §6 zielt mit Paket E auf 15–20 h)
    ascension15: [30, 50],          // alles inkl. Schrottstufe 15
  },
  historySize: 10,         // Garage → Statistik: so viele letzte Runs
};

// ---------- Run-Belohnungen (run/rewards.js) ----------
// Schrauben (Run-Währung) je geschaffter Etappe: Grundwert je Akt × Medaillen-Faktor × Knoten-Faktor.
// Paket A „Jeder Versuch zahlt“: Meta-Schrott je Etappe (auch verfehlt) = scrapPerM[Akt] × Weite × gradeMul[Wertung]
// × scrapKindMul[Knotenart] (+ Schrott-Pickups, + Kombo). Er wird SOFORT gutgeschrieben (run/runState.js → settleRun),
// das Run-Ende zeigt nur die Summe (+ Schrauben-Rest).
export const REWARDS = {
  bolts: { 1: 18, 2: 26, 3: 36 },
  scrapPerM: { 1: 0.12, 2: 0.16, 3: 0.22 },
  // Wertung: verfehlt · Bronze · Silber · Gold · Platin (Gold × 1,5) · Schrottkönig (Gold × 2 = Ende 'far')
  gradeMul: { miss: 0.5, bronze: 1, silver: 1.25, gold: 1.5, platin: 2, king: 3 },
  gradeMarks: { platin: 1.5, king: 2 },   // Platin/Schrottkönig-Marke = Gold-Marke × …
  scrapKindMul: { stage: 1, elite: 1, boss: 1 },   // Knotenart-Faktor auf den Weiten-Schrott (Elite/Boss zahlen über Ziel & Bonus)
  medalMul: { bronze: 1, silver: 1.4, gold: 1.8 },   // Schrauben
  kindMul: { stage: 1, elite: 1.6, boss: 3 },        // Schrauben
  bossGoldBonus: 0.5,      // Boss: Gold gibt +50 % Schrauben obendrauf (Boss kennt nur Bronze und Gold)
  // Blaupausen: Elite geschafft 2, Boss besiegt 3/4/5 – jede verlorene Boss-Begegnung 1 (Neuversuche derselben
  // Begegnung nicht), Gold oder besser 25 % Chance auf 1
  blueprints: { elite: 2, boss: { 1: 3, 2: 4, 3: 5 }, bossLost: 1, goldChance: 0.25 },
  firstBossCores: { 2: 1, 3: 1 }, // erster Boss-Sieg in Akt 2/3: Kerne
  winCores: 1,             // Run gewonnen: Kern(e)
  boltsToScrap: 0.1,       // übrige Schrauben → 10 % als Schrott am Run-Ende (V2-DESIGN §6: Senke der Run-Währung)
  actScrap: { 1: 40, 2: 80, 3: 140 }, // Akt abgeschlossen: Bonus-Schrott
  itemSkipBolts: { 1: 8, 2: 12, 3: 16 }, // Item-Auswahl „Überspringen“ (oder voller Rucksack abgelehnt): Schrauben je Akt
};

// ---------- Phase 5: Knoten der Karte (shops/*.js) – alle Preise und Beträge ----------
// Preise in Schrauben (🔩, Run-Währung). Akt-Faktor gilt für Items, Fähigkeiten, Fluch-Entfernen und Zerlegen.
// data/nodes.js → params beschreibt dieselben Grundwerte für die Anzeige; maßgeblich sind die Werte hier
// (tests/shops.test.mjs prüft, dass beide übereinstimmen).
export const SHOP = {
  items: 5,                // 🛒 Schrotthändler: so viele Items im Angebot …
  abilities: 1,            // … und so viele Fähigkeiten (ersetzt einen Fähigkeits-Slot für den Run)
  price: { common: 30, rare: 50, epic: 80, legendary: 130, cursed: 40 }, // Grundpreis je Seltenheit
  actMul: { 1: 1, 2: 1.3, 3: 1.6 },   // × Akt-Faktor
  abilityPrice: 45,        // Grundpreis einer Fähigkeit (× Akt-Faktor)
  rarityWeights: {         // Seltenheit der Angebote je Akt
    1: { common: 0.55, rare: 0.33, epic: 0.1, legendary: 0.02 },
    2: { common: 0.4, rare: 0.38, epic: 0.18, legendary: 0.04 },
    3: { common: 0.28, rare: 0.38, epic: 0.27, legendary: 0.07 },
  },
  ownedWeight: 0.6,        // besessene Items erscheinen mit diesem Gewicht (Doppelte für die Werkbank-Fusion ★+1)
  rerollBase: 10,          // Neu würfeln: 10 + 10 je bisherigem Reroll (× (1 − Stat rerollDiscount))
  rerollStep: 10,
  reserveSlots: 1,         // Reservieren-Plätze (+ Forschung r_perk_reserve_slot); Item wartet beim nächsten Händler im Run
  // Rabatt: Preis × (1 − Stat shopDiscount) – Einkaufswagen +0,2, Items (Rabattmarkenheft); Stat-Grenze SOFTCAPS.shopDiscount
};

export const WORKBENCH = {
  fusionsPerVisit: 1,      // 🔧 je Besuch eine Fusion (★+1 oder Hybrid); Zerlegen unbegrenzt
  hybridMul: 0.75,         // Hybrid: beide Effekte × 0,75 (items/inventory.js → hybridMul)
  scrapPct: 0.4,           // Zerlegen: 40 % des Händlerpreises (× ★-Stufe, Hybrid: Summe beider Teile) als Schrauben
};

export const BLACKMARKET = {
  items: 3,                // 🕳 3 verfluchte Items (Fluch-Pool: data/index.js → cursedItemPool)
  payDurabilityPct: 0.15,  // Bezahlen mit −15 % max. Haltbarkeit (für den Run) …
  payFuelMax: 15,          // … oder −15 max. Treibstoff (für den Run) …
  payCores: 1,             // … oder 1 Kern (💠 aus dem Spielstand)
  minDurabilityLeft: 20,   // Haltbarkeit als Preis nur, solange danach mind. 20 max. Haltbarkeit bleiben …
  minFuelLeft: 40,         // … bzw. mind. 40 max. Treibstoff
  removeCurseBolts: 45,    // Fluch entfernen (Item behält seine Stärken) – × Akt-Faktor
};

export const STATION = {
  repairPct: 0.35,         // ⛽ Reparieren: +35 % der max. Haltbarkeit × (1 + Stat repairBonus)
  fuelMaxAdd: 15,          // Volltanken: +15 max. Treibstoff für den Run
  coolMul: 0.2,            // Kühlerspülung: +20 % Kühlung für den Run
};

export const EVENTS = {
  itemContext: 'stage',    // ❓ Effekt item ohne rarity: Seltenheit wie bei der Item-Auswahl nach einer Etappe
  minDurability: 1,        // Ereignis-Schaden (hpPct < 0) beendet nie den Run: höchstens bis auf 1 Haltbarkeit
  minFuelLeft: 30,         // Kosten maxFuel: Option nur wählbar, solange danach mind. 30 max. Treibstoff bleiben
  cursePushesOut: true,    // { curse: true } bei vollem Rucksack: der Fluch verdrängt ein zufälliges nicht verfluchtes Item
};

export const TREASURE = {
  suspiciousChance: 0.3,   // 💰 30 % „verdächtig“ (Hinweis sichtbar) mit Haken
  context: 'crate',        // Seltenheit des Gratis-Items (wie Item-Kiste) …
  suspiciousContext: 'elite', // … verdächtige Haufen sind besser bestückt (mind. Selten) – das Risiko lohnt sich
  hooks: {                 // Haken (Gewicht + Wert)
    damage: { weight: 1, pct: 0.1 },        // 10 % der max. Haltbarkeit Schaden (nie unter 1)
    curse: { weight: 1 },                   // ein verfluchtes Item dazu (Fluch-Pool)
    bolts: { weight: 1, pct: 0.5, min: 10 }, // die Hälfte der Schrauben weg (mind. 10, höchstens alle)
  },
};

// Erfinder-Labor (garage/research.js): Kosten stehen je Knoten in data/research.js (Blaupausen 📘).
export const RESEARCH = {
  costMul: 1.5,            // globaler Faktor auf alle Forschungskosten (gerundet). Paket A: 1 → 1,5 – es gibt viel mehr
                           // Blaupausen (Gold-Chance, jede Boss-Begegnung, Elite 2); ohne den Faktor wäre der Baum nach
                           // ≈ 10 h fertig und die Schrottstufen-Kurve (30–50 h) bräche ein (Simulator)
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
  effectJumpCancelFall: 0, // Sprung-Impuls aus Item-Effekten (jump, explosion) in der Luft: so viel der Fallgeschwindigkeit wird
                           // aufgehoben (0 = reiner Impuls; die Fähigkeit Hüpfer hebt das Fallen ganz auf). Phase 4: mit 1
                           // ließ sich per Salto-Sprung (Jo-Jo) + Explosionen endlos schweben (Bot: ×16 der Zielweite)
  chainPopupDepth: 2,      // HUD: ab dieser Kettentiefe „KETTENREAKTION ×n!“ (n = Kettenglieder = Tiefe + 1; Paket C: ab 3 Gliedern,
                           // gleich SYNERGY.chain.minLinks – jede gezählte Kette ist sichtbar)
  chainPopupGap: 0.8,      // … höchstens alle 0,8 s (außer die Kette wird länger)
  feedSize: 3,             // HUD: so viele letzte Auslösungen in der Feed-Zeile
  feedTime: 2.5,           // … so lange (s) bleibt eine Zeile stehen
  // Item-Auswahl nach einer Etappe (run/runState.js → rollItemChoices). Gewichte je Seltenheit und Kontext;
  // verfluchte Items kommen nie in eine Auswahl (Schwarzmarkt, Ereignis-Flüche, Schatz-Haken: data/index.js → cursedItemPool). Fehlen Items einer Seltenheit im
  // Pool, wird über die übrigen Seltenheiten des Kontexts verteilt; ist der Kontext leer, über alle nicht verfluchten.
  rarityWeights: {
    stage: { common: 0.62, rare: 0.29, epic: 0.08, legendary: 0.01 },
    elite: { rare: 0.66, epic: 0.29, legendary: 0.05 },   // Elite: mindestens Selten (data/nodes.js elite.params.minRarity)
    boss: { epic: 0.72, legendary: 0.28 },                 // Boss: Episch/Legendär
    crate: { common: 0.5, rare: 0.36, epic: 0.12, legendary: 0.02 }, // 📦 Item-Kiste aus der Strecke
  },
  // Pro Akt werden die selteneren Stufen häufiger (Faktor auf das Gewicht; Akt 1 = 1)
  rarityActMul: { 2: { rare: 1.25, epic: 1.5, legendary: 1.5 }, 3: { rare: 1.5, epic: 2, legendary: 2 } },
  ownedWeight: 0.35,       // Paket C: besessene Items erscheinen in der Auswahl mit diesem Gewicht – Nehmen macht das vorhandene
                           // Item ★+1 statt einen Platz zu belegen (run/runState.js → pickItem; ★3 erscheint nicht mehr)
  devAllPools: false,      // Dev-Menü: alle Items im Pool (unabhängig von der Forschung)
  // Paket C: garantierte Seltenheiten je Kontext (run/rewards.js → rollItemChoices): Boss-Beute hat immer mind. 1 Legendär
  guarantee: { boss: { legendary: 1 } },
};

// ---------- Paket C: Synergien (items/inventory.js, run/rewards.js, stage/stage.js) ----------
export const SYNERGY = {
  // Tag-Stärke (Brotato-Prinzip): jedes Item eines Tags (Items + Garage-Teile mit Tag, Hybride für beide Tags) gibt
  // +perItem auf ALLE Effekte dieses Tags – passive Werte (add/mul) und skalierte Effekt-Parameter der Items, Set-Boni
  // und Rezepte dieses Tags. Zwei-Tag-Items nehmen den stärkeren Tag. Höchstens maxItems Items zählen.
  // onSets: Anteil der Tag-Stärke, der auch auf die Set-Boni wirkt (0 = nur Items und Rezepte; mit 1 verstärkten sich
  // Set 3 und Tag-Stärke gegenseitig so stark, dass Magnet/Schrott/Hydraulik schon mit 3 Items die Kappung erreichten).
  tagStrength: { perItem: 0.1, maxItems: 8, onSets: 0 },
  // Tag-Bias in Angeboten (Item-Auswahl, Schrotthändler): Gewicht eines Items × min(max, 1 + perItem × n) mit n = Anzahl
  // Items seines stärksten Tags im Rucksack; Bauplan-Tag (Run-Start) zusätzlich × blueprintMul. Sobald der Rucksack einen
  // Tag hat, ist mindestens `guarantee` Angebot einer Auswahl ein Item der `topTags` stärksten Tags (falls im Pool).
  bias: { perItem: 0.6, max: 3.5, blueprintMul: 1.5, guarantee: 1, topTags: 2 },
  // Bauplan-Start (run/runState.js → newRun): 1 aus `options` Bauplänen; je Bauplan das Episch-„Motor“-Item eines Tags
  // aus dem Grundpool. Der Lieblings-Tag des Chassis (starterTag) ist immer dabei.
  blueprint: { options: 3, rarity: 'epic' },
  // Ketten (stage/stage.js → chainStep): Eine Kette = zusammenhängende Ereignisse aus Effekten (Kettentiefe). Ab minLinks
  // Gliedern zählt sie (HUD-Zähler „KETTE ×n“, Ereignis chain {links} für Items). Folgen Abarbeitungen mit Tiefe ≥ 1
  // innerhalb von joinTime s aufeinander, gehören sie zur selben Kette (Gratis-Boost meldet sich einen Schritt später).
  // Belohnung je Kette: Schrauben = round(boltsPerLink² × Glieder²) − bereits gezahlt (wächst die Kette, wird
  // nachgezahlt), höchstens maxBoltsPerStage je Etappe; dazu Kombo: komboPts × Glieder Trickpunkte und
  // +komboMult × (Glieder − minLinks + 1) auf den Kombo-Multiplikator.
  chain: { minLinks: 3, joinTime: 0.3, boltsPerLink: 0.75, maxBoltsPerStage: 45, komboPts: 12, komboMult: 0.15 },
};

// ---------- Regel-Schalter (Parameter; Auswertungsstellen siehe ARCHITEKTUR.md Anhang A) ----------
export const RULES = {
  lowGrip: { driveMul: 0.5, frictionMul: 0.5, takeoffMul: 0.5 },     // Raketenschlitten (Kufen)
  parachute: { approach: 25, dragMul: 3 },                           // Fallschirm: Sinktempo-Führung m/s², Luftwiderstand ×3
  hardStop: { time: 0.25, lowGripTime: 0.5, drivePause: 0.5, armTime: 3 }, // Notbremse
  heatToThrust: { min: 1, explodeAt: 70 },                           // Schleudergang
  collectScrapMass: { damageMul: 1 / 3, pickups: 6, minAlt: 0.6, maxAlt: 1.5, pickupEvery: [40, 90], maxPieces: 12 }, // Mülltonne
  // ---- Phase 4: Regeln aus Chassis, Items und Set-Boni (Texte: ruleSpec beim Inhalt; „…Double“ = mit setBonusDouble) ----
  healOnCleanLanding: { interval: 0.5, maxPerStage: 15 },             // Sofa: Heilung je Landung (Menge = Regelwert)
  groundSpeedStacks: { crashMul: 0.5 },                              // Rasenmäher: Bruchlandung halbiert den Drehzahl-Stapel
  everyThirdTierUp: { every: 3, beyondMax: 3.0 },                    // Dreiblatt-Klee: jede 3. Auslösung eine ★ höher (★3 → 3,0)
  luckyEcho: { p: 0.3, pMax: 0.6, pDouble: 0.45, pMaxDouble: 0.8, cooldown: 1 },   // Paket C: 0,15/0,5 → 0,3/0,6 // Glück-Set 6: Echo-Chance (+ Glück × luckPerPoint)
  shockRecharge: { cooldown: 3 },                                    // Teslaspule: Stromschlag-Abklingzeiten zurücksetzen, max. 1× je 3 s
  spinToSpeed: { perFlip: 4, perFlipDouble: 8, cleanMul: 0.5, maxFlips: 5 }, // Gyro-Set 6: Schub je Salto bei der Landung
  shockArc: { range: 8, rangeDouble: 12, cooldown: 0.5 },            // Elektro-Set 6: Lichtbogen
  overheatAfterburner: { cooldown: 5, dur: 2.5, thrustMul: 1.8 },    // Feuer-Set 6: Nachbrenner statt Überhitzung (Phase 6: 8 s/2 s/×1,5 → 5/2,5/×1,8)
  coldGlide: { heatBelow: 40, frictionMul: 0.25 },                   // Eis-Set 6: Rollreibung × 0,25 unter 40 Hitze
  impactToThrust: { perPoint: 0.8, max: 12, crashMul: 0.5, perPointDouble: 1.6, maxDouble: 24, crashMulDouble: 0.25 }, // Hydraulik-Set 6
  gapTrampoline: { perStage: 1, perStageDouble: 2, angleDeg: 30, minVy: 16, minVx: 12, beyond: 3 }, // Gummi-Set 6
  heatIsFuel: { heatPerFuel: 1, drive: false },                      // Perpetuum Mobile: 1 Treibstoff = 1 Hitze; drive: auch der Antrieb
                                                                     // (Phase 6 aus – sonst fuhr die Kiste endlos bis Gold × 2, Bot: jede Etappe ×3)
  perfectLaunchLowGrav: { gravityMul: 0.65, maxTime: 5 },            // Levitron
  iceLanding: { heatBelow: 50, maxGain: 15 },                        // Schlittschuhkufen
  obstacleBounce: { vy: 7, vx: 4, rehit: 1 },                        // Hüpfburg
  doubleDamage: { mul: 2 },                                          // Hubstützen
  boltsAreFuel: { fuelPerBolt: 1 },                                  // Schraubenvergaser: 1 Schraube je angefangene 1 Treibstoff (Phase 6: 4 → 1)
  boltHoardThrust: { per: 10, mul: 0.01, max: 0.15 },                // Schraubenvergaser: boostThrust +1 % je 10 Schrauben (Paket C: 5/0,3 → 10/0,15)
  obstacleMagnet: { range: 6, accel: 7 },                            // Geisterbahn-Magnet (Fluch)
  mutualAttraction: { rangeMul: 3, accel: 8, accelDouble: 16 },      // Magnet-Set 6
  wreckingBall: { minSpeed: 16, minSpeedDouble: 12, speedKeep: 0.85, scrap: 2, scrapDouble: 4 }, // Schrott-Set 6
  boostOvercap: { capMul: 1.3, capMulDouble: 1.6 },                  // Raketen-Set 6 (Phase 6: 1,4/1,8 → 1,3/1,6 – Ausreißer nach oben)
  // ---- Paket C: neue Regeln (Legendäre) ----
  crashBounce: { speedKeep: 0.7 },                                   // Gummibärchen-Reifen: Bruchlandung → Abpraller, 70 % Tempo
  lowGravHigh: { above: 30, gravityMul: 0.6 },                       // Gravitations-Gartenzwerg: über 30 m Höhe Schwerkraft × 0,6
  airDrive: { accelMul: 0.6, fuelMul: 1, heatMul: 3 },               // Zweitakt-Herz: Antrieb in der Luft (60 % Kraft, 3× Hitze)
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
  farMul: 2,               // Phase 4: Etappe endet (Grund 'far'), sobald die Gold-Marke × farMul erreicht ist – Item-Kreisläufe
                           // (z. B. Gyro-Set 6: Salto → Landung → Schub → Sprung …) liefen sonst bis maxTime
  stopSpeed: 2,            // darunter gilt das Auto als gestoppt …
  stopTime: 0.6,           // … nach so vielen Sekunden
  wreckDelay: 0.8,
  fallDelay: 0.7,          // Schluchtsturz: so lange fällt die Kiste noch sichtbar, dann Ende 'fall'
  boltStreakTime: 1,
  ringSpeed: 6,            // Tempo-Schub eines Boost-Rings (unterliegt der weichen Grenze)
  ringFuelRefill: 0.25,    // Anteil des maximalen Treibstoffs
  milestoneEvery: 100,     // Ereignis milestone alle 100 m
  bossWarnLead: 45,        // Boss-Strecken: Warnhinweis (data/biomes.js → bosses[].warnings) so viele m vor jedem Baustein
  // Paket A: Vorspulen & Hochrechnung. Ist die Kiste ≥ minGroundTime s am Boden und wird kein Boost gehalten, läuft die
  // Etappe mit ×scale (gleiche Physik-Schritte, nur mehr pro Bild). Tippen/Leertaste beim Vorspulen (oder am Boden
  // langsamer als maxSpeedForFinish) = Sofort-Ende: der Rest wird ohne Darstellung gerechnet (Ergebnis identisch).
  // Ohne Treibstoff und ohne Bronze rechnet eine Schatten-Etappe (Wiederholung aller Eingaben) das Ende hoch: bleibt
  // Bronze unerreichbar → „Knapp: NN %“ und Ende nach knappDelay s.
  // Steht das Ergebnis auch mit Bronze fest (Tank leer, Hochrechnung: kein Sprung mehr mit ≥ minAir s Flugzeit),
  // endet die Etappe nach settleDelay mit „Hochgerechnet: NN m“ (nur noch Ausrollen – nichts mehr zu steuern).
  fastForward: { minGroundTime: 0.8, scale: 4, maxSpeedForFinish: 6, knappDelay: 1, settleDelay: 0.4, minAir: 0.3, finishFrame: 0.05, maxSteps: 60000 },
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
  tutorialRuns: 3,         // Balance-Simulator: so viele Runs lang kostet jede Etappe Zeit für Hinweise (Tutorial: TUTORIAL)
  backExitConfirm: true,   // Zurück-Taste in der Garage: erst fragen „Spiel beenden?“
};

// ---------- Darstellung ----------
export const RENDER = {
  maxPixelRatio: 1.5,      // Standard (Grafikqualität „Mittel“)
  // Grafikqualität (Einstellungen): höchstens so viele Bildpunkte je CSS-Pixel (nie mehr als das Gerät hat)
  pixelRatio: { low: 1, mid: 1.5, high: 2 },
  defaultQuality: 'mid',
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
  boltsPer: 15,            // Paket A: gesicherte Trickpunkte zählen im Run – 1 🔩 je 15 Punkte …
  scrapPer: 40,            // … und 1 ⚙ je 40 Punkte (run/rewards.js → stageRewards)
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
  resultDelay: 0.5,        // Sekunden bis zur Auswertung (Paket A: 0,7 → 0,5; nach Sofort-Ende nur 15 % davon)
  resultCount: { base: 500, perScrap: 4, max: 1400 }, // Hochzählen der Belohnung: Dauer in ms
  garageWheelSpin: 2,      // Raddrehung in der Garage (rad/s)
  idleSpinnerMul: 0.3,     // Propeller/Turbinen drehen ohne Antrieb mit diesem Anteil weiter (Garage, Zeitlupe)
  idleBob: { amp: 0.05, freq: 2 },
  flag: { minDist: 20, z: -2.4 },
  trajectory: { max: 24, size: 0.22, opacity: 0.85, shrinkPad: 4 },
  rain: { drops: 260, color: '#c9d8f0', opacity: 0.45, speed: 38, windMul: 1.4, depth: 30, minLen: 0.8, maxLen: 3, lenPerHeight: 0.025 },
  // Blitz-Aufleuchten (Gewittersteppe): zufällig im Hintergrund alle every [min, max] s, bei Einschlägen stärker
  flash: { every: [4, 11], ambient: 0.55, strike: 1, decay: 5, hemiMul: 2.2 },
  medalFlags: { z: -2.4, colors: { bronze: '#cd7f32', silver: '#c9d1da', gold: '#ffd23f', platin: '#e8f0f5', king: '#ff5a1f' } },
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
    // Phase 7: Landungen (perfekt = goldener Ring + Sterne, sauber = kleine helle Wolke)
    landPerfect: { n: 24, colors: ['#ffd23f', '#fff6c0', '#ffffff'], dir: 1.5708, spread: 3.1, speed: 9, life: 0.7, gravity: 6, size: 0.32, jitter: 0.6, zSpread: 2 },
    landClean: { n: 10, colors: ['#ffffff', '#e8eef5'], dir: 1.5708, spread: 2.8, speed: 4, life: 0.5, gravity: 4, size: 0.4, zSpread: 2 },
    // Item ausgelöst: Funken in der Tag-Farbe (Farbe kommt aus data/tags.js), je Kettentiefe + nPerDepth
    tagBurst: { n: 6, nPerDepth: 3, nMax: 18, speed: 5, speedPerDepth: 1.2, life: 0.5, gravity: 2, size: 0.28, jitter: 0.8, zSpread: 1.5 },
    // Kettenreaktion: Ring aus Funken, wächst mit der Kettenlänge
    chain: { nBase: 10, nPerLink: 4, nMax: 48, speedBase: 6, speedPerLink: 1.5, life: 0.7, gravity: 0, size: 0.35, jitter: 0.5, zSpread: 2.5,
      colors: ['#ff9d2f', '#ffd23f', '#ffffff', '#ff5a1f'] },
    // Überhitzung: Dampfstoß
    overheat: { n: 22, colors: ['#ffffff', '#e6eef5', '#ffb0a0'], dir: 1.5708, spread: 2.4, speed: 7, life: 1.1, gravity: -3, size: 0.55, zSpread: 1.5 },
    // Run-Sieg: großes Konfetti am Fahrzeug
    victory: { n: 80, colors: ['#ffd23f', '#ff5a5a', '#33e6ff', '#5fe08a', '#ff8a3d', '#ffffff'], dir: 1.5708, spread: 2.4, speed: 16, life: 2, gravity: 8, size: 0.4, jitter: 2, zSpread: 5 },
  },
  // Phase 7: Bildschirm-Aufblitzen (DOM, ui/fxOverlay.js): Farbe und Stärke 0…1 je Anlass
  screenFlash: {
    perfectLanding: { color: '#ffe680', a: 0.22 },
    medal: { color: '#ffd23f', a: 0.25 },
    shock: { color: '#9fdcff', a: 0.4 },
    explosion: { color: '#ffb060', a: 0.35 },
    crash: { color: '#ff4040', a: 0.25 },
    chain: { color: '#ff9d2f', a: 0.12, perLink: 0.03, max: 0.35 },
    boss: { color: '#c0392b', a: 0.35 },
  },
  tagBurstGap: 0.08,       // Item-Funken derselben Quelle höchstens alle so viele Sekunden (gegen Partikel-Flut bei Ketten)
  confettiPieces: 36,      // DOM-Konfetti beim Run-Sieg (einmal angelegt, wiederverwendet)
  confettiTime: 3.2,       // Sekunden
  bossBanner: 2.2,         // „BOSS“-Einblendung zu Beginn einer Boss-Strecke (s)
};

// ---------- Ton (audio/sfx.js) – Platzhalter-Klänge per Web Audio ----------
export const AUDIO = {
  master: 0.7,             // Gesamtlautstärke (die Regler in den Einstellungen wirken darunter)
  defaultSfx: 0.8,         // Standard-Lautstärke Effekte (0…1)
  defaultMusic: 0.6,       // Standard-Lautstärke Musik (0…1)
  tagGap: 0.06,            // gleicher Tag-Klang höchstens alle so viele Sekunden
  chainBaseHz: 330,        // Kettenreaktion: Grundton …
  chainStepSemi: 2,        // … steigt je Kettenglied um so viele Halbtöne
  chainMaxSemi: 24,
  music: { lookahead: 0.25, bpmDefault: 132, bassVol: 0.05, leadVol: 0.035, drumVol: 0.12, fade: 0.6 },
};

// ---------- Tutorial (ui/tutorial.js) ----------
export const TUTORIAL = {
  showDelay: 0.35,         // Sekunden, bis ein ausgelöster Hinweis erscheint (Bildschirm baut sich erst auf)
  toastTime: 7,            // Hinweise während der Etappe verschwinden nach so vielen Sekunden von selbst
  // Paket A: Etappen-Hinweise (Sprechblasen) nur beim Zielen oder in einer Zeitlupe – nie im Flug über dem HUD
};
