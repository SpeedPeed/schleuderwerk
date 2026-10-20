// Oberfläche der Items: Karten (Item-Auswahl, Inventar, Kompendium), Set-Übersicht 2/3/5 je Tag und das Item-Blatt
// (Inventar im Run bzw. Kompendium in der Garage). Nur Anzeige – Spiellogik in items/inventory.js und run/runState.js.
// Paket C: Tag-Stärke („Feuer Stufe 4 · +40 %“), Rezept-Hinweise und -Seiten (items/recipes.js), ★+1 für Doppelte.
// Paket B: Items sind Karteikarten mit Kreppband (Schräglage deterministisch aus der Item-ID, ui/dom.js → tiltOf),
// die Seltenheit wird gestempelt, Tags sind Schablonen-Plaketten mit Sprite-Icon, das Item-Emoji klebt auf einem Etikett.
import { el, show, icon, tiltOf, inkOn } from './dom.js';
import { ITEMS, RARITIES, RARITY_ORDER } from '../data/items.js';
import { TAGS, TAG_IDS, SET_LEVELS, setId } from '../data/tags.js';
import { TXT } from '../data/texts.js';
import { SYNERGY } from '../data/balance.js';
import { RECIPES, recipeHints, activeRecipes, ownedItemIds } from '../items/recipes.js';
import { describeItem, describeEntry, entryParts, entryRarity, entryName, isHybrid, setOverview, setProgressFor, MAX_TIER } from '../items/inventory.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function tagChip(tag, extra = '') {
  const t = TAGS[tag];
  if (!t) return '';
  return `<span class="tag-chip" style="--c:${t.color};--fg:${inkOn(t.color)}">${icon(t.iconId)}${esc(t.name)}${extra}</span>`;
}

// Seltenheits-Stempel (Gewöhnlich: nur Bleistift-Notiz in der Kopfzeile)
const STAMP = { rare: 'Selten', epic: 'Episch', legendary: 'Legendär', cursed: 'Verflucht' };
const stampHtml = (rarity) => (STAMP[rarity] ? `<span class="stamp st-${rarity}">${STAMP[rarity]}</span>` : '');

export const stars = (tier) => `<span class="stars">${'★'.repeat(Math.max(1, tier))}${'☆'.repeat(Math.max(0, MAX_TIER - tier))}</span>`;

const rarityOf = (r) => RARITIES[r] || RARITIES.common;

const SY = TXT.synergy;
// Tag-Stärke in Prozent bei n Items eines Tags (balance.SYNERGY.tagStrength)
export const strengthPct = (n) => Math.round(SYNERGY.tagStrength.perItem * Math.min(SYNERGY.tagStrength.maxItems, n) * 100);

// Fortschritt der Set-Boni und der Tag-Stärke, den ein Item bringt (Auswahl-Karte)
function progressHtml(progress) {
  if (!progress || !progress.length) return '';
  return `<div class="ic-sets">${progress.map((p) => {
    const t = TAGS[p.tag];
    const set = p.reaches ? ` · <b>Set ${p.reaches} aktiv!</b>` : p.next ? ` · ${p.to}/${p.next} bis Set ${p.next}` : '';
    return `<span class="ic-set ${p.reaches ? 'reach' : ''}" style="--c:${t.color}">${icon(t.iconId)} ${esc(SY.tagLevel(t.name, p.to, strengthPct(p.to)))}${set}</span>`;
  }).join('')}</div>`;
}

// Rezept-Hinweise eines angebotenen Items: vervollständigt ein Rezept (Partner im Rucksack) oder nennt den Partner
function recipeHintHtml(itemId, inventory) {
  const hints = recipeHints(itemId, inventory).filter((h) => !ownedItemIds(inventory).has(itemId) || h.completes);
  if (!hints.length) return '';
  return `<div class="ic-recipes">${hints.map((h) => {
    const other = ITEMS.find((it) => it.id === h.other);
    const txt = h.completes ? SY.recipeComplete(h.recipe.name) : SY.recipeHint(h.recipe.name, other ? other.name : '?');
    return `<span class="ic-recipe ${h.completes ? 'done' : ''}">${icon('werkbank')} ${esc(txt)}</span>`;
  }).join('')}</div>`;
}

