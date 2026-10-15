# Schleuderwerk

Launch-&-Bastel-Spiel in 3D-Low-Poly (Three.js): In der Garage aus Schrott eine verrückte Kiste bauen (Chassis + Teile + Fähigkeiten), dann abschießen, in der Luft steuern, landen. Design: [docs/V2-DESIGN.md](docs/V2-DESIGN.md) (früher [GDD.md](GDD.md)), Technik: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md), Umbau-Stand und Testanleitung: [docs/PHASEN.md](docs/PHASEN.md).

## Prototyp im Handy-Browser testen

Voraussetzung: Python ist installiert (ist bei dir schon der Fall), PC und Handy sind im **selben WLAN**.

1. Im Ordner `AutoEvolution` ein Terminal öffnen und eingeben:
   ```
   python tools/serve.py
   ```
2. Es erscheinen zwei Adressen, z. B.
   ```
   Am PC:       http://localhost:8137
   Am Handy:    http://192.168.178.23:8137
   ```
3. Am Handy in Chrome die **Handy-Adresse** eintippen.
   - Fragt Windows beim ersten Start nach der Firewall: „Private Netzwerke“ erlauben.
   - Tipp: Im Chrome-Menü ⋮ → „Zum Startbildschirm hinzufügen“, dann startet es fast wie eine App.
4. Beenden: im Terminal `Strg + C`.

Der Spielstand liegt im Browser des Handys. In der App (kommt im nächsten Schritt) gibt es einen eigenen Spielstand. Mit **⚙ → Exportieren / Importieren** kannst du ihn übertragen.

## Steuerung

**Garage** (Startbildschirm): ◀ ▶ = Chassis wählen (gesperrte zeigen ihre Bedingungen) · Slot-Zeile antippen = Teile-Auswahl (Werte-Vergleich, Kaufen ⚙, Ausrüsten, Verbessern) · „▲ ⚙“ = Teil eine Stufe verbessern · Fähigkeiten-Chip antippen = Fähigkeit für den Slot wählen · **RUN STARTEN ▶** = Run beginnen (Karte Akt 1) bzw. **RUN FORTSETZEN ▶** / „Aufgeben“ bei laufendem Run · 📖 = Kompendium (entdeckte Items und Set-Boni) · ⚙ = Einstellungen (Export/Import). Geheim: in den Einstellungen 7× schnell auf die Versionsnummer tippen = Dev-Menü.

**Karte** (Run): erreichbare Knoten pulsieren – antippen. Etappen zeigen erst ein Intro (Ziel, Medaillen, Gefahren, Wetter) → **LOS ▶**. 🔧 oben links = zurück in die Garage (der Run bleibt gespeichert). Die Item-Leiste unter der Haltbarkeit antippen = Inventar mit Set-Übersicht. Nach jeder geschafften Etappe: **1 Item aus 3 wählen** (oder Schrauben), je eingesammelter 📦 Item-Kiste eine weitere Auswahl.

**Etappe**

| Phase | Eingabe (Handy) | Wirkung |
|---|---|---|
| Abschuss | Finger **irgendwo halten** | Die Kraft pendelt automatisch 0 → 100 % → 0 (Kraftleiste rechts) |
| Abschuss | beim Halten **hoch/runter ziehen** | Winkel steiler/flacher (10°–70°) |
| Abschuss | **loslassen** | Abschuss. Steht die Kraft in der **grünen Zone** = perfekter Abschuss (+15 %, Zeitlupe) |
| Flug | **linke Bildschirmhälfte halten** | Nase hoch (Drehung gegen den Uhrzeigersinn) – Dauerhalten ≈ 1 Salto pro Sekunde |
| Flug | **rechte Bildschirmhälfte halten** | Nase runter (Drehung im Uhrzeigersinn) |
| Flug | nichts halten | Drehung läuft aus, die Kiste richtet sich leicht in Flugrichtung aus |
| jederzeit | **großer Knopf unten rechts** | Fähigkeit 1 (z. B. 🚀 Boost: halten – kostet Treibstoff und macht Hitze) |
| jederzeit | **Knopf links daneben** | Fähigkeit 2 (z. B. 🦘 Hüpfer: tippen, danach Abklingzeit = Ring) |
| jederzeit | **Knopf darüber** | Spezialfähigkeit des Chassis (z. B. 🌀 Schleudergang der Waschmaschine) |
| Boden | – | Der Antrieb schiebt automatisch, solange Treibstoff da ist |

Mehrere Finger gleichzeitig sind erlaubt (z. B. links halten **und** Boost). Unten links: ⛽ Treibstoff, 🌡 Hitze (blinkt ab 80 %, bei 100 % „ÜBERHITZT“ = 2 s kein Boost/Antrieb), 🔧 Haltbarkeit (bei 0 Totalschaden). Ist der Boden nicht mehr im Bild, zeigt ein Pfeil unten die Höhe an („Boden ↓ 340 m“).

**Am PC (Test):** Leertaste halten/loslassen = Abschuss · Pfeil ↑/↓ beim Zielen = Winkel · Leertaste im Flug = Boost · **1–4** = Fähigkeit 1–4 · Pfeil ←/→ = Nase hoch/runter.

## Projektstruktur

