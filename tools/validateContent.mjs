#!/usr/bin/env node
// Schleuderwerk 2 – strenger Prüfer für die Inhaltsdaten (ohne Abhängigkeiten).
//
// Aufruf:   node tools/validateContent.mjs [ordner] [--quiet] [--json]   (npm test prüft das in tests/items.test.mjs)
//   ordner   Standard: www/src/data (Inhaltsdateien) – die Item-/Tag-Dateien content_*.js liegen in <ordner>/content/
// Übernommen aus der geprüften Inhalts-Lieferung (validate.mjs); angepasst sind nur die Pfade (Laden aus data/ und
// data/content/, nur die bekannten Inhaltsdateien – balance.js, biomes.js, index.js, tags.js, items.js sind Code).
//   --quiet  Warnungen nicht ausgeben (Exit-Code hängt nur an Fehlern)
//   --json   Ergebnis als JSON ({ errors:[…], warnings:[…], stats:{…} })
// Exit-Code: 0 = keine Fehler, 1 = Fehler gefunden (Warnungen ändern den Exit-Code nicht).
//
// Grundlage: docs/ARCHITEKTUR.md 4.1–4.11 (verbindliches Vokabular) und docs/V2-DESIGN.md.
// Das Vokabular steht hier bewusst als Konstanten (Inhalte dürfen nur das verwenden, was die Engine kennt).

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ═══════════════════════════════════ Vokabular (ARCHITEKTUR.md) ═══════════════════════════════════

// 4.1 + 4.11 Stats
const STATS = new Set([
  'launchSpeed', 'launchPerfectBonus', 'sweetSpotWidth', 'mass', 'drag', 'lift', 'airControl', 'maxSpin', 'flipSpeed',
  'autoLevel', 'boostThrust', 'boostFuel', 'boostHeat', 'boostSelfDamage', 'driveAccel', 'driveFuel', 'driveHeat',
  'rollFriction', 'fuelMax', 'heatMax', 'heatGain', 'coolRate', 'durabilityMax', 'armor', 'impactThreshold', 'landTolDeg',
  'perfectLandDeg', 'magnet', 'speedSoftCap', 'luck', 'boltGain', 'scrapGain', 'itemSlots', 'abilitySlots',
  'abilityCooldown', 'bounce', 'shopDiscount', 'rerollDiscount', 'itemChoices', 'repairBonus',
]);
const STAT_OPS = new Set(['add', 'mul', 'xmul']);
// Stats, die durch mul ≤ −1 negativ werden DÜRFEN (4.11: „boostHeat darf durch mul negativ werden“)
const STATS_MAY_GO_NEGATIVE = new Set(['boostHeat']);

// 4.2 + 4.11 Ereignisse → Datenfelder
const STAGE_EVENTS = {
  stageStart: [], launch: ['power', 'perfect', 'angle'], perfectLaunch: ['power'],
  landing: ['quality', 'impact', 'airTime', 'flips'], perfectLanding: ['quality', 'impact', 'airTime', 'flips'],
  groundTouch: ['impact'], flip: ['dir', 'count'], airSecond: ['seconds'], boost: ['free', 'source'],
  boostSecond: [], overheat: [], collision: ['kind', 'damage'], bounce: ['source'], pickup: ['kind'],
  fuelEmpty: [], abilityUse: ['ability'], milestone: ['m'], shock: ['source'], explosion: ['amount'],
  damage: ['amount', 'source'], heal: ['amount'], stageEnd: ['medal', 'dist'],
};
const RUN_EVENTS = {
  runStart: [], nodeEnter: ['type'], stageClear: ['medal', 'kind'], itemGained: ['itemId'], shopEnter: [],
};
const ALL_EVENTS = { ...STAGE_EVENTS, ...RUN_EVENTS };
// Ereignisse, die nur das Spiel selbst auslöst (emit verboten)
const NOT_EMITTABLE = new Set(['stageStart', 'stageEnd', 'launch', 'perfectLaunch', 'runStart', 'nodeEnter', 'stageClear', 'shopEnter', 'itemGained']);

const PICKUP_KINDS = new Set(['bolt', 'fuel', 'cool', 'repair', 'scrap', 'crate', 'blueprint']);
const LANDING_QUALITIES = new Set(['perfect', 'clean', 'bumpy', 'crash']);
const MEDALS = new Set(['bronze', 'silver', 'gold']);
const STAGE_KINDS = new Set(['stage', 'elite', 'boss']);

// 4.3 + 4.11 Effekte: req = Pflicht-Parameter, opt = optionale, ctx = 'stage' | 'run' | 'any'
const FX = {
  thrust: { req: ['amount'], opt: [], ctx: 'stage' },
  jump: { req: ['amount'], opt: [], ctx: 'stage' },
  boost: { req: ['dur'], opt: [], ctx: 'stage' },
  explosion: { req: ['amount'], opt: [], ctx: 'stage' },
  heal: { req: [], opt: ['amount', 'pct'], ctx: 'any' }, // amount ODER pct
  selfDamage: { req: ['amount'], opt: [], ctx: 'any' },
  cool: { req: ['amount'], opt: [], ctx: 'stage' },
  heat: { req: ['amount'], opt: [], ctx: 'stage' },
  fuel: { req: ['amount'], opt: ['over'], ctx: 'stage' },
  bolts: { req: ['amount'], opt: [], ctx: 'any' },
  scrap: { req: ['amount'], opt: [], ctx: 'any' },
  magnet: { req: ['radius', 'dur'], opt: [], ctx: 'stage' },
  buff: { req: ['stat', 'dur'], opt: ['mul', 'add'], ctx: 'stage' }, // genau eins von mul|add
  stack: { req: ['stat', 'max'], opt: ['mul', 'add'], ctx: 'stage' }, // genau eins von mul|add
  charge: { req: ['key', 'n', 'at', 'then'], opt: [], ctx: 'any' },
  emit: { req: ['event'], opt: ['data'], ctx: 'any' },
  shield: { req: ['n'], opt: [], ctx: 'stage' },
  spin: { req: ['amount'], opt: [], ctx: 'stage' },
  slowmo: { req: ['dur'], opt: [], ctx: 'stage' },
  refill: { req: ['pct'], opt: ['ability'], ctx: 'stage' },
  chance: { req: ['p', 'then'], opt: [], ctx: 'any' },
  // 4.11: nur im Run-Kontext
  maxHp: { req: ['amount'], opt: [], ctx: 'run' },
  maxFuel: { req: ['amount'], opt: [], ctx: 'run' },
  upgradeItem: { req: [], opt: [], ctx: 'run' },
};
const SCALE_KEYS = new Set(['amount', 'pct', 'dur', 'radius', 'add', 'mul']);
// Parameter, die streng > 0 sein müssen
const POSITIVE_PARAMS = {
  thrust: ['amount'], jump: ['amount'], boost: ['dur'], explosion: ['amount'], heal: ['amount', 'pct'],
  selfDamage: ['amount'], cool: ['amount'], heat: ['amount'], fuel: ['amount'], bolts: ['amount'], scrap: ['amount'],
  magnet: ['radius', 'dur'], buff: ['dur'], stack: ['max'], charge: ['n', 'at'], shield: ['n'], slowmo: ['dur'],
  refill: ['pct'],
};

// 4.4 + 4.11 Bedingungen
const COND_KEYS = new Set([
  'perfect', 'quality', 'minImpact', 'maxImpact', 'airborne', 'grounded', 'heatAbove', 'heatBelow', 'fuelBelow',
  'hpBelow', 'minCount', 'dir', 'kind', 'ability', 'free', 'source', 'minSpeed', 'nodeType', 'medal', 'chassis',
]);
// Bedingungen, die sich auf Ereignis-Daten beziehen → nur bei passenden Ereignissen sinnvoll.
// minCount prüft je Ereignis: flip.count, landing.flips / perfectLanding.flips, airSecond.seconds.
const EVENT_CONDS = {
  launch: ['perfect'],
  landing: ['quality', 'minImpact', 'maxImpact', 'minCount'],
  perfectLanding: ['quality', 'minImpact', 'maxImpact', 'minCount'],
  groundTouch: ['minImpact', 'maxImpact'],
  flip: ['dir', 'minCount'],
  airSecond: ['minCount'],
  boost: ['free', 'source'],
  collision: ['kind'],
  bounce: ['source'],
  pickup: ['kind'],
  abilityUse: ['ability'],
  shock: ['source'],
  damage: ['source'],
  stageEnd: ['medal'],
  nodeEnter: ['nodeType'],
  stageClear: ['medal', 'kind'],
};
const DATA_CONDS = new Set(['perfect', 'quality', 'minImpact', 'maxImpact', 'minCount', 'dir', 'kind', 'ability', 'free', 'source', 'nodeType', 'medal']);
// Zustands-Bedingungen: in der Etappe immer, im Run (ohne Fahrzeug) nur diese
const STATE_CONDS_STAGE = new Set(['airborne', 'grounded', 'heatAbove', 'heatBelow', 'fuelBelow', 'hpBelow', 'minSpeed', 'chassis']);
const STATE_CONDS_RUN = new Set(['hpBelow', 'chassis']);

// 4.5 Limits
const LIMIT_KEYS = new Set(['perStage', 'perRun', 'cooldown']);

// 4.11 Regeln, die das Spiel ohnehin kennt (Spezifikation darf an anderer Stelle stehen)
const BASE_RULES = new Set([
  'heatIsFuel', 'noOverheat', 'heatIsResource', 'setBonusDouble', 'groundSpeedStacks', 'collectScrapMass',
  'healOnCleanLanding', 'lowGrip', 'firstHitBounces',
]);

// Spiel-Inhalte
const TAG_IDS = ['feuer', 'eis', 'elektro', 'gyro', 'magnet', 'schrott', 'hydraulik', 'gummi', 'rakete', 'gluck'];
const TAG_SET = new Set(TAG_IDS);
const RARITIES = new Set(['common', 'rare', 'epic', 'legendary', 'cursed']);
const SET_LEVELS = ['2', '4', '6'];
const ITEMS_PER_TAG = 7;
const LEGENDARY_COUNT = 10;
const CURSED_COUNT = 8;
const PART_SLOTS = ['drive', 'wheels', 'aero', 'armor', 'tank', 'cooling', 'gadget'];
const PERK_KEYS = new Set(['startBolts', 'itemSlots', 'abilitySlots', 'rerollDiscount', 'reserveSlots', 'startDurability', 'scrapGain']);
const RESEARCH_UNLOCK_KEYS = new Set(['pool', 'items', 'parts', 'abilities', 'chassis', 'nodes', 'perks']);
const NODE_TYPE_IDS = ['stage', 'elite', 'dealer', 'workbench', 'blackmarket', 'station', 'event', 'treasure', 'boss'];
const CHASSIS_COUNT = 9;

// Textlängen (Zeichen = Unicode-Codepoints)
const MAX = { name: 28, desc: 120, flavor: 70, eventTitle: 28, optionLabel: 40 };

// Erlaubte Felder je Datensatz
const ITEM_KEYS = new Set(['id', 'name', 'icon', 'rarity', 'tags', 'pool', 'desc', 'flavor', 'stats', 'rules', 'ruleSpec', 'triggers', 'curse']);
const CURSE_KEYS = new Set(['desc', 'stats', 'rules', 'ruleSpec', 'triggers']);
const TAG_KEYS = new Set(['name', 'icon', 'color', 'desc', 'sets']);
const SET_KEYS = new Set(['desc', 'stats', 'rules', 'ruleSpec', 'triggers']);
const TRIGGER_KEYS = new Set(['on', 'if', 'limit', 'do']);
const CHASSIS_KEYS = new Set(['id', 'name', 'icon', 'desc', 'flavor', 'model', 'unlock', 'stats', 'slots', 'rules', 'ruleSpec', 'triggers', 'starterTag', 'starterItem', 'ability', 'visual']);
const PART_KEYS = new Set(['id', 'slot', 'name', 'icon', 'desc', 'flavor', 'model', 'unlock', 'stats', 'perLevel', 'tag', 'rules', 'ruleSpec', 'triggers']);
const ABILITY_KEYS = new Set(['id', 'name', 'icon', 'desc', 'flavor', 'mode', 'cooldown', 'fuel', 'heat', 'effects', 'rules', 'ruleSpec', 'unlock', 'chassis']);
const RESEARCH_KEYS = new Set(['id', 'name', 'icon', 'desc', 'flavor', 'branch', 'cost', 'requires', 'unlocks', 'pos', 'repeatable']);
const NODE_KEYS = new Set(['name', 'icon', 'iconId', 'desc', 'color', 'weight', 'minFloor', 'maxPerAct', 'requiresResearch', 'forcedFloors', 'minPerAct', 'guaranteeFloors', 'params']);
const EVENT_KEYS = new Set(['id', 'acts', 'title', 'text', 'options']);
const OPTION_KEYS = new Set(['label', 'hint', 'cost', 'outcomes']);
const OUTCOME_KEYS = new Set(['p', 'text', 'effects']);
const EVENT_COST_KEYS = new Set(['bolts', 'hpPct', 'maxFuel', 'item']);
const EVENT_EFFECT_KEYS = new Set(['bolts', 'scrap', 'blueprints', 'hpPct', 'maxHp', 'maxFuel', 'item', 'removeItem', 'upgradeItem', 'curse', 'removeCurse', 'stage', 'cores', 'nothing']);
const PAINT_KEYS = new Set(['id', 'name', 'colors', 'cost', 'unlock', 'flavor']);
const ASCENSION_KEYS = new Set(['level', 'name', 'desc', 'mods']);

