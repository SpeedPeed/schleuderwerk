// Schleuderwerk 2 – Textereignisse für den Knoten „Ereignis“ (reine Daten, siehe V2-DESIGN.md §4, ARCHITEKTUR.md §2 data/textEvents.js)
//
// Felder je Ereignis:
//   id                 eindeutig, Präfix ev_
//   acts               Akte, in denen das Ereignis gezogen werden kann (1 Schrottplatz, 2 Glutwüste, 3 Gewittersteppe)
//   requires?          { tag, min } – nur ziehbar, wenn der Rucksack ≥ min Items dieses Tags hat (Hybride zählen für
//                        beide Tags, Garage-Teile zählen nicht; shops/textEvent.js → eventEligible). Paket D6: 2 je Tag, min 2.
//   story?             Figur einer Kette über mehrere Runs ('gerd' | 'kalle' | 'vereinswart'). Gesehene Kapitel merkt sich
//                        der Spielstand (save.story.seen { evId: 1 }); ein Kapitel kommt danach nie wieder.
//   requiresStory?     id des Vorgänger-Kapitels: erst ziehbar, wenn es in einem FRÜHEREN Run gesehen wurde
//                        (in save.story.seen und nicht in run.seenEvents)
//   title, text        Anzeige (Titel max. 28 Zeichen, Text 2–4 Sätze)
//   options[]          Entscheidungen:
//     label            Knopftext (max. 40 Zeichen)
//     hint?            kurze Andeutung des Risikos
//     cost?            Preis, wird VOR dem Würfeln abgezogen; Option nur wählbar, wenn bezahlbar.
//                        bolts: n          Schrauben (positiv = Abzug)
//                        hpPct: x          Anteil der max. Haltbarkeit (positiv = Abzug, kann den Run nicht beenden → nur wählbar, wenn danach > 0)
//                        maxFuel: n        max. Treibstoff für den Run (positiv = Abzug)
//                        item: 'random'|'choose'   ein Item abgeben (zufällig / selbst gewählt); nur wählbar mit ≥ 1 Item
//     outcomes[]       { p, text, effects[] } – p summiert je Option auf 1; genau ein Ausgang wird gewürfelt (Run-RNG)
// Effekte (Reihenfolge = Ausführungsreihenfolge):
//   { bolts: n } { scrap: n } { blueprints: n } { hpPct: ±x } { maxHp: ±n } { maxFuel: ±n }
//   { item: { rarity?, tag? } }  (ohne rarity = normale Seltenheits-Verteilung des Pools)
//   { removeItem: 'random'|'choose' } { upgradeItem: 'random'|'choose' } { curse: true } { removeCurse: true }
//   { curse: true } fügt ein NEUES zufälliges verfluchtes Item hinzu. Fluch-Pool: alle Items mit pool r_curse_1 gelten dafür
//   immer als verfügbar (auch ohne Forschung), r_curse_2-Items erst nach ihrer Forschung (umgesetzt im Adapter data/index.js;
//   gleiche Regel für ascension → startCurse). Im Text heißen Run-Items „Fundstück“, „Teil“ meint nur Garage-Teile.
//   { stage: 'elite' } (startet sofort eine Elite-Etappe mit Elite-Belohnung) { cores: 1 } { nothing: true }
// Regeln: Jede Option kostet etwas oder birgt ein Risiko; jedes Ereignis hat die sichere Option „Weitergehen“.
//         Tag-Ereignisse belohnen bevorzugt mit Items ihres Tags; Ketten-Kapitel stehen in allen drei Akten.
//         Kerne gibt es nur in den drei Akt-3-Ereignissen (Kern-Chance je Option ≤ 10 %).
//         Heilungen (hpPct > 0) unterliegen ascension → repairMul.

