import { el, fmt, show } from './dom.js';

const TITLES = { stop: 'Testfahrt beendet', wreck: 'Totalschaden!', time: 'Zeit abgelaufen' };

// Auswertung nach der Testfahrt mit hochzählender Schrott-Belohnung.
export class Results {
  constructor(root, { onGarage, onAgain, onTick }) {
    this.el = el(`<div id="results" class="overlay hidden"><div class="card res-card">
      <h2 data-id="title">Testfahrt beendet</h2>
      <div class="res-badges" data-id="badges"></div>
      <div class="res-rows" data-id="rows"></div>
      <div class="res-total">⚙ +<span data-id="total">0</span> <small>Schrott</small></div>
      <div class="btn-row">
        <button class="btn btn-secondary" data-id="garage">🔧 Garage</button>
        <button class="btn btn-primary" data-id="again">↻ Nochmal</button>
      </div>
      <div class="res-tip" data-id="tip"></div>
    </div></div>`);
    root.appendChild(this.el);
    this.q = {};
    this.el.querySelectorAll('[data-id]').forEach((e) => { this.q[e.dataset.id] = e; });
    this.q.garage.onclick = onGarage;
    this.q.again.onclick = onAgain;
    this.onTick = onTick;
  }

  show(on) { show(this.el, on); }

  // r: Etappen-Ergebnis (stage.finish), extra: { newDist, newHeight, canUpgrade, unlocked: [Welten] }
  present(r, { newDist, newHeight, canUpgrade, unlocked = [] }) {
    const q = this.q;
    q.title.textContent = TITLES[r.reason] || TITLES.stop;
    q.badges.innerHTML = (newDist ? '<span class="badge">🏁 NEUER WEITEN-REKORD!</span>' : '')
      + (newHeight ? '<span class="badge">↑ NEUER HÖHEN-REKORD!</span>' : '')
      + unlocked.map((w) => `<span class="badge badge-world">🗺️ NEUE STRECKE: ${w.name.toUpperCase()}!<small>Wechsle in der Garage mit ▶</small></span>`).join('');
    const p = r.parts;
    const rows = [
      ['Distanz', `${fmt(r.dist)} m`, `+${fmt(p.dist)}`],
      ['Max. Höhe', `${fmt(r.height)} m`, `+${fmt(p.height)}`],
      ['Tricks', `${fmt(r.tricks)} Punkte`, `+${fmt(p.tricks)}`],
    ];
    if (p.pickups) rows.push(['Schrott eingesammelt', `${fmt(r.scrapPickups)} Stück`, `+${fmt(p.pickups)}`]);
    rows.push(['Schrauben', `🔩 ${fmt(r.bolts)}`, '–']);
    rows.push(['Schaden', `−${fmt(r.damageTaken)} 🔧 (${fmt(r.durability)}/${fmt(r.durabilityMax)})`, '']);
    q.rows.innerHTML = rows.map(([a, b, c], i) =>
      `<div class="res-row" style="animation-delay:${i * 0.12}s"><span>${a}</span><span class="res-sub">${b}</span><b>${c}</b></div>`).join('')
      + (r.factor !== 1 ? `<div class="res-row"><span>Bonus</span><span></span><b>×${String(Math.round(r.factor * 100) / 100).replace('.', ',')}</b></div>` : '');
    q.garage.classList.toggle('glow', canUpgrade || unlocked.length > 0);
    q.tip.textContent = unlocked.length ? 'Eine neue Strecke wartet in der Garage!' : canUpgrade ? 'Du kannst ein Teil verbessern!' : '';
    this.show(true);

    // Gesamtsumme hochzählen
    const start = performance.now();
    const dur = Math.min(1400, 500 + r.scrap * 4);
    const tick = (now) => {
      const k = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      q.total.textContent = fmt(r.scrap * e);
      if (k < 1) { this.onTick && Math.random() < 0.5 && this.onTick(); requestAnimationFrame(tick); }
    };
    requestAnimationFrame(tick);
  }
}
