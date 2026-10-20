// Paket C – Einzelmessung: Wie weit trägt jedes Item allein (★1, gutes Loadout, Akt 2+3 Etage 3)?
// Ergebnis je Item: Median Weite ÷ Weite ohne Items (gleiche Strecken/Seeds). Findet Ausreißer für die Tag-Balance.
// Aufruf: node tools/playtest/item-solo.mjs [--n 10] [--tags magnet,schrott] [--top 25]
import { BIOMES } from '../../www/src/data/biomes.js';
import { ITEMS } from '../../www/src/data/items.js';
import { generateStageSpec } from '../../www/src/physics/trackGen.js';
import { makeRng } from '../../www/src/core/rng.js';
import { simSave, makeSimStage, playStage } from '../sim/bot.mjs';
import { wantsTricks } from '../sim/items.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const N = Number(opt('n', 10));
const TAGS = opt('tags', null) ? String(opt('tags')).split(',') : null;
const SAVE = simSave('gut');
const med = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function play(biome, ids, i) {
  const spec = generateStageSpec({ biome, kind: 'stage', floor: 3, rng: makeRng(`solo:${biome.id}:${i}`) });
  const inv = ids.length ? ids.map((itemId) => ({ itemId, tier: 1 })) : null;
  const sim = makeSimStage({ spec, biome, save: SAVE, seed: 6000 + i, inventory: inv, runInfo: { bolts: 40, counters: {} } });
  const r = playStage(sim.stage, () => sim.result, { seed: 13 * i + 5, tricks: wantsTricks(inv) });
  return r.dist;
}

const cells = [];
for (const b of BIOMES.filter((x) => x.act >= 2)) for (let i = 0; i < N; i++) cells.push([b, i]);
const base = cells.map(([b, i]) => play(b, [], i));
const rows = [];
for (const it of ITEMS.filter((x) => x.rarity !== 'cursed' && (!TAGS || x.tags.some((t) => TAGS.includes(t))))) {
  const ratios = cells.map(([b, i], k) => play(b, [it.id], i) / base[k]);
  rows.push({ id: it.id, tag: it.tags.join('+'), rarity: it.rarity, pool: it.pool, r: med(ratios) });
}
rows.sort((a, b) => b.r - a.r);
const top = Number(opt('top', rows.length));
for (const r of rows.slice(0, top)) console.log(`${r.r.toFixed(2)}  ${r.id.padEnd(34)} ${r.tag.padEnd(16)} ${r.rarity.padEnd(9)} ${r.pool}`);
const byTag = {};
for (const r of rows) { const t = r.tag.split('+')[0]; (byTag[t] ||= []).push(r.r); }
console.log('Median je Tag:', Object.entries(byTag).map(([t, v]) => `${t} ${med(v).toFixed(2)}`).join(' · '));
