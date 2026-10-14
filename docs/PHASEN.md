# Schleuderwerk 2 – Umbau-Phasen

> Stand und Testanleitung je Phase. Verträge: [ARCHITEKTUR.md](ARCHITEKTUR.md), Spieldesign: [V2-DESIGN.md](V2-DESIGN.md).

## Phase 1 – Kamera, Physik, Steuerung, Balance-Datei

Das Spiel bleibt wie bisher spielbar (Werkstatt mit den 8 Upgrades, 2 Welten, Runs), steht aber auf einer neuen Grundlage.

### Was ist neu

**Ordnerstruktur & Zahlen**
- Neue Ordner nach ARCHITEKTUR.md: `core/` (Zufall mit Seed `makeRng`, Mathe-Helfer), `data/` (Daten), `physics/`, `stage/`, `camera/`, `garage/`. Die alten Ordner `game/` und `config/` gibt es nicht mehr.
- `data/balance.js` ist die zentrale Zahlen-Datei: Physik, Abschuss, Kamera, Floating Origin, Strecke, Objekte, Etappe, Ökonomie, Steuerung, Darstellung, Kombos, Effekte. In der Spiel-Logik, Kamera und `main.js` stehen keine „magischen Zahlen“ mehr.
- Logik-Module importieren weder three.js noch das DOM → laufen mit `node --test`.

**Physik**
- Adaptive Teilschritte: Pro Physik-Schritt (1/120 s) höchstens 0,5 m Weg je Teilschritt (max. 24 Teilschritte). Boden- und Objektprüfung laufen pro Teilschritt.
- Kein Durchtunneln mehr: Hindernisse, Ringe und Münzen werden als Strecke (alte → neue Position) gegen um den Autoradius vergrößerte Boxen/Kreise geprüft. Landungen werden auf der gekreuzten Bodenlinie exakt bestimmt – auch bei 150 m/s.
- Weiche Tempo-Grenze: Boost und Ring-Tempo wirken ab 45 m/s immer schwächer (`1 / (1 + (v/45)^4)`), harte Grenze 90 m/s.
- Neigen per Halten statt Wischen: links halten = Nase hoch, rechts halten = Nase runter (≈ 1 s pro Salto bei Dauerhalten); ohne Eingabe läuft die Drehung aus und das Auto richtet sich leicht in Flugrichtung aus.
- Boost nur noch über den großen 🔥-Knopf unten rechts (halten).

**Steuerung & Abschuss**
- Multi-Touch (mehrere Finger gleichzeitig). Knöpfe haben Vorrang; sonst gilt: linke Hälfte = Nase hoch, rechte Hälfte = Nase runter, beide = keine Drehung.
- Neuer Abschuss: Finger irgendwo halten → Kraft pendelt automatisch 0 → 100 % → 0 (1,6 s). Hoch/runter ziehen = Winkel (10°–70°, Start 32°). Grüne Zone (feste Lage pro Abschuss) = perfekter Abschuss (+15 %, Zeitlupe). Flugkurven-Vorschau und die zurückgezogene Schleuder bleiben.
- Tastatur zum Testen am PC: Leertaste halten/loslassen = Abschuss, Leertaste im Flug = Boost, ←/→ = neigen, ↑/↓ beim Zielen = Winkel.

**Kamera**
- Neue Kamera-Logik (`camera/cameraRig.js`, ohne three.js): Zoom nach Tempo und Höhe, Vorausschau in Flugrichtung, weiches Folgen.
- **Harte Garantie:** Das Auto liegt immer mindestens 12 % vom Bildrand entfernt – mit echter Perspektive gerechnet, für Hoch- und Querformat.
- Passen Auto und Boden nicht mehr gemeinsam ins Bild, hat das Auto Vorrang; unten erscheint ein Pfeil „Boden ↓ 340 m“.

**Floating Origin**
- Der Render-Ursprung springt alle 400 m mit der Kamera mit; alle 3D-Objekte werden relativ dazu gezeichnet, Gelände-Stücke haben lokale Koordinaten. Dadurch bleibt die Darstellung auch nach vielen Kilometern ruckel- und flimmerfrei. Die Physik rechnet weiter in absoluten Metern.

**Progression (Übergang bis Phase 2)**
- Upgrade-Preise: eigener Basispreis je Upgrade (doppelt so hoch wie vorher) × 1,15 je Stufe.
- Wirkung mit abnehmendem Ertrag (`Max × Stufe / (Stufe + 12)`, das Maximum wird nie ganz erreicht – z. B. Katapult auf Stufe 12 = +45 %, auf Stufe 30 = +64 %): Katapult bis +90 %, Motor bis +100 %, Tank bis +150 %, Aerodynamik bis −45 % Widerstand, Reifen bis −50 % Reibung und +20° Landetoleranz, Flügel bis +250 %, Magnet bis +6 m; Karosserie +1 Treffer bei Stufe 4, 10 und 16. Höchststufen bleiben.
- Welt 2 (Glutwüste) wird weiterhin bei 3.500 m freigeschaltet.

