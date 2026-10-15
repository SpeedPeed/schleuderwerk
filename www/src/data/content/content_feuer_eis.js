// Schleuderwerk 2 – Inhalte für die Tags Feuer und Eis (reine Daten, siehe ARCHITEKTUR.md 4.6/4.7/4.11)
// stack.max ist eine Wertobergrenze (|Summe| ≤ max, wird nicht mit ★ skaliert – ★ erreicht den Deckel nur schneller).

export const TAGS = {
  feuer: {
    name: 'Feuer',
    icon: '🔥',
    color: '#ff6b2d',
    desc: 'Hitze ist Kraft: Wer heiß fährt, schiebt stärker, zündet Explosionen und macht aus Überhitzung einen Vorteil.',
    sets: {
      2: {
        desc: '+18 % Boost-Schub. Wer heizt, der schiebt.',
        stats: { boostThrust: { mul: 0.18 } },
      },
      4: {
        desc: 'Ab 55 Hitze zündet eine Boost-Sekunde eine Explosion (7 m/s, alle 1,2 s).',
        triggers: [
          { on: 'boostSecond', if: { heatAbove: 55 }, limit: { cooldown: 1.2 }, do: [{ fx: 'explosion', amount: 7 }] },
        ],
      },
      6: {
        desc: 'Nachbrenner: Überhitzen sperrt und schadet nicht – 2,5 s Gratis-Boost (+80 % Schub), Knall, +15 Treibstoff (alle 5 s).',
        rules: { overheatAfterburner: true },
        ruleSpec: {
          overheatAfterburner:
            'Erreicht die Hitze heatMax und liegt der letzte Nachbrenner mindestens 5 s zurück, wird das Ereignis overheat normal ausgelöst, aber die 2-s-Sperre für Boost/Antrieb und der Überhitzungsschaden (5) entfallen. Stattdessen startet sofort ein Gratis-Boost von 2,5 s ohne Treibstoffverbrauch (löst boost {free:true, source:"set_feuer"} aus) mit boostThrust ×1,8; dieser Nachbrenner-Boost erzeugt selbst keine Hitze. Die Hitze fällt wie gewohnt auf 50. Innerhalb der 5 s Abklingzeit gilt die normale Überhitzung (Sperre + Schaden). Mit noOverheat (Kühlschrank) wirkungslos. Auswertung: physics/vehicle.js beim Erreichen von heatMax.',
        },
        triggers: [
          { on: 'overheat', limit: { cooldown: 5 }, do: [{ fx: 'explosion', amount: 12 }, { fx: 'fuel', amount: 15 }] },
        ],
      },
    },
  },

  eis: {
    name: 'Eis',
    icon: '❄️',
    color: '#7fd8ff',
    desc: 'Kühl bleiben, Hitze wegdrücken, eiskalt belohnt werden – und am Boden rutschen wie ein Puck übers Eis.',
    sets: {
      2: {
        desc: '+20 % Kühlung und −8 % Rollreibung. Cool bleiben, weiterrutschen.',
        stats: { coolRate: { mul: 0.2 }, rollFriction: { mul: -0.08 } },
      },
      4: {
        desc: 'Gratis-Boosts kühlen: −15 Hitze und 2 s +15 % Boost-Schub (alle 2 s).',
        triggers: [
          {
            on: 'boost',
            if: { free: true },
            limit: { cooldown: 2 },
            do: [
              { fx: 'cool', amount: 15 },
              { fx: 'buff', stat: 'boostThrust', mul: 0.15, dur: 2 },
            ],
          },
        ],
      },
      6: {
        desc: 'Eiszeit: Unter 40 Hitze −75 % Rollreibung, Schlamm/Sand bremsen nicht. Kalt perfekt gelandet = Gratis-Boost.',
        rules: { coldGlide: true },
        ruleSpec: {
          coldGlide:
            'Solange die Kiste am Boden ist und die Hitze unter 40 liegt: effektive Rollreibung = rollFriction × 0,25, und die Oberflächen-Faktoren (Schlamm ×4, Sand ×1,6) werden ignoriert (Faktor 1). Hangabtrieb, Luftwiderstand und Antrieb wirken unverändert. Ab 40 Hitze gilt sofort wieder die normale Reibung. Auswertung: physics/vehicle.js im Boden-Schritt bei der Rollreibungs-Berechnung.',
        },
        triggers: [
          { on: 'perfectLanding', if: { heatBelow: 40 }, limit: { cooldown: 3 }, do: [{ fx: 'boost', dur: 1 }] },
        ],
      },
    },
  },
};

