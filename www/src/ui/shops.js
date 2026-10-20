// Oberfläche der Sonderknoten: Schrotthändler, Werkbank, Schwarzmarkt, Ereignis, Schatzhaufen und eine allgemeine
// Platz-Auswahl (Ersetzen, Fähigkeits-Slot, „Fundstück wählen“). Zeichnet in das Overlay von ui/runScreens.js
// (runScreens.present). Nur Anzeige – die Regeln stehen in shops/*.js, main.js verbindet beides.
// Paket B: Jeder Laden hat ein Blechschild an Ketten („KALLES SCHROTT & SÖHNE“), Angebote sind Karteikarten.
// Die Werkbank listet nicht mehr jede Paarung als eigene Karte: ★-Fusionen stehen als Warnschild oben im Schraubstock,
// Hybride sind je Item gruppiert (Item-Etikett + kleine Partner-Knöpfe); erst die Wahl eines Partners zeigt das Ergebnis
// mit dem Knopf „Hybrid bauen“. DOM-Reihenfolge der .wb-opt bleibt = Reihenfolge der Optionen (Rauchtest).
import { fmt, icon, cur, iconize, inkOn } from './dom.js';
import { modeLabel } from './inputMode.js';
import { NODE_TYPES } from '../data/nodes.js';
import { abilityById } from '../data/index.js';
import { itemById } from '../data/items.js';
import { TXT } from '../data/texts.js';
import { itemCardHtml, entryRowHtml, esc, stars } from './items.js';
import { setProgressFor, entryName, entryParts } from '../items/inventory.js';

const S = TXT.shop;
// Ladenschild (Lack-Ton der Knotenart) + Untertitel in Handschrift
const head = (type, sub = '') => {
  const def = NODE_TYPES[type] || {};
  const sign = (S[type] && S[type].sign) || def.name || type;
  const c = def.color || '#7a756b';
  return `<div class="sign"><span class="sign-plate" style="--c:${c};--fg:${inkOn(c)}">${icon(def.iconId || 'haendler')} ${esc(sign)}</span></div>${sub ? `<div class="ri-sub">${sub}</div>` : ''}`;
};
const boltsBar = (bolts, extra = '') => `<div class="sh-bar"><span class="badge b-bolt">${icon('schraube')}<b>${fmt(bolts)}</b></span>${extra}</div>`;
const logHtml = (log) => (log || []).map((l) => `<div class="ev-log ${l.good === false ? 'bad' : l.good ? 'good' : ''}"><span>${iconize(l.icon)}</span>${iconize(l.text)}</div>`).join('');
const emo = (entry) => entryParts(entry).map(({ def }) => def.icon).join('');

export class ShopScreens {
  // rs: RunScreens (Overlay #runui)
  constructor(rs) { this.rs = rs; this.wbSel = -1; }

  get card() { return this.rs.card; }

  bindAll(sel, fn) { this.card.querySelectorAll(sel).forEach((b) => { b.onclick = (e) => { e.stopPropagation(); fn(b.dataset, b); }; }); }

