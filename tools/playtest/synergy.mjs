// Playtest-Analyse 2: Wie stark sind Synergien wirklich – und wie oft kommt man im echten Run überhaupt dahin?
//  A) Tag-Konzentration: je Tag k = 0/2/3/4/5/6 Items dieses Tags (+ 6 − k zufällige Items anderer Tags, ★1), gutes
//     Loadout, Akt 2 + 3, Etage 3. Gemessen: Weite ÷ Ziel, Erfolgsquote, Auslösungen, Gratis-Boosts, Ketten (Paket C:
//     gezählte Ketten ≥ SYNERGY.chain.minLinks Glieder, result.chains), Zeit nach Gold (Weite ohne Belohnung).
//     Paket C: Set-Stufen 2/3/5, Tag-Stärke +10 % je Item.
//  B) Echte Runs (Run-Logik + Bot, Synergie-Auswahl wie tools/sim/items.mjs, dazu Händler/Schatz/Werkbank) mit drei
//     Forschungsständen: neuer Spielstand (Grundpool), „Spieler nach 38 min“ (5 billige Wurzel-Forschungen), alles
//     erforscht. Gemessen: stärkster Tag am Ende je Akt, erreichte Set-Stufe, Anteil Angebote mit Item des stärksten
//     Tags, echte Entscheidungen je Run (Karte mit ≥ 2 verschiedenen Knotenarten, Item-Auswahl mit Tag-Konflikt).
//     Paket C: Bauplan-Start, Set 3/Set 5 erreicht, Ketten je Etappe (alle bzw. Etappen mit ≥ 4 Items des Haupt-Tags),
//     Vergleich Synergie-Auswahl gegen zufällige Auswahl (Weite ÷ Ziel je Etappe, Sieg).
// Aufruf: node tools/playtest/synergy.mjs [--n 12] [--runs 24] [--tags feuer,eis] [--ks 0,2,4] [--only conc|runs] [--json <Datei>]
import fs from 'node:fs';
import { BIOMES, biomeForAct } from '../../www/src/data/biomes.js';
import { ITEMS, itemById } from '../../www/src/data/items.js';
import { TAGS } from '../../www/src/data/tags.js';
import { generateStageSpec } from '../../www/src/physics/trackGen.js';
import { makeRng, hashSeed } from '../../www/src/core/rng.js';
import { simSave, makeSimStage, playStage } from '../sim/bot.mjs';
import { wantsTricks } from '../sim/items.mjs';
import * as RS from '../../www/src/run/runState.js';
import { Stage } from '../../www/src/stage/stage.js';
import { Track } from '../../www/src/physics/track.js';
import { chooseStation } from '../../www/src/shops/gasStation.js';
import * as Dealer from '../../www/src/shops/scrapDealer.js';
import * as Workbench from '../../www/src/shops/workbench.js';
import * as Treasure from '../../www/src/shops/treasure.js';
import { entryParts } from '../../www/src/items/inventory.js';
import { ITEMS as BAL } from '../../www/src/data/balance.js';
import { itemPool } from '../../www/src/run/rewards.js';
import { recipeHints } from '../../www/src/items/recipes.js';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const N = Number(opt('n', 12));
const NRUNS = Number(opt('runs', 24));
const KS = String(opt('ks', '0,2,3,4,5,6')).split(',').map(Number);
const ONLY = opt('only', null);
const med = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const pct = (x) => `${Math.round(x * 100)} %`;
const f2 = (x) => x.toFixed(2);
const TAG_IDS = opt('tags', null) ? String(opt('tags')).split(',') : Object.keys(TAGS);
const NONCURSED = ITEMS.filter((i) => i.rarity !== 'cursed');
const SAVE = simSave('gut');

// ---------- A) Tag-Konzentration ----------
function playOne(biome, ids, i, salt) {
  const spec = generateStageSpec({ biome, kind: 'stage', floor: 3, rng: makeRng(`syn:${biome.id}:${i}`) });
  const inv = ids.length ? ids.map((itemId) => ({ itemId, tier: 1 })) : null;
  const sim = makeSimStage({ spec, biome, save: SAVE, seed: 5000 + i, inventory: inv, runInfo: { bolts: 40, counters: {} } });
  const st = sim.stage;
  let frames = 0, afterGold = 0, freeBoosts = 0;
  st.onEvent = (name, data) => { if (name === 'boost' && data && data.free) freeBoosts++; };
  const up = st.update.bind(st);
  st.update = (dt, input) => { up(dt, input); if (st.phase === 'fly') { frames++; if (st.vehicle.maxX >= st.medals.gold) afterGold++; } };
  const r = playStage(st, () => sim.result, { seed: 17 * i + salt, tricks: wantsTricks(inv) });
  return { ratio: r.dist / r.target, cleared: !!r.medal, gold: r.medal === 'gold', triggers: r.itemTriggers, freeBoosts, chains: r.chains || 0, chainBolts: r.chainBolts || 0, real: frames / 60, afterGold: afterGold / 60, far: r.reason === 'far' };
}

