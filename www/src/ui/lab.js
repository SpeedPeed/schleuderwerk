// Erfinder-Labor (Garage-Reiter „Labor“): Forschungsbaum aus data/research.js als scrollbarer Baum.
// Raster pos {x: 0–8, y: 0–12}, 5 Äste als Spaltenbereiche (BRANCHES), Linien zu den Voraussetzungen (requires),
// Knoten-Zustände gesperrt / verfügbar / erforscht. Antippen → Detail unten (Freischaltungen, Voraussetzungen, Kosten,
// „Erforschen“). Nur Anzeige – Regeln in garage/research.js. h: { onBuy(id) }
import { el, fmt, show } from './dom.js';
import { inputMode } from './inputMode.js';
import { RESEARCH, BRANCHES, researchById, researchState, unlockList, researchProgress } from '../garage/research.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CW = 86;   // Spaltenbreite (px)
const CH = 92;   // Zeilenhöhe (px)
const PAD = 14;
const TOP = 34;  // Platz für die Ast-Überschriften
const BRANCH_COLORS = { mechanik: '#d08a3c', chemie: '#e0603c', elektrik: '#e8c93c', handel: '#4fbf6a', karosserie: '#4f9fdf' };

const cx = (x) => PAD + x * CW + CW / 2;
const cy = (y) => TOP + y * CH + CH / 2;

export class LabPanel {
  constructor(root, h) {
    this.h = h;
    this.el = el(`<div class="g-lab hidden">
      <div class="lab-head"><b>🧪 Erfinder-Labor</b><span data-id="prog"></span></div>
      <div class="lab-scroll" data-id="scroll"><div class="lab-canvas" data-id="canvas"></div></div>
      <div class="lab-detail" data-id="detail"></div>
    </div>`);
    root.appendChild(this.el);
    this.q = {};
    this.el.querySelectorAll('[data-id]').forEach((e) => { this.q[e.dataset.id] = e; });
    this.sel = null;
    this.save = null;
    this.firstOpen = true;
  }

  get open() { return !this.el.classList.contains('hidden'); }

  show(on) {
    show(this.el, on);
    if (on && this.firstOpen) {
      this.firstOpen = false;
      // zum ersten verfügbaren Knoten scrollen
      requestAnimationFrame(() => {
        const n = RESEARCH.find((r) => researchState(this.save, r).status === 'available') || RESEARCH[0];
        const sc = this.q.scroll;
        sc.scrollLeft = Math.max(0, cx(n.pos.x) - sc.clientWidth / 2);
        sc.scrollTop = Math.max(0, cy(n.pos.y) - sc.clientHeight / 3);
      });
    }
  }

  render(save = this.save) {
    this.save = save;
    const q = this.q;
    const pr = researchProgress(save);
    q.prog.innerHTML = `📘 <b>${fmt(save.meta.blueprints)}</b> · ${pr.done}/${pr.total} erforscht`;
    const W = PAD * 2 + 9 * CW, H = TOP + 13 * CH + PAD;
    q.canvas.style.width = `${W}px`;
    q.canvas.style.height = `${H}px`;
    const states = new Map(RESEARCH.map((r) => [r.id, researchState(save, r)]));
    // Ast-Überschriften
    let html = Object.entries(BRANCHES).map(([id, b]) => {
      const x0 = PAD + b.cols[0] * CW, w = (b.cols[1] - b.cols[0] + 1) * CW;
      return `<div class="lab-branch" style="left:${x0}px;width:${w}px;--c:${BRANCH_COLORS[id]}">${b.icon} ${esc(b.name)}</div>`;
    }).join('');
    // Linien zu den Voraussetzungen
    let lines = '';
    for (const r of RESEARCH) {
      for (const pid of r.requires) {
        const p = researchById(pid);
        if (!p) continue;
        const cls = states.get(r.id).done && states.get(pid).done ? 'done' : states.get(pid).done ? 'open' : '';
        lines += `<line x1="${cx(p.pos.x)}" y1="${cy(p.pos.y)}" x2="${cx(r.pos.x)}" y2="${cy(r.pos.y)}" class="${cls}" />`;
      }
    }
    html += `<svg class="lab-lines" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${lines}</svg>`;
    for (const r of RESEARCH) {
      const st = states.get(r.id);
      const badge = st.status === 'done' ? '✓' : r.repeatable && st.level > 0 ? `${st.level}/${st.max} · 📘${fmt(st.cost)}` : `📘 ${fmt(st.cost)}`;
      html += `<button class="lab-node s-${st.status} ${st.canBuy ? 'buy' : ''} ${this.sel === r.id ? 'sel' : ''} ${r.repeatable ? 'rep' : ''}" data-id="${r.id}"
        style="left:${cx(r.pos.x) - 38}px;top:${cy(r.pos.y) - 41}px;--c:${BRANCH_COLORS[r.branch] || '#888'}" aria-label="${esc(r.name)}">
        <span class="ln-icon">${r.icon}</span><span class="ln-name">${esc(r.name)}</span><span class="ln-cost">${badge}</span></button>`;
    }
    q.canvas.innerHTML = html;
    q.canvas.querySelectorAll('.lab-node').forEach((b) => { b.onclick = () => this.select(b.dataset.id); });
    this.renderDetail();
  }

