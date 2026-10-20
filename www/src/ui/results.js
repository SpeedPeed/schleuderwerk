import { el, fmt, show, icon } from './dom.js';
import { FX } from '../data/balance.js';

const TITLES = { stop: 'Testfahrt beendet', wreck: 'Totalschaden!', time: 'Zeit abgelaufen', fall: 'Abgestürzt!' };

// Auswertung einer Testfahrt (Dev-Menü, ohne Run) mit hochzählender Schrott-Belohnung.
export class Results {
  constructor(root, { onGarage, onAgain, onTick }) {
    this.el = el(`<div id="results" class="overlay hidden"><div class="card res-card">
      <h2 data-id="title">Testfahrt beendet</h2>
      <div class="res-badges" data-id="badges"></div>
      <div class="res-rows" data-id="rows"></div>
      <div class="res-total">${icon('schrott')} +<span data-id="total">0</span> <small>Schrott</small></div>
      <div class="btn-row">
        <button class="btn btn-secondary" data-id="garage">${icon('garage')} Garage</button>
        <button class="btn btn-primary" data-id="again">${icon('wuerfel')} Nochmal</button>
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

  // r: Etappen-Ergebnis (stage.finish, r.testDrive = Schrott-Belohnung), extra: { newDist, newHeight, canUpgrade }
  present(r, { newDist, newHeight, canUpgrade }) {
    const q = this.q;
    q.title.textContent = TITLES[r.reason] || TITLES.stop;
    q.badges.innerHTML = (newDist ? '<span class="stamp">NEUER WEITEN-REKORD!</span>' : '')
      + (newHeight ? '<span class="stamp">NEUER HÖHEN-REKORD!</span>' : '')
      + (r.medal ? `<span class="stamp">${icon({ bronze: 'bronze', silver: 'silber', gold: 'gold' }[r.medal])} Ziel ${fmt(r.target)} m geschafft</span>` : '');
    const p = r.testDrive.parts;
    const rows = [
      ['Distanz', `${fmt(r.dist)} m`, `+${fmt(p.dist)}`],
      ['Max. Höhe', `${fmt(r.height)} m`, `+${fmt(p.height)}`],
      ['Tricks', `${fmt(r.tricks)} Punkte`, `+${fmt(p.tricks)}`],
    ];
    if (p.pickups) rows.push(['Schrott eingesammelt', `${fmt(r.scrapPickups)} Stück`, `+${fmt(p.pickups)}`]);
    rows.push(['Schrauben', `${icon('schraube')} ${fmt(r.bolts)}`, '–']);
    rows.push(['Schaden', `−${fmt(r.damageTaken)} ${icon('schluessel')} (${fmt(r.durability)}/${fmt(r.durabilityMax)})`, '']);
    q.rows.innerHTML = rows.map(([a, b, c], i) =>
      `<div class="res-row" style="animation-delay:${i * 0.12}s"><span>${a}</span><span class="res-sub">${b}</span><b>${c}</b></div>`).join('')
      + (r.testDrive.factor !== 1 ? `<div class="res-row"><span>Bonus</span><span></span><b>×${String(Math.round(r.testDrive.factor * 100) / 100).replace('.', ',')}</b></div>` : '');
    q.garage.classList.toggle('glow', canUpgrade);
    q.tip.textContent = canUpgrade ? 'Da geht was – du kannst ein Teil verbessern!' : '';
    const total = r.testDrive.total;
    this.show(true);

    // Gesamtsumme hochzählen
    const start = performance.now();
    const RC = FX.resultCount;
    const dur = Math.min(RC.max, RC.base + total * RC.perScrap);
    const tick = (now) => {
      const k = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      q.total.textContent = fmt(total * e);
      if (k < 1) { this.onTick && Math.random() < 0.5 && this.onTick(); requestAnimationFrame(tick); }
    };
    requestAnimationFrame(tick);
  }
}
