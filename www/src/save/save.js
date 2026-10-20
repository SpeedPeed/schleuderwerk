// Spielstand: Schema v4 (ARCHITEKTUR.md §10), Migrationskette v0/v1 → v2 → v3 → v4, Export/Import als Text.
// Reine Logik (localStorage nur in loadSave/writeSave/clearSave/getBackup) – migrate() läuft auch in node --test.
// migrate() repariert falsch typisierte Felder (Standardwert statt Absturz); nicht ladbare Stände werden gesichert.
import { SAVE_VERSION, GARAGE, AUDIO, RENDER } from '../data/balance.js';
import { sanitizeGarage, partBasePrice, upgradeCostTotal } from '../garage/garage.js';
import { SLOTS, partById } from '../data/index.js';
import { isValidRun, normalizeRun } from '../run/runState.js';

const KEY = 'schleuderwerk.save';
export const BACKUP_KEY = 'schleuderwerk.save.bak';

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    meta: { scrap: 0, blueprints: 0, cores: 0, totalPlaytime: 0, milestones: {} },
    garage: {
      chassis: GARAGE.starterChassis,
      ownedChassis: [GARAGE.starterChassis],
      parts: { ...GARAGE.starterParts },
      ownedParts: Object.values(GARAGE.starterParts),
      slotLevels: {},      // Paket A (v4): Stufe je Slot { drive: 0…10, … } – gilt für jedes Teil in diesem Slot
      abilities: [...GARAGE.starterAbilities],
    },
    research: { done: [], levels: {} },   // levels: Stufen der wiederholbaren Forschung (Feinschliff)
    // Schrottstufen (garage/progression.js): unlocked = höchste wählbare (0 = gesperrt), best = höchste gewonnene,
    // selected = Wahl für den nächsten Run, records = Bestwerte je Stufe { runs, wins, bestAct, bestStages, fastestWin }
    ascension: { unlocked: 0, best: 0, selected: 0, records: {} },
    codex: { items: {}, sets: {} },
    cosmetics: { owned: [], paint: null },
    // Phase 7: slowmo (Zeitlupe), sfxVol/musicVol (0…1), quality ('low' | 'mid' | 'high' → RENDER.pixelRatio)
    settings: { sound: true, vibration: true, shake: true, shadows: true, slowmo: true, sfxVol: AUDIO.defaultSfx, musicVol: AUDIO.defaultMusic, quality: RENDER.defaultQuality },
    stats: { testDrives: 0, runs: 0, wins: 0, bestAct: 0, bestDist: 0, bestHeight: 0, bestTricks: 0, totalScrap: 0, totalBolts: 0, stagesCleared: 0, bossesBeaten: 0, totalFlips: 0 },
    history: [],          // letzte Runs (garage/progression.js → recordRunEnd), neueste zuerst
    // laufender Run (run/runState.js) oder null – nach App-Neustart fortsetzbar
    run: null,
    // Tutorial (ui/tutorial.js): seen = schon gezeigte Hinweise { id: 1 }, off = alle Hinweise aus
    tutorial: { runs: 0, seen: {}, off: false },
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

// v2 → v3: altes Geld wird Startschrott (money / 40, höchstens 400), Einstellungen bleiben,
// Rekorde/Statistik soweit sinnvoll (beste Weite/Höhe aller alten Welten), Rest neu.
function migrateV2toV3(old) {
  const n = defaultSave();
  n.meta.scrap = Math.min(GARAGE.migrateScrapMax, Math.floor(n0(old.money) / GARAGE.migrateScrapDiv));
  if (isObj(old.settings)) Object.assign(n.settings, old.settings);
  const s = isObj(old.stats) ? old.stats : {};
  n.stats.testDrives = n0(s.runs);
  n.stats.bestDist = n0(s.bestDist);
  n.stats.bestHeight = n0(s.bestHeight);
  n.stats.bestTricks = n0(s.bestTricks);
  if (isObj(old.worlds)) {
    for (const r of Object.values(old.worlds)) {
      if (!isObj(r)) continue;
      n.stats.bestDist = Math.max(n.stats.bestDist, n0(r.bestDist));
      n.stats.bestHeight = Math.max(n.stats.bestHeight, n0(r.bestHeight));
    }
  }
  if (isObj(old.tutorial)) n.tutorial = { ...n.tutorial, ...old.tutorial };
  if (old.createdAt) n.createdAt = old.createdAt;
  return n;
}

