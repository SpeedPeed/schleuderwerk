// Welten: Farbpalette, Physik, Wetter und Streckengenerierung.
//
// unlock:   Bedingung zum Freischalten (Bestweite in einer anderen Welt)
// physics:  Abweichungen von den Grundwerten (Faktoren)
// weather:  mögliche Wetterlagen pro Run (weight = Häufigkeit, wind in m/s, + = Rückenwind)
// spawn:    wie oft welche Objekte kommen; obstacles = Hindernis-Typen mit Anteil
// thermals: Aufwind-Säulen (null = keine)
// decor:    Anteil der Deko-Objekte am Streckenrand

export const WORLDS = [
  {
    id: 'steppe',
    name: 'Schrottplatz-Steppe',
    seed: 1337,              // feste Strecke, damit man sie mit der Zeit kennenlernt
    gravity: 9.81,
    moneyFactor: 1,
    unlock: null,
    physics: { rollFriction: 1 },
    weather: [
      { name: 'Windstill', icon: '☀️', weight: 1, wind: [0, 0] },
    ],
    palette: {
      skyTop: '#3f86c6',
      skyBottom: '#f7d9ab',
      fog: '#efd3a6',
      hemiSky: '#d8ecff',
      hemiGround: '#8a6a3a',
      sun: '#fff0d4',
      grass: ['#b9a24a', '#a8933f', '#c4ae57', '#9f8c3c'],
      grassEdge: '#7f6f2c',
      dirt: ['#8b5a33', '#7a4d2b', '#94633b'],
      deepDirt: '#5e3b22',
      rock: ['#8d8478', '#7b7368', '#9a9184'],
      bush: ['#6f8a3a', '#5f7a30', '#7b9442'],
      cactus: ['#4f8a4a', '#5c9a52'],
      wreck: ['#9a4a2e', '#5b6e7a', '#7d7f3a', '#a36a2c', '#6d4c7d'],
      ramp: ['#b07a42', '#9a6634'],
      pole: '#6b4a2b',
      hills: ['#c19a68', '#b18a5c', '#caa77a'],
      mountain: ['#b78f6a', '#a67d5c', '#c8a581', '#9d7656'],
      mountainShape: 'cone',
      peak: '#f4efe6',
      cloud: '#fff8ee',
      car: { body: '#e8553d', trim: '#2c2c34', glass: '#2b3a55', stripe: '#ffd23f' },
    },
    terrain: {
      hills: [[6, 170], [3, 55], [1.2, 17]],  // [Amplitude m, Wellenlänge-Faktor]
      ampGrowth: 600,                       // Hügel werden mit der Distanz stärker
      firstRampX: 110,
      rampEvery: [120, 260],
      rampHeight: [2.5, 5],
      rampAngleDeg: [22, 34],
    },
    spawn: {
      gap: [16, 34],          // Abstand zwischen Objektgruppen
      weights: { coinArc: 0.33, coinGround: 0.14, ring: 0.2, obstacle: 0.26, bigCoin: 0.07 },
      obstacles: { tires: 0.65, scrap: 0.35 },
    },
    thermals: null,
    decor: { rock: 0.11, bush: 0.1, wreck: 0.05, tires: 0.03 },
  },
  {
    id: 'desert',
    name: 'Glutwüste',
    seed: 4242,
    gravity: 9.81,
    moneyFactor: 3,
    unlock: { world: 'steppe', dist: 3500 },
    physics: { rollFriction: 1.25 },        // Sand bremst stärker – Thermik und Rampen nutzen!
    weather: [
      { name: 'Windstill', icon: '☀️', weight: 0.3, wind: [0, 0] },
      { name: 'Rückenwind', icon: '🌬️', weight: 0.25, wind: [5, 9] },
      { name: 'Gegenwind', icon: '🌬️', weight: 0.25, wind: [-8, -5] },
      { name: 'Böen', icon: '💨', weight: 0.2, wind: [-2, 2], gust: 9 },
    ],
    palette: {
      skyTop: '#2a9fb5',
      skyBottom: '#ffdba3',
      fog: '#f5cf99',
      hemiSky: '#ffe9c7',
      hemiGround: '#a8642c',
      sun: '#fff1d0',
      grass: ['#e8b96a', '#dfae5e', '#efc47a', '#d9a556'],
      grassEdge: '#c48d45',
      dirt: ['#c47f3e', '#b5713a', '#cf8a48'],
      deepDirt: '#8a4f27',
      rock: ['#c2703f', '#b0633a', '#d08050'],
      bush: ['#a08a4a', '#8f7a3e'],
      cactus: ['#4f8a4a', '#5c9a52', '#467d42'],
      wreck: ['#7a5a3a', '#5b6e7a', '#9a4a2e'],
      ramp: ['#a0703c', '#8e5f30'],
      pole: '#7a5232',
      hills: ['#e7a964', '#d99a58', '#efb978'],
      mountain: ['#d9874e', '#c97a46', '#e6995c', '#b86a3c'],
      mountainShape: 'mesa',
      peak: '#e9a466',
      cloud: '#fff4e0',
      car: { body: '#e8553d', trim: '#2c2c34', glass: '#2b3a55', stripe: '#ffd23f' },
    },
    terrain: {
      hills: [[9, 120], [4, 40], [1, 15]],  // Dünen
      ampGrowth: 500,
      firstRampX: 110,
      rampEvery: [150, 300],
      rampHeight: [3, 6],
      rampAngleDeg: [24, 36],
    },
    spawn: {
      gap: [16, 34],
      weights: { coinArc: 0.33, coinGround: 0.12, ring: 0.2, obstacle: 0.28, bigCoin: 0.07 },
      obstacles: { cactus: 0.6, pillar: 0.4 },
    },
    // Aufwind-Säulen: Abstand, Breite, Aufwärts-Beschleunigung (m/s²), Höhe bis zum Abklingen
    thermals: { firstX: 70, every: [90, 180], width: [14, 22], strength: 20, top: 120 },
    decor: { rock: 0.12, cactus: 0.12, bush: 0.04, wreck: 0.02 },
  },
];

export const worldById = (id) => WORLDS.find((w) => w.id === id) || WORLDS[0];
