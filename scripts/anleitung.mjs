/* Erzeugt die bebilderte Kurzanleitung — als PDF und als Word-Datei.
 *
 * Die Bilder entstehen frisch bei jedem Lauf — aus der Anwendung selbst, nicht
 * aus abgelegten Dateien. Damit kann die Anleitung nicht unbemerkt veralten:
 * wird die Oberflaeche geaendert, zeigt der naechste Lauf den neuen Stand.
 *
 * Der Text steht in scripts/anleitung-inhalt.mjs und wird von beiden Ausgaben
 * benutzt. Stuende er zweimal da, liefen PDF und Word-Datei beim ersten
 * Nachtragen auseinander.
 *
 * Die Aufnahmen laufen im Vorfuehrbetrieb (?demo) mit erfundenen Beispieldaten.
 * In einer Anleitung, die herumgereicht wird, haben echte Mitgliedernamen und
 * Adressen nichts zu suchen.
 *
 * Aufruf:  node scripts/anleitung.mjs
 * Ergebnis: docs/Anleitung-Schluesselliste.pdf
 *           docs/Anleitung-Schluesselliste.docx   (zum Selberaendern)
 *           dist/anleitung.html                   (zum Durchsehen im Browser)
 */

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TITEL,
  UNTERTITEL,
  SCHRITTE,
  STOERUNGEN,
  STOERUNGEN_TITEL,
  SCHLUSSHINWEIS,
  inlineTeile,
  stand
} from './anleitung-inhalt.mjs';
import { wordSchreiben } from './anleitung-word.mjs';
import { wordPruefen } from './anleitung-pruefen.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8397;
const ZIEL_PDF = path.join(WURZEL, 'docs', 'Anleitung-Schluesselliste.pdf');
const ZIEL_DOCX = path.join(WURZEL, 'docs', 'Anleitung-Schluesselliste.docx');

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

/* name -> { daten: Buffer, breite, hoehe } */
const bilder = {};

/* Breite und Hoehe stehen im PNG-Kopf (IHDR), ab Byte 16. */
const masse = (p) => ({ breite: p.readUInt32BE(16), hoehe: p.readUInt32BE(20) });

