// Oberfläche der Items: Karten (Item-Auswahl, Inventar, Kompendium), Set-Übersicht 2/4/6 je Tag und das Item-Blatt
// (Inventar im Run bzw. Kompendium in der Garage). Nur Anzeige – Spiellogik in items/inventory.js und run/runState.js.
import { el, show } from './dom.js';
import { ITEMS, RARITIES, RARITY_ORDER } from '../data/items.js';
import { TAGS, TAG_IDS, SET_LEVELS, setId } from '../data/tags.js';
import { describeItem, describeEntry, entryParts, entryRarity, entryName, isHybrid, setOverview, setProgressFor, MAX_TIER } from '../items/inventory.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function tagChip(tag, extra = '') {
  const t = TAGS[tag];
  if (!t) return '';
  return `<span class="tag-chip" style="--c:${t.color}">${t.icon} ${esc(t.name)}${extra}</span>`;
}

export const stars = (tier) => `<span class="stars">${'★'.repeat(Math.max(1, tier))}${'☆'.repeat(Math.max(0, MAX_TIER - tier))}</span>`;

const rarityOf = (r) => RARITIES[r] || RARITIES.common;

// Fortschritt der Set-Boni, den ein Item bringt (Auswahl-Karte)
function progressHtml(progress) {
  if (!progress || !progress.length) return '';
  return `<div class="ic-sets">${progress.map((p) => {
    const t = TAGS[p.tag];
    const txt = p.reaches ? `<b>Set ${p.reaches} aktiv!</b>` : p.next ? `${p.to}/${p.next} bis Set ${p.next}` : `${p.to} (alle Sets aktiv)`;
    return `<span class="ic-set ${p.reaches ? 'reach' : ''}" style="--c:${t.color}">${t.icon} ${esc(t.name)}: ${txt}</span>`;
  }).join('')}</div>`;
}

// Item-Karte. opts: { tier, progress, scale (tagBoost/Hybrid), owned, extra (HTML unten), cls }
export function itemCardHtml(id, opts = {}) {
  const d = describeItem(id, opts.tier || 1, { scale: opts.scale || 1 });
  if (!d) return '';
  const r = rarityOf(d.rarity);
  return `<div class="icard r-${d.rarity} ${opts.cls || ''}" style="--rc:${r.color}" data-item="${d.id}">
    <div class="ic-top"><span class="ic-icon">${d.icon}</span>
      <div class="ic-head"><div class="ic-name">${esc(d.name)}</div>
        <div class="ic-meta"><span class="ic-rar">${esc(r.name)}</span> ${stars(d.tier)}</div></div></div>
    <div class="ic-tags">${d.tags.map((t) => tagChip(t)).join('')}</div>
    <div class="ic-desc">${esc(d.desc)}</div>
    ${d.curse ? `<div class="ic-curse">☠ ${esc(d.curse)}</div>` : ''}
    ${progressHtml(opts.progress)}
    ${opts.extra || ''}
  </div>`;
}

// Inventar-Zeile (Hybrid: beide Teile). opts: { napped, boost, actions (HTML) }
export function entryRowHtml(entry, slot, opts = {}) {
  const parts = entryParts(entry);
  const descs = describeEntry(entry, { scale: opts.scale || 1 });
  const rar = entryRarity(entry);
  const r = rarityOf(rar);
  // Hybride: eigener Name (Werkbank), darunter die beiden Ursprungs-Items
  const name = esc(entryName(entry));
  const sub = isHybrid(entry) ? ` <small>Hybrid ×0,75 · ${parts.map(({ def }) => esc(def.name)).join(' + ')}</small>` : '';
  const icon = parts.map(({ def }) => def.icon).join('');
  const tags = [...new Set(parts.flatMap(({ def }) => def.tags))];
  const tierTxt = isHybrid(entry) ? parts.map(({ tier }) => stars(tier)).join(' + ') : stars(entry.tier || 1);
  return `<div class="irow r-${rar} ${opts.napped ? 'napped' : ''} ${opts.sel ? 'sel' : ''}" style="--rc:${r.color}" data-slot="${slot}">
    <div class="ir-top"><span class="ic-icon">${icon}</span>
      <div class="ic-head"><div class="ic-name">${name}${sub}</div>
        <div class="ic-meta"><span class="ic-rar">${esc(r.name)}</span> ${tierTxt}${opts.napped ? ' <small>😴 schläft (Schwarze Katze)</small>' : ''}</div></div></div>
    <div class="ic-tags">${tags.map((t) => tagChip(t)).join('')}</div>
    ${descs.map((d) => `<div class="ic-desc">${esc(d.desc)}</div>${d.curse ? `<div class="ic-curse">☠ ${esc(d.curse)}</div>` : ''}${d.cleansedCurse ? `<div class="ic-cleansed">✨ Fluch entfernt: <s>${esc(d.cleansedCurse)}</s></div>` : ''}`).join('')}
    ${opts.actions || ''}
  </div>`;
}

