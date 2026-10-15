// ❓ Ereignis-Knoten (V2-DESIGN.md §4): Textereignisse aus data/textEvents.js mit Entscheidung, Kosten und Risiko.
// Auswahl je Akt (ev.acts), im Run möglichst kein Ereignis doppelt (run.seenEvents); Ausgang deterministisch aus dem
// Run-Seed (Knoten + Option). Alle Effekt-Arten: bolts, scrap, blueprints, hpPct, maxHp, maxFuel, item, removeItem,
// upgradeItem, curse, removeCurse, stage:'elite', cores, nothing. Zahlen: balance.EVENTS. Reine Logik ohne three.js/DOM.
//
// Zustand (run.current.shop): { type: 'event', eventId, result: null | { option, outcome, text, log: [{ icon, text }] },
//   pending: [{ kind: 'upgradeItem'|'removeItem' }] (Effekte mit „choose“ – die Person wählt danach den Platz), elite }
// Kosten (cost) werden VOR dem Würfeln bezahlt; eine Option ist nur wählbar, wenn bezahlbar (optionState).
import { EVENTS } from '../data/balance.js';
import { TEXT_EVENTS } from '../data/textEvents.js';
import { itemById } from '../data/items.js';
import { cursedItemPool } from '../data/index.js';
import { rollItemChoices, rarityWeights } from '../run/rewards.js';
import {
  durabilityMax, runStats, giveItem, giveOrOffer, addRunBolts, healRun, damageRun, addMaxDurability, addMaxFuel, updateCodexSets,
} from '../run/runState.js';
import { entryName, isCursedEntry, upgradeRandom, MAX_TIER } from '../items/inventory.js';
import { shopRng, ownedIds, shopState } from './common.js';
import { makeRng, hashSeed } from '../core/rng.js';

const EVENT_MAP = new Map(TEXT_EVENTS.map((e) => [e.id, e]));
export const eventById = (id) => EVENT_MAP.get(id) || null;

// Ereignisse eines Akts
export const eventsForAct = (act) => TEXT_EVENTS.filter((e) => e.acts.includes(act));

// Ereignis wählen: gleichverteilt aus den Ereignissen des Akts, die im Run noch nicht dran waren (sonst alle des Akts)
export function pickEvent(run, rng) {
  const all = eventsForAct(run.act);
  const fresh = all.filter((e) => !(run.seenEvents || []).includes(e.id));
  return rng.pick(fresh.length ? fresh : all);
}

export function openEvent(run) {
  return shopState(run, 'event', () => {
    const ev = pickEvent(run, shopRng(run, 'ereignis'));
    if (!run.seenEvents.includes(ev.id)) run.seenEvents.push(ev.id);
    return { eventId: ev.id, result: null, pending: [], elite: false };
  });
}

// ---------- Kosten ----------

// Ist eine Option bezahlbar? { available, reason?, costText }
export function optionState(run, opt) {
  const c = opt.cost || {};
  const parts = [];
  let reason = null;
  if (c.bolts) { parts.push(`${c.bolts} 🔩`); if (run.bolts < c.bolts) reason = 'bolts'; }
  if (c.hpPct) {
    const dmg = durabilityMax(run) * c.hpPct;
    parts.push(`${Math.round(c.hpPct * 100)} % 🔧`);
    if (run.durability - dmg <= 0) reason = reason || 'hp';
  }
  if (c.maxFuel) { parts.push(`−${c.maxFuel} max. ⛽`); if (runStats(run).fuelMax - c.maxFuel < EVENTS.minFuelLeft) reason = reason || 'fuel'; }
  if (c.item) { parts.push(c.item === 'choose' ? '1 Fundstück (wählbar)' : '1 zufälliges Fundstück'); if (!run.inventory.length) reason = reason || 'item'; }
  return { available: !reason, reason, costText: parts.join(' + '), chooseItem: c.item === 'choose' };
}

