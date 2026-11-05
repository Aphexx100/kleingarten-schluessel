/* Erzeugt die bebilderte Anleitung als PDF.
 *
 * Die Bilder entstehen frisch bei jedem Lauf — aus der Anwendung selbst, nicht
 * aus abgelegten Dateien. Damit kann die Anleitung nicht unbemerkt veralten:
 * wird die Oberflaeche geaendert, zeigt der naechste Lauf den neuen Stand.
 *
 * Die Aufnahmen laufen im Vorfuehrbetrieb (?demo) mit erfundenen Beispieldaten.
 * In einer Anleitung, die herumgereicht wird, haben echte Mitgliedernamen und
 * Adressen nichts zu suchen.
 *
 * Aufruf:  node scripts/anleitung.mjs
 * Ergebnis: docs/Anleitung-Schluesselliste.pdf (plus dist/anleitung.html zum
 *           Durchsehen im Browser)
 */

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8397;
const ZIEL = path.join(WURZEL, 'docs', 'Anleitung-Schluesselliste.pdf');

const SEITE_LIVE = 'https://www.kgvgruenerwinkel.de/#/vorstandsbereich';

/* Satzspiegel bei A4 mit 16 mm Rand links und rechts. Ein Bild darf hoechstens
   so hoch werden, dass daneben noch Text auf die Seite passt, und muss breit
   genug bleiben, um lesbar zu sein. */
const SATZSPIEGEL_MM = 178;
const MAX_BILDHOEHE_MM = 200;
const MIN_BILDBREITE_MM = 70;

const TYPEN = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

