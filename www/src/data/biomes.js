// Schleuderwerk 2 – Biome = Akte eines Runs (ARCHITEKTUR.md 4.9, V2-DESIGN.md §3/§4). Reine Daten.
// Ersetzt data/worlds.js (Phase 1–2). Paletten von Steppe und Wüste übernommen, Gewittersteppe neu.
//
// Felder:
//   act, name, icon, desc     Anzeige (Karte, Akt-Übergang, Etappen-Intro)
//   iconId                    Symbol aus dem Icon-Sprite (Paket B)
//   gravity                   Schwerkraft
//   physics                   rollFriction (Faktor), ambientHeat (Hitze/s), landTolAdd (Grad, nasser Boden < 0)
//   tagBoost                  Items mit diesem Tag wirken stärker (Phase 4: items/inventory.js)
//   palette                   Farben (Himmel, Boden, Deko, Schlucht, Schlamm, Sand …)
//   terrain                   Grund-Hügel [Amplitude m, Wellenlänge-Faktor], Wachstum mit der Distanz
//   weather                   mögliche Wetterlagen (weight, wind [min,max] m/s, gust = Böen-Stärke, rain)
//   features                  Streckenbausteine: weights (Häufigkeit), minFloor, count [Grundzahl, + je Etage],
//                             Parameter je Baustein ([min, max] wird nach Schwierigkeit 0…1 gewählt)
//   spawn                     zufällige Schrauben/Ringe/Pickups/kleine Hindernisse zwischen den Bausteinen
//   pickups                   Anteile der Pickup-Arten
//   targets                   Zielmarke (Bronze) je Etage 0–5, eliteMult, Boss-Ziel; medals = Faktoren Silber/Gold
//   bosses                    2 Boss-Strecken: feste Bausteinfolge (sequence) + Parameter-Überschreibungen,
//                             Phase 6: intro (Text im Etappen-Intro), tips (Tipps im Intro), warnings (Warnhinweis in der
//                             Etappe ≈ STAGE.bossWarnLead m vor jedem Baustein dieser Art), music (Platzhalter-Erkennungs-
//                             melodie, audio/sfx.js → bossTheme: Wellenform, Töne in Hz, Takt in s)
//   decor                     Anteil der Deko-Objekte am Streckenrand
//
// Zielmarken: kalibriert mit tools/sim/calibrate.mjs (Ergebnis docs/BALANCE.md). Phase 6: mit dem Progressions-Simulator
// (tools/sim/progression.mjs) nachgezogen – Akt-1-Boss ×1,12, Akt 2 ×1,06, Akt 3 ×1,01 (Zielzeiten V2-DESIGN §8).

const SCHROTT_PAL = {
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
  gapWall: ['#6e4a2c', '#5e3d24'],
  gapFloor: '#2b1d12',
  mud: ['#4e3622', '#45301e', '#563c27'],
  sand: ['#d9be7c', '#cfb26c', '#e2c88a'],
};

const WUESTE_PAL = {
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
  gapWall: ['#b0602f', '#9a5228'],
  gapFloor: '#3d1f10',
  mud: ['#7a4a26', '#6a4022', '#83522c'],
  sand: ['#f3d08c', '#ecc57c', '#f7da9c'],
  heat: '#ffb066',
};

// Neu: dunkle Gewitter-Palette (nasses Gras, Schiefer-Berge, schwere Wolken)
const GEWITTER_PAL = {
  skyTop: '#1d2431',
  skyBottom: '#5f6878',
  fog: '#525b69',
  hemiSky: '#9ba8bf',
  hemiGround: '#3a3d30',
  sun: '#c8d3e8',
  grass: ['#5d7a45', '#54703e', '#67844c', '#4d6a3a'],
  grassEdge: '#3c512f',
  dirt: ['#4f3d2e', '#463527', '#584434'],
  deepDirt: '#2c231a',
  rock: ['#6a6f78', '#5c616a', '#767b84'],
  bush: ['#3f5a34', '#36502d', '#47633a'],
  cactus: ['#3f6a3a', '#4a7a44'],
  wreck: ['#6a3a2a', '#4b5a66', '#5d5f3a', '#7a5228'],
  ramp: ['#7a6248', '#6a543c'],
  pole: '#3a2e22',
  hills: ['#4b5a4a', '#445244', '#526151'],
  mountain: ['#3d4552', '#363e4a', '#46505e', '#30373f'],
  mountainShape: 'cone',
  peak: '#8a93a3',
  cloud: '#3b4352',
  gapWall: ['#3b3128', '#332a22'],
  gapFloor: '#14110e',
  mud: ['#3a2c20', '#33271c', '#423226'],
  sand: ['#8f8566', '#857b5d', '#9a9070'],
  storm: true,               // Regen, Blitz-Aufleuchten im Hintergrund
  flash: '#e8f0ff',
};

