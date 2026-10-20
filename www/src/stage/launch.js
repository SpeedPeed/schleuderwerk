import { LAUNCH, BASE_STATS } from '../data/balance.js';
import { clamp, DEG, TAU } from '../core/math.js';

// Abschuss-Minispiel (reine Logik, ohne DOM):
// Halten → Kraft pendelt automatisch 0 → 1 → 0 (LAUNCH.chargePeriod), senkrechtes Ziehen ändert den Winkel,
// Loslassen feuert (ab LAUNCH.minPower). Liegt die Kraft in der grünen Zone (Sweet Spot) → perfekter Abschuss.
// Die Breite der grünen Zone ist der Stat sweetSpotWidth.
export class Launch {
  constructor(rng, stats = BASE_STATS) {
    // Feste Position der grünen Zone für diesen Abschuss
    this.sweet = rng.range(LAUNCH.sweetMin, LAUNCH.sweetMax);
    this.width = stats.sweetSpotWidth ?? BASE_STATS.sweetSpotWidth;
    this.angle = LAUNCH.angleDefault * DEG;
    this.power = 0;
    this.t = 0;
    this.charging = false;
    this.armed = false;   // erst nach einmal Loslassen scharf (kein Fehlstart durch alten Finger)
    this.fired = false;
    this.perfect = false;
    this.overdrive = false;
  }

  get sweetLo() { return this.sweet - this.width / 2; }
  get sweetHi() { return this.sweet + this.width / 2; }
  get inSweetSpot() { return Math.abs(this.power - this.sweet) <= this.width / 2; }
  // Paket F: Überdruck-Zone ganz oben (rot)
  get inOverdrive() { return this.power >= LAUNCH.overdrive.from && !this.inSweetSpot; }

  // ctl: { hold: bool, dAngle: Winkeländerung in rad }
  // Ergebnis: 'fire' (abgeschossen), 'cancel' (zu schwach losgelassen) oder null
  update(dt, ctl) {
    if (this.fired) return null;
    if (ctl.dAngle) this.angle = clamp(this.angle + ctl.dAngle, LAUNCH.angleMin * DEG, LAUNCH.angleMax * DEG);
    if (!ctl.hold) {
      this.armed = true;
      if (!this.charging) return null;
      this.charging = false;
      if (this.power >= LAUNCH.minPower) {
        this.fired = true;
        this.perfect = this.inSweetSpot;
        this.overdrive = this.inOverdrive;
        return 'fire';
      }
      this.power = 0;
      return 'cancel';
    }
    if (!this.charging) {
      if (!this.armed) return null;
      this.charging = true;
      this.t = 0;
    } else {
      this.t += dt;
    }
    this.power = 0.5 - 0.5 * Math.cos((this.t / LAUNCH.chargePeriod) * TAU);
    return null;
  }
}
