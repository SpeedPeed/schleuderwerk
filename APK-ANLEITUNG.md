# Schleuderwerk als Android-App (APK) – Schritt für Schritt

Das Spiel ist eine Web-App (Ordner `www/`). **Capacitor** verpackt sie in eine echte Android-App
(Hochformat, Vollbild, Bildschirm bleibt an, Zurück-Taste und Vibration funktionieren).
Am Ende hast du eine Datei `schleuderwerk-1.0.0.N.apk`, die du auf dem Handy installierst.

Es gibt zwei Wege:

| | Weg A: GitHub Actions (empfohlen) | Weg B: lokal am PC |
|---|---|---|
| Was du brauchst | ein (kostenloses) GitHub-Konto | Node.js + Android Studio (≈ 10 GB) |
| Wer baut | GitHub in der Cloud (≈ 5 min) | dein PC |
| Ergebnis | APK unter „Releases“, auch direkt am Handy ladbar | APK im Ordner `android/app/build/outputs/apk/debug/` |

> **Wichtig für beide Wege:** Die App wird immer mit demselben Schlüssel signiert (`keystore/debug.keystore`).
> Nur deshalb kannst du später Updates installieren, **ohne den Spielstand zu verlieren**. Diese Datei nie löschen
> und nie neu erzeugen.

---

## Weg A: automatisch über GitHub Actions ⭐

Die Datei [.github/workflows/android-apk.yml](.github/workflows/android-apk.yml) baut die APK. Sie läuft
**bei jedem Push auf `main`** von selbst und kann **jederzeit von Hand** für jeden Branch gestartet werden.

### A1. Einmalig: Projekt zu GitHub bringen

1. Auf **github.com** einloggen → oben rechts **+** → **New repository**.
2. Name z. B. `schleuderwerk`, **Private** wählen, **keine** Häkchen bei README/.gitignore/License → **Create repository**.
3. Die angezeigte Adresse kopieren, z. B. `https://github.com/DEINNAME/schleuderwerk.git`.
4. Im Projektordner ein Terminal öffnen (Windows: im Explorer in die Adresszeile `cmd` tippen, Enter) und eingeben:
   ```
   git remote add origin https://github.com/DEINNAME/schleuderwerk.git
   git push -u origin main
   ```
   Beim ersten Mal öffnet sich ein Anmeldefenster → **Sign in with your browser**.
5. Auf GitHub im Projekt: **Settings → Actions → General → Workflow permissions** → **Read and write permissions** → **Save**.
   (Sonst darf die Action kein Release mit der APK anlegen.)

### A2. Neue Version bauen lassen

**Variante 1 – Push auf `main`** (baut automatisch):
```
git add -A
git commit -m "Kurze Beschreibung"
git push
```

**Variante 2 – „Run workflow“ auf einem beliebigen Branch** (z. B. zum Ausprobieren):
1. Auf GitHub den Reiter **Actions** öffnen.
2. Links **Android-APK bauen** anklicken.
3. Rechts **Run workflow** → im Feld **Branch** den gewünschten Branch wählen → grüner Knopf **Run workflow**.
   Ein Build von einem anderen Branch als `main` erscheint als **Pre-release** (Vorab-Version).

### A3. APK herunterladen

1. Reiter **Actions**: Der Lauf „Android-APK bauen“ dauert ca. 4–6 Minuten.
   Grüner Haken = fertig. Rotes X = Fehler → Lauf anklicken, den roten Schritt aufklappen, Text kopieren
   (siehe „Häufige Fehler“ unten).
2. Rechts auf der Projektseite **Releases** → neueste Version (z. B. `Schleuderwerk 1.0.0.12`) → unter **Assets**
   die Datei `schleuderwerk-1.0.0.12.apk`.
   Tipp: Diese Seite **direkt am Handy** öffnen (im Browser bei GitHub eingeloggt) – dann landet die APK sofort dort.
3. Alternativ: im Actions-Lauf ganz unten unter **Artifacts** (ZIP mit der APK).

Die letzte Zahl der Version ist die Laufnummer der Action (steigt mit jedem Build) – Android erkennt daran,
dass es ein Update ist.

---

