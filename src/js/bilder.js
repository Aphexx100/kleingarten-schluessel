/* Fotos fürs Hochladen vorbereiten.
 *
 * Ein Handyfoto ist heute gern 4 bis 8 MB groß. Als Nachweis, wo ein Schlüssel
 * liegt, genügt ein Bruchteil davon. Das Verkleinern passiert vor dem Hochladen
 * im Browser — das spart Speicherplatz auf dem Server, vor allem aber das
 * Mobilfunkvolumen dessen, der im Garten steht und hochlädt.
 */

const MAX_KANTE = 1600;
const GUETE = 0.82;

export async function vorbereiten(datei) {
  if (!datei.type.startsWith('image/')) {
    throw new Error('Das ist kein Bild.');
  }

  let bild;
  try {
    /* imageOrientation sorgt dafür, dass hochkant aufgenommene Fotos nicht
       liegend ankommen — die Drehung steckt bei Handys nur in den EXIF-Daten,
       die beim Zeichnen auf die Leinwand sonst verloren gehen. */
    bild = await createImageBitmap(datei, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Das Bild konnte nicht gelesen werden.');
  }

  const faktor = Math.min(1, MAX_KANTE / Math.max(bild.width, bild.height));
  const breite = Math.max(1, Math.round(bild.width * faktor));
  const hoehe = Math.max(1, Math.round(bild.height * faktor));

  const leinwand = document.createElement('canvas');
  leinwand.width = breite;
  leinwand.height = hoehe;
  const stift = leinwand.getContext('2d');
  stift.drawImage(bild, 0, 0, breite, hoehe);
  bild.close?.();

  const blob = await new Promise((fertig) =>
    leinwand.toBlob(fertig, 'image/jpeg', GUETE)
  );
  if (!blob) throw new Error('Das Bild konnte nicht umgewandelt werden.');

  return { blob, name: dateiname(datei.name), breite, hoehe };
}

/* Endung auf .jpg setzen, weil nach dem Umwandeln immer ein JPEG herauskommt. */
function dateiname(roh) {
  const ohneEndung = (roh || 'Foto').replace(/\.[^.]+$/, '').slice(0, 80);
  const sauber = ohneEndung.replace(/[^\p{L}\p{N} _.-]/gu, '').trim();
  return `${sauber || 'Foto'}.jpg`;
}

export function groesseLesbar(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
