# Schleuderwerk 2 – Balance (Zielmarken)

> Erzeugt von `node tools/sim/calibrate.mjs` (30 Etappen je Zeile, Elite 15; Rechenzeit 29 s). Nicht von Hand bearbeiten – neu erzeugen.

## Verfahren

- Ein Bot (`tools/sim/bot.mjs`) spielt headless mit der echten Etappen-Logik (`stage/stage.js`, Strecke aus `physics/trackGen.js`): Abschuss meist im grünen Bereich (60 %), Winkel 30–42°, richtet die Kiste vor jeder Landung aus, boostet in der Luft nach vorn (Reserve 35 % Treibstoff, Hitze < 72 %), nimmt vor Schluchten Anlauf, springt mit dem Hüpfer über Hindernisse, geschlossene Pressen und an Schluchtkanten, gibt bei Blitzwarnungen Gas. Ohne Items – ihre Wirkung misst `tools/sim/items.mjs` (Abschnitt „Items“ unten).
- **Start-Loadout** = neuer Spielstand (Seifenkiste, Startteile Stufe 0, Boost + Hüpfer). **Gutes Loadout** = dieselben Startteile, alle Slots auf Stufe 5 von 10 (Paket A: Slot-Stufen; gleich stark wie früher Teile-Stufe 10 von 20).
- Jede Etappe beginnt mit voller Haltbarkeit (Schaden = Anteil der max. Haltbarkeit in dieser einen Etappe).
- Zielmarken je Etage = Median-Distanz ÷ Soll-Verhältnis (linear von Etage 0 bis 5), danach innerhalb eines Akts nie fallend, Boss ≥ 1,1 × Etage 5, auf 5 m gerundet. Mehrere Durchgänge, weil die Bausteine bis zur Gold-Marke verteilt werden.

| Akt | Kalibriert mit | Etage 0 | Etage 5 | Boss |
|---|---|---|---|---|
| 1 | Start-Loadout | ×1,30 | ×0,92 | ×0,71 |
| 2 | gutem Loadout | ×0,94 | ×0,80 | ×0,71 |
| 3 | gutem Loadout | ×0,84 | ×0,71 | ×0,64 |

## Zielmarken (data/biomes.js)

| Biom | Etage 0–5 (Bronze, m) | Elite | Boss | Silber / Gold |
|---|---|---|---|---|
| Schrottplatz (Akt 1) | 330 · 355 · 355 · 410 · 425 · 445 | ×1,30 | 570 | ×1,25 / ×1,50 |
| Glutwüste (Akt 2) | 520 · 555 · 555 · 560 · 585 · 605 | ×1,30 | 660 | ×1,25 / ×1,50 |
| Gewittersteppe (Akt 3) | 565 · 570 · 615 · 615 · 650 · 670 | ×1,30 | 830 | ×1,25 / ×1,50 |

## Messung

Verhältnis = Distanz ÷ Zielmarke (Median, in Klammern 25.–75. Perzentil). „Geschafft“ = mindestens Bronze. Schaden = Median des Haltbarkeitsverlusts einer Etappe.

### Schrottplatz (Akt 1)

