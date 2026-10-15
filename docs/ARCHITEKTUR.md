# Schleuderwerk 2 – Architektur & Verträge

> Verbindliche Referenz für alle Umbau-Phasen. Spieldesign und Zahlen-Begründungen: [V2-DESIGN.md](V2-DESIGN.md).
> Sprache: Spieltexte und Code-Kommentare **Deutsch**, Bezeichner Englisch (wie im bestehenden Code).

## 0. Analyse des bestehenden Codes (Stand v0.2.0, 3.122 Zeilen)

| Bereich | Datei(en) | Urteil | Begründung |
|---|---|---|---|
| Rendering-Grundlage | `render/scene.js`, `render/models.js` (`part`/`merge`, Vertex-Farben, flatMat) | **bleibt** | Sauber, wenige Draw Calls, genau der gewünschte Low-Poly-Look. |
| Partikel | `render/particles.js` | **bleibt**, wird Pool ohne `shift()`/Array-Neubau | Funktioniert; GC-Last pro Frame wird entfernt. |
| Hintergrund | `render/background.js` | **bleibt** (+ Palette Gewittersteppe) | Parallaxe-Kacheln reichen. |
| Gelände-Darstellung | `render/terrainView.js` | **umgebaut** | Muss Schluchten, Schlamm, Loopings, Floating Origin (lokale Chunk-Koordinaten) können. |
| Objekte | `render/objectsView.js` | **umgebaut** | Neue Objekte (Schrauben, Kanister, Schrottberge, Pressen, Blitze, Windzonen). Instancing-Prinzip bleibt. |
| Kamera | `render/cameraRig.js` | **ersetzt** (`camera/cameraRig.js`) | Keine Garantie, dass das Auto im Bild bleibt; Zoom-Obergrenze 110 m ohne Rand-Klemmung → Auto verschwindet bei Tempo/Höhe. |
| Physik | `game/car.js` | **umgebaut** (`physics/vehicle.js`) | Gute 2D-Punktmodell-Basis (Boden-Tempo `s`, Landungs-Klassen). Neu: adaptive Substeps, weiche Tempo-Obergrenze, Hitze, Treibstoff, Haltbarkeit, Neigen per Halten, Fähigkeiten, Regeln für Items. |
| Strecke | `game/terrain.js` | **umgebaut** (`physics/track.js`) | Höhenlinie bleibt; neu: Etappen-Spezifikation mit Features (Schlucht, Schlamm, Looping, Wind, Thermik, Schrottberg, Presse). |
| Objekte/Kollision | `game/objects.js` | **umgebaut** (`physics/objects.js`) | Kollision wird „swept“ (kein Durchtunneln). |
| Run-Ablauf | `game/run.js` | **ersetzt** | Wird aufgeteilt: `stage/stage.js` (eine Etappe), `run/runState.js` (Roguelite-Run), Trigger-Engine. |
| Upgrades/Stats | `config/upgrades.js`, `game/stats.js` | **ersetzt** | Lineare Zahlen → Garage (Chassis + Teile), Items, Set-Boni, Soft-Caps. |
| Welten | `config/worlds.js` | **umgebaut** (`data/biomes.js`) | Paletten der Steppe und Wüste werden übernommen, Gewittersteppe neu. |
| Balancing | `config/balance.js` | **umgebaut** (`data/balance.js`) | Wird DIE zentrale Zahlen-Datei (inkl. Kamera, Ökonomie, Karte, Schrottstufen). |
| Eingabe | `game/input.js` | **ersetzt** | Neu: Halten/Loslassen (Abschuss), linke/rechte Hälfte halten (Neigen), Fähigkeits-Knöpfe, Multi-Touch. |
| Sound | `audio/sfx.js` | **bleibt** (+ neue Platzhalter-Sounds) | Synthese ohne Dateien passt perfekt. |
| Speichern | `save/save.js` | **umgebaut** | Versionierung + Migrationskette existiert; neues Schema v3 mit Migration aus v2. |
| Plattform | `platform/platform.js` | **bleibt** | Capacitor-Anbindung funktioniert. |
| UI | `ui/*.js`, `style.css` | **größtenteils ersetzt** | Neue Bildschirme (Garage, Labor, Karte, Shops, Ereignisse …). `dom.js`-Helfer bleiben. |
| Build | `capacitor.config.json`, `tools/patch-android.mjs`, GitHub-Action | **bleibt** | Funktionierende APK-Pipeline (Hochformat, Vollbild, fester Schlüssel). |

**Ursachen der gemeldeten Probleme**
1. *Progression zu schnell*: 8 Upgrades × 30 Stufen mit linearer Wirkung, nur eine Währung, Welt 2 ab 3,5 km – nach ~45 min ist alles erreichbar.
2. *Auto verschwindet*: Kamera folgt mit Verzögerung (`1-exp(-6·dt)`), Zoom ist bei 110 m gedeckelt, Vorausschau wird vor der Höhen-Begrenzung berechnet, und es gibt keine Klemmung „Auto im sicheren Bildbereich“. Ohne Tempo-Obergrenze (Ringe addieren Tempo, Schub unbegrenzt) läuft das Auto der Kamera davon.
3. *Keine Tiefe*: Alle Upgrades sind Prozentzahlen ohne Entscheidung.

## 1. Grundsätze

- **Keine Build-Tools**, native ES-Module, Three.js lokal (`www/vendor/three.module.js`, Import-Map `three`).
- **Logik ohne Three.js**: Alles unter `core/ data/ physics/ stage/ run/ map/ items/ shops/ garage/ save/` importiert **kein** `three` und kein DOM → mit `node --test` testbar und im Balance-Simulator nutzbar.
- **Daten statt Code**: Items, Teile, Chassis, Fähigkeiten, Biome, Ereignisse, Forschung, Schrottstufen sind Datenobjekte in `data/`. Neue Inhalte = neuer Eintrag, kein neuer Code (außer für wirklich neue Effekt-Arten).
- **Alle Zahlen zentral**: Globale Zahlen in `data/balance.js`. Inhaltsgebundene Zahlen stehen beim Inhalt in `data/*.js`. Kein „magischer Wert“ in Logik-Modulen.
- **Determinismus**: Physik mit festem Zeitschritt; Zufall nur über `core/rng.js` mit Seed (Run-Seed → abgeleitete Seeds je Akt/Knoten/Etappe).
- **Mobile-Performance**: Pixel-Ratio ≤ 1,5 (Einstellung), Instancing, zusammengeführte Geometrien, Objekt-Pools, keine Allokationen im Physik-Schritt.