// Rezept-Karte (Rucksack, Kompendium). opts: { active, known, missing: [Item-Name] }
export function recipeCardHtml(r, opts = {}) {
  const known = opts.known !== false;
  const names = r.items.map((id) => { const it = ITEMS.find((x) => x.id === id); return it ? it.name : id; });
  return `<div class="rcp ${opts.active ? 'on' : ''} ${known ? '' : 'unknown'}" style="--tilt:${tiltOf(r.id, 1)}deg">
    ${opts.active ? `<span class="stamp st-active">${SY.recipeActive}</span>` : ''}
    <div class="ic-top"><span class="ic-icon">${known ? r.icon : '?'}</span>
      <div class="ic-head"><div class="ic-name">${known ? esc(r.name) : '???'}</div>
        <div class="rcp-items">${(opts.itemNames || names).map(esc).join(' + ')}</div></div></div>
    ${known ? `<div class="ic-desc">${esc(r.desc)}</div>${r.flavor ? `<div class="rcp-flavor">${esc(r.flavor)}</div>` : ''}` : `<div class="ic-desc">${SY.recipeUnknown}</div>`}
    ${opts.missing && opts.missing.length ? `<div class="rcp-miss">${opts.missing.map((m) => esc(SY.recipeMissing(m))).join(' · ')}</div>` : ''}
  </div>`;
}

// Tag-Stärke als Plaketten (nur Tags mit Items)
export function strengthChipsHtml(counts) {
  return TAG_IDS.filter((t) => (counts[t] || 0) > 0).sort((a, b) => counts[b] - counts[a])
    .map((t) => tagChip(t, ` ${counts[t]} · +${strengthPct(counts[t])} %`)).join('');
}

