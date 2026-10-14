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

## Phase 2 – Garage mit Chassis und Teile-Slots

Das alte Upgrade-System (8 lineare Upgrades, Werkstatt, Geld) ist weg. Spielbar ist jetzt: **Garage öffnen → Chassis wählen/freischalten → Teile je Slot kaufen, ausrüsten, verbessern → 2 Fähigkeiten wählen → „TESTFAHRT ▶“** (eine Etappe auf der bekannten Strecke) **→ Auswertung mit ⚙ Schrott → zurück in die Garage.** Run-Karte (Phase 3) und Items/Trigger (Phase 4) docken an die neuen Schnittstellen an.

### Was ist neu

**Garage (ersetzt die Werkstatt)**
- Oben die Währungen ⚙ Schrott, 📘 Blaupausen, 💠 Kerne und darunter eine große 3D-Vorschau, die sich langsam dreht.
- **9 Chassis** mit ◀ ▶: Seifenkiste, Einkaufswagen, Sperrmüll-Sofa, Badewanne, Aufsitz-Rasenmäher, Mülltonne, Kühlschrank, Raketenschlitten, Waschmaschine. Gesperrte zeigen ihre Bedingungen (💠 Kerne + Bauplan aus der Forschung) und lassen sich mit Kernen kaufen, sobald die Forschung erfüllt ist. Bis zum Erfinder-Labor (Phase 5) geht das nur über das Dev-Menü.
- **7 Teile-Slots** (Antrieb, Räder, Aerodynamik, Panzerung, Tank, Kühlung, Gadget) mit aktuellem Teil, Stufe und „▲ ⚙ Preis“-Knopf. Tippen auf eine Zeile öffnet die Teile-Auswahl: Karten mit Symbol, Name, Beschreibung, **Werte-Vergleich vorher → nachher**, Kaufen (⚙), Ausrüsten, Verbessern. Das angetippte Teil erscheint sofort in der 3D-Vorschau, die Werte-Balken zeigen die Änderung grün/rot.
- Teile-Stufen 0–20: Wirkung `perLevel × L / (1 + L/30)` (Stufe 20 ≈ 12 effektive Stufen), Preis der nächsten Stufe = Basispreis × 1,15^Stufe (Startteile: Basis 40 ⚙).
- **Fähigkeiten**: 2 Slot-Chips → Auswahl (Boost und Hüpfer sind frei, der Rest braucht Forschung). Die Spezialfähigkeit eines Chassis (Waschmaschine: 🌀 Schleudergang) kommt als dritter Knopf dazu.
- Werte-Übersicht: Startkraft, Schub, Treibstoff, Kühlung, Haltbarkeit, Luftsteuerung, Gewicht.
- Strecken-Wahl (Schrottplatz-Steppe / Glutwüste) bleibt bis Phase 3; Glutwüste wie bisher ab 3.500 m oder per Dev-Menü.

**Sichtbare Fahrzeuge** (`render/vehicleModel.js`)
- 9 Chassis-Modelle aus Grundformen und ein kleiner Fahrer mit Helm. Jeder Slot ist sichtbar: Räder (Bobbycar klein-rot, Traktor groß-grob, Gummibälle bunt, Kugellager metallisch), Antrieb am Heck (Motorblock, Pedale, Elektromotor, Staubsaugerturbine mit drehenden Schaufeln), Aero (Schirm, Bügelbrett, Heckspoiler mit Fuchsschwanz), Panzerung (Karton, Topfdeckel, Matratze, Ölfass-Bleche), Tank (Kanister, Thermoskanne, Gurkenfass, Gasflasche), Kühlung (Schlitze, Ventilator mit Propeller, Autokühler, Trockeneis-Box), Gadget (Hupe, Magnet-Angel, Kompass, Schneeschaufel, Schornsteinfeger).
- Ein Draw Call für alle festen Teile, Räder und Propeller einzeln. Flammen und Antriebs-Rauch kommen aus dem Auspuff des Antriebs-Teils, bei Hitze dampft es.

**Ressourcen in der Etappe** (`physics/vehicle.js`)
- ⛽ **Treibstoff** (fuelMax, pro Testfahrt voll): Der **Antrieb schiebt am Boden automatisch** (driveAccel, kostet driveFuel/s und driveHeat/s). Tank leer → „Tank leer – rollt aus …“.
- 🌡 **Hitze** (0 … heatMax, Kühlung coolRate/s, heatGain verstärkt jede Zunahme): Boost +30/s, Antrieb +5/s, Glutwüste +4/s. Bei Maximum **Überhitzung**: 2 s kein Boost/Antrieb, 5 Schaden, Hitze fällt auf 50. Kühlschrank (noOverheat) kann nicht überhitzen, die Waschmaschine (heatIsResource) bleibt ohne Stillstand am Maximum und wandelt die Hitze per Schleudergang in Schub.
- 🔧 **Haltbarkeit** (durabilityMax, in Phase 2 pro Testfahrt): Aufprall über 9 m/s Normaltempo kostet 2,5 je m/s, Bruchlandung +15, holprig +4, Hindernis 12 – alles × (1 − Panzerung). Bei 0: „TOTALSCHADEN!“, die Testfahrt endet. Die alten Herzen entfallen.
- Raketenschlitten (lowGrip): Antrieb und Rollreibung am Boden halbiert.
- Alle Ereignisse heißen wie in ARCHITEKTUR 4.2 (launch, perfectLaunch, landing, perfectLanding, groundTouch, flip, airSecond, boost, boostSecond, overheat, collision, bounce, pickup, fuelEmpty, abilityUse, milestone, explosion, damage, heal, stageStart, stageEnd) und landen in der Ereignis-Warteschlange der Etappe (`stage.queue`, abgearbeitet nach jedem Physik-Schritt → `hooks.event` und `stage.onEvent` für die Trigger-Engine in Phase 4).