## 2. Ordnerstruktur (`www/src/`)

Plan für alle Phasen; Dateien, die es noch nicht gibt, kommen mit ihrer Phase. **Ist-Stand nach Phase 3** (zusätzlich bzw. abweichend vom Plan):
`platform/input.js` (Touch/Tastatur), `ui/garage.js`, `ui/map.js` (Karte), `ui/runScreens.js` (Intro, Ergebnis, Tankstelle, Platzhalter, Akt-Übergang, Run-Ende), `ui/results.js` (Dev-Testfahrt), `ui/menus.js`, `ui/popups.js`, `ui/statLabels.js`, `ui/hud.js`, `ui/devMenu.js`, `ui/dom.js` statt `ui/screens/*.js`; `render/featuresView.js` (Streckenbausteine), `render/weather.js` (Regen); `items/events.js`, `items/eventQueue.js`, `items/modState.js` (Bausteine der Trigger-Engine); `tools/sim/bot.mjs` + `tools/sim/calibrate.mjs` (Balance-Simulator, Ergebnis `docs/BALANCE.md`). **Phase 4:** `data/content/content_*.js` (geprüfte Inhaltsdateien, unverändert; `data/tags.js` und `data/items.js` führen sie nur zusammen), `data/research.js`, `textEvents.js`, `ascension.js`, `cosmetics.js` (geprüfte Inhalte, unverändert, Verwendung ab Phase 5/6 – der Inhalts-Prüfer braucht sie für Querverweise), `items/triggerEngine.js`, `items/conditions.js`, `items/inventory.js`, `ui/items.js` (Karten, Set-Übersicht, Item-Blatt Inventar/Kompendium), `tools/validateContent.mjs` (Inhalts-Prüfer), `tools/sim/items.mjs` (Item-Balance). Die Item-Auswahl liegt in `run/rewards.js` (Würfeln) und `run/runState.js` (Ablauf). Noch nicht vorhanden: `core/bus.js`, `shops/`, `garage/research.js`.

```
main.js                 Start, Bildschirm-Zustandsmaschine, Hauptschleife
core/
  rng.js                makeRng(seed) – reproduzierbarer Zufall
  math.js               clamp, lerp, smoothstep, wrapAngle, softcap, dimReturn, approach
  bus.js                kleiner Event-Bus (Logik → UI/Render), keine Spielregeln!
data/
  balance.js            ALLE globalen Zahlen (Physik, Kamera, Abschuss, Ökonomie, Karte, Preise …)
  tags.js               10 Tags + Set-Boni (2/4/6)
  items.js              80+ Run-Items
  index.js              Zugriff (chassisById, partById, partsForSlot, abilityById) + Format-Adapter der Inhaltsdaten
  chassis.js            Chassis-Klassen
  parts.js              Garage-Teile je Slot
  abilities.js          aktive Fähigkeiten
  biomes.js             3 Biome (Akte) inkl. Palette, Physik, Streckenbausteine, Bosse
  nodes.js              Knotentypen der Karte
  textEvents.js         Text-Ereignisse
  research.js           Forschungsbaum (Erfinder-Labor)
  ascension.js          Schrottstufen 1–15
  cosmetics.js          Lackierungen (Endgame-Senke)
physics/
  track.js              Strecke einer Etappe: Höhenlinie + Features (aus StageSpec)
  trackGen.js           generateStageSpec({ biome, kind, floor, act, rng, bossId, mods }) → StageSpec
  vehicle.js            Fahrzeug-Physik (Punktmodell, Luft/Boden, Hitze, Treibstoff, Haltbarkeit)
  objects.js            Pickups, Hindernisse, Zonen – „swept“ Kollision
items/
  effects.js            Effekt-Bibliothek (fx-Implementierungen)
  conditions.js         if-Bedingungen
  triggerEngine.js      Ereignis-Warteschlange, Kettentiefe, Limits, Zähler, Buffs
  inventory.js          Slots, Stufen (★), Fusion, Hybride, Tag-Zählung, Set-Boni
  statMods.js           Stat-Pipeline: Basis → Chassis → Teile → Forschung → Items/Sets → Buffs → Soft-Caps
  events.js             Ereignis-Namen (4.2 / 4.11)
  eventQueue.js         Ereignis-Warteschlange (FIFO, Kettentiefe, Limit je Abarbeitung) – Grundlage der Trigger-Engine
  modState.js           zeitweise Modifikatoren einer Etappe: Buffs, Stapel (stack), Zähler (charge)
stage/
  stage.js              Eine Etappe: Abschuss → Flug/Fahrt → Ende; verbindet Physik + Trigger-Engine
  launch.js             Abschuss-Minispiel (Halten/Loslassen, Sweet Spot, Winkel)
  abilities.js          Fähigkeits-Slots (halten/tippen, Kosten, Abklingzeit, Sonderregeln)
  scoring.js            Medaillen, Stunt-Belohnungen, Etappen-Ergebnis
run/
  runState.js           Roguelite-Run (Akt, Karte, Inventar, Währungen, Haltbarkeit) – reiner Zustand + Aktionen
  rewards.js            Belohnungen (Item-Auswahl, Schrauben, Meta-Ausschüttung)
map/
  mapGen.js             generateActMap(act, rng, opts) – verzweigte Karte
shops/
  scrapDealer.js  workbench.js  blackMarket.js  gasStation.js  textEvent.js  treasure.js
garage/
  loadout.js            Garage-Auswahl → Fahrzeug-Grundwerte (buildLoadout)
  garage.js             Garage-Aktionen: Chassis/Teile kaufen, ausrüsten, verbessern, Fähigkeiten wählen
  research.js           Forschung kaufen, Freischaltungen auflösen
  progression.js        Meta-Fortschritt, Schrottstufen, Meilenstein-Zeitmessung
camera/
  cameraRig.js          Zoom nach Tempo, Vorausschau, Sicherheitsrahmen, Rand-Indikator-Daten
render/
  scene.js models.js particles.js background.js
  vehicleModel.js       Chassis + sichtbare Teile
  trackView.js objectsView.js
  origin.js             Floating Origin (Render-Ursprung)
ui/
  dom.js hud.js screens/*.js (garage, lab, map, stageResult, shop, workbench, blackMarket, station, event, treasure, runEnd, settings, codex) devMenu.js tutorial.js
audio/sfx.js
save/save.js            Schema v3, Migrationen, Export/Import
platform/platform.js
```

