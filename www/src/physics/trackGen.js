// Etappen-Spezifikation (StageSpec) aus Biom, Knotenart und Etage – deterministisch per Zufall mit Seed.
// Reine Logik ohne three.js und DOM. physics/track.js baut daraus die Höhenlinie, physics/objects.js die Objekte.
//
// generateStageSpec({ biome, kind: 'stage'|'elite'|'boss', floor, act, rng, bossId, mods }) →
//   { biome, kind, floor, act, bossId, boss, seed, difficulty, target, medals: {bronze, silver?, gold}, medalList,
//     length, features: [{ type, x0, x1, … }], hazards: [type…], weather: {…}, blueprintX }
// Bausteine (features) überlappen sich nie ([x0, x1] = ganzer Platzbedarf inkl. Übergängen), die ersten
// FEATURES.firstFree Meter bleiben frei. Alle Positionen liegen auf dem 2-m-Raster der Strecke (TRACK.step).
import { FEATURES as F, TRACK, PICKUPS, ASCENSION_RULES as AR, REWARDS } from '../data/balance.js';
import { FEATURE_DEFAULTS, FEATURE_INFO, biomeById } from '../data/biomes.js';
import { clamp, lerp, DEG } from '../core/math.js';

const STEP = TRACK.step;
const snap = (x) => Math.round(x / STEP) * STEP;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// Parameter eines Bausteins: Standard ← Biom ← Boss
export function featureParams(biome, type, boss = null) {
  const out = { ...(FEATURE_DEFAULTS[type] || {}) };
  const b = biome.features && biome.features.params && biome.features.params[type];
  if (isObj(b)) Object.assign(out, b);
  const bp = boss && boss.params && boss.params[type];
  if (isObj(bp)) Object.assign(out, bp);
  return out;
}

// Wert aus [leicht, schwer] nach Schwierigkeit d (0…1) mit etwas Streuung
function pickRange(v, d, r, jitter = 0.18) {
  if (!Array.isArray(v)) return v;
  const t = clamp(d + r.range(-jitter, jitter), 0, 1);
  return lerp(v[0], v[1], t);
}

// Schwierigkeit 0…1: Etage / letzte Etage, Elite + FEATURES.eliteDifficulty, Boss immer FEATURES.bossDifficulty
export function difficultyOf(kind, floor, floors = 6) {
  if (kind === 'boss') return F.bossDifficulty;
  const d = floors > 1 ? clamp(floor, 0, floors - 1) / (floors - 1) : 0;
  return clamp(d + (kind === 'elite' ? F.eliteDifficulty : 0), 0, 1);
}

// Zielmarke (Bronze) in Metern. mods (Schrottstufen): targetMul, bossTargetMul
export function stageTarget(biome, kind, floor, mods = {}) {
  const t = biome.targets;
  let target;
  if (kind === 'boss') target = t.boss * (mods.bossTargetMul || 1);
  else {
    target = t.stage[clamp(floor | 0, 0, t.stage.length - 1)];
    if (kind === 'elite') target *= t.eliteMult;
  }
  target *= mods.targetMul || 1;
  return Math.round(target / 5) * 5;
}

// Medaillen-Marken. Boss-Strecken kennen nur Bronze (= geschafft) und Gold (Bonus).
// Paket A: dazu die Überweite-Marken Platin (Gold × 1,5) und Schrottkönig (Gold × 2) – sie stehen in medals, aber nicht
// in medalList (die Medaille selbst bleibt Gold; die Wertung gradeFor zählt für die Belohnung).
export function stageMedals(biome, kind, target) {
  const m = biome.medals;
  const medals = { bronze: target, gold: Math.round(target * m.gold) };
  if (kind !== 'boss') medals.silver = Math.round(target * m.silver);
  medals.platin = Math.round(medals.gold * REWARDS.gradeMarks.platin);
  medals.king = Math.round(medals.gold * REWARDS.gradeMarks.king);
  const medalList = kind === 'boss' ? ['bronze', 'gold'] : ['bronze', 'silver', 'gold'];
  return { medals, medalList };
}

