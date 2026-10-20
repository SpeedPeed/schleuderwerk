import { el, fmt, show } from './dom.js';
import { NODE_TYPES } from '../data/nodes.js';
import { biomeById, bossById, FEATURE_INFO } from '../data/biomes.js';
import { FX, RUN, REWARDS } from '../data/balance.js';
import { ascensionSummary, ascensionList, fmtPlaytime } from '../garage/progression.js';
import { choiceCardsHtml, entryRowHtml, itemCardHtml } from './items.js';
import { itemById } from '../data/items.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MEDAL = { bronze: { icon: '🥉', name: 'Bronze' }, silver: { icon: '🥈', name: 'Silber' }, gold: { icon: '🥇', name: 'Gold' }, platin: { icon: '💿', name: 'Platin' }, king: { icon: '👑', name: 'Schrottkönig' } };
export const GRADE_NAME = { miss: 'verfehlt', bronze: 'Bronze', silver: 'Silber', gold: 'Gold', platin: 'Platin', king: 'Schrottkönig' };
const pctTxt = (x) => `${Math.round(x * 100)} %`;

// Biom-Besonderheiten als kurze Texte (Etappen-Intro, Akt-Übergang)
export function biomeTraits(b) {
  const t = [];
  if (b.physics.ambientHeat) t.push(`🌡 +${b.physics.ambientHeat} Hitze/s`);
  if (b.physics.landTolAdd) t.push(`💧 nasser Boden: Landetoleranz ${b.physics.landTolAdd}°`);
  for (const [tag, v] of Object.entries(b.tagBoost || {})) t.push(`✨ ${tag[0].toUpperCase()}${tag.slice(1)}-Items +${Math.round(v * 100)} %`);
  return t;
}

function weatherText(w) {
  if (!w) return '';
  const calm = w.wind[0] === 0 && w.wind[1] === 0 && !w.gust;
  if (calm) return `${w.icon} ${w.name}`;
  const b = Math.round(w.base);
  const dir = w.gust ? `Böen bis ${Math.round(w.gust)} m/s` : b >= 0 ? `Rückenwind ${Math.abs(b)} m/s` : `Gegenwind ${Math.abs(b)} m/s`;
  return `${w.icon} ${w.name} · ${dir}${w.rain ? ' · Regen' : ''}`;
}

