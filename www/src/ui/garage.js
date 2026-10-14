import { el, fmt, short, show } from './dom.js';
import { GARAGE } from '../data/balance.js';
import { CHASSIS, ABILITIES, SLOTS, SLOT_INFO, partsForSlot, partById, abilityById, isSlotAbility, researchLabel } from '../data/index.js';
import { chassisState, partState, abilityState } from '../garage/garage.js';
import { buildLoadout } from '../garage/loadout.js';
import { statDiff } from '../items/statMods.js';
import { fmtStat, statName, statTrend } from './statLabels.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Werte-Vergleich als HTML-Zeilen (nur Stats, die sich sichtbar ändern)
function diffRows(a, b, max = 8) {
  const rows = [];
  for (const d of statDiff(a, b)) {
    const f = fmtStat(d.stat, d.from), t = fmtStat(d.stat, d.to);
    if (f === t) continue;
    const tr = statTrend(d.stat, d.from, d.to);
    rows.push(`<div class="dr ${tr > 0 ? 'up' : tr < 0 ? 'down' : ''}"><span>${statName(d.stat)}</span><span>${f} → <b>${t}</b></span></div>`);
    if (rows.length >= max) break;
  }
  return rows.length ? rows.join('') : '<div class="dr same">keine Werte-Änderung</div>';
}

// Garage: Währungen, 3D-Vorschau (oben, durchsichtig), Chassis-Wahl, Werte-Übersicht, 7 Teile-Slots,
// Fähigkeiten und der Start-Knopf. Teile- und Fähigkeits-Auswahl als Unterblatt.
// h: { onAction(name, ...args) → Ergebnis {ok}, onPreview(override|null), onSettings(), onStart(), onWorld(dir) }
export class GarageScreen {
  constructor(root, h) {
    this.h = h;
    this.el = el(`<div id="garage" class="hidden">
      <div class="g-top">
        <div class="g-cur">
          <span title="Schrott">⚙ <b data-id="scrap">0</b></span>
          <span title="Blaupausen">📘 <b data-id="bp">0</b></span>
          <span title="Kerne">💠 <b data-id="cores">0</b></span>
        </div>
        <button class="icon-btn" data-id="settings" aria-label="Einstellungen">⚙</button>
      </div>
      <div class="g-preview" data-id="preview"><div class="g-title">GARAGE</div></div>
      <div class="g-chassis">
        <button class="icon-btn g-arrow" data-id="cprev" aria-label="Vorheriges Chassis">◀</button>
        <div class="g-cinfo">
          <div class="g-cname" data-id="cname"></div>
          <div class="g-cdesc" data-id="cdesc"></div>
          <div class="g-clock hidden" data-id="clock"></div>
        </div>
        <button class="icon-btn g-arrow" data-id="cnext" aria-label="Nächstes Chassis">▶</button>
      </div>
      <div class="sheet g-sheet">
        <div class="g-scroll" data-id="scroll">
          <div class="g-world" data-id="world">
            <button class="icon-btn small" data-id="wprev" aria-label="Vorherige Strecke">◀</button>
            <div data-id="wname"></div>
            <button class="icon-btn small" data-id="wnext" aria-label="Nächste Strecke">▶</button>
          </div>
          <div class="g-stats" data-id="stats"></div>
          <h4 class="g-h">Teile</h4>
          <div class="g-slots" data-id="slots"></div>
          <h4 class="g-h">Fähigkeiten</h4>
          <div class="g-abil" data-id="abil"></div>
        </div>
        <button class="btn btn-start" data-id="start">TESTFAHRT ▶</button>
      </div>
      <div class="g-pick hidden" data-id="pick">
        <div class="g-pick-sheet">
          <div class="g-pick-head"><h3 data-id="picktitle"></h3><button class="icon-btn small" data-id="pickclose" aria-label="Schließen">✕</button></div>
          <div class="g-pick-list" data-id="picklist"></div>
        </div>
      </div>
    </div>`);
    root.appendChild(this.el);
    this.q = {};
    this.el.querySelectorAll('[data-id]').forEach((e) => { this.q[e.dataset.id] = e; });
    const q = this.q;
    q.settings.onclick = () => h.onSettings();
    q.start.onclick = () => { if (!q.start.disabled) h.onStart(); };
    q.cprev.onclick = () => this.browse(-1);
    q.cnext.onclick = () => this.browse(1);
    q.wprev.onclick = () => h.onWorld(-1);
    q.wnext.onclick = () => h.onWorld(1);
    q.pickclose.onclick = () => this.closePicker();
    q.pick.addEventListener('click', (e) => { if (e.target === q.pick) this.closePicker(); });

    // Slot-Zeilen (einmal angelegt, bei render() befüllt)
    this.slotRows = {};
    for (const slot of SLOTS) {
      const r = el(`<div class="slot-row" data-slot="${slot}">
        <div class="sr-icon">${SLOT_INFO[slot].icon}</div>
        <div class="sr-info">
          <div class="sr-slot">${SLOT_INFO[slot].name}</div>
          <div class="sr-part"></div>
          <div class="sr-bar"><div></div></div>
        </div>
        <button class="btn btn-buy sr-up"></button>
      </div>`);
      r.onclick = (e) => { if (!e.target.closest('.sr-up')) this.openParts(slot); };
      r.querySelector('.sr-up').onclick = (e) => {
        e.stopPropagation();
        const id = this.save.garage.parts[slot];
        this.h.onAction('upgradePart', id, r);
      };
      q.slots.appendChild(r);
      this.slotRows[slot] = r;
    }

    this.save = null;
    this.viewId = null;       // gerade angesehenes Chassis (kann gesperrt sein)
    this.picker = null;       // { kind: 'parts'|'abilities', slot|index, sel }
  }