Tests: `tests/*.test.mjs` (`node --test tests/` lädt `tests/index.js`), Lade-Hooks für three.js-Tests in `tests/support/`, Balance-Simulator: `tools/sim/`.

## 3. Koordinaten & Einheiten
Meter, Sekunden, Radiant. `x` = Strecke (vorwärts +), `y` = Höhe (oben +), `angle` 0 = Nase nach +x, **positiv = gegen den Uhrzeigersinn = Nase hoch**. Kamera schaut von +z. Render-Positionen: `x - origin.x` (Floating Origin, siehe §9).

## 4. Datenverträge

### 4.1 Stat-Schlüssel (`STATS` in `items/statMods.js`, Basiswerte in `balance.js → BASE_STATS`)
`launchSpeed, launchPerfectBonus, sweetSpotWidth, mass, drag, lift, airControl, maxSpin, autoLevel, boostThrust, boostFuel, boostHeat, driveAccel, driveFuel, driveHeat, rollFriction, fuelMax, heatMax, coolRate, durabilityMax, armor, impactThreshold, landTolDeg, perfectLandDeg, magnet, speedSoftCap, luck, boltGain, itemSlots, abilitySlots, abilityCooldown, flipSpeed, bounce`

Modifikator-Form (überall gleich – Items, Sets, Teile, Chassis, Buffs):
```js
stats: { boostThrust: { mul: 0.15 }, magnet: { add: 2 }, mass: { xmul: 1.3 } }
// Endwert = softcap( (Basis + Σadd) × (1 + Σmul) × Π xmul )
```
`mul` addiert sich (gegen Explosion von Zahlen), `xmul` multipliziert (selten, Legendär/Chassis). Soft-Caps stehen in `balance.js → SOFTCAPS`.

### 4.2 Trigger-Ereignisse (`items/triggerEngine.js → EVENTS`)
| Name | Daten | Ausgelöst |
|---|---|---|
| `stageStart` | `{}` | vor dem Abschuss |
| `launch` | `{power, perfect, angle}` | beim Abschuss |
| `perfectLaunch` | `{power}` | zusätzlich bei perfektem Abschuss |
| `landing` | `{quality:'perfect'\|'clean'\|'bumpy'\|'crash', impact, airTime, flips}` | jede Landung nach ≥ 0,15 s Flug |
| `perfectLanding` | wie `landing` | zusätzlich bei perfekter Landung |
| `groundTouch` | `{impact}` | jede Bodenberührung (auch kurze) |
| `flip` | `{dir:'back'\|'front', count}` | sofort bei jeder vollen Drehung in der Luft |
| `airSecond` | `{seconds}` | jede volle Sekunde in der Luft |
| `boost` | `{free:boolean, source}` | Start eines Boosts (Fähigkeit oder Gratis-Boost) |
| `overheat` | `{}` | Hitze erreicht Maximum |
| `collision` | `{kind, damage}` | Hindernis getroffen |
| `bounce` | `{source}` | Abprall statt Schaden (Gummi) |
| `pickup` | `{kind:'bolt'\|'fuel'\|'cool'\|'repair'\|'scrap'\|'crate'\|'blueprint'}` | Pickup eingesammelt |
| `fuelEmpty` | `{}` | Treibstoff wird 0 |
| `abilityUse` | `{ability}` | Fähigkeit benutzt |
| `milestone` | `{m}` | alle `balance.STAGE.milestoneEvery` Meter |
| `shock` | `{source}` | Stromschlag (Blitz, Items) |
| `explosion` | `{amount}` | nach Effekt `explosion` |
| `damage` | `{amount, source}` | Haltbarkeit verloren |
| `heal` | `{amount}` | Haltbarkeit erhalten |
| `stageEnd` | `{medal, dist}` | Etappe vorbei (vor Auswertung) |

### 4.3 Effekte (`fx`) – `items/effects.js`
Jeder Effekt: `{ fx: '<name>', ...params }`. Zahlen-Parameter in `SCALE_KEYS` (`amount, pct, dur, radius, add, mul`) werden mit dem Stufen-Faktor (★) skaliert (`balance.ITEMS.tierMult`).

| fx | Parameter | Wirkung |
|---|---|---|
| `thrust` | `amount` (m/s) | Sofort-Schub in Blickrichtung (unterliegt Soft-Cap) |
| `jump` | `amount` (m/s) | Impuls nach oben (am Boden: abheben). In der Luft hebt nur die Fähigkeit Hüpfer das Fallen ganz auf (Doppelsprung); Item-Sprünge (und der Sprung-Anteil von `explosion`) heben `ITEMS.effectJumpCancelFall` (0) davon auf – sonst ließe sich per Salto-Sprung endlos schweben |
| `boost` | `dur` | Gratis-Boost ohne Treibstoff (löst `boost{free:true}` aus) |
| `explosion` | `amount` | Schub nach vorn + kleiner Sprung, löst `explosion` aus |
| `heal` | `amount` oder `pct` | Haltbarkeit + |
| `selfDamage` | `amount` | Haltbarkeit − (Flüche) |
| `cool` / `heat` | `amount` | Hitze − / + |
| `fuel` | `amount` | Treibstoff + (auch über Max mit `over:true`) |
| `bolts` | `amount` | Schrauben + (Run-Währung) |
| `scrap` | `amount` | Schrott + (Meta) |
| `magnet` | `radius, dur` | zeitweises Magnetfeld |
| `buff` | `stat, mul\|add, dur` | zeitweiser Stat-Bonus |
| `stack` | `stat, mul\|add, max` | dauerhafter Bonus bis Etappenende (stapelbar bis `max`) |
| `charge` | `key, n, at, then:[fx…]` | Zähler; bei `at` → `then` ausführen, Zähler 0 |
| `emit` | `event, data` | anderes Ereignis auslösen (Kette!) |
| `shield` | `n` | die nächsten n Schadensquellen werden zu `bounce` |
| `spin` | `amount` (rad/s) | Drehimpuls |
| `slowmo` | `dur` | Zeitlupe (nur Gefühl) |
| `refill` | `ability?, pct` | Fähigkeits-Cooldown verkürzen/auffüllen |
| `chance` | `p, then:[…]` | Wahrscheinlichkeit (Glück erhöht p, `balance.ITEMS.luckPerPoint`) |

