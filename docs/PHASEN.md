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
6. Nach dem Stillstand erscheint die Auswertung → **Werkstatt** → ein Upgrade kaufen (Preis und Wirkung ändern sich mit jeder Stufe weniger stark). *(Stand Phase 1 – seit Phase 2 ersetzt die Garage die Werkstatt, siehe unten.)*

**Am Handy**
1. PC und Handy im selben WLAN, am PC `python tools/serve.py`, am Handy die angezeigte Handy-Adresse öffnen (siehe README).
2. **STARTEN**, dann einen Finger **irgendwo halten** (nicht auf einen Knopf). Die Kraft pendelt; den Finger dabei **nach oben ziehen** = steiler, **nach unten** = flacher.
3. Finger **loslassen**, wenn die Kraft im **grünen Bereich** ist.
4. Im Flug: **linke Hälfte halten** = Nase hoch (die Hälfte leuchtet leicht auf), **rechte Hälfte halten** = Nase runter. Beide Hälften gleichzeitig = keine Drehung.
5. **🔥-Knopf unten rechts halten** = Boost. Gleichzeitig mit dem anderen Daumen neigen geht auch (Multi-Touch).
6. Achte darauf: Das Auto verschwindet nie aus dem Bild – auch nicht bei hohem Tempo oder sehr hohen Sprüngen. Ist der Boden zu weit weg, zeigt unten ein Pfeil die Höhe an („Boden ↓ … m“).
7. Für einen Test großer Strecken (Floating Origin) einige Upgrades kaufen (Katapult, Motor, Tank) und weit fliegen: Auch nach mehreren Kilometern bleiben Landschaft und Auto ruhig, ohne Zittern. *(Seit Phase 2: Teile in der Garage verbessern bzw. im Dev-Menü weit springen.)*

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
- 🌡 **Hitze** (0 … heatMax, Kühlung coolRate/s, heatGain verstärkt jede Zunahme): Boost +30/s, Antrieb +5/s, Glutwüste +4/s, Kühlung 10/s. Bei Maximum **Überhitzung**: 2 s kein Boost/Antrieb, 3 Schaden, Hitze fällt auf 50. Kühlschrank (noOverheat) kann nicht überhitzen, die Waschmaschine (heatIsResource) bleibt ohne Stillstand am Maximum und wandelt die Hitze per Schleudergang in Schub.
- 🔧 **Haltbarkeit** (durabilityMax, in Phase 2 pro Testfahrt): Aufprall über 14 m/s Normaltempo kostet 1 je m/s, Bruchlandung +10, holprig +2, Hindernis 5 – alles × (1 − Panzerung). Bei 0: „TOTALSCHADEN!“, die Testfahrt endet. Die alten Herzen entfallen. (Werte nach dem Nachjustieren, siehe unten.)
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

**Dev-Menü** (`ui/devMenu.js`): In den Einstellungen **7× schnell auf die Versionsnummer** tippen. +1.000/+10.000 ⚙, +10 📘, +3 💠, **📘 Forschung erfüllen** (nur die Bedingungen – Chassis dann mit 💠 kaufbar), alles freischalten (Chassis, Fähigkeiten, Forschungs-Bedingungen – Teile werden dadurch kaufbar), alle Teile schenken, alle Strecken, Testfahrt sofort beenden, 18 Werte live ändern (z. B. `BASE_STATS.launchSpeed`, `PHYSICS.hardSpeedCap`, `CAMERA.maxWidth`, `RESOURCES.dmgPerMps`, `GARAGE.costGrowth`), Meilenstein-Zeiten und die Ereignis-Zähler der letzten Etappe.

**Aufgeräumt**: `data/upgrades.js`, `garage/stats.js`, `ui/workshop.js` und das Geld sind entfernt.

**Tests**: `npm test` – zusätzlich zu Phase 1: `statMods` (add/mul/xmul, Soft-Caps, negative Boost-Hitze, Panzerung ≤ 0,6), `loadout` (jedes Chassis × jedes Teil auf Stufe 0 und 20: alle Werte endlich und plausibel; Badewanne 5 Item-Plätze; Garage-Aktionen), `save` (Migration v2 → v3, Export/Import-Rundlauf, alter SW2-Text), `resources` (Antrieb & Treibstoff, Überhitzung, noOverheat, heatIsResource, lowGrip, Aufprallschaden mit Panzerung, Abklingzeit & Kosten, Boost nur mit Treibstoff, Schleudergang, Fallschirm, Notbremse), `effects` (jeder Effekt einmal, Warteschlange, Buffs). `npm run smoke` spielt den ganzen Ablauf im Browser (siehe unten).

### Nachjustiert (nach der Prüfung von Phase 2)

Unabhängige Prüfer haben Phase 2 auf Optik, Garage-Bedienung, Ressourcen-Balance und Code-Konventionen geprüft. Ergebnis der Überarbeitung:

**Balance** – Ziel: Flug + Landung sind das Spiel, eine Testfahrt dauert ca. 20–30 s, Boost ist je Liter nicht schlechter als der Bodenantrieb, schwere Chassis fahren trotzdem, Dauer-Boost überhitzt wirklich, ein sauberer Abschuss mit Landung kostet höchstens ~3–5 % Haltbarkeit (ab Phase 3 gilt sie für ~20 Etappen), eine harte Bruchlandung 10–20 %. Alle Zahlen stehen in `data/balance.js`; geprüft mit einem Bot (echte Etappe, 9 Chassis × 3 Seeds × 2 Welten, mit/ohne Neigen und Boost) und `tests/balance.test.mjs`.

| Wert | alt | neu | Begründung |
|---|---|---|---|
| `BASE_STATS.driveFuel` | 3/s | 12/s | voller Tank ≈ 10 s Bodenfahrt statt 33 s – die Fahrt am Boden ist Überbrückung, nicht Hauptteil |
| `BASE_STATS.driveAccel` | 3,5 | 6 | Antrieb deutlich über der Rollreibung (2,5 m/s²) – auch für schwere Kisten und in der Wüste |
| `PHYSICS.driveMassExp` | (1) | 0,5 | neu: Antrieb = driveAccel / mass^0,5. Die Rollreibung bremst masseunabhängig, deshalb blieben schwere Chassis (Kühlschrank, Rasenmäher, Sofa) am ersten Hang stehen; jetzt schafft jedes Chassis mit Startteilen > 3° (Wüste: Rasenmäher ≈ 8°) |
| `BASE_STATS.boostFuel` | 20/s | 16/s | Boost-Δv je Liter (13/16 ≈ 0,8 m/s) liegt jetzt über dem Antrieb (6/12 = 0,5 m/s); Boosten in der Luft bringt im Bot-Test +20–60 % Strecke (vorher in der Steppe −10 %) |
| `BASE_STATS.fuelMax` | 100 | 120 | 7,5 s Boost bzw. 10 s Antrieb je Tank → Testfahrten ≈ 17–26 s (vorher 34–56 s) |
| `BASE_STATS.coolRate` | 15/s | 10/s | Dauer-Boost +30 − 10 = +20/s → Überhitzung nach 5 s, also vor leerem Tank (vorher in 92 % der Kombis nie). Kühlteile zögern sie spürbar hinaus; der Antrieb (+5/s) heizt nur mit Turbine/Wüste |
| `RESOURCES.overheatDamage` | 5 | 3 | Überhitzen ist jetzt häufig – die Strafe ist v. a. der 2-s-Stillstand |
| `BASE_STATS.impactThreshold` | 9 m/s | 14 m/s | ein voller Abschuss landet mit 13–17 m/s Normaltempo: sauber ≤ 3 % statt 12 % |
| `RESOURCES.dmgPerMps` | 2,5 | 1 | Sturz aus großer Höhe (25 m/s) kostet 11 statt 40 |
| `RESOURCES.crashLandingDamage` | 15 | 10 | Bruchlandung = 10 % + Aufprall → 10–20 % |
| `RESOURCES.bumpyLandingDamage` | 4 | 2 | holprig nach steilem Abschuss ≈ 4–6 % |
| `RESOURCES.obstacleDamage` | 12 | 5 | Hindernisse treffen im Bot-Test 1–2× je Etappe (der Hüpfer überspringt nur Reifenstapel) – bei ~20 Etappen sonst nicht überlebbar |
| `RESOURCES.shieldMinDamage` | – | 2 | neu: Schilde verbrauchen sich erst ab 2 Schaden (Kleinstschaden geht durch) |
| `STAGE.stopSpeed` | 0,8 m/s | 2 m/s | kürzeres Ausrollen am Ende |

Bot-Ergebnis (Mittel über alle Chassis): ohne Boost ≈ 20 s, davon ≈ 27 % in der Luft, ≈ 9–10 % Schaden (fast nur Hindernisse); mit Boost in der Luft ≈ 16–21 s, 40–52 % in der Luft. Erste Landung nach normalem Abschuss mit Ausrichten: 0–3 %. Mehr Flug-Anteil ohne Boost bringen erst die Streckenbausteine (Rampen, Schluchten) der Run-Etappen in Phase 3.

**Behoben (Auswahl)**
- *Modelle*: Bügelbrett steht mit den Beinen auf dem Aufbau (neuer Anker `deck`); Kühlschrank-Panzerung auf der Tür (Topfdeckel jetzt zwei große Deckel); Tank/Spoiler/Kühlung/Schaufel überlappen nicht mehr (Sofa- und Badewannen-Tank nach vorn, Kühlschrank-Kühlung über dem Tank, Schaufel vor der Trockeneis-Kiste); Raketenschlitten mit Bug-Latte und Bugschild; Mülltonnen-Schrott hinter dem Fahrer; Einkaufswagen-Gadgets auf dem Querholm, Tank auf einer Ablage oberhalb der Panzerung; Lüftungsschlitze auch seitlich (Anker `vent`); Lenkrad der Seifenkiste in Reichweite; Antriebe, Spoiler, Gasflasche, Glücksbringer ohne Spalt. `tests/vehicleModel.test.mjs` prüft jedes Chassis × Rad × Teil: nichts schwebt, nichts steckt im Boden, Teile verschiedener Slots durchdringen sich kaum.
- *Bodenkontakt*: Darstellung am Boden nach den Bodenhöhen unter beiden Achsen (keine eingesunkenen Räder am Hang), Traktor-Stollen innerhalb des Radius, Gummibälle als feinerer Polyeder; in der Garage wippt nur der Aufbau.
- *Garage*: Kamera passt sich der Modellhöhe und der echten Lage der Vorschau an (auch mit App-Statusleiste); Sperr-Hinweis eines Chassis liegt über der Vorschau – Pfeile und Liste springen nicht mehr; nicht leistbare Käufe sind grau, bleiben antippbar und melden „Nicht genug …“ (Grün nur für MAX); Stufe steht in der Slot-Zeile; deckendes Unterblatt mit Mini-Werte-Balken; nach dem Kauf bleibt das angetippte Teil in der Vorschau; Tag-Namen statt IDs; ausgerüstete Teile zeigen die Wirkung der nächsten Stufe; Strecken-Hinweis mit Namen und Zeilenumbruch; Touch-Ziele ≥ 44 px; `.btn:disabled` sichtbar.
- *Fähigkeiten/Ereignisse*: abilityUse {boost} erst beim echten Start; Wechsel Gratis ↔ bezahlter Boost meldet boost {free} neu; Gratis-Boosts aus Fähigkeiten melden deren ID; Gratis-Boost läuft im Stillstand nicht ab; Fähigkeiten, deren Hitzekosten selbst überhitzen würden, sind gesperrt (Zündturbo, ID `nachbrenner`); Drall-Fähigkeiten (Gyro-Kick) nur in der Luft; Fallschirm-Auftrieb endet mit dem Schirm; maxHp/maxFuel halten den Wert ≤ Maximum; emit mit unbekanntem Ereignis wird verworfen.
- *Spielstand*: falsch typisierte Felder werden repariert statt abzustürzen; nicht ladbare Stände landen als Rohtext im Backup (`schleuderwerk.save.bak`, Einstellungen → „Backup anzeigen“); bei einem Stand aus einer neueren Version wird nicht gespeichert, bis man „Neu anfangen“ bestätigt.
- *Technik*: Partikel-Farben werden nicht mehr pro Bild geparst, instanzierte Hindernisse haben ein eigenes Material, restliche Zahlen aus `main.js`/HUD/Auswertung/Objekten nach `balance.js`, 4. Fähigkeits-Knopf + Taste 4 (3 Slots + Spezialfähigkeit), tote Exporte entfernt.

**Inhaltsdaten übernommen** (korrigierte `chassis.js`, `parts.js`, `abilities.js`): gleiche IDs, Texte überarbeitet; neues Kühlteil *Heizlüfter* (`cooling_heizluefter`, Feuer-Tag, eigenes Modell vorn an der Kiste); Elektromotor, Matratze, Gasflasche zählen jetzt als Elektro-/Hydraulik-/Raketen-Teil; Trockeneis kühlt bei der Landung statt beim Boost; Glückswurf gibt immer 0,8 s Gratis-Boost (Abklingzeit 12 s); Nachbrenner heißt *Zündturbo* und heizt nur noch um 10.

