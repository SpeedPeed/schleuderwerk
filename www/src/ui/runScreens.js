import { el, fmt, show, icon, cur } from './dom.js';
import { mutatorById } from '../data/mutators.js';
import { NODE_TYPES } from '../data/nodes.js';
import { biomeById, bossById, FEATURE_INFO } from '../data/biomes.js';
import { FX, RUN, REWARDS } from '../data/balance.js';
import { ascensionSummary, fmtPlaytime } from '../garage/progression.js';
import { choiceCardsHtml, entryRowHtml, itemCardHtml } from './items.js';
import { itemById } from '../data/items.js';
import { TXT, NARRATOR, pickLine } from '../data/texts.js';
import { inkOn } from './dom.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Medaillen als Sprite-Icons (Paket B: gestempelt statt Emoji)
const MEDAL = { bronze: { icon: 'bronze', name: 'Bronze' }, silver: { icon: 'silber', name: 'Silber' }, gold: { icon: 'gold', name: 'Gold' }, platin: { icon: 'platin', name: 'Platin' }, king: { icon: 'krone', name: 'Schrottkönig' } };
export const GRADE_NAME = { miss: 'verfehlt', bronze: 'Bronze', silver: 'Silber', gold: 'Gold', platin: 'Platin', king: 'Schrottkönig' };
const pctTxt = (x) => `${Math.round(x * 100)} %`;
// Welche Währung fliegt beim Hochzählen zur Zeile (Kombo/Akt-Bonus = Schrott, Kisten fliegen nicht)
const FLY_IC = { schrott: 'schrott', schraube: 'schraube', blaupause: 'blaupause', kern: 'kern', stern: 'schraube', etappe: 'schrott' };
const T = TXT.result;
// Opa Gerds Randnotiz (Handschrift, mit Mütze)
const opaNote = (text) => `<div class="opa">${icon('opa')}<span>${esc(text)} – ${NARRATOR}</span></div>`;
// Schild-Überschrift einer Knotenart (Lack-Ton der Knotenart, passende Schriftfarbe)
const kindSign = (def, label) => `<div class="ri-kind" style="--c:${def.color};--fg:${inkOn(def.color)}">${icon(def.iconId || 'etappe')} ${esc(label)}</div>`;

