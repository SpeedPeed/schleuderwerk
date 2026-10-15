import * as THREE from 'three';
import { part, merge, flatMat } from './models.js';
import { PHYSICS, RULES, RENDER } from '../data/balance.js';
import { chassisById, chassisVisual } from '../data/index.js';

// Fahrzeug-Modelle aus Grundformen: 9 Chassis + sichtbare Teile je Slot + kleiner Fahrer mit Helm.
// Koordinaten: x = vorwärts, y = oben, z = zur Kamera. Ursprung = Fahrzeugmitte (Physik). Das Modell wird mit
// RENDER.vehicleScale vergrößert; gebaut wird so, dass die Radunterkante danach bei -PHYSICS.rideHeight liegt.
// Alle statischen Teile werden zu EINER Geometrie zusammengeführt (1 Draw Call),
// Räder (Drehung), Propeller/Turbinen (Drehung) und die Schrott-Ladung der Mülltonne sind eigene Meshes.
//
// buildVehicle({ chassisId, parts: { slot: partId }, visual? }) → THREE.Group mit userData:
//   upper (Gruppe des Aufbaus ohne Räder), top (Oberkante über der Mitte, m), axleHalf (halber Radstand, m),
//   wheels[], spinners[{ mesh, speed }], exhaust {x, y} (Flammen-/Rauch-Austritt), rear (Abstand Mitte → Heck),
//   setScrap(n) (Mülltonne), dispose()

const SCALE = RENDER.vehicleScale;
const GROUND = -PHYSICS.rideHeight / SCALE;   // Radunterkante in Modell-Koordinaten (vor der Skalierung)
const PI = Math.PI;

// ---------- Räder (Größe, Breite, Bauart je Rad-Teil) ----------
const WHEEL_SPECS = {
  wheels_bobbycar: { r: 0.32, w: 0.26, kind: 'bobby' },
  wheels_traktorreifen: { r: 0.56, w: 0.44, kind: 'tractor' },
  wheels_gummibaelle: { r: 0.4, w: 0.8, kind: 'ball' },
  wheels_kugellager: { r: 0.3, w: 0.2, kind: 'bearing' },
};
const DEFAULT_WHEEL = { r: 0.38, w: 0.3, kind: 'plain' };
const BALL_COLORS = ['#e8413a', '#2f7fe0', '#f2c230', '#3fae4a'];

export function wheelSpec(partId) { return WHEEL_SPECS[partId] || DEFAULT_WHEEL; }

// Geometrie eines Rades (Achse entlang z, Mitte im Ursprung); i = Radnummer (für bunte Bälle)
function wheelGeometry(spec, i) {
  const { r, w } = spec;
  const P = [];
  const disc = (c, rr, len, z = 0, shape = 'cyl10') => P.push(part(shape, c, { z, rx: PI / 2, sx: rr, sz: rr, sy: len }));
  switch (spec.kind) {
    case 'bobby':
      disc('#e23b3b', r, w);
      disc('#f4f4f4', r * 0.5, w + 0.04);
      disc('#d0d0d0', r * 0.18, w + 0.08, 0, 'cyl6');
      break;
    case 'tractor':
      disc('#232327', r * 0.86, w);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * PI * 2;
        // Stollen ragen höchstens bis zum Radius r (sonst stecken sie beim Rollen im Boden)
        P.push(part('box', '#2c2c31', { x: Math.cos(a) * (r - 0.1), y: Math.sin(a) * (r - 0.1), sx: 0.16, sy: 0.12, sz: w, rz: a + 0.5 }));
      }
      disc('#f2c230', r * 0.5, w + 0.04);
      disc('#c9a020', r * 0.2, w + 0.1, 0, 'cyl6');
      break;
    case 'ball': {
      const c = BALL_COLORS[i % BALL_COLORS.length];
      P.push(part('ico1', c, { s: r * 1.02 }, 0.12));   // feinerer Polyeder: rollt ohne zu hüpfen
      P.push(part('box', '#ffffff', { sx: r * 2.02, sy: 0.06, sz: r * 0.5 }));
      break;
    }
    case 'bearing':
      disc('#c9cdd2', r, w);
      disc('#7d848c', r * 0.72, w + 0.02);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * PI * 2;
        P.push(part('ico', '#eef1f4', { x: Math.cos(a) * r * 0.55, y: Math.sin(a) * r * 0.55, z: w / 2, s: 0.06 }));
        P.push(part('ico', '#eef1f4', { x: Math.cos(a) * r * 0.55, y: Math.sin(a) * r * 0.55, z: -w / 2, s: 0.06 }));
      }
      disc('#9aa4ae', r * 0.25, w + 0.06, 0, 'cyl6');
      break;
    default:
      disc('#26262b', r, w);
      disc('#c9c9c9', r * 0.5, w + 0.02, 0, 'cyl6');
  }
  return merge(P);
}

// ---------- Hilfen ----------
// Kurzschreibweisen für Teile-Listen
function maker(P) {
  return {
    box: (c, o, j = 0) => P.push(part('box', c, o, j)),
    cyl: (c, o, j = 0, n = 'cyl10') => P.push(part(n, c, o, j)),
    ico: (c, o, j = 0) => P.push(part('ico', c, o, j)),
    cone: (c, o, j = 0, n = 'cone7') => P.push(part(n, c, o, j)),
    // Scheibe mit Achse entlang z (Gesicht zur Kamera)
    disc: (c, x, y, z, r, t, n = 'cyl10') => P.push(part(n, c, { x, y, z, rx: PI / 2, sx: r, sz: r, sy: t })),
    // Zylinder mit Achse entlang x
    tubeX: (c, x, y, z, r, len, n = 'cyl10', j = 0) => P.push(part(n, c, { x, y, z, rz: PI / 2, sx: r, sz: r, sy: len }, j)),
    // dünner Stab von (x0,y0) nach (x1,y1) in Ebene z
    rod: (c, x0, y0, x1, y1, z, t = 0.04) => {
      const dx = x1 - x0, dy = y1 - y0;
      P.push(part('box', c, { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z, sx: Math.hypot(dx, dy), sy: t, sz: t, rz: Math.atan2(dy, dx) }));
    },
    // dünner Stab entlang z
    rodZ: (c, x, y, z0, z1, t = 0.04) => P.push(part('box', c, { x, y, z: (z0 + z1) / 2, sx: t, sy: t, sz: Math.abs(z1 - z0) })),
  };
}

// Lenkrad vor dem Fahrer
function steeringWheel(m, x, y) {
  m.cyl('#2a2a30', { x, y, rz: 1.15, sx: 0.24, sz: 0.24, sy: 0.05 });
  m.cyl('#5a5a62', { x: x - 0.01, y, rz: 1.15, sx: 0.07, sz: 0.07, sy: 0.08 }, 0, 'cyl6');
  m.rod('#3a3a40', x + 0.05, y - 0.05, x + 0.35, y - 0.35, 0, 0.05);
}