**Bewusst offen**: Kostenkurve der Teile-Stufen (Stufe 20 ≈ 102 × Basispreis) wird erst gegen die Run-Ökonomie in Phase 5/6 kalibriert; die Startkraft ändert noch kein Teil, den Boost-Schub bisher nur der Heizlüfter (Inhaltsdaten); kleine Gadgets bleiben im Flug nur wenige Pixel groß (Kamera-Design).

### So testest du Phase 2

**Am PC (automatisch)**
1. `npm test` → „# fail 0“.
2. `npm run smoke` → „RAUCHTEST BESTANDEN“. In `/tmp/sw-smoke/` liegen u. a. `01-garage.png`, `02-devmenu.png`, `chassis-<id>.png` (alle 9 Chassis), `03-teile-auswahl.png`, `04-teil-gekauft.png`, `05-garage-fertig.png`, `21-flug.png`, `22-boost.png`, `23-auswertung.png`, `31-weit-und-hoch.png`, `40-strecke2.png`.

**Am PC (von Hand)**
1. `python tools/serve.py`, `http://localhost:8137` öffnen (F12 → Handy-Ansicht 412 × 915 ist am realistischsten; im Querformat steht die Garage-Liste rechts).
2. In der Garage ◀ ▶ antippen: gesperrte Chassis zeigen ihre Bedingungen. Eine Slot-Zeile antippen → Teile-Auswahl; ein Teil antippen → Vorschau im 3D-Modell und in den Werte-Balken.
3. **⚙ → 7× auf „Schleuderwerk v0.4.0“** tippen → Dev-Menü. „+10.000 ⚙“ und „🔓 Alles freischalten“, dann schließen. Jetzt kannst du jedes Chassis anwählen und Teile kaufen/ausrüsten/verbessern.
4. Fähigkeiten-Chip „Slot 2“ antippen → z. B. „Gyro-Kick“ ausrüsten. **TESTFAHRT ▶**.
5. Abschuss wie bisher (Leertaste halten/loslassen, ↑/↓ = Winkel). Im Flug: **Leertaste** = Boost, **1–4** = Fähigkeit 1–4, **←/→** = neigen.
6. Beobachte die Leisten links unten: Treibstoff sinkt beim Boost (und am Boden durch den Antrieb), die Hitze steigt beim Boost und blinkt ab 80 %; bei 100 % „ÜBERHITZT!“ (2 s kein Boost) – Dauer-Boost überhitzt nach etwa 5 s. Harte Landungen kosten Haltbarkeit („−6 🔧“), die Leiste wird unter 50 % gelb, unter 25 % rot.
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


## Phase 3 – Verzweigte Run-Karte, Etappen mit Zielmarke, 3 Biome, Bosse

Spielbar ist jetzt der ganze Roguelite-Ablauf: **Garage → RUN STARTEN → Karte Akt 1 → Knoten wählen → Etappen-Intro → Etappe (Ziel + Medaillen) → Auswertung → Karte … → Tankstelle → Boss → Akt 2 (Glutwüste) → … → Akt 3 (Gewittersteppe) → Sieg/Niederlage → Meta-Belohnung → Garage.** Items/Trigger folgen in Phase 4, Händler/Werkbank/Schwarzmarkt/Ereignisse/Schatz in Phase 5 (bis dahin Platzhalter mit kleinem Bonus).

### Was ist neu

**Biome = Akte** (`data/biomes.js`, ersetzt `data/worlds.js`)
- 🗑️ **Schrottplatz** (Akt 1, Palette der alten Steppe): Hügel, Rampen, Schluchten (ab Etage 2), Schlamm, Schrottberge (ab Etage 2), Schrottpressen (ab Etage 3). Bosse: 🗜️ *Die Schrottpresse* (Pressen-Batterie) / 🧲 *Der Magnetkran* (Magnet zieht die Kiste zu sich, Schluchten).
- 🏜️ **Glutwüste** (Akt 2, Palette der Wüste): +4 Hitze/s, Feuer-Items +25 % (`tagBoost`, wirkt ab Phase 4), Sandfelder (Rollreibung ×1,6), Thermik, Hitzefelder, große Schluchten, Windwetter. Bosse: 🕳️ *Der Große Graben* (zwei 26–32 m breite Schluchten) / 🔥 *Die Glutdünen*.
- ⛈️ **Gewittersteppe** (Akt 3, neue dunkle Palette): Regen, Blitz-Aufleuchten, Elektro-Items +25 %, **Blitzzonen** (1 s Warnring am Boden, dann Einschlag: Ereignis `shock {source:'lightning'}` + 6 Schaden), Böen und Windzonen, **Loopings**, nasser Boden (Landetoleranz −5°). Bosse: 🌪️ *Das Auge des Sturms* / ⚡ *Die Blitzallee*.
- Je Biom: Zielmarken je Etage, Elite ×1,3, Medaillen Silber ×1,25 / Gold ×1,5, Boss nur Bronze (= geschafft) und Gold (Bonus).

**Etappen-Spezifikation** (`physics/trackGen.js → generateStageSpec`): deterministisch aus Seed, Biom, Art (Etappe/Elite/Boss) und Etage → `{ target, medals, features[], hazards, weather, … }`. 13 Streckenbausteine: Hügel, Rampe, **Schlucht** (Absprungrampe davor, Breite nach Schwierigkeit; > 12 m unter die Kante → Ende `fall` + 25 Schaden), **Schlamm** (×4 Reibung), Sand (×1,6), **Looping** (geskriptet: bei genug Tempo ganz herum + „LOOPING!“, sonst rollt die Kiste zurück bzw. fällt oben herunter), Schrottberge, **Schrottpresse** (zeitgesteuerter Pressblock), Windzone, Thermik, Hitzefeld, Blitzzone, Magnetkran. Bausteine liegen gleichmäßig verteilt bis kurz hinter die Gold-Marke, überlappen nie, die ersten 40 m bleiben frei; Bosse haben eine feste Bausteinfolge.
- `physics/track.js` baut daraus die Höhenlinie (eingeebnete Flächen für Looping/Presse, Schluchtgrund, Oberflächen), `physics/objects.js` die Objekte. **Pickups:** 🔩 Schrauben (Run-Währung), ⛽ Kanister (+30 Treibstoff), ❄ Kühlpack (−35 Hitze), 🔧 Reparaturset (+8, selten), ⚙ Schrott (Meta), 📦 Item-Kiste (wird gezählt, Phase 4), 📘 Blaupause (nur Elite, selten).
- Physik (`vehicle.js`): Oberflächen-Reibung, Looping-Kreisfahrt, Schluchtsturz, Zug des Magnetkrans; an scharfen Kanten (Rampen-/Schluchtlippe) hebt die Kiste jetzt immer ab.

**Etappe** (`stage/stage.js`): Ziel + Medaillen, drei Zielflaggen (Bronze/Silber/Gold) in der Welt, Zielbalken im HUD mit Medaillen-Marken (leuchten beim Überfahren, „ZIEL ERREICHT!“), Endgründe `stop` / `wreck` / `fall` / `time`, Haltbarkeit kommt vom Run und geht an ihn zurück, Run-Werte (Tankstelle) wirken auf die Stats. Ergebnis nach ARCHITEKTUR §7.

**Karte** (`map/mapGen.js`): 6 Etagen à 2–4 Knoten (≈ 15) + Boss, kreuzungsfreie Verbindungen, alles erreichbar; Etage 0 nur Etappen, Etage 5 nur Tankstellen, Elite ab Etage 2 (max. 2), mindestens ein Händler auf Etage 2–4, Werkbank/Schwarzmarkt nur mit Forschung `r_node_workbench`/`r_node_blackmarket`, keine gleichen Sonderknoten hintereinander. Knotentypen aus `data/nodes.js`.

**Run** (`run/runState.js`, `run/rewards.js`, Zahlen in `balance.js → RUN, REWARDS`)
- `newRun(save)`: Seed, Ausrüstung der Garage (für den Run fest), Haltbarkeit = durabilityMax. Liegt in `save.run`, wird nach jeder Aktion gespeichert und ist nach einem App-Neustart fortsetzbar (Garage: **RUN FORTSETZEN** + **Aufgeben**).
- Geschafft → Schrauben und Meta-Schrott je Akt × Medaille × Knotenart, Blaupausen (Elite 1, Boss 3/4/5), Kerne beim ersten Boss-Sieg in Akt 2/3 und bei jedem Sieg. Nicht geschafft → **Abschleppen** (15 % der max. Haltbarkeit) + Neuversuch derselben Strecke. Haltbarkeit 0 → Niederlage.
- Tankstelle: Reparieren (+35 %) / Volltanken (+15 max. Treibstoff) / Kühlerspülung (+20 % Kühlung) – für den Run.
- Platzhalter (Händler, Werkbank, Schwarzmarkt, Ereignis, Schatz): „Kommt in Phase 5“, Ereignis +10 🔩, Schatz +20 🔩, Knoten gilt als besucht.
- Aktwechsel nach dem Boss (+ Akt-Bonus-Schrott). `endRun` zahlt aus: gesammelter Schrott + 10 % der übrigen Schrauben, Blaupausen, Kerne. Meilensteine: `firstRunStart`, `firstRunEnd`, `firstBossAct1/2/3`, `firstAct2/3`, `firstWin`.

**Oberfläche**: Kartenbildschirm (`ui/map.js`, Hochformat, scrollbar, Etage 0 unten, Boss oben, Linien, Knoten-Symbole, aktuelle Position, pulsierende erreichbare Knoten, Kopfleiste Akt/Biom, Haltbarkeit, Schrauben); `ui/runScreens.js`: Etappen-Intro (Ziel, Medaillen, Gefahren, Wetter, Biom-Eigenheiten, Neuversuch-Hinweis), Ergebnis mit Medaillen-Animation bzw. Abschlepp-Hinweis + Neuversuch, Tankstellen-Wahl, Platzhalter, Akt-Übergang, Run-Ende (Sieg/Niederlage, Statistik, hochzählende Belohnung). Pause im Run: „Run aufgeben“. Die Testfahrt gibt es nur noch im Dev-Menü.

**Darstellung**: 3 Paletten/Hintergründe (Gewitter: dunkle Wolken, Regen `render/weather.js`, Blitz-Aufleuchten), Schlucht mit Felswänden und dunklem Grund, Schlamm, Sand, Stahlplatten; `render/featuresView.js`: Looping-Ring, Schrottpresse (Gerüst + beweglicher Block), Windsäcke + Windstreifen, Hitzeflimmern + glühender Boden, Blitzableiter, Gewitterwolke, Warnring + Blitz, Magnetkran mit Feld, Warnschild vor Schluchten; Pickups als eigene Modelle; Zielflaggen Bronze/Silber/Gold. Die Kamera-Garantie gilt weiter (auch im Looping und über Schluchten – Test).

**Dev-Menü**: Etappe überspringen (🥇 Gold / 🥉 Bronze / verfehlt – in einer laufenden Run-Etappe oder auf der Karte für den nächsten Knoten; Tankstelle = Reparieren, Platzhalter = besucht), 👹 Zum Boss, ➡ Nächster Akt, Haltbarkeit setzen, Testfahrt je Biom, Abschlepp-Strafe live ändern.

**Balance-Simulator** (`tools/sim/bot.mjs`, `tools/sim/calibrate.mjs`, Ergebnis `docs/BALANCE.md`): Ein Bot spielt headless mit der echten Etappen-Logik je Akt/Etage/Art 40 Etappen mit Start-Loadout und „gutem“ Loadout (Startteile Stufe 10) und setzt die Zielmarken (`--apply` schreibt sie in `biomes.js`). Ergebnis:

| | Etage 0–5 (m) | Boss |
|---|---|---|
| Schrottplatz | 330 · 355 · 355 · 410 · 425 · 445 | 510 |
| Glutwüste | 490 · 525 · 525 · 530 · 550 · 570 | 625 |
| Gewittersteppe | 560 · 565 · 610 · 610 · 640 · 665 | 730 |

Prüfpunkte: Start-Loadout Akt 1 Etage 0 Median **×1,30**, Akt-1-Boss **×0,80**, gutes Loadout Akt 2 Etage 0 **×1,00**; gutes Loadout Akt 3 Etage 0 ×0,85, Boss ×0,62 (ohne Items/Synergien kaum zu schaffen – gewollt). Schaden einer normalen Etappe (Akt 1, Etage 0–1): Median 0–2 %.

**Nachjustiert / Abweichungen**
- Startwerte der Zielmarken (Akt 1: 180–330) waren zu niedrig: Ein Abschuss mit Antrieb kommt schon mit dem Start-Loadout ≈ 430 m weit. Die kalibrierten Werte oben ersetzen sie (Kurve innerhalb eines Akts nach Soll-Verhältnis 1,3 → 0,92, nie fallend).
- `BASE_STATS.impactThreshold` 14 → 16 m/s: Etappen haben jetzt mehrere Landungen (Rampen, Hügel); sonst kostete eine fehlerfreie Etappe ≈ 4 % allein durch Landungen.
- Zufällige Hindernisse seltener (`spawn.obstacle` 0,04) und so niedrig, dass der Hüpfer sie überspringt (`OBJECTS.scrap.h` 2,4, `cactus.h` 3,0); Schrottberge der Bausteine 1,5–2,3 m.
- `PHYSICS.takeoffKink` (neu): Abheben an scharfen Kanten – vorher konnte die Kiste an einer Schluchtlippe „kleben“ und die Wand hinunterfahren.
- Der Spielstand behält Version 3; das Übergangsfeld `worlds` entfällt (Bestweiten wandern nach `stats.bestDist`), ein unbrauchbarer `save.run` wird verworfen.

