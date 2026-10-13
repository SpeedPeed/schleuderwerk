# Schleuderwerk als Android-App (APK)

Das Spiel ist eine Web-App (Ordner `www/`). **Capacitor** packt sie in eine echte Android-App.
Es gibt zwei Wege, die APK zu bauen. **Empfohlen ist Variante A**, weil du dafür auf dem PC nichts installieren musst.

---

## Variante A: automatisch in der Cloud (GitHub Actions) ⭐

Bei jedem Hochladen von Code baut GitHub die APK und stellt sie als Download bereit.
Die Datei [.github/workflows/android-apk.yml](.github/workflows/android-apk.yml) erledigt das.

### Einmalig: Projekt zu GitHub bringen

1. Auf **github.com** einloggen → oben rechts **+** → **New repository**.
2. Name: `schleuderwerk` · **Private** auswählen · **keine** Häkchen bei README/.gitignore/License → **Create repository**.
3. Die angezeigte Adresse kopieren, z. B. `https://github.com/DEINNAME/schleuderwerk.git`.
4. Im Ordner `AutoEvolution` ein Terminal öffnen und eingeben (Adresse ersetzen):
   ```
   git remote add origin https://github.com/DEINNAME/schleuderwerk.git
   git push -u origin main
   ```
   Beim ersten Mal öffnet sich ein Fenster zum Anmelden bei GitHub → **Sign in with your browser**.

### Danach bei jeder neuen Version

```
git add -A
git commit -m "Kurze Beschreibung"
git push
```

### APK herunterladen

1. Auf GitHub im Projekt den Reiter **Actions** öffnen. Dort läuft „Android-APK bauen“ (ca. 4–6 Minuten).
   Grüner Haken = fertig, rotes X = Fehler (dann den Fehlertext an Claude schicken).
2. Rechts auf der Projektseite → **Releases** → neueste Version → unter **Assets** die Datei
   `schleuderwerk-0.1.0.X.apk`.
   Tipp: Diese Seite direkt **am Handy** öffnen (im Browser bei GitHub eingeloggt), dann landet die APK gleich auf dem Handy.

---

## Variante B: lokal auf dem PC

Benötigt ca. 10 GB Speicher.

1. **Node.js** (LTS-Version) installieren: https://nodejs.org → „LTS“ herunterladen → installieren (alle Standard-Häkchen).
2. **Android Studio** installieren: https://developer.android.com/studio → beim ersten Start „Standard“-Setup wählen,
   damit das Android-SDK und Java mitinstalliert werden.
3. Terminal im Ordner `AutoEvolution` öffnen:
   ```
   npm install
   npm run android:prepare
   ```
   (Das erzeugt den Ordner `android/` und passt ihn an: Hochformat, Vollbild, Icon, fester Signaturschlüssel.)
4. APK bauen – entweder
   - im Terminal: `npm run android:build`
   - oder in Android Studio: **Open** → Ordner `android` wählen → Menü **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.
5. Die fertige Datei liegt unter `android\app\build\outputs\apk\debug\app-debug.apk`.

Nach Code-Änderungen reicht später: `npm run android:sync` und dann wieder Schritt 4.

> Hinweis: Wenn beim Bauen „JAVA_HOME is not set“ erscheint, in Android Studio unter
> *Settings → Build, Execution, Deployment → Build Tools → Gradle* den „Gradle JDK“-Pfad nachsehen und
> die Umgebungsvariable `JAVA_HOME` auf diesen Ordner setzen – oder einfach über Android Studio bauen.

---

## APK auf dem Handy installieren (Pixel 8 Pro)

1. APK-Datei auf dem Handy öffnen (aus dem Browser-Download oder der „Dateien“-App).
2. Beim ersten Mal erscheint: *„Aus Sicherheitsgründen ist die Installation unbekannter Apps aus dieser Quelle nicht zulässig“*
   → **Einstellungen** → **Dieser Quelle vertrauen** einschalten → zurück.
   (Das gilt nur für die App, aus der du installierst, z. B. Chrome oder Dateien.)
3. **Installieren** tippen. Falls **Google Play Protect** warnt („App wurde nicht überprüft“):
   → **Weitere Details** → **Trotzdem installieren**. Die Warnung ist normal für selbst gebaute Apps.
4. Fertig – „Schleuderwerk“ erscheint in der App-Übersicht.

## Neue Version installieren – ohne Spielstand-Verlust

- Neue APK einfach **genauso öffnen und „Aktualisieren“** tippen. **Nicht vorher deinstallieren!**
  Beim Deinstallieren löscht Android den Spielstand.
- Das klappt, weil jede APK mit demselben Schlüssel signiert wird (`keystore/debug.keystore`).
  **Diese Datei nie löschen oder neu erzeugen**, sonst verweigert Android das Update.
- Zur Sicherheit vor größeren Updates: im Spiel **⚙ → Exportieren**, den Text in einer Notiz speichern.
  Notfalls lässt er sich mit **⚙ → Importieren** wiederherstellen (auch auf einem anderen Handy).

## Bedienung in der App

- **Zurück-Taste / Zurück-Geste:** im Run → Pause (nochmal → weiter) · Ergebnis → Werkstatt · Werkstatt → „Spiel beenden?“
- Beim Wechsel in eine andere App pausiert das Spiel automatisch.
- Status- und Navigationsleiste sind ausgeblendet; vom Rand wischen holt sie kurz zurück.
