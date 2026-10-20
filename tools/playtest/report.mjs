// Auswertung von tools/playtest/browser-play.mjs: Echtzeit je Bildschirmart, Anteile, Eingaben, Etappen-Statistik.
// Aufruf: node tools/playtest/report.mjs <Ordner mit report.json> [<weitere Ordner>…]
import fs from 'node:fs';
import path from 'node:path';

const dirs = process.argv.slice(2);
const med = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
const sum = (a) => a.reduce((s, x) => s + x, 0);
const r1 = (x) => Math.round(x * 10) / 10;
const screens = {}, inputs = {};
const stages = [], runs = [];
for (const d of dirs) {
  const r = JSON.parse(fs.readFileSync(path.join(d, 'report.json'), 'utf8'));
  const L = r.screenLog || [];
  for (let i = 0; i < L.length - 1; i++) {
    let k = L[i].k;
    if (k.startsWith('tutorial:')) k = 'tutorial';
    screens[k] = (screens[k] || 0) + (L[i + 1].t - L[i].t) / 1000;
  }
  for (const [k, v] of Object.entries(r.inputs || {})) inputs[k] = (inputs[k] || 0) + v;
  for (const run of r.runs) { if (!run.stages.length) continue; runs.push(run); stages.push(...run.stages); }
}
const total = sum(Object.values(screens));
console.log(`Runs: ${runs.length}, Etappen-Starts: ${stages.length}, Echtzeit gesamt ${r1(total / 60)} min`);
console.log('\nEchtzeit je Bildschirm (Bot ohne Lesezeit – Untergrenze):');
for (const [k, v] of Object.entries(screens).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(18)} ${r1(v).toString().padStart(7)} s  ${Math.round((v / total) * 100)} %`);
console.log('\nEingaben je Bildschirmart:', JSON.stringify(inputs));
const st = stages;
const cleared = st.filter((s) => s.medal);
console.log(`\nEtappen: Spielzeit Median ${r1(med(st.map((s) => s.gameTime)))} s, Flug ${r1(med(st.map((s) => s.air)))} s (${Math.round((sum(st.map((s) => s.air)) / sum(st.map((s) => s.gameTime))) * 100)} %), Auslauf nach letztem Sprung ${r1(med(st.map((s) => s.rolloutAfterLastJump)))} s (${Math.round((sum(st.map((s) => s.rolloutAfterLastJump)) / sum(st.map((s) => s.gameTime))) * 100)} %), nach Bronze (geschaffte) ${r1(med(cleared.map((s) => s.afterBronze)))} s`);
console.log(`Geschafft ${cleared.length}/${st.length}, perfekte Abschüsse ${st.filter((s) => s.perfect).length}/${st.length}, Ketten ≥ 3 Glieder: ${st.filter((s) => s.maxChain >= 3).length}/${st.length}, Auslösungen Median ${med(st.map((s) => s.triggers))}`);
// gleiche Strecke wiederholt
let repeats = 0;
for (const run of runs) for (let i = 1; i < run.stages.length; i++) { const a = run.stages[i - 1], b = run.stages[i]; if (!a.medal && a.target === b.target && a.features.join() === b.features.join()) repeats++; }
console.log(`Wiederholungen derselben Strecke (nach Abschleppen): ${repeats}/${st.length} Etappen-Starts`);
for (const run of runs) {
  const last = run.summary && run.summary.last;
  console.log(`  Run ${run.no}: ${run.stages.length} Etappen-Starts, ${run.stages.filter((s) => s.medal).length} geschafft, Ende ${last ? `Akt ${last.act} (${last.reason})` : '?'}, ${r1(run.wall / 60)} min, +${last ? last.scrap : '?'} ⚙ → ${last ? Math.round(last.scrap / (run.wall / 3600)) : '?'} ⚙/h (Bot-Tempo)`);
}
