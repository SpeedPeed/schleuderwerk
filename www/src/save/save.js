// Spielstand: Schema v3 (ARCHITEKTUR.md §10), Migrationskette v0/v1 → v2 → v3, Export/Import als Text.
// Reine Logik (localStorage nur in loadSave/writeSave/clearSave/getBackup) – migrate() läuft auch in node --test.
// migrate() repariert falsch typisierte Felder (Standardwert statt Absturz); nicht ladbare Stände werden gesichert.
import { SAVE_VERSION, GARAGE } from '../data/balance.js';
import { sanitizeGarage } from '../garage/garage.js';
import { WORLDS } from '../data/worlds.js';

const KEY = 'schleuderwerk.save';
export const BACKUP_KEY = 'schleuderwerk.save.bak';
const WORLD_IDS = WORLDS.map((w) => w.id);

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

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const copy = (v) => JSON.parse(JSON.stringify(v));
const n0 = (v) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : 0);

// Fehler mit Kennung (code: 'invalid' | 'newer'), damit loadSave() „neuere Version“ erkennt
export class SaveError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

// Fehlende ODER falsch typisierte Felder durch Standardwerte ersetzen (rekursiv; Arrays werden nicht zusammengeführt).
// null-Standards (run, paint) erlauben null, Objekte und Texte.
function fill(target, defaults) {
  for (const k of Object.keys(defaults)) {
    const d = defaults[k];
    const t = target[k];
    if (d === null) {
      if (!(t === null || isObj(t) || typeof t === 'string')) target[k] = null;
    } else if (Array.isArray(d)) {
      if (!Array.isArray(t)) target[k] = copy(d);
    } else if (isObj(d)) {
      if (!isObj(t)) target[k] = copy(d);
      else fill(t, d);
    } else if (typeof d === 'number') {
      if (typeof t !== 'number' || !isFinite(t)) target[k] = d;
    } else if (typeof t !== typeof d) target[k] = d;
  }
  return target;
}

// Rekord-Eintrag einer Welt (Zahlen ≥ 0)
const record = (r) => ({ bestDist: n0(isObj(r) ? r.bestDist : 0), bestHeight: n0(isObj(r) ? r.bestHeight : 0), runs: n0(isObj(r) ? r.runs : 0) });

// v2 → v3: altes Geld wird Startschrott (money / 40, höchstens 400), Einstellungen bleiben,
// Rekorde/Statistik soweit sinnvoll, Welten (Übergang), Rest neu.
function migrateV2toV3(old) {
  const n = defaultSave();
  n.meta.scrap = Math.min(GARAGE.migrateScrapMax, Math.floor(n0(old.money) / GARAGE.migrateScrapDiv));
  if (isObj(old.settings)) Object.assign(n.settings, old.settings);
  const s = isObj(old.stats) ? old.stats : {};
  n.stats.testDrives = n0(s.runs);
  n.stats.bestDist = n0(s.bestDist);
  n.stats.bestHeight = n0(s.bestHeight);
  n.stats.bestTricks = n0(s.bestTricks);
  if (isObj(old.worlds)) n.worlds.records = { ...n.worlds.records, ...old.worlds };
  if (Array.isArray(old.unlocked) && old.unlocked.length) n.worlds.unlocked = [...new Set(['steppe', ...old.unlocked])];
  if (typeof old.world === 'string') n.worlds.current = old.world;
  if (isObj(old.tutorial)) n.tutorial = { ...n.tutorial, ...old.tutorial };
  if (old.createdAt) n.createdAt = old.createdAt;
  return n;
}

