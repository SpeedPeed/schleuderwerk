// Einstieg für „node --test tests/“: Node 22 erweitert Ordner-Argumente nicht mehr automatisch,
// sondern lädt tests/index.js. Diese Datei lädt alle *.test.mjs dieses Ordners.
import { readdirSync } from 'node:fs';

const dir = new URL('./', import.meta.url);
for (const f of readdirSync(dir).filter((n) => n.endsWith('.test.mjs')).sort()) {
  await import(new URL(f, dir));
}
