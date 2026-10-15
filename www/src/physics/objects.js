import { makeRng } from '../core/rng.js';
import { PHYSICS, OBJECTS, SPAWN, RULES, FEATURES, PICKUPS, TESTDRIVE } from '../data/balance.js';

// Hitbox-Größen (auch für die Darstellung)
export const OBJ = OBJECTS;

// Strecke (x0, y0) → (x1, y1) gegen achsenparallele Box.
// Ergebnis: Eintritts-Parameter t ∈ [0, 1] (0 = Start liegt schon drin) oder -1 = kein Treffer.
export function segmentBox(x0, y0, x1, y1, minX, minY, maxX, maxY) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  if (dx === 0) {
    if (x0 < minX || x0 > maxX) return -1;
  } else {
    let a = (minX - x0) / dx, b = (maxX - x0) / dx;
    if (a > b) { const t = a; a = b; b = t; }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return -1;
  }
  if (dy === 0) {
    if (y0 < minY || y0 > maxY) return -1;
  } else {
    let a = (minY - y0) / dy, b = (maxY - y0) / dy;
    if (a > b) { const t = a; a = b; b = t; }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return -1;
  }
  return t0;
}

// Kleinster quadrierter Abstand des Punkts (cx, cy) zur Strecke (x0, y0) → (x1, y1)
export function segmentDist2(x0, y0, x1, y1, cx, cy) {
  const dx = x1 - x0, dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((cx - x0) * dx + (cy - y0) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = x0 + dx * t - cx, py = y0 + dy * t - cy;
  return px * px + py * py;
}

// Höhe des Pressblocks über dem Boden (0 = zu, crusher.openY = offen) zur Zeit t
export function crusherLift(c, t) {
  const C = FEATURES.crusher;
  const m = 0.1;                                  // Anteil Ab- bzw. Aufbewegung
  const closed = Math.max(0, 1 - c.open - 2 * m);
  let u = (t / c.period + c.phase) % 1;
  if (u < 0) u += 1;
  if (u < c.open) return C.openY;
  u -= c.open;
  if (u < m) return C.openY * (1 - u / m);
  u -= m;
  if (u < closed) return 0;
  u -= closed;
  return C.openY * Math.min(1, u / m);
}

// Alles, was auf der Strecke liegt oder passiert: Schrauben (Run-Währung), Pickups (Kanister, Kühlpack,
// Reparaturset, Schrott, Item-Kiste, Blaupause), Boost-Ringe, Hindernisse (Reifen, Schrottberge …),
// Schrottpressen, Aufwind-Säulen, Wind-/Hitze-/Blitz-/Magnetzonen.
// Die Bausteine kommen aus der StageSpec der Strecke (track.spec), dazwischen wird zufällig verteilt.
// opts.scrapPickups: zusätzliche Schrott-Häufchen in Bodennähe (Regel collectScrapMass, Mülltonne).
// Kompatibel: biome darf ein schlichtes Objekt mit spawn/thermals sein (Tests).
export class Objects {
  constructor(biome, track, seed, opts = {}) {
    this.biome = biome || {};
    this.track = track;
    this.spec = opts.spec || track.spec || null;
    this.rng = makeRng(seed);
    this.bolts = [];
    this.pickups = [];
    this.rings = [];
    this.obstacles = [];
    this.thermals = [];
    this.crushers = [];
    this.winds = [];
    this.heats = [];
    this.lightning = [];   // Blitzzonen
    this.strikes = [];     // angekündigte/aktive Einschläge { x, y, t (Rest-Warnzeit), flash, hit }
    this.magnets = [];     // Magnetkräne { x0, x1, phase, hx, hy }
    this.time = 0;
    this.scrapLeft = opts.scrapPickups || 0;
    this.scrapRng = makeRng((seed ^ 0x5c4a9e1) >>> 0);
    this.scrapX = SPAWN.startX + RULES.collectScrapMass.pickupEvery[0];
    this.spawnX = SPAWN.startX;
    this.cleanupTimer = 0;
    this.pickupWeights = this.biome.pickups || { fuel: 1 };
    const sp = this.biome.spawn || {};
    this.spawnWeights = sp.weights || {};
    this.spawnGap = sp.gap || [20, 30];
    this.obstacleTypes = sp.obstacles || {};
    if (this.spec) this.setupFeatures(this.spec);
  }

  ground(x) { return this.track.heightAt(x); }

  // Bodenhöhe ohne Schlucht-Einschnitt (zum Platzieren)
  refGround(x) { return this.track.refHeightAt ? this.track.refHeightAt(x) : this.track.heightAt(x); }

  // Baustein an x, der keine zufälligen Hindernisse/Bodenreihen verträgt
  blocked(x) {
    const f = this.track.featureAt ? this.track.featureAt(x) : null;
    return !!f && (f.type === 'gap' || f.type === 'loop' || f.type === 'crusher' || f.type === 'scrapPile' || f.type === 'ramp' || f.type === 'magnetZone');
  }

  // ---------- Bausteine aus der StageSpec ----------
  setupFeatures(spec) {
    const r = makeRng((spec.seed ^ 0x2f6e2b1) >>> 0);
    for (const f of this.track.features || spec.features) {
      switch (f.type) {
        case 'scrapPile':
          for (const p of f.piles) this.addObstacle(p.x, 'scrap', p.w, p.h);
          break;
        case 'crusher': {
          const y0 = this.ground(f.cx);
          this.crushers.push({ x: f.cx, y0, w: f.w, period: f.period, open: f.open, phase: f.phase, lift: FEATURES.crusher.openY, cd: 0 });
          // Mutprobe: Schrauben unter der Presse
          for (let i = -1; i <= 1; i++) this.bolt(f.cx + i * 1.4, y0 + 1.2, 2);
          break;
        }
        case 'thermal':
          this.thermals.push({ x: f.x, w: f.w, strength: f.strength, top: f.top });
          break;
        case 'wind':
          this.winds.push({ x0: f.x0, x1: f.x1, wind: f.wind, gust: f.gust, phase: f.phase });
          break;
        case 'heatZone':
          this.heats.push({ x0: f.x0, x1: f.x1, heat: f.heat });
          break;
        case 'lightning': {
          const zr = makeRng(f.seed >>> 0);
          this.lightning.push({ x0: f.x0, x1: f.x1, rng: zr, t: zr.range(0.2, 0.8) });
          break;
        }
        case 'magnetZone':
          this.magnets.push({ x0: f.x0, x1: f.x1, phase: f.phase, hx: (f.x0 + f.x1) / 2, hy: this.ground((f.x0 + f.x1) / 2) + FEATURES.magnet.height });
          break;
        case 'loop': {
          // Schrauben auf dem oberen Bogen des Loopings (nur wer durchfährt, bekommt sie)
          const cy = f.yr + PHYSICS.rideHeight + f.r;
          const n = FEATURES.loop.bolts;
          for (let i = 0; i < n; i++) {
            const a = -Math.PI / 4 + (i / (n - 1)) * (Math.PI * 1.5);
            this.bolt(f.lx + f.r * Math.cos(a), cy + f.r * Math.sin(a), 1);
          }
          break;
        }
        case 'gap': {
          // Schraubenbogen über der Schlucht
          const n = Math.max(3, Math.round((f.far - f.edge) / 3));
          const top = f.yr + f.h + 2.5 + r.range(0, 2);
          for (let i = 0; i <= n; i++) {
            const t = i / n;
            this.bolt(f.edge + (f.far - f.edge) * t, top + Math.sin(t * Math.PI) * 3);
          }
          break;
        }
        default:
          break;
      }
    }
    if (spec.blueprintX) this.addPickup(spec.blueprintX, this.refGround(spec.blueprintX) + 4, 'blueprint', 1);
  }

  addObstacle(x, type, w = OBJ[type].w, h = OBJ[type].h) {
    const y0 = Math.min(this.ground(x - w / 2), this.ground(x), this.ground(x + w / 2));
    this.obstacles.push({ x, y0, w, h, type, alive: true, passed: false });
    // Risiko-Schrauben knapp über dem Hindernis
    const rc = SPAWN.riskBolts;
    const half = (rc.count - 1) / 2;
    for (let i = 0; i < rc.count; i++) this.bolt(x + (i - half) * rc.spacing, y0 + h + rc.above, rc.value);
  }

  addPickup(x, y, kind, value = 1) {
    this.pickups.push({ x, y, kind, value, alive: true, attract: false });
  }

  // ---------- Zonen ----------
  // Aufwind an Position x in Höhe alt über dem Boden (m/s²)
  thermalAt(x, alt) {
    for (const t of this.thermals) {
      const d = Math.abs(x - t.x);
      if (d < t.w / 2) {
        const edge = 1 - Math.pow(d / (t.w / 2), OBJ.thermalEdgePow); // am Rand weicher
        const fade = alt < t.top ? 1 : Math.max(0, 1 - (alt - t.top) / t.top);
        return t.strength * edge * fade;
      }
    }
    return 0;
  }

  // Zusätzlicher Wind (m/s, + = Rückenwind) einer Windzone an x
  windAt(x) {
    for (const w of this.winds) {
      if (x >= w.x0 && x <= w.x1) {
        const edge = Math.min(1, (x - w.x0) / 10, (w.x1 - x) / 10);
        return (w.wind + w.gust * Math.sin(this.time * FEATURES.wind.gustFreq * Math.PI * 2 + w.phase)) * edge;
      }
    }
    return 0;
  }

  // Zusätzliche Umgebungshitze (pro s) eines Hitzefelds an x
  heatAt(x) {
    for (const h of this.heats) if (x >= h.x0 && x <= h.x1) return h.heat;
    return 0;
  }

  // Zug des Magnetkrans auf das Fahrzeug (m/s²) → out.ax, out.ay
  magnetPull(x, y, out) {
    out.ax = 0; out.ay = 0;
    const M = FEATURES.magnet;
    for (const m of this.magnets) {
      if (x < m.x0 - M.radius || x > m.x1 + M.radius) continue;
      const dx = m.hx - x, dy = m.hy - y;
      const d = Math.hypot(dx, dy);
      if (d < M.radius && d > 0.3) {
        const a = M.pull * (1 - d / M.radius);
        out.ax += (a * dx) / d;
        out.ay += (a * dy) / d;
      }
    }
    return out;
  }

  // Zeitabhängige Gefahren (1× pro Physik-Schritt): Pressen, Magnet-Pendel, Blitze (1 s Warnung, dann Einschlag)
  update(dt, car, ev) {
    this.time += dt;
    const t = this.time;
    for (const c of this.crushers) {
      c.lift = crusherLift(c, t);
      if (c.cd > 0) c.cd -= dt;
    }
    const M = FEATURES.magnet;
    for (const m of this.magnets) {
      const u = 0.5 + 0.5 * Math.sin(t * M.swing * Math.PI * 2 + m.phase * Math.PI * 2);
      m.hx = m.x0 + (m.x1 - m.x0) * u;
      m.hy = this.ground(m.hx) + M.height;
    }
    const L = FEATURES.lightning;
    for (const z of this.lightning) {
      if (car.x < z.x0 - 6 || car.x > z.x1) continue;
      z.t -= dt;
      if (z.t <= 0) {
        z.t = z.rng.range(L.every[0], L.every[1]);
        const lead = z.rng.range(L.lead[0], L.lead[1]);
        const sx = Math.max(z.x0, Math.min(z.x1, car.x + car.vx * L.warn * lead));
        this.strikes.push({ x: sx, y: this.refGround(sx), t: L.warn, flash: 0, hit: false });
        ev.push({ type: 'lightningWarn', x: sx });
      }
    }
    for (const s of this.strikes) {
      if (s.t > 0) {
        s.t -= dt;
        if (s.t <= 0) {
          s.flash = L.show;
          ev.push({ type: 'lightning', x: s.x, y: s.y });
          if (Math.abs(car.x - s.x) < L.radius) {
            s.hit = true;
            ev.push({ type: 'shock', source: 'lightning', x: car.x, y: car.y });
          }
        }
      } else if (s.flash > 0) s.flash -= dt;
    }
    if (this.strikes.length && this.strikes[0].t <= 0 && this.strikes[0].flash <= 0) {
      this.strikes = this.strikes.filter((s) => s.t > 0 || s.flash > 0);
    }
  }

  // ---------- zufällige Verteilung ----------
  spawnUntil(xMax) {
    const r = this.rng;
    const S = SPAWN;
    while (this.spawnX < xMax) {
      const x = this.spawnX;
      const pick = r.weighted(this.spawnWeights);
      const maxAlt = Math.min(S.boltAlt.max, S.boltAlt.base + x * S.boltAlt.perM);
      if (pick === 'boltArc') this.boltArc(x, r.range(S.boltAlt.min, maxAlt));
      else if (pick === 'boltGround') this.boltGround(x);
      else if (pick === 'ring') this.ring(x, r.range(S.ringAlt.min, Math.min(S.ringAlt.max, S.ringAlt.base + x * S.ringAlt.perM)));
      else if (pick === 'obstacle') this.obstacle(x);
      else if (pick === 'pickup') this.randomPickup(x);
      else if (pick === 'bigBolt') this.bolt(x, this.refGround(x) + r.range(S.bigBoltAlt.min, S.bigBoltAlt.base + x * S.bigBoltAlt.perM), S.bigBoltValue, true);
      this.spawnX += r.range(this.spawnGap[0], this.spawnGap[1]);
    }
    // Schrott-Häufchen in Bodennähe (Regel collectScrapMass): eigener Zufall, damit die übrige Strecke gleich bleibt
    const C = RULES.collectScrapMass;
    while (this.scrapLeft > 0 && this.scrapX < xMax) {
      const x = this.scrapX;
      const sr = this.scrapRng;
      this.addPickup(x, this.refGround(x) + C.minAlt + sr.next() * (C.maxAlt - C.minAlt), 'scrap', TESTDRIVE.scrapPickupValue);
      this.scrapLeft--;
      this.scrapX += sr.range(C.pickupEvery[0], C.pickupEvery[1]);
    }
  }

  bolt(x, y, v = 1, big = false) {
    this.bolts.push({ x, y, v, big, alive: true, attract: false });
  }

  boltArc(x, h) {
    const a = SPAWN.arc;
    const n = a.nMin + Math.floor(this.rng.next() * a.nRand);
    const arc = this.rng.range(a.bumpMin, a.bumpMax);
    for (let i = 0; i < n; i++) {
      const cx = x + i * a.spacing;
      const t = i / (n - 1);
      this.bolt(cx, this.refGround(cx) + h + Math.sin(t * Math.PI) * arc);
    }
  }

  boltGround(x) {
    if (this.blocked(x)) { this.boltArc(x, SPAWN.rampArcAlt); return; }
    const g = SPAWN.groundRow;
    const n = g.nMin + Math.floor(this.rng.next() * g.nRand);
    for (let i = 0; i < n; i++) {
      const cx = x + i * g.spacing;
      this.bolt(cx, this.refGround(cx) + g.height);
    }
  }

  ring(x, h) {
    this.rings.push({ x, y: this.refGround(x) + h, passed: false });
  }

  randomPickup(x) {
    const kind = this.rng.weighted(this.pickupWeights);
    const A = PICKUPS.altitude;
    this.addPickup(x, this.refGround(x) + this.rng.range(A[0], A[1]), kind, kind === 'scrap' ? PICKUPS.scrap : 1);
  }

  obstacle(x) {
    const types = this.obstacleTypes;
    if (!Object.keys(types).length || x < FEATURES.firstFree || this.blocked(x - SPAWN.rampClearBefore) || this.blocked(x) || this.blocked(x + SPAWN.rampClearAfter)
      || (this.track.rampBetween && this.track.rampBetween(x - SPAWN.rampClearBefore, x + SPAWN.rampClearAfter))) {
      this.boltArc(x, SPAWN.rampArcAlt);
      return;
    }
    this.addObstacle(x, this.rng.weighted(types));
  }

  // Prüft die im letzten Teilschritt zurückgelegte Strecke (x0, y0) → (car.x, car.y) – „swept“,
  // damit auch bei hohem Tempo nichts durchtunnelt wird – und meldet Ereignisse in `ev`.
  collide(car, x0, y0, dt, ev) {
    const x1 = car.x, y1 = car.y;
    const cr = PHYSICS.carRadius;
    const pr = OBJ.boltPickup;
    const mr = car.magnetRadius ?? car.stats.magnet;
    const speed = car.speed;

    for (const c of this.bolts) {
      if (!c.alive) continue;
      const rr = c.big ? pr * OBJ.bigBoltPickupMul : pr;
      if (segmentDist2(x0, y0, x1, y1, c.x, c.y) < rr * rr) {
        c.alive = false;
        ev.push({ type: 'bolt', v: c.v, x: c.x, y: c.y, big: c.big });
        continue;
      }
      this.attract(c, x1, y1, mr, speed, dt);
    }

    const kr = PICKUPS.radius;
    for (const c of this.pickups) {
      if (!c.alive) continue;
      if (segmentDist2(x0, y0, x1, y1, c.x, c.y) < kr * kr) {
        c.alive = false;
        ev.push({ type: 'pickup', kind: c.kind, value: c.value, x: c.x, y: c.y });
        continue;
      }
      this.attract(c, x1, y1, mr, speed, dt);
    }

    // Ringe: senkrechtes Fenster, um den Autoradius verbreitert
    const rh = OBJ.ringRadius - OBJ.ringInset;
    for (const r of this.rings) {
      if (r.passed) continue;
      if (segmentBox(x0, y0, x1, y1, r.x - cr, r.y - rh, r.x + cr, r.y + rh) >= 0) {
        r.passed = true;
        ev.push({ type: 'ring', x: r.x, y: r.y });
      }
    }

    // Hindernisse: Box um den Autoradius vergrößert
    for (const o of this.obstacles) {
      if (!o.alive) continue;
      const hw = o.w / 2 + cr;
      if (segmentBox(x0, y0, x1, y1, o.x - hw, o.y0 - cr, o.x + hw, o.y0 + o.h + cr) >= 0) {
        o.alive = false;
        ev.push({ type: 'hit', x: o.x, y: o.y0 + o.h / 2, obstacle: o });
        continue;
      }
      if (!o.passed && x1 > o.x + o.w / 2) {
        o.passed = true;
        const clearance = y1 - cr - (o.y0 + o.h);
        if (!car.onGround && clearance < OBJ.nearMissClearance) ev.push({ type: 'nearMiss', x: o.x, y: o.y0 + o.h });
      }
    }

    // Schrottpressen: der Block (zwischen lift und lift + blockH über dem Boden) ist das Hindernis
    const C = FEATURES.crusher;
    for (const c of this.crushers) {
      if (c.cd > 0) continue;
      const hw = c.w / 2 + cr * 0.6;
      const by = c.y0 + c.lift;
      if (segmentBox(x0, y0, x1, y1, c.x - hw, by - cr * 0.6, c.x + hw, by + C.blockH + cr * 0.6) >= 0) {
        c.cd = C.cooldown;
        ev.push({ type: 'hit', x: c.x, y: by + C.blockH / 2, obstacle: { type: 'crusher', crusher: c } });
      }
    }

    // Alte Objekte hinter dem Auto aufräumen
    this.cleanupTimer += dt;
    if (this.cleanupTimer > OBJ.cleanupEvery) {
      this.cleanupTimer = 0;
      const minX = x1 - OBJ.cleanupBehind;
      this.bolts = this.bolts.filter((c) => c.alive && c.x > minX);
      this.pickups = this.pickups.filter((c) => c.alive && c.x > minX);
      this.rings = this.rings.filter((r) => r.x > minX);
      this.obstacles = this.obstacles.filter((o) => o.x > minX);
      this.thermals = this.thermals.filter((t) => t.x + t.w > minX);
    }
  }

  // Einsammelbares im Magnetradius fliegt zum Auto
  attract(c, x1, y1, mr, speed, dt) {
    const dx = x1 - c.x, dy = y1 - c.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < mr * mr) c.attract = true;
    if (c.attract && d2 > 0) {
      const d = Math.sqrt(d2);
      const step = Math.min(d, (OBJ.magnetSpeed + speed) * dt);
      c.x += (dx / d) * step;
      c.y += (dy / d) * step;
    }
  }
}

