# Schleuderwerk 2 – Spieldesign („Schrottplatz-Tüftler-Roguelite“)

> Ersetzt GDD.md (v0.2) als Design-Grundlage. Alle Startwerte landen in `data/`. Begründungen stehen jeweils in einem Satz dabei.

## 1. Vision
Du baust in deiner Garage aus Schrott eine verrückte Kiste (Badewanne, Einkaufswagen, Kühlschrank …), schießt sie über eine verzweigte Karte aus Etappen, steuerst sie in der Luft, sammelst Items mit Synergien und Kettenreaktionen – jeder Run spielt sich durch andere Builds anders.

**Ton:** warm, rostig, humorvoll. Item-Namen sind Fundstücke („Kreisel aus Omas Nachttisch“), Beschreibungen kurz und mit Augenzwinkern.

## 2. Steuerung (Hochformat, konsequent)
*Begründung: Das bestehende Spiel, die APK-Einstellungen und das Zielgerät (Pixel 8 Pro) sind auf Hochformat ausgelegt.*

| Phase | Eingabe | Wirkung |
|---|---|---|
| Abschuss | Finger halten → Kraftleiste pendelt 0→100→0 %; dabei hoch/runter ziehen = Winkel | Loslassen = Abschuss. Kraft im **Sweet Spot** (grüne Zone) = perfekter Abschuss (+15 % Tempo, `perfectLaunch`). |
| Flug | **linke Hälfte halten** = Nase hoch (rückwärts drehen), **rechte Hälfte halten** = Nase runter (vorwärts drehen) | Ohne Eingabe richtet sich die Kiste leicht in Flugrichtung aus. |
| Jederzeit | **Fähigkeits-Knöpfe** (2–3, unten, groß) | Boost (halten), Sprung, Magnetzug, Fallschirm, Notbremse … |

## 3. Eine Etappe
1. **Abschuss** vom Schrott-Katapult (bestehende Schleuder, umgebaut).
2. **Flug & Fahrt**: Neigen in der Luft, Landungen (perfekt < 8°, sauber < Landetoleranz, holprig, Bruch), am Boden rollt die Kiste physikalisch weiter; der **Antrieb** (Garage-Teil) schiebt am Boden automatisch und verbraucht Treibstoff.
3. **Ressourcen** (pro Etappe neu befüllt, Maximum durch Build/Run veränderbar):
   - **Treibstoff** – Antrieb und Boost. Leer → `fuelEmpty`, die Kiste rollt aus.
   - **Hitze** – Boost (+30/s), Antrieb (+5/s), Biom (Wüste +4/s). Kühlung senkt (10/s) – Dauer-Boost überhitzt nach ≈ 5 s. Bei 100: **Überhitzung** → `overheat`, 2 s kein Boost/Antrieb, 3 Schaden, Hitze fällt auf 50.
   - **Haltbarkeit** – gilt für den **ganzen Run** (Lebenspunkte, ≈ 20 Etappen). Harte Aufpralle (Normaltempo > 14 m/s, 1 je m/s), Bruchlandungen (+10), Hindernisse (5), Schluchtsturz. Ein sauberer Abschuss mit Landung kostet ≤ 3–5 %, eine harte Bruchlandung 10–20 %. Bei 0 ist der Run vorbei.
   - *Zahlen und Begründung: `data/balance.js` bzw. PHASEN.md, Phase 2 „Nachjustiert“.*
4. **Ziel**: Zielmarke (Bronze). Silber = ×1,25, Gold = ×1,5 der Zielmarke. Danach läuft die Etappe aus, bis die Kiste steht.
5. **Nicht geschafft?** „Abschleppen“: 15 % der max. Haltbarkeit Strafe, dann Neuversuch derselben Etappe (neuer Abschuss). *Begründung: Ein einzelner verpatzter Abschuss soll nicht den ganzen Run beenden, kostet aber die Run-Lebensressource.*

**Bonus während der Etappe** (Schrauben): Salto 3, Mehrfachsalto +4 je zusätzlichem, perfekte Landung 4, saubere Landung 1, je volle Flugsekunde 1, Near-Miss 2.

### Streckenbausteine (Biom-abhängig)
Hügel, Rampen, **Schluchten** (Sturz = Etappenende + 25 Schaden), **Schlamm** (Rollreibung ×4), **Sand** (×1,6), **Loopings** (ab 16 m/s durchfahrbar, sonst zurückrollen), **Schrottberge** (Hindernis, `RESOURCES.obstacleDamage` = 5 Schaden, überfliegen oder rammen), **Schrottpressen** (zeitgesteuert hoch/runter), **Windzonen** (Gegen-/Rückenwind, Böen), **Thermik** (Aufwind), **Blitze** (Gewitter: Einschlag in Zone → `shock`).