// Item-Karte. opts: { tier, progress, scale (tagBoost/Hybrid), owned, extra (HTML unten), cls }
export function itemCardHtml(id, opts = {}) {
  const d = describeItem(id, opts.tier || 1, { scale: opts.scale || 1 });
  if (!d) return '';
  const r = rarityOf(d.rarity);
  return `<div class="icard r-${d.rarity} ${opts.cls || ''}" style="--rc:${r.color};--tilt:${tiltOf(d.id)}deg" data-item="${d.id}">
    ${stampHtml(d.rarity)}
    <div class="ic-top"><span class="ic-icon">${d.icon}</span>
      <div class="ic-head"><div class="ic-name">${esc(d.name)}</div>
        <div class="ic-meta">${d.rarity === 'common' ? `<span class="ic-rar">${esc(r.name)}</span>` : ''} ${stars(d.tier)}</div></div></div>
    <div class="ic-tags">${d.tags.map((t) => tagChip(t)).join('')}</div>
    <div class="ic-desc">${esc(d.desc)}</div>
    ${d.curse ? `<div class="ic-curse">${icon('elite')} ${esc(d.curse)}</div>` : ''}
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
  const emo = parts.map(({ def }) => def.icon).join('');
  const tags = [...new Set(parts.flatMap(({ def }) => def.tags))];
  const tierTxt = isHybrid(entry) ? parts.map(({ tier }) => stars(tier)).join(' + ') : stars(entry.tier || 1);
  return `<div class="irow r-${rar} ${opts.napped ? 'napped' : ''} ${opts.sel ? 'sel' : ''}" style="--rc:${r.color}" data-slot="${slot}">
    ${stampHtml(rar)}
    <div class="ir-top"><span class="ic-icon">${emo}</span>
      <div class="ic-head"><div class="ic-name">${name}${sub}</div>
        <div class="ic-meta">${rar === 'common' ? `<span class="ic-rar">${esc(r.name)}</span>` : ''} ${tierTxt}${opts.napped ? ` <small>${icon('schlafen')} schläft (Schwarze Katze)</small>` : ''}</div></div></div>
    <div class="ic-tags">${tags.map((t) => tagChip(t)).join('')}</div>
    ${descs.map((d) => `<div class="ic-desc">${esc(d.desc)}</div>${d.curse ? `<div class="ic-curse">${icon('elite')} ${esc(d.curse)}</div>` : ''}${d.cleansedCurse ? `<div class="ic-cleansed">${icon('stern')} Fluch entfernt: <s>${esc(d.cleansedCurse)}</s></div>` : ''}`).join('')}
    ${opts.actions || ''}
  </div>`;
}

// Set-Übersicht: je Tag Zähler und die Stufen 2/3/5 (aktiv hervorgehoben). onlyActive: nur Tags mit Zähler > 0
export function setOverviewHtml(counts, { onlyActive = false, codex = null } = {}) {
  return setOverview(counts).filter((o) => !onlyActive || o.count > 0).map((o) => {
    const t = o.def;
    const lv = o.levels.map((l) => {
      const known = !codex || codex[setId(o.tag, l.level)] || l.active;
      return `<div class="so-lv ${l.active ? 'on' : ''}"><b>${l.level}</b><span>${known ? esc(l.desc) : '??? – noch nie aktiviert'}</span></div>`;
    }).join('');
    const pct = Math.min(1, o.count / SET_LEVELS[SET_LEVELS.length - 1]);
    return `<div class="so-tag" style="--c:${t.color}">
      <div class="so-head"><span>${icon(t.iconId)} ${esc(t.name)}${o.count ? ` <small>+${strengthPct(o.count)} %</small>` : ''}</span><b>${o.count}${o.next ? ` / ${o.next}` : ` ${icon('haken')}`}</b></div>
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
      <div class="is-head"><h2 data-id="title">Inventar</h2><button class="icon-btn small" data-id="close" aria-label="Schließen">${icon('schliessen')}</button></div>
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
      this.q.title.innerHTML = `${icon('rucksack')} Rucksack ${d.inventory.length}/${d.slots}`;
      this.tabs([['items', 'Items'], ['sets', 'Set-Boni'], ['recipes', SY.recipesTab]]);
      if (this.tab === 'items') {
        const rows = d.inventory.map((e, i) => entryRowHtml(e, i, { napped: i === d.napped })).join('');
        const free = Math.max(0, d.slots - d.inventory.length);
        this.q.body.innerHTML = (rows || '<p class="small">Noch keine Items – nach jeder geschafften Etappe gibt es eine Auswahl.</p>')
          + (free ? `<p class="small">${free} ${free > 1 ? 'Plätze' : 'Platz'} frei</p>` : '<p class="small">Rucksack voll – neue Items ersetzen ein altes.</p>');
      } else if (this.tab === 'sets') {
        const boost = Object.entries(d.tagBoost || {}).filter(([, v]) => v > 0).map(([t, v]) => tagChip(t, ` +${Math.round(v * 100)} %`)).join('');
        const strength = strengthChipsHtml(d.counts || {});
        this.q.body.innerHTML = (strength ? `<div class="is-boost"><small>${SY.strengthHead}:</small> ${strength}</div>` : '')
          + (boost ? `<div class="is-boost"><small>Verstärkt hier:</small> ${boost}</div>` : '')
          + `<p class="small">${esc(SY.setLevels(SET_LEVELS.join(', '), strengthPct(1)))}</p>`
          + setOverviewHtml(d.counts);
      } else {
        // Rezepte: aktive zuerst, dann solche, von denen ein Item im Rucksack ist
        const own = ownedItemIds(d.inventory);
        const active = new Set(activeRecipes(d.inventory).map((r) => r.id));
        const near = RECIPES.filter((r) => !active.has(r.id) && r.items.some((id) => own.has(id)));
        const name = (id) => { const it = ITEMS.find((x) => x.id === id); return it ? it.name : id; };
        this.q.body.innerHTML = `<p class="small">${SY.recipesIntro}</p>`
          + (active.size ? '' : `<p class="small">${SY.recipesNone}</p>`)
          + `<div class="is-grid">${RECIPES.filter((r) => active.has(r.id)).map((r) => recipeCardHtml(r, { active: true })).join('')}`
          + near.map((r) => recipeCardHtml(r, { missing: r.items.filter((id) => !own.has(id)).map(name) })).join('') + '</div>';
      }
      return;
    }
    // Kompendium
    const codex = d.codex || { items: {}, sets: {} };
    const known = ITEMS.filter((it) => (codex.items[it.id] || 0) > 0).length;
    this.q.title.innerHTML = `${icon('buch')} Kompendium ${known}/${ITEMS.length}`;
    this.tabs([['items', 'Items'], ['sets', 'Set-Boni'], ['recipes', SY.recipesTab]]);
    if (this.tab === 'items') {
      let h = '<p class="small">Entdeckt wird ein Item, sobald es dir zur Auswahl angeboten wird.</p>';
      for (const tag of TAG_IDS) {
        const t = TAGS[tag];
        const list = ITEMS.filter((it) => it.tags[0] === tag).sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
        h += `<h4 class="is-h" style="--c:${t.color}">${icon(t.iconId)} ${esc(t.name)}</h4><div class="is-grid">`;
        for (const it of list) {
          const lvl = codex.items[it.id] || 0;
          if (lvl > 0) h += itemCardHtml(it.id, { cls: 'small' });
          else h += `<div class="icard unknown r-${it.rarity}" style="--rc:${rarityOf(it.rarity).color};--tilt:${tiltOf(it.id, 1)}deg"><div class="ic-top"><span class="ic-icon">?</span><div class="ic-head"><div class="ic-name">???</div><div class="ic-meta"><span class="ic-rar">${esc(rarityOf(it.rarity).name)}</span></div></div></div></div>`;
        }
        h += '</div>';
      }
      this.q.body.innerHTML = h;
    } else if (this.tab === 'sets') {
      const full = {};
      for (const t of TAG_IDS) full[t] = 0;
      this.q.body.innerHTML = `<p class="small">Set-Boni bei ${SET_LEVELS.join(', ')} Items eines Tags. Unentdeckte Stufen zeigen „???“, bis du sie einmal aktiviert hast.</p>`
        + setOverviewHtml(full, { codex: codex.sets });
    } else {
      // Rezepte: gebaute voll, unbekannte als Silhouette (Zutaten nur, wenn das Item schon entdeckt ist)
      const built = codex.recipes || {};
      const name = (id) => { const it = ITEMS.find((x) => x.id === id); return it && (codex.items[id] || 0) > 0 ? it.name : SY.recipeUnknownItem; };
      const n = RECIPES.filter((r) => built[r.id]).length;
      this.q.body.innerHTML = `<p class="small">${SY.recipesIntro} ${n}/${RECIPES.length} gebaut.</p><div class="is-grid">`
        + RECIPES.map((r) => (built[r.id] ? recipeCardHtml(r) : recipeCardHtml(r, { known: false, itemNames: r.items.map(name) }))).join('') + '</div>';
    }
  }
}

// Auswahl-Karten für die Item-Auswahl nach einer Etappe. Paket C: schon besessene Items (unter ★3, kein Hybrid) werden
// beim Nehmen ★+1 statt einen Platz zu belegen (run/runState.js → pickItem) – die Karte zeigt die neue Stufe.
export function choiceCardsHtml(choice, { inventory, parts }) {
  return choice.items.map((id, i) => {
    const dup = inventory.find((e) => e.itemId === id && !e.hybrid && (e.tier || 1) < MAX_TIER);
    return itemCardHtml(id, {
      tier: dup ? (dup.tier || 1) + 1 : 1,
      progress: dup ? null : setProgressFor(id, inventory, parts),
      cls: `pickable ${dup ? 'dup' : ''}`,
      extra: (dup ? `<div class="ic-up">${icon('plus')} ${SY.ownedUpgrade}</div>` : '') + recipeHintHtml(id, inventory)
        + `<button class="btn btn-primary ic-pick" data-pick="${i}">${TXT.result.take} <kbd class="kbd-only">${i + 1}</kbd></button>`,
    });
  }).join('');
}

