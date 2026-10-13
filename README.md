# Schleuderwerk

Launch-&-Upgrade-Spiel in 3D-Low-Poly (Three.js). Design: siehe [GDD.md](GDD.md).

## Prototyp im Handy-Browser testen

Voraussetzung: Python ist installiert (ist bei dir schon der Fall), PC und Handy sind im **selben WLAN**.

1. Im Ordner `AutoEvolution` ein Terminal öffnen und eingeben:
   ```
   python tools/serve.py
   ```
2. Es erscheinen zwei Adressen, z. B.
   ```
   Am PC:       http://localhost:8137
   Am Handy:    http://192.168.178.23:8137
   ```
3. Am Handy in Chrome die **Handy-Adresse** eintippen.
   - Fragt Windows beim ersten Start nach der Firewall: „Private Netzwerke“ erlauben.
   - Tipp: Im Chrome-Menü ⋮ → „Zum Startbildschirm hinzufügen“, dann startet es fast wie eine App.
4. Beenden: im Terminal `Strg + C`.

Der Spielstand liegt im Browser des Handys. In der App (kommt im nächsten Schritt) gibt es einen eigenen Spielstand. Mit **⚙ → Exportieren / Importieren** kannst du ihn übertragen.

## Steuerung

| Phase | Geste | Wirkung |
|---|---|---|
| Abschuss | Finger aufs Display, nach hinten/unten ziehen, loslassen | Ziehweg = Kraft, Richtung = Winkel. Loslassen, während die Kraftanzeige in der **grünen Zone** steht = perfekter Abschuss (+15 %) |
| Flug | **Wischen** links/rechts | Auto drehen (schnell wischen = Schwung für Saltos) |
| Flug/Boden | **Halten** | Boost in Richtung der Motorhaube |
| Landung | – | Räder parallel zum Boden = saubere Landung, das Auto rollt weiter |

## Projektstruktur

```
www/                    ← das komplette Spiel (wird später in die App gepackt)
  index.html, style.css
  vendor/three.module.js    Three.js r170, lokal (offline)
  src/
    main.js                 Start, Spielzustände, Hauptschleife
    config/                 NUR Daten fürs Balancing: balance.js, upgrades.js, worlds.js
    game/                   Spiellogik: Physik (car.js), Run-Ablauf (run.js), Strecke, Objekte, Eingabe
    render/                 3D: Szene, Modelle aus Grundformen, Landschaft, Partikel, Kamera
    ui/                     Oberfläche: HUD, Werkstatt, Ergebnis, Menüs
    audio/sfx.js            alle Sounds per Web Audio erzeugt
    save/save.js            Spielstand (localStorage, Version, Export/Import)
    platform/platform.js    Vibration, Display wach halten, Pause im Hintergrund
tools/serve.py          kleiner Webserver zum Testen
```

## Balancing ändern

Alle Zahlen stehen in `www/src/config/`. Beispiele:
- `balance.js` → `PHYSICS.baseLaunchSpeed` (Startgeschwindigkeit), `rotateSens` (wie stark Wischen dreht), `LAUNCH.bandWidth` (Breite der grünen Zone)
- `upgrades.js` → Preise (`base`, `factor`), maximale Stufe, Wirkung pro Stufe
- `worlds.js` → Farben, Hügel, Rampenabstände, wie oft Münzen/Ringe/Hindernisse kommen
