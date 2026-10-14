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

