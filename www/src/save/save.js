import { SAVE_VERSION } from '../data/balance.js';

const KEY = 'schleuderwerk.save';

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    money: 0,
    upgrades: {},
    stats: { runs: 0, bestDist: 0, bestHeight: 0, totalEarned: 0, bestTricks: 0 },
    world: 'steppe',
    worlds: { steppe: { bestDist: 0, bestHeight: 0, runs: 0 } },
    unlocked: ['steppe'],
    settings: { sound: true, vibration: true, shake: true, shadows: true },
    tutorial: { runs: 0 },
    createdAt: Date.now(),
    savedAt: Date.now(),
  };
}

// Fehlende Felder aus älteren Versionen mit Standardwerten auffüllen
function fill(target, defaults) {
  for (const k of Object.keys(defaults)) {
    if (target[k] === undefined || target[k] === null) target[k] = defaults[k];
    else if (typeof defaults[k] === 'object' && !Array.isArray(defaults[k]) && typeof target[k] === 'object') fill(target[k], defaults[k]);
  }
  return target;
}

export function migrate(data) {
  if (!data || typeof data !== 'object') throw new Error('Kein gültiger Spielstand');
  const v = data.version || 0;
  if (v > SAVE_VERSION) throw new Error('Spielstand stammt aus einer neueren Spielversion');
  // Umbauten zwischen Versionen
  if (v < 2) {
    // v2: Rekorde pro Welt
    const s = data.stats || {};
    data.worlds = { steppe: { bestDist: s.bestDist || 0, bestHeight: s.bestHeight || 0, runs: s.runs || 0 } };
    data.world = 'steppe';
    data.unlocked = ['steppe'];
  }
  fill(data, defaultSave());
  data.version = SAVE_VERSION;
  if (typeof data.money !== 'number' || !isFinite(data.money)) data.money = 0;
  return data;
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    return migrate(JSON.parse(raw));
  } catch (e) {
    console.warn('Spielstand konnte nicht geladen werden', e);
    return defaultSave();
  }
}

export function writeSave(data) {
  try {
    data.savedAt = Date.now();
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('Speichern fehlgeschlagen', e);
    return false;
  }
}

// Export als Text (zum Sichern, z. B. in einer Notiz-App)
export function exportSave(data) {
  const json = JSON.stringify(data);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return `SW${SAVE_VERSION}:${b64}`;
}

export function importSave(text) {
  const s = String(text || '').trim();
  const m = s.match(/^SW\d+:(.+)$/s);
  if (!m) throw new Error('Text beginnt nicht mit „SW…:“');
  const json = decodeURIComponent(escape(atob(m[1].replace(/\s+/g, ''))));
  return migrate(JSON.parse(json));
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (_) { /* egal */ }
}