function concentration() {
  const out = {};
  for (const tag of TAG_IDS) {
    const own = NONCURSED.filter((i) => i.tags.includes(tag));
    const other = NONCURSED.filter((i) => !i.tags.includes(tag));
    out[tag] = {};
    for (const k of KS) {
      const rows = [];
      for (const b of BIOMES.filter((x) => x.act >= 2)) {
        for (let i = 0; i < N; i++) {
          const rng = makeRng(`build:${tag}:${k}:${b.id}:${i}`);
          const a = [...own]; rng.shuffle(a);
          const o = [...other]; rng.shuffle(o);
          const ids = [...a.slice(0, k).map((x) => x.id), ...o.slice(0, 6 - k).map((x) => x.id)];
          rows.push(playOne(b, ids, i, k));
        }
      }
      out[tag][k] = { ratio: med(rows.map((r) => r.ratio)), cleared: avg(rows.map((r) => +r.cleared)), gold: avg(rows.map((r) => +r.gold)), triggers: med(rows.map((r) => r.triggers)), freeBoosts: avg(rows.map((r) => r.freeBoosts)), chains: avg(rows.map((r) => r.chains)), chainBolts: avg(rows.map((r) => r.chainBolts)), real: med(rows.map((r) => r.real)), afterGold: avg(rows.map((r) => r.afterGold)), far: avg(rows.map((r) => +r.far)) };
    }
    const z = out[tag];
    console.log(`${tag.padEnd(9)} ${KS.map((k) => `${k}: ×${f2(z[k].ratio)} ${pct(z[k].cleared)} (Ausl. ${z[k].triggers}, Ketten ${z[k].chains.toFixed(1)}${z[k].far ? `, far ${pct(z[k].far)}` : ''})`).join(' | ')}`);
  }
  // Mediane über alle Tags je k
  console.log(`Median aller Tags: ${KS.map((k) => `${k}: ×${f2(med(TAG_IDS.map((t) => out[t][k].ratio)))} (Ketten ${avg(TAG_IDS.map((t) => out[t][k].chains)).toFixed(1)})`).join(' | ')}`);
  return out;
}

// ---------- B) Echte Runs mit Forschungsstand ----------
const RAR = { common: 0, rare: 1, epic: 2, legendary: 3, cursed: -2 };
const tagCounts = (run) => { const c = {}; for (const e of run.inventory) for (const p of entryParts(e)) for (const t of p.def.tags) c[t] = (c[t] || 0) + 1; return c; };
const topTag = (run) => { const c = tagCounts(run); let bt = null, bn = 0; for (const [t, n] of Object.entries(c)) if (n > bn) { bn = n; bt = t; } return [bt, bn]; };
const score = (run, id) => { const it = itemById(id); const c = tagCounts(run); return Math.max(...it.tags.map((t) => c[t] || 0)) * 6 + RAR[it.rarity] * 5 + it.tags.length * 2; };
const weakest = (run) => { const c = tagCounts(run); let slot = 0, low = Infinity; run.inventory.forEach((e, k) => { const v = Math.max(...entryParts(e).flatMap((p) => p.def.tags.map((t) => c[t]))); if (v < low) { low = v; slot = k; } }); return slot; };

const RESEARCH_STATES = {
  'neu (Grundpool)': [],
  'Spieler 38 min (5 Wurzeln)': ['r_gyro_1', 'r_feuer_1', 'r_elektro_1', 'r_gluck_1', 'r_schrott_1'],
  'alles erforscht': null,
};

// Item-Auswahl im Run: 'synergie' (stärksten Tag ausbauen, Rezepte, Seltenheit) oder 'zufällig'
const recipeBonus = (run, id) => recipeHints(id, run.inventory).filter((h) => h.completes).length * 8;
function resolveChoices(run, save, st, rng, policy) {
  while (RS.pendingChoice(run)) {
    const ch = RS.pendingChoice(run);
    if (!ch.items.length) { RS.skipChoice(run); continue; }
    st.choices++;
    const [tt] = topTag(run);
    if (ch.context !== 'blueprint') {
      st.offers++;
      if (tt && ch.items.some((id) => itemById(id).tags.includes(tt))) st.offersTop++;
    }
    // echte Abwägung: ≥ 2 Angebote mit unterschiedlichem Wert (Tag ausbauen vs. Seltenheit/anderer Tag)
    const scores = ch.items.map((id) => score(run, id) + recipeBonus(run, id));
    if (new Set(scores).size >= 2 && Math.max(...scores) - Math.min(...scores) < 8) st.offersConflict++;
    let best = 0, bs = -Infinity; ch.items.forEach((id, i) => { const v = scores[i]; if (v > bs) { bs = v; best = i; } });
    if (policy === 'zufällig') best = Math.floor(rng.next() * ch.items.length);
    let res = RS.pickItem(run, save, best);
    if (!res.ok && res.reason === 'full') res = RS.pickItem(run, save, best, policy === 'zufällig' ? Math.floor(rng.next() * run.inventory.length) : weakest(run));
    if (!res.ok) RS.skipChoice(run);
  }
}

