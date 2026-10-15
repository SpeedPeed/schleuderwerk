# Schleuderwerk 2 – Balance (Zielmarken)

> Erzeugt von `node tools/sim/calibrate.mjs` (30 Etappen je Zeile, Elite 15; Rechenzeit 20 s). Nicht von Hand bearbeiten – neu erzeugen.

## Verfahren

- Ein Bot (`tools/sim/bot.mjs`) spielt headless mit der echten Etappen-Logik (`stage/stage.js`, Strecke aus `physics/trackGen.js`): Abschuss meist im grünen Bereich (60 %), Winkel 30–42°, richtet die Kiste vor jeder Landung aus, boostet in der Luft nach vorn (Reserve 35 % Treibstoff, Hitze < 72 %), nimmt vor Schluchten Anlauf, springt mit dem Hüpfer über Hindernisse, geschlossene Pressen und an Schluchtkanten, gibt bei Blitzwarnungen Gas. Ohne Items – ihre Wirkung misst `tools/sim/items.mjs` (Abschnitt „Items“ unten).
- **Start-Loadout** = neuer Spielstand (Seifenkiste, Startteile Stufe 0, Boost + Hüpfer). **Gutes Loadout** = dieselben Startteile auf Stufe 10.
- Jede Etappe beginnt mit voller Haltbarkeit (Schaden = Anteil der max. Haltbarkeit in dieser einen Etappe).
- Zielmarken je Etage = Median-Distanz ÷ Soll-Verhältnis (linear von Etage 0 bis 5), danach innerhalb eines Akts nie fallend, Boss ≥ 1,1 × Etage 5, auf 5 m gerundet. Mehrere Durchgänge, weil die Bausteine bis zur Gold-Marke verteilt werden.

| Akt | Kalibriert mit | Etage 0 | Etage 5 | Boss |
|---|---|---|---|---|
| 1 | Start-Loadout | ×1,30 | ×0,92 | ×0,80 |
| 2 | gutem Loadout | ×1,00 | ×0,85 | ×0,75 |
| 3 | gutem Loadout | ×0,85 | ×0,72 | ×0,65 |

## Zielmarken (data/biomes.js)

| Biom | Etage 0–5 (Bronze, m) | Elite | Boss | Silber / Gold |
|---|---|---|---|---|
| Schrottplatz (Akt 1) | 330 · 355 · 355 · 410 · 425 · 445 | ×1,30 | 510 | ×1,25 / ×1,50 |
| Glutwüste (Akt 2) | 490 · 525 · 525 · 530 · 550 · 570 | ×1,30 | 625 | ×1,25 / ×1,50 |
| Gewittersteppe (Akt 3) | 560 · 565 · 610 · 610 · 640 · 665 | ×1,30 | 730 | ×1,25 / ×1,50 |

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
| Boss | – | start | 510 m | 412 m | ×0,81 (0,70–0,90) | 17 % | 0 % | 10 % | 0 % | 19 s |
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
| Boss | – | gut | 510 m | 502 m | ×0,98 (0,80–1,15) | 50 % | 0 % | 6 % | 0 % | 23 s |

### Glutwüste (Akt 2)

