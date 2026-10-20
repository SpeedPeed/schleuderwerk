// Verzweigte Karte eines Akts (V2-DESIGN.md §4). Reine Logik ohne three.js und DOM, deterministisch per Seed.
//
// generateActMap(act, rng, opts) → {
//   act, floors: [[node…] × MAP.floors], boss: node
//   (node = { id, floor, index, type, x (0…1 für die Anzeige), next: [ids], prev: [ids], bossId? })
// }  – reines JSON (wird im Run gespeichert); Zugriff per mapNode(map, id).
// Regeln:
//  - MAP.floors Etagen (0–5) mit 2–4 Knoten (Gewichte MAP.floorSizes), danach EIN Boss-Knoten (Etage 6).
//  - Verbindungen nur zur nächsten Etage, kreuzungsfrei; jeder Knoten hat ≥ 1 Vorgänger (außer Etage 0) und
//    ≥ 1 Nachfolger → alles erreichbar, jeder Weg endet beim Boss.
//  - Etage 0 nur Etappen (forcedFloors), Etage 5 nur Tankstellen; Elite ab Etage 2, höchstens 2 je Akt;
//    mindestens ein Schrotthändler auf Etage 2–4; Werkbank/Schwarzmarkt nur mit erledigter Forschung
//    (requiresResearch); keine gleichen Sonderknoten (alles außer Etappe) direkt hintereinander.
// opts: { research: [erledigte Forschungs-IDs], eliteWeightAdd, bossId }
import { MAP, GOALS } from '../data/balance.js';
import { NODE_TYPES } from '../data/nodes.js';
import { MUTATORS, MUTATOR_RULES } from '../data/mutators.js';
import { TAG_IDS } from '../data/tags.js';

export const BOSS_FLOOR = MAP.floors;

// Typen, die nicht direkt hintereinander vorkommen dürfen
export const isSpecialType = (type) => type !== 'stage';

// Knotenarten, die eine Etappe sind
export const STAGE_TYPES = ['stage', 'elite', 'boss'];
export const isStageType = (type) => STAGE_TYPES.includes(type);

function forcedTypeFor(floor) {
  for (const [type, def] of Object.entries(NODE_TYPES)) {
    if (type === 'boss') continue;
    if (def.forcedFloors && def.forcedFloors.includes(floor)) return type;
  }
  return null;
}

// Kreuzungsfreie Verbindungen zwischen zwei sortierten Etagen (a: n Knoten, b: m Knoten).
// Treppe von (0,0) nach (n-1, m-1): jeder Knoten beider Etagen bekommt mindestens eine Kante.
function connect(n, m, rng) {
  const edges = [[0, 0]];
  let i = 0, j = 0;
  while (i < n - 1 || j < m - 1) {
    const canI = i < n - 1, canJ = j < m - 1;
    // Schritt so wählen, dass beide Seiten gleichmäßig vorankommen; manchmal beide zugleich
    const fi = (i + 1) / n, fj = (j + 1) / m;
    let step;
    if (canI && canJ) step = rng.chance(MAP.extraEdgeChance) ? (fi < fj ? 'i' : 'j') : (Math.abs(fi - fj) < 0.2 ? 'ij' : fi < fj ? 'i' : 'j');
    else step = canI ? 'i' : 'j';
    if (step === 'i' || step === 'ij') i++;
    if (step === 'j' || step === 'ij') j++;
    edges.push([i, j]);
  }
  // Paket D: Abzweige – Knoten mit nur einem Nachfolger bekommen (MAP.branchChance) einen zweiten Nachbarn, sofern
  // die neue Kante keine bestehende kreuzt
  const crosses = (i, j) => edges.some(([a, b]) => (a - i) * (b - j) < 0);
  for (let a = 0; a < n; a++) {
    const out = edges.filter(([x]) => x === a).map(([, y]) => y);
    if (out.length !== 1 || !rng.chance(MAP.branchChance)) continue;
    const cand = [out[0] + 1, out[0] - 1].filter((j) => j >= 0 && j < m && !crosses(a, j));
    if (cand.length) edges.push([a, cand.length > 1 ? rng.pick(cand) : cand[0]]);
  }
  return edges;
}

