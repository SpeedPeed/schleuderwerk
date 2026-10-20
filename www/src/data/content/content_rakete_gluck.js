// Schleuderwerk 2 – Inhalte für die Tags Rakete und Glück (reine Daten, siehe ARCHITEKTUR.md 4.6/4.7/4.11)
// Ketten: Stromschlag → Explosion → Ladung → Gratis-Boost → Drall → Salto (Rakete) ·
//         Landung/Abpraller → Zufallstreffer, doppelt gemeldete Ereignisse, bessere Beute (Glück).
// stack.max ist eine Wertobergrenze (|Summe| ≤ max, wird nicht mit ★ skaliert).

export const TAGS = {
  rakete: {
    name: 'Rakete',
    icon: '🚀',
    color: '#4d7cff',
    desc: 'Volle Pulle nach vorn: stärkere Boosts, wuchtigere Abschüsse, Explosionen mit Rückenwind und sparsamer Verbrauch.',
    sets: {
      2: {
        desc: '+10 % Boost-Schub, +5 % Abschusstempo, −10 % Verbrauch. Abschuss zündet eine Stufe: Gratis-Boost 0,8 s.',
        stats: { boostThrust: { mul: 0.1 }, launchSpeed: { mul: 0.05 }, boostFuel: { mul: -0.1 } },
        triggers: [
          { on: 'launch', do: [{ fx: 'boost', dur: 0.8 }] },
        ],
      },
      3: {
        desc: 'Stufenzündung: Jede 2. Boost-Sekunde Explosion (8 m/s). Explosionen tanken 8 und zünden 0,7 s Gratis-Boost (alle 2 s).',
        triggers: [
          {
            on: 'boostSecond',
            do: [{ fx: 'charge', key: 'set_rakete_stufe', n: 1, at: 2, then: [{ fx: 'explosion', amount: 8 }] }],
          },
          { on: 'explosion', limit: { cooldown: 2 }, do: [{ fx: 'fuel', amount: 8 }, { fx: 'boost', dur: 0.7 }] },
        ],
      },
      5: {
        desc: 'Mehrstufenrakete: Beim Boosten greift die Tempo-Bremse 30 % später. Gratis-Boost: +6 % Schub (max. 36 %).',
        rules: { boostOvercap: true },
        ruleSpec: {
          boostOvercap:
            'Solange ein Boost aktiv ist (Fähigkeit oder Gratis-Boost), rechnet die Physik die weiche Tempo-Grenze mit speedSoftCap × 1,3 statt speedSoftCap: thrustFactor = 1 / (1 + (v / (speedSoftCap × 1,3))^softCapPow). Das gilt für den Boost-Schub und für Sofort-Schub aus thrust- und explosion-Effekten, die während des aktiven Boosts ausgeführt werden. Die harte Grenze PHYSICS.hardSpeedCap bleibt unverändert. Ohne aktiven Boost gilt sofort wieder die normale Grenze (kein Abbremsen, nur weniger Schubwirkung). Löst kein eigenes Ereignis aus. Mit setBonusDouble: Faktor 1,6. Auswertung: physics/vehicle.js bei der Berechnung von thrustFactor.',
        },
        triggers: [
          { on: 'fuelEmpty', limit: { perStage: 1 }, do: [{ fx: 'fuel', amount: 25 }, { fx: 'explosion', amount: 8 }] },
          { on: 'boost', if: { free: true }, limit: { cooldown: 1 }, do: [{ fx: 'stack', stat: 'boostThrust', mul: 0.06, max: 0.36 }] },
        ],
      },
    },
  },

  gluck: {
    name: 'Glück',
    icon: '🍀',
    color: '#3fbf5f',
    desc: 'Das Glück des Tüftlers: Zufallstreffer, doppelte Auslösungen, bessere Beute und Schrauben, die einfach so auftauchen.',
    sets: {
      2: {
        desc: '+1 Glück, Rerolls 25 % billiger. Jede Landung: 20 % Chance auf +3 m/s und 2 Schrauben.',
        stats: { luck: { add: 1 }, rerollDiscount: { add: 0.25 } },
        triggers: [
          { on: 'landing', limit: { cooldown: 1 }, do: [{ fx: 'chance', p: 0.2, then: [{ fx: 'thrust', amount: 3 }, { fx: 'bolts', amount: 2 }] }] },
        ],
      },
      3: {
        desc: 'Glückspilz: Landung 45 % Chance auf Gratis-Boost 0,8 s + 2 Schrauben (alle 2 s). Gratis-Boost: 30 % Glücksknall.',
        triggers: [
          {
            on: 'landing',
            limit: { cooldown: 2 },
            do: [
              {
                fx: 'chance',
                p: 0.45,
                then: [
                  { fx: 'boost', dur: 0.8 },
                  { fx: 'bolts', amount: 2 },
                ],
              },
            ],
          },
          { on: 'boost', if: { free: true }, limit: { cooldown: 2 }, do: [{ fx: 'chance', p: 0.3, then: [{ fx: 'explosion', amount: 5 }] }] },
        ],
      },
      5: {
        desc: 'Kleeblatt-Echo: Item-Effekte 30 % doppelt. +2 Glück, +15 % Boost-Schub. Landung: 30 % auf 1 s Gratis-Boost.',
        stats: { luck: { add: 2 }, boostThrust: { mul: 0.15 } },
        triggers: [
          { on: 'landing', limit: { cooldown: 2 }, do: [{ fx: 'chance', p: 0.3, then: [{ fx: 'boost', dur: 1 }] }] },
        ],
        rules: { luckyEcho: true },
        ruleSpec: {
          luckyEcho:
            'Wenn eine Quelle vom Typ item (nicht set, chassis oder part) einen Trigger auslöst (Bedingungen erfüllt, Limit nicht erschöpft), würfelt die Trigger-Engine mit ctx.rng: Mit Wahrscheinlichkeit p = RULES.luckyEcho.p (Paket C: 0,3) + luck × balance.ITEMS.luckPerPoint (höchstens RULES.luckyEcho.pMax, 0,6) wird die komplette do-Liste dieses Triggers unmittelbar danach ein zweites Mal ausgeführt – gleiche Kettentiefe, gleiche Ereignisdaten, Limits/Cooldowns werden für das Echo weder geprüft noch verbraucht; charge-Zähler und stack-Effekte zählen beide Ausführungen. Ein Echo kann kein weiteres Echo auslösen, und jedes Item kann höchstens 1 Echo pro 1 s erzeugen. Das HUD zeigt am Item-Symbol „×2“ mit Kleeblatt. Mit setBonusDouble: Basis 0,3, höchstens 0,7. Auswertung: items/triggerEngine.js beim Ausführen der do-Liste einer Item-Quelle.',
        },
      },
    },
  },
};

