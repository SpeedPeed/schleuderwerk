# Schleuderwerk

**Schrottplatz-Tüftler-Roguelite in 3D-Low-Poly (Hochformat, Handy).** Du baust in deiner Garage aus Schrott eine
verrückte Kiste – Badewanne, Einkaufswagen, Kühlschrank, Sofa … –, schießt sie mit dem Schrott-Katapult über eine
verzweigte Karte aus Etappen, steuerst sie in der Luft und landest (hoffentlich) sauber. Unterwegs sammelst du
Items mit Tags und Set-Boni, die sich gegenseitig auslösen – **Kettenreaktionen** wie „Salto → Stromschlag →
Gratis-Boost → Kühlung → Tempo“. Drei Akte (Schrottplatz, Glutwüste, Gewittersteppe) mit je zwei Bossen, danach
15 Schrottstufen für Profis. Zwischen den Runs: Teile verbessern, im Erfinder-Labor forschen, lackieren.

Version **1.0.0** · Three.js r170 (lokal, offline) · native ES-Module ohne Build-Werkzeuge · Android-App über Capacitor ·
PC-Version als eine HTML-Datei (Doppelklick, komplett per Tastatur).

📄 Design: [docs/V2-DESIGN.md](docs/V2-DESIGN.md) · Technik/Verträge: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md) ·
Umbau-Stand & Testanleitung je Phase, was fertig ist, bekannte Grenzen: [docs/PHASEN.md](docs/PHASEN.md) ·
Balance-Messwerte: [docs/BALANCE.md](docs/BALANCE.md) · **App bauen: [APK-ANLEITUNG.md](APK-ANLEITUNG.md)**

## Spielen

**Im Handy-Browser (zum Testen):** PC und Handy im selben WLAN, im Projektordner `python tools/serve.py` starten,
am Handy die angezeigte Adresse (z. B. `http://192.168.178.23:8137`) öffnen. Am PC: `http://localhost:8137`
(F12 → Geräte-Ansicht, z. B. 412 × 915). Beenden mit `Strg + C`.

**Als App:** siehe [APK-ANLEITUNG.md](APK-ANLEITUNG.md) (automatisch über GitHub Actions oder lokal mit Android Studio).