// Darf `type` an Knoten `node` stehen? (Etage, Höchstzahl, Forschung, keine gleichen Sonderknoten benachbart)
function allowed(type, node, ctx) {
  const def = NODE_TYPES[type];
  if (!def) return false;
  if (def.requiresResearch && !ctx.research.includes(def.requiresResearch)) return false;
  if (def.maxPerAct !== undefined && (ctx.count[type] || 0) >= def.maxPerAct) return false;
  if (node.floor < (def.minFloor || 0)) return false;
  if (isSpecialType(type)) {
    for (const id of [...node.prev, ...node.next]) {
      const o = ctx.nodes[id];
      if (o && o.type === type) return false;
    }
  }
  return true;
}

export function generateActMap(act, rng, opts = {}) {
  const research = opts.research || [];
  const floors = [];
  const nodes = {};
  // 1) Knoten je Etage
  for (let f = 0; f < MAP.floors; f++) {
    const n = rng.weighted(MAP.floorSizes);
    const row = [];
    for (let k = 0; k < n; k++) {
      const id = `a${act}f${f}n${k}`;
      const x = n === 1 ? 0.5 : 0.12 + (0.76 * k) / (n - 1) + rng.range(-0.04, 0.04);
      const node = { id, floor: f, index: k, type: null, x, next: [], prev: [] };
      row.push(node);
      nodes[id] = node;
    }
    floors.push(row);
  }
  const boss = { id: `a${act}boss`, floor: BOSS_FLOOR, index: 0, type: 'boss', x: 0.5, next: [], prev: [], bossId: opts.bossId || null };
  nodes[boss.id] = boss;

  // 2) Verbindungen (kreuzungsfrei), letzte Etage → Boss
  for (let f = 0; f < MAP.floors - 1; f++) {
    const a = floors[f], b = floors[f + 1];
    for (const [i, j] of connect(a.length, b.length, rng)) {
      if (!a[i].next.includes(b[j].id)) {
        a[i].next.push(b[j].id);
        b[j].prev.push(a[i].id);
      }
    }
  }
  for (const n of floors[MAP.floors - 1]) {
    n.next.push(boss.id);
    boss.prev.push(n.id);
  }

  // 3) Typen: Pflicht-Etagen, garantierter Händler, dann der Rest nach Gewicht
  const ctx = { research, count: {}, nodes };
  const set = (node, type) => { node.type = type; ctx.count[type] = (ctx.count[type] || 0) + 1; };
  for (const row of floors) {
    const forced = forcedTypeFor(row[0].floor);
    if (forced) for (const n of row) set(n, forced);
  }
  for (const [type, def] of Object.entries(NODE_TYPES)) {
    if (!def.minPerAct || !def.guaranteeFloors) continue;
    if (def.requiresResearch && !research.includes(def.requiresResearch)) continue;
    const [lo, hi] = def.guaranteeFloors;
    for (let k = 0; k < def.minPerAct; k++) {
      const cands = [];
      for (let f = lo; f <= hi; f++) for (const n of floors[f]) if (!n.type && allowed(type, n, ctx)) cands.push(n);
      if (cands.length) set(rng.pick(cands), type);
    }
  }
  for (const row of floors) {
    for (const node of row) {
      if (node.type) continue;
      const weights = [];
      // Paket D: Geschwister (andere Nachfolger derselben Vorgänger) sollen möglichst verschiedene Arten haben
      const siblings = new Set();
      for (const p of node.prev) for (const id of nodes[p].next) if (id !== node.id && nodes[id].type) siblings.add(nodes[id].type);
      for (const [type, def] of Object.entries(NODE_TYPES)) {
        let w = def.weight || 0;
        if (type === 'elite') w += opts.eliteWeightAdd || 0;
        if (siblings.has(type)) w *= MAP.siblingSameMul;
        if (w > 0 && allowed(type, node, ctx)) weights.push([type, w]);
      }
      set(node, weights.length ? rng.weighted(weights) : 'stage');
    }
  }
  assignMutators(floors, act, rng.fork('mutatoren'));
  assignRewardTags(floors, rng.fork('beute'));
  assignGoals(floors, rng.fork('arten'));
  return { act, floors, boss };
}

