/* Prüft die erzeugte Word-Datei, ohne sie zu öffnen.
 *
 * Warum überhaupt: auf diesem Rechner stehen weder LibreOffice noch Pandoc zur
 * Verfügung, die Datei lässt sich also nicht zum Ansehen umwandeln. Geprüft
 * wird daher, was sich am Inhalt prüfen lässt — ob jeder Schritt drin ist, in
 * der richtigen Reihenfolge, mit seinem Bild und mit umgesetztem Fettdruck.
 *
 * Das ersetzt keinen Blick in Word, fängt aber genau die Fehler ab, die beim
 * Erzeugen entstehen: ein vergessenes Bild, ein durchgereichtes **Sternchen**,
 * eine verrutschte Reihenfolge.
 */

import fs from 'node:fs/promises';
import { zipDatei, zipEintraege } from './zip-lesen.mjs';
import { SCHRITTE, STOERUNGEN, TITEL, STOERUNGEN_TITEL } from './anleitung-inhalt.mjs';

export async function wordPruefen(pfad) {
  const archiv = await fs.readFile(pfad);
  const xml = zipDatei(archiv, 'word/document.xml').toString('utf8');
  const rels = zipDatei(archiv, 'word/_rels/document.xml.rels').toString('utf8');
  const namen = zipEintraege(archiv).map((e) => e.name);

  const sichtbar = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
  const ganz = sichtbar.join(' ');

  const ergebnisse = [];
  const p = (was, ok, zusatz = '') => ergebnisse.push({ ok, was, zusatz });

  p('Titel steht im Dokument', ganz.includes(TITEL));

  /* Reihenfolge: jeder Schritt muss NACH dem vorigen auftauchen. */
  let pos = -1;
  let reihenfolge = true;
  for (const s of SCHRITTE) {
    const marke = `${s.nr}. ${s.titel}`;
    const i = sichtbar.findIndex((t, k) => k > pos && t.includes(marke));
    if (i === -1) {
      p(`Schritt ${s.nr} „${s.titel}" fehlt oder steht falsch`, false);
      reihenfolge = false;
    } else {
      pos = i;
    }
  }
  p(`Alle ${SCHRITTE.length} Schritte in der richtigen Reihenfolge`, reihenfolge);

  const sollBilder = SCHRITTE.filter((s) => s.bild).length;
  const mediaDateien = namen.filter((n) => n.startsWith('word/media/')).length;
  const verknuepft = [...rels.matchAll(/Target="media\/[^"]+"/g)].length;
  const eingebunden = [...xml.matchAll(/<a:blip r:embed="rId\d+"/g)].length;

  p(`${mediaDateien} Bilddateien im Archiv`, mediaDateien === sollBilder, `erwartet ${sollBilder}`);
  p(`${verknuepft} Bildverknüpfungen`, verknuepft === sollBilder);
  p(`${eingebunden} Bilder im Text eingebunden`, eingebunden === sollBilder);

  p(`Abschnitt „${STOERUNGEN_TITEL}"`, ganz.includes(STOERUNGEN_TITEL));
  for (const [was] of STOERUNGEN) {
    /* Anführungszeichen können beim Setzen ersetzt werden — nur den Kern prüfen. */
    const kern = was.replace(/[„""]/g, '').slice(0, 14);
    p(`Störung „${kern}…"`, ganz.includes(kern));
  }

  /* Fettdruck muss umgesetzt sein, nicht als Sternchen durchgereicht. */
  p('Keine ** im sichtbaren Text', !ganz.includes('**'));
  p('Fettdruck ist gesetzt', /<w:b\s*\/>/.test(xml));

  return ergebnisse;
}

/* Direkt aufgerufen: Ergebnis ausgeben und mit passendem Rückgabewert enden. */
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const pfad = process.argv[2] ?? 'docs/Anleitung-Schluesselliste.docx';
  const ergebnisse = await wordPruefen(pfad);
  let fehler = 0;
  for (const { ok, was, zusatz } of ergebnisse) {
    console.log(`  ${ok ? 'ok  ' : 'FEHL'} ${was}${zusatz ? ` (${zusatz})` : ''}`);
    if (!ok) fehler++;
  }
  console.log(`\n  ${ergebnisse.length - fehler} von ${ergebnisse.length} Prüfungen bestanden.`);
  process.exit(fehler ? 1 : 0);
}