### 4.4 Bedingungen (`if`) – `items/conditions.js`
`perfect, quality, minImpact, maxImpact, airborne, grounded, heatAbove, heatBelow, fuelBelow (Anteil), hpBelow (Anteil), minCount, dir, kind, ability, free, source, minSpeed` – alle optional, UND-verknüpft.

### 4.5 Limits (`limit`)
`{ perStage: n, perRun: n, cooldown: s }` – vom Engine-Zustand verwaltet.

### 4.6 Item
```js
{
  id: 'zuendkerzen_kette', name: 'Zündkerzen-Kette', icon: '🔥',
  rarity: 'common' | 'rare' | 'epic' | 'legendary' | 'cursed',
  tags: ['feuer'],                       // 1–2 Tags
  pool: 'base' | '<researchId>',         // ab wann im Zufallspool
  desc: 'Jeder Salto lädt 1 Zündung. Bei 3 Zündungen: Gratis-Boost {dur}s.',
  flavor: 'Opa schwört drauf.',
  stats: { … },                          // passiv
  rules: { … },                          // Regel-Schalter (Legendär/Flüche), siehe 4.10
  triggers: [ { on: 'flip', if: {…}, limit: {…}, do: [ {fx…} ] } ],
  curse: { desc: '…', stats: {…}, triggers: [ … ] }   // nur rarity 'cursed'
}
```
`{dur}`, `{amount}` … in `desc` werden mit den skalierten Werten ersetzt (Funktion `describeItem(item, tier)`).

### 4.7 Tags & Set-Boni (`data/tags.js`)
```js
feuer: { name: 'Feuer', icon: '🔥', color: '#ff6b2d',
  sets: { 2: { desc, stats?, triggers? }, 4: {…}, 6: {…} } }
```
Hybrid-Items zählen für beide Tags. Chassis-Regel `setBonusDouble` verdoppelt die Set-Boni-Werte (Badewanne).

### 4.8 Chassis, Teile, Fähigkeiten
```js
// chassis
{ id, name, icon, desc, model, unlock: { research?: id, cores: n }, stats: {…}, slots: { items: ±n, abilities: ±n },
  rules: {…}, triggers: [ … ], starterItem?: itemId, ability?: abilityId /* Spezialfähigkeit */ }
// part
{ id, slot: 'drive'|'wheels'|'aero'|'armor'|'tank'|'cooling'|'gadget', name, icon, desc, model,
  unlock: { research?: id, scrap: n }, stats: {…}, perLevel: { stat: { mul|add } }, tag?: tagId, rules?, triggers? }
// ability
{ id, name, icon, desc, mode: 'hold'|'tap', cooldown, fuel (pro s bei hold, sonst je Einsatz), heat, effects: [fx…], unlock }
```
Teile-Stufen (0 … `GARAGE.maxPartLevel` = 20): Wirkung `perLevel × L / (1 + L / balance.GARAGE.dimDivisor)` (Stufe 20 ≈ 12 effektive Stufen; `items/statMods.js → partDimLevels`), Kosten der nächsten Stufe `Basis × balance.GARAGE.costGrowth^L` mit Basis = `unlock.scrap` bzw. `GARAGE.starterUpgradeBase` bei Startteilen (`garage/garage.js → upgradeCost`).
Format-Anpassungen an den Inhaltsdaten (fehlende Felder, Startteile, Forschungs-Namen) passieren nur in `data/index.js` (Adapter), nie in den Inhaltsdateien.

### 4.9 Biome (`data/biomes.js`)
```js
{ id: 'schrottplatz', act: 1, name, icon, desc, gravity, palette: {…, gapWall, gapFloor, mud, sand, storm?},
  physics: { rollFriction, ambientHeat, landTolAdd }, tagBoost: { feuer: 0.25 },
  terrain: { hills: [[A, L]…], ampGrowth, rampEvery, rampHeight, rampAngleDeg },
  weather: [ { name, icon, weight, wind: [min, max], gust?, rain? } ],
  features: { weights: { typ: w }, minFloor: { typ: etage }, count: [grund, je Etage], params: { typ: {…} } },
  spawn: { gap, weights: { boltArc, boltGround, ring, obstacle, bigBolt, pickup }, obstacles },
  pickups: { fuel, cool, repair, scrap, crate }, targets: { stage: [m je Etage 0–5], eliteMult, boss: m },
  medals: { silver: 1.25, gold: 1.5 }, bosses: [ { id, name, icon, desc, sequence: [typ…], params, weather? } ], decor }
```
Baustein-Parameter `[leicht, schwer]` werden nach der Schwierigkeit (Etage/5, Elite +0,25, Boss 1) gewählt; Standardwerte `FEATURE_DEFAULTS`, Anzeige `FEATURE_INFO`.

### 4.9a StageSpec (`physics/trackGen.js`)
```js
{ v, biome, act, kind: 'stage'|'elite'|'boss', floor, bossId, bossName, seed, difficulty, target,
  medals: { bronze, silver?, gold }, medalList, length, hazards: [typ…], weather: { name, icon, wind, gust, rain, base, phase },
  blueprintX, features: [ { type, x0, x1, … } ] }
```
Bausteine (`x0…x1` = gesamter Platzbedarf, nie überlappend, ≥ `FEATURES.firstFree`): `hills {amp, humps}`, `ramp {rs, lip, h}`, `gap {rs, edge, far, width, h, depth}`, `mud/sand {friction}`, `loop {lx, r}`, `scrapPile {piles}`, `crusher {cx, w, period, open, phase}`, `wind {wind, gust}`, `thermal {x, w, strength, top}`, `heatZone {heat}`, `lightning {seed}`, `magnetZone {phase}`. Die Strecke ergänzt `yr` (Bezugshöhe eingeebneter Abschnitte).

### 4.10 Regel-Schalter (`rules`)
`heatIsFuel` (Perpetuum Mobile), `noOverheat` (Kühlschrank), `heatIsResource` (Waschmaschine), `setBonusDouble` (Badewanne), `groundSpeedStacks` (Rasenmäher), `collectScrapMass` (Mülltonne), `healOnCleanLanding` (Sofa), `shopDiscount` (Einkaufswagen), `lowGrip` (Raketenschlitten), `firstHitBounces`, `fuelRegenOnFlip` … – jede Regel wird an **genau einer** Stelle im Code ausgewertet (Physik oder Engine) und ist in `ARCHITEKTUR.md` → Anhang A gelistet.

## 5. Trigger-Engine (`items/triggerEngine.js`)

