// Schleuderwerk 2 – Schrottstufen 1–15 (reine Daten, siehe V2-DESIGN.md §4 „Schrottstufen“, ARCHITEKTUR.md §2 data/ascension.js)
//
// Kumulativ: Auf Schrottstufe N gelten die Regeln ALLER Stufen 1..N.
// Jeder mods-Schlüssel kommt genau in EINER Stufe vor (mods = nur die neue Regel dieser Stufe).
// Aktive Mods auf Stufe N daher einfach: Object.assign({}, ...ASCENSION.slice(0, N).map((a) => a.mods)).
//
// Bedeutung der Schlüssel:
//   eliteWeightAdd      + auf das Kartengewicht von Elite-Knoten (nodes.js → elite.weight)
//   targetMul           × alle Zielmarken (Etappe, Elite, Boss)
//   towPenaltyAdd       + Anteil der max. Haltbarkeit als Abschlepp-Strafe (Basis 0,15)
//   priceMul            × alle Preise (Händler, Reroll, Werkbank, Schwarzmarkt-Schraubenpreise)
//   repairMul           × alle Reparaturen/Heilungen außerhalb der Etappe (Tankstelle, Ereignisse)
//   startCurse          Anzahl zufälliger verfluchter Items beim Run-Start (Fluch-Pool wie textEvents { curse: true }:
//                       immer mindestens die Items mit pool r_curse_1, auch ohne erforschte Flüche)
//   bossTargetMul       × Boss-Zielmarken (zusätzlich zu targetMul)
//   damageMul           × aller erlittene Schaden (vor Rüstung)
//   itemChoicesAdd      + Anzahl Items zur Wahl nach Etappen (Basis 3)
//   startDurabilityMul  × Start-Haltbarkeit (aktuell und max.)
//   heatGainMul         × alle Hitzezunahmen (wirkt wie Stat heatGain)
//   eliteHazards        Elite-Etappen erzeugen zusätzliche Gefahren (mehr Pressen, Schrottberge, Böen)
//   boltMul             × alle Schrauben-Einnahmen
//   fuelMaxMul          × max. Treibstoff
//   doubleBossAct3      Akt 3 endet mit zwei Boss-Strecken hintereinander (beide Varianten)

export const ASCENSION = [
  {
    level: 1,
    name: 'Grimmige Nachbarn',
    desc: 'Mehr Elite-Etappen auf der Karte. Die Konkurrenz aus dem Nachbargarten rüstet auf.',
    mods: { eliteWeightAdd: 0.08 },
  },
  {
    level: 2,
    name: 'Neu geeichter Zollstock',
    desc: 'Alle Zielmarken +8 %. Opa hat den Zollstock nachgemessen – zu deinen Ungunsten.',
    mods: { targetMul: 1.08 },   // Paket A: 1,08 → 1,12; Paket C: zurück auf 1,08 (Items tragen mehr, die Ziele sind ohnehin höher)
  },
  {
    level: 3,
    name: 'Teurer Abschleppdienst',
    desc: 'Nochmal kostet 20 % statt 15 %, eine Notlandung 15 % statt 10 % der max. Haltbarkeit. Der Fahrer will jetzt Trinkgeld.',
    mods: { towPenaltyAdd: 0.05 },
  },
  {
    level: 4,
    name: 'Inflation am Schrottplatz',
    desc: 'Alle Preise +10 %. Der Schrotthändler hat im Radio etwas von Aktien gehört.',
    mods: { priceMul: 1.1 },
  },
  {
    level: 5,
    name: 'Klebeband wird knapp',
    desc: 'Reparaturen heilen 25 % weniger. Die letzte Rolle muss bis Weihnachten reichen.',
    mods: { repairMul: 0.75 },
  },
  {
    level: 6,
    name: 'Omas Erbstück',
    desc: 'Jeder Run startet mit einem zufälligen verfluchten Item. Oma meinte es wirklich gut.',
    mods: { startCurse: 1 },
  },
  {
    level: 7,
    name: 'Bosse mit Muckis',
    desc: 'Boss-Zielmarken +12 %. Die Endgegner waren den ganzen Winter im Fitnessstudio.',
    mods: { bossTargetMul: 1.12 },   // Paket A: 1,15 → 1,22; Paket C: 1,12 (sonst wird Stufe 7 bei stärkerer Item-Streuung zur Mauer)
  },
  {
    level: 8,
    name: 'Dosenblech',
    desc: 'Erlittener Schaden +15 %. Die neue Karosserie war früher Erbsensuppe.',
    mods: { damageMul: 1.15 },
  },
  {
    level: 9,
    name: 'Magere Auswahl',
    desc: 'Nach Etappen nur noch 2 Items zur Wahl statt 3. Der Rest liegt noch beim Sperrmüll.',
    mods: { itemChoicesAdd: -1 },
  },
  {
    level: 10,
    name: 'Aus dritter Hand',
    desc: 'Start-Haltbarkeit −10 %. Vorbesitzer: drei Enkel, ein Ziegenbock und ein Hagelsturm.',
    mods: { startDurabilityMul: 0.9 },
  },
  {
    level: 11,
    name: 'Kühler aus dem Toaster',
    desc: 'Alle Hitzezunahmen +15 %. Er hat nie vergessen, dass er mal Brot geröstet hat.',
    mods: { heatGainMul: 1.15 },
  },
  {
    level: 12,
    name: 'Elite-Gemeinheiten',
    desc: 'Elite-Etappen bekommen zusätzliche Gefahren: mehr Pressen, Schrottberge und Böen.',
    mods: { eliteHazards: true },
  },
  {
    level: 13,
    name: 'Schrauben unterm Schrank',
    desc: 'Schrauben-Einnahmen −15 %. Jede siebte rollt unter den Schrank und bleibt dort.',
    mods: { boltMul: 0.85 },
  },
  {
    level: 14,
    name: 'Gartenzwerg im Tank',
    desc: 'Max. Treibstoff −10 %. Irgendwer hat einen Gartenzwerg im Tank versteckt. Er bleibt.',
    mods: { fuelMaxMul: 0.9 },
  },
  {
    level: 15,
    name: 'Doppelter Ärger',
    desc: 'Akt 3 endet mit zwei Bossen hintereinander. Der Sturm hat einen Zwillingsbruder.',
    mods: { doubleBossAct3: true },
  },
];

// Belohnungen: +10 % Schrott je aktiver Stufe (additiv: Stufe 15 = +150 %);
// erster Run-Sieg auf Stufe 5/10/15: je +coresPerMilestone Kern(e).
export const ASCENSION_REWARDS = {
  scrapPerLevel: 0.1,
  coreMilestones: [5, 10, 15],
  coresPerMilestone: 1,
};