  show(on) {
    show(this.el, on);
    if (!on) this.closePicker(true);
  }

  get open() { return !this.el.classList.contains('hidden'); }

  // Chassis blättern: gekaufte werden sofort gewählt, gesperrte nur angesehen
  browse(dir) {
    const i = CHASSIS.findIndex((c) => c.id === this.viewId);
    const next = CHASSIS[(i + dir + CHASSIS.length) % CHASSIS.length];
    this.viewId = next.id;
    const st = chassisState(this.save, next);
    if (st.owned) this.h.onAction('selectChassis', next.id);
    else this.h.onPreview({ chassis: next.id });
    this.render();
  }

  get viewingLocked() { return !!this.save && !this.save.garage.ownedChassis.includes(this.viewId); }

  // info: { worldName, worldIndex, worldCount, prevOk, nextOk, nextLocked, nextText, factor }
  render(save = this.save, info = this.info) {
    this.save = save;
    this.info = info || this.info || {};
    const q = this.q;
    const g = save.garage;
    if (!this.viewId || (!this.viewingLocked && this.viewId !== g.chassis)) this.viewId = g.chassis;
    q.scrap.textContent = short(save.meta.scrap);
    q.bp.textContent = fmt(save.meta.blueprints);
    q.cores.textContent = fmt(save.meta.cores);

    // Chassis
    const ci = CHASSIS.findIndex((c) => c.id === this.viewId);
    const c = CHASSIS[ci];
    const cs = chassisState(save, c);
    q.cname.innerHTML = `${c.icon} ${esc(c.name)} <small>${ci + 1}/${CHASSIS.length}</small>`;
    q.cdesc.textContent = c.desc;
    show(q.clock, !cs.owned);
    if (!cs.owned) {
      const need = [];
      if (cs.cores > 0) need.push(`💠 ${cs.cores}`);
      if (cs.research) need.push(`${cs.researchOk ? '✔' : '🔒'} ${esc(researchLabel(cs.research))}${cs.researchOk ? '' : ' (Forschung im Labor)'}`);
      q.clock.innerHTML = `<span>Gesperrt: ${need.join(' · ')}</span>`
        + `<button class="btn btn-buy small-btn g-cbuy" ${cs.canBuy ? '' : 'disabled'}>${cs.researchOk ? `Kaufen 💠 ${cs.cores}` : '🔒 Forschung fehlt'}</button>`;
      q.clock.querySelector('.g-cbuy').onclick = () => this.h.onAction('buyChassis', c.id);
    }
    q.start.disabled = !cs.owned;
    q.start.textContent = cs.owned ? 'TESTFAHRT ▶' : '🔒 Chassis gesperrt';

    // Strecke (Welten bis Phase 3)
    const w = this.info;
    q.wname.innerHTML = `🗺️ Strecke: <b>${esc(w.worldName || '')}</b>${w.factor > 1 ? ` · ⚙×${String(w.factor).replace('.', ',')}` : ''}`
      + (w.nextLocked && w.nextText ? `<small>🔒 Nächste: ${esc(w.nextText)}</small>` : '');
    q.wprev.disabled = !w.prevOk;
    q.wnext.disabled = !w.nextOk;
    q.wnext.textContent = w.nextLocked ? '🔒' : '▶';
    show(q.world, (w.worldCount || 1) > 1);

    // Werte (aktuelle Auswahl; beim Ansehen eines gesperrten Chassis dessen Werte als Vorschau)
    const cur = buildLoadout(save);
    this.loadout = cur;
    const view = this.viewingLocked ? buildLoadout(save, { chassis: this.viewId }) : null;
    this.renderStats(cur.stats, view ? view.stats : (this.previewStats || null));

    // Teile-Slots
    for (const slot of SLOTS) {
      const r = this.slotRows[slot];
      const p = partById(g.parts[slot]);
      const st = partState(save, p);
      r.querySelector('.sr-part').innerHTML = `${p.icon} ${esc(p.name)} <small>St. ${st.level}/${GARAGE.maxPartLevel}</small>`;
      r.querySelector('.sr-bar div').style.width = `${(st.level / GARAGE.maxPartLevel) * 100}%`;
      const b = r.querySelector('.sr-up');
      b.textContent = st.maxed ? 'MAX' : `▲ ⚙ ${short(st.upgradeCost)}`;
      b.disabled = st.maxed;
      b.classList.toggle('cant', !st.maxed && !st.canUpgrade);
      r.classList.toggle('affordable', st.canUpgrade);
      const n = partsForSlot(slot).filter((x) => partState(save, x).canBuy).length;
      r.dataset.news = n ? String(n) : '';   // so viele Teile dieses Slots sind gerade kaufbar
      r.title = n ? `${n} Teil(e) kaufbar` : '';
    }

    // Fähigkeiten
    const slots = cur.slots.abilities;
    let html = '';
    for (let i = 0; i < slots; i++) {
      const a = abilityById(g.abilities[i]);
      html += `<button class="ab-chip" data-i="${i}">${a ? `${a.icon} ${esc(a.name)}` : '＋ leer'}<small>Slot ${i + 1}${a ? ` · ${a.mode === 'hold' ? 'halten' : 'tippen'}` : ''}</small></button>`;
    }
    if (cur.special) {
      const a = abilityById(cur.special);
      html += `<div class="ab-chip special">${a.icon} ${esc(a.name)}<small>Spezial (${esc(c.name)})</small></div>`;
    }
    q.abil.innerHTML = html;
    q.abil.querySelectorAll('button.ab-chip').forEach((b) => { b.onclick = () => this.openAbilities(Number(b.dataset.i)); });

    if (this.picker) this.renderPicker();
  }

