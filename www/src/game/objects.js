import { mulberry32, range } from './rng.js';
import { PHYSICS } from '../config/balance.js';

export const OBJ = {
  coinPickup: 1.4,
  ringRadius: 3.0,
  tires: { w: 1.9, h: 2.1 },
  scrap: { w: 3.0, h: 4.6 },
  cactus: { w: 1.6, h: 3.8 },
  pillar: { w: 3.2, h: 6.0 },
};

function pickWeighted(rng, weights) {
  const keys = Object.keys(weights);
  let roll = rng() * keys.reduce((a, k) => a + weights[k], 0);
  return keys.find((k) => (roll -= weights[k]) < 0) || keys[0];
}

// Münzen, Boost-Ringe und Hindernisse eines Runs (zufällig pro Run).
export class Objects {
  constructor(world, terrain, seed) {
    this.world = world;
    this.terrain = terrain;
    this.rng = mulberry32(seed);
    this.coins = [];
    this.rings = [];
    this.obstacles = [];
    this.thermals = [];
    this.spawnX = 30;
    this.thermalX = world.thermals ? world.thermals.firstX : Infinity;
    this.cleanupTimer = 0;
  }

  ground(x) { return this.terrain.heightAt(x); }

  // Aufwind an Position x in Höhe alt über dem Boden (m/s²)
  thermalAt(x, alt) {
    for (const t of this.thermals) {
      const d = Math.abs(x - t.x);
      if (d < t.w / 2) {
        const edge = 1 - Math.pow(d / (t.w / 2), 4);           // am Rand weicher
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
      this.thermals.push({ x: this.thermalX, w: range(r, th.width[0], th.width[1]), strength: th.strength, top: th.top });
      this.thermalX += range(r, th.every[0], th.every[1]);
    }
    while (this.spawnX < xMax) {
      const x = this.spawnX;
      const pick = pickWeighted(r, this.world.spawn.weights);
      const maxAlt = Math.min(70, 10 + x * 0.03);
      if (pick === 'coinArc') this.coinArc(x, range(r, 3, maxAlt));
      else if (pick === 'coinGround') this.coinGround(x);
      else if (pick === 'ring') this.ring(x, range(r, 6, Math.min(45, 8 + x * 0.02)));
      else if (pick === 'obstacle') this.obstacle(x);
      else this.coin(x, this.ground(x) + range(r, 20, 30 + x * 0.05), 5, true);
      this.spawnX += range(r, this.world.spawn.gap[0], this.world.spawn.gap[1]);
    }
  }

  coin(x, y, v = 1, big = false) {
    this.coins.push({ x, y, v, big, alive: true, attract: false });
  }

  coinArc(x, h) {
    const r = this.rng;
    const n = 5 + Math.floor(r() * 5);
    const arc = range(r, 2, 6);
    for (let i = 0; i < n; i++) {
      const cx = x + i * 2.2;
      const t = i / (n - 1);
      this.coin(cx, this.ground(cx) + h + Math.sin(t * Math.PI) * arc);
    }
  }

  coinGround(x) {
    const n = 6 + Math.floor(this.rng() * 5);
    for (let i = 0; i < n; i++) {
      const cx = x + i * 2.2;
      this.coin(cx, this.ground(cx) + 1.1);
    }
  }

  ring(x, h) {
    this.rings.push({ x, y: this.ground(x) + h, passed: false });
  }

  obstacle(x) {
    if (this.terrain.rampBetween(x - 10, x + 14)) { this.coinArc(x, 4); return; }
    const type = pickWeighted(this.rng, this.world.spawn.obstacles);
    const { w, h } = OBJ[type];
    const y0 = Math.min(this.ground(x - w / 2), this.ground(x), this.ground(x + w / 2));
    this.obstacles.push({ x, y0, w, h, type, alive: true, passed: false });
    // Risiko-Münzen knapp über dem Hindernis
    for (let i = -1; i <= 1; i++) this.coin(x + i * 2.2, y0 + h + 1.5, 2);
  }

  // Prüft Kontakte mit dem Auto und meldet Ereignisse.
  collide(car, stats, dt, ev) {
    const pr = OBJ.coinPickup;
    const mr = stats.magnet;
    const speed = car.speed;
    for (const c of this.coins) {
      if (!c.alive) continue;
      let dx = car.x - c.x, dy = car.y - c.y;
      const d2 = dx * dx + dy * dy;
      const rr = c.big ? pr * 1.5 : pr;
      if (d2 < rr * rr) {
        c.alive = false;
        ev.push({ type: 'coin', v: c.v, x: c.x, y: c.y, big: c.big });
        continue;
      }
      if (d2 < mr * mr) c.attract = true;
      if (c.attract) {
        const d = Math.sqrt(d2);
        const step = Math.min(d, (25 + speed) * dt);
        c.x += (dx / d) * step;
        c.y += (dy / d) * step;
      }
    }

    for (const r of this.rings) {
      if (r.passed) continue;
      if (Math.abs(car.x - r.x) < 1.2 + speed * dt && Math.abs(car.y - r.y) < OBJ.ringRadius - 0.4) {
        r.passed = true;
        ev.push({ type: 'ring', x: r.x, y: r.y });
      }
    }

    const cr = PHYSICS.carRadius;
    for (const o of this.obstacles) {
      if (!o.alive) continue;
      const nx = Math.max(o.x - o.w / 2, Math.min(car.x, o.x + o.w / 2));
      const ny = Math.max(o.y0, Math.min(car.y, o.y0 + o.h));
      const dx = car.x - nx, dy = car.y - ny;
      if (dx * dx + dy * dy < cr * cr) {
        o.alive = false;
        ev.push({ type: 'hit', x: o.x, y: o.y0 + o.h / 2, obstacle: o });
        continue;
      }
      if (!o.passed && car.x > o.x + o.w / 2) {
        o.passed = true;
        const clearance = car.y - cr - (o.y0 + o.h);
        if (!car.onGround && clearance < 2.2) ev.push({ type: 'nearMiss', x: o.x, y: o.y0 + o.h });
      }
    }

    // Alte Objekte hinter dem Auto aufräumen
    this.cleanupTimer += dt;
    if (this.cleanupTimer > 0.5) {
      this.cleanupTimer = 0;
      const minX = car.x - 80;
      this.coins = this.coins.filter((c) => c.alive && c.x > minX);
      this.rings = this.rings.filter((r) => r.x > minX);
      this.obstacles = this.obstacles.filter((o) => o.x > minX);
      this.thermals = this.thermals.filter((t) => t.x + t.w > minX);
    }
  }
}
