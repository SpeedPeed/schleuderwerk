// Balance-Simulator: kalibriert die Zielmarken der Biome (data/biomes.js → targets) mit dem Bot (tools/sim/bot.mjs).
// Der Bot spielt headless mit der echten Etappen-Logik je Akt/Etage/Art viele Etappen – einmal mit dem
// Start-Loadout (neuer Spielstand), einmal mit einem „guten“ Loadout (Startteile auf Stufe 10).
//
// Kalibrier-Ziele (Median Distanz / Zielmarke):
//   Akt 1: Start-Loadout Etage 0 ≈ 1,3 → Etage 5 ≈ 0,92, Boss ≈ 0,71 (braucht Items/Upgrades)
//   Akt 2: gutes Loadout Etage 0 ≈ 0,94 → Etage 5 ≈ 0,80, Boss ≈ 0,71
//   Akt 3: gutes Loadout Etage 0 ≈ 0,84 → Etage 5 ≈ 0,71, Boss ≈ 0,64 (ohne Synergien kaum zu schaffen)
// Phase 6: Akt-1-Boss, Akt 2 und Akt 3 mit dem Progressions-Simulator (tools/sim/progression.mjs) auf die Zielzeiten
// abgestimmt (Ziele ×1,12 / ×1,06 / ×1,01 gegenüber Phase 3) – die Soll-Verhältnisse unten sind entsprechend kleiner.
// Die Zielmarken hängen leicht mit der Strecke zusammen (Bausteine liegen bis zur Gold-Marke), deshalb wird
// mehrmals hintereinander gemessen und angepasst.
//
// Aufruf: node tools/sim/calibrate.mjs [--n 30] [--iter 3] [--apply] [--verify-only]
//   --apply        schreibt die neuen Zielmarken in www/src/data/biomes.js
//   --verify-only  misst nur mit den aktuellen Zielmarken (keine Anpassung)
// Ergebnis: Tabelle in der Konsole und docs/BALANCE.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BIOMES } from '../../www/src/data/biomes.js';
import { generateStageSpec } from '../../www/src/physics/trackGen.js';
import { makeRng } from '../../www/src/core/rng.js';
import { lerp } from '../../www/src/core/math.js';
import { simSave, makeSimStage, playStage } from './bot.mjs';
const ITEMS_MARK = '<!-- items -->';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? Number(args[i + 1]) : def; };
const N = opt('n', 30);
const ITER = opt('iter', 3);
const APPLY = args.includes('--apply');
const VERIFY = args.includes('--verify-only');

// Soll-Verhältnis (Median Distanz / Ziel) je Akt: [Etage 0, Etage 5, Boss], Loadout der Kalibrierung
const GOALS = {
  1: { loadout: 'start', f0: 1.3, f5: 0.92, boss: 0.714 },
  2: { loadout: 'gut', f0: 0.943, f5: 0.8, boss: 0.71 },
  3: { loadout: 'gut', f0: 0.84, f5: 0.714, boss: 0.641 },
};
const SAVES = { start: simSave('start'), gut: simSave('gut') };

const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const round5 = (x) => Math.max(5, Math.round(x / 5) * 5);

// Eine Konfiguration n-mal spielen
function measure(biome, kind, floor, loadout, n = N) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const bossId = kind === 'boss' ? biome.bosses[i % biome.bosses.length].id : null;
    const spec = generateStageSpec({ biome, kind, floor, rng: makeRng(`kal:${biome.id}:${kind}:${floor}:${i}`), bossId });
    const sim = makeSimStage({ spec, biome, save: SAVES[loadout], seed: 7000 + i });
    const r = playStage(sim.stage, () => sim.result, { seed: 31 * i + floor });
    rows.push({ dist: r.dist, ratio: r.dist / r.target, medal: r.medal, dmg: r.damageTaken / r.durabilityMax, reason: r.reason, time: r.time, target: r.target });
  }
  return {
    n,
    target: rows[0].target,
    dist: median(rows.map((r) => r.dist)),
    ratio: median(rows.map((r) => r.ratio)),
    p25: pct(rows.map((r) => r.ratio), 0.25),
    p75: pct(rows.map((r) => r.ratio), 0.75),
    cleared: rows.filter((r) => r.medal).length / n,
    gold: rows.filter((r) => r.medal === 'gold').length / n,
    dmg: median(rows.map((r) => r.dmg)),
    dmgMean: rows.reduce((s, r) => s + r.dmg, 0) / n,
    fall: rows.filter((r) => r.reason === 'fall').length / n,
    time: median(rows.map((r) => r.time)),
  };
}