  select(id) {
    this.sel = id;
    this.q.canvas.querySelectorAll('.lab-node').forEach((b) => b.classList.toggle('sel', b.dataset.id === id));
    this.renderDetail();
  }

  renderDetail() {
    const q = this.q;
    const r = this.sel && researchById(this.sel);
    if (!r) { q.detail.innerHTML = `<p class="small">${inputMode.kbd ? 'Wähle einen Knoten (Tab/Pfeiltasten, Enter).' : 'Tippe einen Knoten an.'} Blaupausen 📘 gibt es für Elite-Etappen, Bosse und manche Ereignisse.</p>`; return; }
    const st = researchState(this.save, r);
    const ul = unlockList(r).map((u) => `<span class="chip">${u.icon} ${esc(u.text)}</span>`).join('');
    const req = r.requires.map((id) => {
      const p = researchById(id);
      const ok = researchState(this.save, p).done;
      return `<span class="chip ${ok ? '' : 'danger'}">${ok ? '✔' : '🔒'} ${esc(p.name)}</span>`;
    }).join('');
    let btn;
    if (st.status === 'done') btn = `<span class="pc-tag">✓ Erforscht${r.repeatable ? ` (Stufe ${st.level}/${st.max})` : ''}</span>`;
    else if (!st.available) btn = '<span class="pc-lock">🔒 Erst die Voraussetzungen erforschen</span>';
    else btn = `<button class="btn btn-buy ${st.canBuy ? '' : 'cant'}" data-a="buy">${r.repeatable ? `Stufe ${st.level + 1}/${st.max} erforschen` : 'Erforschen'} · 📘 ${fmt(st.cost)}</button>`;
    q.detail.innerHTML = `<div class="ld-top"><span class="ld-icon">${r.icon}</span><div><b>${esc(r.name)}</b><small>${esc((BRANCHES[r.branch] || {}).name || '')}${r.repeatable ? ' · Endlos-Forschung' : ''}</small></div></div>
      <div class="ld-desc">${esc(r.desc)}</div>
      ${r.flavor ? `<div class="ld-flavor">${esc(r.flavor)}</div>` : ''}
      ${ul ? `<div class="chips">${ul}</div>` : ''}
      ${req ? `<div class="ld-req"><small>Braucht:</small> ${req}</div>` : ''}
      <div class="ld-btn">${btn}</div>`;
    const b = q.detail.querySelector('[data-a=buy]');
    if (b) b.onclick = () => this.h.onBuy(r.id);
  }

  // Rückmeldung am Knoten (Kauf / verweigert)
  flash(id, kind = 'flash') {
    const n = this.q.canvas.querySelector(`.lab-node[data-id="${id}"]`);
    if (!n) return;
    n.classList.remove(kind);
    void n.offsetWidth;
    n.classList.add(kind);
  }
}