// Biom-Besonderheiten als kurze Texte (Etappen-Intro, Akt-Übergang)
export function biomeTraits(b) {
  const t = [];
  if (b.physics.ambientHeat) t.push(`+${b.physics.ambientHeat} Hitze/s`);
  if (b.physics.landTolAdd) t.push(`nasser Boden: Landetoleranz ${b.physics.landTolAdd}°`);
  for (const [tag, v] of Object.entries(b.tagBoost || {})) t.push(`${tag[0].toUpperCase()}${tag.slice(1)}-Items +${Math.round(v * 100)} %`);
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
// Paket B: als Karteikarte mit Kreppband (style.css → .stage-banner).
// d: { spec, node, attempts, durability, durabilityMax, ascension, towPct, firstBoss, twin, back }
export function introBannerHtml(d) {
  const s = d.spec;
  const b = biomeById(s.biome);
  const def = NODE_TYPES[s.kind] || NODE_TYPES.stage;
  const title = s.kind === 'boss' ? s.bossName : def.name;
  const sub = s.kind === 'boss' ? `Boss-Strecke · ${b.name}` : `Etage ${s.floor + 1} · ${b.name}`;
  const boss = s.kind === 'boss' ? bossById(s.bossId) || {} : null;
  const bossDesc = boss ? boss.intro || boss.desc : '';
  const medals = s.medalList.map((m) => `<span class="ri-medal m-${m}">${icon(MEDAL[m].icon)} ${fmt(s.medals[m])} m${s.kind === 'boss' && m === 'gold' ? ' <small>Bonus</small>' : ''}</span>`).join('');
  const hz = s.hazards.map((h) => FEATURE_INFO[h]).filter(Boolean)
    .map((f) => `<span class="chip ${f.danger ? 'danger' : ''}">${f.icon} ${f.name}</span>`).join('') || '<span class="chip">keine Besonderheiten</span>';
  const traits = biomeTraits(b).map((t) => `<span class="chip">${esc(t)}</span>`).join('');
  const tired = s.kind === 'boss' && d.attempts > 0 ? ` · Boss müde: Ziel −${Math.round(RUN.bossRetry.targetCut * Math.min(RUN.bossRetry.maxCuts, d.attempts) * 100)} %` : '';
  const retry = d.attempts > 0 ? `<div class="ri-retry">Neuversuch ${d.attempts + 1} – neue Strecke${tired}</div>` : '';
  // Boss: Tipps und Belohnung (Episch/Legendär-Auswahl, Blaupausen, Kerne beim ersten Sieg in Akt 2/3)
  let bossHtml = '';
  if (boss) {
    const act = s.act || b.act;
    const rw = [`${icon('krone')} Episch/Legendär-Auswahl`, cur('blaupause', REWARDS.blueprints.boss[act] || 0), `${icon('schrott')} Akt-Bonus ${fmt(REWARDS.actScrap[act] || 0)}`];
    if (d.firstBoss && REWARDS.firstBossCores[act]) rw.push(`${cur('kern', REWARDS.firstBossCores[act])} (erster Sieg)`);
    if (act >= RUN.acts && !d.twin) rw.push(`${cur('kern', REWARDS.winCores)} Run-Sieg`);
    bossHtml = (d.twin ? `<div class="ri-twin">${icon('elite')} Doppelter Ärger – der Zwillingsboss!</div>` : '')
      + (boss.tips && boss.tips.length ? `<ul class="ri-tips">${boss.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '')
      + `<h4>Belohnung</h4><div class="chips">${rw.map((t) => `<span class="chip good">${t}</span>`).join('')}</div>`;
  }
  const mut = mutatorById(s.mutator);
  const mutHtml = mut ? `<div class="ri-mut">${icon(mut.iconId)}<div><b>${esc(mut.name)}</b><span>${esc(mut.desc)}</span></div></div>` : '';
  const asc = d.ascension > 0 ? `<h4>${icon('elite')} Schrottstufe ${d.ascension}</h4><div class="chips">${ascensionSummary(d.ascension).map((t) => `<span class="chip danger">${esc(t)}</span>`).join('')}</div>` : '';
  return `
    <div class="ri-head">${kindSign(def, title)}<div class="ri-sub">${esc(sub)}</div></div>
    ${bossDesc ? `<p class="ri-desc">${esc(bossDesc)}</p>` : ''}
    ${mutHtml}
    ${bossHtml}
    <div class="ri-goal"><div class="ri-target"><small>ZIEL</small><b>${fmt(s.target)} m</b></div><div class="ri-medals">${medals}</div></div>
    ${retry}
    <div class="chips">${hz}<span class="chip">${esc(weatherText(s.weather))}</span>${traits}</div>
    ${asc}
    <div class="ri-dur">${icon('schluessel')} Haltbarkeit ${fmt(Math.ceil(d.durability))} / ${fmt(d.durabilityMax)}</div>
    <div class="ri-go"><span class="touch-only">Finger halten = Kraft laden</span><span class="kbd-only"><b>Leertaste halten</b> = Kraft laden</span>${d.back ? ` · <button class="btn btn-secondary small-btn" data-a="back">${icon('karte')} ${T.map}</button>` : ''}</div>`;
}

// Alle Run-Bildschirme außer der Karte in EINEM Overlay (#runui): Etappen-Intro, Ergebnis (Medaillen/Abschleppen),
// Item-Auswahl, Tankstelle, Akt-Übergang, Run-Ende. Die Sonderknoten (Händler, Werkbank, Schwarzmarkt, Ereignis,
// Schatz) zeichnet ui/shops.js in dasselbe Overlay. Jede Methode bekommt ihre Rückrufe direkt.
// Paket B: Das Overlay ist ein Klemmbrett (schiebt sich in 180 ms herein); Ergebnisse stehen auf einem Prüfprotokoll
// (Papier), Medaillen und Überschrift werden gestempelt, Zahlen rattern als Zählwerk hoch, Items sind Karteikarten.
export class RunScreens {
  // onTick(kind, i): 'medal' (Stempel i), 'money' (Zählwerk rattert); onFly(fromEl, toEl, iconId): Währung fliegt
  constructor(root, { onTick, onFly } = {}) {
    this.el = el('<div id="runui" class="overlay hidden"><div class="card run-card" data-id="card"></div></div>');
    root.appendChild(this.el);
    this.card = this.el.querySelector('[data-id=card]');
    this.onTick = onTick;
    this.onFly = onFly;
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
    const same = keep && this.open && this.kind === kind;
    const top = same ? this.card.scrollTop : 0;
    this.hide();
    this.kind = kind;
    this.card.className = `card run-card rc-${kind}${same ? ' redraw' : ''}`;
    this.card.innerHTML = html;
    this.card.scrollTop = top;
    show(this.el, true);
  }

  bind(sel, fn) { const b = this.card.querySelector(sel); if (b) b.onclick = fn; return b; }

  // ---------- Etappen-Intro (Paket A: Banner über der Zielansicht, siehe introBannerHtml) ----------
  // d: { spec, node, biome, attempts, durability, durabilityMax, ascension, towPct, firstBoss, twin }
  intro(d, { onGo, onBack }) {
    this.present('intro', `<div class="sheet-paper">${introBannerHtml({ ...d, back: false })}</div>
      <div class="btn-row"><button class="btn btn-secondary" data-a="back">${icon('karte')} ${T.map}</button><button class="btn btn-primary" data-a="go">LOS ${icon('weiter')}</button></div>`);
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
    const title = o.defeat ? (r.reason === 'wreck' ? T.wreck : T.over)
      : o.cleared ? (grade === 'king' ? T.king : grade === 'platin' ? T.platin : r.kind === 'boss' ? T.boss : T.cleared)
        : o.missed ? (r.reason === 'fall' ? T.missedFall : T.missed)
          : r.reason === 'fall' ? T.fallFail : T.fail;
    const why = T.why[r.reason] || '';
    const ff = r.instant ? ' · vorgespult' : '';
    const slot = (m, i, bonus) => `<div class="rm-slot m-${m}${bonus ? ' bonus' : ''}" data-medal="${m}" style="--i:${i}"><span>${icon(MEDAL[m].icon)}</span><small>${fmt(r.medals[m])} m</small></div>`;
    const slots = r.medalList.map((m, i) => slot(m, i, false))
      + (r.medals.platin ? ['platin', 'king'].map((m, i) => slot(m, r.medalList.length + i, !(grade === m || (m === 'platin' && grade === 'king')))).join('') : '');
    const rw = o.rewards || { bolts: 0, scrap: 0, blueprints: 0, base: {}, combo: { bolts: 0, scrap: 0 } };
    const cr = o.credited || null;
    const rows = [];
    rows.push(['schrott', 'Schrott', rw.scrap, `${fmt(r.dist)} m · ${GRADE_NAME[grade]}${cr ? ' · gutgeschrieben' : ''}`]);
    rows.push(['schraube', 'Schrauben', rw.bolts, rw.base.bolts ? `davon ${fmt(r.bolts)} gesammelt` : 'gesammelt']);
    if (rw.combo && (rw.combo.bolts || rw.combo.scrap)) rows.push(['stern', 'Kombo', rw.combo.bolts, `${fmt(r.tricks)} Trickpunkte → +${fmt(rw.combo.bolts)} Schrauben · +${fmt(rw.combo.scrap)} Schrott (im Schrott enthalten)`]);
    if (rw.blueprints) rows.push(['blaupause', 'Blaupausen', rw.blueprints, cr ? 'gutgeschrieben' : '']);
    if (o.cores) rows.push(['kern', 'Kerne', o.cores, 'erster Sieg über diesen Boss']);
    if (o.actBonus) rows.push(['etappe', 'Akt-Bonus', o.actBonus, 'Schrott']);
    if (r.crates && o.cleared) rows.push(['kiste', 'Item-Kisten', r.crates, 'je Kiste eine Item-Auswahl']);
    const knapp = r.knapp ? `<div class="rr-tow">Knapp: <b>${r.knapp} %</b> der Zielmarke – hochgerechnet</div>` : '';
    const tow = o.towed ? `<div class="rr-tow">${icon('schluessel')} Abschleppen: <b>−${fmt(o.towPenalty)}</b> Haltbarkeit (${pctTxt(extra.towPct ?? RUN.towPenalty)} der max. Haltbarkeit)${o.defeat ? '' : o.bossReroll ? ` – Neuversuch gegen <b>${esc(o.bossReroll.icon)} ${esc(o.bossReroll.name)}</b>, Ziel −${Math.round((1 - o.bossReroll.targetMul) * 100)} % („Der Boss ist auch müde“)` : ' – danach Neuversuch'}</div>` : '';
    const miss = o.missed ? `<div class="rr-tow"><b>Notlanden:</b> −${fmt(o.emergency.penalty)} ${icon('schluessel')} (${pctTxt(o.emergency.pct)}), Trostkiste <b>+${fmt(o.emergency.bolts)}</b> ${icon('schraube')}, weiter auf der Karte.<br><b>Nochmal:</b> −${fmt(o.retry.penalty)} ${icon('schluessel')} (${pctTxt(o.retry.pct)}) auf einer <b>neuen</b> Strecke.</div>` : '';
    const twin = o.secondBoss ? `<div class="ri-twin">${icon('elite')} Doppelter Ärger! Gleich danach: ${esc(o.secondBoss.icon)} ${esc(o.secondBoss.name)}</div>` : '';
    let btns;
    if (o.defeat) btns = `<button class="btn btn-primary" data-a="end">${T.end} ${icon('weiter')}</button>`;
    else if (o.missed) btns = `<button class="btn btn-secondary" data-a="retry">${icon('wuerfel')} ${T.retry}</button><button class="btn btn-primary" data-a="land">${T.land} ${icon('weiter')}</button>`;
    else if (o.towed) btns = `<button class="btn btn-secondary" data-a="map">${icon('karte')} ${T.map}</button><button class="btn btn-primary" data-a="retry">${icon('wuerfel')} ${T.retryTow}</button>`;
    else if (choice) btns = `<button class="btn btn-secondary" data-a="skip">${T.skip(choice.skipBolts ? fmt(choice.skipBolts) : 0)}${choice.skipBolts ? ` ${icon('schraube')}` : ''} <kbd class="kbd-only">S</kbd></button>`;
    else btns = `<button class="btn btn-primary" data-a="next">${T.next} ${icon('weiter')}</button>`;
    let loot = '';
    if (choice && !o.defeat) {
      const d = h.info;
      const cards = choice.items.length ? choiceCardsHtml(choice, d) : `<p class="ri-desc">${T.poolEmpty}</p>`;
      const head = T.loot[choice.context] || T.loot.stage;
      loot = `<h4 class="rr-loot">${head}${d.remaining > 1 ? ` <small>· ${T.more(d.remaining - 1)}</small>` : ''}</h4>
        <button class="ch-inv" data-a="inv">${icon('rucksack')} ${d.inventory.length}/${d.slots} ${d.inventory.length >= d.slots ? `· ${T.full}` : ''}</button>
        <div class="ch-cards">${cards}</div>`;
    }
    const mood = o.defeat ? 'bad' : o.cleared ? (grade === 'gold' || grade === 'platin' || grade === 'king' ? 'top' : 'good') : o.missed ? 'miss' : 'bad';
    this.present('result', `
      <div class="sheet-paper rr-sheet">
        <h2 class="rr-title ${o.cleared ? 'good' : 'bad'}">${title}</h2>
        <div class="rr-dist"><b>${fmt(r.dist)} m</b> <small>/ Ziel ${fmt(r.target)} m · ${why}${ff}</small></div>
        <div class="rr-medals">${slots}</div>
        <div class="res-rows">${rows.map(([ic, a, v, sub], i) => `<div class="res-row" style="animation-delay:${0.3 + i * 0.08}s"><span>${icon(ic)} ${a}</span><span class="res-sub">${esc(sub)}</span><b data-count="${v}" data-ic="${FLY_IC[ic] || ''}">+0</b></div>`).join('')}
          <div class="res-row" style="animation-delay:${0.3 + rows.length * 0.08}s"><span>${icon('schluessel')} Schaden</span><span class="res-sub">${fmt(Math.ceil(extra.durability ?? r.durability))} / ${fmt(extra.durabilityMax)} übrig</span><b class="neg">−${fmt(r.damageTaken)}</b></div></div>
        ${opaNote(pickLine(T.quips[mood], `${r.dist}:${grade}`))}
      </div>
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
    // Medaillen nacheinander stempeln, Zahlen hochzählen
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
      <div class="sheet-paper"><h2 class="rr-title bad">${T.missed}</h2>
      <p class="ri-desc">Die letzte Etappe wurde verfehlt.</p></div>
      <div class="rr-tow"><b>Notlanden:</b> −${fmt(d.emergency.penalty)} ${icon('schluessel')}, Trostkiste <b>+${fmt(d.emergency.bolts)}</b> ${icon('schraube')}, weiter auf der Karte.<br><b>Nochmal:</b> −${fmt(d.retry.penalty)} ${icon('schluessel')} auf einer neuen Strecke.</div>
      <div class="btn-row"><button class="btn btn-secondary" data-a="retry">${icon('wuerfel')} ${T.retry}</button><button class="btn btn-primary" data-a="land">${T.land} ${icon('weiter')}</button></div>`);
    this.bind('[data-a=land]', onLand);
    this.bind('[data-a=retry]', onRetry);
  }

  // Zahlen mit data-count hochzählen (Zählwerk); vorher fliegt je Zeile die Währung vom Ergebnis zum Zähler
  countUp(prefix = '+') {
    const els = [...this.card.querySelectorAll('[data-count]')];
    if (this.onFly) {
      const from = this.card.querySelector('.rr-dist, .end-stamp, h2');
      els.forEach((e, i) => { if (Number(e.dataset.count) > 0 && e.dataset.ic) this.timers.push(setTimeout(() => this.onFly(from, e, e.dataset.ic), 250 + i * 110)); });
    }
    const start = performance.now();
    const RC = FX.resultCount;
    const total = els.reduce((s, e) => s + Number(e.dataset.count), 0);
    const dur = Math.min(RC.max, RC.base + total * RC.perScrap);
    let lastTick = 0;
    const tick = (now) => {
      if (!this.open) return;
      const k = Math.min(1, (now - start) / dur);
      const e3 = 1 - Math.pow(1 - k, 3);
      for (const e of els) e.textContent = `${prefix}${fmt(Number(e.dataset.count) * e3)}`;
      if (k < 1) {
        // Ratsche: gleichmäßig ~14 Klicks/s statt zufällig
        if (this.onTick && now - lastTick > 70) { lastTick = now; this.onTick('money'); }
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  }

  // ---------- Item-Auswahl ----------
  // choice: { context, items, skipBolts }, d: { inventory, parts, slots, remaining }
  itemChoice(choice, d, { onPick, onSkip, onInventory }) {
    const title = T.loot[choice.context] || T.loot.stage;
    const sub = T.lootSub[choice.context] || T.lootSub.stage;
    const cards = choice.items.length ? choiceCardsHtml(choice, d) : `<p class="ri-desc">${T.poolEmpty}</p>`;
    const head = title.split(/[!–.]/)[0].trim();
    this.present('choice', `
      <h2>${icon({ boss: 'krone', elite: 'elite', crate: 'kiste', blueprint: 'blaupause' }[choice.context] || 'stern', 'ic-lg')} ${esc(head)}!</h2>
      <div class="ri-sub">${esc(sub)}${d.remaining > 1 ? ` · ${T.more(d.remaining - 1)}` : ''}</div>
      <button class="ch-inv" data-a="inv">${icon('rucksack')} ${d.inventory.length}/${d.slots} ${d.inventory.length >= d.slots ? `· ${T.full}` : ''}</button>
      <div class="ch-cards">${cards}</div>
      ${choice.context === 'blueprint' ? '' : `<div class="btn-row"><button class="btn btn-secondary" data-a="skip">${T.skip(choice.skipBolts ? fmt(choice.skipBolts) : 0)}${choice.skipBolts ? ` ${icon('schraube')}` : ''} <kbd class="kbd-only">S</kbd></button></div>`}`);
    this.card.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => onPick(Number(b.dataset.pick)); });
    this.bind('[data-a=skip]', onSkip);
    this.bind('[data-a=inv]', onInventory);
  }

  // Voller Rucksack: Item ersetzen oder ablehnen. d: { itemId, inventory, skipBolts }
  itemReplace(d, { onReplace, onBack, onReject }) {
    const S = TXT.shop;
    const rows = d.inventory.map((e, i) => entryRowHtml(e, i, { actions: `<button class="btn btn-danger small-btn ir-rep" data-rep="${i}">${S.replace}</button>` })).join('');
    this.present('replace', `
      <h2>${icon('rucksack', 'ic-lg')} ${S.bagFull}</h2>
      <p class="ri-desc">${S.makeRoom(esc((itemById(d.itemId) || {}).name))}</p>
      ${itemCardHtml(d.itemId, { cls: 'new' })}
      <h4>${S.replace}</h4>
      <div class="ch-rows">${rows}</div>
      <div class="btn-row"><button class="btn btn-secondary" data-a="back">${icon('zurueck')} ${S.otherChoice}</button><button class="btn btn-secondary" data-a="reject">${d.skipBolts ? `Ablehnen: +${fmt(d.skipBolts)} ${icon('schraube')}` : 'Ablehnen'}</button></div>`);
    this.card.querySelectorAll('[data-rep]').forEach((b) => { b.onclick = () => onReplace(Number(b.dataset.rep)); });
    this.bind('[data-a=back]', onBack);
    this.bind('[data-a=reject]', onReject);
  }

  // ---------- Tankstelle ----------
  station(options, d, { onChoose }) {
    const def = NODE_TYPES.station;
    const S = TXT.shop.station;
    this.present('station', `
      <div class="sign"><span class="sign-plate" style="--c:${def.color};--fg:${inkOn(def.color)}">${icon(def.iconId)} ${S.sign}</span></div>
      <p class="ri-sub">${esc(S.sub(fmt(Math.ceil(d.durability)), fmt(d.durabilityMax)))}</p>
      <div class="st-opts">${options.map((o, i) => `<button class="st-opt" data-choice="${o.id}"><span>${o.icon}</span><b><kbd class="kbd-only">${i + 1}</kbd> ${esc(o.name)}</b><small>${esc(o.desc)}</small></button>`).join('')}</div>`);
    this.card.querySelectorAll('[data-choice]').forEach((b) => { b.onclick = () => onChoose(b.dataset.choice); });
  }

  // ---------- Akt-Übergang ----------
  actTransition(d, { onNext }) {
    const b = biomeById(d.biome);
    const traits = biomeTraits(b).map((t) => `<span class="chip">${esc(t)}</span>`).join('');
    const A = TXT.act;
    this.present('act', `
      <div class="act-done">${A.done(d.act - 1)}</div>
      <h2>${A.title(d.act)}</h2>
      <div class="act-biome"><span class="sign-plate" style="--c:${b.palette.skyTop};--fg:${inkOn(b.palette.skyTop)}">${b.iconId ? icon(b.iconId) : b.icon} ${esc(b.name)}</span></div>
      <div class="sheet-paper"><p class="ri-desc">${esc(b.desc)}</p>
      ${traits ? `<div class="chips">${traits}</div>` : ''}</div>
      <div class="btn-row"><button class="btn btn-primary" data-a="next">${A.go} ${icon('weiter')}</button></div>`);
    this.bind('[data-a=next]', onNext);
  }

  // ---------- Run-Ende ----------
  // res: Ergebnis von endRun
  runEnd(res, { onGarage }) {
    const s = res.stats;
    const E = TXT.end;
    const reason = E.reason[res.reason] || '';
    const stat = [
      ['Akt erreicht', res.won ? `3 / 3 ${icon('haken')}` : `${res.act} / 3`],
      ['Etappen geschafft', `${s.cleared} / ${s.stages}`],
      ['Medaillen', `${cur('gold', s.medals.gold)} ${cur('silber', s.medals.silver)} ${cur('bronze', s.medals.bronze)}`],
      ['Weiteste Etappe', `${fmt(s.bestDist)} m`],
      ['Schrauben verdient', cur('schraube', fmt(s.boltsEarned))],
      ['Notlandungen / Neuversuche', `${s.emergencies || 0}× / ${s.tows}×`],
      ['Saltos / Loopings', `${fmt(s.flips)} / ${fmt(s.loops)}`],
    ];
    if (res.time) stat.push(['Spielzeit des Runs', fmtPlaytime(res.time)]);
    if (res.ascension) stat.unshift(['Schrottstufe', `${icon('elite')} ${res.ascension}`]);
    const unlock = res.unlockedAscension ? `<div class="ri-twin">${icon('elite')} ${res.unlockedAscension === 1 ? 'Schrottstufen freigeschaltet!' : `Schrottstufe ${res.unlockedAscension} freigeschaltet!`} Wähle sie in der Garage.</div>` : '';
    const p = res.payout;
    const rows = p.rows.map((r) => {
      const v = r.scrap !== undefined ? ['schrott', r.scrap] : r.blueprints !== undefined ? ['blaupause', r.blueprints] : ['kern', r.cores];
      return `<div class="res-row"><span>${esc(r.label)}</span><span class="res-sub">${icon(v[0])}</span><b data-count="${v[1]}" data-ic="${v[0]}">+0</b></div>`;
    }).join('');
    this.present('end', `
      <div class="sheet-paper">
        <div class="end-stamp ${res.won ? 'good' : ''}">${res.won ? E.win : E.lose}</div>
        <p class="ri-desc">${esc(reason)}</p>
        ${unlock}
        <div class="re-stats">${stat.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('')}</div>
        ${opaNote((res.won ? E.quipWin : E.quipLose).replace(/ – Opa Gerd$/, ''))}
      </div>
      <h4>Belohnung für die Garage <small>(schon unterwegs gutgeschrieben – hier die Summe)</small></h4>
      <div class="sheet-paper"><div class="res-rows">${rows}</div>
      <div class="res-total">${icon('schrott')} <span data-count="${p.scrap}">+0</span>${p.blueprints ? ` · ${cur('blaupause', fmt(p.blueprints))}` : ''}${p.cores ? ` · ${cur('kern', fmt(p.cores))}` : ''}</div></div>
      <div class="btn-row"><button class="btn btn-primary" data-a="garage">${icon('garage')} ${E.garage}</button></div>`);
    this.bind('[data-a=garage]', onGarage);
    this.countUp();
  }
}
