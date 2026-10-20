// Paket D6 – Textereignisse 26 → 70: Anzahl und Verteilung, Tag-Ereignisse (requires { tag, min }) nur mit ≥ 2 Items
// des Tags im Rucksack, Figuren-Ketten (story / requiresStory) über mehrere Runs mit save.story.seen, Normalisierung
// des Spielstand-Felds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSave, migrate, exportSave, importSave } from '../www/src/save/save.js';
import { SAVE_VERSION } from '../www/src/data/balance.js';
import * as R from '../www/src/run/runState.js';
import * as E from '../www/src/shops/textEvent.js';
import { TEXT_EVENTS } from '../www/src/data/textEvents.js';
import { TAG_IDS } from '../www/src/data/tags.js';
import { ITEMS } from '../www/src/data/items.js';
import { makeRng } from '../www/src/core/rng.js';

const clone = (v) => JSON.parse(JSON.stringify(v));

function setup(seed = 7, save = defaultSave()) {
  save.run = R.newRun(save, { seed });
  save.run.inventory = [];   // ohne Start-Item: Tag-Zählung startet bei 0
  return { save, run: save.run };
}

function enterEvent(run) {
  const n = R.reachableNodes(run)[0];
  n.type = 'event';
  const e = R.enterNode(run, n.id);
  assert.ok(e.ok, e.reason);
  return e;
}

// Zwei verschiedene, nicht verfluchte Items mit genau diesem einen Tag (keine Hybride/Mehrfach-Tags)
const pureItems = (tag) => ITEMS.filter((it) => it.rarity !== 'cursed' && it.tags.length === 1 && it.tags[0] === tag).map((it) => it.id);

test('Textereignisse: 70 Stück, 20 Tag-Ereignisse (2 je Tag), 3 Figuren-Ketten à 3 Kapitel, jeder Akt deutlich mehr Auswahl', () => {
  assert.equal(TEXT_EVENTS.length, 70);
  assert.equal(new Set(TEXT_EVENTS.map((e) => e.id)).size, 70, 'ids eindeutig');
  const tagged = TEXT_EVENTS.filter((e) => e.requires);
  assert.equal(tagged.length, 20);
  for (const t of TAG_IDS) {
    const list = tagged.filter((e) => e.requires.tag === t);
    assert.equal(list.length, 2, `Tag ${t}`);
    for (const e of list) assert.equal(e.requires.min, 2, e.id);
  }
  for (const story of ['gerd', 'kalle', 'vereinswart']) {
    const chain = TEXT_EVENTS.filter((e) => e.story === story);
    assert.equal(chain.length, 3, story);
    const first = chain.find((e) => !e.requiresStory);
    const second = chain.find((e) => e.requiresStory === first.id);
    const third = chain.find((e) => second && e.requiresStory === second.id);
    assert.ok(first && second && third, `${story}: Kette 1 → 2 → 3`);
  }
  for (const act of [1, 2, 3]) assert.ok(E.eventsForAct(act).length >= 40, `Akt ${act}: ${E.eventsForAct(act).length}`);
  // Kerne bleiben exklusiv bei Akt-3-Ereignissen
  for (const e of TEXT_EVENTS) {
    const cores = e.options.some((o) => o.outcomes.some((oc) => oc.effects.some((f) => f.cores)));
    if (cores) assert.deepEqual(e.acts, [3], e.id);
  }
});

test('Tag-Ereignisse: erst mit 2 Items des Tags im Rucksack ziehbar', () => {
  for (const tag of TAG_IDS) {
    const ids = pureItems(tag);
    assert.ok(ids.length >= 2, `${tag}: Test braucht 2 reine Items`);
    const { save, run } = setup(11);
    const tagEvents = TEXT_EVENTS.filter((e) => e.requires && e.requires.tag === tag && e.acts.includes(run.act));
    assert.ok(tagEvents.length >= 1, `${tag}: Tag-Ereignis in Akt 1`);
    const inPool = () => E.eventPool(run, save).filter((e) => e.requires && e.requires.tag === tag).length;
    assert.equal(inPool(), 0, `${tag}: 0 Items`);
    R.giveItem(run, save, ids[0]);
    assert.equal(inPool(), 0, `${tag}: 1 Item reicht nicht`);
    for (const e of tagEvents) assert.equal(E.eventEligible(run, e, save), false);
    // nie gezogen, egal welcher Zufall
    for (let s = 0; s < 300; s++) assert.ok(!E.pickEvent(run, makeRng(s), save).requires, `${tag}: gezogen mit 1 Item`);
    R.giveItem(run, save, ids[1]);
    assert.equal(inPool(), tagEvents.length, `${tag}: 2 Items`);
    for (const e of tagEvents) assert.ok(E.eventEligible(run, e, save), e.id);
    let hit = 0;
    for (let s = 0; s < 600; s++) if (E.pickEvent(run, makeRng(s), save).requires) hit++;
    assert.ok(hit > 0, `${tag}: mit 2 Items ziehbar`);
  }
});

