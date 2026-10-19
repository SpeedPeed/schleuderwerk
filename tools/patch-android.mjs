// Passt das von Capacitor erzeugte Android-Projekt (Ordner android/) an das Spiel an.
// Läuft automatisch beim App-Bau (GitHub Actions) bzw. über "npm run android:prepare".
//
//  - Hochformat fest, Vollbild ohne Status-/Navigationsleiste (auch neben der Kamera-Aussparung), Bildschirm bleibt an
//  - Schriftgröße des Systems verändert das Spiel nicht (WebView-Textzoom 100 %)
//  - Zurück-Taste und Haptik laufen über die Capacitor-Plugins @capacitor/app und @capacitor/haptics (www/src/platform)
//  - fester Signaturschlüssel (keystore/debug.keystore) -> Updates behalten den Spielstand
//  - Versionsnummer (BUILD_NUMBER aus GitHub Actions)
//  - eigenes Icon und Startbild

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AND = path.join(ROOT, 'android');
const APP = path.join(AND, 'app');
const MAIN = path.join(APP, 'src', 'main');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function fail(msg) {
  console.error(`✖ patch-android: ${msg}`);
  process.exit(1);
}

function edit(file, fn) {
  if (!fs.existsSync(file)) fail(`Datei fehlt: ${path.relative(ROOT, file)}`);
  const before = fs.readFileSync(file, 'utf8');
  const after = fn(before);
  fs.writeFileSync(file, after);
  console.log(`✔ ${path.relative(ROOT, file)}`);
}

function replaceOnce(text, pattern, replacement, what) {
  if (!pattern.test(text)) fail(`Stelle nicht gefunden: ${what}`);
  return text.replace(pattern, replacement);
}

if (!fs.existsSync(AND)) fail('Ordner android/ fehlt – zuerst "npx cap add android" ausführen.');

// 1) Manifest: Hochformat
edit(path.join(MAIN, 'AndroidManifest.xml'), (t) => {
  if (t.includes('android:screenOrientation')) return t;
  return replaceOnce(t, /android:name="\.MainActivity"/, 'android:name=".MainActivity"\n            android:screenOrientation="portrait"', 'MainActivity im Manifest');
});

// 2) MainActivity: Vollbild + Bildschirm an
const javaDir = path.join(MAIN, 'java', ...config.appId.split('.'));
fs.mkdirSync(javaDir, { recursive: true });
fs.writeFileSync(path.join(javaDir, 'MainActivity.java'), `package ${config.appId};

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Bildschirm bleibt an, solange das Spiel im Vordergrund ist
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // Bild auch neben der Kamera-Aussparung nutzen (das Spiel hält per CSS Abstand: body.native)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        // große Systemschrift soll das Spiel-Layout nicht sprengen
        if (getBridge() != null && getBridge().getWebView() != null) getBridge().getWebView().getSettings().setTextZoom(100);
        hideSystemBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    // Vollbild: Status- und Navigationsleiste ausblenden (Wischen vom Rand holt sie kurz zurück)
    private void hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.hide(WindowInsetsCompat.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
`);
console.log('✔ MainActivity.java');

// 3) build.gradle: Version + fester Signaturschlüssel
const build = Number(process.env.BUILD_NUMBER || 1);
const versionName = `${pkg.version}.${build}`;
edit(path.join(APP, 'build.gradle'), (t) => {
  t = replaceOnce(t, /versionCode\s+\d+/, `versionCode ${build}`, 'versionCode');
  t = replaceOnce(t, /versionName\s+"[^"]*"/, `versionName "${versionName}"`, 'versionName');
  if (!t.includes('signingConfigs')) {
    t = replaceOnce(t, /\n(\s*)buildTypes\s*\{/, `
    signingConfigs {
        debug {
            storeFile file("../../keystore/debug.keystore")
            storeType "pkcs12"
            storePassword "android"
            keyAlias "androiddebugkey"
            keyPassword "android"
        }
    }
$1buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }`, 'buildTypes');
  }
  return t;
});
if (!fs.existsSync(path.join(ROOT, 'keystore', 'debug.keystore'))) fail('keystore/debug.keystore fehlt');

// 4) Icons und Startbild
const res = path.join(MAIN, 'res');
const iconSrc = path.join(ROOT, 'tools', 'android-res');
for (const dir of fs.readdirSync(iconSrc)) {
  for (const f of fs.readdirSync(path.join(iconSrc, dir))) {
    fs.mkdirSync(path.join(res, dir), { recursive: true });
    fs.copyFileSync(path.join(iconSrc, dir, f), path.join(res, dir, f));
  }
}
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
fs.mkdirSync(path.join(res, 'mipmap-anydpi-v26'), { recursive: true });
fs.writeFileSync(path.join(res, 'mipmap-anydpi-v26', 'ic_launcher.xml'), adaptive);
fs.writeFileSync(path.join(res, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), adaptive);
console.log('✔ Icons');

const splash = path.join(ROOT, 'tools', 'android-splash', 'splash.png');
let n = 0;
for (const dir of fs.readdirSync(res)) {
  const f = path.join(res, dir, 'splash.png');
  if (fs.existsSync(f)) { fs.copyFileSync(splash, f); n++; }
}
console.log(`✔ Startbild (${n} Dateien)`);
console.log(`Fertig – Version ${versionName}`);