// ---------- Fahrer (sitzt mit der Hüfte bei x, y; schaut nach +x) ----------
function driver(m, x, y, helmet = '#ffd23f') {
  const suit = '#2f6fd0', skin = '#f1c191';
  m.box(suit, { x: x + 0.27, y: y + 0.05, sx: 0.5, sy: 0.18, sz: 0.36 });            // Beine
  m.box(suit, { x: x - 0.02, y: y + 0.32, sx: 0.36, sy: 0.52, sz: 0.42 });           // Oberkörper
  for (const z of [0.23, -0.23]) m.box(suit, { x: x + 0.2, y: y + 0.42, z, sx: 0.44, sy: 0.12, sz: 0.12, rz: -0.35 }); // Arme
  m.box('#e8553d', { x: x - 0.12, y: y + 0.6, sx: 0.3, sy: 0.08, sz: 0.44 });         // Halstuch
  m.ico(skin, { x: x + 0.03, y: y + 0.74, s: 0.19 });                                 // Kopf
  m.ico(helmet, { x: x - 0.01, y: y + 0.81, s: 0.235, sy: 0.2 }, 0.08);               // Helm
  m.box('#1d2633', { x: x + 0.17, y: y + 0.76, sx: 0.08, sy: 0.12, sz: 0.3 });        // Visier
  m.box('#ffffff', { x: x - 0.01, y: y + 0.98, sx: 0.36, sy: 0.04, sz: 0.06 });       // Helmstreifen
}

