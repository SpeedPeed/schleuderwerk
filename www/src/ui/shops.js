// Oberfläche der Sonderknoten: Schrotthändler, Werkbank, Schwarzmarkt, Ereignis, Schatzhaufen und eine allgemeine
// Platz-Auswahl (Ersetzen, Fähigkeits-Slot, „Fundstück wählen“). Zeichnet in das Overlay von ui/runScreens.js
// (runScreens.present). Nur Anzeige – die Regeln stehen in shops/*.js, main.js verbindet beides.
import { fmt } from './dom.js';
import { modeLabel } from './inputMode.js';
import { NODE_TYPES } from '../data/nodes.js';
import { abilityById } from '../data/index.js';
import { itemById } from '../data/items.js';
import { itemCardHtml, entryRowHtml, esc, stars } from './items.js';
import { setProgressFor, entryName } from '../items/inventory.js';

const head = (type, sub = '') => {
  const def = NODE_TYPES[type] || {};
  return `<div class="ri-kind" style="--c:${def.color || '#888'}">${def.icon || ''} ${esc(def.name || type)}</div>${sub ? `<div class="ri-sub">${sub}</div>` : ''}`;
};
const boltsBar = (bolts, extra = '') => `<div class="sh-bar"><span>🔩 <b>${fmt(bolts)}</b></span>${extra}</div>`;
const logHtml = (log) => (log || []).map((l) => `<div class="ev-log ${l.good === false ? 'bad' : l.good ? 'good' : ''}"><span>${l.icon}</span>${esc(l.text)}</div>`).join('');

export class ShopScreens {
  // rs: RunScreens (Overlay #runui)
  constructor(rs) { this.rs = rs; }

  get card() { return this.rs.card; }

  bindAll(sel, fn) { this.card.querySelectorAll(sel).forEach((b) => { b.onclick = (e) => { e.stopPropagation(); fn(b.dataset, b); }; }); }

  // ---------- 🛒 Schrotthändler ----------
  // v: dealerView, run: Run (Inventar/Teile für den Set-Fortschritt), h: { onBuy(i), onAbility(), onReroll(), onReserve(i), onLeave(), onInventory() }
  dealer(v, run, h, keep = false) {
    const cards = v.offers.map((o) => {
      const d = itemById(o.itemId);
      let btns;
      if (o.sold) btns = '<span class="pc-tag">✓ Gekauft</span>';
      else if (o.reservedNext) btns = `<span class="pc-tag">📌 Für den nächsten Händler reserviert</span><button class="btn btn-secondary small-btn" data-res="${o.index}">Lösen</button>`;
      else {
        btns = `<button class="btn btn-buy ${o.canAfford ? '' : 'cant'}" data-buy="${o.index}">Kaufen 🔩 ${fmt(o.price)}</button>`;
        if (!o.fromReserve) btns += `<button class="btn btn-secondary small-btn" data-res="${o.index}" ${v.reserve.used >= v.reserve.slots ? 'disabled' : ''}>📌 Reservieren</button>`;
      }
      const tag = o.fromReserve ? '<div class="sh-flag">📌 Reserviert – Preis gesichert</div>' : '';
      return itemCardHtml(o.itemId, {
        cls: `shop ${o.sold ? 'sold' : ''}`, progress: o.sold ? null : setProgressFor(o.itemId, run.inventory, run.parts),
        extra: `${tag}<div class="sh-btns">${btns}</div>`,
      }) || `<div>${esc(d && d.name)}</div>`;
    }).join('');
    const a = v.ability;
    const ab = a ? `<div class="pcard sh-ability ${a.sold ? 'sold' : ''}">
        <div class="pc-top"><span class="pc-icon">${a.def.icon}</span><div class="pc-name">${esc(a.def.name)} <small>Fähigkeit · ${modeLabel(a.def.mode)}</small></div></div>
        <div class="pc-desc">${esc(a.def.desc)}</div>
        <div class="pc-desc small">Ersetzt einen deiner Fähigkeits-Slots bis zum Run-Ende.</div>
        <div class="sh-btns">${a.sold ? '<span class="pc-tag">✓ Gekauft</span>' : `<button class="btn btn-buy ${a.canAfford ? '' : 'cant'}" data-a="ability">Kaufen 🔩 ${fmt(a.price)}</button>`}</div>
      </div>` : '';
    const res = v.reserve.list.length ? `<div class="sh-note">📌 Reserviert für den nächsten Händler: ${v.reserve.list.map((r) => `${itemById(r.itemId).icon} ${esc(itemById(r.itemId).name)} (🔩 ${fmt(r.price)})`).join(', ')}</div>` : '';
    this.rs.present('dealer', `
      ${head('dealer', 'Fünf Fundstücke und eine Fähigkeit – alles mit Rost-Garantie.')}
      ${boltsBar(v.bolts, `<button class="ch-inv" data-a="inv">🎒 ${run.inventory.length}/${v.itemSlots}</button>`)}
      <div class="ch-cards">${cards}</div>
      <h4>Fähigkeit</h4>${ab || '<p class="small">Keine Fähigkeit im Angebot.</p>'}
      ${res}
      <div class="sh-meta">📌 Reservieren: ${v.reserve.used}/${v.reserve.slots} Platz · ↻ Neu würfeln: 🔩 ${fmt(v.rerollCost)}</div>
      <div class="btn-row"><button class="btn btn-secondary" data-a="reroll">↻ Neu würfeln 🔩 ${fmt(v.rerollCost)}</button><button class="btn btn-primary" data-a="leave">Weiter ▶</button></div>`, keep);
    this.bindAll('[data-buy]', (d) => h.onBuy(Number(d.buy)));
    this.bindAll('[data-res]', (d) => h.onReserve(Number(d.res)));
    this.rs.bind('[data-a=ability]', () => h.onAbility());
    this.rs.bind('[data-a=reroll]', () => h.onReroll());
    this.rs.bind('[data-a=leave]', () => h.onLeave());
    this.rs.bind('[data-a=inv]', () => h.onInventory());
  }

