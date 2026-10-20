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
// gleiche Strecke wiederholt (Paket A: Strecken-Seed; ältere Berichte ohne Seed: Ziel + Bausteine)
let repeats = 0;
for (const run of runs) for (let i = 1; i < run.stages.length; i++) {
  const a = run.stages[i - 1], b = run.stages[i];
  if (a.seed !== undefined ? a.seed === b.seed : !a.medal && a.target === b.target && a.features.join() === b.features.join()) repeats++;
}
console.log(`Wiederholungen derselben Strecke: ${repeats}/${st.length} Etappen-Starts (${Math.round((repeats / Math.max(1, st.length)) * 100)} %)`);
// Paket A: Echtzeit je Etappe (Abschuss bis Ende) und Auslauf-Anteil in Echtzeit
const wf = st.filter((s) => s.wallFly !== undefined);
if (wf.length) {
  console.log(`Echtzeit je Etappe (Abschuss → Ende): Median ${r1(med(wf.map((s) => s.wallFly)))} s, Auslauf nach letztem Sprung ${Math.round((sum(wf.map((s) => s.wallRollout)) / sum(wf.map((s) => s.wallFly))) * 100)} % der Echtzeit; Sofort-Ende ${wf.filter((s) => s.instant).length}/${wf.length}, Knapp ${wf.filter((s) => s.knapp).length}/${wf.length}`);
}
// Paket A: Eingaben zwischen zwei Etappen (Ende einer Etappe → Abschuss der nächsten, ohne Fahren). „direkt“ = ohne
// Laden/Ereignis/Tankstelle/Schatz/Werkbank/Schwarzmarkt dazwischen (Tutorial-Hinweise zählen mit)
const SHOPS = /run:(dealer|workbench|blackmarket|event|treasure|station|pick|replace)|garage/;
const gaps = runs.flatMap((r) => r.gaps || []);
if (gaps.length) {
  const direct = gaps.filter((x) => !Object.keys(x.where).some((k) => SHOPS.test(k)));
  const noTut = direct.map((x) => x.n - (x.where.tutorial || 0) - (x.where['map-move'] || 0));
  console.log(`Eingaben zwischen zwei Etappen: Median ${med(gaps.map((x) => x.n))} (alle ${gaps.length}), direkt ohne Sonderknoten Median ${med(direct.map((x) => x.n))} (${direct.length}; ≤ 2 in ${Math.round((direct.filter((x) => x.n <= 2).length / Math.max(1, direct.length)) * 100)} %), Entscheidungen (ohne Tutorial-Klicks und Pfeiltasten zum Markieren – am Handy ein Antippen) Median ${med(noTut)} (≤ 2 in ${Math.round((noTut.filter((n) => n <= 2).length / Math.max(1, noTut.length)) * 100)} %)`);
  const where = {};
  for (const x of direct) for (const [k, v] of Object.entries(x.where)) where[k] = (where[k] || 0) + v;
  console.log(`  direkt – Eingaben je Bildschirm: ${JSON.stringify(where)}`);
}
for (const run of runs) {
  const last = run.summary && run.summary.last;
  console.log(`  Run ${run.no}: ${run.stages.length} Etappen-Starts, ${run.stages.filter((s) => s.medal).length} geschafft, Ende ${last ? `Akt ${last.act} (${last.reason})` : '?'}, ${r1(run.wall / 60)} min, +${last ? last.scrap : '?'} ⚙ → ${last ? Math.round(last.scrap / (run.wall / 3600)) : '?'} ⚙/h (Bot-Tempo)`);
}
