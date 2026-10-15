# Schleuderwerk 2 – Balance (Zielmarken)

> Erzeugt von `node tools/sim/calibrate.mjs` (40 Etappen je Zeile, Elite 20; Rechenzeit 42 s). Nicht von Hand bearbeiten – neu erzeugen.

## Verfahren

- Ein Bot (`tools/sim/bot.mjs`) spielt headless mit der echten Etappen-Logik (`stage/stage.js`, Strecke aus `physics/trackGen.js`): Abschuss meist im grünen Bereich (60 %), Winkel 30–42°, richtet die Kiste vor jeder Landung aus, boostet in der Luft nach vorn (Reserve 35 % Treibstoff, Hitze < 72 %), nimmt vor Schluchten Anlauf, springt mit dem Hüpfer über Hindernisse, geschlossene Pressen und an Schluchtkanten, gibt bei Blitzwarnungen Gas. Keine Items (kommen in Phase 4).
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
| Etappe | 0 | start | 330 m | 429 m | ×1,30 (1,23–1,45) | 100 % | 15 % | 0 % | 0 % | 21 s |
| Etappe | 1 | start | 355 m | 437 m | ×1,23 (1,12–1,40) | 98 % | 18 % | 2 % | 5 % | 21 s |
| Etappe | 2 | start | 355 m | 421 m | ×1,19 (1,12–1,33) | 95 % | 18 % | 5 % | 0 % | 21 s |
| Etappe | 3 | start | 410 m | 438 m | ×1,07 (0,92–1,22) | 65 % | 0 % | 4 % | 0 % | 21 s |
| Etappe | 4 | start | 425 m | 425 m | ×1,00 (0,86–1,18) | 50 % | 3 % | 5 % | 0 % | 21 s |
| Etappe | 5 | start | 445 m | 410 m | ×0,92 (0,81–1,00) | 28 % | 3 % | 6 % | 0 % | 21 s |
| Elite | 2 | start | 460 m | 418 m | ×0,91 (0,80–0,97) | 20 % | 0 % | 6 % | 10 % | 19 s |
| Elite | 3 | start | 535 m | 416 m | ×0,78 (0,72–0,93) | 5 % | 0 % | 4 % | 5 % | 21 s |
| Elite | 4 | start | 555 m | 382 m | ×0,69 (0,65–0,75) | 0 % | 0 % | 6 % | 5 % | 19 s |
| Elite | 5 | start | 580 m | 395 m | ×0,68 (0,64–0,74) | 10 % | 0 % | 5 % | 0 % | 20 s |
| Boss | – | start | 510 m | 409 m | ×0,80 (0,70–0,88) | 13 % | 0 % | 10 % | 0 % | 19 s |
| Etappe | 0 | gut | 330 m | 504 m | ×1,53 (1,45–1,65) | 100 % | 57 % | 0 % | 0 % | 23 s |
| Etappe | 1 | gut | 355 m | 496 m | ×1,40 (1,30–1,58) | 100 % | 30 % | 2 % | 3 % | 22 s |
| Etappe | 2 | gut | 355 m | 503 m | ×1,42 (1,29–1,68) | 100 % | 40 % | 5 % | 0 % | 24 s |
| Etappe | 3 | gut | 410 m | 497 m | ×1,21 (1,13–1,42) | 93 % | 13 % | 5 % | 0 % | 23 s |
| Etappe | 4 | gut | 425 m | 496 m | ×1,17 (1,05–1,28) | 83 % | 8 % | 5 % | 0 % | 22 s |
| Etappe | 5 | gut | 445 m | 459 m | ×1,03 (0,99–1,20) | 68 % | 5 % | 7 % | 0 % | 22 s |
| Elite | 2 | gut | 460 m | 437 m | ×0,95 (0,88–1,02) | 30 % | 5 % | 6 % | 0 % | 20 s |
| Elite | 3 | gut | 535 m | 461 m | ×0,86 (0,80–1,04) | 35 % | 0 % | 7 % | 10 % | 22 s |
| Elite | 4 | gut | 555 m | 463 m | ×0,83 (0,75–0,94) | 20 % | 0 % | 6 % | 0 % | 23 s |
| Elite | 5 | gut | 580 m | 476 m | ×0,82 (0,72–1,00) | 25 % | 0 % | 5 % | 0 % | 23 s |
| Boss | – | gut | 510 m | 468 m | ×0,92 (0,79–1,14) | 43 % | 0 % | 8 % | 0 % | 22 s |

