import { el, fmt, short, show } from './dom.js';
import { UPGRADES } from '../config/upgrades.js';
import { upgradeCost } from '../game/stats.js';

// Werkstatt: Geld, Rekorde, Upgrade-Karten und der Start-Knopf.
export class Workshop {
  constructor(root, { onBuy, onStart, onSettings, worldName }) {
    this.el = el(`<div id="workshop" class="hidden">
      <div class="ws-title">
        <div><div class="logo">SCHLEUDERWERK</div><div class="world">Welt 1 · ${worldName}</div></div>
        <button class="icon-btn" data-id="settings" aria-label="Einstellungen">⚙</button>
      </div>
      <div class="sheet">
        <div class="ws-head">
          <div class="ws-money">💰 <b data-id="money">0</b></div>
          <div class="ws-stats" data-id="stats"></div>
        </div>
        <div class="ws-list" data-id="list"></div>
        <button class="btn btn-start" data-id="start">STARTEN ▶</button>
      </div>
    </div>`);
    root.appendChild(this.el);
    this.q = {};
    this.el.querySelectorAll('[data-id]').forEach((e) => { this.q[e.dataset.id] = e; });
    this.q.start.onclick = onStart;
    this.q.settings.onclick = onSettings;
    this.onBuy = onBuy;

    this.cards = {};
    for (const u of UPGRADES) {
      const c = el(`<div class="card-up">
        <div class="up-icon">${u.icon}</div>
        <div class="up-info">
          <div class="up-name">${u.name} <span class="up-lvl"></span></div>
          <div class="up-effect"></div>
          <div class="up-bar"><div></div></div>
        </div>
        <button class="btn btn-buy"></button>
      </div>`);
      c.querySelector('.btn-buy').onclick = () => this.onBuy(u, c);
      this.q.list.appendChild(c);
      this.cards[u.id] = c;
    }
  }

  show(on) { show(this.el, on); }

  flash(card) {
    card.classList.remove('flash');
    void card.offsetWidth;
    card.classList.add('flash');
  }

  render(save) {
    this.q.money.textContent = short(save.money);
    const s = save.stats;
    this.q.stats.innerHTML = `🏁 Rekord <b>${fmt(s.bestDist)} m</b> · ↑ <b>${fmt(s.bestHeight)} m</b> · Runs <b>${fmt(s.runs)}</b>`;
    for (const u of UPGRADES) {
      const c = this.cards[u.id];
      const l = save.upgrades[u.id] || 0;
      const maxed = l >= u.max;
      const cost = maxed ? 0 : upgradeCost(u, l);
      c.querySelector('.up-lvl').textContent = `Stufe ${l}/${u.max}`;
      c.querySelector('.up-effect').innerHTML = maxed
        ? u.label(l, u)
        : `${l > 0 ? u.label(l, u) : 'noch nicht verbessert'} <span class="next">→ ${u.label(l + 1, u)}</span>`;
      c.querySelector('.up-bar div').style.width = `${(l / u.max) * 100}%`;
      const b = c.querySelector('.btn-buy');
      b.textContent = maxed ? 'MAX' : `💰 ${short(cost)}`;
      b.disabled = maxed;
      b.classList.toggle('cant', !maxed && save.money < cost);
      c.classList.toggle('affordable', !maxed && save.money >= cost);
    }
  }
}