export const TEXT_EVENTS = [
  // ───────────────────────────── Akt 1–3 ─────────────────────────────
  {
    id: 'ev_bruno_bringt_was',
    acts: [1, 2, 3],
    title: 'Bruno bringt was',
    text: 'Schrottplatzhund Bruno trabt heran, wedelt mit dem ganzen Hinterteil und hat etwas Glänzendes im Maul. Er legt es vor deine Kiste – und knurrt, sobald du danach greifst. Bruno will verhandeln.',
    options: [
      {
        label: 'Wurst gegen Fundstück tauschen',
        hint: 'Bruno ist bestechlich, aber launisch.',
        cost: { bolts: 10 },
        outcomes: [
          { p: 0.75, text: 'Bruno schlingt die Wurst und schiebt dir das Teil mit der Nase hin. Guter Hund!', effects: [{ item: { rarity: 'common' } }] },
          { p: 0.25, text: 'Bruno nimmt die Wurst UND das Teil und verschwindet hinter der Presse. Respekt.', effects: [{ nothing: true }] },
        ],
      },
      {
        label: 'Einfach schnappen',
        hint: 'Bruno findet das gar nicht lustig.',
        outcomes: [
          { p: 0.4, text: 'Zack, geschnappt! Bruno guckt beleidigt, aber das Teil ist erstaunlich gut.', effects: [{ item: { rarity: 'rare' } }] },
          { p: 0.6, text: 'Bruno beißt in deinen Reifen und zerrt die Kiste einmal quer über den Platz.', effects: [{ hpPct: -0.12 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du kraulst Bruno hinterm Ohr und fährst weiter. Er sabbert zum Abschied.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_altmetall_kalle',
    acts: [1, 2, 3],
    title: 'Altmetall-Kalle',
    text: 'Ein Pritschenwagen hupt dreimal: Altmetall-Kalle! Er kauft alles, was rostet, und verkauft alles, was nicht bei drei auf den Bäumen ist. Unter seiner Plane klappert eine geheimnisvolle Wundertüte.',
    options: [
      {
        label: 'Ein Item an Kalle verscherbeln',
        hint: 'Weg ist weg. Kalle zahlt bar. Meistens.',
        cost: { item: 'choose' },
        outcomes: [
          { p: 0.7, text: 'Kalle wiegt das Teil in der Hand und zählt dir Schrauben in die Mütze.', effects: [{ bolts: 45 }] },
          { p: 0.3, text: 'Kalle zahlt „halb bar, halb Ware“. Die Ware ist ein Sack Altmetall.', effects: [{ bolts: 20 }, { scrap: 30 }] },
        ],
      },
      {
        label: 'Kalles Wundertüte kaufen',
        hint: 'Kalle grinst verdächtig breit.',
        cost: { bolts: 30 },
        outcomes: [
          { p: 0.5, text: 'Oha, da ist was richtig Gutes drin! Kalle ärgert sich hörbar.', effects: [{ item: { rarity: 'rare' } }] },
          { p: 0.35, text: 'Ein solides Fundstück mit nur leichtem Rostgeschmack.', effects: [{ item: { rarity: 'common' } }] },
          { p: 0.15, text: 'In der Tüte liegt etwas, das leise kichert. Kalle ist schon über alle Berge.', effects: [{ curse: true }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Kalle hupt noch mal dreimal. Einfach so.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_verlassene_tankstelle',
    acts: [1, 2, 3],
    title: 'Die verlassene Tankstelle',
    text: 'Am Wegrand rostet eine alte Tankstelle vor sich hin, die Preistafel zeigt noch D-Mark. Eine Zapfsäule tropft verdächtig. Unter der Hebebühne gähnt eine dunkle Werkstattgrube.',
    options: [
      {
        label: 'Restsprit abzapfen',
        hint: 'Was auch immer da drin ist.',
        outcomes: [
          { p: 0.6, text: 'Echtes Super, gut abgelagert! Opa würde von „Jahrgang“ sprechen.', effects: [{ maxFuel: 10 }] },
          { p: 0.4, text: 'Es war Altöl mit einer Wespe drin. Der Motor hustet, die Wespe auch.', effects: [{ hpPct: -0.1 }] },
        ],
      },
      {
        label: 'In die Werkstattgrube steigen',
        hint: 'Dunkel, ölig, voller Möglichkeiten.',
        outcomes: [
          { p: 0.5, text: 'Zwischen Ölkanistern liegt ein vergessenes Fundstück. Fettig, aber deins.', effects: [{ item: {} }] },
          { p: 0.25, text: 'Eine Kaffeedose voller Schrauben. Der alte Tankwart hat gespart.', effects: [{ bolts: 20 }] },
          { p: 0.25, text: 'Die Leiter hat eine Sprosse weniger als gedacht. Ungefähr alle.', effects: [{ hpPct: -0.12 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du tankst nur ein bisschen Nostalgie und fährst weiter.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_oma_kaffeekraenzchen',
    acts: [1, 2, 3],
    title: 'Omas Kaffeekränzchen',
    text: 'Auf einem Klapptisch zwischen zwei Autowracks deckt Oma Hilde Bienenstich und Filterkaffee. Tante Ilse strickt gerade einen Topflappen für deinen Auspuff. „Setz dich, Kind, du bist ja ganz verbeult!“',
    options: [
      {
        label: 'Hinsetzen und Kuchen essen',
        hint: 'Omas räumen gern auf. Auch deine Kiste.',
        outcomes: [
          { p: 0.8, text: 'Bienenstich heilt alles. Sogar Blech. Wissenschaftlich unbelegt, aber wirksam.', effects: [{ hpPct: 0.2 }] },
          { p: 0.2, text: 'Während du isst, hat Oma deine Kiste „aufgeräumt“. Ein Fundstück steckt jetzt im Altkleidersack.', effects: [{ hpPct: 0.1 }, { removeItem: 'random' }] },
        ],
      },
      {
        label: 'Tante Ilses Topflappen kaufen',
        hint: 'Handarbeit hat ihren Preis.',
        cost: { bolts: 20 },
        outcomes: [
          { p: 0.75, text: 'Der Topflappen passt perfekt über die Schwachstelle. Gestrickte Panzerung!', effects: [{ maxHp: 8 }] },
          { p: 0.25, text: 'Er ist rosa und etwas zu klein. Schützt aber trotzdem. Ein bisschen.', effects: [{ maxHp: 4 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Oma winkt dir mit dem Kuchenheber hinterher.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_seifenkisten_rivale',
    acts: [1, 2, 3],
    title: 'Der Seifenkisten-Rivale',
    text: 'Ein Junge mit Fahrradhelm und Raketen-Bobbycar versperrt dir den Weg. „Du bist also der mit der Schrottkiste? Wettrennen. Jetzt.“ Seine Oma steht mit Stoppuhr daneben und nickt ernst.',
    options: [
      {
        label: 'Rennen annehmen',
        hint: 'Eine harte Strecke – mit Elite-Lohn.',
        outcomes: [
          { p: 1, text: 'Die Oma drückt die Stoppuhr, der Junge zündet seinen Turbo. Los geht’s!', effects: [{ stage: 'elite' }] },
        ],
      },
      {
        label: 'Um Schrauben wetten',
        hint: 'Der Junge hat einen Turbo. Echt jetzt.',
        cost: { bolts: 20 },
        outcomes: [
          { p: 0.5, text: 'Knapp gewonnen! Der Junge zahlt in Klimpergeld und will sofort Revanche.', effects: [{ bolts: 50 }] },
          { p: 0.5, text: 'Der Junge zündet den Turbo und ist weg. Seine Oma kassiert grinsend den Einsatz.', effects: [{ nothing: true }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Der Junge ruft „Angsthase!“, und die Oma nickt wieder ernst.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_gluecksrad',
    acts: [1, 2, 3],
    title: 'Das rostige Glücksrad',
    text: 'Von der letzten Kirmes ist ein Glücksrad übrig geblieben, halb im Schrott versunken. Auf dem Schild steht „Jedes Los gewinnt!!!“. Das dritte Ausrufezeichen ist nachträglich hingemalt.',
    options: [
      {
        label: 'Drehen',
        hint: 'Ein Glücksspiel. Wirklich.',
        cost: { bolts: 10 },
        outcomes: [
          { p: 0.3, text: 'Dreifacher Einsatz zurück! Das Rad quietscht anerkennend.', effects: [{ bolts: 30 }] },
          { p: 0.2, text: 'Ein Trostpreis, der sich gar nicht nach Trost anfühlt.', effects: [{ item: { rarity: 'common', tag: 'gluck' } }] },
          { p: 0.1, text: 'Das Rad bleibt auf dem goldenen Feld stehen. Das gibt es also wirklich.', effects: [{ item: { rarity: 'rare' } }] },
          { p: 0.25, text: 'Niete. Das Rad lacht. Zumindest klingt das Quietschen so.', effects: [{ nothing: true }] },
          { p: 0.15, text: 'Das Rad löst sich aus der Halterung und rollt dir hinterher. Und drüber.', effects: [{ hpPct: -0.08 }] },
        ],
      },
      {
        label: 'Das Rad heimlich anschubsen',
        hint: 'Glücksräder sind nachtragend.',
        outcomes: [
          { p: 0.45, text: 'Ein kräftiger Schubs – Hauptpreis! Das Rad merkt sich aber dein Gesicht.', effects: [{ item: { rarity: 'rare', tag: 'gluck' } }] },
          { p: 0.55, text: 'Das Rad stoppt auf einem Feld, das vorher nicht da war. Ein Totenkopf.', effects: [{ curse: true }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Das Rad quietscht dir beleidigt hinterher.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_rummel_karussell',
    acts: [1, 2, 3],
    title: 'Das letzte Karussell',
    text: 'Der Rummel ist längst weitergezogen, nur ein Kinderkarussell ist geblieben. Die Pferdchen drehen sich noch – ganz von allein, seit Jahren. Die Musik leiert, aber sie läuft.',
    options: [
      {
        label: 'Eine Runde mitfahren',
        hint: 'Gut fürs Gleichgewicht, schlecht für den Magen.',
        outcomes: [
          { p: 0.45, text: 'Nach zwanzig Runden fällt dir ein Kreisel aus der Tasche. Den hattest du vorher nicht.', effects: [{ item: { rarity: 'common', tag: 'gyro' } }] },
          { p: 0.25, text: 'Im Schwindel kommt dir eine Idee. Ein Fundstück läuft jetzt runder. Wortwörtlich.', effects: [{ upgradeItem: 'random' }] },
          { p: 0.3, text: 'Dir ist schlecht. Der Kiste auch. Ihr beide braucht eine Pause.', effects: [{ hpPct: -0.1 }] },
        ],
      },
      {
        label: 'Den Karussellmotor ausbauen',
        hint: 'Die Pferdchen schauen vorwurfsvoll.',
        cost: { hpPct: 0.1 },
        outcomes: [
          { p: 0.65, text: 'Der Motor surrt in deinen Händen weiter. Die Pferdchen drehen sich trotzdem. Unheimlich.', effects: [{ item: { rarity: 'rare', tag: 'gyro' } }] },
          { p: 0.35, text: 'Nur ein Lüftermotor mit Größenwahn. Dazu ein paar Schrauben aus der Kasse.', effects: [{ item: { rarity: 'common', tag: 'gyro' } }, { bolts: 10 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du winkst den Pferdchen. Eins winkt zurück. Du fährst schneller.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_bruno_buddelt',
    acts: [1, 2, 3],
    title: 'Bruno buddelt',
    text: 'Bruno gräbt wie besessen an einer Stelle, die Erde fliegt meterweit. Ab und zu bellt er dich auffordernd an und gräbt weiter. Da unten ist etwas – oder er hat wieder einen Maulwurf gehört.',
    options: [
      {
        label: 'Mitbuddeln',
        hint: 'Wo Bruno gräbt, liegen oft auch Rohre.',
        outcomes: [
          { p: 0.35, text: 'Ein Fundstück, sauber abgeleckt. Bruno ist sehr stolz auf euch beide.', effects: [{ item: { rarity: 'common' } }] },
          { p: 0.25, text: 'Eine verrostete Keksdose voller Schrauben. Brunos Notgroschen?', effects: [{ bolts: 25 }] },
          { p: 0.15, text: 'Eine Zeitkapsel mit vergilbter Blaupause. Aufschrift: „Schleuderwerk 1“.', effects: [{ blueprints: 1 }] },
          { p: 0.25, text: 'Du triffst die Wasserleitung. Die Kiste ist jetzt gewaschen. Und verbeult.', effects: [{ hpPct: -0.08 }] },
        ],
      },
      {
        label: 'Bruno mit Leckerli anfeuern',
        hint: 'Schneller graben kostet Wurst.',
        cost: { bolts: 12 },
        outcomes: [
          { p: 0.6, text: 'Mit Wurstmotivation gräbt Bruno doppelt so schnell. Fund!', effects: [{ item: { rarity: 'common' } }] },
          { p: 0.4, text: 'Bruno buddelt bis zur Schulter und zieht ein echtes Schätzchen heraus.', effects: [{ item: { rarity: 'rare' } }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du lässt Bruno buddeln. Er hat bestimmt einen Plan.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_kellertuer',
    acts: [1, 2, 3],
    title: 'Die Kellertür im Nirgendwo',
    text: 'Mitten im Schrott liegt eine Kellertür flach auf dem Boden. Darunter führt eine Treppe in einen Bastelkeller: Werkbank, Einmachgläser voller Schrauben, ein Poster von 1987. Unten flackert eine Glühbirne.',
    options: [
      {
        label: 'Hinabsteigen und stöbern',
        hint: 'Die Treppe ist älter als du.',
        outcomes: [
          { p: 0.4, text: 'Unter einer Wolldecke: ein Prachtstück, in Zeitungspapier gewickelt.', effects: [{ item: { rarity: 'rare' } }] },
          { p: 0.3, text: 'In der Schublade liegen Pläne und Kleingeld. Ein echter Tüftlerkeller.', effects: [{ blueprints: 1 }, { bolts: 10 }] },
          { p: 0.3, text: 'Die Glühbirne platzt, du stolperst in ein Regal voller Gurkengläser. Laut.', effects: [{ hpPct: -0.15 }] },
        ],
      },
      {
        label: 'Nur das Schraubenglas nehmen',
        hint: 'Glas ist zerbrechlich. Du auch.',
        outcomes: [
          { p: 0.75, text: 'Ein ganzes Glas voller Schrauben, sortiert nach Größe. Ein Traum.', effects: [{ bolts: 22 }] },
          { p: 0.25, text: 'Das Glas zerbricht, die Schrauben rollen in den Gully. Der Daumen blutet auch.', effects: [{ hpPct: -0.06 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du schließt die Kellertür leise. Wer weiß, wer da unten noch bastelt.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_klebeband_prophet',
    acts: [1, 2, 3],
    title: 'Der Klebeband-Prophet',
    text: 'Ein bärtiger Mann in einem Mantel aus Panzertape predigt von einer Waschmaschine herab. „Alles hält mit Klebeband! ALLES!“ Er hat drei Rollen in jeder Hand und bietet Sofortreparaturen an.',
    options: [
      {
        label: 'Kiste komplett abkleben lassen',
        hint: 'Er nimmt Schrauben. Und Spenden.',
        cost: { bolts: 25 },
        outcomes: [
          { p: 0.75, text: 'Silbern glänzend wie ein Ritter rollst du davon. Es hält. Natürlich hält es.', effects: [{ hpPct: 0.3 }] },
          { p: 0.25, text: 'Er nimmt das billige Band. Hält auch – bis zur nächsten Kurve.', effects: [{ hpPct: 0.15 }] },
        ],
      },
      {
        label: 'Tankvolumen für Panzerung opfern',
        hint: 'Er klebt den Tank kleiner. Ernsthaft.',
        cost: { maxFuel: 10 },
        outcomes: [
          { p: 0.8, text: 'Der Tank ist kleiner, dafür trägt die Kiste jetzt 40 Lagen Klebeband. Unkaputtbar!', effects: [{ maxHp: 12 }] },
          { p: 0.2, text: 'Ihm geht das Band aus. Nur 20 Lagen. Immer noch beeindruckend.', effects: [{ maxHp: 6 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Der Prophet ruft dir nach: „Du kommst wieder! Alle kommen wieder!“', effects: [{ nothing: true }] }],
      },
    ],
  },

  // ───────────────────────────── Akt 1 (Schrottplatz) ─────────────────────────────
  {
    id: 'ev_hungrige_presse',
    acts: [1],
    title: 'Die hungrige Schrottpresse',
    text: 'Eine Schrottpresse ist mitten im Zerquetschen stecken geblieben und brummt nervös. Zwischen den Backen klemmt eine unversehrte Holzkiste mit Werkzeugaufkleber. Die Presse wirkt hungrig.',
    options: [
      {
        label: 'Unter der Presse durchkriechen',
        hint: 'Die Presse ruckelt ab und zu.',
        outcomes: [
          { p: 0.6, text: 'Kiste geschnappt, Kopf noch dran. Die Presse knurrt enttäuscht.', effects: [{ item: { rarity: 'rare' } }] },
          { p: 0.4, text: 'Die Presse ruckelt genau jetzt. Deine Kiste ist seitdem etwas kompakter.', effects: [{ hpPct: -0.2 }] },
        ],
      },
      {
        label: 'Die Presse mit einem Item füttern',
        hint: 'Ein Opfer für den Blechgott.',
        cost: { item: 'random' },
        outcomes: [
          { p: 0.6, text: 'Zufrieden schmatzend gibt die Presse die Holzkiste frei.', effects: [{ item: { rarity: 'rare' } }] },
          { p: 0.4, text: 'Die Presse spuckt einen Würfel aus Schrauben und Altmetall aus. Auch nett.', effects: [{ bolts: 35 }, { scrap: 15 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du lässt die Presse in Ruhe. Manche Tiere soll man nicht füttern.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_muellabfuhr',
    acts: [1],
    title: 'Die Müllabfuhr kommt',
    text: 'Piep, piep, piep: Ein Müllwagen setzt rückwärts an den Schrottberg heran. Die Ladefläche ist voll mit Sperrmüll aus der ganzen Stadt. Der Fahrer hat Kopfhörer auf.',
    options: [
      {
        label: 'Auf die Ladefläche springen',
        hint: 'Die Presse hinten läuft gleich an.',
        outcomes: [
          { p: 0.45, text: 'Du angelst ein Prachtstück aus dem Sperrmüll und springst ab, bevor es knirscht.', effects: [{ item: { rarity: 'common', tag: 'schrott' } }] },
          { p: 0.2, text: 'Ganz unten liegt was Edles. Wer wirft so was weg? Egal, jetzt deins.', effects: [{ item: { rarity: 'rare' } }] },
          { p: 0.35, text: 'Die Presse läuft an. Du kommst raus, aber nicht ganz in deiner Originalform.', effects: [{ hpPct: -0.15 }] },
        ],
      },
      {
        label: 'Dem Fahrer Trinkgeld geben',
        hint: 'Er nimmt nur Schrauben.',
        cost: { bolts: 20 },
        outcomes: [
          { p: 0.7, text: 'Der Fahrer reicht dir lässig etwas aus dem Fahrerhaus. „Lag rum.“', effects: [{ item: { rarity: 'common' } }] },
          { p: 0.3, text: 'Er hat extra was zurückgelegt. „Für Kenner“, sagt er und zwinkert.', effects: [{ item: { rarity: 'rare', tag: 'schrott' } }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Der Müllwagen piept weiter. Wahrscheinlich für immer.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_schlafender_kranfuehrer',
    acts: [1],
    title: 'Der schlafende Kranführer',
    text: 'Hoch oben in seiner Kabine schnarcht der Kranführer, der riesige Magnet baumelt direkt über dir. Die Leiter zur Kabine steht einladend offen. Bruno sitzt daneben und schaut, als wüsste er, was du vorhast.',
    options: [
      {
        label: 'Heimlich den Kran steuern',
        hint: 'Der Magnet ist nicht wählerisch.',
        outcomes: [
          { p: 0.4, text: 'Du fischst ein magnetisches Prachtstück aus dem Schrottberg. Bruno ist beeindruckt.', effects: [{ item: { rarity: 'rare', tag: 'magnet' } }] },
          { p: 0.3, text: 'Der Magnet zieht einen Eimer voller Schrauben hoch. Klimper!', effects: [{ bolts: 30 }] },
          { p: 0.3, text: 'Der Magnet zieht auch an deiner Kiste. Ein Fundstück liegt jetzt oben auf dem Schrottberg.', effects: [{ removeItem: 'random' }] },
        ],
      },
      {
        label: 'Kranführer mit Kaffee wecken',
        hint: 'Morgenmuffel. Kaffee kostet.',
        cost: { bolts: 10 },
        outcomes: [
          { p: 0.6, text: 'Er gähnt, trinkt und zeigt dir seine Pläne für einen Kran mit Raketenantrieb.', effects: [{ blueprints: 1 }] },
          { p: 0.4, text: 'Er brummt, trinkt und wirft dir zum Dank einen Sack Altmetall runter.', effects: [{ scrap: 30 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du lässt ihn schlafen. Bruno legt sich dazu.', effects: [{ nothing: true }] }],
      },
    ],
  },

  // ───────────────────────────── Akt 1–2 ─────────────────────────────
  {
    id: 'ev_opa_heinz_werkstatt',
    acts: [1, 2],
    title: 'Opa Heinz’ Werkstatt',
    text: 'Zwischen zwei Containern steht Opa Heinz’ Werkstatt, das Rolltor halb offen, drinnen läuft Schlagerradio. Opa sitzt mit Lupenbrille an der Werkbank und winkt dich herein. „Zeig mal, was du da zusammengeklebt hast.“',
    options: [
      {
        label: 'Opa schrauben lassen',
        hint: 'Kostet Kaffeegeld. Opa wird schnell müde.',
        cost: { bolts: 25 },
        outcomes: [
          { p: 0.8, text: 'Opa brummt zufrieden, zieht drei Schrauben nach – das Fundstück läuft wie neu, nur besser.', effects: [{ upgradeItem: 'choose' }] },
          { p: 0.2, text: 'Opa schläft mitten in der Arbeit ein. Immerhin hat er vorher die Delle ausgebeult.', effects: [{ hpPct: 0.1 }] },
        ],
      },
      {
        label: 'Selbst an die Drehbank',
        hint: 'Opa schaut zu. Kritisch.',
        outcomes: [
          { p: 0.5, text: 'Erstaunlich! Opa nickt sogar. Bei Opa ist das so gut wie ein Orden.', effects: [{ upgradeItem: 'random' }] },
          { p: 0.5, text: 'Die Drehbank gewinnt. Die Kiste hat jetzt eine Delle in Form deiner Ungeduld.', effects: [{ hpPct: -0.15 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Opa ruft dir hinterher, dass man früher alles selbst gebaut hat.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_elsternnest',
    acts: [1, 2],
    title: 'Das Elsternnest',
    text: 'Auf einer Laterne thront ein riesiges Elsternnest, aus dem es verdächtig glitzert: Schrauben, Kronkorken, ein Ehering. Die Elster beobachtet dich mit schiefem Kopf und sehr spitzem Schnabel.',
    options: [
      {
        label: 'Laterne hochklettern',
        hint: 'Elstern verteidigen ihren Schatz.',
        outcomes: [
          { p: 0.6, text: 'Du stopfst dir die Taschen voll Schrauben. Den Ehering lässt du anständig liegen.', effects: [{ bolts: 35 }] },
          { p: 0.4, text: 'Die Elster hackt dir den Lack ab. Und das Selbstbewusstsein.', effects: [{ hpPct: -0.12 }] },
        ],
      },
      {
        label: 'Ein Item zum Tausch anbieten',
        hint: 'Elstern handeln hart, aber fair.',
        cost: { item: 'random' },
        outcomes: [
          { p: 0.5, text: 'Die Elster begutachtet dein Teil und rückt dafür ihren Glücksbringer heraus.', effects: [{ item: { rarity: 'rare', tag: 'gluck' } }] },
          { p: 0.2, text: 'Die Elster ist so begeistert, dass sie ihr bestes Stück hergibt. Krächz!', effects: [{ item: { rarity: 'epic' } }] },
          { p: 0.3, text: 'Die Elster zahlt in Schrauben. Viele kleine, aber ehrliche Schrauben.', effects: [{ bolts: 30 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du grüßt die Elster. Elstern soll man grüßen, sagt Oma.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_reifenberg',
    acts: [1, 2],
    title: 'Der Reifenberg',
    text: 'Ein Berg aus Altreifen, höher als Opas Garage, wackelt im Wind. Bruno hüpft begeistert darauf herum und federt fast bis in den Himmel. Irgendwo da drin liegt bestimmt was Brauchbares.',
    options: [
      {
        label: 'Mit Anlauf reinspringen',
        hint: 'Federt. Manchmal in die falsche Richtung.',
        outcomes: [
          { p: 0.5, text: 'Boing! Du landest weich – mit einem Gummiteil in der Hand.', effects: [{ item: { rarity: 'common', tag: 'gummi' } }] },
          { p: 0.2, text: 'Ganz unten liegt ein Prachtstück. Glücklich federst du wieder heraus.', effects: [{ item: { rarity: 'rare', tag: 'gummi' } }] },
          { p: 0.3, text: 'Der Berg federt dich zurück. Auf den Kopf. Bruno lacht. Hunde können das.', effects: [{ hpPct: -0.1 }] },
        ],
      },
      {
        label: 'Reifen als Polster anschrauben',
        hint: 'Vulkanisieren kostet Schrauben.',
        cost: { bolts: 15 },
        outcomes: [
          { p: 0.6, text: 'Rundherum Gummipolster. Die Kiste nimmt Stöße jetzt deutlich gelassener.', effects: [{ maxHp: 6 }] },
          { p: 0.4, text: 'Die Reifen sind zu porös zum Panzern. Aber zum Ausbeulen reicht es.', effects: [{ hpPct: 0.1 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Bruno federt dir noch ein Stück hinterher.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_silvesterschuppen',
    acts: [1, 2],
    title: 'Der Silvesterschuppen',
    text: 'Hinter dem Vereinsheim steht ein Schuppen mit der Aufschrift „Silvester 1999 – NICHT ÖFFNEN“. Durch die Ritzen riecht es nach Schwarzpulver und Abenteuer. Ein Schloss gibt es schon lange nicht mehr.',
    options: [
      {
        label: 'Die Kisten durchwühlen',
        hint: 'Manches darin ist noch scharf.',
        outcomes: [
          { p: 0.35, text: 'Eine original verpackte Rakete aus dem letzten Jahrtausend. Die geht bestimmt noch!', effects: [{ item: { rarity: 'rare', tag: 'rakete' } }] },
          { p: 0.3, text: 'Eine Kiste voller Wunderkerzen, Böller und Optimismus.', effects: [{ item: { rarity: 'common', tag: 'feuer' } }] },
          { p: 0.35, text: 'Es knallt. Sehr. Die nächsten drei Etappen hörst du nur ein Pfeifen.', effects: [{ hpPct: -0.2 }] },
        ],
      },
      {
        label: 'Den Vereinswart ausfragen',
        hint: 'Er erzählt gern. Gegen Trinkgeld.',
        cost: { bolts: 15 },
        outcomes: [
          { p: 0.55, text: 'Er zeigt dir alte Raketenpläne von 1999. Du darfst sie abpausen.', effects: [{ blueprints: 1 }] },
          { p: 0.45, text: 'Nach zwei Stunden Vereinsgeschichte schenkt er dir einen Restposten. Endlich.', effects: [{ item: { rarity: 'common', tag: 'rakete' } }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Manche Türen bleiben besser zu. Vor allem die, die nach Schwarzpulver riechen.', effects: [{ nothing: true }] }],
      },
    ],
  },

  // ───────────────────────────── Akt 2 (Glutwüste) ─────────────────────────────
  {
    id: 'ev_fata_morgana',
    acts: [2],
    title: 'Fata Morgana',
    text: 'Am flirrenden Horizont steht ein Schrotthändler-Stand mit Sonnenschirm und Kühltheke. Oder ist das nur heiße Luft? Dein Kühlwasser jedenfalls glaubt fest daran.',
    options: [
      {
        label: 'Auf den Stand zufahren',
        hint: 'Ist er nicht echt, frisst die Wüste deinen Tank.',
        outcomes: [
          { p: 0.4, text: 'Er ist echt! Der Händler schenkt dir ein glühendes Teil. Er kann es nicht mehr anfassen.', effects: [{ item: { rarity: 'rare', tag: 'feuer' } }] },
          { p: 0.6, text: 'Nur heiße Luft. Und jetzt ist Sand im Tank. Viel Sand.', effects: [{ maxFuel: -8 }] },
        ],
      },
      {
        label: 'Im Dünenschatten rasten',
        hint: 'Kühlwasser kostet hier ein Vermögen.',
        cost: { bolts: 12 },
        outcomes: [
          { p: 0.7, text: 'Kühlwasser nachgefüllt, Lack abgekühlt. Die Kiste seufzt erleichtert.', effects: [{ hpPct: 0.15 }] },
          { p: 0.3, text: 'Im Schatten wohnt schon ein Skorpion. Ihr teilt euch den Platz. Widerwillig.', effects: [{ hpPct: 0.05 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du glaubst nur an Händler, die du anfassen kannst.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_wuesten_kiosk',
    acts: [2],
    title: 'Der Wüsten-Kiosk',
    text: 'Mitten in der Glutwüste summt ein Kühlschrank an einem Dieselgenerator. Dahinter döst ein Mann im Liegestuhl und verkauft „Eiskaltes aus aller Welt“. Der Generator raucht schon ein bisschen.',
    options: [
      {
        label: 'Etwas Eiskaltes kaufen',
        hint: 'Frische hat ihren Preis.',
        cost: { bolts: 20 },
        outcomes: [
          { p: 0.7, text: 'Tiefgekühlt und original verpackt. Haltbar bis: gestern.', effects: [{ item: { rarity: 'common', tag: 'eis' } }] },
          { p: 0.3, text: 'Aus der hintersten Ecke des Eisfachs. Es knistert vor Kälte.', effects: [{ item: { rarity: 'rare', tag: 'eis' } }] },
        ],
      },
      {
        label: 'Den Generator „ausleihen“',
        hint: 'Der Kioskmann hat Wassereis. Viel Wassereis.',
        outcomes: [
          { p: 0.45, text: 'Kabel ab, Generator weg. Der Kioskmann schläft einfach weiter.', effects: [{ item: { rarity: 'rare', tag: 'elektro' } }] },
          { p: 0.55, text: 'Der Kioskmann wirft mit gefrorenem Wassereis. Erstaunlich hart, erstaunlich treffsicher.', effects: [{ hpPct: -0.15 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du winkst. Der Mann winkt mit einem Eis am Stiel zurück.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_rentner_karawane',
    acts: [2],
    title: 'Die Rentner-Karawane',
    text: 'Drei Wohnmobile stecken bis zur Achse im Sand, davor diskutieren sechs Rentner in Funktionsjacken. Einer hat eine Seilwinde, keiner hat Ahnung. Als sie deine Kiste sehen, wird es still – dann jubeln sie.',
    options: [
      {
        label: 'Mit der Kiste anschieben',
        hint: 'Kostet Blech und Nerven.',
        cost: { hpPct: 0.1 },
        outcomes: [
          { p: 0.65, text: 'Mit vereinten Kräften und viel Gebrüll – frei! Die Rentner legen zusammen.', effects: [{ bolts: 35 }, { scrap: 20 }] },
          { p: 0.35, text: 'Zum Dank schraubt dir ein Rentner ein Hydraulikteil vom Wohnmobil. „Brauch ich eh nie.“', effects: [{ item: { rarity: 'rare', tag: 'hydraulik' } }] },
        ],
      },
      {
        label: 'Seilwinde mit Treibstoff betreiben',
        hint: 'Kostet Tankvolumen für den ganzen Run.',
        cost: { maxFuel: 10 },
        outcomes: [
          { p: 0.5, text: 'Ein Ingenieur a. D. zeichnet dir zum Dank eine Blaupause auf die Serviette.', effects: [{ blueprints: 1 }] },
          { p: 0.5, text: 'Die Rentner schrauben aus Dankbarkeit an deiner Kiste herum. Es wird tatsächlich besser.', effects: [{ upgradeItem: 'random' }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du hupst aufmunternd. Die Rentner notieren sich dein Kennzeichen.', effects: [{ nothing: true }] }],
      },
    ],
  },

  // ───────────────────────────── Akt 2–3 ─────────────────────────────
  {
    id: 'ev_gewitter_bastler',
    acts: [2, 3],
    title: 'Der Gewitter-Bastler',
    text: 'Auf einem Hügel lässt Blitz-Bernd mit Alu-Hut einen Drachen an Kupferdraht steigen. „Junger Mensch! Ich brauche einen Freiwilligen mit leitfähiger Karosserie!“ Seine Haare stehen dauerhaft zu Berge.',
    options: [
      {
        label: 'Kiste an den Drachen hängen',
        hint: 'Strom macht stark. Oder verflucht.',
        cost: { hpPct: 0.12 },
        outcomes: [
          { p: 0.5, text: 'Wumms! Ein Fundstück leuchtet kurz blau und ist seitdem deutlich motivierter.', effects: [{ upgradeItem: 'choose' }] },
          { p: 0.3, text: 'Der Blitz schweißt dir ein neues Bauteil an. Bernd ist begeistert.', effects: [{ item: { rarity: 'rare', tag: 'elektro' } }] },
          { p: 0.2, text: 'Der Blitz schweißt dir etwas Verfluchtes an. Es summt böse und riecht nach Ozon.', effects: [{ curse: true }] },
        ],
      },
      {
        label: 'Als Testfahrer anheuern',
        hint: 'Bernd hat eine Teststrecke. Eine fiese.',
        outcomes: [
          { p: 1, text: 'Bernd drückt dir ein Probeteil in die Hand und zeigt auf eine Strecke voller Blitze.', effects: [{ item: { rarity: 'common', tag: 'elektro' } }, { stage: 'elite' }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Bernd ruft dir nach, dass auch Faraday klein angefangen hat.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_kofferraum_mann',
    acts: [2, 3],
    title: 'Der Mann mit dem Kofferraum',
    text: 'Ein Kombi mit verdunkelten Scheiben hält neben dir, ein Mann im viel zu langen Mantel öffnet den Kofferraum. Darin liegen Teile, die leise brummen, und ein Bündel Räucherstäbchen. „Ich nehme auch Flüche zurück“, flüstert er.',
    options: [
      {
        label: 'Ein verfluchtes Teil annehmen',
        hint: 'Er legt sogar was drauf. Warum wohl?',
        outcomes: [
          { p: 0.7, text: 'Er drückt dir das brummende Ding und ein Säckchen Schrauben in die Hand. Weg ist er.', effects: [{ curse: true }, { bolts: 40 }] },
          { p: 0.3, text: 'Zum Fluch gibt es ein ganz normales, nettes Teil dazu. Verdächtig nett.', effects: [{ curse: true }, { item: { rarity: 'rare' } }] },
        ],
      },
      {
        label: 'Einen Fluch loswerden',
        hint: 'Kostet. Wirkt meistens.',
        cost: { bolts: 35 },
        outcomes: [
          { p: 0.85, text: 'Er wedelt mit Räucherstäbchen, murmelt was auf Latein – und der Fluch ist weg.', effects: [{ removeCurse: true }] },
          { p: 0.15, text: 'Er nimmt das Geld, murmelt, wedelt. Nichts passiert. „Braucht manchmal etwas.“', effects: [{ nothing: true }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du schüttelst den Kopf. Der Kombi fährt ohne Licht davon.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_opa_supersprit',
    acts: [2, 3],
    title: 'Opa Heinz’ Supersprit',
    text: 'Mit seinem Mofa knattert Opa Heinz heran, einen Kanister auf dem Gepäckträger. „Selbst gebraut! Supersprit mit Geheimzutat!“ Es riecht nach Benzin, Holunder und ein bisschen nach Tante Ilses Likör.',
    options: [
      {
        label: 'Supersprit tanken',
        hint: 'Die Geheimzutat ist leider geheim.',
        outcomes: [
          { p: 0.6, text: 'Der Motor schnurrt wie nie. Dein Tank fühlt sich irgendwie größer an.', effects: [{ maxFuel: 12 }] },
          { p: 0.4, text: 'Es war doch eher Likör. Der Motor hickst, der Tank ist verklebt.', effects: [{ maxFuel: -6 }, { hpPct: -0.05 }] },
        ],
      },
      {
        label: 'Opa eine Runde fahren lassen',
        hint: 'Opa fährt wie 1962. Mit Handbremse.',
        cost: { hpPct: 0.15 },
        outcomes: [
          { p: 0.5, text: 'Opa kommt strahlend zurück und hat unterwegs „nur ganz kurz was nachjustiert“.', effects: [{ upgradeItem: 'choose' }] },
          { p: 0.5, text: 'Opa bringt ein Fundstück vom Straßenrand mit. „Lag da einfach!“', effects: [{ item: { rarity: 'rare' } }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Opa tankt den Supersprit selbst und knattert davon. Er knattert jetzt schneller.', effects: [{ nothing: true }] }],
      },
    ],
  },

  // ───────────────────────────── Akt 3 (Gewittersteppe) – einzige Kern-Quellen ─────────────────────────────
  {
    id: 'ev_blauer_krater',
    acts: [3],
    title: 'Der blau glühende Krater',
    text: 'Ein Blitz hat in einen Schrottberg eingeschlagen und einen rauchenden Krater hinterlassen. Ganz unten pulsiert etwas in kaltem Blau, die Luft schmeckt nach Batterie. Deine Haare stehen ab, obwohl du einen Helm trägst.',
    options: [
      {
        label: 'Mit Gummistiefeln hineinklettern',
        hint: 'Echter Strom. Echte Schmerzen.',
        cost: { hpPct: 0.1 },
        outcomes: [
          { p: 0.08, text: 'Du hältst einen echten Kern in den Händen. Er summt eine Melodie, die Opa kennen würde.', effects: [{ cores: 1 }] },
          { p: 0.5, text: 'Kein Kern, aber ein vollgeladenes Elektroteil. Es knistert vor Vorfreude.', effects: [{ item: { rarity: 'epic', tag: 'elektro' } }] },
          { p: 0.42, text: 'Ein Nachschlag aus der Wolke. Die Kiste qualmt, du auch. Gefunden: nichts.', effects: [{ hpPct: -0.1 }] },
        ],
      },
      {
        label: 'Mit der Magnetangel fischen',
        hint: 'Als Köder dient eins deiner Items.',
        cost: { item: 'random' },
        outcomes: [
          { p: 0.1, text: 'Ein Biss! An der Angel hängt etwas Blaues, Pulsierendes. Ein Kern!', effects: [{ cores: 1 }] },
          { p: 0.6, text: 'Die Angel holt ein magnetisiertes Prachtstück aus dem Krater.', effects: [{ item: { rarity: 'rare', tag: 'magnet' } }] },
          { p: 0.3, text: 'Nur geschmolzene Schrauben. Dafür viele und schön blau angelaufen.', effects: [{ bolts: 30 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du hältst Abstand. Das Blau winkt dir nach. Glaubst du.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_wetterstation',
    acts: [3],
    title: 'Die verlassene Wetterstation',
    text: 'Auf einem Hügel steht eine verlassene Wetterstation, das Windrad dreht sich rasend schnell. Drinnen blinkt ein Schrank mit der Aufschrift „Prototyp Sturmkern – NICHT BERÜHREN“. Daneben liegen Pläne und ein angebissenes Butterbrot.',
    options: [
      {
        label: 'Den Schrank aufbrechen',
        hint: 'Prototypen sind launisch.',
        outcomes: [
          { p: 0.07, text: 'Hinter der Tür summt ein Kern. Ein echter! Der Prototyp funktioniert.', effects: [{ cores: 1 }] },
          { p: 0.38, text: 'Kein Kern, aber ein Bauteil, das eindeutig zu gut für einen Schrottplatz ist.', effects: [{ item: { rarity: 'epic' } }] },
          { p: 0.3, text: 'Der Prototyp ist fehlerhaft und klammert sich an deine Kiste. Er lässt nicht mehr los.', effects: [{ curse: true }] },
          { p: 0.25, text: 'Kurzschluss! Die Station schießt einen Blitz auf dein Dach. Präzise.', effects: [{ hpPct: -0.15 }] },
        ],
      },
      {
        label: 'Nur die Pläne einstecken',
        hint: 'Das Butterbrot gehört jemandem.',
        outcomes: [
          { p: 0.6, text: 'Zwei Mappen voller Pläne, mit Kaffeeflecken. Die besten Pläne haben Kaffeeflecken.', effects: [{ blueprints: 2 }] },
          { p: 0.4, text: 'Der Besitzer des Butterbrots kommt zurück. Mit Regenschirm. Und Wut.', effects: [{ hpPct: -0.1 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du lässt den Sturmkern im Schrank. Er blinkt dir enttäuscht nach.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_bernds_meisterstueck',
    acts: [3],
    title: 'Blitz-Bernds Meisterstück',
    text: 'Blitz-Bernd hat es geschafft: Auf seinem Anhänger steht eine Maschine aus Kühlschrank, Fahrraddynamo und 400 Metern Kupferdraht. „Sie macht Kerne aus Blitzen! Theoretisch!“ Er braucht nur noch einen Einsatz – und einen Blitz.',
    options: [
      {
        label: 'Schrauben in die Maschine werfen',
        hint: 'Bernd nennt es Investition. Du nennst es Wette.',
        cost: { bolts: 50 },
        outcomes: [
          { p: 0.1, text: 'Es blitzt, zischt und klingelt – hinten fällt ein Kern heraus. Bernd weint vor Glück.', effects: [{ cores: 1 }] },
          { p: 0.35, text: 'Die Maschine spuckt fast doppelt so viele Schrauben aus. Bernd versteht selbst nicht, warum.', effects: [{ bolts: 90 }] },
          { p: 0.25, text: 'Die Maschine baut aus deinen Schrauben ein Teil. Ein sehr gutes Teil.', effects: [{ item: { rarity: 'epic' } }] },
          { p: 0.3, text: 'Die Maschine frisst die Schrauben, rülpst und schweigt. Bernd notiert: „Fast.“', effects: [{ nothing: true }] },
        ],
      },
      {
        label: 'Ein Item als Blitzfänger opfern',
        hint: 'Das Teil kommt nicht wieder. Vielleicht was Besseres.',
        cost: { item: 'choose' },
        outcomes: [
          { p: 0.08, text: 'Dein Teil verdampft in einem grellen Blitz – zurück bleibt ein Kern. Bernd fällt in Ohnmacht.', effects: [{ cores: 1 }] },
          { p: 0.12, text: 'Aus dem Rauch steigt etwas Legendäres. Bernd will es sofort patentieren.', effects: [{ item: { rarity: 'legendary' } }] },
          { p: 0.45, text: 'Der Blitz verwandelt dein Teil in etwas deutlich Elektrischeres.', effects: [{ item: { rarity: 'epic', tag: 'elektro' } }] },
          { p: 0.35, text: 'Das Fundstück ist weg, aber die Restladung springt auf ein anderes über. Es brummt zufrieden.', effects: [{ upgradeItem: 'random' }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Bernd ruft: „Die Wissenschaft wartet nicht!“ Sie wartet aber. Genau hier.', effects: [{ nothing: true }] }],
      },
    ],
  },

  // ───────────────────────────── Paket D6: allgemeine Ereignisse ─────────────────────────────
  {
    id: 'ev_sortieranlage',
    acts: [1],
    title: 'Die Sortieranlage',
    text: 'Ein Förderband rattert durch eine Halle, Greifarme sortieren Schrott in bunte Kisten. Einer der Arme ist kaputt und greift wild nach allem. Auf dem Band liegt allerhand, was niemand haben will. Oder doch?',
    options: [
      {
        label: 'Aufs Förderband steigen',
        hint: 'Der kaputte Arm greift nach allem.',
        outcomes: [
          { p: 0.5, text: 'Du schnappst dir ein Fundstück vom Band und springst rechtzeitig ab.', effects: [{ item: { rarity: 'common' } }] },
          { p: 0.2, text: 'Ganz am Ende des Bands liegt ein Prachtstück. Der Arm hat es glatt übersehen.', effects: [{ item: { rarity: 'rare' } }] },
          { p: 0.3, text: 'Der kaputte Arm greift in deine Kiste und sortiert ein Fundstück aus. Gründlich.', effects: [{ removeItem: 'random' }] },
        ],
      },
      {
        label: 'Den Greifarm reparieren',
        hint: 'Ersatzteile kosten. Dank gibt es gratis.',
        cost: { bolts: 15 },
        outcomes: [
          { p: 0.6, text: 'Der Arm sortiert wieder. Der Hallenchef schiebt dir eine Kiste Altmetall rüber.', effects: [{ scrap: 25 }, { bolts: 10 }] },
          { p: 0.4, text: 'Der Hallenchef zeigt dir die Steuerungspläne. „Behalt die Kopie.“', effects: [{ blueprints: 1 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Das Förderband rattert weiter. Es hat keine Zeit für dich.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_bruno_will_spielen',
    acts: [1],
    title: 'Bruno will spielen',
    text: 'Bruno legt dir eine verbeulte Radkappe vor die Kiste und wedelt so heftig, dass er fast umfällt. Er will spielen. Jetzt. Sofort. Er bellt einmal zur Bestätigung.',
    options: [
      {
        label: 'Die Radkappe weit werfen',
        hint: 'Bruno bringt alles zurück. Aber was?',
        outcomes: [
          { p: 0.45, text: 'Bruno bringt die Radkappe zurück – und ein Fundstück, das daneben lag.', effects: [{ item: { rarity: 'common' } }] },
          { p: 0.3, text: 'Bruno bringt eine Dose voller Schrauben. Woher? Frag lieber nicht.', effects: [{ bolts: 20 }] },
          { p: 0.25, text: 'Die Radkappe prallt am Kran ab und landet auf deiner Kiste. Bruno findet das super.', effects: [{ hpPct: -0.08 }] },
        ],
      },
      {
        label: 'Bruno ein Leckerli spendieren',
        hint: 'Bruno merkt sich, wer nett zu ihm ist.',
        cost: { bolts: 10 },
        outcomes: [
          { p: 0.6, text: 'Bruno leckt deine Kiste blitzblank. Der Rost geht gleich mit ab.', effects: [{ hpPct: 0.12 }] },
          { p: 0.4, text: 'Bruno bringt dir aus Dankbarkeit seinen Glücksknochen. Aus Blech.', effects: [{ item: { rarity: 'common', tag: 'gluck' } }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Bruno wirft die Radkappe selbst. Er ist erstaunlich gut darin.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_radio_im_wrack',
    acts: [1],
    title: 'Das Radio im Wrack',
    text: 'In einem ausgeschlachteten Auto spielt das Radio noch – Schlager von 1985, glasklar. Im Handschuhfach klappert etwas. Der Schlüssel steckt, aber der Motor fehlt.',
    options: [
      {
        label: 'Das Handschuhfach öffnen',
        hint: 'Handschuhfächer sind voller Überraschungen.',
        outcomes: [
          { p: 0.4, text: 'Unter einer Straßenkarte von 1985 liegt ein brauchbares Fundstück.', effects: [{ item: { rarity: 'common' } }] },
          { p: 0.3, text: 'Eine Kassette, eine Sonnenbrille und viele Schrauben. Die klassische Handschuhfach-Mischung.', effects: [{ bolts: 25 }] },
          { p: 0.3, text: 'Ein alter Duftbaum, der nach „Neuwagen“ riecht. Er ist verflucht. Natürlich.', effects: [{ curse: true }] },
        ],
      },
      {
        label: 'Das Radio ausbauen',
        hint: 'Die Kabel sind älter als deine Eltern.',
        cost: { hpPct: 0.08 },
        outcomes: [
          { p: 0.6, text: 'Das Radio spielt jetzt in deiner Kiste weiter. Schlager zum Schleudern!', effects: [{ item: { rarity: 'common', tag: 'elektro' } }] },
          { p: 0.4, text: 'Hinter dem Radio steckt ein Verstärker. Erstaunlich kräftig für sein Alter.', effects: [{ item: { rarity: 'rare', tag: 'elektro' } }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du hörst noch ein Lied mit und fährst weiter. Ohrwurm inklusive.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_schrottlawine',
    acts: [1],
    title: 'Die Schrottlawine',
    text: 'Ein Schrottberg knirscht bedrohlich, ganz oben schaukelt ein Kühlschrank im Wind. Auf halber Höhe glitzert etwas Neues. Bruno hat sich vorsichtshalber schon versteckt.',
    options: [
      {
        label: 'Schnell hochklettern',
        hint: 'Wenn der Kühlschrank fällt, fällt alles.',
        outcomes: [
          { p: 0.45, text: 'Du greifst zu und rutschst auf dem Hosenboden runter. Mit Beute!', effects: [{ item: { rarity: 'rare' } }] },
          { p: 0.55, text: 'Der Kühlschrank kippt und rollt über deine Kiste. Bruno traut sich erst später raus.', effects: [{ hpPct: -0.15 }] },
        ],
      },
      {
        label: 'Den Berg mit dem Bagger sichern',
        hint: 'Baggern kostet Sprit für den ganzen Run.',
        cost: { maxFuel: 8 },
        outcomes: [
          { p: 0.6, text: 'Schaufel für Schaufel gesichert. Unten liegen ein Fundstück und Altmetall.', effects: [{ item: { rarity: 'common' } }, { scrap: 15 }] },
          { p: 0.4, text: 'Der Bagger hebt den ganzen Gipfel ab. Darunter: ein Prachtstück.', effects: [{ item: { rarity: 'rare', tag: 'schrott' } }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du fährst lieber weiter. Hinter dir poltert es. Gute Entscheidung.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_fahrradkurierin',
    acts: [1, 2],
    title: 'Die Fahrradkurierin',
    text: 'Eine Fahrradkurierin hält mit quietschenden Bremsen neben dir. Ihr Lastenrad ist vollgepackt, die Kette hängt durch. „Das Paket muss bis Feierabend da sein. Hilfst du mir?“',
    options: [
      {
        label: 'Die Kette reparieren',
        hint: 'Kettenöl ist überall. Bald auch an dir.',
        cost: { bolts: 10 },
        outcomes: [
          { p: 0.7, text: 'Die Kette läuft, die Kurierin zahlt. Sie ist schneller weg, als du gucken kannst.', effects: [{ bolts: 30 }] },
          { p: 0.3, text: 'Sie schenkt dir ihre alte Fahrradnabe. Die dreht sich herrlich leicht.', effects: [{ item: { rarity: 'common', tag: 'gyro' } }] },
        ],
      },
      {
        label: 'Das Paket selbst ausliefern',
        hint: 'Die Adresse steht nur halb auf dem Etikett.',
        cost: { maxFuel: 8 },
        outcomes: [
          { p: 0.6, text: 'Der Empfänger freut sich so, dass er dir den Inhalt schenkt. „Brauch ich doch nicht.“', effects: [{ item: { rarity: 'rare' } }] },
          { p: 0.4, text: 'Paket abgeliefert, Trinkgeld kassiert. Du bist jetzt offiziell Kurier.', effects: [{ bolts: 25 }, { scrap: 10 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Die Kurierin klingelt dir zum Abschied. Zweimal.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_schulausflug',
    acts: [1, 2],
    title: 'Der Schulausflug',
    text: 'Ein Reisebus hält, die Lehrerin ruft: „Alle mal herschauen, das ist ECHTE Technik!“ Dreißig Handys richten sich auf deine Kiste. Einer fragt, ob die Kiste fliegen kann.',
    options: [
      {
        label: 'Eine Vorführung geben',
        hint: 'Dreißig Zuschauer. Null Fehler erlaubt.',
        outcomes: [
          { p: 0.55, text: 'Applaus! Die Lehrerin spendiert eine Runde Schrauben aus der Ausflugskasse.', effects: [{ bolts: 30 }] },
          { p: 0.2, text: 'Ein Mädchen zeichnet deine Kiste ab – und verbessert sie gleich. Du nimmst die Zeichnung.', effects: [{ blueprints: 1 }] },
          { p: 0.25, text: 'Der Trick geht schief. Dreißig Handys filmen, wie du in die Hecke fährst.', effects: [{ hpPct: -0.1 }] },
        ],
      },
      {
        label: 'Fragen beantworten',
        hint: 'Der Motor läuft, die Fragen auch.',
        cost: { maxFuel: 5 },
        outcomes: [
          { p: 0.6, text: 'Bei einer Frage merkst du selbst, was an deiner Kiste falsch ist. Sofort verbessert.', effects: [{ upgradeItem: 'random' }] },
          { p: 0.4, text: 'Ein Junge schenkt dir sein Bastelprojekt. „Für die Wissenschaft!“', effects: [{ item: { rarity: 'common' } }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du hupst zum Abschied. Der ganze Bus jubelt.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_raststaette',
    acts: [2],
    title: 'Die einsame Raststätte',
    text: 'Eine Raststätte mit Zapfsäule, Imbiss und einem Souvenirregal voller Wackeldackel. Die Wirtin wischt seit einer Stunde denselben Tisch. „Kundschaft! Endlich!“',
    options: [
      {
        label: 'Das Tagesmenü bestellen',
        hint: 'Bratkartoffeln sind nicht umsonst.',
        cost: { bolts: 15 },
        outcomes: [
          { p: 0.7, text: 'Bratkartoffeln mit Spiegelei. Danach fühlt sich sogar die Kiste besser.', effects: [{ hpPct: 0.18 }] },
          { p: 0.3, text: 'Zum Essen gibt es einen Wackeldackel gratis. Er nickt glücklich.', effects: [{ hpPct: 0.08 }, { item: { rarity: 'common', tag: 'gluck' } }] },
        ],
      },
      {
        label: 'Das Souvenirregal durchwühlen',
        hint: 'Kitsch, Krempel und vielleicht ein Juwel.',
        cost: { bolts: 10 },
        outcomes: [
          { p: 0.5, text: 'Unter Schlüsselanhängern liegt ein echtes Fundstück. Die Wirtin weiß nicht mal, was das ist.', effects: [{ item: { rarity: 'common' } }] },
          { p: 0.2, text: 'Ganz hinten im Regal: ein Prachtstück mit Preisschild von 1979.', effects: [{ item: { rarity: 'rare' } }] },
          { p: 0.3, text: 'Du kaufst einen Wackeldackel. Er wackelt. Mehr kann er nicht.', effects: [{ nothing: true }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Die Wirtin winkt mit dem Lappen. Der Tisch ist jetzt sehr sauber.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_ewige_baustelle',
    acts: [2],
    title: 'Die ewige Baustelle',
    text: 'Die Straße ist gesperrt: Baustelle, laut Schild seit drei Jahren. Ein Bauarbeiter lehnt an der Absperrung und gähnt. „Umleitung? Gibt’s nicht. Aber ich hab da eine Idee …“',
    options: [
      {
        label: 'Durch die Baustelle zuckeln',
        hint: 'Gräben, Kabel und sehr viele Absperrbaken.',
        outcomes: [
          { p: 0.5, text: 'Neben dem Bagger liegt ein ausgedienter Hydraulikzylinder. „Nimm ruhig mit!“', effects: [{ item: { rarity: 'common', tag: 'hydraulik' } }] },
          { p: 0.2, text: 'Im Kies glänzen Schrauben. Die Bauarbeiter haben sie längst abgeschrieben.', effects: [{ bolts: 25 }] },
          { p: 0.3, text: 'Du landest in einem frisch gegrabenen Loch. Die Bauarbeiter klatschen.', effects: [{ hpPct: -0.12 }] },
        ],
      },
      {
        label: 'Die geheime Umleitung nehmen',
        hint: 'Sie ist lang. Sehr lang.',
        cost: { maxFuel: 10 },
        outcomes: [
          { p: 0.6, text: 'Der Umweg führt an einem vergessenen Lager vorbei. Lohnt sich!', effects: [{ item: { rarity: 'rare' } }] },
          { p: 0.4, text: 'Unterwegs findest du alte Baupläne der Straße. Und Schrott. Viel Schrott.', effects: [{ blueprints: 1 }, { scrap: 25 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du drehst um und suchst dir einen anderen Weg. Das Schild bleibt.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_wanderzirkus',
    acts: [2],
    title: 'Der Wanderzirkus',
    text: 'Ein kleiner Zirkus hat eine Panne: Der Zeltwagen steht schief, der Clown sitzt traurig auf dem Trittbrett. Der Direktor sieht deine Kiste und rückt seinen Zylinder zurecht. „Ein Artist! Endlich!“',
    options: [
      {
        label: 'Als Stuntfahrer auftreten',
        hint: 'Eine Manege voller Hindernisse – mit Elite-Lohn.',
        outcomes: [
          { p: 1, text: 'Trommelwirbel! Der Direktor zeigt auf einen Parcours aus Rampen und Reifen.', effects: [{ stage: 'elite' }] },
        ],
      },
      {
        label: 'Den Zeltwagen aufrichten',
        hint: 'Ein Zirkuswagen wiegt mehr als ein Elefant.',
        cost: { hpPct: 0.1 },
        outcomes: [
          { p: 0.6, text: 'Der Wagen steht gerade. Der Clown schenkt dir seine Hupe. Und Schrauben.', effects: [{ item: { rarity: 'common', tag: 'gummi' } }, { bolts: 15 }] },
          { p: 0.4, text: 'Der Kraftmensch biegt dir zum Dank ein Blech zurecht. Mit bloßen Händen.', effects: [{ maxHp: 6 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Der Clown winkt traurig. Dann lacht er doch. Clowns halt.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_verirrte_drohne',
    acts: [2, 3],
    title: 'Die verirrte Drohne',
    text: 'Eine Lieferdrohne kreist piepsend über dir, ihr Akku blinkt rot. „Empfänger nicht gefunden“, quäkt sie. Am Haken baumelt ein Paket mit der Aufschrift „Vorsicht, Technik!“.',
    options: [
      {
        label: 'Die Drohne einfangen',
        hint: 'Drohnen wehren sich mit Propellern.',
        outcomes: [
          { p: 0.45, text: 'Du bringst die Drohne zum Paketshop. Der Finderlohn ist ein feines Fundstück.', effects: [{ item: { rarity: 'rare' } }] },
          { p: 0.25, text: 'Finderlohn in Schrauben. Die Drohne piepst dankbar.', effects: [{ bolts: 25 }] },
          { p: 0.3, text: 'Die Propeller schleifen dir den Lack ab. Die Drohne fliegt beleidigt weiter.', effects: [{ hpPct: -0.1 }] },
        ],
      },
      {
        label: 'Den Akku aufladen',
        hint: 'Strom aus deinem Tank. Für eine Fremde.',
        cost: { maxFuel: 6 },
        outcomes: [
          { p: 0.6, text: 'Voll geladen! Die Drohne wirft dir zum Dank ein Ersatzteil ab.', effects: [{ item: { rarity: 'common', tag: 'elektro' } }, { scrap: 10 }] },
          { p: 0.4, text: 'Die Drohne scannt deine Kiste und spielt ein Update auf. Wie auch immer das geht.', effects: [{ upgradeItem: 'random' }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Die Drohne piepst weiter im Kreis. Irgendwer wird sie schon finden.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_unterstand',
    acts: [2, 3],
    title: 'Der Unterstand',
    text: 'Der Himmel wird schwarz, die ersten dicken Tropfen klatschen auf dein Blech. Ein alter Unterstand bietet Schutz – aber drinnen sitzt schon ein Igel und schaut streng.',
    options: [
      {
        label: 'Den Platz mit dem Igel teilen',
        hint: 'Der Igel teilt nicht gern. Er ist ein Igel.',
        outcomes: [
          { p: 0.6, text: 'Ihr sitzt das Wetter gemeinsam aus. Die Kiste trocknet, der Igel schnarcht.', effects: [{ hpPct: 0.15 }] },
          { p: 0.4, text: 'Der Igel rollt sich zusammen. Direkt an deinem Reifen. Pffft.', effects: [{ hpPct: -0.06 }] },
        ],
      },
      {
        label: 'Im Regen nach Schrauben suchen',
        hint: 'Nass, rutschig, aber der Regen spült was frei.',
        outcomes: [
          { p: 0.5, text: 'Im Matsch glänzen Schrauben, die der Regen freigespült hat.', effects: [{ bolts: 30 }] },
          { p: 0.5, text: 'Du rutschst seitlich in eine Pfütze. Eine sehr tiefe Pfütze.', effects: [{ hpPct: -0.12 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du lässt den Igel in Ruhe und fährst mit Scheibenwischer weiter.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_erfinderwettbewerb',
    acts: [2, 3],
    title: 'Der Erfinderwettbewerb',
    text: 'In einer Turnhalle läuft ein Erfinderwettbewerb. Die Jury besteht aus drei Rentnern und einer sehr ernsten Katze. Startgeld: 25 Schrauben. Hauptpreis: „etwas richtig Gutes“.',
    options: [
      {
        label: 'Die Kiste anmelden',
        hint: 'Die Katze ist gefürchtet.',
        cost: { bolts: 25 },
        outcomes: [
          { p: 0.3, text: 'Erster Platz! Die Katze nickt. Das ist offenbar die höchste Ehre.', effects: [{ item: { rarity: 'epic' } }] },
          { p: 0.4, text: 'Zweiter Platz: eine Urkunde, Schrauben und eine Kopie vom Plan des Siegers.', effects: [{ blueprints: 1 }, { bolts: 15 }] },
          { p: 0.3, text: 'Die Katze gähnt bei deiner Vorführung. Ausgeschieden.', effects: [{ nothing: true }] },
        ],
      },
      {
        label: 'Bei der Konkurrenz abgucken',
        hint: 'Gucken ist erlaubt. Nachbauen ist riskant.',
        outcomes: [
          { p: 0.6, text: 'Du siehst einen genialen Kniff und baust ihn sofort nach. Ein Fundstück wird besser.', effects: [{ upgradeItem: 'random' }] },
          { p: 0.4, text: 'Beim Nachbauen fliegt dir die Konstruktion um die Ohren. Die Katze guckt streng.', effects: [{ hpPct: -0.1 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Die Katze schaut dir nach. Du fühlst dich bewertet.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_singender_funkturm',
    acts: [3],
    title: 'Der singende Funkturm',
    text: 'Ein Funkturm ragt in die Gewitterwolken, bei jedem Windstoß summt er eine Melodie. Am Fuß sitzt eine Funkerin mit Kopfhörern. „Ich empfange da was! Ich brauche nur mehr Antenne.“',
    options: [
      {
        label: 'Deine Kiste als Antenne leihen',
        hint: 'Antennen ziehen Blitze an. Das weißt du, oder?',
        cost: { hpPct: 0.12 },
        outcomes: [
          { p: 0.55, text: 'Klares Signal! Die Funkerin schenkt dir ihr bestes Funkteil.', effects: [{ item: { rarity: 'rare', tag: 'elektro' } }] },
          { p: 0.3, text: 'Sie empfängt Baupläne aus dem Äther. Zwei davon druckt sie dir aus.', effects: [{ blueprints: 2 }] },
          { p: 0.15, text: 'Du empfängst etwas, das nicht empfangen werden wollte. Es bleibt bei dir.', effects: [{ curse: true }] },
        ],
      },
      {
        label: 'Um Ersatzteile bitten',
        hint: 'Die Funkerin will Schrauben für ihre Kiste.',
        cost: { bolts: 20 },
        outcomes: [
          { p: 0.6, text: 'Sie gibt dir eine Kiste Röhren und Kabel. Einiges davon ist sogar nützlich.', effects: [{ item: { rarity: 'common', tag: 'elektro' } }, { scrap: 15 }] },
          { p: 0.4, text: 'Sie lötet eine Antenne an eins deiner Fundstücke. Empfang: hervorragend.', effects: [{ upgradeItem: 'choose' }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Der Turm summt dir eine Abschiedsmelodie hinterher.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_hagelschauer',
    acts: [3],
    title: 'Der Hagelschauer',
    text: 'Erst klopft es leise aufs Dach, dann prasselt Hagel in Erbsengröße. Dann in Murmelgröße. Ein Bauer winkt dich in seine Scheune: „Rein da, schnell! Aber Eintritt kostet.“',
    options: [
      {
        label: 'In die Scheune fahren',
        hint: 'Der Bauer nimmt Schrauben. Nur Schrauben.',
        cost: { bolts: 15 },
        outcomes: [
          { p: 0.7, text: 'Trocken, warm und mit Heu. Der Bauer flickt nebenbei dein Dach.', effects: [{ hpPct: 0.15 }] },
          { p: 0.3, text: 'In der Scheune liegt ein eisiges Fundstück herum. Der Bauer winkt ab: „Nimm mit.“', effects: [{ hpPct: 0.05 }, { item: { rarity: 'common', tag: 'eis' } }] },
        ],
      },
      {
        label: 'Hagelkörner sammeln',
        hint: 'Draußen. Im Hagel. Wirklich?',
        outcomes: [
          { p: 0.4, text: 'Ein Hagelkorn schmilzt einfach nicht. Es wird nie schmelzen. Es ist jetzt deins.', effects: [{ item: { rarity: 'rare', tag: 'eis' } }] },
          { p: 0.6, text: 'Der Hagel trommelt ein Muster in dein Dach. Ein unschönes Muster.', effects: [{ hpPct: -0.15 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du parkst unter einer Brücke und wartest. Langweilig, aber sicher.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_windpark',
    acts: [3],
    title: 'Der Windpark',
    text: 'Im Sturm drehen sich die Windräder so schnell, dass sie pfeifen. Nur eins steht still. Davor kratzt sich eine Technikerin am Helm: „Das Getriebe klemmt. Ich bräuchte Hilfe und gute Nerven.“',
    options: [
      {
        label: 'Beim Getriebe helfen',
        hint: 'Im Sturm. Hoch oben. Natürlich gesichert.',
        cost: { hpPct: 0.1 },
        outcomes: [
          { p: 0.6, text: 'Das Windrad dreht wieder. Die Technikerin schenkt dir ein altes Lager. Läuft wie Butter.', effects: [{ item: { rarity: 'rare', tag: 'gyro' } }] },
          { p: 0.4, text: 'Zum Dank darfst du an der Werkstankstelle extra viel tanken.', effects: [{ maxFuel: 10 }] },
        ],
      },
      {
        label: 'Ein Fundstück als Ersatzteil geben',
        hint: 'Sie zahlt gut. Für das, was sie braucht.',
        cost: { item: 'random' },
        outcomes: [
          { p: 0.6, text: 'Passt! Die Technikerin zahlt aus der Werkskasse. Großzügig.', effects: [{ bolts: 45 }, { scrap: 15 }] },
          { p: 0.4, text: 'Sie tauscht gegen ein Teil aus dem Prototypen-Lager. „Pssst!“', effects: [{ item: { rarity: 'epic' } }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Die Technikerin winkt. Das Windrad nicht. Noch nicht.', effects: [{ nothing: true }] }],
      },
    ],
  },

  // ───────────────────────────── Paket D6: Tag-Ereignisse (nur mit ≥ 2 Items des Tags) ─────────────────────────────
  {
    id: 'ev_tag_feuer_grillfest',
    acts: [1, 2, 3],
    requires: { tag: 'feuer', min: 2 },
    title: 'Das Grillfest der Schweißer',
    text: 'Hinter der Halle grillen drei Schweißer Würstchen – auf einer glühenden Bremsscheibe. Als sie deine heißen Fundstücke sehen, nicken sie anerkennend. „Du gehörst zur Feuerfraktion, was?“',
    options: [
      {
        label: 'Beim Grillen mithelfen',
        hint: 'Die Bremsscheibe ist SEHR heiß.',
        outcomes: [
          { p: 0.55, text: 'Die Schweißer schenken dir ein Teil, das noch nach Holzkohle duftet.', effects: [{ item: { rarity: 'common', tag: 'feuer' } }] },
          { p: 0.2, text: 'Ein Schweißer zieht nebenbei eine Naht an deiner Kiste nach. Sauber!', effects: [{ upgradeItem: 'random' }] },
          { p: 0.25, text: 'Du fasst die Bremsscheibe an. Einmal. Die Kiste kriegt auch was ab.', effects: [{ hpPct: -0.1 }] },
        ],
      },
      {
        label: 'Glut für den Motor kaufen',
        hint: 'Heiß verpackt, heiß bezahlt.',
        cost: { bolts: 20 },
        outcomes: [
          { p: 0.65, text: 'Eine Schaufel Glut, gut verpackt. Deine Feuerteile glühen vor Neid.', effects: [{ item: { rarity: 'rare', tag: 'feuer' } }] },
          { p: 0.35, text: 'Die Glut heizt den Tank vor. Irgendwie passt jetzt mehr rein.', effects: [{ maxFuel: 8 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du nimmst ein Würstchen auf die Hand und fährst weiter. Lecker.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_tag_feuer_hochofen',
    acts: [2, 3],
    requires: { tag: 'feuer', min: 2 },
    title: 'Der alte Hochofen',
    text: 'Ein stillgelegter Hochofen ragt aus der Landschaft, ganz unten glimmt noch ein Rest. Deine Feuerteile zappeln in der Kiste, als wollten sie nach Hause. Am Ofen hängt ein Schild: „Anheizen auf eigene Gefahr.“',
    options: [
      {
        label: 'Den Ofen anheizen',
        hint: 'Feuer macht Teile härter. Oder flüssig.',
        cost: { hpPct: 0.1 },
        outcomes: [
          { p: 0.5, text: 'Du härtest ein Fundstück in der Glut. Es kommt glänzend und stolz zurück.', effects: [{ upgradeItem: 'choose' }] },
          { p: 0.3, text: 'Im Ofen klebt ein Teil, das seit Jahren auf dich gewartet hat. Noch warm.', effects: [{ item: { rarity: 'rare', tag: 'feuer' } }] },
          { p: 0.2, text: 'Aus der Glut steigt etwas Rußiges und setzt sich auf deine Kiste. Es will bleiben.', effects: [{ curse: true }] },
        ],
      },
      {
        label: 'Ein Fundstück einschmelzen',
        hint: 'Weg ist weg – aber Metall ist Metall.',
        cost: { item: 'choose' },
        outcomes: [
          { p: 0.6, text: 'Aus dem Fundstück wird ein Barren. Den nimmt jeder Händler gern.', effects: [{ bolts: 40 }, { scrap: 20 }] },
          { p: 0.4, text: 'Das Metall fließt in eine Form und wird zu etwas Neuem. Heiß und besser.', effects: [{ item: { rarity: 'rare', tag: 'feuer' } }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du lässt den Ofen glimmen. Deine Feuerteile seufzen leise.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_tag_eis_kuehlhaus',
    acts: [1, 2, 3],
    requires: { tag: 'eis', min: 2 },
    title: 'Das offene Kühlhaus',
    text: 'Eine Kühlhaus-Tür steht einen Spalt offen, kalter Nebel kriecht über den Boden. Drinnen hängen Eiszapfen von der Decke. Deine Eisteile fühlen sich sofort wie zu Hause.',
    options: [
      {
        label: 'Im Kühlhaus stöbern',
        hint: 'Kalt. Sehr kalt. Und die Tür klemmt.',
        outcomes: [
          { p: 0.5, text: 'Hinter einer Palette Fischstäbchen liegt ein frostiges Fundstück.', effects: [{ item: { rarity: 'common', tag: 'eis' } }] },
          { p: 0.2, text: 'Ganz hinten, unter einer Eisschicht: ein echtes Prachtstück.', effects: [{ item: { rarity: 'rare', tag: 'eis' } }] },
          { p: 0.3, text: 'Die Tür fällt zu. Bis du sie aufkriegst, ist die Kiste halb eingefroren.', effects: [{ hpPct: -0.1 }] },
        ],
      },
      {
        label: 'Die Kiste runterkühlen lassen',
        hint: 'Kostet Stromgeld. Kühlt alles runter.',
        cost: { bolts: 15 },
        outcomes: [
          { p: 0.7, text: 'Gekühlt und ausgeruht. Kleine Dellen ziehen sich einfach zusammen.', effects: [{ hpPct: 0.2 }] },
          { p: 0.3, text: 'Eine Eisschicht bleibt als Panzer hängen. Taut erstaunlicherweise nicht.', effects: [{ maxHp: 5 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du machst die Tür zu. Strom sparen, sagt Opa Gerd.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_tag_eis_eisdiele',
    acts: [2, 3],
    requires: { tag: 'eis', min: 2 },
    title: 'Die Eisdiele „Polarstern“',
    text: 'Eine Eisdiele mit kaputter Kühltheke, der Eisverkäufer rauft sich die Haare: „Alles schmilzt!“ Dann sieht er deine Eisteile und bekommt große Augen.',
    options: [
      {
        label: 'Die Kühltheke reparieren',
        hint: 'Bastelei an fremder Technik.',
        outcomes: [
          { p: 0.55, text: 'Die Theke brummt wieder. Zum Dank gibt es ein eisiges Fundstück.', effects: [{ item: { rarity: 'rare', tag: 'eis' } }] },
          { p: 0.25, text: 'Er zahlt in Schrauben und Waffeln. Die Waffeln isst du sofort.', effects: [{ bolts: 30 }] },
          { p: 0.2, text: 'Er hält ein Fundstück für ein Kühl-Ersatzteil und baut es fest ein. Pech.', effects: [{ removeItem: 'random' }] },
        ],
      },
      {
        label: 'Ein Fundstück als Kühlakku geben',
        hint: 'Er tauscht großzügig. Sagt er.',
        cost: { item: 'choose' },
        outcomes: [
          { p: 0.75, text: 'Er tauscht gegen ein Profi-Kühlteil und eine Kugel Zitrone gratis.', effects: [{ item: { rarity: 'rare', tag: 'eis' } }, { bolts: 10 }] },
          { p: 0.25, text: 'Er holt sein bestes Stück aus dem Tiefkühler. „Für Notfälle!“', effects: [{ item: { rarity: 'epic', tag: 'eis' } }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du wünschst ihm einen kühlen Kopf und fährst weiter.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_tag_elektro_techniker',
    acts: [1, 2, 3],
    requires: { tag: 'elektro', min: 2 },
    title: 'Der Techniker im Blaumann',
    text: 'Vor einem Umspannwerk sitzt ein Techniker im Blaumann und isst sein Pausenbrot. Als er deine knisternden Elektroteile hört, legt er das Brot weg. „Darf ich mal messen?“',
    options: [
      {
        label: 'Die Teile durchmessen lassen',
        hint: 'Er misst gegen Kaffeegeld.',
        cost: { bolts: 15 },
        outcomes: [
          { p: 0.6, text: 'Er lötet eine wackelige Stelle nach. Das Fundstück läuft jetzt wie ein Uhrwerk.', effects: [{ upgradeItem: 'choose' }] },
          { p: 0.4, text: 'Er schenkt dir ein Ersatzteil aus seiner Tasche. „Hab ich doppelt.“', effects: [{ item: { rarity: 'common', tag: 'elektro' } }] },
        ],
      },
      {
        label: 'Ein Teil am Prüfstand testen',
        hint: 'Der Prüfstand ist älter als der Techniker.',
        outcomes: [
          { p: 0.5, text: 'Der Prüfstand zeigt Bestwerte. Der Techniker gibt dir sein Vorführteil.', effects: [{ item: { rarity: 'rare', tag: 'elektro' } }] },
          { p: 0.5, text: 'Der Prüfstand schlägt Funken. Die Kiste riecht jetzt nach verbranntem Toast.', effects: [{ hpPct: -0.12 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Der Techniker winkt mit dem Brot. Sicherheit geht vor.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_tag_elektro_flipper',
    acts: [2, 3],
    requires: { tag: 'elektro', min: 2 },
    title: 'Der Flipperautomat',
    text: 'In einer verlassenen Spielhalle blinkt ein einziger Flipperautomat. Er läuft ohne Stecker – angeblich mit der Energie seiner Spieler. Deine Elektroteile zucken vor Aufregung.',
    options: [
      {
        label: 'Eine Kugel spielen',
        hint: 'Ein Spiel kostet zehn Schrauben.',
        cost: { bolts: 10 },
        outcomes: [
          { p: 0.35, text: 'Highscore! Der Automat spuckt Schrauben statt Freispiele.', effects: [{ bolts: 35 }] },
          { p: 0.3, text: 'Extraball – und ein Fundstück aus dem Ausgabeschacht.', effects: [{ item: { rarity: 'common', tag: 'elektro' } }] },
          { p: 0.15, text: 'JACKPOT! Der Automat ist selbst überrascht.', effects: [{ item: { rarity: 'rare', tag: 'elektro' } }] },
          { p: 0.2, text: 'Die Kugel rollt mittig ins Aus. Ohne Umweg. Frechheit.', effects: [{ nothing: true }] },
        ],
      },
      {
        label: 'Den Automaten anzapfen',
        hint: 'Er merkt, wenn man ihn ausnutzt.',
        outcomes: [
          { p: 0.5, text: 'Ein Fundstück zieht Saft aus dem Automaten und wird spürbar wacher.', effects: [{ upgradeItem: 'random' }] },
          { p: 0.5, text: 'Der Automat klappt beide Flipper hoch. Direkt gegen deine Kiste.', effects: [{ hpPct: -0.1 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Der Automat blinkt „GAME OVER“. Ganz schön persönlich.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_tag_gyro_kreiselturnier',
    acts: [1, 2, 3],
    requires: { tag: 'gyro', min: 2 },
    title: 'Das Kreiselturnier',
    text: 'Auf einem Garagendach treffen sich Kreisel-Fans zum großen Wettdrehen. Sie haben sofort gesehen, dass in deiner Kiste etwas rotiert. „Mitmachen? Wer am längsten dreht, gewinnt!“',
    options: [
      {
        label: 'Mitmachen',
        hint: 'Startgeld 15 Schrauben.',
        cost: { bolts: 15 },
        outcomes: [
          { p: 0.4, text: 'Dein Kreisel dreht und dreht. Die anderen gehen schon nach Hause. Gewonnen!', effects: [{ bolts: 40 }] },
          { p: 0.3, text: 'Zweiter Platz – der Preis ist trotzdem ein schicker Profi-Kreisel.', effects: [{ item: { rarity: 'rare', tag: 'gyro' } }] },
          { p: 0.3, text: 'Dein Kreisel eiert vom Dach. Unten freut sich eine Taube.', effects: [{ nothing: true }] },
        ],
      },
      {
        label: 'Kreisel-Kniffe abgucken',
        hint: 'Gucken ist umsonst. Nachmachen nicht.',
        outcomes: [
          { p: 0.55, text: 'Ein Trick mit dem Daumen – und ein Fundstück läuft runder als vorher.', effects: [{ upgradeItem: 'random' }] },
          { p: 0.45, text: 'Du übst den Trick an der Kiste. Sie dreht sich. Einmal ganz. Ins Regal.', effects: [{ hpPct: -0.08 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du lässt die Kreisel kreiseln. Dir ist schon vom Zusehen schwindelig.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_tag_gyro_schleudergang',
    acts: [2, 3],
    requires: { tag: 'gyro', min: 2 },
    title: 'Der ewige Schleudergang',
    text: 'In einem Waschsalon dreht sich eine Industriewaschmaschine im Schleudergang – seit Tagen, sagt der Zettel daneben. Deine Gyroteile schwingen mit, als würden sie die Melodie kennen.',
    options: [
      {
        label: 'Die Maschine anhalten',
        hint: 'Sie wehrt sich mit allem, was sie hat.',
        cost: { hpPct: 0.1 },
        outcomes: [
          { p: 0.6, text: 'Drinnen kreist ein Schwungrad zwischen den Socken. Sauber und schnell.', effects: [{ item: { rarity: 'rare', tag: 'gyro' } }] },
          { p: 0.4, text: 'Ein frisch gewaschenes Teil und ein Häufchen Schrauben aus dem Flusensieb.', effects: [{ item: { rarity: 'common', tag: 'gyro' } }, { bolts: 15 }] },
        ],
      },
      {
        label: 'Ein Fundstück mitschleudern',
        hint: 'Danach ist es anders. Ob besser?',
        outcomes: [
          { p: 0.5, text: 'Nach 1400 Umdrehungen ist dein Fundstück blitzblank und hellwach.', effects: [{ upgradeItem: 'choose' }] },
          { p: 0.5, text: 'Die Maschine behält das Fundstück. Wie eine Socke. Für immer.', effects: [{ removeItem: 'random' }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du lässt sie schleudern. Irgendwann muss sie ja fertig werden.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_tag_magnet_kompasse',
    acts: [1, 2, 3],
    requires: { tag: 'magnet', min: 2 },
    title: 'Die verwirrten Kompasse',
    text: 'Eine Wandergruppe steht ratlos am Wegrand – alle Kompassnadeln zeigen auf deine Kiste. Deine Magnetteile sind offenbar stärker als der Nordpol. Der Gruppenleiter guckt vorwurfsvoll.',
    options: [
      {
        label: 'Der Gruppe den Weg zeigen',
        hint: 'Du kennst den Weg. Ungefähr. Kostet Sprit.',
        cost: { maxFuel: 8 },
        outcomes: [
          { p: 0.6, text: 'Die Wandergruppe legt zusammen. Wanderer zahlen pünktlich.', effects: [{ bolts: 30 }, { scrap: 10 }] },
          { p: 0.4, text: 'Der Gruppenleiter schenkt dir seinen Ersatzkompass. Der zeigt jetzt nur noch auf dich.', effects: [{ item: { rarity: 'rare', tag: 'magnet' } }] },
        ],
      },
      {
        label: 'Die Nadeln zurechtrücken',
        hint: 'Feinarbeit mit groben Magneten.',
        outcomes: [
          { p: 0.5, text: 'Ein Kompass bleibt an deiner Kiste kleben. Die Gruppe schenkt ihn dir einfach.', effects: [{ item: { rarity: 'common', tag: 'magnet' } }] },
          { p: 0.5, text: 'Alle Kompasse fliegen auf einmal gegen deine Kiste. Klonk, klonk, klonk.', effects: [{ hpPct: -0.08 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du fährst weiter. Die Nadeln drehen sich langsam mit.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_tag_magnet_kranlehrling',
    acts: [2, 3],
    requires: { tag: 'magnet', min: 2 },
    title: 'Der Magnetkran-Lehrling',
    text: 'Ein Lehrling übt am großen Magnetkran und erwischt ständig das Falsche. Als deine Kiste vorbeifährt, ruckt der Magnet in deine Richtung. „Halt! Deine Magnetteile bringen mich durcheinander!“',
    options: [
      {
        label: 'Dem Lehrling helfen',
        hint: 'Er lernt noch. Du bist das Übungsstück.',
        cost: { hpPct: 0.1 },
        outcomes: [
          { p: 0.65, text: 'Zusammen fischt ihr ein Prachtstück aus dem Haufen. Er schenkt es dir.', effects: [{ item: { rarity: 'rare', tag: 'magnet' } }] },
          { p: 0.35, text: 'Er zeigt dir den Schaltplan des Krans. Den darfst du abzeichnen.', effects: [{ blueprints: 1 }] },
        ],
      },
      {
        label: 'Ein Fundstück aufmagnetisieren',
        hint: 'Kostet Schrauben. Klappt nicht immer.',
        cost: { bolts: 20 },
        outcomes: [
          { p: 0.6, text: 'Ein Fundstück wird ordentlich aufgeladen. Es zieht jetzt Büroklammern an.', effects: [{ upgradeItem: 'choose' }] },
          { p: 0.4, text: 'Das klappt nicht ganz. Zum Trost gibt er dir ein Ersatzteil vom Kran.', effects: [{ item: { rarity: 'common', tag: 'magnet' } }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du fährst schnell weiter, bevor der Kran dich mitnimmt.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_tag_schrott_flohmarkt',
    acts: [1, 2, 3],
    requires: { tag: 'schrott', min: 2 },
    title: 'Der Schrott-Flohmarkt',
    text: 'Auf einem Parkplatz ist Flohmarkt – aber nur für Schrott. Die Händler riechen sofort, dass du Ahnung hast: Deine Kiste klappert wie die eines Profis. „Tauschen? Tauschen!“',
    options: [
      {
        label: 'Ein Fundstück eintauschen',
        hint: 'Flohmarkt-Händler sind gerissen.',
        cost: { item: 'choose' },
        outcomes: [
          { p: 0.6, text: 'Du tauschst geschickt und fährst mit etwas Besserem weiter.', effects: [{ item: { rarity: 'rare', tag: 'schrott' } }] },
          { p: 0.25, text: 'Ein fairer Tausch mit Schrauben obendrauf. Flohmarkt-Profi!', effects: [{ item: { rarity: 'common', tag: 'schrott' } }, { bolts: 20 }] },
          { p: 0.15, text: 'Der Händler hat dir was angedreht. Es klappert anders als die anderen.', effects: [{ curse: true }] },
        ],
      },
      {
        label: 'In der Grabbelkiste wühlen',
        hint: 'Zehn Schrauben pro Griff.',
        cost: { bolts: 10 },
        outcomes: [
          { p: 0.6, text: 'Für zehn Schrauben ein ganzes Fundstück. Grabbelkisten lügen nicht.', effects: [{ item: { rarity: 'common', tag: 'schrott' } }] },
          { p: 0.4, text: 'Nur Krimskrams. Aber Krimskrams lässt sich zu Schrott machen.', effects: [{ scrap: 25 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du feilschst nur zum Spaß und fährst weiter.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_tag_schrott_dino',
    acts: [2, 3],
    requires: { tag: 'schrott', min: 2 },
    title: 'Der Schrott-Dino',
    text: 'Eine Künstlerin schweißt aus Schrott einen riesigen Dinosaurier zusammen. Ihr fehlt noch der Schwanz. Sie mustert deine Kiste mit Kennerblick: „Du hast da genau das richtige Zeug.“',
    options: [
      {
        label: 'Ein Fundstück für die Kunst geben',
        hint: 'Kunst braucht Opfer. Zufällige.',
        cost: { item: 'random' },
        outcomes: [
          { p: 0.6, text: 'Der Dino hat jetzt einen Schwanz. Zum Dank bekommst du ihr Lieblingsteil.', effects: [{ item: { rarity: 'rare', tag: 'schrott' } }] },
          { p: 0.4, text: 'Sie gibt dir ihre Skizzen und ein bisschen Schraubengeld. Kunst lohnt sich!', effects: [{ blueprints: 1 }, { bolts: 15 }] },
        ],
      },
      {
        label: 'Beim Schweißen Modell stehen',
        hint: 'Stillhalten neben Funkenflug.',
        outcomes: [
          { p: 0.5, text: 'Sie schweißt dir nebenbei ein paar Bleche an. Kunstvoll und stabil.', effects: [{ maxHp: 6 }] },
          { p: 0.5, text: 'Ein Funke landet auf deiner Kiste. Dann noch einer. Dann viele.', effects: [{ hpPct: -0.1 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Der Dino schaut dir nach. Du findest, er grinst.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_tag_hydraulik_hebebuehne',
    acts: [1, 2, 3],
    requires: { tag: 'hydraulik', min: 2 },
    title: 'Die zuckende Hebebühne',
    text: 'In einer Autowerkstatt steht eine Hebebühne, die nur noch zuckt. Der Meister schimpft leise auf Plattdeutsch. Als er deine Hydraulikteile zischen hört, hellt sich sein Gesicht auf.',
    options: [
      {
        label: 'Die Hebebühne entlüften',
        hint: 'Öl spritzt gern dahin, wo du stehst.',
        outcomes: [
          { p: 0.55, text: 'Die Bühne fährt hoch wie neu. Der Meister schenkt dir einen Profi-Zylinder.', effects: [{ item: { rarity: 'rare', tag: 'hydraulik' } }] },
          { p: 0.2, text: 'Er zahlt bar und spendiert dir eine Brause.', effects: [{ bolts: 30 }] },
          { p: 0.25, text: 'Ein Ölstrahl trifft dich und die Kiste. Ihr glänzt jetzt beide.', effects: [{ hpPct: -0.1 }] },
        ],
      },
      {
        label: 'Die Kiste aufbocken lassen',
        hint: 'Unterbodenpflege gegen Schrauben.',
        cost: { bolts: 20 },
        outcomes: [
          { p: 0.7, text: 'Von unten sah die Kiste schlimm aus. Jetzt nicht mehr.', effects: [{ hpPct: 0.2 }] },
          { p: 0.3, text: 'Der Meister schweißt ein Blech unter den Boden. Hält ewig.', effects: [{ maxHp: 6 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Der Meister ruft dir „Moin!“ hinterher. Mehr sagt er selten.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_tag_hydraulik_wasserturm',
    acts: [2, 3],
    requires: { tag: 'hydraulik', min: 2 },
    title: 'Der undichte Wasserturm',
    text: 'Aus einem alten Wasserturm schießt eine Fontäne. Ein Mann vom Wasserwerk hält den Daumen aufs Leck und schwitzt. „Hast du Hydraulik dabei? Ich brauche Gegendruck!“',
    options: [
      {
        label: 'Mit Hydraulik abdichten',
        hint: 'Der Druck ist enorm. Deine Kiste auch?',
        cost: { hpPct: 0.12 },
        outcomes: [
          { p: 0.6, text: 'Dicht! Der Wassermann schenkt dir ein Ventil, das alles aushält.', effects: [{ item: { rarity: 'rare', tag: 'hydraulik' } }] },
          { p: 0.4, text: 'Zum Dank gibt es Rohrpläne. Schön verwinkelt.', effects: [{ blueprints: 1 }] },
        ],
      },
      {
        label: 'Die Fontäne als Waschanlage nutzen',
        hint: 'Kostenlos, aber sehr nass.',
        outcomes: [
          { p: 0.6, text: 'Gratis-Wäsche! Unter dem Dreck war gar nicht so viel Rost.', effects: [{ hpPct: 0.1 }] },
          { p: 0.4, text: 'Wasser im Tank. Viel Wasser. Der Motor gurgelt beleidigt.', effects: [{ maxFuel: -6 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du winkst dem Mann. Er kann nicht zurückwinken, er hält ja das Leck zu.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_tag_gummi_huepfburg',
    acts: [1, 2, 3],
    requires: { tag: 'gummi', min: 2 },
    title: 'Die verlassene Hüpfburg',
    text: 'Vom letzten Sommerfest ist eine Hüpfburg übrig – halb aufgeblasen, ganz verlassen. Deine Gummiteile wippen in der Kiste, als wollten sie unbedingt hinein. Die Pumpe brummt noch.',
    options: [
      {
        label: 'Mit der Kiste reinspringen',
        hint: 'Federt wild. Die Landung entscheidet.',
        outcomes: [
          { p: 0.5, text: 'Boing, boing – und aus einer Ritze plumpst ein Gummiteil.', effects: [{ item: { rarity: 'common', tag: 'gummi' } }] },
          { p: 0.2, text: 'Nach hundert Hüpfern federt ein Fundstück deutlich besser.', effects: [{ upgradeItem: 'random' }] },
          { p: 0.3, text: 'Die Hüpfburg schleudert dich raus. In die Hecke. Sehr elegant.', effects: [{ hpPct: -0.1 }] },
        ],
      },
      {
        label: 'Die alte Plane kaufen',
        hint: 'Der Verleiher will 15 Schrauben dafür.',
        cost: { bolts: 15 },
        outcomes: [
          { p: 0.6, text: 'Du polsterst die Kiste rundum mit Hüpfburg-Gummi. Stöße? Welche Stöße?', effects: [{ maxHp: 7 }] },
          { p: 0.4, text: 'In der Plane steckt ein Profi-Gummiteil. Der Verleiher zuckt mit den Schultern.', effects: [{ item: { rarity: 'rare', tag: 'gummi' } }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du hüpfst einmal kurz. Nur mit den Augen.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_tag_gummi_radiergummi',
    acts: [2, 3],
    requires: { tag: 'gummi', min: 2 },
    title: 'Die Radiergummi-Fabrik',
    text: 'Eine alte Radiergummi-Fabrik verkauft Restposten ab Rampe. Der Pförtner sieht deine Gummiteile und flüstert: „Ich hab da noch was Besonderes. Radiert sogar Flüche aus.“',
    options: [
      {
        label: 'Einen Fluch ausradieren',
        hint: 'Kostet. Rubbelt meistens.',
        cost: { bolts: 30 },
        outcomes: [
          { p: 0.8, text: 'Rubbel, rubbel – der Fluch ist weg. Nur ein paar Krümel bleiben.', effects: [{ removeCurse: true }] },
          { p: 0.2, text: 'Der Fluch hält. Dafür bleibt dir ein richtig guter Radiergummi.', effects: [{ item: { rarity: 'common', tag: 'gummi' } }] },
        ],
      },
      {
        label: 'Die Restposten-Kiste nehmen',
        hint: 'Billig. Aber warum ist sie so billig?',
        cost: { bolts: 10 },
        outcomes: [
          { p: 0.6, text: 'Gummi, Gummi, Gummi. Und ein echtes Fundstück dazwischen.', effects: [{ item: { rarity: 'common', tag: 'gummi' } }] },
          { p: 0.25, text: 'Die Kiste ist voller Krümel. Gut für die Schrotttonne.', effects: [{ scrap: 20 }] },
          { p: 0.15, text: 'Ganz unten liegt ein Radierer, der leise kichert. Verflucht, natürlich.', effects: [{ curse: true }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Der Pförtner radiert deinen Namen von der Besucherliste.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_tag_rakete_modellclub',
    acts: [1, 2, 3],
    requires: { tag: 'rakete', min: 2 },
    title: 'Der Modellraketen-Club',
    text: 'Auf einer Wiese zählt ein Modellraketen-Club gerade einen Countdown. Als sie deine Raketenteile sehen, unterbrechen sie bei „Drei“. „Willst du mitstarten? Die Rampe ist frei!“',
    options: [
      {
        label: 'Eine Rakete mitstarten',
        hint: 'Startgebühr. Landung ungewiss.',
        cost: { bolts: 15 },
        outcomes: [
          { p: 0.45, text: 'Perfekter Flug! Der Club schenkt dir den Pokal: ein echtes Raketenteil.', effects: [{ item: { rarity: 'rare', tag: 'rakete' } }] },
          { p: 0.3, text: 'Der Clubchef zeigt dir die Baupläne seiner Siegerrakete.', effects: [{ blueprints: 1 }] },
          { p: 0.25, text: 'Die Rakete fliegt sehr hoch. Und kommt nicht wieder. Alle klatschen trotzdem.', effects: [{ nothing: true }] },
        ],
      },
      {
        label: 'Den Club-Treibstoff testen',
        hint: 'Die Mischung ist streng geheim. Und streng.',
        outcomes: [
          { p: 0.55, text: 'Der Treibstoff passt perfekt. Dein Tank fühlt sich größer an.', effects: [{ maxFuel: 10 }] },
          { p: 0.45, text: 'Puff! Eine Rußwolke. Die Kiste ist jetzt schwarz-weiß gestreift.', effects: [{ hpPct: -0.1 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Der Club zählt weiter: „Zwei … eins …“ Du bist schon weg.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_tag_rakete_sternwarte',
    acts: [2, 3],
    requires: { tag: 'rakete', min: 2 },
    title: 'Die alte Sternwarte',
    text: 'Auf einem Hügel steht eine Sternwarte mit verbeulter Kuppel. Die Hobby-Astronomin darin will unbedingt näher an die Sterne. „Mit deinen Raketenteilen? Wir könnten es schaffen!“',
    options: [
      {
        label: 'Die Kuppel aufschieben',
        hint: 'Die Kuppel klemmt seit 1983.',
        cost: { hpPct: 0.12 },
        outcomes: [
          { p: 0.55, text: 'Die Kuppel geht auf, die Astronomin jubelt und schenkt dir ihr Lieblingsteil.', effects: [{ item: { rarity: 'rare', tag: 'rakete' } }] },
          { p: 0.45, text: 'Kuppel offen, Sternkarte gratis. Auf der Rückseite sind Baupläne gekritzelt.', effects: [{ blueprints: 1 }, { scrap: 15 }] },
        ],
      },
      {
        label: 'Ein Fundstück als Satellit spenden',
        hint: 'Weg ist es. Aber die Aussicht!',
        cost: { item: 'random' },
        outcomes: [
          { p: 0.7, text: 'Die Astronomin tauscht dein Teil gegen ein Profi-Triebwerk. „Fair ist fair.“', effects: [{ item: { rarity: 'rare', tag: 'rakete' } }] },
          { p: 0.3, text: 'Sie gibt dir ihr bestes Stück – ein Triebwerk mit Sternenstaub.', effects: [{ item: { rarity: 'epic', tag: 'rakete' } }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Die Astronomin winkt dir mit dem Fernrohr. Von ganz nah.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_tag_gluck_kleewiese',
    acts: [1, 2, 3],
    requires: { tag: 'gluck', min: 2 },
    title: 'Die Kleeblatt-Wiese',
    text: 'Hinter dem Zaun wächst eine Wiese voller Klee, und zwischen deinen Glücksteilen kribbelt es. Ein Mädchen mit Lupe sucht schon seit Stunden. „Hier sind Vierblättrige, ich spür das!“',
    options: [
      {
        label: 'Mitsuchen',
        hint: 'Kostet Zeit. Der Motor läuft weiter.',
        outcomes: [
          { p: 0.4, text: 'Ein Vierblättriges! Und noch eins! Das Mädchen schenkt dir eins davon.', effects: [{ item: { rarity: 'common', tag: 'gluck' } }] },
          { p: 0.2, text: 'Ein FÜNFblättriges. Das Mädchen fällt fast hintenüber.', effects: [{ item: { rarity: 'rare', tag: 'gluck' } }] },
          { p: 0.4, text: 'Stundenlang gesucht, nichts gefunden. Der Motor lief die ganze Zeit.', effects: [{ maxFuel: -5 }] },
        ],
      },
      {
        label: 'Eine Glücksmünze werfen',
        hint: 'Kopf oder Zahl um 15 Schrauben.',
        cost: { bolts: 15 },
        outcomes: [
          { p: 0.5, text: 'Kopf! Die Münze verdoppelt deinen Einsatz. Und ein bisschen mehr.', effects: [{ bolts: 40 }] },
          { p: 0.3, text: 'Die Münze landet auf der Kante. Ein Fundstück fühlt sich glücklicher an.', effects: [{ upgradeItem: 'random' }] },
          { p: 0.2, text: 'Zahl. Die Münze rollt in den Gulli. Pech gehört auch zum Glück.', effects: [{ nothing: true }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Das Mädchen sucht weiter. Du drückst ihr die Daumen.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_tag_gluck_tombola',
    acts: [2, 3],
    requires: { tag: 'gluck', min: 2 },
    title: 'Die Sommerfest-Tombola',
    text: 'Beim Sommerfest steht eine Tombola, und deine Glücksteile summen so laut, dass die Losverkäuferin es hört. „Na, heute dein Glückstag?“ Der Hauptpreis ist mit einer Decke verhüllt.',
    options: [
      {
        label: 'Drei Lose kaufen',
        hint: 'Jedes Los ein Versprechen.',
        cost: { bolts: 15 },
        outcomes: [
          { p: 0.35, text: 'Hauptgewinn! Unter der Decke: ein Glücksbringer in Geschenkpapier.', effects: [{ item: { rarity: 'rare', tag: 'gluck' } }] },
          { p: 0.35, text: 'Ein Trostpreis, aber ein brauchbarer. Glück ist relativ.', effects: [{ item: { rarity: 'common' } }] },
          { p: 0.3, text: 'Drei Nieten. Die Losverkäuferin schenkt dir ein Bonbon.', effects: [{ nothing: true }] },
        ],
      },
      {
        label: 'Das ganze Losglas kaufen',
        hint: 'Viele Lose, viel Glück? Oder viel Papier.',
        cost: { bolts: 40 },
        outcomes: [
          { p: 0.5, text: 'Ganz unten im Glas: das Los für den Superpreis!', effects: [{ item: { rarity: 'epic', tag: 'gluck' } }] },
          { p: 0.5, text: 'Zweiter Preis und ein Berg Losschnipsel. Die nimmt der Schrotthändler.', effects: [{ item: { rarity: 'rare', tag: 'gluck' } }, { scrap: 10 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du wünschst den anderen viel Glück. Das ist auch eine Art Glück.', effects: [{ nothing: true }] }],
      },
    ],
  },

  // ───────────────────────────── Paket D6: Figuren-Ketten über mehrere Runs ─────────────────────────────
  // Opa Gerd (Werkstattmeister): Seine erste Seifenkiste von 1968
  {
    id: 'ev_gerd_1',
    acts: [1, 2, 3],
    story: 'gerd',
    title: 'Opa Gerds alte Kiste',
    text: 'Opa Gerd zieht mit Schwung eine Plane herunter. Darunter: seine erste Seifenkiste von 1968, eingerostet und voller Spinnweben. „Die hat mal ein Rennen gewonnen. Fast.“',
    options: [
      {
        label: 'Gerd beim Entrosten helfen',
        hint: 'Rost ist zäh. Opa auch.',
        cost: { hpPct: 0.1 },
        outcomes: [
          { p: 0.6, text: 'Gerd zeigt dir seinen Lieblingskniff mit der Drahtbürste. Ein Fundstück glänzt.', effects: [{ upgradeItem: 'choose' }] },
          { p: 0.4, text: 'Unter dem Sitz liegt noch ein altes Ersatzteil. „Nimm mit, Kind.“', effects: [{ item: { rarity: 'common' } }] },
        ],
      },
      {
        label: 'Nach dem Rennen fragen',
        hint: 'Der Motor läuft, Opa erzählt. Lange.',
        cost: { maxFuel: 6 },
        outcomes: [
          { p: 0.6, text: 'Gerd kramt eine Skizze von 1968 hervor. „Damit hätte ich gewinnen müssen!“', effects: [{ blueprints: 1 }] },
          { p: 0.4, text: 'Nach der Geschichte drückt dir Gerd Kaffeegeld in die Hand. „Für deine Geduld.“', effects: [{ bolts: 25 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Gerd deckt die Kiste wieder zu. „Ein andermal, Kind.“', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_gerd_2',
    acts: [1, 2, 3],
    story: 'gerd',
    requiresStory: 'ev_gerd_1',
    title: 'Gerds verlorenes Rad',
    text: 'Opa Gerd hat seine alte Seifenkiste fast fertig – nur das linke Vorderrad fehlt. „Das hab ich 1968 im Graben verloren. Liegt bestimmt noch da!“ Er drückt dir eine Karte in die Hand, mit Bleistift gezeichnet.',
    options: [
      {
        label: 'Den Graben absuchen',
        hint: 'Der Graben ist seit 1968 nicht flacher geworden.',
        outcomes: [
          { p: 0.5, text: 'Das Rad ist weg – aber daneben liegt etwas noch Besseres. Gerd lacht laut.', effects: [{ item: { rarity: 'rare' } }] },
          { p: 0.25, text: 'Du findest Gerds alte Spardose. Er sagt, du sollst sie behalten.', effects: [{ bolts: 30 }] },
          { p: 0.25, text: 'Der Graben ist matschiger als gedacht. Deine Kiste steckt bis zur Achse fest.', effects: [{ hpPct: -0.12 }] },
        ],
      },
      {
        label: 'Ein eigenes Fundstück spenden',
        hint: 'Gerd vergisst so was nie.',
        cost: { item: 'choose' },
        outcomes: [
          { p: 0.7, text: 'Gerd ist gerührt und schraubt dafür an deiner Kiste herum. Liebevoll.', effects: [{ upgradeItem: 'choose' }, { maxHp: 4 }] },
          { p: 0.3, text: 'Gerd schenkt dir seine Mappe mit Plänen. „Die brauchst du mehr als ich.“', effects: [{ blueprints: 2 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Gerd faltet die Karte zusammen. „Irgendwann finde ich es.“', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_gerd_3',
    acts: [1, 2, 3],
    story: 'gerd',
    requiresStory: 'ev_gerd_2',
    title: 'Gerds letztes Rennen',
    text: 'Die alte Seifenkiste ist fertig, Opa Gerd trägt seinen Rennhelm von 1968. „Einmal noch, Kind. Gegen dich.“ Der halbe Schrottplatz steht an der Strecke und klatscht.',
    options: [
      {
        label: 'Gegen Gerd antreten',
        hint: 'Eine harte Strecke. Gerd fährt nicht nett.',
        outcomes: [
          { p: 1, text: 'Gerd zieht die Brille runter. „Kein Mitleid!“ Die Strecke ist steil und gemein.', effects: [{ stage: 'elite' }] },
        ],
      },
      {
        label: 'Gerd gewinnen lassen',
        hint: 'Ehrensache. Kostet nur Stolz – und Lack.',
        cost: { hpPct: 0.1 },
        outcomes: [
          { p: 0.7, text: 'Gerd gewinnt, strahlt wie ein Kind und schenkt dir sein wertvollstes Teil.', effects: [{ item: { rarity: 'epic' } }] },
          { p: 0.3, text: 'Gerd merkt es natürlich. Er lacht und verrät dir alles, was er weiß.', effects: [{ blueprints: 2 }, { maxHp: 5 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Gerd fährt allein. Er gewinnt. Er sagt, das zählt nicht.', effects: [{ nothing: true }] }],
      },
    ],
  },

  // Schrotthändler Kalle: KALLES SCHROTT & SÖHNE
  {
    id: 'ev_kalle_1',
    acts: [1, 2, 3],
    story: 'kalle',
    title: 'KALLES SCHROTT & SÖHNE',
    text: 'Ein frisch lackiertes Schild hängt schief über einem Schrotthaufen: „KALLES SCHROTT & SÖHNE“. Kalle grinst breit. „Söhne hab ich noch keine. Aber das Schild war im Angebot. Willst du mein erster Lehrling sein?“',
    options: [
      {
        label: 'Probearbeiten',
        hint: 'Kalle zahlt in Ware. Ware von Kalle.',
        cost: { hpPct: 0.1 },
        outcomes: [
          { p: 0.6, text: 'Du sortierst den ganzen Tag Schrauben. Kalle zahlt sogar. Fast pünktlich.', effects: [{ bolts: 25 }, { scrap: 15 }] },
          { p: 0.4, text: 'Kalle schenkt dir ein Fundstück aus der „Premium-Ecke“. Die ist rostig.', effects: [{ item: { rarity: 'common', tag: 'schrott' } }] },
        ],
      },
      {
        label: 'Kalles Eröffnungsangebot',
        hint: '„Nur heute!“, sagt Kalle. Er sagt das jeden Tag.',
        cost: { bolts: 20 },
        outcomes: [
          { p: 0.6, text: 'Tatsächlich ein gutes Teil. Kalle wirkt selbst überrascht.', effects: [{ item: { rarity: 'rare' } }] },
          { p: 0.4, text: 'Das Teil klappert verdächtig. „Das ist Patina!“, ruft Kalle. Ist es nicht.', effects: [{ curse: true }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Kalle ruft: „Das Angebot gilt nur heute! Und morgen!“', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_kalle_2',
    acts: [1, 2, 3],
    story: 'kalle',
    requiresStory: 'ev_kalle_1',
    title: 'Kalles großer Deal',
    text: 'Kalle hat Großes vor: Er will den ganzen Schrott einer alten Fabrik kaufen, aber ihm fehlen noch Schrauben. „Du bist doch mein Lehrling. Leih mir was – du kriegst es doppelt zurück! Ehrenwort von Kalle!“',
    options: [
      {
        label: 'Kalle Schrauben leihen',
        hint: 'Ein Ehrenwort von Kalle. Hm.',
        cost: { bolts: 30 },
        outcomes: [
          { p: 0.5, text: 'Kalle hält Wort! Er zahlt doppelt und ist dabei selbst sehr gerührt.', effects: [{ bolts: 60 }] },
          { p: 0.3, text: 'Statt Schrauben gibt es Ware aus der Fabrik. Gute Ware sogar.', effects: [{ item: { rarity: 'rare' } }] },
          { p: 0.2, text: 'Der Deal platzt. Kalle zahlt in Altmetall. „Nächstes Mal, versprochen!“', effects: [{ scrap: 20 }] },
        ],
      },
      {
        label: 'Beim Abtransport helfen',
        hint: 'Fabrikschrott ist schwer. Sehr schwer.',
        outcomes: [
          { p: 0.6, text: 'Du schleppst und schleppst. Kalle lässt dich ein Teil behalten.', effects: [{ item: { rarity: 'common' } }, { bolts: 10 }] },
          { p: 0.4, text: 'Ein Stahlträger rutscht von der Ladefläche. Genau auf deine Kiste.', effects: [{ hpPct: -0.15 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Kalle zuckt mit den Schultern. „Dann frag ich eben Bruno.“', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_kalle_3',
    acts: [1, 2, 3],
    story: 'kalle',
    requiresStory: 'ev_kalle_2',
    title: 'Kalles Söhne',
    text: 'Neben Kalle stehen zwei kleine Jungs in viel zu großen Blaumännern. „Darf ich vorstellen: die Söhne! Also, meine Neffen. Das Schild stimmt jetzt fast.“ Zur Feier gibt es einen Sonderverkauf – nur für dich.',
    options: [
      {
        label: 'Den Familienrabatt nehmen',
        hint: 'Kalle gibt Rabatt. Das gab es noch nie.',
        cost: { bolts: 25 },
        outcomes: [
          { p: 0.7, text: 'Kalle holt das beste Teil aus dem Lager. „Für meinen Lieblingslehrling!“', effects: [{ item: { rarity: 'epic' } }] },
          { p: 0.3, text: 'Die Neffen verwechseln die Kisten. Es gibt ein gutes Teil und Wechselgeld.', effects: [{ item: { rarity: 'rare' } }, { bolts: 15 }] },
        ],
      },
      {
        label: 'Die Neffen anlernen',
        hint: 'Zwei Kinder, ein Schraubenschlüssel.',
        outcomes: [
          { p: 0.5, text: 'Die Neffen polieren ein Fundstück, bis es funkelt. Kalle ist mächtig stolz.', effects: [{ upgradeItem: 'choose' }] },
          { p: 0.5, text: 'Die Neffen „verkaufen“ ein Fundstück an Bruno. Gegen einen Stock.', effects: [{ removeItem: 'random' }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Kalle hupt dreimal. Die Neffen hupen auch. Mit dem Mund.', effects: [{ nothing: true }] }],
      },
    ],
  },

  // Der Vereinswart vom Kleingartenverein nebenan
  {
    id: 'ev_vereinswart_1',
    acts: [1, 2, 3],
    story: 'vereinswart',
    title: 'Ärger mit dem Vereinswart',
    text: 'Der Vereinswart vom Kleingartenverein nebenan steht mit Klemmbrett am Zaun. „Ihre Kiste hat Öl auf meinen Rasen getropft. Paragraf 12, Absatz 3!“ Er misst den Fleck mit dem Zollstock nach.',
    options: [
      {
        label: 'Den Rasen nachsäen',
        hint: 'Rasensamen kosten Schrauben.',
        cost: { bolts: 10 },
        outcomes: [
          { p: 0.6, text: 'Der Rasen ist schöner als vorher. Der Vereinswart rückt widerwillig ein paar Schrauben raus.', effects: [{ bolts: 20 }] },
          { p: 0.4, text: 'Zum Dank schenkt er dir den Bauplan für einen Rasensprenger. Ordentlich beschriftet.', effects: [{ blueprints: 1 }] },
        ],
      },
      {
        label: 'Über den Paragrafen diskutieren',
        hint: 'Er kennt alle Paragrafen. Alle.',
        outcomes: [
          { p: 0.35, text: 'Du findest einen Tippfehler im Paragrafen. Er ist so beeindruckt, dass er dir Schrauben gibt.', effects: [{ bolts: 25 }] },
          { p: 0.65, text: 'Er erklärt dir die ganze Vereinssatzung. Dein Motor läuft dabei im Leerlauf.', effects: [{ maxFuel: -6 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du fährst ganz vorsichtig weiter. Er notiert trotzdem etwas.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_vereinswart_2',
    acts: [1, 2, 3],
    story: 'vereinswart',
    requiresStory: 'ev_vereinswart_1',
    title: 'Die Gartenzwerg-Inspektion',
    text: 'Der Vereinswart ist verzweifelt: Morgen kommt die Gartenzwerg-Inspektion, und sein Zwerg hat eine abgesplitterte Mütze. „Sie basteln doch! Bitte! Paragraf 4 verlangt einwandfreie Zwerge!“',
    options: [
      {
        label: 'Den Zwerg reparieren',
        hint: 'Feinarbeit an Porzellan. Mit Werkstatthänden.',
        outcomes: [
          { p: 0.6, text: 'Der Zwerg strahlt wieder. Der Vereinswart rückt ein Teil aus seinem Schuppen heraus.', effects: [{ item: { rarity: 'rare' } }] },
          { p: 0.4, text: 'Die Mütze hält – aber der Zwerg kippt dir auf die Kiste. Er ist schwerer als gedacht.', effects: [{ hpPct: -0.1 }] },
        ],
      },
      {
        label: 'Einen Blechzwerg schweißen',
        hint: 'Dafür geht ein Fundstück als Material drauf.',
        cost: { item: 'random' },
        outcomes: [
          { p: 0.7, text: 'Der Blechzwerg begeistert ihn. Er schenkt dir seinen Glückspfennig und Schrauben.', effects: [{ item: { rarity: 'rare', tag: 'gluck' } }, { bolts: 10 }] },
          { p: 0.3, text: 'Zum Dank nietet er dir ein Stück Gartenzaun an die Kiste. Stabil!', effects: [{ maxHp: 8 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Der Vereinswart klebt die Mütze selbst. Mit Kaugummi. Gegen Paragraf 9.', effects: [{ nothing: true }] }],
      },
    ],
  },

  {
    id: 'ev_vereinswart_3',
    acts: [1, 2, 3],
    story: 'vereinswart',
    requiresStory: 'ev_vereinswart_2',
    title: 'Das Vereins-Sommerfest',
    text: 'Beim Sommerfest steht der Vereinswart am Mikrofon. „Für besondere Verdienste um unsere Gartenzwerge ernenne ich … DICH zum Ehrenmitglied!“ Dafür gibt es einen Pokal – und eine Aufgabe.',
    options: [
      {
        label: 'Das Vereinsrennen fahren',
        hint: 'Eine Strecke mit Gartenzwerg-Hindernissen. Elite-Lohn.',
        outcomes: [
          { p: 1, text: 'Der Vereinswart pfeift. Die Strecke führt quer durch alle Beete. Nach Vorschrift.', effects: [{ stage: 'elite' }] },
        ],
      },
      {
        label: 'Den Vereinsschuppen ausmisten',
        hint: 'Seit 1974 nicht aufgeräumt. Paragraf 1.',
        cost: { hpPct: 0.1 },
        outcomes: [
          { p: 0.5, text: 'Unter alten Gießkannen liegt ein Schatz. „Gehört nicht zum Inventar“, sagt er streng – und schenkt ihn dir.', effects: [{ item: { rarity: 'epic' } }] },
          { p: 0.5, text: 'Du findest alte Pläne und eine Rolle Maschendraht. Der hält deine Kiste zusammen.', effects: [{ blueprints: 1 }, { maxHp: 6 }] },
        ],
      },
      {
        label: 'Weitergehen',
        outcomes: [{ p: 1, text: 'Du nimmst nur den Pokal. Er steht jetzt neben deinem Lenkrad.', effects: [{ nothing: true }] }],
      },
    ],
  },
];