**Tests**: `npm test` (133 Tests) – zusätzlich `mapGen` (1000 Seeds: alle Regeln, Erreichbarkeit, Kreuzungsfreiheit, Determinismus), `runState` (ganzer Run mit Fake-Ergebnissen: Sieg über 3 Akte mit Auszahlung/Kernen/Meilensteinen, Abschleppen + Neuversuch, Niederlage durch Abschleppen und Totalschaden, Tankstelle wirkt in der Etappe, Platzhalter, Speichern/Fortsetzen nach jeder Aktion = gleicher Verlauf, Belohnungen), `trackGen` (Determinismus, keine Überlappung, erste 40 m frei, jede Schlucht mit 26 m/s Anlauf überwindbar und zu langsam nicht, Looping schnell/langsam inkl. Kamera-Garantie, Blitz → shock + 6 Schaden, Endgründe stop/wreck/fall/time, Schlamm, Presse), Spielstand mit laufendem Run.

### So testest du Phase 3

**Am PC (automatisch)**
1. `npm test` → „# fail 0“.
2. `npm run smoke` → „RAUCHTEST BESTANDEN“ (≈ 3 min). In `/tmp/sw-smoke/` u. a.: `10-karte-akt1.png`, `11-etappen-intro.png`, `21-flug.png`, `23-ergebnis.png`, `24-ergebnis-gold.png`, `25-abschleppen.png`, `26-boss-intro.png`, `27-boss-besiegt.png`, `28-akt-uebergang.png`, `30-karte-akt2.png`, `31-gluewueste.png`, `40-karte-akt3.png`, `41-gewittersteppe.png`, `50-run-ende.png`, `51-garage-fortsetzen.png` und je Streckenbaustein `f-<typ>.png` (crusher, gap, heatZone, hills, lightning, loop, magnetZone, mud, ramp, sand, scrapPile, thermal, wind).
3. Optional: `node tools/sim/calibrate.mjs` (≈ 40 s) misst neu und schreibt `docs/BALANCE.md`; mit `--apply` werden die Zielmarken übernommen.

**Am PC (von Hand)**
1. `python tools/serve.py`, `http://localhost:8137` (F12 → Handy-Ansicht 412 × 915).
2. Garage → **RUN STARTEN ▶** → Karte Akt 1. Einen pulsierenden Knoten unten antippen → Intro (Ziel, Medaillen, Gefahren) → **LOS ▶**.
3. Abschuss wie bisher (Leertaste halten/loslassen). Oben der Zielbalken: B/S/G leuchten beim Überfahren, in der Welt stehen die drei Flaggen.
4. Auswertung: Medaillen leuchten nacheinander auf. Nicht geschafft → „Abschleppen −15 🔧“ und **↻ Neuversuch** (gleiche Strecke).
5. ⚙ → 7× Versionsnummer → Dev-Menü: „Etappe: 🥇 Gold“ mehrmals, „👹 Zum Boss“, Boss überspringen → Akt-Übergang zur Glutwüste. „➡ Nächster Akt“ → Gewittersteppe (Regen, Blitze). „Haltbarkeit setzen“ auf 1 + „Etappe: verfehlt“ → Niederlage → Run-Ende mit Belohnung.
6. Streckenbausteine ansehen: Dev-Menü → Testfahrt je Biom, oder in der Konsole `__game.startTestDrive('gewittersteppe', { kind: 'boss', bossId: 'auge_des_sturms' })` (Loopings, Blitze, Wind).
7. Neu laden während eines Runs → Garage zeigt **RUN FORTSETZEN ▶** und „Aufgeben“.

**Am Handy**
1. Wie bisher `python tools/serve.py` und die Handy-Adresse öffnen.
2. Karte mit dem Finger scrollen, Knoten antippen; nicht erreichbare Knoten zeigen unten kurz ihre Beschreibung.
3. In der Etappe: Looping mit Schwung anfahren (Boost hilft), an Schluchten über die Rampe springen, bei einem gelben Warnring (Blitz) Gas geben oder bremsen, den Hüpfer vor Schrottbergen und geschlossenen Pressen nutzen.
4. Pause (❚❚) → „Run aufgeben“ beendet den Run mit Auszahlung.

### Bekannte Grenzen (kommen in späteren Phasen)
- Nach einer Etappe gibt es noch keine Item-Auswahl, Item-Kisten werden nur gezählt (Phase 4). `tagBoost` der Biome wirkt erst mit Items.
- Händler, Werkbank, Schwarzmarkt, Ereignis und Schatz sind Platzhalter (Phase 5). Schrottstufen (`ascension`) sind vorbereitet (`mods` in `generateStageSpec`, `eliteWeightAdd` in der Karte), aber noch nicht wählbar.
- Ohne Items sind Elite-Etappen (Ziel ×1,3) und die Bosse mit dem Start-Loadout bewusst schwer; ein Run endet meist in Akt 1–2.
- Ein Abbruch per App-Schließen mitten in einer Etappe zählt nicht als Versuch (der Knoten startet beim Fortsetzen neu).

## Phase 4 – Trigger-Engine, Tags, Set-Boni, Items

Spielbar ist jetzt der Kern des Roguelites: **Start-Item je Chassis → nach jeder geschafften Etappe 1 aus 3 Items (oder Schrauben) → Items lösen in der Etappe Effekte aus, Ketten-Reaktionen, Set-Boni bei 2/4/6 Items eines Tags.** Händler, Werkbank (Fusion/Hybride), Schwarzmarkt, Ereignisse und das Forschungslabor folgen in Phase 5.

### Was ist neu

**Inhalte** (`www/src/data/`)
- Die geprüften Inhaltsdateien liegen unverändert in `data/content/content_*.js` (6 Dateien, 88 Items, 10 Tags). `data/tags.js` (10 Tags mit Set-Boni 2/4/6) und `data/items.js` (eine Liste aller 88 Items, Seltenheiten mit Farbe) führen sie nur zusammen. Dazu kommen – ebenfalls unverändert – `research.js`, `textEvents.js`, `ascension.js`, `cosmetics.js` (Verwendung ab Phase 5/6; der Inhalts-Prüfer braucht sie für Querverweise).
- `tools/validateContent.mjs` = der mitgelieferte Prüfer mit angepassten Pfaden (`node tools/validateContent.mjs` → „Keine Fehler.“, `--json` für Maschinen). Er läuft in `npm test` mit.

**Trigger-Engine** (`items/triggerEngine.js`, `items/conditions.js`)
- Verteilt jedes Ereignis der Etappe an die Auslöser von Chassis, Teilen, Set-Boni und Items (Reihenfolge in dieser Folge). Warteschlange (FIFO) und Buffs/Stapel/Zähler sind die Bausteine aus Phase 2 (`stage.queue`, `stage.mods`) – nichts doppelt.
- Kettentiefe: Ereignisse aus Effekten bekommen Tiefe + 1; über Tiefe 8 wird verworfen, höchstens 64 Ereignisse je Abarbeitung. Rohereignisse, die Effekte auslösen (Heilung, Schaden, Abprall, Überhitzung, eingesammelte Pickups), und Gratis-Boosts gehören zur Kette – so entsteht z. B. *Salto → Stromschlag → Gratis-Boost → Kühlung → Tempo*.
- Limits je Auslöser: Abklingzeit, je Etappe, je Run (Zähler im Run). Alle 20 Bedingungen (`heatAbove` … `chassis`), Glück erhöht `chance`. Run-Ereignisse (runStart, nodeEnter, stageClear, itemGained, shopEnter) laufen über dieselbe Engine ohne Fahrzeug.
- Die vorbereiteten Auslöser von Chassis und Teilen wirken jetzt: Rasenmäher-Drehzahl (HUD-Leiste ⚙️), Sofa heilt bei sauberen Landungen, Hupe, Topfdeckel-Schild, Thermoskanne, Gasflasche, Elektromotor, Trockeneis, Schneeschaufel, Glücksbringer, Mülltonne, Raketenschlitten, Waschmaschine.

**Alle Regeln** (ARCHITEKTUR Anhang A, Zahlen in `balance.js → RULES`): Chassis (healOnCleanLanding, groundSpeedStacks, setBonusDouble, tagBoost), Set 6 je Tag (Nachbrenner, Eiszeit, Lichtbogen, Drehimpuls, Magnet-Anziehung, Abrissbirne, Aufprall→Schub, Schlucht-Trampolin, Raketen-Übertempo, Glücks-Echo), Legendäre (Perpetuum Mobile – Hitze statt Treibstoff, Schiffskompass, Hüpfburg, Wasserwaagen-Rakete, Levitron, Hubstützen, Schraubenvergaser, Teslaspule, Dreiblatt-Klee, Schlittschuhkufen) und Flüche (Schwarze Katze, Ewiger Eiszapfen, Gummihuhn, Geisterbahn-Magnet, Spieluhr). Biome: Glutwüste Feuer-Items +25 %, Gewittersteppe Elektro-Items +25 %, Kühlschrank Eis-Items +50 %.

**Inventar** (`items/inventory.js`): Item-Plätze (6, Badewanne 5), Stufen ★1–3 (Faktor 1,0/1,6/2,3), Tag-Zählung (Items mit zwei Tags und Hybride zählen für beide Tags, Garage-Teile mit Tag zählen 1), aktive Set-Boni 2/4/6, Stat-Beiträge in der Stat-Pipeline, Beschreibungen mit eingesetzten Werten (`{dur}` → „0,8 s“ bei ★1, „1,3 s“ bei ★2). Fusion (2 gleiche → ★+1) und Hybride (2 Tags, je ×0,75) sind als Funktionen fertig – die Werkbank dafür kommt in Phase 5.

**Run** (`run/runState.js`, `run/rewards.js`)
- Start-Item: ein zufälliges Grund-Item des Chassis-Tags (Seifenkiste Magnet, Einkaufswagen Glück, Sofa Gyro …).
- Nach jeder geschafften Etappe eine Auswahl: Etappe meist Gewöhnlich/Selten, **Elite mindestens Selten**, **Boss Episch/Legendär** (Gewichte `balance.ITEMS.rarityWeights`, in Akt 2/3 seltenere Items häufiger). Je eingesammelter 📦 Item-Kiste eine weitere Auswahl. Statt eines Items: **„Überspringen: +8/12/16 🔩“**. Voller Rucksack → ein Item ersetzen oder ablehnen (Schrauben).
- Pool: nur Grund-Items (`pool: 'base'`, 20 Stück) und Items, deren Forschung erledigt ist – bis zum Labor (Phase 5) per Dev-Menü „Alle Items in den Pool“. Verfluchte Items kommen nie in die Auswahl (Schwarzmarkt, Phase 5).
- Kodex: angebotene Items gelten als entdeckt, aktivierte Set-Boni ebenso (`save.codex`). Offene Auswahlen überleben einen App-Neustart.

**Oberfläche**
- **Item-Auswahl**: Karten mit Symbol, Name, Seltenheitsfarbe, Tags, ★, Beschreibung mit Werten, Fluch-Text und welche Set-Boni das Item voranbringt („⚡ Elektro: Set 2 aktiv!“ bzw. „1/2 bis Set 2“).
- **Karte**: Item-Leiste unter der Haltbarkeit → Tippen öffnet das **Inventar** (Items mit Details, Reiter **Set-Boni**: alle 10 Tags mit Zähler, Balken und Stufen 2/4/6, die aktiven hervorgehoben, Biom-Verstärkung).
- **HUD**: Item-Leiste links; das Symbol hüpft bei jeder Auslösung („×2“ bei Glücks-Echo, „★+1“ beim Dreiblatt-Klee). Rechts eine Feed-Zeile der letzten Auslösungen. Ab Kettentiefe 3 erscheint groß **„KETTENREAKTION ×n!“**.
- **Garage**: 📖 **Kompendium** – entdeckte Items mit Werten, unentdeckte als „???“, Set-Boni (unentdeckte Stufen „???“).
- Etappe endet zusätzlich bei **Gold × 2** („Ziel weit übertroffen“), damit Item-Kreisläufe nicht bis zur Zeitgrenze laufen.

**Dev-Menü**: Abschnitt „Items (Run)“: Suche + Liste aller 88 Items → **➕ Item hinzufügen** (auch über die Plätze hinaus), **★ erhöhen** für einen Inventar-Platz, **🎲 Alle Items in den Pool**, **🔗 Ketten-Log** (jede Auslösung eingerückt nach Tiefe in der Browser-Konsole).

