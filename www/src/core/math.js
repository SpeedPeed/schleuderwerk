// Kleine Mathe-Helfer ohne Abhängigkeiten (laufen im Browser und in node --test).

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

// Wert auf den Bereich [a, b] begrenzen
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Lineare Interpolation von a nach b (t = 0 … 1)
export const lerp = (a, b, t) => a + (b - a) * t;

// Weicher Übergang 0 → 1 zwischen e0 und e1 (Hermite-Kurve)
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Winkel in den Bereich [-π, π) bringen
export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

// Bildrate-unabhängiges Annähern: k = Härte (1/s). Auch bei großen dt stabil.
export function approach(cur, target, k, dt) {
  return cur + (target - cur) * (1 - Math.exp(-k * dt));
}

// Abnehmender Ertrag: bei Stufe `half` ist die Hälfte von `max` erreicht, `max` nie ganz.
export function dimReturn(level, max, half) {
  if (level <= 0) return 0;
  return (max * level) / (level + half);
}

// Weiche Obergrenze: bis `cap` unverändert, darüber wächst der Wert nur noch mit der pow-ten Wurzel.
export function softcap(x, cap, pow) {
  if (x <= cap || cap <= 0) return x;
  return cap * Math.pow(x / cap, 1 / pow);
}

// Effektive Stufen mit abnehmendem Ertrag: L / (1 + L / divisor). Bei divisor 30 ist Stufe 20 ≈ 12 effektive Stufen.
export function dimLevels(level, divisor) {
  if (level <= 0) return 0;
  return level / (1 + level / divisor);
}