function simulateRun(seed, research, saveKind, policy = 'synergie') {
  const save = simSave(saveKind);
  if (research) save.research.done = [...research];
  const run = RS.newRun(save, { seed, blueprint: true });
  if (!research) run.poolAll = true;
  const rng = makeRng(`run:${seed}`);
  const st = { offers: 0, offersTop: 0, offersConflict: 0, mapSteps: 0, mapReal: 0, mapMulti: 0, choices: 0, stages: 0, tows: 0, dealer: 0, actTop: {}, chainsTotal: 0, stagesWithChain: 0, focusStages: 0, focusChains: 0, ratios: [], maxTop: 0, recipes: 0 };
  resolveChoices(run, save, st, rng, policy);   // Bauplan-Start
  for (let step = 0; step < 150 && !run.over; step++) {
    const reach = RS.reachableNodes(run);
    if (!reach.length) break;
    st.mapSteps++;
    if (reach.length >= 2) st.mapMulti++;
    if (new Set(reach.map((n) => n.type)).size >= 2) st.mapReal++;
    const hp = run.durability / RS.durabilityMax(run);
    const sc = (n) => ({ station: 10, boss: 10, dealer: run.bolts >= 45 ? 4 : 1, treasure: 3, workbench: Workbench.fusionOptions(run).some((f) => f.kind === 'tier') ? 3 : 0.8, event: 1.5, stage: 2.2, elite: hp > 0.7 ? 2.4 : 0.6, blackmarket: 0.3 }[n.type] ?? 1) + rng.next() * 0.8;
    const node = [...reach].sort((a, b) => sc(b) - sc(a))[0];
    const actBefore = run.act;
    const e = RS.enterNode(run, node.id);
    if (!e.ok) break;
    if (e.kind === 'station') { chooseStation(run, hp < 0.7 ? 'repair' : 'fuel'); }
    else if (e.kind === 'dealer') {
      st.dealer++;
      const v = Dealer.dealerView(run);
      const offers = v.offers.filter((o) => !o.sold && o.canAfford).sort((a, b) => score(run, b.itemId) - score(run, a.itemId));
      for (const o of offers.slice(0, 2)) { if (run.bolts < o.price) continue; const full = run.inventory.length >= RS.itemSlots(run); Dealer.buyOffer(run, save, o.index, full ? weakest(run) : null); }
    } else if (e.kind === 'workbench') {
      const o = Workbench.fusionOptions(run).find((f) => f.kind === 'tier'); if (o) Workbench.fuseItems(run, save, o.a, o.b);
    } else if (e.kind === 'treasure') { Treasure.openTreasure(run); Treasure.takeTreasure(run, save); }
    if (e.kind === 'stage') {
      for (let g = 0; g < 30 && !run.over && run.current; g++) {
        const su = RS.runStageSetup(run, save);
        const biome = biomeForAct(run.act);
        let result = null;
        const stage = new Stage({ biome, spec: e.spec || RS.stageSpecFor(run, node), track: new Track(e.spec, biome), loadout: su.loadout, seed: hashSeed(`${seed}:${node.id}:${run.current.attempts}`), durability: run.durability, runMods: run.runMods, inventory: su.inventory, runInfo: su.runInfo, hooks: { end: (r) => { result = r; } } });
        playStage(stage, () => result, { seed: seed * 31 + st.stages, tricks: wantsTricks(run.inventory) });
        const chains = result.chains || 0;
        st.stages++; st.chainsTotal += chains; if (chains) st.stagesWithChain++;
        st.ratios.push(result.dist / result.target);
        if (topTag(run)[1] >= 4) { st.focusStages++; st.focusChains += chains; }
        const o = RS.applyStageResult(run, result, save);
        if (o.missed) { RS.resolveMiss(run, 'land'); st.tows++; break; }   // Paket A: Notlandung
        if (o.towed) st.tows++;
        if (!o.towed || o.defeat) break;
      }
    }
    // Item-Auswahl(en)
    resolveChoices(run, save, st, rng, policy);
    st.maxTop = Math.max(st.maxTop, topTag(run)[1]);
    st.recipes = Math.max(st.recipes, RS.inventoryView(run).recipes.length);
    if (run.current && run.current.type === e.kind && e.kind !== 'stage') RS.leaveNode(run);
    if (run.act !== actBefore || run.over) st.actTop[actBefore] = topTag(run)[1];
  }
  const [tt, tn] = topTag(run);
  return { act: run.over ? run.over.act : run.act, won: !!(run.over && run.over.won), top: tn, topTag: tt, items: run.inventory.length, ...st };
}