// Anzeige: { event, options: [{ label, hint, costText, available, reason, chooseItem }], result, pending, elite }
export function eventView(run) {
  // nach { stage: 'elite' } ist der Knoten schon eine Elite-Etappe – der Ausgang wird trotzdem noch angezeigt
  const cur = run.current;
  const st = cur && cur.shop && cur.shop.type === 'event' ? cur.shop : openEvent(run);
  if (!st) return null;
  const ev = eventById(st.eventId);
  return {
    event: ev,
    options: ev.options.map((o, i) => ({ index: i, label: o.label, hint: o.hint || '', ...optionState(run, o) })),
    result: st.result,
    pending: st.pending,
    elite: st.elite,
  };
}

// ---------- Effekte ----------

// Item für den Effekt { item: { rarity?, tag? } } würfeln: Pool wie bei der Item-Auswahl (Forschung), keine Doppelten;
// Rückfall: Seltenheit ohne Tag → Tag ohne Seltenheit → irgendein Item
export function rollEventItem(run, spec, rng) {
  const base = { rng, count: 1, act: run.act, research: run.research || [], all: !!run.poolAll, owned: ownedIds(run), ownedWeight: 0 };
  const w = spec.rarity ? { [spec.rarity]: 1 } : rarityWeights(EVENTS.itemContext, run.act);
  const tries = [
    { weights: w, filter: spec.tag ? (it) => it.tags.includes(spec.tag) : null, strict: true },
    { weights: w, filter: null, strict: true },
    { weights: rarityWeights(EVENTS.itemContext, run.act), filter: spec.tag ? (it) => it.tags.includes(spec.tag) : null },
    { weights: rarityWeights(EVENTS.itemContext, run.act), filter: null },
  ];
  for (const t of tries) {
    const filter = t.strict && spec.rarity ? (it) => it.rarity === spec.rarity && (!t.filter || t.filter(it)) : t.filter;
    const ids = rollItemChoices({ ...base, weights: t.weights, filter });
    if (ids.length) return ids[0];
  }
  return null;
}

// Verfluchtes Item dazu (Fluch-Pool). Voller Rucksack: der Fluch verdrängt ein zufälliges nicht verfluchtes Item
// (EVENTS.cursePushesOut). Ergebnis: { itemId, replaced? } oder null
export function addCurse(run, save, rng) {
  const own = new Set(ownedIds(run));
  const pool = cursedItemPool(run.research || [], !!run.poolAll);
  const fresh = pool.filter((it) => !own.has(it.id));
  const def = rng.pick(fresh.length ? fresh : pool);
  if (!def) return null;
  let res = giveItem(run, save, def.id);
  let replaced = null;
  if (!res.ok && res.reason === 'full' && EVENTS.cursePushesOut) {
    const cand = run.inventory.map((e, i) => (isCursedEntry(e) ? -1 : i)).filter((i) => i >= 0);
    const slot = cand.length ? rng.pick(cand) : Math.floor(rng.next() * run.inventory.length);
    replaced = run.inventory[slot];
    res = giveItem(run, save, def.id, { replace: slot });
  }
  return res.ok ? { itemId: def.id, replaced } : null;
}

const fmtN = (n) => String(Math.round(n * 10) / 10).replace('.', ',');