  // ---------- Schrotthändler ----------
  // v: dealerView, run: Run (Inventar/Teile für den Set-Fortschritt), h: { onBuy(i), onAbility(), onReroll(), onReserve(i), onLeave(), onInventory() }
  dealer(v, run, h, keep = false) {
    const cards = v.offers.map((o) => {
      const d = itemById(o.itemId);
      let btns;
      if (o.sold) btns = `<span class="pc-tag">${icon('haken')} ${S.sold}</span>`;
      else if (o.reservedNext) btns = `<span class="pc-tag">${icon('pin')} ${S.reserved}</span><button class="btn btn-secondary small-btn" data-res="${o.index}">${S.unreserve}</button>`;
      else {
        btns = `<button class="btn btn-buy ${o.canAfford ? '' : 'cant'}" data-buy="${o.index}">${S.buy} ${cur('schraube', fmt(o.price))}</button>`;
        if (!o.fromReserve) btns += `<button class="btn btn-secondary small-btn" data-res="${o.index}" ${v.reserve.used >= v.reserve.slots ? 'disabled' : ''}>${icon('pin')} ${S.reserve}</button>`;
      }
      const tag = o.fromReserve ? `<div class="sh-flag">${icon('pin')} Zurückgelegt – Preis gesichert</div>` : '';
      return itemCardHtml(o.itemId, {
        cls: `shop ${o.sold ? 'sold' : ''}`, progress: o.sold ? null : setProgressFor(o.itemId, run.inventory, run.parts),
        extra: `${tag}<div class="sh-btns">${btns}</div>`,
      }) || `<div>${esc(d && d.name)}</div>`;
    }).join('');
    const a = v.ability;
    const ab = a ? `<div class="pcard sh-ability ${a.sold ? 'sold' : ''}">
        <div class="pc-top"><span class="pc-icon">${a.def.icon}</span><div class="pc-name">${esc(a.def.name)} <small>${S.ability} · ${modeLabel(a.def.mode)}</small></div></div>
        <div class="pc-desc">${esc(a.def.desc)}</div>
        <div class="pc-desc small">${S.abilityNote}</div>
        <div class="sh-btns">${a.sold ? `<span class="pc-tag">${icon('haken')} ${S.sold}</span>` : `<button class="btn btn-buy ${a.canAfford ? '' : 'cant'}" data-a="ability">${S.buy} ${cur('schraube', fmt(a.price))}</button>`}</div>
      </div>` : '';
    const res = v.reserve.list.length ? `<div class="sh-note">${icon('pin')} ${S.reserveNote} ${v.reserve.list.map((r) => `${itemById(r.itemId).icon} ${esc(itemById(r.itemId).name)} (${cur('schraube', fmt(r.price))})`).join(', ')}</div>` : '';
    this.rs.present('dealer', `
      ${head('dealer', S.dealer.sub)}
      ${boltsBar(v.bolts, `<button class="ch-inv" data-a="inv">${icon('rucksack')} ${run.inventory.length}/${v.itemSlots}</button>`)}
      <div class="ch-cards">${cards}</div>
      <h4>${S.ability}</h4>${ab || `<p class="small">${S.noAbility}</p>`}
      ${res}
      <div class="sh-meta">${icon('pin')} ${S.reserve}: ${v.reserve.used}/${v.reserve.slots} Platz · ${icon('wuerfel')} ${S.reroll}: ${cur('schraube', fmt(v.rerollCost))}</div>
      <div class="btn-row"><button class="btn btn-secondary" data-a="reroll">${icon('wuerfel')} ${S.reroll} ${cur('schraube', fmt(v.rerollCost))}</button><button class="btn btn-primary" data-a="leave">${S.leave} ${icon('weiter')}</button></div>`, keep);
    this.bindAll('[data-buy]', (d) => h.onBuy(Number(d.buy)));
    this.bindAll('[data-res]', (d) => h.onReserve(Number(d.res)));
    this.rs.bind('[data-a=ability]', () => h.onAbility());
    this.rs.bind('[data-a=reroll]', () => h.onReroll());
    this.rs.bind('[data-a=leave]', () => h.onLeave());
    this.rs.bind('[data-a=inv]', () => h.onInventory());
  }