```js
const eng = new TriggerEngine({ sources, ctx, balance });
// sources: [{ id, kind:'item'|'set'|'chassis'|'part', tier, triggers, stats }]
eng.emit('flip', { dir: 'back', count: 1 });   // reiht ein
eng.update(dt);                                // Buffs/Cooldowns altern
eng.flush();                                   // arbeitet Warteschlange ab (1× pro Physik-Schritt)
eng.statMods();                                // aktuelle zeitweise Modifikatoren (Buffs, Stacks)
```
- Warteschlange (FIFO) mit `depth`: Ereignisse, die aus Effekten entstehen, bekommen `depth+1`. **`depth > balance.ITEMS.maxChainDepth (8)` → verworfen.** Zusätzlich max. `balance.ITEMS.maxEventsPerFlush (64)` pro Flush.
- Jede ausgelöste Quelle meldet `ctx.onTriggered(source, depth)` → HUD lässt das Item-Symbol hüpfen, ab Tiefe 3 „KETTENREAKTION ×n“.
- Limits (`perStage`, `cooldown`, `perRun`) leben im Engine-Zustand; `perRun`-Zähler kommen aus `runState`.
- `ctx` (von `stage.js` geliefert) ist die **einzige** Schnittstelle der Effekte zur Welt: `ctx.vehicle`, `ctx.addBolts(n)`, `ctx.addScrap(n)`, `ctx.heal(n)`, `ctx.damage(n, src)`, `ctx.popup(text, kind)`, `ctx.fx(name, data)`, `ctx.luck()`, `ctx.rng`.

**Umsetzung (Phase 4):**
- Die Etappe übergibt ihre `EventQueue` (`stage.queue`) und ihren `ModState` (`stage.mods`) – Warteschlange, Buffs, Stapel und Zähler gibt es nur einmal. `stage.flushEvents()` arbeitet nach jedem Physik-Schritt ab: Zähler, `hooks.event`, `engine.dispatch`, Regel `shockArc`; Rohereignisse, die Effekte dabei auslösen (Heilung, Schaden, Abprall, Überhitzung, eingesammelte Pickups), werden sofort mit Tiefe + 1 weitergegeben. Ein Gratis-Boost (`fx boost`) meldet sein `boost`-Ereignis im nächsten Physik-Schritt mit der Tiefe des auslösenden Effekts + 1 (`vehicle.freeBoostDepth`) – so bleibt die Kette Salto → Stromschlag → Boost → … zusammenhängend.
- Quellen: `{ uid, id, kind: 'chassis'|'part'|'set'|'item', name, icon, slot?, tier, scale, scaleUp?, triggers, rules }` aus `items/inventory.js → applyInventory` (Chassis immer, Teile mit Auslösern, aktive Set-Boni, Items). `scale` = ★-Faktor × tagBoost × Hybrid (0,75) bzw. 2 bei `setBonusDouble`; Reihenfolge Chassis → Teile → Sets → Items.
- Limits je Trigger (`<uid>#<index>`): `cooldown` in Engine-Zeit (`update(dt)`), `perStage` (Zähler, `stageStart` setzt zurück), `perRun` im Objekt `runCounters` (= `run.counters.trig`, Schlüssel `<kind>:<id>#<index>`). Bedingungen: `items/conditions.js` (alle Schlüssel aus 4.4/4.11; `heatAbove/heatBelow` in Hitze-Einheiten, `fuelBelow/hpBelow` als Anteil; im Run-Kontext nur `hpBelow` über `ctx.hpFrac()` und `chassis`).
- `ctx.onTriggered(source, depth, info)` → `hooks.triggered` → HUD (Symbol hüpft, Feed-Zeile; `info.echo` „×2“, `info.tierUp` „★+1“, `info.recharge` Aufblitzen). Ab `ITEMS.chainPopupDepth` (3) → `hooks.chain(n)` mit n = Tiefe + 1 („KETTENREAKTION ×n!“). Dev-Menü: Ketten-Log in der Konsole (`setChainLog`).
- Run-Kontext: `dispatchRunEvent` (in `run/runState.js → emitRunEvent`) mit einem ctx ohne Fahrzeug – `addBolts`/`addScrap`/`heal`/`damage`/`maxHp`/`maxFuel`/`upgradeItem` wirken auf den Run, Fahrzeug-Effekte entfallen, Zufall deterministisch aus Run-Seed + Ereigniszähler.

## 6. Physik (`physics/vehicle.js`)
- Fester Schritt `PHYSICS.dt = 1/120`; **adaptive Substeps**: `n = ceil(|v|·dt / PHYSICS.maxStepDist)` (max. `PHYSICS.maxSubsteps`).
- Luft: Schwerkraft, quadratischer Luftwiderstand (Wind-relativ), Auftrieb, Thermik, Boost-Schub mit **weicher Tempo-Grenze** (`thrustFactor = 1 / (1 + (v / speedSoftCap)^softCapPow)`), harte Grenze `PHYSICS.hardSpeedCap`.
- Neigen: `input.tilt ∈ {-1,0,1}` → Winkelbeschleunigung `airControl × flipSpeed`, max. `maxSpin`, Dämpfung, ohne Eingabe schwaches Ausrichten.
- Boden: Tangential-Tempo `s`, Hangabtrieb, Rollreibung (Oberfläche: normal/Schlamm/Sand; masseunabhängig), Antrieb (`driveAccel / mass^PHYSICS.driveMassExp`, kostet Treibstoff + Hitze), Abheben über Kuppen. Die Darstellung legt das Modell am Boden auf die Bodenhöhen unter beiden Achsen (`main.js → groundPose`), die Physik rechnet mit einem Punkt.
- Landung: Klassen `perfect/clean/bumpy/crash` wie bisher; **Aufprallschaden** aus Normalgeschwindigkeit über `impactThreshold`, reduziert durch `armor`. Schilde (`shield`) fangen erst Schaden ab `RESOURCES.shieldMinDamage` ab.
- Hitze/Treibstoff/Haltbarkeit im Fahrzeugzustand; Ereignisse werden in ein Array geschrieben (keine Callbacks im Physikschritt).
- Schlucht: mehr als `FEATURES.gap.fallDepth` unter der Kante (`track.gapAt(x).yr`) → Rohereignis `fall` (einmal) → Etappe: + `FEATURES.gap.fallDamage` (durchschlagend), Ende `fall` nach `STAGE.fallDelay`.
- Looping: geskriptete Kreisfahrt (`stepLoop`, Energieerhaltung, Antrieb/Boost vorwärts, Reibung): ganz herum → `loop {done:true}`, sonst Zurückrollen bzw. Ablösen oben (Normalkraft < 0) → freier Fall.
- Oberflächen: `track.frictionAt(x)` (Schlamm ×4, Sand ×1,6) auf die Rollreibung; Magnetkran über `env.ax/ay`; an scharfen Kanten (`PHYSICS.takeoffKink`) hebt die Kiste ab.

