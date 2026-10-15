// Schleuderwerk 2 – Inhalte: Tags „elektro“ und „gyro“ (Set-Boni + 14 Items).
// Reine Daten (Vokabular: ARCHITEKTUR.md 4.1–4.11). Kette: Salto → Stromschlag → Gratis-Boost → Hitze → Kühlung → Tempo.
// Referenz-Build der Kette (ab 1 Blaupause, r_gyro_1): Fahrraddynamo (Salto → Stromschlag) + Blitzableiter
// (Stromschlag → Gratis-Boost) + Kühlerschlauch (Boost über 60 Hitze → Kühlung + Schub + Tempogrenze), dazu Peltier/Kreisel.
// Bedingung minCount prüft je Ereignis: flip.count, landing.flips / perfectLanding.flips, airSecond.seconds.
// stack.max ist eine Wertobergrenze (|Summe| ≤ max, wird nicht mit ★ skaliert).

export const TAGS = {
  elektro: {
    name: 'Elektro',
    icon: '⚡',
    color: '#ffd23f',
    desc: 'Stromschläge als Kettenglied: Landungen und Saltos funken, Funken zünden Gratis-Boosts – im Gewitter erst recht.',
    sets: {
      2: {
        desc: 'Jeder Stromschlag schiebt mit 3 m/s an (max. 1× pro s). Boosten kostet 5 % weniger Treibstoff.',
        stats: { boostFuel: { mul: -0.05 } },
        triggers: [
          { on: 'shock', limit: { cooldown: 1 }, do: [{ fx: 'thrust', amount: 3 }] },
        ],
      },
      4: {
        desc: 'Perfekte Landungen erzeugen Stromschläge. Jeder 4. Stromschlag: Gratis-Boost 1,2 s und 4 Schrauben.',
        triggers: [
          { on: 'perfectLanding', limit: { cooldown: 2 }, do: [{ fx: 'emit', event: 'shock', data: { source: 'set_elektro' } }] },
          {
            on: 'shock',
            do: [{ fx: 'charge', key: 'set_elektro_kondensator', n: 1, at: 4, then: [{ fx: 'boost', dur: 1.2 }, { fx: 'bolts', amount: 4 }] }],
          },
        ],
      },
      6: {
        desc: 'Lichtbogen: Stromschlag zerstört das nächste Hindernis und holt Pickups (je bis 8 m). Gratis-Boost löst Stromschlag aus.',
        rules: { shockArc: true },
        ruleSpec: {
          shockArc: 'Bei jedem shock-Ereignis (jede Quelle, auch Blitz) schlägt ein Lichtbogen nach vorn: (1) das nächste Hindernis (Schrottberg, Presse, Kiste) in Fahrtrichtung mit Abstand ≤ 8 m wird zerstört – kein collision-Ereignis, kein Schaden; (2) alle Pickups im Umkreis von 8 m werden sofort eingesammelt (je Pickup ein normales pickup-Ereignis). Höchstens ein Lichtbogen je 0,5 s (weitere shocks in dieser Zeit wirken normal, nur ohne Lichtbogen). Mit setBonusDouble: Reichweite 12 m. Darstellung: Blitz-Partikel von der Kiste zum Ziel. Auswertung: stage/stage.js beim shock-Ereignis (Hindernis- und Pickup-Suche über physics/objects.js).',
        },
        triggers: [
          { on: 'boost', if: { free: true }, limit: { cooldown: 2 }, do: [{ fx: 'emit', event: 'shock', data: { source: 'set_elektro' } }] },
        ],
      },
    },
  },

  gyro: {
    name: 'Gyro',
    icon: '🌀',
    color: '#a46bff',
    desc: 'Rotation ist Rendite: schnellere Saltos, Lohn für jede Drehung und Landungen wie mit der Wasserwaage.',
    sets: {
      2: {
        desc: 'Saltos drehen 12 % schneller, Luftsteuerung +8 %.',
        stats: { flipSpeed: { mul: 0.12 }, airControl: { mul: 0.08 } },
      },
      4: {
        desc: 'Nach jedem Salto 2,5 s lang Landetoleranz +5°. Ab dem 2. Salto im Sprung je +4 m/s Schub.',
        triggers: [
          { on: 'flip', do: [{ fx: 'buff', stat: 'landTolDeg', add: 5, dur: 2.5 }] },
          { on: 'flip', if: { minCount: 2 }, limit: { cooldown: 1 }, do: [{ fx: 'thrust', amount: 4 }] },
        ],
      },
      6: {
        desc: 'Drehimpuls: Perfekte Landung = +4 m/s je Salto des Sprungs (saubere: +2 m/s, max. 5 Saltos). Max. Drehtempo +25 %.',
        stats: { maxSpin: { mul: 0.25 } },
        rules: { spinToSpeed: true },
        ruleSpec: {
          spinToSpeed: 'Nach jeder Landung (Ereignis landing) mit quality "perfect" oder "clean": Sofort-Schub in Fahrtrichtung wie fx thrust (unterliegt Soft-Cap) in Höhe von 4 m/s × landing.flips, gezählt höchstens 5 Saltos (max. 20 m/s); bei "clean" nur die Hälfte (2 m/s je Salto). Bei "bumpy"/"crash" nichts. Mit setBonusDouble: 8 bzw. 4 m/s je Salto. Einmal pro Landung, nach Abarbeitung der landing-Trigger; löst kein eigenes Ereignis aus. Auswertung: items/triggerEngine.js nach den landing-Triggern der Set-Quelle.',
        },
        triggers: [
          { on: 'flip', if: { minCount: 3 }, limit: { cooldown: 3 }, do: [{ fx: 'slowmo', dur: 0.5 }] },
        ],
      },
    },
  },
};

