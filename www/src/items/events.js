// Ereignis-Namen der Trigger-Engine (ARCHITEKTUR.md 4.2 und 4.11). Reine Daten.
// Die Etappe schreibt genau diese Namen in ihre Ereignis-Warteschlange (stage.queue);
// die Trigger-Engine (Phase 4) muss sie nur noch abarbeiten.

// Ereignisse während einer Etappe (ctx mit Fahrzeug)
export const STAGE_EVENTS = [
  'stageStart',     // {}                                  vor dem Abschuss
  'launch',         // {power, perfect, angle}             beim Abschuss
  'perfectLaunch',  // {power}                             zusätzlich bei perfektem Abschuss
  'landing',        // {quality, impact, airTime, flips}   jede Landung nach ≥ RESOURCES.minLandingAir Flug
  'perfectLanding', // wie landing                         zusätzlich bei perfekter Landung
  'groundTouch',    // {impact}                            jede Bodenberührung (auch kurze)
  'flip',           // {dir:'back'|'front', count}         sofort bei jeder vollen Drehung in der Luft
  'airSecond',      // {seconds}                           jede volle Sekunde in der Luft
  'boost',          // {free, source}                      Start eines Boosts
  'boostSecond',    // {}                                  jede volle Sekunde Boost
  'overheat',       // {}                                  Hitze erreicht das Maximum
  'collision',      // {kind, damage}                      Hindernis getroffen
  'bounce',         // {source}                            Abprall statt Schaden (Schild, Gummi)
  'pickup',         // {kind}                              Pickup eingesammelt (bolt, fuel, cool, repair, scrap, crate, blueprint)
  'fuelEmpty',      // {}                                  Treibstoff wird 0
  'abilityUse',     // {ability}                           Fähigkeit benutzt
  'milestone',      // {m}                                 alle STAGE.milestoneEvery Meter
  'shock',          // {source}                            Stromschlag
  'explosion',      // {amount}                            nach Effekt explosion
  'damage',         // {amount, source}                    Haltbarkeit verloren
  'heal',           // {amount}                            Haltbarkeit erhalten
  'stageEnd',       // {medal, dist}                       Etappe vorbei (vor der Auswertung)
  'chain',          // {links}                             Paket C: Kettenreaktion erreicht SYNERGY.chain.minLinks Glieder
                    //                                     (neue Kette, Tiefe 0; nur vom Spiel ausgelöst – emit verboten)
];

// Ereignisse im Run außerhalb der Etappe (ctx ohne Fahrzeug)
export const RUN_EVENTS = ['runStart', 'nodeEnter', 'stageClear', 'itemGained', 'shopEnter'];

export const EVENTS = [...STAGE_EVENTS, ...RUN_EVENTS];
const EVENT_SET = new Set(EVENTS);
export const isEvent = (name) => EVENT_SET.has(name);
