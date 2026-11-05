/* Baut die Seite in eine einzelne HTML-Datei.
 *
 * Fuer GitHub Pages ist das nicht noetig — dort werden index.html und src/
 * direkt ausgeliefert. Die Einzeldatei hat zwei andere Zwecke: sie laesst sich
 * als Sicherungskopie weitergeben, und der Rauchtest prueft damit, dass das
 * Buendeln keinen Fehler in den Modulen uebersieht.
 *
 * Aufruf:  node scripts/build-single.mjs
 * Ergebnis: dist/schluessel.html
 *
 * Die gebaute Datei ist Wegwerfware — geaendert wird immer src/. */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ZIEL = path.join(WURZEL, 'dist', 'schluessel.html');

const lies = (p) => fs.readFile(path.join(WURZEL, p), 'utf8');

const bundle = await esbuild.build({
  entryPoints: [path.join(WURZEL, 'src/js/main.js')],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  write: false,
  legalComments: 'none'
});
const js = bundle.outputFiles[0].text;

const css = `${await lies('src/css/tokens.css')}\n${await lies('src/css/app.css')}`;
let html = await lies('index.html');

html = html.replace(
  /<link rel="stylesheet" href="src\/css\/tokens\.css" \/>\s*<link rel="stylesheet" href="src\/css\/app\.css" \/>/,
  `<style>\n${css}\n</style>`
);
html = html.replace(
  /<script type="module" src="src\/js\/main\.js"><\/script>/,
  `<script>\n${js}\n</script>`
);

/* Nur die Verweise pruefen, nicht den Inhalt: esbuild schreibt die Modulpfade
   als Kommentare in den Bundle, und die sollen dort auch bleiben. */
if (/<link[^>]+src\/css\//.test(html) || /<script[^>]+src="src\/js\//.test(html)) {
  console.error('Es sind noch Verweise auf src/ uebrig — die Ersetzung hat nicht gegriffen.');
  process.exit(1);
}

await fs.mkdir(path.dirname(ZIEL), { recursive: true });
await fs.writeFile(ZIEL, html);
console.log(`${path.relative(WURZEL, ZIEL)} — ${(html.length / 1024).toFixed(0)} kB`);
