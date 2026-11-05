/* Baut die Liste als Einzeldatei und legt sie in die Vereinsseite.
 *
 * Die Liste wird unter www.kgvgruenerwinkel.de/schluessel/ ausgeliefert. Das
 * geht ueber die vorhandene Pipeline der Vereinsseite: alles unter
 * frontend/public/ kopiert der React-Build unveraendert nach frontend/build/,
 * und von dort spiegelt die GitHub-Action den Ordner per lftp auf den
 * Strato-Webspace.
 *
 * Quelle bleibt dieses Projekt. Die Datei drueben ist eine Kopie und wird bei
 * jedem Aufruf ueberschrieben — dort nie von Hand aendern.
 *
 * Aufruf:
 *   node scripts/nach-vereinsseite.mjs <Pfad zum GruenerWinkel-Repo>
 *
 * Danach im Vereins-Repo committen und pushen; die Action baut und laedt hoch.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ZIEL_IM_REPO = path.join('frontend', 'public', 'schluessel', 'index.html');

const repo = process.argv[2];
if (!repo) {
  console.error('Aufruf: node scripts/nach-vereinsseite.mjs <Pfad zum GruenerWinkel-Repo>');
  process.exit(1);
}

const repoPfad = path.resolve(repo);

/* Pruefen, dass wirklich das Vereins-Repo gemeint ist — sonst landet die Datei
   in irgendeinem Ordner und niemand merkt es. */
try {
  await fs.access(path.join(repoPfad, 'frontend', 'package.json'));
  await fs.access(path.join(repoPfad, '.github', 'workflows', 'deploy.yml'));
} catch {
  console.error(`In ${repoPfad} liegt nicht das GruenerWinkel-Repo.`);
  console.error('Erwartet werden frontend/package.json und .github/workflows/deploy.yml.');
  process.exit(1);
}

console.log('Einzeldatei bauen …');
execFileSync(process.execPath, [path.join(WURZEL, 'scripts', 'build-single.mjs')], {
  stdio: 'inherit'
});

const quelle = path.join(WURZEL, 'dist', 'schluessel.html');
const inhalt = await fs.readFile(quelle, 'utf8');

/* Sicherheitsnetz: ohne Serveradresse waere die Kopie drueben nutzlos, und der
   Fehler faellt erst dem Vorstand auf. */
const basis = inhalt.match(/SCHLUESSEL_BASIS\s*=\s*'([^']*)'/)?.[1];
if (!basis) {
  console.error('In der gebauten Datei steht keine Adresse der Edge Function.');
  process.exit(1);
}

const ziel = path.join(repoPfad, ZIEL_IM_REPO);
await fs.mkdir(path.dirname(ziel), { recursive: true });
await fs.writeFile(ziel, inhalt);

console.log(`\nKopiert nach ${path.join(repo, ZIEL_IM_REPO)}`);
console.log(`  Groesse:        ${(inhalt.length / 1024).toFixed(0)} kB`);
console.log(`  Edge Function:  ${basis}`);
console.log('\nJetzt im Vereins-Repo committen und pushen — die Action laedt hoch.');