// Einen Effekt anwenden. log: Liste der Anzeige-Zeilen, st: Ereignis-Zustand (pending, elite)
export function applyEffect(run, save, fx, rng, log, st = { pending: [] }) {
  if (fx.nothing) { log.push({ icon: '…', text: 'Nichts passiert.' }); return; }
  if (typeof fx.bolts === 'number') {
    const d = addRunBolts(run, fx.bolts);
    log.push({ icon: '🔩', text: `${d >= 0 ? '+' : '−'}${fmtN(Math.abs(d))} Schrauben`, good: d >= 0 });
  }
  if (typeof fx.scrap === 'number') { run.earned.scrap += Math.max(0, fx.scrap); log.push({ icon: '⚙', text: `+${fmtN(fx.scrap)} Schrott (am Run-Ende)`, good: true }); }
  if (typeof fx.blueprints === 'number') { run.earned.blueprints += Math.max(0, fx.blueprints); log.push({ icon: '📘', text: `+${fx.blueprints} Blaupause`, good: true }); }
  if (typeof fx.cores === 'number') { run.earned.cores += Math.max(0, fx.cores); log.push({ icon: '💠', text: `+${fx.cores} Kern (am Run-Ende)`, good: true }); }
  if (typeof fx.hpPct === 'number') {
    if (fx.hpPct >= 0) log.push({ icon: '🔧', text: `+${fmtN(healRun(run, fx.hpPct))} Haltbarkeit`, good: true });
    else log.push({ icon: '🔧', text: `−${fmtN(damageRun(run, -fx.hpPct, EVENTS.minDurability))} Haltbarkeit`, good: false });
  }
  if (typeof fx.maxHp === 'number') {
    const d = addMaxDurability(run, fx.maxHp);
    log.push({ icon: '🛡️', text: `${d >= 0 ? '+' : '−'}${fmtN(Math.abs(d))} max. Haltbarkeit (Run)`, good: d >= 0 });
  }
  if (typeof fx.maxFuel === 'number') {
    addMaxFuel(run, fx.maxFuel);
    log.push({ icon: '⛽', text: `${fx.maxFuel >= 0 ? '+' : '−'}${Math.abs(fx.maxFuel)} max. Treibstoff (Run)`, good: fx.maxFuel >= 0 });
  }
  if (fx.item) {
    const id = rollEventItem(run, fx.item, rng);
    if (id) {
      const res = giveOrOffer(run, save, id, 'event');
      const d = itemById(id);
      log.push({ icon: d.icon, text: res.queued ? `${d.name} – Rucksack voll: gleich ersetzen oder ablehnen` : `Fundstück: ${d.name}`, good: true, itemId: id });
    } else log.push({ icon: '…', text: 'Kein passendes Fundstück übrig.' });
  }
  if (fx.removeItem) {
    if (!run.inventory.length) log.push({ icon: '…', text: 'Nichts zum Wegnehmen da.' });
    else if (fx.removeItem === 'choose') st.pending.push({ kind: 'removeItem' });
    else {
      const slot = Math.floor(rng.next() * run.inventory.length);
      const [e] = run.inventory.splice(slot, 1);
      updateCodexSets(run, save);
      run.durability = Math.min(run.durability, durabilityMax(run));
      log.push({ icon: '🗑️', text: `Verloren: ${entryName(e)}`, good: false });
    }
  }
  if (fx.upgradeItem) {
    const can = run.inventory.some((e) => (e.tier || 1) < MAX_TIER);
    if (!can) log.push({ icon: '…', text: 'Alle Fundstücke sind schon ★3.' });
    else if (fx.upgradeItem === 'choose') st.pending.push({ kind: 'upgradeItem' });
    else {
      const i = upgradeRandom(run.inventory, rng);
      log.push({ icon: '★', text: `${entryName(run.inventory[i])} → ★${run.inventory[i].tier}`, good: true });
    }
  }
  if (fx.curse) {
    const r = addCurse(run, save, rng);
    if (r) log.push({ icon: '☠', text: `Fluch: ${itemById(r.itemId).name}${r.replaced ? ` (verdrängt ${entryName(r.replaced)})` : ''}`, good: false, itemId: r.itemId });
  }
  if (fx.removeCurse) {
    const cand = run.inventory.map((e, i) => (isCursedEntry(e) ? i : -1)).filter((i) => i >= 0);
    if (!cand.length) log.push({ icon: '…', text: 'Kein Fluch zum Entfernen da.' });
    else {
      const slot = rng.pick(cand);
      run.inventory[slot].cleansed = true;
      run.durability = Math.min(run.durability, durabilityMax(run));
      log.push({ icon: '✨', text: `Fluch entfernt: ${entryName(run.inventory[slot])}`, good: true });
    }
  }
  if (fx.stage === 'elite') {
    st.elite = true;
    log.push({ icon: '☠️', text: 'Elite-Etappe! (Elite-Belohnung)', good: true });
  }
}