function realRuns() {
  const out = {};
  const states = Object.entries(RESEARCH_STATES).map(([name, research]) => [name, research, 'synergie']);
  states.splice(1, 0, ['neu, zufällige Auswahl', [], 'zufällig']);
  for (const [name, research, policy] of states) {
    const saveKind = research && research.length === 0 ? 'start' : research ? 'start' : 'gut';
    const rs = Array.from({ length: NRUNS }, (_, i) => simulateRun(900 + i, research, saveKind, policy));
    const poolSize = research ? itemPool(research).length : NONCURSED.length;
    const perTag = {}; for (const it of research ? itemPool(research) : NONCURSED) for (const t of it.tags) perTag[t] = (perTag[t] || 0) + 1;
    // Paket C: höchste erreichte Tag-Zählung im Run (Maximum über den Run, nicht nur am Ende)
    const lv = rs.map((r) => r.maxTop);
    out[name] = {
      poolSize, perTagMax: Math.max(...Object.values(perTag)), perTagMin: Math.min(...Object.values(perTag)),
      win: avg(rs.map((r) => +r.won)), endAct: med(rs.map((r) => r.act)),
      top: med(rs.map((r) => r.top)), set3: avg(lv.map((x) => +(x >= 3))), set5: avg(lv.map((x) => +(x >= 5))),
      ratio: med(rs.flatMap((r) => r.ratios)), recipes: avg(rs.map((r) => r.recipes)),
      focusChains: rs.reduce((a, r) => a + r.focusChains, 0) / Math.max(1, rs.reduce((a, r) => a + r.focusStages, 0)), focusStages: rs.reduce((a, r) => a + r.focusStages, 0),
      offersTop: avg(rs.map((r) => r.offersTop / Math.max(1, r.offers))),
      choices: med(rs.map((r) => r.choices)), conflict: med(rs.map((r) => r.offersConflict)),
      mapSteps: med(rs.map((r) => r.mapSteps)), mapReal: med(rs.map((r) => r.mapReal)), mapMulti: med(rs.map((r) => r.mapMulti)),
      stages: med(rs.map((r) => r.stages)), tows: med(rs.map((r) => r.tows)),
      chainsPerStage: avg(rs.map((r) => r.chainsTotal / Math.max(1, r.stages))), stagesWithChain: avg(rs.map((r) => r.stagesWithChain / Math.max(1, r.stages))),
      topByAct: [1, 2, 3].map((a) => med(rs.filter((r) => r.actTop[a] !== undefined).map((r) => r.actTop[a]))),
    };
    const o = out[name];
    console.log(`${name.padEnd(28)} Pool ${o.poolSize} (${o.perTagMin}–${o.perTagMax} je Tag) · Sieg ${pct(o.win)} · Ende Akt ${o.endAct} · stärkster Tag am Ende ${o.top} (Akt-Ende 1/2/3: ${o.topByAct.join('/')}) · Set3 ${pct(o.set3)} Set5 ${pct(o.set5)} · Angebot mit Haupt-Tag ${pct(o.offersTop)} · Weite÷Ziel ${f2(o.ratio)} · Rezepte ${o.recipes.toFixed(1)} · Item-Wahlen ${o.choices} (knapp ${o.conflict}) · Karte: ${o.mapSteps} Schritte, ${o.mapReal} mit ≥ 2 Knotenarten · Etappen ${o.stages} (Notlandung ${o.tows}) · Ketten/Etappe ${o.chainsPerStage.toFixed(2)}, mit ≥ 4 Haupt-Tag ${o.focusChains.toFixed(2)} (${o.focusStages} Etappen)`);
  }
  return out;
}

const t0 = Date.now();
let conc = null, runs = null;
if (ONLY !== 'runs') {
  console.log('A) Tag-Konzentration (Akt 2+3, Etage 3, gutes Loadout; Median Weite÷Ziel, geschafft):');
  conc = concentration();
}
if (ONLY !== 'conc') {
  console.log('\nB) Echte Runs:');
  runs = realRuns();
}
console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
const jf = opt('json', null);
if (jf) fs.writeFileSync(jf, JSON.stringify({ conc, runs }, null, 1));
