// Schleuderwerk 2 – Chassis (Garage). Reine Daten, Format ARCHITEKTUR.md 4.8, Vokabular 4.11.
// stats: Abweichungen von balance.BASE_STATS (add addiert, mul addiert sich, xmul multipliziert).
// starterTag: Der Run startet mit einem zufälligen 'base'-Item dieses Tags.
// ability: Spezialfähigkeit – immer zusätzlich ausgerüstet, belegt keinen Fähigkeits-Slot.
// Reihenfolge = Freischalt-Reihenfolge (Kerne aufsteigend, Summe 30).

export const CHASSIS = [
  {
    id: 'seifenkiste',
    name: 'Seifenkiste',
    icon: '🧼',
    desc: 'Opas alte Seifenkiste: kann nichts besonders gut, aber auch nichts schlecht. Der ehrliche Anfang.',
    flavor: 'Lenkseil, Sofakissen und eine Menge Gottvertrauen.',
    model: 'seifenkiste',
    unlock: { cores: 0 },
    stats: {},
    slots: { items: 0, abilities: 0 },
    rules: {},
    ruleSpec: {},
    triggers: [],
    starterTag: 'magnet',
    visual: { color: '#c8843a', accent: '#d94a3a' },
  },

  {
    id: 'einkaufswagen',
    name: 'Einkaufswagen',
    icon: '🛒',
    desc: 'Leicht und wendig (Luftsteuerung +25 %), aber nur 60 Haltbarkeit. Beim Schrotthändler alles 20 % billiger.',
    flavor: 'Der Pfandchip steckt noch im Schloss. Für Notfälle.',
    model: 'einkaufswagen',
    unlock: { research: 'r_chassis_einkaufswagen', cores: 2 },
    stats: {
      mass: { xmul: 0.75 },
      durabilityMax: { xmul: 0.6 },
      airControl: { mul: 0.25 },
      rollFriction: { mul: -0.1 },
      impactThreshold: { add: -1 },
      shopDiscount: { add: 0.2 },
    },
    slots: { items: 0, abilities: 0 },
    rules: {},
    ruleSpec: {},
    triggers: [],
    starterTag: 'gluck',
    visual: { color: '#b9c2c9', accent: '#e23b3b' },
  },

  {
    id: 'sofa',
    name: 'Sperrmüll-Sofa',
    icon: '🛋️',
    desc: 'Jede saubere oder perfekte Landung heilt 3. Weich gepolstert (Aufpralltoleranz +2), aber träge in der Luft.',
    flavor: 'Vom Sperrmüll gerettet. Riecht nach Opas Pfeife.',
    model: 'sofa',
    unlock: { research: 'r_chassis_sofa', cores: 3 },
    stats: {
      mass: { xmul: 1.2 },
      drag: { mul: 0.15 },
      airControl: { mul: -0.15 },
      impactThreshold: { add: 2 },
      bounce: { add: 0.05 },
      durabilityMax: { add: 10 },
    },
    slots: { items: 0, abilities: 0 },
    rules: { healOnCleanLanding: 3 },
    ruleSpec: {
      healOnCleanLanding:
        'Nach jeder Landung mit quality "clean" oder "perfect" heilt die Engine rules.healOnCleanLanding (3) Haltbarkeit über ctx.heal – unskaliert, nur bis durabilityMax, höchstens 1× pro 0,5 s. Die Heilung löst wie jede Heilung heal {amount} aus (Ketten möglich) und läuft vor den Item-Triggern des landing-Ereignisses. Bumpy und crash heilen nicht. Auswertung: items/triggerEngine.js beim landing-Ereignis der Chassis-Quelle.',
    },
    triggers: [],
    starterTag: 'gyro',
    visual: { color: '#7a5a8c', accent: '#e8c36a' },
  },

  {
    id: 'badewanne',
    name: 'Badewanne',
    icon: '🛁',
    desc: 'Ein Item-Platz weniger, dafür wirken alle Set-Boni doppelt. Schwer, aber standfest bei der Landung.',
    flavor: 'Der Stöpsel hängt noch an der Kette. Sicher ist sicher.',
    model: 'badewanne',
    unlock: { research: 'r_chassis_badewanne', cores: 3 },
    stats: {
      mass: { xmul: 1.2 },
      drag: { mul: 0.1 },
      durabilityMax: { add: 15 },
      landTolDeg: { add: 2 },
    },
    slots: { items: -1, abilities: 0 },
    rules: { setBonusDouble: true },
    ruleSpec: {
      setBonusDouble:
        'Alle aktiven Set-Boni (data/tags.js, Stufen 2/4/6) wirken doppelt: In stats und Effekt-Parametern der Set-Boni werden die skalierten Schlüssel (amount, pct, dur, radius, add, mul) ×2 gerechnet, ebenso max von stack-Effekten; chance.p ×2 (höchstens 0,95). n, at, Limits (cooldown/perStage/perRun) und xmul bleiben unverändert. Regeln von Set-Boni verdoppeln nur, wenn ihre eigene ruleSpec das beschreibt. Item-, Teile- und Chassis-Werte sind nicht betroffen. Auswertung: items/inventory.js beim Aufbau der Set-Quellen.',
    },
    triggers: [],
    starterTag: 'gummi',
    visual: { color: '#f2f0e8', accent: '#d9a441' },
  },

  {
    id: 'rasenmaeher',
    name: 'Aufsitz-Rasenmäher',
    icon: '🌿',
    desc: 'Startet träge (Antrieb −25 %), aber jede Bodenberührung bringt +3 % Antrieb – bis +60 % je Etappe.',
    flavor: 'Springt beim dritten Ziehen an. Meistens.',
    model: 'rasenmaeher',
    unlock: { research: 'r_chassis_rasenmaeher', cores: 3 },
    stats: {
      driveAccel: { mul: -0.25 },
      mass: { xmul: 1.1 },
      durabilityMax: { add: 10 },
      rollFriction: { mul: -0.05 },
    },
    slots: { items: 0, abilities: 0 },
    rules: { groundSpeedStacks: true },
    ruleSpec: {
      groundSpeedStacks:
        'Ergänzt den groundTouch-Trigger dieses Chassis (stack driveAccel mul +0,03, max +0,6): Bei einer Bruchlandung (landing.quality "crash") wird dieser Stapel halbiert (auf volle 0,03-Schritte abgerundet). Das HUD zeigt den Stapel als Drehzahl-Anzeige (0–100 % von max). Wie jeder stack verfällt er am Etappenende. Auswertung: items/triggerEngine.js in der stack-Verwaltung der Chassis-Quelle beim landing-Ereignis.',
    },
    triggers: [
      {
        on: 'groundTouch',
        limit: { cooldown: 0.4 },
        do: [{ fx: 'stack', stat: 'driveAccel', mul: 0.03, max: 0.6 }],
      },
    ],
    starterTag: 'hydraulik',
    visual: { color: '#3f9b45', accent: '#f2c230' },
  },

  {
    id: 'muelltonne',
    name: 'Mülltonne',
    icon: '🗑️',
    desc: 'Sammelt Schrott beim Fahren: Jedes Stück gibt Masse und Boost-Schub, alle 3 Stück heilt sie 3. Rammt gern.',
    flavor: 'Dienstags wird sie abgeholt. Heute nicht.',
    model: 'muelltonne',
    unlock: { research: 'r_chassis_muelltonne', cores: 4 },
    stats: {
      mass: { xmul: 1.1 },
      armor: { add: 0.05 },
      durabilityMax: { add: 10 },
    },
    slots: { items: 0, abilities: 0 },
    rules: { collectScrapMass: true },
    ruleSpec: {
      collectScrapMass:
        'Sammeltrieb der Tonne: (1) Gerammte Schrottberge verursachen nur ein Drittel des Schadens (15 → 5), das Resttempo nach dem Treffer liegt auf halbem Weg zwischen PHYSICS.hitSpeedKeep und 1, und nach dem collision-Ereignis wird zusätzlich pickup {kind:"scrap"} ausgelöst. (2) Die Streckengenerierung legt je Etappe 6 zusätzliche Schrott-Pickups in Bodennähe (bis 1,5 m über dem Boden). (3) Das Modell zeigt je gesammeltem Stück (max. 12) ein Schrottteil auf dem Deckel. Die Wirkung je Stück steht als Trigger im Chassis. Auswertung: stage/stage.js (Kollision, Pickup-Spawn).',
    },
    triggers: [
      {
        on: 'pickup',
        if: { kind: 'scrap' },
        limit: { perStage: 12 },
        do: [
          { fx: 'stack', stat: 'mass', mul: 0.025, max: 0.3 },
          { fx: 'stack', stat: 'boostThrust', mul: 0.03, max: 0.36 },
          { fx: 'charge', key: 'muelltonne_fuellstand', n: 1, at: 3, then: [{ fx: 'heal', amount: 3 }] },
        ],
      },
    ],
    starterTag: 'schrott',
    visual: { color: '#4a5d52', accent: '#9aa59e' },
  },

  {
    id: 'kuehlschrank',
    name: 'Kühlschrank',
    icon: '🧊',
    desc: 'Kann nicht überhitzen, und Eis-Items wirken 50 % stärker. Dafür schwer wie ein Kühlschrank. Logisch.',
    flavor: 'Das Licht geht wirklich aus, wenn die Tür zu ist.',
    model: 'kuehlschrank',
    unlock: { research: 'r_chassis_kuehlschrank', cores: 4 },
    stats: {
      mass: { xmul: 1.35 },
      durabilityMax: { add: 20 },
      armor: { add: 0.06 },
      coolRate: { mul: 0.2 },
      drag: { mul: 0.1 },
      airControl: { mul: -0.1 },
    },
    slots: { items: 0, abilities: 0 },
    rules: { noOverheat: true, tagBoost: { eis: 0.5 } },
    ruleSpec: {
      noOverheat:
        'Die Hitze wird bei heatMax gedeckelt und kann nie überhitzen: Das Ereignis overheat wird nie ausgelöst, es gibt keine 2-s-Sperre für Boost/Antrieb, keinen Überhitzungsschaden und keinen Abfall auf 50. Zusätzliche Hitze am Maximum verfällt. Bedingungen heatAbove/heatBelow funktionieren normal; Items und Sets, die auf overheat reagieren, lösen nie aus. Auswertung: physics/vehicle.js beim Erreichen von heatMax.',
      tagBoost:
        'Für Items mit einem Tag aus rules.tagBoost (hier eis: 0,5; Hybride mit eis eingeschlossen) werden alle skalierten Werte zusätzlich ×(1 + Wert) gerechnet: passive stats (add und mul, nicht xmul) und Effekt-Parameter amount, pct, dur, radius, add, mul – multiplikativ zum ★-Faktor. chance.p, Limits, n/at/max und Set-Boni bleiben unverändert. Mehrere Quellen für denselben Tag addieren ihre Werte (dieselbe Mechanik eignet sich für den Biom-Bonus Feuer/Elektro +25 %). Auswertung: items/inventory.js beim Aufbau der Item-Quellen.',
    },
    triggers: [],
    starterTag: 'eis',
    visual: { color: '#e9f1f4', accent: '#5fb7d9' },
  },

  {
    id: 'raketenschlitten',
    name: 'Raketenschlitten',
    icon: '🛷',
    desc: 'Luftsteuerung ×2 und schnittig. Am Boden kaum Haftung. Perfekter Abschuss zündet 0,8 s Gratis-Boost.',
    flavor: 'Opas Rodel plus zwei Silvesterraketen. Was soll schon passieren?',
    model: 'raketenschlitten',
    unlock: { research: 'r_chassis_raketenschlitten', cores: 5 },
    stats: {
      airControl: { xmul: 2 },
      mass: { xmul: 0.9 },
      drag: { mul: -0.1 },
      durabilityMax: { add: -10 },
      landTolDeg: { add: -3 },
    },
    slots: { items: 0, abilities: 0 },
    rules: { lowGrip: true },
    ruleSpec: {
      lowGrip:
        'Kufen statt Räder, nur im Boden-Zweig: rollFriction wird ×0,4 gerechnet; Oberflächen-Faktoren wirken halb (Schlamm ×2,5 statt ×4, Sand ×1,3 statt ×1,6); der Antrieb überträgt nur 60 % von driveAccel (Verbrauch und Hitze bleiben voll); Abheben über Kuppen gelingt schon ab PHYSICS.takeoffMinSpeed ×0,5; die Fähigkeit notbremse braucht doppelt so lange (0,5 s). Auswertung: physics/vehicle.js im Boden-Zweig.',
    },
    triggers: [{ on: 'perfectLaunch', do: [{ fx: 'boost', dur: 0.8 }] }],
    starterTag: 'rakete',
    visual: { color: '#c0392b', accent: '#f5f5f5' },
  },

  {
    id: 'waschmaschine',
    name: 'Waschmaschine',
    icon: '🫧',
    desc: 'Hitze ist Ressource: kein Überhitzungs-Stillstand, und der Schleudergang macht aus Hitze Schub. Bleischwer.',
    flavor: 'Kochwäsche, 95 Grad, Schleudern auf Stufe elf.',
    model: 'waschmaschine',
    unlock: { research: 'r_chassis_waschmaschine', cores: 6 },
    stats: {
      mass: { xmul: 1.3 },
      coolRate: { mul: -0.25 },
      durabilityMax: { add: 15 },
      armor: { add: 0.04 },
      airControl: { mul: -0.1 },
    },
    slots: { items: 0, abilities: 0 },
    rules: { heatIsResource: true },
    ruleSpec: {
      heatIsResource:
        'Erreicht die Hitze heatMax, wird sie dort gedeckelt: keine 2-s-Sperre für Boost/Antrieb, kein Überhitzungsschaden, kein Abfall auf 50; zusätzliche Hitze verfällt, Kühlung wirkt normal. Das Ereignis overheat wird beim Erreichen von heatMax ausgelöst und erst wieder, nachdem die Hitze einmal unter 80 % von heatMax gefallen ist. Gedacht für die Spezialfähigkeit schleudergang (Hitze → Schub). Auswertung: physics/vehicle.js beim Erreichen von heatMax.',
    },
    triggers: [{ on: 'overheat', limit: { cooldown: 4 }, do: [{ fx: 'jump', amount: 5 }] }],
    starterTag: 'feuer',
    ability: 'schleudergang',
    visual: { color: '#f4f6f7', accent: '#3a7bd5' },
  },
];
