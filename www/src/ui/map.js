import { el, fmt, show } from './dom.js';
import { NODE_TYPES } from '../data/nodes.js';
import { biomeById } from '../data/biomes.js';
import { RESOURCES } from '../data/balance.js';
import { reachableNodes, durabilityMax, itemSlots } from '../run/runState.js';
import { itemBarHtml } from './items.js';
import { BOSS_FLOOR } from '../map/mapGen.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ROW_H = 92;        // Abstand der Etagen (px)
const PAD = 70;          // Rand oben/unten (px)

// Kartenbildschirm eines Akts (Hochformat, scrollbar): Etage 0 unten, Boss oben, Linien zwischen verbundenen
// Knoten, Knoten-Symbole, aktuelle Position, erreichbare Knoten pulsieren. Kopfleiste: Akt/Biom, Haltbarkeit,
// Schrauben. Tippen auf einen erreichbaren Knoten → h.onNode(id); andere Knoten zeigen nur ihre Beschreibung.
// Unter der Kopfleiste die Item-Leiste (Tippen → Inventar mit Set-Übersicht).
// h: { onNode(id), onGarage(), onInventory() }
export class MapScreen {
  constructor(root, h) {
    this.h = h;
    this.el = el(`<div id="map" class="hidden">
      <div class="map-head">
        <button class="icon-btn" data-id="garage" aria-label="Zur Garage">🔧</button>
        <div class="map-title"><b data-id="act">Akt 1</b><small data-id="biome"></small></div>
        <div class="map-bolts">🔩 <b data-id="bolts">0</b></div>
      </div>
      <div class="map-res">
        <div class="map-dur" data-id="durrow"><b>🔧</b><div class="rb-track"><div class="rb-fill" data-id="dur"></div><em class="rb-num" data-id="durnum">100</em></div></div>
        <div class="map-mods" data-id="mods"></div>
      </div>
      <button class="map-items" data-id="items" aria-label="Inventar"><span class="mi-bar" data-id="ibar"></span><small data-id="icount"></small></button>
      <div class="map-scroll" data-id="scroll"><div class="map-canvas" data-id="canvas"></div></div>
      <div class="map-info hidden" data-id="info"></div>
    </div>`);
    root.appendChild(this.el);
    this.q = {};
    this.el.querySelectorAll('[data-id]').forEach((e) => { this.q[e.dataset.id] = e; });
    this.q.garage.onclick = () => h.onGarage();
    this.q.items.onclick = () => h.onInventory && h.onInventory();
    this.run = null;
  }

  show(on) { show(this.el, on); if (!on) show(this.q.info, false); }
  get open() { return !this.el.classList.contains('hidden'); }

