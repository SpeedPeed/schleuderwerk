// Schleuderwerk 2 – Textereignisse für den Knoten „Ereignis“ (reine Daten, siehe V2-DESIGN.md §4, ARCHITEKTUR.md §2 data/textEvents.js)
//
// Felder je Ereignis:
//   id                 eindeutig, Präfix ev_
//   acts               Akte, in denen das Ereignis gezogen werden kann (1 Schrottplatz, 2 Glutwüste, 3 Gewittersteppe)
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
];
