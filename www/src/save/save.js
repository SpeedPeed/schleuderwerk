// Spielstand: Schema v3 (ARCHITEKTUR.md §10), Migrationskette v0/v1 → v2 → v3, Export/Import als Text.
// Reine Logik (localStorage nur in loadSave/writeSave/clearSave) – migrate() läuft auch in node --test.
import { SAVE_VERSION, GARAGE } from '../data/balance.js';
import { sanitizeGarage } from '../garage/garage.js';

const KEY = 'schleuderwerk.save';

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    meta: { scrap: 0, blueprints: 0, cores: 0, totalPlaytime: 0, milestones: {} },
    garage: {
      chassis: GARAGE.starterChassis,
      ownedChassis: [GARAGE.starterChassis],
      parts: { ...GARAGE.starterParts },
      ownedParts: Object.values(GARAGE.starterParts),
      partLevels: {},
      abilities: [...GARAGE.starterAbilities],
    },
    research: { done: [] },
    ascension: { unlocked: 0, best: 0 },
    codex: { items: {}, sets: {} },
    cosmetics: { owned: [], paint: null },
    settings: { sound: true, vibration: true, shake: true, shadows: true },
    stats: { testDrives: 0, runs: 0, bestDist: 0, bestHeight: 0, bestTricks: 0, totalScrap: 0, totalBolts: 0 },
    // Übergang bis Phase 3 (dann Biome/Akte): gewählte Welt, freigeschaltete Welten, Rekorde je Welt
    worlds: { current: 'steppe', unlocked: ['steppe'], records: { steppe: { bestDist: 0, bestHeight: 0, runs: 0 } } },
    run: null,
    tutorial: { runs: 0 },
    createdAt: Date.now(),
    savedAt: Date.now(),
  };
}

// Fehlende Felder mit Standardwerten auffüllen (Arrays werden nicht zusammengeführt)
function fill(target, defaults) {
  for (const k of Object.keys(defaults)) {
    if (target[k] === undefined || target[k] === null) {
      if (defaults[k] !== null || !(k in target)) target[k] = defaults[k];
    } else if (typeof defaults[k] === 'object' && defaults[k] !== null && !Array.isArray(defaults[k])
      && typeof target[k] === 'object' && !Array.isArray(target[k])) fill(target[k], defaults[k]);
  }
  return target;
}

const n0 = (v) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : 0);

// v2 → v3: altes Geld wird Startschrott (money / 40, höchstens 400), Einstellungen bleiben,
// Rekorde/Statistik soweit sinnvoll, Welten (Übergang), Rest neu.
function migrateV2toV3(old) {
  const n = defaultSave();
  n.meta.scrap = Math.min(GARAGE.migrateScrapMax, Math.floor(n0(old.money) / GARAGE.migrateScrapDiv));
  if (old.settings && typeof old.settings === 'object') Object.assign(n.settings, old.settings);
  const s = old.stats || {};
  n.stats.testDrives = n0(s.runs);
  n.stats.bestDist = n0(s.bestDist);
  n.stats.bestHeight = n0(s.bestHeight);
  n.stats.bestTricks = n0(s.bestTricks);
  if (old.worlds && typeof old.worlds === 'object') n.worlds.records = { ...n.worlds.records, ...old.worlds };
  if (Array.isArray(old.unlocked) && old.unlocked.length) n.worlds.unlocked = [...new Set(['steppe', ...old.unlocked])];
  if (typeof old.world === 'string') n.worlds.current = old.world;
  if (old.tutorial && typeof old.tutorial === 'object') n.tutorial = { ...n.tutorial, ...old.tutorial };
  if (old.createdAt) n.createdAt = old.createdAt;
  return n;
}

export function migrate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Kein gültiger Spielstand');
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
  if (v < 3) data = migrateV2toV3(data);
  fill(data, defaultSave());
  data.version = SAVE_VERSION;
  // Plausibilität
  for (const k of ['scrap', 'blueprints', 'cores', 'totalPlaytime']) data.meta[k] = n0(data.meta[k]);
  if (typeof data.meta.milestones !== 'object' || Array.isArray(data.meta.milestones)) data.meta.milestones = {};
  if (!Array.isArray(data.research.done)) data.research.done = [];
  if (!Array.isArray(data.worlds.unlocked) || !data.worlds.unlocked.length) data.worlds.unlocked = ['steppe'];
  if (!data.worlds.records || typeof data.worlds.records !== 'object') data.worlds.records = {};
  sanitizeGarage(data);
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

// Export als Text (zum Sichern, z. B. in einer Notiz-App): „SW3:“ + Base64(JSON)
export function exportSave(data) {
  const json = JSON.stringify(data);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return `SW${SAVE_VERSION}:${b64}`;
}

// Import: akzeptiert SW3:… und ältere Texte (SW2:…), die über die Migration auf v3 gebracht werden
export function importSave(text) {
  const s = String(text || '').trim();
  const m = s.match(/^SW(\d+):(.+)$/s);
  if (!m) throw new Error('Text beginnt nicht mit „SW…:“');
  let json;
  try {
    json = decodeURIComponent(escape(atob(m[2].replace(/\s+/g, ''))));
  } catch (_) {
    throw new Error('Text ist beschädigt (kein gültiges Base64)');
  }
  let data;
  try { data = JSON.parse(json); } catch (_) { throw new Error('Text ist beschädigt (kein gültiger Spielstand)'); }
  if (data && typeof data === 'object' && !data.version) data.version = Number(m[1]) || 0;
  return migrate(data);
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (_) { /* egal */ }
}
