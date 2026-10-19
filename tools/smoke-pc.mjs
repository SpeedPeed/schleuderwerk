// Rauchtest der PC-Version: baut dist/Schleuderwerk-PC.html (tools/build-pc.mjs), öffnet sie per file:// in Chromium
// (1366×768, Maus/Tastatur, kein Touch, kein Webserver) und spielt NUR mit der Tastatur:
//   Tutorial-Hinweis per Enter weg → Q/E Chassis → Enter = RUN STARTEN → Karte: Pfeiltasten wählen einen Etappen-Knoten,
//   Enter betritt ihn → Intro: Enter = LOS → Etappe: ↑ Winkel, Leertaste halten/loslassen im grünen Bereich, ←/→ neigen,
//   Leertaste = Boost, 1/2 = Fähigkeiten, P = Pause, K = Tastenbelegung, Esc/Enter = weiter → Ergebnis: Enter = Weiter
//   → Item-Auswahl: 1 = nehmen → zurück auf der Karte (Knoten wieder per Pfeiltasten markiert) → Tab-Fokus sichtbar
//   → Esc = Garage → Seite neu laden: Spielstand (localStorage unter file://) ist noch da.
// Geprüft: keine Konsolenfehler, keine Anfragen an Dateien außer der HTML-Datei, Tastatur-Texte (html.kbd), HUD in der
// zentrierten Spalte, Auto in jedem 100-ms-Sample im Bild. Bildschirmfotos: /tmp/sw-pc/*.png
// Aufruf: node tools/smoke-pc.mjs [--no-build]   → Exit-Code 0 bei Erfolg („PC-RAUCHTEST BESTANDEN“)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPc } from './build-pc.mjs';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch (_) { /* lokal nicht installiert */ }
  return require('/opt/node22/lib/node_modules/playwright');
}
const { chromium } = loadPlaywright();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'dist', 'Schleuderwerk-PC.html');
const SHOTS = '/tmp/sw-pc';
const W = 1366, H = 768;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const log = (...a) => console.log('•', ...a);
function check(cond, msg) {
  if (cond) log('OK  ', msg);
  else { failures.push(msg); console.log('✗ FEHLER', msg); }
}