export const ITEMS = [
  // ───────────── FEUER ─────────────
  {
    id: 'feuer_zuendkerzen_kette',
    name: 'Zündkerzen-Kette',
    icon: '🔥',
    rarity: 'common',
    tags: ['feuer'],
    pool: 'base',
    desc: 'Jeder Salto lädt 1 Zündung. Bei 3 Zündungen: Gratis-Boost {dur} s.',
    flavor: 'Opa schwört drauf. Opa schwört auf vieles.',
    triggers: [
      {
        on: 'flip',
        do: [{ fx: 'charge', key: 'feuer_zuendung', n: 1, at: 3, then: [{ fx: 'boost', dur: 1.2 }] }],
      },
    ],
  },
  {
    id: 'feuer_buegeleisen',
    name: 'Bügeleisen der Nachbarin',
    icon: '♨️',
    rarity: 'common',
    tags: ['feuer'],
    pool: 'base',
    desc: '+10 % Boost-Schub. Über 60 Hitze gibt eine Boost-Sekunde zusätzlich +{amount} m/s Schub.',
    flavor: 'Bügelt Hemdfalten und Gegenwind glatt.',
    stats: { boostThrust: { mul: 0.1 } },
    triggers: [
      { on: 'boostSecond', if: { heatAbove: 60 }, limit: { cooldown: 1.2 }, do: [{ fx: 'thrust', amount: 4 }] },
    ],
  },
  {
    id: 'feuer_grillanzuender',
    name: 'Grillanzünder-Würfel',
    icon: '🍖',
    rarity: 'common',
    tags: ['feuer'],
    pool: 'r_feuer_1',
    desc: 'Überhitzung zündet den Grill: Explosion mit {amount} m/s nach vorn.',
    flavor: 'Riecht nach Sommer, Bratwurst und Feuerwehreinsatz.',
    triggers: [
      { on: 'overheat', limit: { cooldown: 3 }, do: [{ fx: 'explosion', amount: 7 }] },
    ],
  },
  {
    id: 'feuer_feuerloescher_rakete',
    name: 'Feuerlöscher-Rakete',
    icon: '🧯',
    rarity: 'rare',
    tags: ['feuer', 'rakete'],
    pool: 'r_feuer_1',
    desc: 'Löschschaum im Auspuff: Boost heizt 60 % weniger. Überhitzung? Sofort −{amount} Hitze (alle 10 s).',
    flavor: 'Brandschutzbeauftragter Opa ist stolz und entsetzt.',
    stats: { boostHeat: { mul: -0.6 } },
    triggers: [
      { on: 'overheat', limit: { cooldown: 10 }, do: [{ fx: 'cool', amount: 50 }] },
    ],
  },
  {
    id: 'feuer_silvester_restposten',
    name: 'Silvester-Restposten',
    icon: '🧨',
    rarity: 'rare',
    tags: ['feuer'],
    pool: 'r_feuer_2',
    desc: 'Ab 30 Hitze zündet jeder Boost mit 45 % Chance einen Böller: Explosion {amount} m/s.',
    flavor: 'Seit 2009 im Keller. „Die gehen noch“, sagt Opa.',
    triggers: [
      {
        on: 'boost',
        if: { heatAbove: 30 },
        limit: { cooldown: 2 },
        do: [{ fx: 'chance', p: 0.45, then: [{ fx: 'explosion', amount: 6 }] }],
      },
    ],
  },
  {
    id: 'feuer_schweissgeraet',
    name: 'Opas Schweißgerät',
    icon: '✨',
    rarity: 'epic',
    tags: ['feuer', 'elektro'],
    pool: 'r_feuer_2',
    desc: 'Jede Explosion schlägt Funken: Stromschlag! Jeder Stromschlag gibt {dur} s +30 % Boost-Schub.',
    flavor: 'Die Schweißbrille liegt irgendwo im Keller. Vermutlich.',
    triggers: [
      {
        on: 'explosion',
        limit: { cooldown: 2 },
        do: [{ fx: 'emit', event: 'shock', data: { source: 'feuer_schweissgeraet' } }],
      },
      {
        on: 'shock',
        limit: { cooldown: 2 },
        do: [{ fx: 'buff', stat: 'boostThrust', mul: 0.3, dur: 2.5 }],
      },
    ],
  },
  {
    id: 'feuer_kachelofen',
    name: 'Omas Kachelofen',
    icon: '🧱',
    rarity: 'epic',
    tags: ['feuer'],
    pool: 'r_feuer_3',
    desc: 'Boost-Sekunde über 50 Hitze: +6 % Boost-Schub (bis Etappenende, max. +40 %). Überhitzung heilt {amount} Haltbarkeit.',
    flavor: 'Speichert Wärme stundenlang. Und Omas Groll jahrelang.',
    triggers: [
      {
        on: 'boostSecond',
        if: { heatAbove: 50 },
        limit: { perStage: 8 },
        do: [{ fx: 'stack', stat: 'boostThrust', mul: 0.06, max: 0.4 }],
      },
      { on: 'overheat', limit: { cooldown: 3 }, do: [{ fx: 'heal', amount: 5 }] },
    ],
  },

  // ───────────── EIS ─────────────
  {
    id: 'eis_kuehlerschlauch',
    name: 'Kühlerschlauch',
    icon: '🪢',
    rarity: 'common',
    tags: ['eis'],
    pool: 'base',
    desc: 'Boost-Start über 60 Hitze: −{amount} Hitze, +4 m/s Schub und {dur} s lang 15 % höhere Tempogrenze (alle 4 s).',
    flavor: 'Aus Opas altem Golf. Nur ganz leicht porös.',
    triggers: [
      {
        on: 'boost',
        if: { heatAbove: 60 },
        limit: { cooldown: 4 },
        do: [
          { fx: 'cool', amount: 30 },
          { fx: 'thrust', amount: 4 },
          { fx: 'buff', stat: 'speedSoftCap', mul: 0.15, dur: 2 },
        ],
      },
    ],
  },
  {
    id: 'eis_bohnerwachs',
    name: 'Omas Bohnerwachs',
    icon: '🫙',
    rarity: 'common',
    tags: ['eis'],
    pool: 'base',
    desc: '−10 % Rollreibung. Kalt gelandet (unter 30 Hitze): +{amount} m/s Schub.',
    flavor: 'Rutschig wie Omas Flur nach dem Samstagsputz.',
    stats: { rollFriction: { mul: -0.1 } },
    triggers: [
      { on: 'landing', if: { heatBelow: 30 }, limit: { cooldown: 2 }, do: [{ fx: 'thrust', amount: 3 }] },
    ],
  },
  {
    id: 'eis_kuehlschrankmagnet',
    name: 'Kühlschrankmagnet-Sammlung',
    icon: '🏝️',
    rarity: 'common',
    tags: ['eis', 'magnet'],
    pool: 'r_eis_1',
    desc: '+0,5 m Magnet. Unter 30 Hitze bringt ein Pickup Schrauben (+{amount}). Im Kühlschrank-Chassis: +1 m Magnet.',
    flavor: 'Souvenirs aus 14 Urlauben, alle von Tante Gerda.',
    stats: { magnet: { add: 0.5 } },
    triggers: [
      { on: 'pickup', if: { heatBelow: 30 }, limit: { cooldown: 1 }, do: [{ fx: 'bolts', amount: 1 }] },
      { on: 'stageStart', if: { chassis: 'kuehlschrank' }, do: [{ fx: 'stack', stat: 'magnet', add: 1, max: 1 }] },
    ],
  },
  {
    id: 'eis_waermepumpe',
    name: 'Wärmepumpe Marke Eigenbau',
    icon: '🌡️',
    rarity: 'rare',
    tags: ['eis'],
    pool: 'r_eis_1',
    desc: 'Boostest du über 50 Hitze, pumpt sie {amount} Hitze ab und macht daraus +4 m/s Schub (alle 2 s).',
    flavor: 'Opa nennt es Energiewende. Oma nennt es Lärm.',
    triggers: [
      {
        on: 'boostSecond',
        if: { heatAbove: 50 },
        limit: { cooldown: 2 },
        do: [
          { fx: 'cool', amount: 15 },
          { fx: 'thrust', amount: 4 },
        ],
      },
    ],
  },
  {
    id: 'eis_eisstock',
    name: 'Eisstock vom Vereinsheim',
    icon: '🥌',
    rarity: 'rare',
    tags: ['eis'],
    pool: 'r_eis_2',
    desc: 'Perfekte Landung 1° großzügiger. Perfekt und kalt (unter 30 Hitze) gelandet: +{amount} m/s und 2 Schrauben.',
    flavor: 'Gleitet seit 1974 schnurgerade. Der Vereinswirt eher nicht.',
    stats: { perfectLandDeg: { add: 1 } },
    triggers: [
      {
        on: 'perfectLanding',
        if: { heatBelow: 30 },
        do: [
          { fx: 'thrust', amount: 5 },
          { fx: 'bolts', amount: 2 },
        ],
      },
    ],
  },
  {
    id: 'eis_tiefkuehltruhe',
    name: 'Omas Tiefkühltruhe',
    icon: '🥶',
    rarity: 'epic',
    tags: ['eis'],
    pool: 'r_eis_2',
    desc: '+25 % Kühlung. Je 4 Flugsekunden unter 25 Hitze: Gratis-Boost {dur} s.',
    flavor: 'Darin: Erbsen von 1998 und ein Familiengeheimnis.',
    stats: { coolRate: { mul: 0.25 } },
    triggers: [
      {
        on: 'airSecond',
        if: { heatBelow: 25 },
        do: [{ fx: 'charge', key: 'eis_tiefkuehl', n: 1, at: 4, then: [{ fx: 'boost', dur: 1 }] }],
      },
    ],
  },
  {
    id: 'eis_trockeneis',
    name: 'Trockeneis vom Eismann',
    icon: '💨',
    rarity: 'epic',
    tags: ['eis'],
    pool: 'r_eis_3',
    desc: '+20 % Kühlung. Boostest du über 60 Hitze, zischt es: −{amount} Hitze und eine Explosion (alle 4 s).',
    flavor: 'Der Eismann wollte es zurück. Zu spät.',
    stats: { coolRate: { mul: 0.2 } },
    triggers: [
      {
        on: 'boostSecond',
        if: { heatAbove: 60 },
        limit: { cooldown: 4 },
        do: [
          { fx: 'cool', amount: 30 },
          { fx: 'explosion', amount: 6 },
        ],
      },
    ],
  },
];