**Fähigkeiten & Effekte**
- `items/effects.js`: alle 24 Effekte (thrust, jump, boost, explosion, heal, selfDamage, cool, heat, fuel, bolts, scrap, magnet, buff, stack, charge, emit, shield, spin, slowmo, refill, chance, maxHp, maxFuel, upgradeItem) mit Stufen-Skalierung. Buffs/Stapel/Zähler (`items/modState.js`) verändern die Werte live über die Stat-Pipeline.
- `stage/abilities.js`: Halten (Boost: Schub, kostet Treibstoff + Hitze pro Sekunde) und Tippen (Kosten je Einsatz, Abklingzeit × abilityCooldown). Sonderregeln Fallschirm, Notbremse, Schleudergang.
- HUD: 2–3 große runde Fähigkeits-Knöpfe unten rechts mit Ring (Abklingzeit bzw. Treibstoff beim Boost), grau ohne Treibstoff oder im Überhitzungs-Stillstand; links unten die Leisten ⛽ Treibstoff, 🌡 Hitze (blinkt ab 80 %, „ÜBERHITZT“) und 🔧 Haltbarkeit. Multi-Touch bleibt: Knöpfe haben Vorrang vor dem Neigen.
- Münzen sind jetzt 🔩 **Schrauben** (Run-Währung, in Phase 2 nur gezählt und angezeigt), große Münzen sind Schraubendosen.

**Stat-Pipeline** (`items/statMods.js`) – alle Fahrzeugwerte entstehen aus `BASE_STATS` + Chassis + Teile (+ später Forschung, Items, Sets, Buffs): `Endwert = Soft-Cap((Basis + Σadd) × (1 + Σmul) × Π xmul)`, Grenzen in `balance.SOFTCAPS` (z. B. Panzerung ≤ 60 %, Abklingzeit ≥ 35 %, weiche Grenze für Startkraft und Luftsteuerung). `garage/loadout.js` baut daraus die Ausrüstung einer Etappe (Werte, Regeln, Fähigkeiten, Auslöser-Quellen für Phase 4).

**Testfahrt-Auswertung**: Distanz, Höhe, Tricks, Schrauben, Schaden und ⚙ Schrott = Distanz/12 + Höhe/25 + Trickpunkte/15 (Glutwüste ×1,5).

**Spielstand v3** (`save/save.js`): Schema nach ARCHITEKTUR §10 (meta, garage, research, ascension, codex, cosmetics, settings, stats, run, tutorial; Welten als Übergang bis Phase 3). Alte Spielstände werden automatisch übernommen: **Geld / 40 → Startschrott (höchstens 400)**, Einstellungen, Rekorde und freigeschaltete Welten bleiben. Export als `SW3:…`, alte `SW2:…`-Texte lassen sich weiter importieren. Die Spielzeit wird mitgezählt; Meilensteine (erste Testfahrt, erstes gekauftes/verbessertes Teil, erstes neues Chassis) bekommen beim ersten Erreichen einen Zeitstempel.

**Dev-Menü** (`ui/devMenu.js`): In den Einstellungen **7× schnell auf die Versionsnummer** tippen. +1.000/+10.000 ⚙, +10 📘, +3 💠, alles freischalten (Chassis, Fähigkeiten, Forschungs-Bedingungen – Teile werden dadurch kaufbar), alle Teile schenken, alle Strecken, Testfahrt sofort beenden, 18 Werte live ändern (z. B. `BASE_STATS.launchSpeed`, `PHYSICS.hardSpeedCap`, `CAMERA.maxWidth`, `RESOURCES.dmgPerMps`, `GARAGE.costGrowth`), Meilenstein-Zeiten und die Ereignis-Zähler der letzten Etappe.

**Aufgeräumt**: `data/upgrades.js`, `garage/stats.js`, `ui/workshop.js` und das Geld sind entfernt.

