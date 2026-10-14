import { ORIGIN } from '../data/balance.js';

// Floating Origin: Der Render-Ursprung springt in festen Schritten (ORIGIN.shiftEvery) mit der Kamera mit.
// Alle Render-Positionen werden als (x - origin.x) gesetzt, damit die Float32-Genauigkeit der GPU
// auch nach vielen Kilometern reicht. Die Physik rechnet weiter in absoluten Koordinaten (JS-Doubles).
export class Origin {
  constructor(step = ORIGIN.shiftEvery) {
    this.step = step;
    this.x = 0;
    this.shifts = 0;
  }

  // Ursprung an die Kamera anpassen; true, wenn er gesprungen ist
  update(camX) {
    const nx = Math.round(camX / this.step) * this.step;
    if (nx === this.x) return false;
    this.x = nx;
    this.shifts++;
    return true;
  }

  reset() { this.x = 0; }

  // absolute x-Koordinate → Render-Koordinate
  rx(x) { return x - this.x; }
}