**Am PC:** siehe [Am PC spielen](#am-pc-spielen) – eine einzige HTML-Datei, Doppelklick genügt.

Beim ersten Start führt ein **Tutorial** durch den ersten Run (kurze Hinweise, jeder nur einmal, überspringbar,
in ⚙ Einstellungen zurücksetzbar).

## Steuerung

| Wo | Eingabe (Handy) | Wirkung |
|---|---|---|
| Abschuss | Finger **irgendwo halten** | Kraft pendelt 0 → 100 % → 0 (Leiste rechts) |
| Abschuss | beim Halten **hoch/runter ziehen** | Winkel steiler/flacher (10°–70°) |
| Abschuss | **loslassen** | Abschuss – im **grünen Bereich** = perfekt (+15 % Tempo, Zeitlupe) |
| Flug | **linke Bildschirmhälfte halten** | Nase hoch (≈ 1 Salto pro Sekunde) |
| Flug | **rechte Bildschirmhälfte halten** | Nase runter |
| jederzeit | **runde Knöpfe unten rechts** | Fähigkeiten (🚀 Boost halten, 🦘 Hüpfer tippen …), Ring = Abklingzeit/Treibstoff |
| Boden | – | der Antrieb schiebt automatisch, solange Treibstoff da ist |
| überall | **Zurück-Taste** (am PC **Esc**) | schließt die oberste Ebene; Etappe → Pause; Karte → Garage; Garage → „Spiel beenden?“ |

Mehrere Finger gleichzeitig sind erlaubt. Unten links: ⛽ Treibstoff, 🌡 Hitze (ab 80 % blinkt sie und der Bildrand
glüht rot, bei 100 % „ÜBERHITZT“ = 2 s Stillstand), 🔧 Haltbarkeit (gilt für den ganzen Run). Ist der Boden nicht
im Bild, zeigt ein Pfeil die Höhe („Boden ↓ 340 m“).

**Am PC:** komplett mit der Tastatur spielbar – siehe [Am PC spielen](#am-pc-spielen).

## Am PC spielen

1. Einmalig bauen: `npm install`, dann `npm run build:pc` → **`dist/Schleuderwerk-PC.html`** (≈ 1,2 MB, alles in einer
   Datei: Spiel, three.js, Stile, Icon, Startbild). Die Datei eignet sich auch als Release-Download.
2. **Doppelklick** auf `Schleuderwerk-PC.html` – sie startet ohne Webserver in Chrome, Edge oder Firefox (`file://`).
   Der Spielstand liegt im Browser (localStorage) und bleibt beim nächsten Doppelklick erhalten – bitte immer
   denselben Browser und dieselbe Datei/denselben Ordner nehmen; Sicherung über ⚙ → Exportieren.
3. Vollbild: **F11**. Mit Maus/Tastatur zeigt das Spiel automatisch Tasten statt Touch-Hinweisen (Tutorial, HUD,
   Fähigkeits-Knöpfe mit Ziffer, Zielhilfe), im Querformat sitzt das HUD in einer Spalte in der Bildmitte.

| Wo | Taste | Wirkung |
|---|---|---|
| Abschuss | **Leertaste halten** / loslassen | Kraft laden – loslassen im **grünen Bereich** = perfekt |
| Abschuss | **↑ / ↓** | Winkel steiler / flacher |
| Flug | **← / →** | Nase hoch / Nase runter |
| Flug | **Leertaste halten** | Boost (die 🚀-Fähigkeit) |
| Flug | **1 – 4** | Fähigkeit 1–4 (halten bzw. drücken; die Taste steht am Knopf) |
| Etappe | **Esc** / **P** | Pause (Enter/P = weiter) |
| Menüs | **Tab** / **Umschalt+Tab**, **Pfeiltasten** | gelb markierten Knopf bzw. Karte wechseln |
| Menüs | **Enter** / **Leertaste** | markierten Knopf drücken |
| Menüs | **Enter** (nichts markiert) | Hauptaktion: RUN STARTEN, LOS, Weiter, Nehmen, Zur Garage … |
| überall | **Esc** | zurück / schließen (wie die Zurück-Taste am Handy) |
| überall | **K** | Tastenübersicht (auch im Pause-Menü und in ⚙ → „⌨ Tastenbelegung“) |
| Garage | **Q / E** (ohne Markierung auch **← / →**) | Chassis wechseln |
| Karte | **Pfeiltasten**, **Enter** | erreichbaren Knoten wählen / betreten · **I** = Rucksack |
| Item-Auswahl | **1 / 2 / 3**, **S** | Item nehmen / überspringen |
| Ereignis, Tankstelle | **1 – 4** | Antwort wählen |

Zum Entwickeln geht weiterhin `python tools/serve.py` → `http://localhost:8137` (gleiche Tastatur-Bedienung).

**Geheim:** ⚙ Einstellungen → **7× schnell auf die Versionsnummer** tippen = Dev-Menü (mit eingebauter Hilfe).

## Features

- **Garage:** 9 Chassis mit eigenen Regeln, 7 Teile-Slots mit je 3–5 Teilen (Stufe 0–20, abnehmender Ertrag),
  2–3 Fähigkeiten, **Erfinder-Labor** (≈ 45 Forschungsknoten in 5 Ästen), **Lackiererei**, **Statistik**
  (Kompendium-Fortschritt, Bestwerte, letzte 10 Runs).
- **Run:** 3 Akte = 3 Biome, verzweigte Karte mit 8 Knotentypen (Etappe, Elite, Schrotthändler, Werkbank,
  Schwarzmarkt, Tankstelle, Ereignis, Schatzhaufen), 6 Bosse mit Intro, Warnhinweisen und Musik-Schleife.
- **Etappen:** Zielmarke + Bronze/Silber/Gold, Streckenbausteine (Schluchten, Schlamm, Sand, Loopings,
  Schrottberge, Pressen, Wind, Thermik, Blitze, Magnetkran, Glutfelder), Wetter, Abschleppen bei Misserfolg.
- **Items:** 88 Items, 10 Tags mit Set-Boni (2/4/6), ★-Stufen und Hybride (Werkbank), Flüche (Schwarzmarkt),
  Trigger-Engine mit Kettenreaktionen bis Tiefe 8.
- **Fortschritt:** 4 Währungen (🔩 Schrauben, ⚙ Schrott, 📘 Blaupausen, 💠 Kerne), Meilensteine mit Zielzeiten,
  15 Schrottstufen.
- **Präsentation (Phase 7):** Partikel und Bildschirm-Blitze für Landungen, Medaillen, Item-Auslösungen in
  Tag-Farbe, wachsende Kettenreaktionen, Überhitzung (Dampf, roter Rand), Stromschlag, Explosion, Boss-Einblendung,
  Konfetti beim Run-Sieg; Platzhalter-Sounds per Web Audio (eigener Klang je Tag, steigende Kettentöne, Shop/Reroll/
  Fusion/Forschung, Jingles, Boss-Musik); Startbildschirm, weiche Übergänge, Tutorial.
- **Einstellungen:** Ton an/aus, Lautstärke Effekte/Musik, Vibration, Bildschirmwackeln & Blitze, Zeitlupe,
  Grafikqualität Niedrig/Mittel/Hoch (Pixel-Ratio), Schatten, Tutorial zurücksetzen, Spielstand Export/Import.
- **Speichern:** automatisch (localStorage), Schema v3 mit Migrationen, Export/Import als Text (`SW3:…`), Backup
  nicht ladbarer Stände.

## Projektstruktur

```
www/                        ← das komplette Spiel (wird in die App gepackt)
  index.html, style.css     Startbildschirm, alle Stile (Phase-7-Abschnitt am Ende)
  vendor/three.module.js    Three.js r170, lokal (offline)
  src/
    main.js                 Start, Bildschirm-Zustände (Garage → Karte → Etappe → Ergebnis → Run-Ende), Hauptschleife,
                            Effekte (emitFx), Zurück-Taste, Leistungsmessung
    core/                   rng.js (Zufall mit Seed), math.js
    data/                   NUR Daten: balance.js (ALLE globalen Zahlen inkl. FX, AUDIO, TUTORIAL, RENDER), chassis, parts,
                            abilities, biomes (3 Akte, Bosse), nodes, tags, items (aus content/*.js), research, textEvents,
                            ascension, cosmetics, index.js (Zugriff + Adapter)
    items/                  Stat-Pipeline, Effekte, Trigger-Engine, Bedingungen, Inventar (Slots, ★, Sets, Hybride)
    garage/                 loadout, garage (Kauf/Ausrüsten/Lack), research (Labor), progression (Schrottstufen, Meilensteine)
    physics/                vehicle (Fahrzeug), trackGen/track (Strecke), objects (Pickups, Hindernisse, Zonen, swept)
    map/  run/  shops/      Karte, Roguelite-Run, Sonderknoten (Händler, Werkbank, Schwarzmarkt, Tankstelle, Ereignis, Schatz)
    stage/                  stage (eine Etappe), launch, abilities, scoring
    camera/cameraRig.js     Kamera ohne three.js: Zoom, Vorausschau, harte „Auto-im-Bild“-Garantie, Boden-Pfeil
    render/                 Szene (Qualität/Schatten), Modelle (GeoBuilder), Fahrzeuge, Gelände, Objekte, Partikel-Pool, Wetter
    ui/                     garage, lab, map, runScreens, shops, items, hud, menus (Einstellungen), devMenu,
                            tutorial.js (Hinweise), backButton.js (Zurück-Logik), fxOverlay.js (Blitze, Hitze-Rand, Konfetti)
    audio/sfx.js            alle Klänge per Web Audio (Effekte- und Musik-Bus)
    save/save.js            Spielstand v3, Migration, Export/Import
    platform/               input.js (Multi-Touch, Tastatur), platform.js (Vibration, Wachhalten, Zurück-Taste, Pause)
    ui/inputMode.js, keyNav.js  PC: Maus/Tastatur erkennen (html.kbd, Tasten-Texte) und Menüs per Tastatur bedienen
tests/                      node --test (≈ 250 Tests): Physik, Kamera, Trigger-Engine, Regeln, Items, Shops, Forschung,
                            Schrottstufen, Progression, Spielstand, Tutorial/Einstellungen/Zurück-Taste (ui.test.mjs)
tools/
  smoke.mjs                 Playwright-Rauchtest (ganzer Run über 3 Akte, alle Knoten, Bosse, Bausteine …)
  smoke-final.mjs           Abschluss-Rundgang: Neustart mit Tutorial in 360×780 / 412×915 / 430×932, alle Bildschirme
  build-pc.mjs              PC-Version: bündelt alles (esbuild) in EINE Datei dist/Schleuderwerk-PC.html (Doppelklick)
  smoke-pc.mjs              Rauchtest der PC-Datei per file:// in 1366×768, nur mit Tastatur
  sim/                      Balance-Simulatoren: bot, calibrate (Zielmarken), items (Item-Wirkung), progression (Spielzeit)
  validateContent.mjs       Prüfer der Inhaltsdaten
  serve.py                  Webserver zum Testen am Handy
  patch-android.mjs         passt das Capacitor-Android-Projekt an (Hochformat, Vollbild, Schlüssel, Icons)
  make_icons.py             zeichnet App-Icon und Startbild (Pillow)
capacitor.config.json       App-Kennung de.privat.schleuderwerk, Name „Schleuderwerk“
.github/workflows/          android-apk.yml – baut die APK bei Push auf main oder per „Run workflow“
keystore/debug.keystore     fester Signaturschlüssel (nie löschen!)
docs/                       ARCHITEKTUR, V2-DESIGN, PHASEN, BALANCE
```

Die Logik-Ordner (`core/ data/ items/ garage/ physics/ stage/ map/ run/ shops/ camera/ save/`) importieren weder
three.js noch das DOM und laufen deshalb auch in Node (Tests, Simulatoren).

## Tests und Simulatoren

```
npm test                          # node --test tests/ – alle Logik-Tests (≈ 15 s)
npm run smoke                     # Rauchtest im echten Browser (Chromium + Software-WebGL, ≈ 15–20 min)
node tools/smoke-final.mjs 412    # nur der Abschluss-Rundgang in einer Auflösung (≈ 2 min)
npm run build:pc                  # PC-Version bauen → dist/Schleuderwerk-PC.html
npm run smoke:pc                  # PC-Version per file:// nur mit Tastatur spielen (≈ 2 min, Fotos in /tmp/sw-pc/)
node tools/validateContent.mjs    # Inhaltsdaten prüfen (läuft auch in npm test)
node tools/sim/calibrate.mjs      # Zielmarken je Biom/Etage (--apply schreibt sie in biomes.js)
node tools/sim/items.mjs          # Item- und Set-Wirkung, ganze Runs
node tools/sim/progression.mjs    # Spielzeit bis zu den Meilensteinen (--fit misst das Modell neu)
```
Der Rauchtest legt Bildschirmfotos unter `/tmp/sw-smoke/` ab (`final-<Breite>x<Höhe>-*.png` = Abschluss-Rundgang)
und endet mit „RAUCHTEST BESTANDEN“ (Exit-Code 0).

## Balancing ändern

Alle globalen Zahlen stehen in `www/src/data/balance.js` (Physik, Kamera, Ökonomie, Karte, Belohnungen, Effekte,
Ton, Tutorial …), Inhalte bei ihren Daten (`chassis.js`, `parts.js`, `abilities.js`, `biomes.js`, `content/*.js`).
Jede Zahl lässt sich im Dev-Menü unter „Werte live ändern“ ausprobieren. Messwerte und Begründungen:
[docs/BALANCE.md](docs/BALANCE.md).
