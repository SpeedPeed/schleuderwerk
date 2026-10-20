// Paket E – Meta: Werkstatt-Stufe (Konto-Erfahrung), Aufträge und Sammelalbum. Reine Daten.
// Logik: garage/workshop.js (Gutschrift am Run-Ende über run/runState.js → endRun).

// ---------- Werkstatt-Stufe ----------
// Erfahrung (XP) je Run: Meter / perMeters + perMedal je Medaille + perBoss je besiegtem Boss + perContract je erfülltem
// Auftrag. Stufe 1–maxLevel; XP für den Schritt n → n+1: base + grow × (n − 1)^pow (gerundet auf 10).
export const WORKSHOP = {
  xp: { perMeters: 50, perMedal: 20, perBoss: 100, perContract: 50, perWin: 150 },
  maxLevel: 60,
  cost: { base: 220, grow: 40, pow: 1.3 },
};

// Belohnung je erreichter Stufe (Stufe → Belohnung). Muster: Schrott und Blaupausen im Wechsel, Stufe 3 ein Kern (zweites
// Chassis früh), alle 10 Stufen Kern + Werkstatt-Lackierung, alle 5 Stufen 2 Blaupausen. Werte steigen mit der Stufe.
export function workshopReward(level) {
  if (level <= 1) return null;
  if (level % 10 === 0) return { cores: 1, paint: `p_werkstatt_${level / 10}` };
  if (level === 3) return { cores: 1 };
  if (level % 5 === 0) return { blueprints: 2 + Math.floor(level / 20) };
  if (level % 2 === 0) return { blueprints: 1 + Math.floor(level / 15) };
  return { scrap: 60 + level * 20 };
}

// Werkstatt-Lackierungen (nur über die Werkstatt-Stufe; data/cosmetics.js listet sie mit unlock 'workshop:N')
export const WORKSHOP_PAINTS = [
  { id: 'p_werkstatt_1', name: 'Werkstatt-Blaumann', colors: { body: '#2e5c7d', accent: '#f0bf2c' }, level: 10, flavor: 'Opas Arbeitsanzug, jetzt als Lack.' },
  { id: 'p_werkstatt_2', name: 'Ölwechsel-Schwarz', colors: { body: '#1c1a17', accent: '#d48a5a' }, level: 20, flavor: 'Glänzt wie frisch abgelassenes Altöl.' },
  { id: 'p_werkstatt_3', name: 'Meisterbrief-Gold', colors: { body: '#c9a227', accent: '#6e2f17' }, level: 30, flavor: 'Gerahmt hängt er über der Werkbank.' },
  { id: 'p_werkstatt_4', name: 'Funkenflug', colors: { body: '#c4372b', accent: '#f0bf2c' }, level: 40, flavor: 'Für Leute, die beim Schweißen nie wegschauen.' },
  { id: 'p_werkstatt_5', name: 'Rostfrei-Chrom', colors: { body: '#c9ced0', accent: '#2a2825' }, level: 50, flavor: 'Opa sagt, so was gab es früher nicht.' },
  { id: 'p_werkstatt_6', name: 'Schrottkönig-Purpur', colors: { body: '#5b2b6e', accent: '#e3b02a' }, level: 60, flavor: 'Krone nicht inbegriffen.' },
];

// ---------- Chassis-Meisterschaft ----------
// Jedes Chassis sammelt die Run-XP der Runs, die mit ihm gefahren werden. Stufe n ab xp[n − 1] XP. Vorteile (kumulativ):
//   1: +startBolts Schrauben zum Start · 2: Start-Item (gewöhnlich, Lieblings-Tag des Chassis) · 3: ein vierter Bauplan ·
//   4: +startBolts2 Schrauben · 5: Meister-Plakette in der Garage (Stolz!)
export const MASTERY = {
  xp: [400, 1100, 2200, 3800, 6000],
  startBolts: 15,
  startBolts2: 25,
  perks: ['+15 Start-Schrauben', 'Start-Item des Lieblings-Tags', 'Vierter Bauplan zur Wahl', '+25 Start-Schrauben', 'Meister-Plakette'],
};

