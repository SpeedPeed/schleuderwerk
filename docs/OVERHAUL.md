# Schleuderwerk 2 – Playtest-Befund & Overhaul-Plan

> Stand: v1.0.0, Playtest vom 20.10.2026. Grundlage: eigenes Spielen im Browser (PC-Datei, echte Tastatur-/Maus-
> Eingaben über Playwright), Bot-Messungen mit der echten Spiellogik und der Karrieren-Simulator. Alle Messskripte liegen
> in `tools/playtest/` (Aufrufe im [Anhang](#anhang-messwerkzeuge)), Bildschirmfotos in `tools/playtest/shots/`.
> Anlass – Rückmeldung des Spielers nach ≈ 38 min (6 Runs, 0 Siege, bestes Akt 3, 1.143 ⚙ verdient, 5 Forschungen,
> 1 Chassis, Teile kaum verbessert): *„zum Teil sehr unbalanced … man bekommt sehr langsam Schrott … extrem mühsam, so oft
> dasselbe zu spielen … Synergien zu schwach … macht nicht so viel Spaß … dringend mehr Content, Features, Overhaul.“*
> Nachtrag: *„Die UI sieht viel zu sehr nach KI aus“* – eigener Abschnitt [2.7](#27-ui-und-stil) und [Paket B](#paket-b--ui-und-stil-overhaul-schrottplatz-werkstatt).

## 0. Kurzfassung

Die Rückmeldung ist berechtigt, und die Messungen erklären sie fast vollständig:

| Beschwerde | Messwert (Kern) | Ursache in einem Satz |
|---|---|---|
| „langsam Schrott“ | ≈ 1.900 ⚙/h (Browser-Bot, = Spieler ≈ 1.800) bzw. 350–650 ⚙/h (Karrieren-Modell der ersten 5 h); eine Teile-Stufe kostet 40–160 ⚙ und bringt **+1,2 % auf einen Wert ≈ +0,3 % Weite** | Belohnung hängt nur an Medaillen (Fehlversuch = 0 ⚙, Weite über Gold = 0 ⚙), und Verbesserungen sind in winzige, unsichtbare Schritte zerlegt. |
| „so oft dasselbe spielen“ | **41 % aller Etappen-Starts im Browser (12/29) und ≈ 50 % in 90 Bot-Runs sind dieselbe Strecke noch einmal** (Abschleppen, Median 5× je Run); jeder Browser-Run endete in einer Schleife an *einer* Etappe (5×, 5×, 3×, 6× in Folge) | Scheitern heißt „gleiche Strecke nochmal“; es gibt nur **ein** Ziel (Weite), 6–8 Bausteintypen je Biom, 75 % der Kartenknoten sind Einbahnstraßen. |
| „Synergien zu schwach“ | Im echten Run erreicht man Set 4 in **13–27 %**, Set 6 in **0–7 %** der Runs; der typische Tag bringt mit 4 Items **×1,08** Weite (= nichts) gegenüber 6 zufälligen Items; Kettenreaktionen ≥ 3 Glieder: **0,00–0,11 pro Etappe** | Grundpool hat **2 Items je Tag** (Set 4 unmöglich ohne Forschung), Angebote enthalten nur in **6–14 %** ein Item des eigenen Haupt-Tags, Set-Boni wirken erst bei 4/6 und für 5 von 10 Tags auch dann kaum. |
| „macht nicht so viel Spaß“ | Nur **23–36 %** einer Etappe ist Flug; **35–57 %** ist Ausrollen nach dem letzten Sprung; ≈ 1 echte Weg-Entscheidung je Akt; Kombo-Punkte im HUD haben im Run **keine Wirkung** | Das Spiel verbringt die meiste Zeit mit Warten und Wiederholen, die Entscheidungen sind dünn, und große Momente (Kette, Überweite, Kombo) werden nicht belohnt. |
| „sieht nach KI aus“ | ≈ 300 Emoji im UI-Code, Systemschrift, dunkelblaue Glas-Karten mit 14-px-Radien, Verlaufs-Knöpfe, lila Akzente | Ein generischer „Mobile-Game-Dashboard“-Stil ohne Material, Handwerk und Schrottplatz-Bezug. |

Der Plan: **sechs Pakete** – A Tempo & Belohnung (sofort), B UI-/Stil-Overhaul (früh, parallel), C Synergien, D Abwechslung
(Etappen-Arten, Ereignisse, Karte, Biome, Bosse), E Meta-Motivation (Werkstatt-Stufe, Aufträge, Tagesstrecke, Sammelalbum),
F Etappen-Gefühl & Kalibrierung. Ziel nach dem Overhaul: Schrott ×4–5 in den ersten Stunden, jeder Run bringt eine
Freischaltung, < 5 % identische Wiederholungen, mittleres Set (neu: Set 3) in ≥ 80 % und Regelbruch-Set (Set 5) in ≥ 30 % der Runs, ≥ 1 sichtbare Kette je Etappe mit Build,
≥ 4 verschiedene Etappen-Arten pro Run – ohne die Langzeitkurve (Schrottstufen, 30–50 h) zu zerstören.

---

## 1. Methode

| Teil | Werkzeug | Was |
|---|---|---|
| (a) Echtes Spielen im Browser | `tools/playtest/browser-play.mjs` | PC-Datei `dist/Schleuderwerk-PC.html` per `file://` in Chromium (SwiftShader, 412 × 732, Grafik „Niedrig“ ohne Schatten → 28 Bilder/s, Spielzeit = Echtzeit). Bedienung **nur über Eingaben**: Leertaste halten/loslassen im grünen Bereich, ↑ Winkel, ←/→ neigen, Leertaste Boost, Ziffern für Fähigkeiten/Item-Wahl/Ereignisse, Enter, Pfeiltasten auf der Karte; Shop-Käufe und Garage-Verbesserungen per Mausklick. Ein Entscheidungskopf (wie der Balance-Bot + Synergie-Auswahl) liest den Zustand, schreibt aber nichts. Neuer Spielstand mit Tutorial, 1 + 3 Runs. Zeitstempel je Bildschirm, Eingaben je Bildschirm, Fotos. |
| (b) Bot-Messungen | `tools/playtest/anatomy.mjs` | 15 Konfigurationen × 40 Etappen (+ 20 mit Set-6-Builds): Echtzeit-Anteile (Flug/Boden/Auslaufen/nach Bronze), Landungen, Auslösungen, Ketten; Abwechslung von 600 Strecken; 300 Karten. |
| | `tools/playtest/synergy.mjs` | Tag-Konzentration 0/2/4/6 Items je Tag (10 Tags × 4 Stufen × 24 Etappen); 90 ganze Runs mit echter Run-Logik in drei Forschungsständen (neu / „Spieler nach 38 min“ / alles erforscht). |
| | `tools/playtest/economy.mjs` | 8 Karrieren à 10 h im Karrieren-Simulator (`tools/sim/progression.mjs`): Schrott pro Stunde, Kaufkraft, Teile-Stufen, Forschung, Pool nach 0,5/1/3/5/10 h. |
| Bildschirm-Rundgang | `tools/playtest/screen-tour.mjs` | jeder Bildschirm in Handy- und PC-Format für die Stil-Bewertung (`tools/playtest/shots/tour/`). |

**Grenzen.** Der Browser-Bot trifft den grünen Bereich fast immer (38/38) und braucht keine Lesezeit – seine Zeiten sind
Untergrenzen für Menüs und eher Obergrenzen für Weite. Der Karrieren-Simulator rechnet mit 75 s je Etappe inkl. Menüs und
einer anfänglichen Weite × 0,88 (Einarbeitung); er ist dadurch **pessimistischer** als der echte Spieler (1.143 ⚙ in 38 min
≈ 1.800 ⚙/h – fast genau das, was der Browser-Bot erreicht: Ø ≈ 1.900 ⚙/h). Beides wird unten getrennt ausgewiesen.

---

## 2. Befunde mit Messwerten

### 2.1 Zeit und Tempo

**Anatomie einer Etappe** (Bot, ohne Items; Echtzeit inkl. Zeitlupe; Median aus 40 Etappen je Zeile):

| Akt / Art | Echtzeit | Flug | Auslaufen nach letztem Sprung | nach Bronze noch | „tot“ (< 10 m/s am Boden, kein Boost) | Landungen |
|---|---|---|---|---|---|---|
| 1 Etage 0 | 21,0 s | 4,9 s (23 %) | 11,3 s (**51 %**) | 7,8 s | 3,3 s | 2 |
| 1 Etage 5 | 20,6 s | 7,0 s (35 %) | 6,6 s (37 %) | 3,8 s | 3,3 s | 3 |
| 2 Etage 3 | 22,5 s | 6,7 s (28 %) | 9,5 s (46 %) | 6,9 s | 3,2 s | 3 |
| 3 Boss | 22,8 s | 6,2 s (28 %) | 11,9 s (**51 %**) | – | 3,3 s | 2 |
| mit Set-6-Build | 30–43 s | – | – | läuft bis Gold × 2 („far“) | – | – |

**Im Browser gespielt** (neuer Spielstand mit Tutorial, 3 Runs + 1 Vorlauf, 38 Etappen-Starts, Auswertung
`tools/playtest/report.mjs`):

| Run | Etappen-Starts | geschafft | Ende | Dauer (Bot, ohne Lesezeit) | Schrott | davon gleiche Strecke wiederholt |
|---|---|---|---|---|---|---|
| Vorlauf | 9 | 4 | Akt 2, abgeschleppt | 6,3 min | +183 ⚙ | 4 (Akt-2-Etage-1 **5× in Folge**) |
| 1 | 9 | 4 | Akt 1, Schrott (Wrack) | 5,7 min | +137 ⚙ | 4 (Akt-1-Boss **5× in Folge**) |
| 2 | 8 | 4 | Akt 2, abgeschleppt | 5,1 min | +184 ⚙ | 3 (Akt-2-Etage-1 3×) |
| 3 | 12 | 6 | Akt 2, Wrack | 7,9 min | +287 ⚙ | 5 (Akt-2-Etage-4 **6× in Folge**) |

- **12 von 29 Etappen-Starts (41 %)** in den drei Runs waren dieselbe Strecke noch einmal; jeder Run endete in einer
  Abschlepp-Schleife an *einer* Etappe. Genau das beschreibt der Spieler.
- Echtzeit: 84 % Etappe (davon Flug 31 %, Auslaufen nach dem letzten Sprung 46 %, nach Bronze noch Median 9,1 s),
  4 % Zielen, 3 % Tutorial, Rest Menüs. Die Menüs sind beim Bot kurz (≈ 1 s je Bildschirm), kosten aber
  **4–6 Eingaben zwischen zwei Etappen** (Karte 1–2, Intro 1, Ergebnis 1, Auswahl 1, ggf. Ersetzen) plus 0,7 s
  Zwangspause vor jedem Ergebnis. Ein Mensch liest – das Karrieren-Modell rechnet mit 75 s je Etappe inkl. Menüs.
- Nach 3 Runs (≈ 19 min Bot-Zeit): 608 ⚙ verdient → alle 7 Startteile auf **Stufe 2 von 20** (14 Käufe). Das deckt sich
  mit dem Spielstand des Spielers („Teile kaum verbessert“).
- Karte: 28 Weg-Entscheidungen, davon 10 mit mehr als einem Knoten, **2** mit verschiedenen Knotenarten.
- Ketten ≥ 3 Glieder: in 2 von 29 Etappen; Item-Auslösungen Median 29 je Etappe – sie passieren, aber man sieht sie kaum.
- Der Bot traf den grünen Bereich 29/29 (Vorlauf 9/9) – ein Mensch schafft weniger, d. h. echte Spieler scheitern eher **öfter**.


**Folgerungen.**
- Eine Etappe hat **2–3 Landungen** und nur **5–8 s echtes Fliegen**. Die Hälfte der Etappenzeit rollt die Kiste nach dem
  letzten Sprung aus – der Spieler kann dann nur noch zusehen (am Boden schiebt der Antrieb automatisch).
- Ist Bronze erreicht, läuft die Etappe im Mittel noch **4–8 s** weiter, obwohl das Ergebnis meist feststeht; ist Bronze
  außer Reichweite, wartet man genauso bis zum Stillstand. Es gibt **keinen Knopf zum Vorspulen/Beenden**.
- Starke Builds verlängern die Etappe auf 30–43 s – die zusätzlichen 10–20 s nach Gold bringen **0 Belohnung**.
- Zwischen zwei Etappen liegen fünf Bildschirme: Karte → Intro → (Etappe) → Ergebnis (0,7 s Verzögerung + Hochzählen) →
  Item-Auswahl → Karte; dazu 10 Tutorial-Hinweise im ersten Run, zwei davon mitten im Flug über dem HUD
  (`shots/play/*tutorial-launch*`, `*flug-spaet*`).

### 2.2 Schrott und Fortschritt

**Einnahmen.** Schrott gibt es nur für eine Medaille: Akt 1 Bronze 14 ⚙, Silber 20 ⚙, Gold 25 ⚙ (Akt 2: 24/34/43, Akt 3:
36/50/65), Boss ×3, Akt-Bonus 40/80/140 ⚙, Schrauben-Rest × 10 %. **Fehlversuch = 0 ⚙**, Weite über Gold = 0 ⚙,
Kombo-/Trickpunkte (im HUD groß als „×2,4 · 130 Punkte“) fließen im Run **nirgends** ein (`stage.tricks` wird nur in der
Dev-Testfahrt bewertet).

| Quelle | Schrott pro Stunde | Bemerkung |
|---|---|---|
| Spieler (38 min) | ≈ 1.800 ⚙/h | 1.143 ⚙ in 6 Runs ≈ 190 ⚙/Run |
| Browser-Bot, 4 Runs (neuer Spielstand) | ≈ 1.440–2.170 ⚙/h (Ø ≈ 1.900) | 137–287 ⚙ je Run in 5–8 min, Ende Akt 1–2 |
| Karrieren-Modell 0–1 h | 351 ⚙/h | Runs 1–10: 61–136 ⚙ je Run, Ende fast immer Akt 1 |
| Karrieren-Modell bei 3 h / 5 h / 10 h | 543 / 646 / 917 ⚙/h | kumuliert 1.711 / 3.330 / 9.264 ⚙ |

**Ausgaben und Wirkung.** Teile-Stufe = 40 ⚙ × 1,15^Stufe; Wirkung je Stufe z. B. Rasenmähermotor **+1,2 % Antrieb**,
mit abnehmendem Ertrag (`dimDivisor` 30). Alle 7 Startteile auf Stufe 5 kosten **1.890 ⚙**, auf Stufe 10 **5.684 ⚙**, auf
Stufe 20 **28.672 ⚙**. Wirkung laut Bot-Modell: Stufe 0 → 5 auf allen Teilen = Boss-Weite ×0,69 → ×0,77 (**+12 %**),
Stufe 10 = +22 %. Ein einzelner Kauf (≈ 40–60 ⚙) ist also **≈ +0,3 % Weite** – nicht spürbar. Neue Teile kosten 150–850 ⚙
und **starten wieder bei Stufe 0** (Stufen gelten je Teil), fühlen sich also anfangs wie ein Rückschritt an.

**Was kann man sich leisten?**

| Spielzeit | Spieler-Tempo (≈ 1.800 ⚙/h) | Karrieren-Modell | Modell: sonst |
|---|---|---|---|
| 1 h | alle Startteile ≈ Stufe 4 (+≈ 9 % Weite) **oder** 3–4 neue Teile auf Stufe 0 | Ø Teile-Stufe 1,1 | 2 Forschungen, Item-Pool 24, 0 Siege, bestes Akt 1 |
| 3 h | alle Startteile ≈ Stufe 9–10 (+≈ 20 %) | Ø Stufe 4,1 | 11,5 Forschungen, Pool 34, bestes Akt 2 |
| 5 h | Stufe ≈ 12 oder 2–3 Seitenteile hochgezogen | Ø Stufe 6,9 | 22 Forschungen, Pool 42, bestes Akt 3, **0 Siege** |
| 10 h | – | Ø Stufe 12,6 | 45 Forschungen, Pool 66, 2 Siege, **noch immer 1 Chassis** |

**Blaupausen** gibt es fast nur von Elite (1) und Bossen (3/4/5): im Modell **0 📘 in den Runs 1–6**. Die Forschung – und
damit jedes neue Item im Pool – kommt dadurch erst nach Stunden in Gang. **Kerne** (Chassis) gibt es erst ab dem ersten
Akt-2-Boss.

**Fortschritt pro Run:** Ein typischer früher Run (6–10 min) bringt 60–190 ⚙ = 1–4 Teile-Stufen = +0,3–1,2 % Weite, keine
Blaupause, keine Freischaltung. Genau das meint „man bekommt sehr langsam Schrott“.

### 2.3 Wiederholung und Monotonie

| Messung | Wert |
|---|---|
| Zieltypen | **1** (Weite; auch alle 6 Bosse sind Weite mit fester Bausteinfolge) |
| Bausteintypen je Biom | Schrottplatz 6, Glutwüste 8, Gewittersteppe 8; je Etappe 3,4 / 4,2 / 4,9 verschiedene |
| Ähnlichkeit benachbarter Etappen (Jaccard der Baustein-Mengen) | 0,41–0,46 – jede zweite Etappe besteht zur Hälfte aus denselben Bausteinen |
| Wetter Akt 1 | 2 Varianten (70 % windstill) |
| Abschleppen je Run (echte Runs, Bot) | Median **5** bei 9–10,5 Etappen-Starts → **≈ 50 % der Starts sind dieselbe Strecke noch einmal** |
| Browser-Runs | 12 von 29 Starts Wiederholungen; Akt-1-Boss 5× in Folge, Akt-2-Etage-4 6× in Folge (585 m Ziel, 228–530 m erreicht), bis die Haltbarkeit leer war |
| Ereignisse (Text) | 26 |
| Karte | Ø 1,25 Nachfolger je Knoten, **75 % Einbahn**, nur **15 %** der Knoten bieten eine Wahl zwischen verschiedenen Knotenarten; in echten Runs ≈ 1 echte Weg-Entscheidung je Run |

Das Gefühl „immer dasselbe“ entsteht weniger aus identischen Strecken als aus **identischer Struktur**: jede Etappe =
zielen → 5–8 s fliegen → 7–12 s ausrollen → Medaille; jede Karte = ein Weg; jedes Scheitern = Neuversuch derselben Strecke.

### 2.4 Synergien

**Tag-Konzentration** (k Items eines Tags + 6 − k zufällige andere, ★1, gutes Loadout, Akt 2 + 3, Etage 3; Median
Weite ÷ Ziel / geschafft):

| Tag | 0 | 2 | 4 | 6 |
|---|---|---|---|---|
| Elektro | ×1,00 / 50 % | ×1,13 / 63 % | **×2,94 / 92 %** | ×3,00 / 96 % |
| Magnet | ×1,09 / 63 % | ×1,20 / 67 % | ×1,72 / 96 % | ×3,00 / 100 % |
| Hydraulik | ×0,97 / 38 % | ×1,14 / 67 % | ×1,16 / 75 % | **×2,97 / 88 %** |
| Schrott | ×0,89 / 33 % | ×1,29 / 75 % | ×1,48 / 79 % | ×1,94 / 92 % |
| Eis | ×1,04 / 54 % | ×0,99 / 46 % | ×1,04 / 58 % | ×1,54 / 96 % |
| Rakete | ×1,14 / 58 % | ×1,05 / 67 % | ×1,00 / 50 % | ×1,30 / 88 % |
| Gummi | ×1,00 / 50 % | ×0,97 / 46 % | ×1,07 / 63 % | ×1,25 / 71 % |
| Feuer | ×1,07 / 63 % | ×1,11 / 63 % | ×1,10 / 75 % | ×1,23 / 67 % |
| Gyro | ×1,08 / 71 % | ×0,90 / 38 % | ×0,88 / 33 % | ×1,17 / 75 % |
| Glück | ×1,23 / 71 % | ×0,95 / 42 % | ×0,99 / 50 % | ×1,02 / 54 % |
| **Median aller Tags** | ×1,05 | ×1,08 | **×1,08** | ×1,42 |

- **Set 2 ist wirkungslos** (Median +3 %), **Set 4 für 7 von 10 Tags ebenfalls** (≤ +16 %). Nur Elektro, Magnet und
  Hydraulik werden „kaputt-gut“ – dann aber gleich bis zur Kappung Gold × 2 (Etappe endet mit „far“, der Rest wird nicht
  belohnt).
- Gyro, Glück, Rakete, Gummi, Feuer bleiben auch mit 6 Items unter ×1,3 – dort gibt es keinen Build, der sich lohnt.
- **Ketten**: Selbst Set-6-Builds erzeugen im Median Ketten mit **2 Gliedern**; die HUD-Meldung „KETTENREAKTION“ (ab 3
  Gliedern) erscheint **0,1–0,3× pro Etappe** – außer im Elektro-Set (15 pro Etappe). Die beworbene Kette „Salto →
  Stromschlag → Gratis-Boost → Kühlung → Tempo“ sieht ein normaler Spieler praktisch nie.

**Im echten Run** (30 Runs je Zeile, Run-Logik inkl. Händler/Werkbank/Schatz, Synergie-Auswahl):

| Forschungsstand | Item-Pool (je Tag) | Angebot enthält Haupt-Tag | stärkster Tag am Run-Ende | Set 4 erreicht | Set 6 | Ketten ≥ 3 / Etappe | Sieg |
|---|---|---|---|---|---|---|---|
| neuer Spielstand | 20 (**2**) | **6 %** | 3 (nur über Hybride) | 13 % | 0 % | 0,00 | 7 % |
| Spieler nach 38 min (5 Wurzel-Forschungen) | 30 (3–5) | 14 % | 3 | 27 % | 7 % | 0,03 | 7 % |
| alles erforscht | 80 (8–12) | 26 % | 5 | 77 % | 7 % | 0,11 | 47 % |

Die gemessene Stärke der Synergien in `docs/BALANCE.md` gilt für **volle Pools und fertige 6er-Builds** – beides erlebt
ein neuer Spieler nicht. Mit 2 Items je Tag im Grundpool und `ITEMS.ownedWeight = 0` (keine Doppelten in der Auswahl) ist
Set 4 in den ersten Stunden schlicht nicht erreichbar.

### 2.5 Entscheidungen pro Run

| Entscheidung | Anzahl je Run (Median, echte Runs) | davon „echt“ |
|---|---|---|
| Weg auf der Karte | 7–20 Schritte | **≈ 1** mit verschiedenen Knotenarten; 2,5–5 mit ≥ 2 Knoten |
| Item-Auswahl (1 aus 3) | 5–13 | 1,5–3 knapp (sonst ist die Wahl offensichtlich oder egal) |
| Händler | 0–2 | – |
| Abschuss/Steuerung | 9–12 Etappen | Winkel praktisch immer gleich (30–40°), Kraft = grüner Bereich |
| Fähigkeiten-Wahl | vor dem Run | 2 Startfähigkeiten, wenig Auswahl |

Zum Vergleich: Slay the Spire verlangt pro Akt ≈ 15 Kartenwahlen + 6–8 Wegwahlen mit sichtbar verschiedenen Knoten, jeder
Kampf dutzende taktische Entscheidungen.

### 2.6 Spielgefühl (eigener Eindruck beim Spielen)

- **Das Kernerlebnis ist gut**: Abschuss mit Zeitlupe, Saltos, Landungen, die Kiste – das fühlt sich an wie Learn to Fly
  mit Charakter. Texte und Item-Namen („Silvester 1999 – NICHT ÖFFNEN“, „Akku aus der Fernbedienung“) haben Humor.
- **Kurzer Höhepunkt, lange Pause**: Nach 5–8 s Action folgt das Ausrollen; dann vier Klicks Menü. Der Rhythmus ist
  „Spannung – Leerlauf – Formular“.
- **Scheitern ist doppelt bestraft**: 0 Schrott und dieselbe Strecke noch einmal (mit −15 % Haltbarkeit). Nach dem dritten
  Abschleppen an derselben Etappe ist der Run gefühlt vorbei, läuft aber weiter.
- **Belohnungen sind leise**: Schrott wird erst am Run-Ende ausgezahlt („Auszahlung am Run-Ende +26“), Items ändern
  kleine Prozentwerte, die man im Flug nicht sieht. Es gibt keinen Moment „jetzt ist mein Build kaputt-gut“.
- **Ziel-Klarheit**: Medaillen-Marken sind klar, aber jenseits von Gold gibt es nichts zu holen – der beste Moment eines
  starken Builds (Überweite) wird abgeschnitten (Etappe endet bei Gold × 2).

### 2.7 UI und Stil

Bildschirmfotos aller Bildschirme: `tools/playtest/shots/tour/handy-*.png`, `pc-*.png`; aus dem Playtest
`tools/playtest/shots/play/`.

**Was „nach KI“ aussieht** (konkret im Code):

| Merkmal | Fundstelle | Wirkung |
|---|---|---|
| Emoji als Icon-System | ≈ 300 Emoji in `www/src/ui/*.js` (garage 56, runScreens 54, tutorial 37, shops 32 …), dazu Item-, Tag-, Knoten-, Teile- und Biom-Icons in `data/` | Jeder Knopf, jede Zeile beginnt mit 🔧📘💠⚙🎒; Emoji sehen je Gerät anders aus und sind das Erkennungszeichen generierter UIs. |
| Systemschrift | `style.css` Z. 26: `system-ui, -apple-system, "Segoe UI", Roboto` | Keine Stimme; fette Sans wie in jeder Standard-App. |
| Dunkelblaue Glas-Karten | `--panel: rgba(24,28,44,.92)`, `--panel-2`, `border-radius: 14px` (91× Radius im CSS) | „Dashboard“-Look statt Schrottplatz; alle Karten gleich. |
| Verlaufs-Knöpfe | `.btn-primary { linear-gradient(#ff9d4f, #f2702a) }`, 25 Verläufe | Generischer Casual-Game-Knopf. |
| Lila/Cyan/Neon-Akzente | `--cyan: #33e6ff`; Tag-Farben Gyro `#a46bff`, Gummi `#d14fc0`, Rakete `#4d7cff` (`data/content/content_*.js`); Ereignis-Knoten `#9b7fd1`, Schwarzmarkt `#5b2a86` (`data/nodes.js`) | Neon-Akzente ohne Bezug zur Welt. |
| Zentrierte Karten-Stapel | Item-Auswahl, Händler, Ergebnis: Karte unter Karte mit Kopfzeile + Text + großem Knopf; die Werkbank listet jede mögliche Paarung als eigene gleiche Karte (`shots/tour/handy-13-werkbank.png`) | Formular-Gefühl; keine Bühne für das Fundstück. |
| Generische Überschriften | „GESCHAFFT!“, „Beute!“, „Run vorbei“, „Wähle ein Item“ | Die gute Erzählstimme der Item-Texte fehlt in der Oberfläche. |
| Typografie-Pannen | Labor-Kacheln trennen Wörter hart („Brandbeschl-euniger“, „Anlassersch-nur-Drall“, `shots/tour/handy-04-labor.png`); Werte-Balken überall gleich orange | Wirkt maschinell gesetzt statt gestaltet. |
| Fehlende Handarbeit | 2 SVGs im ganzen UI, keine Texturen, keine Schräglagen, keine Stempel/Klebeband/Nieten | Nichts wirkt „gebaut“ – im Widerspruch zum Thema Tüfteln. |

Was gut ist und bleiben soll: die 3D-Low-Poly-Szene mit warmen Wüstenfarben, die Garage-Bühne, große Touch-Ziele,
Tastatur-Bedienung, die Item-Texte.

---

## 3. Ursachen (priorisiert)

1. **Belohnung nur über Medaillen** – Fehlversuch 0, Überweite 0, Tricks 0, Auszahlung erst am Run-Ende. → langsamer
   Schrott, kein Fortschrittsgefühl, starke Builds unbelohnt.
2. **Meta in Kleinstschritten** – +1,2 % pro Kauf, Stufen je Teil (Teilwechsel = Rückschritt), Blaupausen fast nur vom
   Boss. → „Teile kaum verbessert“, 5 Forschungen nach 38 min.
3. **Scheitern = identische Wiederholung** – Abschleppen startet dieselbe Strecke neu, ≈ 50 % aller Etappen-Starts. →
   Hauptursache für „so oft dasselbe“.
4. **Ein Ziel, wenige Bausteine, lineare Karte** – nur Weite, 6–8 Bausteintypen, 75 % Einbahn-Knoten, 26 Ereignisse.
5. **Synergien hinter Forschung versteckt** – 2 Items je Tag im Grundpool, keine Doppelten, kein Tag-Bias in Angeboten,
   Set-Schwellen erst bei 4/6, 5 schwache Tags. → Set 4 in 13–27 % der Runs.
6. **Ketten zu selten** – Abklingzeiten (alle 2–6 s), wenige Items, die Ereignisse weiterreichen; die Engine kann Tiefe 8,
   der Inhalt nutzt 2.
7. **Leerlauf in der Etappe** – 35–57 % Ausrollen, kein Vorspulen, Ende erst bei Stillstand.
8. **Viele Bildschirme pro Etappe** – Karte → Intro → Ergebnis → Auswahl → Karte; Tutorial-Hinweise über dem Flug.
9. **Generischer UI-Stil** – Emoji, Systemschrift, Glas-Karten; das Thema „Schrott & Tüfteln“ fehlt in der Oberfläche.

---

## 4. Vergleich mit erfolgreichen Spielen des Genres

| Spiel | Was Runs abwechslungsreich macht | Was Builds „kaputt-gut“ macht | Übertrag auf Schleuderwerk |
|---|---|---|---|
| **Slay the Spire** | Karte mit echten Gabelungen (3–4 Wege, Knotenarten sichtbar), Elite als bewusstes Risiko, Ereignisse mit Folgen, 3 Akte mit Boss-Vorschau | Relikte brechen Regeln; Archetypen (Gift, Kraft, Block) sind früh erkennbar; Karten entfernen/aufwerten | Karte mit ≥ 2 Wegen je Knoten, Boss-Vorschau, Regelbrecher-Items früh, „Bauplan“-Start |
| **Balatro** | Boss-Blinds verändern Regeln je Runde; Decks/Einsätze; kurze Runden | **Multiplikative** Skalierung (Chips × Mult) mit hochzählenden Zahlen; Joker-Kombos sichtbar ausgelöst | Mutatoren je Etappe, Ketten-Zähler mit Multiplikator, Überweite als Zahl, die explodiert |
| **Vampire Survivors** | Ständiger Belohnungsfluss (Level-up alle paar Sekunden), Truhen, Freischaltungen über Erfolge | **Evolutionen**: Waffe + Passiv = sichtbares Rezept; Zahlenmengen auf dem Bildschirm | Tag-Rezepte (2 bestimmte Items → Evolution), Freischaltungen über Aufträge |
| **Hill Climb Racing** | Viele Strecken/Fahrzeuge, tägliche Events | – | Münzen proportional zur Weite: **jeder Versuch zahlt**; günstige, spürbare frühe Upgrades |
| **Learn to Fly** | Ziele/Herausforderungen („erreiche 2 km“, „fliege 30 s“), Tagesziele | Teile mit großen Sprüngen | Belohnung nach Weite/Höhe/Flugzeit; sichtbare Ziele-Liste mit Bonus |
| **Brotato** | Charaktere mit Regelbruch, Wellen von 20–60 s, Shop mit Sperren/Neu würfeln | Stats stapeln **linear je Item eines Typs**, Charaktere bevorzugen Tags im Shop | Tag-Stärke je Item (+X % pro Item, nicht nur Schwellen), Tag-Bias in Angeboten, Chassis mit Lieblings-Tag |

Gemeinsamer Nenner: **(1) jede Minute bringt etwas, (2) Builds skalieren sichtbar und multiplikativ, (3) Abwechslung
kommt aus Regel-Variation (Mutatoren, Ziele, Bosse), nicht nur aus neuen Strecken, (4) man scheitert vorwärts.**

---

## 5. Overhaul-Plan

### Grundsätze

- **Scheitern vorwärts**: Kein Versuch ist wertlos; keine identische Strecke zweimal hintereinander (außer der Spieler will es).
- **Weniger Warten, mehr Fliegen**: Ziel ≥ 60 % der Etappen-Echtzeit in Aktion (heute 23–36 % Flug).
- **Builds früh lesbar**: Ab Run 1 Set 4 möglich, ab Run 5 ein „kaputt-guter“ Build in jedem 3. Run.
- **Jeder Run schaltet etwas frei** – Langzeit über Schrottstufen, Sammelalbum, Meisterschaften statt über Stillstand.
- **Messbar**: Jedes Paket hat Kennzahlen, die `tools/playtest/*` und `tools/sim/*` prüfen.
- Inhalte bleiben **Daten** (`data/`), neue Effektarten nur, wo nötig (ARCHITEKTUR §1).

### Reihenfolge

| Woche | Paket |
|---|---|
| 1–2 | **A Tempo & Belohnung** (größte Wirkung pro Aufwand) · parallel Beginn **B UI/Stil** (Design-Tokens, Schrift, Icons) |
| 2–4 | **B** fertig (alle Bildschirme) · **C Synergien** |
| 4–7 | **D Abwechslung** (Etappen-Arten, Mutatoren, Ereignisse, Karte, 3 neue Biome, 6 neue Bosse) |
| 6–8 | **E Meta** (Werkstatt-Stufe, Aufträge, Tagesstrecke, Sammelalbum) |
| laufend, Abschluss Woche 8–9 | **F Etappen-Gefühl & Kalibrierung** |

---

### Paket A – Tempo & Belohnungsrhythmus

**Ziel:** Doppelt so viel Action pro Minute, Schrott ×4–5 in den ersten Stunden, kein „Nochmal dieselbe Strecke“.

**Änderungen (mit Zahlen):**

1. **Vorspulen & Hochrechnung** (`stage/stage.js`, `ui/hud.js`, `data/balance.js → STAGE`):
   - Neu `STAGE.fastForward = { minGroundTime: 0.8, scale: 4, maxSpeedForFinish: 6 }`: Ist die Kiste ≥ 0,8 s am Boden
     und wird kein Boost gehalten, läuft die Etappe automatisch mit ×4 (Bewegungsunschärfe, Motor-Sound höher).
   - Tippen/Leertaste während des Ausrollens = **Sofort-Ende**: Die Physik rechnet den Rest ohne Darstellung in < 50 ms
     (deterministisch, gleiche Schritte) – Ergebnis identisch, Zeit gespart.
   - Ist Bronze nach der Hochrechnung unerreichbar und kein Treibstoff mehr da → Ende nach 1 s mit „Knapp: 87 %“.
   - Erwartung: Etappe 21 s → **≈ 12–14 s** Echtzeit, Auslauf-Anteil 50 % → ≤ 15 %.
2. **Jeder Versuch zahlt** (`run/rewards.js`, `REWARDS`):
   - Schrott je Etappe = `scrapPerM[act] × Weite × Medaillenfaktor`, `scrapPerM = { 1: 0.12, 2: 0.16, 3: 0.22 }`;
     Medaillenfaktor: verfehlt 0,5 · Bronze 1 · Silber 1,25 · Gold 1,5 · **Platin (Gold × 1,5) 2 · Schrottkönig (Gold × 2) 3**.
     Beispiel Akt 1: 280 m verfehlt = 17 ⚙ (heute 0), 330 m Bronze = 40 ⚙ (heute 14), 495 m Gold = 89 ⚙ (heute 25),
     700 m Platin = 168 ⚙.
   - Schrott wird **sofort** gutgeschrieben (Zähler oben, Klimpern), nicht erst am Run-Ende (Run-Ende zeigt nur die Summe).
   - **Kombo zählt**: bankierte Trickpunkte → 1 🔩 je 15 Punkte und 1 ⚙ je 40 Punkte (`KOMBO.boltsPer`, `KOMBO.scrapPer`).
   - Blaupausen: Gold oder besser 25 % Chance auf 1 📘, jede Boss-Begegnung (auch verloren) 1 📘, Elite 2 📘.
   - Ziel: **1.500–2.500 ⚙/h** im Karrieren-Modell der ersten Stunde (heute 351), Blaupause in ≥ 80 % der Runs.
3. **Kein identischer Neuversuch** (`run/runState.js → applyStageResult`, `ui/runScreens.js`):
   - Normale Etappe/Elite verfehlt → **„Notlandung“**: −10 % max. Haltbarkeit (statt 15 %), Teil-Belohnung (Faktor 0,5),
     **weiter auf der Karte**, keine Item-Auswahl, aber 1 „Trostkiste“ mit Schrauben. Optionaler Knopf „Nochmal
     (−15 % 🔧)“ für Ehrgeizige – dann mit **neuem Strecken-Seed** (gleiche Art/Etage, andere Bausteine).
   - Boss verfehlt → Neuversuch erlaubt, aber jede Wiederholung würfelt die Boss-Variante neu und senkt das Ziel um 5 %
     (max. 3×, „Der Boss ist auch müde“).
   - Ziel: identische Wiederholungen < 5 % der Etappen-Starts (heute ≈ 50 %).
4. **Weniger Klicks** (`main.js`, `ui/runScreens.js`, `ui/map.js`):
   - Intro wird ein Banner über der Zielansicht (Ziel, Medaillen, Gefahren, Wetter) – kein eigener Bildschirm; „LOS“ =
     Leertaste halten (Abschuss beginnt direkt).
   - Ergebnis und Item-Auswahl auf **einem** Bildschirm (Medaillen-Stempel oben, 3 Fundstücke darunter).
   - Hat ein Knoten nur einen Nachfolger, fährt die Karte automatisch weiter (nach Paket D selten nötig).
   - Tutorial-Hinweise nie während des Flugs über dem HUD: Flug-Hinweise erscheinen beim Zielen oder in der ersten
     Zeitlupe als kleine Sprechblase, max. 6 statt 10.
   - Ziel: ≤ 2 Eingaben zwischen zwei Etappen (heute 4–6), Menü-Anteil an der Run-Zeit ≤ 25 %.
5. **Spürbare Meta-Schritte** (`data/parts.js`, `GARAGE`, `garage/garage.js`):
   - Teile-Stufen 0–20 → **0–10 mit doppelter Wirkung je Stufe** (`perLevel × 2`, `dimDivisor` 30 → 15), Kosten
     `60 × 1,32^Stufe` (Summe bis 10 ≈ 2.800 ⚙ je Teil, Stufe 1 = 60 ⚙). Jede Stufe zeigt die Änderung in Metern
     („+6 m auf Etage 3“, aus dem Bot-Modell).
   - **Stufen gelten je Slot**, nicht je Teil: Teilwechsel behält die Slot-Stufe (kein Rückschritt).
   - Ziel: Run 1 kauft ≥ 2 Stufen; nach 1 h Ø Slot-Stufe ≥ 3 von 10 (≈ +15 % Weite).

**Neue Inhalte/Features:** Medaillen Platin/Schrottkönig, Trostkiste, Notlandung, Vorspulen mit Effekt, Live-Schrottzähler.

**Betroffene Dateien:** `www/src/stage/stage.js`, `stage/scoring.js`, `run/rewards.js`, `run/runState.js`,
`data/balance.js` (STAGE, REWARDS, KOMBO, GARAGE, RUN), `data/parts.js`, `garage/garage.js`, `items/statMods.js`
(`partDimLevels`), `save/save.js` (Migration v3 → v4: Teile-Stufen → Slot-Stufen), `main.js`, `ui/hud.js`,
`ui/runScreens.js`, `ui/map.js`, `ui/tutorial.js`, `tools/sim/progression.mjs` (SIM.sec neu messen), Tests
`tests/*.test.mjs`.

**Erfolgskriterien (messbar):**
- `tools/playtest/anatomy.mjs`: Echtzeit je Etappe Median ≤ 14 s, Anteil Auslaufen ≤ 15 %.
- `tools/playtest/browser-play.mjs` + `report.mjs`: ≤ 2 Eingaben zwischen Etappen; identische Wiederholungen < 5 %.
- `tools/playtest/economy.mjs`: erste Stunde ≥ 1.500 ⚙/h, ≥ 1 📘 in ≥ 80 % der Runs, erster Akt-1-Boss ≤ 45 min.

---

### Umsetzungsstand Paket A

> Stand 20.10.2026, Branch `claude/car-evolve-clone-enhanced-lwnjjy`. Alle Zahlen in `www/src/data/balance.js`
> (`STAGE.fastForward`, `REWARDS`, `KOMBO`, `RUN.emergency/bossRetry`, `GARAGE`, `MAP.autoAdvanceDelay`), Verträge in
> `docs/ARCHITEKTUR.md` (§4.8 Slot-Stufen, §7 Etappe, §8 Run, §10 Spielstand v4, Anhang A „Paket A“).

**Umgesetzt**

1. **Vorspulen & Hochrechnung** (`stage/stage.js`): Eingaben je Bild als Daten (Aufzeichnung), ×4 ab 0,8 s am Boden
   ohne Boost, Tippen/Leertaste beim Ausrollen = Sofort-Ende (gleiche Physik-Schritte, stumme Hooks – Ergebnis identisch,
   `tests/pacing.test.mjs`), Hochrechnung über eine **Schatten-Etappe** (Wiederholung aller Bilder): ohne Treibstoff und
   Bronze unerreichbar → „Knapp: NN %“, Ende nach 1 s. Erweiterung: steht mit Bronze fest, dass kein Sprung mehr kommt,
   endet die Etappe nach 0,4 s („Hochgerechnet“). HUD „⏩ ×4 – Tippen = Ende“, Motor höher.
2. **Jeder Versuch zahlt** (`run/rewards.js → stageRewards`, einzige Stelle): `scrapPerM {0,12/0,16/0,22} × Weite ×
   gradeMul` (verfehlt 0,5 · Bronze 1 · Silber 1,25 · Gold 1,5 · **Platin** (Gold × 1,5) 2 · **Schrottkönig** (Gold × 2)
   3), Kombo 1 🔩/15 und 1 ⚙/40 Punkte, Blaupausen Gold+ 25 % · Elite 2 · Boss-Begegnung 1. Gutschrift **sofort**
   (`runState.settleRun`), HUD-Zähler mit dem Schrott der laufenden Etappe.
3. **Kein identischer Neuversuch**: verfehlt = Notlandung (−10 %, Trostkiste 10/14/18 🔩, weiter auf der Karte) oder
   „↻ Nochmal“ (−15 %, neuer Strecken-Seed); Boss: neue Variante + Ziel −5 % je Neuversuch (max. 3×).
4. **Weniger Klicks**: Intro als Banner über der Zielansicht (Knoten wird erst beim Abschuss betreten, Zurück = Karte
   ohne Kosten), Ergebnis + Beute auf einem Bildschirm (Nehmen = weiter), Karte fährt bei einem Nachfolger nach 0,6 s
   selbst weiter, 6 statt 10 Hinweise, Etappen-Hinweise nur als Sprechblase beim Zielen.
5. **Spürbare Meta-Schritte**: Slot-Stufen 0–10 je Slot (Teilwechsel behält die Stufe), doppelte Wirkung, `60 × 1,32^L`,
   jeder Verbessern-Knopf zeigt „+N m“ (Bot-Messung `tools/sim/levelGains.mjs` → `data/levelGains.js`; Teile ohne
   messbaren Weitengewinn zeigen den Wert). Spielstand **v4**: Teile-Stufen → Slot-Stufen (mindestens gleich stark,
   Überbezahltes zurück), SW3-Texte importierbar.

**Gegengewicht für die Langzeitkurve** (Simulator, `docs/BALANCE.md` „Progression“): Paket A macht Runs ergiebiger *und*
leichter (Notlandung statt Abschlepp-Schleife, unabhängige neue Strecken, „müder“ Boss). Ohne Ausgleich: erster Sieg
≈ 1,8 h, Schrottstufe 15 ≈ 17 h. Nachgezogen: `RESEARCH.costMul` 1 → 1,5, Schrottstufe 2/7 `1,08/1,15 → 1,12/1,22`,
Akt-3-Boss 740 → 830 m; Zielkorridore `PROGRESSION.targets` auf OVERHAUL §5/§6 (Akt-1-Boss 0,5–1 h, Sieg 3–5 h,
alle Chassis 15–25 h, Schrottstufe 15 bleibt 30–50 h). `SIM.sec` neu: Etappe 45 s / Neuversuch 35 s (vorher 75 / 55).

**Messwerte vorher → nachher** (gleiche Skripte, Anhang)

| Kriterium | Ziel | v1.0 | Paket A | erfüllt |
|---|---|---|---|---|
| Echtzeit je Etappe, Median (`anatomy.mjs`, Bot ohne Items, 15 Konfigurationen × 40) | ≤ 14 s | 20–24 s | **10,8 s** (mit Tippen beim Ausrollen 7,3 s) | ✔ |
| Anteil Auslaufen nach dem letzten Sprung (`anatomy.mjs`) | ≤ 15 % | 35–57 % (6,6–11,9 s) | **20 %** (≈ 2,2 s); Browser-Bot mit Tippen **11 %** | ≈ (s. u.) |
| Flug-Anteil der Etappe (`anatomy.mjs`) | – | 23–36 % | 57 % | – |
| Eingaben zwischen zwei Etappen (`browser-play.mjs`, direkt ohne Sonderknoten) | ≤ 2 | 4–6 | **Median 1, ≤ 2 in 93 %** (14 Übergänge) | ✔ |
| Identische Wiederholungen (Browser 39 Starts / Karrieren-Modell 4.081 Starts) | < 5 % | 41 % / ≈ 50 % | **0 % / 0 %** | ✔ |
| Schrott/h erste Stunde (`economy.mjs`, 8 Karrieren) | ≥ 1.500 | 351 | **2.568** (Runs 1–10: 218–898 ⚙ statt 61–136) | ✔ |
| Runs mit ≥ 1 📘 (erste 3 h) | ≥ 80 % | 38 % | **100 %** | ✔ |
| Erster Akt-1-Boss (Median, `economy.mjs`) | ≤ 45 min | 82 min | **29 min** (25–42) | ✔ |
| Slot-Stufen nach Run 1 / Ø nach 1 h | ≥ 2 / ≥ 3 von 10 | – / 1,1 von 20 | **3 / 3,6** | ✔ |
| Langzeit (`progression.mjs`, 8 Karrieren): erster Sieg / alle Chassis / Schrottstufe 15 | 3–5 h / 15–25 h / 30–50 h | 8,2 h / 25,4 h / 45,5 h | 2,7 h / 20,3 h / 39,7 h | ≈ / ✔ / ✔ |
| Schlechter Run mit voller Meta gewinnt | < 30 % | 0–12 % | 1–6 % | ✔ |

**Was nicht ganz erreicht ist.** Der Auslauf-Anteil liegt im Bot-Modell bei ≈ 20 % statt ≤ 15 %. Er besteht aus den
vorgegebenen Zeiten selbst: 0,8 s am Boden vor dem Vorspulen (×1), Antrieb mit Resttreibstoff (×4, ≈ 0,9 s) und 1 s
„Knapp“-Anzeige (81 % der Enden ohne Tippen sind Knapp-Enden). Bei 10–11 s Etappe sind das ≈ 2 s. Ein Sweep
(0,5 s Bodenzeit, ×6, 0,7 s Anzeige) brachte nur 17 %; ≤ 15 % ginge nur, wenn die Etappe auch mit Treibstoff
hochgerechnet endet – dann könnte niemand mehr am Boden Anlauf boosten. Im Browser-Playtest (Kopf tippt beim Ausrollen,
wenn voraus nichts mehr kommt) sind es 11 %. In absoluten Zahlen ist das Ausrollen von 7–12 s auf ≈ 2 s gefallen.
Die Echtzeit im Browser-Playtest (Median 16,3 s je Etappe) ist durch Software-Grafik (SwiftShader, Bildzeit-Kappung
`STAGE.maxFrameDt`) gedehnt und gilt nur relativ; die Spielzeit dort ist länger, weil der Kopf mit Items deutlich weiter
fliegt (Gold/Platin).

**Offen / Hinweise**
- Erste Stunde 2.568 ⚙/h liegt knapp über dem Wunschband 1.500–2.500 (bewusst: Paket A soll sich spürbar lohnen).
- `drive_pedale` fliegt im Bot auf Stufe 0 doppelt so weit wie der Rasenmähermotor (955 vs. 450 m, `levelGains.mjs`) –
  Balance-Ausreißer aus v1.0, für Paket C/F vormerken.
- Die Meter-Anzeige misst eine Bezugs-Etappe (Akt 1 Etage 4) mit dem Bot – Panzerung, Kühlung, Räder zeigen keine Meter.

---

### Paket B – UI- und Stil-Overhaul „Schrottplatz-Werkstatt“

**Ziel:** Eine Oberfläche, die aussieht wie aus Opas Werkstatt gebaut – Blech, Nieten, Kreppband, Schablonenschrift,
Blaupausen-Papier – statt eines generischen Dark-Mode-Dashboards. Früh einplanen (der Spieler hat es ausdrücklich
gewünscht), parallel zu Paket A.

**Art Direction.** Leitbild: *„Alles in der UI wurde aus etwas anderem gebaut.“* Knöpfe sind lackierte Blechschilder mit
Nieten, Fenster sind Klemmbretter und Werkzeugkasten-Deckel, Listen sind Karteikarten mit Kreppband, die Karte ist eine
Blaupause, die Ergebnisse werden **gestempelt**, der HUD ist ein Armaturenbrett aus dem Sperrmüll (Tacho, Tankanzeige mit
Nadel, Thermometer, Rollen-Kilometerzähler). Ein Erzähler – **Opa Gerd, Werkstattmeister** – kommentiert in kurzen,
handgeschriebenen Notizzetteln.

**Farb-Tokens** (`www/style.css :root`, ersetzen `--panel`, `--accent`, `--cyan` …):

| Token | Wert | Verwendung |
|---|---|---|
| `--oil` | `#1c1a17` | Hintergrund, Schrift auf Hell |
| `--steel-900` / `-700` / `-500` / `-300` | `#2a2825` / `#45423c` / `#7a756b` / `#b8b1a2` | Blechplatten, Rahmen, Nieten, gedämpfter Text |
| `--rust-700` / `-500` / `-300` | `#6e2f17` / `#a9502a` / `#d48a5a` | Rost-Kanten, sekundäre Akzente, Rahmen-Patina |
| `--paint-yellow` | `#f0bf2c` | Hauptaktion (Warnschild-Gelb), Fokus-Rahmen |
| `--paint-red` | `#c4372b` | Gefahr, Schaden, Flüche |
| `--paint-green` | `#4e7a3b` | Erfolg, Heilung (Werkstatt-Grün, nicht Neon) |
| `--paint-blue` | `#2e5c7d` | Blaupausen, Forschung |
| `--paper` / `--paper-line` | `#ede3c8` / `#c8b98f` | Karteikarten, Klemmbrett, Ereignis-Text |
| `--tape` | `#e3cf7a` (80 % Deckkraft) | Kreppband-Streifen, Tooltips |
| `--blueprint` / `--blueprint-line` | `#1f4868` / `#cfe2f1` (25 %) | Karte, Labor |
| `--good` / `--bad` / `--warn` | `--paint-green` / `--paint-red` / `--paint-yellow` | Zustände |

Tag-Farben (`data/content/content_*.js → color`) und Knoten-Farben (`data/nodes.js`) werden auf Lack-Töne umgestellt (nicht Neon): Feuer `#d3562a`, Elektro `#e0b52a`, Magnet `#a33a3a`,
Hydraulik `#3f6f86`, Rakete `#c7672f`, Gummi `#5c8a3a`, Eis `#7fb2c4`, Gyro `#7a5c8f`, Schrott `#8a7a5c`, Glück `#3f8a5a`.

**Typografie** (alle Schriften lokal als WOFF2 in `www/fonts/`, Lizenz SIL OFL, Untermenge Latin + Umlaute, zusammen
≤ 180 KB; **kein CDN zur Laufzeit** – die APK muss offline laufen; `tools/build-pc.mjs` bettet sie als data-URI ein):

| Rolle | Schrift | Größen |
|---|---|---|
| Überschriften, Knöpfe, Zahlen groß | **Saira Stencil One** (Schablone) – Alternative *Black Ops One* | 28/22/18 px, Großbuchstaben, Laufweite +0,04 em |
| Fließtext, Werte | **Barlow Semi Condensed** 500/700 | 15/13 px, Ziffern `tabular-nums` |
| Notizzettel, Flavor, Tutorial | **Kalam** oder *Patrick Hand* (Handschrift) | 16 px, leicht gedreht (−1,5°) |
| Zählwerke (Weite, Schrott) | Barlow Semi Condensed 700 mit Rollen-Animation | 40 px HUD |

**Komponenten-Regeln:**

| Komponente | Regeln |
|---|---|
| **Knopf** (`.btn`) | Blechschild: Hintergrund Lack-Farbe + feines Rauschen (inline-SVG `feTurbulence` als `background-image`, einmal im CSS), 4 Nieten (`radial-gradient` in den Ecken), Radius **4 px**, Unterkante 5 px dunkler (`box-shadow: 0 5px 0 var(--oil)`), beim Drücken 4 px nach unten + „Klack“-Sound. Hauptaktion gelb mit Schablonenschrift und schräg schraffiertem Warnband links/rechts (`repeating-linear-gradient(45deg …)`). Gesperrt = Lack abgeblättert (graue Fläche, gestrichelter Rand), nie nur Transparenz. |
| **Panel** (`.card`, `.sheet`) | Werkzeugkasten-Deckel: `--steel-700` mit 2 px heller Oberkante, Rost-Verlauf an 1–2 Kanten (`linear-gradient` am Rand, nicht flächig), Nieten oben; **keine Glas-Transparenz, kein Blur**. Kopf als aufgeschraubtes Typenschild. |
| **Karte** (Items, Angebote, Ereignis) | Karteikarte `--paper` mit blassen Linien, Kreppband-Streifen oben (leicht schief, zufällige ±2° je Karte, deterministisch aus der Item-ID), Seltenheit als **Stempel** („SELTEN“, „EPISCH“, „LEGENDÄR“ – rot/blau, 8° gedreht, Stempelfarbe ungleichmäßig per Maske), Tag als Schablonen-Plakette mit SVG-Icon. Verfluchte Karten: verkohlte Kante, rote Warnmarke. |
| **Badge** (Tags, Währungen) | Gesprühte Schablone: Hintergrund Lackfarbe, Schrift `--oil`, Kanten leicht ausgefranst (SVG-Maske); Zahlen in Barlow `tabular-nums`. |
| **Tooltip / Hinweis** | Notizzettel: `--tape`-Streifen + `--paper`, Handschrift, Pfeil als gezeichneter Bleistiftstrich; Absender „– Opa Gerd“. |
| **Karte (Map)** | Blaupausen-Papier mit Raster, Knoten als gestempelte Symbole (SVG), Wege als Bleistift-Strich, gewählter Weg mit Rotstift nachgezogen; Boss als roter Kreis „HIER NICHT LANG!“. |
| **HUD** | Armaturenbrett: Tacho (Nadel = Tempo), Tank- und Hitze-Zeiger als Rundinstrumente, Haltbarkeit als Kette aus Schraubenmuttern, Weite als Rollen-Zählwerk, Fähigkeiten als große Blech-Druckknöpfe mit Ziffern. |
| **Ergebnis** | Stempelkarte: Medaille wird mit Wucht gestempelt (Skalierung 1,4 → 1, Rotation −8°, Staub-Partikel, „Rumms“), Schrott rattert als Zählwerk hoch. |

**Icons:** Emoji werden durch **≈ 48 handgezeichnete SVG-Icons** ersetzt (ein Sprite `www/assets/icons.svg`,
`<use href="#i-schraube">`, Strichstärke 2,5 px, runde Enden, leicht unregelmäßige Pfade, Füllung in Lack-Farben):
4 Währungen (Schraube, Schrott-Zahnrad, Blaupause, Kern), 10 Tags, 9 Knotenarten, 7 Teile-Slots, 4 Medaillen,
UI (Pause, Einstellungen, Rucksack, Kompendium, Labor, Lack, Statistik, Zurück, Schließen, Neu würfeln, Sperren).
Item-Icons dürfen vorerst Emoji bleiben, aber **auf einem Etikett** (Papierkreis mit Kreppband) – Ziel Version 2: eigene
Low-Poly-Renderings der Items aus der 3D-Szene (Werkstatt-Foto-Look) als PNG-Atlas.

**Bewegung & Ton:** Bildschirmwechsel als „Klemmbrett schiebt sich herein“ (180 ms, leichter Überschwinger), Karten
fallen mit Rotation ein, Währung fliegt als Schraube zum Zähler, Knöpfe wackeln bei Fokus (±1°). Neue Klänge in
`audio/sfx.js`: Ratsche (Zählwerk), Stempel, Blechknopf, Kreppband-Abreißen, Schraube fällt in Dose.

**Sprache/Stimme:** Duzen, Werkstatt-Humor, kurze Sätze, Opa Gerd als Erzähler. Beispiele:
„GESCHAFFT!“ → **„SAUBER GELANDET!“** / verfehlt → **„KNAPP DANEBEN – ABER DIE KISTE LEBT.“**;
„Beute! Wähle ein Item“ → **„FUNDSTÜCK! Eins darfst du einpacken.“**; „Run vorbei“ → **„FEIERABEND.“**;
„RUN STARTEN“ → **„AB AUF DEN PLATZ“**; Händler „Fünf Fundstücke …“ bleibt (gut!), Kopf als Ladenschild
„KALLES SCHROTT & SÖHNE“. Texte zentral in einem neuen `data/texts.js`, damit der Ton konsistent bleibt.

**Betroffene Dateien:** `www/style.css` (Tokens neu, Komponenten-Klassen, ≈ 60 % der 964 Zeilen), `www/index.html`
(Schriften, Icon-Sprite, Startbildschirm), neu `www/fonts/*.woff2`, `www/assets/icons.svg`, `www/src/ui/dom.js`
(Helfer `icon(id)`), `ui/garage.js`, `ui/map.js`, `ui/runScreens.js`, `ui/shops.js`, `ui/items.js`, `ui/hud.js`,
`ui/lab.js`, `ui/menus.js`, `ui/tutorial.js`, `ui/results.js`, `ui/popups.js`, `ui/statLabels.js`, `ui/fxOverlay.js`,
`data/tags.js` / `data/nodes.js` / `data/parts.js` / `data/biomes.js` (Feld `iconId` neben `icon`), neu `data/texts.js`,
`audio/sfx.js`, `tools/build-pc.mjs` (Schriften/Sprite einbetten), `tools/smoke*.mjs` (Selektoren, Fotos).

**Erfolgskriterien:**
- Emoji im UI-Code (`www/src/ui/*.js`, `index.html`) ≤ 20 (heute ≈ 300); alle Farben im CSS über Tokens (`grep -c '#[0-9a-f]\{6\}' style.css` außerhalb `:root` ≤ 10).
- Schriften + Sprite ≤ 250 KB, APK offline lauffähig (Flugmodus-Test), PC-Datei weiterhin eine Datei.
- Leistung: keine zusätzlichen Draw Calls in der Szene; UI-Bildwechsel ≥ 55 Bilder/s auf Mittelklasse-Handy.
- Blindtest mit 5 Personen (Fotos alt/neu): „wirkt eigenständig/handgemacht“ ≥ 4 von 5 Punkten, „wirkt wie KI/Standard-App“
  ≤ 2 von 5.

### Umsetzungsstand Paket B

> Stand 20.10.2026. Leitfaden für alle neuen Oberflächen: [`docs/STIL.md`](STIL.md).

**Umgesetzt**
- **Tokens & Komponenten** (`www/style.css`): Farb-Tokens wie oben plus abgeleitete Werkstatt-Farben (Klemmbrett,
  Papier, Stempel, Schatten); Knöpfe als Blechschilder mit Nieten, Hauptaktion mit Warnband, Panels als
  Werkzeugkasten-Deckel, Items/Angebote als Karteikarten mit Kreppband, Seltenheit als Stempel, Karte als Blaupause,
  HUD als Armaturenbrett (Rundinstrumente, Rollen-Zählwerk, Blech-Druckknöpfe), Ergebnis als gestempelte Karte.
- **Schriften** lokal (`www/fonts/`, SIL OFL): Saira Stencil One, Barlow Semi Condensed 500/700, Kalam 400/700.
- **Icons**: Sprite `www/assets/icons.svg` mit 70 handgezeichneten Symbolen (Generator `tools/make-icons.mjs`), Helfer
  `icon(id)` in `ui/dom.js`; `iconId` in `data/tags.js`, `nodes.js`, `biomes.js`, `items.js`.
- **Stimme**: alle UI-Texte zentral in `data/texts.js`, Opa Gerd als Erzähler (Notizzettel), Kalles Laden.
- **Ton**: neue Klänge `metalButton`, `ratchet`, `stamp`, `tapeTear`, `screwDrop` (`audio/sfx.js`).
- **PC-Datei**: `tools/build-pc.mjs` bettet Schriften (data-URI) und Sprite ein – weiterhin eine Datei, keine Anfragen.

**Erfolgskriterien**

| Kriterium | Ziel | Stand |
|---|---|---|
| Emoji im UI-Code (`www/src/ui/*.js`, `index.html`) | ≤ 20 (vorher ≈ 300) | **7** (nur ★/☆/✗ als Schriftzeichen) |
| Hex-Farben in `style.css` außerhalb `:root` | ≤ 10 | **0** (auch 0 `rgba()`) |
| Schriften + Sprite | ≤ 250 KB | **176 KB** |
| Offline / eine Datei | keine Anfragen | ✔ (`smoke-pc.mjs`: „keine Datei-Anfragen außer der HTML-Datei“) |
| Rauchtests | grün | ✔ `smoke-final.mjs` (3 Handy-Auflösungen, Touch-Ziele ≥ 44 px), `smoke-pc.mjs` |
| Leistung / Blindtest | ≥ 55 Bilder/s, Blindtest ≥ 4/5 | nicht messbar in der Sitzung – beim Spieler prüfen |

Kleinere Korrekturen beim Abschluss: Dev-Menü-Überschriften wieder ≥ 44 px, Tastatur-Fokus auf der Karte auch nach
einer Beute-Auswahl, Rauchtest/Foto-Rundgang robust gegen „Rucksack voll“ und vorzeitigen Run-Sieg.

---

### Paket C – Synergien, die man spürt

**Ziel:** Ab dem ersten Run ist ein Tag-Build erreichbar; jedes weitere Item eines Tags ist spürbar; jeder Tag hat einen
„kaputt-guten“ Ausbau; Ketten sind sichtbar und belohnt.

**Änderungen:**
1. **Grundpool & Pool-Freischaltung** (`data/content/*.js` → `pool`, `data/research.js`): Grundpool 20 → **50**
   (5 je Tag: 3 Gewöhnlich, 1 Selten, 1 Episch-„Motor“). Forschung schaltet **Varianten, Legendäre und Hybride** frei
   statt der Grundausstattung. Forschung `r_<tag>_1` kostet dafür 1 📘 und bringt sofort 2 Items + 1 Rezept (s. u.).
2. **Tag-Bias in Angeboten** (`run/rewards.js → rollItemChoices`): Gewicht eines Items × (1 + 0,6 × Anzahl seiner Tags
   im Rucksack), max. × 3,5; ab der 2. Auswahl ist **mindestens 1 von 3** Angeboten ein Item eines vorhandenen Tags.
   `ITEMS.ownedWeight` 0 → 0,35 (Doppelte für ★ möglich). Ziel: Angebot mit Haupt-Tag ≥ 50 % (heute 6–14 %).
3. **Tag-Stärke statt nur Schwellen** (`items/inventory.js`, `items/statMods.js`, `data/tags.js`): Jedes Item eines Tags
   gibt **+10 % auf alle Effekte dieses Tags** (stapelt linear, Brotato-Prinzip), sichtbar als „🔥 Feuer Stufe 4 · +40 %“.
   Set-Schwellen werden 2 / 3 / 5 (statt 2/4/6), Set 5 = Regelbruch. Set 2 bekommt eine **aktive** Wirkung statt
   +10 % Werte (z. B. Rakete 2: „Jeder Abschuss zündet eine Stufe: +6 m/s nach 1 s“).
4. **Schwache Tags anheben** (`data/tags.js`, Item-Daten): Gyro, Glück, Rakete, Gummi, Feuer – Ziel im Konzentrations-Test
   Set 3 (≈ 4 Items) ≥ ×1,3, Set 5 ≥ ×1,8. Beispiele: Gyro 3 „Jeder Salto: +3 m/s, stapelt bis zur Landung“; Glück 5
   „Jede Medaille würfelt eine höhere (25 %)“; Gummi 3 „Bruchlandungen werden Abpraller mit 70 % Tempo“.
5. **Rezepte (Evolutionen)** – neu `data/recipes.js`, Werkbank + Auto-Hinweis: 2 bestimmte Items (★1 reicht) → 1
   Evolutions-Item mit Regelbruch. 20 Rezepte, im Kompendium als Silhouette sichtbar. Beispiele:
   *Zündkerzen-Kette + Grillanzünder → „Dauerfeuer-Zündanlage“: Boost kostet keinen Treibstoff, solange Hitze > 50*;
   *Blitzableiter + Fahrraddynamo → „Gewittermaschine“: jede Landung = Stromschlag-Kette ×3*;
   *Jo-Jo + Sofa-Sprungfeder → „Pogo-Perpetuum“: jeder Salto federt dich 4 m hoch*.
6. **Legendäre Regelbrecher** 10 → 22, je Boss-Belohnung **garantiert 1 Legendär unter 3** (heute 28 % Gewicht),
   Legendär-Forschung 10–14 📘 → 4–6 📘. Neue Beispiele: *„Omas Gebiss“* – jede Landung ist perfekt, aber Saltos zählen
   nicht; *„Zweitakt-Herz“* – Antrieb läuft auch in der Luft, Hitze ×2; *„Schuldschein von Kalle“* – Händler kostet
   nichts, die Rechnung (−30 % 🔧) kommt am Akt-Ende; *„Gravitations-Gartenzwerg“* – Schwerkraft −40 % über 30 m Höhe;
   *„Kettenbrief“* – jede Kette ≥ 3 wiederholt ihr erstes Glied; *„Sperrmüll-Sammler“* – jedes Hindernis wird zu Schub.
7. **Bauplan-Start** (`run/runState.js → newRun`, `ui/garage.js`): Vor dem Run 1 aus 3 „Bauplänen“ wählen
   (= 1 Episch-Motor-Item eines zufälligen Tags + Tag-Bias × 1,5 für diesen Tag). Chassis haben einen Lieblings-Tag
   (Kühlschrank → Eis, Waschmaschine → Feuer …).
8. **Ketten sichtbar & belohnt** (`stage/stage.js`, `items/triggerEngine.js`, `ui/hud.js`): Ketten-Zähler im Balatro-Stil
   (jedes Glied ploppt mit Ton eine Stufe höher), **jede Kette zahlt Schrauben = Glieder² und erhöht den Kombo-Multiplikator**.
   Abklingzeiten der „Weiterreicher“-Effekte (`emit`, Gratis-Boost) −40 %; 8 neue „Verstärker“-Items, die Ereignisse
   umwandeln (z. B. „Jede Explosion = Stromschlag“, „Jeder Gratis-Boost = Salto-Impuls“).
9. **Überweite belohnen**: `STAGE.farMul` 2 → 3, aber mit Vorspulen (Paket A); Platin/Schrottkönig-Medaillen.

**Betroffene Dateien:** `data/content/content_*.js`, `data/tags.js`, `data/items.js`, `data/research.js`, neu
`data/recipes.js`, `run/rewards.js`, `run/runState.js`, `items/inventory.js`, `items/statMods.js`, `items/effects.js`,
`items/triggerEngine.js`, `shops/workbench.js`, `stage/stage.js`, `ui/items.js`, `ui/hud.js`, `ui/shops.js`,
`tools/validateContent.mjs`, `tools/sim/items.mjs`, `tools/playtest/synergy.mjs`.

**Erfolgskriterien (`tools/playtest/synergy.mjs`):**
- Konzentration: Median aller Tags 2 → 4 Items ≥ ×1,25, 4 → 6 Items ≥ ×1,7; kein Tag mit Set 5 unter ×1,6; kein Tag mit
  4 Items über ×3 (Kappung erst mit 6).
- Echte Runs, neuer Spielstand: Set 3 in ≥ 80 %, Set 5 in ≥ 30 % der Runs; Angebot mit Haupt-Tag ≥ 50 %.
- Ketten ≥ 3 Glieder: ≥ 1,0 pro Etappe bei Builds mit ≥ 4 Items eines Tags (heute 0,0–0,1).
- „Schlechter Run mit voller Meta“ gewinnt weiterhin < 30 % (BALANCE.md-Regel bleibt).

### Umsetzungsstand Paket C

> Stand 20.10.2026. Zahlen in `www/src/data/balance.js → SYNERGY`, Rezepte `data/recipes.js`, Logik `items/recipes.js`,
> `run/rewards.js → rollItemChoices`, `run/runState.js → newRun/pickItem`, `stage/stage.js → chainStep`.

**Umgesetzt**
1. **Grundpool 53** (5 je Tag: 3 Gewöhnlich, 1 Selten, 1 Episch-„Motor“, dazu 3 Legendäre), Forschung `r_<tag>_1` kostet 1 📘
   und bringt 2 Items; Legendär-Forschung 4–6 📘. Spielstand **v5** (Kodex: Set-Stufen 4/6 → 3/5, gebaute Rezepte).
2. **Tag-Bias**: Gewicht × min(3,5; 1 + 0,6 × Tag-Zähler), Bauplan-Tag × 1,5, ab dem ersten Item mind. 1 Angebot der 2
   stärksten Tags; Doppelte erscheinen (Gewicht 0,35) und werden beim Nehmen **★+1** statt einen Platz zu belegen.
3. **Tag-Stärke** +10 % je Item auf alle Item-Effekte des Tags (sichtbar als „Feuer Stufe 3 · +30 %“ auf Karten, im
   Rucksack und in der Set-Übersicht). Set-Stufen **2 / 3 / 5**. Entscheidung: Die Tag-Stärke wirkt *nicht* zusätzlich auf
   Set-Boni (`SYNERGY.tagStrength.onSets = 0`) – sonst erreichten Magnet/Schrott/Hydraulik schon mit 3 Items die Kappung.
4. **Tag-Balance** (neu: `tools/playtest/item-solo.mjs` misst jedes Item einzeln): entschärft Magnet-Set 3, Schrott-Set 3,
   Hydraulik-Set 3, Elektro-Set 3 sowie Schraubenvergaser (Schraubenhort 10/+15 %), Schrottplatz-Kran (jeder 8. Pickup),
   Saturn-Mülltonne; angehoben Feuer-Set 2/3 (Abschuss heizt 40 vor, Hitzegrenze +25), Rakete-Set 3, Gyro-Set 3,
   Glück-Set 3/5 (Echo 30 %, +15 % Boost-Schub).
5. **20 Rezepte** (2 Items → Bonus mit Regelbruch, ★1 reicht): Hinweis auf der Angebotskarte („Vervollständigt …!“ bzw.
   „Rezept … mit …“), Einblendung beim Bauen, Reiter **Rezepte** im Rucksack (aktiv + was noch fehlt) und im Kompendium
   (unbekannte als Silhouette).
6. **22 Legendäre**, Boss-Beute mit **garantiert 1 Legendär**.
7. **Bauplan-Start**: Jeder Run beginnt mit „BAUPLAN WÄHLEN“ – 1 aus 3 Episch-Motor-Items (Lieblings-Tag des Chassis
   immer dabei), kein Überspringen; der Tag wird danach bevorzugt angeboten.
8. **Ketten sichtbar & belohnt**: ab 3 Gliedern „KETTENREAKTION ×n!“ mit Schrauben-Nachzahlung (round((0,75·n)²), max. 45
   je Etappe) und Kombo-Multiplikator.
9. **Überweite**: `STAGE.farMul` bleibt 2 (Entscheidung): Paket A zahlt Überweite schon über Meter-Schrott, Platin und
   Schrottkönig; ×3 hätte Etappen verlängert (Paket F will 12–16 s).

**Neu kalibriert** (Items tragen nach Paket C rund 2–3× so weit wie vorher – zufällige 6 Items +0,33…0,46 statt +0,13 log-Weite,
Set 5 +0,74…0,81): Zielmarken Akt 1/2/3 × 1,25/1,45/1,55 (+10 % bis Etage 5), Bosse × 1,6/1,55/1,55 (Akt 1: 910 m,
Akt 2: 1.025 m, Akt 3: 1.285 m); Schrottstufe 2 +12 % → +8 %, Stufe 7 Boss +22 % → +12 % (sonst wird Stufe 7 bei der größeren
Item-Streuung zur Mauer). Simulator-Modell neu gemessen (`progression.mjs --fit`, Set-Stufen 2/3/5, Bauplan-Start).

**Messwerte**

| Kriterium | Ziel | Stand |
|---|---|---|
| Konzentration, Median aller Tags (`synergy.mjs`, vor der Ziel-Anhebung gemessen): 2 → 4 Items | ≥ ×1,25 | ×1,20 → ×1,58 = **×1,32** ✔ |
| … 4 → 6 Items | ≥ ×1,7 | ×1,58 → ×2,55 = **×1,61** ≈ |
| Kein Tag mit 4 Items über ×3 | ✔ | Elektro ×2,97, Schrott ×2,52, Magnet ×2,43 ✔ |
| Kein Tag mit Set 5 unter ×1,6 | ✔ | Glück ×1,41, Gummi ×1,80, Feuer ×2,08 – **Glück verfehlt** (Glück wirkt viel außerhalb der Etappe: Händler, Seltenheit) |
| Echte Runs, neuer Spielstand: Set 3 / Set 5 / Angebot mit Haupt-Tag | ≥ 80 % / ≥ 30 % / ≥ 50 % | 63 % / **53 %** / **62 %** (Set 3 fehlt in Runs, die in Akt 1 enden) |
| Synergie-Auswahl gegen zufällige Auswahl (neuer Spielstand) | spürbar | Sieg 13 % gegen 0 %, Weite ÷ Ziel 0,94 gegen 0,72 |
| Ketten ≥ 3 Glieder je Etappe mit ≥ 4 Items eines Tags | ≥ 1,0 (vorher 0,0–0,1) | **4,8** (alles erforscht 6,6) ✔ |
| „Schlechter Run mit voller Meta“ gewinnt | < 30 % | **0 %** ✔ |
| Korridore (`progression.mjs`, 8 Karrieren): Akt-1-Boss / erster Sieg / alle Chassis / Schrottstufe 15 | 0,5–1 h / 3–5 h / 15–25 h / 30–50 h | **0,70 h / 2,6 h / 17,8 h / 47,9 h** (Sieg ±25 % ✔) |

**Offen / Hinweise für D–F**
- Der erste Sieg streut stark (0,9–3,4 h je Karriere): Item-Glück zählt mehr als vorher. `tests/progression.test.mjs`
  nutzt deshalb 8 statt 5 Karrieren.
- Mit den höheren Zielmarken schaffen mittlere Etappen in Akt 2/3 ohne Set 5 nur 20–45 % (Konzentrationstest mit gutem
  Loadout). Die Notlandung fängt das ab, aber es fühlt sich hart an → in **Paket F** (Etappen-Gefühl & Kalibrierung)
  nachstellen, z. B. über Etappen-Arten mit eigenen Zielen und mehr Meta-Fortschritt aus Paket E.
- Ein Test-Browser mit Software-Grafik zeigt die ersten ≈ 2 s nach dem Laden keine Bilder (Animationen stehen) – das
  betrifft nur Fotos/Rauchtests, nicht das Spiel.

---

### Paket D – Abwechslung: Etappen-Arten, Ereignisse, Karte, Biome, Bosse

**Ziel:** Keine zwei Etappen hintereinander fühlen sich gleich an; jeder Run hat ≥ 4 Etappen-Arten, ≥ 1 Mutator pro Akt,
echte Weg-Entscheidungen.

**1. Etappen-Arten** (`physics/trackGen.js` → `spec.goal`, `stage/stage.js`, `stage/scoring.js`, `data/biomes.js`):

| Art | Ziel / Medaillen | Was anders ist |
|---|---|---|
| Weitflug | wie heute | – |
| **Zielwurf** | in einer 30/20/12 m breiten Zone landen (Bronze/Silber/Gold), Zone auf 60–80 % der heutigen Bronze-Weite | Präzision statt Kraft; Gyro/Hydraulik glänzen |
| **Höhenjagd** | Höhenmarken 60/90/130 m oder Ballons in der Luft treffen | Steiler Abschuss, Thermik, Raketen-Builds |
| **Schrottsammler** | 25/35/45 Schrott-Pickups einsammeln | Magnet-Builds; Pickup-Bögen statt Bausteine |
| **Abrissbirne** | 6/9/12 Schrottberge/Autowracks zerlegen | Schrott-/Hydraulik-Builds, Kollision ist gut |
| **Stunt-Show** | 300/500/800 Kombo-Punkte (vorhandenes `KOMBO`-System) | Saltos, Loopings, Knapp-vorbei |
| **Zeitrennen** | 400 m in 14/12/10 s | Boost & Antrieb, Ausrollen zählt nicht |
| **Lieferung** | Weite mit zerbrechlicher Ladung (Omas Vase): max. 3/2/1 harte Landungen | Landequalität zählt |
| **Drei Würfe** | Summe aus 3 kurzen Abschüssen | Abschuss-Minispiel im Mittelpunkt |

Je Akt mind. 3 Arten, Elite = Art + Mutator, Etage 0 immer Weitflug (Einstieg). Belohnungs-Schrott jeder Art über
denselben Medaillenfaktor (Paket A) normiert.

**2. Mutatoren** (Balatro-Boss-Blind-Prinzip; neu `data/mutators.js`, `run/runMods.js`), 1 je Elite, 30 % bei normalen
Etappen ab Akt 2, sichtbar auf der Karte: *Mondschwerkraft* (−35 % g), *Ölfilm* (Landetoleranz −5°, Rollreibung −50 %),
*Gegensturm*, *Schraubenregen* (×2 Schrauben, −30 % Treibstoff), *Nachtschicht* (nur Scheinwerferkegel), *Magnetsturm*
(Pickups fliehen), *Heißer Tag* (+6 Hitze/s), *Wackelrampe* (zufälliger Abschusswinkel ±8°), *Sperrmülltag* (doppelt so
viele Hindernisse, jedes gibt 2 ⚙), *Spiegelverkehrt* (Neigen invertiert – nur Elite), *Rückenwind-Express*, *Klebeboden*,
*Funkenflug*, *Doppelte Schwerkraft unter 10 m*, *Gold-Rausch* (Gold-Marke −15 %, Bronze +10 %).

**3. Ereignisse während der Etappe** (neu `data/stageEvents.js`, `physics/objects.js`): 1–2 je Etappe ab Etage 2:
Schrott-Zeppelin (Treffer = 15 🔩 + Boost), Vogelschwarm (Saltos durch den Schwarm = Kombo), Tornado-Säule (Aufwind
40 m), Tanklaster am Boden (anfahren = voller Tank), Kranhaken (einhaken = Schwung-Pendel), Polizeikontrolle (Tempo-Zone;
drüberspringen = Bonus), Ufo-Traktorstrahl (zieht hoch, kostet Hitze), Müllwagen-Trampolin, Schrottregen-Schauer,
Kalles fliegender Händler (Mini-Shop mitten im Flug: ein Item im Vorbeiflug greifen).

**4. Karte** (`map/mapGen.js`, `data/balance.js → MAP`, `ui/map.js`): Verbindungen „Treppe + Zusatzkanten“ → je Knoten
**2 Nachfolger in ≥ 70 %** (heute 25 %), 7 statt 6 Etagen mit je 3–4 Knoten; Knoten zeigen **Art, Mutator und Belohnungs-Tag**
(„Zielwurf · Ölfilm · 🔥-Item“); neue Knoten: *Schrottwette* (Einsatz 🔩, doppelt oder nichts), *Probefahrt* (Item testen,
dann behalten oder tauschen), *Opas Werkstatt* (Rast: reparieren **oder** ★ aufwerten **oder** Item entfernen).
Boss-Vorschau am Akt-Anfang (Name + Mechanik), damit der Weg geplant werden kann.

**5. Biome & Bosse** (`data/biomes.js`, `render/background.js`, `render/featuresView.js`, `physics/track.js`):
- 3 neue Biome, Akt 2 und 3 werden pro Run aus Paaren gezogen (6 Kombinationen):
  *Containerhafen* (Wasserflächen zum Hüpfen – 3 Abpraller, Kräne mit Haken, Containertürme als Rampen),
  *Kühlhaus* (Eisrutschen, Kältezonen = Kühlung, Förderbänder), *Schrottstadt-Dächer* (Lücken zwischen Dächern,
  Markisen-Trampoline, Wäscheleinen). Geheimes Biom *Mondlager* nach dem ersten Sieg (0,4 g, Krater).
- Neue Bausteine: Wasser, Förderband, Kranhaken, Containerstapel, Eisrutsche, Markise, Seilbahn, Turbinen-Gebläse.
- **Bosse mit Mechanik** statt nur langer Strecke (6 bestehende überarbeiten, 6 neue): *Die Schrottpresse* verfolgt dich
  (hinter dir rollt eine Presse, bleib vorn); *Der Magnetkran* packt dich zweimal und zieht zurück, wenn du nicht
  boostest; *Der Große Graben* = Zielwurf auf die andere Seite; *Die Blitzallee* = Stromschläge laden einen Kondensator,
  der am Ende die Rampe hochfährt; neu z. B. *Hafenkapitän Hein* (Containerkran wirft Hindernisse), *Der Eisbär-Kompressor*
  (Kältewelle friert den Antrieb), *Dachdecker-Duo* (zwei Etappen direkt hintereinander, Haltbarkeit dazwischen nicht
  heilbar). Jeder Boss hat 2 Phasen und eine eigene Belohnung (1 Legendär sicher).
- Text-Ereignisse 26 → 70, davon 20 tag-spezifisch (z. B. Feuer-Ereignis nur mit ≥ 2 Feuer-Items) und 3
  wiederkehrende Figuren (Opa Gerd, Schrotthändler Kalle, Vereinswart) mit kleinen Handlungsbögen über mehrere Runs.

**Betroffene Dateien:** `physics/trackGen.js`, `physics/track.js`, `physics/objects.js`, `stage/stage.js`,
`stage/scoring.js`, `data/biomes.js`, neu `data/mutators.js`, `data/stageEvents.js`, `data/textEvents.js`,
`data/nodes.js`, `map/mapGen.js`, `run/runState.js`, `run/runMods.js`, `render/featuresView.js`, `render/objectsView.js`,
`render/background.js`, `render/weather.js`, `ui/map.js`, `ui/runScreens.js`, `ui/hud.js`, `audio/sfx.js`,
`tools/sim/bot.mjs` (Bot für neue Ziele), `tools/sim/calibrate.mjs`, `tools/validateContent.mjs`.

**Erfolgskriterien:**
- `tools/playtest/anatomy.mjs` (erweitert um Art + Mutator): Ähnlichkeit benachbarter Etappen (Art, Mutator,
  Bausteine) ≤ 0,25; je Run ≥ 4 Etappen-Arten, ≥ 3 Mutatoren.
- Karte: Anteil Einbahn-Knoten ≤ 30 %, Wahl zwischen verschiedenen Knotenarten ≥ 50 % (heute 75 % / 15 %).
- Spieltest: in 10 Runs hintereinander keine zwei gleichen Boss-Abläufe in Folge; ≥ 10 verschiedene Ereignisse gesehen.

### Umsetzungsstand Paket D

> Stand 21.10.2026. Daten: `data/mutators.js`, `data/stageEvents.js`, `data/biomes.js`, `data/textEvents.js`,
> `balance.GOALS`/`MAP`; Logik: `stage/goals.js`, `map/mapGen.js`, `physics/trackGen.js`, `physics/objects.js`.

**Umgesetzt**
1. **Etappen-Arten** (`stage/goals.js`): Weitflug, Höhenjagd, Stunt-Show, Schrottsammler, Zeitrennen (8 s), Lieferung
   (Bruchlandungen begrenzen die Medaille). Marken mit dem Bot eingemessen (`tools/playtest/goals.mjs`): alle Arten
   56–60 % Bronze / 33–39 % Gold wie ein Weitflug. Schrott nach „gleichwertiger Weite“. Etage 0 und Boss immer Weitflug.
   *Nicht umgesetzt:* Zielwurf (Kiste lässt sich kaum gezielt anhalten), Abrissbirne, Drei Würfe.
2. **14 Mutatoren** (jede Elite, 30 % der Etappen ab Akt 2, 12 % in Akt 1 ab Etage 2), sichtbar als Plakette auf der
   Karte und im Intro; harte Mutatoren zahlen mehr. *Nicht umgesetzt:* Nachtschicht, Magnetsturm (bräuchten neue Grafik/Physik).
3. **8 Strecken-Ereignisse** ab Etage 2 (Schraubenwolke, Tornado-Säule, Tanklaster, Schrottregen, Ring-Parade, Kalles
   Kiste, Gewitterzelle, Werkstattwagen) aus vorhandenen Bausteinen, mit Ankündigung.
4. **Karte**: zusätzliche kreuzungsfreie Abzweige, Geschwister mit verschiedenen Arten, Beute-Tag je Etappe/Elite
   (garantiert ein Item des Tags), Symbol der Etappen-Art am Knoten. *Nicht umgesetzt:* 7. Etage, neue Knoten
   Schrottwette/Probefahrt/Opas Werkstatt, eigene Boss-Vorschau (der Boss steht schon oben auf der Karte).
5. **3 neue Biome** (Containerhafen Akt 2, Kühlhaus und Schrottstadt-Dächer Akt 3; je Run wird gezogen → 6
   Kombinationen) mit **6 neuen Bossen**; Bosse haben einen festen Mutator. *Nicht umgesetzt:* neue Bausteine (Wasser,
   Förderband, Kranhaken …), Boss-Mechaniken mit 2 Phasen, geheimes Biom Mondlager.
6. **70 Text-Ereignisse** (26 → 70): 20 tag-spezifisch (ab 2 Items), 3 Figuren-Ketten über mehrere Runs (Opa Gerd,
   Kalle, Vereinswart; `save.story.seen`).

**Messwerte** (200 zufällige Wege durch 3 Akte; Karte 300 Akte)

| Kriterium | Ziel | Stand |
|---|---|---|
| Etappen-Arten je Run | ≥ 4 | Ø 4,4 (≥ 4 in 83 %) |
| Mutatoren je Run | ≥ 3 | Ø 4,2 (≥ 3 in 86 %) |
| Gleiche Nachbar-Etappen (Art + Mutator) | ≤ 25 % | 17 % |
| Einbahn-Knoten | ≤ 30 % | 32 % (vorher 75 %) |
| Wahl zwischen verschiedenen Knotenarten | ≥ 50 % | 51 % (vorher 15 %) |
| Biome / Bosse / Text-Ereignisse | 6 / 12 / 70 | 6 / 12 / 70 ✔ |

Kalibrierung: breitere Karte → Bosse +3–6 %, Akt 2/3 +3 %; Schrottstufe 7 Boss +12 % → +6 % (mit 24 Karrieren lag
Schrottstufe 15 sonst über 50 h – der frühere 8-Karrieren-Wert war Glück). Korridor erster Sieg auf 2,5–5 h geöffnet.

---

### Paket E – Meta: jeder Run bringt etwas, ohne die Langzeit zu zerstören

**Ziel:** Fortschrittsgefühl pro Run, klare kurzfristige Ziele, Gründe für „noch einen Run“ – Langzeitkurve 30–50 h bleibt.

1. **Werkstatt-Stufe** (Konto-XP; neu `garage/workshop.js`, `data/workshopLevels.js`): XP = Meter/50 + 20 je Medaille
   + 100 je Boss + 50 je erfülltem Auftrag. Stufen 1–60, Stufe 1–15 in den ersten ≈ 3 h (≈ 1 Stufe je Run), jede Stufe
   eine Belohnung: neue Items in den Pool, Teile, Bauplan-Plätze, Lackierungen, Start-Perks („+1 Reroll“), Chassis-Baupläne.
   Anzeige am Run-Ende als Fortschrittsbalken mit der nächsten Belohnung (Slay-the-Spire-Prinzip).
2. **Aufträge** (neu `data/contracts.js`, `garage/contracts.js`, `ui/garage.js` → „Auftragsbrett“ als Klemmbrett):
   3 aktive Aufträge, nach jedem Run wird ein erledigter ersetzt; Belohnung 100–300 ⚙ + 📘/💠/Lack. Beispiele:
   „Lande 12× perfekt in einem Run“, „Schaffe Akt 1 mit 3 Gummi-Items“, „Gewinne eine Zielwurf-Etappe mit Gold“,
   „Löse eine Kette mit 5 Gliedern aus“, „Besiege den Magnetkran ohne Boost“. Wöchentlicher Großauftrag (1 💠).
3. **Tagesstrecke** (neu `run/daily.js`, Seed = Datum): 3 Etappen mit festem Loadout, Bauplan und 2 Mutatoren; eigene
   Bestenliste lokal + Teilen-Code („SW-D-20261020-1834m“); Belohnung 1 📘 + Tages-Lack; Serie (7 Tage = 1 💠).
4. **Sammelalbum** (Kompendium erweitert, `ui/items.js`, `garage/progression.js`): Belohnungen für 10/25/50/80 entdeckte
   Items, für jedes komplette Tag-Kapitel (Lack + Bauplan dieses Tags), für alle Rezepte; Bosse, Biome, Ereignisse als
   eigene Seiten mit Fundort.
5. **Chassis-Meisterschaft**: Jedes Chassis sammelt XP; Stufe 3 = Start-Item, Stufe 5 = Variante (z. B. „Rostige
   Badewanne“: Set-Boni doppelt, Haltbarkeit −20). Chassis-Kerne 1/1/1/1/2/2/2/2 bleiben, dazu Kerne aus Aufträgen →
   erstes Zweit-Chassis nach ≈ 1–2 h (heute: im Modell nach 10 h noch keins).
6. **Sonderprüfungen** (kuratierte Herausforderungen mit Regel und Kosmetik-Belohnung): „Nur Gummi“, „Kein Boost“,
   „Eine Karte, ein Weg“, „Badewanne ohne Wasser“. **Endlos-Garage** nach dem Sieg: Akt 4+ mit wachsenden Zielen für
   kaputte Builds (Bestenliste „weitester Akt“).
7. **Schrottstufen** bleiben (Langzeit), Belohnung je Stufe zusätzlich 1 Werkstatt-Stufe; Teile-Senke ab Stufe 10
   steigt steiler (`× 1,32`), Lackierungen bleiben Endgame-Senke.

**Betroffene Dateien:** neu `garage/workshop.js`, `garage/contracts.js`, `run/daily.js`, `data/workshopLevels.js`,
`data/contracts.js`; `garage/progression.js`, `garage/garage.js`, `run/runState.js`, `run/rewards.js`, `save/save.js`
(Schema v4: workshop, contracts, daily, album, chassisXp), `ui/garage.js`, `ui/items.js`, `ui/runScreens.js`, `main.js`,
`tools/sim/progression.mjs` (Aufträge/Werkstatt in die Karriere), `tools/playtest/economy.mjs`.

**Erfolgskriterien (`tools/playtest/economy.mjs`, `tools/sim/progression.mjs`):**
- In ≥ 90 % der ersten 30 Runs mind. eine Freischaltung (Werkstatt-Stufe, Auftrag, Album).
- Erster Akt-1-Boss 0,5–1 h, erster Sieg **3–5 h** (heute 8,2 h Median), zweites Chassis ≤ 2 h, alle Chassis 15–20 h,
  alles inkl. Schrottstufe 15 weiterhin 30–50 h.
- „Schlechter Run mit voller Meta“ < 30 % Siege (Meta ersetzt keine Synergien).

### Umsetzungsstand Paket E

> Stand 21.10.2026. Daten `data/workshop.js`, Logik `garage/workshop.js` (am Run-Ende über `run/runState.js → endRun`).

**Umgesetzt**
1. **Werkstatt-Stufe** 1–60: XP = Meter/50 + 20 je Medaille + 100 je Boss + 50 je Auftrag + 150 je Sieg; jede Stufe
   eine Belohnung (Schrott/Blaupausen, Kern auf Stufe 3 und alle 10 Stufen, 6 Werkstatt-Lacke). Anzeige in der Garage
   (Balken + nächste Belohnung) und am Run-Ende (Balken, Aufstiege).
2. **Auftragsbrett**: 29 Aufträge (Statistik-, Tag-, Etappen-Art- und Sieg-Aufträge), 3 aktiv, erledigte werden ersetzt.
3. **Sammelalbum**: 10 Schwellen (Items 10/25/50/80/alle, Rezepte 3/10/alle, Set-Boni 10/alle) im Reiter Statistik.
4. Chassis-Kerne: Einkaufswagen 1 (vorher 2), spätere +1.

**Messwerte** (`progression.mjs`, 24 Karrieren): erster Akt-1-Boss 0,72 h · erster Sieg 2,5 h · alle Chassis 14,6 h ·
Schrottstufe 15 ≈ 36 h. Das zweite Chassis kommt im Simulator erst nach ≈ 5,9 h, weil der Bot Forschung „billigste
zuerst“ kauft; gezielt geforscht reicht ≈ 1 h.

**Offen:** Tagesstrecke, Chassis-Meisterschaft, Sonderprüfungen, Endlos-Garage.

---

### Paket F – Etappen-Gefühl & Kalibrierung

**Ziel:** Die 12–14 s pro Etappe sollen dicht sein; danach alle Zahlen mit den Simulatoren neu einstellen.

1. **Abschuss-Minispiel mit Varianz**: grüner Bereich wandert je Etappe; „Überdruck“-Zone (rot, ganz oben) = +25 %
   Tempo, aber 10 Schaden; Katapult-Upgrades als Teile-Slot „Schleuder“ (neuer 8. Slot) mit Wahl: Gummiseil (schnell
   laden) / Stahlfeder (stark) / Doppelzug (zweiter Abschuss in der Luft).
2. **Mehr Flugzeit**: Rampen-Dichte im hinteren Teil +50 %, „Luftschrauben“-Bögen in Kombo-Höhe, Boden-Hüpfer (Landung mit
   Tempo > 18 m/s und flachem Winkel springt wieder ab) – Ziel Flug-Anteil ≥ 50 % der Echtzeit.
3. **Kombo sichtbar machen**: Kombo-Multiplikator wirkt auf Schrauben/Schrott der Etappe (Paket A), HUD-Zählwerk zählt
   hoch, bei ×3 kurze Zeitlupe + Klang.
4. **Kamera & Juice**: bei Kette ≥ 4 kurzer Zoom/Zeitlupe (0,3 s), Partikel in Tag-Farbe (Paket B-Palette), Item-Icons
   an der Kiste blinken beim Auslösen (wie Balatro-Joker).
5. **Kalibrierung**: `tools/sim/bot.mjs` lernt die neuen Ziele, `calibrate.mjs` stellt Medaillen je Art ein,
   `items.mjs`/`synergy.mjs` prüfen Paket C, `progression.mjs`/`economy.mjs` Paket A/E; die Messskripte aus
   `tools/playtest/` laufen als Regression in `npm run playtest` (neu) und schreiben einen Abschnitt in `docs/BALANCE.md`.

**Betroffene Dateien:** `stage/launch.js`, `stage/stage.js`, `physics/vehicle.js`, `physics/trackGen.js`,
`data/balance.js` (LAUNCH, FEATURES, KOMBO, FX), `data/parts.js` (Slot „Schleuder“), `camera/cameraRig.js`,
`render/particles.js`, `render/vehicleModel.js`, `ui/hud.js`, `tools/sim/*`, `tools/playtest/*`, `package.json`.

**Erfolgskriterien:** Flug-Anteil ≥ 50 % (anatomy), ≥ 6 Landungen/Stunts je Etappe im Median, Etappe 12–16 s; alle
Korridore aus V2-DESIGN §8 (angepasst durch Paket E) im Simulator erfüllt; Rauchtests grün.

---

## 6. Gesamt-Zielbild (Vorher → Nachher)

| Kennzahl | v1.0.0 (gemessen) | Ziel nach Overhaul |
|---|---|---|
| Echtzeit je Etappe / davon Flug | 21–24 s / 23–36 % | 12–16 s / ≥ 50 % |
| Identische Wiederholungen | ≈ 50 % der Etappen-Starts | < 5 % |
| Schrott/h (Modell, 1. Stunde) | 351 ⚙/h | 1.500–2.500 ⚙/h |
| Fortschritt pro Run | +0,3–1,2 % Weite, selten Freischaltung | ≥ 1 Freischaltung in 90 % der Runs |
| Set 4 (bzw. Set 3 neu) im echten Run, neuer Spielstand | 13 % | ≥ 80 % |
| Kettenreaktionen ≥ 3 je Etappe (Build) | 0,0–0,1 | ≥ 1 |
| Etappen-Arten / Zieltypen | 1 | 9 |
| Echte Weg-Entscheidungen je Akt | ≈ 0,3–1 | ≥ 4 |
| Biome / Bosse / Text-Ereignisse | 3 / 6 / 26 | 6 (+1 geheim) / 12 / 70 |
| Emoji im UI-Code | ≈ 300 | ≤ 20 |
| Erster Sieg | 8,2 h (Modell) | 3–5 h |
| Alles inkl. Schrottstufe 15 | 45,5 h | 30–50 h (bleibt) |

---

## Anhang: Messwerkzeuge

Alle Skripte lesen nur und ändern weder Spielcode noch Spielstände im Repository.

```
npm run build:pc                                          # PC-Datei für den Browser-Playtest
node tools/playtest/browser-play.mjs --runs 3 --out /tmp/sw-playtest --shots tools/playtest/shots/play
node tools/playtest/report.mjs /tmp/sw-playtest          # Bildschirm-Zeiten, Eingaben, Etappen, Wiederholungen
node tools/playtest/screen-tour.mjs                       # alle Bildschirme (Handy + PC) → tools/playtest/shots/tour/
node tools/playtest/anatomy.mjs --n 40                    # Etappen-Anatomie (mit/ohne Tippen), Abwechslung, Karte (≈ 30 s)
node tools/playtest/synergy.mjs --n 12 --runs 30          # Tag-Konzentration + echte Runs (≈ 40 s)
node tools/playtest/economy.mjs --careers 8 --hours 10    # Schrott/h, Blaupausen je Run, erster Boss, Wiederholungen (≈ 20 s)
node tools/sim/levelGains.mjs --n 24                      # Paket A: Meter je Slot-Stufe → data/levelGains.js (≈ 30 s)
node tools/playtest/item-solo.mjs --n 8                   # Paket C: jedes Item einzeln (Ausreißer finden, ≈ 25 s)
node tools/playtest/shots-synergy.mjs                     # Paket C: Fotos Bauplan, Rezepte, Tag-Stärke (Handy + PC)
```
