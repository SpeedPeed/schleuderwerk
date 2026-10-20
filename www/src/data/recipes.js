// Schleuderwerk 2 – Paket C: Rezepte (zwei bestimmte Items → Bonus). Die Texte der Synergie-Oberfläche stehen in
// data/texts.js (TXT.synergy).
// Reine Daten (Vokabular wie Items, ARCHITEKTUR.md 4.6/4.11). Ein Rezept ist aktiv, solange BEIDE Items im Rucksack sind
// (★1 reicht, Hybride zählen für beide Teile); es wirkt wie ein Set-Bonus mit eigener Trigger-Quelle (kind 'recipe',
// items/recipes.js → activeRecipes/buildRecipeParts) und wird mit der Tag-Stärke seines stärkeren Tags skaliert.
//
// Rezept: { id, name, icon, items: [itemA, itemB], desc, flavor, stats?, triggers?, rules? }
//   15 Rezepte gehen mit dem Grundpool, 5 brauchen ein Item aus der Forschung r_<tag>_1.
// Kein {Platzhalter} in desc (Zahlen stehen fest im Text, Rezepte haben keine ★-Stufe).

export const RECIPES = [
  {
    id: 'dauerfeuer',
    name: 'Dauerfeuer-Zündanlage',
    icon: '🕯️',
    items: ['feuer_zuendkerzen_kette', 'feuer_grillanzuender'],
    desc: 'Über 50 Hitze tankt jede Boost-Sekunde 14 zurück – der Boost brennt fast umsonst. Jeder Salto heizt 10.',
    flavor: 'Opas Grillabend, jetzt mit Rückstoß.',
    triggers: [
      { on: 'boostSecond', if: { heatAbove: 50 }, do: [{ fx: 'fuel', amount: 14 }] },
      { on: 'flip', limit: { cooldown: 1 }, do: [{ fx: 'heat', amount: 10 }] },
    ],
  },
  {
    id: 'gewittermaschine',
    name: 'Gewittermaschine',
    icon: '🌩️',
    items: ['elektro_blitzableiter', 'gyro_fahrraddynamo'],
    desc: 'Jede Landung: Doppel-Stromschlag (alle 4 s). Jeder Stromschlag: +2 m/s.',
    flavor: 'Der Dynamo lädt, der Blitzableiter entlädt. Opa klatscht.',
    triggers: [
      { on: 'landing', limit: { cooldown: 4 }, do: [{ fx: 'emit', event: 'shock', data: { source: 'gewittermaschine' } }, { fx: 'emit', event: 'shock', data: { source: 'gewittermaschine' } }] },
      { on: 'shock', limit: { cooldown: 0.5 }, do: [{ fx: 'thrust', amount: 2 }] },
    ],
  },
  {
    id: 'pogo_perpetuum',
    name: 'Pogo-Perpetuum',
    icon: '🦘',
    items: ['gyro_jojo', 'hydraulik_sofa_sprungfeder'],
    desc: 'Jeder Salto federt dich hoch: Sprung 4 m/s (alle 1,5 s). Harte Landung: +3 m/s.',
    flavor: 'Hüpft, dreht, hüpft. Bis zum Mond oder zum Nachbarn.',
    triggers: [
      { on: 'flip', limit: { cooldown: 1.5 }, do: [{ fx: 'jump', amount: 4 }] },
      { on: 'landing', if: { minImpact: 7 }, limit: { cooldown: 2 }, do: [{ fx: 'thrust', amount: 3 }] },
    ],
  },
  {
    id: 'wechselbad',
    name: 'Wechselbad',
    icon: '🛁',
    items: ['eis_kuehlerschlauch', 'feuer_buegeleisen'],
    desc: 'Heiß-kalt: Boost-Start über 60 Hitze knallt (Explosion 6 m/s, alle 3 s). Explosionen kühlen 10.',
    flavor: 'Wie Sauna, nur mit Auspuff.',
    triggers: [
      { on: 'boost', if: { heatAbove: 60 }, limit: { cooldown: 3 }, do: [{ fx: 'explosion', amount: 6 }] },
      { on: 'explosion', limit: { cooldown: 1.5 }, do: [{ fx: 'cool', amount: 10 }] },
    ],
  },
  {
    id: 'badewannen_rutsche',
    name: 'Badewannen-Rutsche',
    icon: '🫧',
    items: ['eis_bohnerwachs', 'gummi_gummiente'],
    desc: '−10 % Rollreibung. Kalt gelandet (unter 30 Hitze): Gratis-Boost 0,5 s (alle 3 s).',
    flavor: 'Quietsch-Entchen auf Bohnerwachs. Physik weint.',
    stats: { rollFriction: { mul: -0.1 } },
    triggers: [
      { on: 'landing', if: { heatBelow: 30 }, limit: { cooldown: 3 }, do: [{ fx: 'boost', dur: 0.5 }] },
    ],
  },
  {
    id: 'schrottmagnet_xxl',
    name: 'Schrottmagnet XXL',
    icon: '🧲',
    items: ['magnet_hufeisen_magnet', 'schrott_gullydeckel'],
    desc: 'Magnet +1 m. Kollision: 3 s Magnetfeld (8 m) und 3 Schrauben (alle 2 s).',
    flavor: 'Zieht Schrauben an. Und Gullydeckel. Und Ärger.',
    stats: { magnet: { add: 1 } },
    triggers: [
      { on: 'collision', limit: { cooldown: 2 }, do: [{ fx: 'magnet', radius: 8, dur: 3 }, { fx: 'bolts', amount: 3 }] },
    ],
  },
  {
    id: 'doppelter_boden',
    name: 'Doppelter Boden',
    icon: '🎩',
    items: ['gluck_kleeblatt', 'gluck_gluckspfennig'],
    desc: '+1 Glück. Jede Landung: 20 % Chance auf Gratis-Boost 1 s (alle 2 s).',
    flavor: 'Im Futter steckt immer noch ein Pfennig.',
    stats: { luck: { add: 1 } },
    triggers: [
      { on: 'landing', limit: { cooldown: 2 }, do: [{ fx: 'chance', p: 0.2, then: [{ fx: 'boost', dur: 1 }] }] },
    ],
  },
  {
    id: 'spruehdosen_stufe',
    name: 'Sprühdosen-Stufe',
    icon: '🧴',
    items: ['rakete_colaflaschen_rakete', 'rakete_haarspray_turbo'],
    desc: '+8 % Boost-Schub. Perfekter Abschuss zündet die Sprühdose: Gratis-Boost 1,2 s.',
    flavor: 'Cola, Haarspray, Funke. Was soll schon passieren?',
    stats: { boostThrust: { mul: 0.08 } },
    triggers: [
      { on: 'perfectLaunch', do: [{ fx: 'boost', dur: 1.2 }] },
    ],
  },
  {
    id: 'chefsessel',
    name: 'Chefsessel-Gyroskop',
    icon: '🪑',
    items: ['gyro_buerodrehstuhl', 'gyro_wasserwaage'],
    desc: 'Perfekt nach Salto gelandet: Gratis-Boost 0,8 s und +2 Haltbarkeit (alle 2 s).',
    flavor: 'Der Chef dreht sich. Die Waage sagt: gerade.',
    triggers: [
      { on: 'perfectLanding', if: { minCount: 1 }, limit: { cooldown: 2 }, do: [{ fx: 'boost', dur: 0.8 }, { fx: 'heal', amount: 2 }] },
    ],
  },
  {
    id: 'rammbock',
    name: 'Rammbock',
    icon: '🐏',
    items: ['hydraulik_trabi_stossdaempfer', 'hydraulik_pressenstempel'],
    desc: 'Landung ab 9 m/s: zweite Stoßwelle (Explosion 6 m/s, alle 4 s). Explosionen: 3 s Panzerung +15 %.',
    flavor: 'Trabi trifft Presse. Der Trabi gewinnt.',
    triggers: [
      { on: 'landing', if: { minImpact: 9 }, limit: { cooldown: 4 }, do: [{ fx: 'explosion', amount: 6 }] },
      { on: 'explosion', limit: { cooldown: 3 }, do: [{ fx: 'buff', stat: 'armor', add: 0.15, dur: 3 }] },
    ],
  },
  {
    id: 'super_flummi',
    name: 'Super-Flummi',
    icon: '🔮',
    items: ['gummi_flummi', 'gluck_flummi'],
    desc: 'Abprallkraft +15 %. Jeder Abpraller: Gratis-Boost 0,5 s (alle 2 s).',
    flavor: 'Zwei Flummis, ein Schicksal: hoch.',
    stats: { bounce: { add: 0.15 } },
    triggers: [
      { on: 'bounce', limit: { cooldown: 2 }, do: [{ fx: 'boost', dur: 0.5 }] },
    ],
  },
  {
    id: 'kuehlakku',
    name: 'Kühlakku',
    icon: '🔋',
    items: ['elektro_fernbedienungs_akku', 'elektro_peltier_kuehlbox'],
    desc: 'Jeder Stromschlag kühlt 10 und lädt alle Fähigkeiten um 15 % (alle 2 s).',
    flavor: 'Hält Bier kalt und die Fernbedienung warm.',
    triggers: [
      { on: 'shock', limit: { cooldown: 2 }, do: [{ fx: 'cool', amount: 10 }, { fx: 'refill', pct: 0.15 }] },
    ],
  },
  {
    id: 'ghettoblaster',
    name: 'Ghettoblaster',
    icon: '📻',
    items: ['magnet_kofferradio_lautsprecher', 'gummi_gummistiefel'],
    desc: 'Jeder Stromschlag: 2 s Magnetfeld (6 m) und 2 Schrauben (alle 2 s). Abpraller funken öfter.',
    flavor: 'Spielt nur noch Rauschen. Aber laut.',
    triggers: [
      { on: 'shock', limit: { cooldown: 2 }, do: [{ fx: 'magnet', radius: 6, dur: 2 }, { fx: 'bolts', amount: 2 }] },
      { on: 'bounce', limit: { cooldown: 2.5 }, do: [{ fx: 'emit', event: 'shock', data: { source: 'ghettoblaster' } }] },
    ],
  },
  {
    id: 'schrottpresse_to_go',
    name: 'Schrottpresse to go',
    icon: '🥫',
    items: ['schrott_altmetall_eimer', 'schrott_schrottwuerfel'],
    desc: 'Schrott-Pickups: +1 % Boost-Schub (max. 20 %). Jede geschaffte Etappe: 4 Schrauben.',
    flavor: 'Presst Dosen, Bleche und Erwartungen.',
    triggers: [
      { on: 'pickup', if: { kind: 'scrap' }, do: [{ fx: 'stack', stat: 'boostThrust', mul: 0.01, max: 0.2 }] },
      { on: 'stageClear', do: [{ fx: 'bolts', amount: 4 }] },
    ],
  },
  {
    id: 'kettenkarussell',
    name: 'Kettenkarussell',
    icon: '🎠',
    items: ['gyro_karussellpferd', 'rakete_feuerrad'],
    desc: 'Ab dem 2. Salto im Sprung: Feuerrad-Explosion 6 m/s (alle 2 s).',
    flavor: 'Der Rummel ist zu Ende. Das Karussell nicht.',
    triggers: [
      { on: 'flip', if: { minCount: 2 }, limit: { cooldown: 2 }, do: [{ fx: 'explosion', amount: 6 }] },
    ],
  },
  {
    id: 'grossfeuerwerk',
    name: 'Großfeuerwerk',
    icon: '🎊',
    items: ['feuer_silvester_restposten', 'rakete_feuerwerksbatterie'],
    desc: 'Jede Explosion: 35 % Chance auf eine Nachexplosion (5 m/s, alle 1,5 s).',
    flavor: 'Silvester 1999 – NICHT ÖFFNEN. Zu spät.',
    triggers: [
      { on: 'explosion', limit: { cooldown: 1.5 }, do: [{ fx: 'chance', p: 0.35, then: [{ fx: 'explosion', amount: 5 }] }] },
    ],
  },
  {
    id: 'disco_kreisel',
    name: 'Disco-Kreisel',
    icon: '🪩',
    items: ['gyro_omas_kreisel', 'gyro_plattenspieler'],
    desc: 'Jeder Salto: Gratis-Boost 0,4 s (alle 1,5 s). Saltos +10 % schneller.',
    flavor: 'Oma tanzt. Der Kreisel auch.',
    stats: { flipSpeed: { mul: 0.1 } },
    triggers: [
      { on: 'flip', limit: { cooldown: 1.5 }, do: [{ fx: 'boost', dur: 0.4 }] },
    ],
  },
  {
    id: 'huepfender_lowrider',
    name: 'Hüpfender Lowrider',
    icon: '🚙',
    items: ['hydraulik_gasfeder', 'hydraulik_lowrider_pumpe'],
    desc: 'Harte Landung (ab 8 m/s): Gratis-Boost 1 s und Sprung 5 m/s (alle 3 s).',
    flavor: 'Hüpft vor jeder Ampel. Auch ohne Ampel.',
    triggers: [
      { on: 'landing', if: { minImpact: 8 }, limit: { cooldown: 3 }, do: [{ fx: 'boost', dur: 1 }, { fx: 'jump', amount: 5 }] },
    ],
  },
  {
    id: 'teilchenkanone',
    name: 'Teilchenkanone',
    icon: '🔭',
    items: ['magnet_experimentierkasten', 'magnet_teilchenbeschleuniger'],
    desc: 'Jeder 8. Pickup in der Luft: Explosion 8 m/s und Gratis-Boost 1 s.',
    flavor: 'Das Experiment ist gelungen. Leider.',
    triggers: [
      { on: 'pickup', if: { airborne: true }, do: [{ fx: 'charge', key: 'rezept_teilchenkanone', n: 1, at: 8, then: [{ fx: 'explosion', amount: 8 }, { fx: 'boost', dur: 1 }] }] },
    ],
  },
  {
    id: 'kuehlkette',
    name: 'Kühlkette',
    icon: '🍦',
    items: ['eis_tiefkuehltruhe', 'eis_trockeneis'],
    desc: 'Gratis-Boost unter 30 Hitze: Eisstoß (Explosion 5 m/s, alle 2 s). Kühlung +15 %.',
    flavor: 'Die Kühlkette wurde nie unterbrochen. Die Kiste schon.',
    stats: { coolRate: { mul: 0.15 } },
    triggers: [
      { on: 'boost', if: { free: true, heatBelow: 30 }, limit: { cooldown: 2 }, do: [{ fx: 'explosion', amount: 5 }] },
    ],
  },
];

