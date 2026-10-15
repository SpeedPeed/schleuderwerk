// Schleuderwerk 2 – Inhalte für die Tags Magnet und Schrott (reine Daten, siehe ARCHITEKTUR.md 4.6/4.7/4.11)
// Ketten: Pickup → Gratis-Boost/Stromschlag/Hitze (Magnet) · Kollision/Explosion → Schild/Schrott-Pickups (Schrott).
// fx magnet setzt ein zeitweises Feld mit absolutem Radius (max(stats.magnet, radius)) – Radien liegen daher deutlich über dem Stat.
// stack.max ist eine Wertobergrenze (|Summe| ≤ max, wird nicht mit ★ skaliert).

export const TAGS = {
  magnet: {
    name: 'Magnet',
    icon: '🧲',
    color: '#d63a5a',
    desc: 'Anziehung als Spielstil: großer Radius, und jeder Pickup zahlt sich aus – in Schrauben, Schub und Magnetfeldern.',
    sets: {
      2: {
        desc: '+1 m Magnetradius und +5 % Schrauben aus allen Quellen.',
        stats: { magnet: { add: 1 }, boltGain: { mul: 0.05 } },
      },
      4: {
        desc: 'Jeder 8. Pickup löst einen Magnetimpuls aus: Gratis-Boost 0,8 s und 2 s Magnetfeld (6 m).',
        triggers: [
          {
            on: 'pickup',
            do: [
              {
                fx: 'charge',
                key: 'set_magnet_impuls',
                n: 1,
                at: 8,
                then: [
                  { fx: 'boost', dur: 0.8 },
                  { fx: 'magnet', radius: 6, dur: 2 },
                ],
              },
            ],
          },
        ],
      },
      6: {
        desc: 'Gegenseitige Anziehung: In der Luft ziehen Pickups vor dir die Kiste an. Gratis-Boost: 2 s Magnetfeld (8 m).',
        rules: { mutualAttraction: true },
        ruleSpec: {
          mutualAttraction:
            'Nur in der Luft: Die Kiste wird vom nächstgelegenen noch nicht eingesammelten Pickup angezogen, der vor ihr liegt (Pickup-x > Kisten-x) und höchstens 3 × aktueller Stat magnet (in m) entfernt ist. Beschleunigung 8 m/s² in Richtung dieses Pickups; angewandt wird nur der Anteil nach vorn (+x) und nach oben (+y) – die Kiste wird nie gebremst und nie nach unten gezogen. Wirkt als Kraft im Luft-Schritt und unterliegt der weichen Tempo-Grenze wie Boost-Schub (thrustFactor). Kein Pickup im Bereich oder am Boden: keine Wirkung. Löst kein eigenes Ereignis aus. Mit setBonusDouble: 16 m/s². Auswertung: physics/vehicle.js im Luft-Schritt; den Ziel-Pickup liefert physics/objects.js (nächster Pickup vor der Kiste im Radius).',
        },
        triggers: [
          { on: 'boost', if: { free: true }, limit: { cooldown: 3 }, do: [{ fx: 'magnet', radius: 8, dur: 2 }] },
        ],
      },
    },
  },

  schrott: {
    name: 'Schrott',
    icon: '🗑️',
    color: '#a8743f',
    desc: 'Schwer ist schön: Schrott sammeln, Masse aufbauen, Hindernisse rammen und aus allem noch Schrauben machen.',
    sets: {
      2: {
        desc: '+10 max. Haltbarkeit, +10 % Masse und +10 % Schrott (Meta). Wer schwer ist, fällt nicht so leicht um.',
        stats: { durabilityMax: { add: 10 }, mass: { mul: 0.1 }, scrapGain: { mul: 0.1 } },
      },
      4: {
        desc: 'Kollision: +4 m/s und 3 Schrauben (alle 2 s). Schrott-Pickups: Panzerung +1 % (bis Etappenende, max. +10 %).',
        triggers: [
          {
            on: 'collision',
            limit: { cooldown: 2 },
            do: [
              { fx: 'thrust', amount: 4 },
              { fx: 'bolts', amount: 3 },
            ],
          },
          { on: 'pickup', if: { kind: 'scrap' }, do: [{ fx: 'stack', stat: 'armor', add: 0.01, max: 0.1 }] },
        ],
      },
      6: {
        desc: 'Abrissbirne: Ab 16 m/s zerlegst du Hindernisse ohne Schaden. Schrott regnet, und es knallt (Explosion 6 m/s).',
        rules: { wreckingBall: true },
        ruleSpec: {
          wreckingBall:
            'Trifft die Kiste ein Hindernis (Schrottberg, Schrottpresse, Kiste o. ä., keine Schlucht) mit einem Tempo (Betrag der Geschwindigkeit) von mindestens 16 m/s, wird das Hindernis zerstört statt zu blockieren: kein Schaden, die Kiste verliert nur 15 % ihres Tempos und fährt/fliegt weiter. Das Ereignis collision wird trotzdem ausgelöst, aber mit damage: 0 (kein damage-Ereignis). Aus dem Hindernis fallen 2 Schrott-Pickups, die sofort eingesammelt werden (je ein pickup-Ereignis mit kind "scrap"). Unter 16 m/s gilt die normale Kollision. Mit setBonusDouble: Schwelle 12 m/s und 4 Schrott-Pickups. Auswertung: physics/objects.js in der (swept) Hindernis-Kollision; Ereignisse reicht stage.js an die Trigger-Engine weiter.',
        },
        triggers: [
          { on: 'collision', if: { minSpeed: 16 }, limit: { cooldown: 2 }, do: [{ fx: 'explosion', amount: 6 }] },
        ],
      },
    },
  },
};