### Balance-Check (`node tools/sim/items.mjs`, Ergebnis `docs/BALANCE.md` → „Items“)
Bot mit gutem Loadout (Startteile Stufe 10); mit Salto-Items (ein Gyro-Item oder zwei andere Salto-Auslöser) dreht er zusätzlich Saltos, ist Überhitzen folgenlos (Feuer-Set 6), boostet er bis zum Überhitzen.

| | ohne Items | 6 zufällige Items | beste Synergie (Elektro-Kette / Raketen-Set 6) |
|---|---|---|---|
| Akt 2, Etappen geschafft | 39 % | 68 % | 100 % |
| Akt 3, Etappen geschafft | 22 % | 53 % | 100 % |
| Akt-3-Boss geschafft | 0 % | 37 % | 67 % / 100 % |
| ganze Runs: Sieg | 13 % | 23 % (68 % scheitern in Akt 2–3) | 30 % (Synergie-Auswahl, Abschleppen Median 1,5 statt 4) |

Ergebnis: Items verschieben die Weite stark (zufällig ×1,1–1,6, Synergie ×1,4–3); gute Synergie-Builds (Elektro-Kette, Raketen-, Gyro-, Hydraulik-Set) schaffen die Akt-3-Etappenziele, zufällige mittelmäßige Builds scheitern meist in Akt 2–3, ohne Items scheitern 88 % der Runs. Die Zielmarken bleiben unverändert. Schwächster Synergie-Build ist das Feuer-Set 6 (Akt 3 ×0,8–0,9, Boss 8 %): es lebt vom Überhitzen im Nachbrenner-Takt (8 s), das der Bot nur grob nachspielt – Werte stehen in der ruleSpec/Item-Beschreibung und bleiben daher, offener Punkt für die Balance in Phase 5/6.

**Nachjustiert** (nur `balance.js`):
- `ITEMS.effectJumpCancelFall = 0` (neu): Sprünge aus Item-Effekten (Jo-Jo, Explosionen) sind in der Luft reine Impulse; nur die Fähigkeit Hüpfer hebt das Fallen ganz auf. Vorher ließ sich per Salto-Sprung endlos schweben (Gyro-Set: ×16 der Zielweite).
- `STAGE.farMul = 2` (neu): Etappe endet bei Gold × 2 (Grund `far`). Kreisläufe wie Gyro-Set 6 (Salto → Landung → Schub → Sprung …) liefen sonst bis zur Zeitgrenze (bis zu 165 s).
- Item-Auswahl: Gewichte, Akt-Faktoren, Überspringen-Schrauben, Regel-Parameter `RULES.*` sind neu in `balance.js`.
- Simulator (nur Messung, kein Spielwert): der Bot dreht Saltos erst mit einem Gyro-Item oder zwei anderen Salto-Auslösern (eine einzelne Zündkerzen-Kette kostete ihn mehr Weite, als sie brachte) und boostet bei folgenlosem Überhitzen ohne Hitze-Reserve. Feuer-Set 6 dadurch Akt 1 Boss ×0,75 → ×1,07, die übrigen Spalten unverändert.

**Tests**: `npm test` (183 Tests) – zusätzlich `triggerEngine` (Kettentiefe 8, 64 Ereignisse je Abarbeitung, cooldown/perStage/perRun, charge + stack, chance mit Glück, ★-Faktor, alle Bedingungen, Run-Kontext, Chassis- und Teile-Auslöser in der Etappe – Raketenschlitten, Hupe, Topfdeckel –, **Pflicht-Kette Elektro + Gyro + Kühlung in einer echten Etappe**), `rules` (jede Regel mindestens einmal), `items` (Inhalts-Prüfer ohne Fehler, Tag-Zählung/Sets/Hybride, Stat-Beiträge, Badewanne + voller Rucksack, Fusion/Hybrid, Platzhalter aller 88 Items in ★1–3, Auswahl-Gewichte und Pool, Start-Item je Chassis, Auswahl nach der Etappe + Kisten + Überspringen + Kodex + Speichern, Run-Ereignisse, **alle 88 Items ★3 gleichzeitig 60 s in einer Etappe je Biom**: keine Ausnahme, ≤ 64 Ereignisse je Abarbeitung, alle Werte endlich, Ende bei Gold × 2).

### Geprüft und nachgebessert
- Tastatur: Pfeil- und Leertaste gehen nur noch dann an ein Eingabefeld, wenn darin wirklich getippt wird (sichtbares Text-/Zahlenfeld). Das Kontrollkästchen „Ketten-Log“ oder ein Feld im geschlossenen Dev-Menü sperrten vorher die Steuerung; das Dev-Menü gibt beim Schließen den Fokus ab (`platform/input.js`, `ui/devMenu.js`).
- Rauchtest: Vor den Tastatur-Prüfungen der Weitflug-Testfahrt wartet er, bis die Etappe Bilder verarbeitet (der erste Frame einer neuen Strecke dauert mit Software-Rendering teils > 0,5 s, ein kurzer Tastendruck fiel dazwischen – der Test schlug dadurch sporadisch fehl). Bei einem Fehlschlag schreibt er eine Diagnose-Zeile.
- Neuer Test: Auslöser von Chassis und Garage-Teilen wirken in einer echten Etappe (Raketenschlitten-Gratis-Boost mit Kettentiefe 1, Hupe, Topfdeckel-Schild).
- Balance-Simulator: Bot-Fahrweise für Salto- und Feuer-Builds verfeinert (siehe oben); Ergebnis in `docs/BALANCE.md` neu erzeugt.

### So testest du Phase 4

**Am PC (automatisch)**
1. `npm test` → „# fail 0“.
2. `npm run smoke` → „RAUCHTEST BESTANDEN“ (≈ 7 min mit Software-Rendering). Neu in `/tmp/sw-smoke/`: `12-item-auswahl.png`, `13-inventar.png`, `14-set-uebersicht.png`, `33-kettenreaktion.png`, `52-kompendium.png`, `53-kompendium-sets.png` (ggf. `15-rucksack-voll.png`).
3. Optional: `node tools/validateContent.mjs` (Inhalte), `node tools/sim/items.mjs` (≈ 1 min, schreibt den Abschnitt „Items“ in `docs/BALANCE.md`).

**Am PC (von Hand)**
1. `python tools/serve.py`, `http://localhost:8137` (F12 → Handy-Ansicht 412 × 915).
2. **RUN STARTEN ▶** → oben auf der Karte steht schon das Start-Item in der Item-Leiste. Antippen → Inventar, Reiter „Set-Boni“.
3. Eine Etappe schaffen (oder Dev-Menü „Etappe: 🥇 Gold“) → **Weiter ▶** → Item-Auswahl: eine Karte „Nehmen“ oder „Überspringen“.
4. Kette ausprobieren: Dev-Menü → Suche „dynamo“ → ➕, „blitzab“ → ➕, „tesla“ → ➕, „🔗 Ketten-Log“ an, F12-Konsole öffnen. Eine Etappe starten, in der Luft ← halten bis zum Salto: Stromschlag → Gratis-Boost → … – die Symbole links hüpfen, rechts läuft der Feed, „KETTENREAKTION ×4!“ erscheint, in der Konsole steht die Kette eingerückt.
5. Garage → 📖 Kompendium: angebotene Items sind entdeckt, der Rest „???“.
6. Chassis-Regeln: Sofa (heilt bei sauberer Landung, „+3“), Rasenmäher (Drehzahl-Leiste unten links füllt sich bei jeder Bodenberührung), Badewanne (5 Plätze, Set-Boni doppelt), Kühlschrank (Eis-Items +50 %).

**Am Handy**
1. Wie bisher `python tools/serve.py` und die Handy-Adresse öffnen.
2. Item-Auswahl: Karten scrollen, „Nehmen“ antippen; 🎒-Knopf oben zeigt das Inventar. Ist der Rucksack voll, erscheint die Liste zum Ersetzen.
3. In der Etappe: links die Item-Symbole (hüpfen beim Auslösen), rechts oben die letzten Auslösungen. Saltos (linke Hälfte halten) lösen viele Items aus.
4. Zurück-Taste: schließt Inventar/Kompendium; in der Item-Auswahl nichts (bewusst wählen), beim Ersetzen zurück zur Auswahl.

### Abweichungen / offene Punkte
- `doubleDamage` (Hubstützen) wird in `physics/vehicle.js → damage()` ausgewertet statt in `stage.js ctx.damage` – dort laufen alle Haltbarkeitsverluste zusammen (auch die aus `ctx.damage`).
- `mutualAttraction`: Schrauben zählen als Pickups (sonst wirkt die Regel kaum). `shockRecharge` greift nur, wenn gerade eine Stromschlag-Abklingzeit läuft (sonst würde die 3-s-Sperre verschenkt). Bei einem Item mit zwei verstärkten Tags (`tagBoost`) gilt der größere Wert.
- Werte in ruleSpec-Texten, die von `balance.js` abweichen (Spiel nutzt `balance.js`): Überhitzungsschaden „5“ (overheatAfterburner, heatIsFuel) – `RESOURCES.overheatDamage` = 3; boostHold „fuel 20“ – `BASE_STATS.boostFuel` = 16; collectScrapMass „15 → 5“ – `RESOURCES.obstacleDamage` = 5 (→ 1,7); lowGrip 0,4/0,6 – `RULES.lowGrip` = 0,5.
- `firstHitBounces`/`fuelRegenOnFlip` (nur als Beispiele in ARCHITEKTUR 4.10/4.11) kommen in keinem Inhalt vor und sind nicht umgesetzt.
- Der Feuer-Set-Kreislauf (Überhitzen als Waffe) wird vom Bot nicht gespielt (er boostet nur unter 72 % Hitze) – in der Messung wirkt das Feuer-Set deshalb kaum.
- Werkbank-Oberfläche, Händler, Schwarzmarkt (verfluchte Items), Ereignisse, Labor/Forschung für die Item-Pools: Phase 5.

## Phase 5 – Währungen, alle Shops, Werkbank, Schwarzmarkt, Erfinder-Labor

Alle Platzhalter-Knoten aus Phase 3 sind jetzt echte Knoten, die vier Währungen haben je eine klare Aufgabe und Endgame-Senken, und das Erfinder-Labor bringt Items, Teile, Fähigkeiten, Chassis und Kartenknoten ins Spiel. Spielbar: **Garage → 🧪 Labor (Blaupausen ausgeben) / 🎨 Lack → RUN → Karte mit Händler, Werkbank, Schwarzmarkt, Tankstelle, Ereignissen und Schatzhaufen.**

### Was ist neu

**Währungen** (V2-DESIGN §6, alle Beträge in `data/balance.js`)
| Währung | Quelle | Verwendung | Senke |
|---|---|---|---|
| 🔩 Schrauben (Run) | Etappen, Pickups, Stunts, Zerlegen, Ereignisse, Start-Bonus aus der Forschung | Händler (Items, Fähigkeit, Reroll), Fluch entfernen, Ereignis-Kosten | Rest am Run-Ende → **10 % als Schrott** (`REWARDS.boltsToScrap`, Zeile „Schrauben-Rest“ in der Auszahlung) |
| ⚙ Schrott (Meta) | Medaillen, Bosse, Akt-Bonus, Run-Ende, Ereignisse | Teile kaufen/verbessern, Lackierungen | 16 Schrott-Lacke (500–20.000 ⚙, zusammen ≈ 103.000 ⚙), Teile-Stufen bis 20 |
| 📘 Blaupausen | Elite 1, Boss 3/4/5, Ereignisse | Erfinder-Labor | 3 Feinschliff-Knoten mit 25/20/10 Stufen (Preis × 1,15 je Stufe) |
| 💠 Kerne (selten) | erster Boss-Sieg Akt 2/3, Run-Sieg (`REWARDS`), drei Akt-3-Ereignisse (≤ 10 %) | Chassis (zusätzlich zur Forschung), Schwarzmarkt (1 Kern je Item), Kern-Lacke | nie inflationär: max. 1 (Sieg) + 2 (erste Boss-Siege, einmalig) + selten 1 aus einem Ereignis je Run |

**Neue Zahlenblöcke** in `balance.js`: `SHOP`, `WORKBENCH`, `BLACKMARKET`, `STATION`, `EVENTS`, `TREASURE`, `RESEARCH` (Kosten-Faktor). Die `params` in `data/nodes.js` bleiben als Beschreibung; ein Test prüft, dass beide übereinstimmen. `REWARDS.placeholderBolts` ist entfernt.

**🛒 Schrotthändler** (`shops/scrapDealer.js`)
- 5 Items (Seltenheit nach Akt: Akt 1 55 % Gewöhnlich … Akt 3 27 % Episch, 7 % Legendär) + 1 Fähigkeit. Preis = Seltenheit (30/50/80/130 🔩) × Akt-Faktor (1 / 1,3 / 1,6) × (1 − Händler-Rabatt). Einkaufswagen −20 %, Items wie Opas Glückspfennig addieren sich.
- Fähigkeit: ersetzt einen Fähigkeits-Slot bis zum Run-Ende (auch nicht erforschte Fähigkeiten).
- **Neu würfeln**: 10 + 10 je Reroll, Reroll-Rabatt aus Items und Forschung (−20 %).
- **Reservieren** (📌, 1 Platz, Forschung +1): das Item wartet beim nächsten Händler des Runs zum gesicherten Preis.
- Bereits besessene Items können angeboten werden (Gewicht 0,6) – Doppelte für die Werkbank. `shopEnter` löst Items aus.

