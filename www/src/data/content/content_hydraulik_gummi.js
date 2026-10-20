// Schleuderwerk 2 – Inhalte für die Tags Hydraulik und Gummi (reine Daten, siehe ARCHITEKTUR.md 4.6/4.7/4.11)
// Ketten: harte Landung → Abpraller/Stromschlag/Explosion → Gratis-Boost; Schild → Abpraller → Schwung; Explosion → Federung (Trabi).
// stack.max ist eine Wertobergrenze (|Summe| ≤ max, wird nicht mit ★ skaliert).

export const TAGS = {
  hydraulik: {
    name: 'Hydraulik',
    icon: '💧',
    color: '#2fb3a3',
    desc: 'Federn statt fluchen: Harte Landungen werden abgefedert und zu Sprüngen, Treibstoff und Stoßwellen.',
    sets: {
      2: {
        desc: 'Panzerung +8 %, Landetoleranz +3°. Harte Landung (ab 8 m/s): Sprung 4 m/s (alle 3 s).',
        stats: { armor: { add: 0.08 }, landTolDeg: { add: 3 } },
        triggers: [
          { on: 'landing', if: { minImpact: 8 }, limit: { cooldown: 3 }, do: [{ fx: 'jump', amount: 4 }] },
        ],
      },
      3: {
        desc: 'Landung ab 9 m/s: Stoßwelle (Explosion 4 m/s, alle 4 s), die pumpt 0,3 s Gratis-Boost. Schaden: 3 s Panzerung +25 %.',
        triggers: [
          { on: 'landing', if: { minImpact: 9 }, limit: { cooldown: 4 }, do: [{ fx: 'explosion', amount: 4 }] },
          { on: 'explosion', limit: { cooldown: 4 }, do: [{ fx: 'boost', dur: 0.3 }] },
          { on: 'damage', limit: { cooldown: 3 }, do: [{ fx: 'buff', stat: 'armor', add: 0.25, dur: 3 }] },
        ],
      },
      5: {
        desc: 'Landungen schaden nicht – die Wucht wird Vorwärtsschub. Bruchlandungen: halber Schaden. Ab 12 m/s Aufprall: Explosion.',
        rules: { impactToThrust: true },
        ruleSpec: {
          impactToThrust:
            'Bei jeder Landung mit quality "perfect", "clean" oder "bumpy" wird der Aufprallschaden (aus der Normalgeschwindigkeit über impactThreshold, Wert vor armor) NICHT von der Haltbarkeit abgezogen und löst kein damage-Ereignis aus; ein vorhandenes Schild (fx shield) wird dabei nicht verbraucht. Stattdessen erhält die Kiste sofort einen Schub in Fahrtrichtung wie fx thrust (unterliegt Soft-Cap): 0,8 m/s je verhindertem Schadenspunkt, höchstens 12 m/s pro Landung; kein eigenes Ereignis. Bei quality "crash" wird der Aufprallschaden nur halbiert (kein Schub). Schaden durch Hindernisse, Schluchten, Überhitzung, Flüche und boostSelfDamage bleibt unverändert. Mit setBonusDouble: 1,6 m/s je Punkt, max. 24 m/s, Crash-Schaden ×0,25. Auswertung: physics/vehicle.js bei der Landungs-Klassifizierung, bevor der Aufprallschaden verrechnet wird.',
        },
        triggers: [
          { on: 'landing', if: { minImpact: 12 }, limit: { cooldown: 4 }, do: [{ fx: 'explosion', amount: 10 }] },
        ],
      },
    },
  },

  gummi: {
    name: 'Gummi',
    icon: '🟣',
    color: '#d14fc0',
    desc: 'Alles prallt ab: Schilde machen aus Schaden Abpraller, und jeder Abpraller wird zu Schwung, Sprung oder Schrauben.',
    sets: {
      2: {
        desc: 'Abprallkraft +10 %. Holprige Landung = Abpraller (alle 2 s). Jeder Abpraller: 2 Schrauben und +3 m/s (1× pro s).',
        stats: { bounce: { add: 0.1 } },
        triggers: [
          { on: 'landing', if: { quality: 'bumpy' }, limit: { cooldown: 2 }, do: [{ fx: 'emit', event: 'bounce', data: { source: 'set_gummi' } }] },
          { on: 'bounce', limit: { cooldown: 1 }, do: [{ fx: 'bolts', amount: 2 }, { fx: 'thrust', amount: 3 }] },
        ],
      },
      3: {
        desc: 'Perfekte Landung: 1 Schild (2× je Etappe). Abpraller: Gratis-Boost 0,5 s (alle 2 s), der federt erneut (Abpraller).',
        triggers: [
          { on: 'perfectLanding', limit: { perStage: 2 }, do: [{ fx: 'shield', n: 1 }] },
          { on: 'bounce', limit: { cooldown: 2 }, do: [{ fx: 'boost', dur: 0.5 }] },
          { on: 'boost', if: { free: true }, limit: { cooldown: 3 }, do: [{ fx: 'emit', event: 'bounce', data: { source: 'set_gummi' } }, { fx: 'buff', stat: 'boostThrust', mul: 0.15, dur: 2 }] },
        ],
      },
      5: {
        desc: 'Alles federt: Bruchlandungen werden Abpraller (70 % Tempo), Schluchten schleudern dich 1× raus. Abpraller knallen.',
        rules: { gapTrampoline: true, crashBounce: true },
        ruleSpec: {
          gapTrampoline:
            'Fällt die Kiste unter track.gapFloorY (Schluchtsturz), werden beim ersten Mal pro Etappe weder das Ereignis fall noch der Sturzschaden (25) ausgelöst, die Etappe läuft weiter. Stattdessen wird die Kiste auf gapFloorY gesetzt, Winkel 30° Nase hoch, Drehrate 0, und die Geschwindigkeit so gesetzt, dass die ballistische Bahn (ohne Eingabe, Boost und Luftwiderstand gerechnet) mindestens 3 m hinter der gegenüberliegenden Schluchtkante auf Kantenhöhe ankommt; dabei vy mindestens 16 m/s und vx (nach vorn, +x) mindestens 12 m/s bzw. mindestens das Tempo vor dem Sturz. Danach wird bounce {source:"gap"} ausgelöst. Jeder weitere Sturz in derselben Etappe wirkt normal. Mit setBonusDouble: 2× pro Etappe. Darstellung: Squash-Verformung + Boing-Sound. Auswertung: physics/vehicle.js im Schlucht-Check, bevor fall ausgelöst wird.',
          crashBounce:
            'Bei jeder Landung mit quality "crash" (nach mindestens RESOURCES.minLandingAir Flugzeit) wird die Landung als "bumpy" eingestuft: kein Bruchlandungs-Zuschlag (nur holprig), das Bodentempo behält RULES.crashBounce.speedKeep (70 %) statt des Bruch- bzw. Holper-Faktors, und nach der Schadensberechnung wird bounce {source:"crashBounce"} ausgelöst. Gilt nach flipsNeverCrash; allLandingsPerfect hat Vorrang (dann gibt es keine Bruchlandung). Auswertung: physics/vehicle.js in land() bei der Landungs-Einstufung.',
        },
        triggers: [
          { on: 'bounce', limit: { cooldown: 2 }, do: [{ fx: 'explosion', amount: 6 }] },
        ],
      },
    },
  },
};