### Glutwüste (Akt 2)

| Art | Etage | Loadout | Ziel | Median | Verhältnis | geschafft | Gold | Schaden | Sturz | Dauer |
|---|---|---|---|---|---|---|---|---|---|---|
| Etappe | 0 | start | 490 m | 426 m | ×0,87 (0,77–1,07) | 33 % | 3 % | 2 % | 0 % | 21 s |
| Etappe | 1 | start | 525 m | 451 m | ×0,86 (0,72–1,01) | 28 % | 0 % | 1 % | 3 % | 20 s |
| Etappe | 2 | start | 525 m | 437 m | ×0,83 (0,73–1,03) | 28 % | 0 % | 1 % | 0 % | 21 s |
| Etappe | 3 | start | 530 m | 423 m | ×0,80 (0,69–0,93) | 15 % | 0 % | 4 % | 5 % | 21 s |
| Etappe | 4 | start | 550 m | 426 m | ×0,77 (0,63–0,89) | 3 % | 0 % | 2 % | 0 % | 21 s |
| Etappe | 5 | start | 570 m | 395 m | ×0,69 (0,61–0,92) | 10 % | 3 % | 3 % | 0 % | 20 s |
| Elite | 2 | start | 685 m | 391 m | ×0,57 (0,50–0,68) | 0 % | 0 % | 2 % | 0 % | 20 s |
| Elite | 3 | start | 690 m | 426 m | ×0,62 (0,58–0,69) | 5 % | 0 % | 2 % | 0 % | 20 s |
| Elite | 4 | start | 715 m | 406 m | ×0,57 (0,50–0,72) | 10 % | 0 % | 1 % | 5 % | 20 s |
| Elite | 5 | start | 740 m | 425 m | ×0,57 (0,46–0,66) | 0 % | 0 % | 6 % | 0 % | 20 s |
| Boss | – | start | 625 m | 400 m | ×0,64 (0,54–0,77) | 3 % | 0 % | 5 % | 10 % | 19 s |
| Etappe | 0 | gut | 490 m | 492 m | ×1,00 (0,89–1,22) | 53 % | 5 % | 2 % | 0 % | 23 s |
| Etappe | 1 | gut | 525 m | 512 m | ×0,97 (0,82–1,24) | 48 % | 5 % | 3 % | 0 % | 23 s |
| Etappe | 2 | gut | 525 m | 508 m | ×0,97 (0,83–1,13) | 45 % | 3 % | 2 % | 3 % | 22 s |
| Etappe | 3 | gut | 530 m | 482 m | ×0,91 (0,79–1,01) | 25 % | 3 % | 5 % | 5 % | 22 s |
| Etappe | 4 | gut | 550 m | 474 m | ×0,86 (0,73–1,03) | 28 % | 5 % | 5 % | 8 % | 22 s |
| Etappe | 5 | gut | 570 m | 485 m | ×0,85 (0,70–1,02) | 25 % | 3 % | 5 % | 3 % | 23 s |
| Elite | 2 | gut | 685 m | 499 m | ×0,73 (0,56–0,80) | 0 % | 0 % | 5 % | 10 % | 23 s |
| Elite | 3 | gut | 690 m | 509 m | ×0,74 (0,66–0,85) | 10 % | 0 % | 3 % | 5 % | 23 s |
| Elite | 4 | gut | 715 m | 461 m | ×0,64 (0,57–0,85) | 10 % | 0 % | 2 % | 0 % | 23 s |
| Elite | 5 | gut | 740 m | 457 m | ×0,62 (0,53–0,72) | 5 % | 0 % | 5 % | 5 % | 22 s |
| Boss | – | gut | 625 m | 450 m | ×0,72 (0,63–0,85) | 3 % | 0 % | 5 % | 8 % | 21 s |

### Gewittersteppe (Akt 3)

