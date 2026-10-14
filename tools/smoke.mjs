// Playwright-Rauchtest für Schleuderwerk.
// Startet einen eigenen HTTP-Server für www/, öffnet das Spiel im Hochformat (412×915, Touch) und spielt:
//   Garage → Dev-Menü (7× auf die Versionsnummer) → alles freischalten → alle 9 Chassis ansehen (Bildschirmfotos)
//   → ein Teil kaufen, verbessern, ausrüsten → Fähigkeiten wählen → Testfahrt (Abschuss per Halten/Loslassen,
//   Neigen, Boost-Knopf + 2. Fähigkeit gleichzeitig per Multi-Touch, Leertaste) → Auswertung → zurück in die Garage
//   → Weitflug (Floating Origin, Boden-Pfeil, Testfahrt per Dev-Menü beenden) → Strecke 2 mit Multi-Touch.
// Geprüft wird außerdem:
//   - keine Konsolenfehler / pageerrors
//   - das Fahrzeug liegt in JEDEM 100-ms-Sample im Bild (window.__game.carScreen())
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
  fs.rmSync(SHOTS, { recursive: true, force: true });
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
  const center = (b) => [b.x + b.width / 2, b.y + b.height / 2];
  const waitState = (st, timeout = 8000) => page.waitForFunction((s) => window.__game && window.__game.state === s, st, { timeout });
  // Testfahrt über das Pause-Menü beenden (falls sie nicht gerade von selbst endet)
  const quitStage = async () => {
    if ((await g(() => window.__game.state)) !== 'stage') return;
    try { await page.tap('#hud [data-id=pause]', { timeout: 3000 }); } catch (_) { return; }
    await sleep(300);
    if (await page.locator('#pause').isVisible()) await page.tap('#pause [data-a=quit]', { timeout: 5000 });
  };

  // Abschuss: halten (optional hochziehen), im grünen Bereich loslassen (bis zu 4 Versuche)
  async function launchByTouch(id0, drag = true) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const a0 = await g(() => window.__game.stage.launch.angle);
      await touch('touchStart', [[W / 2, 620, id0 + attempt]]);
      if (drag) for (let k = 1; k <= 8; k++) { await touch('touchMove', [[W / 2, 620 - k * 12, id0 + attempt]]); await sleep(16); }
      const a1 = await g(() => window.__game.stage.launch.angle);
      if (attempt === 0 && drag) {
        check(a1 > a0 + 0.05, `Hochziehen macht den Winkel steiler (${(a0 * 57.3).toFixed(0)}° → ${(a1 * 57.3).toFixed(0)}°)`);
        await shot('20-zielen');
      }
      const t0 = Date.now();
      while (Date.now() - t0 < 4000) {
        if (await g(() => window.__game.stage.launch.inSweetSpot)) break;
        await sleep(4);
      }
      await touch('touchEnd', []);
      // warten, bis das Spiel das Loslassen verarbeitet hat (abgeschossen oder abgebrochen)
      await page.waitForFunction(() => { const s = window.__game.stage; return s.phase !== 'aim' || !s.launch.charging; }, null, { timeout: 5000 }).catch(() => {});
      const after = await g(() => ({ phase: window.__game.stage.phase, perfect: window.__game.stage.perfectLaunch, power: window.__game.stage.launch.power }));
      log(`Abschuss-Versuch ${attempt + 1}: Kraft ${(after.power * 100).toFixed(0)} %, ${after.phase === 'fly' ? (after.perfect ? 'PERFEKT' : 'normal') : 'abgebrochen'}`);
      if (after.phase === 'fly') return true;
    }
    return false;
  }

  try {
    await page.goto(base, { waitUntil: 'load' });
    await waitState('garage', 15000);
    await sleep(800);

    // Alle 100 ms (im Spiel selbst gemessen): Wo ist das Fahrzeug auf dem Bildschirm?
    await g(() => {
      window.__samples = [];
      setInterval(() => {
        const gm = window.__game;
        const s = gm.carScreen();
        window.__samples.push({ state: gm.state, phase: gm.stage ? gm.stage.phase : null, x: s.x, y: s.y, w: innerWidth, h: innerHeight });
      }, 100);
    });
    await shot('01-garage');
    const g0 = await g(() => ({ chassis: window.__game.save.garage.chassis, slots: document.querySelectorAll('#garage .slot-row').length, version: window.__game.save.version }));
    check(g0.chassis === 'seifenkiste' && g0.slots === 7 && g0.version === 3, `Garage: Seifenkiste, 7 Teile-Slots, Spielstand v${g0.version}`);
    const startBox = await page.locator('#garage [data-id=start]').boundingBox();
    check(!!startBox && startBox.y + startBox.height <= H && startBox.y > H * 0.7, 'TESTFAHRT-Knopf unten sichtbar');

    // ---------- Dev-Menü: 7× auf die Versionsnummer in den Einstellungen ----------
    await page.tap('#garage [data-id=settings]');
    await sleep(300);
    for (let i = 0; i < 7; i++) { await page.tap('#settings [data-id=version]'); await sleep(60); }
    await sleep(200);
    check(await g(() => window.__game.devMenu.isOpen), 'Dev-Menü öffnet nach 7 Taps auf die Versionsnummer');
    await shot('02-devmenu');
    const sc0 = await g(() => window.__game.save.meta.scrap);
    await page.tap('#devmenu [data-a=scrap10k]');
    await page.tap('#devmenu [data-a=cores]');
    await page.locator('#devmenu [data-a=unlock]').scrollIntoViewIfNeeded();
    await page.tap('#devmenu [data-a=unlock]');
    const dev = await g(() => ({ scrap: window.__game.save.meta.scrap, cores: window.__game.save.meta.cores, owned: window.__game.save.garage.ownedChassis.length, research: window.__game.save.research.done.length }));
    check(dev.scrap === sc0 + 10000 && dev.cores === 3, `Dev: +10.000 Schrott, +3 Kerne (${dev.scrap} ⚙, ${dev.cores} 💠)`);
    check(dev.owned === 9 && dev.research > 10, `Dev: alles freigeschaltet (${dev.owned} Chassis, ${dev.research} Forschungs-Bedingungen)`);
    const tw = await page.locator('#devmenu .dev-tw input').count();
    check(tw >= 8, `Dev: ${tw} Werte live änderbar`);
    await page.locator('#devmenu [data-a=close]').scrollIntoViewIfNeeded();
    await page.tap('#devmenu [data-a=close]');
    await sleep(150);
    await page.tap('#settings [data-a=close]');
    await sleep(300);

    // ---------- alle 9 Chassis anwählen ----------
    const seen = [];
    for (let i = 0; i < 9; i++) {
      const id = await g(() => window.__game.garage.viewId);
      seen.push(id);
      await sleep(700);
      await shot(`chassis-${id}`);
      await page.tap('#garage [data-id=cnext]');
      await sleep(250);
    }
    const back = await g(() => window.__game.save.garage.chassis);
    check(new Set(seen).size === 9 && back === seen[0], `alle 9 Chassis angewählt (${seen.join(', ')})`);

    // ---------- Teil kaufen, ausrüsten, verbessern ----------
    await page.locator('#garage .slot-row[data-slot=tank]').scrollIntoViewIfNeeded();
    await page.tap('#garage .slot-row[data-slot=tank] .sr-info');
    await sleep(300);
    check(await g(() => window.__game.garage.pickerOpen), 'Teile-Auswahl öffnet (Tank)');
    const card = '#garage .pcard[data-id=tank_gurkenfass]';
    await page.locator(card).scrollIntoViewIfNeeded();
    await page.tap(`${card} .pc-desc`);
    await sleep(300);
    check((await g(() => window.__game.model.userData.chassisId)) === 'seifenkiste', 'Vorschau-Modell aktualisiert');
    await shot('03-teile-auswahl');
    const s1 = await g(() => window.__game.save.meta.scrap);
    await page.tap(`${card} [data-act=buy]`);
    await sleep(250);
    const bought = await g(() => ({ scrap: window.__game.save.meta.scrap, owned: window.__game.save.garage.ownedParts.includes('tank_gurkenfass') }));
    check(bought.owned && bought.scrap === s1 - 400, `Teil gekauft (Gurkenfass, ⚙ ${s1} → ${bought.scrap})`);
    await page.locator(`${card} [data-act=equip]`).scrollIntoViewIfNeeded();
    await page.tap(`${card} [data-act=equip]`);
    await sleep(250);
    const fuelMax = await g(() => window.__game.loadout().stats.fuelMax);
    check((await g(() => window.__game.save.garage.parts.tank)) === 'tank_gurkenfass' && fuelMax >= 140, `Teil ausgerüstet (max. Treibstoff ${fuelMax})`);
    await page.locator(`${card} [data-act=upgrade]`).scrollIntoViewIfNeeded();
    await page.tap(`${card} [data-act=upgrade]`);
    await sleep(250);
    const lvl = await g(() => window.__game.save.garage.partLevels.tank_gurkenfass);
    check(lvl === 1, `Teil verbessert (Stufe ${lvl})`);
    await shot('04-teil-gekauft');
    await page.tap('#garage [data-id=pickclose]');
    await sleep(250);
    // Verbessern direkt in der Slot-Zeile (Antrieb)
    await page.locator('#garage .slot-row[data-slot=drive] .sr-up').scrollIntoViewIfNeeded();
    await page.tap('#garage .slot-row[data-slot=drive] .sr-up');
    await sleep(200);
    check((await g(() => window.__game.save.garage.partLevels.drive_rasenmaehermotor)) === 1, 'Verbessern-Knopf in der Slot-Zeile');

    // ---------- Fähigkeiten wählen: Slot 2 = Gyro-Kick ----------
    await page.locator('#garage .ab-chip[data-i="1"]').scrollIntoViewIfNeeded();
    await page.tap('#garage .ab-chip[data-i="1"]');
    await sleep(300);
    await page.locator('#garage .pcard[data-id=gyrokick] [data-act=equip]').scrollIntoViewIfNeeded();
    await page.tap('#garage .pcard[data-id=gyrokick] [data-act=equip]');
    await sleep(250);
    const abil = await g(() => window.__game.save.garage.abilities);
    check(abil[0] === 'boost' && abil[1] === 'gyrokick', `Fähigkeiten gewählt (${abil.join(', ')})`);
    check(!(await g(() => window.__game.garage.pickerOpen)), 'Auswahl schließt nach dem Ausrüsten');
    await shot('05-garage-fertig');

    // ---------- Testfahrt ----------
    const scrapBefore = await g(() => window.__game.save.meta.scrap);
    await page.tap('#garage [data-id=start]');
    await page.waitForFunction(() => window.__game.state === 'stage' && window.__game.stage.phase === 'aim', null, { timeout: 5000 });
    const hudAb = await g(() => ({ n: [...document.querySelectorAll('#hud .ability-btn')].filter((b) => !b.classList.contains('hidden')).length, ab: window.__game.stage.abilities.slots.map((s) => s.def.id) }));
    check(hudAb.ab.join() === 'boost,gyrokick', `Testfahrt mit Fähigkeiten ${hudAb.ab.join(', ')}`);
    await sleep(300);
    check(await launchByTouch(1), 'Abschuss per Halten/Loslassen');
    await sleep(400);
    check((await page.locator('#hud .ability-btn:not(.hidden)').count()) === 2, '2 Fähigkeits-Knöpfe sichtbar');
    await shot('21-flug');

    // Neigen: linke Hälfte = Nase hoch, rechte = Nase runter, beide = 0
    // (gemessen in Spielzeit: Software-Rendering schafft nur wenige Bilder pro Sekunde)
    const gameTime = () => g(() => window.__game.stage.time);
    const waitGame = async (dt, maxMs = 4000) => {
      const t1 = (await gameTime()) + dt;
      const ts = Date.now();
      while (Date.now() - ts < maxMs && (await gameTime()) < t1) await sleep(20);
    };
    const rot0 = await g(() => window.__game.stage.vehicle.rotAccum);
    await touch('touchStart', [[80, 420, 10]]);
    await sleep(120);
    const tiltL = await g(() => window.__game.input.tilt);
    await waitGame(0.3);
    const rot1 = await g(() => window.__game.stage.vehicle.rotAccum);
    const landedMeanwhile = await g(() => window.__game.stage.vehicle.onGround || window.__game.stage.vehicle.airTime < 0.3);
    await touch('touchStart', [[80, 420, 10], [W - 80, 420, 11]]);
    await sleep(80);
    const tiltBoth = await g(() => window.__game.input.tilt);
    await touch('touchEnd', [[W - 80, 420, 11]]);
    await touch('touchEnd', []);
    await touch('touchStart', [[W - 80, 300, 12]]);
    await sleep(120);
    const tiltR = await g(() => window.__game.input.tilt);
    await sleep(150);
    await touch('touchEnd', []);
    check(tiltL === 1, `linke Hälfte halten → tilt +1 (${tiltL})`);
    check(tiltR === -1, `rechte Hälfte halten → tilt −1 (${tiltR})`);
    check(tiltBoth === 0, `beide Hälften gleichzeitig → tilt 0 (${tiltBoth})`);
    check(rot1 > rot0 + 0.2 || landedMeanwhile, `Nase hebt sich beim Halten links (Δ ${(rot1 - rot0).toFixed(2)} rad${landedMeanwhile ? ', inzwischen gelandet' : ''})`);

    // Boost-Knopf halten + gleichzeitig 2. Fähigkeit tippen (Multi-Touch)
    const b0 = await page.locator('#hud [data-id=ab0]').boundingBox();
    const b1 = await page.locator('#hud [data-id=ab1]').boundingBox();
    check(!!b0 && !!b1 && b0.x + b0.width <= W && b0.y + b0.height <= H && b1.x >= 0, 'Fähigkeits-Knöpfe unten im Bild');
    const fuelBefore = await g(() => window.__game.stage.vehicle.fuel);
    await touch('touchStart', [[...center(b0), 20]]);
    await waitGame(0.1);
    const boosting = await g(() => ({ b: window.__game.stage.vehicle.boosting, phase: window.__game.stage.phase }));
    await touch('touchStart', [[...center(b0), 20], [...center(b1), 21]]);
    await waitGame(0.05);
    const multi = await g(() => ({ b: window.__game.stage.vehicle.boosting, uses: window.__game.stage.abilities.slots[1].uses, tilt: window.__game.input.tilt, phase: window.__game.stage.phase }));
    await touch('touchEnd', [[...center(b1), 21]]);
    await waitGame(0.4);
    await shot('22-boost');
    await touch('touchEnd', []);
    const fuelAfter = await g(() => window.__game.stage.vehicle.fuel);
    check(boosting.b || boosting.phase !== 'fly', `Boost-Knopf halten → Boost aktiv (${boosting.b})`);
    check(multi.uses === 1 && (multi.b || multi.phase !== 'fly') && multi.tilt === 0, `Multi-Touch: Boost gehalten + Gyro-Kick getippt (Einsätze ${multi.uses}, Neigen unbeeinflusst: tilt ${multi.tilt})`);
    check(fuelAfter < fuelBefore, `Boost verbraucht Treibstoff (${fuelBefore.toFixed(0)} → ${fuelAfter.toFixed(0)})`);
    const hudRes = await g(() => ({ fuel: document.querySelector('#hud [data-id=fuel]').style.width, dur: document.querySelector('#hud [data-id=durnum]').textContent }));
    check(parseFloat(hudRes.fuel) < 100 && hudRes.dur !== '', `HUD-Leisten (Treibstoff ${hudRes.fuel}, Haltbarkeit ${hudRes.dur})`);
    await page.keyboard.down('Space');
    await waitGame(0.1);
    const spaceBoost = await g(() => window.__game.stage.vehicle.boosting || window.__game.stage.vehicle.fuel <= 0 || window.__game.stage.phase !== 'fly');
    await sleep(200);
    await page.keyboard.up('Space');
    check(spaceBoost, 'Leertaste = Boost');
    await page.keyboard.down('ArrowLeft');
    await sleep(100);
    const keyTilt = await g(() => window.__game.input.tilt);
    await page.keyboard.up('ArrowLeft');
    check(keyTilt === 1, 'Pfeil links = Nase hoch');
    const evc = await g(() => window.__game.stage.eventCounts);
    check(evc.launch === 1 && evc.abilityUse >= 2 && evc.boost >= 1, `Ereignisse geschrieben (${Object.entries(evc).map(([k, v]) => `${k} ${v}`).join(', ')})`);

    // ---------- auf die Auswertung warten ----------
    let t0 = Date.now();
    let maxX = 0;
    while (Date.now() - t0 < 90000) {
      const s = await g(() => ({ state: window.__game.state, x: window.__game.stage ? window.__game.stage.vehicle.x : 0 }));
      maxX = Math.max(maxX, s.x);
      if (s.state === 'results') break;
      await sleep(250);
    }
    if ((await g(() => window.__game.state)) !== 'results') {
      log('Testfahrt dauert zu lange – über das Pause-Menü beenden');
      await quitStage();
    }
    await page.waitForFunction(() => window.__game.state === 'results' && !document.getElementById('results').classList.contains('hidden'), null, { timeout: 10000 });
    check(true, `Auswertung erscheint (Strecke ≈ ${Math.round(maxX)} m)`);
    await sleep(1600);
    await shot('23-auswertung');
    const res = await g(() => ({ scrap: window.__game.save.meta.scrap, ms: window.__game.save.meta.milestones, rows: document.querySelectorAll('#results .res-row').length }));
    check(res.scrap > scrapBefore, `Schrott-Belohnung gutgeschrieben (⚙ ${scrapBefore} → ${res.scrap})`);
    check(res.ms.firstTestDrive !== undefined && res.ms.firstPartUpgrade !== undefined, `Meilensteine gestempelt (${Object.keys(res.ms).join(', ')})`);
    check(res.rows >= 5, 'Auswertung zeigt Distanz, Höhe, Tricks, Schrauben, Schaden');
    await page.tap('#results [data-id=garage]');
    await waitState('garage', 5000);
    await sleep(400);
    check(true, 'zurück in der Garage');

    // ---------- Weitflug: Floating Origin, Boden-Pfeil, Ende über das Dev-Menü ----------
    await g(() => {
      const s = window.__game.save;
      for (const id of Object.values(s.garage.parts)) s.garage.partLevels[id] = 20;
      window.__game.openGarage();
    });
    await page.tap('#garage [data-id=start]');
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
      await page.waitForFunction(() => { const s = window.__game.stage; return s.phase !== 'aim' || !s.launch.charging; }, null, { timeout: 5000 }).catch(() => {});
      keyFired = (await g(() => window.__game.stage.phase)) === 'fly';
    }
    check(keyFired, 'Abschuss per Leertaste halten/loslassen');
    await page.keyboard.down('Space');
    await sleep(2000);
    await page.keyboard.up('Space');
    await shot('30-langstrecke');
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
    check(far.origin > 5000 && Math.abs(far.x - far.origin) < 1000, `Floating Origin springt mit (Fahrzeug ${far.x.toFixed(0)} m, Ursprung ${far.origin} m)`);
    check(far.ind && /^Boden ↓ [\d.]+ m$/.test(far.text), `Boden-Pfeil sichtbar („${far.text}“)`);
    await shot('31-weit-und-hoch');
    // Testfahrt sofort beenden über das Dev-Menü (noch hoch in der Luft – eine Landung aus 600 m wäre Totalschaden)
    await page.tap('#hud [data-id=pause]');
    await page.waitForFunction(() => window.__game.paused, null, { timeout: 5000 });
    check(true, 'Pause-Menü während der Testfahrt');
    await page.tap('#pause [data-a=settings]');
    await sleep(250);
    for (let i = 0; i < 7; i++) { await page.tap('#settings [data-id=version]'); await sleep(60); }
    await page.waitForFunction(() => window.__game.devMenu.isOpen, null, { timeout: 5000 });
    await page.locator('#devmenu [data-a=end]').scrollIntoViewIfNeeded();
    await page.tap('#devmenu [data-a=end]');
    await page.waitForFunction(() => window.__game.state === 'results', null, { timeout: 10000 });
    check(true, 'Testfahrt per Dev-Menü beendet');
    await sleep(1500);
    await shot('32-auswertung-weit');
    await page.tap('#results [data-id=garage]');
    await waitState('garage', 5000);
    await sleep(500);
    check((await g(() => window.__game.origin)) === 0, 'Render-Ursprung in der Garage wieder bei 0');

    // ---------- Strecke 2 (durch den Weitflug freigeschaltet), Multi-Touch Neigen + Boost ----------
    await page.locator('#garage [data-id=wnext]').scrollIntoViewIfNeeded();
    await page.tap('#garage [data-id=wnext]');
    await sleep(500);
    const worldId = await g(() => window.__game.save.worlds.current);
    check(worldId === 'desert', `Streckenwechsel auf die Glutwüste (${worldId})`);
    await page.tap('#garage [data-id=start]');
    await page.waitForFunction(() => window.__game.state === 'stage' && window.__game.stage.phase === 'aim', null, { timeout: 5000 });
    check(await launchByTouch(40, false), 'Abschuss auf Strecke 2');
    const bb = await page.locator('#hud [data-id=ab0]').boundingBox();
    await touch('touchStart', [[60, 500, 50], [...center(bb), 51]]);
    await sleep(1000);
    const m2 = await g(() => ({ tilt: window.__game.input.tilt, held: window.__game.input.abilityHeld(0), heat: window.__game.stage.vehicle.heat }));
    await touch('touchEnd', []);
    check(m2.tilt === 1 && m2.held, `Multi-Touch: links neigen + Boost-Knopf gleichzeitig (tilt ${m2.tilt}, Boost ${m2.held}, Hitze ${m2.heat.toFixed(0)})`);
    await sleep(1200);
    await shot('40-strecke2');
    await quitStage();
    await page.waitForFunction(() => window.__game.state === 'results', null, { timeout: 15000 });
    await sleep(1200);
    await page.tap('#results [data-id=garage]');
    await waitState('garage', 5000);

    // ---------- Auswertung der 100-ms-Samples ----------
    const fps = await g(() => new Promise((res) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); }));
    log(`Bildrate (Software-Rendering, Garage): ~${fps} fps`);
    const samples = await g(() => window.__samples);
    const inGame = samples.filter((s) => s.state !== 'garage');
    const outside = samples.filter((s) => !(s.x >= 0 && s.x <= s.w && s.y >= 0 && s.y <= s.h));
    log(`${samples.length} Samples (${inGame.length} in der Etappe), x ${Math.min(...inGame.map((s) => s.x)).toFixed(0)}…${Math.max(...inGame.map((s) => s.x)).toFixed(0)}, y ${Math.min(...inGame.map((s) => s.y)).toFixed(0)}…${Math.max(...inGame.map((s) => s.y)).toFixed(0)}`);
    check(inGame.length > 20, 'genug Samples während der Etappe');
    check(outside.length === 0, `Fahrzeug in jedem 100-ms-Sample im Bild${outside.length ? ` – ${outside.length}× draußen, z. B. ${JSON.stringify(outside[0])}` : ''}`);
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