| Art | Etage | Loadout | Ziel | Median | Verhältnis | geschafft | Gold | Schaden | Sturz | Dauer |
|---|---|---|---|---|---|---|---|---|---|---|
| Etappe | 0 | start | 330 m | 421 m | ×1,28 (1,16–1,37) | 100 % | 10 % | 0 % | 0 % | 20 s |
| Etappe | 1 | start | 355 m | 437 m | ×1,23 (1,10–1,38) | 97 % | 17 % | 1 % | 7 % | 20 s |
| Etappe | 2 | start | 355 m | 423 m | ×1,19 (1,10–1,49) | 97 % | 23 % | 5 % | 0 % | 21 s |
| Etappe | 3 | start | 410 m | 431 m | ×1,05 (0,90–1,15) | 60 % | 0 % | 4 % | 0 % | 21 s |
| Etappe | 4 | start | 425 m | 416 m | ×0,98 (0,84–1,12) | 47 % | 3 % | 5 % | 0 % | 21 s |
| Etappe | 5 | start | 445 m | 407 m | ×0,91 (0,83–0,99) | 23 % | 0 % | 5 % | 0 % | 21 s |
| Elite | 2 | start | 460 m | 388 m | ×0,84 (0,76–0,95) | 20 % | 0 % | 10 % | 7 % | 18 s |
| Elite | 3 | start | 535 m | 411 m | ×0,77 (0,68–0,92) | 7 % | 0 % | 5 % | 0 % | 21 s |
| Elite | 4 | start | 555 m | 373 m | ×0,67 (0,60–0,75) | 0 % | 0 % | 7 % | 7 % | 19 s |
| Elite | 5 | start | 580 m | 393 m | ×0,68 (0,63–0,72) | 7 % | 0 % | 5 % | 0 % | 20 s |
| Boss | – | start | 570 m | 419 m | ×0,74 (0,60–0,83) | 3 % | 0 % | 10 % | 0 % | 20 s |
| Etappe | 0 | gut | 330 m | 500 m | ×1,52 (1,42–1,62) | 100 % | 53 % | 1 % | 0 % | 23 s |
| Etappe | 1 | gut | 355 m | 500 m | ×1,41 (1,28–1,56) | 100 % | 30 % | 1 % | 3 % | 22 s |
| Etappe | 2 | gut | 355 m | 501 m | ×1,41 (1,25–1,68) | 100 % | 43 % | 5 % | 0 % | 24 s |
| Etappe | 3 | gut | 410 m | 497 m | ×1,21 (1,07–1,36) | 87 % | 10 % | 5 % | 0 % | 23 s |
| Etappe | 4 | gut | 425 m | 494 m | ×1,16 (1,01–1,27) | 77 % | 10 % | 6 % | 3 % | 22 s |
| Etappe | 5 | gut | 445 m | 455 m | ×1,02 (0,99–1,20) | 67 % | 3 % | 7 % | 0 % | 23 s |
| Elite | 2 | gut | 460 m | 438 m | ×0,95 (0,83–1,01) | 27 % | 0 % | 9 % | 0 % | 20 s |
| Elite | 3 | gut | 535 m | 478 m | ×0,89 (0,78–1,04) | 40 % | 0 % | 8 % | 13 % | 22 s |
| Elite | 4 | gut | 555 m | 469 m | ×0,85 (0,68–0,92) | 20 % | 0 % | 8 % | 0 % | 22 s |
| Elite | 5 | gut | 580 m | 443 m | ×0,76 (0,73–0,99) | 20 % | 0 % | 5 % | 0 % | 22 s |
| Boss | – | gut | 570 m | 476 m | ×0,84 (0,76–0,95) | 20 % | 0 % | 10 % | 0 % | 21 s |

### Glutwüste (Akt 2)

| Art | Etage | Loadout | Ziel | Median | Verhältnis | geschafft | Gold | Schaden | Sturz | Dauer |
|---|---|---|---|---|---|---|---|---|---|---|
| Etappe | 0 | start | 520 m | 426 m | ×0,82 (0,71–0,97) | 17 % | 0 % | 5 % | 3 % | 20 s |
| Etappe | 1 | start | 555 m | 428 m | ×0,77 (0,61–0,93) | 13 % | 0 % | 1 % | 0 % | 19 s |
| Etappe | 2 | start | 555 m | 425 m | ×0,76 (0,68–0,93) | 17 % | 3 % | 0 % | 3 % | 20 s |
| Etappe | 3 | start | 560 m | 421 m | ×0,75 (0,67–0,88) | 17 % | 0 % | 5 % | 7 % | 20 s |
| Etappe | 4 | start | 585 m | 392 m | ×0,67 (0,58–0,78) | 3 % | 0 % | 2 % | 0 % | 21 s |
| Etappe | 5 | start | 605 m | 400 m | ×0,66 (0,58–0,79) | 10 % | 0 % | 3 % | 3 % | 19 s |
| Elite | 2 | start | 720 m | 381 m | ×0,53 (0,46–0,62) | 0 % | 0 % | 2 % | 0 % | 20 s |
| Elite | 3 | start | 730 m | 444 m | ×0,61 (0,52–0,65) | 7 % | 0 % | 2 % | 0 % | 20 s |
| Elite | 4 | start | 760 m | 409 m | ×0,54 (0,46–0,68) | 7 % | 0 % | 1 % | 0 % | 19 s |
| Elite | 5 | start | 785 m | 409 m | ×0,52 (0,44–0,58) | 0 % | 0 % | 1 % | 0 % | 21 s |
| Boss | – | start | 660 m | 422 m | ×0,64 (0,55–0,72) | 0 % | 0 % | 5 % | 7 % | 19 s |
| Etappe | 0 | gut | 520 m | 488 m | ×0,94 (0,83–1,13) | 33 % | 3 % | 5 % | 3 % | 22 s |
| Etappe | 1 | gut | 555 m | 487 m | ×0,88 (0,72–1,06) | 37 % | 0 % | 2 % | 0 % | 22 s |
| Etappe | 2 | gut | 555 m | 483 m | ×0,87 (0,78–1,07) | 30 % | 3 % | 1 % | 0 % | 21 s |
| Etappe | 3 | gut | 560 m | 500 m | ×0,89 (0,80–1,07) | 30 % | 0 % | 5 % | 7 % | 22 s |
| Etappe | 4 | gut | 585 m | 470 m | ×0,80 (0,68–0,88) | 13 % | 3 % | 5 % | 0 % | 22 s |
| Etappe | 5 | gut | 605 m | 470 m | ×0,78 (0,66–0,86) | 10 % | 0 % | 3 % | 0 % | 22 s |
| Elite | 2 | gut | 720 m | 455 m | ×0,63 (0,53–0,76) | 0 % | 0 % | 5 % | 7 % | 22 s |
| Elite | 3 | gut | 730 m | 487 m | ×0,67 (0,63–0,79) | 0 % | 0 % | 5 % | 7 % | 23 s |
| Elite | 4 | gut | 760 m | 475 m | ×0,63 (0,57–0,80) | 0 % | 0 % | 1 % | 0 % | 25 s |
| Elite | 5 | gut | 785 m | 483 m | ×0,62 (0,48–0,74) | 0 % | 0 % | 5 % | 7 % | 22 s |
| Boss | – | gut | 660 m | 465 m | ×0,70 (0,62–0,82) | 0 % | 0 % | 5 % | 10 % | 22 s |

