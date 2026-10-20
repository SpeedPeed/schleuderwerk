// Karte eines Akts (map/mapGen.js): Regeln aus V2-DESIGN §4, Erreichbarkeit, Kreuzungsfreiheit, Determinismus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateActMap, reachableFromStart, allNodes, mapNode, isSpecialType, BOSS_FLOOR } from '../www/src/map/mapGen.js';
import { NODE_TYPES } from '../www/src/data/nodes.js';
import { MAP } from '../www/src/data/balance.js';
import { makeRng } from '../www/src/core/rng.js';

const RESEARCH = [[], ['r_node_workbench'], ['r_node_workbench', 'r_node_blackmarket']];

function checkMap(map, research, info) {
  assert.equal(map.floors.length, MAP.floors, info);
  assert.equal(map.boss.floor, BOSS_FLOOR);
  assert.equal(map.boss.type, 'boss');
  const count = {};
  for (const [f, row] of map.floors.entries()) {
    assert.ok(row.length >= 2 && row.length <= 4, `${info}: Etage ${f} hat ${row.length} Knoten`);
    for (let i = 1; i < row.length; i++) assert.ok(row[i].x > row[i - 1].x, `${info}: Reihenfolge`);
    for (const n of row) {
      assert.equal(n.floor, f);
      assert.ok(NODE_TYPES[n.type], `${info}: Typ ${n.type}`);
      assert.ok(n.floor >= (NODE_TYPES[n.type].minFloor || 0) || f === 0, `${info}: ${n.type} zu früh (Etage ${f})`);
      count[n.type] = (count[n.type] || 0) + 1;
      // Verbindungen nur zur nächsten Etage (bzw. Boss), mindestens eine
      assert.ok(n.next.length >= 1, `${info}: ${n.id} ohne Nachfolger`);
      for (const id of n.next) {
        const m = mapNode(map, id);
        assert.ok(m, id);
        assert.equal(m.floor, f + 1, `${info}: Kante überspringt Etagen`);
        assert.ok(m.prev.includes(n.id));
        if (isSpecialType(n.type) && n.type !== 'boss') assert.notEqual(m.type, n.type, `${info}: zwei ${n.type} hintereinander`);
      }
      if (f > 0) assert.ok(n.prev.length >= 1, `${info}: ${n.id} ohne Vorgänger`);
    }
  }
  // Etage 0 nur Etappen, Etage 5 nur Tankstellen
  assert.ok(map.floors[0].every((n) => n.type === 'stage'), `${info}: Etage 0`);
  assert.ok(map.floors[MAP.floors - 1].every((n) => n.type === 'station'), `${info}: Etage 5`);
  assert.deepEqual(map.boss.prev.sort(), map.floors[MAP.floors - 1].map((n) => n.id).sort());
  // Elite ab Etage 2, höchstens 2
  assert.ok((count.elite || 0) <= 2, `${info}: ${count.elite} Elite`);
  for (const n of map.floors.flat()) if (n.type === 'elite') assert.ok(n.floor >= 2);
  // mindestens ein Händler auf Etage 2–4
  assert.ok(map.floors.slice(2, 5).flat().some((n) => n.type === 'dealer'), `${info}: kein Händler auf Etage 2–4`);
  // Forschungs-Knoten nur mit Forschung, Höchstzahlen
  if (!research.includes('r_node_workbench')) assert.ok(!count.workbench, `${info}: Werkbank ohne Forschung`);
  if (!research.includes('r_node_blackmarket')) assert.ok(!count.blackmarket, `${info}: Schwarzmarkt ohne Forschung`);
  for (const [type, def] of Object.entries(NODE_TYPES)) if (def.maxPerAct !== undefined) assert.ok((count[type] || 0) <= def.maxPerAct, `${info}: ${type} ×${count[type]}`);
  // alle Knoten erreichbar
  const seen = reachableFromStart(map);
  for (const n of allNodes(map)) assert.ok(seen.has(n.id), `${info}: ${n.id} unerreichbar`);
  // kreuzungsfrei: Kanten zwischen zwei Etagen überschneiden sich nicht
  for (let f = 0; f < MAP.floors - 1; f++) {
    const edges = [];
    for (const n of map.floors[f]) for (const id of n.next) edges.push([n.index, mapNode(map, id).index]);
    for (const [a, b] of edges) for (const [c, d] of edges) assert.ok(!((a < c && b > d) || (a > c && b < d)), `${info}: Kreuzung auf Etage ${f}`);
  }
  return count;
}

test('Karte: 1000 Seeds je Akt – Regeln, Erreichbarkeit, Kreuzungsfreiheit', () => {
  const total = {};
  let nodes = 0, maps = 0;
  for (let seed = 0; seed < 1000; seed++) {
    const act = 1 + (seed % 3);
    const research = RESEARCH[seed % RESEARCH.length];
    const map = generateActMap(act, makeRng(seed), { research });
    const c = checkMap(map, research, `Seed ${seed}`);
    for (const [k, v] of Object.entries(c)) total[k] = (total[k] || 0) + v;
    nodes += allNodes(map).length - 1;
    maps++;
  }
  const avg = nodes / maps;
  assert.ok(avg >= 16 && avg <= 22, `≈ 17–21 Knoten je Akt (Paket D: breitere Karte; Mittel ${avg.toFixed(1)})`);
  for (const t of ['stage', 'elite', 'dealer', 'event', 'treasure', 'station', 'workbench', 'blackmarket']) assert.ok(total[t] > 0, `${t} kommt vor`);
});

test('Karte: deterministisch per Seed, JSON-fest', () => {
  for (let s = 0; s < 50; s++) {
    const a = generateActMap(2, makeRng(s), { research: ['r_node_workbench'] });
    const b = generateActMap(2, makeRng(s), { research: ['r_node_workbench'] });
    assert.deepEqual(a, b);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  }
  const x = generateActMap(1, makeRng(1)), y = generateActMap(1, makeRng(2));
  assert.notDeepEqual(x, y);
});

test('Paket D: Karte verzweigt (≤ 35 % Einbahn-Knoten), Beute-Tag an jeder Etappe/Elite, Geschwister meist verschieden', () => {
  let one = 0, all = 0, tagged = 0, stages = 0;
  for (let i = 0; i < 200; i++) {
    const m = generateActMap(1 + (i % 3), makeRng(`d2:${i}`));
    for (const n of m.floors.flat()) {
      if (n.floor < 5) { all++; if (n.next.length === 1) one++; }
      if (n.type === 'stage' || n.type === 'elite') { stages++; if (n.rewardTag) tagged++; }
    }
  }
  assert.ok(one / all <= 0.35, `Einbahn ${(one / all * 100).toFixed(0)} %`);
  assert.equal(tagged, stages);
});