// ---------- Aufträge ----------
// Immer `active` Aufträge auf dem Klemmbrett; ist einer am Run-Ende erfüllt, gibt es die Belohnung und ein neuer wird
// gezogen (keine zwei gleichen gleichzeitig). Bedingungen prüfen die Run-Zusammenfassung (garage/workshop.js →
// runSummary). Arten:
//   stat      Wert aus der Zusammenfassung ≥ n (in EINEM Run)
//   tagAct    Akt act geschafft mit ≥ n Items des Tags tag im Rucksack (am Akt-Ende)
//   goalGold  Etappe der Art goal mit Gold
//   win       Run gewonnen (optional ascension ≥ n)
export const CONTRACT_RULES = { active: 3 };

export const CONTRACTS = [
  { id: 'c_perfekt_8', text: 'Lande 8× perfekt in einem Run', type: 'stat', key: 'perfectLandings', n: 8, reward: { scrap: 150 } },
  { id: 'c_perfekt_15', text: 'Lande 15× perfekt in einem Run', type: 'stat', key: 'perfectLandings', n: 15, reward: { scrap: 220, blueprints: 1 }, minLevel: 6 },
  { id: 'c_saltos_10', text: 'Schaffe 10 Saltos in einem Run', type: 'stat', key: 'flips', n: 10, reward: { scrap: 150 } },
  { id: 'c_saltos_25', text: 'Schaffe 25 Saltos in einem Run', type: 'stat', key: 'flips', n: 25, reward: { blueprints: 2 }, minLevel: 8 },
  { id: 'c_gold_3', text: 'Hol 3 Goldmedaillen in einem Run', type: 'stat', key: 'gold', n: 3, reward: { scrap: 180 } },
  { id: 'c_gold_6', text: 'Hol 6 Goldmedaillen in einem Run', type: 'stat', key: 'gold', n: 6, reward: { blueprints: 2 }, minLevel: 6 },
  { id: 'c_kette_4', text: 'Löse eine Kette mit 4 Gliedern aus', type: 'stat', key: 'maxChain', n: 4, reward: { scrap: 160 } },
  { id: 'c_kette_6', text: 'Löse eine Kette mit 6 Gliedern aus', type: 'stat', key: 'maxChain', n: 6, reward: { blueprints: 2 }, minLevel: 5 },
  { id: 'c_boss_1', text: 'Besiege einen Boss', type: 'stat', key: 'bosses', n: 1, reward: { scrap: 200 } },
  { id: 'c_boss_2', text: 'Besiege 2 Bosse in einem Run', type: 'stat', key: 'bosses', n: 2, reward: { scrap: 250, blueprints: 1 }, minLevel: 4 },
  { id: 'c_schrauben_150', text: 'Verdiene 150 Schrauben in einem Run', type: 'stat', key: 'bolts', n: 150, reward: { scrap: 150 } },
  { id: 'c_schrauben_400', text: 'Verdiene 400 Schrauben in einem Run', type: 'stat', key: 'bolts', n: 400, reward: { blueprints: 2 }, minLevel: 6 },
  { id: 'c_weite_5000', text: 'Fliege in einem Run zusammen 5.000 m', type: 'stat', key: 'dist', n: 5000, reward: { scrap: 150 } },
  { id: 'c_weite_12000', text: 'Fliege in einem Run zusammen 12.000 m', type: 'stat', key: 'dist', n: 12000, reward: { scrap: 260, blueprints: 1 }, minLevel: 6 },
  { id: 'c_rezept', text: 'Baue ein Rezept zusammen', type: 'stat', key: 'recipes', n: 1, reward: { blueprints: 1 } },
  { id: 'c_set5', text: 'Erreiche ein Set 5', type: 'stat', key: 'maxSet', n: 5, reward: { blueprints: 2 }, minLevel: 3 },
  { id: 'c_elite_2', text: 'Schaffe 2 Elite-Etappen in einem Run', type: 'stat', key: 'elites', n: 2, reward: { scrap: 200 } },
  { id: 'c_ereignisse_6', text: 'Erlebe 6 Strecken-Ereignisse in einem Run', type: 'stat', key: 'stageEvents', n: 6, reward: { scrap: 140 } },
  { id: 'c_gummi_akt1', text: 'Schaffe Akt 1 mit 3 Gummi-Items', type: 'tagAct', tag: 'gummi', act: 1, n: 3, reward: { scrap: 200 } },
  { id: 'c_feuer_akt1', text: 'Schaffe Akt 1 mit 3 Feuer-Items', type: 'tagAct', tag: 'feuer', act: 1, n: 3, reward: { scrap: 200 } },
  { id: 'c_magnet_akt2', text: 'Schaffe Akt 2 mit 4 Magnet-Items', type: 'tagAct', tag: 'magnet', act: 2, n: 4, reward: { blueprints: 2 }, minLevel: 4 },
  { id: 'c_gyro_akt2', text: 'Schaffe Akt 2 mit 4 Gyro-Items', type: 'tagAct', tag: 'gyro', act: 2, n: 4, reward: { blueprints: 2 }, minLevel: 4 },
  { id: 'c_hoehe_gold', text: 'Gewinne eine Höhenjagd mit Gold', type: 'goalGold', goal: 'height', reward: { scrap: 180 } },
  { id: 'c_stunt_gold', text: 'Gewinne eine Stunt-Show mit Gold', type: 'goalGold', goal: 'stunt', reward: { scrap: 180 } },
  { id: 'c_sammler_gold', text: 'Gewinne einen Schrottsammler mit Gold', type: 'goalGold', goal: 'collect', reward: { scrap: 180 } },
  { id: 'c_sprint_gold', text: 'Gewinne ein Zeitrennen mit Gold', type: 'goalGold', goal: 'sprint', reward: { scrap: 180 } },
  { id: 'c_lieferung_gold', text: 'Liefere Omas Vase mit Gold ab', type: 'goalGold', goal: 'delivery', reward: { scrap: 200 } },
  { id: 'c_sieg', text: 'Gewinne einen Run', type: 'win', reward: { scrap: 300, blueprints: 2 }, minLevel: 3 },
  { id: 'c_sieg_s3', text: 'Gewinne einen Run auf Schrottstufe 3+', type: 'win', ascension: 3, reward: { cores: 1, blueprints: 2 }, minLevel: 12 },
];