| Art | Etage | Loadout | Ziel | Median | Verhältnis | geschafft | Gold | Schaden | Sturz | Dauer |
|---|---|---|---|---|---|---|---|---|---|---|
| Etappe | 0 | start | 490 m | 415 m | ×0,85 (0,77–1,07) | 33 % | 3 % | 2 % | 0 % | 20 s |
| Etappe | 1 | start | 525 m | 427 m | ×0,81 (0,65–0,99) | 23 % | 0 % | 1 % | 3 % | 19 s |
| Etappe | 2 | start | 525 m | 423 m | ×0,81 (0,72–1,01) | 27 % | 0 % | 1 % | 0 % | 20 s |
| Etappe | 3 | start | 530 m | 424 m | ×0,80 (0,69–0,94) | 20 % | 0 % | 5 % | 7 % | 20 s |
| Etappe | 4 | start | 550 m | 375 m | ×0,68 (0,63–0,85) | 0 % | 0 % | 3 % | 0 % | 21 s |
| Etappe | 5 | start | 570 m | 402 m | ×0,71 (0,61–0,91) | 7 % | 0 % | 5 % | 0 % | 20 s |
| Elite | 2 | start | 685 m | 369 m | ×0,54 (0,48–0,67) | 0 % | 0 % | 1 % | 0 % | 19 s |
| Elite | 3 | start | 690 m | 417 m | ×0,60 (0,57–0,69) | 7 % | 0 % | 1 % | 0 % | 21 s |
| Elite | 4 | start | 715 m | 418 m | ×0,58 (0,52–0,76) | 13 % | 0 % | 1 % | 0 % | 22 s |
| Elite | 5 | start | 740 m | 423 m | ×0,57 (0,46–0,64) | 0 % | 0 % | 5 % | 0 % | 21 s |
| Boss | – | start | 625 m | 425 m | ×0,68 (0,55–0,77) | 3 % | 0 % | 5 % | 7 % | 19 s |
| Etappe | 0 | gut | 490 m | 496 m | ×1,01 (0,89–1,22) | 60 % | 7 % | 2 % | 0 % | 24 s |
| Etappe | 1 | gut | 525 m | 482 m | ×0,92 (0,78–1,24) | 40 % | 7 % | 3 % | 0 % | 22 s |
| Etappe | 2 | gut | 525 m | 471 m | ×0,90 (0,82–1,12) | 37 % | 3 % | 2 % | 3 % | 21 s |
| Etappe | 3 | gut | 530 m | 489 m | ×0,92 (0,79–1,01) | 27 % | 3 % | 5 % | 3 % | 22 s |
| Etappe | 4 | gut | 550 m | 447 m | ×0,81 (0,72–0,95) | 17 % | 3 % | 5 % | 3 % | 22 s |
| Etappe | 5 | gut | 570 m | 485 m | ×0,85 (0,70–0,98) | 20 % | 0 % | 5 % | 3 % | 23 s |
| Elite | 2 | gut | 685 m | 443 m | ×0,65 (0,56–0,79) | 0 % | 0 % | 6 % | 13 % | 21 s |
| Elite | 3 | gut | 690 m | 493 m | ×0,71 (0,66–0,83) | 7 % | 0 % | 5 % | 7 % | 23 s |
| Elite | 4 | gut | 715 m | 468 m | ×0,65 (0,64–0,87) | 13 % | 0 % | 2 % | 0 % | 24 s |
| Elite | 5 | gut | 740 m | 447 m | ×0,60 (0,53–0,72) | 7 % | 0 % | 5 % | 7 % | 22 s |
| Boss | – | gut | 625 m | 459 m | ×0,73 (0,63–0,87) | 3 % | 0 % | 5 % | 7 % | 22 s |

### Gewittersteppe (Akt 3)

