// Bedingungen (`if`) der Trigger – ARCHITEKTUR.md 4.4 + 4.11. Alle Bedingungen sind optional und UND-verknüpft.
//   Ereignis-Daten: perfect, quality (Text oder Liste), minImpact, maxImpact, minCount, dir, kind, ability, free,
//                   source, nodeType, medal
//   Zustand:        airborne, grounded, heatAbove, heatBelow (Hitze-Einheiten), fuelBelow, hpBelow (Anteile 0…1),
//                   minSpeed (m/s), chassis
// minCount prüft je Ereignis: flip.count, landing.flips / perfectLanding.flips, airSecond.seconds, chain.links.
// Im Run-Kontext (ctx ohne Fahrzeug) gelten nur hpBelow (über ctx.hpFrac()) und chassis; Fahrzeug-Bedingungen sind
// dort nie erfüllt. Reine Logik ohne three.js und DOM.

export const CONDITION_KEYS = [
  'perfect', 'quality', 'minImpact', 'maxImpact', 'airborne', 'grounded', 'heatAbove', 'heatBelow', 'fuelBelow',
  'hpBelow', 'minCount', 'dir', 'kind', 'ability', 'free', 'source', 'minSpeed', 'nodeType', 'medal', 'chassis',
];

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

// Zähl-Wert eines Ereignisses für minCount
export function countOf(event, data) {
  if (!data) return 0;
  if (event === 'flip') return num(data.count);
  if (event === 'landing' || event === 'perfectLanding') return num(data.flips);
  if (event === 'airSecond') return num(data.seconds);
  if (event === 'chain') return num(data.links);
  return num(data.count ?? data.flips ?? data.seconds);
}

// Haltbarkeits-Anteil: Fahrzeug in der Etappe, sonst ctx.hpFrac() (Run)
function hpFrac(ctx) {
  const v = ctx && ctx.vehicle;
  if (v) return v.stats.durabilityMax > 0 ? v.durability / v.stats.durabilityMax : 0;
  return ctx && typeof ctx.hpFrac === 'function' ? ctx.hpFrac() : 1;
}

// Prüft eine einzelne Bedingung. Unbekannte Schlüssel gelten als erfüllt (Tippfehler sollen nichts sperren –
// der Inhalts-Prüfer tools/validateContent.mjs meldet sie).
export function checkOne(key, want, event, data, ctx) {
  const d = data || {};
  const v = ctx ? ctx.vehicle : null;
  switch (key) {
    case 'perfect': return !!d.perfect === !!want;
    case 'quality': return Array.isArray(want) ? want.includes(d.quality) : d.quality === want;
    case 'minImpact': return num(d.impact) >= want;
    case 'maxImpact': return num(d.impact) <= want;
    case 'minCount': return countOf(event, d) >= want;
    case 'dir': return d.dir === want;
    case 'kind': return d.kind === want;
    case 'ability': return d.ability === want;
    case 'free': return !!d.free === !!want;
    case 'source': return d.source === want;
    case 'nodeType': return (d.type ?? d.nodeType) === want;
    case 'medal': return d.medal === want;
    case 'chassis': return !!ctx && ctx.chassisId === want;
    case 'hpBelow': return hpFrac(ctx) < want;
    case 'airborne': return !!v && (!v.onGround || !!v.loop) === !!want;
    case 'grounded': return !!v && (v.onGround && !v.loop) === !!want;
    case 'heatAbove': return !!v && v.heat > want;
    case 'heatBelow': return !!v && v.heat < want;
    case 'fuelBelow': return !!v && v.stats.fuelMax > 0 && v.fuel / v.stats.fuelMax < want;
    case 'minSpeed': return !!v && v.speed >= want;
    default: return true;
  }
}

// Alle Bedingungen eines Triggers (UND). cond fehlt → erfüllt.
export function checkConditions(cond, event, data, ctx) {
  if (!cond) return true;
  for (const k in cond) if (!checkOne(k, cond[k], event, data, ctx)) return false;
  return true;
}