**🔧 Werkbank** (`shops/workbench.js`, nur mit Forschung „Opas Werkbank“)
- 2 gleiche Items mit gleicher ★ → ★+1 (max. ★3) · 2 Items mit verschiedenen Tags → **Hybrid** (beide Tags, beide Effekte × 0,75, ein Slot wird frei, Name aus beiden Namen: „Zündkerzen-Kette“ + „Kreisel aus Omas Nachttisch“ = **Zündkerzen-Kreisel**; wird gespeichert). Je Besuch eine Fusion.
- Zerlegen (unbegrenzt) → 40 % des Händler-Grundpreises je ★-Wert (★2 = 2 Items, ★3 = 4) als Schrauben.

**🕳 Schwarzmarkt** (`shops/blackMarket.js`, nur mit Forschung „Kofferraum-Kontakte“)
- 3 verfluchte Items (die vier Grund-Flüche immer, die vier weiteren nach „Dunkle Bastelstunde“), bezahlt mit **−15 % max. Haltbarkeit**, **−15 max. Treibstoff** (beides für den Run) oder **1 Kern**.
- **Fluch entfernen** gegen 45 🔩 × Akt-Faktor: das Item behält seine Stärken, der Fluch-Teil entfällt („✨ Fluch entfernt“).

**⛽ Tankstelle** (`shops/gasStation.js`, aus `runState.js` verschoben): Reparieren +35 % × (1 + Reparatur-Bonus) / +15 max. Treibstoff / +20 % Kühlung.

**❓ Ereignisse** (`shops/textEvent.js`): alle 26 Ereignisse aus `data/textEvents.js`, je Akt ausgewählt und im Run nicht doppelt; Kosten (Schrauben, Haltbarkeit, Treibstoff, Fundstück zufällig/gewählt) werden vor dem Würfeln bezahlt, nicht bezahlbare Optionen sind grau mit Grund. Ausgang deterministisch aus dem Run-Seed. Alle Effekt-Arten: Schrauben, Schrott, Blaupausen, Haltbarkeit ±, max. Haltbarkeit, max. Treibstoff, Fundstück (Seltenheit/Tag), Item weg (zufällig/gewählt), Item ★+1 (zufällig/gewählt), Fluch dazu, Fluch weg, **Elite-Etappe** (der Knoten wird sofort zur Elite-Etappe mit Elite-Belohnung), Kern, nichts. Ergebnis-Text mit allen Änderungen. Ereignis-Schaden beendet nie den Run (mind. 1 Haltbarkeit).

**💰 Schatzhaufen** (`shops/treasure.js`): Gratis-Item (wie Item-Kiste). 30 % **„verdächtig“** – der Hinweis ist sichtbar, das Item besser (mind. Selten), dafür ein Haken: 10 % Schaden, ein Fluch-Item dazu oder die Hälfte der Schrauben weg. Wahl: **Nehmen** / **Liegen lassen**.

Voller Rucksack: Kauf → Platz zum Ersetzen wählen; Item aus Ereignis/Schatz → Auswahl „Nehmen (ersetzen) / Ablehnen“; ein Fluch verdrängt ein zufälliges nicht verfluchtes Item.

**🧪 Erfinder-Labor** (`garage/research.js`, Garage-Reiter „Labor“, `ui/lab.js`)
- 72 Knoten in 5 Ästen (Mechanik, Chemie, Elektrik, Glück & Handel, Karosseriebau) als scrollbarer Baum mit Linien zu den Voraussetzungen; Zustände gesperrt (grau) / verfügbar (Astfarbe, leuchtet, wenn bezahlbar) / erforscht (grün). Antippen → Beschreibung, Freischaltungen, Voraussetzungen, „Erforschen · 📘 n“.
- Freischaltungen: Item-Pools, Garage-Teile, Fähigkeiten, Chassis-Baupläne (Kauf dann mit 💠 in der Garage), Kartenknoten (Werkbank, Schwarzmarkt – ab dem nächsten Akt bzw. Run), Perks: Start-Schrauben, +1 Item-Slot, 3. Fähigkeits-Slot, Reroll-Rabatt, +1 Reservieren-Platz, Start-Haltbarkeit, +Schrott (auf allen Schrott am Run-Ende), `choiceExtra` (+ Items zur Wahl, vorbereitet).
- Wiederholbare **Feinschliff I–III** (Preis × 1,15 je Stufe, Höchststufe 25/20/10). Spielstand: `research.levels`.
- Der Run merkt sich Forschung und Perks beim Start (`run.research`, `run.perks`).

**🎨 Lackiererei** (Garage-Reiter „Lack“): 24 Lackierungen aus `data/cosmetics.js` – Schrott, Kerne oder Run-Sieg auf einer Schrottstufe (Phase 6). Antippen = Vorschau am 3D-Modell, Kaufen legt sofort an, „Original“ = Chassis-Farben. Die Farbe gilt auch in der Etappe.

**Dev-Menü**: „🧪 Ganzen Baum erforschen“, „Nächste Knoten → Typ“ (alle wählbaren Knoten bekommen einen Typ – zum Testen jedes Shops), „Etappe überspringen“ verlässt Sonderknoten. „📘 Forschung erfüllen“ / „🔓 Alles freischalten“ bleiben als Abkürzung.

### Tests
`npm test` (209 Tests) – neu: `tests/shops.test.mjs` (Händler: Auslage, Seltenheit je Akt, Preise × Akt × Rabatt inkl. Einkaufswagen und Item-Rabatt, Reroll 10/20/30 + Forschungs-Rabatt, Reservieren über Akte hinweg + Forschungs-Platz, Kaufen mit vollem Rucksack, Fähigkeit ersetzt Slot, shopEnter; Werkbank: ★-Fusion nur mit gleicher ★, 1 Fusion je Besuch, ★3-Grenze, Hybrid mit beiden Tags/Effekten × 0,75/Set-Zählung/Name/Speichern, Zerlegen; Schwarzmarkt: Fluch-Pool, alle drei Bezahlarten, Mindest-Rest, Fluch entfernen; Tankstelle; Ereignisse: Auswahl je Akt ohne Wiederholung, Determinismus, jede Effekt-Art, alle Kosten-Arten, Elite aus Ereignis, **alle 26 Ereignisse × alle Optionen × alle Ausgänge**; Schatz: 30 %-Anteil, jeder Haken, Liegen lassen; Run-Ende 10 %; **Speichern/Fortsetzen mitten in jedem Shop**), `tests/research.test.mjs` (Baum-Daten, Voraussetzungen, Kosten, alle Freischaltarten, alle Perks, Feinschliff, Migration, Lackierungen). Angepasst: `runState` (Sonderknoten statt Platzhalter), `items` (Hybrid-Name).

### So testest du Phase 5

**Am PC (automatisch)**
1. `npm test` → „# fail 0“.
2. `npm run smoke` → „RAUCHTEST BESTANDEN“ (≈ 8 min). Neu in `/tmp/sw-smoke/`: `70-labor.png`, `71-labor-knoten.png`, `72-labor-erforscht.png`, `73-lack-vorschau.png`, `74-lack-gekauft.png`, `80-haendler.png`, `81-haendler-reserviert.png`, `82-haendler-faehigkeit.png`, `83-haendler-fortgesetzt.png` (nach Neuladen mitten im Shop), `84-werkbank.png`, `85-werkbank-fusion.png`, `86-schwarzmarkt.png`, `87-schwarzmarkt-fluch-weg.png`, `88-ereignis.png`, `89-ereignis-ergebnis.png`, `90-schatz.png`, `91-schatz-genommen.png`, `92-tankstelle.png`.

**Am PC (von Hand)**
1. `python tools/serve.py`, `http://localhost:8137` (F12 → Handy-Ansicht 412 × 915).
2. Dev-Menü (⚙ → 7× Versionsnummer): „+10 📘“, „+10.000 ⚙“. Reiter **🧪 Labor**: Baum mit dem Finger/der Maus verschieben, „Opas Werkbank“ antippen → **Erforschen**. Reiter **🎨 Lack**: einen Lack antippen (Vorschau), **Kaufen**.
3. Dev-Menü „🧪 Ganzen Baum erforschen“, dann **RUN STARTEN**. Dev-Menü → „Nächste Knoten“ z. B. „Schrotthändler“ → ✔ → Knoten antippen.
4. Händler: Kaufen, „↻ Neu würfeln“ (10, dann 20 …), „📌 Reservieren“ (das Item liegt beim nächsten Händler vorne), Fähigkeit kaufen → Slot wählen. Seite neu laden → RUN FORTSETZEN → der Händler ist sofort wieder offen.
5. Werkbank: zwei gleiche Items (Dev-Menü „Item hinzufügen“ zweimal) → „★ Verschmelzen“; Hybrid bauen; Zerlegen.
6. Schwarzmarkt, Ereignis, Schatzhaufen, Tankstelle genauso über „Nächste Knoten“.
7. Run aufgeben → Auszahlung zeigt „Schrauben-Rest (… × 10 %)“.

**Am Handy**
1. Wie bisher `python tools/serve.py` und die Handy-Adresse öffnen.
2. Garage: Reiter oben (Garage · Labor · Lack). Im Labor mit einem Finger in beide Richtungen wischen, Knoten antippen, unten erforschen.
3. Shops sind Karten über der Karte: nach unten wischen für alle Angebote; „Weiter ▶“ verlässt den Knoten. Die Zurück-Taste schließt nur die Platz-Auswahl (Shops bewusst nur über „Weiter“).

### Abweichungen / offene Punkte
- **Maßgebliche Zahlen in `balance.js`**: `data/nodes.js → params` bleibt als Beschreibung (gleiche Werte, Test). `WORKBENCH.hybridMul` ersetzt `nodes.workbench.params.hybridEffectMul` im Code.
- **Perk scrapGain** („+2 % Schrott je Stufe“) wirkt am Run-Ende auf allen Schrott des Runs (eigene Zeile in der Auszahlung) – nicht als Stat, sonst würden Pickups doppelt zählen.
- **„Fluch entfernen“** (Schwarzmarkt, Ereignis `removeCurse`) entfernt den Fluch-Teil, das Item bleibt mit seinen Stärken. Ein Hybrid aus einem gebannten und einem aktiven Fluch-Item trägt wieder beide Flüche.
- **`choiceExtra`** steht in der Aufgabe, aber in keinem Forschungsknoten – als Perk unterstützt (+ Items zur Wahl), noch ungenutzt.
- **Ereignis-Items** und Händler nutzen den Forschungs-Pool: ohne Forschung gibt es nur die 20 Grund-Items (alle Gewöhnlich); ein „seltenes Fundstück“ fällt dann auf ein Grund-Item zurück.
- Händler-Fähigkeiten brauchen keine Forschung (der Händler ist eine Möglichkeit, sie auszuprobieren).
- Schrottstufen (`ascension`: Preise, Reparatur, Start-Fluch) wirken noch nicht – Phase 6. Lacke mit „Schrottstufe N“ sind bis dahin nur per Spielstand erreichbar.
- Der Balance-Simulator (`tools/sim/items.mjs`) geht durch Sonderknoten nur hindurch; eine Ökonomie-Hochrechnung (Schrauben-Einnahmen gegen Händlerpreise, Meilenstein-Zeiten) folgt in Phase 6.
- Version 0.5.0.

## Phase 6 – Schrottstufen, Bosse, Content-Balance, Progressions-Simulator

Der vorhandene Content ist jetzt vollständig wirksam und die Progression ist auf die Zielzeiten aus V2-DESIGN §8 abgestimmt. Spielbar: **erster Run-Sieg → ☠ Schrottstufen 1–15 in der Garage wählen → Run mit allen Erschwerungen → Belohnungen, Bestwerte, Statistik.**

### Was ist neu

**☠ Schrottstufen 1–15** (`data/ascension.js`, Logik `garage/progression.js`, Auswertung je Regel: ARCHITEKTUR §8b)
- Freischaltung: der erste Run-Sieg schaltet Stufe 1 frei, ein Sieg auf Stufe N schaltet N+1 frei (höchstens 15). Wahl in der Garage über dem Start-Knopf (◀ Stufe ▶ mit Name, neuer Regel, Anzahl aktiver Erschwerungen und Schrott-Bonus); ein neuer Run übernimmt die gewählte Stufe.
- Alle 15 Regeln wirken: mehr Elite (Kartengewicht) · Ziele +8 % · Abschleppen +5 % · Preise +10 % (Händler, Fähigkeit, Reroll, Fluch entfernen) · Reparatur −25 % (Tankstelle, Ereignisse) · Start-Fluch · Bosse +15 % · Schaden +15 % (Etappe und Ereignisse/Schatz) · 1 Item weniger zur Wahl · Start-Haltbarkeit −10 % · Hitze +15 % · Elite-Gefahren (+1 Baustein, gefährliche Bausteine ×2 so häufig, +4 m/s Böen – `balance.ASCENSION_RULES`) · Schrauben −15 % (gesammelt, Belohnung, Überspringen, Ereignisse, Zerlegen) · max. Treibstoff −10 % · **Doppel-Boss in Akt 3** (nach dem ersten Akt-3-Boss gibt es die Boss-Beute, dann sofort das Intro der anderen Boss-Variante; erst der zweite Boss ist der Sieg).
- Anzeige im Run: ☠-Chip auf der Karte (Tippen → alle aktiven Erschwerungen), rote Chips im Etappen-Intro, Abschlepp-Anteil in Intro und Ergebnis.
- Belohnungen: +10 % Schrott je Stufe auf allen Schrott des Runs (eigene Zeile in der Auszahlung), erster Sieg auf Stufe 5/10/15 → +1 💠 (Zeile „Erster Sieg auf Schrottstufe N“) und die Schrottstufen-Lackierungen (Ehrenrost ab 1, Werkstattmeister-Blau 5, Schrottbaron-Purpur 10, Ewiger Schrottkönig 15). Run-Ende: „Schrottstufe N freigeschaltet!“.
- Bestwerte je Stufe (`save.ascension.records`: Runs, Siege, bester Akt, meiste Etappen, schnellster Sieg).