export const ITEMS = [
  // ───────────── HYDRAULIK ─────────────
  {
    id: 'hydraulik_trabi_stossdaempfer',
    name: 'Trabi-Stoßdämpfer',
    icon: '🚗',
    rarity: 'common',
    tags: ['hydraulik'],
    pool: 'base',
    desc: 'Aufprallschwelle +10 %, Landetoleranz +3°. Explosion: 3 s lang Aufprallschwelle +3 m/s und Landetoleranz +4° (alle 3 s).',
    flavor: 'Hat 30 Jahre Feldwege überlebt. Dein Hügel ist ein Witz.',
    stats: { impactThreshold: { mul: 0.1 }, landTolDeg: { add: 3 } },
    triggers: [
      {
        on: 'explosion',
        limit: { cooldown: 3 },
        do: [
          { fx: 'buff', stat: 'impactThreshold', add: 3, dur: 3 },
          { fx: 'buff', stat: 'landTolDeg', add: 4, dur: 3 },
        ],
      },
    ],
  },
  {
    id: 'hydraulik_sofa_sprungfeder',
    name: 'Sprungfeder aus Omas Sofa',
    icon: '🛋️',
    rarity: 'common',
    tags: ['hydraulik'],
    pool: 'base',
    desc: 'Harte Landung (ab 7 m/s Aufprall)? Die Feder wirft dich zurück in die Luft: Sprung {amount} m/s (alle 3 s).',
    flavor: 'Hat Oma 40 Jahre in den Rücken gepiekst. Jetzt bist du dran.',
    triggers: [
      { on: 'landing', if: { minImpact: 7 }, limit: { cooldown: 3 }, do: [{ fx: 'jump', amount: 6 }] },
    ],
  },
  {
    id: 'hydraulik_gabelstapler_puffer',
    name: 'Gabelstapler-Gummipuffer',
    icon: '🛞',
    rarity: 'common',
    tags: ['hydraulik', 'gummi'],
    pool: 'base',
    desc: 'Panzerung +6 %. Harte Landungen (ab 8 m/s Aufprall) lösen zusätzlich einen Abpraller aus (alle 3 s).',
    flavor: 'Hat 10.000 Paletten geküsst. Ganz sanft.',
    stats: { armor: { add: 0.06 } },
    triggers: [
      {
        on: 'landing',
        if: { minImpact: 8 },
        limit: { cooldown: 3 },
        do: [{ fx: 'emit', event: 'bounce', data: { source: 'gummipuffer' } }],
      },
    ],
  },
  {
    id: 'hydraulik_piezo_federbein',
    name: 'Piezo-Zünder im Federbein',
    icon: '🔌',
    rarity: 'rare',
    tags: ['hydraulik', 'elektro'],
    pool: 'r_hydraulik_1',
    desc: 'Panzerung +12 %. Landungen ab 6 m/s Aufprall drücken den Piezo: Stromschlag (alle 3 s)!',
    flavor: 'Aus Opas Grillanzünder. Klick. Klick. KLICK.',
    stats: { armor: { add: 0.12 } },
    triggers: [
      {
        on: 'landing',
        if: { minImpact: 6 },
        limit: { cooldown: 3 },
        do: [{ fx: 'emit', event: 'shock', data: { source: 'piezo' } }],
      },
    ],
  },
  {
    id: 'hydraulik_pressenstempel',
    name: 'Stempel der Schrottpresse',
    icon: '🗜️',
    rarity: 'rare',
    tags: ['hydraulik'],
    pool: 'base',
    desc: 'Aufprallschwelle +15 %. Landung ab 9 m/s Aufprall schickt eine Stoßwelle: Explosion {amount} m/s (alle 4 s).',
    flavor: 'Hat 3000 Autos plattgemacht. Jetzt macht er dir Platz.',
    stats: { impactThreshold: { mul: 0.15 } },
    triggers: [
      { on: 'landing', if: { minImpact: 9 }, limit: { cooldown: 4 }, do: [{ fx: 'explosion', amount: 6 }] },
    ],
  },
  {
    id: 'hydraulik_gasfeder',
    name: 'Gasfeder von Opas Kombi',
    icon: '🚙',
    rarity: 'epic',
    tags: ['hydraulik'],
    pool: 'base',
    desc: 'Landetoleranz +20 %. Landungen ab 6 m/s spannen die Feder; 3× gespannt: Gratis-Boost {dur} s + Sprung {amount} m/s.',
    flavor: 'Hielt 20 Jahre die Heckklappe oben. Und Opas Kopf heil.',
    stats: { landTolDeg: { mul: 0.2 } },
    triggers: [
      {
        on: 'landing',
        if: { minImpact: 6 },
        do: [
          {
            fx: 'charge',
            key: 'hydraulik_gasfeder',
            n: 1,
            at: 3,
            then: [
              { fx: 'boost', dur: 1.2 },
              { fx: 'jump', amount: 7 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'hydraulik_lowrider_pumpe',
    name: 'Lowrider-Pumpe vom Cousin',
    icon: '🚘',
    rarity: 'epic',
    tags: ['hydraulik'],
    pool: 'r_hydraulik_1',
    desc: 'Aufprallschwelle +20 %. Harte Landung (ab 8 m/s): +{amount} Treibstoff, 4 m/s Schub, +5 % Boost-Schub (max. +30 %).',
    flavor: 'Cousin Kevin hopst damit an jeder Ampel. Die Nachbarn hassen es.',
    stats: { impactThreshold: { mul: 0.2 } },
    triggers: [
      {
        on: 'landing',
        if: { minImpact: 8 },
        limit: { cooldown: 1.5 },
        do: [
          { fx: 'fuel', amount: 12 },
          { fx: 'thrust', amount: 4 },
          { fx: 'stack', stat: 'boostThrust', mul: 0.05, max: 0.3 },
        ],
      },
    ],
  },

  // ───────────── GUMMI ─────────────
  {
    id: 'gummi_gummiente',
    name: 'Gummiente',
    icon: '🦆',
    rarity: 'common',
    tags: ['gummi'],
    pool: 'base',
    desc: 'Die erste Schadensquelle jeder Etappe wird zum Abpraller, statt Haltbarkeit zu kosten.',
    flavor: 'Quietscht bei jedem Aufprall. Du hoffentlich nicht.',
    triggers: [
      { on: 'stageStart', do: [{ fx: 'shield', n: 1 }] },
    ],
  },
  {
    id: 'gummi_flummi',
    name: 'Flummi aus dem Automaten',
    icon: '🔴',
    rarity: 'common',
    tags: ['gummi'],
    pool: 'base',
    desc: 'Abprallkraft +10 %. Jeder Abpraller schleudert dich mit {amount} m/s nach vorn (max. 1× pro s).',
    flavor: '20 Cent am Kaugummiautomaten. Springt höher als Opas Blutdruck.',
    stats: { bounce: { add: 0.1 } },
    triggers: [
      { on: 'bounce', limit: { cooldown: 1 }, do: [{ fx: 'thrust', amount: 5 }] },
    ],
  },
  {
    id: 'gummi_fahrradschlauch',
    name: 'Geflickter Fahrradschlauch',
    icon: '🩹',
    rarity: 'common',
    tags: ['gummi'],
    pool: 'base',
    desc: 'Jeder Abpraller flickt {amount} Haltbarkeit (alle 2 s, max. 5× pro Etappe). Unter 30 % Haltbarkeit doppelt so viel.',
    flavor: '14 Flicken, 1 Ventil, 0 Vertrauen. Hält trotzdem.',
    triggers: [
      { on: 'bounce', limit: { cooldown: 2, perStage: 5 }, do: [{ fx: 'heal', amount: 3 }] },
      { on: 'bounce', if: { hpBelow: 0.3 }, limit: { cooldown: 2, perStage: 5 }, do: [{ fx: 'heal', amount: 3 }] },
    ],
  },
  {
    id: 'gummi_gummistiefel',
    name: 'Opas Gummistiefel',
    icon: '👢',
    rarity: 'rare',
    tags: ['gummi'],
    pool: 'base',
    desc: 'Isoliert! Stromschlag gibt 1 Schild (max. 2× pro Etappe). Jeder Abpraller funkt zurück: Stromschlag (alle 3 s).',
    flavor: 'Standen 30 Jahre im Gartenhaus. Riechen auch so.',
    triggers: [
      { on: 'shock', limit: { perStage: 2 }, do: [{ fx: 'shield', n: 1 }] },
      {
        on: 'bounce',
        limit: { cooldown: 3 },
        do: [{ fx: 'emit', event: 'shock', data: { source: 'gummistiefel' } }],
      },
    ],
  },
  {
    id: 'gummi_luftballon',
    name: 'Geburtstags-Luftballon',
    icon: '🎈',
    rarity: 'rare',
    tags: ['gummi', 'rakete'],
    pool: 'r_gummi_1',
    desc: 'Auftrieb +12 %. Jeder Abpraller lässt die Luft raus: Gratis-Boost {dur} s (alle 3 s).',
    flavor: 'Aufschrift: „Alles Gute, Gerda!“ Gerda ist 91 und neidisch.',
    stats: { lift: { mul: 0.12 } },
    triggers: [
      { on: 'bounce', limit: { cooldown: 3 }, do: [{ fx: 'boost', dur: 1 }] },
    ],
  },
  {
    id: 'gummi_huepfball',
    name: 'Hüpfball vom Dachboden',
    icon: '🦘',
    rarity: 'epic',
    tags: ['gummi'],
    pool: 'base',
    desc: 'Abprallkraft +20 %. Holprige Landung: Hopser {amount} m/s + Abpraller (alle 3 s). Abpraller: +6 % Boost-Schub, bis 30 %.',
    flavor: 'Mit Hörnern zum Festhalten. Opa sagt, der hält 120 kg aus.',
    stats: { bounce: { add: 0.2 } },
    triggers: [
      {
        on: 'landing',
        if: { quality: 'bumpy' },
        limit: { cooldown: 3 },
        do: [
          { fx: 'jump', amount: 5 },
          { fx: 'emit', event: 'bounce', data: { source: 'huepfball' } },
        ],
      },
      {
        on: 'bounce',
        limit: { cooldown: 1 },
        do: [{ fx: 'stack', stat: 'boostThrust', mul: 0.06, max: 0.3 }],
      },
    ],
  },
  {
    id: 'gummi_trampolin',
    name: 'Nachbars Trampolin',
    icon: '🤸',
    rarity: 'epic',
    tags: ['gummi'],
    pool: 'r_gummi_1',
    desc: 'Luftsteuerung +20 %. Start: 1 Schild. Abpraller: Sprung {amount} m/s; jeder 3.: Gratis-Boost 1,5 s + 5 Schrauben.',
    flavor: 'Beim Herbststurm rübergeweht. Der Nachbar sucht noch.',
    stats: { airControl: { mul: 0.2 } },
    triggers: [
      { on: 'stageStart', do: [{ fx: 'shield', n: 1 }] },
      {
        on: 'bounce',
        limit: { cooldown: 1.5 },
        do: [
          { fx: 'jump', amount: 8 },
          { fx: 'slowmo', dur: 0.4 },
        ],
      },
      {
        on: 'bounce',
        do: [
          {
            fx: 'charge',
            key: 'gummi_trampolin',
            n: 1,
            at: 3,
            then: [
              { fx: 'boost', dur: 1.5 },
              { fx: 'bolts', amount: 5 },
            ],
          },
        ],
      },
    ],
  },
];