## 4. Run-Struktur
- 3 Akte = 3 Biome, je **verzweigte Karte**: 6 Etagen mit 2–4 Knoten (≈ 12–15 Knoten), danach **Boss-Strecke**. Man wählt pro Etage einen verbundenen Knoten (≈ 7 Stationen pro Akt, ≈ 21 pro Run, ≈ 25–35 min).
- **Biome**: 1 *Schrottplatz* (Standard, Schrottberge, Schlamm, Pressen) · 2 *Glutwüste* (Hitzebonus: Umgebungshitze, Feuer-Items +25 %, Thermik, große Schluchten, Sand) · 3 *Gewittersteppe* (Elektro: Blitze lösen `shock` aus, Elektro-Items +25 %, Böen, Loopings, nasser Boden = Landetoleranz −5°).
- **Bosse** (je Akt 2 Varianten, zufällig): Akt 1 *Die Schrottpresse* / *Der Magnetkran*; Akt 2 *Der Große Graben* / *Die Glutdünen*; Akt 3 *Das Auge des Sturms* / *Die Blitzallee*. Boss-Strecken sind länger (Ziel ×1,6), haben nur Bronze (= geschafft) und einen Bonus für Gold.

### Knotentypen
| Knoten | Wirkung | Regeln |
|---|---|---|
| ⚑ Etappe | Strecke; danach 1 aus 3 Items (oder +Schrauben) | Etage 0 immer |
| ☠ Elite-Etappe | schwerer (Ziel ×1,3, mehr Gefahren); Item mind. Selten, 1 Blaupause | ab Etage 2, max. 2 je Akt |
| 🛒 Schrotthändler | 5 Items + 1 Fähigkeit, Reroll (10 + 10 je Reroll), 1 Reservieren-Platz | min. 1 je Akt (Etage 2–4) |
| 🔧 Werkbank | 2× gleich → ★+1; 2 verschiedene Tags → Hybrid; zerlegen → Schrauben | per Forschung freigeschaltet |
| 🕳 Schwarzmarkt | 3 verfluchte Items, bezahlt mit max. Haltbarkeit, max. Treibstoff oder Kernen | per Forschung freigeschaltet |
| ⛽ Tankstelle | Wahl: Reparieren (+35 %) / Volltanken (+15 max. Treibstoff für den Run) / Kühlerspülung (+20 % Kühlung für den Run) | Etage 5 immer |
| ❓ Ereignis | Textereignis mit Entscheidung und Risiko | — |
| 💰 Schatzhaufen | Gratis-Item; 30 % „verdächtig“ mit Haken | — |

### Schrottstufen (nach dem ersten Sieg, 1–15, kumulativ)
1 mehr Elite · 2 Ziele +8 % · 3 Abschlepp-Strafe +5 % · 4 Preise +10 % · 5 Reparatur −25 % · 6 Start mit Fluch · 7 Bosse +15 % · 8 Schaden +15 % · 9 nur 2 Items zur Wahl · 10 Start-Haltbarkeit −10 % · 11 Hitze +15 % · 12 Elite-Gefahren · 13 Schrauben −15 % · 14 max. Treibstoff −10 % · 15 Doppel-Boss in Akt 3. Belohnung: +10 % Schrott je Stufe; erster Sieg auf Stufe 5/10/15: +1 Kern.

