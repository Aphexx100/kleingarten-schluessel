/* Ein sehr kleiner ZIP-Schreiber.
 *
 * Warum selbst gebaut und keine Bibliothek: das Projekt soll ohne Abhängigkeiten
 * im Browser laufen, und für den Export reicht die einfachste ZIP-Form —
 * "gespeichert", also ohne Kompression. Das ist kein Verzicht: die Fotos sind
 * JPEGs und damit schon komprimiert, bei ihnen bringt Packen nichts. Die
 * JSON- und CSV-Dateien daneben sind klein.
 *
 * Erzeugt wird das klassische ZIP-Format ohne Zip64, also tauglich bis 4 GB
 * Gesamtgröße. Für 54 Gärten mit je ein paar Fotos ist das weit jenseits
 * dessen, was zusammenkommt.
 */

const tabelle = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = tabelle[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* Datum und Uhrzeit im DOS-Format, das ZIP seit den Achtzigern erwartet. */
function dosZeit(d = new Date()) {
  const zeit = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const datum = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { zeit, datum };
}

/* Dateinamen in ZIP-Archiven sind UTF-8, wenn Bit 11 gesetzt ist. Ohne dieses
   Bit zeigt der Windows-Explorer aus "Übergabe" ein "Ã¼bergabe". */
const UTF8_FLAGGE = 0x800;

export function zipErstellen(eintraege) {
  const kodierer = new TextEncoder();
  const stuecke = [];
  const verzeichnis = [];
  let versatz = 0;

  for (const eintrag of eintraege) {
    const name = kodierer.encode(eintrag.name);
    const inhalt =
      typeof eintrag.inhalt === 'string' ? kodierer.encode(eintrag.inhalt) : eintrag.inhalt;
    const summe = crc32(inhalt);
    const { zeit, datum } = dosZeit(eintrag.zeitpunkt ? new Date(eintrag.zeitpunkt) : new Date());

    const kopf = new DataView(new ArrayBuffer(30));
    kopf.setUint32(0, 0x04034b50, true); // Kennung
    kopf.setUint16(4, 20, true); // benötigte Version
    kopf.setUint16(6, UTF8_FLAGGE, true);
    kopf.setUint16(8, 0, true); // Verfahren: gespeichert
    kopf.setUint16(10, zeit, true);
    kopf.setUint16(12, datum, true);
    kopf.setUint32(14, summe, true);
    kopf.setUint32(18, inhalt.length, true);
    kopf.setUint32(22, inhalt.length, true);
    kopf.setUint16(26, name.length, true);
    kopf.setUint16(28, 0, true); // Zusatzfeld

    stuecke.push(new Uint8Array(kopf.buffer), name, inhalt);

    const eintragKopf = new DataView(new ArrayBuffer(46));
    eintragKopf.setUint32(0, 0x02014b50, true);
    eintragKopf.setUint16(4, 20, true); // erzeugt von
    eintragKopf.setUint16(6, 20, true);
    eintragKopf.setUint16(8, UTF8_FLAGGE, true);
    eintragKopf.setUint16(10, 0, true);
    eintragKopf.setUint16(12, zeit, true);
    eintragKopf.setUint16(14, datum, true);
    eintragKopf.setUint32(16, summe, true);
    eintragKopf.setUint32(20, inhalt.length, true);
    eintragKopf.setUint32(24, inhalt.length, true);
    eintragKopf.setUint16(28, name.length, true);
    eintragKopf.setUint16(30, 0, true);
    eintragKopf.setUint16(32, 0, true);
    eintragKopf.setUint16(34, 0, true);
    eintragKopf.setUint16(36, 0, true);
    eintragKopf.setUint32(38, 0, true);
    eintragKopf.setUint32(42, versatz, true);

    verzeichnis.push(new Uint8Array(eintragKopf.buffer), name);
    versatz += 30 + name.length + inhalt.length;
  }

  const verzeichnisGroesse = verzeichnis.reduce((s, t) => s + t.length, 0);

  const ende = new DataView(new ArrayBuffer(22));
  ende.setUint32(0, 0x06054b50, true);
  ende.setUint16(4, 0, true);
  ende.setUint16(6, 0, true);
  ende.setUint16(8, eintraege.length, true);
  ende.setUint16(10, eintraege.length, true);
  ende.setUint32(12, verzeichnisGroesse, true);
  ende.setUint32(16, versatz, true);
  ende.setUint16(20, 0, true); // Kommentar

  return new Blob([...stuecke, ...verzeichnis, new Uint8Array(ende.buffer)], {
    type: 'application/zip'
  });
}