// Wertung einer Distanz: 'king' | 'platin' | 'gold' | 'silver' | 'bronze' | 'miss' (Belohnung REWARDS.gradeMul)
export const GRADES = ['miss', 'bronze', 'silver', 'gold', 'platin', 'king'];
export function gradeFor(dist, medals) {
  const m = medalFor(dist, medals);
  if (!m) return 'miss';
  if (m === 'gold' && medals.king !== undefined && dist >= medals.king) return 'king';
  if (m === 'gold' && medals.platin !== undefined && dist >= medals.platin) return 'platin';
  return m;
}

// Medaille für eine Distanz (oder null)
export function medalFor(dist, medals) {
  if (!medals) return null;
  if (dist >= medals.gold) return 'gold';
  if (medals.silver !== undefined && dist >= medals.silver) return 'silver';
  if (dist >= medals.bronze) return 'bronze';
  return null;
}

// ---------- einzelne Bausteine ----------
// Jeder Builder bekommt den Anfang x0 und den verfügbaren Platz `room` und liefert den Baustein
// (x1 = Ende des gesamten Platzbedarfs) oder null, wenn er nicht hineinpasst.
const BUILDERS = {
  hills(x0, room, p, d, r) {
    const len = snap(Math.min(room, pickRange(p.len, d, r)));
    if (len < 30) return null;
    return { type: 'hills', x0, x1: x0 + len, amp: pickRange(p.amp, d, r), humps: Math.round(pickRange(p.humps, d, r)) };
  },
  ramp(x0, room, p, d, r) {
    const h = pickRange(p.h, d, r);
    const ang = pickRange(p.angleDeg, d, r) * DEG;
    const L = Math.max(4, snap(h / Math.tan(ang)));
    const rs = x0 + STEP;
    const lip = rs + L;
    const x1 = lip + snap(p.landing);
    if (x1 - x0 > room) return null;
    return { type: 'ramp', x0, x1, rs, lip, h };
  },
  gap(x0, room, p, d, r) {
    const width = snap(pickRange(p.width, d, r));
    const h = pickRange(p.rampH, d, r);
    const ang = pickRange(p.rampAngleDeg, d, r) * DEG;
    const L = Math.max(4, snap(h / Math.tan(ang)));
    const B = snap(F.blend);
    const rs = x0 + B + snap(p.runup || 0);
    const edge = rs + L;
    const far = edge + width;
    const x1 = far + B;
    if (x1 - x0 > room) return null;
    return { type: 'gap', x0, x1, rs, edge, far, width, h, depth: p.depth };
  },
  mud(x0, room, p, d, r) {
    const len = snap(Math.min(room, pickRange(p.len, d, r)));
    if (len < 10) return null;
    return { type: 'mud', x0, x1: x0 + len, friction: p.friction };
  },
  sand(x0, room, p, d, r) {
    const len = snap(Math.min(room, pickRange(p.len, d, r)));
    if (len < 12) return null;
    return { type: 'sand', x0, x1: x0 + len, friction: p.friction };
  },
  loop(x0, room, p) {
    const B = snap(F.blend), flat = snap(F.loop.flat);
    const len = 2 * (B + flat);
    if (len > room) return null;
    return { type: 'loop', x0, x1: x0 + len, lx: x0 + B + flat, r: p.r };
  },
  scrapPile(x0, room, p, d, r) {
    const n = Math.round(pickRange(p.n, d, r));
    const spacing = pickRange(p.spacing, d, r);
    const piles = [];
    let x = x0 + 6 + p.w / 2;
    for (let i = 0; i < n; i++) {
      piles.push({ x, h: pickRange(p.h, d, r), w: p.w });
      x += spacing;
    }
    const x1 = snap(piles[piles.length - 1].x + p.w / 2 + 6 + 1);
    if (x1 - x0 > room) return null;
    return { type: 'scrapPile', x0, x1, piles };
  },
  crusher(x0, room, p, d, r) {
    const B = snap(F.blend), flat = snap(F.crusher.flat);
    const len = 2 * (B + flat);
    if (len > room) return null;
    return {
      type: 'crusher', x0, x1: x0 + len, cx: x0 + B + flat, w: p.w,
      period: pickRange(p.period, d, r), open: pickRange(p.open, d, r), phase: r.next(),
    };
  },
  wind(x0, room, p, d, r) {
    const len = snap(Math.min(room, pickRange(p.len, d, r)));
    if (len < 30) return null;
    const sign = r.chance(0.5) ? 1 : -1;
    return { type: 'wind', x0, x1: x0 + len, wind: sign * pickRange(p.wind, d, r), gust: pickRange(p.gust, d, r), phase: r.next() * 10 };
  },
  thermal(x0, room, p, d, r) {
    const w = pickRange(p.w, d, r);
    const len = snap(w + 12);
    if (len > room) return null;
    return { type: 'thermal', x0, x1: x0 + len, x: x0 + len / 2, w, strength: p.strength, top: p.top };
  },
  heatZone(x0, room, p, d, r) {
    const len = snap(Math.min(room, pickRange(p.len, d, r)));
    if (len < 24) return null;
    return { type: 'heatZone', x0, x1: x0 + len, heat: pickRange(p.heat, d, r) };
  },
  lightning(x0, room, p, d, r) {
    const len = snap(Math.min(room, pickRange(p.len, d, r)));
    if (len < 30) return null;
    // every: Abstand der Einschläge [min, max] s (Boss Blitzallee: dichter), sonst FEATURES.lightning.every
    const f = { type: 'lightning', x0, x1: x0 + len, seed: r.int(1, 2 ** 30) };
    if (Array.isArray(p.every)) f.every = [...p.every];
    return f;
  },
  magnetZone(x0, room, p, d, r) {
    const len = snap(Math.min(room, pickRange(p.len, d, r)));
    if (len < 30) return null;
    return { type: 'magnetZone', x0, x1: x0 + len, phase: r.next() };
  },
};