// ---------- Chassis ----------
// Jede Bauform bekommt k = { b (Unterkante Aufbau), axle (Radmitte y), r (Radius), color, accent }
// und liefert Ankerpunkte: wheels [[x, z]], seat [x, y], rear [x, y] (Antrieb), tail [x, y] (Heck oben),
// roof [x, y] (über dem Fahrer), deck (y der tragenden Fläche unter roof – dort stehen Stützen von Dach-Teilen),
// side {x0, x1, y0, y1, z} (Panzerung), tank [x, y, z] (Unterkante auf einer Fläche), front [x, y] (Kühlung, an
// einer senkrechten Stirnfläche), nose [x, y] (Gadget, auf einer Fläche), vent [x, y, z] (optional: Stelle der
// Seitenwand für Lüftungsschlitze, von der Kamera sichtbar), scrapAt [x, y] (Mülltonne), helmet (Helmfarbe)
const CHASSIS_BUILDERS = {
  seifenkiste(m, k) {
    const { b, color: c, accent: a } = k;
    const dark = '#9a6128';
    m.box(c, { y: b + 0.3, sx: 2.6, sy: 0.5, sz: 1.1 }, 0.12);
    m.box(c, { x: 1.42, y: b + 0.22, sx: 0.5, sy: 0.36, sz: 1.04, rz: -0.35 }, 0.12);
    for (const z of [0.56, -0.56]) {
      m.box(dark, { y: b + 0.18, z, sx: 2.5, sy: 0.03, sz: 0.02 });
      m.box(dark, { y: b + 0.4, z, sx: 2.5, sy: 0.03, sz: 0.02 });
      m.disc('#f4f1ea', 0.15, b + 0.3, z * 1.02, 0.2, 0.03);
      m.disc(a, 0.15, b + 0.3, z * 1.05, 0.11, 0.03);
    }
    m.box(a, { y: b + 0.57, sx: 2.62, sy: 0.07, sz: 1.14 });
    m.box(c, { x: -1.24, y: b + 0.78, sx: 0.08, sy: 0.5, sz: 1.0 }, 0.1);
    for (const x of [0.95, -0.95]) m.rodZ('#3a3a40', x, k.axle, -0.62, 0.62, 0.07);
    steeringWheel(m, 0.1, b + 0.95);   // in Reichweite der Hände
    return {
      wheels: [[0.95, 0.62], [0.95, -0.62], [-0.95, 0.62], [-0.95, -0.62]],
      seat: [-0.45, b + 0.42], rear: [-1.3, b + 0.3], tail: [-1.25, b + 1.03], roof: [-0.4, b + 1.5], deck: b + 0.6,
      side: { x0: -1.0, x1: 1.0, y0: b + 0.08, y1: b + 0.52, z: 0.56 }, tank: [-1.0, b + 0.6, 0.0],
      front: [1.68, b + 0.25], nose: [1.05, b + 0.6], vent: [1.12, b + 0.3, 0.55], helmet: '#ffd23f',
    };
  },

  badewanne(m, k) {
    const { b, color: c, accent: a } = k;
    m.box(c, { y: b + 0.48, sx: 2.3, sy: 0.75, sz: 1.2 }, 0.04);
    for (const x of [1.15, -1.15]) m.cyl(c, { x, y: b + 0.5, rx: PI / 2, sx: 0.4, sz: 0.4, sy: 1.2 }, 0.04, 'cyl10');
    m.box(c, { y: b + 0.88, sx: 2.95, sy: 0.08, sz: 1.3 }, 0.03);
    m.box('#9fd6ea', { y: b + 0.9, sx: 2.5, sy: 0.02, sz: 1.04 });
    for (const [x, z] of [[0.95, 0.42], [0.95, -0.42], [-0.95, 0.42], [-0.95, -0.42]]) {
      m.ico(a, { x, y: b + 0.02, z, s: 0.16, sy: 0.12 }, 0.1);
      m.cone(a, { x: x + 0.08, y: b - 0.08, z, s: 0.08, sy: 0.14, rz: PI }, 0, 'cone5');
    }
    m.cyl('#c9cdd2', { x: -1.25, y: b + 1.05, sx: 0.06, sz: 0.06, sy: 0.3 }, 0, 'cyl6');
    m.box('#c9cdd2', { x: -1.1, y: b + 1.18, sx: 0.32, sy: 0.07, sz: 0.08 });
    m.box('#c9cdd2', { x: -1.25, y: b + 1.2, z: 0.12, sx: 0.08, sy: 0.05, sz: 0.2 });
    m.box('#c9cdd2', { x: -1.25, y: b + 1.2, z: -0.12, sx: 0.08, sy: 0.05, sz: 0.2 });
    m.ico('#ffd23f', { x: 0.9, y: b + 0.98, z: 0.25, s: 0.12 });   // Quietscheente
    m.box('#e8742a', { x: 1.0, y: b + 0.97, z: 0.25, sx: 0.1, sy: 0.03, sz: 0.06 });
    return {
      wheels: [[0.95, 0.68], [0.95, -0.68], [-0.95, 0.68], [-0.95, -0.68]],
      seat: [-0.1, b + 0.4], rear: [-1.55, b + 0.45], tail: [-1.4, b + 0.92], roof: [-0.1, b + 1.75], deck: b + 0.9,
      side: { x0: -0.95, x1: 0.95, y0: b + 0.15, y1: b + 0.75, z: 0.6 }, tank: [0.62, b + 0.92, -0.28],
      front: [1.55, b + 0.5], nose: [1.15, b + 0.92], vent: [1.04, b + 0.5, 0.6], helmet: '#ff8a3d',
    };
  },

  einkaufswagen(m, k) {
    const { b, color: c, accent: a } = k;
    const y0 = b + 0.35, y1 = b + 1.15, x0 = -0.95, x1 = 0.95, z = 0.55;
    for (let x = x0; x <= x1 + 1e-6; x += 0.19) for (const zz of [z, -z]) m.rod(c, x, y0, x, y1, zz, 0.035);
    for (const y of [y0, (y0 + y1) / 2, y1]) for (const zz of [z, -z]) m.rod(c, x0, y, x1, y, zz, y === y1 ? 0.06 : 0.035);
    for (let zz = -z; zz <= z + 1e-6; zz += 0.183) {
      m.rod(c, x0, y0, x0, y1, zz, 0.035);
      m.rod(c, x1, y0, x1, y1 - 0.15, zz, 0.035);
      m.rod(c, x0, y0, x1, y0, zz, 0.035);
    }
    for (const y of [y0, y1]) { m.rodZ(c, x0, y, -z, z, 0.05); m.rodZ(c, x1, y, -z, z, 0.05); }
    for (const zz of [0.48, -0.48]) {
      m.rod(c, x0, y1, x0 - 0.3, y1 + 0.28, zz, 0.05);
      m.rod(c, -0.75, y0, -0.75, b + 0.02, zz, 0.05);
      m.rod(c, 0.75, y0, 0.75, b + 0.02, zz, 0.05);
      m.rod(c, -0.95, b + 0.02, 0.95, b + 0.02, zz, 0.06);
    }
    m.box(a, { x: x0 - 0.32, y: y1 + 0.3, sx: 0.1, sy: 0.1, sz: 1.15 });
    m.box(a, { x: x0 + 0.02, y: y1 - 0.1, z: z + 0.02, sx: 0.4, sy: 0.12, sz: 0.02 });
    m.box('#f2c230', { x: x0 - 0.32, y: y1 + 0.3, z: 0.4, sx: 0.12, sy: 0.12, sz: 0.06 });   // Pfandchip
    m.box(a, { x: x0 + 0.2, y: b + 0.83, sx: 0.4, sy: 0.04, sz: 1.1 });                      // Ablage hinten im Korb (trägt den Tank)
    return {
      wheels: [[0.8, 0.5], [0.8, -0.5], [-0.8, 0.5], [-0.8, -0.5]],
      seat: [0.05, b + 0.45], rear: [-1.0, b + 0.55], tail: [-1.3, b + 1.5], roof: [0.0, b + 1.62], deck: y0,
      side: { x0: -0.9, x1: 0.9, y0: b + 0.4, y1: b + 0.9, z: 0.57 }, tank: [x0 + 0.15, b + 0.85, -0.15],
      front: [1.0, b + 0.75], nose: [x1, y1 + 0.02], helmet: '#e23b3b',
    };
  },

  rasenmaeher(m, k) {
    const { b, color: c, accent: a } = k;
    m.box(c, { y: b + 0.22, sx: 2.2, sy: 0.3, sz: 1.0 }, 0.08);
    m.box(c, { x: 0.62, y: b + 0.55, sx: 1.0, sy: 0.45, sz: 0.9, rz: -0.08 }, 0.08);
    m.box('#2a2d30', { x: 1.13, y: b + 0.5, sx: 0.04, sy: 0.3, sz: 0.7 });
    for (const z of [0.3, -0.3]) m.box('#fff4b0', { x: 1.13, y: b + 0.68, z, sx: 0.05, sy: 0.1, sz: 0.14 });
    m.box('#4a4f55', { x: 0.1, y: b - 0.04, sx: 1.4, sy: 0.12, sz: 1.1 });
    m.box('#1f2124', { x: -0.35, y: b + 0.45, sx: 0.55, sy: 0.12, sz: 0.62 });
    m.box(a, { x: -0.62, y: b + 0.75, sx: 0.1, sy: 0.5, sz: 0.58 });
    m.cyl('#3a3a40', { x: 0.85, y: b + 0.9, sx: 0.05, sz: 0.05, sy: 0.25 }, 0, 'cyl6');
    steeringWheel(m, 0.18, b + 0.98);
    m.box('#2f5f33', { x: -1.2, y: b + 0.58, sx: 0.65, sy: 0.62, sz: 0.85 }, 0.15);
    m.box('#23472a', { x: -1.2, y: b + 0.9, sx: 0.67, sy: 0.05, sz: 0.87 });
    for (const z of [0.38, -0.38]) m.rod('#8a8f96', -1.5, b + 0.5, -1.7, b + 1.3, z, 0.05);
    m.rodZ('#8a8f96', -1.7, b + 1.3, -0.42, 0.42, 0.06);
    m.box(a, { x: 0.62, y: b + 0.79, z: 0.0, sx: 0.8, sy: 0.02, sz: 0.2 });
    return {
      wheels: [[0.8, 0.6], [0.8, -0.6], [-0.85, 0.6], [-0.85, -0.6]],
      seat: [-0.35, b + 0.52], rear: [-1.55, b + 0.35], tail: [-1.2, b + 0.92], roof: [-0.35, b + 1.6], deck: b + 0.37,
      side: { x0: -0.6, x1: 1.05, y0: b + 0.08, y1: b + 0.38, z: 0.52 }, tank: [0.55, b + 0.78, -0.25],
      front: [1.15, b + 0.4], nose: [0.9, b + 0.8], vent: [0.85, b + 0.58, 0.45], helmet: '#f2c230',
    };
  },

  waschmaschine(m, k) {
    const { b, color: c, accent: a } = k;
    m.box(c, { y: b + 0.72, sx: 1.6, sy: 1.44, sz: 1.4 }, 0.03);
    m.box('#dfe4e8', { y: b + 1.36, sx: 1.62, sy: 0.18, sz: 1.42 });
    m.box(a, { x: -0.1, y: b + 1.36, z: 0.71, sx: 0.4, sy: 0.08, sz: 0.02 });
    m.disc('#5a5f66', 0.5, b + 1.36, 0.72, 0.07, 0.05);
    m.disc('#b8c0c8', 0.2, b + 0.66, 0.71, 0.47, 0.06);
    m.disc('#2c4a6e', 0.2, b + 0.66, 0.73, 0.37, 0.04);
    m.ico('#e8413a', { x: 0.28, y: b + 0.55, z: 0.72, s: 0.1, sx: 0.16 });   // eine einzelne Socke
    m.ico('#ffffff', { x: 0.1, y: b + 0.8, z: 0.72, s: 0.08 });              // Schaum
    m.ico('#ffffff', { x: 0.02, y: b + 0.74, z: 0.72, s: 0.06 });
    for (const [x, z] of [[0.62, 0.55], [0.62, -0.55], [-0.62, 0.55], [-0.62, -0.55]]) m.box('#3a3a40', { x, y: b - 0.02, z, sx: 0.14, sy: 0.08, sz: 0.14 });
    m.rod('#8a8f96', -0.8, b + 0.4, -1.0, b + 0.2, -0.3, 0.07);
    m.rod('#8a8f96', -1.0, b + 0.2, -1.2, b + 0.25, -0.3, 0.07);
    return {
      wheels: [[0.62, 0.62], [0.62, -0.62], [-0.62, 0.62], [-0.62, -0.62]],
      seat: [-0.15, b + 1.47], rear: [-0.82, b + 0.4], tail: [-0.75, b + 1.45], roof: [-0.15, b + 2.55], deck: b + 1.45,
      side: { x0: -0.78, x1: -0.3, y0: b + 0.1, y1: b + 1.2, z: 0.7 }, tank: [0.55, b + 1.47, -0.3],
      front: [0.82, b + 0.72], nose: [0.6, b + 1.45], vent: [0.72, b + 1.14, 0.7], helmet: '#3a7bd5',
    };
  },

  kuehlschrank(m, k) {
    const { b, color: c, accent: a } = k;
    m.box('#b07a42', { y: b + 0.06, sx: 2.0, sy: 0.14, sz: 1.1 }, 0.15);
    for (const x of [-0.8, 0, 0.8]) m.box('#8e6034', { x, y: b - 0.06, sx: 0.18, sy: 0.12, sz: 1.1 });
    m.box(c, { x: -0.1, y: b + 1.03, sx: 1.2, sy: 1.8, sz: 1.1 }, 0.03);
    m.box('#9aa4ae', { x: -0.1, y: b + 1.36, z: 0.56, sx: 1.2, sy: 0.03, sz: 0.02 });
    m.box('#c9cdd2', { x: 0.36, y: b + 0.85, z: 0.58, sx: 0.06, sy: 0.5, sz: 0.06 });
    m.box('#c9cdd2', { x: 0.36, y: b + 1.62, z: 0.58, sx: 0.06, sy: 0.25, sz: 0.06 });
    const mags = [['#e8413a', -0.4, 1.0], ['#f2c230', -0.15, 0.7], ['#3fae4a', 0.1, 1.15], [a, -0.35, 1.6], ['#2f7fe0', 0.05, 1.7]];
    for (const [col, x, y] of mags) m.box(col, { x, y: b + y, z: 0.57, sx: 0.12, sy: 0.12, sz: 0.04, rz: x * 2 });
    m.box('#fffbe8', { x: -0.15, y: b + 0.95, z: 0.565, sx: 0.32, sy: 0.4, sz: 0.01, rz: 0.08 });  // Einkaufszettel
    m.box('#5a5f66', { x: -0.1, y: b + 1.95, sx: 1.2, sy: 0.04, sz: 1.12 });
    return {
      wheels: [[0.75, 0.62], [0.75, -0.62], [-0.75, 0.62], [-0.75, -0.62]],
      seat: [-0.2, b + 2.0], rear: [-1.0, b + 0.3], tail: [-0.65, b + 1.97], roof: [-0.2, b + 3.0], deck: b + 1.97,
      // Panzerung auf der Tür-/Rückwand (nicht auf der Palette), Kühlung oben an der Stirnseite (über dem Tank)
      side: { x0: -0.62, x1: 0.28, y0: b + 0.2, y1: b + 1.2, z: 0.56 }, tank: [0.75, b + 0.13, 0.25],
      front: [0.52, b + 1.25], nose: [0.4, b + 1.97], vent: [0.4, b + 0.32, 0.56], helmet: '#5fb7d9',
    };
  },

  raketenschlitten(m, k) {
    const { b, color: c, accent: a } = k;
    const sk = GROUND + 0.05;
    for (const z of [0.5, -0.5]) {
      m.box('#9aa4ae', { y: sk, z, sx: 2.6, sy: 0.06, sz: 0.08 });
      m.box('#9aa4ae', { x: 1.42, y: sk + 0.13, z, sx: 0.38, sy: 0.06, sz: 0.08, rz: 0.75 });
      m.cyl('#9aa4ae', { x: 1.56, y: sk + 0.3, z, rx: PI / 2, sx: 0.08, sz: 0.08, sy: 0.08 }, 0, 'cyl6');
      for (const x of [-0.9, 0, 0.9]) m.rod('#7d848c', x, sk, x, b + 0.14, z, 0.05);
    }
    for (let i = 0; i < 6; i++) m.box('#b07a42', { x: -1.05 + i * 0.42, y: b + 0.2, sx: 0.34, sy: 0.08, sz: 1.12 }, 0.15);
    // Rakete hinter dem Fahrer
    m.tubeX(c, -0.55, b + 0.6, 0, 0.3, 1.5, 'cyl10', 0.05);
    m.tubeX(a, -0.25, b + 0.6, 0, 0.31, 0.16);
    m.tubeX(a, -0.85, b + 0.6, 0, 0.31, 0.16);
    m.cone(a, { x: 0.38, y: b + 0.6, rz: -PI / 2, sx: 0.3, sz: 0.3, sy: 0.38 });
    for (const [y, z] of [[0.3, 0], [0, 0.3], [0, -0.3]]) m.box(c, { x: -1.15, y: b + 0.6 + y, z, sx: 0.4, sy: y ? 0.3 : 0.06, sz: z ? 0.3 : 0.06 });
    m.tubeX('#3a3a40', -1.36, b + 0.6, 0, 0.2, 0.15, 'cyl8');
    m.box('#3a3a40', { x: -0.5, y: b + 0.32, sx: 0.08, sy: 0.18, sz: 0.4 });
    // Bug: zusätzliche Latte über den Kufenspitzen + Bugschild, an dem Kühlung und Gadgets sitzen
    m.box('#b07a42', { x: 1.47, y: b + 0.2, sx: 0.34, sy: 0.08, sz: 1.12 }, 0.15);
    for (const z of [0.5, -0.5]) m.rod('#7d848c', 1.47, sk + 0.18, 1.47, b + 0.16, z, 0.05);
    m.box(a, { x: 1.42, y: b + 0.45, sx: 0.08, sy: 0.44, sz: 0.9 }, 0.06);
    return {
      wheels: [[1.05, 0.68], [1.05, -0.68], [-1.0, 0.68], [-1.0, -0.68]],
      seat: [0.75, b + 0.3], rear: [-1.42, b + 0.6], tail: [-1.0, b + 0.9], roof: [0.7, b + 1.4], deck: b + 0.24,
      side: { x0: -1.0, x1: 1.2, y0: sk + 0.06, y1: b + 0.18, z: 0.56 }, tank: [1.08, b + 0.24, -0.6],
      front: [1.46, b + 0.45], nose: [1.42, b + 0.67], helmet: '#f5f5f5',
    };
  },

  muelltonne(m, k) {
    const { b, color: c, accent: a } = k;
    m.box(c, { y: b + 0.82, sx: 1.08, sy: 1.5, sz: 1.0 }, 0.06);
    m.box(c, { y: b + 1.55, sx: 1.2, sy: 0.1, sz: 1.1 }, 0.05);
    for (const x of [-0.3, 0, 0.3]) m.box('#3d4e45', { x, y: b + 0.8, z: 0.505, sx: 0.06, sy: 1.2, sz: 0.02 });
    m.box(a, { x: 0, y: b + 1.2, z: 0.51, sx: 0.5, sy: 0.16, sz: 0.02 });
    m.box('#3d4e45', { x: -0.58, y: b + 1.62, rz: 0.55, sx: 0.12, sy: 0.06, sz: 1.12 });
    m.box('#3d4e45', { x: -0.82, y: b + 1.88, rz: 1.15, sx: 0.85, sy: 0.08, sz: 1.14 }, 0.05);  // offener Deckel
    m.rodZ('#7d848c', -0.62, b + 1.45, -0.55, 0.55, 0.07);
    return {
      wheels: [[0.6, 0.6], [0.6, -0.6], [-0.6, 0.6], [-0.6, -0.6]],
      seat: [0.0, b + 1.0], rear: [-0.56, b + 0.5], tail: [-0.55, b + 1.6], roof: [0.05, b + 2.35], deck: b + 1.6,
      side: { x0: -0.5, x1: 0.5, y0: b + 0.1, y1: b + 0.95, z: 0.51 }, tank: [0.4, b + 1.6, -0.3],
      front: [0.56, b + 0.6], nose: [0.45, b + 1.6], vent: [0.42, b + 1.3, 0.5], helmet: '#e8553d',
      scrapAt: [-0.36, b + 1.6],   // Schrott stapelt sich hinter dem Fahrer auf dem Rand (nicht in der Öffnung)
    };
  },

  sofa(m, k) {
    const { b, color: c, accent: a } = k;
    const light = '#8f70a2';
    m.box(c, { y: b + 0.24, sx: 2.6, sy: 0.44, sz: 1.1 }, 0.08);
    for (const x of [-0.82, 0, 0.82]) {
      m.box(light, { x, y: b + 0.56, z: 0.08, sx: 0.78, sy: 0.22, sz: 0.88 }, 0.08);
      m.box(light, { x, y: b + 0.95, z: -0.28, sx: 0.78, sy: 0.55, sz: 0.24, rx: -0.12 }, 0.08);
    }
    m.box(c, { y: b + 0.88, z: -0.45, sx: 2.6, sy: 0.85, sz: 0.24 }, 0.08);
    for (const x of [1.24, -1.24]) m.box(c, { x, y: b + 0.58, sx: 0.28, sy: 0.6, sz: 1.1 }, 0.08);
    m.box(a, { x: 0.95, y: b + 0.85, z: 0.05, sx: 0.36, sy: 0.36, sz: 0.14, rz: 0.4 }, 0.06);
    m.box('#d0d0d0', { x: -0.6, y: b + 0.69, z: 0.2, sx: 0.22, sy: 0.04, sz: 0.14 });   // Fernbedienung
    for (const [x, z] of [[1.15, 0.45], [1.15, -0.45], [-1.15, 0.45], [-1.15, -0.45]]) m.cone('#5a3a20', { x, y: b - 0.04, z, s: 0.08, sy: 0.12, rz: PI }, 0, 'cone5');
    return {
      wheels: [[0.95, 0.62], [0.95, -0.62], [-0.95, 0.62], [-0.95, -0.62]],
      seat: [-0.1, b + 0.66], rear: [-1.4, b + 0.3], tail: [-1.24, b + 0.88], roof: [-0.1, b + 1.75], deck: b + 0.67,
      side: { x0: -1.1, x1: 1.1, y0: b + 0.05, y1: b + 0.45, z: 0.56 }, tank: [0.68, b + 0.67, 0.38],
      front: [1.39, b + 0.55], nose: [1.24, b + 0.88], vent: [1.24, b + 0.66, 0.55], helmet: '#ffd23f',
    };
  },
};