  // Werte-Balken (GARAGE.statBars); preview = Vergleichswerte (Geister-Balken)
  renderStats(stats, preview) {
    this.q.stats.innerHTML = GARAGE.statBars.map((b) => {
      const v = stats[b.stat];
      const p = preview ? preview[b.stat] : v;
      const f = Math.min(1, v / b.max), pf = Math.min(1, p / b.max);
      const tr = statTrend(b.stat, v, p);
      const delta = preview && fmtStat(b.stat, v) !== fmtStat(b.stat, p);
      return `<div class="sb ${delta ? (tr > 0 ? 'up' : tr < 0 ? 'down' : 'neutral') : ''}">
        <span class="sb-name">${b.name}</span>
        <div class="sb-track"><div class="sb-fill" style="width:${Math.min(f, pf) * 100}%"></div>${delta ? `<div class="sb-delta" style="left:${Math.min(f, pf) * 100}%;width:${Math.abs(pf - f) * 100}%"></div>` : ''}</div>
        <span class="sb-val">${delta ? `<b>${fmtStat(b.stat, p)}</b>` : fmtStat(b.stat, v)}</span>
      </div>`;
    }).join('');
  }

  // ---------- Teile-Auswahl ----------
  openParts(slot) {
    if (this.viewingLocked) { this.h.onDenied && this.h.onDenied('Erst ein freigeschaltetes Chassis wählen'); return; }
    this.picker = { kind: 'parts', slot, sel: this.save.garage.parts[slot] };
    this.renderPicker();
    show(this.q.pick, true);
    this.q.picklist.scrollTop = 0;
  }