// Design-Werte (V2-DESIGN.md §4) – Schrottstufen: Stufe → einziger mods-Schlüssel und Wert
const ASCENSION_DESIGN = {
  // Paket A (docs/OVERHAUL.md „Umsetzungsstand Paket A“): Stufe 2 1,08 → 1,12, Stufe 7 1,15 → 1,22 – Notlandung und
  // Neuversuche mit neuer Strecke/müdem Boss machen Runs leichter; so bleibt Schrottstufe 15 bei 30–50 h (Simulator)
  1: ['eliteWeightAdd', null], 2: ['targetMul', 1.12], 3: ['towPenaltyAdd', 0.05], 4: ['priceMul', 1.1],
  5: ['repairMul', 0.75], 6: ['startCurse', 1], 7: ['bossTargetMul', 1.22], 8: ['damageMul', 1.15],
  9: ['itemChoicesAdd', -1], 10: ['startDurabilityMul', 0.9], 11: ['heatGainMul', 1.15], 12: ['eliteHazards', true],
  13: ['boltMul', 0.85], 14: ['fuelMaxMul', 0.9], 15: ['doubleBossAct3', true],
};
// Design-Werte der Knoten (V2-DESIGN.md §4 Knotentypen)
const NODE_DESIGN = [
  ['stage', 'forcedFloors', (v) => Array.isArray(v) && v.includes(0), 'Etage 0 immer Etappe'],
  ['stage', 'params.itemChoices', (v) => v === 3, '1 aus 3 Items'],
  ['elite', 'minFloor', (v) => v === 2, 'ab Etage 2'],
  ['elite', 'maxPerAct', (v) => v === 2, 'max. 2 je Akt'],
  ['elite', 'params.targetMul', (v) => v === 1.3, 'Ziel ×1,3'],
  ['elite', 'params.minRarity', (v) => v === 'rare', 'Item mind. Selten'],
  ['elite', 'params.blueprints', (v) => v === 1, '1 Blaupause'],
  ['dealer', 'minPerAct', (v) => v >= 1, 'min. 1 je Akt'],
  ['dealer', 'guaranteeFloors', (v) => Array.isArray(v) && v[0] === 2 && v[1] === 4, 'Etage 2–4'],
  ['dealer', 'params.items', (v) => v === 5, '5 Items'],
  ['dealer', 'params.abilities', (v) => v === 1, '1 Fähigkeit'],
  ['dealer', 'params.rerollBase', (v) => v === 10, 'Reroll 10'],
  ['dealer', 'params.rerollStep', (v) => v === 10, '+10 je Reroll'],
  ['dealer', 'params.reserveSlots', (v) => v === 1, '1 Reservieren-Platz'],
  ['workbench', 'requiresResearch', (v) => typeof v === 'string', 'per Forschung freigeschaltet'],
  ['blackmarket', 'requiresResearch', (v) => typeof v === 'string', 'per Forschung freigeschaltet'],
  ['blackmarket', 'params.items', (v) => v === 3, '3 verfluchte Items'],
  ['station', 'forcedFloors', (v) => Array.isArray(v) && v.length === 1 && v[0] === 5, 'Etage 5 immer'],
  ['station', 'params.repairPct', (v) => v === 0.35, 'Reparieren +35 %'],
  ['station', 'params.fuelMaxAdd', (v) => v === 15, '+15 max. Treibstoff'],
  ['station', 'params.coolMul', (v) => v === 0.2, '+20 % Kühlung'],
  ['treasure', 'params.suspiciousChance', (v) => v === 0.3, '30 % verdächtig'],
  ['boss', 'params.targetMul', (v) => v === 1.6, 'Ziel ×1,6'],
];
// Angaben aus dem Kopfkommentar von research.js (werden nachgerechnet, Abweichung = Warnung)
const RESEARCH_CLAIMS = {
  totalOneTime: 278,
  cumulative: {
    r_node_workbench: 2, r_chassis_einkaufswagen: 9, r_node_blackmarket: 18, r_perk_ability_slot: 19,
    r_perk_item_slot: 35, r_chassis_waschmaschine: 53,
  },
};
// Symbole, die schon für Währungen bzw. Kartenknoten stehen (V2-DESIGN §4/§6) – Items/Tags sollen sie nicht doppeln
const CURRENCY_ICONS = new Set(['🔩', '⚙️', '⚙', '📘', '💠']);

// ═══════════════════════════════════ Hilfen ═══════════════════════════════════

const args = process.argv.slice(2);
const QUIET = args.includes('--quiet');
const JSON_OUT = args.includes('--json');
const dirArg = args.find((a) => !a.startsWith('--'));
const DIR = dirArg ? resolve(dirArg) : resolve(dirname(fileURLToPath(import.meta.url)), '..', 'www', 'src', 'data');
const CONTENT_DIR = join(DIR, 'content');

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push({ where, msg });
const warn = (where, msg) => warnings.push({ where, msg });

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;
const len = (s) => [...s].length;
const fmt = (v) => JSON.stringify(v);
const HEX = /^#[0-9a-fA-F]{6}$/;