// ---------- Migration Schema v3 → v4 (Paket A) ----------
// v3: Stufen 0–20 je Teil, Wirkung L / (1 + L / 30), Kosten Basis × 1,15^L. v4: Stufen 0–10 je Slot,
// Wirkung 2 × L / (1 + L / 15), Kosten 60 × 1,32^L.
const v3Eff = (L) => L / (1 + L / GARAGE.v3DimDivisor);
const v4Eff = (n) => GARAGE.levelEffectMul * n / (1 + n / GARAGE.dimDivisor);
// Kleinste v4-Slot-Stufe, die mindestens so stark wirkt wie die v3-Teile-Stufe L (niemand wird schwächer)
export function v3LevelToSlot(L) {
  const old = v3Eff(Math.max(0, Math.min(GARAGE.v3MaxPartLevel, Math.floor(Number(L) || 0))));
  for (let n = 0; n <= GARAGE.maxPartLevel; n++) if (v4Eff(n) >= old - 1e-9) return n;
  return GARAGE.maxPartLevel;
}
// In v3 für ein Teil bis Stufe L bezahlter Schrott
export function v3SpentFor(part, L) {
  let c = 0;
  for (let l = 0; l < Math.min(GARAGE.v3MaxPartLevel, Math.floor(Number(L) || 0)); l++) c += Math.round(partBasePrice(part) * Math.pow(GARAGE.v3CostGrowth, l));
  return c;
}
// garage.partLevels (v3) → garage.slotLevels (v4): je Slot die beste Stufe aller (eigenen) Teile dieses Slots, auf 0–10
// umgerechnet; was in diesem Slot insgesamt mehr bezahlt wurde, als die neue Stufe kostet, kommt als Schrott zurück.
// Ergebnis: { slotLevels, refund, spent }
export function convertPartLevels(partLevels) {
  const slotLevels = {};
  let refund = 0, spent = 0;
  for (const slot of SLOTS) {
    let best = 0, paid = 0;
    for (const [id, l] of Object.entries(isObj(partLevels) ? partLevels : {})) {
      const p = partById(id);
      if (!p || p.slot !== slot || typeof l !== 'number' || !isFinite(l) || l <= 0) continue;
      best = Math.max(best, Math.min(GARAGE.v3MaxPartLevel, Math.floor(l)));
      paid += v3SpentFor(p, l);
    }
    const n = v3LevelToSlot(best);
    slotLevels[slot] = n;
    spent += paid;
    refund += Math.max(0, paid - upgradeCostTotal(n));
  }
  return { slotLevels, refund, spent };
}

