// Phase 7 – Abschluss-Rundgang des Rauchtests: kompletter Neustart (leerer Spielstand) mit Tutorial in drei
// Handy-Auflösungen (360×780, 412×915, 430×932). Jeder Bildschirm wird fotografiert (/tmp/sw-smoke/final-<B>x<H>-*.png)
// und geprüft: nichts ragt seitlich aus dem Bild, kein Knopftext ist abgeschnitten, Touch-Ziele ≥ 44 px, das
// Tutorial erscheint an den richtigen Stellen und jeder Hinweis nur einmal, die Zurück-Taste (Esc) schließt jeweils
// die oberste Ebene, keine Konsolenfehler, das Auto bleibt in der Etappe im Bild.
// Aufruf: von tools/smoke.mjs (am Ende) oder allein: node tools/smoke-final.mjs [Breite]
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RESOLUTIONS = [[360, 780], [412, 915], [430, 932]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Layout-Prüfung des sichtbaren Bildschirms (im Browser): seitlich überstehende Elemente, abgeschnittene Knopftexte,
// zu kleine Touch-Ziele. Elemente in Bildlauf-Bereichen (overflow ≠ visible) zählen nur innerhalb ihres Bereichs.
function layoutIssues() {
  const W = innerWidth, H = innerHeight;
  const out = { overflow: [], cut: [], small: [] };
  const name = (e) => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${e.className && typeof e.className === 'string' ? `.${e.className.trim().split(/\s+/).join('.')}` : ''}${e.dataset && (e.dataset.a || e.dataset.id) ? `[${e.dataset.a || e.dataset.id}]` : ''} „${(e.textContent || '').trim().slice(0, 24)}“`;
  const visible = (e) => {
    if (e.closest('.hidden') || e.closest('#confetti') || e.closest('#popups') || e.closest('#perf')) return null;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none') return null;
    return r;
  };
  const clipped = (e) => {
    for (let p = e.parentElement; p && p.id !== 'ui'; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') return p;
    }
    return null;
  };
  // oberste Ebene: ein offenes Overlay verdeckt alles darunter (nur dessen Inhalt prüfen)
  for (const e of document.querySelectorAll('#ui *')) {
    const r = visible(e);
    if (!r) continue;
    const clip = clipped(e);
    if (!clip && (r.right > W + 1 || r.left < -1)) out.overflow.push(`${name(e)} (${Math.round(r.left)}…${Math.round(r.right)})`);
    if (clip) {
      const cr = clip.getBoundingClientRect();
      const cs = getComputedStyle(clip);
      if (cs.overflowX === 'hidden' && cs.overflowY !== 'hidden' && (r.right > cr.right + 1) && !e.closest('.lab-canvas') && !e.closest('.map-canvas')) out.overflow.push(`${name(e)} (rechts ${Math.round(r.right)} > ${Math.round(cr.right)})`);
    }
    const isBtn = e.tagName === 'BUTTON' || (e.tagName === 'INPUT' && e.type !== 'hidden') || e.tagName === 'SELECT' || e.tagName === 'SUMMARY';
    if (isBtn) {
      // abgeschnittener Text (ohne gewollte Auslassungspunkte)
      const cs = getComputedStyle(e);
      if (e.scrollWidth > e.clientWidth + 2 && cs.textOverflow !== 'ellipsis' && e.tagName === 'BUTTON' && !e.classList.contains('mnode')) out.cut.push(`${name(e)} (${e.scrollWidth} > ${e.clientWidth})`);
      // Touch-Ziel: Knopf selbst oder sein Label mindestens 44 px hoch und breit
      const lab = e.closest('label');
      const rr = lab ? lab.getBoundingClientRect() : r;
      const inViewport = r.bottom > 0 && r.top < H && r.right > 0 && r.left < W;
      if (inViewport && (rr.height < 43.5 || rr.width < 43.5) && !e.closest('.lab-node') && e.type !== 'range') out.small.push(`${name(e)} (${Math.round(rr.width)}×${Math.round(rr.height)})`);
    }
  }
  return out;
}

export async function finalTour({ browser, base, check, log, shotsDir, resolutions = RESOLUTIONS }) {
  for (const [W, H] of resolutions) {
    const tag = `${W}x${H}`;
    log(`---------- Abschluss-Rundgang ${tag} (Neustart mit Tutorial) ----------`);
    const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    const g = (fn, arg) => page.evaluate(fn, arg);
    const issues = { overflow: new Set(), cut: new Set(), small: new Set() };
    let n = 0;
    const shot = async (label, { layout = true } = {}) => {
      n++;
      const file = `${shotsDir}/final-${tag}-${String(n).padStart(2, '0')}-${label}.png`;
      await page.screenshot({ path: file });
      if (layout) {
        const li = await g(layoutIssues);   // (Karten-Knoten haben absichtlich Beschriftung/Ring außerhalb)
        for (const k of Object.keys(issues)) for (const x of li[k]) issues[k].add(`${label}: ${x}`);
      }
    };
    const tut = () => g(() => (window.__game.tutorial.isOpen ? window.__game.tutorial.current : null));
    const waitTut = async (id, timeout = 6000) => {
      try { await page.waitForFunction((i) => window.__game.tutorial.current === i, id, { timeout }); return true; } catch (_) { return false; }
    };
    // Hinweis schließen: Karte → „Verstanden ✔“, Toast (Etappe) → antippen
    const okTut = async () => {
      const toast = await g(() => document.getElementById('tutorial').classList.contains('mode-toast'));
      await page.tap(toast ? '#tutorial .tut-card' : '#tutorial [data-a=ok]');
      await sleep(200);
    };
    const back = async () => { await page.keyboard.press('Escape'); await sleep(250); };
    const runKind = () => g(() => (window.__game.runScreens.open ? window.__game.runScreens.kind : null));
    const tapRun = async (sel) => { await page.locator(`#runui ${sel}`).first().scrollIntoViewIfNeeded(); await page.tap(`#runui ${sel}`); await sleep(350); };
    const seenTut = new Set();
    const expectTut = async (id, label) => {
      const ok = await waitTut(id);
      check(ok, `[${tag}] Tutorial „${id}“ erscheint (${label})`);
      if (ok) { seenTut.add(id); await sleep(450); await shot(`tutorial-${id}`); await okTut(); }
      return ok;
    };
    // Etappe in den Flug bringen (Abschuss mit voller Kraft) und Proben „Auto im Bild“ nehmen
    const samples = [];
    const sample = async () => samples.push(await g(() => { const s = window.__game.carScreen(); return { x: s.x, y: s.y, w: innerWidth, h: innerHeight, st: window.__game.state }; }));

    try {
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await sleep(150);
      await shot('startbildschirm', { layout: false });
      await page.waitForFunction(() => window.__game && window.__game.state === 'garage', null, { timeout: 20000 });
      check(await g(() => !window.__game.save.tutorial.off && Object.keys(window.__game.save.tutorial.seen).every((k) => k === 'garage')), `[${tag}] neuer Spielstand: Tutorial an, noch kein Hinweis gesehen`);

      // ---------- Garage ----------
      await expectTut('garage', 'erste Garage');
      await shot('garage');
      await page.tap('#garage [data-id=settings]');
      await sleep(300);
      await shot('einstellungen');
      check(await g(() => document.querySelectorAll('#settings input[type=range]').length === 2 && document.querySelectorAll('#settings [data-q]').length === 3),
        `[${tag}] Einstellungen: Regler Effekte/Musik und Grafik Niedrig/Mittel/Hoch`);
      await page.locator('#settings [data-id=version]').scrollIntoViewIfNeeded();
      await shot('einstellungen-unten');
      await g(() => { const v = document.querySelector('#settings [data-id=version]'); for (let i = 0; i < 7; i++) v.click(); });
      await sleep(250);
      check(await g(() => window.__game.devMenu.isOpen), `[${tag}] Dev-Menü (7× Versionsnummer)`);
      await g(() => { document.querySelector('#devmenu .dev-help').open = true; });
      await shot('devmenu-hilfe');
      await back();   // Dev-Menü zu
      check(!(await g(() => window.__game.devMenu.isOpen)), `[${tag}] Zurück schließt das Dev-Menü`);
      await back();   // Einstellungen zu
      check(await g(() => document.querySelector('#settings').classList.contains('hidden')), `[${tag}] Zurück schließt die Einstellungen`);
      // Reiter
      for (const t of ['lab', 'paint', 'stats']) {
        await page.tap(`#garage [data-tab=${t}]`);
        await sleep(350);
        await shot(`garage-${t}`);
      }
      await back();
      check((await g(() => window.__game.garage.tab)) === 'garage', `[${tag}] Zurück: Reiter → Garage`);
      await page.locator('#garage .slot-row[data-slot=wheels]').scrollIntoViewIfNeeded();
      await page.tap('#garage .slot-row[data-slot=wheels] .sr-info');
      await sleep(350);
      await shot('teile-auswahl');
      await back();
      check(!(await g(() => window.__game.garage.pickerOpen)), `[${tag}] Zurück schließt die Teile-Auswahl`);
      await page.tap('#garage [data-id=codex]');
      await sleep(350);
      await shot('kompendium');
      await back();
      // Zurück in der Garage → „Spiel beenden?“ (Abbrechen)
      await back();
      check(await g(() => !!document.querySelector('#ui .modal')), `[${tag}] Zurück in der Garage fragt „Spiel beenden?“`);
      await shot('beenden-dialog');
      await back();
      check(await g(() => !document.querySelector('#ui .modal')), `[${tag}] Zurück im Dialog = Abbrechen`);

      // ---------- Run: Karte ----------
      // Paket A: die Karte fährt bei nur einem Weg selbst weiter – im Rundgang aus (eigene Prüfung unten), damit jeder
      // Knoten gezielt angetippt werden kann
      await g(() => { window.__game.balance.MAP.autoAdvanceDelay = 3600; });
      // Ergebnis + Beute auf einem Bildschirm: erste Karte nehmen, weitere Auswahlen (Kisten) ebenso; ohne Beute „Weiter“
      const finishResult = async () => {
        for (let k = 0; k < 6; k++) {
          const kind = await runKind();
          if (kind !== 'result' && kind !== 'choice' && kind !== 'replace') return;
          // erste Beute erst später (z. B. nach einer Notlandung): Hinweis „Items & Tags“ zuerst schließen
          const t = await tut();
          if (t) { seenTut.add(t); await okTut(); continue; }
          if (kind === 'replace') await tapRun('[data-rep="0"]');   // Rucksack voll: erstes Item ersetzen
          else if (await g(() => !!document.querySelector('#runui [data-pick]'))) await tapRun('[data-pick="0"]');
          else if (await g(() => !!document.querySelector('#runui [data-a=next]'))) await tapRun('[data-a=next]');
          else if (await g(() => !!document.querySelector('#runui [data-a=land]'))) await tapRun('[data-a=land]');
          else return;
          await sleep(300);
        }
      };
      // Zielansicht (Knoten noch nicht betreten) → Karte
      const toMap = async () => {
        if ((await g(() => window.__game.state)) === 'stage') { await back(); await sleep(300); }
        await page.waitForFunction(() => window.__game.state === 'map' && !window.__game.runScreens.open, null, { timeout: 8000 });
      };
      await page.tap('#garage [data-id=start]');
      await page.waitForFunction(() => window.__game.state === 'map', null, { timeout: 8000 });
      await expectTut('map', 'erste Karte');
      await shot('karte');
      const node = await g(() => window.__game.reachable()[0].id);
      await page.locator(`#map [data-node="${node}"]`).scrollIntoViewIfNeeded();
      await page.tap(`#map [data-node="${node}"]`);
      await page.waitForFunction(() => window.__game.state === 'stage' && window.__game.stage.phase === 'aim', null, { timeout: 15000 });
      // Paket A: Intro als Banner über der Zielansicht (kein eigener Bildschirm), Hinweise als Sprechblase beim Zielen
      check(await g(() => !document.querySelector('#hud .stage-banner').classList.contains('hidden') && !!document.querySelector('#hud .stage-banner .ri-target')), `[${tag}] Etappen-Intro als Banner über der Zielansicht`);
      await expectTut('launch', 'Zielen (Sprechblase)');
      await expectTut('fly', 'noch beim Zielen (Sprechblase)');
      await shot('etappen-banner');
      await back();
      check((await runKind()) === null && (await g(() => window.__game.state)) === 'map' && (await g(() => !window.__game.run.current)), `[${tag}] Zurück in der Zielansicht → Karte (Knoten nicht betreten)`);
      await page.tap(`#map [data-node="${node}"]`);
      await page.waitForFunction(() => window.__game.state === 'stage' && window.__game.stage.phase === 'aim', null, { timeout: 15000 });
      await shot('etappe-zielen');
      await g(() => window.__game.stage.launchNow(0.9, 34));
      await sleep(200);
      check(await g(() => window.__game.run.current && window.__game.run.current.node) === node, `[${tag}] Abschuss betritt den Knoten`);
      check(await g(() => document.querySelector('#hud .stage-banner').classList.contains('hidden')), `[${tag}] Banner verschwindet beim Abschuss`);
      for (let i = 0; i < 12; i++) {
        await sample();
        if (await tut()) check(false, `[${tag}] kein Hinweis im Flug über dem HUD`);
        await sleep(150);
      }
      check(true, `[${tag}] kein Hinweis im Flug über dem HUD (12 Proben)`);
      await shot('etappe-flug');
      // Vorspulen: warten, bis die Kiste ausrollt (⏩ ×4 im HUD), dann Tippen = Sofort-Ende
      const ff = await page.waitForFunction(() => { const s = window.__game.stage; return !s || s.phase !== 'fly' || s.fastForward || !!s.settle; }, null, { timeout: 30000 }).then(() => true).catch(() => false);
      const ffOn = ff && (await g(() => { const s = window.__game.stage; return !!s && s.phase === 'fly' && (s.fastForward || !!s.settle); }));
      if (ffOn) {
        check(await g(() => !document.querySelector('#hud .hud-ff').classList.contains('hidden')), `[${tag}] HUD zeigt das Vorspulen`);
        await shot('etappe-vorspulen');
        await page.tap('#game', { position: { x: Math.round(W / 2), y: Math.round(H / 2) } });
        await page.waitForFunction(() => !window.__game.stage || window.__game.stage.phase === 'over', null, { timeout: 5000 }).catch(() => {});
        check(await g(() => !window.__game.stage || window.__game.stage.instantDone || window.__game.stage.phase === 'over'), `[${tag}] Tippen beim Ausrollen beendet die Etappe sofort`);
      } else {
        await back();
        check(await g(() => window.__game.paused), `[${tag}] Zurück in der Etappe = Pause`);
        await shot('pause');
        await back();
        check(await g(() => !window.__game.paused), `[${tag}] Zurück in der Pause = weiter`);
        await g(() => window.__game.devSkip('gold'));
      }
      await page.waitForFunction(() => window.__game.runScreens.kind === 'result', null, { timeout: 20000 });
      await sleep(1200);
      await shot('ergebnis');
      check(await g(() => window.__game.save.meta.scrap > 0), `[${tag}] Schrott der Etappe ist sofort gutgeschrieben`);
      if (await g(() => !!document.querySelector('#runui [data-pick]'))) {
        await expectTut('items', 'Beute auf dem Ergebnis-Bildschirm');
        await shot('ergebnis-beute');
        await back();
        check((await runKind()) === 'result', `[${tag}] Zurück im Ergebnis mit Beute schließt es nicht`);
      } else if (await g(() => !!document.querySelector('#runui [data-a=land]'))) {
        await shot('notlandung');
      }
      await finishResult();
      await toMap();
      await page.tap('#map [data-id=items]');
      await sleep(350);
      await shot('inventar');
      await back();

      // ---------- Sonderknoten ----------
      const visit = async (type, label, fn) => {
        await g((t) => window.__game.devForceNode(t), type);
        const id = await g(() => window.__game.reachable()[0].id);
        await page.locator(`#map [data-node="${id}"]`).scrollIntoViewIfNeeded();
        await page.tap(`#map [data-node="${id}"]`);
        await sleep(500);
        await fn();
        await page.waitForFunction(() => window.__game.state === 'map' && !window.__game.runScreens.open, null, { timeout: 8000 }).catch(() => {});
        check((await g(() => window.__game.state)) === 'map' && !(await runKind()), `[${tag}] ${label} besucht und verlassen`);
      };
      await g(() => { window.__game.save.run.bolts += 400; });
      await visit('dealer', 'Schrotthändler', async () => {
        await shot('haendler');
        await back();
        check(await g(() => !!document.querySelector('#ui .modal')), `[${tag}] Zurück im Laden fragt „verlassen?“`);
        await shot('laden-verlassen-dialog');
        await page.tap('#ui .modal .btn-danger');
        await sleep(400);
      });
      await visit('workbench', 'Werkbank', async () => {
        await shot('werkbank');
        await tapRun('[data-a=leave]');
      });
      await visit('blackmarket', 'Schwarzmarkt', async () => { await shot('schwarzmarkt'); await tapRun('[data-a=leave]'); });
      await visit('event', 'Ereignis', async () => {
        await shot('ereignis');
        await back();
        await tapRun('[data-opt]:not([disabled])');
        if ((await runKind()) === 'pick') { await tapRun('[data-pick]'); }
        await sleep(300);
        await shot('ereignis-ausgang');
        if (await g(() => !!document.querySelector('#runui [data-a=pending]'))) { await tapRun('[data-a=pending]'); await tapRun('[data-pick]'); }
        if (await g(() => !!document.querySelector('#runui [data-a=cont]'))) await tapRun('[data-a=cont]');
        await sleep(700);
        // Elite-Etappe aus dem Ereignis: direkt in die Zielansicht, fahren (Dev: Gold), dann Beute
        if ((await g(() => window.__game.state)) === 'stage') {
          await g(() => window.__game.devSkip('gold'));
          await page.waitForFunction(() => window.__game.runScreens.kind === 'result', null, { timeout: 15000 });
          await sleep(1200);
          await shot('elite-ergebnis');
          await finishResult();
        }
        await finishResult();
      });
      await visit('treasure', 'Schatzhaufen', async () => {
        await shot('schatz');
        await tapRun('[data-a=take]');
        if ((await runKind()) === 'choice') { await shot('schatz-voll'); await tapRun('[data-a=skip]'); }
        if (await g(() => !!document.querySelector('#runui [data-a=cont]'))) await tapRun('[data-a=cont]');
      });

      // ---------- Boss → Akt-Übergang ----------
      await g(() => window.__game.devToBoss());
      await g(() => window.__game.openMap());
      await sleep(300);
      const boss = await g(() => window.__game.reachable()[0].id);
      await page.locator(`#map [data-node="${boss}"]`).scrollIntoViewIfNeeded();
      await page.tap(`#map [data-node="${boss}"]`);
      await page.waitForFunction(() => window.__game.state === 'stage', null, { timeout: 15000 });
      await sleep(400);
      check(await g(() => !document.querySelector('#fxbanner').classList.contains('hidden') && window.__game.sfx.music !== null), `[${tag}] Boss-Strecke: Einblendung „BOSS“ und Musik-Schleife`);
      await shot('boss-banner');
      await g(() => window.__game.devSkip('gold'));
      await page.waitForFunction(() => window.__game.runScreens.kind === 'result', null, { timeout: 15000 });
      await sleep(1400);
      await shot('boss-besiegt');
      check(await g(() => window.__game.sfx.music === null), `[${tag}] Boss-Musik endet mit der Etappe`);
      await finishResult();
      await page.waitForFunction(() => window.__game.runScreens.kind === 'act', null, { timeout: 8000 });
      await shot('akt-uebergang');
      await back();
      await page.waitForFunction(() => window.__game.state === 'map', null, { timeout: 8000 });
      await shot('karte-akt2');
      await visit('station', 'Tankstelle', async () => { await shot('tankstelle'); await back(); await tapRun('[data-choice=repair]'); });

      // ---------- Verfehlt → Notlandung (weiter auf der Karte) ----------
      await g(() => window.__game.devForceNode('stage'));
      await g(() => window.__game.devSkip('miss'));
      await page.waitForFunction(() => window.__game.runScreens.kind === 'result', null, { timeout: 15000 });
      await sleep(900);
      check(await g(() => !!document.querySelector('#runui [data-a=land]') && !!document.querySelector('#runui [data-a=retry]')), `[${tag}] verfehlt: Notlandung oder Nochmal`);
      await shot('notlandung');
      const nodeMissed = await g(() => window.__game.run.current.node);
      await tapRun('[data-a=land]');
      await toMap();
      check(await g((id) => window.__game.run.visited.includes(id) && !window.__game.run.current, nodeMissed), `[${tag}] Notlandung: weiter auf der Karte`);

      // ---------- Karte fährt bei nur einem Weg selbst weiter ----------
      await g(() => { window.__game.balance.MAP.autoAdvanceDelay = 0.6; window.__game.devForceNode('stage'); });
      await g(() => window.__game.devSkip('gold'));
      await page.waitForFunction(() => window.__game.runScreens.kind === 'result', null, { timeout: 15000 });
      await sleep(900);
      const single = await g(() => { const r = window.__game.run; const n = r.map.floors.flat().find((x) => x.id === (r.current ? r.current.node : r.pos.node)); return n && n.next.length === 1; });
      await finishResult();
      if (single) {
        const auto = await page.waitForFunction(() => window.__game.state === 'stage' || window.__game.runScreens.open, null, { timeout: 4000 }).then(() => true).catch(() => false);
        check(auto, `[${tag}] nur ein Weg: die Karte fährt selbst weiter`);
        // weitergefahren in einen Sonderknoten (Laden, Ereignis …): verlassen, zurück zur Karte
        if ((await runKind()) !== null) {
          await g(() => { const gm = window.__game; const c = gm.run && gm.run.current; if (c && !['stage', 'elite', 'boss'].includes(c.type)) gm.runLogic.leaveNode(gm.run); gm.runScreens.hide(); gm.openMap({ auto: false }); });
          await sleep(400);
        }
        await toMap().catch(() => {});
      }
      await g(() => { window.__game.balance.MAP.autoAdvanceDelay = 3600; });

      // ---------- Run-Sieg (Akt 3, Boss) → Konfetti ----------
      await g(() => { if (window.__game.state !== 'map') window.__game.openMap({ auto: false }); window.__game.devNextAct(); window.__game.devToBoss(); });
      await g(() => window.__game.devSkip('gold'));
      await page.waitForFunction(() => window.__game.runScreens.kind === 'result', null, { timeout: 15000 });
      await sleep(1400);
      await finishResult();
      await page.waitForFunction(() => window.__game.state === 'runEnd', null, { timeout: 8000 });
      await sleep(700);
      check(await g(() => !document.querySelector('#confetti').classList.contains('hidden')), `[${tag}] Run-Sieg: Konfetti`);
      await shot('run-sieg');
      await back();
      await page.waitForFunction(() => window.__game.state === 'garage', null, { timeout: 8000 });
      await expectTut('lab', 'Garage nach dem ersten Run');
      await shot('garage-nach-run');

      // ---------- Tutorial: jeder Hinweis nur einmal, Zurücksetzen ----------
      const st = await g(() => ({ seen: Object.keys(window.__game.save.tutorial.seen).sort(), off: window.__game.save.tutorial.off }));
      const total = await g(() => window.__game.tutorialSteps);
      check(st.seen.length === total && total <= 6 && !st.off, `[${tag}] alle ${total} Hinweise gesehen (${st.seen.join(', ')})`);
      await g(() => window.__game.openGarage());
      await sleep(900);
      check(!(await tut()), `[${tag}] Hinweise erscheinen nur einmal (Garage erneut geöffnet: kein Hinweis)`);
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => window.__game && window.__game.state === 'garage', null, { timeout: 20000 });
      await sleep(900);
      check(!(await tut()) && (await g(() => Object.keys(window.__game.save.tutorial.seen).length)) === total, `[${tag}] Tutorial-Fortschritt übersteht einen Neustart`);
      // Einstellungen: Lautstärke/Qualität werden gespeichert
      await page.tap('#garage [data-id=settings]');
      await sleep(300);
      await page.locator('#settings [data-q=low]').scrollIntoViewIfNeeded();
      await page.tap('#settings [data-q=low]');
      await g(() => { const r = document.querySelector('#settings input[data-v=musicVol]'); r.value = '25'; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); });
      await page.locator('#settings [data-a=tutReset]').scrollIntoViewIfNeeded();
      await page.tap('#settings [data-a=tutReset]');
      await sleep(200);
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => window.__game && window.__game.state === 'garage', null, { timeout: 20000 });
      const set2 = await g(() => ({ q: window.__game.save.settings.quality, m: window.__game.save.settings.musicVol, pr: window.__game.view.renderer.getPixelRatio(), sfx: window.__game.sfx.musicVol }));
      check(set2.q === 'low' && Math.abs(set2.m - 0.25) < 1e-9 && set2.pr <= 1 && Math.abs(set2.sfx - 0.25) < 1e-9, `[${tag}] Einstellungen gespeichert (Qualität ${set2.q}, Pixel-Ratio ${set2.pr}, Musik ${set2.m})`);
      check(await waitTut('lab'), `[${tag}] Tutorial zurückgesetzt: Hinweis erscheint wieder`);
      await shot('tutorial-zurueckgesetzt');
      await page.tap('#tutorial [data-a=skip]');
      await sleep(200);
      check(await g(() => window.__game.save.tutorial.off && !window.__game.tutorial.isOpen), `[${tag}] „Alle Hinweise aus“ schaltet das Tutorial ab`);

      // ---------- Querformat-Hinweis ----------
      await page.setViewportSize({ width: H, height: W });
      await sleep(300);
      check(await g(() => getComputedStyle(document.getElementById('rotate-hint')).display !== 'none'), `[${tag}] Querformat: Hinweis „Handy hochkant halten“`);
      await shot('querformat', { layout: false });
      await page.setViewportSize({ width: W, height: H });
    } catch (e) {
      check(false, `[${tag}] Ausnahme im Abschluss-Rundgang: ${e.message}`);
      try { await page.screenshot({ path: `${shotsDir}/final-${tag}-99-fehler.png` }); } catch (_) { /* egal */ }
    }

    const out = samples.filter((s) => !(s.x >= 0 && s.x <= s.w && s.y >= 0 && s.y <= s.h));
    check(samples.length >= 10 && out.length === 0, `[${tag}] Auto in der Etappe immer im Bild (${samples.length} Proben${out.length ? `, ${out.length}× draußen` : ''})`);
    check(issues.overflow.size === 0, `[${tag}] nichts ragt seitlich aus dem Bild${issues.overflow.size ? `:\n    ${[...issues.overflow].slice(0, 12).join('\n    ')}` : ''}`);
    check(issues.cut.size === 0, `[${tag}] keine abgeschnittenen Knopftexte${issues.cut.size ? `:\n    ${[...issues.cut].slice(0, 12).join('\n    ')}` : ''}`);
    check(issues.small.size === 0, `[${tag}] Touch-Ziele ≥ 44 px${issues.small.size ? `:\n    ${[...issues.small].slice(0, 20).join('\n    ')}` : ''}`);
    check(errors.length === 0, `[${tag}] keine Konsolenfehler${errors.length ? `:\n    ${errors.slice(0, 8).join('\n    ')}` : ''}`);
    log(`${n} Bildschirmfotos: ${shotsDir}/final-${tag}-*.png`);
    await context.close();
  }
}