// Kosten bezahlen (vor dem Würfeln). slot: Platz bei cost.item 'choose'. Ergebnis: Log-Zeilen
function payCost(run, save, cost, rng, slot) {
  const log = [];
  if (!cost) return log;
  if (cost.bolts) { run.bolts -= cost.bolts; log.push({ icon: '🔩', text: `−${cost.bolts} Schrauben`, good: false }); }
  if (cost.hpPct) {
    const dmg = Math.min(run.durability - EVENTS.minDurability, durabilityMax(run) * cost.hpPct);
    run.durability -= Math.max(0, dmg);
    log.push({ icon: '🔧', text: `−${fmtN(dmg)} Haltbarkeit`, good: false });
  }
  if (cost.maxFuel) { addMaxFuel(run, -cost.maxFuel); log.push({ icon: '⛽', text: `−${cost.maxFuel} max. Treibstoff (Run)`, good: false }); }
  if (cost.item) {
    const i = cost.item === 'choose' ? slot : Math.floor(rng.next() * run.inventory.length);
    const [e] = run.inventory.splice(i, 1);
    updateCodexSets(run, save);
    run.durability = Math.min(run.durability, durabilityMax(run));
    log.push({ icon: '🎒', text: `Abgegeben: ${entryName(e)}`, good: false });
  }
  return log;
}

// Option wählen: bezahlen, Ausgang würfeln, Effekte anwenden.
// opts.slot: Inventar-Platz bei cost.item 'choose'. opts.roll (Tests): fester Ausgang statt Würfeln.
// Ergebnis: { ok, reason?, result, pending, elite }
export function chooseOption(run, save, index, opts = {}) {
  const st = openEvent(run);
  if (!st) return { ok: false, reason: 'noEvent' };
  if (st.result) return { ok: false, reason: 'done' };
  const ev = eventById(st.eventId);
  const opt = ev.options[index];
  if (!opt) return { ok: false, reason: 'index' };
  const os = optionState(run, opt);
  if (!os.available) return { ok: false, reason: os.reason };
  if (os.chooseItem && !(opts.slot >= 0 && opts.slot < run.inventory.length)) return { ok: false, reason: 'slot' };
  const rng = makeRng(hashSeed(`${run.seed}:${run.act}:${run.current.node}:option:${index}`));
  const log = payCost(run, save, opt.cost, rng, opts.slot);
  // Ausgang würfeln (p summiert auf 1)
  let k = typeof opts.roll === 'number' ? opts.roll : -1;
  if (k < 0) {
    const u = rng.next();
    let acc = 0;
    k = opt.outcomes.length - 1;
    for (let i = 0; i < opt.outcomes.length; i++) { acc += opt.outcomes[i].p; if (u < acc) { k = i; break; } }
  }
  const out = opt.outcomes[k];
  for (const fx of out.effects) applyEffect(run, save, fx, rng, log, st);
  st.result = { option: index, outcome: k, text: out.text, log };
  if (st.elite) run.current.type = 'elite';   // Knoten wird zur Elite-Etappe (runState.nodeKind)
  return { ok: true, result: st.result, pending: st.pending, elite: st.elite };
}

// Offene Wahl („choose“) mit einem Inventar-Platz abschließen. Ergebnis: { ok, reason?, kind, log }
export function resolvePending(run, save, slot) {
  const st = run.current && run.current.shop && run.current.shop.type === 'event' ? run.current.shop : null;
  if (!st || !st.pending.length) return { ok: false, reason: 'none' };
  const p = st.pending[0];
  const e = run.inventory[slot];
  if (!e) return { ok: false, reason: 'slot' };
  let line;
  if (p.kind === 'upgradeItem') {
    if ((e.tier || 1) >= MAX_TIER) return { ok: false, reason: 'maxed' };
    e.tier = (e.tier || 1) + 1;
    line = { icon: '★', text: `${entryName(e)} → ★${e.tier}`, good: true };
  } else {
    run.inventory.splice(slot, 1);
    updateCodexSets(run, save);
    line = { icon: '🗑️', text: `Abgegeben: ${entryName(e)}`, good: false };
  }
  run.durability = Math.min(run.durability, durabilityMax(run));
  st.pending.shift();
  if (st.result) st.result.log.push(line);
  return { ok: true, kind: p.kind, log: [line] };
}

