# Übergabe an eine neue Chat-Sitzung (Stand 20.10.2026, 17:30 UTC)

Diese Datei ist der Einstiegspunkt für eine neue Claude-Sitzung, die den Overhaul fortsetzt.
Zuerst lesen: diese Datei → `docs/OVERHAUL.md` (Plan + Umsetzungsstände) → bei Bedarf `docs/ARCHITEKTUR.md`, `docs/BALANCE.md`.

## Wünsche des Spielers (Peter)

- Antworten auf **Deutsch**, kurz und verständlich (Schüler, kein Programmierer).
- Kritik am Spiel (20.10.): zu wenig Schrott, zu oft dasselbe spielen, Synergien zu schwach, macht insgesamt wenig Spaß,
  braucht dringend mehr Content/Features → „ich überlasse das dir“. Außerdem: **UI sieht zu sehr nach KI aus**,
  das Spiel soll eigenen Stil und Charme haben.
- Arbeitsrhythmus: **Schultage Mo–Fr ca. 07:30–15:00 (deutsche Zeit)** sparsam (höchstens ein Agent gleichzeitig, keine
  parallelen Review-Runden); nachts/Wochenende volle Geschwindigkeit. Nutzungslimits sparsam behandeln: lieber wenige,
  gezielte Agenten als viele parallele.
- Designentscheidungen selbst treffen statt nachzufragen. Vollständige Dateien liefern.
- Am Ende des Overhauls: neue **APK** (Handy) und neue **PC-Datei** (`npm run build:pc` → `dist/Schleuderwerk-PC.html`) bauen
  und dem Spieler schicken, mit kurzer Zusammenfassung und Screenshots.

## Git

- Repo `SpeedPeed/schleuderwerk`, Branch **`claude/car-evolve-clone-enhanced-lwnjjy`** (nur dorthin pushen, kein PR ohne Auftrag).
- Jede Commit-Nachricht endet mit:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014ePaVD7JRDWZ64hEeWm1Vh
  ```
  (die neue Sitzung verwendet ihren eigenen Session-Link, falls das System einen vorgibt)
- Bei flachem Klon fehlt evtl. der Remote-Branch-Ref:
  `git config --add remote.origin.fetch "+refs/heads/claude/car-evolve-clone-enhanced-lwnjjy:refs/remotes/origin/claude/car-evolve-clone-enhanced-lwnjjy" && git fetch origin`

## Stand der Pakete (siehe `docs/OVERHAUL.md` §5)

| Paket | Stand |
|---|---|
| Playtest + Plan | ✅ fertig (`docs/OVERHAUL.md`, Messskripte `tools/playtest/*`) |
| **A** Tempo & Belohnung | ✅ fertig, gemessen, dokumentiert („Umsetzungsstand Paket A“) |
| **B** UI-Stil „Schrottplatz-Werkstatt“ | ✅ fertig („Umsetzungsstand Paket B“, `docs/STIL.md`) |
| **C** Synergien | ✅ fertig („Umsetzungsstand Paket C“) |
| **D** Abwechslung | ⬜ offen |
| **E** Meta | ⬜ offen |
| **F** Etappen-Gefühl & Kalibrierung | ⬜ offen |
| APK + PC-Datei bauen und schicken | ⬜ nach den Paketen (oder als Zwischenstand nach B+C) |

### Paket B – was noch fehlt

Der WIP-Commit enthält: lokale Schriften (`www/fonts/`), Icon-Sprite (`www/assets/`, Generator `tools/make-icons.mjs`),
`data/texts.js` (Opa-Gerd-Stimme), neue Tokens/Komponenten in `www/style.css`, umgestellte UI-Dateien, neue Klänge.
`npm test` war beim Sichern grün (276/276). Der Agent war zuletzt dabei, die restlichen `rgba()`-Literale außerhalb von
`:root` in Tokens umzuwandeln; die Bildschirmfotos sahen laut Agent auf Handy und PC gut aus.
Offen:
1. Erfolgskriterien prüfen (OVERHAUL.md Paket B): Emoji im UI-Code ≤ 20, Farben nur über Tokens, Schriften+Sprite ≤ 250 KB, offline.
2. `node tools/validateContent.mjs`, `npm run build:pc` (Schriften/Sprite eingebettet?), `tools/smoke-final.mjs`, `tools/smoke-pc.mjs`.
3. Bildschirmfotos aller Screens (Handy 360×640 + PC 1280×720) mit `tools/playtest/screen-tour.mjs`, kritisch ansehen, nachbessern.
4. „Umsetzungsstand Paket B“ in OVERHAUL.md + kurzer Stil-Leitfaden (`docs/STIL.md`).

### Paket C – was noch fehlt

`wip/paket-c-wip.patch` ist ein Diff gegen Commit `ca0828b` (Ende Paket A) mit: Startpool 5 Items je Tag
(`data/content/content_synergie.js`), Rezepte (`data/recipes.js`, `items/recipes.js`), Änderungen an balance.js, tags.js,
research.js, inventory/events/conditions, rewards/runState, save.js, stage.js, Tests. Stand: **1 Test rot**, der Agent war
gerade beim Validator (`tools/validateContent.mjs`).
Anwenden: `git apply --3way wip/paket-c-wip.patch` (Konflikte mit Paket B möglich in `data/items.js`, `data/tags.js`,
`main.js`, `tools/validateContent.mjs` – Paket-B-Styling/iconId behalten, Paket-C-Logik übernehmen). Danach `wip/` löschen.
Offen: alle Punkte aus OVERHAUL.md Paket C fertigstellen (Tag-Bias in Angeboten, Set-Schwellen 2/3/5, 20 Rezepte,
22 Legendäre mit Boss-Garantie, Start-Blaupause, sichtbare+zahlende Ketten, Tag-Balance), messen mit
`tools/playtest/synergy.mjs`, `tools/sim/items.mjs`, `tools/sim/progression.mjs`; Fortschritts-Korridore aus Paket A halten
(erster Boss 0,5–1 h, erster Sieg 3–5 h ±25 %, Schrottstufe 15 in 30–50 h).

## Prüfbefehle

```
npm test                         # node --test, muss grün sein
node tools/validateContent.mjs
npm run build:pc                 # → dist/Schleuderwerk-PC.html (gitignored)
node tools/smoke-final.mjs       # Playwright, Chromium vorinstalliert, NIE "playwright install"
node tools/smoke-pc.mjs
```

## APK bauen (Capacitor)

Anleitung: `docs/APK-ANLEITUNG.md`, GitHub-Workflow `.github/workflows/android-apk.yml`, `capacitor.config.json`,
`tools/patch-android.mjs`, fester Schlüssel `keystore/debug.keystore` (damit Updates über die alte App installierbar sind).
Erfahrungen aus dem letzten Bau: build-tools **35.0.0** verwenden (34 hatte einen d8-Absturz); Maven Central liefert
gelegentlich HTTP 429 → Gradle mit `--max-workers=1` und Wiederholungsschleife.