const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('de', { granularity: 'grapheme' }) : null;
function checkIcon(where, icon) {
  if (typeof icon !== 'string' || !icon) return err(where, `icon fehlt`);
  const graphemes = seg ? [...seg.segment(icon)].length : [...icon].length;
  if (graphemes !== 1) return err(where, `icon muss genau 1 Emoji sein, ist ${fmt(icon)} (${graphemes} Zeichen)`);
  if (!/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(icon) || /[A-Za-z0-9#*]/.test(icon)) {
    return err(where, `icon ${fmt(icon)} ist kein Emoji`);
  }
  if (!/\p{Emoji_Presentation}/u.test(icon) && !icon.includes('️')) {
    warn(where, `icon ${fmt(icon)} hat Text-Darstellung ohne VS16 (U+FE0F) – auf Android evtl. einfarbiges Symbol`);
  }
}

function checkText(where, obj, key, max, { required = true } = {}) {
  const v = obj ? obj[key] : undefined;
  if (v === undefined || v === null) {
    if (required) err(where, `${key} fehlt`);
    return;
  }
  if (typeof v !== 'string' || !v.trim()) return err(where, `${key} muss ein nicht-leerer Text sein`);
  if (max && len(v) > max) err(where, `${key} zu lang: ${len(v)} > ${max} Zeichen (${fmt(v)})`);
  if (v !== v.trim()) warn(where, `${key} hat Leerzeichen am Anfang/Ende`);
  if (/ {2,}/.test(v)) warn(where, `${key} enthält doppelte Leerzeichen`);
}

// Paket B: iconId muss ein Symbol im Icon-Sprite sein (www/assets/icons.svg, erzeugt von tools/make-icons.mjs)
const SPRITE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'www', 'assets', 'icons.svg');
const SPRITE_IDS = existsSync(SPRITE) ? new Set([...readFileSync(SPRITE, 'utf8').matchAll(/<symbol id="i-([^"]+)"/g)].map((m) => m[1])) : null;
function checkIconId(where, id, required = true) {
  if (id === undefined) { if (required) err(where, 'iconId fehlt (Symbol aus www/assets/icons.svg)'); return; }
  if (typeof id !== 'string' || !id) return err(where, `iconId muss Text sein (${fmt(id)})`);
  if (SPRITE_IDS && !SPRITE_IDS.has(id)) err(where, `iconId ${fmt(id)} fehlt im Icon-Sprite (tools/make-icons.mjs)`);
}

function checkKeys(where, obj, allowed, what) {
  if (!isObj(obj)) return;
  for (const k of Object.keys(obj)) if (!allowed.has(k)) err(where, `unbekanntes Feld ${fmt(k)} in ${what}`);
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// ═══════════════════════════════════ Laden ═══════════════════════════════════

const KNOWN_EXPORTS = new Set(['TAGS', 'ITEMS', 'CHASSIS', 'PARTS', 'ABILITIES', 'RESEARCH', 'BRANCHES', 'NODE_TYPES', 'TEXT_EVENTS', 'ASCENSION', 'ASCENSION_REWARDS', 'PAINTS']);
const REQUIRED_FILES = {
  'chassis.js': ['CHASSIS'], 'parts.js': ['PARTS'], 'abilities.js': ['ABILITIES'], 'ascension.js': ['ASCENSION', 'ASCENSION_REWARDS'],
  'cosmetics.js': ['PAINTS'], 'nodes.js': ['NODE_TYPES'], 'textEvents.js': ['TEXT_EVENTS'], 'research.js': ['RESEARCH', 'BRANCHES'],
};

// Inhaltsdateien: die festen Dateien aus REQUIRED_FILES in DIR, alle content_*.js in DIR/content (bzw. DIR)
const listJs = (d) => {
  try { return readdirSync(d).filter((f) => /\.(m?js)$/.test(f) && statSync(join(d, f)).isFile()); } catch (_) { return []; }
};
const fileDirs = new Map();
for (const f of listJs(DIR)) if (REQUIRED_FILES[f] || f.startsWith('content_')) fileDirs.set(f, DIR);
for (const f of listJs(CONTENT_DIR)) if (f.startsWith('content_')) fileDirs.set(f, CONTENT_DIR);
const files = [...fileDirs.keys()].filter((f) => f !== basename(fileURLToPath(import.meta.url))).sort();

const mods = {}; // datei → Exporte
for (const f of files) {
  try {
    mods[f] = await import(pathToFileURL(join(fileDirs.get(f), f)).href);
  } catch (e) {
    err(f, `kann nicht geladen werden: ${e && e.message}`);
  }
}
for (const [f, names] of Object.entries(REQUIRED_FILES)) {
  if (!mods[f]) { err(f, 'Datei fehlt oder lädt nicht'); continue; }
  for (const n of names) if (mods[f][n] === undefined) err(f, `Export ${n} fehlt`);
}
for (const [f, m] of Object.entries(mods)) {
  for (const n of Object.keys(m)) if (!KNOWN_EXPORTS.has(n)) warn(f, `unbekannter Export ${n} (wird nicht geprüft)`);
}

const contentFiles = Object.keys(mods).filter((f) => f.startsWith('content_'));
if (!contentFiles.length) err(DIR, 'keine content_*.js gefunden');

// Sammeln
const TAGS = {}; // tag → { def, file }
const ITEMS = []; // { item, file, idx }
for (const f of contentFiles) {
  const m = mods[f];
  if (m.ITEMS === undefined) err(f, 'Export ITEMS fehlt');
  else if (!Array.isArray(m.ITEMS)) err(f, 'ITEMS ist kein Array');
  else m.ITEMS.forEach((item, idx) => ITEMS.push({ item, file: f, idx }));
  if (m.TAGS !== undefined) {
    if (!isObj(m.TAGS)) err(f, 'TAGS ist kein Objekt');
    else for (const [t, def] of Object.entries(m.TAGS)) {
      if (TAGS[t]) err(`${f} › TAGS.${t}`, `Tag doppelt definiert (auch in ${TAGS[t].file})`);
      else TAGS[t] = { def, file: f };
    }
  }
}
const pick = (f, n, fallback) => (mods[f] && mods[f][n] !== undefined ? mods[f][n] : fallback);
const CHASSIS = asArray('chassis.js', 'CHASSIS');
const PARTS = asArray('parts.js', 'PARTS');
const ABILITIES = asArray('abilities.js', 'ABILITIES');
const RESEARCH = asArray('research.js', 'RESEARCH');
const TEXT_EVENTS = asArray('textEvents.js', 'TEXT_EVENTS');
const ASCENSION = asArray('ascension.js', 'ASCENSION');
const PAINTS = asArray('cosmetics.js', 'PAINTS');
const BRANCHES = pick('research.js', 'BRANCHES', {});
const NODE_TYPES = pick('nodes.js', 'NODE_TYPES', {});
const ASCENSION_REWARDS = pick('ascension.js', 'ASCENSION_REWARDS', {});

function asArray(f, n) {
  const v = pick(f, n, []);
  if (!Array.isArray(v)) { err(f, `${n} ist kein Array`); return []; }
  return v;
}

// ID-Verzeichnisse
function indexById(list, where, label) {
  const map = new Map();
  list.forEach((x, i) => {
    const w = `${where}[${i}]`;
    if (!isObj(x)) return err(w, `${label} ist kein Objekt`);
    if (!isStr(x.id)) return err(w, `${label} ohne id`);
    if (map.has(x.id)) err(`${where} › ${x.id}`, `id doppelt`);
    else map.set(x.id, x);
  });
  return map;
}
const itemById = new Map();
const itemFile = new Map();
for (const { item, file, idx } of ITEMS) {
  const w = `${file} › ITEMS[${idx}]`;
  if (!isObj(item)) { err(w, 'Item ist kein Objekt'); continue; }
  if (!isStr(item.id)) { err(w, 'Item ohne id'); continue; }
  if (itemById.has(item.id)) err(`${file} › ${item.id}`, `Item-id doppelt (auch in ${itemFile.get(item.id)})`);
  else { itemById.set(item.id, item); itemFile.set(item.id, file); }
}
const chassisById = indexById(CHASSIS, 'chassis.js › CHASSIS', 'Chassis');
const partById = indexById(PARTS, 'parts.js › PARTS', 'Teil');
const abilityById = indexById(ABILITIES, 'abilities.js › ABILITIES', 'Fähigkeit');
const researchById = indexById(RESEARCH, 'research.js › RESEARCH', 'Forschung');
const eventById = indexById(TEXT_EVENTS, 'textEvents.js › TEXT_EVENTS', 'Ereignis');
const paintById = indexById(PAINTS, 'cosmetics.js › PAINTS', 'Lackierung');

// ═══════════════════════════════════ Stats, Trigger, Effekte, Regeln ═══════════════════════════════════

function checkStats(where, stats, { allowXmul = true, xmulWarn = false, ops = STAT_OPS, label = 'stats' } = {}) {
  if (stats === undefined) return;
  if (!isObj(stats)) return err(where, `${label} muss ein Objekt sein`);
  for (const [stat, mod] of Object.entries(stats)) {
    const w = `${where} › ${label}.${stat}`;
    if (!STATS.has(stat)) err(w, `unbekannter Stat ${fmt(stat)}`);
    if (!isObj(mod)) { err(w, 'Modifikator muss { add | mul | xmul } sein'); continue; }
    const keys = Object.keys(mod);
    if (!keys.length) err(w, 'leerer Modifikator');
    for (const op of keys) {
      if (!ops.has(op)) { err(w, `unerlaubter Operator ${fmt(op)} (erlaubt: ${[...ops].join(', ')})`); continue; }
      const v = mod[op];
      if (!isNum(v)) { err(w, `${op} ist keine endliche Zahl (${fmt(v)})`); continue; }
      if (v === 0 && op !== 'xmul') warn(w, `${op}: 0 hat keine Wirkung`);
      if (op === 'mul' && v <= -1 && !STATS_MAY_GO_NEGATIVE.has(stat)) err(w, `mul ${v} ≤ −1 macht ${stat} null/negativ`);
      if (op === 'xmul') {
        if (v < 0) err(w, `xmul ${v} < 0`);
        if (!allowXmul) err(w, 'xmul hier nicht erlaubt');
        else if (xmulWarn) warn(w, 'xmul ist für Legendär/Fluch/Chassis gedacht (4.1: „selten“)');
      }
      if (stat === 'armor' && op === 'add' && (v > 0.6 || v < -0.6)) err(w, `armor add ${v} außerhalb 0…0,6`);
    }
  }
}

// Sammelt Infos für Querprüfungen
const chargeKeys = new Map(); // key → Set(sourceId)
const ruleSpecRegistry = new Map(); // rule → [{ where, text }]
const ruleUses = []; // { where, rule, hasLocalSpec, specText }
const triggerSources = []; // { sourceId, where, trig } – für Ketten-Analyse

function checkFxList(where, list, ctxKind, info) {
  if (!Array.isArray(list)) return err(where, 'Effektliste muss ein Array sein');
  if (!list.length) err(where, 'leere Effektliste');
  list.forEach((fx, i) => checkFx(`${where}[${i}]`, fx, ctxKind, info));
}

function checkNumParam(w, fx, key, { positive = false } = {}) {
  const v = fx[key];
  if (!isNum(v)) return err(w, `${key} ist keine endliche Zahl (${fmt(v)})`), false;
  if (positive && v <= 0) err(w, `${key} muss > 0 sein (ist ${v})`);
  else if (v === 0) err(w, `${key}: 0 hat keine Wirkung`);
  return true;
}

function checkFx(w, fx, ctxKind, info) {
  if (!isObj(fx)) return err(w, 'Effekt ist kein Objekt');
  const name = fx.fx;
  const spec = FX[name];
  if (!spec) return err(w, `unbekannter Effekt fx: ${fmt(name)}`);
  const allowed = new Set(['fx', ...spec.req, ...spec.opt]);
  for (const k of Object.keys(fx)) if (!allowed.has(k)) err(w, `fx '${name}': unbekannter Parameter ${fmt(k)}`);
  for (const k of spec.req) if (fx[k] === undefined) err(w, `fx '${name}': Pflicht-Parameter ${k} fehlt`);
  if (spec.ctx === 'run' && ctxKind === 'stage') err(w, `fx '${name}' gibt es nur im Run-Kontext (4.11), nicht bei Etappen-Ereignissen`);
  if (spec.ctx === 'stage' && ctxKind === 'run') err(w, `fx '${name}' braucht das Fahrzeug – bei Run-Ereignissen (ctx ohne Fahrzeug) wirkungslos`);
  const pos = new Set(POSITIVE_PARAMS[name] || []);
  // alle Zahlen-Parameter endlich
  for (const [k, v] of Object.entries(fx)) {
    if (['fx', 'then', 'data', 'stat', 'key', 'event', 'ability', 'over'].includes(k)) continue;
    if (fx[k] !== undefined) checkNumParam(w, fx, k, { positive: pos.has(k) });
    if (SCALE_KEYS.has(k) && isNum(v) && info) (info.scaleVals[k] ||= []).push(v);
  }
  switch (name) {
    case 'heal': {
      const has = ['amount', 'pct'].filter((k) => fx[k] !== undefined);
      if (has.length !== 1) err(w, `fx 'heal' braucht genau eins von amount | pct`);
      if (isNum(fx.pct) && fx.pct > 1) err(w, `heal.pct ${fx.pct} > 1`);
      break;
    }
    case 'fuel':
      if (fx.over !== undefined && typeof fx.over !== 'boolean') err(w, `fuel.over muss boolean sein`);
      break;
    case 'buff':
    case 'stack': {
      if (!STATS.has(fx.stat)) err(w, `fx '${name}': ungültiger stat ${fmt(fx.stat)}`);
      const ops = ['mul', 'add'].filter((k) => fx[k] !== undefined);
      if (ops.length !== 1) err(w, `fx '${name}' braucht genau eins von mul | add (hat: ${ops.join(', ') || 'keins'})`);
      if (fx.xmul !== undefined) err(w, `fx '${name}': xmul nicht erlaubt`);
      const step = isNum(fx.mul) ? fx.mul : isNum(fx.add) ? fx.add : null;
      if (isNum(fx.mul) && fx.mul <= -1 && !STATS_MAY_GO_NEGATIVE.has(fx.stat)) err(w, `${name}.mul ${fx.mul} ≤ −1 macht ${fx.stat} null/negativ`);
      if (name === 'stack' && step !== null && isNum(fx.max) && fx.max > 0) {
        if (fx.max < Math.abs(step) - 1e-12) err(w, `stack.max ${fx.max} ist kleiner als ein Schritt (${Math.abs(step)}) – Stapel wirkt nie voll`);
        const ratio = fx.max / Math.abs(step);
        if (ratio > 20) err(w, `stack.max ${fx.max} ist eine Wertobergrenze (modState: |Summe| ≤ max), keine Stapelanzahl – entspricht ${Math.round(ratio)} Stapeln (${fx.stat} ${isNum(fx.mul) ? 'mul' : 'add'} bis ${fx.max >= 1 ? '+' + fx.max * (isNum(fx.mul) ? 100 : 1) + (isNum(fx.mul) ? ' %' : '') : fx.max})`);
      }
      break;
    }
    case 'charge': {
      if (!isStr(fx.key)) err(w, `charge.key muss ein Text sein`);
      else if (info) {
        if (!chargeKeys.has(fx.key)) chargeKeys.set(fx.key, new Set());
        chargeKeys.get(fx.key).add(info.sourceId);
      }
      if (isNum(fx.n) && isNum(fx.at)) {
        if (!isInt(fx.n) || !isInt(fx.at)) err(w, `charge.n und charge.at müssen ganzzahlig sein`);
        if (fx.at < fx.n) err(w, `charge.at (${fx.at}) < n (${fx.n}) – löst sofort aus`);
        if (fx.at === fx.n) warn(w, `charge.at = n – Zähler überflüssig, löst jedes Mal aus`);
      }
      if (fx.then === undefined) break;
      checkFxList(`${w}.then`, fx.then, ctxKind, info);
      break;
    }
    case 'chance': {
      if (isNum(fx.p) && !(fx.p > 0 && fx.p < 1)) err(w, `chance.p muss in (0,1) liegen (ist ${fx.p})`);
      if (fx.then === undefined) break;
      checkFxList(`${w}.then`, fx.then, ctxKind, info);
      break;
    }
    case 'emit': {
      const ev = fx.event;
      if (!ALL_EVENTS[ev]) { err(w, `emit: unbekanntes Ereignis ${fmt(ev)}`); break; }
      if (NOT_EMITTABLE.has(ev)) err(w, `emit '${ev}': dieses Ereignis löst nur das Spiel selbst aus`);
      if (ctxKind === 'stage' && RUN_EVENTS[ev]) err(w, `emit '${ev}': Run-Ereignis in Etappen-Kontext`);
      if (ctxKind === 'run' && STAGE_EVENTS[ev]) err(w, `emit '${ev}': Etappen-Ereignis in Run-Kontext (kein Fahrzeug)`);
      if (fx.data !== undefined) {
        if (!isObj(fx.data)) err(w, `emit.data muss ein Objekt sein`);
        else {
          for (const k of Object.keys(fx.data)) if (!ALL_EVENTS[ev].includes(k)) err(w, `emit '${ev}': unbekanntes Datenfeld ${fmt(k)} (erlaubt: ${ALL_EVENTS[ev].join(', ') || 'keine'})`);
          if (ev === 'pickup' && fx.data.kind !== undefined && !PICKUP_KINDS.has(fx.data.kind)) err(w, `emit 'pickup': ungültige kind ${fmt(fx.data.kind)}`);
          if ((ev === 'landing' || ev === 'perfectLanding') && fx.data.quality !== undefined && !LANDING_QUALITIES.has(fx.data.quality)) err(w, `emit '${ev}': ungültige quality`);
          if (ev === 'boost' && fx.data.free !== undefined && typeof fx.data.free !== 'boolean') err(w, `emit 'boost': free muss boolean sein`);
        }
      }
      break;
    }
    case 'shield':
      if (isNum(fx.n) && !isInt(fx.n)) err(w, `shield.n muss ganzzahlig sein`);
      break;
    case 'refill':
      if (isNum(fx.pct) && fx.pct > 1) err(w, `refill.pct ${fx.pct} > 1`);
      if (fx.ability !== undefined && !abilityById.has(fx.ability)) err(w, `refill.ability ${fmt(fx.ability)} existiert nicht`);
      break;
    case 'spin':
      if (isNum(fx.amount) && Math.abs(fx.amount) > 20) warn(w, `spin.amount ${fx.amount} rad/s ist sehr hoch`);
      break;
    default:
  }
}

function checkCond(w, cond, on, ctxKind) {
  if (cond === undefined) return;
  if (!isObj(cond)) return err(w, 'if muss ein Objekt sein');
  if (!Object.keys(cond).length) warn(w, 'leeres if');
  for (const [k, v] of Object.entries(cond)) {
    const wk = `${w}.${k}`;
    if (!COND_KEYS.has(k)) { err(wk, `unbekannte Bedingung ${fmt(k)}`); continue; }
    // Bezug zum Ereignis
    if (DATA_CONDS.has(k)) {
      if (ALL_EVENTS[on] && !(EVENT_CONDS[on] || []).includes(k)) err(wk, `Bedingung ${k} passt nicht zum Ereignis '${on}' (Datenfelder: ${ALL_EVENTS[on].join(', ') || 'keine'})`);
    } else if (ctxKind === 'run' && !STATE_CONDS_RUN.has(k)) {
      err(wk, `Bedingung ${k} braucht das Fahrzeug – bei Run-Ereignis '${on}' nicht auswertbar`);
    }
    // Wertebereich
    switch (k) {
      case 'perfect': case 'airborne': case 'grounded': case 'free':
        if (typeof v !== 'boolean') err(wk, `muss boolean sein`);
        break;
      case 'quality': {
        const vals = Array.isArray(v) ? v : [v];
        if (!vals.length || vals.some((q) => !LANDING_QUALITIES.has(q))) err(wk, `ungültige quality ${fmt(v)}`);
        break;
      }
      case 'minImpact': case 'maxImpact': case 'minSpeed':
        if (!isNum(v) || v <= 0) err(wk, `muss Zahl > 0 sein (${fmt(v)})`);
        break;
      case 'heatAbove': case 'heatBelow':
        if (!isNum(v) || v <= 0 || v > 100) err(wk, `muss Zahl in (0,100] sein (${fmt(v)})`);
        break;
      case 'fuelBelow': case 'hpBelow':
        if (!isNum(v) || v <= 0 || v >= 1) err(wk, `ist ein Anteil und muss in (0,1) liegen (${fmt(v)})`);
        break;
      case 'minCount':
        if (!isInt(v) || v < 1) err(wk, `muss ganze Zahl ≥ 1 sein (${fmt(v)})`);
        break;
      case 'dir':
        if (v !== 'back' && v !== 'front') err(wk, `muss 'back' oder 'front' sein (${fmt(v)})`);
        break;
      case 'kind':
        if (on === 'pickup' && !PICKUP_KINDS.has(v)) err(wk, `ungültige pickup-kind ${fmt(v)}`);
        else if (on === 'stageClear' && !STAGE_KINDS.has(v)) err(wk, `ungültige stageClear-kind ${fmt(v)}`);
        else if (!isStr(v)) err(wk, `muss Text sein`);
        break;
      case 'ability':
        if (!abilityById.has(v)) err(wk, `Fähigkeit ${fmt(v)} existiert nicht`);
        break;
      case 'source':
        if (!isStr(v)) err(wk, `muss Text sein`);
        break;
      case 'nodeType':
        if (!Object.prototype.hasOwnProperty.call(NODE_TYPES, v)) err(wk, `Knotentyp ${fmt(v)} existiert nicht`);
        break;
      case 'medal':
        if (!MEDALS.has(v)) err(wk, `ungültige Medaille ${fmt(v)}`);
        break;
      case 'chassis':
        if (!chassisById.has(v)) err(wk, `Chassis ${fmt(v)} existiert nicht`);
        break;
      default:
    }
  }
  if (cond.airborne === true && cond.grounded === true) err(w, 'airborne und grounded gleichzeitig – nie erfüllt');
  if (isNum(cond.heatAbove) && isNum(cond.heatBelow) && cond.heatAbove >= cond.heatBelow) err(w, 'heatAbove ≥ heatBelow – nie erfüllt');
  if (isNum(cond.minImpact) && isNum(cond.maxImpact) && cond.minImpact >= cond.maxImpact) err(w, 'minImpact ≥ maxImpact – nie erfüllt');
}

function checkLimit(w, limit) {
  if (limit === undefined) return;
  if (!isObj(limit)) return err(w, 'limit muss ein Objekt sein');
  for (const [k, v] of Object.entries(limit)) {
    if (!LIMIT_KEYS.has(k)) { err(`${w}.${k}`, `unbekanntes Limit ${fmt(k)} (erlaubt: perStage, perRun, cooldown)`); continue; }
    if (!isNum(v) || v <= 0) err(`${w}.${k}`, `muss Zahl > 0 sein (${fmt(v)})`);
    else if (k !== 'cooldown' && !isInt(v)) err(`${w}.${k}`, `muss ganzzahlig sein (${v})`);
  }
}

function checkTriggers(where, triggers, sourceId, info, { allowRun = true } = {}) {
  if (triggers === undefined) return;
  if (!Array.isArray(triggers)) return err(where, 'triggers muss ein Array sein');
  triggers.forEach((t, i) => {
    const w = `${where}[${i}]`;
    if (!isObj(t)) return err(w, 'Trigger ist kein Objekt');
    checkKeys(w, t, TRIGGER_KEYS, 'Trigger');
    const on = t.on;
    let ctxKind = 'stage';
    if (!ALL_EVENTS[on]) err(w, `unbekanntes Ereignis on: ${fmt(on)}`);
    else if (RUN_EVENTS[on]) {
      ctxKind = 'run';
      if (!allowRun) err(w, `Run-Ereignis '${on}' ist hier nicht sinnvoll`);
    }
    checkCond(`${w}.if`, t.if, on, ctxKind);
    checkLimit(`${w}.limit`, t.limit);
    if (t.do === undefined) err(w, 'do fehlt');
    else checkFxList(`${w}.do`, t.do, ctxKind, info);
    triggerSources.push({ sourceId, where: w, trig: t });
  });
}

function checkRules(where, holder, specHolder = holder) {
  const rules = holder.rules;
  const spec = specHolder.ruleSpec;
  if (rules !== undefined && !isObj(rules)) err(where, 'rules muss ein Objekt sein');
  if (spec !== undefined && !isObj(spec)) err(where, 'ruleSpec muss ein Objekt sein');
  const r = isObj(rules) ? rules : {};
  const s = isObj(spec) ? spec : {};
  for (const [name, val] of Object.entries(r)) {
    const w = `${where} › rules.${name}`;
    const okVal = val === true || isNum(val) || (isObj(val) && Object.keys(val).length > 0);
    if (!okVal) err(w, `Regelwert muss true, Zahl oder nicht-leeres Objekt sein (ist ${fmt(val)})`);
    if (isObj(val)) for (const [k, x] of Object.entries(val)) if (!(isNum(x) || typeof x === 'boolean' || isStr(x))) err(w, `Regelparameter ${k} ungültig (${fmt(x)})`);
    if (name === 'tagBoost' && isObj(val)) for (const t of Object.keys(val)) if (!TAG_SET.has(t)) err(w, `tagBoost: unbekannter Tag ${fmt(t)}`);
    ruleUses.push({ where: w, rule: name, hasLocalSpec: s[name] !== undefined });
  }
  for (const [name, text] of Object.entries(s)) {
    const w = `${where} › ruleSpec.${name}`;
    if (!(name in r)) err(w, `ruleSpec ohne zugehörige Regel in rules`);
    if (typeof text !== 'string' || len(text.trim()) < 60) err(w, `ruleSpec muss eine präzise Beschreibung sein (Text ≥ 60 Zeichen)`);
    else {
      if (!/Auswertung/.test(text)) warn(w, `ruleSpec nennt keine Auswertungsstelle („Auswertung: …“)`);
      if (!ruleSpecRegistry.has(name)) ruleSpecRegistry.set(name, []);
      ruleSpecRegistry.get(name).push({ where: w, text });
    }
  }
}

// Regel für describeItem (Inhalts-Konvention): {key} zeigt das ERSTE Vorkommen des Schlüssels in Datenreihenfolge
// (stats → triggers → do → then). Weitere Werte desselben Schlüssels stehen fest im Text (skalieren nicht mit ★).
const ambiguousPlaceholders = []; // { where, key, vals }
function checkPlaceholders(where, text, scaleVals) {
  if (typeof text !== 'string') return;
  for (const m of text.matchAll(/\{([^}]*)\}/g)) {
    const key = m[1];
    if (!SCALE_KEYS.has(key)) { err(where, `Platzhalter {${key}} ist kein skalierter Parameter (${[...SCALE_KEYS].join(', ')})`); continue; }
    const vals = scaleVals[key];
    if (!vals || !vals.length) err(where, `Platzhalter {${key}} ohne passenden Effekt-Parameter ${key}`);
    else if (new Set(vals).size > 1) ambiguousPlaceholders.push({ where, key, vals: [...new Set(vals)] });
  }
}
function noPlaceholders(where, text) {
  if (typeof text === 'string' && /\{[^}]*\}/.test(text)) err(where, `Platzhalter ${text.match(/\{[^}]*\}/)[0]} wird hier nicht ersetzt (nur Item-desc)`);
}