  // ---------- 🔧 Werkbank ----------
  // d: { inventory, options: fusionOptions, fusionsLeft, scrap: [Schrauben je Platz], bolts }, h: { onFuse(a, b, kind), onScrap(i), onLeave() }
  workbench(d, h, keep = false) {
    const opts = d.options.map((o, k) => {
      const ea = d.inventory[o.a], eb = d.inventory[o.b];
      const what = o.kind === 'tier'
        ? `${esc(entryName(ea))}: ${stars(ea.tier || 1)} + ${stars(eb.tier || 1)} → <b>${stars(o.entry.tier)}</b>`
        : `<b>${esc(o.entry.name)}</b><small>${esc(entryName(ea))} + ${esc(entryName(eb))} · beide Tags, Effekte ×0,75, 1 Platz frei</small>`;
      return `<div class="wb-opt ${o.kind}"><span class="wb-ic">${o.kind === 'tier' ? '★' : '🧬'}</span><div class="wb-txt">${what}</div>
        <button class="btn btn-buy small-btn" data-fuse="${k}" ${d.fusionsLeft > 0 ? '' : 'disabled'}>${o.kind === 'tier' ? '★ Verschmelzen' : 'Hybrid bauen'}</button></div>`;
    }).join('') || '<p class="small">Keine Fusion möglich: ★+1 braucht 2 gleiche Items mit gleicher ★, ein Hybrid 2 Items mit verschiedenen Tags.</p>';
    const rows = d.inventory.map((e, i) => entryRowHtml(e, i, { actions: `<div class="sh-btns"><button class="btn btn-secondary small-btn" data-scrap="${i}">🔩 Zerlegen: +${fmt(d.scrap[i])}</button></div>` })).join('')
      || '<p class="small">Der Rucksack ist leer.</p>';
    this.rs.present('workbench', `
      ${head('workbench', 'Schraubstock, Kaffeefleck, ein Bleistift.')}
      ${boltsBar(d.bolts, `<span class="sh-pill ${d.fusionsLeft ? '' : 'off'}">Fusionen: ${d.fusionsLeft}</span>`)}
      <h4>Verschmelzen (1 je Besuch)</h4><div class="wb-opts">${opts}</div>
      <h4>Zerlegen (unbegrenzt)</h4><div class="ch-rows">${rows}</div>
      <div class="btn-row"><button class="btn btn-primary" data-a="leave">Weiter ▶</button></div>`, keep);
    this.bindAll('[data-fuse]', (x) => { const o = d.options[Number(x.fuse)]; h.onFuse(o.a, o.b, o.kind); });
    this.bindAll('[data-scrap]', (x) => h.onScrap(Number(x.scrap)));
    this.rs.bind('[data-a=leave]', () => h.onLeave());
  }