  // ---------- Werkbank ----------
  // d: { inventory, options: fusionOptions, fusionsLeft, scrap: [Schrauben je Platz], bolts }, h: { onFuse(a, b, kind), onScrap(i), onLeave() }
  workbench(d, h, keep = false) {
    if (!keep) this.wbSel = -1;
    const sel = d.options[this.wbSel] && d.options[this.wbSel].kind === 'hybrid' ? this.wbSel : -1;
    const can = d.fusionsLeft > 0;
    // je Item a eine Gruppe (Optionen sind nach a, dann b sortiert → DOM-Reihenfolge = Options-Index)
    const groups = [];
    d.options.forEach((o, k) => {
      let g = groups[groups.length - 1];
      if (!g || g.a !== o.a) groups.push(g = { a: o.a, opts: [] });
      g.opts.push([o, k]);
    });
    const optHtml = ([o, k]) => {
      const ea = d.inventory[o.a], eb = d.inventory[o.b];
      if (o.kind === 'tier') {
        return `<div class="wb-opt tier"><div class="wb-tier"><div class="wb-txt"><b>${icon('stern')} ${S.fusePair}</b>${esc(entryName(ea))}: ${stars(ea.tier || 1)} + ${stars(eb.tier || 1)} → ${stars(o.entry.tier)}</div>
          <button class="btn btn-buy small-btn" data-fuse="${k}" ${can ? '' : 'disabled'}>${icon('werkbank')} ${S.fuseTier}</button></div></div>`;
      }
      return `<div class="wb-opt hybrid"><button class="wb-chip ${k === sel ? 'sel' : ''}" data-hyb="${k}" ${can ? '' : 'disabled'} aria-label="${esc(entryName(ea))} + ${esc(entryName(eb))}"><span>${emo(eb)}</span>${esc(entryName(eb))}</button></div>`;
    };
    // ★-Fusionen stehen per CSS (order) vorn, die DOM-Reihenfolge bleibt die der Optionen
    let opts = groups.map((g) => {
      const ea = d.inventory[g.a];
      const hasHy = g.opts.some(([o]) => o.kind === 'hybrid');
      const selHere = g.opts.find(([o, k]) => k === sel && o.kind === 'hybrid');
      const detail = selHere ? `<div class="wb-detail"><b>${esc(selHere[0].entry.name)}</b><small>${esc(entryName(ea))} + ${esc(entryName(d.inventory[selHere[0].b]))} · ${S.hybridNote}</small>
          <button class="btn btn-buy" data-fuse="${sel}">${icon('werkbank')} ${S.fuseHybrid}</button></div>` : '';
      return `<div class="wb-group ${hasHy ? '' : 'only-tier'}"><div class="wb-from"><span class="ic-icon">${emo(ea)}</span><span>${esc(entryName(ea))}${hasHy ? ` <small>${S.fuseWith} …</small>` : ''}</span></div>
        <div class="wb-partners">${g.opts.map(optHtml).join('')}</div>${detail}</div>`;
    }).join('');
    if (!opts) opts = `<p class="small">${S.fuseNone}</p>`;
    else if (sel < 0 && d.options.some((o) => o.kind === 'hybrid')) opts = `<p class="wb-hint">${S.fusePick}</p>${opts}`;
    const rows = d.inventory.map((e, i) => entryRowHtml(e, i, { actions: `<div class="sh-btns"><button class="btn btn-secondary small-btn" data-scrap="${i}">${S.scrap}: +${fmt(d.scrap[i])} ${icon('schraube')}</button></div>` })).join('')
      || `<p class="small">${S.emptyBag}</p>`;
    this.rs.present('workbench', `
      ${head('workbench', S.workbench.sub)}
      ${boltsBar(d.bolts, `<span class="sh-pill ${d.fusionsLeft ? '' : 'off'}">Fusionen: ${d.fusionsLeft}</span>`)}
      <h4>${S.fuseHead}</h4><div class="wb-opts">${opts}</div>
      <h4>${S.scrapHead}</h4><div class="ch-rows">${rows}</div>
      <div class="btn-row"><button class="btn btn-primary" data-a="leave">${S.leave} ${icon('weiter')}</button></div>`, keep);
    this.bindAll('[data-fuse]', (x) => { const o = d.options[Number(x.fuse)]; this.wbSel = -1; h.onFuse(o.a, o.b, o.kind); });
    this.bindAll('[data-hyb]', (x) => { const k = Number(x.hyb); this.wbSel = this.wbSel === k ? -1 : k; this.workbench(d, h, true); });
    this.bindAll('[data-scrap]', (x) => { this.wbSel = -1; h.onScrap(Number(x.scrap)); });
    this.rs.bind('[data-a=leave]', () => h.onLeave());
  }