export const FEATURE_TYPES = Object.keys(BUILDERS);

// Baustein bauen (null, wenn er nicht in `room` passt)
export function buildFeature(type, biome, x0, room, d, r, boss = null) {
  const b = BUILDERS[type];
  if (!b) return null;
  return b(snap(x0), room, featureParams(biome, type, boss), d, r);
}

// Erlaubte Bausteine einer Etage mit Gewicht (Elite: gefährliche × 1,4, mit Schrottstufe 12 „Elite-Gemeinheiten“
// zusätzlich × ASCENSION_RULES.eliteDangerMul)
function featureWeights(biome, kind, floor, mods = {}) {
  const fs = biome.features;
  const out = [];
  for (const [type, w] of Object.entries(fs.weights || {})) {
    if (!(w > 0) || !BUILDERS[type]) continue;
    const minF = (fs.minFloor && fs.minFloor[type]) || 0;
    if (floor + (kind === 'elite' ? 1 : 0) < minF) continue;
    const danger = FEATURE_INFO[type] && FEATURE_INFO[type].danger;
    const hard = kind === 'elite' && danger ? 1.4 * (mods.eliteHazards ? AR.eliteDangerMul : 1) : 1;
    out.push([type, w * hard]);
  }
  return out;
}

export function generateStageSpec({ biome, kind = 'stage', floor = 0, act = null, rng, bossId = null, mods = {} }) {
  const bio = typeof biome === 'string' ? biomeById(biome) : biome;
  if (!bio) throw new Error(`Unbekanntes Biom ${biome}`);
  if (!rng) throw new Error('generateStageSpec braucht rng');
  const seed = rng.fork('track').seed;
  const r = rng.fork('features');
  const boss = kind === 'boss' ? (bio.bosses.find((b) => b.id === bossId) || bio.bosses[0]) : null;
  const d = difficultyOf(kind, floor);
  const target = stageTarget(bio, kind, floor, mods);
  const { medals, medalList } = stageMedals(bio, kind, target);
  const regionEnd = Math.round(medals.gold * F.regionGoldMul);
  const span = regionEnd - F.firstFree;

  // Anzahl der Bausteine
  let types;
  if (boss) types = [...boss.sequence];
  else {
    const c = bio.features.count;
    let n = Math.round(c[0] + c[1] * floor + (kind === 'elite' ? F.eliteExtra : 0) + (mods.eliteHazards && kind === 'elite' ? AR.eliteHazardExtra : 0));
    n = Math.max(1, Math.min(n, Math.floor(span / F.minSlot)));
    const weights = featureWeights(bio, kind, floor, mods);
    types = [];
    for (let i = 0; i < n; i++) {
      let t = r.weighted(weights);
      if (i > 0 && t === types[i - 1] && weights.length > 1) t = r.weighted(weights);   // selten zweimal dasselbe
      types.push(t);
    }
  }

  // Bausteine gleichmäßig auf Fächer verteilen (keine Überlappung), Lage im Fach zufällig
  const n = types.length;
  const slotW = span / n;
  const features = [];
  let prevEnd = F.firstFree;
  for (let i = 0; i < n; i++) {
    const slot0 = Math.max(prevEnd, F.firstFree + i * slotW);
    const slotEnd = F.firstFree + (i + 1) * slotW;
    const room = Math.floor(slotEnd - slot0 - F.slotPad);
    if (room < 20) continue;
    let f = buildFeature(types[i], bio, slot0, room, d, r, boss);
    if (!f && types[i] !== 'ramp') f = buildFeature('ramp', bio, slot0, room, d, r, boss);
    if (!f) continue;
    // im Fach verschieben (auf dem 2-m-Raster), ohne den Nachbarn zu nahe zu kommen
    const len = f.x1 - f.x0;
    const free = Math.floor((room - len) / STEP);
    if (free > 0) shiftFeature(f, r.int(0, free) * STEP);
    if (f.x0 < slot0) shiftFeature(f, snap(slot0 + STEP) - f.x0);
    features.push(f);
    prevEnd = f.x1 + F.slotPad;
  }

  // Wetter (Boss kann eines vorgeben)
  const wr = rng.fork('weather');
  const list = bio.weather && bio.weather.length ? bio.weather : [{ name: 'Windstill', icon: '☀️', weight: 1, wind: [0, 0] }];
  const forced = boss && boss.weather ? list.find((w) => w.name === boss.weather) : null;
  const wx = forced || wr.weighted(list);
  const weather = { name: wx.name, icon: wx.icon, wind: [...wx.wind], gust: wx.gust || 0, rain: !!wx.rain, base: wr.range(wx.wind[0], wx.wind[1]), phase: wr.next() * 10 };
  // Schrottstufe 12: Elite-Etappen bekommen zusätzliche Böen
  if (mods.eliteHazards && kind === 'elite') weather.gust += AR.eliteGust;

  // Gefahren für das Etappen-Intro (Reihenfolge des ersten Auftretens)
  const hazards = [];
  for (const f of features) if (!hazards.includes(f.type)) hazards.push(f.type);

  // Elite: manchmal liegt eine Blaupause in der Strecke
  const pr = rng.fork('pickups');
  const blueprintX = kind === 'elite' && pr.chance(PICKUPS.blueprintChance) ? snap(pr.range(target * 0.45, target * 0.9)) : null;

  return {
    v: 1,
    biome: bio.id,
    act: act ?? bio.act,
    kind,
    floor,
    bossId: boss ? boss.id : null,
    bossName: boss ? boss.name : null,
    seed,
    difficulty: d,
    target,
    medals,
    medalList,
    length: regionEnd,
    features,
    hazards,
    weather,
    blueprintX,
  };
}

// Baustein um dx verschieben (alle x-Werte)
const X_KEYS = ['x0', 'x1', 'rs', 'lip', 'edge', 'far', 'lx', 'cx', 'x'];
export function shiftFeature(f, dx) {
  if (!dx) return f;
  for (const k of X_KEYS) if (typeof f[k] === 'number') f[k] += dx;
  if (f.piles) for (const p of f.piles) p.x += dx;
  return f;
}