// ═══════════════════════════════════ Tags & Set-Boni ═══════════════════════════════════

for (const t of TAG_IDS) if (!TAGS[t]) err('TAGS', `Tag ${fmt(t)} ist in keiner content_*.js definiert`);
for (const [t, { def, file }] of Object.entries(TAGS)) {
  const w = `${file} › TAGS.${t}`;
  if (!TAG_SET.has(t)) { err(w, `unbekannter Tag ${fmt(t)} (erlaubt: ${TAG_IDS.join(', ')})`); continue; }
  if (!isObj(def)) { err(w, 'Tag-Definition ist kein Objekt'); continue; }
  checkKeys(w, def, TAG_KEYS, 'Tag');
  checkText(w, def, 'name', MAX.name);
  checkText(w, def, 'desc', MAX.desc);
  checkIcon(w, def.icon);
  if (!HEX.test(def.color || '')) err(w, `color muss #rrggbb sein (${fmt(def.color)})`);
  if (!isObj(def.sets)) { err(w, 'sets fehlt'); continue; }
  const lv = Object.keys(def.sets).sort();
  if (lv.join(',') !== SET_LEVELS.join(',')) err(w, `sets muss genau die Stufen 2/4/6 haben (hat: ${lv.join('/') || '—'})`);
  for (const L of lv) {
    const s = def.sets[L];
    const ws = `${w} › sets.${L}`;
    if (!isObj(s)) { err(ws, 'Set-Bonus ist kein Objekt'); continue; }
    checkKeys(ws, s, SET_KEYS, 'Set-Bonus');
    checkText(ws, s, 'desc', MAX.desc);
    noPlaceholders(ws, s.desc);
    if (!s.stats && !s.triggers && !s.rules) err(ws, 'Set-Bonus ohne Wirkung (stats/triggers/rules)');
    checkStats(ws, s.stats, { xmulWarn: true });
    checkTriggers(`${ws} › triggers`, s.triggers, `set:${t}:${L}`, { sourceId: `set:${t}`, scaleVals: {} });
    checkRules(ws, s);
  }
}

// ═══════════════════════════════════ Items ═══════════════════════════════════

const countByTag = Object.fromEntries(TAG_IDS.map((t) => [t, 0]));
const rarityByTag = Object.fromEntries(TAG_IDS.map((t) => [t, {}]));
const baseByTag = Object.fromEntries(TAG_IDS.map((t) => [t, 0]));
let nLegend = 0;
let nCursed = 0;
const itemsByPool = new Map();

for (const { item, file } of ITEMS) {
  if (!isObj(item) || !isStr(item.id)) continue;
  const w = `${file} › ${item.id}`;
  checkKeys(w, item, ITEM_KEYS, 'Item');
  if (!/^[a-z0-9_]+$/.test(item.id)) err(w, `id nur aus a–z, 0–9, _ erlaubt`);
  checkText(w, item, 'name', MAX.name);
  checkText(w, item, 'desc', MAX.desc);
  checkText(w, item, 'flavor', MAX.flavor);
  checkIcon(w, item.icon);
  if (!RARITIES.has(item.rarity)) err(w, `ungültige rarity ${fmt(item.rarity)}`);

  // Tags
  let primary = null;
  if (!Array.isArray(item.tags)) err(w, 'tags muss ein Array sein');
  else {
    if (item.tags.length < 1 || item.tags.length > 2) err(w, `1–2 Tags erlaubt (hat ${item.tags.length})`);
    for (const t of item.tags) if (!TAG_SET.has(t)) err(w, `ungültiger Tag ${fmt(t)}`);
    if (new Set(item.tags).size !== item.tags.length) err(w, 'Tag doppelt');
    primary = item.tags[0];
    if (TAG_SET.has(primary) && !item.id.startsWith(primary + '_')) warn(w, `id beginnt nicht mit dem Primär-Tag '${primary}_'`);
  }

  // Pool
  if (item.pool !== 'base') {
    if (!isStr(item.pool)) err(w, 'pool fehlt');
    else if (!researchById.has(item.pool)) err(w, `pool ${fmt(item.pool)} ist keine Forschungs-ID in RESEARCH`);
  }
  if (isStr(item.pool)) {
    if (!itemsByPool.has(item.pool)) itemsByPool.set(item.pool, []);
    itemsByPool.get(item.pool).push(item.id);
  }
  if (item.rarity === 'legendary' && !String(item.pool).startsWith('r_legend')) err(w, `legendäres Item sollte in einem r_legend_*-Pool liegen (pool ${fmt(item.pool)})`);
  if (item.rarity === 'cursed' && !String(item.pool).startsWith('r_curse')) err(w, `verfluchtes Item sollte in einem r_curse_*-Pool liegen (pool ${fmt(item.pool)})`);
  if (!['legendary', 'cursed'].includes(item.rarity) && /^r_(legend|curse)/.test(String(item.pool))) err(w, `${item.rarity}-Item in Legendär/Fluch-Pool ${item.pool}`);

  // Zählung
  if (item.rarity === 'legendary') nLegend++;
  else if (item.rarity === 'cursed') nCursed++;
  else if (TAG_SET.has(primary)) {
    countByTag[primary]++;
    rarityByTag[primary][item.rarity] = (rarityByTag[primary][item.rarity] || 0) + 1;
    if (item.pool === 'base') baseByTag[primary]++;
  }

  // Werte
  const info = { sourceId: item.id, scaleVals: {} };
  const premium = item.rarity === 'legendary' || item.rarity === 'cursed';
  checkStats(w, item.stats, { xmulWarn: !premium });
  checkTriggers(`${w} › triggers`, item.triggers, item.id, info);
  checkRules(w, item);
  if (!item.stats && !item.triggers && !item.rules) err(w, 'Item ohne Wirkung (stats/triggers/rules)');
  if (item.rarity === 'legendary' && !(isObj(item.rules) && Object.keys(item.rules).length)) err(w, 'legendäres Item ohne Regel (rules) – Legendär „verändert Regeln“');

  // Fluch
  if (item.rarity === 'cursed') {
    if (!isObj(item.curse)) err(w, 'verfluchtes Item ohne curse');
    else {
      const wc = `${w} › curse`;
      checkKeys(wc, item.curse, CURSE_KEYS, 'curse');
      checkText(wc, item.curse, 'desc', MAX.desc);
      if (!item.curse.stats && !item.curse.triggers && !item.curse.rules) err(wc, 'Fluch ohne Nachteil (stats/triggers/rules)');
      const cinfo = { sourceId: item.id, scaleVals: {} };
      checkStats(wc, item.curse.stats);
      checkTriggers(`${wc} › triggers`, item.curse.triggers, item.id, cinfo);
      checkRules(wc, item.curse);
      checkPlaceholders(wc, item.curse.desc, cinfo.scaleVals);
    }
  } else if (item.curse !== undefined) err(w, `curse nur bei rarity 'cursed' erlaubt`);

  checkPlaceholders(w, item.desc, info.scaleVals);
  noPlaceholders(`${w} › flavor`, item.flavor);
}

