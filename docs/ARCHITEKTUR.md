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

Plan für alle Phasen; Dateien, die es noch nicht gibt, kommen mit ihrer Phase. **Ist-Stand nach Phase 2** (zusätzlich bzw. abweichend vom Plan):
`data/worlds.js` (Welten bis Phase 3, dann `biomes.js`), `platform/input.js` (Touch/Tastatur), `ui/garage.js`, `ui/results.js`, `ui/menus.js` (Pause/Einstellungen), `ui/popups.js`, `ui/statLabels.js` (Stat-/Tag-Anzeige), `ui/hud.js`, `ui/devMenu.js`, `ui/dom.js` statt `ui/screens/*.js`; `items/events.js`, `items/eventQueue.js`, `items/modState.js` (Vorstufen der Trigger-Engine); noch nicht vorhanden: `core/bus.js`, `data/tags.js`/`items.js`/`biomes.js`/…, `run/`, `map/`, `shops/`, `garage/research.js`, `items/triggerEngine.js`/`inventory.js`/`conditions.js`, `tools/sim/` (Bot-Simulation bisher nur in `tests/balance.test.mjs`).

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
  trackGen.js           generateStageSpec(biome, kind, floor, act, ascension, rng)
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

Tests: `tests/*.test.mjs` (`node --test tests/` lädt `tests/index.js`), Lade-Hooks für three.js-Tests in `tests/support/`, Balance-Simulator: `tools/sim/` (geplant).

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
| `jump` | `amount` (m/s) | Impuls nach oben (am Boden: abheben) |
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
{ id: 'schrottplatz', act: 1, name, palette: {…}, gravity, physics: { rollFriction, ambientHeat, … },
  weather: [ … ], features: { hills, ramps, gaps, mud, loops, scrapPiles, crushers, wind, thermals, lightning },
  pickups: { … }, targets: { stage: [m je Etage], eliteMult, boss: m }, bosses: [ { id, name, desc, spec } ] }
```

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

## 6. Physik (`physics/vehicle.js`)
- Fester Schritt `PHYSICS.dt = 1/120`; **adaptive Substeps**: `n = ceil(|v|·dt / PHYSICS.maxStepDist)` (max. `PHYSICS.maxSubsteps`).
- Luft: Schwerkraft, quadratischer Luftwiderstand (Wind-relativ), Auftrieb, Thermik, Boost-Schub mit **weicher Tempo-Grenze** (`thrustFactor = 1 / (1 + (v / speedSoftCap)^softCapPow)`), harte Grenze `PHYSICS.hardSpeedCap`.
- Neigen: `input.tilt ∈ {-1,0,1}` → Winkelbeschleunigung `airControl × flipSpeed`, max. `maxSpin`, Dämpfung, ohne Eingabe schwaches Ausrichten.
- Boden: Tangential-Tempo `s`, Hangabtrieb, Rollreibung (Oberfläche: normal/Schlamm/Sand; masseunabhängig), Antrieb (`driveAccel / mass^PHYSICS.driveMassExp`, kostet Treibstoff + Hitze), Abheben über Kuppen. Die Darstellung legt das Modell am Boden auf die Bodenhöhen unter beiden Achsen (`main.js → groundPose`), die Physik rechnet mit einem Punkt.
- Landung: Klassen `perfect/clean/bumpy/crash` wie bisher; **Aufprallschaden** aus Normalgeschwindigkeit über `impactThreshold`, reduziert durch `armor`. Schilde (`shield`) fangen erst Schaden ab `RESOURCES.shieldMinDamage` ab.
- Hitze/Treibstoff/Haltbarkeit im Fahrzeugzustand; Ereignisse werden in ein Array geschrieben (keine Callbacks im Physikschritt).
- Schlucht: unter `track.gapFloorY` → Ereignis `fall` → Etappe endet.
- Looping: geskriptetes Kreis-Segment (bei genug Tempo durchfahren, sonst zurückrollen).

## 7. Etappe (`stage/stage.js`)
Zustände: `launch → fly → over`. `update(realDt, input)` mit Akkumulator. Ergebnis: `{ cleared, medal: null|'bronze'|'silver'|'gold', dist, target, bolts, scrap, blueprints, stunts: {...}, damageTaken, reason }`.

## 8. Run (`run/runState.js`)
Reiner Zustand, serialisierbar (Run kann gespeichert und fortgesetzt werden):
```js
{ seed, ascension, chassisId, parts, abilities, act, map, pos:{floor, node}, durability, durabilityMax,
  bolts, inventory:[{itemId, tier, hybrid?}], reserve, runMods:{maxFuelAdd, coolMul, …}, counters, history, stats }