### Gewittersteppe (Akt 3)

| Art | Etage | Loadout | Ziel | Median | Verhältnis | geschafft | Gold | Schaden | Sturz | Dauer |
|---|---|---|---|---|---|---|---|---|---|---|
| Etappe | 0 | start | 565 m | 425 m | ×0,75 (0,69–0,80) | 0 % | 0 % | 0 % | 0 % | 20 s |
| Etappe | 1 | start | 570 m | 405 m | ×0,71 (0,65–0,78) | 3 % | 0 % | 3 % | 0 % | 20 s |
| Etappe | 2 | start | 615 m | 418 m | ×0,68 (0,62–0,73) | 0 % | 0 % | 2 % | 0 % | 20 s |
| Etappe | 3 | start | 615 m | 397 m | ×0,64 (0,58–0,67) | 0 % | 0 % | 1 % | 3 % | 20 s |
| Etappe | 4 | start | 650 m | 406 m | ×0,62 (0,55–0,73) | 0 % | 0 % | 3 % | 0 % | 20 s |
| Etappe | 5 | start | 670 m | 411 m | ×0,61 (0,56–0,69) | 0 % | 0 % | 3 % | 7 % | 20 s |
| Elite | 2 | start | 800 m | 438 m | ×0,55 (0,50–0,57) | 0 % | 0 % | 0 % | 0 % | 20 s |
| Elite | 3 | start | 800 m | 418 m | ×0,52 (0,45–0,56) | 0 % | 0 % | 5 % | 0 % | 20 s |
| Elite | 4 | start | 845 m | 390 m | ×0,46 (0,42–0,52) | 0 % | 0 % | 5 % | 0 % | 19 s |
| Elite | 5 | start | 870 m | 445 m | ×0,51 (0,45–0,58) | 0 % | 0 % | 1 % | 7 % | 21 s |
| Boss | – | start | 830 m | 413 m | ×0,50 (0,40–0,53) | 0 % | 0 % | 8 % | 0 % | 19 s |
| Etappe | 0 | gut | 565 m | 499 m | ×0,88 (0,79–0,95) | 20 % | 0 % | 5 % | 0 % | 23 s |
| Etappe | 1 | gut | 570 m | 451 m | ×0,79 (0,75–0,91) | 7 % | 0 % | 5 % | 0 % | 22 s |
| Etappe | 2 | gut | 615 m | 482 m | ×0,78 (0,73–0,83) | 0 % | 0 % | 3 % | 0 % | 21 s |
| Etappe | 3 | gut | 615 m | 471 m | ×0,77 (0,71–0,87) | 3 % | 0 % | 5 % | 10 % | 23 s |
| Etappe | 4 | gut | 650 m | 461 m | ×0,71 (0,61–0,88) | 0 % | 0 % | 4 % | 0 % | 22 s |
| Etappe | 5 | gut | 670 m | 477 m | ×0,71 (0,65–0,84) | 0 % | 0 % | 5 % | 0 % | 23 s |
| Elite | 2 | gut | 800 m | 494 m | ×0,62 (0,58–0,65) | 0 % | 0 % | 5 % | 0 % | 22 s |
| Elite | 3 | gut | 800 m | 485 m | ×0,61 (0,53–0,66) | 0 % | 0 % | 6 % | 7 % | 23 s |
| Elite | 4 | gut | 845 m | 459 m | ×0,54 (0,48–0,66) | 0 % | 0 % | 2 % | 0 % | 23 s |
| Elite | 5 | gut | 870 m | 502 m | ×0,58 (0,52–0,68) | 0 % | 0 % | 5 % | 7 % | 21 s |
| Boss | – | gut | 830 m | 448 m | ×0,54 (0,50–0,61) | 0 % | 0 % | 7 % | 0 % | 20 s |