// Standard-Parameter der Bausteine ([min, max] → nach Schwierigkeit), je Biom überschreibbar
export const FEATURE_DEFAULTS = {
  hills: { len: [44, 70], amp: [1.8, 3.6], humps: [2, 3] },
  ramp: { h: [2.4, 4.2], angleDeg: [22, 32], landing: 10 },
  gap: { width: [9, 15], depth: 40, rampH: [2.4, 3.4], rampAngleDeg: [18, 24], runup: 10 },
  mud: { len: [14, 26], friction: 4 },
  sand: { len: [24, 46], friction: 1.6 },
  loop: { r: 5.2 },
  scrapPile: { n: [1, 2], h: [1.5, 2.3], spacing: [9, 14], w: 3.0 },
  crusher: { w: 3.2, period: [3.2, 2.6], open: [0.62, 0.52] },
  wind: { len: [60, 110], wind: [5, 11], gust: [2, 5] },
  thermal: { w: [14, 20], strength: 18, top: 90 },
  heatZone: { len: [40, 80], heat: [9, 14] },
  lightning: { len: [60, 100] },
  magnetZone: { len: [50, 80] },
};

export const BIOMES = [
  {
    id: 'schrottplatz',
    act: 1,
    name: 'Schrottplatz',
    icon: '🗑️',
    iconId: 'tonne',
    desc: 'Opas Schrottplatz: Schrottberge, Schlammlöcher und Pressen, die nach dem Takt einer alten Kuckucksuhr stampfen.',
    gravity: 9.81,
    physics: { rollFriction: 1, ambientHeat: 0, landTolAdd: 0 },
    tagBoost: {},
    palette: SCHROTT_PAL,
    terrain: { hills: [[6, 170], [3, 55], [1.2, 17]], ampGrowth: 600, rampEvery: [130, 260], rampHeight: [2.5, 4.5], rampAngleDeg: [22, 32] },
    weather: [
      { name: 'Windstill', icon: '☀️', weight: 0.7, wind: [0, 0] },
      { name: 'Leichte Brise', icon: '🍃', weight: 0.3, wind: [1, 3] },
    ],
    features: {
      weights: { hills: 1, ramp: 1.4, gap: 0.7, mud: 0.9, scrapPile: 1.1, crusher: 0.6 },
      minFloor: { gap: 1, scrapPile: 1, crusher: 2 },
      count: [3, 0.55],
      params: {},
    },
    spawn: {
      gap: [18, 36],
      weights: { boltArc: 0.37, boltGround: 0.16, ring: 0.16, obstacle: 0.04, bigBolt: 0.07, pickup: 0.2 },
      obstacles: { tires: 0.8, scrap: 0.2 },
    },
    pickups: { fuel: 0.32, cool: 0.12, repair: 0.07, scrap: 0.34, crate: 0.15 },
    targets: { stage: [415, 455, 460, 545, 575, 610], eliteMult: 1.3, boss: 910 },   // Paket C: Items deutlich stärker → Ziele ×1,25 (+10 % bis Etage 5), Boss ×1,6
    medals: { silver: 1.25, gold: 1.5 },
    bosses: [
      {
        id: 'schrottpresse',
        name: 'Die Schrottpresse',
        icon: '🗜️',
        desc: 'Eine ganze Batterie Schrottpressen im Gleichtakt. Wer zögert, wird zum Würfel.',
        intro: 'Opas Presse-Batterie stampft im Takt der Kuckucksuhr: fünf Stempel, Schrottberge und ein Schlammloch dazwischen. Rhythmus ist hier wichtiger als Tempo.',
        tips: ['Pressen offen = durchfahren, geschlossen = Hüpfer oder warten', 'Schlamm frisst Tempo – vorher Schwung holen'],
        warnings: { crusher: '🗜️ Presse! Takt abpassen', scrapPile: '🗑️ Schrottberg – Hüpfer!', mud: '🟤 Schlamm voraus' },
        music: { wave: 'square', notes: [110, 110, 147, 110, 98, 110], beat: 0.2 },
        sequence: ['ramp', 'crusher', 'scrapPile', 'crusher', 'mud', 'crusher', 'ramp', 'crusher', 'crusher'],
        params: { crusher: { period: [2.8, 2.4], open: [0.56, 0.5] } },
      },
      {
        id: 'magnetkran',
        name: 'Der Magnetkran',
        icon: '🧲',
        desc: 'Ein riesiger Elektromagnet am Kran zieht alles aus Blech zu sich – auch dich.',
        intro: 'Der Kran pendelt über drei Abschnitten und zerrt an allem, was aus Blech ist. Dazwischen zwei Schluchten – wer zu langsam ist, hängt plötzlich in der Luft und fällt.',
        tips: ['Unter dem Magneten nicht trödeln – er zieht nach oben und zurück', 'Vor Schluchten Anlauf nehmen'],
        warnings: { magnetZone: '🧲 Magnetkran! Mit Tempo durch', gap: '🕳️ Schlucht – Anlauf!' },
        music: { wave: 'sawtooth', notes: [82, 87, 82, 78, 82, 123], beat: 0.24 },
        sequence: ['ramp', 'magnetZone', 'gap', 'scrapPile', 'magnetZone', 'hills', 'magnetZone', 'gap'],
        params: {},
      },
    ],
    decor: { rock: 0.11, bush: 0.1, wreck: 0.07, tires: 0.04 },
  },
  {
    id: 'gluewueste',
    act: 2,
    name: 'Glutwüste',
    icon: '🏜️',
    iconId: 'wueste',
    desc: 'Flimmernde Hitze (+4 Hitze/s), Sandfelder, Thermik und Schluchten, in die ein ganzer Bus passt. Feuer-Items +25 %.',
    gravity: 9.81,
    physics: { rollFriction: 1, ambientHeat: 4, landTolAdd: 0 },
    tagBoost: { feuer: 0.25 },
    palette: WUESTE_PAL,
    terrain: { hills: [[9, 120], [4, 40], [1, 15]], ampGrowth: 500, rampEvery: [150, 300], rampHeight: [3, 6], rampAngleDeg: [24, 36] },
    weather: [
      { name: 'Windstill', icon: '☀️', weight: 0.3, wind: [0, 0] },
      { name: 'Rückenwind', icon: '🌬️', weight: 0.25, wind: [5, 9] },
      { name: 'Gegenwind', icon: '🌬️', weight: 0.25, wind: [-8, -5] },
      { name: 'Böen', icon: '💨', weight: 0.2, wind: [-2, 2], gust: 9 },
    ],
    features: {
      weights: { hills: 1.1, ramp: 1.1, gap: 1, sand: 1.2, thermal: 0.9, heatZone: 0.8, scrapPile: 0.5, wind: 0.5 },
      minFloor: { heatZone: 1, wind: 2 },
      count: [4, 0.6],
      params: { gap: { width: [14, 24], rampH: [3, 4.4], rampAngleDeg: [20, 26] } },
    },
    spawn: {
      gap: [18, 36],
      weights: { boltArc: 0.37, boltGround: 0.14, ring: 0.16, obstacle: 0.04, bigBolt: 0.07, pickup: 0.22 },
      obstacles: { cactus: 1 },
    },
    pickups: { fuel: 0.28, cool: 0.24, repair: 0.07, scrap: 0.27, crate: 0.14 },
    targets: { stage: [755, 820, 835, 860, 915, 965], eliteMult: 1.3, boss: 1025 },  // Paket C: ×1,45 (+10 %), Boss ×1,55
    medals: { silver: 1.25, gold: 1.5 },
    bosses: [
      {
        id: 'grosser_graben',
        name: 'Der Große Graben',
        icon: '🕳️',
        desc: 'Zwei Schluchten so breit, dass man drüben kaum noch die Kante sieht. Thermik hilft – wenn man sie trifft.',
        intro: 'Zwei Schluchten, so breit wie ein Fußballfeld. Die Thermik-Säulen davor tragen dich hoch – wer sie verpasst, braucht jedes bisschen Boost.',
        tips: ['Volle Kraft auf die Rampe, Boost für die Mitte aufheben', 'In der Thermik flach gleiten'],
        warnings: { gap: '🕳️ RIESEN-SCHLUCHT! Vollgas', thermal: '♨️ Thermik – mitnehmen', heatZone: '🔥 Hitzefeld' },
        music: { wave: 'triangle', notes: [196, 147, 131, 98, 131, 196], beat: 0.26 },
        sequence: ['ramp', 'thermal', 'gap', 'sand', 'thermal', 'heatZone', 'gap', 'hills'],
        params: { gap: { width: [26, 32], rampH: [4.2, 5], rampAngleDeg: [24, 28] } },
      },
      {
        id: 'gluedunen',
        name: 'Die Glutdünen',
        icon: '🔥',
        desc: 'Endlose Dünen, Sand und Hitzefelder. Wer hier überhitzt, schiebt.',
        intro: 'Keine Schlucht, kein Hindernis – nur Hitze. Drei Glutfelder, Sand und Dünen kochen jede Kühlung. Wer überhitzt, steht still.',
        tips: ['Boost in Hitzefeldern sparsam einsetzen', 'Dünen-Kuppen als Rampe nutzen'],
        warnings: { heatZone: '🔥 Glutfeld! Hitze im Blick', sand: '🏖️ Sand bremst' },
        music: { wave: 'sawtooth', notes: [147, 156, 147, 131, 117, 131], beat: 0.18 },
        sequence: ['hills', 'heatZone', 'sand', 'hills', 'thermal', 'heatZone', 'sand', 'hills', 'heatZone'],
        params: { heatZone: { heat: [13, 16] }, hills: { amp: [3, 4.5] } },
      },
    ],
    decor: { rock: 0.12, cactus: 0.12, bush: 0.04, wreck: 0.02 },
  },
  {
    id: 'gewittersteppe',
    act: 3,
    name: 'Gewittersteppe',
    icon: '⛈️',
    iconId: 'sturm',
    desc: 'Regen, Sturmböen und Blitze, die in Zonen einschlagen (Stromschlag + 6 Schaden). Nasser Boden: Landetoleranz −5°. Elektro-Items +25 %.',
    gravity: 9.81,
    physics: { rollFriction: 1, ambientHeat: 0, landTolAdd: -5 },
    tagBoost: { elektro: 0.25 },
    palette: GEWITTER_PAL,
    terrain: { hills: [[7, 150], [3.5, 48], [1.4, 16]], ampGrowth: 550, rampEvery: [140, 260], rampHeight: [3, 5], rampAngleDeg: [22, 34] },
    weather: [
      { name: 'Regen', icon: '🌧️', weight: 0.4, wind: [-2, 2], gust: 4, rain: true },
      { name: 'Gewitter', icon: '⛈️', weight: 0.35, wind: [-3, 3], gust: 7, rain: true },
      { name: 'Sturmböen', icon: '🌪️', weight: 0.25, wind: [-4, 4], gust: 11, rain: true },
    ],
    features: {
      weights: { hills: 0.9, ramp: 1, gap: 0.8, mud: 0.7, loop: 0.9, wind: 0.9, lightning: 1.2, scrapPile: 0.5 },
      minFloor: { loop: 0, lightning: 0 },
      count: [5, 0.6],
      params: { gap: { width: [14, 22], rampH: [3, 4.2] }, wind: { wind: [7, 13], gust: [3, 7] } },
    },
    spawn: {
      gap: [18, 36],
      weights: { boltArc: 0.37, boltGround: 0.14, ring: 0.18, obstacle: 0.04, bigBolt: 0.08, pickup: 0.2 },
      obstacles: { tires: 0.6, scrap: 0.4 },
    },
    pickups: { fuel: 0.3, cool: 0.1, repair: 0.1, scrap: 0.32, crate: 0.18 },
    targets: { stage: [875, 900, 990, 1010, 1090, 1140], eliteMult: 1.3, boss: 1285 }, // Paket A: Boss 740 → 830; Paket C: ×1,55 (+10 %), Boss ×1,55
    medals: { silver: 1.25, gold: 1.5 },
    bosses: [
      {
        id: 'auge_des_sturms',
        name: 'Das Auge des Sturms',
        icon: '🌪️',
        desc: 'Mitten durch den Sturm: Windwände, Blitze und Loopings. Im Auge ist es kurz ganz still.',
        intro: 'Vier Windwände – mal Gegenwind, mal Rückenwind, mit Böen bis 9 m/s. In der Mitte das Auge: kurz ruhige Hügel, dann ein Looping und der Sturm auf der anderen Seite.',
        tips: ['Bei Gegenwind flach und tief fliegen', 'Rückenwind: hoch hinaus und segeln lassen'],
        warnings: { wind: '🌬️ Sturmwand!', loop: '➰ Looping – Schwung!', lightning: '⚡ Blitze', hills: '👁 Das Auge – kurz Ruhe' },
        music: { wave: 'sawtooth', notes: [110, 165, 147, 110, 98, 82], beat: 0.16 },
        sequence: ['ramp', 'wind', 'wind', 'lightning', 'hills', 'loop', 'wind', 'wind', 'ramp'],
        weather: 'Sturmböen',
        params: { wind: { wind: [11, 15], gust: [6, 9] }, hills: { amp: [1.2, 1.8], humps: [2, 2] } },
      },
      {
        id: 'blitzallee',
        name: 'Die Blitzallee',
        icon: '⚡',
        desc: 'Eine Allee aus Blitzableitern, die leider nichts ableiten. Hier schlägt es ständig ein.',
        intro: 'Fünf Blitzzonen hintereinander, und die Einschläge kommen hier fast doppelt so schnell. Gelber Ring = gleich kracht es: Gas geben oder bremsen.',
        tips: ['Gelber Warnring: Tempo ändern statt geradeaus weiter', 'Elektro-Items lieben diese Strecke'],
        warnings: { lightning: '⚡ Blitzallee! Warnringe beachten', loop: '➰ Looping – Schwung!', gap: '🕳️ Schlucht – Anlauf!' },
        music: { wave: 'square', notes: [220, 330, 220, 415, 220, 330], beat: 0.12 },
        sequence: ['ramp', 'lightning', 'lightning', 'loop', 'lightning', 'gap', 'lightning', 'lightning', 'ramp'],
        weather: 'Gewitter',
        params: { lightning: { every: [1.3, 2.0], len: [70, 100] } },
      },
    ],
    decor: { rock: 0.12, bush: 0.12, wreck: 0.05, tires: 0.02 },
  },
];