  // ---------- Schwarzmarkt ----------
  // d: { offers, pay: payOptions, cursed: [Plätze], removeCost, inventory, bolts, cores }, h: { onBuy(i, pay), onRemoveCurse(slot), onLeave() }
  blackMarket(d, run, h, keep = false) {
    const cards = d.offers.map((o, i) => {
      const btns = o.sold ? `<span class="pc-tag">${icon('haken')} ${S.sold}</span>`
        : d.pay.map((p) => `<button class="btn btn-buy small-btn ${p.can ? '' : 'cant'}" data-buy="${i}" data-pay="${p.id}">${iconize(p.icon)} ${esc(p.label)}</button>`).join('');
      return itemCardHtml(o.itemId, { cls: `shop ${o.sold ? 'sold' : ''}`, progress: o.sold ? null : setProgressFor(o.itemId, run.inventory, run.parts), extra: `<div class="sh-btns col">${btns}</div>` });
    }).join('') || `<p class="small">${S.trunkEmpty}</p>`;
    const rm = d.cursed.map((i) => entryRowHtml(d.inventory[i], i, { actions: `<div class="sh-btns"><button class="btn btn-buy small-btn ${d.bolts >= d.removeCost ? '' : 'cant'}" data-rm="${i}">${icon('stern')} ${S.uncurse} ${cur('schraube', fmt(d.removeCost))}</button></div>` })).join('');
    this.rs.present('blackmarket', `
      ${head('blackmarket', S.blackmarket.sub)}
      ${boltsBar(d.bolts, `<span class="badge b-core">${icon('kern')}<b>${fmt(d.cores)}</b></span>`)}
      <div class="ch-cards">${cards}</div>
      <h4>${S.curseHead}</h4>${rm || `<p class="small">${S.curseNone}</p>`}
      <div class="btn-row"><button class="btn btn-primary" data-a="leave">${S.leave} ${icon('weiter')}</button></div>`, keep);
    this.bindAll('[data-buy]', (x) => h.onBuy(Number(x.buy), x.pay));
    this.bindAll('[data-rm]', (x) => h.onRemoveCurse(Number(x.rm)));
    this.rs.bind('[data-a=leave]', () => h.onLeave());
  }

  // ---------- Ereignis ----------
  // v: eventView, h: { onOption(i), onPending(), onContinue() }
  event(v, h) {
    const ev = v.event;
    let body;
    if (!v.result) {
      body = `<div class="ev-opts">${v.options.map((o) => `<button class="ev-opt ${o.available ? '' : 'off'}" data-opt="${o.index}" ${o.available ? '' : 'disabled'}>
          <b><kbd class="kbd-only">${o.index + 1}</kbd> ${esc(o.label)}</b>${o.costText ? `<span class="ev-cost">${S.cost} ${iconize(o.costText)}</span>` : ''}${o.hint ? `<small>${esc(o.hint)}</small>` : ''}
          ${o.available ? '' : `<span class="ev-cost bad">${S.notPossible[o.reason] || 'Nicht möglich'}</span>`}
        </button>`).join('')}</div>`;
    } else {
      const pend = v.pending.length ? `<div class="sh-note">${v.pending[0].kind === 'upgradeItem' ? `${icon('stern')} ${S.pendingUp}` : `${icon('tonne')} ${S.pendingDrop}`}</div>` : '';
      const btn = v.pending.length ? `<button class="btn btn-primary" data-a="pending">${S.pendingBtn} ${icon('weiter')}</button>`
        : `<button class="btn btn-primary" data-a="cont">${v.elite ? S.toElite : S.leave} ${icon('weiter')}</button>`;
      body = `<div class="sheet-paper ev-sheet"><div class="ev-choice">▸ ${esc(ev.options[v.result.option].label)}</div>
        <p class="ev-out">${esc(v.result.text)}</p>
        <div class="ev-logs">${logHtml(v.result.log)}</div></div>${pend}
        <div class="btn-row">${btn}</div>`;
    }
    this.rs.present('event', `
      ${head('event')}
      <div class="sheet-paper ev-sheet"><h2 class="ev-title">${esc(ev.title)}</h2>
      <p class="ev-text">${esc(ev.text)}</p></div>
      ${body}`);
    this.bindAll('[data-opt]', (x) => h.onOption(Number(x.opt)));
    this.rs.bind('[data-a=pending]', () => h.onPending());
    this.rs.bind('[data-a=cont]', () => h.onContinue());
  }