export function migrate(data) {
  if (!isObj(data)) throw new SaveError('Kein gültiger Spielstand', 'invalid');
  // Versionsnummer als Zahl lesen; Unlesbares gilt als uralter Stand (läuft durch die ganze Migration)
  const num = Number(data.version);
  const v = isFinite(num) && num > 0 ? num : 0;
  if (v > SAVE_VERSION) throw new SaveError('Spielstand stammt aus einer neueren Spielversion', 'newer');
  // Umbauten zwischen Versionen
  if (v < 2) {
    // v2: Rekorde pro Welt
    const s = isObj(data.stats) ? data.stats : {};
    data.worlds = { steppe: { bestDist: n0(s.bestDist), bestHeight: n0(s.bestHeight), runs: n0(s.runs) } };
    data.world = 'steppe';
    data.unlocked = ['steppe'];
  }
  if (v < 3) data = migrateV2toV3(data);
  fill(data, defaultSave());
  data.version = SAVE_VERSION;
  // Plausibilität: Zahlen ≥ 0, Listen nur mit gültigen Einträgen
  for (const k of ['scrap', 'blueprints', 'cores', 'totalPlaytime']) data.meta[k] = n0(data.meta[k]);
  for (const [k, t] of Object.entries(data.meta.milestones)) if (typeof t !== 'number' || !isFinite(t) || t < 0) delete data.meta.milestones[k];
  for (const k of Object.keys(data.stats)) data.stats[k] = n0(data.stats[k]);
  for (const k of Object.keys(data.ascension)) data.ascension[k] = n0(data.ascension[k]);
  data.tutorial.runs = n0(data.tutorial.runs);
  data.research.done = [...new Set(data.research.done.filter((id) => typeof id === 'string'))];
  data.cosmetics.owned = data.cosmetics.owned.filter((id) => typeof id === 'string');
  if (typeof data.cosmetics.paint !== 'string') data.cosmetics.paint = null;
  if (!isObj(data.run)) data.run = null;
  // Welten (Übergang bis Phase 3): nur bekannte IDs, Rekorde als Objekte mit Zahlen
  const w = data.worlds;
  w.unlocked = [...new Set(['steppe', ...w.unlocked.filter((id) => WORLD_IDS.includes(id))])];
  if (!w.unlocked.includes(w.current)) w.current = 'steppe';
  const records = {};
  for (const id of WORLD_IDS) if (id in w.records || w.unlocked.includes(id)) records[id] = record(w.records[id]);
  w.records = records;
  sanitizeGarage(data);
  return data;
}

// ---------- localStorage ----------
// Scheitert das Laden, wird der Rohtext unter BACKUP_KEY gesichert. Stammt der Stand aus einer neueren
// Spielversion, wird zusätzlich nicht gespeichert, bis die Person „Neu anfangen“ bestätigt (allowOverwrite()).
let loadIssue = null;      // { kind: 'corrupt' | 'newer', message }
let writeBlocked = false;

export function loadSave() {
  loadIssue = null;
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { console.warn('Spielstand nicht lesbar', e); return defaultSave(); }
  if (!raw) return defaultSave();
  try {
    return migrate(JSON.parse(raw));
  } catch (e) {
    const newer = e instanceof SaveError && e.code === 'newer';
    backupRaw(raw);
    loadIssue = { kind: newer ? 'newer' : 'corrupt', message: e.message || String(e) };
    if (newer) writeBlocked = true;
    console.warn('Spielstand konnte nicht geladen werden – Rohtext gesichert unter', BACKUP_KEY, e);
    return defaultSave();
  }
}

function backupRaw(raw) {
  try { if (localStorage.getItem(BACKUP_KEY) !== raw) localStorage.setItem(BACKUP_KEY, raw); } catch (_) { /* egal */ }
}

// Problem beim letzten loadSave() (oder null)
export const getLoadIssue = () => loadIssue;
// Gesicherter Rohtext eines nicht ladbaren Spielstands (oder null)
export function getBackup() {
  try { return localStorage.getItem(BACKUP_KEY); } catch (_) { return null; }
}
// Person hat „Neu anfangen“ bestätigt → wieder speichern (der alte Stand liegt im Backup)
export function allowOverwrite() { writeBlocked = false; }
export const saveBlocked = () => writeBlocked;

export function writeSave(data) {
  if (writeBlocked) return false;
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
  if (isObj(data) && !data.version) data.version = Number(m[1]) || 0;
  try {
    return migrate(data);
  } catch (e) {
    if (e instanceof SaveError) throw e;
    throw new Error('Text ist beschädigt (Spielstand unvollständig)');
  }
}

export function clearSave() {
  writeBlocked = false;
  try { localStorage.removeItem(KEY); } catch (_) { /* egal */ }
}