// Paket A: Etappen-Intro als Banner über der Zielansicht (ui/hud.js → banner) – kein eigener Bildschirm mehr.
// Kompakt: Art, Ziel, Medaillen, Gefahren, Wetter, Neuversuch, Haltbarkeit; Boss mit Tipps und Belohnung.
// d: { spec, node, attempts, durability, durabilityMax, ascension, towPct, firstBoss, twin, back }
export function introBannerHtml(d) {
  const s = d.spec;
  const b = biomeById(s.biome);
  const def = NODE_TYPES[s.kind] || NODE_TYPES.stage;
  const title = s.kind === 'boss' ? `${def.icon} ${esc(s.bossName)}` : `${def.icon} ${def.name}`;
  const sub = s.kind === 'boss' ? `Boss-Strecke · ${b.icon} ${b.name}` : `Etage ${s.floor + 1} · ${b.icon} ${b.name}`;
  const boss = s.kind === 'boss' ? bossById(s.bossId) || {} : null;
  const bossDesc = boss ? boss.intro || boss.desc : '';
  const medals = s.medalList.map((m) => `<span class="ri-medal m-${m}">${MEDAL[m].icon} ${fmt(s.medals[m])} m${s.kind === 'boss' && m === 'gold' ? ' <small>Bonus</small>' : ''}</span>`).join('');
  const hz = s.hazards.map((h) => FEATURE_INFO[h]).filter(Boolean)
    .map((f) => `<span class="chip ${f.danger ? 'danger' : ''}">${f.icon} ${f.name}</span>`).join('') || '<span class="chip">keine Besonderheiten</span>';
  const traits = biomeTraits(b).map((t) => `<span class="chip">${esc(t)}</span>`).join('');
  const tired = s.kind === 'boss' && d.attempts > 0 ? ` · Boss müde: Ziel −${Math.round(RUN.bossRetry.targetCut * Math.min(RUN.bossRetry.maxCuts, d.attempts) * 100)} %` : '';
  const retry = d.attempts > 0 ? `<div class="ri-retry">↻ Neuversuch ${d.attempts + 1} – neue Strecke${tired}</div>` : '';
  // Boss: Tipps und Belohnung (Episch/Legendär-Auswahl, Blaupausen, Kerne beim ersten Sieg in Akt 2/3)
  let bossHtml = '';
  if (boss) {
    const act = s.act || b.act;
    const rw = [`👑 Episch/Legendär-Auswahl`, `📘 ${REWARDS.blueprints.boss[act] || 0}`, `⚙ Akt-Bonus ${fmt(REWARDS.actScrap[act] || 0)}`];
    if (d.firstBoss && REWARDS.firstBossCores[act]) rw.push(`💠 ${REWARDS.firstBossCores[act]} (erster Sieg)`);
    if (act >= RUN.acts && !d.twin) rw.push(`💠 ${REWARDS.winCores} Run-Sieg`);
    bossHtml = (d.twin ? '<div class="ri-twin">☠ Doppelter Ärger – der Zwillingsboss!</div>' : '')
      + (boss.tips && boss.tips.length ? `<ul class="ri-tips">${boss.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '')
      + `<h4>Belohnung</h4><div class="chips">${rw.map((t) => `<span class="chip good">${esc(t)}</span>`).join('')}</div>`;
  }
  const asc = d.ascension > 0 ? `<h4>☠ Schrottstufe ${d.ascension}</h4><div class="chips">${ascensionSummary(d.ascension).map((t) => `<span class="chip danger">${esc(t)}</span>`).join('')}</div>` : '';
  return `
    <div class="ri-head"><div class="ri-kind" style="--c:${def.color}">${title}</div><div class="ri-sub">${sub}</div></div>
    ${bossDesc ? `<p class="ri-desc">${esc(bossDesc)}</p>` : ''}
    ${bossHtml}
    <div class="ri-goal"><div class="ri-target"><small>ZIEL</small><b>${fmt(s.target)} m</b></div><div class="ri-medals">${medals}</div></div>
    ${retry}
    <div class="chips">${hz}<span class="chip">${esc(weatherText(s.weather))}</span>${traits}</div>
    ${asc}
    <div class="ri-dur">🔧 Haltbarkeit ${fmt(Math.ceil(d.durability))} / ${fmt(d.durabilityMax)}</div>
    <div class="ri-go"><span class="touch-only">Finger halten = Kraft laden</span><span class="kbd-only"><b>Leertaste halten</b> = Kraft laden</span>${d.back ? ' · <button class="btn btn-secondary small-btn" data-a="back">◀ Karte</button>' : ''}</div>`;
}

// Alle Run-Bildschirme außer der Karte in EINEM Overlay (#runui): Etappen-Intro, Ergebnis (Medaillen/Abschleppen),
// Item-Auswahl, Tankstelle, Akt-Übergang, Run-Ende. Die Sonderknoten (Händler, Werkbank, Schwarzmarkt, Ereignis,
// Schatz) zeichnet ui/shops.js in dasselbe Overlay. Jede Methode bekommt ihre Rückrufe direkt.
export class RunScreens {
  constructor(root, { onTick } = {}) {
    this.el = el('<div id="runui" class="overlay hidden"><div class="card run-card" data-id="card"></div></div>');
    root.appendChild(this.el);
    this.card = this.el.querySelector('[data-id=card]');
    this.onTick = onTick;
    this.kind = null;
    this.timers = [];
  }

  get open() { return !this.el.classList.contains('hidden'); }

  hide() {
    show(this.el, false);
    this.kind = null;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  // keep: Bildlauf beibehalten, wenn derselbe Bildschirm neu gezeichnet wird (Shops nach einem Kauf)
  present(kind, html, keep = false) {
    const top = keep && this.open && this.kind === kind ? this.card.scrollTop : 0;
    this.hide();
    this.kind = kind;
    this.card.className = `card run-card rc-${kind}`;
    this.card.innerHTML = html;
    this.card.scrollTop = top;
    show(this.el, true);
  }

  bind(sel, fn) { const b = this.card.querySelector(sel); if (b) b.onclick = fn; return b; }

  // ---------- Etappen-Intro (Paket A: Banner über der Zielansicht, siehe introBannerHtml) ----------
  // d: { spec, node, biome, attempts, durability, durabilityMax, ascension, towPct, firstBoss, twin }
  intro(d, { onGo, onBack }) {
    this.present('intro', `${introBannerHtml({ ...d, back: false })}
      <div class="btn-row"><button class="btn btn-secondary" data-a="back">🗺 Karte</button><button class="btn btn-primary" data-a="go">LOS ▶</button></div>`);
    if (d.spec.kind === 'boss') this.card.classList.add('rc-boss');
    this.bind('[data-a=go]', onGo);
    this.bind('[data-a=back]', onBack);
  }

  // ---------- Ergebnis einer Run-Etappe (Paket A: mit Item-Auswahl auf demselben Bildschirm) ----------
  // r: Etappen-Ergebnis, o: Ergebnis von applyStageResult, extra: { durability, durabilityMax, towPct },
  // choice: offene Item-Auswahl (oder null) mit info { inventory, parts, slots, remaining }.
  // Rückrufe: onNext (weiter), onPick(i)/onSkip/onInventory (Auswahl), onLand/onRetry (verfehlt), onMap, onEnd
  stageResult(r, o, extra, h) {
    const choice = h.choice || null;
    const grade = o.grade || r.grade || (r.medal || 'miss');
    const title = o.defeat ? (r.reason === 'wreck' ? 'TOTALSCHADEN!' : 'Run vorbei!')
      : o.cleared ? (grade === 'king' ? 'SCHROTTKÖNIG!' : grade === 'platin' ? 'PLATIN!' : r.kind === 'boss' ? 'BOSS BESIEGT!' : 'GESCHAFFT!')
        : o.missed ? (r.reason === 'fall' ? 'Abgestürzt – Notlandung' : 'Knapp daneben – Notlandung')
          : r.reason === 'fall' ? 'Abgestürzt!' : 'Nicht geschafft';
    const why = { stop: 'ausgerollt', fall: 'in die Schlucht gestürzt', time: 'Zeit abgelaufen', wreck: 'Totalschaden', far: 'Ziel weit übertroffen' }[r.reason] || '';
    const ff = r.instant ? ' · ⏩ vorgespult' : '';
    const slots = r.medalList.map((m, i) => `<div class="rm-slot m-${m}" data-medal="${m}" style="--i:${i}"><span>${MEDAL[m].icon}</span><small>${fmt(r.medals[m])} m</small></div>`).join('')
      + (r.medals.platin ? ['platin', 'king'].map((m, i) => `<div class="rm-slot m-${m}${grade === m || (m === 'platin' && grade === 'king') ? '' : ' bonus'}" data-medal="${m}" style="--i:${r.medalList.length + i}"><span>${MEDAL[m].icon}</span><small>${fmt(r.medals[m])} m</small></div>`).join('') : '');
    const rw = o.rewards || { bolts: 0, scrap: 0, blueprints: 0, base: {}, combo: { bolts: 0, scrap: 0 } };
    const cr = o.credited || null;
    const rows = [];
    rows.push(['⚙ Schrott', rw.scrap, `${fmt(r.dist)} m · ${GRADE_NAME[grade]}${cr ? ' · gutgeschrieben' : ''}`]);
    rows.push(['🔩 Schrauben', rw.bolts, rw.base.bolts ? `davon ${fmt(r.bolts)} gesammelt` : 'gesammelt']);
    if (rw.combo && (rw.combo.bolts || rw.combo.scrap)) rows.push(['🎪 Kombo', rw.combo.bolts, `${fmt(r.tricks)} Trickpunkte → +${fmt(rw.combo.bolts)} 🔩 · +${fmt(rw.combo.scrap)} ⚙ (im Schrott enthalten)`]);
    if (rw.blueprints) rows.push(['📘 Blaupausen', rw.blueprints, cr ? 'gutgeschrieben' : '']);
    if (o.cores) rows.push(['💠 Kerne', o.cores, 'erster Sieg über diesen Boss']);
    if (o.actBonus) rows.push(['🏁 Akt-Bonus ⚙', o.actBonus, '']);
    if (r.crates && o.cleared) rows.push(['📦 Item-Kisten', r.crates, 'je Kiste eine Item-Auswahl']);
    const knapp = r.knapp ? `<div class="rr-tow">📉 Knapp: <b>${r.knapp} %</b> der Zielmarke – hochgerechnet</div>` : '';
    const tow = o.towed ? `<div class="rr-tow">🚛 Abschleppen: <b>−${fmt(o.towPenalty)} 🔧</b> (${pctTxt(extra.towPct ?? RUN.towPenalty)} der max. Haltbarkeit)${o.defeat ? '' : o.bossReroll ? ` – Neuversuch gegen <b>${esc(o.bossReroll.icon)} ${esc(o.bossReroll.name)}</b>, Ziel −${Math.round((1 - o.bossReroll.targetMul) * 100)} % („Der Boss ist auch müde“)` : ' – danach Neuversuch'}</div>` : '';
    const miss = o.missed ? `<div class="rr-tow">🛬 <b>Notlandung:</b> −${fmt(o.emergency.penalty)} 🔧 (${pctTxt(o.emergency.pct)}), Trostkiste <b>+${fmt(o.emergency.bolts)} 🔩</b>, weiter auf der Karte.<br>↻ <b>Nochmal:</b> −${fmt(o.retry.penalty)} 🔧 (${pctTxt(o.retry.pct)}) auf einer <b>neuen</b> Strecke.</div>` : '';
    const twin = o.secondBoss ? `<div class="ri-twin">☠ Doppelter Ärger! Gleich danach: ${esc(o.secondBoss.icon)} ${esc(o.secondBoss.name)}</div>` : '';
    let btns;
    if (o.defeat) btns = '<button class="btn btn-primary" data-a="end">Run beenden ▶</button>';
    else if (o.missed) btns = '<button class="btn btn-secondary" data-a="retry">↻ Nochmal</button><button class="btn btn-primary" data-a="land">Weiter ▶ <small>Notlandung</small></button>';
    else if (o.towed) btns = '<button class="btn btn-secondary" data-a="map">🗺 Karte</button><button class="btn btn-primary" data-a="retry">↻ Neuversuch</button>';
    else if (choice) btns = `<button class="btn btn-secondary" data-a="skip">${choice.skipBolts ? `Überspringen: +${fmt(choice.skipBolts)} 🔩` : 'Ablehnen'} <kbd class="kbd-only">S</kbd></button>`;
    else btns = '<button class="btn btn-primary" data-a="next">Weiter ▶</button>';
    let loot = '';
    if (choice && !o.defeat) {
      const d = h.info;
      const cards = choice.items.length ? choiceCardsHtml(choice, d) : '<p class="ri-desc">Der Pool ist leer – nimm die Schrauben.</p>';
      const head = { elite: '☠️ Elite-Beute – mindestens Selten', boss: '👑 Boss-Beute – Episch oder Legendär', crate: '📦 Item-Kiste' }[choice.context] || '🎁 Beute – eins darfst du einpacken';
      loot = `<h4 class="rr-loot">${head}${d.remaining > 1 ? ` <small>· noch ${d.remaining - 1} weitere Auswahl</small>` : ''}</h4>
        <button class="ch-inv" data-a="inv">🎒 ${d.inventory.length}/${d.slots} ${d.inventory.length >= d.slots ? '· voll – Nehmen ersetzt ein Item' : ''}</button>
        <div class="ch-cards">${cards}</div>`;
    }
    this.present('result', `
      <h2 class="${o.cleared ? 'good' : 'bad'}">${title}</h2>
      <div class="rr-dist"><b>${fmt(r.dist)} m</b> <small>/ Ziel ${fmt(r.target)} m · ${why}${ff}</small></div>
      <div class="rr-medals">${slots}</div>
      <div class="res-rows">${rows.map(([a, v, sub], i) => `<div class="res-row" style="animation-delay:${0.3 + i * 0.08}s"><span>${a}</span><span class="res-sub">${esc(sub)}</span><b data-count="${v}">+0</b></div>`).join('')}
        <div class="res-row" style="animation-delay:${0.3 + rows.length * 0.08}s"><span>🔧 Schaden</span><span class="res-sub">${fmt(Math.ceil(extra.durability ?? r.durability))} / ${fmt(extra.durabilityMax)} übrig</span><b class="neg">−${fmt(r.damageTaken)}</b></div></div>
      ${knapp}${miss}${tow}${twin}
      ${loot}
      <div class="btn-row">${btns}</div>`);
    if (choice) this.card.classList.add('rc-loot');
    this.bind('[data-a=next]', h.onNext);
    this.bind('[data-a=retry]', h.onRetry);
    this.bind('[data-a=land]', h.onLand);
    this.bind('[data-a=map]', h.onMap);
    this.bind('[data-a=end]', h.onEnd);
    this.bind('[data-a=skip]', h.onSkip);
    this.bind('[data-a=inv]', h.onInventory);
    this.card.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => h.onPick(Number(b.dataset.pick)); });
    // Medaillen nacheinander aufleuchten lassen, Zahlen hochzählen
    const order = [...r.medalList, ...(r.medals.platin ? ['platin', 'king'] : [])];
    const gi = order.indexOf(grade === 'miss' ? '' : grade);
    const got = gi >= 0 ? gi : (r.medal ? r.medalList.indexOf(r.medal) : -1);
    this.card.querySelectorAll('.rm-slot').forEach((e, i) => {
      if (i <= got) this.timers.push(setTimeout(() => { e.classList.add('got'); if (this.onTick) this.onTick('medal', i); }, 200 + i * 260));
    });
    this.countUp();
  }

  // Verfehlte Etappe nach einem Neustart der App: Notlandung oder Nochmal. d: { emergency, retry }
  missDecision(d, { onLand, onRetry }) {
    this.present('result', `
      <h2 class="bad">Notlandung offen</h2>
      <p class="ri-desc">Die letzte Etappe wurde verfehlt.</p>
      <div class="rr-tow">🛬 <b>Notlandung:</b> −${fmt(d.emergency.penalty)} 🔧, Trostkiste <b>+${fmt(d.emergency.bolts)} 🔩</b>, weiter auf der Karte.<br>↻ <b>Nochmal:</b> −${fmt(d.retry.penalty)} 🔧 auf einer neuen Strecke.</div>
      <div class="btn-row"><button class="btn btn-secondary" data-a="retry">↻ Nochmal</button><button class="btn btn-primary" data-a="land">Weiter ▶ <small>Notlandung</small></button></div>`);
    this.bind('[data-a=land]', onLand);
    this.bind('[data-a=retry]', onRetry);
  }

  // Zahlen mit data-count hochzählen
  countUp(prefix = '+') {
    const els = [...this.card.querySelectorAll('[data-count]')];
    const start = performance.now();
    const RC = FX.resultCount;
    const total = els.reduce((s, e) => s + Number(e.dataset.count), 0);
    const dur = Math.min(RC.max, RC.base + total * RC.perScrap);
    const tick = (now) => {
      if (!this.open) return;
      const k = Math.min(1, (now - start) / dur);
      const e3 = 1 - Math.pow(1 - k, 3);
      for (const e of els) e.textContent = `${prefix}${fmt(Number(e.dataset.count) * e3)}`;
      if (k < 1) { if (this.onTick && Math.random() < 0.4) this.onTick('money'); requestAnimationFrame(tick); }
    };
    requestAnimationFrame(tick);
  }

  // ---------- Item-Auswahl ----------
  // choice: { context, items, skipBolts }, d: { inventory, parts, slots, remaining }
  itemChoice(choice, d, { onPick, onSkip, onInventory }) {
    const title = { stage: '🎁 Beute!', elite: '☠️ Elite-Beute!', boss: '👑 Boss-Beute!', crate: '📦 Item-Kiste!', event: '❓ Fundstück', treasure: '💰 Schatz' }[choice.context] || '🎁 Beute!';
    const sub = { elite: 'mindestens Selten', boss: 'Episch oder Legendär', crate: 'aus der Kiste in der Strecke', event: 'Rucksack voll – ersetzen oder ablehnen', treasure: 'Rucksack voll – ersetzen oder liegen lassen' }[choice.context] || 'Wähle ein Item';
    const cards = choice.items.length ? choiceCardsHtml(choice, d) : '<p class="ri-desc">Der Pool ist leer – nimm die Schrauben.</p>';
    this.present('choice', `
      <h2>${title}</h2>
      <div class="ri-sub">${esc(sub)}${d.remaining > 1 ? ` · noch ${d.remaining - 1} weitere Auswahl` : ''}</div>
      <button class="ch-inv" data-a="inv">🎒 ${d.inventory.length}/${d.slots} ${d.inventory.length >= d.slots ? '· voll – Nehmen ersetzt ein Item' : ''}</button>
      <div class="ch-cards">${cards}</div>
      <div class="btn-row"><button class="btn btn-secondary" data-a="skip">${choice.skipBolts ? `Überspringen: +${fmt(choice.skipBolts)} 🔩` : 'Ablehnen'} <kbd class="kbd-only">S</kbd></button></div>`);
    this.card.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => onPick(Number(b.dataset.pick)); });
    this.bind('[data-a=skip]', onSkip);
    this.bind('[data-a=inv]', onInventory);
  }

  // Voller Rucksack: Item ersetzen oder ablehnen. d: { itemId, inventory, skipBolts }
  itemReplace(d, { onReplace, onBack, onReject }) {
    const rows = d.inventory.map((e, i) => entryRowHtml(e, i, { actions: `<button class="btn btn-danger small-btn ir-rep" data-rep="${i}">Ersetzen</button>` })).join('');
    this.present('replace', `
      <h2>🎒 Rucksack voll</h2>
      <p class="ri-desc">Welches Item soll <b>${esc((itemById(d.itemId) || {}).name)}</b> Platz machen?</p>
      ${itemCardHtml(d.itemId, { cls: 'new' })}
      <h4>Ersetzen</h4>
      <div class="ch-rows">${rows}</div>
      <div class="btn-row"><button class="btn btn-secondary" data-a="back">◀ Andere Wahl</button><button class="btn btn-secondary" data-a="reject">${d.skipBolts ? `Ablehnen: +${fmt(d.skipBolts)} 🔩` : 'Ablehnen'}</button></div>`);
    this.card.querySelectorAll('[data-rep]').forEach((b) => { b.onclick = () => onReplace(Number(b.dataset.rep)); });
    this.bind('[data-a=back]', onBack);
    this.bind('[data-a=reject]', onReject);
  }

  // ---------- Tankstelle ----------
  station(options, d, { onChoose }) {
    this.present('station', `
      <div class="ri-kind" style="--c:${NODE_TYPES.station.color}">⛽ Tankstelle</div>
      <p class="ri-desc">Eine Wahl für den Rest des Runs. Haltbarkeit: ${fmt(Math.ceil(d.durability))} / ${fmt(d.durabilityMax)}</p>
      <div class="st-opts">${options.map((o, i) => `<button class="st-opt" data-choice="${o.id}"><span>${o.icon}</span><b><kbd class="kbd-only">${i + 1}</kbd> ${esc(o.name)}</b><small>${esc(o.desc)}</small></button>`).join('')}</div>`);
    this.card.querySelectorAll('[data-choice]').forEach((b) => { b.onclick = () => onChoose(b.dataset.choice); });
  }

  // ---------- Akt-Übergang ----------
  actTransition(d, { onNext }) {
    const b = biomeById(d.biome);
    const prev = biomeById(d.prevBiome);
    const traits = biomeTraits(b).map((t) => `<span class="chip">${esc(t)}</span>`).join('');
    this.present('act', `
      <div class="act-done">Akt ${d.act - 1} geschafft! ${prev ? prev.icon : ''}</div>
      <h2>Akt ${d.act}</h2>
      <div class="act-biome" style="--c:${b.palette.skyTop}">${b.icon} ${esc(b.name)}</div>
      <p class="ri-desc">${esc(b.desc)}</p>
      <div class="chips">${traits}</div>
      <div class="btn-row"><button class="btn btn-primary" data-a="next">Zur Karte ▶</button></div>`);
    this.bind('[data-a=next]', onNext);
  }

  // ---------- Run-Ende ----------
  // res: Ergebnis von endRun
  runEnd(res, { onGarage }) {
    const s = res.stats;
    const reason = { win: 'Alle drei Akte geschafft – die Kiste hat gehalten!', wreck: 'Totalschaden – die Kiste ist hinüber.', tow: 'Der Abschleppdienst hat das letzte Stück Haltbarkeit gefressen.', emergency: 'Die letzte Notlandung war eine zu viel.', giveup: 'Run aufgegeben.' }[res.reason] || '';
    const stat = [
      ['Akt erreicht', res.won ? '3 / 3 ✔' : `${res.act} / 3`],
      ['Etappen geschafft', `${s.cleared} / ${s.stages}`],
      ['Medaillen', `🥇 ${s.medals.gold}  🥈 ${s.medals.silver}  🥉 ${s.medals.bronze}`],
      ['Weiteste Etappe', `${fmt(s.bestDist)} m`],
      ['Schrauben verdient', `🔩 ${fmt(s.boltsEarned)}`],
      ['Notlandungen / Neuversuche', `${s.emergencies || 0}× / ${s.tows}×`],
      ['Saltos / Loopings', `${fmt(s.flips)} / ${fmt(s.loops)}`],
    ];
    if (res.time) stat.push(['Spielzeit des Runs', fmtPlaytime(res.time)]);
    if (res.ascension) stat.unshift(['Schrottstufe', `☠ ${res.ascension}`]);
    const unlock = res.unlockedAscension ? `<div class="ri-twin">☠ ${res.unlockedAscension === 1 ? 'Schrottstufen freigeschaltet!' : `Schrottstufe ${res.unlockedAscension} freigeschaltet!`} Wähle sie in der Garage.</div>` : '';
    const p = res.payout;
    const rows = p.rows.map((r) => {
      const v = r.scrap !== undefined ? ['⚙', r.scrap] : r.blueprints !== undefined ? ['📘', r.blueprints] : ['💠', r.cores];
      return `<div class="res-row"><span>${esc(r.label)}</span><span class="res-sub">${v[0]}</span><b data-count="${v[1]}">+0</b></div>`;
    }).join('');
    this.present('end', `
      <h2 class="${res.won ? 'good' : 'bad'}">${res.won ? '🏆 SIEG!' : 'Run vorbei'}</h2>
      <p class="ri-desc">${esc(reason)}</p>
      ${unlock}
      <div class="re-stats">${stat.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('')}</div>
      <h4>Belohnung für die Garage <small>(schon unterwegs gutgeschrieben – hier die Summe)</small></h4>
      <div class="res-rows">${rows}</div>
      <div class="res-total">⚙ <span data-count="${p.scrap}">+0</span>${p.blueprints ? ` · 📘 ${fmt(p.blueprints)}` : ''}${p.cores ? ` · 💠 ${fmt(p.cores)}` : ''}</div>
      <div class="btn-row"><button class="btn btn-primary" data-a="garage">🔧 Zur Garage</button></div>`);
    this.bind('[data-a=garage]', onGarage);
    this.countUp();
  }
}