## 7. Etappe (`stage/stage.js`)
Zustände: `aim → fly → over`. `new Stage({ biome, spec, track, loadout, seed, hooks, durability, runMods, inventory, runInfo, farEnd })`, `update(realDt, input)` mit Akkumulator. Je Physik-Schritt: Umgebung (Wetter + Windzone, Biom- + Feldhitze, Magnetzug) → Fahrzeug → `objects.update` (Pressen, Magnet, Blitze) → Rohereignisse → Trigger-Engine. `inventory` = Run-Inventar (über `applyInventory` auf die Ausrüstung: Stats, Regeln, Set-Boni, Quellen), `runInfo = { bolts, counters }` (Run-Schrauben für `boltsAreFuel`/`boltHoardThrust`, perRun-Zähler), `farEnd` (Standard an; Dev-Testfahrten aus). Ergebnis: `{ cleared, medal: null|'bronze'|'silver'|'gold', dist, target, medals, medalList, kind, bolts, boltsSpent, scrap, blueprints, crates, pickups, stunts: {...}, damageTaken, durability, durabilityMax, itemTriggers, maxChain, napped, reason: 'stop'|'wreck'|'fall'|'time'|'far', testDrive }` (`cleared` = mindestens Bronze und kein Totalschaden; `far` = Gold × `STAGE.farMul` erreicht – beendet Item-Kreisläufe, die sonst bis `STAGE.maxTime` liefen).

## 8. Run (`run/runState.js`)
Reiner Zustand, serialisierbar (Run kann gespeichert und fortgesetzt werden):
```js
{ seed, ascension, chassisId, parts, abilities, act, map, pos:{floor, node}, durability, durabilityMax,
  bolts, inventory:[{itemId, tier, hybrid?}], reserve, runMods:{maxFuelAdd, coolMul, …}, counters, history, stats }
```
Aktionen geben neue Teilzustände zurück bzw. mutieren kontrolliert; UI ruft nur Aktionen auf.
Phase 4: `inventory` (Start-Item je Chassis über `starterItem`/`starterTag`), `pendingChoices: [{ context: 'stage'|'elite'|'boss'|'crate', items, skipBolts }]` (nach jeder geschafften Etappe 1 + je Item-Kiste 1; `rollItemChoices` in `run/rewards.js`: Seltenheit nach `ITEMS.rarityWeights[context]` × `rarityActMul[act]`, Pool = `base` + erledigte Pool-Forschung bzw. `poolAll` (Dev), nie verflucht, nie schon Besessenes, Anzahl = Stat `itemChoices`), `poolAll`, `counters: { trig, rolls, events }`; Aktionen `pickItem(run, save, i, replace?)` (voller Rucksack → `reason: 'full'`, dann mit Platz ersetzen), `skipChoice` (+ `REWARDS.itemSkipBolts[act]`), `giveItem`, `queueChoice`, `emitRunEvent` (runStart, nodeEnter, shopEnter beim Händler, stageClear, itemGained), `runStats`/`durabilityMax`/`itemSlots`/`inventoryView` (Werte inkl. Items, Sets und Biom des Akts), `runStageSetup` (alles für `new Stage`), `normalizeRun` (Phase-3-Runs bekommen die neuen Felder), Dev: `devAddItem`, `devTierUp`. Kodex `save.codex.items[id]` = 1 gesehen (angeboten) / 2 besessen, `save.codex.sets['feuer4']` = 1.
Umgesetzt (Phase 3): `newRun(save)`, `reachableNodes`, `enterNode` (→ `stage`/`station`/`placeholder`), `stageSpecFor` (Seed aus Run-Seed + Akt + Knoten → Neuversuch = gleiche Strecke), `applyStageResult(run, result, save)` (Belohnungen über `run/rewards.js`, Abschleppen `RUN.towPenalty`, Boss → `setupAct` bzw. Sieg), `chooseStation`, `visitPlaceholder`, `giveUp`, `endRun(save, run)` (Meta-Auszahlung, Statistik, Meilensteine, `save.run = null`), Dev-Helfer. Zusätzliche Felder: `biome, bossIds, current: {node, type, attempts}, visited, path, durabilityBase, earned: {scrap, blueprints, cores, actScrap}, bossesBeaten, over: {won, reason, act}, research`. Die Run-Ausrüstung ist ab dem Start fest (`runLoadout`).

## 9. Kamera & Floating Origin
- `camera/cameraRig.js`: Ziel-Breite `lerp(CAMERA.minWidth, CAMERA.maxWidth, f(speed, altitude))`, weich (`1-exp(-k·dt)`), Vorausschau in Bewegungsrichtung, danach **harte Klemmung**: Auto liegt immer im Sicherheitsrahmen (`CAMERA.safeMargin` vom Rand). Passt Auto + Boden nicht mehr ins Bild, hat das Auto Vorrang; `indicator` liefert `{show, side, text}` für den Rand-Pfeil („Boden ↓ 340 m“).
- `render/origin.js`: Render-Ursprung springt in `ORIGIN.shiftEvery`-Schritten mit; alle Meshes werden relativ positioniert, Gelände-Chunks haben lokale Koordinaten.

## 10. Speichern (`save/save.js`)
Schema **v3** (`SAVE_VERSION = 3`). `migrate()` ersetzt fehlende **und falsch typisierte** Felder durch Standardwerte; ein nicht ladbarer Stand wird als Rohtext unter `schleuderwerk.save.bak` gesichert, bei einem Stand aus einer neueren Version wird nicht gespeichert, bis die Person „Neu anfangen“ bestätigt. Schema: `{ version, meta: {scrap, blueprints, cores, totalPlaytime, milestones:{id: Spielzeit s}}, garage: {chassis, ownedChassis:[…], parts:{slot:partId}, ownedParts:[…], partLevels:{partId: level}, abilities:[ids]}, research: {done:[…]}, ascension: {unlocked, best}, codex: {items:{…}, sets:{…}}, cosmetics: {owned, paint}, settings, stats, run: <laufender Run oder null>, tutorial }` (das Übergangsfeld `worlds` aus Phase 1–2 entfällt seit Phase 3; Bestweiten landen in `stats.bestDist`, ein Run mit fremdem Format – `isValidRun` – wird verworfen). Migration v2 → v3: altes Geld → Startschrott (`money/40`, max. 400), Einstellungen und Rekorde (Bestweite/-höhe) bleiben, Rest neu. Export `SW3:` + Base64; ältere `SW2:`-Texte laufen beim Import durch die Migration. Nach jeder Migration prüft `garage/garage.js → sanitizeGarage` die IDs gegen die aktuellen Inhaltsdaten.