**Tests**: `npm test` – zusätzlich zu Phase 1: `statMods` (add/mul/xmul, Soft-Caps, negative Boost-Hitze, Panzerung ≤ 0,6), `loadout` (jedes Chassis × jedes Teil auf Stufe 0 und 20: alle Werte endlich und plausibel; Badewanne 5 Item-Plätze; Garage-Aktionen), `save` (Migration v2 → v3, Export/Import-Rundlauf, alter SW2-Text), `resources` (Antrieb & Treibstoff, Überhitzung, noOverheat, heatIsResource, lowGrip, Aufprallschaden mit Panzerung, Abklingzeit & Kosten, Boost nur mit Treibstoff, Schleudergang, Fallschirm, Notbremse), `effects` (jeder Effekt einmal, Warteschlange, Buffs). `npm run smoke` spielt den ganzen Ablauf im Browser (siehe unten).

### So testest du Phase 2

**Am PC (automatisch)**
1. `npm test` → „# fail 0“.
2. `npm run smoke` → „RAUCHTEST BESTANDEN“. In `/tmp/sw-smoke/` liegen u. a. `01-garage.png`, `02-devmenu.png`, `chassis-<id>.png` (alle 9 Chassis), `03-teile-auswahl.png`, `04-teil-gekauft.png`, `05-garage-fertig.png`, `21-flug.png`, `22-boost.png`, `23-auswertung.png`, `31-weit-und-hoch.png`, `40-strecke2.png`.

**Am PC (von Hand)**
1. `python tools/serve.py`, `http://localhost:8137` öffnen (F12 → Handy-Ansicht 412 × 915 ist am realistischsten; im Querformat steht die Garage-Liste rechts).
2. In der Garage ◀ ▶ antippen: gesperrte Chassis zeigen ihre Bedingungen. Eine Slot-Zeile antippen → Teile-Auswahl; ein Teil antippen → Vorschau im 3D-Modell und in den Werte-Balken.
3. **⚙ → 7× auf „Schleuderwerk v0.4.0“** tippen → Dev-Menü. „+10.000 ⚙“ und „🔓 Alles freischalten“, dann schließen. Jetzt kannst du jedes Chassis anwählen und Teile kaufen/ausrüsten/verbessern.
4. Fähigkeiten-Chip „Slot 2“ antippen → z. B. „Gyro-Kick“ ausrüsten. **TESTFAHRT ▶**.
5. Abschuss wie bisher (Leertaste halten/loslassen, ↑/↓ = Winkel). Im Flug: **Leertaste** = Boost, **1/2/3** = Fähigkeit 1–3, **←/→** = neigen.
6. Beobachte die Leisten links unten: Treibstoff sinkt beim Boost (und am Boden durch den Antrieb), die Hitze steigt beim Boost und blinkt ab 80 %; bei 100 % „ÜBERHITZT!“ (2 s kein Boost). Harte Landungen kosten Haltbarkeit („−12 🔧“).
7. Auswertung: ⚙ Schrott-Belohnung → „🔧 Garage“.
8. Ausprobieren: Kühlschrank (überhitzt nie), Waschmaschine (Schleudergang-Knopf 🌀 wandelt Hitze in Schub), Raketenschlitten (rutscht am Boden), Mülltonne (sammelt Schrott-Häufchen ein, die sich auf ihrem Deckel stapeln).

**Am Handy**
1. Wie in Phase 1 `python tools/serve.py` und die Handy-Adresse öffnen.
2. Garage: Liste nach oben wischen (scrollt), Slot-Zeilen und Karten antippen, das Unterblatt mit ✕ oder Tippen auf den dunklen Rand schließen. Die Zurück-Taste (App) schließt erst das Unterblatt.
3. Testfahrt: **großer Knopf unten rechts = Fähigkeit 1** (Boost: halten), **links daneben = Fähigkeit 2** (tippen), **darüber = Spezialfähigkeit**. Mit dem anderen Daumen gleichzeitig links/rechts halten zum Neigen (Multi-Touch).
4. Der Ring um einen Knopf zeigt die Abklingzeit (beim Boost: den Treibstoff); grau = gerade nicht nutzbar.

### Bekannte Grenzen (kommen in späteren Phasen)
- **Auslöser (triggers) von Chassis und Teilen wirken noch nicht** (z. B. Hupe „+2 Schrauben bei perfektem Abschuss“, Rasenmäher-Drehzahl, Topfdeckel-Schild, Thermoskanne): Ihre Quellen werden schon gesammelt (`loadout.sources`) und alle Ereignisse stehen in der Warteschlange – die Trigger-Engine schließt Phase 4 an. Ebenso die Regeln `healOnCleanLanding` (Sofa), `groundSpeedStacks` (Rasenmäher), `setBonusDouble` (Badewanne) und `tagBoost` (Kühlschrank), siehe ARCHITEKTUR Anhang A.
- Forschung (Erfinder-Labor) kommt in Phase 5 – bis dahin sind Forschungs-Bedingungen nur über das Dev-Menü erfüllbar. Kerne gibt es noch nirgends außer im Dev-Menü.
- Schrauben werden nur gezählt (Verwendung beim Schrotthändler in Phase 3/5).
- Die Haltbarkeit gilt pro Testfahrt; ab Phase 3 für den ganzen Run.

