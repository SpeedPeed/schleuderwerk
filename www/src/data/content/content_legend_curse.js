// Schleuderwerk 2 – Legendäre und verfluchte Items (reine Daten, siehe ARCHITEKTUR.md 4.6/4.10/4.11)
// Legendär: jedes Item verändert eine Regel (rules + ruleSpec).
// Verflucht: starker Bonus + echter Nachteil im Feld curse (Schwarzmarkt: bezahlt mit max. Haltbarkeit/max. Treibstoff/Kernen).
// Ketten: Überhitzung → Explosion · Salto → Gratis-Boost · Stromschlag ↔ Gratis-Boost · holprige Landung → Abpraller → Schub/Schrauben.
// ★-Stufen (Werkbank) skalieren nur den Bonus-Teil eines verfluchten Items: curse.stats und curse.triggers werden NICHT
// mit dem Stufenfaktor skaliert (Fluch bleibt bei ★1-Werten).

export const ITEMS = [
  // ═════════════ LEGENDÄR ═════════════

  // ── r_legend_1 ──
  {
    id: 'feuer_perpetuum_mobile',
    name: 'Perpetuum Mobile',
    icon: '♾️',
    rarity: 'legendary',
    tags: ['feuer'],
    pool: 'r_legend_1',
    desc: 'Antrieb und Boost erzeugen Hitze, statt Treibstoff zu verbrauchen. Überhitzung knallt und tankt {amount} – Notreserve.',
    flavor: 'Läuft ewig. Bisher jedenfalls drei Minuten.',
    rules: { heatIsFuel: true },
    ruleSpec: {
      heatIsFuel:
        'Antrieb und Boost (Fähigkeit) verbrauchen keinen Treibstoff mehr. Stattdessen wird ihr Treibstoffverbrauch (driveFuel bzw. boostFuel pro Sekunde) zusätzlich zur normalen Hitze (driveHeat/boostHeat) als Hitze addiert: 1 Treibstoff = 1 Hitze, multipliziert mit heatGain; eine negative boostHeat (z. B. Feuerlöscher-Rakete) zählt beim Boosten dabei als 0, die Verbrauchs-Hitze lässt sich also nicht wegrechnen. Gratis-Boosts bleiben kostenlos und erzeugen nur ihre normale Hitze; andere Fähigkeiten zahlen weiter Treibstoff. Notbetrieb: Während der 2-s-Überhitzungssperre sowie solange die Hitze mit noOverheat oder heatIsResource auf heatMax steht, laufen Antrieb und Boost aus dem Tank (normaler Treibstoffverbrauch, in dieser Zeit keine Verbrauchs-Hitze); ist der Tank leer, stoppen sie (fuelEmpty wird erst dann ausgelöst). Damit gibt es in keiner Kombination Dauer-Boost ohne Kosten. Überhitzungsschaden (5) und Hitzeabfall auf 50 bleiben, wo sie sonst gelten, unverändert. Auswertung: physics/vehicle.js im Verbrauchsschritt von Antrieb/Boost.',
    },
    triggers: [
      {
        on: 'overheat',
        limit: { cooldown: 2 },
        do: [
          { fx: 'fuel', amount: 20 },
          { fx: 'explosion', amount: 5 },
        ],
      },
    ],
  },
  {
    id: 'gyro_schiffskompass',
    name: 'Opas Schiffskompass',
    icon: '🧭',
    rarity: 'legendary',
    tags: ['gyro', 'gummi'],
    pool: 'r_legend_1',
    desc: 'Nach einem Salto wird aus einer Bruchlandung nur eine holprige. Holprige Landung: {amount} m/s hoch + Abpraller.',
    flavor: 'Zeigt nicht nach Norden, aber immer nach oben.',
    rules: { flipsNeverCrash: true },
    ruleSpec: {
      flipsNeverCrash:
        'Hat die Kiste seit dem letzten Abheben mindestens einen vollen Salto gedreht (landing.flips ≥ 1), wird eine Landung, die als "crash" eingestuft würde, als "bumpy" gewertet: landing wird mit quality "bumpy" ausgelöst, Bruchlandungs-Folgen (Bruch-Zusatzschaden, Tempoverlust, Überschlag) entfallen, die Kiste wird auf den Fahrbahnwinkel gesetzt. Der normale Aufprallschaden aus der Normalgeschwindigkeit über impactThreshold (abzüglich armor) gilt weiter. "perfect" und "clean" bleiben unverändert; ohne Salto normale Einstufung. Auswertung: physics/vehicle.js bei der Landungs-Klassifizierung.',
    },
    triggers: [
      {
        on: 'landing',
        if: { quality: 'bumpy' },
        limit: { cooldown: 2 },
        do: [
          { fx: 'jump', amount: 5 },
          { fx: 'emit', event: 'bounce', data: { source: 'schiffskompass' } },
        ],
      },
    ],
  },
  {
    id: 'gummi_huepfburg',
    name: 'Hüpfburg vom Kinderfest',
    icon: '🏰',
    rarity: 'legendary',
    tags: ['gummi'],
    pool: 'r_legend_1',
    desc: 'Hindernisse tun nicht mehr weh: Du hüpfst drüber, +4 m/s obendrauf. Jeder Abpraller bringt {amount} Schrauben.',
    flavor: 'Schuhe aus! Gilt auch für Badewannen.',
    rules: { obstacleBounce: true },
    ruleSpec: {
      obstacleBounce:
        'Trifft die Kiste ein Hindernis (Schrottberg, Schrottpresse, Kiste o. ä.; nicht Boden, nicht Schlucht), entsteht kein Schaden und weder ein damage- noch ein collision-Ereignis. Stattdessen prallt sie ab: Die senkrechte Geschwindigkeit wird auf mindestens +7 m/s (nach oben, über das Hindernis) gesetzt, die waagrechte bleibt erhalten und bekommt +4 m/s nach vorn (unterliegt Soft-Cap); ausgelöst wird bounce{source:"huepfburg"}. Dasselbe Hindernis kann danach 1 s lang nicht erneut getroffen werden. Ein vorhandenes shield wird dabei nicht verbraucht. Hat die Kiste zugleich wreckingBall und erfüllt dessen Tempo-Bedingung, gilt wreckingBall. Auswertung: physics/objects.js bei der Hindernis-Kollision.',
    },
    triggers: [{ on: 'bounce', limit: { cooldown: 1 }, do: [{ fx: 'bolts', amount: 2 }] }],
  },

  // ── r_legend_2 ──
  {
    id: 'rakete_wasserwaagen_rakete',
    name: 'Rakete mit Wasserwaage',
    icon: '🚀',
    rarity: 'legendary',
    tags: ['rakete', 'feuer'],
    pool: 'r_legend_2',
    desc: 'Boost schiebt immer waagrecht nach vorn, egal wie du dich drehst. Saltos zünden {dur} s Gratis-Boost (alle 2 s).',
    flavor: 'Silvester ’87. Opa hat die Libelle mit Heißkleber fixiert.',
    rules: { boostHorizontal: true },
    ruleSpec: {
      boostHorizontal:
        'In der Luft wirkt der Schub jedes Boosts (Fähigkeit und Gratis-Boost) immer exakt waagrecht in +x-Richtung, unabhängig vom Kistenwinkel; der Betrag bleibt unverändert (boostThrust × thrustFactor, Soft-Cap gilt). Die Kiste kann währenddessen frei neigen und Saltos drehen, ohne dass sich die Schubrichtung ändert; nach oben boosten ist damit nicht mehr möglich. Am Boden wirkt der Boost wie bisher entlang der Fahrbahn-Tangente. Die Effekte thrust und explosion sind nicht betroffen. Auswertung: physics/vehicle.js bei der Richtungsberechnung des Boost-Schubs.',
    },
    triggers: [{ on: 'flip', if: { airborne: true }, limit: { cooldown: 2 }, do: [{ fx: 'boost', dur: 0.6 }] }],
  },
  {
    id: 'magnet_levitron',
    name: 'Levitron vom Flohmarkt',
    icon: '🛸',
    rarity: 'legendary',
    tags: ['magnet', 'gyro'],
    pool: 'r_legend_2',
    desc: 'Perfekter Abschuss: −35 % Schwerkraft bis Bodenkontakt (max. 5 s), {dur} s Magnetfeld ({radius} m). Sweet Spot +15 %.',
    flavor: 'Schwebt seit 1994. Bitte nicht anpusten.',
    stats: { sweetSpotWidth: { mul: 0.15 } },
    rules: { perfectLaunchLowGrav: true },
    ruleSpec: {
      perfectLaunchLowGrav:
        'Nach einem perfekten Abschuss (Ereignis perfectLaunch) rechnet die Physik mit verringerter Schwerkraft (biome.gravity × 0,65), bis die Kiste zum ersten Mal den Boden berührt (erstes groundTouch oder landing) oder 5 s vergangen sind – je nachdem, was zuerst eintritt. Gilt nur für diesen ersten Flug nach dem Abschuss, nicht für spätere Sprünge. Luftwiderstand, Auftrieb, Wind und Thermik bleiben unverändert. Ohne perfekten Abschuss keine Wirkung. Auswertung: physics/vehicle.js bei der Schwerkraftberechnung im Luft-Schritt.',
    },
    triggers: [{ on: 'perfectLaunch', do: [{ fx: 'magnet', radius: 6, dur: 5 }] }],
  },
  {
    id: 'hydraulik_hubstuetzen',
    name: 'Wohnmobil-Hubstützen',
    icon: '🚐',
    rarity: 'legendary',
    tags: ['hydraulik'],
    pool: 'r_legend_2',
    desc: 'Jede Landung zählt als perfekt – auch die übelste. Dafür wirkt jeder Schaden doppelt.',
    flavor: 'Stellt das Wohnmobil gerade. Und dich auch.',
    rules: { allLandingsPerfect: true, doubleDamage: true },
    ruleSpec: {
      allLandingsPerfect:
        'Jede Landung (nach ≥ 0,15 s Flug), die als "clean", "bumpy" oder "crash" eingestuft würde, wird als "perfect" gewertet: Es werden landing{quality:"perfect"} und perfectLanding ausgelöst, die Stunt-Belohnung ist die der perfekten Landung (4 Schrauben), Bruchlandungs-Folgen (Bruch-Zusatzschaden, Tempoverlust, Überschlag) entfallen und die Kiste wird sofort auf den Fahrbahnwinkel ausgerichtet. Der Aufprallschaden aus der Normalgeschwindigkeit über impactThreshold wird weiter berechnet (siehe doubleDamage). Ist zugleich noPerfectLanding aktiv, heben sich beide Regeln auf und es gilt die normale Einstufung. Auswertung: physics/vehicle.js bei der Landungs-Klassifizierung.',
      doubleDamage:
        'Jeder Haltbarkeitsverlust während einer Etappe (Aufprall, Hindernis, Schluchtsturz, Überhitzung, selfDamage) wird nach Abzug von armor verdoppelt, bevor er abgezogen und als damage{amount} gemeldet wird. Die Abschlepp-Strafe außerhalb der Etappe ist nicht betroffen. Auswertung: stage/stage.js in ctx.damage.',
    },
  },
  {
    id: 'schrott_schraubenvergaser',
    name: 'Schraubenschlucker-Vergaser',
    icon: '🍽️',
    rarity: 'legendary',
    tags: ['schrott', 'magnet'],
    pool: 'r_legend_2',
    desc: 'Magnet +1 m. Jede Schraube tankt {amount}, leerer Tank frisst Schrauben. Je 5 im Beutel: +1 % Boost-Schub (max. 30 %).',
    flavor: 'Läuft mit M6. Notfalls auch mit M8.',
    stats: { magnet: { add: 1 } },
    rules: { boltsAreFuel: true, boltHoardThrust: true },
    ruleSpec: {
      boltsAreFuel:
        'Schrauben sind Treibstoff: Ist der Treibstoff 0 und Antrieb, Boost oder eine Fähigkeit bräuchte Treibstoff, wird stattdessen mit Run-Schrauben bezahlt – 1 Schraube je angefangene 4 Treibstoff (abgebucht über ctx.addBolts(-1), sobald der nächste 4er-Block angebrochen wird; in der laufenden Etappe gewonnene Schrauben zählen mit). fuelEmpty wird erst ausgelöst, wenn Treibstoff UND Schrauben 0 sind; danach gilt das normale Verhalten. Schrauben gehen dabei nie unter 0. Auswertung: stage/stage.js beim Treibstoffverbrauch (Schrauben sind Run-Zustand, Zugriff über ctx).',
      boltHoardThrust:
        'Schraubenhort: Je volle 5 Run-Schrauben, die der Spieler gerade besitzt (Run-Stand inklusive der in der laufenden Etappe gewonnenen Schrauben), erhält die Kiste boostThrust mul +0,01, höchstens +0,30 (ab 150 Schrauben). Der Bonus wird bei jeder Änderung des Schraubenstands neu berechnet (wie ein Stapel ohne eigenes Ereignis) und sinkt daher auch, wenn boltsAreFuel Schrauben verbrennt oder im Laden bezahlt wird. Wird nicht mit ★ skaliert; mehrere Quellen addieren sich nicht. Auswertung: stage/stage.js beim Neuberechnen der Fahrzeug-Stats (Schraubenstand über ctx).',
    },
    triggers: [{ on: 'pickup', if: { kind: 'bolt' }, do: [{ fx: 'fuel', amount: 2 }] }],
  },

  // ── r_legend_3 ──
  {
    id: 'elektro_teslaspule',
    name: 'Teslaspule aus dem Keller',
    icon: '⚡',
    rarity: 'legendary',
    tags: ['elektro'],
    pool: 'r_legend_3',
    desc: 'Stromschlag macht alle Stromschlag-Effekte wieder bereit (alle 3 s). Er zündet {dur} s Gratis-Boost – und umgekehrt.',
    flavor: 'Lässt im ganzen Viertel das Radio knistern.',
    rules: { shockRecharge: true },
    ruleSpec: {
      shockRecharge:
        'Überladung: Bei einem shock-Ereignis (jede Quelle, auch Blitz) setzt die Trigger-Engine, bevor sie die Trigger dieses Ereignisses prüft, die laufenden Abklingzeiten (limit.cooldown) aller Trigger mit on:"shock" auf 0 – über alle Quellen (Items, Set-Boni, Teile, Chassis). perStage- und perRun-Zähler bleiben unverändert, Trigger anderer Ereignisse sind nicht betroffen. Die Regel greift höchstens 1× je 3 s (eigene Abklingzeit ab dem Auslösen); weitere shocks in dieser Zeit laufen normal. Mehrere Quellen mit dieser Regel addieren sich nicht. Das HUD lässt dabei alle Stromschlag-Items gemeinsam aufblitzen. Auswertung: items/triggerEngine.js beim Verteilen des shock-Ereignisses.',
    },
    triggers: [
      { on: 'shock', limit: { cooldown: 2 }, do: [{ fx: 'boost', dur: 0.5 }] },
      {
        on: 'boost',
        if: { free: true },
        limit: { cooldown: 3 },
        do: [{ fx: 'emit', event: 'shock', data: { source: 'teslaspule' } }],
      },
    ],
  },
  {
    id: 'gluck_dreiblatt_klee',
    name: 'Dreiblättriges Kleeblatt',
    icon: '☘️',
    rarity: 'legendary',
    tags: ['gluck'],
    pool: 'r_legend_3',
    desc: 'Jede 3. Auslösung jedes Items wirkt eine ★-Stufe stärker (Set-Boni und Chassis nicht). +1 Glück.',
    flavor: 'Ein Blatt fehlt. Dafür legt jedes dritte Mal eine Schippe drauf.',
    stats: { luck: { add: 1 } },
    rules: { everyThirdTierUp: true },
    ruleSpec: {
      everyThirdTierUp:
        'Die Trigger-Engine zählt je Item-Quelle (kind "item", nicht set, chassis oder part) alle erfolgreichen Trigger-Auslösungen (Bedingungen erfüllt, Limit nicht blockiert) in der laufenden Etappe; der Zähler gilt pro Item über alle seine Trigger und startet bei stageStart bei 0. Jede 3. Auslösung (3., 6., 9. …) wird mit dem Stufenfaktor der nächsthöheren ★-Stufe ausgeführt: ★1 → 1,6, ★2 → 2,3, ★3 → 3,0 (Wert in balance.RULES.everyThirdTierUp.beyondMax) statt 1,0/1,6/2,3; skaliert werden wie üblich amount, pct, dur, radius, add, mul. chance.p, Limits, n/at und stack.max bleiben unverändert; passive stats sind nicht betroffen. Echos aus luckyEcho zählen nicht mit, übernehmen aber den erhöhten Faktor der Auslösung, die sie wiederholen. HUD: „★+1“ mit Kleeblatt am Item-Symbol. Auswertung: items/triggerEngine.js beim Ausführen der do-Liste einer Item-Quelle.',
    },
  },
  {
    id: 'eis_schlittschuhkufen',
    name: 'Opas Schlittschuhkufen',
    icon: '⛸️',
    rarity: 'legendary',
    tags: ['eis'],
    pool: 'r_legend_3',
    desc: 'Unter 50 Hitze landest du ohne Tempoverlust. Perfekte Landung: −{amount} Hitze und 2 s lang Rollreibung −30 %.',
    flavor: 'Opa war 1962 Bezirksmeister. Die Urkunde hat er selbst gemalt.',
    rules: { iceLanding: true },
    ruleSpec: {
      iceLanding:
        'Bei jeder Landung mit quality "perfect", "clean" oder "bumpy", während die Hitze unter 50 liegt, geht kein Tempo durch den Aufprall verloren: Das Boden-Tempo s wird auf den Betrag der Geschwindigkeit |v| gesetzt statt nur auf die Tangential-Komponente, höchstens jedoch Tangential-Komponente + 15 m/s; Richtung = Vorzeichen der Tangential-Komponente (bei 0 vorwärts). Aufprallschaden wird normal berechnet. Bei "crash" oder Hitze ≥ 50 normale Landung. Löst kein eigenes Ereignis aus. Auswertung: physics/vehicle.js beim Übergang Luft → Boden.',
    },
    triggers: [
      {
        on: 'perfectLanding',
        limit: { cooldown: 2 },
        do: [
          { fx: 'cool', amount: 15 },
          { fx: 'buff', stat: 'rollFriction', mul: -0.3, dur: 2 },
        ],
      },
    ],
  },

  // ═════════════ VERFLUCHT ═════════════

  // ── r_curse_1 ──
  {
    id: 'rakete_verfluchter_turbolader',
    name: 'Verfluchter Turbolader',
    icon: '🌬️',
    rarity: 'cursed',
    tags: ['rakete', 'feuer'],
    pool: 'r_curse_1',
    desc: '+60 % Boost-Schub. Pfeift wie Omas Teekessel und schiebt wie ein Güterzug.',
    flavor: 'Der Verkäufer hatte keine Augenbrauen mehr.',
    stats: { boostThrust: { mul: 0.6 } },
    curse: {
      desc: 'Jede Sekunde Boost kostet 2 Haltbarkeit.',
      stats: { boostSelfDamage: { add: 2 } },
    },
  },
  {
    id: 'gluck_schwarze_katze',
    name: 'Schwarze Katze im Kofferraum',
    icon: '🐈‍⬛',
    rarity: 'cursed',
    tags: ['gluck'],
    pool: 'r_curse_1',
    desc: '+3 Glück, +1 Item zur Wahl. Landungen: 30 % Chance auf 4 Schrauben (alle 2 s) – die Katze bringt Geschenke.',
    flavor: 'Kam als blinder Passagier. Bleibt als Chefin.',
    stats: { luck: { add: 3 }, itemChoices: { add: 1 } },
    triggers: [
      {
        on: 'landing',
        limit: { cooldown: 2 },
        do: [{ fx: 'chance', p: 0.3, then: [{ fx: 'bolts', amount: 4 }] }],
      },
    ],
    curse: {
      desc: 'Zu jedem Etappenstart legt sich die Katze auf ein zufälliges anderes Item – es wirkt die ganze Etappe nicht.',
      rules: { blackCatNap: true },
      ruleSpec: {
        blackCatNap:
          'Bei stageStart wählt die Engine per ctx.rng (nicht von luck beeinflusst) gleichverteilt eines der ANDEREN Items im Inventar (nicht dieses, keine leeren Slots) und deaktiviert es bis stageEnd: Seine stats, rules und triggers wirken in dieser Etappe nicht; für Set-Boni zählt es mit seinen Tags weiter. HUD: Item-Symbol grau mit Katzen-Symbol. Ist kein anderes Item vorhanden, passiert nichts. Ein Neuversuch nach Abschleppen wählt neu. Auswertung: stage/stage.js beim Zusammenstellen der Trigger-Quellen (sources) zu Etappenbeginn.',
      },
    },
  },
  {
    id: 'eis_ewiger_eiszapfen',
    name: 'Ewiger Eiszapfen',
    icon: '🧊',
    rarity: 'cursed',
    tags: ['eis'],
    pool: 'r_curse_1',
    desc: 'Du kannst nicht mehr überhitzen – nie wieder. Kühlung +25 %.',
    flavor: 'Taut seit 1963 nicht auf. Hat schon zwei Kühltruhen überlebt.',
    stats: { coolRate: { mul: 0.25 } },
    rules: { noOverheat: true },
    curse: {
      desc: 'Eingefrorene Lager: Antrieb −30 %, Tank −20 %.',
      stats: { driveAccel: { xmul: 0.7 }, fuelMax: { xmul: 0.8 } },
    },
  },
  {
    id: 'gummi_gummihuhn',
    name: 'Quietschendes Gummihuhn',
    icon: '🐔',
    rarity: 'cursed',
    tags: ['gummi'],
    pool: 'r_curse_1',
    desc: 'Holprige Landungen federn {amount} m/s hoch. Jeder Abpraller gibt +4 m/s Schub. Abprallkraft +40 %.',
    flavor: 'Quietscht immer genau dann, wenn es drauf ankommt.',
    stats: { bounce: { mul: 0.4 } },
    triggers: [
      {
        on: 'landing',
        if: { quality: 'bumpy' },
        limit: { cooldown: 1.5 },
        do: [
          { fx: 'jump', amount: 6 },
          { fx: 'emit', event: 'bounce', data: { source: 'gummihuhn' } },
        ],
      },
      { on: 'bounce', limit: { cooldown: 2 }, do: [{ fx: 'thrust', amount: 4 }] },
    ],
    curse: {
      desc: 'Quietscht bei jeder Landung: Perfekte zählen nur als sauber, holprige kosten 2 Haltbarkeit.',
      rules: { noPerfectLanding: true },
      triggers: [{ on: 'landing', if: { quality: 'bumpy' }, do: [{ fx: 'selfDamage', amount: 2 }] }],
      ruleSpec: {
        noPerfectLanding:
          'Landungen werden nie als "perfect" eingestuft: Was perfekt wäre, wird als "clean" gewertet – kein perfectLanding-Ereignis, landing kommt mit quality "clean", Stunt-Belohnung 1 statt 4 Schrauben; Chassis-Regeln wie healOnCleanLanding greifen wie bei sauberen Landungen. Ist zugleich allLandingsPerfect aktiv, heben sich beide Regeln auf und es gilt die normale Einstufung. Auswertung: physics/vehicle.js bei der Landungs-Klassifizierung.',
      },
    },
  },

  // ── r_curse_2 ──
  {
    id: 'elektro_kaputter_weidezaun',
    name: 'Kaputter Weidezaun',
    icon: '🐄',
    rarity: 'cursed',
    tags: ['elektro', 'schrott'],
    pool: 'r_curse_2',
    desc: 'Jede Landung verpasst dir einen Stromschlag (alle 3 s). Jeder Stromschlag zündet eine Explosion ({amount} m/s).',
    flavor: 'Die Kühe haben ihn abgebaut. Freiwillig.',
    triggers: [
      {
        on: 'landing',
        limit: { cooldown: 3 },
        do: [{ fx: 'emit', event: 'shock', data: { source: 'weidezaun' } }],
      },
      {
        on: 'shock',
        limit: { cooldown: 1 },
        do: [
          { fx: 'explosion', amount: 7 },
          { fx: 'bolts', amount: 1 },
        ],
      },
    ],
    curse: {
      desc: 'Jeder Stromschlag zwickt dich selbst: 2 Schaden (höchstens 1× pro Sekunde).',
      triggers: [{ on: 'shock', limit: { cooldown: 1 }, do: [{ fx: 'selfDamage', amount: 2 }] }],
    },
  },
  {
    id: 'magnet_geisterbahn_magnet',
    name: 'Magnet aus der Geisterbahn',
    icon: '👻',
    rarity: 'cursed',
    tags: ['magnet'],
    pool: 'r_curse_2',
    desc: 'Magnet +3 m. Jeder Pickup reißt dich {amount} m/s nach vorn (höchstens 1× pro Sekunde).',
    flavor: 'Seit er da ist, fehlen dem Wagen drei Schrauben.',
    stats: { magnet: { add: 3 } },
    triggers: [{ on: 'pickup', limit: { cooldown: 1 }, do: [{ fx: 'thrust', amount: 2 }] }],
    curse: {
      desc: 'Hindernisse ziehen dich auch an – magisch, magnetisch, meistens mitten rein.',
      rules: { obstacleMagnet: true },
      ruleSpec: {
        obstacleMagnet:
          'Hindernisse (Schrottberge, Schrottpressen, Kisten) ziehen die Kiste an, solange sie höchstens 6 m entfernt sind (Abstand Kiste – Hindernis-Mittelpunkt) und noch vor ihr liegen (Hindernis-x > Kisten-x): Beschleunigung 7 m/s² in Richtung Hindernis-Mittelpunkt, in der Luft und am Boden; bei mehreren nur das nächste. Der Stat magnet beeinflusst diese Anziehung nicht. Auswertung: physics/vehicle.js bei der Kräfteberechnung (Hindernisliste aus physics/objects.js).',
      },
    },
  },
  {
    id: 'hydraulik_hoellenfeder',
    name: 'Höllische Katapultfeder',
    icon: '😈',
    rarity: 'cursed',
    tags: ['hydraulik'],
    pool: 'r_curse_2',
    desc: '+18 % Abschusstempo. Perfekter Abschuss: +25 % statt +15 % Tempo und {dur} s Gratis-Boost obendrauf.',
    flavor: 'Aus einem Springteufel. Der Teufel springt seitdem nicht mehr.',
    stats: { launchSpeed: { mul: 0.18 }, launchPerfectBonus: { add: 0.1 } },
    triggers: [{ on: 'perfectLaunch', do: [{ fx: 'boost', dur: 1 }] }],
    curse: {
      desc: 'Die Feder schnalzt zurück: Jeder Abschuss kostet 6 Haltbarkeit.',
      triggers: [{ on: 'launch', do: [{ fx: 'selfDamage', amount: 6 }] }],
    },
  },
  {
    id: 'gyro_spieluhr',
    name: 'Spieluhr der Urgroßtante',
    icon: '🩰',
    rarity: 'cursed',
    tags: ['gyro'],
    pool: 'r_curse_2',
    desc: 'Saltos drehen 35 % schneller, max. Drehtempo +25 %. Jeder Salto: +{amount} m/s Schub und 1 Schraube (max. 1× pro s).',
    flavor: 'Spielt „Für Elise“ um Mitternacht. Auch ohne Aufziehen.',
    stats: { flipSpeed: { mul: 0.35 }, maxSpin: { mul: 0.25 } },
    triggers: [
      {
        on: 'flip',
        limit: { cooldown: 1 },
        do: [
          { fx: 'thrust', amount: 4 },
          { fx: 'bolts', amount: 1 },
        ],
      },
    ],
    curse: {
      desc: 'Sie hört nicht auf zu drehen: Nur Gegensteuern bremst, kein Ausrichten. Landetoleranz −8°, perfekte Landung −3°.',
      stats: { landTolDeg: { add: -8 }, perfectLandDeg: { add: -3 } },
      rules: { endlessSpin: true },
      ruleSpec: {
        endlessSpin:
          'In der Luft wirken weder autoLevel (Ausrichten in Flugrichtung) noch die Winkel-Dämpfung: Ohne Eingabe behält die Kiste ihre aktuelle Winkelgeschwindigkeit unverändert bei (nur maxSpin begrenzt). Bremsen geht nur durch Gegensteuern (input.tilt in Gegenrichtung mit normaler Winkelbeschleunigung airControl × flipSpeed). Am Boden unverändert. Auswertung: physics/vehicle.js im Neigungs-Schritt der Luftphase.',
      },
    },
  },
];
