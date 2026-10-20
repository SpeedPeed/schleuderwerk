// Playtest im echten Browser (Playwright + Chromium/SwiftShader) mit der PC-Datei dist/Schleuderwerk-PC.html.
// Spielt komplette Runs NUR über echte Eingaben: Tastatur (Leertaste laden/loslassen, ↑ Winkel, ←/→ neigen,
// Leertaste Boost, Ziffern = Fähigkeiten/Auswahl, Enter = Hauptaktion, Pfeile auf der Karte) und für Shop-Käufe /
// Garage-Verbesserungen Mausklicks. Die „Entscheidungen“ trifft ein einfacher Kopf (wie tools/sim/bot.mjs + Synergie-
// Auswahl), der den Spielzustand über window.__game LIEST – geschrieben wird nur über Eingaben.
// Ausnahme (dokumentiert): Grafikqualität „Niedrig“ + Schatten aus, damit Software-WebGL > 20 Bilder/s schafft
// (Spielzeit = Echtzeit; darunter würde STAGE.maxFrameDt die Spielzeit dehnen).
//
// Gemessen: Spielzeit je Etappe (Stage.time) und Echtzeit je Bildschirm (Zustandswechsel), Anteil Flug / Boden /
// Auslaufen nach dem letzten Sprung / Zeit nach Erreichen der Zielmarke, Eingaben je Bildschirm, Ergebnisse,
// Item-Auslösungen und Ketten. Bildschirmfotos und JSON in --out.
//
// Aufruf: node tools/playtest/browser-play.mjs [--runs 3] [--out <Ordner>] [--shots <Ordner>] [--w 412 --h 732] [--no-build]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = (() => { try { return require('playwright'); } catch { return require('/opt/node22/lib/node_modules/playwright'); } })();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILE = path.join(ROOT, 'dist', 'Schleuderwerk-PC.html');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const RUNS = Number(opt('runs', 3));
const OUT = path.resolve(opt('out', '/tmp/sw-playtest'));
const SHOTS = path.resolve(opt('shots', path.join(OUT, 'shots')));
const W = Number(opt('w', 412)), H = Number(opt('h', 732));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!args.includes('--no-build') || !fs.existsSync(FILE)) {
    const { buildPc } = await import('../build-pc.mjs');
    await buildPc({ quiet: true });
  }
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { if (!sessionStorage.getItem('sw-pt')) { try { localStorage.clear(); } catch {} sessionStorage.setItem('sw-pt', '1'); } });
  await page.goto(pathToFileURL(FILE).href);
  await page.waitForFunction(() => window.__game && window.__game.state === 'garage', null, { timeout: 60000 });
  const g = (fn, a) => page.evaluate(fn, a);
  // Grafik runter (siehe Kopf) – sonst nichts am Spielstand
  await g(() => { const s = window.__game.save.settings; s.quality = 'low'; s.shadows = false; window.__game.applySettings(); });

  // ---------- Bildschirm-Beobachter im Seitenkontext: Zustandswechsel mit Zeitstempel ----------
  await g(() => {
    window.__pt = { log: [], last: '' , samples: [] };
    setInterval(() => {
      const gm = window.__game;
      const k = gm.tutorial.isOpen ? `tutorial:${gm.tutorial.current}` : gm.runScreens.open ? `run:${gm.runScreens.kind}` : gm.state === 'stage' && gm.stage ? `stage:${gm.stage.phase}` : gm.state;
      if (k !== window.__pt.last) { window.__pt.log.push({ k, t: performance.now() }); window.__pt.last = k; }
      const s = gm.stage;
      if (gm.state === 'stage' && s && s.phase === 'fly') {
        const v = s.vehicle;
        window.__pt.samples.push({ t: s.time, w: performance.now(), g: v.onGround ? 1 : 0, x: v.maxX, sp: Math.hypot(v.vx, v.vy), f: v.fuel, b: v.boosting ? 1 : 0 });
      }
    }, 50);
  });

  const inputs = {};   // Eingaben je Bildschirmart
  const count = (k) => { inputs[k] = (inputs[k] || 0) + 1; };
  const kb = page.keyboard;
  let where = 'garage';
  const press = async (key, wait = 120) => { count(where); await kb.press(key); await sleep(wait); };
  const shotsTaken = new Set();
  const shot = async (name, force = false) => { if (!force && shotsTaken.has(name)) return; shotsTaken.add(name); await page.screenshot({ path: path.join(SHOTS, `${String(shotsTaken.size).padStart(2, '0')}-${name}.png`) }); };
  const snap = () => g(() => { const gm = window.__game; return { state: gm.state, tut: gm.tutorial.isOpen ? gm.tutorial.current : null, run: gm.runScreens.open ? gm.runScreens.kind : null, phase: gm.stage ? gm.stage.phase : null, modal: !!document.querySelector('.modal, .confirm') }; });

  // ---------- Entscheidungen (lesen) ----------
  const RAR = { common: 0, rare: 1, epic: 2, legendary: 3, cursed: -2 };
  const invTags = () => g(() => { const run = window.__game.run; const c = {}; for (const e of run.inventory) { for (const id of [e.itemId, e.hybrid].filter(Boolean)) { const it = window.__ptItems[id]; if (it) for (const t of it.tags) c[t] = (c[t] || 0) + 1; } } return c; });
  // Item-Tabelle aus den Node-Daten (gleiches Spiel, gleiche Daten)
  const { ITEMS } = await import('../../www/src/data/items.js');
  const ITEM = Object.fromEntries(ITEMS.map((i) => [i.id, { tags: i.tags, rarity: i.rarity, name: i.name }]));
  await g((t) => { window.__ptItems = t; }, ITEM);
  const score = (tags, id) => { const it = ITEM[id]; if (!it) return -9; return Math.max(...it.tags.map((t) => tags[t] || 0)) * 6 + RAR[it.rarity] * 5 + it.tags.length * 2; };

  const report = { viewport: `${W}x${H}`, runs: [], errors };
  const T0 = Date.now();

  for (let runNo = 1; runNo <= RUNS; runNo++) {
    _rk = runNo;   // Händler: dasselbe Item je Run nur einmal versuchen
    const run = { no: runNo, stages: [], screens: [], startWall: Date.now() };
    report.runs.push(run);
    where = 'garage';
    // Garage: Tutorial weg, Start
    for (let i = 0; i < 6; i++) { const s = await snap(); if (s.tut) { await shot(`tutorial-${s.tut}`); await press('Enter', 300); } else break; }
    await shot(`garage-run${runNo}`, true);
    await g(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });   // Fokus von Maus-Klicks lösen
    // Start: Enter = RUN STARTEN (Hinweise, die dazwischen aufgehen, werden mit Enter geschlossen)
    for (let i = 0; i < 10; i++) {
      const s = await snap();
      if (s.state !== 'garage') break;
      if (s.tut) { where = 'tutorial'; await shot(`tutorial-${s.tut}`); await press('Enter', 300); where = 'garage'; continue; }
      await press('Enter', 800);
    }
    let guard = 0;
    while (guard++ < 600) {
      const s = await snap();
      if (s.tut) { where = 'tutorial'; await shot(`tutorial-${s.tut}`); await press('Enter', 250); continue; }
      if (s.state === 'garage' && !s.run) break;   // Run vorbei
      if (s.run) { where = `run:${s.run}`; await handleRunScreen(s.run, runNo); continue; }
      if (s.state === 'map') { where = 'map'; await handleMap(); continue; }
      if (s.state === 'stage' && s.phase === 'aim') { where = 'stage'; await playStage(run); continue; }
      await sleep(100);
    }
    run.wall = (Date.now() - run.startWall) / 1000;
    run.summary = await g(() => { const h = window.__game.save.meta; return { scrap: h.scrap, blueprints: h.blueprints, cores: h.cores, last: (window.__game.save.history || [])[0] || null }; });
    console.log(`Run ${runNo}: ${run.stages.length} Etappen, ${run.wall.toFixed(0)} s Echtzeit, Schrott jetzt ${run.summary.scrap}`);
    // Garage: Schrott in die billigsten Verbesserungen stecken (Mausklick auf ▲)
    where = 'garage-shop';
    for (let k = 0; k < 40; k++) {
      const btn = await page.$$('#garage .sr-up:not(.cant)');
      if (!btn.length) break;
      const costs = await Promise.all(btn.map((b) => b.textContent()));
      let bi = 0, bc = Infinity;
      costs.forEach((c, i) => { const n = Number((c.match(/[\d.]+/) || ['0'])[0].replace('.', '')); if (n < bc) { bc = n; bi = i; } });
      count(where);
      await btn[bi].click();
      await sleep(150);
    }
    run.partLevels = await g(() => ({ ...window.__game.save.garage.partLevels }));
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  }

  // Bildschirm-Zeiten aus dem Beobachter
  report.screenLog = await g(() => window.__pt.log);
  report.inputs = inputs;
  report.totalWall = (Date.now() - T0) / 1000;
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  await browser.close();
  console.log(`fertig: ${OUT}/report.json (${report.totalWall.toFixed(0)} s), Fehler: ${errors.length}`);

  // ======================================================================
  async function handleMap() {
    const st = await g(() => { const gm = window.__game; const run = gm.run; return { reach: gm.reachable(), hp: run.durability, hpMax: gm.runLogic.durabilityMax(run), bolts: run.bolts, act: run.act, a: document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.node || null : null, fuse: gm.shops.Workbench.fusionOptions(run).some((f) => f.kind === 'tier') }; });
    await shot(`map-act${st.act}`);
    const hp = st.hp / st.hpMax;
    const sc = (n) => ({ station: 10, boss: 10, dealer: st.bolts >= 45 ? 4 : 1, treasure: 3, workbench: st.fuse ? 3 : 0.8, event: 2, stage: 2.2, elite: hp > 0.7 ? 2.4 : 0.6, blackmarket: 0.5 }[n.type] ?? 1) + Math.random() * 0.8;
    const target = [...st.reach].sort((a, b) => sc(b) - sc(a))[0];
    run_nodeChoices.push({ options: st.reach.map((n) => n.type), chosen: target.type });
    // Fokus per Pfeiltasten auf den Zielknoten
    if (!st.a) await press('Enter', 200);   // Enter ohne Markierung = ersten erreichbaren Knoten markieren
    for (let i = 0; i < 8; i++) {
      const a = await g(() => (document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.node || null : null));
      if (a === target.id) break;
      await press(i < 4 ? 'ArrowRight' : 'ArrowLeft', 120);
    }
    await press('Enter', 500);
  }

  async function handleRunScreen(kind, runNo) {
    await shot(`screen-${kind}`);
    if (kind === 'intro' || kind === 'act' || kind === 'end') { if (kind === 'end') await shot(`runende-${runNo}`, true); await press('Enter', 400); return; }
    if (kind === 'result') { await sleep(300); await shot(`ergebnis-run${runNo}`); await press('Enter', 400); return; }
    if (kind === 'choice') {
      const ch = await g(() => { const r = window.__game.run; const p = r.pendingChoices && r.pendingChoices[0]; return p ? p.items : []; });
      const tags = await invTags();
      if (!ch.length) { await press('KeyS', 300); return; }
      let bi = 0, bs = -Infinity; ch.forEach((id, i) => { const v = score(tags, id); if (v > bs) { bs = v; bi = i; } });
      run_itemChoices.push({ offered: ch.map((id) => ITEM[id] && ITEM[id].tags.join('+')), took: bi, invTags: tags });
      await press(`Digit${bi + 1}`, 400);
      return;
    }
    if (kind === 'replace') {
      // schwächsten Platz ersetzen (am wenigsten vertretener Tag)
      const tags = await invTags();
      const inv = await g(() => window.__game.run.inventory.map((e) => e.itemId));
      let slot = 0, low = Infinity; inv.forEach((id, i) => { const v = score(tags, id); if (v < low) { low = v; slot = i; } });
      const ok = await g((n) => !!document.querySelector(`#runui [data-rep="${n}"]`), slot);
      if (ok) await press(`Digit${slot + 1}`, 400); else await press('Escape', 300);
      return;
    }
    if (kind === 'pick') { await press('Digit1', 400); return; }
    if (kind === 'station') {
      const hp = await g(() => window.__game.run.durability / window.__game.runLogic.durabilityMax(window.__game.run));
      await press(hp < 0.7 ? 'Digit1' : 'Digit2', 400); return;
    }
    if (kind === 'event') {
      const has = await g(() => ({ opts: [...document.querySelectorAll('#runui [data-opt]')].map((b) => !b.disabled && !b.classList.contains('cant')), cont: !!document.querySelector('#runui [data-a=cont], #runui [data-a=pending]') }));
      if (has.cont) { await press('Enter', 400); return; }
      const i = Math.max(0, has.opts.indexOf(true));
      await press(`Digit${i + 1}`, 400); return;
    }
    if (kind === 'treasure') { await press('Enter', 400); return; }
    if (kind === 'dealer') {
      const offers = await g(() => { const v = window.__game.shops.Dealer.dealerView(window.__game.run); return v.offers.map((o) => ({ i: o.index, id: o.itemId, can: o.canAfford && !o.sold, price: o.price })); });
      const tags = await invTags();
      const best = offers.filter((o) => o.can).sort((a, b) => score(tags, b.id) - score(tags, a.id))[0];
      if (best && !run_bought.has(`${runNoKey()}:${best.id}`)) {
        run_bought.add(`${runNoKey()}:${best.id}`);
        const b = await page.$(`#runui [data-buy="${best.i}"]`);
        if (b) { count(where); await b.click(); await sleep(400); return; }
      }
      await press('Enter', 400); return;
    }
    if (kind === 'workbench') {
      const btns = await page.$$('#runui [data-fuse]:not([disabled])');
      for (const b of btns) { if (/Verschmelzen/.test(await b.textContent())) { count(where); await b.click(); await sleep(400); return; } }
      await press('Enter', 400); return;
    }
    if (kind === 'blackmarket') { await press('Enter', 400); return; }
    await press('Enter', 400);
  }

  async function playStage(run) {
    const info0 = await g(() => { const s = window.__game.stage; const jump = s.abilities.slots.findIndex((x) => x.def.id === 'sprung'); window.__pt.samples = []; window.__pt.ev = { depth: {}, chains: 0 }; s.onEvent = (n, d, depth) => { window.__pt.ev.depth[depth] = (window.__pt.ev.depth[depth] || 0) + 1; }; return { kind: s.kind, target: s.target, medals: s.medals, features: (s.spec.features || []).map((f) => f.type), weather: s.weather && s.weather.name, jump, boostSlot: window.__game.input.boostSlot, wall: performance.now() }; });
    const wall0 = Date.now();
    // Zielen: ↑ kurz (≈ 36°), Leertaste halten bis grüner Bereich
    await sleep(250);
    await kb.down('ArrowUp'); await sleep(90); await kb.up('ArrowUp'); count('stage');
    let fired = false, launchPresses = 0;
    for (let t = 0; t < 4 && !fired; t++) {
      await kb.down('Space'); count('stage'); launchPresses++;
      const ts = Date.now();
      while (Date.now() - ts < 4000 && !(await g(() => window.__game.stage && window.__game.stage.launch.inSweetSpot))) await sleep(3);
      await kb.up('Space');
      await sleep(150);
      fired = await g(() => !window.__game.stage || window.__game.stage.phase !== 'aim');
    }
    const perfect = await g(() => !!(window.__game.stage && window.__game.stage.perfectLaunch));
    if (!shotsTaken.has('flug')) { await sleep(600); await shot('flug'); }
    // Flug: Kopf wie tools/sim/bot.mjs, Ausgabe nur über Tasten
    const held = { ArrowLeft: false, ArrowRight: false, Space: false };
    const set = async (k, on) => { if (held[k] === on) return; held[k] = on; if (on) { count('stage'); await kb.down(k); } else await kb.up(k); };
    let jumpCd = 0, midShot = false;
    for (let i = 0; i < 6000; i++) {
      const d = await g(({ jump }) => {
        const gm = window.__game; const s = gm.stage;
        if (gm.state !== 'stage' || !s || s.phase !== 'fly') return { done: true };
        const v = s.vehicle, st = s.stats, o = s.objects, tr = s.track;
        let tilt = 0, boost = false, hop = false;
        const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
        if (!v.onGround && !v.loop) {
          const lead = Math.min(0.6, Math.max(0.15, (v.y - tr.heightAt(v.x)) / 40));
          const dd = wrap(Math.atan(tr.slopeAt(v.x + v.vx * lead)) - v.angle);
          const u = dd * 3 - v.w * 0.45;
          tilt = u > 0.15 ? 1 : u < -0.15 ? -1 : 0;
          const fwd = Math.abs(v.angle) < 0.35 || (v.angle < 0 && v.angle > -0.6);
          boost = fwd && v.fuel > st.fuelMax * 0.35 && v.vy > -4 && v.heat < st.heatMax * 0.72;
        } else {
          const gp = tr.gaps.find((x) => x.rs - 40 < v.x && v.x < x.edge);
          if (gp && v.fuel > 0 && v.s < 22 && v.heat < st.heatMax * 0.8) boost = true;
          const sp = Math.max(4, v.s);
          const near = (x, w) => x - w / 2 - v.x > 0 && x - w / 2 - v.x < sp * 0.42 + 1.2;
          hop = jump >= 0 && (o.obstacles.some((ob) => ob.alive && near(ob.x, ob.w)) || o.crushers.some((c) => near(c.x, c.w) && c.lift < 3.8) || !!tr.gaps.find((x) => x.edge - v.x > 0 && x.edge - v.x < sp * 0.12 + 0.5));
        }
        for (const k of o.strikes) if (k.t > 0 && Math.abs(v.x + v.vx * k.t - k.x) < 5.6 && v.heat < st.heatMax * 0.85) boost = true;
        return { done: false, tilt, boost, hop, t: s.time, x: v.maxX };
      }, { jump: info0.jump });
      if (d.done) break;
      await set('ArrowLeft', d.tilt === 1);
      await set('ArrowRight', d.tilt === -1);
      await set('Space', d.boost);
      jumpCd -= 0.03;
      if (d.hop && jumpCd <= 0 && info0.jump >= 0) { jumpCd = 0.6; count('stage'); await kb.press(`Digit${info0.jump + 1}`); }
      if (!midShot && d.t > 6) { midShot = true; if (!shotsTaken.has('flug-spaet')) await shot('flug-spaet'); }
      await sleep(25);
    }
    for (const k of Object.keys(held)) await set(k, false);
    const end = await g(() => {
      const s = window.__game.stage; const v = s.vehicle;
      return { time: s.time, dist: Math.round(v.maxX), medal: s.medal, triggers: s.triggerCount, maxChain: s.maxChain, flips: s.stunts ? s.stunts.flips : 0, ev: window.__pt.ev, samples: window.__pt.samples, bolts: Math.floor(s.bolts), crates: s.crates, dmg: Math.round(v.damageTaken) };
    });
    const wallStage = (Date.now() - wall0) / 1000;
    // Auswertung der Proben: Flug/Boden, Zeit nach Bronze, Auslaufen nach letzter Landung
    const S = end.samples;
    let air = 0, ground = 0, afterBronze = 0, lastAir = 0, slowGround = 0;
    for (let i = 1; i < S.length; i++) {
      const dt = S[i].t - S[i - 1].t;
      if (S[i].g) ground += dt; else { air += dt; lastAir = S[i].t; }
      if (S[i].x >= info0.target) afterBronze += dt;
      if (S[i].g && S[i].sp < 10) slowGround += dt;
    }
    const rollout = S.length ? S[S.length - 1].t - lastAir : 0;
    const rec = { kind: info0.kind, target: info0.target, dist: end.dist, ratio: +(end.dist / info0.target).toFixed(2), medal: end.medal, perfect, launchPresses, gameTime: +end.time.toFixed(1), wallStage: +wallStage.toFixed(1), air: +air.toFixed(1), ground: +ground.toFixed(1), afterBronze: +afterBronze.toFixed(1), rolloutAfterLastJump: +rollout.toFixed(1), slowGround: +slowGround.toFixed(1), features: info0.features, weather: info0.weather, triggers: end.triggers, maxChain: end.maxChain, evDepth: end.ev.depth, bolts: end.bolts, crates: end.crates, dmg: end.dmg };
    run.stages.push(rec);
    console.log(`  ${rec.kind} Ziel ${rec.target} m → ${rec.dist} m (${rec.medal || 'verfehlt'}) ${rec.gameTime}s Spiel, Flug ${rec.air}s, Auslauf ${rec.rolloutAfterLastJump}s, nach Bronze ${rec.afterBronze}s, Ketten max ${rec.maxChain}`);
  }
}

// kleine Zustände für die Auswertung (je Prozess)
const run_nodeChoices = [];
const run_itemChoices = [];
const run_bought = new Set();
let _rk = 0;
const runNoKey = () => _rk;
process.on('exit', () => {
  try {
    const OUTF = path.join(OUT, 'decisions.json');
    fs.writeFileSync(OUTF, JSON.stringify({ nodeChoices: run_nodeChoices, itemChoices: run_itemChoices }, null, 1));
  } catch {}
});

main().catch((e) => { console.error(e); process.exit(1); });
