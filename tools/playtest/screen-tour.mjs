// Bildschirm-Rundgang für die UI-/Stil-Bewertung: fotografiert jeden Bildschirm des Spiels (Handy-Hochformat 412×915
// und PC 1366×768) – Garage mit allen Reitern, Teile-Auswahl, Kompendium, Einstellungen, Tastenbelegung, Karte,
// Rucksack, alle Sonderknoten (Händler, Werkbank, Schwarzmarkt, Ereignis, Schatz, Tankstelle), Etappen-Intro (normal,
// Elite, Boss), HUD beim Zielen und im Flug in allen drei Biomen, Pause, Ergebnis, Item-Auswahl, Akt-Übergang, Run-Ende.
// Für den Rundgang werden Dev-Hilfen benutzt (Währungen, Knoten erzwingen, Etappe überspringen) – es geht nur ums Aussehen.
// Aufruf: node tools/playtest/screen-tour.mjs [--out tools/playtest/shots/tour] [--no-build] [--sizes 360x640,1280x720]
//         [--prefix vorher]   (Paket B: Vorher/Nachher-Fotos, z. B. --out tools/playtest/shots/after-b --prefix nachher)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = (() => { try { return require('playwright'); } catch { return require('/opt/node22/lib/node_modules/playwright'); } })();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILE = path.join(ROOT, 'dist', 'Schleuderwerk-PC.html');
const args = process.argv.slice(2);
const OUT = path.resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join(ROOT, 'tools', 'playtest', 'shots', 'tour'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tour(W, H, tag) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${e.message} @ ${(e.stack || '').split('\n').slice(1, 3).join(' < ').trim()}`));
  await page.addInitScript(() => { if (!sessionStorage.getItem('sw-tour')) { try { localStorage.clear(); } catch {} sessionStorage.setItem('sw-tour', '1'); } });
  await page.goto(pathToFileURL(FILE).href);
  await page.screenshot({ path: path.join(OUT, `${tag}-00-start.png`) }).catch(() => {});
  await page.waitForFunction(() => window.__game && window.__game.state === 'garage', null, { timeout: 60000 });
  const g = (fn, a) => page.evaluate(fn, a);
  let n = 0;
  const shot = async (name, wait = 500) => { await sleep(wait); n++; await page.screenshot({ path: path.join(OUT, `${tag}-${String(n).padStart(2, '0')}-${name}.png`) }); };
  const step = async (name, fn) => { try { await fn(); } catch (e) { console.log(`  ✗ ${tag} ${name}: ${e.message.split('\n')[0]}`); } };
  const click = async (sel) => { const el = await page.$(sel); if (!el) throw new Error(`fehlt: ${sel}`); await el.click(); await sleep(350); };
  const esc = () => page.keyboard.press('Escape').then(() => sleep(300));

  // Paket B: erster Tutorial-Hinweis (Notizzettel) beim leeren Spielstand
  await step('tutorial', async () => { await page.waitForFunction(() => { const t = document.querySelector('#tutorial'); return t && !t.classList.contains('hidden'); }, null, { timeout: 6000 }); await shot('tutorial', 600); });
  await g(() => { const gm = window.__game; gm.save.settings.quality = 'low'; gm.save.settings.shadows = false; gm.applySettings(); gm.tutorial.skipAll(); gm.save.meta.scrap += 1500; gm.save.meta.blueprints += 12; gm.save.meta.cores += 3; gm.openGarage(); });
  await step('garage', () => shot('garage'));
  await step('garage-scroll', async () => { await g(() => { const s = document.querySelector('#garage [data-id=scroll]') || document.querySelector('#garage .g-scroll'); if (s) s.scrollTop = 400; }); await shot('garage-teile'); await g(() => { const s = document.querySelector('#garage [data-id=scroll]') || document.querySelector('#garage .g-scroll'); if (s) s.scrollTop = 0; }); });
  await step('teile-auswahl', async () => { await click('#garage .slot-row[data-slot=wheels]'); await shot('teile-auswahl'); await esc(); });
  for (const [label, name] of [['Labor', 'labor'], ['Lack', 'lack'], ['Statistik', 'statistik']]) {
    await step(name, async () => {
      const tabs = await page.$$('#garage [data-id=tabs] button, #garage .g-tab');
      for (const t of tabs) if ((await t.textContent()).includes(label)) { await t.click(); break; }
      await shot(name, 700);
    });
  }
  await step('zurück-garage', async () => { const tabs = await page.$$('#garage [data-id=tabs] button, #garage .g-tab'); for (const t of tabs) if ((await t.textContent()).includes('Garage')) { await t.click(); break; } await sleep(300); });
  await step('kompendium', async () => { await click('#garage [data-id=codex]'); await shot('kompendium'); await esc(); });
  await step('einstellungen', async () => { await click('#garage [data-id=settings]'); await shot('einstellungen'); await esc(); });
  await step('tasten', async () => { await page.keyboard.press('KeyK'); await shot('tastenbelegung'); await esc(); });
  await step('dialog', async () => { await esc(); if (await page.$('#ui .modal')) { await shot('dialog'); await esc(); } });

  // Run starten, ein paar Items für einen vollen Rucksack
  await step('run', async () => {
    await g(() => window.__game.startRun());
    await sleep(800);
    await g(() => { const gm = window.__game; for (const id of ['feuer_zuendkerzen_kette', 'elektro_blitzableiter', 'gyro_jojo', 'rakete_colaflaschen_rakete']) gm.devAddItem(id); gm.openMap(); });
    await shot('karte', 800);
  });
  await step('rucksack', async () => { await page.keyboard.press('KeyI'); await shot('rucksack'); await esc(); });
  const enterForced = async (type, name) => {
    await g((t) => window.__game.devForceNode(t), type);
    await sleep(300);
    await g(() => { const r = window.__game.reachable()[0]; window.__game.selectNode(r.id); });
    await shot(name, 800);
  };
  const leave = async () => { for (let i = 0; i < 4; i++) { const k = await g(() => (window.__game.runScreens.open ? window.__game.runScreens.kind : null)); if (!k) break; const b = await page.$('#runui [data-a=leave], #runui [data-a=cont]'); if (b) await b.click(); else await page.keyboard.press('Escape'); await sleep(500); const m = await page.$('.modal .btn-primary, .modal .btn-danger'); if (m) { await m.click(); await sleep(400); } } };
  await step('händler', async () => { await g(() => { window.__game.run.bolts += 200; }); await enterForced('dealer', 'haendler'); await leave(); });
  await step('werkbank', async () => {
    await g(() => { const gm = window.__game; gm.devAddItem('feuer_zuendkerzen_kette'); });
    await enterForced('workbench', 'werkbank');
    await g(() => { const c = document.querySelector('#runui .run-card'); if (c) c.scrollTop = 0; if (document.activeElement) document.activeElement.blur(); });
    await shot('werkbank-oben', 300);
    const chip = await page.$('#runui [data-hyb]'); if (chip) { await chip.click(); await shot('werkbank-hybrid', 400); }
    // ★-Fusion ausführen: der Rucksack hat danach wieder so viele Plätze frei wie vorher
    const tier = await page.$('#runui .wb-opt.tier [data-fuse]'); if (tier) { await tier.click(); await sleep(500); }
    await leave();
  });
  await step('schwarzmarkt', async () => { await enterForced('blackmarket', 'schwarzmarkt'); await leave(); });
  await step('ereignis', async () => { await enterForced('event', 'ereignis'); const o = await page.$('#runui [data-opt]'); if (o) { await o.click(); await shot('ereignis-folge', 600); } await leave(); });
  await step('schatz', async () => { await enterForced('treasure', 'schatz'); await leave(); for (let i = 0; i < 3; i++) { if ((await g(() => window.__game.runScreens.kind)) === 'choice') { await page.keyboard.press('Digit1'); await sleep(400); } } });
  await step('tankstelle', async () => { await enterForced('station', 'tankstelle'); await page.keyboard.press('Digit1'); await sleep(500); });
  // Etappe: Intro, Zielen, Flug, Pause, Ergebnis, Item-Auswahl
  const playStage = async (prefix, skip = 'gold') => {
    await shot(`${prefix}-intro`, 700);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__game.stage && window.__game.stage.phase === 'aim', null, { timeout: 15000 });
    await shot(`${prefix}-zielen`, 700);
    await page.keyboard.down('Space'); await sleep(700); await page.keyboard.up('Space');
    await shot(`${prefix}-flug`, 1500);
    await page.keyboard.down('Space'); await sleep(900); await page.keyboard.up('Space');
    await shot(`${prefix}-flug2`, 900);
    await g((m) => window.__game.devSkip(m), skip);
    await page.waitForFunction(() => window.__game.runScreens.open && window.__game.runScreens.kind === 'result', null, { timeout: 15000 });
    await shot(`${prefix}-ergebnis`, 1500);
    // Paket A/B: Item-Auswahl steht unter dem Ergebnis auf demselben Klemmbrett
    if (await page.$('#runui .ch-cards .icard')) { await g(() => document.querySelector('#runui .ch-cards').scrollIntoView({ block: 'start' })); await shot(`${prefix}-item-auswahl`, 700); }
    await page.keyboard.press(await page.$('#runui [data-pick]') ? 'Digit1' : 'Enter'); await sleep(700);
  };
  await step('etappe', async () => {
    await g(() => window.__game.devForceNode('stage')); await g(() => window.__game.selectNode(window.__game.reachable()[0].id));
    await playStage('etappe');
    if ((await g(() => window.__game.runScreens.kind)) === 'choice') { await shot('item-auswahl'); await page.keyboard.press('Digit1'); await sleep(500); }
    if ((await g(() => window.__game.runScreens.kind)) === 'replace') { await shot('item-ersetzen'); await page.keyboard.press('Escape'); await sleep(400); }
  });
  await step('pause', async () => {
    await g(() => window.__game.devForceNode('elite')); await g(() => window.__game.selectNode(window.__game.reachable()[0].id));
    await shot('elite-intro', 700);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__game.stage && window.__game.stage.phase === 'aim', null, { timeout: 15000 });
    await page.keyboard.down('Space'); await sleep(700); await page.keyboard.up('Space'); await sleep(1200);
    await page.keyboard.press('KeyP'); await shot('pause', 600); await page.keyboard.press('Enter'); await sleep(300);
    await g(() => window.__game.devSkip('miss'));
    await page.waitForFunction(() => window.__game.runScreens.open && window.__game.runScreens.kind === 'result', null, { timeout: 15000 });
    await shot('ergebnis-verfehlt', 1500);
    await g(() => window.__game.devSkip('gold')); await sleep(800);
    for (let i = 0; i < 4; i++) { const k = await g(() => window.__game.runScreens.kind); if (k === 'choice') await page.keyboard.press('KeyS'); else if (k === 'result') await page.keyboard.press('Enter'); else break; await sleep(500); }
  });
  for (const act of [1, 2, 3]) {
    await step(`boss${act}`, async () => {
      await g(() => window.__game.openMap()); await sleep(400);
      await g(() => window.__game.devToBoss()); await sleep(300);
      await shot(`akt${act}-karte-boss`, 600);
      await g(() => window.__game.selectNode(window.__game.reachable()[0].id));
      await playStage(`akt${act}-boss`);
      for (let i = 0; i < 5; i++) {
        const k = await g(() => (window.__game.runScreens.open ? window.__game.runScreens.kind : null));
        if (k === 'choice' || (k === 'result' && await page.$('#runui [data-pick]'))) { await page.keyboard.press('Digit1'); await sleep(500); }
        else if (k === 'result') { await page.keyboard.press('Enter'); await sleep(600); }
        else if (k === 'replace') { await page.keyboard.press('Digit1'); await sleep(500); }
        else if (k === 'act') { await shot(`akt${act}-uebergang`, 900); await page.keyboard.press('Enter'); await sleep(700); }
        else if (k === 'end') { await shot('run-ende-sieg', 1500); await page.keyboard.press('Enter'); await sleep(800); }
        else break;
      }
    });
  }
  await step('garage-danach', () => shot('garage-nach-run', 900));
  console.log(`${tag}: ${n} Bilder, Fehler: ${errors.length ? errors.slice(0, 3).join(' | ') : 'keine'}`);
  await browser.close();
}

if (!args.includes('--no-build') || !fs.existsSync(FILE)) { const { buildPc } = await import('../build-pc.mjs'); await buildPc({ quiet: true }); }
fs.mkdirSync(OUT, { recursive: true });
// Größen: erste = Handy (Hochformat), weitere = PC; Präfix vor dem Dateinamen (Vorher/Nachher-Vergleich)
const SIZES = (args.includes('--sizes') ? args[args.indexOf('--sizes') + 1] : '412x915,1366x768').split(',').map((s) => s.split('x').map(Number));
const PREFIX = args.includes('--prefix') ? `${args[args.indexOf('--prefix') + 1]}-` : '';
for (const [W, H] of SIZES) await tour(W, H, `${PREFIX}${H > W ? 'handy' : 'pc'}`);