## Prüfpunkte

- Start-Loadout, Akt 1, Etage 0: Median ×1,28 (Soll ≈ 1,3).
- Start-Loadout, Akt-1-Boss: Median ×0,74 (Soll ≈ 0,71 – braucht Items/Upgrades).
- Gutes Loadout, Akt 2, Etage 0: Median ×0,94 (Soll ≈ 0,94).
- Schaden einer normalen Etappe (Akt 1, Etage 0–1, Start-Loadout, Bot ohne grobe Fehler): Median 0 % / 1 % (Soll ≤ 4 %).

<!-- items -->
## Items (Phase 4, Phase 6 nachgemessen)

> Erzeugt von `node tools/sim/items.mjs` (10 Etappen je Build, 24 zufällige Builds je Zeile; Rechenzeit 43 s).

Bot wie bei den Zielmarken; mit Salto-Items (ein Gyro-Item oder mindestens zwei andere Items mit Auslöser auf flip bzw. minCount) dreht er zusätzlich Rückwärtssaltos, wenn bis zur Landung > 1,7 s bleiben; ist Überhitzen folgenlos (Feuer-Set 6 Nachbrenner, Kühlschrank, Waschmaschine), boostet er ohne Hitze-Reserve bis zum Überhitzen. Gutes Loadout (Startteile Stufe 10), volle Haltbarkeit je Etappe, 40 Run-Schrauben. **Zufällig (6)** = 6 zufällige nicht verfluchte Items ★1 je Etappe (mittelmäßiger Build ohne Plan). Synergie-Builds = 6 Items eines Tags (Set 2/4/6) bzw. die Elektro-Ketten-Bauweise (Salto → Stromschlag → Gratis-Boost → Kühlung). Zellen: Median Distanz ÷ Ziel · geschafft (mind. Bronze).

| Akt | Art | Etage | ohne Items | zufällig (6) | Elektro-Kette | Raketen-Set 6 | Gyro-Set 6 | Feuer-Set 6 | Hydraulik-Set 6 |
|---|---|---|---|---|---|---|---|---|---|
| 1 🗑️ | Etappe | 0 | ×1,71 · 100 % | ×1,94 · 100 % | ×3,00 · 100 % | ×3,00 · 100 % | ×3,00 · 100 % | ×1,74 · 100 % | ×3,00 · 100 % |
| 1 🗑️ | Etappe | 3 | ×1,20 · 90 % | ×1,71 · 96 % | ×3,00 · 100 % | ×2,91 · 100 % | ×3,00 · 100 % | ×1,39 · 100 % | ×2,98 · 100 % |
| 1 🗑️ | Etappe | 5 | ×1,06 · 90 % | ×1,33 · 71 % | ×3,00 · 100 % | ×2,57 · 100 % | ×2,93 · 100 % | ×1,45 · 80 % | ×3,00 · 100 % |
| 1 🗑️ | Boss | – | ×0,80 · 40 % | ×1,04 · 54 % | ×1,46 · 80 % | ×1,80 · 100 % | ×2,25 · 80 % | ×1,34 · 100 % | ×3,00 · 100 % |
| 2 🏜️ | Etappe | 0 | ×0,96 · 40 % | ×1,16 · 71 % | ×1,57 · 100 % | ×1,78 · 100 % | ×1,50 · 90 % | ×1,26 · 70 % | ×1,63 · 90 % |
| 2 🏜️ | Etappe | 3 | ×0,88 · 40 % | ×1,14 · 54 % | ×1,75 · 100 % | ×1,96 · 100 % | ×3,00 · 90 % | ×1,45 · 80 % | ×1,57 · 100 % |
| 2 🏜️ | Etappe | 5 | ×0,67 · 0 % | ×0,94 · 42 % | ×1,19 · 80 % | ×1,41 · 90 % | ×1,48 · 80 % | ×1,31 · 90 % | ×1,27 · 70 % |
| 2 🏜️ | Boss | – | ×0,80 · 10 % | ×0,92 · 42 % | ×1,28 · 90 % | ×1,29 · 100 % | ×1,32 · 90 % | ×1,36 · 80 % | ×1,38 · 90 % |
| 3 ⛈️ | Etappe | 0 | ×0,95 · 30 % | ×0,94 · 46 % | ×1,22 · 100 % | ×1,80 · 100 % | ×1,31 · 80 % | ×0,93 · 50 % | ×1,40 · 80 % |
| 3 ⛈️ | Etappe | 3 | ×0,80 · 30 % | ×1,22 · 71 % | ×1,37 · 90 % | ×1,71 · 100 % | ×1,34 · 80 % | ×1,02 · 60 % | ×1,38 · 90 % |
| 3 ⛈️ | Etappe | 5 | ×0,74 · 0 % | ×0,88 · 29 % | ×1,35 · 90 % | ×1,35 · 100 % | ×1,34 · 80 % | ×1,01 · 50 % | ×1,16 · 60 % |
| 3 ⛈️ | Boss | – | ×0,63 · 0 % | ×0,72 · 17 % | ×0,99 · 50 % | ×1,14 · 90 % | ×0,88 · 20 % | ×0,93 · 20 % | ×1,02 · 60 % |