// ---------- Teile je Slot ----------
// Jede Funktion bekommt den Bau-Helfer m und die Ankerpunkte A; Rückgabe (optional): { exhaust: [x, y], spinner }
const PART_BUILDERS = {
  // Antrieb (Heck)
  drive_rasenmaehermotor(m, A) {
    const [x, y] = A.rear;
    m.box('#5d6166', { x: x - 0.25, y, sx: 0.5, sy: 0.42, sz: 0.5 }, 0.08);
    m.box('#7d848c', { x: x - 0.25, y: y + 0.3, sx: 0.2, sy: 0.2, sz: 0.2 });   // Zylinderkopf trägt die Kühlrippen
    for (let i = 0; i < 3; i++) m.box('#9aa4ae', { x: x - 0.25, y: y + 0.24 + i * 0.06, sx: 0.44, sy: 0.03, sz: 0.44 });
    m.disc('#e23b3b', x - 0.25, y, 0.27, 0.15, 0.05);
    m.tubeX('#2a2a30', x - 0.6, y + 0.1, 0, 0.06, 0.3, 'cyl6');
    return { exhaust: [x - 0.76, y + 0.1] };
  },
  drive_pedale(m, A) {
    const [x, y] = A.rear;
    m.disc('#b8c0c8', x - 0.2, y, 0.32, 0.22, 0.04);
    m.disc('#7d848c', x - 0.2, y, 0.35, 0.06, 0.06, 'cyl6');
    m.rod('#3a3a40', x - 0.2, y, x - 0.35, y + 0.28, 0.38, 0.05);
    m.rod('#3a3a40', x - 0.2, y, x - 0.05, y - 0.28, 0.28, 0.05);
    m.box('#1f2124', { x: x - 0.36, y: y + 0.3, z: 0.42, sx: 0.16, sy: 0.05, sz: 0.12 });
    m.box('#1f2124', { x: x - 0.04, y: y - 0.3, z: 0.24, sx: 0.16, sy: 0.05, sz: 0.12 });
    m.rod('#4a4a52', x - 0.2, y + 0.2, x + 0.3, y + 0.05, 0.32, 0.025);
    m.rod('#4a4a52', x - 0.2, y - 0.2, x + 0.3, y - 0.05, 0.32, 0.025);
    return { exhaust: [x - 0.1, y] };
  },
  drive_elektromotor(m, A) {
    const [x, y] = A.rear;
    m.tubeX('#2f6fb5', x - 0.25, y, 0, 0.2, 0.5, 'cyl10', 0.06);
    m.tubeX('#9aa4ae', x - 0.52, y, 0, 0.13, 0.08);
    for (let i = 0; i < 4; i++) m.tubeX('#245a94', x - 0.1 - i * 0.1, y, 0, 0.21, 0.03);
    m.box('#f2c230', { x: x - 0.2, y: y + 0.3, sx: 0.32, sy: 0.18, sz: 0.4 });
    m.box('#1f2124', { x: x - 0.2, y: y + 0.4, sx: 0.32, sy: 0.04, sz: 0.4 });
    m.rod('#e8742a', x - 0.32, y + 0.4, x - 0.45, y + 0.15, 0.1, 0.03);
    return { exhaust: [x - 0.6, y] };
  },
  drive_staubsaugerturbine(m, A) {
    const [x, y] = A.rear;
    m.tubeX('#d23a2a', x - 0.29, y, 0, 0.26, 0.58, 'cyl10', 0.05);
    m.tubeX('#9aa4ae', x - 0.04, y, 0, 0.3, 0.06);
    m.cone('#7d848c', { x: x - 0.71, y, rz: PI / 2, sx: 0.22, sz: 0.22, sy: 0.3 });
    m.box('#f4f4f4', { x: x - 0.32, y: y + 0.27, sx: 0.3, sy: 0.04, sz: 0.06 });
    // Turbinenschaufeln (drehen sich)
    const blades = [];
    for (let i = 0; i < 5; i++) blades.push(part('box', '#d0d6dc', { sx: 0.03, sy: 0.4, sz: 0.08, rx: (i / 5) * PI }));
    return { exhaust: [x - 0.86, y], spinner: { geo: merge(blades), x: x - 0.02, y, z: 0, speed: 40 } };
  },

  // Aerodynamik
  aero_fahrtwind(m, A) {
    const [x, y] = A.tail;
    m.box('#8a8f96', { x: x - 0.06, y: y + 0.02, sx: 0.22, sy: 0.04, sz: 0.9, rz: 0.15 });   // Abrisskante hinter dem Heck
  },
  aero_regenschirm(m, A) {
    const [x, y] = A.roof;
    m.rod('#3a3a40', x - 0.35, y - 0.5, x - 0.15, y + 0.55, 0, 0.04);
    m.rod('#7a5232', x - 0.35, y - 0.5, x - 0.45, y - 0.62, 0, 0.05);
    m.cone('#2b3a6b', { x: x - 0.13, y: y + 0.62, rz: -0.18, sx: 0.95, sz: 0.95, sy: 0.4 }, 0.06);
    m.cone('#c0392b', { x: x - 0.12, y: y + 0.7, rz: -0.18, sx: 0.5, sz: 0.5, sy: 0.22 });
    m.ico('#3a3a40', { x: x - 0.09, y: y + 0.85, s: 0.05 });
  },
  aero_buegelbrett(m, A) {
    const [x, y] = A.roof;
    m.box('#a8d0ec', { x: x - 0.15, y: y + 0.08, sx: 1.9, sy: 0.06, sz: 0.7 }, 0.04);
    m.cyl('#a8d0ec', { x: x + 0.8, y: y + 0.08, sx: 0.35, sz: 0.35, sy: 0.06 }, 0.04, 'cyl10');
    for (let i = 0; i < 5; i++) m.ico('#ffffff', { x: x - 0.9 + i * 0.4, y: y + 0.11, z: (i % 2 ? 0.15 : -0.12), s: 0.07, sy: 0.02 });
    // X-Beine stehen auf dem Aufbau (A.deck) – links und rechts am Fahrer vorbei
    const d = A.deck ?? y - 0.4;
    for (const z of [0.34, -0.34]) {
      m.rod('#8a8f96', x - 0.5, d, x + 0.1, y + 0.05, z, 0.035);
      m.rod('#8a8f96', x + 0.1, d, x - 0.5, y + 0.05, z, 0.035);
      m.rodZ('#6a6f76', x - 0.2, (d + y) / 2 + 0.02, z - 0.03, z + 0.03, 0.05);   // Gelenk
    }
  },
  aero_heckspoiler(m, A) {
    const [x, y] = A.tail;
    for (const z of [0.35, -0.35]) m.box('#222226', { x, y: y + 0.2, z, sx: 0.06, sy: 0.4, sz: 0.06 });
    m.box('#222226', { x: x - 0.05, y: y + 0.42, sx: 0.55, sy: 0.07, sz: 1.3, rz: 0.1 });
    for (const z of [0.66, -0.66]) m.box('#c0392b', { x: x - 0.05, y: y + 0.42, z, sx: 0.5, sy: 0.22, sz: 0.04 });
    m.cone('#e8742a', { x: x - 0.45, y: y + 0.25, z: 0.7, rz: 2.2, sx: 0.1, sz: 0.1, sy: 0.55 }, 0.1, 'cone5');
    m.ico('#ffffff', { x: x - 0.67, y: y + 0.08, z: 0.7, s: 0.07 });
  },

  // Panzerung (Seitenflächen)
  armor_pappe(m, A) {
    const s = A.side;
    for (const sg of [1, -1]) {
      const z = sg * (s.z + 0.025);
      m.box('#b98a55', { x: (s.x0 + s.x1) / 2, y: (s.y0 + s.y1) / 2, z, sx: s.x1 - s.x0, sy: s.y1 - s.y0, sz: 0.04 }, 0.06);
      m.box('#e6d3a3', { x: (s.x0 + s.x1) / 2, y: (s.y0 + s.y1) / 2, z: z + sg * 0.02, sx: s.x1 - s.x0, sy: 0.07, sz: 0.01 });
      m.box('#c0392b', { x: s.x0 + (s.x1 - s.x0) * 0.25, y: s.y1 - 0.08, z: z + sg * 0.02, sx: 0.18, sy: 0.06, sz: 0.01 });
    }
  },
  armor_topfdeckel(m, A) {
    const s = A.side;
    const w = s.x1 - s.x0;
    const n = Math.max(1, Math.min(4, Math.round(w / 0.55)));
    const r = Math.min(0.26, (s.y1 - s.y0) * 0.5 + 0.06, w / n / 2);
    for (let i = 0; i < n; i++) {
      const x = s.x0 + (w * (i + 0.5)) / n;
      const y = (s.y0 + s.y1) / 2;
      for (const sg of [1, -1]) {
        m.disc('#c9cdd2', x, y, sg * (s.z + 0.04), r, 0.05);
        m.disc('#9aa4ae', x, y, sg * (s.z + 0.06), r * 0.7, 0.02);
        m.disc('#1f2124', x, y, sg * (s.z + 0.1), 0.05, 0.06, 'cyl6');
      }
    }
  },
  armor_matratze(m, A) {
    const s = A.side;
    for (const sg of [1, -1]) {
      const z = sg * (s.z + 0.1);
      m.box('#f3f0e6', { x: (s.x0 + s.x1) / 2, y: (s.y0 + s.y1) / 2, z, sx: s.x1 - s.x0 + 0.1, sy: s.y1 - s.y0 + 0.1, sz: 0.2 }, 0.03);
      for (let x = s.x0 + 0.1; x < s.x1; x += 0.22) m.box('#7aa6d8', { x, y: (s.y0 + s.y1) / 2, z: z + sg * 0.1, sx: 0.06, sy: s.y1 - s.y0 + 0.08, sz: 0.01 });
      m.ico('#e8d27a', { x: s.x0 + (s.x1 - s.x0) * 0.62, y: (s.y0 + s.y1) / 2 + 0.05, z: z + sg * 0.1, s: 0.1, sz: 0.01 });
    }
  },
  armor_oelfass(m, A) {
    const s = A.side;
    for (const sg of [1, -1]) {
      const z = sg * (s.z + 0.05);
      m.box('#2f5fa8', { x: (s.x0 + s.x1) / 2, y: (s.y0 + s.y1) / 2, z, sx: s.x1 - s.x0 + 0.08, sy: s.y1 - s.y0 + 0.06, sz: 0.08 }, 0.06);
      for (const f of [0.25, 0.75]) m.box('#244b86', { x: (s.x0 + s.x1) / 2, y: s.y0 + (s.y1 - s.y0) * f, z: z + sg * 0.05, sx: s.x1 - s.x0 + 0.1, sy: 0.05, sz: 0.04 });
      m.box('#f2c230', { x: s.x1 - 0.15, y: (s.y0 + s.y1) / 2, z: z + sg * 0.05, sx: 0.12, sy: s.y1 - s.y0, sz: 0.02 });
    }
  },

  // Tank
  tank_kanister(m, A) {
    const [x, y, z] = A.tank;
    m.box('#d23a2a', { x, y: y + 0.24, z, sx: 0.4, sy: 0.48, sz: 0.18 }, 0.05);
    m.box('#a82c20', { x, y: y + 0.24, z: z + 0.1, sx: 0.3, sy: 0.04, sz: 0.02, rz: 0.8 });
    m.box('#a82c20', { x, y: y + 0.24, z: z + 0.1, sx: 0.3, sy: 0.04, sz: 0.02, rz: -0.8 });
    m.box('#d23a2a', { x: x - 0.05, y: y + 0.52, z, sx: 0.22, sy: 0.05, sz: 0.06 });
    m.cyl('#f2c230', { x: x + 0.14, y: y + 0.52, z, sx: 0.05, sz: 0.05, sy: 0.08 }, 0, 'cyl6');
  },
  tank_thermoskanne(m, A) {
    const [x, y, z] = A.tank;
    m.cyl('#c9cdd2', { x, y: y + 0.28, z, sx: 0.14, sz: 0.14, sy: 0.55 }, 0.04);
    m.cyl('#3fae4a', { x, y: y + 0.2, z, sx: 0.145, sz: 0.145, sy: 0.12 });
    m.cyl('#e23b3b', { x, y: y + 0.6, z, sx: 0.16, sz: 0.16, sy: 0.12 });
  },
  tank_gurkenfass(m, A) {
    const [x, y, z] = A.tank;
    m.cyl('#8a5a2b', { x, y: y + 0.3, z, sx: 0.3, sz: 0.3, sy: 0.6 }, 0.12);
    for (const f of [0.12, 0.48]) m.cyl('#3a3a40', { x, y: y + f, z, sx: 0.31, sz: 0.31, sy: 0.05 });
    m.cyl('#6b4423', { x, y: y + 0.61, z, sx: 0.28, sz: 0.28, sy: 0.03 });
    m.cyl('#4f8a3a', { x, y: y + 0.68, z, rz: PI / 2, sx: 0.06, sz: 0.06, sy: 0.28 }, 0.1, 'cyl6');
  },
  tank_gasflasche(m, A) {
    const [x, y, z] = A.tank;
    m.cyl('#2f6fd0', { x, y: y + 0.25, z, sx: 0.16, sz: 0.16, sy: 0.5 }, 0.05);
    m.ico('#2f6fd0', { x, y: y + 0.52, z, s: 0.16, sy: 0.09 });
    m.cyl('#c9a43a', { x, y: y + 0.63, z, sx: 0.04, sz: 0.04, sy: 0.12 }, 0, 'cyl6');
    m.box('#c9a43a', { x: x + 0.05, y: y + 0.66, z, sx: 0.1, sy: 0.03, sz: 0.03 });
    m.box('#f4f4f4', { x, y: y + 0.3, z: z + 0.16, sx: 0.12, sy: 0.12, sz: 0.01 });
  },

  // Kühlung (Front)
  cooling_fahrtwind(m, A) {
    const [x, y] = A.front;
    for (let i = 0; i < 3; i++) m.box('#1f2124', { x: x + 0.01, y: y - 0.1 + i * 0.1, sx: 0.04, sy: 0.035, sz: 0.55 });
    // Schlitze auch in der Seitenwand (die Spielkamera sieht nur die Seite)
    if (A.vent) {
      const [vx, vy, vz] = A.vent;
      for (const sg of [1, -1]) for (let i = 0; i < 3; i++) m.box('#1f2124', { x: vx - 0.1 + i * 0.1, y: vy, z: sg * (vz + 0.01), sx: 0.045, sy: 0.24, sz: 0.03 });
    }
  },
  cooling_ventilator(m, A) {
    const [x, y] = A.nose;
    m.box('#5a5f66', { x: x + 0.05, y: y + 0.03, sx: 0.25, sy: 0.06, sz: 0.25 });
    m.box('#5a5f66', { x: x + 0.05, y: y + 0.2, sx: 0.05, sy: 0.3, sz: 0.05 });
    m.tubeX('#8a8f96', x + 0.12, y + 0.42, 0, 0.3, 0.04, 'cyl10');
    m.tubeX('#5a5f66', x + 0.08, y + 0.42, 0, 0.07, 0.14, 'cyl8');
    const blades = [];
    for (let i = 0; i < 3; i++) blades.push(part('box', '#8fd3ff', { sx: 0.02, sy: 0.5, sz: 0.12, rx: (i / 3) * PI }));
    return { spinner: { geo: merge(blades), x: x + 0.16, y: y + 0.42, z: 0, speed: 25 } };
  },
  cooling_autokuehler(m, A) {
    const [x, y] = A.front;
    m.box('#9aa4ae', { x: x + 0.08, y, sx: 0.14, sy: 0.55, sz: 0.85 }, 0.05);
    for (let i = 0; i < 6; i++) m.box('#4a4f55', { x: x + 0.16, y: y - 0.22 + i * 0.09, sx: 0.03, sy: 0.03, sz: 0.8 });
    m.cyl('#e23b3b', { x: x + 0.08, y: y + 0.31, sx: 0.06, sz: 0.06, sy: 0.06 }, 0, 'cyl6');
    m.rod('#1f2124', x + 0.02, y + 0.2, x - 0.25, y + 0.1, 0.35, 0.06);
  },
  cooling_heizluefter(m, A) {
    // Bad-Heizlüfter: cremefarbenes Gehäuse, glühendes Gitter, Drehknopf (im Umriss des Autokühlers)
    const [x, y] = A.front;
    m.box('#e8e0cc', { x: x + 0.08, y: y + 0.02, sx: 0.16, sy: 0.42, sz: 0.55 }, 0.04);
    for (let i = 0; i < 4; i++) m.box('#ff7a1a', { x: x + 0.165, y: y - 0.1 + i * 0.08, sx: 0.02, sy: 0.03, sz: 0.42 });
    m.cyl('#3a3a40', { x: x + 0.08, y: y + 0.26, z: 0.15, sx: 0.05, sz: 0.05, sy: 0.06 }, 0, 'cyl6');
    // Halteklammern nach hinten (der Einkaufswagen hat vorn nur ein Gitter)
    for (const z of [0.2, -0.2]) m.rod('#1f2124', x + 0.02, y - 0.12, x - 0.12, y - 0.12, z, 0.04);
  },
  cooling_trockeneis(m, A) {
    const [x, y] = A.front;
    m.box('#f5f8fa', { x: x + 0.12, y: y + 0.05, sx: 0.32, sy: 0.32, sz: 0.5 }, 0.03);
    m.box('#5fb7d9', { x: x + 0.12, y: y + 0.24, sx: 0.36, sy: 0.07, sz: 0.54 });
    for (const [dx, dy, s] of [[0.05, 0.38, 0.1], [0.2, 0.45, 0.08], [0.1, 0.55, 0.06]]) m.ico('#eaf6ff', { x: x + dx, y: y + dy, z: 0.1, s });
  },

  // Gadget (Bug oben)
  gadget_hupe(m, A) {
    const [x, y] = A.nose;
    m.rod('#3a3a40', x, y, x + 0.05, y + 0.22, 0.25, 0.04);
    m.cone('#d9a441', { x: x + 0.25, y: y + 0.25, z: 0.25, rz: -PI / 2, sx: 0.12, sz: 0.12, sy: 0.38 });
    m.ico('#e23b3b', { x: x - 0.04, y: y + 0.25, z: 0.25, s: 0.11 });
  },
  gadget_magnet(m, A) {
    const [x, y] = A.nose;
    m.rod('#7a5232', x - 0.2, y, x + 0.75, y + 1.0, 0.3, 0.05);
    m.rod('#dddddd', x + 0.75, y + 1.0, x + 0.75, y + 0.35, 0.3, 0.012);
    m.box('#e23b3b', { x: x + 0.75, y: y + 0.32, z: 0.3, sx: 0.26, sy: 0.07, sz: 0.08 });
    for (const dx of [-0.1, 0.1]) {
      m.box('#e23b3b', { x: x + 0.75 + dx, y: y + 0.22, z: 0.3, sx: 0.07, sy: 0.2, sz: 0.08 });
      m.box('#c9cdd2', { x: x + 0.75 + dx, y: y + 0.11, z: 0.3, sx: 0.07, sy: 0.05, sz: 0.08 });
    }
  },
  gadget_kompass(m, A) {
    const [x, y] = A.nose;
    m.box('#5a3a20', { x, y: y + 0.12, z: 0.2, sx: 0.06, sy: 0.24, sz: 0.06 });
    m.disc('#c9a43a', x, y + 0.36, 0.22, 0.19, 0.05);
    m.disc('#f4f1ea', x, y + 0.36, 0.25, 0.15, 0.02);
    m.box('#e23b3b', { x: x + 0.03, y: y + 0.39, z: 0.27, sx: 0.12, sy: 0.025, sz: 0.01, rz: 0.6 });
    m.box('#3fae4a', { x: x + 0.05, y: y + 0.03, z: -0.2, sx: 0.4, sy: 0.06, sz: 0.08 });
    m.ico('#d8ff9a', { x: x + 0.08, y: y + 0.06, z: -0.2, s: 0.025 });
  },
  gadget_schneeschaufel(m, A) {
    const [x, y] = A.front;
    // Schaufelblatt vor allen Kühlteilen (Trockeneis-Kiste reicht bis x + 0.28)
    m.box('#e8742a', { x: x + 0.42, y: y - 0.08, sx: 0.05, sy: 0.5, sz: 0.95, rz: 0.3 }, 0.05);
    m.box('#c75e1d', { x: x + 0.34, y: y + 0.16, sx: 0.12, sy: 0.04, sz: 0.95, rz: 0.3 });
    m.rod('#a0703c', x + 0.37, y + 0.1, x - 0.25, y + 0.55, 0, 0.06);
  },
  gadget_gluecksbringer(m, A) {
    const [x, y] = A.nose;
    m.box('#1f2124', { x, y: y + 0.11, z: 0.2, sx: 0.14, sy: 0.22, sz: 0.12 });    // steht auf der Fläche
    m.ico('#f1c191', { x, y: y + 0.28, z: 0.2, s: 0.08 });
    m.cyl('#1f2124', { x, y: y + 0.4, z: 0.2, sx: 0.07, sz: 0.07, sy: 0.14 }, 0, 'cyl8');
    m.cyl('#1f2124', { x, y: y + 0.34, z: 0.2, sx: 0.12, sz: 0.12, sy: 0.02 }, 0, 'cyl8');
    m.rod('#a0703c', x + 0.12, y, x + 0.2, y + 0.4, 0.2, 0.025);
    for (const [dx, dy] of [[0, 0], [0.07, 0.06], [-0.07, 0.06]]) m.ico('#3fae4a', { x: x - 0.15 + dx, y: y + 0.25 + dy, z: 0.24, s: 0.05 });
    m.rod('#a0703c', x - 0.15, y + 0.25, x - 0.05, y + 0.15, 0.24, 0.02);
  },
};

