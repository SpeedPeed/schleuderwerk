// Paket C – Bildschirmfotos der Synergie-Oberfläche: Bauplan-Auswahl, Item-Auswahl mit Rezept-Hinweis und ★+1,
// Rucksack (Set-Boni mit Tag-Stärke, Rezepte), Kompendium (Rezepte als Silhouette). Braucht dist/Schleuderwerk-PC.html.
// Aufruf: node tools/playtest/shots-synergy.mjs [--out tools/playtest/shots/synergy] [--sizes 360x640,1280x720]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = (() => { try { return require('playwright'); } catch { return require('/opt/node22/lib/node_modules/playwright'); } })();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const OUT = path.resolve(opt('out', path.join(ROOT, 'tools', 'playtest', 'shots', 'synergy')));
const SIZES = String(opt('sizes', '360x640,1280x720')).split(',').map((s) => s.split('x').map(Number));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

for (const [W, H] of SIZES) {
  const tag = W < 800 ? 'handy' : 'pc';
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { if (!sessionStorage.getItem('sw-syn')) { try { localStorage.clear(); } catch {} sessionStorage.setItem('sw-syn', '1'); } });
  await page.goto(pathToFileURL(path.join(ROOT, 'dist', 'Schleuderwerk-PC.html')).href);
  await page.waitForFunction(() => window.__game && window.__game.state === 'garage', null, { timeout: 60000 });
  const g = (fn, a) => page.evaluate(fn, a);
  const shot = async (name, wait = 700) => { await sleep(wait); await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) }); };
  await g(() => { const gm = window.__game; gm.save.settings.quality = 'low'; gm.applySettings(); gm.tutorial.skipAll(); gm.balance.MAP.autoAdvanceDelay = 3600; });
  // Bauplan-Auswahl beim Run-Start
  await g(() => window.__game.startRun());
  // (Software-Grafik: die ersten Bilder nach dem Laden brauchen Sekunden – erst fotografieren, wenn eingeblendet)
  await page.waitForFunction(() => window.__game.runScreens.kind === 'choice' && getComputedStyle(document.getElementById('runui')).opacity === '1', null, { timeout: 20000 });
  await shot('1-bauplan', 600);
  await page.click('#runui [data-pick="0"]');
  await sleep(600);
  // Rucksack mit Rezept-Partner + Auswahl: Rezept vervollständigen, Doppeltes (★+1)
  await g(() => {
    const gm = window.__game;
    for (const id of ['feuer_zuendkerzen_kette', 'feuer_buegeleisen']) gm.devAddItem(id);
    const run = gm.run;
    const owned = run.inventory[0].itemId;
    run.pendingChoices.push({ context: 'stage', items: ['feuer_grillanzuender', owned, 'gyro_jojo'], skipBolts: 8 });
    gm.openMap();
  });
  await shot('2-auswahl-rezept');
  await page.click('#runui [data-pick="0"]');
  await sleep(900);
  await shot('3-rezept-popup', 200);
  await g(() => window.__game.openMap());
  await sleep(500);
  await page.keyboard.press('KeyI');
  await sleep(400);
  for (const [tab, name] of [['sets', '4-rucksack-sets'], ['recipes', '5-rucksack-rezepte']]) {
    await page.click(`#itemsheet [data-tab=${tab}]`);
    await shot(name, 400);
  }
  await page.keyboard.press('Escape');
  // Kompendium: Rezepte
  await g(() => { const gm = window.__game; gm.itemSheet.openCompendium({ codex: gm.save.codex }); gm.itemSheet.tab = 'recipes'; gm.itemSheet.render(); });
  await shot('6-kompendium-rezepte', 500);
  console.log(`${tag}: Fotos in ${OUT}${errors.length ? `, Fehler: ${errors.join(' | ')}` : ''}`);
  await browser.close();
}