### Ganze Runs

16 Runs je Strategie mit derselben Bot-Fahrweise, gutem Loadout und allen Item-Pools (Wegwahl: Tankstelle, sonst normale Etappe; Tankstelle repariert unter 60 %). Strategie der Item-Auswahl: **ohne** = immer Schrauben, **zufällig** = irgendein Angebot, **Synergie** = Angebot, das den stärksten Tag ausbaut (gewichtet mit der Seltenheit).

| Auswahl | Sieg | Ende in Akt 1 | Akt 2 | Akt 3 | Abschleppen (Median) |
|---|---|---|---|---|---|
| ohne | 0 % | 38 % | 50 % | 13 % | 5 |
| zufällig | 13 % | 25 % | 44 % | 19 % | 4 |
| synergie | 25 % | 25 % | 50 % | 0 % | 3 |

### Einzel-Items (Phase 6)

Jedes Item allein (★1) gegen „ohne Items“ (Akt 2 + 3, Etage 2, je 10 Etappen). Grenzen für Ausreißer: Gewöhnlich +15 %, Selten +20 %, Episch +30 %, Legendär +100 %. Gyro-Items liegen allein im Minus, weil der Bot mit einem Gyro-Item Saltos dreht (die Saltos lohnen sich erst mit weiteren Salto-Items).

| Item | Seltenheit | Weite | Ausreißer |
|---|---|---|---|
| 🍽️ Schraubenschlucker-Vergaser | Legendär | +70 % | – |
| ⚛️ Mini-Teilchenbeschleuniger | Episch | +22 % | – |
| 🚘 Lowrider-Pumpe vom Cousin | Episch | +20 % | – |
| ♾️ Perpetuum Mobile | Legendär | +16 % | – |
| 🌙 Opas Mondrakete | Episch | +16 % | – |
| 🛟 Reservekanister | Gewöhnlich | +12 % | – |
| 🔱 Blitzableiter | Gewöhnlich | +10 % | – |
| ⛸️ Opas Schlittschuhkufen | Legendär | +9 % | – |
| ⚒️ Amboss vom Dorfschmied | Episch | +8 % | – |
| 🗜️ Stempel der Schrottpresse | Selten | +8 % | – |
| 🍿 Magnetron aus der Mikrowelle | Selten | +7 % | – |
| 🫙 Omas Bohnerwachs | Gewöhnlich | +7 % | – |
| 💺 Opas Bürodrehstuhl | Gewöhnlich | -12 % | – |
| 🧭 Opas Schiffskompass | Legendär | -12 % | – |
| 🛸 Levitron vom Flohmarkt | Legendär | -12 % | – |
| 📏 Wasserwaage aus dem Keller | Gewöhnlich | -13 % | – |

### Ergebnis