async function schuss(name, ziel) {
  const daten = await (typeof ziel === 'string' ? seite.locator(ziel) : ziel).screenshot();
  const { breite, hoehe } = masse(daten);

  /* In der Bildspalte wird jede Aufnahme auf dieselbe Breite gebracht. Wie hoch
     sie dabei wird, entscheidet der Ausschnitt — und ein zu hohes Bild sprengt
     die Seite. Das faellt hier sofort auf, am fertigen PDF nicht. */
  const gedrucktHoch = BILDSPALTE_MM * (hoehe / breite);

  bilder[name] = { daten, breite, hoehe };
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

  await seite.goto(`http://localhost:${PORT}/index.html?demo`);
  await seite.waitForSelector('.garten', { timeout: 10_000 });
  await seite.evaluate(() => document.querySelector('.demoband')?.remove());
  await schuss('zahlen', '.zahlen');

  let g = await frischeZeile();
  await nurZeigen(['.schalter']);
  await schuss('haken', g.locator('.form'));

  g = await frischeZeile();
  await g.locator('.schalter input').check();
  await g.locator('.rollout').waitFor();
  await schuss('rollout', g.locator('.rollout'));

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

  g = await frischeZeile();
  await g.locator('.schalter input').check();
  await g.locator('.rollout .wahl', { hasText: 'Persönlich' }).click();
  await seite.waitForTimeout(150);
  await g.locator('button.haupt', { hasText: 'Speichern' }).click();
  await g.locator('.meldung.fehler').waitFor({ timeout: 5000 });
  await schuss('fehler', g.locator('.meldung.fehler'));

  await seite.goto(`http://localhost:${PORT}/index.html?demo`);
  await seite.waitForSelector('.garten');
  await seite.evaluate(() => document.querySelector('.demoband')?.remove());
  await schuss('filter', '.filter');
  await schuss('sichern', '.fuss');

  /* Jedes aufgenommene Bild muss auch gebraucht werden — sonst nimmt der Lauf
     stillschweigend Arbeit auf sich, die niemand sieht. */
  const gebraucht = new Set(SCHRITTE.map((s) => s.bild).filter(Boolean));
  const ungenutzt = Object.keys(bilder).filter((n) => !gebraucht.has(n));
  const fehlend = [...gebraucht].filter((n) => !bilder[n]);
  if (ungenutzt.length) console.error(`  ACHTUNG: nicht verwendet — ${ungenutzt.join(', ')}`);
  if (fehlend.length) {
    console.error(`  ACHTUNG: fehlt — ${fehlend.join(', ')}`);
    process.exitCode = 1;
  }

  console.log('\nPDF bauen …');
  const html = anleitungHtml(bilder);

  await fsp.mkdir(path.join(WURZEL, 'dist'), { recursive: true });
  await fsp.writeFile(path.join(WURZEL, 'dist', 'anleitung.html'), html);

  const pdfSeite = await browser.newPage();
  await pdfSeite.setContent(html, { waitUntil: 'load' });
  await fsp.mkdir(path.dirname(ZIEL_PDF), { recursive: true });

  /* Erst daneben schreiben, dann umbenennen. Unter Windows sperrt ein offener
     PDF-Betrachter die Zieldatei — ohne diesen Umweg bricht der ganze Lauf mit
     EBUSY ab, nachdem die Bilder schon aufgenommen wurden. */
  const zwischen = `${ZIEL_PDF}.neu`;
  await pdfSeite.pdf({
    path: zwischen,
    format: 'A4',
    printBackground: true,
    margin: { top: '15mm', bottom: '17mm', left: '15mm', right: '15mm' },
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate:
      '<div style="width:100%;font-size:8pt;color:#6a675e;font-family:system-ui,sans-serif;padding:0 15mm;display:flex;justify-content:space-between">' +
      `<span>${TITEL} · KGV Grüner Winkel e.V.</span>` +
      '<span><span class="pageNumber"></span>/<span class="totalPages"></span></span>' +
      '</div>'
  });
  await pdfSeite.close();
  await ersetzen(zwischen, ZIEL_PDF);

  const b = await fsp.readFile(ZIEL_PDF);
  const seiten = (b.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log(
    `  ${path.relative(WURZEL, ZIEL_PDF)} — ${seiten} Seiten, ${(b.length / 1024 / 1024).toFixed(1)} MB`
  );

  console.log('\nWord-Datei bauen …');
  const zwischenDocx = `${ZIEL_DOCX}.neu`;
  const groesse = await wordSchreiben(bilder, zwischenDocx);

  /* Vor dem Umbenennen hineinschauen: eine kaputte Word-Datei faellt sonst
     erst dem auf, der sie oeffnet. */
  const ergebnisse = await wordPruefen(zwischenDocx);
  const fehlgeschlagen = ergebnisse.filter((e) => !e.ok);
  for (const e of fehlgeschlagen) console.error(`  FEHL ${e.was}`);
  console.log(
    `  ${ergebnisse.length - fehlgeschlagen.length} von ${ergebnisse.length} Prüfungen bestanden`
  );
  if (fehlgeschlagen.length) process.exitCode = 1;

  await ersetzen(zwischenDocx, ZIEL_DOCX);
  console.log(
    `  ${path.relative(WURZEL, ZIEL_DOCX)} — ${(groesse / 1024 / 1024).toFixed(1)} MB`
  );
} finally {
  await browser.close();
  server.close();
}

/* Gesperrte Zieldatei (offener Betrachter) nicht den ganzen Lauf kosten lassen. */
async function ersetzen(von, nach) {
  try {
    await fsp.rename(von, nach);
  } catch (e) {
    if (e.code === 'EBUSY' || e.code === 'EPERM') {
      console.error(
        `\nDie Zieldatei ${path.basename(nach)} ist gesperrt — vermutlich gerade geöffnet.` +
          `\nDie neue Fassung liegt als ${path.basename(von)}. Programm schließen und erneut aufrufen.`
      );
      process.exitCode = 1;
      return;
    }
    throw e;
  }
}

/* ------------------------------------------------------------ der Inhalt */

function anleitungHtml(b) {
  const alsHtml = (text) =>
    inlineTeile(text)
      .map((t) => {
        const sicher = t.text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/`([^`]+)`/g, '<code>$1</code>');
        return t.fett ? `<strong>${sicher}</strong>` : sicher;
      })
      .join('');

  const datenUri = (name) =>
    b[name] ? `data:image/png;base64,${b[name].daten.toString('base64')}` : null;

  const schritt = (s) => {
    const quelle = s.bild ? datenUri(s.bild) : null;
    return `
    <section class="schritt${quelle ? '' : ' ohne-bild'}">
      ${quelle ? `<div class="bild"><img src="${quelle}" alt=""></div>` : ''}
      <div class="text">
        <h2><span class="nr">${s.nr}</span>${s.titel}</h2>
        ${s.absaetze.map((a) => `<p>${alsHtml(a)}</p>`).join('')}
        ${s.merke ? `<p class="merke">${alsHtml(s.merke)}</p>` : ''}
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

<h1>${TITEL}</h1>
<p class="unterzeile">${UNTERTITEL} · Stand ${stand()}</p>

${SCHRITTE.map(schritt).join('')}

<div class="schluss">
  <h2>${STOERUNGEN_TITEL}</h2>
  <table>
    ${STOERUNGEN.map(([a, c]) => `<tr><td>${alsHtml(a)}</td><td>${alsHtml(c)}</td></tr>`).join('')}
  </table>
  <p class="merke" style="margin-top:8pt">${alsHtml(SCHLUSSHINWEIS)}</p>
</div>

</body></html>`;
}