**👹 Bosse** (`data/biomes.js → bosses`)
- Jede der 6 Boss-Strecken hat jetzt Intro-Text, zwei Tipps, Warnhinweise je Baustein-Art (gelbe Einblendung `STAGE.bossWarnLead` = 45 m vor jeder Presse, jedem Magnetkran, jeder Riesen-Schlucht … mit Warnton) und eine eigene Platzhalter-Erkennungsmelodie (`audio/sfx.js → bossTheme`: Wellenform, Tonfolge, Takt) im Intro und beim Start.
- Eindeutig verschieden: Schrottpresse (5 Pressen im Takt, Schlamm), Magnetkran (3 Magnetzonen, 2 Schluchten), Großer Graben (2 Riesen-Schluchten + Thermik), Glutdünen (3 Glutfelder, Sand, hohe Dünen), **Auge des Sturms** (neu: 4 Windwände mit 11–15 m/s + Böen bis 9, in der Mitte ruhige Hügel = das Auge, 1 Looping, 1 Blitzzone), **Blitzallee** (neu: 5 Blitzzonen mit fast doppelt so schnellem Einschlag-Takt `params.lightning.every` [1,3; 2,0] s, Looping, Schlucht). Ein Test prüft, dass jede Boss-Strecke eine eigene Bausteinmischung hat.
- Intro zeigt die Belohnung: 👑 Episch/Legendär-Auswahl, 📘 3/4/5, ⚙ Akt-Bonus, 💠 beim ersten Sieg in Akt 2/3 bzw. Run-Sieg.

**🔥 Feuer-Set & Item-Ausreißer** (Zahlen in `data/content/*`, `balance.RULES`; Texte mitgezogen, Validator grün). Neu in `tools/sim/items.mjs`: jedes Item wird einzeln gemessen (Ausreißer-Grenzen Gewöhnlich +15 %, Selten +20 %, Episch +30 %, Legendär +100 %).

| Inhalt | vorher | jetzt | Grund |
|---|---|---|---|
| Feuer-Set 2 | +12 % Boost-Schub | +18 % | schwächstes Set (PHASEN Phase 4) |
| Feuer-Set 4 | ab 70 Hitze, Explosion 4 m/s alle 2 s | ab 55 Hitze, 7 m/s alle 1,2 s | |
| Feuer-Set 6 (Nachbrenner, `RULES.overheatAfterburner`) | alle 8 s, 2 s, Schub ×1,5, Explosion 8 | alle 5 s, 2,5 s, ×1,8, Explosion 12 + 15 Treibstoff | Akt 3 ×0,8 → ×1,0, Akt-2-Boss 58 % → 80 % |
| Zündkerzen-Kette / Bügeleisen / Grillanzünder / Silvester-Restposten / Kachelofen | 0,8 s / +8 % & 3 m/s / 5 m/s / 30 % & 5 m/s / +5 % bis 30 % | 1,2 s / +10 % & 4 m/s / 7 m/s / 45 % & 6 m/s / +6 % bis 40 % (8×) | Feuer-Items allein kaum spürbar |
| Raketen-Set 6 (`RULES.boostOvercap`) | Tempo-Grenze ×1,4 (doppelt 1,8), Notreserve 35 | ×1,3 (1,6), 25 | Ausreißer nach oben (Akt-3-Boss 100 %) |
| Omas Nadeldose (Gewöhnlich, Start-Item der Seifenkiste) | jeder 6. Pickup | jeder 15. Pickup | Schrauben zählen als Pickups → fast Dauer-Boost: +29 % Weite allein, Bot gewann mit voller Meta ohne weitere Items 12 % der Runs |
| Blitzableiter (Gewöhnlich) | 1 s Gratis-Boost alle 5 s | 0,5 s alle 6 s | +32 % → +10 % |
| Perpetuum Mobile (`RULES.heatIsFuel.drive` neu = aus) | auch der Antrieb lief über Hitze | nur der Boost, der Antrieb zahlt Treibstoff | die Kiste fuhr endlos bis Gold × 2 (jede Etappe ×3) |
| Schraubenschlucker-Vergaser (`RULES.boltsAreFuel.fuelPerBolt`, Pickup-Tank) | 1 Schraube = 4 Treibstoff, +2 je Schraube | 1 = 1, +0,5 | jede Etappe ×3 → +70 % (kostet weiter Run-Schrauben) |

**📈 Progressions-/Ökonomie-Simulator** (`tools/sim/progression.mjs`, Ergebnis `docs/BALANCE.md` → „Progression & Ökonomie“)
- `--fit`: Der Bot misst mit der echten Etappen-Logik je Akt, Etage/Elite/Boss und Teile-Stufe 0/5/10/15/20 die Verteilung Weite ÷ Ziel, Schaden, Schrauben, Schrott, Kisten, dazu Item-Wirkung (2/4/6 zufällige Items, 4 Items je Seltenheit, Sets 2/4/6), Schrottstufen-Physik und die Streuung beim Neuversuch derselben Strecke → `tools/sim/progression-model.json` (≈ 45 s).
- Karriere: echte Run-Logik (Karte, Händler, Werkbank, Ereignisse, Schatz, Tankstelle, Belohnungen, Auszahlung, Schrottstufen); nur das Etappen-Ergebnis kommt aus dem Modell (empirische Verteilung, Strecken- und Abschuss-Anteil getrennt, Einarbeitung). Spielzeit: Etappe 75 s, Neuversuch 55 s, Händler 35 s, Ereignis 30 s … (Tabelle in BALANCE.md). Garage-Strategie: Forschung (billigste zuerst) → Chassis → billigste Teile-Verbesserung; nach dem ersten Sieg immer die höchste Schrottstufe.
- Ergebnis (16 Karrieren, Median): **erster Run 12 min** (endet in Akt 1) · **erster Akt-1-Boss 1,2 h** · **erster Sieg 8,2 h** · **alle Chassis 25,4 h** · Schrottstufe 5 / 10 nach 21 / 29 h · **alles inkl. Schrottstufe 15: 45,5 h** – alle Korridore ✔.
- Regel „ein schlechter Run muss auch mit voller Meta scheitern können“ (alle Startteile Stufe 20, ganzer Forschungsbaum): ohne Items 0 % Siege, 6 zufällige Gewöhnliche 2 %, **echter Bot ohne Items 5 % (40 Runs)** – Ziel < 30 % ✔.

**Geänderte Balance-Werte** (Iteration mit dem Simulator; Varianten mit teureren Teilen, weniger Schrott, 2 Kernen je Sieg und niedrigerer Abschlepp-Strafe wurden verworfen, Begründung in BALANCE.md):

| Wert | vorher | jetzt |
|---|---|---|
| Zielmarken Akt-1-Boss | 510 m | 570 m |
| Zielmarken Akt 2 (Etage 0–5 / Boss) | 490–570 / 625 m | 520–605 / 660 m |
| Zielmarken Akt 3 (Etage 0–5 / Boss) | 560–665 / 730 m | 565–670 / 740 m |
| `GARAGE.chassisCoreMul` (neu, Adapter `chassisUnlock`) | – (Kerne 2–6, Σ 30) | 0,4 (1/1/1/1/2/2/2/2, Σ 12) |
| `tools/sim/calibrate.mjs` Soll-Verhältnisse | Akt-1-Boss 0,8 · Akt 2 1,0/0,85/0,75 · Akt 3 0,85/0,72/0,65 | 0,71 · 0,94/0,80/0,71 · 0,84/0,71/0,64 (reproduzieren die neuen Ziele) |
| `RULES.overheatAfterburner`, `boostOvercap`, `heatIsFuel.drive`, `boltsAreFuel` | siehe Item-Tabelle | |
| neu: `ASCENSION_RULES`, `PROGRESSION` (Zielzeiten, Historie), `STAGE.bossWarnLead` | | |

**Meilensteine & Dev-Menü**
- Zeitmessung vollständig: erster Run (`firstRunEnd`), erster Akt-1-Boss, erster Sieg, **alle Chassis** (`allChassis`, beim Kauf des letzten), **Sieg auf Schrottstufe 5/10/15** (`ascension5/10/15`). Das Dev-Menü zeigt jede Zeit mit Zielkorridor (grün im Korridor, gelb zu früh, rot zu spät) und den Schrottstufen-Stand.
- „Werte live ändern“: neben den 19 häufigen Werten jetzt **alle Abschnitte von `balance.js`** aufklappbar (34 Abschnitte, jede Zahl auch in verschachtelten Objekten/Listen als Zahlenfeld mit ↺). Neu: „☠ Schrottstufen 1–15 freischalten“.

**📊 Codex/Statistik** (Garage-Reiter „📊 Statistik“): entdeckte Items (gesehen/besessen), Set-Boni, Chassis, Forschung, Lacke und gewonnene Schrottstufen in %, Bestwerte (Spielzeit, Runs/Siege, bester Akt, weiteste Etappe, Höhe, Etappen, Bosse, Saltos, Schrott), Tabelle je Schrottstufe und die **letzten 10 Runs** (Sieg/Akt, Chassis, Stufe, Etappen, Schrott, Dauer).

**Spielstand** (Schema v3, ohne Versionswechsel): `ascension.selected/records`, `history`, Statistik-Summen; Migration repariert falsche Werte. Version 0.6.0.

### Tests
`npm test` (238 Tests) – neu: `tests/ascension.test.mjs` (je Schrottstufen-Regel ein Test inkl. Doppel-Boss mit Neuversuch, Freischaltung 0 → 1 → 2, Belohnung +50 % Schrott/Kern/Lack auf Stufe 5 nur beim ersten Sieg, Bestwerte, Historie + Migration, Meilensteine, 6 Boss-Varianten × 40 Seeds gültig und verschieden, Boss-Warnhinweise in der Etappe, Boss-Belohnungen), `tests/progression.test.mjs` (Modell vollständig, Ergebnis-Form, Schrottstufe senkt die Erfolgsquote, Determinismus, Meilensteine von 5 Karrieren im Korridor ±25 %, erster Run endet in Akt 1–2, schlechter Run mit voller Meta < 30 %). Angepasst: Item-/Regel-Tests auf die neuen Werte (Bügeleisen, Zündkerzen-Kette, Nachbrenner, Raketen-Set, Perpetuum Mobile, Schraubenvergaser), Chassis-Kernpreise über `chassisUnlock`.

### So testest du Phase 6

**Am PC (automatisch)**
1. `npm test` → „# fail 0“.
2. `npm run smoke` → „RAUCHTEST BESTANDEN“ (≈ 9 min). Neu in `/tmp/sw-smoke/`: `a1-garage-schrottstufe.png`, `a2-karte-schrottstufe.png`, `a3-intro-schrottstufe.png`, `b-boss-schrottpresse.png`, `b-boss-magnetkran.png`, `b-boss-grosser_graben.png`, `b-boss-gluedunen.png`, `b-boss-auge_des_sturms.png`, `b-boss-blitzallee.png`, `b-boss-warnung.png`, `a4-statistik.png`, `a5-statistik-historie.png`, `a6-devmenu-werte.png`.
3. Optional: `node tools/sim/progression.mjs` (≈ 1 min mit dem gespeicherten Modell; `--fit` misst neu, `--bot` zusätzlich echte Bot-Runs, `--verbose` zeigt jeden Run), `node tools/sim/items.mjs` (≈ 1 min, inkl. Einzel-Items).

**Am PC (von Hand)**
1. `python tools/serve.py`, `http://localhost:8137` (F12 → Handy-Ansicht 412 × 915).
2. ⚙ → 7× Versionsnummer → Dev-Menü → „☠ Schrottstufen 1–15 freischalten“. In der Garage über dem Start-Knopf mit ▶ eine Stufe wählen → **RUN STARTEN** → oben rechts auf der Karte ☠ antippen (Liste der Erschwerungen), ein Etappen-Intro zeigt die roten Chips.
3. Dev-Menü „👹 Zum Boss“ → Boss antippen: Intro mit Text, Tipps, Belohnung und Melodie. LOS → vor jedem gefährlichen Baustein erscheint ein gelber Warnhinweis.
4. Stufe 15 + Dev „➡ Nächster Akt“ ×2 + „👹 Zum Boss“ + „Etappe: 🥇 Gold“ → „Doppelter Ärger!“, nach der Beute folgt der zweite Boss.
5. Garage → Reiter „📊 Statistik“. Dev-Menü → „Meilensteine“ (Zielkorridore) und „Werte live ändern“ → z. B. „Belohnungen“ aufklappen.

