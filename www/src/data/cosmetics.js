// Schleuderwerk 2 – Lackierungen (reine Daten, Endgame-Senke, siehe V2-DESIGN.md §6, ARCHITEKTUR.md §2 data/cosmetics.js)
//
// Felder: id, name, colors { body, accent } (Hex), cost { scrap: n } | { cores: n } | null, unlock? (Bedingung als Text), flavor
//   - 16 × Schrott (500–20000, aufsteigend sortiert)
//   - 4 × Kerne (1–3)
//   - 4 × Schrottstufen-Belohnung: cost null, unlock 'ascension:N' = Run-Sieg auf Schrottstufe ≥ N
// Rein kosmetisch – keine Spielwerte.

export const PAINTS = [
  // ── Schrott (⚙) ─────────────────────────────────────────────
  {
    id: 'p_rostlaube_deluxe',
    name: 'Rostlaube Deluxe',
    colors: { body: '#8b4a2b', accent: '#d08a3c' },
    cost: { scrap: 500 },
    flavor: 'Der Rost ist echt. Das „Deluxe“ eher nicht.',
  },
  {
    id: 'p_omas_gardinen',
    name: 'Omas Gardinen-Beige',
    colors: { body: '#e3d5b8', accent: '#b0956b' },
    cost: { scrap: 750 },
    flavor: 'Riecht leicht nach Mottenkugeln und Sonntagsbraten.',
  },
  {
    id: 'p_bastelkeller_grau',
    name: 'Bastelkeller-Grau',
    colors: { body: '#6e7277', accent: '#f2c94c' },
    cost: { scrap: 1000 },
    flavor: 'Die Farbe von 40 Jahren Staub und einer Glühbirne.',
  },
  {
    id: 'p_klebeband_silber',
    name: 'Klebeband-Silber',
    colors: { body: '#b8bec4', accent: '#4f5862' },
    cost: { scrap: 1500 },
    flavor: 'Hält zusammen, was nie zusammengehörte.',
  },
  {
    id: 'p_opas_cordhose',
    name: 'Opas Cordhosen-Braun',
    colors: { body: '#7a5634', accent: '#d9b98a' },
    cost: { scrap: 2000 },
    flavor: 'Mit Rillen für mehr Bodenhaftung. Physikalisch umstritten.',
  },
  {
    id: 'p_gartenzwerg_rot',
    name: 'Gartenzwerg-Rot',
    colors: { body: '#d1352b', accent: '#3a7d44' },
    cost: { scrap: 2500 },
    flavor: 'Mütze rot, Bart egal, Laune bestens.',
  },
  {
    id: 'p_tapete_70er',
    name: '70er-Tapeten-Orange',
    colors: { body: '#e2762b', accent: '#6b3f1d' },
    cost: { scrap: 3000 },
    flavor: 'Kreise in Kreisen. Bitte nicht zu lange hinsehen.',
  },
  {
    id: 'p_giesskannen_gruen',
    name: 'Gießkannen-Grün',
    colors: { body: '#4f9d47', accent: '#f1e7c9' },
    cost: { scrap: 4000 },
    flavor: 'Tropft nur ein bisschen. Die Tomaten danken es.',
  },
  {
    id: 'p_waschkuechen_tuerkis',
    name: 'Waschküchen-Türkis',
    colors: { body: '#2fa3a0', accent: '#f4f1e8' },
    cost: { scrap: 5000 },
    flavor: 'Frisch geschleudert, leicht verfusselt.',
  },
  {
    id: 'p_senf_mittelscharf',
    name: 'Mittelscharfer Senf',
    colors: { body: '#d4a52a', accent: '#5a3b17' },
    cost: { scrap: 6000 },
    flavor: 'Gibt jeder Kiste ihren eigenen Senf dazu.',
  },
  {
    id: 'p_avocado_kueche',
    name: 'Avocado-Küche 1974',
    colors: { body: '#8a9a3b', accent: '#e8d9a8' },
    cost: { scrap: 7500 },
    flavor: 'Damals der letzte Schrei. Heute ein leises Seufzen.',
  },
  {
    id: 'p_wohnwagen_lila',
    name: 'Lila Wohnwagen-Laune',
    colors: { body: '#7d4fa3', accent: '#f0c6e0' },
    cost: { scrap: 9000 },
    flavor: 'Urlaubsgefühl ab dem ersten Abschuss.',
  },
  {
    id: 'p_kleingarten_tarnfleck',
    name: 'Kleingarten-Tarnfleck',
    colors: { body: '#556b3a', accent: '#a08a5a' },
    cost: { scrap: 11000 },
    flavor: 'Unsichtbar zwischen Kompost und Rhabarber.',
  },
  {
    id: 'p_blechfeuerwehr',
    name: 'Blechspielzeug-Feuerwehr',
    colors: { body: '#c8201e', accent: '#f5d33d' },
    cost: { scrap: 13000 },
    flavor: 'Zum Aufziehen. Tatütata inklusive.',
  },
  {
    id: 'p_nachtschicht',
    name: 'Nachtschicht-Schwarz',
    colors: { body: '#1f2328', accent: '#ff8a1f' },
    cost: { scrap: 16000 },
    flavor: 'Für Tüftler, die um drei Uhr nachts noch schweißen.',
  },
  {
    id: 'p_flohmarkt_blattgold',
    name: 'Blattgold vom Flohmarkt',
    colors: { body: '#d4af37', accent: '#7a5a12' },
    cost: { scrap: 20000 },
    flavor: 'Echt Gold! Laut Verkäufer. Für fünf Mark.',
  },

  // ── Kerne (💠) ──────────────────────────────────────────────
  {
    id: 'p_moped_chrom',
    name: 'Spiegelchrom vom Moped',
    colors: { body: '#dfe6ec', accent: '#7f8b96' },
    cost: { cores: 1 },
    flavor: 'Man sieht sich darin. Und den Fliegendreck.',
  },
  {
    id: 'p_knopfdosen_perlmutt',
    name: 'Perlmutt aus Omas Knopfdose',
    colors: { body: '#efe6f2', accent: '#9fc7d9' },
    cost: { cores: 2 },
    flavor: 'Jeder Knopf ein Andenken. Keiner passt zu irgendwas.',
  },
  {
    id: 'p_herdplatten_glut',
    name: 'Glühende Herdplatte',
    colors: { body: '#3a1a12', accent: '#ff5a1f' },
    cost: { cores: 2 },
    flavor: 'Nicht anfassen! Hat Mama immer gesagt.',
  },
  {
    id: 'p_gefrierfach_polarlicht',
    name: 'Polarlicht im Gefrierfach',
    colors: { body: '#1b3a5c', accent: '#5fffc7' },
    cost: { cores: 3 },
    flavor: 'Entdeckt hinter der Eispackung von 1998.',
  },

  // ── Schrottstufen-Belohnungen (🏆) ──────────────────────────
  {
    id: 'p_ehrenrost',
    name: 'Ehrenrost',
    colors: { body: '#9c5a2e', accent: '#e0b04a' },
    cost: null,
    unlock: 'ascension:1',
    flavor: 'Verliehen für den ersten Sieg auf Schrottstufe 1.',
  },
  {
    id: 'p_werkstattmeister_blau',
    name: 'Werkstattmeister-Blau',
    colors: { body: '#2d4f8f', accent: '#e8e1cf' },
    cost: null,
    unlock: 'ascension:5',
    flavor: 'Blaumann-Blau mit Meisterbrief. Schrottstufe 5 geschafft.',
  },
  {
    id: 'p_schrottbaron_purpur',
    name: 'Schrottbaron-Purpur',
    colors: { body: '#5b1f4a', accent: '#d4af37' },
    cost: null,
    unlock: 'ascension:10',
    flavor: 'Adel verpflichtet. Zum Weiterschrauben. Stufe 10.',
  },
  {
    id: 'p_schrottkoenig',
    name: 'Ewiger Schrottkönig',
    colors: { body: '#141414', accent: '#ffd23f' },
    cost: null,
    unlock: 'ascension:15',
    flavor: 'Stufe 15. Der ganze Schrottplatz verneigt sich.',
  },
];