for (const t of TAG_IDS) {
  if (countByTag[t] !== ITEMS_PER_TAG) err(`Items › Tag ${t}`, `${countByTag[t]} Items mit Primär-Tag ${t} (ohne Legendär/Fluch), erwartet ${ITEMS_PER_TAG}`);
  if (!baseByTag[t]) err(`Items › Tag ${t}`, `kein Item mit pool 'base' – Chassis-starterTag und Start-Pool brauchen mindestens eins`);
}
if (nLegend !== LEGENDARY_COUNT) err('Items', `${nLegend} legendäre Items, erwartet ${LEGENDARY_COUNT}`);
if (nCursed !== CURSED_COUNT) err('Items', `${nCursed} verfluchte Items, erwartet ${CURSED_COUNT}`);

// ═══════════════════════════════════ Chassis ═══════════════════════════════════

if (CHASSIS.length !== CHASSIS_COUNT) err('chassis.js', `${CHASSIS.length} Chassis, erwartet ${CHASSIS_COUNT} (V2-DESIGN §5)`);
let coreSum = 0;
let prevCores = -1;
let starters = 0;
for (const c of CHASSIS) {
  if (!isObj(c) || !isStr(c.id)) continue;
  const w = `chassis.js › ${c.id}`;
  checkKeys(w, c, CHASSIS_KEYS, 'Chassis');
  checkText(w, c, 'name', MAX.name);
  checkText(w, c, 'desc', MAX.desc);
  checkText(w, c, 'flavor', MAX.flavor);
  noPlaceholders(w, c.desc);
  checkIcon(w, c.icon);
  if (!isStr(c.model)) err(w, 'model fehlt');
  if (!TAG_SET.has(c.starterTag)) err(w, `starterTag ${fmt(c.starterTag)} ist kein gültiger Tag`);
  if (c.starterItem !== undefined && !itemById.has(c.starterItem)) err(w, `starterItem ${fmt(c.starterItem)} existiert nicht`);
  if (!isObj(c.unlock)) err(w, 'unlock fehlt');
  else {
    if (!isInt(c.unlock.cores) || c.unlock.cores < 0) err(w, `unlock.cores muss ganze Zahl ≥ 0 sein`);
    else {
      coreSum += c.unlock.cores;
      if (c.unlock.cores < prevCores) warn(w, `Kerne nicht aufsteigend (Kopfkommentar: Reihenfolge = Freischalt-Reihenfolge)`);
      prevCores = c.unlock.cores;
    }
    for (const k of Object.keys(c.unlock)) if (!['research', 'cores'].includes(k)) err(w, `unlock: unbekanntes Feld ${k}`);
    if (c.unlock.research !== undefined) {
      const r = researchById.get(c.unlock.research);
      if (!r) err(w, `unlock.research ${fmt(c.unlock.research)} existiert nicht in RESEARCH`);
      else if (!(r.unlocks?.chassis || []).includes(c.id)) err(w, `Forschung ${r.id} schaltet dieses Chassis nicht frei (unlocks.chassis)`);
    } else {
      starters++;
      if (c.unlock.cores !== 0) err(w, 'Chassis ohne Forschung muss 0 Kerne kosten (Start-Chassis)');
    }
  }
  if (!isObj(c.slots)) err(w, 'slots fehlt');
  else for (const [k, v] of Object.entries(c.slots)) {
    if (!['items', 'abilities'].includes(k)) err(w, `slots: unbekanntes Feld ${k}`);
    else if (!isInt(v)) err(w, `slots.${k} muss ganzzahlig sein`);
  }
  if (c.visual !== undefined) {
    if (!isObj(c.visual)) err(w, 'visual muss Objekt sein');
    else for (const [k, v] of Object.entries(c.visual)) if (!HEX.test(v)) err(w, `visual.${k} ist keine #rrggbb-Farbe`);
  }
  if (c.ability !== undefined) {
    const a = abilityById.get(c.ability);
    if (!a) err(w, `ability ${fmt(c.ability)} existiert nicht`);
    else if (a.chassis !== c.id) err(w, `Spezialfähigkeit ${a.id} gehört laut abilities.js zu ${fmt(a.chassis)}`);
  }
  checkStats(w, c.stats);
  checkTriggers(`${w} › triggers`, c.triggers, `chassis:${c.id}`, { sourceId: `chassis:${c.id}`, scaleVals: {} });
  checkRules(w, c);
}
if (starters !== 1) err('chassis.js', `${starters} Start-Chassis (ohne Forschung), erwartet genau 1`);
if (coreSum !== 30) warn('chassis.js', `Summe der Kerne ${coreSum}, Kopfkommentar sagt 30`);

// ═══════════════════════════════════ Teile ═══════════════════════════════════

const partsBySlot = Object.fromEntries(PART_SLOTS.map((s) => [s, []]));
for (const p of PARTS) {
  if (!isObj(p) || !isStr(p.id)) continue;
  const w = `parts.js › ${p.id}`;
  checkKeys(w, p, PART_KEYS, 'Teil');
  checkText(w, p, 'name', MAX.name);
  checkText(w, p, 'desc', MAX.desc);
  checkText(w, p, 'flavor', MAX.flavor);
  noPlaceholders(w, p.desc);
  checkIcon(w, p.icon);
  if (!isStr(p.model)) err(w, 'model fehlt');
  if (!PART_SLOTS.includes(p.slot)) err(w, `ungültiger slot ${fmt(p.slot)}`);
  else partsBySlot[p.slot].push(p);
  if (p.tag !== undefined && !TAG_SET.has(p.tag)) err(w, `ungültiger tag ${fmt(p.tag)}`);
  if (!isObj(p.unlock)) err(w, 'unlock fehlt');
  else {
    for (const k of Object.keys(p.unlock)) if (!['research', 'scrap'].includes(k)) err(w, `unlock: unbekanntes Feld ${k}`);
    if (!isInt(p.unlock.scrap) || p.unlock.scrap < 0) err(w, 'unlock.scrap muss ganze Zahl ≥ 0 sein');
    if (p.unlock.research !== undefined) {
      const r = researchById.get(p.unlock.research);
      if (!r) err(w, `unlock.research ${fmt(p.unlock.research)} existiert nicht in RESEARCH`);
      else if (!(r.unlocks?.parts || []).includes(p.id)) err(w, `Forschung ${r.id} schaltet dieses Teil nicht frei (unlocks.parts)`);
      if (p.unlock.scrap === 0) err(w, 'Forschungs-Teil mit 0 Schrott – Startteile haben keine Forschung');
    }
  }
  checkStats(w, p.stats);
  if (!isObj(p.perLevel) || !Object.keys(p.perLevel).length) err(w, 'perLevel fehlt oder leer');
  else checkStats(w, p.perLevel, { ops: new Set(['add', 'mul']), label: 'perLevel' });
  checkTriggers(`${w} › triggers`, p.triggers, `part:${p.id}`, { sourceId: `part:${p.id}`, scaleVals: {} }, { allowRun: false });
  checkRules(w, p);
}
for (const s of PART_SLOTS) {
  const list = partsBySlot[s];
  if (list.length < 3 || list.length > 5) err(`parts.js › slot ${s}`, `${list.length} Teile, erwartet 3–5 (V2-DESIGN §5)`);
  const st = list.filter((p) => p.unlock && p.unlock.scrap === 0 && p.unlock.research === undefined);
  if (st.length !== 1) err(`parts.js › slot ${s}`, `${st.length} Startteile (scrap 0, ohne Forschung), erwartet genau 1`);
}

// ═══════════════════════════════════ Fähigkeiten ═══════════════════════════════════

let startAbilities = 0;
for (const a of ABILITIES) {
  if (!isObj(a) || !isStr(a.id)) continue;
  const w = `abilities.js › ${a.id}`;
  checkKeys(w, a, ABILITY_KEYS, 'Fähigkeit');
  checkText(w, a, 'name', MAX.name);
  checkText(w, a, 'desc', MAX.desc);
  checkText(w, a, 'flavor', MAX.flavor);
  noPlaceholders(w, a.desc);
  checkIcon(w, a.icon);
  if (a.mode !== 'hold' && a.mode !== 'tap') err(w, `mode muss 'hold' oder 'tap' sein`);
  for (const k of ['cooldown', 'fuel', 'heat']) if (!isNum(a[k]) || a[k] < 0) err(w, `${k} muss Zahl ≥ 0 sein (${fmt(a[k])})`);
  if (a.mode === 'tap' && a.cooldown === 0) warn(w, 'Tipp-Fähigkeit ohne Abklingzeit');
  if (!Array.isArray(a.effects)) err(w, 'effects muss ein Array sein');
  else {
    a.effects.forEach((fx, i) => checkFx(`${w} › effects[${i}]`, fx, 'stage', { sourceId: `ability:${a.id}`, scaleVals: {} }));
    if (!a.effects.length && !(isObj(a.rules) && Object.keys(a.rules).length)) err(w, 'Fähigkeit ohne effects und ohne rules');
  }
  if (!isObj(a.unlock)) err(w, 'unlock fehlt');
  else {
    for (const k of Object.keys(a.unlock)) if (k !== 'research') err(w, `unlock: unbekanntes Feld ${k}`);
    if (a.unlock.research === undefined) startAbilities++;
    else {
      const r = researchById.get(a.unlock.research);
      if (!r) err(w, `unlock.research ${fmt(a.unlock.research)} existiert nicht in RESEARCH`);
      else if (!(r.unlocks?.abilities || []).includes(a.id)) err(w, `Forschung ${r.id} schaltet diese Fähigkeit nicht frei (unlocks.abilities)`);
    }
  }
  if (a.chassis !== undefined) {
    const c = chassisById.get(a.chassis);
    if (!c) err(w, `chassis ${fmt(a.chassis)} existiert nicht`);
    else if (c.ability !== a.id) err(w, `Chassis ${c.id} führt diese Fähigkeit nicht als ability`);
  }
  checkRules(w, a);
}
if (startAbilities < 2) err('abilities.js', `${startAbilities} Start-Fähigkeiten (unlock {}), für 2 Slots braucht es mindestens 2`);

// ═══════════════════════════════════ Forschung ═══════════════════════════════════