// ---------- Mülltonne: gesammelte Schrott-Teile (sichtbar je Stück, bis RULES.collectScrapMass.maxPieces) ----------
function scrapPiles(at) {
  const cols = ['#9a4a2e', '#5b6e7a', '#a36a2c', '#7d7f3a', '#6d4c7d', '#8a8f96'];
  const geos = [];
  const counts = [0];
  const n = RULES.collectScrapMass.maxPieces;
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 4);
    const col = i % 4;
    const g = part(i % 3 ? 'box' : 'ico', cols[i % cols.length], {
      x: at[0] - col * 0.05 + (row % 2) * 0.05, y: at[1] + 0.08 + row * 0.14, z: -0.3 + col * 0.2,
      s: 0.13, sy: 0.09, rx: i * 0.7, ry: i * 1.3,
    });
    counts.push(counts[counts.length - 1] + g.attributes.position.count);
    geos.push(g);
  }
  const geo = merge(geos);
  const mesh = new THREE.Mesh(geo, flatMat);
  mesh.castShadow = true;
  geo.setDrawRange(0, 0);
  return { mesh, set(k) { geo.setDrawRange(0, counts[Math.max(0, Math.min(n, k))]); } };
}

// ---------- Zusammenbau ----------
export function buildVehicle({ chassisId, parts = {}, visual = null }) {
  const c = chassisById(chassisId) || chassisById('seifenkiste');
  const vis = visual || chassisVisual(c);
  const spec = wheelSpec(parts.wheels);
  const axle = GROUND + spec.r;
  const k = { b: axle + 0.1, axle, r: spec.r, color: vis.color, accent: vis.accent };
  const P = [];
  const m = maker(P);
  const builder = CHASSIS_BUILDERS[c.model] || CHASSIS_BUILDERS[c.id] || CHASSIS_BUILDERS.seifenkiste;
  const A = builder(m, k);
  driver(m, A.seat[0], A.seat[1], A.helmet);

  const group = new THREE.Group();
  // Aufbau (alles außer den Rädern) in eigener Gruppe: das Garagen-Wippen hebt nur ihn, die Räder bleiben am Boden
  const upper = new THREE.Group();
  group.add(upper);
  const spinners = [];
  let exhaust = A.rear;
  for (const slot of ['drive', 'aero', 'armor', 'tank', 'cooling', 'gadget']) {
    const fn = PART_BUILDERS[parts[slot]];
    if (!fn) continue;
    const res = fn(m, A) || {};
    if (slot === 'drive' && res.exhaust) exhaust = res.exhaust;
    if (res.spinner) {
      const s = res.spinner;
      const mesh = new THREE.Mesh(s.geo, flatMat);
      mesh.position.set(s.x, s.y, s.z);
      mesh.castShadow = true;
      upper.add(mesh);
      spinners.push({ mesh, speed: s.speed });
    }
  }
  const body = new THREE.Mesh(merge(P), flatMat);
  body.castShadow = true;
  upper.add(body);

  // Räder (eigene Meshes, damit sie sich drehen)
  const wheels = [];
  const wheelGeos = [];
  A.wheels.forEach(([x, z], i) => {
    const geo = spec.kind === 'ball' || i === 0 ? wheelGeometry(spec, i) : wheelGeos[0];
    if (!wheelGeos.includes(geo)) wheelGeos.push(geo);
    const w = new THREE.Mesh(geo, flatMat);
    w.position.set(x, axle, z + Math.sign(z) * (spec.kind === 'ball' ? 0 : spec.w / 2 - 0.1));
    w.castShadow = true;
    group.add(w);
    wheels.push(w);
  });

  // Mülltonne: Schrott-Ladung
  let scrap = null;
  if (A.scrapAt) {
    scrap = scrapPiles(A.scrapAt);
    upper.add(scrap.mesh);
  }

  // Höhe über der Fahrzeugmitte (für die Garagen-Kamera) und halber Radstand (Bodenkontakt am Hang), in Metern
  body.geometry.computeBoundingBox();
  let top = body.geometry.boundingBox.max.y;
  for (const sp of spinners) {
    sp.mesh.geometry.computeBoundingSphere();
    top = Math.max(top, sp.mesh.position.y + sp.mesh.geometry.boundingSphere.radius);
  }
  let axleMin = Infinity, axleMax = -Infinity;
  for (const [x] of A.wheels) { axleMin = Math.min(axleMin, x); axleMax = Math.max(axleMax, x); }

  let minX = 0;
  for (const [x] of A.wheels) minX = Math.min(minX, x - spec.r);
  minX = Math.min(minX, A.rear[0] - 0.3);
  group.scale.setScalar(SCALE);
  group.userData = {
    chassisId: c.id,
    visual: { color: vis.color, accent: vis.accent },   // Farben (Chassis oder Lackierung)
    upper,
    top: top * SCALE,
    axleHalf: ((axleMax - axleMin) / 2) * SCALE,
    wheels,
    spinners,
    exhaust: { x: exhaust[0] * SCALE, y: exhaust[1] * SCALE },   // in Metern (nach der Skalierung)
    rear: -minX * SCALE,
    setScrap: (n) => { if (scrap) scrap.set(n); },
    dispose() {
      body.geometry.dispose();
      for (const g of wheelGeos) g.dispose();
      for (const s of spinners) s.mesh.geometry.dispose();
      if (scrap) scrap.mesh.geometry.dispose();
    },
  };
  return group;
}
