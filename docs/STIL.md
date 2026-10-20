# Stil-Leitfaden „Schrottplatz-Werkstatt“

> Paket B (OVERHAUL.md §5). Gilt für jede neue Oberfläche. Kurzregel: **Alles in der UI wurde aus etwas anderem gebaut.**
> Kein Glas, kein Blur, kein Neon, keine Emoji als Bedienelement.

## 1. Material statt Fläche

| Element | Material | CSS-Klasse / Baustein |
|---|---|---|
| Hintergrund eines Bildschirms | Klemmbrett (Hartfaser `--board`) oder Blaupause (`--blueprint` + `--grid`) | `.sheet`, `#map` |
| Fenster, Gruppen | Werkzeugkasten-Deckel: `--steel-700`, helle Oberkante, Rost an 1–2 Kanten, Nieten oben | `.card`, `.dlg-card` |
| Liste, Item, Angebot, Ereignis | Karteikarte `--paper` mit Linien (`--ruled`), Kreppband oben, ±2° schief (aus der ID) | `.icard`, `.pcard`, `.is-card` |
| Knopf | Lackiertes Blechschild mit 4 Nieten (`--rivets`), 5 px dunkle Unterkante, drückt 4 px nach unten | `.btn`, `.btn-primary`, `.btn-danger` |
| Hauptaktion | Warnschild-Gelb + Warnband (`--hazard`) links/rechts, Schablonenschrift | `.btn-primary` |
| Gesperrt | Lack abgeblättert: grau, gestrichelter Rand – **nie nur Transparenz** | `.btn:disabled`, `.locked` |
| Seltenheit | Stempel (rot/blau/violett/gold), 8° gedreht, ungleichmäßige Farbe (`--ink-mask`) | `.stamp` |
| Tag, Währung | Gesprühte Schablonen-Plakette (`--fray`) in Lack-Farbe, Schrift `--oil` | `.tag-chip`, `.badge`, `.cur` |
| Hinweis, Tutorial, Flavor | Notizzettel `--paper` + `--tape`, Handschrift, Absender „– Opa Gerd“ | `.opa` (`opaNote()` in `ui/runScreens.js`), `#tutorial` |
| Ergebnis | Gestempelte Karte, Medaille fällt mit Wucht (1,4 → 1, −8°), Schrott rattert hoch | `#results` |
| HUD | Armaturenbrett: Rundinstrumente, Rollen-Zählwerk, Blech-Druckknöpfe | `#hud` |

## 2. Farben

Nur über Tokens aus `www/style.css :root` – außerhalb von `:root` stehen **keine** `#rrggbb`- oder `rgba()`-Werte.
Neue Farbe nötig? Erst Token anlegen, dann benutzen.

- Grundpalette: `--oil`, `--steel-*`, `--rust-*`, `--paint-*`, `--paper`, `--tape`, `--blueprint`.
- Zustände: `--good` (Werkstatt-Grün), `--bad` (Lack-Rot), `--warn` (Warnschild-Gelb); auf dunklem Grund `--good-hi`, `--bad-hi`, `--gold-hi`.
- Tag-Farben `--tag-<tag>` (gleich wie `data/tags.js → color`): gedeckte Lack-Töne, nie gesättigtes Neon.
- Schatten/Licht nur über `--shade-1..3`, `--hi`, `--hi-2`, `--scrim*`.

## 3. Schrift

| Rolle | Schrift | Token |
|---|---|---|
| Überschriften, Knöpfe, große Zahlen | Saira Stencil One, Großbuchstaben, Laufweite +0,04 em | `--font-head` |
| Fließtext, Werte (Ziffern `tabular-nums`) | Barlow Semi Condensed 500/700 | `--font-body` |
| Notizzettel, Tutorial, Opa Gerd | Kalam, leicht gedreht (−1,5°) | `--font-hand` |

Alle Schriften liegen lokal in `www/fonts/` (SIL OFL, Lizenztexte daneben); die PC-Datei bettet sie ein. **Kein CDN.**

## 4. Icons

- Ein Sprite `www/assets/icons.svg` (70 Symbole), erzeugt von `node tools/make-icons.mjs` – dort neue Icons ergänzen,
  nie die SVG-Datei von Hand ändern.
- Im Code nur über den Helfer `icon(id)` aus `www/src/ui/dom.js` (`<svg><use href="#i-…">`).
- Daten-Einträge (Tags, Knoten, Slots, Biome) tragen `iconId` neben dem alten `icon` (Emoji bleibt nur als Rückfall
  für Item-Bilder – diese sitzen auf einem Papier-Etikett).
- Strich 2,5 px, runde Enden, leicht unregelmäßige Pfade, Füllung in Lack-Farben.

## 5. Bewegung & Ton

- Bildschirmwechsel: Klemmbrett schiebt sich herein (180 ms, kleiner Überschwinger) – `@keyframes slidein`.
- Karten fallen mit Rotation ein, Knöpfe wackeln bei Fokus (±1°), Stempel mit Staub.
- Klänge (`audio/sfx.js`): `metalButton` (Blechknopf), `ratchet` (Zählwerk), `stamp`, `tapeTear`, `screwDrop`.
- `prefers-reduced-motion` schaltet Animationen ab.

## 6. Sprache

- Texte stehen zentral in `www/src/data/texts.js` (`TXT`), nicht im UI-Code.
- Duzen, kurze Sätze, Werkstatt-Humor. Erzähler **Opa Gerd** (Werkstattmeister), Händler **Kalle** („KALLES SCHROTT & SÖHNE“).
- Beispiele: „AB AUF DEN PLATZ“ (Run starten), „SAUBER GELANDET!“ (Medaille), „KNAPP DANEBEN – ABER DIE KISTE LEBT.“,
  „FUNDSTÜCK! Eins darfst du einpacken.“, „FEIERABEND.“ (Run-Ende).
- Zufällige Sprüche über `pickLine(liste, seed)` – deterministisch, damit ein Bildschirm beim Neuzeichnen nicht wechselt.

## 7. Prüfen

```
python3 – Emoji-Zählung in www/src/ui/*.js + index.html          # Ziel ≤ 20 (Stand: 7, nur ★/☆/✗ als Schriftzeichen)
awk '/^:root/{r=1} r&&/^}/{r=0;next} !r' www/style.css | grep -c '#[0-9a-f]\{6\}'   # Ziel ≤ 10 (Stand: 0)
du -cb www/fonts/*.woff2 www/assets/icons.svg                       # Ziel ≤ 250 KB (Stand: 176 KB)
node tools/playtest/screen-tour.mjs --sizes 360x640,1280x720        # Fotos aller Bildschirme
```

Touch-Ziele ≥ 44 px (`--touch`), Rauchtest `tools/smoke-final.mjs` prüft das.
