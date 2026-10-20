// Paket E – Tagesstrecke: ein Run mit festem Seed aus dem Datum (gleiche Karte für alle an diesem Tag) und einem
// Tages-Mutator auf allen Etappen außer Bossen. Belohnung einmal je Tag (Blaupause), Serie über Tage (alle
// DAILY.streakCore Tage ein Kern), Teilen-Code am Run-Ende. Reine Logik; Spielstand: save.daily =
// { last: 'JJJJMMTT' | null, streak, best: { 'JJJJMMTT': { act, won } } }.
import { MUTATORS } from '../data/mutators.js';
import { makeRng, hashSeed } from '../core/rng.js';

export const DAILY = { blueprints: 1, streakCore: 7, keepDays: 14 };

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const pad = (n) => String(n).padStart(2, '0');

// Tages-Schlüssel 'JJJJMMTT' (lokale Zeit)
export const dayKey = (date = new Date()) => `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
// Vortag eines Schlüssels
export function prevKey(key) {
  const d = new Date(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8)));
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}

// Seed und Tages-Mutator (deterministisch aus dem Schlüssel)
export const dailySeed = (key) => hashSeed(`tagesstrecke:${key}`) >>> 0;
export function dailyMutator(key) {
  const list = MUTATORS.filter((m) => !m.eliteOnly);
  return makeRng(hashSeed(`tagesmutator:${key}`)).pick(list).id;
}

export function dailyState(save) {
  if (!isObj(save.daily)) save.daily = {};
  const d = save.daily;
  d.last = typeof d.last === 'string' && /^\d{8}$/.test(d.last) ? d.last : null;
  d.streak = Math.max(0, Math.floor(Number(d.streak) || 0));
  if (!isObj(d.best)) d.best = {};
  for (const k of Object.keys(d.best)) if (!/^\d{8}$/.test(k) || !isObj(d.best[k])) delete d.best[k];
  // nur die letzten keepDays Tage merken
  const keys = Object.keys(d.best).sort();
  while (keys.length > DAILY.keepDays) delete d.best[keys.shift()];
  return d;
}

// Für die Garage: { key, mutator, done (heute schon belohnt), streak (zählt nur, wenn gestern/heute gespielt) }
export function dailyInfo(save, date = new Date()) {
  const d = dailyState(save);
  const key = dayKey(date);
  const alive = d.last === key || d.last === prevKey(key);
  return { key, mutator: dailyMutator(key), done: d.last === key, streak: alive ? d.streak : 0, best: d.best[key] || null };
}

// Run-Ende einer Tagesstrecke: Bestwert merken; erste Runde des Tages belohnen und Serie fortsetzen.
// Ergebnis: { key, first, streak, reward: { blueprints, cores }, code }
export function finishDaily(save, run, won) {
  const d = dailyState(save);
  const key = run.daily.key;
  const act = won ? 4 : run.act;
  const best = d.best[key];
  if (!best || act > best.act) d.best[key] = { act, won: !!won };
  const first = d.last !== key;
  const reward = {};
  if (first) {
    d.streak = d.last === prevKey(key) ? d.streak + 1 : 1;
    d.last = key;
    reward.blueprints = DAILY.blueprints;
    if (d.streak % DAILY.streakCore === 0) reward.cores = 1;
    for (const k of Object.keys(reward)) save.meta[k] = (save.meta[k] || 0) + reward[k];
  }
  const dist = Math.round((run.stats && run.stats.dist) || 0);
  return { key, first, streak: d.streak, reward, code: `SW-T-${key}-${won ? 'SIEG' : `A${run.act}`}-${dist}m` };
}
