import { makeRng } from '../core/rng.js';
import { PHYSICS, OBJECTS, SPAWN, RULES } from '../data/balance.js';

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

// Schrauben (Run-Währung), Boost-Ringe, Hindernisse, Schrott-Pickups und Aufwind-Säulen einer Etappe
// (zufällig pro Etappe). opts.scrapPickups: Schrott-Pickups in Bodennähe legen (Regel collectScrapMass, Mülltonne).
export class Objects {
  constructor(world, track, seed, opts = {}) {
    this.world = world;
    this.track = track;
    this.rng = makeRng(seed);
    this.bolts = [];
    this.scraps = [];
    this.scrapLeft = opts.scrapPickups || 0;
    this.scrapRng = makeRng((seed ^ 0x5c4a9e1) >>> 0);
    this.scrapX = SPAWN.startX + RULES.collectScrapMass.pickupEvery[0];
    this.rings = [];
    this.obstacles = [];
    this.thermals = [];
    this.spawnX = SPAWN.startX;
    this.thermalX = world.thermals ? world.thermals.firstX : Infinity;
    this.cleanupTimer = 0;
  }

  ground(x) { return this.track.heightAt(x); }

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

  spawnUntil(xMax) {
    const r = this.rng;
    const th = this.world.thermals;
    while (th && this.thermalX < xMax) {
      this.thermals.push({ x: this.thermalX, w: r.range(th.width[0], th.width[1]), strength: th.strength, top: th.top });
      this.thermalX += r.range(th.every[0], th.every[1]);
    }
    const S = SPAWN;
    while (this.spawnX < xMax) {
      const x = this.spawnX;
      const pick = r.weighted(this.world.spawn.weights);
      const maxAlt = Math.min(S.boltAlt.max, S.boltAlt.base + x * S.boltAlt.perM);
      if (pick === 'boltArc') this.boltArc(x, r.range(S.boltAlt.min, maxAlt));
      else if (pick === 'boltGround') this.boltGround(x);
      else if (pick === 'ring') this.ring(x, r.range(S.ringAlt.min, Math.min(S.ringAlt.max, S.ringAlt.base + x * S.ringAlt.perM)));
      else if (pick === 'obstacle') this.obstacle(x);
      else this.bolt(x, this.ground(x) + r.range(S.bigBoltAlt.min, S.bigBoltAlt.base + x * S.bigBoltAlt.perM), S.bigBoltValue, true);
      this.spawnX += r.range(this.world.spawn.gap[0], this.world.spawn.gap[1]);
    }
    // Schrott-Pickups in Bodennähe (Regel collectScrapMass): eigener Zufall, damit die übrige Strecke gleich bleibt
    const C = RULES.collectScrapMass;
    while (this.scrapLeft > 0 && this.scrapX < xMax) {
      const x = this.scrapX;
      const sr = this.scrapRng;
      this.scraps.push({ x, y: this.ground(x) + C.minAlt + sr.next() * (C.maxAlt - C.minAlt), alive: true, attract: false });
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
      this.bolt(cx, this.ground(cx) + h + Math.sin(t * Math.PI) * arc);
    }
  }

  boltGround(x) {
    const g = SPAWN.groundRow;
    const n = g.nMin + Math.floor(this.rng.next() * g.nRand);
    for (let i = 0; i < n; i++) {
      const cx = x + i * g.spacing;
      this.bolt(cx, this.ground(cx) + g.height);
    }
  }

  ring(x, h) {
    this.rings.push({ x, y: this.ground(x) + h, passed: false });
  }

  obstacle(x) {
    if (this.track.rampBetween(x - SPAWN.rampClearBefore, x + SPAWN.rampClearAfter)) { this.boltArc(x, SPAWN.rampArcAlt); return; }
    const type = this.rng.weighted(this.world.spawn.obstacles);
    const { w, h } = OBJ[type];
    const y0 = Math.min(this.ground(x - w / 2), this.ground(x), this.ground(x + w / 2));
    this.obstacles.push({ x, y0, w, h, type, alive: true, passed: false });
    // Risiko-Schrauben knapp über dem Hindernis
    const rc = SPAWN.riskBolts;
    const half = (rc.count - 1) / 2;
    for (let i = 0; i < rc.count; i++) this.bolt(x + (i - half) * rc.spacing, y0 + h + rc.above, rc.value);
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

    const sr = OBJ.scrapPickup;
    for (const c of this.scraps) {
      if (!c.alive) continue;
      if (segmentDist2(x0, y0, x1, y1, c.x, c.y) < sr * sr) {
        c.alive = false;
        ev.push({ type: 'scrapPickup', x: c.x, y: c.y });
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

    // Alte Objekte hinter dem Auto aufräumen
    this.cleanupTimer += dt;
    if (this.cleanupTimer > OBJ.cleanupEvery) {
      this.cleanupTimer = 0;
      const minX = x1 - OBJ.cleanupBehind;
      this.bolts = this.bolts.filter((c) => c.alive && c.x > minX);
      this.scraps = this.scraps.filter((c) => c.alive && c.x > minX);
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