for (const [b, def] of Object.entries(BRANCHES)) {
  const w = `research.js › BRANCHES.${b}`;
  checkText(w, def, 'name', MAX.name);
  checkIcon(w, def?.icon);
  if (!Array.isArray(def?.cols) || def.cols.length !== 2 || !def.cols.every(isInt) || def.cols[0] > def.cols[1]) err(w, 'cols muss [von, bis] sein');
}
const posKey = new Map();
const unlockedPools = new Map(); // pool → [researchId]
const listedItems = new Map(); // itemId → [researchId]
for (const r of RESEARCH) {
  if (!isObj(r) || !isStr(r.id)) continue;
  const w = `research.js › ${r.id}`;
  checkKeys(w, r, RESEARCH_KEYS, 'Forschung');
  if (!/^r_[a-z0-9_]+$/.test(r.id)) err(w, `id muss mit r_ beginnen und nur a–z, 0–9, _ enthalten`);
  checkText(w, r, 'name', MAX.name);
  checkText(w, r, 'desc', MAX.desc);
  checkText(w, r, 'flavor', MAX.flavor);
  noPlaceholders(w, r.desc);
  checkIcon(w, r.icon);
  if (!BRANCHES[r.branch]) err(w, `unbekannter Ast ${fmt(r.branch)}`);
  if (!isInt(r.cost) || r.cost < 1) err(w, `cost muss ganze Zahl ≥ 1 sein (${fmt(r.cost)})`);
  if (!Array.isArray(r.requires)) err(w, 'requires muss ein Array sein');
  else {
    for (const q of r.requires) {
      if (q === r.id) err(w, 'requires enthält sich selbst');
      else if (!researchById.has(q)) err(w, `requires ${fmt(q)} existiert nicht`);
    }
    if (new Set(r.requires).size !== r.requires.length) err(w, 'requires enthält Duplikate');
    if (!r.requires.length && !(r.cost >= 1 && r.cost <= 2)) warn(w, `Wurzel-Knoten kostet ${r.cost} 📘 (Kopfkommentar: Wurzeln je 1–2)`);
  }
  // unlocks
  if (!isObj(r.unlocks) || !Object.keys(r.unlocks).length) err(w, 'unlocks fehlt oder leer');
  else {
    const u = r.unlocks;
    checkKeys(w, u, RESEARCH_UNLOCK_KEYS, 'unlocks');
    for (const k of ['pool', 'items', 'parts', 'abilities', 'chassis', 'nodes']) {
      if (u[k] !== undefined && (!Array.isArray(u[k]) || !u[k].length)) err(w, `unlocks.${k} muss ein nicht-leeres Array sein`);
    }
    for (const p of u.pool || []) {
      if (!researchById.has(p)) err(w, `unlocks.pool ${fmt(p)} ist keine Forschungs-ID in RESEARCH`);
      if (p !== r.id) warn(w, `unlocks.pool ${fmt(p)} ≠ eigene id (Kopfkommentar: Items mit pool === id)`);
      if (!unlockedPools.has(p)) unlockedPools.set(p, []);
      unlockedPools.get(p).push(r.id);
      if (!(itemsByPool.get(p) || []).length) err(w, `Pool ${p} enthält kein einziges Item`);
    }
    for (const id of u.items || []) {
      const it = itemById.get(id);
      if (!it) err(w, `unlocks.items: Item ${fmt(id)} existiert nicht`);
      else if (!(u.pool || []).includes(it.pool)) err(w, `unlocks.items: ${id} hat pool ${fmt(it.pool)}, der hier nicht freigeschaltet wird`);
      if (!listedItems.has(id)) listedItems.set(id, []);
      listedItems.get(id).push(r.id);
    }
    for (const id of u.parts || []) {
      const p = partById.get(id);
      if (!p) err(w, `unlocks.parts: Teil ${fmt(id)} existiert nicht`);
      else if (p.unlock?.research !== r.id) err(w, `unlocks.parts: ${id} hat unlock.research ${fmt(p.unlock?.research)}`);
    }
    for (const id of u.abilities || []) {
      const a = abilityById.get(id);
      if (!a) err(w, `unlocks.abilities: Fähigkeit ${fmt(id)} existiert nicht`);
      else if (a.unlock?.research !== r.id) err(w, `unlocks.abilities: ${id} hat unlock.research ${fmt(a.unlock?.research)}`);
    }
    for (const id of u.chassis || []) {
      const c = chassisById.get(id);
      if (!c) err(w, `unlocks.chassis: Chassis ${fmt(id)} existiert nicht`);
      else if (c.unlock?.research !== r.id) err(w, `unlocks.chassis: ${id} hat unlock.research ${fmt(c.unlock?.research)}`);
    }
    for (const n of u.nodes || []) {
      const nt = NODE_TYPES[n];
      if (!nt) err(w, `unlocks.nodes: Knotentyp ${fmt(n)} existiert nicht`);
      else if (nt.requiresResearch !== r.id) err(w, `unlocks.nodes: Knoten ${n} hat requiresResearch ${fmt(nt.requiresResearch)}`);
    }
    if (u.perks !== undefined) {
      if (!isObj(u.perks) || !Object.keys(u.perks).length) err(w, 'unlocks.perks muss ein nicht-leeres Objekt sein');
      else for (const [k, v] of Object.entries(u.perks)) {
        if (!PERK_KEYS.has(k)) err(w, `unbekannter Perk ${fmt(k)}`);
        if (!isNum(v) || v <= 0) err(w, `Perk ${k} muss Zahl > 0 sein`);
      }
    }
  }
  // pos
  const p = r.pos;
  if (!isObj(p) || !isInt(p.x) || !isInt(p.y) || p.x < 0 || p.x > 8 || p.y < 0 || p.y > 12) err(w, `pos muss {x:0..8, y:0..12} (ganzzahlig) sein (${fmt(p)})`);
  else {
    const k = `${p.x},${p.y}`;
    if (posKey.has(k)) err(w, `pos ${k} schon von ${posKey.get(k)} belegt`);
    else posKey.set(k, r.id);
    const cols = BRANCHES[r.branch]?.cols;
    if (cols && (p.x < cols[0] || p.x > cols[1])) err(w, `pos.x ${p.x} liegt außerhalb der Spalten ${cols[0]}–${cols[1]} des Asts ${r.branch}`);
  }
  if (r.repeatable !== undefined) {
    const rp = r.repeatable;
    if (!isObj(rp)) err(w, 'repeatable muss Objekt sein');
    else {
      for (const k of Object.keys(rp)) if (!['costGrowth', 'max'].includes(k)) err(w, `repeatable: unbekanntes Feld ${k}`);
      if (!isNum(rp.costGrowth) || rp.costGrowth <= 1) err(w, 'repeatable.costGrowth muss > 1 sein');
      if (!isInt(rp.max) || rp.max < 1) err(w, 'repeatable.max muss ganze Zahl ≥ 1 sein');
    }
  }
}
// Pools: jedes Item-Pool muss freigeschaltet werden, jedes Item genau dort gelistet sein
for (const [pool, ids] of itemsByPool) {
  if (pool === 'base') continue;
  if (!unlockedPools.has(pool)) err(`Pool ${pool}`, `kein Forschungsknoten schaltet diesen Pool frei (Items: ${ids.join(', ')})`);
  for (const id of ids) {
    const lst = listedItems.get(id) || [];
    const owners = unlockedPools.get(pool) || [];
    if (owners.length && !lst.some((rid) => owners.includes(rid))) err(`${itemFile.get(id)} › ${id}`, `fehlt in unlocks.items von ${owners.join(', ')} (Labor-Anzeige)`);
  }
}
for (const [id, rids] of listedItems) if (rids.length > 1) err(`Item ${id}`, `in mehreren Forschungen gelistet: ${rids.join(', ')}`);

// Zyklen (requires)
{
  const state = new Map(); // 0 neu, 1 in Arbeit, 2 fertig
  const stack = [];
  const cycles = [];
  const visit = (id) => {
    const s = state.get(id) || 0;
    if (s === 2) return;
    if (s === 1) { cycles.push([...stack.slice(stack.indexOf(id)), id]); return; }
    state.set(id, 1);
    stack.push(id);
    for (const q of researchById.get(id)?.requires || []) if (researchById.has(q)) visit(q);
    stack.pop();
    state.set(id, 2);
  };
  for (const id of researchById.keys()) visit(id);
  for (const c of cycles) err('research.js', `Zyklus in requires: ${c.join(' → ')}`);
}

// Layout (Kopfkommentar research.js): Eltern oben, Bahnen, keine Linie durch fremde Knoten, keine Kreuzungen
{
  const P = (id) => researchById.get(id)?.pos;
  const valid = (p) => isObj(p) && isInt(p.x) && isInt(p.y);
  const segs = [];
  for (const r of RESEARCH) {
    if (!isObj(r) || !valid(r.pos) || !Array.isArray(r.requires)) continue;
    for (const q of r.requires) {
      const pp = P(q);
      if (!valid(pp)) continue;
      const row12 = pp.y === 12 && r.pos.y === 12;
      if (!(pp.y < r.pos.y) && !row12) err(`research.js › ${r.id}`, `Elternknoten ${q} (y ${pp.y}) steht nicht über dem Kind (y ${r.pos.y})`);
      if (Math.abs(pp.x - r.pos.x) > 1 && !row12) err(`research.js › ${r.id}`, `Linie zu ${q} springt ${Math.abs(pp.x - r.pos.x)} Spalten (nur Nachbarspalten erlaubt)`);
      segs.push({ a: pp, b: r.pos, from: q, to: r.id });
    }
  }
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const onSeg = (p, a, b) => cross(a, b, p) === 0 && Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y);
  const same = (p, q) => p.x === q.x && p.y === q.y;
  for (const s of segs) {
    for (const r of RESEARCH) {
      if (!isObj(r) || !valid(r.pos) || r.id === s.from || r.id === s.to) continue;
      if (onSeg(r.pos, s.a, s.b)) err(`research.js › ${s.to}`, `Linie ${s.from} → ${s.to} läuft durch fremden Knoten ${r.id}`);
    }
  }
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s = segs[i];
      const t = segs[j];
      const shared = [[s.a, t.a, s.b, t.b], [s.a, t.b, s.b, t.a], [s.b, t.a, s.a, t.b], [s.b, t.b, s.a, t.a]].find(([p, q]) => same(p, q));
      if (shared) {
        const [P0, , A, B] = shared;
        if (cross(P0, A, B) === 0 && (A.x - P0.x) * (B.x - P0.x) + (A.y - P0.y) * (B.y - P0.y) > 0) err('research.js', `Linien ${s.from}→${s.to} und ${t.from}→${t.to} liegen übereinander`);
        continue;
      }
      const d1 = cross(t.a, t.b, s.a);
      const d2 = cross(t.a, t.b, s.b);
      const d3 = cross(s.a, s.b, t.a);
      const d4 = cross(s.a, s.b, t.b);
      const proper = ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
      const touch = (d1 === 0 && onSeg(s.a, t.a, t.b)) || (d2 === 0 && onSeg(s.b, t.a, t.b)) || (d3 === 0 && onSeg(t.a, s.a, s.b)) || (d4 === 0 && onSeg(t.b, s.a, s.b));
      if (proper || touch) err('research.js', `Linien ${s.from}→${s.to} und ${t.from}→${t.to} kreuzen sich`);
    }
  }
}

// Pacing-Angaben des Kopfkommentars nachrechnen
{
  const anc = (id, seen = new Set()) => {
    for (const q of researchById.get(id)?.requires || []) if (!seen.has(q) && researchById.has(q)) { seen.add(q); anc(q, seen); }
    return seen;
  };
  const total = RESEARCH.filter((r) => isObj(r) && !r.repeatable).reduce((s, r) => s + (isNum(r.cost) ? r.cost : 0), 0);
  if (total !== RESEARCH_CLAIMS.totalOneTime) warn('research.js', `Summe aller einmaligen Knoten ist ${total} 📘, Kopfkommentar sagt ${RESEARCH_CLAIMS.totalOneTime}`);
  for (const [id, claim] of Object.entries(RESEARCH_CLAIMS.cumulative)) {
    if (!researchById.has(id)) continue;
    const sum = [...anc(id), id].reduce((s, x) => s + (researchById.get(x).cost || 0), 0);
    if (sum !== claim) warn(`research.js › ${id}`, `kumulierte Kosten ${sum} 📘, Kopfkommentar sagt ${claim}`);
  }
}

// ═══════════════════════════════════ Icons (Paket B) ═══════════════════════════════════
// Tags (data/tags.js → TAG_PAINT), Teile-Slots (data/index.js → SLOT_INFO), Biome: Symbol und Lack-Ton aus dem Sprite
{
  const imp = async (f) => { try { return await import(pathToFileURL(join(DIR, f)).href); } catch (e) { return null; } };
  const tagsMod = await imp('tags.js');
  if (tagsMod && tagsMod.TAG_PAINT) {
    for (const t of TAG_IDS) {
      const tp = tagsMod.TAG_PAINT[t];
      if (!tp) { err('tags.js › TAG_PAINT', `Tag ${fmt(t)} fehlt`); continue; }
      checkIconId(`tags.js › TAG_PAINT.${t}`, tp.iconId);
      if (!HEX.test(tp.color || '')) err(`tags.js › TAG_PAINT.${t}`, 'color muss #rrggbb sein');
    }
  }
  const idx = await imp('index.js');
  if (idx && idx.SLOT_INFO) for (const [k, v] of Object.entries(idx.SLOT_INFO)) checkIconId(`index.js › SLOT_INFO.${k}`, v.iconId);
  const bio = await imp('biomes.js');
  if (bio && bio.BIOMES) for (const b of bio.BIOMES) checkIconId(`biomes.js › ${b.id}`, b.iconId);
}

// ═══════════════════════════════════ Knotentypen ═══════════════════════════════════