- Akt 1: ohne Items 93 %, zufällig 89 %, beste Synergie (Elektro-Kette) 100 % der Etappen geschafft (Etage 0/3/5); Boss: ohne 40 %, zufällig 54 %, beste Synergie 100 %.
- Akt 2: ohne Items 27 %, zufällig 56 %, beste Synergie (Raketen-Set 6) 97 % der Etappen geschafft (Etage 0/3/5); Boss: ohne 10 %, zufällig 42 %, beste Synergie 100 %.
- Akt 3: ohne Items 20 %, zufällig 49 %, beste Synergie (Raketen-Set 6) 100 % der Etappen geschafft (Etage 0/3/5); Boss: ohne 0 %, zufällig 17 %, beste Synergie 90 %.
- Ganze Runs: ohne Items 0 % Siege (100 % scheitern), zufällige Builds scheitern zu 63 % in Akt 2–3 (25 % in Akt 1, 13 % Siege), Synergie-Auswahl 25 % Siege bei 3 statt 4 Abschlepp-Vorgängen (Median).

<!-- progression -->
## Progression & Ökonomie (Phase 6, mit Paket A nachgemessen)

> Erzeugt von `node tools/sim/progression.mjs` (8 Karrieren, Modell vom 2026-10-20 mit 16 Etappen je Zelle; Rechenzeit 10 s). Modell neu messen: `--fit`.

**Verfahren.** Der Bot misst je Akt, Knotenart/Etage und Slot-Stufe 0/3/5/8/10 (alle Slots) die Weite ÷ Ziel (log-normal), Schaden, Schrauben, Schrott und Item-Kisten; dazu die Wirkung von Items (zufällige Builds mit 2/4/6 Items, 4 Items je Seltenheit, Set-Builds 2/4/6 eines Tags) und der Schrottstufen-Physik. Die Karriere läuft mit der echten Run-Logik (Karte, Händler, Werkbank, Ereignisse, Schatz, Tankstelle, Item-Auswahl mit Synergie-Strategie, Belohnungen, Schrottstufen); nur das Etappen-Ergebnis wird aus dem Modell gewürfelt. Zwischen den Runs: Forschung (billigste zuerst), Chassis sobald bezahlbar, dann die billigste Slot-Verbesserung. Nach dem ersten Sieg spielt die Person immer die höchste freigeschaltete Schrottstufe. Paket A: verfehlte Etappen enden mit Notlandung (die Person nimmt nie „Nochmal“), jeder Neuversuch hat eine neue Strecke (eigene Streuung).

**Annahmen:** Etappe 45 s (Neuversuch 35 s; in den ersten 3 Runs + 15 s für Hinweise), Item-Auswahl 10 s, Händler 35 s, Ereignis 30 s, Werkbank 30 s, Schatz/Tankstelle 15 s, Garage 30 s + 3 s je Kauf, Run-Ende 25 s. Einarbeitung: Weite × 0,88 am Anfang, nach ≈ 1,5 h zu 63 % aufgeholt (Bot-Niveau).

| Meilenstein | Ziel (V2-DESIGN §8) | Median | Spanne | im Korridor |
|---|---|---|---|---|
| Erster Run | 8 min–15 min | 9 min | 8 min – 10 min (8/8) | ✔ |
| Erster Akt-1-Boss besiegt | 0,50 h–1,0 h | 0,70 h | 0,29 h – 1,6 h (8/8) | ✔ |
| Erster Run-Sieg | 3,0 h–5,0 h | 2,6 h | 0,87 h – 3,4 h (8/8) | ✗ |
| Alle Chassis | 15,0 h–25,0 h | 17,8 h | 12,4 h – 26,7 h (8/8) | ✔ |
| Sieg auf Schrottstufe 5 | – | 10,7 h | 8,1 h – 12,7 h (8/8) | – |
| Sieg auf Schrottstufe 10 | – | 27,4 h | 14,8 h – 41,5 h (8/8) | – |
| Alles inkl. Schrottstufe 15 | 30,0 h–50,0 h | 47,9 h | 25,8 h – 62,8 h (8/8) | ✔ |

- Erster Run: endet in 8/8 Karrieren in Akt 1–2 (Akte: 1, 1, 1, 1, 1, 1, 1, 1).
- Runs bis Schrottstufe 15: Median 237.5, Siege 16, Etappen 2332; am Ende Ø Slot-Stufe 10,0, 9/9 Chassis, 774546 ⚙ übrig (Senken: Lackierungen ≈ 103.000 ⚙, weitere Teile und deren Stufen – kauft die simulierte Person nicht).

**Schlechter Run mit voller Meta** (alle Slots Stufe 10, ganzer Forschungsbaum, Modell ohne Einarbeitung):

| Items | Sieg | Ende Akt 1 | Akt 2 | Akt 3 |
|---|---|---|---|---|
| keine (immer Schrauben, keine Shops) | 0 % | 100 % | 0 % | 0 % |
| 6 zufällige Gewöhnliche, kein Plan | 0 % | 74 % | 23 % | 4 % |

