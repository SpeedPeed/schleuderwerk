# Schleuderwerk

Launch-&-Upgrade-Spiel in 3D-Low-Poly (Three.js). Design: [docs/V2-DESIGN.md](docs/V2-DESIGN.md) (früher [GDD.md](GDD.md)), Technik: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md), Umbau-Stand und Testanleitung: [docs/PHASEN.md](docs/PHASEN.md).

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

| Phase | Eingabe (Handy) | Wirkung |
|---|---|---|
| Abschuss | Finger **irgendwo halten** | Die Kraft pendelt automatisch 0 → 100 % → 0 (Kraftleiste rechts) |
| Abschuss | beim Halten **hoch/runter ziehen** | Winkel steiler/flacher (10°–70°) |
| Abschuss | **loslassen** | Abschuss. Steht die Kraft in der **grünen Zone** = perfekter Abschuss (+15 %, Zeitlupe) |
| Flug | **linke Bildschirmhälfte halten** | Nase hoch (Drehung gegen den Uhrzeigersinn) – Dauerhalten ≈ 1 Salto pro Sekunde |
| Flug | **rechte Bildschirmhälfte halten** | Nase runter (Drehung im Uhrzeigersinn) |
| Flug | nichts halten | Drehung läuft aus, das Auto richtet sich leicht in Flugrichtung aus |
| Flug/Boden | **🔥-Knopf unten rechts halten** | Boost in Richtung der Motorhaube |
| Landung | – | Räder parallel zum Boden = saubere Landung, das Auto rollt weiter |

Mehrere Finger gleichzeitig sind erlaubt (z. B. links halten **und** Boost). Ist der Boden nicht mehr im Bild, zeigt ein Pfeil unten die Höhe an („Boden ↓ 340 m“).

**Am PC (Test):** Leertaste halten/loslassen = Abschuss · Pfeil ↑/↓ beim Zielen = Winkel · Leertaste im Flug = Boost · Pfeil ←/→ = Nase hoch/runter.

## Projektstruktur

```
www/                        ← das komplette Spiel (wird in die App gepackt)
  index.html, style.css
  vendor/three.module.js    Three.js r170, lokal (offline)
  src/
    main.js                 Start, Spielzustände, Hauptschleife (verbindet Logik, Darstellung, Oberfläche)
    core/                   rng.js (Zufall mit Seed, makeRng), math.js (clamp, lerp, approach, dimReturn, softcap …)
    data/                   NUR Daten: balance.js (ALLE globalen Zahlen), upgrades.js, worlds.js
    physics/                vehicle.js (Fahrzeug, adaptive Teilschritte, Tempo-Grenzen, Landung),
                            track.js (Strecke), objects.js (Münzen/Ringe/Hindernisse, „swept“ Kollision)
    stage/                  stage.js (eine Etappe: Abschuss → Flug → Ende), launch.js (Abschuss-Minispiel)
    camera/cameraRig.js     Kamera-Logik ohne three.js: Zoom, Vorausschau, Sicherheitsrahmen, Boden-Pfeil
    garage/stats.js         Fahrzeugwerte aus Upgrades, Upgrade-Preise
    render/                 3D: Szene, Modelle aus Grundformen, Landschaft (trackView), Objekte, Partikel,
                            Hintergrund, origin.js (Floating Origin)
    ui/                     Oberfläche: HUD, Werkstatt, Ergebnis, Menüs
    audio/sfx.js            alle Sounds per Web Audio erzeugt
    save/save.js            Spielstand (localStorage, Version, Export/Import)
    platform/               input.js (Multi-Touch + Tastatur), platform.js (Vibration, Display wach, Pause)
tests/                      node --test: Mathe/Zufall, Physik, Kamera
tools/serve.py              kleiner Webserver zum Testen am Handy
tools/smoke.mjs             Playwright-Rauchtest (spielt eine Etappe im Hochformat)
docs/                       ARCHITEKTUR.md, V2-DESIGN.md, PHASEN.md (was ist neu, wie testen)
```

Die Logik-Ordner (`core/ data/ physics/ stage/ camera/ garage/`) importieren weder three.js noch das DOM und laufen deshalb auch in Node (Tests).

## Tests

```
npm test          # node --test tests/  – Physik, Kamera, Mathe (ohne Browser)
npm run smoke     # node tools/smoke.mjs – Rauchtest im echten Browser (Chromium, Hochformat 412×915)
```
Der Rauchtest legt Bildschirmfotos unter `/tmp/sw-smoke/` ab und endet mit Exit-Code 0, wenn alles passt.

## Balancing ändern

Alle globalen Zahlen stehen in `www/src/data/balance.js`. Beispiele:
- `PHYSICS.baseLaunchSpeed` (Startgeschwindigkeit), `airControl`/`maxSpin` (wie schnell man dreht), `speedSoftCap`/`hardSpeedCap` (Tempo-Grenzen)
- `LAUNCH.chargePeriod` (Tempo der pendelnden Kraft), `sweetWidth` (Breite der grünen Zone), `angleMin/angleMax`
- `CAMERA.minWidth/maxWidth` (Zoom), `safeMargin` (Sicherheitsrahmen), `groundFitTop` (wie lange der Boden im Bild bleibt)
- `ECONOMY.costGrowth` (Preisanstieg je Stufe), `halfLevel` (abnehmender Ertrag)

Inhalte stehen bei ihren Daten: `upgrades.js` → Basispreis (`base`), maximale Stufe, Maximalwirkung (`effect`); `worlds.js` → Farben, Hügel, Rampen, Wetter, wie oft Münzen/Ringe/Hindernisse kommen.