  render(run) {
    this.run = run;
    const q = this.q;
    const b = biomeById(run.biome);
    q.act.textContent = `Akt ${run.act} · ${b.icon} ${b.name}`;
    q.biome.textContent = run.current ? 'Knoten läuft – weiter geht’s!' : run.pos.floor < 0 ? 'Wähle deinen Weg (Etage 0)' : `Etage ${run.pos.floor + 1} geschafft – wähle die nächste`;
    q.bolts.textContent = fmt(run.bolts);
    const max = durabilityMax(run);
    const df = Math.max(0, Math.min(1, run.durability / max));
    q.dur.style.width = `${df * 100}%`;
    q.durnum.textContent = `${fmt(Math.ceil(run.durability))} / ${fmt(max)}`;
    q.durrow.classList.toggle('warn', df < RESOURCES.durWarn && df >= RESOURCES.durCrit);
    q.durrow.classList.toggle('crit', df < RESOURCES.durCrit);
    const mods = [];
    const sign = (v) => (v > 0 ? `+${fmt(v)}` : `−${fmt(-v)}`);
    if (run.runMods.fuelMaxAdd) mods.push(`⛽ ${sign(run.runMods.fuelMaxAdd)}`);
    if (run.runMods.coolMul) mods.push(`❄ ${sign(Math.round(run.runMods.coolMul * 100))} %`);
    q.mods.textContent = mods.join(' · ');
    const slots = itemSlots(run);
    q.ibar.innerHTML = itemBarHtml(run.inventory || [], slots);
    q.icount.textContent = `🎒 ${(run.inventory || []).length}/${slots} ›`;

    // Knoten-Lage: Etage 0 unten, Boss oben
    const map = run.map;
    const floors = [...map.floors, [map.boss]];
    const H = PAD * 2 + BOSS_FLOOR * ROW_H;
    q.canvas.style.height = `${H}px`;
    const yOf = (floor) => H - PAD - floor * ROW_H;
    const reach = new Set(reachableNodes(run).map((n) => n.id));
    const visited = new Set(run.visited);
    const path = new Set(run.path);
    let lines = '';
    for (const row of floors) {
      for (const n of row) {
        for (const id of n.next) {
          const m = floors.flat().find((x) => x.id === id);
          if (!m) continue;
          const on = path.has(n.id) && (path.has(m.id) || reach.has(m.id));
          lines += `<line x1="${n.x * 100}" y1="${yOf(n.floor)}" x2="${m.x * 100}" y2="${yOf(m.floor)}" class="${on ? 'on' : ''}" />`;
        }
      }
    }
    if (run.pos.floor < 0) for (const n of map.floors[0]) lines += `<line x1="50" y1="${H - 8}" x2="${n.x * 100}" y2="${yOf(0)}" class="start" />`;
    let html = `<svg class="map-lines" viewBox="0 0 100 ${H}" preserveAspectRatio="none">${lines}</svg>`;
    html += `<div class="map-start" style="top:${H - 22}px">▲ Start</div>`;
    for (const row of floors) {
      for (const n of row) {
        const def = NODE_TYPES[n.type] || NODE_TYPES.stage;
        const cls = ['mnode', `t-${n.type}`];
        if (visited.has(n.id)) cls.push('visited');
        if (reach.has(n.id)) cls.push('reach');
        if (run.pos.node === n.id || (run.current && run.current.node === n.id)) cls.push('here');
        const label = n.type === 'boss' ? `<span class="mn-label">${esc(bossName(run, b))}</span>` : '';
        html += `<button class="${cls.join(' ')}" data-node="${n.id}" style="left:${n.x * 100}%;top:${yOf(n.floor)}px;--c:${def.color}" aria-label="${esc(def.name)}">`
          + `<span class="mn-icon">${visited.has(n.id) ? '✓' : def.icon}</span>${label}</button>`;
      }
    }
    q.canvas.innerHTML = html;
    q.canvas.querySelectorAll('.mnode').forEach((btn) => {
      btn.onclick = () => this.tap(btn.dataset.node, reach.has(btn.dataset.node));
    });
    show(q.info, false);
    // zur aktuellen Etage scrollen
    const focus = run.current ? run.pos.floor : run.pos.floor + 1;
    requestAnimationFrame(() => {
      const sc = q.scroll;
      sc.scrollTop = Math.max(0, yOf(Math.min(BOSS_FLOOR, Math.max(0, focus))) - sc.clientHeight * 0.6);
    });
  }

  tap(id, reachable) {
    const run = this.run;
    const node = [...run.map.floors.flat(), run.map.boss].find((n) => n.id === id);
    if (!node) return;
    if (reachable) { this.h.onNode(id); return; }
    const def = NODE_TYPES[node.type] || NODE_TYPES.stage;
    const b = biomeById(run.biome);
    const title = node.type === 'boss' ? `${def.icon} ${bossName(run, b)}` : `${def.icon} ${def.name}`;
    const why = run.visited.includes(id) ? 'Schon besucht.' : 'Noch nicht erreichbar – folge den Linien.';
    this.q.info.innerHTML = `<b>${esc(title)}</b><p>${esc(node.type === 'boss' ? bossDesc(run, b) : def.desc)}</p><small>${why}</small>`;
    show(this.q.info, true);
    clearTimeout(this.infoTimer);
    this.infoTimer = setTimeout(() => show(this.q.info, false), 3500);
  }
}

function bossOf(run, biome) {
  const id = run.bossIds[run.act];
  return biome.bosses.find((x) => x.id === id) || biome.bosses[0];
}
const bossName = (run, biome) => bossOf(run, biome).name;
const bossDesc = (run, biome) => bossOf(run, biome).desc;