## 11. Tests & Qualitätssicherung
- `node --test tests/` – Physik (kein Durchtunneln bei 150 m/s, Soft-Cap), Trigger-Engine (Kettentiefe, Limits), Karte (Erreichbarkeit, Regeln), Shops, Speichern/Migration.
- `tools/smoke.mjs` – Playwright-Rauchtest (startet Spiel, spielt eine Etappe, prüft Konsole auf Fehler).
- `tools/sim/` – Balance-Simulator: `bot.mjs` (Bot spielt Etappen mit echter Physik), `calibrate.mjs` (Zielmarken je Biom/Etage, `--apply`, Ergebnis `docs/BALANCE.md`); Ökonomie-Hochrechnung der Spielzeit-Meilensteine folgt in Phase 5/6.

## Anhang A – Regel-Schalter und ihre Auswertungsstelle
Jede Regel wird an **genau einer** Stelle ausgewertet. Parameter stehen in `balance.RULES`, die Regeln sammelt `items/inventory.js → applyInventory` (Chassis und Teile über `garage/loadout.js → collectRules`, dazu Items, Flüche und aktive Set-Boni) und die Etappe gibt sie weiter (`stage.rules`, `vehicle.rules`, Trigger-Engine). `setBonusDouble` wählt bei Set-Regeln die „…Double“-Parameter (nur wo die ruleSpec es beschreibt).

| Regel | Quelle | Auswertung | Stand |
|---|---|---|---|
| `noOverheat` | Chassis Kühlschrank, Fluch Ewiger Eiszapfen | `physics/vehicle.js → checkOverheat()`: Hitze bei heatMax gedeckelt, kein overheat-Ereignis, kein Stillstand, kein Schaden | Phase 2 ✔ (Item: Phase 4 ✔) |
| `heatIsResource` | Chassis Waschmaschine | `physics/vehicle.js → checkOverheat()` (Deckel, overheat ohne Stillstand/Schaden) + `updateResources()` (wieder scharf unter `RESOURCES.heatResourceRearm` × heatMax) | Phase 2 ✔ |
| `lowGrip` | Chassis Raketenschlitten | `physics/vehicle.js → stepGround()`: Antrieb × `RULES.lowGrip.driveMul`, Rollreibung × `frictionMul`, Abheben ab takeoffMinSpeed × `takeoffMul`; Notbremse dauert `RULES.hardStop.lowGripTime` (`startBrake()`) | Phase 2 ✔ (Faktoren 0,5; ruleSpec nennt 0,4/0,6 und halbe Oberflächen-Faktoren → bei Bedarf nur `RULES.lowGrip` anpassen) |
| `collectScrapMass` | Chassis Mülltonne | `stage/stage.js → onHit()` + Konstruktor (Schrott-Pickups über `physics/objects.js`), Anzeige `render/vehicleModel.js → setScrap()` | Phase 2 ✔ |
| `boostHold` | Fähigkeit Boost | `physics/vehicle.js → updateResources()`; Eingabe `stage/abilities.js` | Phase 2 ✔ |
| `parachute` | Fähigkeit Fallschirm | `physics/vehicle.js → stepAir()`, `toggleParachute()` | Phase 2 ✔ |
| `hardStop` | Fähigkeit Notbremse | `physics/vehicle.js → stepGround()` / `hardStop()` | Phase 2 ✔ |
| `heatToThrust` | Fähigkeit Schleudergang | `stage/stage.js → heatToThrust()` | Phase 2 ✔ |
| `healOnCleanLanding` | Chassis Sofa | `items/triggerEngine.js → chassisLandingRules()` (landing der Chassis-Quelle, vor allen Auslösern; `RULES.healOnCleanLanding`: 1× je 0,5 s, max. 15 je Etappe) | Phase 4 ✔ |
| `groundSpeedStacks` | Chassis Rasenmäher | `items/triggerEngine.js → chassisLandingRules()` (Bruchlandung halbiert den groundTouch-Stapel, abgerundet auf volle Schritte); HUD-Drehzahl `stage.chassisStackFrac()` | Phase 4 ✔ |
| `setBonusDouble` | Chassis Badewanne | `items/inventory.js → buildSetParts()` (Set-Stats ×2, Engine-Faktor 2, stack.max ×2, chance.p ×2 ≤ chanceMax) | Phase 4 ✔ |
| `tagBoost` | Chassis Kühlschrank (+ Biom `tagBoost`) | `items/inventory.js → applyInventory()/buildItemParts()` (Faktor 1 + größter Wert der Item-Tags; Chassis und Biom addieren sich je Tag) | Phase 4 ✔ |
| `overheatAfterburner` | Feuer-Set 6 | `physics/vehicle.js → checkOverheat()` (overheat ohne Sperre/Schaden, 2 s Nachbrenner-Boost ×1,5 ohne Hitze, alle 8 s) | Phase 4 ✔ |
| `coldGlide` | Eis-Set 6 | `physics/vehicle.js → stepGround()` (unter 40 Hitze Rollreibung ×0,25, Oberflächen-Faktor 1) | Phase 4 ✔ |
| `shockArc` | Elektro-Set 6 | `stage/stage.js → shockArc()` beim shock-Ereignis (Suche `physics/objects.js → arcStrike()`) | Phase 4 ✔ |
| `spinToSpeed` | Gyro-Set 6 | `items/triggerEngine.js → spinToSpeed()` nach den landing-Auslösern der Set-Quelle | Phase 4 ✔ |
| `mutualAttraction` | Magnet-Set 6 | `physics/vehicle.js → ruleForces()` (Ziel `physics/objects.js → nearestPickupAhead()`; Schrauben zählen als Pickups) | Phase 4 ✔ |
| `wreckingBall` | Schrott-Set 6 | `physics/objects.js → hitObstacle()` (Rohereignis `wreck` → `stage.js → onWreck()`: collision mit damage 0, Schrott-Pickups) | Phase 4 ✔ |
| `impactToThrust` | Hydraulik-Set 6 | `physics/vehicle.js → land()` (Aufprallschaden → Schub; Bruch: Aufprallteil × 0,5; holprig-Zuschlag bleibt) | Phase 4 ✔ |
| `gapTrampoline` | Gummi-Set 6 | `physics/vehicle.js → checkFall()` / `trampoline()` | Phase 4 ✔ |
| `boostOvercap` | Raketen-Set 6 | `physics/vehicle.js → thrustCap` (Boost-Schub und Sofort-Schub während eines Boosts) | Phase 4 ✔ |
| `luckyEcho` | Glück-Set 6 | `items/triggerEngine.js → luckyEcho()` | Phase 4 ✔ |
| `heatIsFuel` | Perpetuum Mobile | `physics/vehicle.js → updateResources()` (`heatFuelMode`, Notbetrieb aus dem Tank) | Phase 4 ✔ |
| `flipsNeverCrash` | Schiffskompass | `physics/vehicle.js → land()` | Phase 4 ✔ |
| `obstacleBounce` | Hüpfburg | `physics/objects.js → hitObstacle()` (wreckingBall hat Vorrang) | Phase 4 ✔ |
| `boostHorizontal` | Wasserwaagen-Rakete | `physics/vehicle.js → stepAir()` | Phase 4 ✔ |
| `perfectLaunchLowGrav` | Levitron | `physics/vehicle.js → launch()` + `gravity` (Luft-Schritt) | Phase 4 ✔ |
| `allLandingsPerfect` | Hubstützen | `physics/vehicle.js → land()` (mit `noPerfectLanding` zusammen: normale Einstufung) | Phase 4 ✔ |
| `doubleDamage` | Hubstützen | `physics/vehicle.js → damage()` – Abweichung von der ruleSpec (stage.js ctx.damage): jeder Haltbarkeitsverlust läuft über `vehicle.damage`, auch der aus `ctx.damage` | Phase 4 ✔ |
| `boltsAreFuel` | Schraubenvergaser | `stage/stage.js` (setzt `vehicle.fuelBackup`; bezahlt über `ctx.addBolts(-1)`, Ergebnis `boltsSpent` → `applyStageResult`) | Phase 4 ✔ |
| `boltHoardThrust` | Schraubenvergaser | `stage/stage.js → updateBoltHoard()` (beim Neuberechnen der Stats) | Phase 4 ✔ |
| `shockRecharge` | Teslaspule | `items/triggerEngine.js → shockRecharge()` (greift nur, wenn eine Abklingzeit läuft) | Phase 4 ✔ |
| `everyThirdTierUp` | Dreiblatt-Klee | `items/triggerEngine.js → tryTrigger()` (★3 → `RULES.everyThirdTierUp.beyondMax`) | Phase 4 ✔ |
| `iceLanding` | Schlittschuhkufen | `physics/vehicle.js → land()` | Phase 4 ✔ |
| `blackCatNap` | Fluch Schwarze Katze | `stage/stage.js → pickNap()` beim Zusammenstellen der Quellen | Phase 4 ✔ |
| `noPerfectLanding` | Fluch Gummihuhn | `physics/vehicle.js → land()` | Phase 4 ✔ |
| `obstacleMagnet` | Fluch Geisterbahn-Magnet | `physics/vehicle.js → ruleForces()` (Ziel `physics/objects.js → nearestObstacle()`) | Phase 4 ✔ |
| `endlessSpin` | Fluch Spieluhr | `physics/vehicle.js → stepAir()` | Phase 4 ✔ |
| `firstHitBounces`, `fuelRegenOnFlip` | – | in keinem Inhalt verwendet, keine ruleSpec → nicht umgesetzt | – |