  // ---------- Schatzhaufen ----------
  // st: Schatz-Zustand, h: { onTake(), onLeave(), onContinue() }
  treasure(st, run, h) {
    const card = st.itemId ? itemCardHtml(st.itemId, { progress: setProgressFor(st.itemId, run.inventory, run.parts) }) : `<p class="small">${S.nothing}</p>`;
    const sus = st.suspicious ? `<div class="tr-sus">${icon('elite')} <b>${S.suspicious}</b> ${esc(st.hint)}</div>` : `<div class="tr-ok">${S.harmless}</div>`;
    const body = st.result
      ? `<div class="ev-logs">${logHtml(st.result.log)}</div><div class="btn-row"><button class="btn btn-primary" data-a="cont">${S.leave} ${icon('weiter')}</button></div>`
      : `<div class="btn-row"><button class="btn btn-secondary" data-a="leave">${S.leaveIt}</button><button class="btn btn-primary" data-a="take">${S.take}</button></div>`;
    this.rs.present('treasure', `
      ${head('treasure', S.treasure.sub)}
      ${sus}
      <div class="ch-cards">${card}</div>
      ${body}`);
    this.rs.bind('[data-a=take]', () => h.onTake());
    this.rs.bind('[data-a=leave]', () => h.onLeave());
    this.rs.bind('[data-a=cont]', () => h.onContinue());
  }

  // ---------- Platz wählen (Ersetzen / Fundstück wählen) ----------
  // d: { title, text, inventory, label, allowed(i) → bool, item? (neues Item als Karte) }, h: { onPick(i), onBack() }
  pickSlot(d, h) {
    const rows = d.inventory.map((e, i) => {
      const ok = !d.allowed || d.allowed(i);
      return entryRowHtml(e, i, { actions: ok ? `<button class="btn btn-danger small-btn ir-rep" data-pick="${i}">${esc(d.label)}</button>` : '<span class="pc-tag">nicht möglich</span>' });
    }).join('');
    this.rs.present('pick', `
      <h2>${iconize(d.title)}</h2>
      ${d.text ? `<p class="ri-desc">${d.text}</p>` : ''}
      ${d.item ? itemCardHtml(d.item, { cls: 'new' }) : ''}
      <div class="ch-rows">${rows}</div>
      <div class="btn-row">${h.onBack ? `<button class="btn btn-secondary" data-a="back">${icon('zurueck')} ${S.back}</button>` : ''}</div>`);
    this.bindAll('[data-pick]', (x) => h.onPick(Number(x.pick)));
    this.rs.bind('[data-a=back]', () => h.onBack && h.onBack());
  }

  // Fähigkeits-Slot wählen (Fähigkeit vom Händler). d: { abilities: [ids], slots, newId }, h: { onPick(i), onBack() }
  pickAbility(d, h) {
    const na = abilityById(d.newId);
    let rows = '';
    for (let i = 0; i < d.slots; i++) {
      const a = abilityById(d.abilities[i]);
      rows += `<button class="st-opt" data-pick="${i}"><span>${a ? a.icon : icon('plus')}</span><b>Slot ${i + 1}: ${a ? esc(a.name) : 'leer'}</b><small>${a ? 'wird ersetzt' : 'frei'}</small></button>`;
    }
    this.rs.present('pick', `
      <h2>${na.icon} ${esc(na.name)}</h2>
      <p class="ri-desc">Welcher Fähigkeits-Slot soll bis zum Run-Ende ${esc(na.name)} bekommen?</p>
      <div class="st-opts">${rows}</div>
      <div class="btn-row"><button class="btn btn-secondary" data-a="back">${icon('zurueck')} ${S.back}</button></div>`);
    this.bindAll('[data-pick]', (x) => h.onPick(Number(x.pick)));
    this.rs.bind('[data-a=back]', () => h.onBack());
  }
}
