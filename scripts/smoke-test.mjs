/* Rauchtest im echten Browser, im Vorfuehrbetrieb (?demo) — ohne Server,
 * ohne Datenbank, ohne Zugangscode.
 *
 * Geprueft wird der Weg, den der Vorstand tatsaechlich geht: Liste ansehen,
 * eine Uebergabe eintragen, das Rollout wechseln, Pflichtfelder vergessen,
 * suchen, filtern, exportieren.
 *
 * Aufruf:  node scripts/smoke-test.mjs
 */

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8396;

const TYPEN = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

const server = http.createServer((req, res) => {
  const angefragt = decodeURIComponent(req.url.split('?')[0]);
  const datei = path.join(WURZEL, angefragt === '/' ? 'index.html' : angefragt);
  if (!datei.startsWith(WURZEL)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(datei, (err, buf) => {
    if (err) {
      res.writeHead(404).end('nicht gefunden');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPEN[path.extname(datei)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(buf);
  });
});

let bestanden = 0;
const fehlgeschlagen = [];

async function pruefe(was, vorgang) {
  try {
    await vorgang();
    bestanden++;
    console.log(`  ok   ${was}`);
  } catch (e) {
    fehlgeschlagen.push(was);
    console.error(`  FEHL ${was}\n       ${e.message.split('\n')[0]}`);
  }
}

function gleich(ist, soll, was) {
  if (String(ist) !== String(soll)) {
    throw new Error(`${was}: erwartet "${soll}", bekommen "${ist}"`);
  }
}

await new Promise((fertig) => server.listen(PORT, fertig));
const browser = await chromium.launch();

try {
  const seite = await browser.newPage({ viewport: { width: 420, height: 900 } });

  /* Fehler aus dem Browser sind Testfehler: eine Ausnahme in einem Modul darf
     nicht unbemerkt bleiben, nur weil die Seite trotzdem etwas anzeigt. */
  const konsolenfehler = [];
  seite.on('pageerror', (e) => konsolenfehler.push(e.message));
  seite.on('console', (m) => {
    if (m.type() === 'error') konsolenfehler.push(m.text());
  });

  await seite.goto(`http://localhost:${PORT}/index.html?demo`);
  await seite.waitForSelector('.garten', { timeout: 10_000 });

  console.log('\nListe und Zahlen');

  await pruefe('54 Gaerten stehen in der Liste', async () => {
    gleich(await seite.locator('.garten').count(), 54, 'Anzahl Zeilen');
  });

  await pruefe('der Vorfuehrbetrieb ist als solcher gekennzeichnet', async () => {
    if (!(await seite.locator('.demoband').isVisible())) throw new Error('Kein Hinweisband');
  });

  await pruefe('die Kacheln zeigen den Ausgangsstand', async () => {
    const werte = await seite.locator('.kachel .wert').allTextContents();
    gleich(werte[0], '5/54', 'versorgte Gaerten');
    gleich(werte[1], '49', 'offene Gaerten');
    gleich(werte[2], '6/60', 'ausgegebene Schluessel');
    gleich(werte[3], '54', 'uebrige Schluessel');
  });

  await pruefe('eine erledigte Zeile fasst die Uebergabe zusammen', async () => {
    const zeile = seite.locator('.garten', { has: seite.locator('.nr', { hasText: /^1$/ }) }).first();
    const text = await zeile.locator('.zusammenfassung').textContent();
    if (!text.includes('Anna Berger')) throw new Error(`Zusammenfassung: "${text}"`);
  });

  await pruefe('eine Hinterlegung ohne Foto wird markiert', async () => {
    const zeile = seite.locator('.garten').nth(11); // Garten 12
    gleich(await zeile.locator('.marke:not(.karte)').textContent(), 'Foto fehlt', 'Marke an Garten 12');
  });

  console.log('\nEine persoenliche Uebergabe eintragen');

  const garten3 = seite.locator('.garten').nth(2);

  await pruefe('die Zeile klappt auf', async () => {
    await garten3.locator('.zeile').click();
    await garten3.locator('.form').waitFor({ timeout: 3000 });
  });

  await pruefe('ohne Haken fragt das Formular nichts weiter', async () => {
    gleich(await garten3.locator('.rollout').count(), 0, 'Rollout noch verborgen');
  });

  await pruefe('der Haken bringt das Rollout mit drei Wahlmoeglichkeiten', async () => {
    await garten3.locator('.schalter.schluessel input').check();
    await garten3.locator('.rollout').waitFor({ timeout: 3000 });
    gleich(await garten3.locator('.rollout .wahl').count(), 3, 'Wahlmoeglichkeiten');
  });

  await pruefe('bei persoenlicher Uebergabe erscheinen Name und Datum', async () => {
    await garten3.locator('.rollout .wahl', { hasText: 'Persönlich' }).click();
    await garten3.locator('textarea, input[type="text"]').first().waitFor({ timeout: 3000 });
    const beschriftungen = await garten3.locator('.form label').allTextContents();
    if (!beschriftungen.some((t) => /An wen/.test(t))) {
      throw new Error(`Kein Namensfeld: ${beschriftungen.join(' | ')}`);
    }
    if (!beschriftungen.some((t) => /Datum der Übergabe/.test(t))) {
      throw new Error('Keine Datumsbeschriftung fuer die Uebergabe');
    }
  });

  await pruefe('das Datum ist mit dem heutigen vorbelegt', async () => {
    const wert = await garten3.locator('input[type="date"]').inputValue();
    gleich(wert, new Date().toISOString().slice(0, 10), 'vorbelegtes Datum');
  });

  await pruefe('bei persoenlicher Uebergabe wird kein Foto verlangt', async () => {
    gleich(await garten3.locator('.fotos').count(), 0, 'Fotobereich');
  });

  await pruefe('ohne Namen weigert sich das Speichern mit klarer Ansage', async () => {
    await garten3.locator('button.haupt', { hasText: 'Speichern' }).click();
    const meldung = garten3.locator('.meldung.fehler');
    await meldung.waitFor({ timeout: 3000 });
    const text = await meldung.textContent();
    if (!/Namen der Person/.test(text)) throw new Error(`Meldung: "${text}"`);
  });

  await pruefe('mit Namen wird gespeichert und die Zeile klappt zu', async () => {
    await garten3.locator('input[type="text"]').first().fill('Heinz Brandt');
    await garten3.locator('button.haupt', { hasText: 'Speichern' }).click();
    await garten3.locator('.form').waitFor({ state: 'detached', timeout: 5000 });
    const text = await garten3.locator('.zusammenfassung').textContent();
    if (!text.includes('Heinz Brandt')) throw new Error(`Zusammenfassung: "${text}"`);
  });

  await pruefe('die Kacheln rechnen die neue Uebergabe mit', async () => {
    const werte = await seite.locator('.kachel .wert').allTextContents();
    gleich(werte[0], '6/54', 'versorgte Gaerten');
    gleich(werte[1], '48', 'offene Gaerten');
    gleich(werte[2], '7/60', 'ausgegebene Schluessel');
  });

  console.log('\nHinterlegen und Postversand');

  const garten4 = seite.locator('.garten').nth(3);

  await pruefe('bei Hinterlegung werden Ort und Foto angeboten', async () => {
    await garten4.locator('.zeile').click();
    await garten4.locator('.schalter.schluessel input').check();
    await garten4.locator('.rollout .wahl', { hasText: 'Hinterlegt' }).click();
    await garten4.locator('.fotos').waitFor({ timeout: 3000 });
    const beschriftungen = await garten4.locator('.form label').allTextContents();
    if (!beschriftungen.some((t) => /Wo wurde der Schlüssel hinterlegt/.test(t))) {
      throw new Error('Kein Ortsfeld');
    }
    if (!beschriftungen.some((t) => /Foto vom Ort/.test(t))) throw new Error('Kein Fotofeld');
  });

  await pruefe('der fehlende Nachweis wird als Hinweis angezeigt', async () => {
    const text = await garten4.locator('.meldung.warnung').textContent();
    if (!/Foto/.test(text)) throw new Error(`Hinweis: "${text}"`);
  });

  await pruefe('der Wechsel auf Post tauscht Ort gegen Adresse', async () => {
    await garten4.locator('textarea').first().fill('Im Gerätehaus');
    await garten4.locator('.rollout .wahl', { hasText: 'Post' }).click();
    const beschriftungen = await garten4.locator('.form label').allTextContents();
    if (!beschriftungen.some((t) => /An welche Adresse/.test(t))) throw new Error('Kein Adressfeld');
    if (beschriftungen.some((t) => /hinterlegt/.test(t))) throw new Error('Ortsfeld steht noch da');
    if (!beschriftungen.some((t) => /Abgeschickt am/.test(t))) {
      throw new Error('Datum heisst nicht "Abgeschickt am"');
    }
    if (!beschriftungen.some((t) => /Foto vom Brief/.test(t))) throw new Error('Kein Brieffoto');
  });

  await pruefe('die Postanschrift wird gespeichert und zusammengefasst', async () => {
    await garten4.locator('textarea').first().fill('Klaus Hinz\nAm Wall 3\n45127 Essen');
    await garten4.locator('button.haupt', { hasText: 'Speichern' }).click();
    await garten4.locator('.form').waitFor({ state: 'detached', timeout: 5000 });
    const text = await garten4.locator('.zusammenfassung').textContent();
    if (!text.includes('Post an Klaus Hinz')) throw new Error(`Zusammenfassung: "${text}"`);
  });

  await pruefe('die zugeklappte Zeile verraet die Adresse nicht in voller Laenge', async () => {
    const text = await garten4.locator('.zusammenfassung').textContent();
    if (text.includes('Am Wall 3')) throw new Error('Die ganze Adresse steht in der Liste');
  });

  console.log('\nSuchen, filtern, abbrechen');

  await pruefe('die Suche nach einer Nummer zeigt genau einen Garten', async () => {
    await seite.locator('input[type="search"]').fill('9');
    gleich(await seite.locator('.garten:visible').count(), 1, 'sichtbare Zeilen');
    gleich(await seite.locator('.garten:visible .nr').textContent(), '9', 'Gartennummer');
  });

  await pruefe('die Suche nach einem Namen findet die Zeile', async () => {
    await seite.locator('input[type="search"]').fill('heinz');
    gleich(await seite.locator('.garten:visible').count(), 1, 'sichtbare Zeilen');
    gleich(await seite.locator('.garten:visible .nr').textContent(), '3', 'Gartennummer');
  });

  await pruefe('eine erfolglose Suche sagt das auch', async () => {
    await seite.locator('input[type="search"]').fill('gibtesnicht');
    gleich(await seite.locator('.garten:visible').count(), 0, 'sichtbare Zeilen');
    if (!(await seite.locator('.leer').isVisible())) throw new Error('Keine Leermeldung');
    await seite.locator('input[type="search"]').fill('');
  });

  await pruefe('der Filter "Offen" zeigt nur unversorgte Gaerten', async () => {
    await seite.locator('.filter button', { hasText: 'Offen' }).click();
    gleich(await seite.locator('.garten:visible').count(), 47, 'offene Gaerten');
  });

  await pruefe('der Filter "Foto fehlt" findet die Nachweislücken', async () => {
    await seite.locator('.filter button', { hasText: 'Foto fehlt' }).click();
    const nummern = await seite.locator('.garten:visible .nr').allTextContents();
    gleich(nummern.join(','), '4,12', 'Gaerten ohne Nachweisfoto');
  });

  await pruefe('zurueck auf "Alle" stehen wieder alle 54 da', async () => {
    await seite.locator('.filter button', { hasText: 'Alle' }).click();
    gleich(await seite.locator('.garten:visible').count(), 54, 'sichtbare Zeilen');
  });

  await pruefe('Abbrechen verwirft die Eingabe', async () => {
    const garten7 = seite.locator('.garten').nth(6);
    await garten7.locator('.zeile').click();
    await garten7.locator('.schalter.schluessel input').check();
    await garten7.locator('.rollout .wahl', { hasText: 'Persönlich' }).click();
    await garten7.locator('input[type="text"]').first().fill('Wird verworfen');
    await garten7.locator('button.leise', { hasText: 'Abbrechen' }).click();
    await garten7.locator('.form').waitFor({ state: 'detached', timeout: 3000 });
    gleich(await garten7.locator('.marke:not(.karte)').textContent(), 'Offen', 'Marke nach Abbruch');
  });

  await pruefe('eine offene Zeile bleibt beim Filtern stehen', async () => {
    const garten8 = seite.locator('.garten').nth(7);
    await garten8.locator('.zeile').click();
    await seite.locator('.filter button', { hasText: 'Erledigt' }).click();
    if (!(await garten8.locator('.form').isVisible())) {
      throw new Error('Die offene Zeile ist beim Filtern verschwunden');
    }
    await garten8.locator('button.leise', { hasText: 'Abbrechen' }).click();
    await seite.locator('.filter button', { hasText: 'Alle' }).click();
  });

  console.log('\nSchlüsselkarte');

  await pruefe('die Kachel zeigt die ausgeliehenen Karten', async () => {
    const werte = await seite.locator('.kachel .wert').allTextContents();
    gleich(werte.length, 5, 'Anzahl Kacheln');
    gleich(werte[4], '3/13', 'Karten draussen');
  });

  await pruefe('ein Garten mit Karte hebt sich farblich ab', async () => {
    const mitKarte = seite.locator('.garten.hat-karte');
    gleich(await mitKarte.count(), 3, 'Zeilen mit Karte');
    gleich(
      (await mitKarte.locator('.nr').allTextContents()).join(','),
      '5,7,12',
      'Gaerten mit Karte'
    );
  });

  await pruefe('die Karte haengt nicht am Schluessel', async () => {
    /* Garten 7 hat eine Karte, aber keinen Schluessel — beides muss
       nebeneinander ablesbar sein. */
    const marken = await seite.locator('.garten').nth(6).locator('.marke').allTextContents();
    if (!marken.includes('Karte') || !marken.includes('Offen')) {
      throw new Error(`Marken an Garten 7: ${marken.join(' | ')}`);
    }
  });

  await pruefe('der Filter "Karte draußen" zeigt genau diese Gaerten', async () => {
    await seite.locator('.filter button', { hasText: 'Karte draußen' }).click();
    gleich(
      (await seite.locator('.garten:visible .nr').allTextContents()).join(','),
      '5,7,12',
      'gefilterte Gaerten'
    );
    await seite.locator('.filter button', { hasText: 'Alle' }).click();
  });

  await pruefe('eine Karte laesst sich ausgeben und die Zahl steigt', async () => {
    const g20 = seite.locator('.garten').nth(19);
    await g20.locator('.zeile').click();
    await g20.locator('.schalter.karte input').check();
    await g20.locator('button.haupt', { hasText: 'Speichern' }).click();
    await g20.locator('.form').waitFor({ state: 'detached', timeout: 5000 });

    const klassen = await g20.getAttribute('class');
    if (!klassen.includes('hat-karte')) throw new Error(`Klassen: ${klassen}`);
    gleich((await seite.locator('.kachel .wert').allTextContents())[4], '4/13', 'nach Ausgabe');
  });

  await pruefe('eine Karte laesst sich zuruecknehmen', async () => {
    const g20 = seite.locator('.garten').nth(19);
    await g20.locator('.zeile').click();
    await g20.locator('.schalter.karte input').uncheck();
    await g20.locator('button.haupt', { hasText: 'Speichern' }).click();
    await g20.locator('.form').waitFor({ state: 'detached', timeout: 5000 });

    const klassen = await g20.getAttribute('class');
    if (klassen.includes('hat-karte')) throw new Error(`noch markiert: ${klassen}`);
    gleich((await seite.locator('.kachel .wert').allTextContents())[4], '3/13', 'nach Ruecknahme');
  });

  console.log('\nExport');

  await pruefe('der Export liefert eine ZIP-Datei', async () => {
    const [download] = await Promise.all([
      seite.waitForEvent('download', { timeout: 15_000 }),
      seite.locator('button', { hasText: 'Als ZIP für Proton Drive' }).click()
    ]);
    const name = download.suggestedFilename();
    if (!/^schluessel-aussentore-\d{4}-\d{2}-\d{2}\.zip$/.test(name)) {
      throw new Error(`Dateiname: ${name}`);
    }
    const datei = await download.path();
    const bytes = fs.readFileSync(datei);
    if (bytes.length < 200) throw new Error(`Archiv ist nur ${bytes.length} Bytes gross`);
    const text = bytes.toString('latin1');
    for (const erwartet of ['liste.csv', 'liste.json', 'LIESMICH.txt']) {
      if (!text.includes(erwartet)) throw new Error(`${erwartet} fehlt im Archiv`);
    }
  });

  console.log('\nSauberkeit');

  await pruefe('auch eine offene Zeile zeigt keinen Resttext wie "null"', async () => {
    /* Garten 3 wurde nie geändert, geaendert_am ist also leer. Genau dort
       stand einmal ein "null" am Fuß des Formulars, weil append() leere
       Kinder in Text verwandelt. Die Zeile wird eigens aufgeklappt, weil der
       Fehler nur im geöffneten Zustand sichtbar ist. */
    const g3 = seite.locator('.garten').nth(2);
    await g3.locator('.zeile').click();
    await g3.locator('.form').waitFor({ timeout: 3000 });
    const text = await g3.innerText();
    if (/null|undefined|\[object/.test(text)) {
      throw new Error(`Resttext in der Zeile: ${text.replace(/\s+/g, ' ').slice(0, 140)}`);
    }
    await g3.locator('button.leise', { hasText: 'Abbrechen' }).click();
    await g3.locator('.form').waitFor({ state: 'detached', timeout: 3000 });
  });

  await pruefe('der Browser hat keinen Fehler gemeldet', () => {
    if (konsolenfehler.length > 0) throw new Error(konsolenfehler.join(' // '));
  });

  await pruefe('die Seite funktioniert auch auf einem breiten Bildschirm', async () => {
    await seite.setViewportSize({ width: 1280, height: 900 });
    gleich(await seite.locator('.garten:visible').count(), 54, 'sichtbare Zeilen');
    if (!(await seite.locator('.kachel').first().isVisible())) throw new Error('Kacheln fehlen');
  });

  console.log('\nAnmeldemaske');

  /* Ohne ?demo und ohne gespeicherten Code zeigt die Seite die Anmeldung. Das
     ist der Zustand, den jedes Vorstandsmitglied als Erstes sieht — er wurde
     vom Vorfuehrbetrieb nie beruehrt, und genau dort stand einmal ein "null"
     im Dokument, weil append() leere Kinder in Text verwandelt. */
  await pruefe('die Anmeldung erscheint ohne gespeicherten Code', async () => {
    await seite.goto(`http://localhost:${PORT}/index.html`);
    await seite.locator('.zugang').waitFor({ timeout: 10_000 });
    if (!(await seite.locator('input[type="password"]').isVisible())) {
      throw new Error('Kein Feld fuer den Zugangscode');
    }
  });

  await pruefe('auf der Anmeldeseite steht kein Resttext wie "null"', async () => {
    const text = await seite.locator('body').innerText();
    if (/\bnull\b|\bundefined\b|\[object/.test(text)) {
      throw new Error(`Resttext im Dokument: ${text.slice(0, 120)}`);
    }
  });

  await pruefe('ein leerer Code wird abgefangen, bevor der Server gefragt wird', async () => {
    await seite.locator('button.haupt', { hasText: 'Liste öffnen' }).click();
    const meldung = seite.locator('.meldung.fehler');
    await meldung.waitFor({ timeout: 3000 });
    const text = await meldung.textContent();
    if (!/Zugangscode/.test(text)) throw new Error(`Meldung: "${text}"`);
  });

  console.log('\nEinzeldatei');

  /* Die gebuendelte Einzeldatei ist das, was auf der Vereinsseite unter
     /schluessel/ ausgeliefert wird. Sie wurde lange nur gebaut und nie
     ausprobiert — seit sie das Produktionsartefakt ist, muss sie dieselben
     Pruefungen bestehen wie die Fassung aus einzelnen Modulen. */
  await pruefe('die Einzeldatei laeuft ohne weitere Dateien', async () => {
    const eigen = await browser.newPage();
    const fehler = [];
    eigen.on('pageerror', (e) => fehler.push(e.message));
    eigen.on('console', (m) => m.type() === 'error' && fehler.push(m.text()));
    /* Keine Anfrage darf das Netz verlassen oder eine Nachbardatei laden. */
    const fremd = [];
    eigen.on('request', (r) => {
      const u = r.url();
      if (!u.startsWith(`http://localhost:${PORT}/dist/`) && !u.startsWith('data:') && !u.startsWith('blob:')) {
        fremd.push(u);
      }
    });

    try {
      await eigen.goto(`http://localhost:${PORT}/dist/schluessel.html?demo`);
      await eigen.waitForSelector('.garten', { timeout: 10_000 });
      gleich(await eigen.locator('.garten').count(), 54, 'Anzahl Zeilen');

      const werte = await eigen.locator('.kachel .wert').allTextContents();
      gleich(werte[0], '5/54', 'versorgte Gaerten');

      /* Eine Uebergabe eintragen — prueft, dass auch der nachgeladene Teil
         (das Verkleinern der Fotos) mit eingebunden wurde. */
      const g = eigen.locator('.garten').nth(2);
      await g.locator('.zeile').click();
      await g.locator('.schalter.schluessel input').check();
      await g.locator('.rollout .wahl', { hasText: 'Persönlich' }).click();
      await g.locator('input[type="text"]').first().fill('Heinz Brandt');
      await g.locator('button.haupt', { hasText: 'Speichern' }).click();
      await g.locator('.form').waitFor({ state: 'detached', timeout: 5000 });

      if (fremd.length > 0) throw new Error(`Fremde Anfragen: ${fremd.slice(0, 3).join(', ')}`);
      if (fehler.length > 0) throw new Error(fehler.join(' // '));
    } finally {
      await eigen.close();
    }
  });
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${bestanden} Pruefungen bestanden, ${fehlgeschlagen.length} fehlgeschlagen.`);
if (fehlgeschlagen.length > 0) {
  console.error('Fehlgeschlagen:\n  ' + fehlgeschlagen.join('\n  '));
  process.exit(1);
}