// ---------- Sammelalbum ----------
// Belohnungen für entdeckte Items (Kompendium) und gebaute Rezepte – einmalig je Schwelle.
export const ALBUM = [
  { id: 'a_items_10', text: '10 Items entdeckt', type: 'items', n: 10, reward: { blueprints: 1 } },
  { id: 'a_items_25', text: '25 Items entdeckt', type: 'items', n: 25, reward: { blueprints: 2 } },
  { id: 'a_items_50', text: '50 Items entdeckt', type: 'items', n: 50, reward: { blueprints: 3 } },
  { id: 'a_items_80', text: '80 Items entdeckt', type: 'items', n: 80, reward: { cores: 1, blueprints: 3 } },
  { id: 'a_items_all', text: 'Alle Items entdeckt', type: 'items', n: 'all', reward: { cores: 2 } },
  { id: 'a_rezepte_3', text: '3 Rezepte gebaut', type: 'recipes', n: 3, reward: { blueprints: 2 } },
  { id: 'a_rezepte_10', text: '10 Rezepte gebaut', type: 'recipes', n: 10, reward: { cores: 1 } },
  { id: 'a_rezepte_all', text: 'Alle Rezepte gebaut', type: 'recipes', n: 'all', reward: { cores: 2 } },
  { id: 'a_sets_10', text: '10 verschiedene Set-Boni aktiviert', type: 'sets', n: 10, reward: { blueprints: 2 } },
  { id: 'a_sets_all', text: 'Alle 30 Set-Boni aktiviert', type: 'sets', n: 'all', reward: { cores: 2 } },
];
