// Paket D – Ereignisse während der Etappe: kleine Überraschungen auf der Strecke, zusammengesetzt aus Bausteinen, die
// Physik und Grafik schon kennen (Schrauben, Pickups, Ringe, Aufwind, Blitze). Kurz vorher kündigt ein Hinweis sie an.
// Vergabe: physics/trackGen.js → spec.events (ab Etage STAGE_EVENT_RULES.minFloor, je Etappe count, Elite +1, Boss nie);
// Aufbau: physics/objects.js → setupEvents. Reine Daten.
//   build  Bauplan: 'boltCloud' | 'tornado' | 'fuelRow' | 'scrapShower' | 'ringParade' | 'flyingCrate' | 'storm' | 'repairDrop'
//   alt    Höhe über Grund (m) [von, bis]; n Anzahl; value Wert je Schraube/Schrott
//   minAct ab Akt; weight Häufigkeit

export const STAGE_EVENT_RULES = {
  minFloor: 2,             // ab Etage 2 (Etage 0–1: Einstieg ohne Überraschungen)
  count: [1, 2],           // je normale Etappe 1–2 (zweites mit secondChance)
  secondChance: 0.4,
  eliteExtra: 1,
  region: [0.25, 0.8],     // Lage: Anteil der Zielweite
  minGap: 70,              // Mindestabstand zweier Ereignisse (m)
  warnLead: 60,            // Hinweis so viele Meter vorher
};

export const STAGE_EVENTS = [
  {
    id: 'schraubenwolke', name: 'Schraubenwolke', iconId: 'schraube', weight: 1.2,
    warn: 'SCHRAUBENWOLKE VORAUS – HOCH HINAUS!',
    desc: 'Eine Wolke aus Schrauben hängt in der Luft – wer hoch fliegt, sahnt ab.',
    build: 'boltCloud', alt: [22, 34], n: 18, value: 2,
  },
  {
    id: 'tornado', name: 'Tornado-Säule', iconId: 'wind', weight: 1,
    warn: 'TORNADO-SÄULE – REIN DA!',
    desc: 'Ein Wirbelsturm reißt die Kiste 40 m nach oben.',
    build: 'tornado', w: 16, strength: 34, top: 55,
  },
  {
    id: 'tanklaster', name: 'Umgekippter Tanklaster', iconId: 'tank', weight: 0.9,
    warn: 'TANKLASTER UMGEKIPPT – KANISTER AM BODEN!',
    desc: 'Eine Reihe Kanister liegt am Boden. Tief fliegen lohnt sich.',
    build: 'fuelRow', alt: [1.2, 1.2], n: 4, spacing: 9,
  },
  {
    id: 'schrottregen', name: 'Schrottregen', iconId: 'schrott', weight: 1,
    warn: 'SCHROTTREGEN!',
    desc: 'Vom Himmel fällt Schrott – alles einsammeln!',
    build: 'scrapShower', alt: [6, 26], n: 9, spread: 50,
  },
  {
    id: 'ringparade', name: 'Ring-Parade', iconId: 'stern', weight: 1,
    warn: 'RING-PARADE – DURCH ALLE DURCH!',
    desc: 'Eine Kette Boost-Ringe in Kombo-Höhe.',
    build: 'ringParade', alt: [12, 22], n: 5, spacing: 22,
  },
  {
    id: 'kalles_kiste', name: 'Kalles fliegende Kiste', iconId: 'kiste', weight: 0.6, minAct: 1,
    warn: 'KALLE WIRFT EINE KISTE – SCHNAPP SIE DIR!',
    desc: 'Kalle wirft eine Item-Kiste hoch in die Luft.',
    build: 'flyingCrate', alt: [18, 28],
  },
  {
    id: 'gewitterzelle', name: 'Gewitterzelle', iconId: 'elektro', weight: 0.6, minAct: 2,
    warn: 'GEWITTERZELLE – BLITZE VORAUS!',
    desc: 'Kurzes Gewitter: Blitze schlagen ein – aber Elektro-Kisten laden auf.',
    build: 'storm', len: 70,
  },
  {
    id: 'werkstattwagen', name: 'Opas Werkstattwagen', iconId: 'schluessel', weight: 0.5,
    warn: 'OPAS WERKSTATTWAGEN – REPARATUR IM VORBEIFLUG!',
    desc: 'Opa hält zwei Reparatursets in die Luft.',
    build: 'repairDrop', alt: [8, 14], n: 2, spacing: 14,
  },
];

const BY_ID = new Map(STAGE_EVENTS.map((e) => [e.id, e]));
export const stageEventById = (id) => BY_ID.get(id) || null;