/* ----------------------------------------------------------- Hilfsserver */

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const datei = path.join(WURZEL, p === '/' ? 'index.html' : p);
  if (!datei.startsWith(WURZEL)) return res.writeHead(403).end();
  fs.readFile(datei, (err, buf) => {
    if (err) return res.writeHead(404).end('nicht gefunden');
    res.writeHead(200, {
      'Content-Type': TYPEN[path.extname(datei)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(buf);
  });
});

await new Promise((f) => server.listen(PORT, f));
const browser = await chromium.launch();

/* Ein Handy-Format, weil die Eintraege fast immer am Handy entstehen.
   Doppelte Punktdichte, damit die Bilder im Druck nicht ausfransen. */
const seite = await browser.newPage({
  viewport: { width: 400, height: 860 },
  deviceScaleFactor: 2
});

const bilder = {};

async function schuss(name, ziel, { ganz = false } = {}) {
  const puffer = ganz
    ? await seite.screenshot({ fullPage: false })
    : await (typeof ziel === 'string' ? seite.locator(ziel) : ziel).screenshot();

  /* Ein zu hohes Bild wird im Druck auf die zulaessige Hoehe gequetscht und
     dadurch schmal — am fertigen PDF faellt das kaum auf, hier sofort.
     Darum wird die gedruckte Breite ausgerechnet, nicht geschaetzt. */
  const { breite, hoehe } = masse(puffer);
  const gedruckt = Math.min(SATZSPIEGEL_MM, MAX_BILDHOEHE_MM * (breite / hoehe));

  bilder[name] = `data:image/png;base64,${puffer.toString('base64')}`;
  console.log(
    `  Bild: ${name.padEnd(14)} ${String(breite).padStart(4)}×${String(hoehe).padEnd(5)} ` +
      `→ ${gedruckt.toFixed(0)} mm breit im Druck`
  );

  if (gedruckt < MIN_BILDBREITE_MM) {
    console.error(
      `        ACHTUNG: ${name} waere im Druck nur ${gedruckt.toFixed(0)} mm breit ` +
        `(mindestens ${MIN_BILDBREITE_MM} mm noetig). Ausschnitt begrenzen.`
    );
    process.exitCode = 1;
  }
}

/* Breite und Hoehe stehen im PNG-Kopf (IHDR), ab Byte 16. */
function masse(puffer) {
  return { breite: puffer.readUInt32BE(16), hoehe: puffer.readUInt32BE(20) };
}

try {
  console.log('Bilder aufnehmen …');

  /* ------------------------------------------- 1. Vereinsseite, Codeabfrage */
  try {
    const live = await browser.newPage({
      viewport: { width: 400, height: 860 },
      deviceScaleFactor: 2
    });
    await live.goto(SEITE_LIVE, { waitUntil: 'networkidle', timeout: 30_000 });
    await live.waitForSelector('[data-testid="zugangsformular"]', { timeout: 15_000 });
    const puffer = await live.locator('[data-testid="zugangsformular"]').screenshot();
    bilder.codeabfrage = `data:image/png;base64,${puffer.toString('base64')}`;
    console.log('  Bild: codeabfrage (von der Vereinsseite)');
    await live.close();
  } catch (e) {
    /* Ohne Netz oder bei geaenderter Seite geht die Anleitung trotzdem
       durch — dann fehlt nur dieses eine Bild. */
    console.log(`  Bild: codeabfrage übersprungen (${e.message.split('\n')[0]})`);
  }

  /* ------------------------------------------------- 2. Liste im Ueberblick */
  await seite.goto(`http://localhost:${PORT}/index.html?demo`);
  await seite.waitForSelector('.garten', { timeout: 10_000 });
  /* Das Hinweisband des Vorfuehrbetriebs stoert in der Anleitung. */
  await seite.evaluate(() => document.querySelector('.demoband')?.remove());
  await schuss('uebersicht', '.zahlen');

  /* Nur die ersten Zeilen zeigen — alle 54 ergaeben ein Bild von mehreren
     tausend Pixeln Hoehe, das im Druck zum Streifen zusammenfaellt. Die
     gezeigten Zeilen decken absichtlich alle Zustaende ab: erledigt, offen,
     und einer mit fehlendem Foto. */
  await seite.evaluate(() => {
    document.querySelectorAll('.garten').forEach((el, i) => {
      if (i > 5) el.remove();
    });
  });
  await schuss('liste', seite.locator('.liste'));
  /* Danach die volle Liste wiederherstellen, sonst fehlen die Zeilen fuer die
     naechsten Aufnahmen. */
  await seite.reload();
  await seite.waitForSelector('.garten');
  await seite.evaluate(() => document.querySelector('.demoband')?.remove());

  /* ------------------------------------------------------ 3. Zeile oeffnen */
  const g = seite.locator('.garten').nth(2);
  await g.locator('.zeile').click();
  await g.locator('.form').waitFor();
  await schuss('zeile_auf', g);

  /* ------------------------------------------------------- 4. Weg waehlen */
  await g.locator('.schalter input').check();
  await g.locator('.rollout').waitFor();
  await schuss('rollout', g.locator('.rollout'));

  /* ----------------------------------------------------- 5. Persoenlich */
  await g.locator('.rollout .wahl', { hasText: 'Persönlich' }).click();
  await seite.waitForTimeout(150);
  await g.locator('input[type="text"]').first().fill('Heinz Brandt');
  await schuss('persoenlich', g.locator('.form'));

  /* ------------------------------------------------------ 6. Hinterlegt */
  await g.locator('.rollout .wahl', { hasText: 'Hinterlegt' }).click();
  await seite.waitForTimeout(150);
  await g.locator('textarea').first().fill('Im Gerätehaus, oberes Regal links, brauner Umschlag');
  await schuss('hinterlegt', g.locator('.form'));

  /* ----------------------------------------------------------- 7. Post */
  await g.locator('.rollout .wahl', { hasText: 'Post' }).click();
  await seite.waitForTimeout(150);
  await g.locator('textarea').first().fill('Marianne Voss\nLindenstraße 14\n45127 Essen');
  await schuss('post', g.locator('.form'));

  /* --------------------------------------------- 8. Fehlende Pflichtangabe */
  await g.locator('textarea').first().fill('');
  await g.locator('button.haupt', { hasText: 'Speichern' }).click();
  await g.locator('.meldung.fehler').waitFor({ timeout: 5000 });
  await schuss('fehlermeldung', g.locator('.meldung.fehler'));
  await g.locator('button.leise', { hasText: 'Abbrechen' }).click();
  await seite.waitForTimeout(200);

  /* ------------------------------------------------- 9. Suchen und filtern */
  await schuss('filter', '.filter');

  /* ------------------------------------------------------- 10. Sichern */
  await schuss('sichern', '.fuss');

  console.log('\nPDF bauen …');
  const html = anleitungHtml(bilder);

  /* Dieselbe Vorlage auch als HTML ablegen: so laesst sich das Ergebnis im
     Browser durchsehen, ohne ein PDF-Werkzeug zu brauchen. */
  await fsp.mkdir(path.dirname(ZIEL), { recursive: true });
  await fsp.mkdir(path.join(WURZEL, 'dist'), { recursive: true });
  await fsp.writeFile(path.join(WURZEL, 'dist', 'anleitung.html'), html);

  const pdfSeite = await browser.newPage();
  await pdfSeite.setContent(html, { waitUntil: 'load' });
  await fsp.mkdir(path.dirname(ZIEL), { recursive: true });
  await pdfSeite.pdf({
    path: ZIEL,
    format: 'A4',
    printBackground: true,
    margin: { top: '16mm', bottom: '18mm', left: '16mm', right: '16mm' },
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate:
      '<div style="width:100%;font-size:8pt;color:#6a675e;font-family:system-ui,sans-serif;padding:0 16mm;display:flex;justify-content:space-between">' +
      '<span>Schlüsselausgabe Außentore · KGV Grüner Winkel e.V.</span>' +
      '<span>Seite <span class="pageNumber"></span> von <span class="totalPages"></span></span>' +
      '</div>'
  });
  await pdfSeite.close();

  const groesse = (await fsp.stat(ZIEL)).size;
  console.log(`\n${path.relative(WURZEL, ZIEL)} — ${(groesse / 1024 / 1024).toFixed(1)} MB`);
} finally {
  await browser.close();
  server.close();
}

/* ------------------------------------------------------------ der Inhalt */

function anleitungHtml(b) {
  const bild = (name, unterschrift) =>
    b[name]
      ? `<figure><img src="${b[name]}" alt="${unterschrift}"><figcaption>${unterschrift}</figcaption></figure>`
      : '';

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><style>
  @page { size: A4; }
  * { box-sizing: border-box; }
  body {
    font: 12pt/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #1c1b18; margin: 0;
  }
  h1 { font-size: 26pt; line-height: 1.15; margin: 0 0 6pt; letter-spacing: -0.02em; }
  /* Kein erzwungener Seitenumbruch je Kapitel: das ergab 16 statt 12 Seiten,
     ohne dass es lesbarer wurde. break-after verhindert stattdessen, dass eine
     Ueberschrift allein am Seitenende stehen bleibt. */
  h2 {
    font-size: 15pt; margin: 22pt 0 8pt; color: #1f6b3a;
    border-top: 2px solid #2b8b4b; padding-top: 8pt; break-after: avoid;
  }
  h3 { font-size: 12.5pt; margin: 14pt 0 4pt; break-after: avoid; }
  p { margin: 0 0 8pt; }
  .vorspann { font-size: 13pt; color: #4a4740; margin-bottom: 4pt; }
  .kasten {
    background: #e6f3ea; border-left: 4px solid #2b8b4b;
    padding: 10pt 12pt; margin: 10pt 0; border-radius: 0 6px 6px 0;
    break-inside: avoid;
  }
  .achtung { background: #fdf4dd; border-left-color: #8a6a16; }
  .kasten p:last-child, ol p:last-child, ul p:last-child { margin-bottom: 0; }
  ol { margin: 0 0 8pt; padding-left: 20pt; }
  ol li { margin-bottom: 7pt; }
  ul { margin: 0 0 8pt; padding-left: 18pt; }
  ul li { margin-bottom: 4pt; }
  figure {
    margin: 10pt 0 14pt; break-inside: avoid; text-align: center;
  }
  figure img {
    max-width: 100%; max-height: ${MAX_BILDHOEHE_MM}mm;
    border: 1px solid #e2e0d8; border-radius: 8px;
  }
  figcaption { font-size: 9.5pt; color: #6a675e; margin-top: 4pt; }
  .schritt { break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; margin: 8pt 0 12pt; font-size: 11pt; }
  th, td { text-align: left; padding: 6pt 8pt; border-bottom: 1px solid #e2e0d8; vertical-align: top; }
  th { background: #f7f6f2; font-weight: 600; }
  code { background: #f7f6f2; padding: 1pt 4pt; border-radius: 3px; font-size: 10.5pt; }
</style></head><body>

<h1>Schlüsselausgabe Außentore</h1>
<p class="vorspann">Eine Anleitung für den Vorstand — KGV Grüner Winkel e.V.</p>
<p style="color:#6a675e;font-size:10.5pt">Stand ${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}</p>

<div class="kasten">
  <p><strong>Worum es geht.</strong> Alle Außentore haben neue Schlösser. 54 Gärten
  bekommen einen Schlüssel, insgesamt sind 60 Stück da. In dieser Liste halten wir
  fest, wer seinen Schlüssel bekommen hat und auf welchem Weg.</p>
  <p style="margin-top:6pt">Das ist kein Papierkram um seiner selbst willen: Wenn in
  einem halben Jahr jemand sagt, er habe nie einen Schlüssel bekommen, steht hier,
  wann er übergeben wurde und an wen — bei Hinterlegung und Post sogar mit Foto.</p>
</div>

<h2>1. Die Liste öffnen</h2>

<ol>
  <li><p>Im Browser aufrufen: <code>kgvgruenerwinkel.de</code></p></li>
  <li><p>Oben im Menü auf <strong>Vorstand</strong>, dann unten auf den grünen
  Knopf <strong>Vorstandsbereich</strong>.</p></li>
  <li><p>Den <strong>Zugangscode</strong> eingeben, den du persönlich bekommen hast.
  Den Namen darunter darfst du eintragen — er erscheint später bei deinen
  Einträgen, damit nachvollziehbar ist, wer was eingetragen hat.</p></li>
  <li><p>Auf <strong>Zur Schlüsselliste</strong> tippen.</p></li>
</ol>

${bild('codeabfrage', 'So sieht die Abfrage des Zugangscodes aus.')}

<div class="kasten achtung">
  <p><strong>Den Code nicht weitergeben.</strong> Nicht per WhatsApp, nicht per
  E-Mail, und niemals zusammen mit dem Link. Wer beides hat, sieht alle Namen,
  Adressen und Fotos.</p>
</div>

<div class="kasten">
  <p><strong>Tipp fürs Handy.</strong> Lege die Seite einmal auf den
  Startbildschirm — beim iPhone über das Teilen-Symbol, bei Android über das
  Menü mit den drei Punkten. Sonst vergisst der Browser den Code nach ein bis
  zwei Wochen und du musst ihn neu eingeben.</p>
</div>

<h2>2. Was du auf einen Blick siehst</h2>

<p>Ganz oben stehen vier Zahlen. Sie beantworten die Fragen, die in jeder
Vorstandssitzung kommen.</p>

${bild('uebersicht', 'Oben: wie viele Gärten versorgt sind und wie viele Schlüssel noch da sind.')}

<table>
  <tr><th>Gärten versorgt</th><td>Wie viele der 54 Gärten ihren Schlüssel haben</td></tr>
  <tr><th>noch offen</th><td>Wie viele noch fehlen</td></tr>
  <tr><th>Schlüssel ausgegeben</th><td>Wie viele der 60 Schlüssel raus sind</td></tr>
  <tr><th>Schlüssel übrig</th><td>Wie viele noch im Schrank liegen</td></tr>
</table>

<p>Darunter kommt die Liste: eine Zeile je Garten, die Gartennummer steht vorn.
Grün heißt erledigt, grau heißt offen.</p>

${bild('liste', 'Jede Zeile zeigt in einem Satz, was mit dem Schlüssel passiert ist.')}

<h2>3. Eine Übergabe eintragen</h2>

<div class="schritt">
  <h3>Schritt 1: Zeile antippen</h3>
  <p>Tippe auf die Zeile des Gartens. Sie klappt auf.</p>
  ${bild('zeile_auf', 'Die aufgeklappte Zeile. Noch ist nichts eingetragen.')}
</div>

<div class="schritt">
  <h3>Schritt 2: Haken setzen</h3>
  <p>Setze den Haken bei <strong>„hat einen Schlüssel bekommen"</strong>. Erst
  danach erscheinen die weiteren Fragen — vorher gibt es nichts auszufüllen.</p>
</div>

<div class="schritt">
  <h3>Schritt 3: Den Weg auswählen</h3>
  <p>Jetzt fragt die Liste, wie der Schlüssel übergeben wurde. Es gibt drei
  Möglichkeiten, und je nach Wahl kommen unterschiedliche Felder.</p>
  ${bild('rollout', 'Die drei Wege. Tippe den an, der zutrifft.')}
</div>

<h2>4. Die drei Wege im Einzelnen</h2>

<div class="schritt">
  <h3>Persönlich übergeben</h3>
  <p>Du hast den Schlüssel jemandem in die Hand gedrückt. Eintragen:
  <strong>Name der Person</strong> und <strong>Datum</strong>. Das Datum ist
  schon auf heute eingestellt.</p>
  <p>Ein Foto wird hier nicht verlangt — der Name ist der Nachweis.</p>
  ${bild('persoenlich', 'Bei persönlicher Übergabe genügen Name und Datum.')}
</div>

<div class="schritt">
  <h3>Hinterlegt</h3>
  <p>Du hast den Schlüssel irgendwo hingelegt. Eintragen: <strong>wo genau</strong>,
  das <strong>Datum</strong> — und ein <strong>Foto vom Ort</strong>.</p>
  <p>Schreibe die Stelle so genau, dass die Person sie ohne Rückfrage findet.
  „Im Gerätehaus" ist zu wenig. „Im Gerätehaus, oberes Regal links, brauner
  Umschlag" ist gut.</p>
  ${bild('hinterlegt', 'Bei Hinterlegung: genaue Stelle und ein Foto davon.')}
</div>

<div class="schritt">
  <h3>Per Post geschickt</h3>
  <p>Eintragen: <strong>Empfangsadresse</strong>, <strong>wann abgeschickt</strong>
  — und ein <strong>Foto</strong> vom Brief oder vom Einwurf in den Briefkasten.</p>
  ${bild('post', 'Beim Postversand: Adresse, Datum und ein Foto als Beleg.')}
</div>

<div class="kasten">
  <p><strong>Das Foto machst du direkt aus der Liste heraus.</strong> Tippe auf
  <strong>Foto aufnehmen</strong> — das Handy öffnet sofort die Kamera. Das Bild
  wird automatisch verkleinert, es verbraucht also kaum Datenvolumen.</p>
</div>

<h2>5. Speichern</h2>

<p>Zum Schluss auf <strong>Speichern</strong>. Die Zeile klappt zu und zeigt von
nun an in einem Satz, was passiert ist.</p>

<p>Fehlt eine Pflichtangabe, sagt die Liste genau, welche. Gespeichert wird dann
noch nicht.</p>

${bild('fehlermeldung', 'Fehlt etwas, erscheint ein deutlicher Hinweis.')}

<div class="kasten">
  <p><strong>Nichts geht verloren, nichts wird doppelt.</strong> Alle sehen
  dieselbe Liste. Wenn zwei Leute gleichzeitig arbeiten, stört das nicht —
  jeder bearbeitet seine eigene Zeile.</p>
  <p style="margin-top:6pt">Mit <strong>Abbrechen</strong> verwirfst du deine
  Eingabe. Was vorher gespeichert war, bleibt unverändert.</p>
</div>

<h2>6. Etwas wiederfinden</h2>

<p>Mit dem Suchfeld findest du eine Zeile über die <strong>Gartennummer</strong>,
einen <strong>Namen</strong>, eine <strong>Adresse</strong> oder einen
<strong>Ort</strong>.</p>

<p>Darunter liegen die Filter:</p>

${bild('filter', 'Die Filter schränken die Liste auf das Wesentliche ein.')}

<table>
  <tr><th>Offen</th><td>Alle Gärten, die noch keinen Schlüssel haben</td></tr>
  <tr><th>Erledigt</th><td>Alle, die versorgt sind</td></tr>
  <tr><th>Persönlich / Hinterlegt / Post</th><td>Nur ein bestimmter Weg</td></tr>
  <tr><th>Foto fehlt</th><td>Übergaben, bei denen der Nachweis noch aussteht</td></tr>
</table>

<div class="kasten achtung">
  <p><strong>„Foto fehlt" ist der wichtigste Filter.</strong> Er zeigt alle
  Hinterlegungen und Postsendungen ohne Beleg. Schau da ab und zu hinein und
  reiche die Fotos nach, solange du dich noch erinnerst, wo der Schlüssel lag.</p>
</div>

<h2>7. Eine Sicherung ziehen</h2>

<p>Ganz unten liegt der Knopf <strong>Als ZIP für Proton Drive</strong>. Er packt
den kompletten Stand in eine Datei: eine Tabelle zum Öffnen in Excel, die
Rohdaten und alle Fotos.</p>

${bild('sichern', 'Unten: Sicherung ziehen und Liste neu laden.')}

<p>Diese eine Datei lädst du in den Proton Drive hoch. Sinnvoll einmal pro Woche
während der Ausgabe — und ein letztes Mal, wenn alle 54 Gärten versorgt sind.</p>

<h2>8. Wenn etwas nicht klappt</h2>

<table>
  <tr><th>Es fragt wieder nach dem Code</th>
      <td>Der Browser hat ihn vergessen. Einfach neu eingeben. Seite auf den
      Startbildschirm legen, dann passiert es nicht mehr.</td></tr>
  <tr><th>„Zugangscode stimmt nicht"</th>
      <td>Vertippt, oder ein Leerzeichen am Ende. Noch einmal versuchen.</td></tr>
  <tr><th>„Zu viele Fehlversuche"</th>
      <td>Schutz gegen Fremde. Nach 15 Minuten geht es wieder.</td></tr>
  <tr><th>„Keine Verbindung"</th>
      <td>Kein Internet. Im Garten kommt das vor — später noch einmal
      versuchen, die Eingabe ist dann nicht gespeichert.</td></tr>
  <tr><th>Beim Foto steht „Vorschau abgelaufen"</th>
      <td>Nur die Anzeige ist abgelaufen, das Foto ist da. Seite neu laden.</td></tr>
</table>

<div class="kasten achtung">
  <p><strong>Zum Schluss, weil es wichtig ist:</strong> In dieser Liste stehen
  Namen, Anschriften und Fotos von Mitgliedern. Sie gehört in den Vorstand und
  sonst nirgendwohin. Wenn die Ausgabe abgeschlossen ist, ziehen wir die
  Sicherung und löschen die Liste.</p>
</div>

</body></html>`;
}