// Set-Übersicht: je Tag Zähler und die Stufen 2/4/6 (aktiv hervorgehoben). onlyActive: nur Tags mit Zähler > 0
export function setOverviewHtml(counts, { onlyActive = false, codex = null } = {}) {
  return setOverview(counts).filter((o) => !onlyActive || o.count > 0).map((o) => {
    const t = o.def;
    const lv = o.levels.map((l) => {
      const known = !codex || codex[setId(o.tag, l.level)] || l.active;
      return `<div class="so-lv ${l.active ? 'on' : ''}"><b>${l.level}</b><span>${known ? esc(l.desc) : '??? – noch nie aktiviert'}</span></div>`;
    }).join('');
    const pct = Math.min(1, o.count / SET_LEVELS[SET_LEVELS.length - 1]);
    return `<div class="so-tag" style="--c:${t.color}">
      <div class="so-head"><span>${t.icon} ${esc(t.name)}</span><b>${o.count}${o.next ? ` / ${o.next}` : ' ✔'}</b></div>
      <div class="so-bar"><div style="width:${pct * 100}%"></div></div>
      ${lv}
    </div>`;
  }).join('');
}

// Kleine Item-Leiste (Karte, HUD). entries: Inventar, slots: Plätze. napped: Platz, der schläft
export function itemBarHtml(inventory, slots, napped = -1) {
  let h = '';
  for (let i = 0; i < Math.max(slots, inventory.length); i++) {
    const e = inventory[i];
    if (!e) { h += '<span class="ib-slot empty" data-slot="' + i + '"></span>'; continue; }
    const parts = entryParts(e);
    const rar = entryRarity(e);
    h += `<span class="ib-slot r-${rar} ${i === napped ? 'napped' : ''}" style="--rc:${rarityOf(rar).color}" data-slot="${i}">${parts.map(({ def }) => def.icon).join('')}${(e.tier || 1) > 1 ? `<i>${e.tier}</i>` : ''}</span>`;
  }
  return h;
}

// ---------- Item-Blatt: Inventar (Run) und Kompendium (Garage) ----------
// h: { onClose() }
export class ItemSheet {
  constructor(root, h = {}) {
    this.h = h;
    this.el = el(`<div id="itemsheet" class="overlay hidden"><div class="card is-card">
      <div class="is-head"><h2 data-id="title">Inventar</h2><button class="icon-btn small" data-id="close" aria-label="Schließen">✕</button></div>
      <div class="is-tabs" data-id="tabs"></div>
      <div class="is-body" data-id="body"></div>
    </div></div>`);
    root.appendChild(this.el);
    this.q = {};
    this.el.querySelectorAll('[data-id]').forEach((e) => { this.q[e.dataset.id] = e; });
    this.q.close.onclick = () => this.close();
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
    this.kind = null;
    this.tab = 'items';
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }

  close() {
    if (!this.isOpen) return;
    show(this.el, false);
    this.kind = null;
    if (this.h.onClose) this.h.onClose();
  }

