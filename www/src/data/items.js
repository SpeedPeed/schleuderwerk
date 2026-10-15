// Alle 88 Run-Items als eine Liste – zusammengeführt aus den geprüften Inhaltsdateien in data/content/
// (je Tag-Paar 14 Items + 10 Legendäre + 8 Verfluchte in content_legend_curse.js). Die Inhaltsdateien werden NICHT
// verändert; Format ARCHITEKTUR.md 4.6. Reine Daten + Zugriffs-Helfer: kein three.js, kein DOM.
import { ITEMS as I_FEUER_EIS } from './content/content_feuer_eis.js';
import { ITEMS as I_ELEKTRO_GYRO } from './content/content_elektro_gyro.js';
import { ITEMS as I_MAGNET_SCHROTT } from './content/content_magnet_schrott.js';
import { ITEMS as I_HYDRAULIK_GUMMI } from './content/content_hydraulik_gummi.js';
import { ITEMS as I_RAKETE_GLUCK } from './content/content_rakete_gluck.js';
import { ITEMS as I_LEGEND_CURSE } from './content/content_legend_curse.js';

export const ITEMS = [...I_FEUER_EIS, ...I_ELEKTRO_GYRO, ...I_MAGNET_SCHROTT, ...I_HYDRAULIK_GUMMI, ...I_RAKETE_GLUCK, ...I_LEGEND_CURSE];

// Seltenheiten: Anzeige (Name, Farbe) in Reihenfolge. Gewichte der Item-Auswahl: balance.ITEMS.rarityWeights.
export const RARITIES = {
  common: { name: 'Gewöhnlich', color: '#b8c0c8' },
  rare: { name: 'Selten', color: '#4fa3ff' },
  epic: { name: 'Episch', color: '#b36bff' },
  legendary: { name: 'Legendär', color: '#ffb52e' },
  cursed: { name: 'Verflucht', color: '#d6334a' },
};
export const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'cursed'];

const MAP = new Map(ITEMS.map((it) => [it.id, it]));
export const itemById = (id) => MAP.get(id) || null;

// Items je Tag (Hybride stehen bei beiden Tags)
export function itemsWithTag(tag) {
  return ITEMS.filter((it) => it.tags.includes(tag));
}

// Alle Forschungs-IDs, die einen Item-Pool freischalten (Dev-Menü „alle Items in den Pool“)
export function itemPools() {
  return [...new Set(ITEMS.map((it) => it.pool).filter((p) => p && p !== 'base'))];
}
