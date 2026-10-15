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

export const TAGS = {};
for (const id of TAG_IDS) TAGS[id] = ALL[id];

// Set-Stufen (Anzahl Items/Tag-Teile eines Tags)
export const SET_LEVELS = [2, 4, 6];

export const tagById = (id) => TAGS[id] || null;

// Set-Bonus einer Stufe (2/4/6) oder null
export const setBonus = (tag, level) => (TAGS[tag] && TAGS[tag].sets && TAGS[tag].sets[level]) || null;

// Eindeutige ID eines Set-Bonus (Kompendium, Trigger-Quellen): 'feuer4'
export const setId = (tag, level) => `${tag}${level}`;