export const biomeById = (id) => BIOMES.find((b) => b.id === id) || null;
// Boss-Daten per ID (alle Biome)
export const bossById = (id) => { for (const b of BIOMES) { const x = b.bosses.find((y) => y.id === id); if (x) return x; } return null; };
export const biomeForAct = (act) => BIOMES.find((b) => b.act === act) || BIOMES[0];

// Anzeige-Namen und Symbole der Bausteine (Etappen-Intro, Gefahrenliste)
export const FEATURE_INFO = {
  hills: { name: 'Hügel', icon: '⛰️' },
  ramp: { name: 'Rampe', icon: '📐' },
  gap: { name: 'Schlucht', icon: '🕳️', danger: true },
  mud: { name: 'Schlamm', icon: '🟤', danger: true },
  sand: { name: 'Sand', icon: '🏖️' },
  loop: { name: 'Looping', icon: '➰' },
  scrapPile: { name: 'Schrottberge', icon: '🗑️', danger: true },
  crusher: { name: 'Schrottpresse', icon: '🗜️', danger: true },
  wind: { name: 'Windzone', icon: '🌬️' },
  thermal: { name: 'Thermik', icon: '♨️' },
  heatZone: { name: 'Hitzefeld', icon: '🔥', danger: true },
  lightning: { name: 'Blitzzone', icon: '⚡', danger: true },
  magnetZone: { name: 'Magnetkran', icon: '🧲', danger: true },
};