export const ITEMS = [
  // ───────────── ELEKTRO ─────────────
  {
    id: 'elektro_blitzableiter',
    name: 'Blitzableiter',
    icon: '🔱',
    rarity: 'common',
    tags: ['elektro'],
    pool: 'base',
    desc: 'Landungen erzeugen Stromschläge (alle 3 s). Ein Stromschlag zündet {dur} s Gratis-Boost (alle 5 s).',
    flavor: 'Vom Kirchturm „ausgeliehen“. Der Pfarrer ahnt nichts.',
    triggers: [
      { on: 'landing', limit: { cooldown: 3 }, do: [{ fx: 'emit', event: 'shock', data: { source: 'blitzableiter' } }] },
      { on: 'shock', limit: { cooldown: 5 }, do: [{ fx: 'boost', dur: 1 }] },
    ],
  },
  {
    id: 'elektro_fernbedienungs_akku',
    name: 'Akku aus der Fernbedienung',
    icon: '📺',
    rarity: 'common',
    tags: ['elektro'],
    pool: 'base',
    desc: 'Fähigkeiten laden 10 % schneller. Jede Fähigkeit funkt: Stromschlag (alle 4 s). Jeder Stromschlag: +{amount} Treibstoff.',
    flavor: 'Seitdem gibt’s im Wohnzimmer nur noch einen Sender.',
    stats: { abilityCooldown: { mul: -0.1 } },
    triggers: [
      { on: 'abilityUse', limit: { cooldown: 4 }, do: [{ fx: 'emit', event: 'shock', data: { source: 'akku' } }] },
      { on: 'shock', limit: { cooldown: 2 }, do: [{ fx: 'fuel', amount: 10 }] },
    ],
  },
  {
    id: 'elektro_kupfer_wetterhahn',
    name: 'Kupfer-Wetterhahn',
    icon: '🐓',
    rarity: 'common',
    tags: ['elektro'],
    pool: 'r_elektro_1',
    desc: 'An Wegmarken ein Stromschlag (alle 8 s). Echte Blitze bringen +{amount} Schrauben und 4 m/s Schub.',
    flavor: 'Kräht nur bei Gewitter. Dann aber richtig.',
    triggers: [
      { on: 'milestone', limit: { cooldown: 8 }, do: [{ fx: 'emit', event: 'shock', data: { source: 'wetterhahn' } }] },
      { on: 'shock', if: { source: 'lightning' }, limit: { cooldown: 1 }, do: [{ fx: 'bolts', amount: 3 }, { fx: 'thrust', amount: 4 }] },
    ],
  },
  {
    id: 'elektro_peltier_kuehlbox',
    name: 'Peltier aus Opas Kühlbox',
    icon: '🔳',
    rarity: 'rare',
    tags: ['elektro', 'eis'],
    pool: 'r_elektro_1',
    desc: 'Jeder Stromschlag senkt die Hitze um {amount} und gibt {dur} s lang +12 % Boost-Schub (alle 2 s).',
    flavor: 'Strom rein, Kälte raus. Opa hat nie gefragt, warum.',
    triggers: [
      { on: 'shock', limit: { cooldown: 2 }, do: [{ fx: 'cool', amount: 18 }, { fx: 'buff', stat: 'boostThrust', mul: 0.12, dur: 2 }] },
    ],
  },
  {
    id: 'elektro_kran_magnet',
    name: 'Elektromagnet vom Kran',
    icon: '🏗️',
    rarity: 'rare',
    tags: ['elektro', 'magnet'],
    pool: 'r_elektro_2',
    desc: 'Magnet +0,5 m. Jeder Stromschlag: {dur} s Magnetfeld ({radius} m). Jede 10. Schraube: Stromschlag.',
    flavor: 'Hob früher Autos. Heute Schrauben und Omas Löffel.',
    stats: { magnet: { add: 0.5 } },
    triggers: [
      { on: 'shock', limit: { cooldown: 3 }, do: [{ fx: 'magnet', radius: 5, dur: 2 }] },
      {
        on: 'pickup',
        if: { kind: 'bolt' },
        do: [{ fx: 'charge', key: 'elektro_kran_magnet', n: 1, at: 10, then: [{ fx: 'emit', event: 'shock', data: { source: 'kranmagnet' } }] }],
      },
    ],
  },
  {
    id: 'elektro_plasmakugel',
    name: 'Plasmakugel vom Flohmarkt',
    icon: '🔮',
    rarity: 'epic',
    tags: ['elektro'],
    pool: 'r_elektro_2',
    desc: 'Jeder Stromschlag: +4 % Boost-Schub bis Etappenende (max. +24 %). Jeder 3. entlädt sich als Explosion.',
    flavor: 'Zwei Euro. Funktioniert. Die Haare stehen bis heute.',
    triggers: [
      {
        on: 'shock',
        limit: { cooldown: 1 },
        do: [
          { fx: 'stack', stat: 'boostThrust', mul: 0.04, max: 0.24 },
          { fx: 'charge', key: 'elektro_plasmakugel', n: 1, at: 3, then: [{ fx: 'explosion', amount: 8 }] },
        ],
      },
    ],
  },
  {
    id: 'elektro_zitteraal',
    name: 'Zitteraal im Gurkenglas',
    icon: '🐍',
    rarity: 'epic',
    tags: ['elektro'],
    pool: 'r_elektro_3',
    desc: 'Abschuss = Stromschlag. Jeder Stromschlag gibt {amount} m/s Schub, mit 30 % Chance folgt ein Nachschlag.',
    flavor: 'Opa sagt, das sei eine Gurke. Die Gurke sieht das anders.',
    triggers: [
      { on: 'launch', do: [{ fx: 'emit', event: 'shock', data: { source: 'zitteraal' } }] },
      {
        on: 'shock',
        limit: { cooldown: 1.5 },
        do: [
          { fx: 'thrust', amount: 5 },
          { fx: 'chance', p: 0.3, then: [{ fx: 'emit', event: 'shock', data: { source: 'zitteraal' } }] },
        ],
      },
    ],
  },

  // ───────────── GYRO ─────────────
  {
    id: 'gyro_buerodrehstuhl',
    name: 'Opas Bürodrehstuhl',
    icon: '💺',
    rarity: 'common',
    tags: ['gyro'],
    pool: 'base',
    desc: 'Saltos 10 % schneller, beim Abschuss ein Dreh-Schubs. Ab dem 2. Salto im Sprung: Fähigkeiten laden 25 % nach (alle 3 s).',
    flavor: 'Quietscht bei jeder Umdrehung. Opa nennt das Feedback.',
    stats: { flipSpeed: { mul: 0.1 } },
    triggers: [
      { on: 'launch', do: [{ fx: 'spin', amount: 3 }] },
      { on: 'flip', if: { minCount: 2 }, limit: { cooldown: 3 }, do: [{ fx: 'refill', pct: 0.25 }] },
    ],
  },
  {
    id: 'gyro_wasserwaage',
    name: 'Wasserwaage aus dem Keller',
    icon: '📏',
    rarity: 'common',
    tags: ['gyro'],
    pool: 'base',
    desc: 'Perfekte Landung 1,5° großzügiger. Perfekt nach Salto gelandet: +{amount} Schrauben, +3 Haltbarkeit (alle 2 s).',
    flavor: 'Die Blase ist mittig. Der Rest der Welt nicht.',
    stats: { perfectLandDeg: { add: 1.5 } },
    triggers: [
      { on: 'perfectLanding', if: { minCount: 1 }, limit: { cooldown: 2 }, do: [{ fx: 'bolts', amount: 3 }, { fx: 'heal', amount: 3 }] },
    ],
  },
  {
    id: 'gyro_jojo',
    name: 'Jo-Jo vom Jahrmarkt',
    icon: '🪀',
    rarity: 'common',
    tags: ['gyro'],
    pool: 'r_gyro_1',
    desc: 'Vorwärtssalto: +{amount} m/s Schub. Rückwärtssalto: Hüpfer nach oben (5 m/s). Je max. 1× pro s.',
    flavor: 'Runter geht’s von allein. Rauf jetzt auch.',
    triggers: [
      { on: 'flip', if: { dir: 'front' }, limit: { cooldown: 1 }, do: [{ fx: 'thrust', amount: 3 }] },
      { on: 'flip', if: { dir: 'back' }, limit: { cooldown: 1 }, do: [{ fx: 'jump', amount: 5 }] },
    ],
  },
  {
    id: 'gyro_fahrraddynamo',
    name: 'Fahrraddynamo',
    icon: '💡',
    rarity: 'rare',
    tags: ['gyro', 'elektro'],
    pool: 'r_gyro_1',
    desc: 'Saltos drehen 12 % schneller. Jeder Salto erzeugt einen Stromschlag (alle 2 s).',
    flavor: 'Je schneller du dich drehst, desto heller wird’s.',
    stats: { flipSpeed: { mul: 0.12 } },
    triggers: [
      { on: 'flip', limit: { cooldown: 2 }, do: [{ fx: 'emit', event: 'shock', data: { source: 'dynamo' } }] },
    ],
  },
  {
    id: 'gyro_karussellpferd',
    name: 'Karussellpferd vom Rummel',
    icon: '🎠',
    rarity: 'rare',
    tags: ['gyro'],
    pool: 'r_gyro_2',
    desc: 'Luftsteuerung +12 %. Ab dem 2. Salto im Sprung je +{amount} Schrauben; danach perfekt gelandet: Gratis-Boost {dur} s.',
    flavor: 'Hat noch drei Beine und eine Mission.',
    stats: { airControl: { mul: 0.12 } },
    triggers: [
      { on: 'flip', if: { minCount: 2 }, do: [{ fx: 'bolts', amount: 2 }] },
      { on: 'perfectLanding', if: { minCount: 2 }, do: [{ fx: 'boost', dur: 1 }] },
    ],
  },
  {
    id: 'gyro_omas_kreisel',
    name: 'Kreisel aus Omas Nachttisch',
    icon: '🌀',
    rarity: 'epic',
    tags: ['gyro'],
    pool: 'r_gyro_2',
    desc: 'Saltos gehen 30 % schneller. Jeder Salto senkt die Hitze um {amount}.',
    flavor: 'Lag 40 Jahre neben dem Gebiss. Dreht wie am ersten Tag.',
    stats: { flipSpeed: { mul: 0.3 } },
    triggers: [
      { on: 'flip', do: [{ fx: 'cool', amount: 15 }] },
    ],
  },
  {
    id: 'gyro_plattenspieler',
    name: 'Plattenspieler aus der Disco',
    icon: '💿',
    rarity: 'epic',
    tags: ['gyro'],
    pool: 'r_gyro_3',
    desc: 'Jeder Salto: +{amount} m/s und +5 % Drehtempo bis Etappenende (max. +30 %). Perfekt nach 3+ Saltos: Explosion!',
    flavor: 'Läuft auf 33, 45 und – seit dem Umbau – 3000 Touren.',
    triggers: [
      {
        on: 'flip',
        limit: { cooldown: 1 },
        do: [{ fx: 'thrust', amount: 3 }, { fx: 'stack', stat: 'flipSpeed', mul: 0.05, max: 0.3 }],
      },
      { on: 'perfectLanding', if: { minCount: 3 }, do: [{ fx: 'explosion', amount: 10 }, { fx: 'slowmo', dur: 0.6 }] },
    ],
  },
];
