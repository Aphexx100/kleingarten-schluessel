/* Erzeugt die bebilderte Kurzanleitung als PDF.
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
 * Ergebnis: docs/Anleitung-Schluesselliste.pdf
 *           dist/anleitung.html  (zum Durchsehen im Browser)
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

/* Bild links, Text rechts. Die Bildspalte ist schmal, darum duerfen die
   Aufnahmen nicht beliebig hoch sein — sonst steht neben einem sehr langen
   Bild eine halbe Zeile Text und der Rest der Seite bleibt leer. */
const BILDSPALTE_MM = 68;
const MAX_BILDHOEHE_MM = 130;

const TYPEN = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

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

const seite = await browser.newPage({
  viewport: { width: 400, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'dark'
});

const bilder = {};

/* Breite und Hoehe stehen im PNG-Kopf (IHDR), ab Byte 16. */
const masse = (p) => ({ breite: p.readUInt32BE(16), hoehe: p.readUInt32BE(20) });

async function schuss(name, ziel) {
  const puffer = await (typeof ziel === 'string' ? seite.locator(ziel) : ziel).screenshot();
  const { breite, hoehe } = masse(puffer);

  /* In der Bildspalte wird jede Aufnahme auf dieselbe Breite gebracht. Wie hoch
     sie dabei wird, entscheidet der Ausschnitt — und ein zu hohes Bild sprengt
     die Seite. Das faellt hier sofort auf, am fertigen PDF nicht. */
  const gedrucktHoch = BILDSPALTE_MM * (hoehe / breite);

  bilder[name] = `data:image/png;base64,${puffer.toString('base64')}`;
  console.log(
    `  ${name.padEnd(13)} ${String(breite).padStart(4)}×${String(hoehe).padEnd(5)}` +
      ` → ${gedrucktHoch.toFixed(0)} mm hoch`
  );

  if (gedrucktHoch > MAX_BILDHOEHE_MM) {
    console.error(
      `        ACHTUNG: ${name} wuerde ${gedrucktHoch.toFixed(0)} mm hoch ` +
        `(erlaubt sind ${MAX_BILDHOEHE_MM} mm). Ausschnitt enger fassen.`
    );
    process.exitCode = 1;
  }
}

/* Teile ausblenden, die ein vorheriger Schritt schon gezeigt hat. So bleibt
   vom Formular nur das uebrig, worum es gerade geht. */
async function nurZeigen(behalten) {
  await seite.evaluate((auswahl) => {
    const form = document.querySelector('.garten.auf .form');
    if (!form) return;
    [...form.children].forEach((kind) => {
      const bleibt = auswahl.some((w) => kind.matches(w) || kind.querySelector(w));
      kind.style.display = bleibt ? '' : 'none';
    });
  }, behalten);
}

async function frischeZeile(nr = 3) {
  await seite.goto(`http://localhost:${PORT}/index.html?demo`);
  await seite.waitForSelector('.garten', { timeout: 10_000 });
  await seite.evaluate(() => document.querySelector('.demoband')?.remove());
  const g = seite.locator('.garten').nth(nr - 1);
  await g.locator('.zeile').click();
  await g.locator('.form').waitFor();
  return g;
}

try {
  console.log('Bilder aufnehmen …');

  /* ---------------------------------------------------- Liste und Zahlen */
  await seite.goto(`http://localhost:${PORT}/index.html?demo`);
  await seite.waitForSelector('.garten', { timeout: 10_000 });
  await seite.evaluate(() => document.querySelector('.demoband')?.remove());
  await schuss('zahlen', '.zahlen');

  /* ------------------------------------------------------ Zeile und Weg */
  let g = await frischeZeile();
  await nurZeigen(['.schalter']);
  await schuss('haken', g.locator('.form'));

  g = await frischeZeile();
  await g.locator('.schalter input').check();
  await g.locator('.rollout').waitFor();
  await schuss('rollout', g.locator('.rollout'));

  /* ------------------------------------------------ die drei Wege einzeln */
  const wege = [
    {
      name: 'persoenlich',
      wahl: 'Persönlich',
      fuellen: (z) => z.locator('input[type="text"]').first().fill('Heinz Brandt')
    },
    {
      name: 'hinterlegt',
      wahl: 'Hinterlegt',
      fuellen: (z) =>
        z.locator('textarea').first().fill('Im Gerätehaus, oberes Regal links, brauner Umschlag')
    },
    {
      name: 'post',
      wahl: 'Post',
      fuellen: (z) => z.locator('textarea').first().fill('Marianne Voss\nLindenstraße 14\n45127 Essen')
    }
  ];

  for (const weg of wege) {
    g = await frischeZeile();
    await g.locator('.schalter input').check();
    await g.locator('.rollout .wahl', { hasText: weg.wahl }).click();
    await seite.waitForTimeout(150);
    await weg.fuellen(g);
    /* Haken, Anzahl und Auswahl weglassen — die stehen im Schritt davor. */
    await nurZeigen(['.feld', '.fotos']);
    await schuss(weg.name, g.locator('.form'));
  }

  /* ----------------------------------------------------- fehlende Angabe */
  g = await frischeZeile();
  await g.locator('.schalter input').check();
  await g.locator('.rollout .wahl', { hasText: 'Persönlich' }).click();
  await seite.waitForTimeout(150);
  await g.locator('button.haupt', { hasText: 'Speichern' }).click();
  await g.locator('.meldung.fehler').waitFor({ timeout: 5000 });
  await schuss('fehler', g.locator('.meldung.fehler'));

  /* ------------------------------------------------------ Suche und Fuss */
  await seite.goto(`http://localhost:${PORT}/index.html?demo`);
  await seite.waitForSelector('.garten');
  await seite.evaluate(() => document.querySelector('.demoband')?.remove());
  await schuss('filter', '.filter');
  await schuss('sichern', '.fuss');

  console.log('\nPDF bauen …');
  const html = anleitungHtml(bilder);

  await fsp.mkdir(path.join(WURZEL, 'dist'), { recursive: true });
  await fsp.writeFile(path.join(WURZEL, 'dist', 'anleitung.html'), html);

  const pdfSeite = await browser.newPage();
  await pdfSeite.setContent(html, { waitUntil: 'load' });
  await fsp.mkdir(path.dirname(ZIEL), { recursive: true });

  /* Erst daneben schreiben, dann umbenennen. Unter Windows sperrt ein offener
     PDF-Betrachter die Zieldatei — ohne diesen Umweg bricht der ganze Lauf mit
     EBUSY ab, nachdem die Bilder schon aufgenommen wurden. */
  const zwischen = `${ZIEL}.neu`;
  await pdfSeite.pdf({
    path: zwischen,
    format: 'A4',
    printBackground: true,
    margin: { top: '15mm', bottom: '17mm', left: '15mm', right: '15mm' },
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate:
      '<div style="width:100%;font-size:8pt;color:#6a675e;font-family:system-ui,sans-serif;padding:0 15mm;display:flex;justify-content:space-between">' +
      '<span>Schlüsselausgabe Außentore · KGV Grüner Winkel e.V.</span>' +
      '<span><span class="pageNumber"></span>/<span class="totalPages"></span></span>' +
      '</div>'
  });
  await pdfSeite.close();

  try {
    await fsp.rename(zwischen, ZIEL);
  } catch (e) {
    if (e.code === 'EBUSY' || e.code === 'EPERM') {
      console.error(
        `\nDie Zieldatei ist gesperrt — vermutlich ist sie gerade in einem ` +
          `PDF-Betrachter geöffnet.\nDas neue PDF liegt als ${path.relative(WURZEL, zwischen)}.\n` +
          `Betrachter schließen und den Aufruf wiederholen.`
      );
      process.exit(1);
    }
    throw e;
  }

  const b = await fsp.readFile(ZIEL);
  const seiten = (b.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log(
    `\n${path.relative(WURZEL, ZIEL)} — ${seiten} Seiten, ${(b.length / 1024 / 1024).toFixed(1)} MB`
  );
} finally {
  await browser.close();
  server.close();
}

/* ------------------------------------------------------------ der Inhalt */

function anleitungHtml(b) {
  /* Ein Schritt: Bild links, kurzer Text rechts. */
  const schritt = (nr, titel, bildname, text) => {
    const bild = b[bildname];
    /* Ohne Bild ueber die volle Breite — eine leere Bildspalte sieht aus wie
       ein fehlendes Bild. */
    return `
    <section class="schritt${bild ? '' : ' ohne-bild'}">
      ${bild ? `<div class="bild"><img src="${bild}" alt=""></div>` : ''}
      <div class="text">
        <h2><span class="nr">${nr}</span>${titel}</h2>
        ${text}
      </div>
    </section>`;
  };

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><style>
  @page { size: A4; }
  * { box-sizing: border-box; }
  body {
    font: 11pt/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #1c1b18; margin: 0;
  }
  h1 { font-size: 20pt; margin: 0 0 2pt; letter-spacing: -0.02em; }
  .unterzeile { color: #6a675e; font-size: 10pt; margin: 0 0 14pt; }

  .schritt {
    display: grid; grid-template-columns: ${BILDSPALTE_MM}mm 1fr;
    gap: 7mm; align-items: start;
    padding: 7pt 0; border-top: 1px solid #e2e0d8;
    break-inside: avoid;
  }
  .schritt.ohne-bild { grid-template-columns: 1fr; }
  .bild img {
    width: 100%; border-radius: 6px; display: block;
    border: 1px solid #3a3d44;
  }
  .text { padding-top: 1pt; }
  h2 {
    font-size: 12.5pt; margin: 0 0 5pt; color: #1f6b3a;
    display: flex; align-items: baseline; gap: 7pt;
  }
  h2 .nr {
    flex: 0 0 auto; width: 17pt; height: 17pt; border-radius: 50%;
    background: #1f6b3a; color: #fff; font-size: 9.5pt;
    display: inline-grid; place-items: center; font-weight: 600;
  }
  p { margin: 0 0 5pt; }
  p:last-child { margin-bottom: 0; }
  strong { color: #14361f; }
  .merke {
    background: #fdf4dd; border-left: 3px solid #8a6a16;
    padding: 6pt 9pt; margin: 6pt 0 0; font-size: 10pt;
  }
  .schluss {
    margin-top: 12pt; border-top: 2px solid #2b8b4b; padding-top: 8pt;
    font-size: 10pt; break-inside: avoid;
  }
  .schluss h2 { font-size: 11.5pt; margin-bottom: 3pt; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  td { padding: 3.5pt 6pt 3.5pt 0; border-bottom: 1px solid #ededea; vertical-align: top; }
  td:first-child { white-space: nowrap; font-weight: 600; width: 48mm; }
  code { background: #f2f1ec; padding: 1pt 3pt; border-radius: 3px; }
</style></head><body>

<h1>Schlüsselausgabe Außentore</h1>
<p class="unterzeile">Kurzanleitung für den Vorstand · Stand ${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}</p>

${schritt(1, 'Liste öffnen', null, `
  <p><code>kgvgruenerwinkel.de</code> → Menü <strong>Vorstand</strong> → Knopf
  <strong>Vorstandsbereich</strong> → Zugangscode eingeben →
  <strong>Zur Schlüsselliste</strong>.</p>
  <p class="merke">Den Code nie zusammen mit dem Link verschicken. Seite einmal auf
  den Startbildschirm legen, sonst vergisst der Browser den Code nach ein, zwei
  Wochen.</p>`)}

${schritt(2, 'Oben: der Stand', 'zahlen', `
  <p>Versorgte Gärten, offene Gärten, ausgegebene und übrige Schlüssel.</p>`)}

${schritt(3, 'Zeile antippen', 'haken', `
  <p>Garten antippen, dann den Haken setzen. Erst danach kommen die weiteren
  Fragen.</p>`)}

${schritt(4, 'Weg auswählen', 'rollout', `
  <p>Antippen, wie der Schlüssel übergeben wurde. Je nach Wahl erscheinen
  unterschiedliche Felder.</p>`)}

${schritt(5, 'Persönlich übergeben', 'persoenlich', `
  <p>Name der Person und Datum. Kein Foto nötig — der Name ist der Nachweis.</p>`)}

${schritt(6, 'Hinterlegt', 'hinterlegt', `
  <p>Wo genau, Datum, <strong>Foto vom Ort</strong>. So genau beschreiben, dass
  die Person ohne Rückfrage hinfindet.</p>`)}

${schritt(7, 'Per Post', 'post', `
  <p>Adresse, Datum des Abschickens, <strong>Foto</strong> vom Brief oder vom
  Einwurf.</p>
  <p class="merke"><strong>Foto aufnehmen</strong> öffnet direkt die Kamera. Das
  Bild wird automatisch verkleinert.</p>`)}

${schritt(8, 'Speichern', 'fehler', `
  <p>Auf <strong>Speichern</strong> tippen. Fehlt etwas, sagt die Liste welches
  Feld — gespeichert wird dann noch nicht. <strong>Abbrechen</strong> verwirft
  die Eingabe.</p>`)}

${schritt(9, 'Suchen und filtern', 'filter', `
  <p>Suchfeld: Gartennummer, Name, Ort oder Adresse.</p>
  <p><strong>Foto fehlt</strong> zeigt die Übergaben, bei denen der Nachweis noch
  aussteht. Da regelmäßig hineinschauen.</p>`)}

${schritt(10, 'Sicherung ziehen', 'sichern', `
  <p><strong>Als ZIP für Proton Drive</strong> packt Tabelle und alle Fotos in
  eine Datei. Einmal pro Woche, und am Ende der Ausgabe.</p>`)}

<div class="schluss">
  <h2>Wenn etwas klemmt</h2>
  <table>
    <tr><td>Fragt wieder nach dem Code</td><td>Browser hat ihn vergessen — neu eingeben.</td></tr>
    <tr><td>„Zugangscode stimmt nicht"</td><td>Vertippt oder Leerzeichen am Ende.</td></tr>
    <tr><td>„Zu viele Fehlversuche"</td><td>Nach 15 Minuten geht es wieder.</td></tr>
    <tr><td>„Keine Verbindung"</td><td>Kein Internet. Eingabe ist nicht gespeichert.</td></tr>
    <tr><td>„Vorschau abgelaufen"</td><td>Nur die Anzeige. Seite neu laden.</td></tr>
  </table>
  <p class="merke" style="margin-top:8pt">Die Liste enthält Namen, Anschriften und
  Fotos von Mitgliedern. Sie gehört in den Vorstand und sonst nirgendwohin.</p>
</div>

</body></html>`;
}
