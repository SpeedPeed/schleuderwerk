// Playtest-Analyse 2: Wie stark sind Synergien wirklich – und wie oft kommt man im echten Run überhaupt dahin?
//  A) Tag-Konzentration: je Tag k = 0/2/4/6 Items dieses Tags (+ 6 − k zufällige Items anderer Tags, ★1), gutes Loadout,
//     Akt 2 + 3, Etage 3. Gemessen: Weite ÷ Ziel, Erfolgsquote, Auslösungen, Gratis-Boosts, Ketten-Momente (HUD
//     „KETTENREAKTION“), Zeit nach Gold (Weite ohne Belohnung).
//  B) Echte Runs (Run-Logik + Bot, Synergie-Auswahl wie tools/sim/items.mjs, dazu Händler/Schatz/Werkbank) mit drei
//     Forschungsständen: neuer Spielstand (Grundpool), „Spieler nach 38 min“ (5 billige Wurzel-Forschungen), alles
//     erforscht. Gemessen: stärkster Tag am Ende je Akt, erreichte Set-Stufe, Anteil Angebote mit Item des stärksten
//     Tags, echte Entscheidungen je Run (Karte mit ≥ 2 verschiedenen Knotenarten, Item-Auswahl mit Tag-Konflikt).
// Aufruf: node tools/playtest/synergy.mjs [--n 12] [--runs 24] [--json <Datei>]
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

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const N = Number(opt('n', 12));
const NRUNS = Number(opt('runs', 24));
const med = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const pct = (x) => `${Math.round(x * 100)} %`;
const f2 = (x) => x.toFixed(2);
const TAG_IDS = Object.keys(TAGS);
const NONCURSED = ITEMS.filter((i) => i.rarity !== 'cursed');
const SAVE = simSave('gut');

// ---------- A) Tag-Konzentration ----------
function playOne(biome, ids, i, salt) {
  const spec = generateStageSpec({ biome, kind: 'stage', floor: 3, rng: makeRng(`syn:${biome.id}:${i}`) });
  const inv = ids.length ? ids.map((itemId) => ({ itemId, tier: 1 })) : null;
  let chains = 0;
  const sim = makeSimStage({ spec, biome, save: SAVE, seed: 5000 + i, inventory: inv, runInfo: { bolts: 40, counters: {} }, hooks: { chain: () => { chains++; } } });
  const st = sim.stage;
  let frames = 0, afterGold = 0, freeBoosts = 0;
  st.onEvent = (name, data) => { if (name === 'boost' && data && data.free) freeBoosts++; };
  const up = st.update.bind(st);
  st.update = (dt, input) => { up(dt, input); if (st.phase === 'fly') { frames++; if (st.vehicle.maxX >= st.medals.gold) afterGold++; } };
  const r = playStage(st, () => sim.result, { seed: 17 * i + salt, tricks: wantsTricks(inv) });
  return { ratio: r.dist / r.target, cleared: !!r.medal, gold: r.medal === 'gold', triggers: r.itemTriggers, freeBoosts, chains, real: frames / 60, afterGold: afterGold / 60, far: r.reason === 'far' };
}

function concentration() {
  const out = {};
  for (const tag of TAG_IDS) {
    const own = NONCURSED.filter((i) => i.tags.includes(tag));
    const other = NONCURSED.filter((i) => !i.tags.includes(tag));
    out[tag] = {};
    for (const k of [0, 2, 4, 6]) {
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
      out[tag][k] = { ratio: med(rows.map((r) => r.ratio)), cleared: avg(rows.map((r) => +r.cleared)), gold: avg(rows.map((r) => +r.gold)), triggers: med(rows.map((r) => r.triggers)), freeBoosts: avg(rows.map((r) => r.freeBoosts)), chains: avg(rows.map((r) => r.chains)), real: med(rows.map((r) => r.real)), afterGold: avg(rows.map((r) => r.afterGold)), far: avg(rows.map((r) => +r.far)) };
    }
    const z = out[tag];
    console.log(`${tag.padEnd(9)} ${[0, 2, 4, 6].map((k) => `${k}: ×${f2(z[k].ratio)} ${pct(z[k].cleared)} (Gold ${pct(z[k].gold)}, Ausl. ${z[k].triggers}, Gratis-Boost ${z[k].freeBoosts.toFixed(1)}, Ketten ${z[k].chains.toFixed(1)}, nach Gold ${z[k].afterGold.toFixed(1)}s)`).join(' | ')}`);
  }
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

function simulateRun(seed, research, saveKind) {
  const save = simSave(saveKind);
  if (research) save.research.done = [...research];
  const run = RS.newRun(save, { seed });
  if (!research) run.poolAll = true;
  const rng = makeRng(`run:${seed}`);
  const st = { offers: 0, offersTop: 0, offersConflict: 0, mapSteps: 0, mapReal: 0, mapMulti: 0, choices: 0, stages: 0, tows: 0, dealer: 0, actTop: {}, chainsTotal: 0, stagesWithChain: 0 };
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
        let result = null, chains = 0;
        const stage = new Stage({ biome, spec: e.spec || RS.stageSpecFor(run, node), track: new Track(e.spec, biome), loadout: su.loadout, seed: hashSeed(`${seed}:${node.id}:${run.current.attempts}`), durability: run.durability, runMods: run.runMods, inventory: su.inventory, runInfo: su.runInfo, hooks: { end: (r) => { result = r; }, chain: () => { chains++; } } });
        playStage(stage, () => result, { seed: seed * 31 + st.stages, tricks: wantsTricks(run.inventory) });
        st.stages++; st.chainsTotal += chains; if (chains) st.stagesWithChain++;
        const o = RS.applyStageResult(run, result, save);
        if (o.towed) st.tows++;
        if (!o.towed || o.defeat) break;
      }
    }
    // Item-Auswahl(en)
    while (RS.pendingChoice(run)) {
      const ch = RS.pendingChoice(run);
      if (!ch.items.length) { RS.skipChoice(run); continue; }
      st.choices++;
      const [tt, tn] = topTag(run);
      st.offers++;
      if (tt && ch.items.some((id) => itemById(id).tags.includes(tt))) st.offersTop++;
      // echte Abwägung: ≥ 2 Angebote mit unterschiedlichem Wert (Tag ausbauen vs. Seltenheit/anderer Tag)
      const scores = ch.items.map((id) => score(run, id));
      if (new Set(scores).size >= 2 && Math.max(...scores) - Math.min(...scores) < 8) st.offersConflict++;
      let best = 0, bs = -Infinity; ch.items.forEach((id, i) => { const s = score(run, id); if (s > bs) { bs = s; best = i; } });
      let res = RS.pickItem(run, save, best);
      if (!res.ok && res.reason === 'full') res = RS.pickItem(run, save, best, weakest(run));
      if (!res.ok) RS.skipChoice(run);
    }
    if (run.current && run.current.type === e.kind && e.kind !== 'stage') RS.leaveNode(run);
    if (run.act !== actBefore || run.over) st.actTop[actBefore] = topTag(run)[1];
  }
  const [tt, tn] = topTag(run);
  return { act: run.over ? run.over.act : run.act, won: !!(run.over && run.over.won), top: tn, topTag: tt, items: run.inventory.length, ...st };
}