async function main() {
  if (!process.argv.includes('--no-build') || !fs.existsSync(FILE)) {
    const b = await buildPc({ quiet: true });
    log(`gebaut: ${path.relative(ROOT, b.file)} (${b.kb} KB)`);
  }
  fs.rmSync(SHOTS, { recursive: true, force: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  const url = pathToFileURL(FILE).href;

  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith('data:') && u !== url) requests.push(u); });
  const g = (fn, arg) => page.evaluate(fn, arg);
  const kb = page.keyboard;
  const press = async (k, wait = 250) => { await kb.press(k); await sleep(wait); };
  const shot = async (name) => { await page.screenshot({ path: `${SHOTS}/${name}.png` }); log('Screenshot', `${SHOTS}/${name}.png`); };
  const until = (fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
  const runKind = () => g(() => (window.__game.runScreens.open ? window.__game.runScreens.kind : null));
  const active = () => g(() => { const a = document.activeElement; return a ? { cls: String(a.className), kf: a.classList.contains('kf'), text: (a.textContent || '').trim().slice(0, 40), node: a.dataset.node || null } : null; });
  const gameTime = () => g(() => (window.__game.stage ? window.__game.stage.time : 0));

  try {
    // ---------- Start per file:// ----------
    await page.goto(url);
    check(await until(() => window.__game && window.__game.state === 'garage', null, 60000), 'Spiel startet per file:// (Garage)');
    const boot = await g(() => ({ kbd: document.documentElement.classList.contains('kbd'), line: document.querySelector('.boot-keys') ? document.querySelector('.boot-keys').textContent : '', mode: window.__game.inputMode.kbd, build: window.SW_PC_BUILD }));
    check(boot.kbd && boot.mode, 'PC-Darstellung aktiv (html.kbd, Maus/Tastatur)');
    check(/Tastatur: Leertaste halten/.test(boot.line), `Startbildschirm-Zeile „${boot.line.slice(0, 60)}…“`);
    check(!!(boot.build && boot.build.version), `PC-Build-Kennung v${boot.build && boot.build.version}`);
    await g(() => {
      window.__samples = [];
      setInterval(() => {
        const gm = window.__game;
        if (!gm.stage || gm.state !== 'stage') return;
        const s = gm.carScreen();
        window.__samples.push({ phase: gm.stage.phase, x: s.x, y: s.y, w: innerWidth, h: innerHeight });
      }, 100);
    });

    // ---------- Garage: Tutorial weg, Chassis per Q/E, Enter = RUN STARTEN ----------
    check(await until(() => window.__game.tutorial.current === 'garage'), 'Tutorial-Hinweis „Garage“ erscheint');
    const tut = await g(() => document.querySelector('#tutorial .tut-text').textContent);
    check(/Q\/E/.test(tut) && /Enter/.test(tut), `Garage-Hinweis nennt die Tasten („${tut.slice(0, 50)}…“)`);
    await shot('01-garage-tutorial');
    await press('Enter', 400);
    check(await g(() => !window.__game.tutorial.isOpen), 'Enter schließt den Hinweis');
    const gk = await g(() => { const e = document.querySelector('#garage .g-keys'); return e && e.getClientRects().length > 0 ? e.textContent : ''; });
    check(/Enter = Start/.test(gk), `Garage zeigt Tastatur-Zeile („${gk.slice(0, 40)}…“)`);
    const c0 = await g(() => window.__game.garage.viewId);
    await press('KeyE');
    const c1 = await g(() => window.__game.garage.viewId);
    await press('KeyQ');
    const c2 = await g(() => window.__game.garage.viewId);
    check(c1 !== c0 && c2 === c0, `Q/E wechseln das Chassis (${c0} → ${c1} → ${c2})`);
    await press('ArrowRight');
    const c3 = await g(() => window.__game.garage.viewId);
    await press('ArrowLeft');
    check(c3 !== c0 && (await g(() => window.__game.garage.viewId)) === c0, '←/→ ohne Auswahl wechseln das Chassis');
    await press('ArrowDown');
    const f0 = await active();
    check(!!f0 && f0.kf, `Pfeil runter markiert sichtbar ein Element („${f0 && f0.text}“)`);
    await press('Tab');
    const f1 = await active();
    check(!!f1 && f1.kf && f1.text !== f0.text, `Tab bewegt den Fokus („${f1 && f1.text}“)`);
    await shot('02-garage-fokus');
    // Fokus auf den Start-Knopf (Tab im Kreis), dann Enter – oder ohne Fokus: Enter = Hauptaktion
    for (let i = 0; i < 40; i++) {
      if (await g(() => document.activeElement && document.activeElement.dataset.id === 'start')) break;
      await press('Tab', 60);
    }
    check(await g(() => document.activeElement.dataset.id === 'start'), 'Tab erreicht RUN STARTEN');
    await press('Enter', 600);
    check(await until(() => window.__game.state === 'map'), 'Enter → RUN STARTEN → Karte');

    // ---------- Karte: Pfeiltasten wählen, Enter betritt ----------
    if (await until(() => window.__game.tutorial.current === 'map', null, 4000)) {
      const mt = await g(() => document.querySelector('#tutorial .tut-text').textContent);
      check(/Pfeiltasten/.test(mt), 'Karten-Hinweis nennt die Pfeiltasten');
      await press('Enter', 400);
    }
    let f = await active();
    check(!!f && /mnode/.test(f.cls) && /reach/.test(f.cls), `Karte: erreichbarer Knoten ist markiert (${f && f.node})`);
    await shot('03-karte');
    const reach = await g(() => window.__game.reachable());
    const stageNode = reach.find((n) => ['stage', 'elite'].includes(n.type)) || reach[0];
    for (let i = 0; i < reach.length + 1 && f && f.node !== stageNode.id; i++) { await press('ArrowRight', 150); f = await active(); }
    check(!!f && f.node === stageNode.id, `→ wählt den Etappen-Knoten ${stageNode.id} (${stageNode.type}, ${reach.length} erreichbar)`);
    await press('Enter', 600);
    check((await runKind()) === 'intro', 'Enter betritt den Knoten → Etappen-Intro');
    if (await until(() => window.__game.tutorial.current === 'goal', null, 4000)) await press('Enter', 400);
    await shot('04-intro');
    await press('Enter', 300);
    check(await until(() => window.__game.state === 'stage' && window.__game.stage), 'Enter = LOS → Etappe');

    // ---------- Etappe: nur Tastatur ----------
    let cleared = false;
    for (let attempt = 0; attempt < 3 && !cleared; attempt++) {
      await until(() => window.__game.stage && window.__game.stage.launch.armed, null, 30000);
      await sleep(300);
      if (attempt === 0) {
        const hudInfo = await g(() => {
          const r = document.getElementById('hud').getBoundingClientRect();
          const keys = [...document.querySelectorAll('#hud .ability-btn:not(.hidden) .ab-key')].map((e) => e.textContent);
          const aim = document.querySelector('#hud .aim-keys');
          return { left: r.left, width: r.width, keys, aim: aim && aim.getClientRects().length ? aim.textContent : '', abil: window.__game.stage.abilities.slots.map((s) => s.def.id), boostSlot: window.__game.input.boostSlot };
        });
        check(hudInfo.width <= 960 && Math.abs(hudInfo.left + hudInfo.width / 2 - W / 2) < 2, `HUD in zentrierter Spalte (${Math.round(hudInfo.width)} px breit)`);
        check(/Leertaste halten/.test(hudInfo.aim) && /↑\/↓/.test(hudInfo.aim), `Zielen: Tasten-Hinweis „${hudInfo.aim}“`);
        if (await until(() => window.__game.tutorial.current === 'launch', null, 3000)) {
          const lt = await g(() => document.querySelector('#tutorial .tut-text').textContent);
          check(/Leertaste halten/.test(lt) && !/Finger/.test(lt), `Abschuss-Hinweis für Tastatur („${lt.slice(0, 50)}…“)`);
        }
        log(`Fähigkeiten: ${hudInfo.abil.join(', ')} (Leertaste = Slot ${hudInfo.boostSlot + 1})`);
        const a0 = await g(() => window.__game.stage.launch.angle);
        await kb.down('ArrowUp');
        await sleep(400);
        await kb.up('ArrowUp');
        const a1 = await g(() => window.__game.stage.launch.angle);
        check(a1 > a0, `↑ beim Zielen = steiler (${(a0 * 57.3).toFixed(0)}° → ${(a1 * 57.3).toFixed(0)}°)`);
        await kb.down('ArrowDown');
        await sleep(150);
        await kb.up('ArrowDown');
        await shot('05-zielen');
      }
      // Leertaste halten, im grünen Bereich loslassen
      let fired = false;
      for (let t = 0; t < 4 && !fired; t++) {
        await kb.down('Space');
        const ts = Date.now();
        while (Date.now() - ts < 5000 && !(await g(() => window.__game.stage.launch.inSweetSpot))) await sleep(4);
        await kb.up('Space');
        await until(() => { const s = window.__game.stage; return s.phase !== 'aim' || !s.launch.charging; }, null, 5000);
        fired = (await g(() => window.__game.stage.phase)) !== 'aim';
      }
      check(fired, `Abschuss per Leertaste halten/loslassen (Versuch ${attempt + 1}${fired ? `, ${(await g(() => window.__game.stage.perfectLaunch)) ? 'perfekt' : 'normal'}` : ''})`);
      if (attempt === 0) {
        await sleep(700);
        await shot('06-flug');
        await kb.down('ArrowLeft');
        await sleep(150);
        const tl = await g(() => window.__game.input.tilt);
        await kb.up('ArrowLeft');
        await kb.down('ArrowRight');
        await sleep(150);
        const tr = await g(() => window.__game.input.tilt);
        await kb.up('ArrowRight');
        check(tl === 1 && tr === -1, '← = Nase hoch, → = Nase runter');
        const u0 = await g(() => (window.__game.stage ? window.__game.stage.eventCounts.abilityUse || 0 : 0));
        await press('Digit2', 200);
        await press('Digit1', 200);
        const u1 = await g(() => (window.__game.stage ? window.__game.stage.eventCounts.abilityUse || 0 : 0));
        log(`Fähigkeiten per 1/2: abilityUse ${u0} → ${u1}`);
        await kb.down('Space');
        await sleep(300);
        const boosting = await g(() => { const s = window.__game.stage; return !s || s.phase !== 'fly' || s.vehicle.boosting || s.vehicle.fuel <= 0; });
        await kb.up('Space');
        check(boosting, 'Leertaste im Flug = Boost');
        // Pause, Tastenbelegung, weiter
        if ((await g(() => window.__game.state)) === 'stage') {
          await press('KeyP', 300);
          check(await g(() => window.__game.paused), 'P = Pause');
          await shot('07-pause');
          await press('KeyK', 300);
          check(await g(() => window.__game.menus.keysOpen), 'K = Tastenbelegung');
          await shot('08-tastenbelegung');
          await press('Escape', 300);
          check(await g(() => !window.__game.menus.keysOpen && window.__game.paused), 'Esc schließt die Tastenbelegung, Pause bleibt');
          await press('Enter', 300);
          check(await g(() => !window.__game.paused), 'Enter = Weiter (Pause beendet)');
        }
      }
      // weiter fliegen: Nase gerade halten, Boost solange Treibstoff da ist
      const tEnd = Date.now() + 120000;
      let held = null;
      const hold = async (k) => { if (held === k) return; if (held) await kb.up(held); held = k; if (k) await kb.down(k); };
      await kb.down('Space');
      while (Date.now() < tEnd) {
        const st = await g(() => { const gm = window.__game; const s = gm.stage; return { state: gm.state, a: s && s.vehicle ? s.vehicle.angle : 0, ground: s && s.vehicle ? s.vehicle.onGround : true, vy: s && s.vehicle ? s.vehicle.vy : 0, vx: s && s.vehicle ? s.vehicle.vx : 1 }; });
        if (st.state !== 'stage') break;
        const want = st.ground ? 0 : Math.max(-0.5, Math.min(0.5, Math.atan2(st.vy, Math.max(1, st.vx)) * 0.6));
        const d = st.a - want;
        await hold(d > 0.15 ? 'ArrowRight' : d < -0.15 ? 'ArrowLeft' : null);
        await sleep(40);
      }
      await hold(null);
      await kb.up('Space');
      check(await until(() => window.__game.runScreens.open && window.__game.runScreens.kind === 'result', null, 20000), 'Etappe vorbei → Ergebnis');
      const r = await g(() => ({ title: document.querySelector('#runui h2').textContent, next: !!document.querySelector('#runui [data-a=next]') }));
      log(`Ergebnis: ${r.title}`);
      await sleep(900);
      await shot(`09-ergebnis-${attempt + 1}`);
      cleared = r.next;
      await press('Enter', 600);   // Weiter bzw. ↻ Neuversuch (Hauptaktion)
      if (!cleared) check(await until(() => window.__game.state === 'stage'), 'nicht geschafft: Enter = Neuversuch');
    }
    check(cleared, 'Etappe geschafft (Zielmarke per Tastatur erreicht)');

    // ---------- Item-Auswahl: 1 = nehmen ----------
    if (cleared) {
      check(await until(() => window.__game.runScreens.open && window.__game.runScreens.kind === 'choice', null, 5000), 'Item-Auswahl erscheint');
      if (await until(() => window.__game.tutorial.current === 'items', null, 3000)) {
        const it = await g(() => document.querySelector('#tutorial .tut-text').textContent);
        check(/1\/2\/3/.test(it), 'Item-Hinweis nennt 1/2/3');
        await press('Enter', 400);
      }
      await shot('10-item-auswahl');
      const inv0 = await g(() => window.__game.run.inventory.length);
      await press('Digit1', 600);
      const inv1 = await g(() => window.__game.run.inventory.length);
      check(inv1 === inv0 + 1, `1 nimmt das erste Item (Rucksack ${inv0} → ${inv1})`);
      for (let i = 0; i < 5 && (await runKind()) === 'choice'; i++) await press('KeyS', 600);   // weitere Kisten: S = überspringen
    }
    check(await until(() => window.__game.state === 'map' && !window.__game.runScreens.open, null, 8000), 'zurück auf der Karte');
    await sleep(300);
    f = await active();
    check(!!f && /reach/.test(f.cls), `Karte: nächster erreichbarer Knoten markiert (${f && f.node})`);
    await press('ArrowRight', 200);
    await shot('11-karte-danach');
    await press('Tab', 200);
    f = await active();
    check(!!f && f.kf, `Tab: sichtbarer Fokus auf der Karte („${f && (f.text || f.cls)}“)`);
    // Esc = Garage (Run bleibt), K = Tastenbelegung, Esc
    await press('Escape', 500);
    check((await g(() => window.__game.state)) === 'garage', 'Esc auf der Karte → Garage');
    await press('KeyK', 300);
    check(await g(() => window.__game.menus.keysOpen), 'K in der Garage = Tastenbelegung');
    await press('Escape', 300);

    const samples = await g(() => window.__samples || []);

    // ---------- Spielstand im localStorage (file://) ----------
    await page.reload();
    check(await until(() => window.__game && window.__game.state === 'garage', null, 60000), 'Neu geladen');
    const after = await g(() => ({ run: !!window.__game.run, start: document.querySelector('#garage [data-id=start]').textContent }));
    check(after.run && /FORTSETZEN/.test(after.start), `Spielstand bleibt im localStorage erhalten („${after.start}“)`);
    await shot('12-neu-geladen');

    // ---------- Gesamtprüfungen ----------
    const out = samples.filter((s) => s.x < 0 || s.x > s.w || s.y < 0 || s.y > s.h);
    check(samples.length > 20 && out.length === 0, `Auto in jedem 100-ms-Sample im Bild (${samples.length} Samples, ${out.length} draußen)`);
    check(requests.length === 0, `keine Datei-Anfragen außer der HTML-Datei${requests.length ? `: ${requests.slice(0, 3).join(', ')}` : ''}`);
    check(errors.length === 0, `keine Konsolenfehler${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  } catch (e) {
    failures.push(`Ausnahme: ${e.message}`);
    console.log(e);
    await shot('zz-fehler').catch(() => {});
  }
  await browser.close();
  if (failures.length) {
    console.log(`\n✗ PC-RAUCHTEST FEHLGESCHLAGEN (${failures.length}):\n  - ${failures.join('\n  - ')}`);
    process.exit(1);
  }
  console.log('\n✔ PC-RAUCHTEST BESTANDEN');
}

main();