// ---------- allein starten ----------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const require = createRequire(import.meta.url);
  let pw;
  try { pw = require('playwright'); } catch (_) { pw = require('/opt/node22/lib/node_modules/playwright'); }
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'www');
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json' };
  const server = http.createServer((req, res) => {
    let file = path.normalize(path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const shotsDir = '/tmp/sw-smoke';
  fs.mkdirSync(shotsDir, { recursive: true });
  const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const failures = [];
  const log = (...a) => console.log('•', ...a);
  const check = (c, m) => { if (c) log('OK  ', m); else { failures.push(m); console.log('✗ FEHLER', m); } };
  const only = Number(process.argv[2]);
  for (const f of fs.readdirSync(shotsDir)) if (f.startsWith(only ? `final-${only}x` : 'final-')) fs.rmSync(path.join(shotsDir, f));
  await finalTour({ browser, base: `http://127.0.0.1:${server.address().port}/`, check, log, shotsDir, resolutions: only ? RESOLUTIONS.filter(([w]) => w === only) : RESOLUTIONS });
  await browser.close();
  server.close();
  console.log(failures.length ? `\nRUNDGANG FEHLGESCHLAGEN (${failures.length})` : '\nRUNDGANG BESTANDEN');
  process.exit(failures.length ? 1 : 0);
}
