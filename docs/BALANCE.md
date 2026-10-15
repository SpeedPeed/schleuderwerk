# Schleuderwerk 2 – Balance (Zielmarken)

> Erzeugt von `node tools/sim/calibrate.mjs` (30 Etappen je Zeile, Elite 15; Rechenzeit 17 s). Nicht von Hand bearbeiten – neu erzeugen.

## Verfahren

- Ein Bot (`tools/sim/bot.mjs`) spielt headless mit der echten Etappen-Logik (`stage/stage.js`, Strecke aus `physics/trackGen.js`): Abschuss meist im grünen Bereich (60 %), Winkel 30–42°, richtet die Kiste vor jeder Landung aus, boostet in der Luft nach vorn (Reserve 35 % Treibstoff, Hitze < 72 %), nimmt vor Schluchten Anlauf, springt mit dem Hüpfer über Hindernisse, geschlossene Pressen und an Schluchtkanten, gibt bei Blitzwarnungen Gas. Ohne Items – ihre Wirkung misst `tools/sim/items.mjs` (Abschnitt „Items“ unten).
- **Start-Loadout** = neuer Spielstand (Seifenkiste, Startteile Stufe 0, Boost + Hüpfer). **Gutes Loadout** = dieselben Startteile auf Stufe 10.
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
| Gewittersteppe (Akt 3) | 565 · 570 · 615 · 615 · 650 · 670 | ×1,30 | 740 | ×1,25 / ×1,50 |

## Messung

Verhältnis = Distanz ÷ Zielmarke (Median, in Klammern 25.–75. Perzentil). „Geschafft“ = mindestens Bronze. Schaden = Median des Haltbarkeitsverlusts einer Etappe.

### Schrottplatz (Akt 1)

| Art | Etage | Loadout | Ziel | Median | Verhältnis | geschafft | Gold | Schaden | Sturz | Dauer |
|---|---|---|---|---|---|---|---|---|---|---|
| Etappe | 0 | start | 330 m | 423 m | ×1,28 (1,18–1,37) | 100 % | 13 % | 0 % | 0 % | 20 s |
| Etappe | 1 | start | 355 m | 437 m | ×1,23 (1,10–1,38) | 97 % | 17 % | 1 % | 7 % | 20 s |
| Etappe | 2 | start | 355 m | 421 m | ×1,19 (1,10–1,45) | 97 % | 20 % | 5 % | 0 % | 20 s |
| Etappe | 3 | start | 410 m | 431 m | ×1,05 (0,89–1,18) | 60 % | 0 % | 4 % | 0 % | 21 s |
| Etappe | 4 | start | 425 m | 422 m | ×0,99 (0,85–1,18) | 50 % | 3 % | 5 % | 0 % | 21 s |
| Etappe | 5 | start | 445 m | 417 m | ×0,94 (0,83–1,00) | 27 % | 0 % | 5 % | 0 % | 21 s |
| Elite | 2 | start | 460 m | 388 m | ×0,84 (0,78–0,95) | 20 % | 0 % | 5 % | 7 % | 18 s |
| Elite | 3 | start | 535 m | 419 m | ×0,78 (0,69–0,93) | 7 % | 0 % | 2 % | 0 % | 21 s |
| Elite | 4 | start | 555 m | 383 m | ×0,69 (0,65–0,75) | 0 % | 0 % | 6 % | 7 % | 19 s |
| Elite | 5 | start | 580 m | 396 m | ×0,68 (0,64–0,73) | 7 % | 0 % | 5 % | 0 % | 20 s |
| Boss | – | start | 570 m | 437 m | ×0,77 (0,60–0,83) | 7 % | 0 % | 10 % | 0 % | 20 s |
| Etappe | 0 | gut | 330 m | 501 m | ×1,52 (1,43–1,60) | 100 % | 53 % | 1 % | 0 % | 23 s |
| Etappe | 1 | gut | 355 m | 499 m | ×1,41 (1,27–1,56) | 100 % | 30 % | 2 % | 3 % | 22 s |
| Etappe | 2 | gut | 355 m | 501 m | ×1,41 (1,25–1,68) | 100 % | 40 % | 5 % | 0 % | 24 s |
| Etappe | 3 | gut | 410 m | 497 m | ×1,21 (1,12–1,34) | 90 % | 7 % | 5 % | 0 % | 23 s |
| Etappe | 4 | gut | 425 m | 494 m | ×1,16 (1,01–1,27) | 80 % | 7 % | 5 % | 0 % | 22 s |
| Etappe | 5 | gut | 445 m | 459 m | ×1,03 (0,99–1,15) | 70 % | 7 % | 6 % | 0 % | 22 s |
| Elite | 2 | gut | 460 m | 437 m | ×0,95 (0,84–1,01) | 27 % | 0 % | 9 % | 0 % | 20 s |
| Elite | 3 | gut | 535 m | 463 m | ×0,87 (0,78–1,04) | 40 % | 0 % | 8 % | 13 % | 23 s |
| Elite | 4 | gut | 555 m | 477 m | ×0,86 (0,75–0,92) | 20 % | 0 % | 7 % | 0 % | 23 s |
| Elite | 5 | gut | 580 m | 457 m | ×0,79 (0,72–0,99) | 20 % | 0 % | 5 % | 0 % | 23 s |
| Boss | – | gut | 570 m | 476 m | ×0,83 (0,76–0,95) | 23 % | 0 % | 9 % | 0 % | 21 s |

