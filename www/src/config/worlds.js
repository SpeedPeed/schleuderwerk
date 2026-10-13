// Welten: Farbpalette, Physik und Streckengenerierung.

export const WORLDS = [
  {
    id: 'steppe',
    name: 'Schrottplatz-Steppe',
    seed: 1337,              // feste Strecke, damit man sie mit der Zeit kennenlernt
    gravity: 9.81,
    moneyFactor: 1,
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
      wreck: ['#9a4a2e', '#5b6e7a', '#7d7f3a', '#a36a2c', '#6d4c7d'],
      ramp: ['#b07a42', '#9a6634'],
      pole: '#6b4a2b',
      hills: ['#c19a68', '#b18a5c', '#caa77a'],
      mountain: ['#b78f6a', '#a67d5c', '#c8a581', '#9d7656'],
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
    },
  },
];
