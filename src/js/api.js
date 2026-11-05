/* Verbindung zur Edge Function.
 *
 * Der Browser kennt die Datenbank nicht und hat keinen Datenbank-Schlüssel. Er
 * kennt nur diese eine Adresse und den gemeinsamen Zugangscode, der bei jeder
 * Anfrage mitgeht. Der Code steht im localStorage des Geräts, nie im Quelltext
 * und nie in der Adresszeile.
 */

const SPEICHER_BASIS = 'schluessel.basis';
const SPEICHER_CODE = 'schluessel.code';
const SPEICHER_NAME = 'schluessel.name';

/* Beim Bauen eingesetzt oder in index.html gesetzt; sonst fragt die Seite danach. */
const VOREINSTELLUNG =
  (typeof window !== 'undefined' && window.SCHLUESSEL_BASIS) || '';

export const zugang = {
  basis() {
    return hole(SPEICHER_BASIS) || VOREINSTELLUNG;
  },
  code() {
    return hole(SPEICHER_CODE) || '';
  },
  name() {
    return hole(SPEICHER_NAME) || '';
  },
  merken({ basis, code, name }) {
    if (basis !== undefined) setze(SPEICHER_BASIS, basis.trim().replace(/\/+$/, ''));
    if (code !== undefined) setze(SPEICHER_CODE, code);
    if (name !== undefined) setze(SPEICHER_NAME, name.trim());
  },
  vergessen() {
    /* Nur den Code löschen: Adresse und Name sind nicht geheim und erspart beim
       nächsten Mal das Tippen. */
    setze(SPEICHER_CODE, '');
  },
  angemeldet() {
    return Boolean(this.basis() && this.code());
  }
};

function hole(schluessel) {
  try {
    return localStorage.getItem(schluessel) ?? '';
  } catch {
    return '';
  }
}

function setze(schluessel, wert) {
  try {
    if (wert === '') localStorage.removeItem(schluessel);
    else localStorage.setItem(schluessel, wert);
  } catch {
    /* Privates Fenster ohne Speicher: dann gilt die Eingabe nur für diese Sitzung. */
  }
}

/* Eigene Fehlerart, damit die Oberfläche einen abgelehnten Code von einem
   Netzproblem unterscheiden kann. */
export class ApiFehler extends Error {
  constructor(meldung, status) {
    super(meldung);
    this.name = 'ApiFehler';
    this.status = status;
  }
}

async function ruf(aktion, daten = {}) {
  const basis = zugang.basis();
  if (!basis) throw new ApiFehler('Die Adresse des Servers fehlt.', 0);

  let antwort;
  try {
    antwort = await fetch(basis, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aktion,
        code: zugang.code(),
        erfasstVon: zugang.name(),
        ...daten
      })
    });
  } catch {
    throw new ApiFehler('Keine Verbindung. Internet prüfen und erneut versuchen.', 0);
  }

  let inhalt = {};
  try {
    inhalt = await antwort.json();
  } catch {
    /* Bei 500er-Antworten kommt manchmal kein JSON zurück. */
  }

  if (!antwort.ok) {
    throw new ApiFehler(inhalt.fehler || `Server antwortet mit ${antwort.status}.`, antwort.status);
  }
  return inhalt;
}

export const api = {
  istDemo: false,

  async pruefen() {
    await ruf('pruefen');
    return true;
  },

  async laden() {
    const { gaerten } = await ruf('laden');
    return gaerten ?? [];
  },

  async speichern(garten) {
    const { garten: gespeichert } = await ruf('speichern', { garten });
    return gespeichert;
  },

  async verlauf(nr) {
    const { verlauf } = await ruf('verlauf', { nr });
    return verlauf ?? [];
  },

  /* Zweistufig: erst vom Server einen signierten Platz holen, dann die Datei
     direkt dorthin legen, dann den Eintrag buchen. Das Bild läuft damit nicht
     durch die Edge Function und stößt nicht an deren Größengrenze. */
  async fotoHochladen(nr, blob, name) {
    const ziel = await ruf('fotoZiel', { nr });

    const hoch = await fetch(ziel.url, {
      method: 'PUT',
      headers: { 'Content-Type': blob.type || 'image/jpeg' },
      body: blob
    });
    if (!hoch.ok) throw new ApiFehler('Das Foto konnte nicht hochgeladen werden.', hoch.status);

    const { garten } = await ruf('fotoBuchen', {
      nr,
      pfad: ziel.pfad,
      name,
      groesse: blob.size
    });
    return garten;
  },

  async fotoLoeschen(nr, pfad) {
    const { garten } = await ruf('fotoLoeschen', { nr, pfad });
    return garten;
  },

  async fotosFuerExport() {
    const { fotos } = await ruf('fotosFuerExport');
    return fotos ?? [];
  }
};