| Art | Etage | Loadout | Ziel | Median | Verhältnis | geschafft | Gold | Schaden | Sturz | Dauer |
|---|---|---|---|---|---|---|---|---|---|---|
| Etappe | 0 | start | 560 m | 419 m | ×0,75 (0,70–0,80) | 0 % | 0 % | 0 % | 0 % | 20 s |
| Etappe | 1 | start | 565 m | 404 m | ×0,71 (0,66–0,79) | 3 % | 0 % | 0 % | 0 % | 20 s |
| Etappe | 2 | start | 610 m | 416 m | ×0,68 (0,62–0,74) | 0 % | 0 % | 1 % | 0 % | 20 s |
| Etappe | 3 | start | 610 m | 397 m | ×0,65 (0,61–0,68) | 3 % | 0 % | 1 % | 3 % | 20 s |
| Etappe | 4 | start | 640 m | 406 m | ×0,63 (0,55–0,74) | 0 % | 0 % | 3 % | 0 % | 20 s |
| Etappe | 5 | start | 665 m | 407 m | ×0,61 (0,55–0,73) | 0 % | 0 % | 4 % | 7 % | 20 s |
| Elite | 2 | start | 795 m | 442 m | ×0,56 (0,50–0,60) | 0 % | 0 % | 0 % | 0 % | 20 s |
| Elite | 3 | start | 795 m | 418 m | ×0,53 (0,46–0,57) | 0 % | 0 % | 1 % | 0 % | 20 s |
| Elite | 4 | start | 830 m | 390 m | ×0,47 (0,43–0,55) | 0 % | 0 % | 1 % | 7 % | 19 s |
| Elite | 5 | start | 865 m | 443 m | ×0,51 (0,41–0,57) | 0 % | 0 % | 1 % | 7 % | 21 s |
| Boss | – | start | 730 m | 401 m | ×0,55 (0,49–0,62) | 3 % | 0 % | 6 % | 0 % | 21 s |
| Etappe | 0 | gut | 560 m | 492 m | ×0,88 (0,80–0,94) | 13 % | 0 % | 2 % | 0 % | 23 s |
| Etappe | 1 | gut | 565 m | 457 m | ×0,81 (0,73–0,92) | 10 % | 0 % | 3 % | 0 % | 22 s |
| Etappe | 2 | gut | 610 m | 485 m | ×0,80 (0,73–0,86) | 0 % | 0 % | 1 % | 0 % | 21 s |
| Etappe | 3 | gut | 610 m | 467 m | ×0,76 (0,71–0,81) | 7 % | 0 % | 5 % | 10 % | 22 s |
| Etappe | 4 | gut | 640 m | 469 m | ×0,73 (0,64–0,90) | 0 % | 0 % | 3 % | 0 % | 22 s |
| Etappe | 5 | gut | 665 m | 486 m | ×0,73 (0,67–0,85) | 3 % | 0 % | 4 % | 0 % | 23 s |
| Elite | 2 | gut | 795 m | 493 m | ×0,62 (0,58–0,66) | 0 % | 0 % | 2 % | 0 % | 22 s |
| Elite | 3 | gut | 795 m | 484 m | ×0,61 (0,53–0,66) | 0 % | 0 % | 6 % | 7 % | 22 s |
| Elite | 4 | gut | 830 m | 502 m | ×0,60 (0,50–0,64) | 0 % | 0 % | 5 % | 0 % | 23 s |
| Elite | 5 | gut | 865 m | 487 m | ×0,56 (0,48–0,65) | 0 % | 0 % | 3 % | 7 % | 21 s |
| Boss | – | gut | 730 m | 447 m | ×0,61 (0,56–0,68) | 3 % | 0 % | 7 % | 0 % | 21 s |

## Prüfpunkte

- Start-Loadout, Akt 1, Etage 0: Median ×1,28 (Soll ≈ 1,3).
- Start-Loadout, Akt-1-Boss: Median ×0,81 (Soll ≈ 0,8 – braucht Items/Upgrades).
- Gutes Loadout, Akt 2, Etage 0: Median ×1,01 (Soll ≈ 1,0).
- Schaden einer normalen Etappe (Akt 1, Etage 0–1, Start-Loadout, Bot ohne grobe Fehler): Median 0 % / 1 % (Soll ≤ 4 %).

<!-- items -->
## Items (Phase 4)

> Erzeugt von `node tools/sim/items.mjs` (12 Etappen je Build, 30 zufällige Builds je Zeile; Rechenzeit 50 s).

Bot wie bei den Zielmarken; mit Salto-Items (Gyro, Auslöser auf flip bzw. minCount) dreht er zusätzlich Rückwärtssaltos, wenn bis zur Landung > 1,7 s bleiben. Gutes Loadout (Startteile Stufe 10), volle Haltbarkeit je Etappe, 40 Run-Schrauben. **Zufällig (6)** = 6 zufällige nicht verfluchte Items ★1 je Etappe (mittelmäßiger Build ohne Plan). Synergie-Builds = 6 Items eines Tags (Set 2/4/6) bzw. die Elektro-Ketten-Bauweise (Salto → Stromschlag → Gratis-Boost → Kühlung). Zellen: Median Distanz ÷ Ziel · geschafft (mind. Bronze).