for (const id of NODE_TYPE_IDS) if (!NODE_TYPES[id]) err('nodes.js', `Knotentyp ${id} fehlt`);
const forced = new Map();
for (const [id, n] of Object.entries(NODE_TYPES)) {
  const w = `nodes.js › ${id}`;
  if (!NODE_TYPE_IDS.includes(id)) warn(w, 'Knotentyp nicht in V2-DESIGN §4');
  if (!isObj(n)) { err(w, 'kein Objekt'); continue; }
  checkKeys(w, n, NODE_KEYS, 'Knotentyp');
  checkText(w, n, 'name', MAX.name);
  checkText(w, n, 'desc', MAX.desc);
  noPlaceholders(w, n.desc);
  checkIcon(w, n.icon);
  checkIconId(w, n.iconId);
  if (!HEX.test(n.color || '')) err(w, `color muss #rrggbb sein`);
  if (!isNum(n.weight) || n.weight < 0) err(w, 'weight muss Zahl ≥ 0 sein');
  if (!isInt(n.minFloor) || n.minFloor < 0 || n.minFloor > 6) err(w, 'minFloor muss 0..6 sein');
  for (const k of ['maxPerAct', 'minPerAct']) if (n[k] !== undefined && (!isInt(n[k]) || n[k] < 1)) err(w, `${k} muss ganze Zahl ≥ 1 sein`);
  if (n.maxPerAct !== undefined && n.minPerAct !== undefined && n.minPerAct > n.maxPerAct) err(w, 'minPerAct > maxPerAct');
  if (n.forcedFloors !== undefined) {
    if (!Array.isArray(n.forcedFloors) || n.forcedFloors.some((f) => !isInt(f) || f < 0 || f > 6)) err(w, 'forcedFloors muss Etagen 0..6 enthalten');
    else for (const f of n.forcedFloors) {
      if (forced.has(f)) err(w, `Etage ${f} ist schon für ${forced.get(f)} erzwungen`);
      forced.set(f, id);
      if (f < n.minFloor) err(w, `forcedFloors ${f} < minFloor ${n.minFloor}`);
    }
  }
  if (n.weight === 0 && !n.forcedFloors) err(w, 'weight 0 ohne forcedFloors – Knoten entsteht nie');
  if (n.guaranteeFloors !== undefined) {
    const g = n.guaranteeFloors;
    if (!Array.isArray(g) || g.length !== 2 || !g.every(isInt) || g[0] > g[1] || g[0] < 0 || g[1] > 5) err(w, 'guaranteeFloors muss [von, bis] innerhalb 0..5 sein');
    else if (g[0] < n.minFloor) err(w, `guaranteeFloors beginnt vor minFloor ${n.minFloor}`);
    if (n.minPerAct === undefined) warn(w, 'guaranteeFloors ohne minPerAct');
  }
  if (n.requiresResearch !== undefined) {
    const r = researchById.get(n.requiresResearch);
    if (!r) err(w, `requiresResearch ${fmt(n.requiresResearch)} existiert nicht in RESEARCH`);
    else if (!(r.unlocks?.nodes || []).includes(id)) err(w, `Forschung ${r.id} schaltet diesen Knoten nicht frei (unlocks.nodes)`);
  }
  if (isObj(n.params)) {
    for (const k of ['minRarity', 'rarity']) if (n.params[k] !== undefined && !RARITIES.has(n.params[k])) err(w, `params.${k} ungültige Seltenheit`);
    for (const [k, v] of Object.entries(n.params)) if (typeof v === 'number' && !Number.isFinite(v)) err(w, `params.${k} nicht endlich`);
  }
}
for (const f of [0, 5, 6]) if (!forced.has(f)) err('nodes.js', `Etage ${f} hat keinen erzwungenen Knotentyp (Etappe 0 / Tankstelle 5 / Boss 6)`);
for (const [id, path, ok, why] of NODE_DESIGN) {
  if (!NODE_TYPES[id]) continue;
  const v = getPath(NODE_TYPES[id], path);
  if (!ok(v)) err(`nodes.js › ${id}`, `${path} = ${fmt(v)} widerspricht V2-DESIGN (${why})`);
}

// ═══════════════════════════════════ Textereignisse ═══════════════════════════════════

const eventsPerAct = { 1: 0, 2: 0, 3: 0 };
let coreEvents = 0;
for (const ev of TEXT_EVENTS) {
  if (!isObj(ev) || !isStr(ev.id)) continue;
  const w = `textEvents.js › ${ev.id}`;
  checkKeys(w, ev, EVENT_KEYS, 'Ereignis');
  if (!/^ev_[a-z0-9_]+$/.test(ev.id)) err(w, 'id muss mit ev_ beginnen (a–z, 0–9, _)');
  checkText(w, ev, 'title', MAX.eventTitle);
  checkText(w, ev, 'text', 0);
  if (!Array.isArray(ev.acts) || !ev.acts.length || ev.acts.some((a) => ![1, 2, 3].includes(a))) err(w, 'acts muss Teilmenge von [1,2,3] sein');
  else {
    if (new Set(ev.acts).size !== ev.acts.length) err(w, 'acts enthält Duplikate');
    for (const a of ev.acts) eventsPerAct[a]++;
  }
  if (!Array.isArray(ev.options) || ev.options.length < 2) { err(w, 'mindestens 2 Optionen nötig'); continue; }
  let safe = 0;
  let hasCores = false;
  const labels = new Set();
  ev.options.forEach((o, oi) => {
    const wo = `${w} › options[${oi}]`;
    if (!isObj(o)) return err(wo, 'Option ist kein Objekt');
    checkKeys(wo, o, OPTION_KEYS, 'Option');
    checkText(wo, o, 'label', MAX.optionLabel);
    checkText(wo, o, 'hint', MAX.flavor, { required: false });
    if (labels.has(o.label)) err(wo, `label doppelt: ${fmt(o.label)}`);
    labels.add(o.label);
    // Kosten
    let costs = false;
    if (o.cost !== undefined) {
      if (!isObj(o.cost) || !Object.keys(o.cost).length) err(wo, 'cost muss ein nicht-leeres Objekt sein');
      else for (const [k, v] of Object.entries(o.cost)) {
        costs = true;
        if (!EVENT_COST_KEYS.has(k)) err(wo, `unbekannte Kostenart ${fmt(k)}`);
        else if (k === 'item' && v !== 'random' && v !== 'choose') err(wo, `cost.item muss 'random' oder 'choose' sein`);
        else if (k === 'hpPct' && (!isNum(v) || v <= 0 || v >= 1)) err(wo, `cost.hpPct muss Anteil in (0,1) sein`);
        else if ((k === 'bolts' || k === 'maxFuel') && (!isInt(v) || v <= 0)) err(wo, `cost.${k} muss ganze Zahl > 0 sein`);
      }
    }
    // Ausgänge
    if (!Array.isArray(o.outcomes) || !o.outcomes.length) return err(wo, 'outcomes fehlt oder leer');
    let sum = 0;
    let risky = o.outcomes.length > 1;
    let coreP = 0;
    o.outcomes.forEach((oc, ci) => {
      const wc = `${wo} › outcomes[${ci}]`;
      if (!isObj(oc)) return err(wc, 'Ausgang ist kein Objekt');
      checkKeys(wc, oc, OUTCOME_KEYS, 'Ausgang');
      if (!isNum(oc.p) || oc.p <= 0 || oc.p > 1) err(wc, `p muss in (0,1] liegen (${fmt(oc.p)})`);
      else sum += oc.p;
      checkText(wc, oc, 'text', 0);
      if (!Array.isArray(oc.effects) || !oc.effects.length) return err(wc, 'effects fehlt oder leer');
      oc.effects.forEach((e, ei) => {
        const we = `${wc} › effects[${ei}]`;
        if (!isObj(e) || Object.keys(e).length !== 1) return err(we, 'Effekt muss genau einen Schlüssel haben');
        const [k, v] = Object.entries(e)[0];
        if (!EVENT_EFFECT_KEYS.has(k)) return err(we, `unbekannter Ereignis-Effekt ${fmt(k)}`);
        switch (k) {
          case 'bolts': case 'scrap': case 'blueprints': case 'maxHp': case 'maxFuel':
            if (!isInt(v) || v === 0) err(we, `${k} muss ganze Zahl ≠ 0 sein`);
            if (v < 0) risky = true;
            if (k === 'blueprints' && v < 0) err(we, 'Blaupausen können nicht abgezogen werden');
            break;
          case 'hpPct':
            if (!isNum(v) || v === 0 || v < -1 || v > 1) err(we, 'hpPct muss Anteil in [−1,1] ≠ 0 sein');
            if (v < 0) risky = true;
            break;
          case 'item':
            if (!isObj(v)) { err(we, 'item muss Objekt {rarity?, tag?} sein'); break; }
            for (const kk of Object.keys(v)) if (!['rarity', 'tag'].includes(kk)) err(we, `item: unbekanntes Feld ${kk}`);
            if (v.rarity !== undefined && !RARITIES.has(v.rarity)) err(we, `item.rarity ${fmt(v.rarity)} ungültig`);
            if (v.rarity === 'cursed') warn(we, `item {rarity:'cursed'} – dafür gibt es { curse: true }`);
            if (v.tag !== undefined && !TAG_SET.has(v.tag)) err(we, `item.tag ${fmt(v.tag)} ungültig`);
            break;
          case 'removeItem': case 'upgradeItem':
            if (v !== 'random' && v !== 'choose') err(we, `${k} muss 'random' oder 'choose' sein`);
            if (k === 'removeItem') risky = true;
            break;
          case 'curse': case 'removeCurse': case 'nothing':
            if (v !== true) err(we, `${k} muss true sein`);
            if (k === 'curse') risky = true;
            if (k === 'nothing' && oc.effects.length > 1) err(we, `nothing darf nicht mit anderen Effekten kombiniert werden`);
            break;
          case 'stage':
            if (v !== 'elite') err(we, `stage muss 'elite' sein`);
            risky = true;
            break;
          case 'cores':
            if (!isInt(v) || v < 1) err(we, 'cores muss ganze Zahl ≥ 1 sein');
            hasCores = true;
            coreP += isNum(oc.p) ? oc.p : 0;
            break;
          default:
        }
      });
    });
    if (Math.abs(sum - 1) > 1e-9) err(wo, `Wahrscheinlichkeiten summieren sich zu ${+sum.toFixed(6)} statt 1`);
    if (coreP > 0.1 + 1e-9) err(wo, `Kern-Chance ${coreP} > 10 %`);
    const isSafe = o.label === 'Weitergehen';
    if (isSafe) {
      safe++;
      if (o.cost !== undefined) err(wo, `„Weitergehen“ darf nichts kosten`);
      if (o.outcomes.length !== 1 || o.outcomes.some((oc) => !Array.isArray(oc.effects) || oc.effects.some((e) => !isObj(e) || !e.nothing))) err(wo, `„Weitergehen“ muss sicher sein (1 Ausgang, nur { nothing: true })`);
    } else if (!costs && !risky) warn(wo, 'Option ohne Kosten und ohne Risiko (Kopfkommentar: jede Option kostet etwas oder birgt ein Risiko)');
  });
  if (safe !== 1) err(w, `braucht genau eine sichere Option „Weitergehen“ (hat ${safe})`);
  if (hasCores) {
    coreEvents++;
    if (!Array.isArray(ev.acts) || ev.acts.some((a) => a !== 3)) err(w, `Kerne nur in Akt-3-Ereignissen (acts ist ${fmt(ev.acts)})`);
  }
}
if (coreEvents > 3) err('textEvents.js', `${coreEvents} Ereignisse vergeben Kerne, Kopfkommentar erlaubt nur die drei Akt-3-Ereignisse`);
for (const a of [1, 2, 3]) if (eventsPerAct[a] < 5) warn('textEvents.js', `nur ${eventsPerAct[a]} Ereignisse für Akt ${a}`);

// ═══════════════════════════════════ Schrottstufen ═══════════════════════════════════

{
  const seen = new Map();
  if (ASCENSION.length !== 15) err('ascension.js', `${ASCENSION.length} Stufen, erwartet 15`);
  ASCENSION.forEach((a, i) => {
    const w = `ascension.js › Stufe ${a?.level ?? '?'}`;
    if (!isObj(a)) return err(w, 'kein Objekt');
    checkKeys(w, a, ASCENSION_KEYS, 'Schrottstufe');
    if (a.level !== i + 1) err(w, `level ${a.level} an Position ${i + 1}`);
    checkText(w, a, 'name', MAX.name);
    checkText(w, a, 'desc', MAX.desc);
    if (!isObj(a.mods) || !Object.keys(a.mods).length) return err(w, 'mods fehlt oder leer');
    for (const [k, v] of Object.entries(a.mods)) {
      if (seen.has(k)) err(w, `mods.${k} schon in Stufe ${seen.get(k)} (jeder Schlüssel genau einmal)`);
      seen.set(k, a.level);
      if (typeof v === 'boolean') { if (!v) err(w, `mods.${k}: false hat keine Wirkung`); }
      else if (!isNum(v)) err(w, `mods.${k} muss Zahl oder true sein`);
      else if (/Mul$/.test(k) && v <= 0) err(w, `mods.${k} muss > 0 sein`);
    }
    const d = ASCENSION_DESIGN[a.level];
    if (d) {
      const [key, val] = d;
      if (!(key in a.mods)) err(w, `V2-DESIGN: Stufe ${a.level} = ${key} (mods hat ${Object.keys(a.mods).join(', ')})`);
      else if (val !== null && a.mods[key] !== val) err(w, `V2-DESIGN: ${key} = ${fmt(val)}, Daten ${fmt(a.mods[key])}`);
    }
  });
  const R = ASCENSION_REWARDS;
  if (!isObj(R)) err('ascension.js', 'ASCENSION_REWARDS fehlt');
  else {
    if (R.scrapPerLevel !== 0.1) err('ascension.js › ASCENSION_REWARDS', 'scrapPerLevel ≠ 0,1 (V2-DESIGN: +10 % Schrott je Stufe)');
    if (fmt(R.coreMilestones) !== fmt([5, 10, 15])) err('ascension.js › ASCENSION_REWARDS', 'coreMilestones ≠ [5,10,15]');
    if (R.coresPerMilestone !== 1) err('ascension.js › ASCENSION_REWARDS', 'coresPerMilestone ≠ 1');
  }
}

// ═══════════════════════════════════ Lackierungen ═══════════════════════════════════

