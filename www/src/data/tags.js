// Die 10 Tags mit ihren Set-Boni (2/4/6) – zusammengeführt aus den geprüften Inhaltsdateien in data/content/.
// Die Inhaltsdateien werden NICHT verändert, hier wird nur zusammengeführt (Format ARCHITEKTUR.md 4.7).
// Reine Daten: kein three.js, kein DOM.
import { TAGS as T_FEUER_EIS } from './content/content_feuer_eis.js';
import { TAGS as T_ELEKTRO_GYRO } from './content/content_elektro_gyro.js';
import { TAGS as T_MAGNET_SCHROTT } from './content/content_magnet_schrott.js';
import { TAGS as T_HYDRAULIK_GUMMI } from './content/content_hydraulik_gummi.js';
import { TAGS as T_RAKETE_GLUCK } from './content/content_rakete_gluck.js';

// Reihenfolge = Anzeige-Reihenfolge (Kompendium, Set-Übersicht)
export const TAG_IDS = ['feuer', 'eis', 'elektro', 'gyro', 'magnet', 'schrott', 'hydraulik', 'gummi', 'rakete', 'gluck'];

const ALL = { ...T_FEUER_EIS, ...T_ELEKTRO_GYRO, ...T_MAGNET_SCHROTT, ...T_HYDRAULIK_GUMMI, ...T_RAKETE_GLUCK };

// Paket B: Anzeige als Lack-Töne statt Neon (OVERHAUL.md §5) und Symbol aus dem Icon-Sprite – überschreibt nur die
// Darstellung der geprüften Inhaltsdateien (color), die Regeln bleiben unberührt.
export const TAG_PAINT = {
  feuer: { color: '#d3562a', iconId: 'feuer' }, elektro: { color: '#e0b52a', iconId: 'elektro' }, magnet: { color: '#a33a3a', iconId: 'magnet' },
  hydraulik: { color: '#3f6f86', iconId: 'hydraulik' }, rakete: { color: '#c7672f', iconId: 'rakete' }, gummi: { color: '#5c8a3a', iconId: 'gummi' },
  eis: { color: '#7fb2c4', iconId: 'eis' }, gyro: { color: '#7a5c8f', iconId: 'gyro' }, schrott: { color: '#8a7a5c', iconId: 'tonne' },
  gluck: { color: '#3f8a5a', iconId: 'gluck' },
};

export const TAGS = {};
for (const id of TAG_IDS) TAGS[id] = { ...ALL[id], ...TAG_PAINT[id] };

// Set-Stufen (Anzahl Items/Tag-Teile eines Tags)
export const SET_LEVELS = [2, 4, 6];

export const tagById = (id) => TAGS[id] || null;

// Set-Bonus einer Stufe (2/4/6) oder null
export const setBonus = (tag, level) => (TAGS[tag] && TAGS[tag].sets && TAGS[tag].sets[level]) || null;

// Eindeutige ID eines Set-Bonus (Kompendium, Trigger-Quellen): 'feuer4'
export const setId = (tag, level) => `${tag}${level}`;