  tabs(list) {
    this.q.tabs.innerHTML = list.map(([id, label]) => `<button class="is-tab ${this.tab === id ? 'on' : ''}" data-tab="${id}">${label}</button>`).join('');
    this.q.tabs.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { this.tab = b.dataset.tab; this.render(); }; });
  }

  // d: { inventory, slots, counts, napped, tagBoost, act }
  openInventory(d) {
    this.kind = 'inventory';
    this.data = d;
    this.tab = 'items';
    this.render();
    show(this.el, true);
    this.q.body.scrollTop = 0;
  }

  // d: { codex: save.codex }
  openCompendium(d) {
    this.kind = 'compendium';
    this.data = d;
    this.tab = 'items';
    this.render();
    show(this.el, true);
    this.q.body.scrollTop = 0;
  }

  render() {
    const d = this.data;
    if (this.kind === 'inventory') {
      this.q.title.textContent = `🎒 Inventar ${d.inventory.length}/${d.slots}`;
      this.tabs([['items', 'Items'], ['sets', 'Set-Boni']]);
      if (this.tab === 'items') {
        const rows = d.inventory.map((e, i) => entryRowHtml(e, i, { napped: i === d.napped })).join('');
        const free = Math.max(0, d.slots - d.inventory.length);
        this.q.body.innerHTML = (rows || '<p class="small">Noch keine Items – nach jeder geschafften Etappe gibt es eine Auswahl.</p>')
          + (free ? `<p class="small">${free} ${free > 1 ? 'Plätze' : 'Platz'} frei</p>` : '<p class="small">Rucksack voll – neue Items ersetzen ein altes.</p>');
      } else {
        const boost = Object.entries(d.tagBoost || {}).filter(([, v]) => v > 0).map(([t, v]) => tagChip(t, ` +${Math.round(v * 100)} %`)).join('');
        this.q.body.innerHTML = (boost ? `<div class="is-boost"><small>Verstärkt hier:</small> ${boost}</div>` : '')
          + '<p class="small">Items und Garage-Teile mit Tag zählen; Hybride für beide Tags. Stufen ab 2, 4 und 6.</p>'
          + setOverviewHtml(d.counts);
      }
      return;
    }
    // Kompendium
    const codex = d.codex || { items: {}, sets: {} };
    const known = ITEMS.filter((it) => (codex.items[it.id] || 0) > 0).length;
    this.q.title.textContent = `📖 Kompendium ${known}/${ITEMS.length}`;
    this.tabs([['items', 'Items'], ['sets', 'Set-Boni']]);
    if (this.tab === 'items') {
      let h = '<p class="small">Entdeckt wird ein Item, sobald es dir zur Auswahl angeboten wird.</p>';
      for (const tag of TAG_IDS) {
        const t = TAGS[tag];
        const list = ITEMS.filter((it) => it.tags[0] === tag).sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
        h += `<h4 class="is-h" style="--c:${t.color}">${t.icon} ${esc(t.name)}</h4><div class="is-grid">`;
        for (const it of list) {
          const lvl = codex.items[it.id] || 0;
          if (lvl > 0) h += itemCardHtml(it.id, { cls: 'small' });
          else h += `<div class="icard unknown r-${it.rarity}" style="--rc:${rarityOf(it.rarity).color}"><div class="ic-top"><span class="ic-icon">❔</span><div class="ic-head"><div class="ic-name">???</div><div class="ic-meta"><span class="ic-rar">${esc(rarityOf(it.rarity).name)}</span></div></div></div></div>`;
        }
        h += '</div>';
      }
      this.q.body.innerHTML = h;
    } else {
      const full = {};
      for (const t of TAG_IDS) full[t] = 0;
      this.q.body.innerHTML = '<p class="small">Set-Boni bei 2, 4 und 6 Items eines Tags. Unentdeckte Stufen zeigen „???“, bis du sie einmal aktiviert hast.</p>'
        + setOverviewHtml(full, { codex: codex.sets });
    }
  }
}

// Auswahl-Karten für die Item-Auswahl nach einer Etappe
export function choiceCardsHtml(choice, { inventory, parts }) {
  return choice.items.map((id, i) => itemCardHtml(id, {
    progress: setProgressFor(id, inventory, parts),
    cls: 'pickable',
    extra: `<button class="btn btn-primary ic-pick" data-pick="${i}">Nehmen <kbd class="kbd-only">${i + 1}</kbd></button>`,
  })).join('');
}

