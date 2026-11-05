/* Minimaler ZIP-Leser — das Gegenstück zu src/js/zip.js.
 *
 * Gebraucht wird er, um in die erzeugte Word-Datei hineinzuschauen: ein .docx
 * ist ein ZIP voller XML-Dateien. Node bringt keinen ZIP-Leser mit, und eine
 * Bibliothek nachzuladen wäre für diese paar Zeilen unverhältnismäßig.
 *
 * Gelesen wird über das zentrale Verzeichnis am Dateiende, nicht durch
 * Durchlaufen der Einträge — so stimmen die Angaben auch dann, wenn ein
 * Schreiber die Größen erst nachträglich eingetragen hat.
 */

import { inflateRawSync } from 'node:zlib';

const EOCD = 0x06054b50; // Ende des zentralen Verzeichnisses
const EINTRAG = 0x02014b50; // Eintrag im zentralen Verzeichnis

function endeFinden(b) {
  /* Das Schlussstück ist 22 Byte lang, gefolgt von höchstens 65535 Byte
     Kommentar — also höchstens so weit vom Ende her suchen. */
  const frueheste = Math.max(0, b.length - 22 - 0xffff);
  for (let i = b.length - 22; i >= frueheste; i--) {
    if (b.readUInt32LE(i) === EOCD) return i;
  }
  throw new Error('Kein ZIP: das zentrale Verzeichnis fehlt.');
}

/* Listet alle Einträge als { name, methode, groesse, versatz }. */
export function zipEintraege(b) {
  const ende = endeFinden(b);
  const anzahl = b.readUInt16LE(ende + 10);
  let p = b.readUInt32LE(ende + 16);

  const eintraege = [];
  for (let i = 0; i < anzahl; i++) {
    if (b.readUInt32LE(p) !== EINTRAG) throw new Error(`Verzeichniseintrag ${i} ist beschädigt.`);
    const methode = b.readUInt16LE(p + 10);
    const gepackt = b.readUInt32LE(p + 20);
    const groesse = b.readUInt32LE(p + 24);
    const nameLaenge = b.readUInt16LE(p + 28);
    const extraLaenge = b.readUInt16LE(p + 30);
    const kommentarLaenge = b.readUInt16LE(p + 32);
    const versatz = b.readUInt32LE(p + 42);
    const name = b.toString('utf8', p + 46, p + 46 + nameLaenge);

    eintraege.push({ name, methode, gepackt, groesse, versatz });
    p += 46 + nameLaenge + extraLaenge + kommentarLaenge;
  }
  return eintraege;
}

/* Holt eine einzelne Datei aus dem Archiv. */
export function zipDatei(b, gesucht) {
  const e = zipEintraege(b).find((x) => x.name === gesucht);
  if (!e) throw new Error(`Im Archiv fehlt ${gesucht}.`);

  /* Der lokale Kopf wiederholt die Namens- und Extralänge; die Extralänge kann
     sich von der im Verzeichnis unterscheiden, darum hier neu lesen. */
  const nameLaenge = b.readUInt16LE(e.versatz + 26);
  const extraLaenge = b.readUInt16LE(e.versatz + 28);
  const anfang = e.versatz + 30 + nameLaenge + extraLaenge;
  const roh = b.subarray(anfang, anfang + e.gepackt);

  if (e.methode === 0) return roh;
  if (e.methode === 8) return inflateRawSync(roh);
  throw new Error(`Unbekanntes Packverfahren ${e.methode} bei ${gesucht}.`);
}