  // ---------- 🕳 Schwarzmarkt ----------
  // d: { offers, pay: payOptions, cursed: [Plätze], removeCost, inventory, bolts, cores }, h: { onBuy(i, pay), onRemoveCurse(slot), onLeave() }
  blackMarket(d, run, h, keep = false) {
    const cards = d.offers.map((o, i) => {
      const btns = o.sold ? '<span class="pc-tag">✓ Gekauft</span>'
        : d.pay.map((p) => `<button class="btn btn-buy small-btn ${p.can ? '' : 'cant'}" data-buy="${i}" data-pay="${p.id}">${p.icon} ${esc(p.label)}</button>`).join('');
      return itemCardHtml(o.itemId, { cls: `shop ${o.sold ? 'sold' : ''}`, progress: o.sold ? null : setProgressFor(o.itemId, run.inventory, run.parts), extra: `<div class="sh-btns col">${btns}</div>` });
    }).join('') || '<p class="small">Der Kofferraum ist leer.</p>';
    const rm = d.cursed.map((i) => entryRowHtml(d.inventory[i], i, { actions: `<div class="sh-btns"><button class="btn btn-buy small-btn ${d.bolts >= d.removeCost ? '' : 'cant'}" data-rm="${i}">✨ Fluch entfernen 🔩 ${fmt(d.removeCost)}</button></div>` })).join('');
    this.rs.present('blackmarket', `
      ${head('blackmarket', 'Bezahlt wird nicht mit Schrauben. Bezahlt wird mit dir.')}
      ${boltsBar(d.bolts, `<span>💠 <b>${fmt(d.cores)}</b></span>`)}
      <div class="ch-cards">${cards}</div>
      <h4>Fluch entfernen</h4>${rm || '<p class="small">Keine verfluchten Items im Rucksack.</p>'}
      <div class="btn-row"><button class="btn btn-primary" data-a="leave">Weiter ▶</button></div>`, keep);
    this.bindAll('[data-buy]', (x) => h.onBuy(Number(x.buy), x.pay));
    this.bindAll('[data-rm]', (x) => h.onRemoveCurse(Number(x.rm)));
    this.rs.bind('[data-a=leave]', () => h.onLeave());
  }

  // ---------- ❓ Ereignis ----------
  // v: eventView, h: { onOption(i), onPending(), onContinue() }
  event(v, h) {
    const ev = v.event;
    let body;
    if (!v.result) {
      body = `<div class="ev-opts">${v.options.map((o) => `<button class="ev-opt ${o.available ? '' : 'off'}" data-opt="${o.index}" ${o.available ? '' : 'disabled'}>
          <b><kbd class="kbd-only">${o.index + 1}</kbd> ${esc(o.label)}</b>${o.costText ? `<span class="ev-cost">Kosten: ${esc(o.costText)}</span>` : ''}${o.hint ? `<small>${esc(o.hint)}</small>` : ''}
          ${o.available ? '' : `<span class="ev-cost bad">${{ bolts: 'Nicht genug Schrauben', hp: 'Zu wenig Haltbarkeit', fuel: 'Zu wenig Treibstoff', item: 'Kein Fundstück dabei' }[o.reason] || 'Nicht möglich'}</span>`}
        </button>`).join('')}</div>`;
    } else {
      const pend = v.pending.length ? `<div class="sh-note">${v.pending[0].kind === 'upgradeItem' ? '★ Wähle ein Fundstück, das eine Stufe aufsteigt.' : '🗑️ Wähle ein Fundstück, das du abgibst.'}</div>` : '';
      const btn = v.pending.length ? '<button class="btn btn-primary" data-a="pending">Fundstück wählen ▶</button>'
        : `<button class="btn btn-primary" data-a="cont">${v.elite ? 'Zur Elite-Etappe ▶' : 'Weiter ▶'}</button>`;
      body = `<div class="ev-choice">▸ ${esc(ev.options[v.result.option].label)}</div>
        <p class="ev-out">${esc(v.result.text)}</p>
        <div class="ev-logs">${logHtml(v.result.log)}</div>${pend}
        <div class="btn-row">${btn}</div>`;
    }
    this.rs.present('event', `
      ${head('event')}
      <h2 class="ev-title">${esc(ev.title)}</h2>
      <p class="ev-text">${esc(ev.text)}</p>
      ${body}`);
    this.bindAll('[data-opt]', (x) => h.onOption(Number(x.opt)));
    this.rs.bind('[data-a=pending]', () => h.onPending());
    this.rs.bind('[data-a=cont]', () => h.onContinue());
  }