  openAbilities(index) {
    this.picker = { kind: 'abilities', index, sel: this.save.garage.abilities[index] || null };
    this.renderPicker();
    show(this.q.pick, true);
    this.q.picklist.scrollTop = 0;
  }

  closePicker(silent = false) {
    if (!this.picker) return;
    this.picker = null;
    this.previewStats = null;
    show(this.q.pick, false);
    if (!silent) { this.h.onPreview(null); this.render(); }
  }

  get pickerOpen() { return !!this.picker; }

  selectCard(id) {
    const pk = this.picker;
    if (!pk || pk.sel === id) return;
    pk.sel = id;
    if (pk.kind === 'parts') {
      const lo = buildLoadout(this.save, { parts: { [pk.slot]: id } });
      this.previewStats = lo.stats;
      this.h.onPreview({ parts: { [pk.slot]: id } });
      this.renderStats(this.loadout.stats, this.previewStats);
    }
    this.renderPicker();
  }

  renderPicker() {
    const pk = this.picker;
    const q = this.q;
    if (pk.kind === 'parts') {
      const slot = pk.slot;
      q.picktitle.textContent = `${SLOT_INFO[slot].icon} ${SLOT_INFO[slot].name}`;
      const base = this.loadout.stats;
      q.picklist.innerHTML = partsForSlot(slot).map((p) => {
        const st = partState(this.save, p);
        const lo = buildLoadout(this.save, { parts: { [slot]: p.id } });
        let btns = '';
        if (!st.owned) {
          btns = st.researchOk
            ? `<button class="btn btn-buy" data-act="buy" ${st.canBuy ? '' : 'disabled'}>Kaufen ⚙ ${short(st.price)}</button>`
            : `<span class="pc-lock">🔒 ${esc(researchLabel(st.research))} (Forschung)</span>`;
        } else {
          btns = st.equipped ? '<span class="pc-tag">✓ Ausgerüstet</span>' : '<button class="btn btn-primary small-btn" data-act="equip">Ausrüsten</button>';
          btns += st.maxed ? '<span class="pc-tag">MAX</span>'
            : `<button class="btn btn-buy small-btn ${st.canUpgrade ? '' : 'cant'}" data-act="upgrade">▲ Stufe ${st.level + 1} · ⚙ ${short(st.upgradeCost)}</button>`;
        }
        const cls = ['pcard', st.equipped ? 'equipped' : '', !st.owned && !st.researchOk ? 'locked' : '', pk.sel === p.id ? 'sel' : ''].join(' ');
        return `<div class="${cls}" data-id="${p.id}">
          <div class="pc-top"><span class="pc-icon">${p.icon}</span>
            <div class="pc-name">${esc(p.name)}${st.owned ? ` <small>St. ${st.level}/${GARAGE.maxPartLevel}</small>` : ''}${p.tag ? ` <small class="pc-tagname">#${esc(p.tag)}</small>` : ''}</div></div>
          <div class="pc-desc">${esc(p.desc)}</div>
          <div class="pc-diff">${st.equipped ? '<div class="dr same">aktuell ausgerüstet</div>' : diffRows(base, lo.stats)}</div>
          <div class="pc-btns">${btns}</div>
        </div>`;
      }).join('');
      q.picklist.querySelectorAll('.pcard').forEach((card) => {
        const id = card.dataset.id;
        card.onclick = (e) => {
          const b = e.target.closest('[data-act]');
          if (b) {
            e.stopPropagation();
            const act = b.dataset.act;
            if (act === 'buy') this.h.onAction('buyPart', id, card);
            else if (act === 'equip') this.h.onAction('equipPart', id, card);
            else if (act === 'upgrade') this.h.onAction('upgradePart', id, card);
            return;
          }
          this.selectCard(id);
        };
      });
    } else {
      const idx = pk.index;
      q.picktitle.textContent = `Fähigkeit für Slot ${idx + 1}`;
      q.picklist.innerHTML = ABILITIES.filter(isSlotAbility).map((a) => {
        const st = abilityState(this.save, a);
        const here = this.save.garage.abilities[idx] === a.id;
        const costs = [a.mode === 'hold' ? 'halten' : 'tippen'];
        if (a.cooldown) costs.push(`⏱ ${String(a.cooldown).replace('.', ',')} s`);
        if (a.fuel) costs.push(`⛽ ${a.fuel}${a.mode === 'hold' ? '/s' : ''}`);
        if (a.heat) costs.push(`🌡 ${a.heat}${a.mode === 'hold' ? '/s' : ''}`);
        let btn;
        if (!st.unlocked) btn = `<span class="pc-lock">🔒 ${esc(researchLabel(st.research))} (Forschung)</span>`;
        else if (here) btn = '<span class="pc-tag">✓ In diesem Slot</span>';
        else btn = `<button class="btn btn-primary small-btn" data-act="equip">${st.equipped ? `Tauschen (Slot ${st.slot + 1})` : 'Ausrüsten'}</button>`;
        return `<div class="pcard ${here ? 'equipped' : ''} ${st.unlocked ? '' : 'locked'}" data-id="${a.id}">
          <div class="pc-top"><span class="pc-icon">${a.icon}</span><div class="pc-name">${esc(a.name)} <small>${costs.join(' · ')}</small></div></div>
          <div class="pc-desc">${esc(a.desc)}</div>
          <div class="pc-btns">${btn}</div>
        </div>`;
      }).join('');
      q.picklist.querySelectorAll('.pcard').forEach((card) => {
        const b = card.querySelector('[data-act=equip]');
        if (b) b.onclick = (e) => { e.stopPropagation(); this.h.onAction('setAbility', idx, card.dataset.id); };
      });
    }
  }

  // Rückmeldung nach einer Aktion: Teile-Karte (im Unterblatt) bzw. Slot-Zeile kurz aufleuchten/wackeln lassen
  flashPart(id, kind = 'flash') {
    const p = partById(id);
    const node = (this.picker && this.q.picklist.querySelector(`.pcard[data-id="${id}"]`)) || (p && this.slotRows[p.slot]);
    this.flash(node, kind);
  }

  // kurze Rückmeldung auf einem Element
  flash(node, kind = 'flash') {
    if (!node) return;
    node.classList.remove(kind);
    void node.offsetWidth;
    node.classList.add(kind);
  }
}