**Am Handy**
1. Wie bisher `python tools/serve.py` und die Handy-Adresse öffnen.
2. Schrottstufen-Wahl: die ◀ ▶-Knöpfe über RUN STARTEN; die Garage-Reiter (Garage · Labor · Lack · Statistik) passen in eine Zeile.
3. Boss-Warnhinweise erscheinen in der Bildmitte oben und verschwinden nach gut einer Sekunde.

### Abweichungen / offene Punkte
- **Meilenstein „erster Run“** ist `firstRunEnd` (Ende des ersten Runs), es gibt kein zusätzliches `firstRun`-Feld.
- **Simulator-Grenzen**: Das Modell kennt Teile-Stufen nur als Mittel der 7 Slots (gekaufte Teile zählen mit ihrer Stufe, ihre anderen Grundwerte nicht), keine Chassis-Unterschiede und keine Fähigkeiten-Wahl; Item-Wirkung über Anzahl × Seltenheit × ★ + Set-Größe (gefittet). Die Einarbeitung (Weite × 0,88 am Anfang, τ = 1,5 h) und die Spielzeiten je Knoten sind Annahmen. Die Spannen zwischen den Karrieren sind groß (erster Sieg 5–12 h, Schrottstufe 15 34–70 h) – Siege sind Glückssache mit Items.
- **Schrott-Überschuss im Endgame**: nach ≈ 20 h sind die Startteile auf Stufe 20; danach sammelt sich Schrott (Simulator: ≈ 58.000 ⚙ bei Schrottstufe 15) – Senken sind die Lackierungen (≈ 103.000 ⚙) und weitere Teile; die simulierte Person kauft beides nicht.
- **Kerne**: Chassis kosten jetzt 1–2 💠 (Faktor auf die Inhaltsdaten im Adapter, `chassis.js` unverändert); Kerne bleiben knapp (1 je Sieg + erste Bosse Akt 2/3 + Schrottstufen 5/10/15).
- **priceMul** wirkt auf alle Schrauben-Preise (Händler, Fähigkeit, Reroll, Fluch entfernen); Schwarzmarkt-Preise in Haltbarkeit/Treibstoff/Kernen und Ereignis-Kosten bleiben. **damageMul** wirkt auch auf Ereignis- und Schatz-Schaden, nicht auf die Abschlepp-Strafe (dafür gibt es `towPenaltyAdd`).
- Raketen-Set 6 bleibt das stärkste Set (Akt-3-Boss 90 %) – gewollt als „sichere“ Synergie; Gyro-Items liegen einzeln im Minus, weil der Bot mit ihnen Saltos dreht (Bot-Fahrweise, kein Item-Wert).
- Zielmarken in `biomes.js` kommen weiter aus `tools/sim/calibrate.mjs`; dessen Soll-Verhältnisse sind auf die Phase-6-Ziele gesetzt (`--apply` würde sie bis auf Rundung reproduzieren, ungeprüft).

## Phase 7 – Polish, Effekte, Sound-Platzhalter, UI, Tutorial, APK-Anleitung

Das Spiel ist rund: geführter erster Run, Effekte und Klänge für alles Wichtige, einheitliche Oberfläche in allen
Handy-Größen, Zurück-Taste überall, Grafik-/Ton-Einstellungen, Leistungs-Pass und eine neue APK-Anleitung.
Version **1.0.0** (`package.json`, `balance.js → GAME_VERSION`, Test prüft die Gleichheit).

### Was ist neu

**🎓 Tutorial** (`ui/tutorial.js`, Zahlen `balance.TUTORIAL`)
- 10 kurze Hinweise (2–3 Sätze, Symbol, hervorgehobenes Ziel-Element) an den richtigen Momenten des ersten Runs:
  Garage (Chassis/Teile/Fähigkeiten) · Karte (Knoten wählen) · Etappen-Intro (Zielmarke/Medaillen/Abschleppen) ·
  Zielen (Halten/Ziehen/Loslassen im grünen Bereich) · Flug (links/rechts halten, Fähigkeits-Knöpfe) · Ressourcen
  (Treibstoff/Hitze/Haltbarkeit, 3,5 s nach dem Abschuss) · erste Item-Auswahl (Tags/Set-Boni) · erster Händler ·
  erste Werkbank · Garage nach dem ersten Run (Labor).
- Garage/Karte/Shops: Karte mit Abdunklung, „Verstanden ✔“ oder „Alle Hinweise aus“. In der Etappe: „Toast“ ohne
  Blockade, verschwindet nach 7 s oder per Antippen. Mehrere Hinweise kommen nacheinander (Warteschlange).
- Jeder Hinweis erscheint **nur einmal** (`save.tutorial.seen`), „Alle Hinweise aus“ = `save.tutorial.off`.
  ⚙ Einstellungen → „🎓 Hinweise wieder zeigen“ (auch im Dev-Menü). Spielstände aus Phase 6, mit denen schon
  gespielt wurde, starten mit ausgeschaltetem Tutorial. Die alten Dauer-Hinweise (Zielen/Flug in den ersten 3 Runs)
  sind ersetzt.

**✨ Effekte** (`main.js → emitFx`, `ui/fxOverlay.js`, Vorlagen `balance.FX.particles`/`screenFlash`)
- Landungen: perfekt = goldener Funkenring + Aufblitzen (+ Zeitlupe), sauber = helle Wolke, Bruch = Trümmer + roter Blitz + Wackeln.
- Medaillen: Konfetti in Medaillenfarbe (Gold doppelt) + goldenes Aufblitzen; im Ergebnis leuchten die Medaillen nacheinander auf.
- Item-Auslösungen: Funken in der **Tag-Farbe** am Fahrzeug, mehr und schneller mit der Kettentiefe (je Quelle höchstens alle 0,08 s).
- Kettenreaktionen: Funkenring und Bildschirm-Blitz wachsen mit der Kettenlänge, „KETTENREAKTION ×n!“ wird größer.
- Überhitzung: Dampfstoß, roter Bildrand (ab 80 % Hitze leicht, bei Stillstand pulsierend). Stromschlag: doppelte
  Funken + blauer Blitz. Explosion: Feuerball + orangener Blitz + Ton.
- Boss: Intro-Karte rüttelt und glüht, zu Beginn der Boss-Strecke „BOSS-STRECKE · Name“ groß eingeblendet.
- Run-Sieg: DOM-Konfetti (36 wiederverwendete Stücke) + 80 Konfetti-Partikel + Sieg-Jingle.
- Übergänge: Bildschirme blenden weich ein, beim Start einer Etappe kurze Abblende (verdeckt den Streckenaufbau).
- Abschaltbar: „💥 Bildschirmwackeln & Blitze“ (Wackeln + Aufblitzen) und „🐌 Zeitlupe bei Stunts“; Systemeinstellung
  „Bewegung reduzieren“ schaltet die CSS-Animationen ab. Alle Partikel laufen über den festen Pool (`render/particles.js`,
  320 Stück, 1 Draw Call), Effekt-Vorlagen sind vorab angelegte Objekte.

**🔊 Sound-Platzhalter** (`audio/sfx.js`, Zahlen `balance.AUDIO`, alles Web Audio ohne Dateien)
- Getrennte Busse für Effekte und Musik, Regler „💥 Effekte“ und „🎵 Musik“ (0–100 %) in den Einstellungen, Ton an/aus wie bisher.
- Eigener Klang je Tag (Feuer fauchen, Eis klirren, Elektro zirpen, Gyro Arpeggio, Magnet wabern, Schrott scheppern,
  Hydraulik zischen, Gummi „boing“, Rakete heulen, Glück Glöckchen), Tonhöhe steigt mit der Kettentiefe.
- Kettenreaktion: Arpeggio, je Kettenglied 2 Halbtöne höher. Shop: Ladenglocke beim Betreten, Würfelklappern beim
  Reroll, Kauf, Münzen beim Zerlegen. Werkbank-Fusion: Wirbel + Akkord. Labor: Blubbern + Akkord. Medaillen-Fanfare
  (Gold länger), Tutorial-„Pling“, Sieg- und Niederlage-Jingle.
- **Boss-Musik-Schleife:** aus der Erkennungsmelodie des Bosses (Melodie, Bass, Schlagzeug, jeder 4. Takt eine
  Oktave höher), läuft während der Boss-Strecke, pausiert mit dem Spiel, endet mit der Etappe.

**📱 UI-Polish** (`style.css` Abschnitt „Phase 7“, `index.html`)
- Startbildschirm mit Logo und Ladebalken, bis das erste Bild steht. Hochformat-Hinweis im Querformat (animiert).
- Touch-Ziele ≥ 44 px (Reiter, Dev-Knöpfe, Inventar-Knopf, ☠-Chip …), Overlays halten Abstand zu Notch und
  Navigationsleiste (`--safe-top/bottom`, App: `body.native`). Schmale Handys: Ressourcen-Leisten weichen den
  Fähigkeits-Knöpfen aus, Ergebnis-Zeilen und Summen umbrechen nicht mehr unschön, lange Labor-Namen werden getrennt.
- **Zurück-Taste** (`ui/backButton.js`, am PC **Esc**): Dialog → Abbrechen, Hinweis → schließen, Dev-Menü/Inventar/
  Einstellungen/Teile-Auswahl → schließen, Garage-Reiter → Garage, Etappe → Pause ↔ weiter, Karte → Garage (Run
  bleibt), Etappen-Intro → Karte, Ergebnis/Akt-Übergang/Run-Ende → Haupt-Knopf, Händler/Werkbank/Schwarzmarkt/Schatz →
  „verlassen?“, Ereignis/Tankstelle/Item-Auswahl → Hinweis „erst entscheiden“, Garage → „Spiel beenden?“.
- Geprüft per Rauchtest in **360×780, 412×915, 430×932**: jeder Bildschirm fotografiert, nichts ragt seitlich heraus,
  kein Knopftext abgeschnitten, alle Touch-Ziele ≥ 44 px.