### Glutwüste (Akt 2)

| Art | Etage | Loadout | Ziel | Median | Verhältnis | geschafft | Gold | Schaden | Sturz | Dauer |
|---|---|---|---|---|---|---|---|---|---|---|
| Etappe | 0 | start | 520 m | 426 m | ×0,82 (0,71–0,97) | 17 % | 0 % | 4 % | 3 % | 20 s |
| Etappe | 1 | start | 555 m | 428 m | ×0,77 (0,62–0,93) | 13 % | 0 % | 1 % | 0 % | 19 s |
| Etappe | 2 | start | 555 m | 425 m | ×0,76 (0,68–0,94) | 17 % | 3 % | 0 % | 3 % | 20 s |
| Etappe | 3 | start | 560 m | 422 m | ×0,75 (0,67–0,88) | 17 % | 0 % | 5 % | 7 % | 20 s |
| Etappe | 4 | start | 585 m | 393 m | ×0,67 (0,58–0,78) | 3 % | 0 % | 2 % | 0 % | 21 s |
| Etappe | 5 | start | 605 m | 400 m | ×0,66 (0,58–0,78) | 10 % | 0 % | 3 % | 3 % | 19 s |
| Elite | 2 | start | 720 m | 381 m | ×0,53 (0,46–0,62) | 0 % | 0 % | 1 % | 0 % | 20 s |
| Elite | 3 | start | 730 m | 444 m | ×0,61 (0,54–0,65) | 7 % | 0 % | 0 % | 0 % | 20 s |
| Elite | 4 | start | 760 m | 409 m | ×0,54 (0,46–0,68) | 7 % | 0 % | 0 % | 0 % | 19 s |
| Elite | 5 | start | 785 m | 421 m | ×0,54 (0,44–0,61) | 0 % | 0 % | 1 % | 0 % | 21 s |
| Boss | – | start | 660 m | 422 m | ×0,64 (0,55–0,73) | 0 % | 0 % | 5 % | 7 % | 19 s |
| Etappe | 0 | gut | 520 m | 487 m | ×0,94 (0,83–1,13) | 33 % | 3 % | 5 % | 7 % | 22 s |
| Etappe | 1 | gut | 555 m | 487 m | ×0,88 (0,72–1,06) | 37 % | 0 % | 2 % | 0 % | 22 s |
| Etappe | 2 | gut | 555 m | 483 m | ×0,87 (0,78–1,07) | 30 % | 3 % | 1 % | 0 % | 21 s |
| Etappe | 3 | gut | 560 m | 499 m | ×0,89 (0,80–1,07) | 30 % | 0 % | 5 % | 7 % | 22 s |
| Etappe | 4 | gut | 585 m | 470 m | ×0,80 (0,68–0,88) | 17 % | 3 % | 5 % | 0 % | 22 s |
| Etappe | 5 | gut | 605 m | 474 m | ×0,78 (0,66–0,86) | 10 % | 0 % | 4 % | 0 % | 22 s |
| Elite | 2 | gut | 720 m | 458 m | ×0,64 (0,53–0,75) | 0 % | 0 % | 5 % | 7 % | 22 s |
| Elite | 3 | gut | 730 m | 488 m | ×0,67 (0,63–0,81) | 0 % | 0 % | 5 % | 7 % | 23 s |
| Elite | 4 | gut | 760 m | 475 m | ×0,63 (0,57–0,80) | 0 % | 0 % | 1 % | 0 % | 25 s |
| Elite | 5 | gut | 785 m | 482 m | ×0,61 (0,48–0,71) | 0 % | 0 % | 5 % | 7 % | 21 s |
| Boss | – | gut | 660 m | 465 m | ×0,70 (0,61–0,82) | 0 % | 0 % | 6 % | 10 % | 22 s |

### Gewittersteppe (Akt 3)