// v3 → v4 (Paket A): Teile-Stufen 0–20 je Teil → Slot-Stufen 0–10 je Slot (garage/garage.js → convertPartLevels:
// beste Stufe je Slot, mindestens gleich stark; zu viel bezahlter Schrott kommt zurück). Ein laufender Run behält seine
// Ausrüstung, die Stufen darin werden genauso umgerechnet. Alles andere bleibt unverändert.
function migrateV3toV4(data) {
  const g = isObj(data.garage) ? data.garage : null;
  if (!g || !isObj(g.partLevels)) return data;
  const c = convertPartLevels(g.partLevels);
  g.slotLevels = c.slotLevels;
  delete g.partLevels;
  if (c.refund > 0) {
    if (!isObj(data.meta)) data.meta = {};
    data.meta.scrap = n0(data.meta.scrap) + c.refund;
  }
  // Hinweis für die Oberfläche (main.js zeigt ihn einmal und löscht ihn)
  data.migrationNote = { v: 4, refund: c.refund, slotLevels: { ...c.slotLevels } };
  if (isObj(data.run) && isObj(data.run.parts)) {
    for (const p of Object.values(data.run.parts)) if (isObj(p)) p.level = v3LevelToSlot(p.level);
  }
  return data;
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
  // Spielstände vor Phase 7 kennen den Tutorial-Fortschritt noch nicht: wer schon gespielt hat, bekommt keine Hinweise
  const hadTutorial = isObj(data.tutorial) && isObj(data.tutorial.seen);
  if (v < 3) data = migrateV2toV3(data);
  if (v < 4) migrateV3toV4(data);
  fill(data, defaultSave());
  if (!hadTutorial && (n0(data.stats.runs) > 0 || n0(data.stats.testDrives) > 0 || isObj(data.run))) data.tutorial.off = true;
  data.version = SAVE_VERSION;
  // Plausibilität: Zahlen ≥ 0, Listen nur mit gültigen Einträgen
  for (const k of ['scrap', 'blueprints', 'cores', 'totalPlaytime']) data.meta[k] = n0(data.meta[k]);
  for (const [k, t] of Object.entries(data.meta.milestones)) if (typeof t !== 'number' || !isFinite(t) || t < 0) delete data.meta.milestones[k];
  for (const k of Object.keys(data.stats)) data.stats[k] = n0(data.stats[k]);
  for (const k of ['unlocked', 'best', 'selected']) data.ascension[k] = Math.min(15, Math.floor(n0(data.ascension[k])));
  data.ascension.selected = Math.min(data.ascension.selected, data.ascension.unlocked);
  for (const [lv, r] of Object.entries(data.ascension.records)) {
    if (!isObj(r) || !(Number(lv) >= 0 && Number(lv) <= 15)) { delete data.ascension.records[lv]; continue; }
    for (const k of ['runs', 'wins', 'bestAct', 'bestStages', 'fastestWin']) r[k] = n0(r[k]);
  }
  data.history = data.history.filter(isObj).slice(0, 50);
  data.tutorial.runs = n0(data.tutorial.runs);
  for (const [k, t] of Object.entries(data.tutorial.seen)) if (t !== 1) delete data.tutorial.seen[k];
  // Einstellungen: Lautstärken 0…1, Grafikqualität nur bekannte Stufen
  for (const k of ['sfxVol', 'musicVol']) data.settings[k] = Math.max(0, Math.min(1, data.settings[k]));
  if (!Object.prototype.hasOwnProperty.call(RENDER.pixelRatio, data.settings.quality)) data.settings.quality = RENDER.defaultQuality;
  data.research.done = [...new Set(data.research.done.filter((id) => typeof id === 'string'))];
  for (const [k, v] of Object.entries(data.research.levels)) {
    if (typeof v !== 'number' || !isFinite(v) || v < 1) delete data.research.levels[k];
    else data.research.levels[k] = Math.floor(v);
  }
  data.cosmetics.owned = data.cosmetics.owned.filter((id) => typeof id === 'string');
  if (typeof data.cosmetics.paint !== 'string') data.cosmetics.paint = null;
  // Laufender Run: unbrauchbares/älteres Format wird verworfen (der Rest des Spielstands bleibt)
  if (!isValidRun(data.run)) data.run = null;
  else normalizeRun(data.run);
  // Kodex: nur Zahlen (Items: 1 = gesehen, 2 = besessen; Sets: 1 = schon einmal aktiv)
  for (const k of ['items', 'sets']) {
    for (const [id, v] of Object.entries(data.codex[k])) if (typeof v !== 'number' || !isFinite(v) || v < 0) delete data.codex[k][id];
  }
  // Welten-Rekorde gab es bis Phase 2 (seit Phase 3: Biome als Akte eines Runs)
  if (isObj(data.worlds)) {
    for (const r of Object.values(isObj(data.worlds.records) ? data.worlds.records : {})) {
      if (isObj(r)) data.stats.bestDist = Math.max(data.stats.bestDist, n0(r.bestDist));
    }
  }
  delete data.worlds;
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

// Export als Text (zum Sichern, z. B. in einer Notiz-App): „SW4:“ + Base64(JSON)
export function exportSave(data) {
  const json = JSON.stringify(data);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return `SW${SAVE_VERSION}:${b64}`;
}

// Import: akzeptiert SW4:… und ältere Texte (SW3:…, SW2:…), die über die Migration auf v4 gebracht werden
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