| Akt | Art | Etage | ohne Items | zufällig (6) | Elektro-Kette | Raketen-Set 6 | Gyro-Set 6 | Feuer-Set 6 | Hydraulik-Set 6 |
|---|---|---|---|---|---|---|---|---|---|
| 1 🗑️ | Etappe | 0 | ×1,66 · 100 % | ×2,18 · 100 % | ×3,00 · 100 % | ×3,00 · 100 % | ×3,00 · 100 % | ×1,34 · 100 % | ×3,00 · 100 % |
| 1 🗑️ | Etappe | 3 | ×1,27 · 92 % | ×2,04 · 97 % | ×3,00 · 100 % | ×3,00 · 100 % | ×3,00 · 100 % | ×1,17 · 83 % | ×3,00 · 100 % |
| 1 🗑️ | Etappe | 5 | ×1,06 · 83 % | ×1,61 · 80 % | ×3,00 · 100 % | ×2,48 · 100 % | ×2,93 · 100 % | ×0,94 · 25 % | ×3,00 · 100 % |
| 1 🗑️ | Boss | – | ×0,89 · 25 % | ×1,10 · 73 % | ×2,39 · 92 % | ×2,28 · 100 % | ×2,94 · 92 % | ×0,75 · 8 % | ×2,58 · 92 % |
| 2 🏜️ | Etappe | 0 | ×1,01 · 58 % | ×1,21 · 73 % | ×2,22 · 100 % | ×2,05 · 100 % | ×1,69 · 100 % | ×0,99 · 50 % | ×1,98 · 92 % |
| 2 🏜️ | Etappe | 3 | ×0,92 · 42 % | ×1,35 · 80 % | ×2,27 · 100 % | ×2,05 · 100 % | ×3,00 · 92 % | ×0,77 · 25 % | ×1,97 · 100 % |
| 2 🏜️ | Etappe | 5 | ×0,79 · 17 % | ×1,06 · 53 % | ×1,70 · 100 % | ×1,71 · 92 % | ×1,55 · 75 % | ×0,64 · 8 % | ×2,50 · 92 % |
| 2 🏜️ | Boss | – | ×0,80 · 0 % | ×1,08 · 57 % | ×1,37 · 92 % | ×1,46 · 100 % | ×1,39 · 92 % | ×0,64 · 0 % | ×1,29 · 100 % |
| 3 ⛈️ | Etappe | 0 | ×0,88 · 33 % | ×0,99 · 50 % | ×2,27 · 100 % | ×1,76 · 100 % | ×1,39 · 92 % | ×0,77 · 0 % | ×1,43 · 83 % |
| 3 ⛈️ | Etappe | 3 | ×0,81 · 33 % | ×1,20 · 60 % | ×1,54 · 100 % | ×1,75 · 100 % | ×1,44 · 83 % | ×0,75 · 8 % | ×1,48 · 92 % |
| 3 ⛈️ | Etappe | 5 | ×0,75 · 0 % | ×0,89 · 47 % | ×1,43 · 100 % | ×1,48 · 100 % | ×1,17 · 67 % | ×0,72 · 0 % | ×1,10 · 67 % |
| 3 ⛈️ | Boss | – | ×0,72 · 0 % | ×0,82 · 37 % | ×1,21 · 67 % | ×1,31 · 100 % | ×1,01 · 50 % | ×0,60 · 0 % | ×0,87 · 33 % |

### Ganze Runs

40 Runs je Strategie mit derselben Bot-Fahrweise, gutem Loadout und allen Item-Pools (Wegwahl: Tankstelle, sonst normale Etappe; Tankstelle repariert unter 60 %). Strategie der Item-Auswahl: **ohne** = immer Schrauben, **zufällig** = irgendein Angebot, **Synergie** = Angebot, das den stärksten Tag ausbaut (gewichtet mit der Seltenheit).

| Auswahl | Sieg | Ende in Akt 1 | Akt 2 | Akt 3 | Abschleppen (Median) |
|---|---|---|---|---|---|
| ohne | 13 % | 23 % | 40 % | 25 % | 4 |
| zufällig | 25 % | 10 % | 30 % | 35 % | 4 |
| synergie | 30 % | 13 % | 30 % | 28 % | 1,5 |

### Ergebnis

- Akt 1: ohne Items 92 %, zufällig 92 %, beste Synergie (Elektro-Kette) 100 % der Etappen geschafft (Etage 0/3/5); Boss: ohne 25 %, zufällig 73 %, beste Synergie 100 %.
- Akt 2: ohne Items 39 %, zufällig 69 %, beste Synergie (Elektro-Kette) 100 % der Etappen geschafft (Etage 0/3/5); Boss: ohne 0 %, zufällig 57 %, beste Synergie 100 %.
- Akt 3: ohne Items 22 %, zufällig 52 %, beste Synergie (Elektro-Kette) 100 % der Etappen geschafft (Etage 0/3/5); Boss: ohne 0 %, zufällig 37 %, beste Synergie 100 %.
- Ganze Runs: ohne Items 13 % Siege (88 % scheitern), zufällige Builds scheitern zu 65 % in Akt 2–3 (10 % in Akt 1, 25 % Siege), Synergie-Auswahl 30 % Siege bei 1,5 statt 4 Abschlepp-Vorgängen (Median).