| Art | Etage | Loadout | Ziel | Median | Verhältnis | geschafft | Gold | Schaden | Sturz | Dauer |
|---|---|---|---|---|---|---|---|---|---|---|
| Etappe | 0 | start | 565 m | 425 m | ×0,75 (0,69–0,80) | 0 % | 0 % | 0 % | 0 % | 20 s |
| Etappe | 1 | start | 570 m | 405 m | ×0,71 (0,66–0,78) | 0 % | 0 % | 0 % | 0 % | 20 s |
| Etappe | 2 | start | 615 m | 418 m | ×0,68 (0,62–0,73) | 0 % | 0 % | 1 % | 0 % | 20 s |
| Etappe | 3 | start | 615 m | 397 m | ×0,64 (0,58–0,67) | 3 % | 0 % | 1 % | 3 % | 20 s |
| Etappe | 4 | start | 650 m | 409 m | ×0,63 (0,55–0,74) | 0 % | 0 % | 1 % | 0 % | 21 s |
| Etappe | 5 | start | 670 m | 411 m | ×0,61 (0,55–0,72) | 0 % | 0 % | 3 % | 7 % | 20 s |
| Elite | 2 | start | 800 m | 442 m | ×0,55 (0,50–0,57) | 0 % | 0 % | 0 % | 0 % | 20 s |
| Elite | 3 | start | 800 m | 418 m | ×0,52 (0,46–0,56) | 0 % | 0 % | 1 % | 0 % | 20 s |
| Elite | 4 | start | 845 m | 390 m | ×0,46 (0,42–0,52) | 0 % | 0 % | 5 % | 0 % | 19 s |
| Elite | 5 | start | 870 m | 462 m | ×0,53 (0,45–0,60) | 0 % | 0 % | 1 % | 7 % | 22 s |
| Boss | – | start | 740 m | 389 m | ×0,52 (0,49–0,59) | 0 % | 0 % | 9 % | 0 % | 19 s |
| Etappe | 0 | gut | 565 m | 499 m | ×0,88 (0,79–0,95) | 20 % | 0 % | 2 % | 0 % | 23 s |
| Etappe | 1 | gut | 570 m | 451 m | ×0,79 (0,75–0,91) | 10 % | 0 % | 3 % | 0 % | 22 s |
| Etappe | 2 | gut | 615 m | 482 m | ×0,78 (0,73–0,83) | 0 % | 0 % | 1 % | 0 % | 21 s |
| Etappe | 3 | gut | 615 m | 471 m | ×0,77 (0,71–0,83) | 7 % | 0 % | 5 % | 10 % | 22 s |
| Etappe | 4 | gut | 650 m | 466 m | ×0,72 (0,62–0,88) | 0 % | 0 % | 3 % | 0 % | 22 s |
| Etappe | 5 | gut | 670 m | 478 m | ×0,71 (0,65–0,84) | 3 % | 0 % | 4 % | 3 % | 23 s |
| Elite | 2 | gut | 800 m | 498 m | ×0,62 (0,58–0,66) | 0 % | 0 % | 2 % | 0 % | 22 s |
| Elite | 3 | gut | 800 m | 485 m | ×0,61 (0,53–0,66) | 0 % | 0 % | 6 % | 7 % | 23 s |
| Elite | 4 | gut | 845 m | 478 m | ×0,57 (0,52–0,70) | 0 % | 0 % | 5 % | 0 % | 23 s |
| Elite | 5 | gut | 870 m | 502 m | ×0,58 (0,52–0,67) | 0 % | 0 % | 5 % | 7 % | 21 s |
| Boss | – | gut | 740 m | 441 m | ×0,60 (0,55–0,67) | 0 % | 0 % | 6 % | 0 % | 21 s |

## Prüfpunkte

- Start-Loadout, Akt 1, Etage 0: Median ×1,28 (Soll ≈ 1,3).
- Start-Loadout, Akt-1-Boss: Median ×0,77 (Soll ≈ 0,71 – braucht Items/Upgrades).
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
## Progression & Ökonomie (Phase 6)

> Erzeugt von `node tools/sim/progression.mjs` (16 Karrieren, Modell vom 2026-10-15 mit 24 Etappen je Zelle; Rechenzeit 19 s). Modell neu messen: `--fit`.

**Verfahren.** Der Bot misst je Akt, Knotenart/Etage und Teile-Stufe 0/5/10/15/20 die Weite ÷ Ziel (log-normal), Schaden, Schrauben, Schrott und Item-Kisten; dazu die Wirkung von Items (zufällige Builds mit 2/4/6 Items, 4 Items je Seltenheit, Set-Builds 2/4/6 eines Tags) und der Schrottstufen-Physik. Die Karriere läuft mit der echten Run-Logik (Karte, Händler, Werkbank, Ereignisse, Schatz, Tankstelle, Item-Auswahl mit Synergie-Strategie, Belohnungen, Schrottstufen); nur das Etappen-Ergebnis wird aus dem Modell gewürfelt. Zwischen den Runs: Forschung (billigste zuerst), Chassis sobald bezahlbar, dann die billigste Teile-Verbesserung. Nach dem ersten Sieg spielt die Person immer die höchste freigeschaltete Schrottstufe.