Regel „ein schlechter Run muss auch mit voller Meta scheitern können“ (Sieg < 30 %): ✔ erfüllt.

**Mit dem Simulator nachgezogen (Phase 6)** – mit den Werten aus Phase 5 lag der erste Akt-1-Boss bei 0,3–1,0 h, der erste Sieg bei 2,8–6,7 h, Schrottstufe 15 bei ≈ 20–24 h (Median je 3–16 Karrieren), und „alle Chassis“ wurde nie erreicht (30 💠 Kosten, ≈ 20 💠 bis Schrottstufe 15):

| Wert | vorher | jetzt | Wirkung |
|---|---|---|---|
| Akt-1-Boss-Ziel (`biomes.js`) | 510 m | 570 m (×1,12) | erster Akt-1-Boss in den Korridor 1–2 h |
| Akt-2-Ziele / Boss | 490–570 / 625 m | 520–605 / 660 m (×1,06) | erster Sieg in den Korridor 6–10 h |
| Akt-3-Ziele / Boss | 560–665 / 730 m | 565–670 / 740 m (×1,01) | Zwischenstand ×1,1 machte Schrottstufe 15 zu langsam (> 50 h) – fast zurückgenommen |
| `GARAGE.chassisCoreMul` (neu) | – (2–6 💠, Σ 30) | 0,4 (1–2 💠, Σ 12) | alle Chassis ≈ 25 h statt nie |
| Einzel-Items (Bot-Ausreißer) | Nadeldose, Blitzableiter, Perpetuum Mobile, Schraubenvergaser | siehe PHASEN.md Phase 6 | ohne Items mit voller Meta gewann der Bot vorher ≈ 12 % der Runs allein mit der Nadeldose als Start-Item |

Unverändert geprüft (Phase 6): Kerne je Sieg (1) – 2 Kerne je Sieg machten Kerne inflationär.

**Paket A (docs/OVERHAUL.md „Umsetzungsstand Paket A“)** – jeder Versuch zahlt, Notlandung statt identischem Neuversuch, Boss-Neuversuch mit neuer Variante und −5 % Ziel, Slot-Stufen 0–10 (60 × 1,32^L), schnellere Etappen (SIM.sec 75 → 45 s). Damit wurden Runs deutlich ergiebiger und leichter; ohne Gegengewicht lagen erster Sieg bei ≈ 1,8 h und Schrottstufe 15 bei ≈ 17 h (6 Karrieren). Nachgezogen:

| Wert | vorher | jetzt | Wirkung |
|---|---|---|---|
| `RESEARCH.costMul` | 1 | 1,5 | viel mehr Blaupausen (Gold-Chance, Boss-Begegnung, Elite 2) – der Baum wäre nach ≈ 10 h fertig |
| Schrottstufe 2 `targetMul` / 7 `bossTargetMul` | 1,08 / 1,15 | 1,12 / 1,22 | Langzeitkurve: Schrottstufe 15 wieder 30–50 h |
| Akt-3-Boss-Ziel (`biomes.js`) | 740 m | 830 m | erster Sieg ≈ 3 h statt ≈ 2 h (Boss-Neuversuche werden bis −15 % leichter) |
| Zielkorridore (`PROGRESSION.targets`) | erster Run 10–15 min, Akt-1-Boss 1–2 h, Sieg 6–10 h, alle Chassis 20–30 h | 8–15 min, 0,5–1 h, 3–5 h, 15–25 h | Ziele aus OVERHAUL §5/§6 (Paket A: erster Boss ≤ 45 min; Gesamtbild: Sieg 3–5 h); Schrottstufe 15 bleibt 30–50 h |


<!-- paket-a -->
## Paket A – geänderte Zahlen (`data/balance.js`, Stand 20.10.2026)

Herleitung und Messwerte: `docs/OVERHAUL.md` → „Umsetzungsstand Paket A“.

