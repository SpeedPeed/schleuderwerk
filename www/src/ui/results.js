import { el, fmt, show } from './dom.js';

const TITLES = { stop: 'Run beendet', wreck: 'Totalschaden!', time: 'Zeit abgelaufen' };

// Auswertung nach dem Run mit hochzählenden Zahlen.
export class Results {
  constructor(root, { onWorkshop, onAgain, onTick }) {
    this.el = el(`<div id="results" class="overlay hidden"><div class="card res-card">
      <h2 data-id="title">Run beendet</h2>
      <div class="res-badges" data-id="badges"></div>
      <div class="res-rows" data-id="rows"></div>
      <div class="res-total">💰 +<span data-id="total">0</span></div>
      <div class="btn-row">
        <button class="btn btn-secondary" data-id="ws">🔧 Werkstatt</button>
        <button class="btn btn-primary" data-id="again">↻ Nochmal</button>
      </div>
      <div class="res-tip" data-id="tip"></div>
    </div></div>`);
    root.appendChild(this.el);
    this.q = {};
    this.el.querySelectorAll('[data-id]').forEach((e) => { this.q[e.dataset.id] = e; });
    this.q.ws.onclick = onWorkshop;
    this.q.again.onclick = onAgain;
    this.onTick = onTick;
  }

  show(on) { show(this.el, on); }

  present(r, { newDist, newHeight, canUpgrade }) {
    const q = this.q;
    q.title.textContent = TITLES[r.reason] || TITLES.stop;
    q.badges.innerHTML = (newDist ? '<span class="badge">🏁 NEUER WEITEN-REKORD!</span>' : '')
      + (newHeight ? '<span class="badge">↑ NEUER HÖHEN-REKORD!</span>' : '');
    const rows = [
      ['Distanz', `${fmt(r.dist)} m`, r.parts.dist],
      ['Max. Höhe', `${fmt(r.height)} m`, r.parts.height],
      ['Münzen', '', r.parts.coins],
      ['Tricks', '', r.parts.tricks],
    ];
    q.rows.innerHTML = rows.map(([a, b, c], i) =>
      `<div class="res-row" style="animation-delay:${i * 0.12}s"><span>${a}</span><span class="res-sub">${b}</span><b>+${fmt(c)}</b></div>`).join('')
      + (r.factor !== 1 ? `<div class="res-row"><span>Weltbonus</span><span></span><b>×${r.factor}</b></div>` : '');
    q.ws.classList.toggle('glow', canUpgrade);
    q.tip.textContent = canUpgrade ? 'Du kannst dir ein Upgrade leisten!' : '';
    this.show(true);

    // Gesamtsumme hochzählen
    const start = performance.now();
    const dur = Math.min(1400, 500 + r.total * 2);
    const tick = (now) => {
      const k = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      q.total.textContent = fmt(r.total * e);
      if (k < 1) { this.onTick && Math.random() < 0.5 && this.onTick(); requestAnimationFrame(tick); }
    };
    requestAnimationFrame(tick);
  }
}