**Annahmen:** Etappe 75 s (Neuversuch 55 s; in den ersten 3 Runs + 15 s für Hinweise), Item-Auswahl 10 s, Händler 35 s, Ereignis 30 s, Werkbank 30 s, Schatz/Tankstelle 15 s, Garage 30 s + 3 s je Kauf, Run-Ende 25 s. Einarbeitung: Weite × 0,88 am Anfang, nach ≈ 1,5 h zu 63 % aufgeholt (Bot-Niveau).

| Meilenstein | Ziel (V2-DESIGN §8) | Median | Spanne | im Korridor |
|---|---|---|---|---|
| Erster Run | 10 min–15 min | 12 min | 10 min – 17 min (16/16) | ✔ |
| Erster Akt-1-Boss besiegt | 1,0 h–2,0 h | 1,2 h | 0,36 h – 2,6 h (16/16) | ✔ |
| Erster Run-Sieg | 6,0 h–10,0 h | 8,2 h | 5,4 h – 12,4 h (16/16) | ✔ |
| Alle Chassis | 20,0 h–30,0 h | 25,4 h | 20,1 h – 34,2 h (16/16) | ✔ |
| Sieg auf Schrottstufe 5 | – | 21,0 h | 17,4 h – 26,4 h (16/16) | – |
| Sieg auf Schrottstufe 10 | – | 28,9 h | 23,1 h – 41,0 h (16/16) | – |
| Alles inkl. Schrottstufe 15 | 30,0 h–50,0 h | 45,5 h | 34,0 h – 69,6 h (16/16) | ✔ |

- Erster Run: endet in 16/16 Karrieren in Akt 1–2 (Akte: 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1).
- Runs bis Schrottstufe 15: Median 199, Siege 16, Etappen 1692; am Ende Teile-Stufe 20,0, 9/9 Chassis, 58319 ⚙ übrig (Senken: Lackierungen ≈ 103.000 ⚙, weitere Teile und deren Stufen – kauft die simulierte Person nicht).

**Schlechter Run mit voller Meta** (alle Startteile Stufe 20, ganzer Forschungsbaum, Modell ohne Einarbeitung):

| Items | Sieg | Ende Akt 1 | Akt 2 | Akt 3 |
|---|---|---|---|---|
| keine (immer Schrauben, keine Shops) | 0 % | 43 % | 55 % | 2 % |
| 6 zufällige Gewöhnliche, kein Plan | 2 % | 28 % | 56 % | 14 % |
| keine – echter Bot, ganze Runs (40) | 5 % | 28 % | 48 % | 20 % |

Regel „ein schlechter Run muss auch mit voller Meta scheitern können“ (Sieg < 30 %): ✔ erfüllt.

**Mit dem Simulator nachgezogen (Phase 6)** – mit den Werten aus Phase 5 lag der erste Akt-1-Boss bei 0,3–1,0 h, der erste Sieg bei 2,8–6,7 h, Schrottstufe 15 bei ≈ 20–24 h (Median je 3–16 Karrieren), und „alle Chassis“ wurde nie erreicht (30 💠 Kosten, ≈ 20 💠 bis Schrottstufe 15):

| Wert | vorher | jetzt | Wirkung |
|---|---|---|---|
| Akt-1-Boss-Ziel (`biomes.js`) | 510 m | 570 m (×1,12) | erster Akt-1-Boss in den Korridor 1–2 h |
| Akt-2-Ziele / Boss | 490–570 / 625 m | 520–605 / 660 m (×1,06) | erster Sieg in den Korridor 6–10 h |
| Akt-3-Ziele / Boss | 560–665 / 730 m | 565–670 / 740 m (×1,01) | Zwischenstand ×1,1 machte Schrottstufe 15 zu langsam (> 50 h) – fast zurückgenommen |
| `GARAGE.chassisCoreMul` (neu) | – (2–6 💠, Σ 30) | 0,4 (1–2 💠, Σ 12) | alle Chassis ≈ 25 h statt nie |
| Einzel-Items (Bot-Ausreißer) | Nadeldose, Blitzableiter, Perpetuum Mobile, Schraubenvergaser | siehe PHASEN.md Phase 6 | ohne Items mit voller Meta gewann der Bot vorher ≈ 12 % der Runs allein mit der Nadeldose als Start-Item |

Unverändert geprüft: Belohnungen (`REWARDS`), Teile-Kosten (`GARAGE.costGrowth` 1,15, Basis 40), Forschungskosten (`RESEARCH.costMul` 1), Kerne je Sieg (1) – Varianten mit teureren Teilen (Basis 60) oder 2 Kernen je Sieg verschoben die Zeiten weniger zielgenau bzw. machten Kerne inflationär.