| Art | Etage | Loadout | Ziel | Median | Verhältnis | geschafft | Gold | Schaden | Sturz | Dauer |
|---|---|---|---|---|---|---|---|---|---|---|
| Etappe | 0 | start | 560 m | 419 m | ×0,75 (0,70–0,80) | 0 % | 0 % | 0 % | 0 % | 20 s |
| Etappe | 1 | start | 565 m | 403 m | ×0,71 (0,65–0,79) | 5 % | 0 % | 0 % | 3 % | 20 s |
| Etappe | 2 | start | 610 m | 416 m | ×0,68 (0,62–0,75) | 0 % | 0 % | 1 % | 0 % | 20 s |
| Etappe | 3 | start | 610 m | 397 m | ×0,65 (0,61–0,69) | 3 % | 0 % | 1 % | 3 % | 20 s |
| Etappe | 4 | start | 640 m | 406 m | ×0,63 (0,56–0,76) | 0 % | 0 % | 1 % | 0 % | 20 s |
| Etappe | 5 | start | 665 m | 399 m | ×0,60 (0,55–0,73) | 0 % | 0 % | 5 % | 8 % | 20 s |
| Elite | 2 | start | 795 m | 437 m | ×0,55 (0,48–0,60) | 0 % | 0 % | 1 % | 0 % | 20 s |
| Elite | 3 | start | 795 m | 416 m | ×0,52 (0,46–0,57) | 0 % | 0 % | 1 % | 5 % | 20 s |
| Elite | 4 | start | 830 m | 395 m | ×0,48 (0,44–0,55) | 0 % | 0 % | 2 % | 5 % | 19 s |
| Elite | 5 | start | 865 m | 433 m | ×0,50 (0,42–0,57) | 0 % | 0 % | 2 % | 5 % | 20 s |
| Boss | – | start | 730 m | 409 m | ×0,56 (0,50–0,63) | 3 % | 0 % | 6 % | 0 % | 21 s |
| Etappe | 0 | gut | 560 m | 477 m | ×0,85 (0,80–0,92) | 13 % | 0 % | 1 % | 0 % | 23 s |
| Etappe | 1 | gut | 565 m | 457 m | ×0,81 (0,73–0,92) | 13 % | 0 % | 3 % | 3 % | 22 s |
| Etappe | 2 | gut | 610 m | 491 m | ×0,80 (0,74–0,92) | 5 % | 0 % | 1 % | 3 % | 23 s |
| Etappe | 3 | gut | 610 m | 467 m | ×0,76 (0,72–0,84) | 8 % | 0 % | 4 % | 8 % | 23 s |
| Etappe | 4 | gut | 640 m | 476 m | ×0,74 (0,66–0,89) | 0 % | 0 % | 2 % | 0 % | 22 s |
| Etappe | 5 | gut | 665 m | 484 m | ×0,73 (0,67–0,85) | 5 % | 0 % | 3 % | 3 % | 23 s |
| Elite | 2 | gut | 795 m | 489 m | ×0,61 (0,56–0,66) | 0 % | 0 % | 5 % | 0 % | 22 s |
| Elite | 3 | gut | 795 m | 486 m | ×0,61 (0,57–0,66) | 0 % | 0 % | 6 % | 5 % | 23 s |
| Elite | 4 | gut | 830 m | 481 m | ×0,58 (0,53–0,64) | 0 % | 0 % | 5 % | 0 % | 22 s |
| Elite | 5 | gut | 865 m | 486 m | ×0,56 (0,50–0,65) | 0 % | 0 % | 2 % | 5 % | 21 s |
| Boss | – | gut | 730 m | 450 m | ×0,62 (0,57–0,69) | 3 % | 0 % | 8 % | 3 % | 22 s |

## Prüfpunkte

- Start-Loadout, Akt 1, Etage 0: Median ×1,30 (Soll ≈ 1,3).
- Start-Loadout, Akt-1-Boss: Median ×0,80 (Soll ≈ 0,8 – braucht Items/Upgrades).
- Gutes Loadout, Akt 2, Etage 0: Median ×1,00 (Soll ≈ 1,0).
- Schaden einer normalen Etappe (Akt 1, Etage 0–1, Start-Loadout, Bot ohne grobe Fehler): Median 0 % / 2 % (Soll ≤ 4 %).
