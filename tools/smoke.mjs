// Playwright-Rauchtest für Schleuderwerk.
// Startet einen eigenen HTTP-Server für www/, öffnet das Spiel im Hochformat (412×915, Touch) und spielt:
//   Garage → Dev-Menü (7× auf die Versionsnummer) → alles freischalten → alle 9 Chassis ansehen (Bildschirmfotos)
//   → ein Teil kaufen, verbessern, ausrüsten → Fähigkeiten wählen → RUN STARTEN → Karte Akt 1 → Etappen-Intro
//   → echte Etappe im Schrottplatz (Abschuss per Halten/Loslassen, Neigen, Boost-Knopf + 2. Fähigkeit per Multi-Touch,
//   Leertaste) → Auswertung mit Medaillen/Abschleppen → Karte → Dev „Etappe überspringen“ (Gold/verfehlt/Bronze),
//   „Zum Boss“ → Boss → Akt-Übergang → Akt 2: echte Etappe in der Glutwüste → Dev „Nächster Akt“ → echte Etappe in
//   der Gewittersteppe (Regen, Pause-Menü „Run aufgeben“) → Niederlage per Dev (Haltbarkeit 1, verfehlt) → Run-Ende
//   mit Meta-Belohnung → Garage → neuer Run, Seite neu laden → RUN FORTSETZEN → Dev-Testfahrten über alle
//   Boss-Strecken mit Bildschirmfotos jedes Streckenbausteins → Weitflug (Floating Origin, Boden-Pfeil).
// Phase 4: Item-Auswahl nach jeder geschafften Etappe (Karten, Nehmen, voller Rucksack → Ersetzen), Item-Leiste auf der
//   Karte, Inventar mit Set-Übersicht, Dev-Menü „Item hinzufügen“ (Suche), Kettenreaktion in der Etappe (Item-Symbol
//   hüpft, „KETTENREAKTION ×n!“), Kompendium in der Garage.
// Phase 5: Erfinder-Labor (Reiter, Knoten erforschen), Lackiererei (Lack kaufen, Farbe am Modell), danach jeden
//   Knotentyp einmal besuchen (Dev „Nächste Knoten → Typ“): Schrotthändler (kaufen, Reroll, reservieren, Fähigkeit,
//   Seite neu laden mitten im Shop → geht im Shop weiter), Werkbank (★-Fusion, Zerlegen), Schwarzmarkt (Kauf mit
//   Treibstoff, Fluch entfernen), Ereignis, Schatzhaufen, Tankstelle – mit Bildschirmfotos aller Shop-Bildschirme.
// Phase 6: Schrottstufen per Dev freischalten, Stufe 3 in der Garage wählen, Run mit aktiver Stufe (☠ auf der Karte,
//   Erschwerungen im Intro), Boss-Intros aller 6 Bosse (Bildschirmfotos b-boss-<id>.png), Boss-Warnhinweis in der Etappe,
//   Garage-Reiter „Statistik“, Dev-Menü (Meilensteine mit Zielzeiten, alle balance.js-Abschnitte live änderbar).
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

  let preSamples = [];
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
    const startTxt = await page.locator('#garage [data-id=start]').textContent();
    check(!!startBox && startBox.y + startBox.height <= H && startBox.y > H * 0.7 && /RUN STARTEN/.test(startTxt), `Start-Knopf unten sichtbar („${startTxt}“)`);

    // ---------- Dev-Menü: 7× auf die Versionsnummer in den Einstellungen ----------
    await page.tap('#garage [data-id=settings]');
    await sleep(300);
    // Klicks direkt im Seitenkontext: mit Software-WebGL (≈ 10 Bilder/s) braucht jedes page.tap() bis zu 1,2 s –
    // länger als CONTROLS.devTapGap, dann zählt das Spiel die Taps nicht als „schnell hintereinander“.
    await g(() => { const v = document.querySelector('#settings [data-id=version]'); for (let i = 0; i < 7; i++) v.click(); });
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

    // ---------- Run starten: Karte Akt 1 ----------
    const gameTime = () => g(() => window.__game.stage.time);
    const waitGame = async (dt, maxMs = 4000) => {
      const t1 = (await gameTime()) + dt;
      const ts = Date.now();
      while (Date.now() - ts < maxMs && (await gameTime()) < t1) await sleep(20);
    };
    const openDev = async () => {
      if (await g(() => window.__game.devMenu.isOpen)) return;
      await g(() => window.__game.devMenu.open());
      await sleep(150);
    };
    const closeDev = async () => { await g(() => window.__game.devMenu.close()); await sleep(100); };
    const devTap = async (a) => {
      await openDev();
      await page.locator(`#devmenu [data-a=${a}]`).scrollIntoViewIfNeeded();
      await page.tap(`#devmenu [data-a=${a}]`);
      await sleep(250);
      const msg = await page.locator('#devmenu [data-id=msg]').textContent();
      return msg;
    };
    const runUiOpen = () => g(() => window.__game.runScreens.open);
    // Ergebnis-Bildschirm einer Run-Etappe abwarten und weiter (Weiter / Karte / Run beenden)
    const waitRunResult = async (timeout = 15000) => {
      await page.waitForFunction(() => window.__game.state === 'results' && window.__game.runScreens.kind === 'result', null, { timeout });
      await sleep(1700);
    };
    // Dev „Etappe überspringen“, bis eine Etappe dran war (Tankstellen/Platzhalter werden dabei nur besucht)
    const devSkip = async (a) => {
      for (let i = 0; i < 6; i++) {
        await devTap(a);
        if ((await g(() => window.__game.state)) === 'results') break;
      }
      await waitRunResult();
    };
    const pressRun = async (a) => { await page.tap(`#runui [data-a=${a}]`); await sleep(350); };
    // Item-Auswahl(en) nach einer geschafften Etappe: erste Karte nehmen (voller Rucksack: ersten Platz ersetzen)
    let choiceShots = 0;
    const handleChoices = async () => {
      let n = 0;
      for (let i = 0; i < 8; i++) {
        const kind = await g(() => window.__game.runScreens.open && window.__game.runScreens.kind);
        if (kind === 'choice') {
          if (choiceShots === 0) {
            await sleep(400);
            await shot('12-item-auswahl');
            const cards = await g(() => ({ n: document.querySelectorAll('#runui .icard').length, tags: document.querySelectorAll('#runui .icard .tag-chip').length, sets: document.querySelectorAll('#runui .ic-set').length, skip: document.querySelector('#runui [data-a=skip]').textContent }));
            check(cards.n === 3 && cards.tags >= 3 && cards.sets >= 3 && /Überspringen: \+\d+/.test(cards.skip), `Item-Auswahl: ${cards.n} Karten mit Tags und Set-Fortschritt, „${cards.skip}“`);
          }
          choiceShots++;
          const inv0 = await g(() => window.__game.run.inventory.length);
          await page.locator('#runui [data-pick="0"]').scrollIntoViewIfNeeded();
          await page.tap('#runui [data-pick="0"]');
          await sleep(350);
          if ((await g(() => window.__game.runScreens.kind)) !== 'replace') {
            const inv1 = await g(() => window.__game.run.inventory.length);
            if (n === 0 && choiceShots === 1) check(inv1 === inv0 + 1, `Item genommen (Inventar ${inv0} → ${inv1})`);
          }
          n++;
        } else if (kind === 'replace') {
          await shot('15-rucksack-voll');
          await page.locator('#runui [data-rep="0"]').scrollIntoViewIfNeeded();
          await page.tap('#runui [data-rep="0"]');
          await sleep(350);
        } else break;
      }
      return n;
    };
    // „Weiter“ im Ergebnis + Item-Auswahl
    const pressNext = async () => { await pressRun('next'); return handleChoices(); };
    // Knoten auf der Karte antippen → Intro → LOS
    const enterStageNode = async (shotName) => {
      const reach = await g(() => window.__game.reachable());
      const node = reach.find((n) => ['stage', 'elite', 'boss'].includes(n.type)) || reach[0];
      await page.locator(`.mnode[data-node="${node.id}"]`).scrollIntoViewIfNeeded();
      await page.tap(`.mnode[data-node="${node.id}"]`);
      await sleep(400);
      if (shotName) await shot(shotName);
      const kind = await g(() => window.__game.runScreens.kind);
      if (kind !== 'intro') return { node, kind };
      await page.tap('#runui [data-a=go]');
      await page.waitForFunction(() => window.__game.state === 'stage' && window.__game.stage.phase === 'aim', null, { timeout: 5000 });
      await sleep(300);
      return { node, kind };
    };
    // Etappe bis zum Ende fahren (Boost in der Luft), notfalls nach maxMs per Dev beenden
    const driveToEnd = async (maxMs, shotName, shotAt = 2500) => {
      const t0 = Date.now();
      let shotDone = !shotName;
      let maxX = 0;
      while (Date.now() - t0 < maxMs) {
        const st = await g(() => ({ state: window.__game.state, x: window.__game.stage ? window.__game.stage.vehicle.x : 0 }));
        maxX = Math.max(maxX, st.x);
        if (st.state !== 'stage') break;
        if (!shotDone && Date.now() - t0 > shotAt) { await shot(shotName); shotDone = true; }
        await sleep(250);
      }
      if ((await g(() => window.__game.state)) === 'stage') {
        log('Etappe dauert zu lange – per Dev-Menü beenden');
        await devTap('end');
        await closeDev();
      }
      return maxX;
    };

    await page.tap('#garage [data-id=start]');
    await waitState('map', 5000);
    await sleep(500);
    await shot('10-karte-akt1');
    const m0 = await g(() => ({ run: !!window.__game.run, act: window.__game.run.act, biome: window.__game.run.biome, nodes: document.querySelectorAll('#map .mnode').length, reach: document.querySelectorAll('#map .mnode.reach').length, boss: document.querySelectorAll('#map .mnode.t-boss').length }));
    check(m0.run && m0.act === 1 && m0.biome === 'schrottplatz', `Run gestartet: Akt ${m0.act}, ${m0.biome}`);
    check(m0.nodes >= 13 && m0.boss === 1 && m0.reach >= 2, `Karte: ${m0.nodes} Knoten, ${m0.reach} erreichbar, Boss oben`);
    const ms0 = await g(() => window.__game.save.meta.milestones);
    check('firstRunStart' in ms0, 'Meilenstein „Erster Run gestartet“');

    // ---------- echte Etappe im Schrottplatz ----------
    const e1 = await enterStageNode('11-etappen-intro');
    check(e1.kind === 'intro', `Etappen-Intro (${e1.node.type})`);
    const hudAb = await g(() => ({ goal: !document.querySelector('#hud [data-id=goal]').classList.contains('hidden'), ab: window.__game.stage.abilities.slots.map((s) => s.def.id), flags: window.__game.stage.medalList.length, target: window.__game.stage.target }));
    check(hudAb.ab.join() === 'boost,gyrokick', `Etappe mit Fähigkeiten ${hudAb.ab.join(', ')}`);
    check(hudAb.goal && hudAb.target > 0, `Zielbalken sichtbar (Ziel ${hudAb.target} m, ${hudAb.flags} Medaillen-Marken)`);
    check(await launchByTouch(1), 'Abschuss per Halten/Loslassen');
    await sleep(400);
    check((await page.locator('#hud .ability-btn:not(.hidden)').count()) === 2, '2 Fähigkeits-Knöpfe sichtbar');
    await shot('21-flug');

    // Neigen: linke Hälfte = Nase hoch, rechte = Nase runter, beide = 0 (gemessen in Spielzeit)
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

    const dist1 = await driveToEnd(90000);
    await waitRunResult();
    await shot('23-ergebnis');
    const r1 = await g(() => ({ medals: document.querySelectorAll('#runui .rm-slot').length, got: document.querySelectorAll('#runui .rm-slot.got').length, rows: document.querySelectorAll('#runui .res-row').length, tow: !!document.querySelector('#runui .rr-tow'), run: window.__game.run, hist: window.__game.run.history.slice(-1)[0] }));
    check(r1.medals === 3 && r1.rows >= 3, `Ergebnis mit Medaillen-Plätzen (${r1.got}/3 erreicht, ${Math.round(dist1)} m, ${r1.hist.medal || 'verfehlt'})`);
    check(r1.hist.medal ? !r1.tow : r1.tow, `Abschlepp-Hinweis passt zum Ergebnis (${r1.tow ? 'abgeschleppt' : 'geschafft'})`);
    if (r1.tow) {
      check(await page.locator('#runui [data-a=retry]').isVisible(), 'Neuversuch-Knopf');
      await pressRun('map');
    } else await pressNext();
    await waitState('map', 5000);
    check(true, 'zurück auf der Karte');

    // ---------- Dev: Etappen überspringen bis zum Akt-1-Boss ----------
    await devSkip('skipGold');
    const sk = await g(() => ({ got: document.querySelectorAll('#runui .rm-slot.got').length, hist: window.__game.run.history.slice(-1)[0] }));
    check(sk.hist.medal === 'gold' && sk.got === 3, `Dev: Etappe übersprungen mit Gold (${sk.got} Medaillen leuchten)`);
    await shot('24-ergebnis-gold');
    const nChoices = await pressNext();
    check(nChoices >= 1 && choiceShots >= 1, `Item-Auswahl nach geschaffter Etappe (${nChoices})`);
    await waitState('map', 5000);
    await sleep(300);
    // Karte: Item-Leiste → Inventar mit Set-Übersicht
    const bar = await g(() => ({ icons: document.querySelectorAll('#map .mi-bar .ib-slot:not(.empty)').length, inv: window.__game.run.inventory.length, txt: document.querySelector('#map [data-id=icount]').textContent }));
    check(bar.icons === bar.inv && bar.inv >= 2, `Item-Leiste auf der Karte (${bar.icons} Symbole, „${bar.txt}“)`);
    await page.tap('#map [data-id=items]');
    await sleep(400);
    await shot('13-inventar');
    const invRows = await g(() => document.querySelectorAll('#itemsheet .irow').length);
    check(invRows === bar.inv, `Inventar-Ansicht: ${invRows} Items mit Details`);
    await page.tap('#itemsheet [data-tab=sets]');
    await sleep(300);
    await shot('14-set-uebersicht');
    const so = await g(() => ({ tags: document.querySelectorAll('#itemsheet .so-tag').length, lv: document.querySelectorAll('#itemsheet .so-lv').length }));
    check(so.tags === 10 && so.lv === 30, `Set-Übersicht: 10 Tags × Stufen 2/4/6 (${so.tags}/${so.lv})`);
    await page.tap('#itemsheet [data-id=close]');
    await sleep(200);
    await devSkip('skipMiss');
    const towed = await g(() => ({ tow: !!document.querySelector('#runui .rr-tow'), cur: window.__game.run.current }));
    check(towed.tow && towed.cur && towed.cur.attempts === 1, 'Dev: verfehlt → Abschleppen + Neuversuch');
    await shot('25-abschleppen');
    await pressRun('map');
    await waitState('map', 5000);
    await devSkip('skipBronze');
    await pressNext();
    await waitState('map', 5000);
    const bossMsg = await devTap('boss');
    await closeDev();
    await g(() => window.__game.openMap());
    await sleep(300);
    const reachBoss = await g(() => window.__game.reachable());
    check(reachBoss.length === 1 && reachBoss[0].type === 'boss', `Dev: ${bossMsg}`);
    await page.tap(`.mnode[data-node="${reachBoss[0].id}"]`);
    await sleep(400);
    await shot('26-boss-intro');
    await page.tap('#runui [data-a=back]');
    await sleep(200);
    await devSkip('skipGold');
    await shot('27-boss-besiegt');
    await pressRun('next');
    const bossLoot = await g(() => window.__game.runScreens.kind === 'choice' && window.__game.run.pendingChoices[0].context);
    check(bossLoot === 'boss', `Boss-Beute: Auswahl vor dem Akt-Übergang (${bossLoot})`);
    await handleChoices();
    await page.waitForFunction(() => window.__game.runScreens.kind === 'act', null, { timeout: 5000 });
    await sleep(400);
    await shot('28-akt-uebergang');
    const a2 = await g(() => ({ act: window.__game.run.act, biome: window.__game.run.biome, bp: window.__game.run.earned.blueprints }));
    check(a2.act === 2 && a2.biome === 'gluewueste' && a2.bp >= 3, `Akt-Übergang → Akt 2 Glutwüste (📘 ${a2.bp} im Run)`);
    await pressRun('next');
    await waitState('map', 5000);
    await sleep(400);
    await shot('30-karte-akt2');

    // ---------- echte Etappe in der Glutwüste ----------
    await enterStageNode();
    check((await g(() => window.__game.biome.id)) === 'gluewueste', 'Etappe in der Glutwüste');
    check(await launchByTouch(40, false), 'Abschuss in der Glutwüste');
    const bb = await page.locator('#hud [data-id=ab0]').boundingBox();
    await touch('touchStart', [[60, 500, 50], [...center(bb), 51]]);
    await sleep(1000);
    const m2 = await g(() => ({ tilt: window.__game.input.tilt, held: window.__game.input.abilityHeld(0), heat: window.__game.stage.vehicle.heat, amb: window.__game.stage.env.heat }));
    await touch('touchEnd', []);
    check(m2.tilt === 1 && m2.held && m2.amb >= 4, `Multi-Touch: links neigen + Boost-Knopf gleichzeitig (Hitze ${m2.heat.toFixed(0)}, Umgebung +${m2.amb}/s)`);
    await driveToEnd(60000, '31-gluewueste', 600);
    await waitRunResult();
    await shot('32-ergebnis-gluewueste');
    if (await page.locator('#runui [data-a=next]').count()) await pressNext(); else await pressRun('map');
    await waitState('map', 5000);

    // ---------- Akt 3: echte Etappe in der Gewittersteppe ----------
    const actMsg = await devTap('act');
    await closeDev();
    await g(() => window.__game.openMap());
    await sleep(400);
    await shot('40-karte-akt3');
    check((await g(() => window.__game.run.biome)) === 'gewittersteppe', `Dev: ${actMsg}`);
    // Dev-Menü: Items per Suche hinzufügen – Kette Fahrraddynamo (Salto → Stromschlag) → Blitzableiter (→ Gratis-Boost)
    // → Teslaspule (Gratis-Boost → Stromschlag) erzwingt eine Kettenreaktion
    await openDev();
    for (const [q, id] of [['dynamo', 'gyro_fahrraddynamo'], ['blitzab', 'elektro_blitzableiter'], ['tesla', 'elektro_teslaspule']]) {
      await page.locator('#devmenu [data-id=isearch]').scrollIntoViewIfNeeded();
      await page.fill('#devmenu [data-id=isearch]', q);
      await sleep(100);
      const sel = await g(() => document.querySelector('#devmenu [data-id=ilist]').value);
      check(sel === id, `Dev: Suche „${q}“ findet ${sel}`);
      await page.tap('#devmenu [data-a=iadd]');
      await sleep(150);
    }
    const devInv = await g(() => window.__game.run.inventory.map((e) => e.itemId));
    check(['gyro_fahrraddynamo', 'elektro_blitzableiter', 'elektro_teslaspule'].every((id) => devInv.includes(id)), `Dev: Items hinzugefügt (${devInv.length} im Inventar)`);
    await page.locator('#devmenu [data-a=itier]').scrollIntoViewIfNeeded();
    const t0 = await g(() => window.__game.run.inventory[0].tier);
    await page.tap('#devmenu [data-a=itier]');
    check((await g(() => window.__game.run.inventory[0].tier)) === Math.min(3, t0 + 1), 'Dev: ★ erhöhen');
    await page.tap('#devmenu [data-id=ilog]');
    check(await g(() => document.querySelector('#devmenu [data-id=ilog]').checked), 'Dev: Ketten-Log an');
    await closeDev();
    await g(() => window.__game.openMap());
    await sleep(300);
    await enterStageNode();
    const hudItems = await g(() => document.querySelectorAll('#hud .hud-items .ib-slot').length);
    check(hudItems === devInv.length, `HUD: Item-Leiste (${hudItems} Symbole)`);
    check(await launchByTouch(60, false), 'Abschuss in der Gewittersteppe');
    // Salto per Pfeil links → Kettenreaktion; Item-Symbol hüpft
    await g(() => { const s = window.__game.stage, v = s.vehicle; v.y = s.track.heightAt(v.x) + 60; v.vy = 4; v.w = 0; });
    await page.keyboard.down('ArrowLeft');
    let chainOk = false, hop = false;
    const tc = Date.now();
    while (Date.now() - tc < 5000 && !chainOk) {
      const st = await g(() => ({ chain: !document.querySelector('#hud [data-id=chain]').classList.contains('hidden'), hop: !!document.querySelector('#hud .ib-slot.hop'), text: document.querySelector('#hud [data-id=chain]').textContent }));
      hop = hop || st.hop;
      if (st.chain) { chainOk = true; await shot('33-kettenreaktion'); log(`HUD: ${st.text}`); }
      await sleep(40);
    }
    await page.keyboard.up('ArrowLeft');
    const chainInfo = await g(() => ({ max: window.__game.stage.maxChain, trig: window.__game.stage.triggerCount, feed: document.querySelectorAll('#hud .hud-feed div').length }));
    check(chainOk && /KETTENREAKTION ×\d+!/.test(await g(() => document.querySelector('#hud [data-id=chain]').textContent)), `Kettenreaktions-Popup (Kette mit ${chainInfo.max} Gliedern, ${chainInfo.trig} Auslösungen)`);
    check(hop, 'Item-Symbol im HUD hüpft beim Auslösen');
    check(chainInfo.feed >= 1, `Feed-Zeile der letzten Auslösungen (${chainInfo.feed})`);
    await g(() => window.__game.setChainLog(false));
    const rainOn = await g(() => window.__game.stage.weather.rain);
    check(rainOn, 'Regen in der Gewittersteppe');
    await page.tap('#hud [data-id=pause]');
    await page.waitForFunction(() => window.__game.paused, null, { timeout: 5000 });
    const quitTxt = await page.locator('#pause [data-a=quit]').textContent();
    check(/Run aufgeben/.test(quitTxt), `Pause-Menü im Run: „${quitTxt}“`);
    await page.tap('#pause [data-a=resume]');
    await sleep(200);
    await driveToEnd(60000, '41-gewittersteppe', 1200);
    await waitRunResult();
    await shot('42-ergebnis-gewitter');
    if (await page.locator('#runui [data-a=next]').count()) await pressNext(); else await pressRun('map');
    await waitState('map', 5000);

    // ---------- Niederlage: Haltbarkeit 1, Etappe verfehlt → Run-Ende ----------
    const meta0 = await g(() => ({ ...window.__game.save.meta }));
    await openDev();
    await page.locator('#devmenu [data-id=dur]').fill('1');
    await page.tap('#devmenu [data-a=setdur]');
    await sleep(200);
    check((await g(() => window.__game.run.durability)) === 1, 'Dev: Haltbarkeit gesetzt');
    await devSkip('skipMiss');
    check(await page.locator('#runui [data-a=end]').isVisible(), 'Niederlage: „Run beenden“');
    await pressRun('end');
    await page.waitForFunction(() => window.__game.state === 'runEnd', null, { timeout: 5000 });
    await sleep(1800);
    await shot('50-run-ende');
    const end = await g(() => ({ run: window.__game.run, meta: window.__game.save.meta, rows: document.querySelectorAll('#runui .res-row').length }));
    check(end.run === null && end.meta.scrap > meta0.scrap && end.meta.blueprints > meta0.blueprints && end.meta.cores >= meta0.cores, `Run-Ende: Meta-Belohnung (⚙ ${meta0.scrap} → ${end.meta.scrap}, 📘 ${meta0.blueprints} → ${end.meta.blueprints})`);
    check('firstRunEnd' in end.meta.milestones && 'firstBossAct1' in end.meta.milestones, 'Meilensteine firstRunEnd, firstBossAct1');
    await pressRun('garage');
    await waitState('garage', 5000);
    await sleep(300);
    const st2 = await page.locator('#garage [data-id=start]').textContent();
    check(/RUN STARTEN/.test(st2), 'zurück in der Garage, neuer Run möglich');
    // Kompendium: entdeckte Items + Set-Boni, unentdeckte als „???“
    await page.tap('#garage [data-id=codex]');
    await sleep(400);
    await shot('52-kompendium');
    const cx = await g(() => ({ known: document.querySelectorAll('#itemsheet .icard:not(.unknown)').length, unknown: document.querySelectorAll('#itemsheet .icard.unknown').length, title: document.querySelector('#itemsheet [data-id=title]').textContent }));
    check(cx.known >= 4 && cx.unknown > 0 && cx.known + cx.unknown === 88, `Kompendium: ${cx.title} (${cx.known} entdeckt, ${cx.unknown} „???“)`);
    await page.tap('#itemsheet [data-tab=sets]');
    await sleep(300);
    await shot('53-kompendium-sets');
    await page.tap('#itemsheet [data-id=close]');
    await sleep(200);

    // ---------- Phase 5: Erfinder-Labor ----------
    await devTap('bp');
    await closeDev();
    await page.tap('#garage .g-tab[data-tab=lab]');
    await sleep(600);
    await shot('70-labor');
    const lab0 = await g(() => ({ open: !document.querySelector('#garage .g-lab').classList.contains('hidden'), nodes: document.querySelectorAll('#garage .lab-node').length, lines: document.querySelectorAll('#garage .lab-lines line').length, done: window.__game.save.research.done.length, bp: window.__game.save.meta.blueprints }));
    check(lab0.open && lab0.nodes >= 45 && lab0.lines >= 45, `Labor: Baum mit ${lab0.nodes} Knoten und ${lab0.lines} Linien`);
    const labId = await g(() => { const b = document.querySelector('#garage .lab-node.s-available.buy'); return b && b.dataset.id; });
    await page.locator(`#garage .lab-node[data-id="${labId}"]`).scrollIntoViewIfNeeded();
    await page.tap(`#garage .lab-node[data-id="${labId}"]`);
    await sleep(300);
    await shot('71-labor-knoten');
    await page.tap('#garage .lab-detail [data-a=buy]');
    await sleep(400);
    const lab1 = await g((id) => ({ done: window.__game.save.research.done.includes(id), n: window.__game.save.research.done.length, bp: window.__game.save.meta.blueprints, cls: document.querySelector(`#garage .lab-node[data-id="${id}"]`).className }), labId);
    check(lab1.done && lab1.bp < lab0.bp && /s-done/.test(lab1.cls), `Labor: ${labId} erforscht (📘 ${lab0.bp} → ${lab1.bp})`);
    await shot('72-labor-erforscht');

    // ---------- Phase 5: Lackiererei ----------
    await page.tap('#garage .g-tab[data-tab=paint]');
    await sleep(500);
    const paintId = 'p_gartenzwerg_rot';
    await page.locator(`#garage .pcard.paint[data-paint=${paintId}]`).scrollIntoViewIfNeeded();
    await page.tap(`#garage .pcard.paint[data-paint=${paintId}] .pc-name`);
    await sleep(500);
    await shot('73-lack-vorschau');
    const sc5 = await g(() => window.__game.save.meta.scrap);
    await page.tap(`#garage .pcard.paint[data-paint=${paintId}] [data-act=buy]`);
    await sleep(500);
    const paint = await g(() => ({ owned: window.__game.save.cosmetics.owned, paint: window.__game.save.cosmetics.paint, scrap: window.__game.save.meta.scrap, vis: window.__game.model.userData.visual || null }));
    check(paint.owned.includes(paintId) && paint.paint === paintId && paint.scrap < sc5, `Lackierung gekauft und angelegt (⚙ ${sc5} → ${paint.scrap})`);
    check(paint.vis && paint.vis.color === '#d1352b', `Lack am Fahrzeugmodell sichtbar (${paint.vis && paint.vis.color})`);
    await shot('74-lack-gekauft');
    await page.tap('#garage .g-tab[data-tab=garage]');
    await sleep(300);
    // ganzer Baum erforscht → Werkbank/Schwarzmarkt im nächsten Run möglich
    await devTap('researchAll');
    await closeDev();

    // ---------- Fortsetzen nach Neustart ----------
    await page.tap('#garage [data-id=start]');
    await waitState('map', 5000);
    const runSeed = await g(() => window.__game.run.seed);
    preSamples = await g(() => window.__samples);
    await page.reload({ waitUntil: 'load' });
    await waitState('garage', 15000);
    await sleep(600);
    const cont = await g(() => ({ seed: window.__game.run && window.__game.run.seed, txt: document.querySelector('#garage [data-id=start]').textContent, giveup: !document.querySelector('#garage [data-id=giveup]').classList.contains('hidden') }));
    check(cont.seed === runSeed && /FORTSETZEN/.test(cont.txt) && cont.giveup, 'Run nach Neustart fortsetzbar (RUN FORTSETZEN + Aufgeben)');
    await shot('51-garage-fortsetzen');
    await g(() => {
      window.__samples = [];
      setInterval(() => {
        const gm = window.__game;
        const s = gm.carScreen();
        window.__samples.push({ state: gm.state, phase: gm.stage ? gm.stage.phase : null, x: s.x, y: s.y, w: innerWidth, h: innerHeight });
      }, 100);
    });

    // ---------- Phase 5: jeden Knotentyp einmal besuchen ----------
    const forceNode = async (type) => {
      await openDev();
      await page.locator('#devmenu [data-id=ntype]').scrollIntoViewIfNeeded();
      await page.selectOption('#devmenu [data-id=ntype]', type);
      await page.tap('#devmenu [data-a=force]');
      await sleep(200);
      const msg = await page.locator('#devmenu [data-id=msg]').textContent();
      await closeDev();
      return msg;
    };
    const tapNode = async () => {
      const reach = await g(() => window.__game.reachable());
      await page.locator(`.mnode[data-node="${reach[0].id}"]`).scrollIntoViewIfNeeded();
      await page.tap(`.mnode[data-node="${reach[0].id}"]`);
      await sleep(500);
      return reach[0];
    };
    const kindNow = () => g(() => window.__game.runScreens.open && window.__game.runScreens.kind);
    const tapRun = async (sel) => { await page.locator(`#runui ${sel}`).first().scrollIntoViewIfNeeded(); await page.locator(`#runui ${sel}`).first().tap(); await sleep(400); };
    // Shop verlassen (Weiter), danach offene Auswahlen, zurück auf der Karte ohne offenen Knoten
    const leaveShop = async () => {
      for (let i = 0; i < 6; i++) {
        const k = await kindNow();
        if (k === 'choice' || k === 'replace') { await handleChoices(); continue; }
        if (k === 'pick') { await tapRun('[data-pick]'); continue; }
        const b = await g(() => { const c = document.querySelector('#runui'); for (const a of ['leave', 'cont', 'pending']) if (c.querySelector(`[data-a=${a}]`)) return a; return null; });
        if (!b || !k) break;
        await tapRun(`[data-a=${b}]`);
      }
    };
    await page.tap('#garage [data-id=start]');
    await waitState('map', 5000);
    await sleep(400);
    await g(() => { const r = window.__game.run; r.bolts = 900; r.inventory.length = Math.min(r.inventory.length, 2); });
    const shopSeen = [];

    // 🛒 Schrotthändler
    check(/dealer/.test(await forceNode('dealer')), 'Dev: nächste Knoten → Schrotthändler');
    const dn = await tapNode();
    check((await kindNow()) === 'dealer', 'Schrotthändler öffnet');
    await shot('80-haendler');
    const d0 = await g(() => ({ cards: document.querySelectorAll('#runui .icard').length, ab: !!document.querySelector('#runui .sh-ability'), bolts: window.__game.run.bolts, inv: window.__game.run.inventory.length, offers: window.__game.run.current.shop.offers.map((o) => o.itemId) }));
    check(d0.cards === 5 && d0.ab, `Händler: ${d0.cards} Items + 1 Fähigkeit`);
    await tapRun('[data-buy="0"]');
    if ((await kindNow()) === 'pick') await tapRun('[data-pick="0"]');
    const d1 = await g(() => ({ bolts: window.__game.run.bolts, inv: window.__game.run.inventory.length, sold: window.__game.run.current.shop.offers[0].sold }));
    check(d1.sold && d1.bolts < d0.bolts, `Händler: Item gekauft (🔩 ${d0.bolts} → ${d1.bolts})`);
    await tapRun('[data-a=reroll]');
    const d2 = await g(() => ({ bolts: window.__game.run.bolts, rerolls: window.__game.run.current.shop.rerolls }));
    check(d2.rerolls === 1 && d2.bolts < d1.bolts && d2.bolts >= d1.bolts - 10, `Händler: neu gewürfelt (−${d1.bolts - d2.bolts} 🔩, Forschungs-Rabatt)`);
    await tapRun('[data-res="1"]');
    check((await g(() => window.__game.run.reserve.length)) === 1, 'Händler: Item für den nächsten Händler reserviert');
    await shot('81-haendler-reserviert');
    await tapRun('[data-a=ability]');
    check((await kindNow()) === 'pick', 'Händler: Fähigkeit → Slot-Auswahl');
    await shot('82-haendler-faehigkeit');
    const abNew = await g(() => window.__game.run.current.shop.ability.id);
    await tapRun('[data-pick="1"]');
    check((await g(() => window.__game.run.abilities[1])) === abNew, `Händler: Fähigkeit ${abNew} ersetzt Slot 2 für den Run`);
    // App-Neustart mitten im Shop
    const offersBefore = await g(() => window.__game.run.current.shop.offers.map((o) => `${o.itemId}:${o.sold}`));
    preSamples.push(...(await g(() => window.__samples)));
    await page.reload({ waitUntil: 'load' });
    await waitState('garage', 15000);
    await sleep(500);
    await g(() => { window.__samples = []; setInterval(() => { const gm = window.__game; const s = gm.carScreen(); window.__samples.push({ state: gm.state, phase: gm.stage ? gm.stage.phase : null, x: s.x, y: s.y, w: innerWidth, h: innerHeight }); }, 100); });
    await page.tap('#garage [data-id=start]');
    await waitState('map', 5000);
    await sleep(600);
    const resumed = await g(() => ({ kind: window.__game.runScreens.kind, offers: window.__game.run.current && window.__game.run.current.shop.offers.map((o) => `${o.itemId}:${o.sold}`) }));
    check(resumed.kind === 'dealer' && JSON.stringify(resumed.offers) === JSON.stringify(offersBefore), 'Neustart mitten im Händler: geht im Shop weiter (gleiche Auslage)');
    await shot('83-haendler-fortgesetzt');
    await leaveShop();
    check((await g(() => window.__game.run.current)) === null && (await g(() => window.__game.run.visited.includes(window.__game.run.pos.node))), 'Händler verlassen, Knoten besucht');
    shopSeen.push('dealer');

    // 🔧 Werkbank
    await g(() => { const r = window.__game.run; r.inventory.length = 0; window.__game.devAddItem('feuer_buegeleisen'); window.__game.devAddItem('feuer_buegeleisen'); window.__game.devAddItem('gyro_omas_kreisel'); });
    await forceNode('workbench');
    await tapNode();
    check((await kindNow()) === 'workbench', 'Werkbank öffnet');
    await shot('84-werkbank');
    const wb0 = await g(() => ({ opts: [...document.querySelectorAll('#runui .wb-opt')].map((e) => e.className), inv: window.__game.run.inventory.length }));
    check(wb0.opts.some((c) => /tier/.test(c)) && wb0.opts.some((c) => /hybrid/.test(c)), `Werkbank: ★-Fusion und Hybrid angeboten (${wb0.opts.length} Möglichkeiten)`);
    const tierIdx = wb0.opts.findIndex((c) => /tier/.test(c));
    await tapRun(`[data-fuse="${tierIdx}"]`);
    const wb1 = await g(() => window.__game.run.inventory.map((e) => `${e.itemId}★${e.tier}`));
    check(wb1.includes('feuer_buegeleisen★2') && wb1.length === wb0.inv - 1, `Werkbank: ★-Fusion (${wb1.join(', ')})`);
    await shot('85-werkbank-fusion');
    const b5 = await g(() => window.__game.run.bolts);
    await tapRun('[data-scrap="1"]');
    await page.tap('.modal .btn-danger');
    await sleep(400);
    check((await g(() => window.__game.run.bolts)) > b5, 'Werkbank: Item zerlegt → Schrauben');
    await leaveShop();
    shopSeen.push('workbench');

    // 🕳 Schwarzmarkt
    await forceNode('blackmarket');
    await tapNode();
    check((await kindNow()) === 'blackmarket', 'Schwarzmarkt öffnet');
    await shot('86-schwarzmarkt');
    const fuel0 = await g(() => window.__game.run.runMods.fuelMaxAdd);
    await tapRun('[data-buy="0"][data-pay="fuel"]');
    if ((await kindNow()) === 'pick') await tapRun('[data-pick="0"]');
    const bm = await g(() => ({ fuel: window.__game.run.runMods.fuelMaxAdd, cursed: window.__game.run.inventory.filter((e) => window.__game.runLogic && e.itemId).length, sold: window.__game.run.current.shop.offers[0].sold }));
    check(bm.sold && bm.fuel === fuel0 - 15, `Schwarzmarkt: verfluchtes Item gegen −15 max. Treibstoff (${fuel0} → ${bm.fuel})`);
    await tapRun('[data-rm]');
    check(await g(() => window.__game.run.inventory.some((e) => e.cleansed)), 'Schwarzmarkt: Fluch entfernt');
    await shot('87-schwarzmarkt-fluch-weg');
    await leaveShop();
    shopSeen.push('blackmarket');

    // ❓ Ereignis
    await forceNode('event');
    await tapNode();
    check((await kindNow()) === 'event', 'Ereignis öffnet');
    await shot('88-ereignis');
    const evOpts = await g(() => document.querySelectorAll('#runui .ev-opt').length);
    check(evOpts >= 2, `Ereignis: ${evOpts} Optionen`);
    await tapRun('.ev-opt:not(.off)');
    if ((await kindNow()) === 'pick') await tapRun('[data-pick]');
    check(await g(() => !!window.__game.run.current.shop.result), 'Ereignis: Ausgang gewürfelt');
    await shot('89-ereignis-ergebnis');
    const elite = await g(() => window.__game.run.current.type === 'elite');
    if (elite) {
      await tapRun('[data-a=cont]');
      await handleChoices();
      if ((await kindNow()) === 'intro') { await shot('89b-ereignis-elite'); await tapRun('[data-a=back]'); }
      await devSkip('skipGold');
      await pressNext();
    } else await leaveShop();
    await waitState('map', 5000);
    shopSeen.push('event');

    // 💰 Schatzhaufen
    await forceNode('treasure');
    await tapNode();
    check((await kindNow()) === 'treasure', 'Schatzhaufen öffnet');
    await shot('90-schatz');
    const inv7 = await g(() => window.__game.run.inventory.length + window.__game.run.pendingChoices.length);
    await tapRun('[data-a=take]');
    await shot('91-schatz-genommen');
    check(await g((n) => window.__game.run.current.shop.result.taken && window.__game.run.inventory.length + window.__game.run.pendingChoices.length >= n + 1, inv7), 'Schatz: Item genommen');
    await leaveShop();
    shopSeen.push('treasure');

    // ⛽ Tankstelle
    await forceNode('station');
    await tapNode();
    check((await kindNow()) === 'station', 'Tankstelle öffnet');
    await shot('92-tankstelle');
    await tapRun('[data-choice=cool]');
    await waitState('map', 5000);
    check((await g(() => window.__game.run.runMods.coolMul)) > 0, 'Tankstelle: Kühlerspülung');
    shopSeen.push('station');
    check(shopSeen.length === 6, `Alle Knotentypen besucht: ${shopSeen.join(', ')} (+ Etappe/Elite/Boss im Run)`);
    await shot('93-karte-nach-shops');
    await page.tap('#map [data-id=garage]');
    await waitState('garage', 5000);

    // ---------- Phase 6: Schrottstufen, Boss-Intros aller 6 Bosse, Statistik, Dev-Menü ----------
    // laufenden Run beenden (Aufgeben → Auszahlung), Schrottstufen per Dev freischalten, Stufe 3 in der Garage wählen
    await g(() => { const G = window.__game; G.runLogic.giveUp(G.run); G.runLogic.endRun(G.save, G.run); G.openGarage(); });
    await waitState('garage', 5000);
    check(/Schrottstufen bis 15/.test(await devTap('asc')), 'Dev: Schrottstufen freigeschaltet');
    await closeDev();
    await g(() => window.__game.openGarage());
    await sleep(300);
    check(await page.locator('#garage [data-id=asc]').isVisible(), 'Garage: Schrottstufen-Wahl sichtbar');
    for (let i = 0; i < 3; i++) { await page.tap('#garage [data-id=ascnext]'); await sleep(150); }
    check((await g(() => window.__game.save.ascension.selected)) === 3, 'Garage: Schrottstufe 3 gewählt (▶ ×3)');
    await shot('a1-garage-schrottstufe');
    await page.tap('#garage [data-id=start]');
    await waitState('map', 5000);
    await sleep(300);
    const ascRun = await g(() => ({ asc: window.__game.run.ascension, chip: !document.querySelector('#map [data-id=asc]').classList.contains('hidden') }));
    check(ascRun.asc === 3 && ascRun.chip, `Run mit Schrottstufe 3 gestartet, Karte zeigt ☠ (${JSON.stringify(ascRun)})`);
    await page.tap('#map [data-id=asc]');
    await sleep(300);
    check(/Schrottstufe 3/.test(await page.locator('#map [data-id=info]').textContent()), 'Karte: aktive Erschwerungen');
    await shot('a2-karte-schrottstufe');
    await tapNode();
    check((await kindNow()) === 'intro', 'Etappen-Intro');
    const ascChips = await page.locator('#runui .chip.danger').allTextContents();
    check(ascChips.some((t) => /Ziele \+8 %/.test(t)) && ascChips.some((t) => /Abschleppen/.test(t)), `Intro: Schrottstufen-Erschwerungen (${ascChips.join(' | ')})`);
    const tgt = await g(() => { const G = window.__game; const sp = G.runLogic.stageSpecFor(G.run, G.reachable()[0].id); return { t: sp.target, base: sp.floor === 0 ? 330 : 0 }; });
    check(tgt.base === 0 || tgt.t === Math.round((tgt.base * 1.08) / 5) * 5, `Zielmarke mit Schrottstufe (${tgt.t} m)`);
    await shot('a3-intro-schrottstufe');
    await tapRun('[data-a=back]');
    // Boss-Intros: alle 6 Bosse (Intro-Text, Tipps, Belohnung) mit Erkennungsmelodie
    const bossIds = { 1: ['schrottpresse', 'magnetkran'], 2: ['grosser_graben', 'gluedunen'], 3: ['auge_des_sturms', 'blitzallee'] };
    for (const act of [1, 2, 3]) {
      if (act > 1) await g(() => window.__game.devNextAct());
      for (const id of bossIds[act]) {
        await g((bid) => { const G = window.__game; G.run.bossIds[G.run.act] = bid; G.run.current = null; G.devToBoss(); G.openMap(); G.selectNode(G.run.map.boss.id); }, id);
        await sleep(500);
        const intro = await g(() => ({ kind: window.__game.runScreens.kind, title: document.querySelector('#runui .ri-kind')?.textContent || '', tips: document.querySelectorAll('#runui .ri-tips li').length, boss: document.querySelector('#runui .rc-boss') !== null, reward: /Episch\/Legendär/.test(document.querySelector('#runui').textContent) }));
        check(intro.kind === 'intro' && intro.boss && intro.tips >= 2 && intro.reward, `Boss-Intro ${id}: ${intro.title.trim()} (Tipps ${intro.tips})`);
        await shot(`b-boss-${id}`);
        await tapRun('[data-a=back]');
      }
    }
    // Boss-Strecke: Warnhinweis in der Etappe (Schrottpresse als Dev-Testfahrt nicht nötig – echte Run-Etappe)
    await g(() => { const G = window.__game; G.run.current = null; G.devToBoss(); G.openMap(); G.selectNode(G.run.map.boss.id); });
    await sleep(400);
    await tapRun('[data-a=go]');
    await waitState('stage', 8000);
    await g(() => { const st = window.__game.stage; st.launchNow(0.8, 32); st.vehicle.maxX = st.bossWarn.length ? st.bossWarn[0].x : 0; });
    await page.waitForFunction(() => [...document.querySelectorAll('#popups .popup-warn')].length > 0, null, { timeout: 8000 }).then(() => check(true, 'Boss-Strecke: Warnhinweis eingeblendet')).catch(() => check(false, 'Boss-Strecke: Warnhinweis eingeblendet'));
    await shot('b-boss-warnung');
    await devTap('end');
    await closeDev();
    await page.waitForFunction(() => window.__game.state === 'results', null, { timeout: 10000 });
    await g(() => { const G = window.__game; G.runLogic.giveUp(G.run); G.runLogic.endRun(G.save, G.run); G.openGarage(); });
    await waitState('garage', 5000);
    // Statistik-Reiter: Historie, Bestwerte, entdeckt in %
    await page.tap('#garage [data-tab=stats]');
    await sleep(300);
    const stats = await g(() => ({ runs: document.querySelectorAll('#garage .gs-run').length, progs: document.querySelectorAll('#garage .gs-prog').length, table: document.querySelectorAll('#garage .gs-tr').length }));
    check(stats.runs >= 2 && stats.progs >= 6 && stats.table >= 2, `Statistik: ${stats.runs} Runs in der Historie, ${stats.progs} Fortschrittsbalken, ${stats.table - 1} Schrottstufen-Zeilen`);
    await shot('a4-statistik');
    await page.locator('#garage .gs-hist').scrollIntoViewIfNeeded();
    await shot('a5-statistik-historie');
    await page.tap('#garage [data-tab=garage]');
    await sleep(200);
    // Dev-Menü: Meilensteine mit Zielzeiten, alle balance.js-Abschnitte als Zahlenfelder
    await openDev();
    const devInfo = await g(() => ({ ms: [...document.querySelectorAll('#devmenu .dev-ms .dev-row small')].filter((e) => /Ziel/.test(e.textContent)).length, secs: document.querySelectorAll('#devmenu .dev-sec').length }));
    check(devInfo.ms >= 5 && devInfo.secs >= 25, `Dev: ${devInfo.ms} Meilensteine mit Zielzeit, ${devInfo.secs} balance.js-Abschnitte`);
    await page.locator('#devmenu .dev-sec[data-g=REWARDS] summary').scrollIntoViewIfNeeded();
    await page.tap('#devmenu .dev-sec[data-g=REWARDS] summary');
    await sleep(200);
    const rwInputs = await page.locator('#devmenu .dev-sec[data-g=REWARDS] input').count();
    await page.locator('#devmenu .dev-sec[data-g=REWARDS] input').first().fill('25');
    await page.locator('#devmenu .dev-sec[data-g=REWARDS] input').first().dispatchEvent('change');
    const live = await g(() => window.__game.balance ? window.__game.balance.REWARDS.bolts[1] : null);
    check(rwInputs >= 10 && (live === null || live === 25), `Dev: Abschnitt REWARDS mit ${rwInputs} Zahlenfeldern, Wert live geändert (${live})`);
    await shot('a6-devmenu-werte');
    await page.locator('#devmenu .dev-sec[data-g=REWARDS] [data-pr]').first().tap();
    await closeDev();

    // ---------- Streckenbausteine: Dev-Testfahrten über die Boss-Strecken ----------
    const seenTypes = new Set();
    const bosses = [['schrottplatz', 'schrottpresse'], ['schrottplatz', 'magnetkran'], ['gluewueste', 'grosser_graben'], ['gluewueste', 'gluedunen'], ['gewittersteppe', 'auge_des_sturms'], ['gewittersteppe', 'blitzallee']];
    for (const [bio, boss] of bosses) {
      await g(([b, id]) => window.__game.startTestDrive(b, { kind: 'boss', bossId: id, seed: 5 }), [bio, boss]);
      await page.waitForFunction(() => window.__game.state === 'stage', null, { timeout: 5000 });
      await g(() => window.__game.stage.launchNow(0.6, 30));
      await sleep(300);
      const feats = await g(() => window.__game.track.features.map((f) => ({ type: f.type, x0: f.x0, x1: f.x1, lx: f.lx, edge: f.edge, cx: f.cx })));
      for (const f of feats) {
        if (seenTypes.has(f.type)) continue;
        seenTypes.add(f.type);
        await g((ff) => {
          const st = window.__game.stage, v = st.vehicle, tr = window.__game.track;
          const x = ff.type === 'loop' ? ff.lx - 25 : ff.type === 'gap' ? ff.edge - 14 : ff.type === 'crusher' ? ff.cx - 14 : (ff.x0 + ff.x1) / 2 - 8;
          v.x = x; v.maxX = Math.max(v.maxX, x);
          const onGround = ['loop', 'gap', 'crusher', 'mud', 'sand'].includes(ff.type);
          if (onGround) { v.onGround = true; v.loop = null; v.y = tr.heightAt(x) + 0.9; v.s = ff.type === 'loop' ? 22 : 16; v.angle = Math.atan(tr.slopeAt(x)); }
          else { v.onGround = false; v.loop = null; v.y = tr.heightAt(x) + 7; v.vx = 9; v.vy = 2; v.angle = 0; v.w = 0; }
          v.fuel = Math.max(v.fuel, 60);
          v.durability = v.stats.durabilityMax;
        }, f);
        await sleep(f.type === 'lightning' ? 1500 : f.type === 'loop' ? 900 : 700);
        await shot(`f-${f.type}`);
      }
      await devTap('end');
      await closeDev();
      await page.waitForFunction(() => window.__game.state === 'results', null, { timeout: 10000 });
      await sleep(900);
    }
    check(seenTypes.size >= 10, `Bausteine gesehen: ${[...seenTypes].join(', ')}`);
    await shot('60-testfahrt-auswertung');
    await page.tap('#results [data-id=garage]');
    await waitState('garage', 5000);

    // ---------- Weitflug: Floating Origin, Boden-Pfeil (Dev-Testfahrt) ----------
    await g(() => window.__game.startTestDrive('schrottplatz'));
    await page.waitForFunction(() => window.__game.state === 'stage' && window.__game.stage.phase === 'aim', null, { timeout: 5000 });
    // Tasten werden je Bild abgefragt: erst weiter, wenn die Etappe Bilder verarbeitet (der erste Frame nach dem Aufbau
    // einer neuen Strecke dauert mit Software-Rendering mitunter > 0,5 s – ein kürzerer Tastendruck fiele dazwischen)
    const tReady = Date.now();
    await page.waitForFunction(() => window.__game.stage.launch.armed, null, { timeout: 30000 });
    if (Date.now() - tReady > 1000) log(`Testfahrt bereit nach ${((Date.now() - tReady) / 1000).toFixed(1)} s`);
    await sleep(300);
    const k0 = await g(() => window.__game.stage.launch.angle);
    await page.keyboard.down('ArrowUp');
    await sleep(300);
    await page.waitForFunction((a) => window.__game.stage.launch.angle > a, k0, { timeout: 5000 }).catch(() => {});
    await page.keyboard.up('ArrowUp');
    const k1 = await g(() => window.__game.stage.launch.angle);
    check(k1 > k0, `Pfeil hoch beim Zielen = steiler (${(k0 * 57.3).toFixed(0)}° → ${(k1 * 57.3).toFixed(0)}°)`);
    if (!(k1 > k0)) {
      log(`Diagnose: ${JSON.stringify(await g(() => {
        const a = document.activeElement, gm = window.__game, inp = gm.input;
        return { active: a ? `${a.tagName}#${a.id || ''}[${a.type || ''}] ${a.getAttribute('data-id') || ''}` : null, keys: [...inp.keys], pointers: inp.pointers.size,
          presses: [...inp.presses], paused: gm.paused, phase: gm.stage.phase, state: gm.state, armed: gm.stage.launch.armed, fired: gm.stage.launch.fired,
          charging: gm.stage.launch.charging, x: gm.stage.vehicle.x, t: gm.stage.time, hasFocus: document.hasFocus(), vis: document.visibilityState };
      }))} – Bilder in 1 s: ${await g(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); }))}, danach armed: ${await g(() => window.__game.stage.launch.armed)}`);
    }
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
    await shot('61-weit-und-hoch');
    await page.tap('#hud [data-id=pause]');
    await page.waitForFunction(() => window.__game.paused, null, { timeout: 5000 });
    const quit2 = await page.locator('#pause [data-a=quit]').textContent();
    check(/Testfahrt beenden/.test(quit2), `Pause-Menü der Testfahrt: „${quit2}“`);
    await page.tap('#pause [data-a=quit]');
    await page.waitForFunction(() => window.__game.state === 'results', null, { timeout: 10000 });
    await sleep(1200);
    await page.tap('#results [data-id=garage]');
    await waitState('garage', 5000);
    await sleep(500);
    check((await g(() => window.__game.origin)) === 0, 'Render-Ursprung in der Garage wieder bei 0');

    // ---------- Auswertung der 100-ms-Samples ----------
    const fps = await g(() => new Promise((res) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); }));
    log(`Bildrate (Software-Rendering, Garage): ~${fps} fps`);
    const samples = [...preSamples, ...(await g(() => window.__samples))];
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