// Zielmarken eines Bioms aus den Messungen ableiten
function calibrateBiome(biome) {
  const g = GOALS[biome.act];
  const stage = [];
  for (let f = 0; f < 6; f++) {
    const m = measure(biome, 'stage', f, g.loadout);
    stage.push(m.dist / lerp(g.f0, g.f5, f / 5));
  }
  const boss = measure(biome, 'boss', 6, g.loadout).dist / g.boss;
  // Zielmarken steigen innerhalb eines Akts nie; Boss mindestens 10 % über Etage 5
  for (let f = 1; f < 6; f++) stage[f] = Math.max(stage[f], stage[f - 1]);
  return { stage: stage.map(round5), boss: round5(Math.max(boss, stage[5] * 1.1)) };
}

function fmtPct(x) { return `${Math.round(x * 100)} %`; }
function fmtR(x) { return x.toFixed(2).replace('.', ','); }

const t0 = Date.now();
if (!VERIFY) {
  for (let it = 1; it <= ITER; it++) {
    for (const b of BIOMES) {
      const t = calibrateBiome(b);
      b.targets.stage = t.stage;
      b.targets.boss = t.boss;
      console.log(`Durchgang ${it}: ${b.id} Ziele [${t.stage.join(', ')}] Boss ${t.boss}`);
    }
  }
}

// Prüf-Messung: beide Loadouts, alle Etagen, Elite (ab Etage 2), Boss
const table = [];
for (const b of BIOMES) {
  for (const loadout of ['start', 'gut']) {
    for (let f = 0; f < 6; f++) table.push({ biome: b, act: b.act, kind: 'stage', floor: f, loadout, ...measure(b, 'stage', f, loadout) });
    for (let f = 2; f < 6; f++) table.push({ biome: b, act: b.act, kind: 'elite', floor: f, loadout, ...measure(b, 'elite', f, loadout, Math.max(10, N >> 1)) });
    table.push({ biome: b, act: b.act, kind: 'boss', floor: 6, loadout, ...measure(b, 'boss', 6, loadout) });
  }
}
const secs = ((Date.now() - t0) / 1000).toFixed(0);

// Konsole
for (const r of table) {
  console.log(`${r.biome.id.padEnd(15)} ${r.kind.padEnd(5)} E${r.floor} ${r.loadout.padEnd(5)} Ziel ${String(r.target).padStart(5)} m  Median ${String(Math.round(r.dist)).padStart(5)} m  ×${fmtR(r.ratio)} (${fmtR(r.p25)}–${fmtR(r.p75)})  geschafft ${fmtPct(r.cleared).padStart(5)}  Gold ${fmtPct(r.gold).padStart(5)}  Schaden ${fmtPct(r.dmg).padStart(4)}  Sturz ${fmtPct(r.fall)}  ${r.time.toFixed(0)} s`);
}