export const ITEMS = [
  // ───────────── RAKETE ─────────────
  {
    id: 'rakete_colaflaschen_rakete',
    name: 'Colaflaschen-Rakete',
    icon: '🥤',
    rarity: 'common',
    tags: ['rakete'],
    pool: 'base',
    desc: '+8 % Abschusstempo. Perfekter Abschuss: zusätzlich +{amount} m/s Schub.',
    flavor: 'Mit der Fahrradpumpe auf 6 bar. Opa hält Abstand.',
    stats: { launchSpeed: { mul: 0.08 } },
    triggers: [{ on: 'perfectLaunch', do: [{ fx: 'thrust', amount: 4 }] }],
  },
  {
    id: 'rakete_haarspray_turbo',
    name: 'Omas Haarspray-Turbo',
    icon: '💇',
    rarity: 'common',
    tags: ['rakete'],
    pool: 'base',
    desc: '+10 % Boost-Schub. Boost-Start in der Luft: zusätzlich +{amount} m/s (alle 3 s).',
    flavor: 'Hält die Dauerwelle bei Windstärke zwölf.',
    stats: { boostThrust: { mul: 0.1 } },
    triggers: [{ on: 'boost', if: { airborne: true }, limit: { cooldown: 3 }, do: [{ fx: 'thrust', amount: 3 }] }],
  },
  {
    id: 'rakete_reservekanister',
    name: 'Reservekanister',
    icon: '🛟',
    rarity: 'common',
    tags: ['rakete'],
    pool: 'base',
    desc: 'Boosten kostet 10 % weniger. Tank leer? Einmal pro Etappe gluckert es: +{amount} Treibstoff.',
    flavor: 'Riecht nach Rasenmäher und Werkzeugschuppen.',
    stats: { boostFuel: { mul: -0.1 } },
    triggers: [{ on: 'fuelEmpty', limit: { perStage: 1 }, do: [{ fx: 'fuel', amount: 20 }] }],
  },
  {
    id: 'rakete_zuendgeraet',
    name: 'Modellraketen-Zündgerät',
    icon: '🕹️',
    rarity: 'rare',
    tags: ['rakete', 'elektro'],
    pool: 'r_rakete_1',
    desc: '+12 % Boost-Schub. Jeder Stromschlag zündet eine Modellrakete: Explosion {amount} m/s (alle 2 s).',
    flavor: 'Zwei Drähte, ein Knopf, null Sicherheitsabstand.',
    stats: { boostThrust: { mul: 0.12 } },
    triggers: [{ on: 'shock', limit: { cooldown: 2 }, do: [{ fx: 'explosion', amount: 5 }] }],
  },
  {
    id: 'rakete_feuerrad',
    name: 'Feuerrad vom Gartenfest',
    icon: '🎇',
    rarity: 'rare',
    tags: ['rakete', 'gyro'],
    pool: 'base',
    desc: 'Jeder Boost-Start gibt dir einen Rückwärtsdrall ({amount} rad/s, alle 2 s). Jeder Salto: +3 m/s Schub (max. 1× pro s).',
    flavor: 'Hing am Wäschepfahl. Jetzt hängt es an dir.',
    triggers: [
      { on: 'boost', limit: { cooldown: 2 }, do: [{ fx: 'spin', amount: 2.5 }] },
      { on: 'flip', limit: { cooldown: 1 }, do: [{ fx: 'thrust', amount: 3 }] },
    ],
  },
  {
    id: 'rakete_feuerwerksbatterie',
    name: 'Feuerwerksbatterie',
    icon: '🎆',
    rarity: 'epic',
    tags: ['rakete'],
    pool: 'base',
    desc: '+20 % Boost-Schub. Jede 3. Explosion zündet die nächste Batterie: Gratis-Boost {dur} s.',
    flavor: '100 Schuss, davon 37 geprüft. Der Rest ist Überraschung.',
    stats: { boostThrust: { mul: 0.2 } },
    triggers: [
      {
        on: 'explosion',
        do: [{ fx: 'charge', key: 'rakete_batterie', n: 1, at: 3, then: [{ fx: 'boost', dur: 1.2 }] }],
      },
    ],
  },
  {
    id: 'rakete_mondrakete',
    name: 'Opas Mondrakete',
    icon: '🌙',
    rarity: 'epic',
    tags: ['rakete'],
    pool: 'r_rakete_1',
    desc: '−20 % Boost-Verbrauch. Abschuss zündet die Oberstufe: Gratis-Boost {dur} s. Gratis-Boosts: +6 % Schub (max. +30 %).',
    flavor: 'Seit 1969 im Bau. Dieses Jahr fliegt sie. Ganz bestimmt.',
    stats: { boostFuel: { mul: -0.2 } },
    triggers: [
      { on: 'launch', do: [{ fx: 'boost', dur: 1.5 }] },
      {
        on: 'boost',
        if: { free: true },
        limit: { cooldown: 1 },
        do: [{ fx: 'stack', stat: 'boostThrust', mul: 0.06, max: 0.3 }],
      },
    ],
  },

  // ───────────── GLÜCK ─────────────
  {
    id: 'gluck_kleeblatt',
    name: 'Vierblättriges Kleeblatt',
    icon: '🍀',
    rarity: 'common',
    tags: ['gluck'],
    pool: 'base',
    desc: '+1 Glück. Jede Landung: 20 % Chance auf {amount} Schrauben und 3 m/s Schub.',
    flavor: 'Im Bastelkeller gepresst, zwischen zwei Steuerbescheiden.',
    stats: { luck: { add: 1 } },
    triggers: [
      { on: 'landing', limit: { cooldown: 1 }, do: [{ fx: 'chance', p: 0.2, then: [{ fx: 'bolts', amount: 3 }, { fx: 'thrust', amount: 3 }] }] },
    ],
  },
  {
    id: 'gluck_gluckspfennig',
    name: 'Opas Glückspfennig',
    icon: '🪙',
    rarity: 'common',
    tags: ['gluck'],
    pool: 'base',
    desc: 'Händler 10 % billiger, im Laden {amount} Schrauben im Futter. Perfekter Abschuss: 30 % Chance auf {dur} s Gratis-Boost.',
    flavor: 'Seit 1962 in der Westentasche. Hat nie was gekauft.',
    stats: { shopDiscount: { add: 0.1 } },
    triggers: [
      { on: 'shopEnter', do: [{ fx: 'bolts', amount: 4 }] },
      { on: 'perfectLaunch', do: [{ fx: 'chance', p: 0.3, then: [{ fx: 'boost', dur: 0.6 }] }] },
    ],
  },
  {
    id: 'gluck_flummi',
    name: 'Flummi mit Glücksklee',
    icon: '🏀',
    rarity: 'common',
    tags: ['gluck', 'gummi'],
    pool: 'base',
    desc: '+1 Glück. Jeder Abpraller: 30 % Chance auf Hüpfer ({amount} m/s) und 2 Schrauben (alle 2 s).',
    flavor: 'Mit eingegossenem Kleeblatt. Springt immer dahin, wo’s glänzt.',
    stats: { luck: { add: 1 } },
    triggers: [
      {
        on: 'bounce',
        limit: { cooldown: 2 },
        do: [
          {
            fx: 'chance',
            p: 0.3,
            then: [
              { fx: 'jump', amount: 5 },
              { fx: 'bolts', amount: 2 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'gluck_einarmiger_bandit',
    name: 'Einarmiger Bandit',
    icon: '🎰',
    rarity: 'rare',
    tags: ['gluck'],
    pool: 'base',
    desc: 'Landung zieht am Hebel (alle 3 s): je 25 % Chance auf Gratis-Boost {dur} s, 4 Schrauben, +5 Haltbarkeit.',
    flavor: 'Aus der Dorfkneipe. Der Wirt fragt nicht, wir sagen nichts.',
    triggers: [
      {
        on: 'landing',
        limit: { cooldown: 3 },
        do: [
          { fx: 'chance', p: 0.25, then: [{ fx: 'boost', dur: 1 }] },
          { fx: 'chance', p: 0.25, then: [{ fx: 'bolts', amount: 4 }] },
          { fx: 'chance', p: 0.25, then: [{ fx: 'heal', amount: 5 }] },
        ],
      },
    ],
  },
  {
    id: 'gluck_rabattmarkenheft',
    name: 'Omas Rabattmarkenheft',
    icon: '📒',
    rarity: 'rare',
    tags: ['gluck'],
    pool: 'r_gluck_1',
    desc: '+1 Item zur Wahl. Rerolls 30 % billiger. Gold-Medaille: +{amount} Schrauben.',
    flavor: 'Noch 3 Marken bis zum Fondue-Set. Seit 1983.',
    stats: { itemChoices: { add: 1 }, rerollDiscount: { add: 0.3 } },
    triggers: [{ on: 'stageClear', if: { medal: 'gold' }, do: [{ fx: 'bolts', amount: 5 }] }],
  },
  {
    id: 'gluck_faxgeraet',
    name: 'Faxgerät vom Flohmarkt',
    icon: '📠',
    rarity: 'epic',
    tags: ['gluck'],
    pool: 'base',
    desc: '+1 Glück. Stromschlag, Explosion, Gratis-Boost: 35 % Chance, dass alle Items doppelt reagieren (je alle 2 s).',
    flavor: 'Piept, rattert und schickt alles zweimal. Wie Tante Gerda.',
    stats: { luck: { add: 1 } },
    triggers: [
      {
        on: 'shock',
        limit: { cooldown: 2 },
        do: [{ fx: 'chance', p: 0.35, then: [{ fx: 'emit', event: 'shock', data: { source: 'faxgeraet' } }] }],
      },
      {
        on: 'explosion',
        limit: { cooldown: 2 },
        do: [{ fx: 'chance', p: 0.35, then: [{ fx: 'emit', event: 'explosion', data: { amount: 0 } }] }],
      },
      {
        on: 'boost',
        if: { free: true },
        limit: { cooldown: 2 },
        do: [{ fx: 'chance', p: 0.35, then: [{ fx: 'emit', event: 'boost', data: { free: true, source: 'faxgeraet' } }] }],
      },
    ],
  },
  {
    id: 'gluck_winkekatze',
    name: 'Winkekatze vom Imbiss',
    icon: '🐈',
    rarity: 'epic',
    tags: ['gluck'],
    pool: 'r_gluck_1',
    desc: '+2 Glück, +20 % Schrauben. Gold-Medaille: 20 % Chance, dass ein zufälliges Item ★+1 bekommt.',
    flavor: 'Winkt seit 30 Jahren. Batterie nie gewechselt. Unheimlich.',
    stats: { luck: { add: 2 }, boltGain: { mul: 0.2 } },
    triggers: [{ on: 'stageClear', if: { medal: 'gold' }, do: [{ fx: 'chance', p: 0.2, then: [{ fx: 'upgradeItem' }] }] }],
  },
];