test('Tag-Ereignisse: erscheinen am echten Ereignis-Knoten (eventView) nur mit 2 Items', () => {
  const ids = pureItems('feuer');
  let withTwo = 0, withOne = 0;
  for (let seed = 300; seed < 500; seed++) {
    for (const n of [1, 2]) {
      const { save, run } = setup(seed);
      for (let i = 0; i < n; i++) R.giveItem(run, save, ids[i]);
      enterEvent(run);
      const ev = E.eventView(run, save).event;
      if (ev.requires) { assert.equal(ev.requires.tag, 'feuer'); if (n === 2) withTwo++; else withOne++; }
    }
  }
  assert.equal(withOne, 0, 'mit 1 Feuer-Item nie');
  assert.ok(withTwo > 0, 'mit 2 Feuer-Items erscheint ein Feuer-Ereignis');
});

test('Figuren-Ketten: Folgekapitel erst nach dem Vorgänger aus einem FRÜHEREN Run, Kapitel kommen nicht wieder', () => {
  const save = defaultSave();
  const k1 = E.eventById('ev_kalle_1'), k2 = E.eventById('ev_kalle_2'), k3 = E.eventById('ev_kalle_3');
  let { run } = setup(21, save);
  assert.ok(E.eventEligible(run, k1, save));
  assert.equal(E.eventEligible(run, k2, save), false, 'Teil 2 ohne Teil 1');
  assert.equal(E.eventEligible(run, k3, save), false);
  // Teil 1 im laufenden Run sehen (über den echten Knoten)
  enterEvent(run);
  run.current.shop = { type: 'event', eventId: k1.id, result: null, pending: [], elite: false };
  run.seenEvents.push(k1.id);
  assert.ok(E.chooseOption(run, save, k1.options.length - 1).ok);
  assert.equal(save.story.seen.ev_kalle_1, 1, 'Kapitel gemerkt');
  assert.equal(E.eventEligible(run, k1, save), false, 'Teil 1 kommt nicht wieder');
  assert.equal(E.eventEligible(run, k2, save), false, 'Teil 2 nicht im selben Run');
  // nächster Run: Teil 2 ziehbar, Teil 3 noch nicht
  ({ run } = setup(22, save));
  assert.ok(E.eventEligible(run, k2, save));
  assert.equal(E.eventEligible(run, k3, save), false);
  assert.ok(E.eventPool(run, save).includes(k2));
  assert.ok(!E.eventPool(run, save).includes(k1));
  // ohne Spielstand nie ein Folgekapitel
  assert.equal(E.eventEligible(run, k2, null), false);
  for (let s = 0; s < 300; s++) assert.ok(!E.pickEvent(run, makeRng(s), null).requiresStory);
  // Ziehen über openEvent(run, save) merkt das Kapitel sofort
  let picked = null;
  for (let s = 0; s < 400 && !picked; s++) if (E.pickEvent(run, makeRng(s), save).id === k2.id) picked = s;
  assert.ok(picked !== null, 'Teil 2 wird gezogen');
  enterEvent(run);
  run.current.shop = null;
  const orig = run.seed;
  // Seed suchen, bei dem der Knoten Teil 2 zieht
  let opened = null;
  for (let s = 0; s < 400 && !opened; s++) {
    run.seed = orig + s;
    run.current.shop = null;
    const v = E.eventView(run, save);
    if (v.event.id === k2.id) opened = v;
    else run.seenEvents = run.seenEvents.filter((id) => id !== v.event.id);
  }
  assert.ok(opened, 'eventView(run, save) zieht Teil 2');
  assert.equal(save.story.seen.ev_kalle_2, 1);
  assert.equal(E.eventEligible(run, k3, save), false, 'Teil 3 nicht im selben Run wie Teil 2');
  ({ run } = setup(23, save));
  assert.ok(E.eventEligible(run, k3, save), 'Teil 3 im nächsten Run');
  assert.equal(E.eventEligible(run, k2, save), false);
});

test('Spielstand: story.seen wird ergänzt und bereinigt, Version bleibt', () => {
  const s = defaultSave();
  assert.deepEqual(s.story, { seen: {} });
  // alter Stand ohne Feld → ergänzt, ohne Versionswechsel
  const old = clone(s);
  delete old.story;
  const m = migrate(old);
  assert.deepEqual(m.story, { seen: {} });
  assert.equal(m.version, SAVE_VERSION);
  // kaputte Werte → bereinigt
  const bad = clone(s);
  bad.story = { seen: { ev_kalle_1: 1, ev_gerd_1: 2, 'kein ereignis': 1, ev_vereinswart_1: 'ja' } };
  assert.deepEqual(migrate(bad).story.seen, { ev_kalle_1: 1 });
  const bad2 = clone(s); bad2.story = 'kaputt';
  assert.deepEqual(migrate(bad2).story, { seen: {} });
  const bad3 = clone(s); bad3.story = { seen: [1, 2] };
  assert.deepEqual(migrate(bad3).story, { seen: {} });
  // Export/Import behält den Fortschritt
  const keep = clone(s); keep.story.seen.ev_gerd_1 = 1;
  assert.deepEqual(importSave(exportSave(keep)).story.seen, { ev_gerd_1: 1 });
  // markStorySeen repariert ein fehlendes Feld
  const raw = clone(s); delete raw.story;
  E.markStorySeen(raw, E.eventById('ev_gerd_1'));
  assert.deepEqual(raw.story.seen, { ev_gerd_1: 1 });
  E.markStorySeen(raw, E.eventById('ev_bruno_bringt_was'));
  assert.deepEqual(raw.story.seen, { ev_gerd_1: 1 }, 'nur Ketten-Kapitel');
});