// Paket D – Mutatoren (data/mutators.js): jede Elite einen, normale Etappen ab MUTATOR_RULES.stageMinAct mit
// stageChance (Akt 1 ab Etage 2 mit act1Chance); auf einer Etage kein Mutator doppelt. Eigener Zufalls-Zweig, damit
// die übrige Karte (Seeds älterer Läufe) gleich bleibt.
export function assignMutators(floors, act, rng) {
  for (const row of floors) {
    const used = new Set();
    for (const n of row) {
      let p = 0;
      if (n.type === 'elite') p = 1;
      else if (n.type === 'stage') p = act >= MUTATOR_RULES.stageMinAct ? MUTATOR_RULES.stageChance : n.floor >= 2 ? MUTATOR_RULES.act1Chance : 0;
      if (!(p > 0) || !rng.chance(p)) continue;
      const list = MUTATORS.filter((m) => !used.has(m.id) && (!m.eliteOnly || n.type === 'elite'));
      if (!list.length) continue;
      const m = rng.pick(list);
      n.mutator = m.id;
      used.add(m.id);
    }
  }
}

// Paket D – Beute-Tag: Etappen und Elite zeigen auf der Karte, aus welchem Tag die Beute garantiert ein Item hat
// (run/runState.js → queueChoice). Geschwister (gleicher Vorgänger) bekommen möglichst verschiedene Tags.
export function assignRewardTags(floors, rng) {
  const byId = {};
  for (const n of floors.flat()) byId[n.id] = n;
  for (const row of floors) {
    for (const n of row) {
      if (n.type !== 'stage' && n.type !== 'elite') continue;
      const sib = new Set();
      for (const p of n.prev) for (const id of byId[p].next) if (id !== n.id && byId[id].rewardTag) sib.add(byId[id].rewardTag);
      const list = TAG_IDS.filter((t) => !sib.has(t));
      n.rewardTag = rng.pick(list.length ? list : TAG_IDS);
    }
  }
}

// Paket D – Etappen-Arten (stage/goals.js): Etage 0 und Boss immer Weitflug, sonst nach GOALS.weights (Elite:
// eliteWeights); Geschwister und direkte Vorgänger bekommen möglichst eine andere Art.
export function assignGoals(floors, rng) {
  const byId = {};
  for (const n of floors.flat()) byId[n.id] = n;
  for (const row of floors) {
    for (const n of row) {
      if ((n.type !== 'stage' && n.type !== 'elite') || n.floor === 0) continue;
      const avoid = new Set();
      for (const p of n.prev) {
        if (byId[p].goal) avoid.add(byId[p].goal);
        for (const id of byId[p].next) if (id !== n.id && byId[id].goal) avoid.add(byId[id].goal);
      }
      const w = Object.entries(n.type === 'elite' ? GOALS.eliteWeights : GOALS.weights).map(([t, x]) => [t, avoid.has(t) ? x * 0.2 : x]);
      n.goal = rng.weighted(w);
    }
  }
}

// Knoten per ID (Etagen + Boss)
export function mapNode(map, id) {
  if (!map || !id) return null;
  if (map.boss && map.boss.id === id) return map.boss;
  for (const row of map.floors) for (const n of row) if (n.id === id) return n;
  return null;
}

// Alle Knoten einer Karte (Etagen + Boss)
export function allNodes(map) {
  return [...map.floors.flat(), map.boss];
}

// Von welchen Knoten aus ist `id` erreichbar? (Prüfung: jeder Knoten liegt auf einem Weg Etage 0 → Boss)
export function reachableFromStart(map) {
  const seen = new Set(map.floors[0].map((n) => n.id));
  const queue = [...seen];
  while (queue.length) {
    const n = mapNode(map, queue.shift());
    for (const id of n.next) if (!seen.has(id)) { seen.add(id); queue.push(id); }
  }
  return seen;
}