```
Aktionen geben neue Teilzustände zurück bzw. mutieren kontrolliert; UI ruft nur Aktionen auf.

## 9. Kamera & Floating Origin
- `camera/cameraRig.js`: Ziel-Breite `lerp(CAMERA.minWidth, CAMERA.maxWidth, f(speed, altitude))`, weich (`1-exp(-k·dt)`), Vorausschau in Bewegungsrichtung, danach **harte Klemmung**: Auto liegt immer im Sicherheitsrahmen (`CAMERA.safeMargin` vom Rand). Passt Auto + Boden nicht mehr ins Bild, hat das Auto Vorrang; `indicator` liefert `{show, side, text}` für den Rand-Pfeil („Boden ↓ 340 m“).
- `render/origin.js`: Render-Ursprung springt in `ORIGIN.shiftEvery`-Schritten mit; alle Meshes werden relativ positioniert, Gelände-Chunks haben lokale Koordinaten.

## 10. Speichern (`save/save.js`)
Schema **v3** (`SAVE_VERSION = 3`). `migrate()` ersetzt fehlende **und falsch typisierte** Felder durch Standardwerte; ein nicht ladbarer Stand wird als Rohtext unter `schleuderwerk.save.bak` gesichert, bei einem Stand aus einer neueren Version wird nicht gespeichert, bis die Person „Neu anfangen“ bestätigt. Schema: `{ version, meta: {scrap, blueprints, cores, totalPlaytime, milestones:{id: Spielzeit s}}, garage: {chassis, ownedChassis:[…], parts:{slot:partId}, ownedParts:[…], partLevels:{partId: level}, abilities:[ids]}, research: {done:[…]}, ascension: {unlocked, best}, codex: {items:{…}, sets:{…}}, cosmetics: {owned, paint}, settings, stats, worlds: {current, unlocked, records} (Übergang bis Phase 3), run: <laufender Run oder null>, tutorial }`. Migration v2 → v3: altes Geld → Startschrott (`money/40`, max. 400), Einstellungen, Rekorde und freigeschaltete Welten bleiben, Rest neu. Export `SW3:` + Base64; ältere `SW2:`-Texte laufen beim Import durch die Migration. Nach jeder Migration prüft `garage/garage.js → sanitizeGarage` die IDs gegen die aktuellen Inhaltsdaten.

## 11. Tests & Qualitätssicherung
- `node --test tests/` – Physik (kein Durchtunneln bei 150 m/s, Soft-Cap), Trigger-Engine (Kettentiefe, Limits), Karte (Erreichbarkeit, Regeln), Shops, Speichern/Migration.
- `tools/smoke.mjs` – Playwright-Rauchtest (startet Spiel, spielt eine Etappe, prüft Konsole auf Fehler).
- `tools/sim/` – Balance-Simulator (Bot spielt Etappen mit echter Physik; Ökonomie-Hochrechnung der Spielzeit-Meilensteine).

## Anhang A – Regel-Schalter und ihre Auswertungsstelle
Jede Regel wird an **genau einer** Stelle ausgewertet. Parameter stehen in `balance.RULES`, die Regeln selbst sammelt `items/statMods.js → collectRules` (Chassis, Teile; ab Phase 4 Items und Sets) und `garage/loadout.js` gibt sie an die Etappe (`stage.rules`, `vehicle.rules`).

| Regel | Quelle | Auswertung | Stand |
|---|---|---|---|
| `noOverheat` | Chassis Kühlschrank | `physics/vehicle.js → checkOverheat()`: Hitze bei heatMax gedeckelt, kein overheat-Ereignis, kein Stillstand, kein Schaden | Phase 2 ✔ |
| `heatIsResource` | Chassis Waschmaschine | `physics/vehicle.js → checkOverheat()` (Deckel, overheat ohne Stillstand/Schaden) + `updateResources()` (wieder scharf unter `RESOURCES.heatResourceRearm` × heatMax) | Phase 2 ✔ |
| `lowGrip` | Chassis Raketenschlitten | `physics/vehicle.js → stepGround()`: Antrieb × `RULES.lowGrip.driveMul`, Rollreibung × `frictionMul`, Abheben ab takeoffMinSpeed × `takeoffMul`; Notbremse dauert `RULES.hardStop.lowGripTime` (`startBrake()`) | Phase 2 ✔ (Faktoren 0,5 laut Auftrag; ruleSpec nennt 0,4/0,6 und halbe Oberflächen-Faktoren → bei Bedarf nur `RULES.lowGrip` anpassen; Oberflächen kommen mit Phase 3) |
| `collectScrapMass` | Chassis Mülltonne | `stage/stage.js → onHit()` (Schrottberg: Schaden × ⅓, Resttempo halb zwischen hitSpeedKeep und 1, danach pickup {kind:'scrap'}) und Konstruktor (Schrott-Pickups über `physics/objects.js`, Option `scrapPickups`); Anzeige der Ladung in `render/vehicleModel.js → setScrap()` | Phase 2 ✔ |
| `boostHold` | Fähigkeit Boost | `physics/vehicle.js → updateResources()` (Schub, boostFuel/boostHeat/boostSelfDamage pro s, Ereignisse boost/boostSecond – auch beim Wechsel Gratis ↔ bezahlt); Eingabe in `stage/abilities.js`, abilityUse {boost} beim echten Start (`stage/stage.js` beim Ereignis boost {free:false}) | Phase 2 ✔ |
| `parachute` | Fähigkeit Fallschirm | `physics/vehicle.js → stepAir()` (Sinktempo-Führung, Luftwiderstand × `RULES.parachute.dragMul`), `toggleParachute()` (nur in der Luft, erneut tippen = kappen); Buffs der Fähigkeit enden mit dem Schirm (`stage/abilities.js → parachuteClosed()`) | Phase 2 ✔ |
| `hardStop` | Fähigkeit Notbremse | `physics/vehicle.js → stepGround()` / `hardStop()` (Bremsung, Antriebspause, in der Luft „scharf“ bis zur Landung) | Phase 2 ✔ |
| `heatToThrust` | Fähigkeit Schleudergang | `stage/stage.js → heatToThrust()` (Hitze × Faktor als Sofort-Schub, Hitze 0, ab `RULES.heatToThrust.explodeAt` explosion-Ereignis) | Phase 2 ✔ |
| `healOnCleanLanding` | Chassis Sofa | `items/triggerEngine.js` (landing-Ereignis der Chassis-Quelle) | offen – Phase 4 |
| `groundSpeedStacks` | Chassis Rasenmäher | `items/triggerEngine.js` (Stapel der Chassis-Quelle) | offen – Phase 4 |
| `setBonusDouble` | Chassis Badewanne | `items/inventory.js` (Aufbau der Set-Quellen) | offen – Phase 4 |
| `tagBoost` | Chassis Kühlschrank | `items/inventory.js` (Aufbau der Item-Quellen) | offen – Phase 4 |
| `firstHitBounces`, `heatIsFuel`, `fuelRegenOnFlip`, `overheatAfterburner` … | Items/Sets | laut ihrer `ruleSpec` | offen – Phase 4–6 |

Schnittstellen für Phase 4: `stage.queue` (Ereignis-Warteschlange mit Kettentiefe, `items/eventQueue.js`), `stage.onEvent(name, data, depth)` (wird nach jedem Physik-Schritt für jedes Ereignis aufgerufen), `stage.ctx` (Effekt-Kontext nach §5, inkl. `ctx.depth`/`ctx.source`), `stage.mods` (`items/modState.js`: Buffs, Stapel, Zähler – die Etappe rechnet die Werte bei Änderung neu), `loadout.sources` (Auslöser von Chassis und Teilen).

## 4.11 Vollständiges Vokabular (verbindlich für alle Inhalte)

**Stats** (`items/statMods.js → STATS`): `launchSpeed, launchPerfectBonus, sweetSpotWidth, mass, drag, lift, airControl, maxSpin, flipSpeed, autoLevel, boostThrust, boostFuel, boostHeat, boostSelfDamage, driveAccel, driveFuel, driveHeat, rollFriction, fuelMax, heatMax, heatGain, coolRate, durabilityMax, armor, impactThreshold, landTolDeg, perfectLandDeg, magnet, speedSoftCap, luck, boltGain, scrapGain, itemSlots, abilitySlots, abilityCooldown, bounce, shopDiscount, rerollDiscount, itemChoices, repairBonus`
(`boostHeat` darf durch `mul` negativ werden = Boost kühlt. `armor` ist Schadensreduktion 0…0,6. `heatGain` multipliziert alle Hitzezunahmen. `abilityCooldown` < 1 = schneller.)

**Ereignisse in der Etappe**: siehe 4.2 + `boostSecond {}` (jede volle Sekunde Boost).
**Ereignisse im Run (außerhalb der Etappe, ctx ohne Fahrzeug)**: `runStart {}`, `nodeEnter {type}`, `stageClear {medal, kind:'stage'|'elite'|'boss'}`, `itemGained {itemId}`, `shopEnter {}`.

**Effekte**: Tabelle 4.3 + nur im Run-Kontext: `maxHp {amount}` (dauerhaft für den Run), `maxFuel {amount}`, `upgradeItem {}` (zufälliges Item ★+1).

**Bedingungen**: 4.4 + `nodeType, medal, chassis`.

**Regeln**: `heatIsFuel, noOverheat, heatIsResource, setBonusDouble, groundSpeedStacks, collectScrapMass, healOnCleanLanding, lowGrip, firstHitBounces` + Regeln aus Legendär-/Fluch-Items. Jede neue Regel braucht im Datensatz ein Feld `ruleSpec: { <regel>: 'präzise Beschreibung der Mechanik für die Programmierung' }`.

**Skalierte Parameter-Schlüssel** (★-Stufen): `amount, pct, dur, radius, add, mul`. Stufenfaktor ★1/★2/★3 = 1,0/1,6/2,3 (`balance.ITEMS.tierMult`).