{
  let lastScrap = 0;
  const kinds = { scrap: 0, cores: 0, asc: 0 };
  for (const p of PAINTS) {
    if (!isObj(p) || !isStr(p.id)) continue;
    const w = `cosmetics.js › ${p.id}`;
    checkKeys(w, p, PAINT_KEYS, 'Lackierung');
    if (!/^p_[a-z0-9_]+$/.test(p.id)) err(w, 'id muss mit p_ beginnen');
    checkText(w, p, 'name', MAX.name);
    checkText(w, p, 'flavor', MAX.flavor);
    if (!isObj(p.colors) || !HEX.test(p.colors.body || '') || !HEX.test(p.colors.accent || '')) err(w, 'colors {body, accent} müssen #rrggbb sein');
    else for (const k of Object.keys(p.colors)) if (!['body', 'accent'].includes(k)) err(w, `colors: unbekanntes Feld ${k}`);
    if (p.cost === null) {
      kinds.asc++;
      const m = /^ascension:(\d+)$/.exec(p.unlock || '');
      if (!m || +m[1] < 1 || +m[1] > 15) err(w, `unlock muss 'ascension:1..15' sein (${fmt(p.unlock)})`);
    } else if (!isObj(p.cost) || Object.keys(p.cost).length !== 1) err(w, 'cost muss {scrap} | {cores} | null sein');
    else if (p.cost.scrap !== undefined) {
      kinds.scrap++;
      if (!isInt(p.cost.scrap) || p.cost.scrap < 500 || p.cost.scrap > 20000) err(w, 'cost.scrap muss 500–20000 sein');
      else if (p.cost.scrap < lastScrap) err(w, 'Schrott-Preise nicht aufsteigend');
      else lastScrap = p.cost.scrap;
      if (p.unlock !== undefined) err(w, 'unlock nur bei Schrottstufen-Belohnungen');
    } else if (p.cost.cores !== undefined) {
      kinds.cores++;
      if (!isInt(p.cost.cores) || p.cost.cores < 1 || p.cost.cores > 3) err(w, 'cost.cores muss 1–3 sein');
      if (p.unlock !== undefined) err(w, 'unlock nur bei Schrottstufen-Belohnungen');
    } else err(w, 'cost muss {scrap} | {cores} | null sein');
  }
  if (kinds.scrap !== 16) err('cosmetics.js', `${kinds.scrap} Schrott-Lackierungen, Kopfkommentar sagt 16`);
  if (kinds.cores !== 4) err('cosmetics.js', `${kinds.cores} Kern-Lackierungen, Kopfkommentar sagt 4`);
  if (kinds.asc !== 4) err('cosmetics.js', `${kinds.asc} Schrottstufen-Lackierungen, Kopfkommentar sagt 4`);
}

// ═══════════════════════════════════ Querprüfungen ═══════════════════════════════════

// Chassis-starterTag braucht Base-Items (oben gezählt)
for (const c of CHASSIS) if (isObj(c) && TAG_SET.has(c.starterTag) && !baseByTag[c.starterTag]) err(`chassis.js › ${c.id}`, `starterTag ${c.starterTag} hat kein 'base'-Item`);

// charge-Schlüssel kollidieren zwischen Quellen?
for (const [key, srcs] of chargeKeys) if (srcs.size > 1) err(`charge.key ${fmt(key)}`, `wird von mehreren Quellen benutzt (${[...srcs].join(', ')}) – Zähler würden sich vermischen`);

// Regeln ohne ruleSpec
for (const u of ruleUses) {
  if (u.hasLocalSpec) continue;
  const elsewhere = ruleSpecRegistry.get(u.rule);
  if (BASE_RULES.has(u.rule) && elsewhere) warn(u.where, `Regel ohne eigene ruleSpec – nutzt die Spezifikation aus ${elsewhere[0].where.split(' › ruleSpec')[0]}`);
  else err(u.where, `Regel ${u.rule} ohne ruleSpec`);
}
// gleiche Regel mehrfach, unterschiedlich spezifiziert
for (const [rule, specs] of ruleSpecRegistry) {
  if (specs.length > 1 && new Set(specs.map((s) => s.text)).size > 1) warn(`Regel ${rule}`, `mehrfach unterschiedlich spezifiziert: ${specs.map((s) => s.where.split(' › ruleSpec')[0]).join(' | ')}`);
}

// Ketten ohne Limit (Endlosschleife bis Kettentiefe 8)
{
  const produced = (list, out = []) => {
    for (const fx of list || []) {
      if (!isObj(fx)) continue;
      if (fx.fx === 'emit' && ALL_EVENTS[fx.event]) out.push({ ev: fx.event, data: fx.data || {} });
      else if (fx.fx === 'boost') out.push({ ev: 'boost', data: { free: true } });
      else if (fx.fx === 'explosion') out.push({ ev: 'explosion', data: {} });
      else if (fx.fx === 'heal') out.push({ ev: 'heal', data: {} });
      else if (fx.fx === 'selfDamage') out.push({ ev: 'damage', data: { source: 'self' } });
      else if (fx.fx === 'chance') produced(fx.then, out);
      else if (fx.fx === 'charge' && isNum(fx.n) && isNum(fx.at) && fx.at <= fx.n) produced(fx.then, out); // at > n bricht Einzelketten
    }
    return out;
  };
  const matches = (trig, prod) => {
    const c = trig.if || {};
    if (c.free !== undefined && prod.data.free !== undefined && c.free !== prod.data.free) return false;
    if (c.free === true && prod.ev === 'boost' && prod.data.free === undefined) return false;
    if (c.source !== undefined && prod.data.source !== undefined && c.source !== prod.data.source) return false;
    if (c.kind !== undefined && prod.data.kind !== undefined && c.kind !== prod.data.kind) return false;
    return true;
  };
  const edges = new Map(); // ev → [{ to, src, where }]
  for (const { sourceId, where, trig } of triggerSources) {
    if (!isObj(trig) || !ALL_EVENTS[trig.on]) continue;
    const lim = trig.limit || {};
    if (lim.cooldown || lim.perStage || lim.perRun) continue;
    for (const prod of produced(trig.do)) {
      if (!matches(trig, prod)) continue;
      if (!edges.has(trig.on)) edges.set(trig.on, []);
      edges.get(trig.on).push({ to: prod.ev, src: sourceId, where });
    }
  }
  const found = new Set();
  const dfs = (start, ev, path, seenEv) => {
    for (const e of edges.get(ev) || []) {
      const p = [...path, e];
      if (e.to === start) {
        const key = p.map((x) => x.where).sort().join('|');
        if (!found.has(key)) {
          found.add(key);
          err(p[0].where, `Kette ohne Limit: ${[start, ...p.map((x) => `${x.to} (${x.src})`)].join(' → ')} – läuft bis Kettentiefe 8 (cooldown/perStage fehlt)`);
        }
      } else if (!seenEv.has(e.to)) dfs(start, e.to, p, new Set([...seenEv, e.to]));
    }
  };
  for (const ev of edges.keys()) dfs(ev, ev, [], new Set([ev]));
}

// Doppelte Namen (Kompendium, Garage, Labor: Namen müssen eindeutig sein)
{
  const names = new Map(); // name → [wo]
  const add = (name, w) => {
    if (!isStr(name)) return;
    const k = name.trim().toLowerCase();
    if (!names.has(k)) names.set(k, []);
    names.get(k).push(w);
  };
  for (const { item, file } of ITEMS) if (isObj(item)) add(item.name, `${file} › ${item.id}`);
  for (const c of CHASSIS) if (isObj(c)) add(c.name, `chassis.js › ${c.id}`);
  for (const p of PARTS) if (isObj(p)) add(p.name, `parts.js › ${p.id}`);
  for (const a of ABILITIES) if (isObj(a)) add(a.name, `abilities.js › ${a.id}`);
  for (const [t, { def, file }] of Object.entries(TAGS)) if (isObj(def)) add(def.name, `${file} › TAGS.${t}`);
  for (const [, ws] of names) if (ws.length > 1) err(ws[0], `Name doppelt vergeben (auch: ${ws.slice(1).join(', ')})`);
  const rnames = new Map();
  for (const r of RESEARCH) if (isObj(r) && isStr(r.name)) {
    const k = r.name.trim().toLowerCase();
    if (rnames.has(k)) err(`research.js › ${r.id}`, `Forschungsname doppelt (auch ${rnames.get(k)})`);
    else rnames.set(k, r.id);
  }
  // Fähigkeitsnamen dürfen nicht wie ein Set-Bonus heißen (Set-desc beginnt mit „Name:“)
  for (const a of ABILITIES) {
    if (!isObj(a) || !isStr(a.name)) continue;
    for (const [t, { def, file }] of Object.entries(TAGS)) for (const L of SET_LEVELS) {
      const d = def?.sets?.[L]?.desc;
      if (isStr(d) && d.startsWith(`${a.name}:`)) err(`${file} › TAGS.${t} › sets.${L}`, `Set-Bonus heißt wie die Fähigkeit ${a.id} („${a.name}“)`);
    }
  }
}

// Symbole: Items untereinander eindeutig (HUD lässt das Item-Symbol hüpfen), keine Währungs-/Kartensymbole
{
  const nodeIcons = new Map(Object.entries(NODE_TYPES).filter(([, n]) => isObj(n) && isStr(n.icon)).map(([id, n]) => [n.icon, id]));
  const itemIcons = new Map();
  for (const { item, file } of ITEMS) {
    if (!isObj(item) || !isStr(item.icon)) continue;
    const w = `${file} › ${item.id}`;
    if (itemIcons.has(item.icon)) warn(w, `Symbol ${item.icon} hat schon ${itemIcons.get(item.icon)} (im HUD nicht unterscheidbar)`);
    else itemIcons.set(item.icon, item.id);
    if (CURRENCY_ICONS.has(item.icon)) warn(w, `Symbol ${item.icon} ist ein Währungssymbol`);
    if (nodeIcons.has(item.icon)) warn(w, `Symbol ${item.icon} ist das Symbol des Kartenknotens ${nodeIcons.get(item.icon)}`);
  }
  for (const [t, { def, file }] of Object.entries(TAGS)) if (isObj(def) && CURRENCY_ICONS.has(def.icon)) warn(`${file} › TAGS.${t}`, `Tag-Symbol ${def.icon} ist ein Währungssymbol`);
  for (const [list, f] of [[CHASSIS, 'chassis.js'], [PARTS, 'parts.js'], [ABILITIES, 'abilities.js']]) {
    for (const x of list) if (isObj(x) && CURRENCY_ICONS.has(x.icon)) warn(`${f} › ${x.id}`, `Symbol ${x.icon} ist ein Währungssymbol`);
  }
}

// Jeder Tag braucht ein Tag-Teil (sonst ist Set 6 mit der Badewanne, 5 Item-Slots, unerreichbar)
for (const t of TAG_IDS) if (!PARTS.some((p) => isObj(p) && p.tag === t)) warn(`parts.js`, `kein Garage-Teil mit tag ${fmt(t)} – Set 6 braucht dann 6 Item-Slots (Badewanne hat 5)`);

// Mehrdeutige Platzhalter: eine Sammelwarnung (Regel oben bei checkPlaceholders)
if (ambiguousPlaceholders.length) {
  warn('Platzhalter', `${ambiguousPlaceholders.length} Texte nutzen einen Platzhalter mit mehreren Werten – angezeigt wird der erste Wert, die übrigen stehen fest im Text: ${ambiguousPlaceholders.map((a) => `${a.where.split(' › ').pop()} {${a.key}} ${a.vals.join('/')}`).join('; ')}`);
}

// ═══════════════════════════════════ Ausgabe ═══════════════════════════════════

const stats = {
  dateien: files.length,
  items: itemById.size,
  legendaer: nLegend,
  verflucht: nCursed,
  itemsJeTag: countByTag,
  tags: Object.keys(TAGS).length,
  chassis: CHASSIS.length,
  teile: PARTS.length,
  faehigkeiten: ABILITIES.length,
  forschung: RESEARCH.length,
  ereignisse: TEXT_EVENTS.length,
  lackierungen: PAINTS.length,
};

if (JSON_OUT) {
  console.log(JSON.stringify({ errors, warnings: QUIET ? [] : warnings, stats }, null, 2));
} else {
  const line = (x) => `  ${x.where}: ${x.msg}`;
  console.log(`Schleuderwerk 2 – Inhaltsprüfung (${DIR})`);
  console.log(`  ${stats.dateien} Dateien · ${stats.items} Items (${stats.legendaer} Legendär, ${stats.verflucht} Fluch) · ${stats.tags} Tags · ${stats.chassis} Chassis · ${stats.teile} Teile · ${stats.faehigkeiten} Fähigkeiten · ${stats.forschung} Forschung · ${stats.ereignisse} Ereignisse · ${stats.lackierungen} Lackierungen`);
  console.log(`  Items je Primär-Tag: ${TAG_IDS.map((t) => `${t} ${countByTag[t]}`).join(', ')}`);
  if (!QUIET && warnings.length) {
    console.log(`\nWARNUNGEN (${warnings.length}):`);
    for (const x of warnings) console.log(line(x));
  }
  if (errors.length) {
    console.log(`\nFEHLER (${errors.length}):`);
    for (const x of errors) console.log(line(x));
  } else console.log('\nKeine Fehler.');
}
process.exitCode = errors.length ? 1 : 0;