**⚡ Leistung** (Messung und Werte: [BALANCE.md → Leistung](BALANCE.md#leistung-phase-7))
- Draw Calls gezählt (`renderer.info`): Garage 9, Etappe 13–17 – Gelände-Stücke, Fahrzeuge und Deko sind schon
  zusammengeführte Geometrien, Schrauben/Pickups/Hindernisse/Partikel/Regen instanziert. Neu: leere InstancedMeshes
  werden gar nicht gezeichnet.
- **Shader-Wechsel pro Bild beseitigt:** durchsichtige, beidseitige Materialien (Aufwind, Magnetfeld, Glutfeld,
  Blitz-Warnring) ließen three.js jedes Bild zweimal `material.needsUpdate` setzen → Programm-Parameter neu berechnet;
  jetzt `forceSinglePass`. Instanzierte Schattenwerfer haben ein eigenes Tiefen-Material (`shadowInstanced`), sonst
  wechselt der Schattenpass zwischen Instanz- und Normal-Shader.
- Allokationen pro Bild entfernt: HUD ohne Closures (`changed()`), Ton-Schleife ohne Objekt, Objekt-Darstellung ohne
  `Object.keys/entries`, Indexschleifen statt `for…of` in Physik-Kollision, Zonen, Fähigkeiten, Darstellung;
  Gelände-Stücke werden in einen wiederverwendeten Puffer gebaut (`GeoBuilder`) statt aus geklonten Teil-Geometrien.
- Kollision: schnelle x-Vorauswahl – nur Schrauben/Pickups nahe der Teilschritt-Strecke werden genau geprüft
  (vorher jede Schraube der Etappe in jedem Teilschritt; Ergebnisse unverändert, alle Physik-Tests grün).
- Einstellungen: **Grafik Niedrig/Mittel/Hoch** (Pixel-Ratio höchstens 1 / 1,5 / 2, nie über dem Gerät) und Schatten an/aus.
- Dev-Menü: „📈 Leistungsanzeige“ (Bilder/s, Bildzeit, Logik-/Render-Zeit, Draw Calls, Dreiecke, Partikel, Pixel-Ratio).

**🛠 Dev-Menü** – aufklappbare Hilfe („❓ Hilfe – was macht was?“), neu: +100 🔩 im Run, Tutorial zurücksetzen /
alle Hinweise aus, Leistungsanzeige, Abschnitte „Ton“ und „Tutorial“ bei „Werte live ändern“. Geprüft (Rauchtest):
Währungen, Freischalten, Etappe überspringen (Gold/Bronze/verfehlt), Zum Boss, Nächster Akt, Knotentyp erzwingen,
Haltbarkeit setzen, Items hinzufügen/★, Testfahrten, Werte live, Meilenstein-Zeiten.

**📦 App-Bau** – `capacitor.config.json` (App „Schleuderwerk“, `de.privat.schleuderwerk`, keine gemischten Inhalte),
`tools/patch-android.mjs`: Hochformat, Vollbild auch neben der Kamera-Aussparung, Bildschirm bleibt an, WebView-Textzoom
fest 100 % (große Systemschrift sprengt das Layout nicht), Version aus `package.json` + Laufnummer, fester Schlüssel,
Icon/Startbild. Zurück-Taste und Haptik über `@capacitor/app`/`@capacitor/haptics`. Workflow: Tests vor dem Bau,
Branch-Builds als Vorab-Version, `concurrency`. Geprüft: `npm install` → `npx cap add android` → `node tools/patch-android.mjs`
→ `npx cap sync android` laufen fehlerfrei (Gradle-Bau macht die Action). Icon/Startbild unverändert (`tools/make_icons.py`).
**[APK-ANLEITUNG.md](../APK-ANLEITUNG.md) komplett neu** (GitHub Actions inkl. „Run workflow“ auf einem Branch, lokal mit
Android Studio, Installation, Updates ohne Spielstandverlust, Export/Import, häufige Fehler).

### Tests
`npm test` (252 Tests) – neu `tests/ui.test.mjs`: Tutorial (Daten, Auslösen mit Verzögerung, nur einmal – auch nach
Export/Import, Warteschlange, Toasts schließen sich selbst, `dropToasts`, „Alle aus“, Zurücksetzen, Fortschritt),
Spielstand (Migration Tutorial/Einstellungen, Reparatur falscher Werte, Lautstärke/Qualität überstehen Export/Import),
Zurück-Taste (Reihenfolge der Ebenen, Garage, Karte, Etappe, alle Run-Bildschirme), Version/App-Name.
`npm run smoke`: Hauptdurchlauf wie bisher (Tutorial per „Alle Hinweise aus“ abgeschaltet, vorher geprüft, dass der
erste Hinweis erscheint) + **Abschluss-Rundgang** `tools/smoke-final.mjs` in drei Auflösungen: Neustart, alle 10
Hinweise durchgeklickt, ≈ 46 Bildschirmfotos je Auflösung (`/tmp/sw-smoke/final-<B>x<H>-*.png`), Layout-Prüfung,
Zurück-Taste an 12 Stellen, Einstellungen nach Neuladen erhalten, Tutorial nur einmal / zurücksetzbar / abschaltbar,
Boss-Einblendung + Musik, Run-Sieg-Konfetti, Querformat-Hinweis, keine Konsolenfehler, Auto immer im Bild.

### So testest du Phase 7
1. `npm test` → „# fail 0“. `npm run smoke` → „RAUCHTEST BESTANDEN“ (≈ 20 min); nur der Rundgang: `node tools/smoke-final.mjs 412`.
2. Von Hand: `python tools/serve.py`, im Browser (Handy-Ansicht) einen **neuen Spielstand** (⚙ → Spielstand löschen oder privates
   Fenster) → den Hinweisen folgen: Garage → RUN STARTEN → Knoten → LOS → halten/loslassen → im Flug links/rechts …
3. ⚙: Regler Effekte/Musik (Boss-Strecke per Dev „👹 Zum Boss“ hören), Grafik Niedrig/Mittel/Hoch, Zeitlupe, Wackeln.
4. Esc (am Handy: Zurück) überall ausprobieren. Dev-Menü → „📈 Leistungsanzeige“.
5. Am Handy (App): siehe APK-ANLEITUNG.md.

---

## PC-Version – eine Datei, Doppelklick, komplett per Tastatur

**Was ist neu**
- **Ein-Datei-Build** `npm run build:pc` (`tools/build-pc.mjs`, esbuild als devDependency): bündelt `www/src/main.js`
  samt three.js aus `www/vendor` zu einem klassischen Skript und schreibt es mit `style.css`, Icon und Startbild
  (data:-URLs) in **`dist/Schleuderwerk-PC.html`** (≈ 1,2 MB). Keine Modul-Importe, keine Import-Map, kein `fetch` –
  läuft per Doppelklick (`file://`) in Chrome/Edge/Firefox, Spielstand im localStorage. `dist/` steht in `.gitignore`,
  die Datei taugt als Release-Download. Der Bau prüft, dass keine externen Verweise übrig sind.
- **Menüs per Tastatur** (`ui/keyNav.js`): Tab/Umschalt+Tab und Pfeiltasten bewegen einen gelben Fokus innerhalb der
  obersten Ebene (Dialog → Hinweis → Tastenübersicht → Dev-Menü → Inventar → Einstellungen → Pause → Run-Overlay →
  Teile-Auswahl → Garage/Karte), Enter/Leertaste drückt, **Enter ohne Markierung = Hauptaktion** (RUN STARTEN, LOS,
  Weiter, Nehmen, Zur Garage …; bei echten Entscheidungen wie Item-Auswahl/Tankstelle wird nur markiert). Nach einem
  Klick, der den Bildschirm neu zeichnet (Kaufen, Reservieren …), bleibt der Fokus auf demselben Knopf – Enter verlässt
  also nicht versehentlich den Laden. Kürzel: Garage **Q/E** (ohne Markierung auch ←/→), Karte **Pfeiltasten** (nur
  erreichbare Knoten, beim Öffnen ist der erste markiert) + **Enter**, **I** = Rucksack, Item-Auswahl **1/2/3** + **S**,
  Ereignis/Tankstelle **1–4**, **K** = Tastenübersicht, **P** = Pause. In der laufenden Etappe gehören Leertaste,
  Pfeile und Ziffern nur dem Fahrzeug (nur P/Esc wirken zusätzlich); gehaltene Tasten lösen in Menüs nichts aus.
- **PC-Darstellung** (`ui/inputMode.js`, `html.kbd` bei `pointer: fine` bzw. ohne Touch): Tutorial-Hinweise in
  Tastatur-Fassung (`textKbd`), Fähigkeits-Knöpfe mit Taste („1 · Leer“), Pause-Knopf mit „Esc“, Zielhilfe „Leertaste
  halten = Kraft · ↑/↓ = Winkel · loslassen im grünen Bereich“, Ziffern an Item-/Ereignis-/Tankstellen-Knöpfen,
  „drücken“ statt „tippen“. Im Querformat ab 900 px Breite: HUD in einer zentrierten Spalte (≤ 940 px), Item-Auswahl
  und Läden dreispaltig, Kartenkopf in der Mitte; die Kamera rechnet unverändert mit dem ganzen Fenster.
- **Tastenübersicht**: Pause-Menü und ⚙ Einstellungen → „⌨ Tastenbelegung“ (oder **K**), Esc schließt; Startbildschirm
  und Garage zeigen am PC eine Zeile „Tastatur: …“. Beim Pausieren verschwindet ein offener Etappen-Hinweis (Toast).
- Am Handy (Touch) ist alles wie vorher; die Tastatur-Bedienung funktioniert dort zusätzlich, ändert aber keine Texte.

**Tests**: `tests/keynav.test.mjs` (Eingabe-Art, Ebenen-Reihenfolge, Hauptaktion je Bildschirm, Enter/Leertaste/Tab/Pfeile,
keine Konflikte in der Etappe, Kürzel, räumliche Navigation, Tastatur-Tutorialtexte, Esc schließt die Übersicht).
`npm run smoke:pc` (`tools/smoke-pc.mjs`): baut die Datei, öffnet sie per `file://` in 1366×768 und spielt nur mit der
Tastatur (Hinweis weg, Q/E, Tab, RUN STARTEN, Knoten per Pfeil + Enter, LOS, Zielen/Abschuss/Neigen/Boost/1–2,
P/K/Esc/Enter, Ergebnis, Item mit 1, zurück zur Karte, Esc → Garage, Neuladen = Spielstand da); prüft Konsolenfehler,
Datei-Anfragen, HUD-Spalte und „Auto im Bild“. Fotos: `/tmp/sw-pc/`. `npm run smoke` bleibt grün.

**So testest du es**: `npm install` → `npm run build:pc` → `dist/Schleuderwerk-PC.html` doppelklicken (F11 = Vollbild)
→ nur mit der Tastatur einen Run spielen. Automatisch: `npm run smoke:pc` → „PC-RAUCHTEST BESTANDEN“.

**Grenzen**: Die Labor-Knoten und langen Listen erreicht man per Tab/Pfeil (kein eigenes Kürzel je Knoten). Firefox
legt den localStorage von `file://`-Seiten je nach Version/Einstellung pro Ordner bzw. gemeinsam für alle lokalen Dateien
ab – zum Umziehen ⚙ → Exportieren/Importieren. „Spiel beenden?“ (Esc in der Garage) schließt keinen Browser-Tab.

---

## Gesamtübersicht – was ist fertig (Version 1.0.0)

| Bereich | Stand |
|---|---|
| Steuerung & Kamera | Halten/Ziehen/Loslassen-Abschuss, Neigen per Halten, Multi-Touch-Fähigkeiten, Tastatur (PC: auch alle Menüs); Kamera mit harter „Auto-im-Bild“-Garantie, Floating Origin |
| Physik | adaptive Teilschritte, kein Durchtunneln, weiche Tempo-Grenze, Treibstoff/Hitze/Haltbarkeit, Loopings, Schluchten, Oberflächen, alle Regel-Schalter (Anhang A) |
| Garage | 9 Chassis, 7 Slots × 3–5 Teile (Stufe 0–20), Fähigkeiten, Erfinder-Labor (≈ 45 Knoten), Lackiererei, Statistik |
| Run | 3 Akte/Biome, verzweigte Karte, 8 Knotentypen, 6 Bosse (Intro, Warnungen, Musik), Abschleppen, Run-Ende mit Auszahlung |
| Items | 88 Items, 10 Tags mit Set-Boni, ★-Stufen, Hybride, Flüche, Trigger-Engine mit Ketten, Kompendium |
| Fortschritt | 4 Währungen, Meilensteine mit Zielzeiten (Simulator: alle im Korridor), 15 Schrottstufen |
| Präsentation | Low-Poly-3D, Partikel/Blitze/Konfetti, Platzhalter-Sounds + Boss-Musik, Startbildschirm, Übergänge, Tutorial |
| Bedienung | Einstellungen (Ton, Lautstärken, Vibration, Wackeln, Zeitlupe, Grafik, Schatten, Tutorial), Zurück-Taste überall, Export/Import |
| Technik | Logik ohne three.js/DOM (Node-Tests), alle Zahlen in `balance.js`, Spielstand v3 mit Migration, Dev-Menü mit Hilfe |
| Qualität | 252 Unit-Tests, Rauchtest über 3 Akte + Abschluss-Rundgang in 3 Auflösungen, Balance-/Progressions-Simulatoren |
| PC | eine HTML-Datei per Doppelklick (`npm run build:pc`), Tastatur-Bedienung überall, Tasten-Hinweise, HUD-Spalte im Querformat |
| App | Capacitor-Android (Hochformat, Vollbild, Wachhalten, Haptik, Zurück-Taste), GitHub-Action → Release mit APK |

## Bekannte Grenzen

- **Klänge und Musik sind Platzhalter** (synthetisch per Web Audio); echte Aufnahmen/Musik wären der nächste Schritt.
  Auf manchen Android-WebViews startet der Ton erst nach der ersten Berührung (Browser-Regel).
- **Leistung nur in der Software-Darstellung gemessen** (Chromium/SwiftShader in der Testumgebung, ≈ 8–10 Bilder/s) –
  Draw Calls, Dreiecke und Allokationen sind gerätunabhängig gemessen, echte Bildraten auf Mittelklasse-Handys müssen am
  Gerät geprüft werden (Dev-Menü „📈 Leistungsanzeige“). Bei Bedarf: Grafik „Niedrig“, Schatten aus.
- **Restliche Allokationen** stammen aus three.js selbst (Matrizen/Uniform-Kopien beim Rendern) und aus Ereignis-Objekten
  der Physik (je Ereignis, nicht je Bild); Gelände-Stücke erzeugen beim Nachladen (≈ alle 96 m) ihre Puffer.
- Das Tutorial erklärt nur den ersten Run; Schwarzmarkt, Ereignisse, Schatz, Schrottstufen erklären sich über ihre
  Texte. Ein Tutorial-Neustart über die Einstellungen zeigt die Hinweise beim nächsten passenden Moment, nicht sofort.
- Zurück-Taste: Item-Auswahl, Ereignis und Tankstelle schließen sich absichtlich nicht (nur ein Hinweis), damit keine
  Belohnung versehentlich verfällt.
- Icon und Startbild sind die gezeichneten Platzhalter aus `tools/make_icons.py`; die App ist mit einem Debug-Schlüssel
  signiert (für den Play Store bräuchte es einen Release-Schlüssel und ein App-Bundle).
- Querformat wird am Handy nur mit Hinweis abgefangen (die App selbst ist auf Hochformat fixiert); am PC ist Querformat
  der Normalfall (Garage: Fahrzeug links/Liste rechts, HUD-Spalte in der Mitte, siehe „PC-Version“).
- Balance-Grenzen wie in Phase 6 beschrieben (Simulator-Modell, Schrott-Überschuss im Endgame).