  // ---------- 💰 Schatzhaufen ----------
  // st: Schatz-Zustand, h: { onTake(), onLeave(), onContinue() }
  treasure(st, run, h) {
    const card = st.itemId ? itemCardHtml(st.itemId, { progress: setProgressFor(st.itemId, run.inventory, run.parts) }) : '<p class="small">Nur Rost und ein alter Kronkorken.</p>';
    const sus = st.suspicious ? `<div class="tr-sus">⚠️ <b>Verdächtig!</b> ${esc(st.hint)}</div>` : '<div class="tr-ok">Sieht harmlos aus.</div>';
    const body = st.result
      ? `<div class="ev-logs">${logHtml(st.result.log)}</div><div class="btn-row"><button class="btn btn-primary" data-a="cont">Weiter ▶</button></div>`
      : `<div class="btn-row"><button class="btn btn-secondary" data-a="leave">Liegen lassen</button><button class="btn btn-primary" data-a="take">Nehmen</button></div>`;
    this.rs.present('treasure', `
      ${head('treasure', 'Ein Haufen Schrott – und darin glänzt etwas.')}
      ${sus}
      ${card}
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
      <h2>${esc(d.title)}</h2>
      ${d.text ? `<p class="ri-desc">${d.text}</p>` : ''}
      ${d.item ? itemCardHtml(d.item, { cls: 'new' }) : ''}
      <div class="ch-rows">${rows}</div>
      <div class="btn-row">${h.onBack ? '<button class="btn btn-secondary" data-a="back">◀ Zurück</button>' : ''}</div>`);
    this.bindAll('[data-pick]', (x) => h.onPick(Number(x.pick)));
    this.rs.bind('[data-a=back]', () => h.onBack && h.onBack());
  }

  // Fähigkeits-Slot wählen (Fähigkeit vom Händler). d: { abilities: [ids], slots, newId }, h: { onPick(i), onBack() }
  pickAbility(d, h) {
    const na = abilityById(d.newId);
    let rows = '';
    for (let i = 0; i < d.slots; i++) {
      const a = abilityById(d.abilities[i]);
      rows += `<button class="st-opt" data-pick="${i}"><span>${a ? a.icon : '＋'}</span><b>Slot ${i + 1}: ${a ? esc(a.name) : 'leer'}</b><small>${a ? 'wird ersetzt' : 'frei'}</small></button>`;
    }
    this.rs.present('pick', `
      <h2>${na.icon} ${esc(na.name)}</h2>
      <p class="ri-desc">Welcher Fähigkeits-Slot soll bis zum Run-Ende ${esc(na.name)} bekommen?</p>
      <div class="st-opts">${rows}</div>
      <div class="btn-row"><button class="btn btn-secondary" data-a="back">◀ Zurück</button></div>`);
    this.bindAll('[data-pick]', (x) => h.onPick(Number(x.pick)));
    this.rs.bind('[data-a=back]', () => h.onBack());
  }
}

