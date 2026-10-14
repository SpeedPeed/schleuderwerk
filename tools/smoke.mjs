// Playwright-Rauchtest für Schleuderwerk.
// Startet einen eigenen HTTP-Server für www/, öffnet das Spiel im Hochformat (412×915, Touch),
// spielt eine Etappe (Halten → Loslassen, Neigen, Boost), wartet auf die Auswertung, geht zurück in die
// Werkstatt und kauft ein Upgrade. Geprüft wird:
//   - keine Konsolenfehler / pageerrors
//   - das Auto liegt in JEDEM 100-ms-Sample im Bild (window.__game.carScreen())
//   - Abschuss, Neigen (auch Multi-Touch), Boost (Knopf + Leertaste) und Kauf funktionieren
// Aufruf: node tools/smoke.mjs   → Exit-Code 0 bei Erfolg. Screenshots: /tmp/sw-smoke/*.png
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch (_) { /* lokal nicht installiert */ }
  return require('/opt/node22/lib/node_modules/playwright');
}
const { chromium } = loadPlaywright();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'www');
const SHOTS = '/tmp/sw-smoke';
const W = 412, H = 915;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

// ---------- kleiner Webserver ----------
function startServer() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.normalize(path.join(ROOT, url));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('nicht gefunden'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const log = (...a) => console.log('•', ...a);
function check(cond, msg) {
  if (cond) log('OK  ', msg);
  else { failures.push(msg); console.log('✗ FEHLER', msg); }
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}/`;
  log('Server', base);

  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id]) => ({ x, y, id })) });
  const g = (fn, arg) => page.evaluate(fn, arg);
  const shot = async (name) => { await page.screenshot({ path: `${SHOTS}/${name}.png` }); log('Screenshot', `${SHOTS}/${name}.png`); };

  try {
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.state === 'workshop', null, { timeout: 15000 });
    await sleep(800);

    // Alle 100 ms (im Spiel selbst gemessen): Wo ist das Auto auf dem Bildschirm?
    await g(() => {
      window.__samples = [];
      setInterval(() => {
        const gm = window.__game;
        const s = gm.carScreen();
        window.__samples.push({ state: gm.state, phase: gm.stage ? gm.stage.phase : null, x: s.x, y: s.y, w: innerWidth, h: innerHeight });
      }, 100);
    });
    await shot('01-werkstatt');

    // ---------- Etappe starten ----------
    const money0 = await g(() => window.__game.save.money);
    await page.tap('#workshop [data-id=start]');
    await page.waitForFunction(() => window.__game.state === 'stage' && window.__game.stage.phase === 'aim', null, { timeout: 5000 });
    check(true, 'Etappe gestartet (Zielen)');
    await sleep(400);

    // ---------- Abschuss: halten, hochziehen (steiler), im grünen Bereich loslassen ----------
    let fired = false;
    for (let attempt = 0; attempt < 4 && !fired; attempt++) {
      const a0 = await g(() => window.__game.stage.launch.angle);
      await touch('touchStart', [[W / 2, 620, 1]]);
      for (let k = 1; k <= 8; k++) { await touch('touchMove', [[W / 2, 620 - k * 12, 1]]); await sleep(16); }
      const a1 = await g(() => window.__game.stage.launch.angle);
      if (attempt === 0) check(a1 > a0 + 0.05, `Hochziehen macht den Winkel steiler (${(a0 * 57.3).toFixed(0)}° → ${(a1 * 57.3).toFixed(0)}°)`);
      await shot('02-zielen');
      // warten, bis die pendelnde Kraft im grünen Bereich ist (höchstens 4 s)
      const t0 = Date.now();
      let st = null;
      while (Date.now() - t0 < 4000) {
        st = await g(() => { const L = window.__game.stage.launch; return { inSweet: L.inSweetSpot, power: L.power, rising: L.t % 1.6 < 0.8 }; });
        if (st.inSweet) break;
        await sleep(4);
      }
      await touch('touchEnd', []);
      await sleep(150);
      const after = await g(() => ({ phase: window.__game.stage.phase, perfect: window.__game.stage.perfectLaunch, power: window.__game.stage.launch.power }));
      fired = after.phase === 'fly';
      log(`Abschuss-Versuch ${attempt + 1}: Kraft ${(after.power * 100).toFixed(0)} %, ${fired ? (after.perfect ? 'PERFEKT' : 'normal') : 'abgebrochen'}`);
    }
    check(fired, 'Abschuss per Halten/Loslassen');
    await sleep(500);
    await shot('03-flug');

    // ---------- Neigen: linke Hälfte = Nase hoch, rechte = Nase runter, beide = 0 ----------
    const rot0 = await g(() => window.__game.stage.vehicle.rotAccum);
    await touch('touchStart', [[80, 420, 2]]);
    await sleep(120);
    const tiltL = await g(() => window.__game.input.tilt);
    await sleep(400);
    const rot1 = await g(() => window.__game.stage.vehicle.rotAccum);
    await touch('touchStart', [[80, 420, 2], [W - 80, 420, 3]]);
    await sleep(80);
    const tiltBoth = await g(() => window.__game.input.tilt);
    await touch('touchEnd', [[W - 80, 420, 3]]);
    await touch('touchEnd', []);
    await touch('touchStart', [[W - 80, 300, 4]]);
    await sleep(120);
    const tiltR = await g(() => window.__game.input.tilt);
    await sleep(200);
    await touch('touchEnd', []);
    check(tiltL === 1, `linke Hälfte halten → tilt +1 (${tiltL})`);
    check(tiltR === -1, `rechte Hälfte halten → tilt −1 (${tiltR})`);
    check(tiltBoth === 0, `beide Hälften gleichzeitig → tilt 0 (${tiltBoth})`);
    check(rot1 > rot0 + 0.2 || (await g(() => window.__game.stage.phase)) !== 'fly', `Nase hebt sich beim Halten links (Δ ${(rot1 - rot0).toFixed(2)} rad)`);

    // ---------- Boost: Fähigkeits-Knopf halten, dann Leertaste ----------
    const box = await page.locator('#hud [data-id=boostbtn]').boundingBox();
    check(!!box && box.x + box.width <= W && box.y + box.height <= H, 'Boost-Knopf sichtbar unten rechts');
    const boostBefore = await g(() => window.__game.stage.vehicle.boost);
    await touch('touchStart', [[box.x + box.width / 2, box.y + box.height / 2, 5]]);
    await sleep(150);
    const boosting = await g(() => ({ b: window.__game.stage.vehicle.boosting, tilt: window.__game.input.tilt, phase: window.__game.stage.phase }));
    await sleep(900);
    await shot('04-boost');
    await touch('touchEnd', []);
    const boostAfter = await g(() => window.__game.stage.vehicle.boost);
    check(boosting.b || boosting.phase !== 'fly', `Boost-Knopf halten → Boost aktiv (${boosting.b}), Neigen dabei unbeeinflusst (tilt ${boosting.tilt})`);
    check(boostAfter < boostBefore, `Boost verbraucht Energie (${boostBefore.toFixed(0)} → ${boostAfter.toFixed(0)})`);
    await page.keyboard.down('Space');
    await sleep(150);
    const spaceBoost = await g(() => window.__game.stage.vehicle.boosting || window.__game.stage.vehicle.boost <= 0 || window.__game.stage.phase !== 'fly');
    await sleep(250);
    await page.keyboard.up('Space');
    check(spaceBoost, 'Leertaste = Boost');
    await page.keyboard.down('ArrowLeft');
    await sleep(100);
    const keyTilt = await g(() => window.__game.input.tilt);
    await page.keyboard.up('ArrowLeft');
    check(keyTilt === 1, 'Pfeil links = Nase hoch');

    // ---------- auf die Auswertung warten ----------
    let t0 = Date.now();
    let maxX = 0;
    while (Date.now() - t0 < 100000) {
      const s = await g(() => ({ state: window.__game.state, x: window.__game.stage ? window.__game.stage.vehicle.x : 0, ind: window.__game.camera.indicator.show }));
      maxX = Math.max(maxX, s.x);
      if (s.state === 'results') break;
      await sleep(250);
    }
    let state = await g(() => window.__game.state);
    if (state !== 'results') {
      log('Etappe dauert zu lange – über das Pause-Menü beenden');
      await page.tap('#hud [data-id=pause]');
      await sleep(300);
      await page.tap('#pause [data-a=quit]');
    }
    await page.waitForFunction(() => window.__game.state === 'results' && !document.getElementById('results').classList.contains('hidden'), null, { timeout: 10000 });
    check(true, `Auswertung erscheint (Strecke ≈ ${Math.round(maxX)} m)`);
    await sleep(1600);
    await shot('05-auswertung');
    const money1 = await g(() => window.__game.save.money);
    check(money1 > money0, `Geld verdient (${money0} → ${money1})`);

    // ---------- zurück in die Werkstatt, Upgrade kaufen ----------
    await page.tap('#results [data-id=ws]');
    await page.waitForFunction(() => window.__game.state === 'workshop', null, { timeout: 5000 });
    await sleep(400);
    let affordable = await page.locator('#workshop .btn-buy:not(.cant):not([disabled])').count();
    if (!affordable) {
      log('Noch kein Upgrade bezahlbar – Testgeld +1000');
      await g(() => { window.__game.save.money += 1000; window.__game.openWorkshop(); });
      await sleep(200);
      affordable = await page.locator('#workshop .btn-buy:not(.cant):not([disabled])').count();
    }
    const before = await g(() => ({ money: window.__game.save.money, ups: { ...window.__game.save.upgrades } }));
    const btn = page.locator('#workshop .btn-buy:not(.cant):not([disabled])').first();
    await btn.scrollIntoViewIfNeeded();
    await btn.tap();
    await sleep(300);
    const afterBuy = await g(() => ({ money: window.__game.save.money, ups: { ...window.__game.save.upgrades } }));
    const levels = (u) => Object.values(u).reduce((a, b) => a + b, 0);
    check(afterBuy.money < before.money && levels(afterBuy.ups) === levels(before.ups) + 1,
      `Upgrade gekauft (Geld ${before.money} → ${afterBuy.money}, Stufen ${levels(before.ups)} → ${levels(afterBuy.ups)})`);
    await shot('06-gekauft');

    // ---------- Langstrecke: ausgebautes Auto, Abschuss per Tastatur, Floating Origin, Boden-Pfeil ----------
    await g(() => Object.assign(window.__game.save.upgrades, { katapult: 30, motor: 30, tank: 30, aero: 30, fluegel: 20 }));
    await page.tap('#workshop [data-id=start]');
    await page.waitForFunction(() => window.__game.state === 'stage' && window.__game.stage.phase === 'aim', null, { timeout: 5000 });
    await sleep(300);
    const k0 = await g(() => window.__game.stage.launch.angle);
    await page.keyboard.down('ArrowUp');
    await sleep(300);
    await page.keyboard.up('ArrowUp');
    const k1 = await g(() => window.__game.stage.launch.angle);
    check(k1 > k0, `Pfeil hoch beim Zielen = steiler (${(k0 * 57.3).toFixed(0)}° → ${(k1 * 57.3).toFixed(0)}°)`);
    let keyFired = false;
    for (let attempt = 0; attempt < 4 && !keyFired; attempt++) {
      await page.keyboard.down('Space');
      const ts = Date.now();
      while (Date.now() - ts < 4000) {
        if (await g(() => window.__game.stage.launch.inSweetSpot)) break;
        await sleep(4);
      }
      await page.keyboard.up('Space');
      await sleep(150);
      keyFired = (await g(() => window.__game.stage.phase)) === 'fly';
    }
    check(keyFired, 'Abschuss per Leertaste halten/loslassen');
    await page.keyboard.down('Space');
    await sleep(2500);
    await page.keyboard.up('Space');
    const fly = await g(() => ({ v: window.__game.stage.vehicle.speed, x: window.__game.stage.vehicle.x, origin: window.__game.origin }));
    log(`Langstrecke: ${fly.x.toFixed(0)} m, ${fly.v.toFixed(1)} m/s, Render-Ursprung ${fly.origin} m`);
    await shot('07-langstrecke');
    // Sprung weit nach vorn und hoch hinauf: Floating Origin, Zoom-Grenze und Boden-Pfeil
    await g(() => {
      const v = window.__game.stage.vehicle, tr = window.__game.track;
      v.x += 6000; v.y = tr.heightAt(v.x) + 600; v.vx = 70; v.vy = 5; v.onGround = false;
    });
    await sleep(1500);
    const far = await g(() => ({
      origin: window.__game.origin, x: window.__game.stage.vehicle.x,
      ind: !document.querySelector('#hud [data-id=ground]').classList.contains('hidden'),
      text: document.querySelector('#hud [data-id=ground]').textContent,
    }));
    check(far.origin > 5000 && Math.abs(far.x - far.origin) < 1000, `Floating Origin springt mit (Auto ${far.x.toFixed(0)} m, Ursprung ${far.origin} m)`);
    check(far.ind && /^Boden ↓ [\d.]+ m$/.test(far.text), `Boden-Pfeil sichtbar („${far.text}“)`);
    await shot('08-weit-und-hoch');
    t0 = Date.now();
    while (Date.now() - t0 < 30000 && !(await g(() => window.__game.stage.vehicle.onGround || window.__game.state !== 'stage'))) await sleep(200);
    await sleep(600);
    await shot('09-landung-weit');
    if ((await g(() => window.__game.state)) === 'stage') {
      await page.tap('#hud [data-id=pause]');
      await sleep(300);
      await page.tap('#pause [data-a=quit]');
    }
    await page.waitForFunction(() => window.__game.state === 'results', null, { timeout: 10000 });
    await sleep(1500);
    await shot('10-auswertung-weit');
    await page.tap('#results [data-id=ws]');
    await page.waitForFunction(() => window.__game.state === 'workshop', null, { timeout: 5000 });
    check(true, 'zweite Etappe beendet, zurück in der Werkstatt');
    await sleep(600);
    check((await g(() => window.__game.origin)) === 0, 'Render-Ursprung in der Werkstatt wieder bei 0');
    await shot('11-werkstatt-nach-weitflug');

    // ---------- Welt 2 (durch den Weitflug freigeschaltet): Weltwechsel, Abschuss, Wind/Thermik ----------
    await page.tap('#workshop [data-id=wnext]');
    await sleep(500);
    const worldId = await g(() => window.__game.save.world);
    check(worldId === 'desert', `Weltwechsel auf die Glutwüste (${worldId})`);
    await page.tap('#workshop [data-id=start]');
    await page.waitForFunction(() => window.__game.state === 'stage' && window.__game.stage.phase === 'aim', null, { timeout: 5000 });
    await touch('touchStart', [[W / 2, 600, 7]]);
    await sleep(700);
    await touch('touchEnd', []);
    await sleep(200);
    if ((await g(() => window.__game.stage.phase)) === 'aim') {
      await touch('touchStart', [[W / 2, 600, 8]]);
      await sleep(600);
      await touch('touchEnd', []);
    }
    check((await g(() => window.__game.stage.phase)) !== 'aim', 'Abschuss in Welt 2');
    await touch('touchStart', [[60, 500, 9], [box.x + box.width / 2, box.y + box.height / 2, 10]]);
    await sleep(1200);
    const multi = await g(() => ({ tilt: window.__game.input.tilt, boost: window.__game.input.boost }));
    await touch('touchEnd', []);
    check(multi.tilt === 1 && multi.boost, `Multi-Touch: links neigen + Boost-Knopf gleichzeitig (tilt ${multi.tilt}, boost ${multi.boost})`);
    await sleep(1500);
    await shot('12-welt2');
    if ((await g(() => window.__game.state)) === 'stage') {
      await page.tap('#hud [data-id=pause]');
      await sleep(300);
      await page.tap('#pause [data-a=quit]');
    }
    await page.waitForFunction(() => window.__game.state === 'results', null, { timeout: 15000 });
    await sleep(1200);
    await page.tap('#results [data-id=ws]');
    await page.waitForFunction(() => window.__game.state === 'workshop', null, { timeout: 5000 });

    // ---------- Auswertung der 100-ms-Samples ----------
    const fps = await g(() => new Promise((res) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); }));
    log(`Bildrate (Software-Rendering, Werkstatt): ~${fps} fps`);
    const samples = await g(() => window.__samples);
    const inGame = samples.filter((s) => s.state !== 'workshop');
    const outside = samples.filter((s) => !(s.x >= 0 && s.x <= s.w && s.y >= 0 && s.y <= s.h));
    log(`${samples.length} Samples (${inGame.length} in der Etappe), x ${Math.min(...inGame.map((s) => s.x)).toFixed(0)}…${Math.max(...inGame.map((s) => s.x)).toFixed(0)}, y ${Math.min(...inGame.map((s) => s.y)).toFixed(0)}…${Math.max(...inGame.map((s) => s.y)).toFixed(0)}`);
    check(inGame.length > 20, 'genug Samples während der Etappe');
    check(outside.length === 0, `Auto in jedem 100-ms-Sample im Bild${outside.length ? ` – ${outside.length}× draußen, z. B. ${JSON.stringify(outside[0])}` : ''}`);
  } catch (e) {
    failures.push(`Ausnahme: ${e.message}`);
    console.log('✗ Ausnahme', e);
    try { await shot('99-fehler'); } catch (_) { /* egal */ }
  }

  check(errors.length === 0, `keine Konsolenfehler/pageerrors${errors.length ? `:\n    ${errors.slice(0, 10).join('\n    ')}` : ''}`);
  await browser.close();
  server.close();
  console.log(failures.length ? `\nRAUCHTEST FEHLGESCHLAGEN (${failures.length})` : '\nRAUCHTEST BESTANDEN');
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
