// Einfache Ereignis-Warteschlange (FIFO) mit Kettentiefe – Grundlage der Trigger-Engine (Phase 4).
// push() reiht ein, drain(fn) arbeitet ab (1× pro Physik-Schritt). Ereignisse, die beim Abarbeiten neu
// entstehen (z. B. Effekt „emit“), bekommen depth + 1 und werden im selben Durchgang mit abgearbeitet.
//   depth > ITEMS.maxChainDepth            → verworfen (gegen Endlosketten)
//   mehr als ITEMS.maxEventsPerFlush je drain → Rest wird verworfen
// Reine Logik ohne three.js und DOM.
import { ITEMS } from '../data/balance.js';

export class EventQueue {
  constructor(limits = ITEMS) {
    this.limits = limits;
    this.items = [];
    this.head = 0;
    this.dropped = 0;      // verworfene Ereignisse (Kettentiefe oder Limit) – für Tests und Dev-Menü
    this.processed = 0;
  }

  get length() { return this.items.length - this.head; }

  // Ereignis einreihen. Ergebnis: false, wenn es wegen der Kettentiefe verworfen wurde.
  push(name, data = {}, depth = 0) {
    if (depth > this.limits.maxChainDepth) { this.dropped++; return false; }
    this.items.push({ name, data, depth });
    return true;
  }

  // Alle Ereignisse an fn(name, data, depth) geben – auch solche, die fn selbst neu einreiht.
  drain(fn) {
    let n = 0;
    while (this.head < this.items.length) {
      const e = this.items[this.head++];
      if (n >= this.limits.maxEventsPerFlush) { this.dropped++; continue; }
      n++;
      this.processed++;
      fn(e.name, e.data, e.depth);
    }
    this.items.length = 0;
    this.head = 0;
    return n;
  }

  clear() { this.items.length = 0; this.head = 0; }
}