// docs/BALANCE.md
const lines = [];
lines.push('# Schleuderwerk 2 – Balance (Zielmarken)');
lines.push('');
lines.push(`> Erzeugt von \`node tools/sim/calibrate.mjs\` (${N} Etappen je Zeile, Elite ${Math.max(10, N >> 1)}; Rechenzeit ${secs} s). Nicht von Hand bearbeiten – neu erzeugen.`);
lines.push('');
lines.push('## Verfahren');
lines.push('');
lines.push('- Ein Bot (`tools/sim/bot.mjs`) spielt headless mit der echten Etappen-Logik (`stage/stage.js`, Strecke aus `physics/trackGen.js`): Abschuss meist im grünen Bereich (60 %), Winkel 30–42°, richtet die Kiste vor jeder Landung aus, boostet in der Luft nach vorn (Reserve 35 % Treibstoff, Hitze < 72 %), nimmt vor Schluchten Anlauf, springt mit dem Hüpfer über Hindernisse, geschlossene Pressen und an Schluchtkanten, gibt bei Blitzwarnungen Gas. Ohne Items – ihre Wirkung misst `tools/sim/items.mjs` (Abschnitt „Items“ unten).');
lines.push('- **Start-Loadout** = neuer Spielstand (Seifenkiste, Startteile Stufe 0, Boost + Hüpfer). **Gutes Loadout** = dieselben Startteile auf Stufe 10.');
lines.push('- Jede Etappe beginnt mit voller Haltbarkeit (Schaden = Anteil der max. Haltbarkeit in dieser einen Etappe).');
lines.push('- Zielmarken je Etage = Median-Distanz ÷ Soll-Verhältnis (linear von Etage 0 bis 5), danach innerhalb eines Akts nie fallend, Boss ≥ 1,1 × Etage 5, auf 5 m gerundet. Mehrere Durchgänge, weil die Bausteine bis zur Gold-Marke verteilt werden.');
lines.push('');
lines.push('| Akt | Kalibriert mit | Etage 0 | Etage 5 | Boss |');
lines.push('|---|---|---|---|---|');
for (const a of [1, 2, 3]) { const g = GOALS[a]; lines.push(`| ${a} | ${g.loadout === 'start' ? 'Start-Loadout' : 'gutem Loadout'} | ×${fmtR(g.f0)} | ×${fmtR(g.f5)} | ×${fmtR(g.boss)} |`); }
lines.push('');
lines.push('## Zielmarken (data/biomes.js)');
lines.push('');
lines.push('| Biom | Etage 0–5 (Bronze, m) | Elite | Boss | Silber / Gold |');
lines.push('|---|---|---|---|---|');
for (const b of BIOMES) lines.push(`| ${b.name} (Akt ${b.act}) | ${b.targets.stage.join(' · ')} | ×${fmtR(b.targets.eliteMult)} | ${b.targets.boss} | ×${fmtR(b.medals.silver)} / ×${fmtR(b.medals.gold)} |`);
lines.push('');
lines.push('## Messung');
lines.push('');
lines.push('Verhältnis = Distanz ÷ Zielmarke (Median, in Klammern 25.–75. Perzentil). „Geschafft“ = mindestens Bronze. Schaden = Median des Haltbarkeitsverlusts einer Etappe.');
lines.push('');
for (const b of BIOMES) {
  lines.push(`### ${b.name} (Akt ${b.act})`);
  lines.push('');
  lines.push('| Art | Etage | Loadout | Ziel | Median | Verhältnis | geschafft | Gold | Schaden | Sturz | Dauer |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of table.filter((x) => x.biome === b)) {
    lines.push(`| ${r.kind === 'stage' ? 'Etappe' : r.kind === 'elite' ? 'Elite' : 'Boss'} | ${r.kind === 'boss' ? '–' : r.floor} | ${r.loadout} | ${r.target} m | ${Math.round(r.dist)} m | ×${fmtR(r.ratio)} (${fmtR(r.p25)}–${fmtR(r.p75)}) | ${fmtPct(r.cleared)} | ${fmtPct(r.gold)} | ${fmtPct(r.dmg)} | ${fmtPct(r.fall)} | ${r.time.toFixed(0)} s |`);
  }
  lines.push('');
}
const key = (a, k, f, l) => table.find((r) => r.act === a && r.kind === k && r.floor === f && r.loadout === l);
const a1 = key(1, 'stage', 0, 'start'), a1b = key(1, 'boss', 6, 'start'), a2 = key(2, 'stage', 0, 'gut');
lines.push('## Prüfpunkte');
lines.push('');
lines.push(`- Start-Loadout, Akt 1, Etage 0: Median ×${fmtR(a1.ratio)} (Soll ≈ 1,3).`);
lines.push(`- Start-Loadout, Akt-1-Boss: Median ×${fmtR(a1b.ratio)} (Soll ≈ 0,71 – braucht Items/Upgrades).`);
lines.push(`- Gutes Loadout, Akt 2, Etage 0: Median ×${fmtR(a2.ratio)} (Soll ≈ 0,94).`);
const normal = table.filter((r) => r.kind === 'stage' && r.floor <= 1 && r.loadout === 'start' && r.act === 1);
lines.push(`- Schaden einer normalen Etappe (Akt 1, Etage 0–1, Start-Loadout, Bot ohne grobe Fehler): Median ${normal.map((r) => fmtPct(r.dmg)).join(' / ')} (Soll ≤ 4 %).`);
lines.push('');
// Abschnitt „Items“ (tools/sim/items.mjs, hinter der Marke) bleibt erhalten
const balFile = path.join(ROOT, 'docs', 'BALANCE.md');
const prev = fs.existsSync(balFile) ? fs.readFileSync(balFile, 'utf8') : '';
const mark = prev.indexOf(ITEMS_MARK);
fs.writeFileSync(balFile, lines.join('\n') + (mark >= 0 ? `\n${prev.slice(mark)}` : ''));
console.log(`\ndocs/BALANCE.md geschrieben (${secs} s)`);

// Zielmarken in data/biomes.js übernehmen
if (APPLY) {
  const file = path.join(ROOT, 'www', 'src', 'data', 'biomes.js');
  let src = fs.readFileSync(file, 'utf8');
  for (const b of BIOMES) {
    const re = new RegExp(`(id: '${b.id}',[\\s\\S]*?targets: \\{ stage: \\[)[^\\]]*(\\], eliteMult: [\\d.]+, boss: )\\d+`);
    if (!re.test(src)) { console.log(`✗ Zielmarken von ${b.id} nicht gefunden`); continue; }
    src = src.replace(re, `$1${b.targets.stage.join(', ')}$2${b.targets.boss}`);
  }
  fs.writeFileSync(file, src);
  console.log('Zielmarken in www/src/data/biomes.js übernommen');
}