```
www/                        ← das komplette Spiel (wird in die App gepackt)
  index.html, style.css
  vendor/three.module.js    Three.js r170, lokal (offline)
  src/
    main.js                 Start, Spielzustände (Garage → Karte → Etappe → Auswertung → Run-Ende), Hauptschleife
    core/                   rng.js (Zufall mit Seed, makeRng), math.js (clamp, lerp, approach, dimLevels, softcap …)
    data/                   NUR Daten: balance.js (ALLE globalen Zahlen: BASE_STATS, SOFTCAPS, GARAGE, RESOURCES …),
                            chassis.js, parts.js, abilities.js, biomes.js (3 Akte), nodes.js (Knotentypen), index.js (Zugriff + Adapter),
                            tags.js (10 Tags + Set-Boni), items.js (88 Items) aus den geprüften Inhaltsdateien content/content_*.js,
                            research.js, textEvents.js, ascension.js, cosmetics.js (Inhalte für Phase 5/6)
    items/                  statMods.js (Stat-Pipeline mit Soft-Caps), effects.js (alle Effekte), events.js (Ereignis-Namen),
                            eventQueue.js (Warteschlange mit Kettentiefe), modState.js (Buffs, Stapel, Zähler),
                            triggerEngine.js (Auslöser, Limits, Ketten), conditions.js (Bedingungen), inventory.js (Slots, ★, Sets, Hybride)
    garage/                 loadout.js (Garage → Fahrzeugwerte), garage.js (kaufen/ausrüsten/verbessern), progression.js (Spielzeit, Meilensteine)
    physics/                vehicle.js (Fahrzeug: Teilschritte, Tempo-Grenzen, Landung, Treibstoff/Hitze/Haltbarkeit),
                            trackGen.js (Etappen-Spezifikation), track.js (Strecke), objects.js (Pickups, Hindernisse, Zonen, „swept“ Kollision)
    map/mapGen.js           verzweigte Karte eines Akts
    run/                    runState.js (Roguelite-Run), rewards.js (Belohnungen)
    stage/                  stage.js (eine Etappe: Abschuss → Flug → Ende, Ereignisse), launch.js (Abschuss-Minispiel),
                            abilities.js (Fähigkeits-Slots), scoring.js (Belohnung)
    camera/cameraRig.js     Kamera-Logik ohne three.js: Zoom, Vorausschau, Sicherheitsrahmen, Boden-Pfeil
    render/                 3D: Szene, Grundformen (models.js), Fahrzeuge (vehicleModel.js: 9 Chassis + sichtbare Teile),
                            Landschaft (trackView), Objekte, Partikel, Hintergrund, origin.js (Floating Origin)
    ui/                     Oberfläche: Garage, Karte (map.js), Run-Bildschirme (runScreens.js), HUD, Auswertung, Menüs, Dev-Menü
    audio/sfx.js            alle Sounds per Web Audio erzeugt
    save/save.js            Spielstand v3 (localStorage, Migration, Export/Import „SW3:…“)
    platform/               input.js (Multi-Touch, Fähigkeits-Knöpfe + Tastatur), platform.js (Vibration, Display wach, Pause)
tests/                      node --test: Mathe/Zufall, Physik, Kamera, Stat-Pipeline, Garage, Spielstand, Ressourcen, Effekte,
                            Trigger-Engine, Regeln, Items/Inventar/Auswahl
tools/validateContent.mjs   Prüfer der Inhaltsdaten (Vokabular, Querverweise, Texte)
tools/serve.py              kleiner Webserver zum Testen am Handy
tools/smoke.mjs             Playwright-Rauchtest (Garage, Run über 3 Akte, alle Streckenbausteine, Hochformat)
tools/sim/                  Balance-Simulator: bot.mjs (Bot), calibrate.mjs (Zielmarken → docs/BALANCE.md), items.mjs (Item-Wirkung, ganze Runs)
docs/                       ARCHITEKTUR.md, V2-DESIGN.md, PHASEN.md (was ist neu, wie testen), BALANCE.md (Zielmarken)
```

Die Logik-Ordner (`core/ data/ items/ garage/ physics/ stage/ map/ run/ camera/ save/`) importieren weder three.js noch das DOM und laufen deshalb auch in Node (Tests).

## Tests

```
npm test          # node --test tests/  – Physik, Kamera, Mathe, Garage, Spielstand, Effekte (ohne Browser)
npm run smoke     # node tools/smoke.mjs – Rauchtest im echten Browser (Chromium, Hochformat 412×915)
```
Der Rauchtest legt Bildschirmfotos unter `/tmp/sw-smoke/` ab und endet mit Exit-Code 0, wenn alles passt.

## Balancing ändern

Alle globalen Zahlen stehen in `www/src/data/balance.js`. Beispiele:
- `BASE_STATS` – Grundwerte aller Fahrzeug-Stats (Startkraft, Schub, Treibstoff, Hitze, Haltbarkeit, Luftsteuerung …), `SOFTCAPS` – ihre Grenzen
- `GARAGE.costGrowth` (Preisanstieg je Teile-Stufe), `dimDivisor` (abnehmender Ertrag), `starterParts` (Startausstattung)
- `RESOURCES` (Überhitzung, Aufprallschaden), `TESTDRIVE` (Schrott-Belohnung der Dev-Testfahrt), `RULES` (Regel-Parameter)
- `FEATURES` (Streckenbausteine), `PICKUPS`, `MAP` (Karte), `RUN` (Abschleppen), `REWARDS` (Schrauben, Schrott, Blaupausen, Kerne)
- `PHYSICS.speedSoftCap`/`hardSpeedCap` (Tempo-Grenzen), `LAUNCH.chargePeriod` (pendelnde Kraft), `CAMERA.minWidth/maxWidth` (Zoom)

Inhalte stehen bei ihren Daten: `chassis.js`, `parts.js`, `abilities.js` (Werte, Preise, Beschreibungen), `biomes.js` (Farben, Hügel, Wetter, Bausteine, Zielmarken, Bosse – Zielmarken mit `node tools/sim/calibrate.mjs --apply` neu kalibrieren), `nodes.js` (Knotentypen der Karte). Viele Werte lassen sich auch im Dev-Menü live ausprobieren.
