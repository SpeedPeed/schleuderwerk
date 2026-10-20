// PC-Version als EINE Datei: dist/Schleuderwerk-PC.html (npm run build:pc)
// Bündelt www/src/main.js samt three.js (www/vendor, kein Download) mit esbuild zu einem klassischen Skript (IIFE)
// und schreibt es zusammen mit style.css, Icon und Startbild (als data:-URL) in eine HTML-Datei.
// Paket B: die Schriften (www/fonts/*.woff2) werden als data:-URL ins CSS eingebettet; das Icon-Sprite steht schon
// inline in index.html (tools/make-icons.mjs). Die Datei startet per
// Doppelklick (file://) in Chrome, Edge und Firefox: keine Modul-Importe, keine Import-Map, kein fetch auf lokale
// Dateien. Der Spielstand liegt wie im Browser im localStorage.
//
// Aufruf: node tools/build-pc.mjs [--no-minify]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WWW = path.join(ROOT, 'www');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT = path.join(OUT_DIR, 'Schleuderwerk-PC.html');
const ICON = path.join(ROOT, 'tools', 'android-res', 'mipmap-xxhdpi', 'ic_launcher_round.png');
const minify = !process.argv.includes('--no-minify');

const dataUrl = (file, mime) => `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
// Text gefahrlos in ein <script>/<style> einbetten (kein vorzeitiges Ende des Elements)
const safeScript = (s) => s.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const safeStyle = (s) => s.replace(/<\/(style)/gi, '<\\/$1');

function replaceOnce(html, find, by, what) {
  const i = html.indexOf(find);
  if (i < 0) throw new Error(`index.html: ${what} nicht gefunden (${find})`);
  return html.slice(0, i) + by + html.slice(i + find.length);
}

export async function buildPc({ quiet = false } = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const res = await build({
    entryPoints: [path.join(WWW, 'src', 'main.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome100', 'edge100', 'firefox102', 'safari15'],
    alias: { three: path.join(WWW, 'vendor', 'three.module.js') },
    minify,
    legalComments: 'inline',
    charset: 'utf8',
    write: false,
    logLevel: 'warning',
  });
  const js = res.outputFiles[0].text;
  // Schriften einbetten: url("fonts/x.woff2") → data:font/woff2;base64,…
  let fonts = 0;
  const css = fs.readFileSync(path.join(WWW, 'style.css'), 'utf8').replace(/url\("(fonts\/[^"]+\.woff2)"\)/g, (m, rel) => {
    fonts++;
    return `url("${dataUrl(path.join(WWW, rel), 'font/woff2')}")`;
  });
  if (!fonts) throw new Error('style.css: keine Schriften gefunden (fonts/*.woff2)');
  if (!/<symbol id="i-/.test(fs.readFileSync(path.join(WWW, 'index.html'), 'utf8'))) throw new Error('index.html: Icon-Sprite fehlt (node tools/make-icons.mjs)');
  // Paket B: der Ladebildschirm (Blechschild „SCHLEUDERWERK“) kommt aus style.css – kein eigenes Startbild mehr
  const pcCss = '';

  let html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
  html = replaceOnce(html, '<link rel="stylesheet" href="style.css">',
    `<link rel="icon" type="image/png" href="${dataUrl(ICON, 'image/png')}">\n  <style>\n${safeStyle(css + pcCss)}</style>`, 'Stylesheet');
  html = html.replace(/\s*<script type="importmap">[\s\S]*?<\/script>/, '');
  html = replaceOnce(html, '<script type="module" src="src/main.js"></script>',
    `<script>window.SW_PC_BUILD = ${JSON.stringify({ version: pkg.version, built: new Date().toISOString().slice(0, 10) })};</script>\n  <script>\n${safeScript(js)}</script>`, 'Spiel-Skript');
  html = html.replace('<title>Schleuderwerk</title>', `<title>Schleuderwerk ${pkg.version} – PC</title>`);

  // Prüfen: nichts lädt mehr nach (alles inline)
  const outside = html.replace(/<script>[\s\S]*?<\/script>/g, '').replace(/<style>[\s\S]*?<\/style>/g, '');
  const ext = outside.match(/\s(src|href)="(?!data:|#)[^"]*"/g);   // #i-… = Icon im eingebetteten Sprite
  if (/url\("?(?!data:)fonts\//.test(html)) throw new Error('Schrift nicht eingebettet');
  if (ext) throw new Error(`Externe Verweise übrig: ${ext.join(', ')}`);
  if (/type="(module|importmap)"/.test(html)) throw new Error('Modul-Skript übrig');
  if (/\bimport\s*\(/.test(js)) throw new Error('dynamischer import() im Bündel');

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, html);
  const kb = Math.round(fs.statSync(OUT).size / 1024);
  if (!quiet) console.log(`✔ ${path.relative(ROOT, OUT)} geschrieben (${kb} KB${minify ? '' : ', nicht minimiert'}, ${fonts} Schriften eingebettet) – per Doppelklick starten.`);
  return { file: OUT, kb };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildPc().catch((e) => { console.error('✖ Bau fehlgeschlagen:', e.message); process.exit(1); });
}