## Weg B: lokal mit Node.js, Android Studio und Capacitor

### B1. Einmalig installieren

1. **Node.js** (LTS, mindestens 22): https://nodejs.org → „LTS“ → installieren (alle Standard-Häkchen).
   Prüfen im Terminal: `node -v` zeigt z. B. `v22.x`.
2. **Android Studio**: https://developer.android.com/studio → installieren → beim ersten Start **Standard**-Setup
   wählen. Dabei werden Android-SDK und Java (JDK 21) mitinstalliert.

### B2. Android-Projekt erzeugen

Im Projektordner ein Terminal öffnen und nacheinander eingeben:
```
npm install
npx cap add android
node tools/patch-android.mjs
npx cap sync android
```
Was passiert dabei?
- `npm install` lädt Capacitor (Ordner `node_modules/`).
- `npx cap add android` erzeugt den Ordner `android/` (ein normales Android-Studio-Projekt).
- `node tools/patch-android.mjs` passt ihn an: Hochformat, Vollbild (auch neben der Kamera-Aussparung),
  Bildschirm bleibt an, Systemschriftgröße verändert das Spiel nicht, Versionsnummer aus `package.json`,
  fester Signaturschlüssel, Icon und Startbild.
- `npx cap sync android` kopiert das Spiel (`www/`) und die Plugins (Zurück-Taste, Vibration) hinein.

Kurzform für alles zusammen: `npm run android:prepare`

### B3. APK bauen

**Entweder in Android Studio:** **File → Open** → Ordner `android` wählen → warten, bis „Gradle sync“ fertig ist →
Menü **Build → Build App Bundle(s) / APK(s) → Build APK(s)** → unten rechts **locate** anklicken.

**Oder im Terminal:**
```
cd android
gradlew assembleDebug        (Windows)
./gradlew assembleDebug      (Mac/Linux)
```
Die fertige Datei liegt unter `android/app/build/outputs/apk/debug/app-debug.apk`.

### B4. Nach Code-Änderungen

Der Ordner `android/` bleibt bestehen. Es reicht:
```
npx cap sync android
```
und dann wieder Schritt B3. Nur wenn du `android/` gelöscht hast, brauchst du wieder B2.
Die Versionsnummer setzt `patch-android.mjs` (lokal immer `.1` am Ende; für Updates über eine lokal gebaute
Version die Umgebungsvariable `BUILD_NUMBER` höher setzen, z. B. Windows: `set BUILD_NUMBER=50`, dann
`node tools/patch-android.mjs`).

---

## APK auf dem Handy installieren

1. APK-Datei auf dem Handy öffnen (Browser-Download oder App „Dateien“ → „Downloads“).
2. Beim ersten Mal kommt: *„Aus Sicherheitsgründen ist die Installation unbekannter Apps aus dieser Quelle nicht
   zulässig“* → **Einstellungen** → **Dieser Quelle vertrauen** (bzw. „Unbekannte Apps installieren“ erlauben) →
   zurück. Das gilt nur für die App, aus der du installierst (z. B. Chrome oder Dateien).
3. **Installieren** tippen. Warnt **Google Play Protect** („App wurde nicht überprüft“ / „Unsichere App blockiert“):
   **Weitere Details** → **Trotzdem installieren**. Das ist bei selbst gebauten Apps normal.
4. Fertig – **Schleuderwerk** erscheint in der App-Übersicht.

Von PC zu Handy geht es auch per USB-Kabel (Datei in den Ordner „Download“ kopieren) oder per Mail/Cloud an dich selbst.

## Updates installieren – ohne Spielstand-Verlust

- Neue APK einfach **genauso öffnen und „Aktualisieren“** tippen. **Nicht vorher deinstallieren!**
  Beim Deinstallieren löscht Android den Spielstand.
- Das klappt, weil jede APK mit demselben Schlüssel `keystore/debug.keystore` signiert ist und die App-Kennung
  gleich bleibt (`de.privat.schleuderwerk` in `capacitor.config.json` – **nicht ändern**).
- Die neue Version muss eine höhere Versionsnummer haben (bei GitHub Actions automatisch).

## Spielstand sichern (Export/Import)

