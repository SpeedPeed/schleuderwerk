// Anzeige der Stats in der Oberfläche: deutscher Name, Format und „besser“-Richtung (+1 höher besser, -1 niedriger
// besser, 0 neutral). mode: 'abs' = Zahl mit Einheit, 'pct' = relativ zum Grundwert (100 %), 'pctAbs' = Wert × 100 %.
import { BASE_STATS } from '../data/balance.js';

export const STAT_LABELS = {
  launchSpeed: { name: 'Startkraft', mode: 'abs', dec: 1, unit: ' m/s', dir: 1 },
  launchPerfectBonus: { name: 'Perfekt-Bonus', mode: 'pctAbs', dir: 1 },
  sweetSpotWidth: { name: 'Grüne Zone', mode: 'pctAbs', dir: 1 },
  mass: { name: 'Gewicht', mode: 'pct', dir: 0 },
  drag: { name: 'Luftwiderstand', mode: 'pct', dir: -1 },
  lift: { name: 'Auftrieb', mode: 'pct', dir: 1 },
  airControl: { name: 'Luftsteuerung', mode: 'pct', dir: 1 },
  maxSpin: { name: 'Max. Drehung', mode: 'pct', dir: 1 },
  flipSpeed: { name: 'Drehtempo', mode: 'pct', dir: 1 },
  autoLevel: { name: 'Selbstausrichtung', mode: 'pct', dir: 1 },
  boostThrust: { name: 'Boost-Schub', mode: 'abs', dec: 1, unit: '', dir: 1 },
  boostFuel: { name: 'Boost-Verbrauch', mode: 'abs', dec: 1, unit: '/s', dir: -1 },
  boostHeat: { name: 'Boost-Hitze', mode: 'abs', dec: 1, unit: '/s', dir: -1 },
  boostSelfDamage: { name: 'Boost-Selbstschaden', mode: 'abs', dec: 1, unit: '/s', dir: -1 },
  driveAccel: { name: 'Antrieb', mode: 'abs', dec: 2, unit: '', dir: 1 },
  driveFuel: { name: 'Antrieb-Verbrauch', mode: 'abs', dec: 2, unit: '/s', dir: -1 },
  driveHeat: { name: 'Antrieb-Hitze', mode: 'abs', dec: 1, unit: '/s', dir: -1 },
  rollFriction: { name: 'Rollreibung', mode: 'pct', dir: -1 },
  fuelMax: { name: 'Treibstoff', mode: 'abs', dec: 0, unit: '', dir: 1 },
  heatMax: { name: 'Hitzegrenze', mode: 'abs', dec: 0, unit: '', dir: 1 },
  heatGain: { name: 'Hitzezunahme', mode: 'pct', dir: -1 },
  coolRate: { name: 'Kühlung', mode: 'abs', dec: 1, unit: '/s', dir: 1 },
  durabilityMax: { name: 'Haltbarkeit', mode: 'abs', dec: 0, unit: '', dir: 1 },
  armor: { name: 'Panzerung', mode: 'pctAbs', dir: 1 },
  impactThreshold: { name: 'Aufpralltoleranz', mode: 'abs', dec: 1, unit: ' m/s', dir: 1 },
  landTolDeg: { name: 'Landetoleranz', mode: 'abs', dec: 1, unit: '°', dir: 1 },
  perfectLandDeg: { name: 'Perfekte Landung', mode: 'abs', dec: 1, unit: '°', dir: 1 },
  magnet: { name: 'Sammelradius', mode: 'abs', dec: 1, unit: ' m', dir: 1 },
  speedSoftCap: { name: 'Tempo-Grenze', mode: 'abs', dec: 0, unit: ' m/s', dir: 1 },
  luck: { name: 'Glück', mode: 'abs', dec: 1, unit: '', dir: 1 },
  boltGain: { name: 'Schrauben-Bonus', mode: 'pct', dir: 1 },
  scrapGain: { name: 'Schrott-Bonus', mode: 'pct', dir: 1 },
  itemSlots: { name: 'Item-Plätze', mode: 'abs', dec: 0, unit: '', dir: 1 },
  abilitySlots: { name: 'Fähigkeits-Plätze', mode: 'abs', dec: 0, unit: '', dir: 1 },
  abilityCooldown: { name: 'Abklingzeit', mode: 'pct', dir: -1 },
  bounce: { name: 'Abprall', mode: 'pctAbs', dir: 1 },
  shopDiscount: { name: 'Händler-Rabatt', mode: 'pctAbs', dir: 1 },
  rerollDiscount: { name: 'Reroll-Rabatt', mode: 'pctAbs', dir: 1 },
  itemChoices: { name: 'Item-Auswahl', mode: 'abs', dec: 0, unit: '', dir: 1 },
  repairBonus: { name: 'Reparatur-Bonus', mode: 'pctAbs', dir: 1 },
};

const nf = (v, dec) => v.toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec });

// Wert eines Stats lesbar formatieren
export function fmtStat(stat, v) {
  const L = STAT_LABELS[stat];
  if (!L) return nf(v, 2);
  if (L.mode === 'pct') return `${nf((v / (BASE_STATS[stat] || 1)) * 100, 0)} %`;
  if (L.mode === 'pctAbs') return `${nf(v * 100, 0)} %`;
  return `${nf(v, L.dec)}${L.unit}`;
}

export const statName = (stat) => (STAT_LABELS[stat] ? STAT_LABELS[stat].name : stat);

// Ist die Änderung from → to gut (1), schlecht (-1) oder neutral (0)?
export function statTrend(stat, from, to) {
  const d = (STAT_LABELS[stat] ? STAT_LABELS[stat].dir : 1) * Math.sign(to - from);
  return d;
}

// Anzeige-Namen der Tags (Symbol kommt als Sprite-Icon dazu, siehe data/tags.js → iconId)
export const TAG_LABELS = {
  feuer: 'Feuer', elektro: 'Elektro', magnet: 'Magnet', hydraulik: 'Hydraulik', rakete: 'Rakete',
  gummi: 'Gummi', eis: 'Eis', gyro: 'Gyro', schrott: 'Schrott', gluck: 'Glück',
};
export const tagLabel = (id) => TAG_LABELS[id] || id;