export const ITEMS = [
  // ───────────── MAGNET ─────────────
  {
    id: 'magnet_hufeisen_magnet',
    name: 'Hufeisen-Magnet',
    icon: '🧲',
    rarity: 'common',
    tags: ['magnet'],
    pool: 'base',
    desc: 'Magnet +1 m. Jede eingesammelte Schraube: +1 % Boost-Schub (bis Etappenende, max. +15 %).',
    flavor: 'Rot lackiert, wie im Comic. Zieht alles an, außer Glück.',
    stats: { magnet: { add: 1 } },
    triggers: [
      { on: 'pickup', if: { kind: 'bolt' }, do: [{ fx: 'stack', stat: 'boostThrust', mul: 0.01, max: 0.15 }] },
    ],
  },
  {
    id: 'magnet_omas_nadeldose',
    name: 'Omas Nadeldose',
    icon: '🪡',
    rarity: 'common',
    tags: ['magnet'],
    pool: 'base',
    desc: 'Magnet +0,5 m. Jeder 15. Pickup: {amount} Schrauben extra und {dur} s Gratis-Boost.',
    flavor: 'Fand jede Stecknadel. Und Opas Ehering. Zweimal.',
    stats: { magnet: { add: 0.5 } },
    triggers: [
      {
        on: 'pickup',
        do: [{ fx: 'charge', key: 'magnet_nadeldose', n: 1, at: 15, then: [{ fx: 'bolts', amount: 3 }, { fx: 'boost', dur: 0.5 }] }],
      },
    ],
  },
  {
    id: 'magnet_kofferradio_lautsprecher',
    name: 'Kofferradio-Lautsprecher',
    icon: '📻',
    rarity: 'common',
    tags: ['magnet'],
    pool: 'r_magnet_1',
    desc: 'Nach jeder Landung und jedem Abpraller: {dur} s Magnetfeld mit {radius} m (je alle 3 s).',
    flavor: 'Spielt seit dem Ausbau nur noch Schlager. Rückwärts.',
    triggers: [
      { on: 'landing', limit: { cooldown: 3 }, do: [{ fx: 'magnet', radius: 5, dur: 2 }] },
      { on: 'bounce', limit: { cooldown: 3 }, do: [{ fx: 'magnet', radius: 5, dur: 2 }] },
    ],
  },
  {
    id: 'magnet_metalldetektor',
    name: 'Metalldetektor vom Strand',
    icon: '🏖️',
    rarity: 'rare',
    tags: ['magnet', 'gluck'],
    pool: 'r_magnet_1',
    desc: '+1 Glück, Magnet +0,5 m. Pickups: 20 % Chance auf {amount} Schrauben extra (alle 0,5 s). Schatzhaufen: +8 Schrauben.',
    flavor: 'Fand am Strand drei Kronkorken und Onkel Kurt.',
    stats: { luck: { add: 1 }, magnet: { add: 0.5 } },
    triggers: [
      {
        on: 'pickup',
        limit: { cooldown: 0.5 },
        do: [{ fx: 'chance', p: 0.2, then: [{ fx: 'bolts', amount: 3 }] }],
      },
      { on: 'nodeEnter', if: { nodeType: 'treasure' }, do: [{ fx: 'bolts', amount: 8 }] },
    ],
  },
  {
    id: 'magnet_magnetron',
    name: 'Magnetron aus der Mikrowelle',
    icon: '🍿',
    rarity: 'rare',
    tags: ['magnet', 'feuer'],
    pool: 'r_magnet_2',
    desc: 'Jeder Pickup: +{amount} Hitze und +1,5 m/s Schub (alle 0,5 s). Überhitzung: 3 s Magnetfeld (6 m).',
    flavor: 'Omas Mikrowelle hat jetzt Feierabend. Das Popcorn auch.',
    triggers: [
      {
        on: 'pickup',
        limit: { cooldown: 0.5 },
        do: [
          { fx: 'heat', amount: 3 },
          { fx: 'thrust', amount: 1.5 },
        ],
      },
      { on: 'overheat', limit: { cooldown: 5 }, do: [{ fx: 'magnet', radius: 6, dur: 3 }] },
    ],
  },
  {
    id: 'magnet_experimentierkasten',
    name: 'Physik-Experimentierkasten',
    icon: '🧪',
    rarity: 'epic',
    tags: ['magnet'],
    pool: 'r_magnet_2',
    desc: 'Magnet +0,5 m. Pickups in der Luft: +{amount} m/s, Magnet +0,25 m (bis Etappenende, max. +2 m). Jeder 6.: Hüpfer 5 m/s.',
    flavor: 'Weihnachten 1983. Die Anleitung fehlt, der Ehrgeiz nicht.',
    stats: { magnet: { add: 0.5 } },
    triggers: [
      {
        on: 'pickup',
        if: { airborne: true },
        limit: { cooldown: 0.5 },
        do: [
          { fx: 'thrust', amount: 1.5 },
          { fx: 'stack', stat: 'magnet', add: 0.25, max: 2 },
          { fx: 'charge', key: 'magnet_experimentierkasten', n: 1, at: 6, then: [{ fx: 'jump', amount: 5 }] },
        ],
      },
    ],
  },
  {
    id: 'magnet_teilchenbeschleuniger',
    name: 'Mini-Teilchenbeschleuniger',
    icon: '⚛️',
    rarity: 'epic',
    tags: ['magnet'],
    pool: 'r_magnet_3',
    desc: 'Jeder Pickup: Tempogrenze +1 % (bis Etappenende, max. +20 %). Jeder 12.: Gratis-Boost {dur} s und Stromschlag.',
    flavor: 'Brummt nachts im Keller. „Nicht anfassen“, sagt Oma.',
    triggers: [
      { on: 'pickup', do: [{ fx: 'stack', stat: 'speedSoftCap', mul: 0.01, max: 0.2 }] },
      {
        on: 'pickup',
        do: [
          {
            fx: 'charge',
            key: 'magnet_teilchenbeschleuniger',
            n: 1,
            at: 12,
            then: [
              { fx: 'boost', dur: 1 },
              { fx: 'emit', event: 'shock', data: { source: 'magnet_teilchenbeschleuniger' } },
            ],
          },
        ],
      },
    ],
  },

  // ───────────── SCHROTT ─────────────
  {
    id: 'schrott_gullydeckel',
    name: 'Gullydeckel-Unterboden',
    icon: '🛡️',
    rarity: 'common',
    tags: ['schrott'],
    pool: 'base',
    desc: 'Panzerung +4 %, +8 % Masse. Jede Kollision bringt {amount} Schrauben Altmetallwert (alle 2 s).',
    flavor: 'Stand nirgends drauf, dass man den nicht mitnehmen darf.',
    stats: { armor: { add: 0.04 }, mass: { mul: 0.08 } },
    triggers: [
      { on: 'collision', limit: { cooldown: 2 }, do: [{ fx: 'bolts', amount: 2 }] },
    ],
  },
  {
    id: 'schrott_altmetall_eimer',
    name: 'Altmetall-Eimer',
    icon: '🪣',
    rarity: 'common',
    tags: ['schrott'],
    pool: 'base',
    desc: '+10 % Schrott (Meta). Schrott-Pickups: Schrauben +{amount}. Beim Schrotthändler: 5 Schrauben fürs Altmetall.',
    flavor: 'Kupfer, Kronkorken und Opas komplette Altersvorsorge.',
    stats: { scrapGain: { mul: 0.1 } },
    triggers: [
      { on: 'pickup', if: { kind: 'scrap' }, limit: { cooldown: 0.5 }, do: [{ fx: 'bolts', amount: 1 }] },
      { on: 'shopEnter', do: [{ fx: 'bolts', amount: 5 }] },
    ],
  },
  {
    id: 'schrott_teleskop_magnetheber',
    name: 'Teleskop-Magnetheber',
    icon: '🪛',
    rarity: 'common',
    tags: ['schrott', 'magnet'],
    pool: 'r_schrott_1',
    desc: 'Magnet +0,75 m. Schrott-Pickups öffnen {dur} s ein Magnetfeld mit {radius} m (alle 3 s).',
    flavor: 'Für die Schraube, die in den Motorraum fällt. Jede fällt.',
    stats: { magnet: { add: 0.75 } },
    triggers: [
      { on: 'pickup', if: { kind: 'scrap' }, limit: { cooldown: 3 }, do: [{ fx: 'magnet', radius: 5, dur: 2 }] },
    ],
  },
  {
    id: 'schrott_wagenheber',
    name: 'Hydraulischer Wagenheber',
    icon: '🏋️',
    rarity: 'rare',
    tags: ['schrott', 'hydraulik'],
    pool: 'r_schrott_1',
    desc: 'Panzerung +3 %. Kollision? Der Wagenheber hebt dich raus: Sprung {amount} m/s und 2 Schrauben (alle 3 s).',
    flavor: 'Hebt zwei Tonnen. Oder eine Badewanne samt Opa.',
    stats: { armor: { add: 0.03 } },
    triggers: [
      {
        on: 'collision',
        limit: { cooldown: 3 },
        do: [
          { fx: 'jump', amount: 6 },
          { fx: 'bolts', amount: 2 },
        ],
      },
    ],
  },
  {
    id: 'schrott_schrottwuerfel',
    name: 'Schrottwürfel aus der Presse',
    icon: '🟫',
    rarity: 'rare',
    tags: ['schrott'],
    pool: 'r_schrott_2',
    desc: 'Schrott-Pickups: +3 % Masse (bis Etappenende, max. +30 %). Jede geschaffte Etappe: +{amount} max. Haltbarkeit (Run).',
    flavor: 'War mal ein Kombi. Jetzt ein Würfel mit Erinnerungen.',
    triggers: [
      { on: 'pickup', if: { kind: 'scrap' }, do: [{ fx: 'stack', stat: 'mass', mul: 0.03, max: 0.3 }] },
      { on: 'stageClear', do: [{ fx: 'maxHp', amount: 1 }] },
    ],
  },
  {
    id: 'schrott_traktor_frontlader',
    name: 'Traktor-Frontlader',
    icon: '🚜',
    rarity: 'epic',
    tags: ['schrott'],
    pool: 'r_schrott_2',
    desc: 'Panzerung +8 %. Kollision: Explosion ({amount} m/s) und 3 Schrauben. Danach wird der nächste Treffer ein Abpraller.',
    flavor: 'Bauer Hansen hat Anzeige erstattet. Gegen Unbekannt.',
    stats: { armor: { add: 0.08 } },
    triggers: [
      {
        on: 'collision',
        limit: { cooldown: 2 },
        do: [
          { fx: 'explosion', amount: 6 },
          { fx: 'bolts', amount: 3 },
        ],
      },
      { on: 'collision', limit: { cooldown: 6 }, do: [{ fx: 'shield', n: 1 }] },
    ],
  },
  {
    id: 'schrott_amboss',
    name: 'Amboss vom Dorfschmied',
    icon: '⚒️',
    rarity: 'epic',
    tags: ['schrott'],
    pool: 'r_schrott_3',
    desc: '+25 % Masse, +15 max. Haltbarkeit. Ab 8 m/s Aufprall: Explosion {amount} m/s. Explosion: Schrott + Schraube (alle 2 s).',
    flavor: 'Fällt wie im Zeichentrickfilm. Landet auch so.',
    stats: { mass: { mul: 0.25 }, durabilityMax: { add: 15 } },
    triggers: [
      { on: 'landing', if: { minImpact: 8 }, limit: { cooldown: 2 }, do: [{ fx: 'explosion', amount: 6 }] },
      {
        on: 'explosion',
        limit: { cooldown: 2 },
        do: [
          { fx: 'emit', event: 'pickup', data: { kind: 'scrap' } },
          { fx: 'bolts', amount: 1 },
        ],
      },
    ],
  },
];