function realRuns() {
  const out = {};
  for (const [name, research] of Object.entries(RESEARCH_STATES)) {
    const saveKind = research && research.length === 0 ? 'start' : research ? 'start' : 'gut';
    const rs = Array.from({ length: NRUNS }, (_, i) => simulateRun(900 + i, research, saveKind));
    const poolSize = research ? itemPool(research).length : NONCURSED.length;
    const perTag = {}; for (const it of research ? itemPool(research) : NONCURSED) for (const t of it.tags) perTag[t] = (perTag[t] || 0) + 1;
    const setLvl = (n) => (n >= 6 ? 6 : n >= 4 ? 4 : n >= 2 ? 2 : 0);
    const lv = rs.map((r) => setLvl(r.top));
    out[name] = {
      poolSize, perTagMax: Math.max(...Object.values(perTag)), perTagMin: Math.min(...Object.values(perTag)),
      win: avg(rs.map((r) => +r.won)), endAct: med(rs.map((r) => r.act)),
      top: med(rs.map((r) => r.top)), set4: avg(lv.map((x) => +(x >= 4))), set6: avg(lv.map((x) => +(x >= 6))),
      offersTop: avg(rs.map((r) => r.offersTop / Math.max(1, r.offers))),
      choices: med(rs.map((r) => r.choices)), conflict: med(rs.map((r) => r.offersConflict)),
      mapSteps: med(rs.map((r) => r.mapSteps)), mapReal: med(rs.map((r) => r.mapReal)), mapMulti: med(rs.map((r) => r.mapMulti)),
      stages: med(rs.map((r) => r.stages)), tows: med(rs.map((r) => r.tows)),
      chainsPerStage: avg(rs.map((r) => r.chainsTotal / Math.max(1, r.stages))), stagesWithChain: avg(rs.map((r) => r.stagesWithChain / Math.max(1, r.stages))),
      topByAct: [1, 2, 3].map((a) => med(rs.filter((r) => r.actTop[a] !== undefined).map((r) => r.actTop[a]))),
    };
    const o = out[name];
    console.log(`${name.padEnd(28)} Pool ${o.poolSize} (${o.perTagMin}–${o.perTagMax} je Tag) · Sieg ${pct(o.win)} · Ende Akt ${o.endAct} · stärkster Tag am Ende ${o.top} (Akt-Ende 1/2/3: ${o.topByAct.join('/')}) · Set4 ${pct(o.set4)} Set6 ${pct(o.set6)} · Angebot mit Haupt-Tag ${pct(o.offersTop)} · Item-Wahlen ${o.choices} (knapp ${o.conflict}) · Karte: ${o.mapSteps} Schritte, davon ${o.mapMulti} mit ≥ 2 Knoten, ${o.mapReal} mit ≥ 2 Knotenarten · Etappen ${o.stages} (Abschleppen ${o.tows}) · Ketten/Etappe ${o.chainsPerStage.toFixed(2)}`);
  }
  return out;
}

const t0 = Date.now();
console.log('A) Tag-Konzentration (Akt 2+3, Etage 3, gutes Loadout; Median Weite÷Ziel, geschafft):');
const conc = concentration();
console.log('\nB) Echte Runs:');
const runs = realRuns();
console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
const jf = opt('json', null);
if (jf) fs.writeFileSync(jf, JSON.stringify({ conc, runs }, null, 1));