Vor großen Updates, beim Handywechsel oder einfach zur Sicherheit:
1. Im Spiel **⚙ (Einstellungen)** → nach unten zu **Spielstand** → **📤 Exportieren**.
   Der Text (beginnt mit `SW3:`) wird in die Zwischenablage kopiert → in einer Notiz-App oder Mail an dich selbst speichern.
2. Wiederherstellen: **⚙ → Spielstand** → Text in das Feld einfügen → **📥 Importieren** → bestätigen.
   Das geht auch zwischen Browser-Version und App oder auf einem anderen Handy.
3. Ließ sich ein Spielstand einmal nicht laden, liegt eine Rohkopie unter **⚙ → 🛟 Backup anzeigen**.

## Bedienung in der App

- **Zurück-Taste / Zurück-Geste** schließt immer die oberste Ebene: Hinweis, Dialog, Menü, Einstellungen,
  Inventar, Teile-Auswahl. In der Etappe = **Pause** (nochmal = weiter). Auf der Karte = zurück in die Garage
  (der Run bleibt gespeichert). In einem Laden fragt das Spiel „Laden verlassen?“. In der Garage: „Spiel beenden?“.
- Beim Wechsel in eine andere App pausiert das Spiel automatisch; der Spielstand wird gesichert.
- Status- und Navigationsleiste sind ausgeblendet; vom Rand wischen holt sie kurz zurück.
- Ruckelt es: **⚙ → Grafik → Niedrig** und/oder **Schatten** aus.

---

## Häufige Fehler und Lösungen

| Problem | Lösung |
|---|---|
| Action bricht beim Schritt „Release mit APK anlegen“ ab (`Resource not accessible by integration`) | Schritt A1.5: **Read and write permissions** einschalten, dann „Re-run jobs“. |
| Action bricht bei „Tests“ ab | Ein Test im Spiel ist rot – Fehlertext aus dem Log an Claude schicken. Die APK wird absichtlich nicht gebaut. |
| `git push` fragt nach Passwort / „Authentication failed“ | GitHub nimmt keine Passwörter mehr: im Anmeldefenster **Sign in with your browser** wählen (oder in GitHub Desktop anmelden). |
| `npx: Befehl nicht gefunden` / `node` unbekannt | Node.js installieren (B1) und das Terminal **neu öffnen**. |
| `npx cap add android`: „android platform already exists“ | Der Ordner `android/` gibt es schon → gleich `node tools/patch-android.mjs` und `npx cap sync android`. Für einen sauberen Neuanfang `android/` löschen. |
| `patch-android: Stelle nicht gefunden …` | Capacitor hat seine Vorlage geändert. `android/` löschen, B2 wiederholen; hilft das nicht, Fehlertext an Claude schicken. |
| `JAVA_HOME is not set` / falsche Java-Version | Über Android Studio bauen, oder `JAVA_HOME` auf das JDK von Android Studio setzen (Android Studio → Settings → Build Tools → Gradle → „Gradle JDK“ zeigt den Pfad). Benötigt wird Java 21. |
| `SDK location not found` | Projekt einmal in Android Studio öffnen (legt `android/local.properties` an). |
| „App nicht installiert“ / „Paket steht in Konflikt mit einem vorhandenen Paket“ | Die installierte App wurde mit einem anderen Schlüssel signiert (z. B. sehr alte Version oder fremder Build). Erst **Spielstand exportieren**, dann alte App deinstallieren, neu installieren, importieren. |
| „App nicht installiert“ bei einem Update | Versionsnummer nicht höher als die installierte – neuen Build mit höherer Laufnummer verwenden. |
| Play Protect blockiert | „Weitere Details“ → „Trotzdem installieren“. |
| Weißer/schwarzer Bildschirm nach dem Start | App einmal ganz schließen und neu öffnen; Android-System-WebView im Play Store aktualisieren. |
| Spiel ruckelt | ⚙ → Grafik **Niedrig**, Schatten aus, Bildschirmwackeln aus. |
| Texte zu groß / Layout verschoben | Ab Version 1.0.0 ignoriert die App die Systemschriftgröße; ältere APK durch eine neue ersetzen. |
