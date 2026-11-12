/* Vorführbetrieb: dieselben Aufrufe wie api.js, aber alles bleibt im
 * Arbeitsspeicher. Aufruf der Seite mit ?demo.
 *
 * Zwei Zwecke: man kann die Liste ohne Server und ohne Zugangscode ansehen, und
 * der Rauchtest in scripts/smoke-test.mjs braucht keine Datenbank.
 */

import { leererGarten } from './modell.js';

const ANZAHL_GAERTEN = 54;

function aufbau() {
  const gaerten = [];
  for (let nr = 1; nr <= ANZAHL_GAERTEN; nr++) gaerten.push(leererGarten(nr));

  const setze = (nr, werte) => Object.assign(gaerten[nr - 1], werte);

  setze(1, {
    erhalten: true,
    anzahl: 1,
    art: 'persoenlich',
    person: 'Anna Berger',
    datum: '2026-11-02',
    erfasst_von: 'Sascha',
    geaendert_am: '2026-11-02T10:15:00.000Z'
  });
  setze(2, {
    erhalten: true,
    anzahl: 2,
    art: 'persoenlich',
    person: 'Familie Kowalski',
    datum: '2026-11-02',
    notiz: 'Zweiter Schlüssel für die Tochter, die den Garten mit pflegt.',
    erfasst_von: 'Sascha',
    geaendert_am: '2026-11-02T10:20:00.000Z'
  });
  setze(5, {
    karte: true,
    erhalten: true,
    anzahl: 1,
    art: 'hinterlegt',
    ort: 'Im Gerätehaus, oberes Regalbrett links, brauner Umschlag',
    datum: '2026-11-03',
    fotos: [{ pfad: 'demo/5.jpg', name: 'Gerätehaus.jpg', groesse: 184320, url: null }],
    erfasst_von: 'Petra',
    geaendert_am: '2026-11-03T16:40:00.000Z'
  });
  /* Ein Garten mit Karte, aber noch ohne Schlüssel — die beiden hängen nicht
     zusammen, und das soll der Vorführbetrieb zeigen. */
  setze(7, { karte: true });

  setze(9, {
    erhalten: true,
    anzahl: 1,
    art: 'post',
    adresse: 'Marianne Voss\nLindenstraße 14\n45127 Essen',
    datum: '2026-11-04',
    fotos: [{ pfad: 'demo/9.jpg', name: 'Einwurf.jpg', groesse: 203776, url: null }],
    erfasst_von: 'Sascha',
    geaendert_am: '2026-11-04T09:05:00.000Z'
  });
  setze(12, {
    karte: true,
    erhalten: true,
    anzahl: 1,
    art: 'hinterlegt',
    ort: 'Beim Nachbarn in Garten 11',
    datum: '2026-11-04',
    erfasst_von: 'Petra',
    geaendert_am: '2026-11-04T18:30:00.000Z'
  });

  return gaerten;
}

let gaerten = aufbau();

const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));

export const demoApi = {
  istDemo: true,

  async pruefen() {
    return true;
  },

  async laden() {
    await schlaf(60);
    return gaerten.map((g) => ({ ...g }));
  },

  async speichern(garten) {
    await schlaf(60);
    const i = gaerten.findIndex((g) => g.nr === Number(garten.nr));
    if (i === -1) throw new Error(`Garten ${garten.nr} gibt es nicht.`);
    /* Fotos bleiben beim Server-Stand, genau wie im Echtbetrieb. */
    gaerten[i] = {
      ...gaerten[i],
      ...garten,
      fotos: gaerten[i].fotos,
      geaendert_am: new Date().toISOString()
    };
    return { ...gaerten[i] };
  },

  async verlauf(nr) {
    await schlaf(30);
    const g = gaerten.find((x) => x.nr === Number(nr));
    if (!g || !g.geaendert_am) return [];
    return [
      {
        id: 1,
        erfasst_von: g.erfasst_von,
        vorher: null,
        nachher: g,
        zeitpunkt: g.geaendert_am
      }
    ];
  },

  async fotoHochladen(nr, blob, name) {
    await schlaf(120);
    const i = gaerten.findIndex((g) => g.nr === Number(nr));
    if (i === -1) throw new Error(`Garten ${nr} gibt es nicht.`);
    gaerten[i].fotos = [
      ...gaerten[i].fotos,
      {
        pfad: `demo/${nr}-${gaerten[i].fotos.length + 1}.jpg`,
        name,
        groesse: blob.size,
        /* Im Vorführbetrieb zeigt die Vorschau das Bild direkt aus dem Browser. */
        url: URL.createObjectURL(blob)
      }
    ];
    gaerten[i].geaendert_am = new Date().toISOString();
    return { ...gaerten[i] };
  },

  async fotoLoeschen(nr, pfad) {
    await schlaf(60);
    const i = gaerten.findIndex((g) => g.nr === Number(nr));
    if (i === -1) throw new Error(`Garten ${nr} gibt es nicht.`);
    gaerten[i].fotos = gaerten[i].fotos.filter((f) => f.pfad !== pfad);
    return { ...gaerten[i] };
  },

  async fotosFuerExport() {
    return gaerten
      .flatMap((g) => g.fotos)
      .filter((f) => f.url)
      .map((f) => ({ path: f.pfad, signedUrl: f.url }));
  },

  /* Nur für den Rauchtest: Ausgangszustand wiederherstellen. */
  zuruecksetzen() {
    gaerten = aufbau();
  }
};