## 5. Garage (Meta)
- **Chassis** (9): Seifenkiste (Start, ausgewogen) · Badewanne (−1 Item-Slot, Set-Boni doppelt) · Einkaufswagen (leicht, wendig, Haltbarkeit 60, Items −20 %) · Rasenmäher (startet langsam, jede Bodenberührung +3 % Antrieb, max. +60 %) · Waschmaschine (Hitze ist Ressource: Schleudergang-Fähigkeit wandelt Hitze in Schub, kein Überhitzungs-Stillstand) · Kühlschrank (kann nicht überhitzen, Eis-Items +50 %, schwer) · Raketenschlitten (kaum Bodenhaftung, Luftsteuerung ×2) · Mülltonne (sammelt Schrott beim Fahren: +Masse, +Haltbarkeit, +Schub je Stück) · Sofa (jede saubere/perfekte Landung heilt 3).
- **Teile-Slots**: Antrieb, Räder, Aerodynamik, Panzerung, Tank, Kühlung, Gadget. Je Slot 3–5 Teile mit eigenem Charakter (z. B. Räder: Bobbycar-Räder / Traktorreifen / Gummibälle / Kugellager-Rollen). Teile werden mit Schrott gekauft und auf Stufe 0–20 verbessert; Wirkung mit abnehmendem Ertrag.
- **Fähigkeiten**: 2 Slots (3. per Forschung), Auswahl vor dem Run.
- **Erfinder-Labor**: verzweigter Forschungsbaum (≈ 45 Knoten, 5 Äste: Mechanik, Chemie, Elektrik, Glück & Handel, Karosseriebau) mit Blaupausen; bringt Items, Teile, Fähigkeiten, Knotentypen (Werkbank, Schwarzmarkt) und Chassis-Baupläne in den Pool. Endlos-Knoten („Feinschliff I, II, III …“) als Blaupausen-Senke.

## 6. Währungen
| Währung | Quelle | Verwendung | Senke im Endgame |
|---|---|---|---|
| 🔩 Schrauben (Run) | Etappen, Pickups, Stunts, Zerlegen | Schrotthändler, Rerolls, Werkbank | Rest wird am Run-Ende zu 10 % in Schrott umgewandelt |
| ⚙ Schrott (Meta) | Etappen-Medaillen, Bosse, Run-Ende | Teile kaufen/verbessern, Lackierungen | Lackierungen, „Generalüberholung“ (kosmetische Teile-Varianten) |
| 📘 Blaupausen | Elite (1), Boss (3/4/5), Ereignisse | Forschung | Endlos-Forschung |
| 💠 Kerne (selten) | Erster Boss-Sieg je Akt 2/3, Run-Sieg, Schrottstufen-Meilensteine | Chassis, Schwarzmarkt-Deals | Kern-Lackierungen; Kerne nie inflationär (max. ≈ 2 je Sieg) |

## 7. Items & Synergien
- **10 Tags**: Feuer, Elektro, Magnet, Hydraulik, Rakete, Gummi, Eis, Gyro, Schrott, Glück. Set-Boni bei 2/4/6.
- **Seltenheit**: Gewöhnlich · Selten · Episch · Legendär (verändern Regeln) · Verflucht (starker Bonus + echter Nachteil).
- **Stufen**: ★1/★2/★3 (Werkbank). Faktor 1,0 / 1,6 / 2,3 auf skalierbare Werte.
- **Hybride**: 2 Items mit verschiedenen Tags → 1 Item mit beiden Tags und beiden Effekten (je ×0,75). *Begründung: spart einen Slot, kostet Stärke – eine echte Entscheidung.*
- **Item-Slots**: 6 (Chassis/Forschung ändern das). Volle Slots → ersetzen oder zerlegen.
- **Kettenreaktionen**: Trigger-Engine mit Tiefenlimit 8. Ziel-Kette (Beispiel): Elektro + Gyro + Kühlung = Salto → Stromschlag → Gratis-Boost → Hitze → Kühlung → Tempo.
- **Kompendium**: entdeckte Items und Set-Boni sind in der Garage nachlesbar (Synergien sollen entdeckbar sein).

## 8. Fortschritt & Zielzeiten
| Meilenstein | Zielzeit |
|---|---|
| Erster Run | 10–15 min, endet meist in Akt 1–2 |
| Erster Akt-1-Boss besiegt | 1–2 h |
| Erster Run-Sieg | 6–10 h |
| Alle Chassis | ≈ 25 h |
| Alles inkl. Schrottstufe 15 | 30–50 h |

**Regeln**: Teile-Kosten `Basis × 1,15^Stufe`; Wirkung `a·L/(L+h)` (abnehmender Ertrag); Stats mit Soft-Caps; Höchsttempo weich begrenzt (Schub-Wirkung sinkt ab 45 m/s, hart bei 90 m/s). Meta-Upgrades machen das Spiel leichter, ersetzen es nie: Ziele wachsen pro Akt stärker als die maximale Meta-Stärke, ein Run ohne Synergien scheitert spätestens in Akt 3.

## 9. Dev-Menü (versteckt: 7× auf die Versionsnummer tippen)
Währungen geben · Etappe überspringen (Gold) · Item hinzufügen · Werte live ändern (Physik/Kamera/Ökonomie aus `balance.js`) · Alles freischalten · Zeitmessung: Spielzeit bis zu jedem Meilenstein.