**Tests**
- `npm test` (`node --test tests/`): Mathe/Zufall, Physik (kein Durchtunneln bei 150 m/s, exakte Landung im Sturzflug, 60 s Dauerboost bleibt unter der harten Grenze und nahe der weichen, Salto in 0,7–1,5 s), Kamera (zufällige und extreme Flugbahnen bis 90 m/s und 3.000 m Höhe, Seitenverhältnisse 0,45/0,75/1/2, Zeitsprünge bis 0,05 s – das Auto ist in jedem Schritt im Sicherheitsrahmen; Boden-Pfeil erscheint, sobald der Boden nicht sichtbar ist).
- `npm run smoke` (`node tools/smoke.mjs`): Playwright-Rauchtest im Hochformat 412×915 mit Touch – spielt eine Etappe (Halten, Ziehen, Loslassen, Neigen links/rechts/beide, Boost per Knopf und Leertaste), wartet auf die Auswertung, kauft ein Upgrade, fliegt eine zweite Etappe mit Sprung auf 6 km / 600 m Höhe (Floating Origin, Boden-Pfeil), prüft alle 100 ms, dass das Auto im Bild ist, und dass keine Fehler in der Konsole stehen. Bildschirmfotos: `/tmp/sw-smoke/`.

### So testest du Phase 1

**Am PC (automatisch)**
1. Im Projektordner: `npm test` → alle Tests grün („# fail 0“).
2. `npm run smoke` → am Ende steht „RAUCHTEST BESTANDEN“. Die Bilder in `/tmp/sw-smoke/` zeigen Werkstatt, Zielen, Flug, Boost, Auswertung, Kauf und den Flug in großer Höhe.

**Am PC (von Hand)**
1. `python tools/serve.py` starten und `http://localhost:8137` öffnen. Tipp: In den Entwicklertools (F12) die Handy-Ansicht einschalten (z. B. 412 × 915), dann sieht es aus wie am Handy.
2. **STARTEN** drücken. Leertaste **halten**: Die Kraftleiste rechts pendelt hoch und runter, das Auto wird in der Schleuder zurückgezogen. Mit **↑/↓** den Winkel ändern (Zahl über der Leiste).
3. Leertaste **loslassen**, während die Kraft im **grünen Bereich** steht → „PERFEKTER ABSCHUSS!“ und kurze Zeitlupe.
4. Im Flug **←** halten → das Auto dreht die Nase hoch; ca. 1 Sekunde halten = ein Salto. **→** dreht andersherum. Loslassen → die Drehung läuft aus.
5. **Leertaste** im Flug = Boost (Flamme hinter dem Auto, Boost-Leiste sinkt).
6. Nach dem Stillstand erscheint die Auswertung → **Werkstatt** → ein Upgrade kaufen (Preis und Wirkung ändern sich mit jeder Stufe weniger stark).

**Am Handy**
1. PC und Handy im selben WLAN, am PC `python tools/serve.py`, am Handy die angezeigte Handy-Adresse öffnen (siehe README).
2. **STARTEN**, dann einen Finger **irgendwo halten** (nicht auf einen Knopf). Die Kraft pendelt; den Finger dabei **nach oben ziehen** = steiler, **nach unten** = flacher.
3. Finger **loslassen**, wenn die Kraft im **grünen Bereich** ist.
4. Im Flug: **linke Hälfte halten** = Nase hoch (die Hälfte leuchtet leicht auf), **rechte Hälfte halten** = Nase runter. Beide Hälften gleichzeitig = keine Drehung.
5. **🔥-Knopf unten rechts halten** = Boost. Gleichzeitig mit dem anderen Daumen neigen geht auch (Multi-Touch).
6. Achte darauf: Das Auto verschwindet nie aus dem Bild – auch nicht bei hohem Tempo oder sehr hohen Sprüngen. Ist der Boden zu weit weg, zeigt unten ein Pfeil die Höhe an („Boden ↓ … m“).
7. Für einen Test großer Strecken (Floating Origin) einige Upgrades kaufen (Katapult, Motor, Tank) und weit fliegen: Auch nach mehreren Kilometern bleiben Landschaft und Auto ruhig, ohne Zittern.

### Bekannte Grenzen (kommen in späteren Phasen)
- Upgrades sind noch die alten 8 Prozent-Upgrades (Garage mit Chassis und Teilen folgt in Phase 2).
- Spielstand-Schema bleibt v2 (Migration auf v3 mit der neuen Garage).
- Bei sehr weitem Herauszoomen (über ≈ 170 m Höhe im Hochformat) ist das Auto klein; ein eigener Auto-Marker kann später ergänzt werden.