Schnittstellen: `stage.queue`, `stage.mods`, `stage.engine` (Trigger-Engine), `stage.ctx`, `stage.onEvent(name, data, depth)` (Beobachter für Tests), `stage.setup` (Ergebnis von `applyInventory`: Quellen, aktive Sets, Tag-Zählung).

## 4.11 Vollständiges Vokabular (verbindlich für alle Inhalte)

**Stats** (`items/statMods.js → STATS`): `launchSpeed, launchPerfectBonus, sweetSpotWidth, mass, drag, lift, airControl, maxSpin, flipSpeed, autoLevel, boostThrust, boostFuel, boostHeat, boostSelfDamage, driveAccel, driveFuel, driveHeat, rollFriction, fuelMax, heatMax, heatGain, coolRate, durabilityMax, armor, impactThreshold, landTolDeg, perfectLandDeg, magnet, speedSoftCap, luck, boltGain, scrapGain, itemSlots, abilitySlots, abilityCooldown, bounce, shopDiscount, rerollDiscount, itemChoices, repairBonus`
(`boostHeat` darf durch `mul` negativ werden = Boost kühlt. `armor` ist Schadensreduktion 0…0,6. `heatGain` multipliziert alle Hitzezunahmen. `abilityCooldown` < 1 = schneller.)

**Ereignisse in der Etappe**: siehe 4.2 + `boostSecond {}` (jede volle Sekunde Boost).
**Ereignisse im Run (außerhalb der Etappe, ctx ohne Fahrzeug)**: `runStart {}`, `nodeEnter {type}`, `stageClear {medal, kind:'stage'|'elite'|'boss'}`, `itemGained {itemId}`, `shopEnter {}`.

**Effekte**: Tabelle 4.3 + nur im Run-Kontext: `maxHp {amount}` (dauerhaft für den Run), `maxFuel {amount}`, `upgradeItem {}` (zufälliges Item ★+1).

**Bedingungen**: 4.4 + `nodeType, medal, chassis`.

**Regeln**: `heatIsFuel, noOverheat, heatIsResource, setBonusDouble, groundSpeedStacks, collectScrapMass, healOnCleanLanding, lowGrip, firstHitBounces` + Regeln aus Legendär-/Fluch-Items und Set 6 (vollständige Liste mit Auswertungsstelle: Anhang A). Jede neue Regel braucht im Datensatz ein Feld `ruleSpec: { <regel>: 'präzise Beschreibung der Mechanik für die Programmierung' }`. Neue Inhaltsdateien prüft `node tools/validateContent.mjs` (auch Teil von `npm test`).

**Skalierte Parameter-Schlüssel** (★-Stufen): `amount, pct, dur, radius, add, mul`. Stufenfaktor ★1/★2/★3 = 1,0/1,6/2,3 (`balance.ITEMS.tierMult`).