| Wert | v1.0 | Paket A |
|---|---|---|
| Belohnung je Etappe | Schrott nur mit Medaille: 14/24/36 ⚙ × Medaille × Art | `REWARDS.scrapPerM` 0,12/0,16/0,22 ⚙ je m × `gradeMul` (verfehlt 0,5 · Bronze 1 · Silber 1,25 · Gold 1,5 · Platin 2 · Schrottkönig 3), `scrapKindMul` 1/1/1 |
| Platin / Schrottkönig | – | Gold × 1,5 / Gold × 2 (`REWARDS.gradeMarks`, = Ende „far“) |
| Kombo | ohne Wirkung | 1 🔩 je 15, 1 ⚙ je 40 gesicherte Punkte (`KOMBO.boltsPer/scrapPer`) |
| Blaupausen | Elite 1, Boss 3/4/5 | Elite 2, Boss 3/4/5, verlorene Boss-Begegnung 1, Gold+ 25 % |
| Auszahlung | am Run-Ende | sofort (Schrauben-Rest × 10 % am Run-Ende) |
| Verfehlt | Abschleppen −15 %, gleiche Strecke | Notlandung −10 % + Trostkiste 10/14/18 🔩 oder Nochmal −15 % (neue Strecke); Schrauben × 0,5 |
| Boss verfehlt | gleiche Strecke | neue Variante, Ziel −5 % je Neuversuch (max. 3×) |
| Vorspulen | – | `STAGE.fastForward` ×4 ab 0,8 s am Boden, Knapp-Ende 1 s, Hochgerechnet 0,4 s |
| Teile-Stufen | 0–20 je Teil, Basis × 1,15^L, `dimDivisor` 30 | 0–10 je Slot, 60 × 1,32^L (Σ 2.824 ⚙), Wirkung × 2, `dimDivisor` 15 |
| `RESEARCH.costMul` | 1 | 1,5 |
| Schrottstufe 2 / 7 | Ziele × 1,08 / Boss × 1,15 | × 1,12 / × 1,22 |
| Akt-3-Boss | 740 m | 830 m |
| `FX.resultDelay` | 0,7 s | 0,5 s (nach Sofort-Ende 15 %) |
| Tutorial | 10 Hinweise | 6 |
| Simulator `SIM.sec` | Etappe 75 s / Neuversuch 55 s | 45 s / 35 s |

## Leistung (Phase 7)

Gemessen in der Testumgebung: Chromium headless mit Software-WebGL (SwiftShader), 412 × 915, Testfahrt je Biom mit
Seed 3, Abschuss 80 %, Werte aus `renderer.info` (Dev-Menü „📈 Leistungsanzeige“ bzw. `window.__game.perf()`).
Bilder/s sind wegen der Software-Darstellung nur relativ aussagekräftig; Draw Calls, Dreiecke und Allokationen sind
geräteunabhängig.

| Szene | Draw Calls (inkl. Schattenpass) | Dreiecke | Geometrien | Shader-Programme |
|---|---|---|---|---|
| Garage | 9 | 5.900 | 8 (vorher 21) | 4 (vorher 9) |
| Schrottplatz Zielen / Flug | 15 / 11 | 9.900 / 10.500 | 13 (vorher 24) | 7 (vorher 10) |
| Glutwüste Zielen / Flug | 16 / 13 | 10.100 / 11.400 | 14 | 8 |
| Gewittersteppe Zielen / Flug | 17 / 13 | 13.200 / 13.800 | 15 | 8 |

| Messung (Flug, 4 s) | vor Phase 7 | nach Phase 7 |
|---|---|---|
| Bilder in 4 s (Software-Darstellung, Schrottplatz) | 30–38 | 68 |
| JS-Heap-Zuwachs je Bild (Summe positiver Sprünge, 3 Biome) | 95–133 KB | 37–66 KB |
| Allokationen gesamt (Heap-Sampling, 4 s Boost-Flug) | 11,2 MB | 4,5 MB (bei doppelt so vielen Bildern) |
| Shader-Neuauswahl (`getParameters`) je Bild | ≈ 3 | 0 |

Ursachen und Maßnahmen: durchsichtige beidseitige Materialien (Aufwind, Felder) → `forceSinglePass`; instanzierte
Schattenwerfer → eigenes Tiefen-Material; leere InstancedMeshes → unsichtbar; HUD/Ton/Objekt-Darstellung ohne
Objekte/Closures pro Bild; Indexschleifen in Physik und Darstellung; Gelände-Stücke über `GeoBuilder` (gemeinsamer
Puffer statt geklonter Teil-Geometrien und Zwischen-Arrays); Kollision mit x-Vorauswahl. Der Rest der Allokationen
entsteht in three.js (Uniform-Kopien, Matrizen) und beim Nachladen von Gelände-Stücken (≈ alle 96 m).

Grafikqualität: Niedrig = Pixel-Ratio 1, Mittel = 1,5 (Standard, wie bisher), Hoch = 2 (jeweils höchstens die
des Geräts); Schatten getrennt abschaltbar. Ziel 60 Bilder/s auf Mittelklasse-Handys ist am Gerät zu prüfen.
