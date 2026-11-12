/* Das Datenmodell: Regeln, Zusammenfassungen, Zahlen.
 *
 * Alles hier ist reine Rechnung ohne Zugriff auf Browser, Netz oder Datenbank.
 * Das ist Absicht — so lässt sich jede Regel in tests/ einzeln prüfen, ohne
 * dass ein Server laufen muss.
 */

export const SCHLUESSEL_GESAMT = 60;

/* Mit der Schlüsselkarte darf ein Garten weitere Schlüssel nachmachen lassen.
   Jeder Garten braucht sie einmal, aber es gibt nur 13 Stück — sie wandern
   also reihum. Der Schalter sagt deshalb nicht "hat eine bekommen", sondern
   "hat gerade eine". */
export const KARTEN_GESAMT = 13;

export const ARTEN = ['persoenlich', 'hinterlegt', 'post'];

export const ART_NAMEN = {
  persoenlich: 'Persönlich übergeben',
  hinterlegt: 'Hinterlegt',
  post: 'Per Post geschickt'
};

export const ART_KURZ = {
  persoenlich: 'Persönlich',
  hinterlegt: 'Hinterlegt',
  post: 'Post'
};

/* Welches Feld bei welcher Art das Datum bedeutet. Es ist technisch dasselbe
   Feld, heißt für die Lesenden aber jedes Mal etwas anderes. */
export const DATUM_BESCHRIFTUNG = {
  persoenlich: 'Datum der Übergabe',
  hinterlegt: 'Datum der Hinterlegung',
  post: 'Abgeschickt am'
};

export function leererGarten(nr) {
  return {
    nr,
    erhalten: false,
    anzahl: 1,
    karte: false,
    art: null,
    person: null,
    ort: null,
    adresse: null,
    datum: null,
    notiz: null,
    fotos: [],
    erfasst_von: null,
    geaendert_am: null
  };
}

/* ------------------------------------------------------------------ Regeln */

/* Gibt die erste fehlende Pflichtangabe als Satz zurück, sonst null.
 *
 * Dieselben Regeln stehen in supabase/functions/api/index.ts. Hier dienen sie
 * der Rückmeldung im Formular, dort sind sie verbindlich. Wer eine Regel
 * ändert, muss beide Stellen ändern — tests/ prüft, dass die Regeln
 * übereinstimmen. */
export function fehler(g) {
  /* Nichts erhalten heißt: nichts auszufüllen. Eine leere Zeile ist ein
     gültiger Zustand, kein halbfertiger. */
  if (!g.erhalten) return null;
  if (!ARTEN.includes(g.art)) return 'Bitte angeben, wie der Schlüssel übergeben wurde.';
  if (!g.datum) return 'Bitte das Datum angeben.';
  if (g.art === 'persoenlich' && !leer(g.person)) return 'Bitte den Namen der Person angeben.';
  if (g.art === 'hinterlegt' && !leer(g.ort)) return 'Bitte angeben, wo der Schlüssel hinterlegt wurde.';
  if (g.art === 'post' && !leer(g.adresse)) return 'Bitte die Empfangsadresse angeben.';
  return null;
}

/* Hinweise, die das Speichern nicht verhindern, aber im Formular stehen sollen. */
export function hinweise(g) {
  const liste = [];
  if (!g.erhalten) return liste;
  if ((g.art === 'hinterlegt' || g.art === 'post') && (g.fotos ?? []).length === 0) {
    liste.push(
      g.art === 'hinterlegt'
        ? 'Ohne Foto ist später nicht belegbar, wo der Schlüssel lag.'
        : 'Ohne Foto vom Brief oder vom Einwurf ist der Versand später nicht belegbar.'
    );
  }
  if (g.datum && g.datum > heute()) liste.push('Das Datum liegt in der Zukunft.');
  return liste;
}

function leer(wert) {
  return typeof wert === 'string' && wert.trim() !== '';
}

export function heute() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* Nur die Felder behalten, die zur gewählten Art gehören — sonst schleppt eine
   Zeile Angaben mit, die zu einer vorherigen Wahl gehörten und niemand mehr
   sieht. Der Server macht dasselbe; hier ist es für die Anzeige nötig. */
export function bereinigen(g) {
  const sauber = { ...g };
  if (!sauber.erhalten) {
    sauber.art = null;
    sauber.anzahl = 0;
  }
  if (sauber.art !== 'persoenlich') sauber.person = null;
  if (sauber.art !== 'hinterlegt') sauber.ort = null;
  if (sauber.art !== 'post') sauber.adresse = null;
  if (!sauber.erhalten) sauber.datum = null;
  return sauber;
}

/* ------------------------------------------------------------ Darstellung */

export function datumDE(iso) {
  if (!iso) return '';
  const [j, m, t] = String(iso).slice(0, 10).split('-');
  if (!j || !m || !t) return '';
  return `${t}.${m}.${j}`;
}

/* Die Zeile in einem Satz: was man im zugeklappten Zustand wissen will. */
export function zusammenfassung(g) {
  if (!g.erhalten) return 'Noch kein Schlüssel';

  const datum = datumDE(g.datum);
  const anzahl = g.anzahl > 1 ? ` (${g.anzahl} Schlüssel)` : '';

  if (g.art === 'persoenlich') {
    return `Persönlich an ${g.person || '—'}${datum ? ', ' + datum : ''}${anzahl}`;
  }
  if (g.art === 'hinterlegt') {
    return `Hinterlegt: ${g.ort || '—'}${datum ? ', ' + datum : ''}${anzahl}`;
  }
  if (g.art === 'post') {
    const ziel = (g.adresse || '').split('\n')[0] || '—';
    return `Post an ${ziel}${datum ? ', abgeschickt ' + datum : ''}${anzahl}`;
  }
  return `Erhalten${anzahl}`;
}

/* ----------------------------------------------------------------- Zahlen */

export function statistik(
  gaerten,
  schluesselGesamt = SCHLUESSEL_GESAMT,
  kartenGesamt = KARTEN_GESAMT
) {
  const versorgt = gaerten.filter((g) => g.erhalten);
  const ausgegeben = versorgt.reduce((summe, g) => summe + (Number(g.anzahl) || 0), 0);

  const nachArt = { persoenlich: 0, hinterlegt: 0, post: 0 };
  for (const g of versorgt) if (nachArt[g.art] !== undefined) nachArt[g.art] += 1;

  /* Eine Zeile gilt als unvollständig, wenn sie als erhalten markiert ist, aber
     eine Pflichtangabe fehlt — das passiert bei Einträgen aus der Datenbank,
     die von Hand geändert wurden. */
  const unvollstaendig = versorgt.filter((g) => fehler(g) !== null).length;
  const ohneFoto = versorgt.filter(
    (g) => (g.art === 'hinterlegt' || g.art === 'post') && (g.fotos ?? []).length === 0
  ).length;

  /* Karten sind Leihgaben: gezählt wird, wie viele gerade draußen sind. */
  const kartenDraussen = gaerten.filter((g) => g.karte).length;

  return {
    gaerten: gaerten.length,
    versorgt: versorgt.length,
    offen: gaerten.length - versorgt.length,
    ausgegeben,
    schluesselGesamt,
    uebrig: schluesselGesamt - ausgegeben,
    nachArt,
    unvollstaendig,
    ohneFoto,
    kartenDraussen,
    kartenGesamt,
    kartenUebrig: kartenGesamt - kartenDraussen
  };
}

/* ----------------------------------------------------------------- Filter */

export const FILTER = {
  alle: 'Alle',
  offen: 'Offen',
  erledigt: 'Erledigt',
  persoenlich: 'Persönlich',
  hinterlegt: 'Hinterlegt',
  post: 'Post',
  ohneFoto: 'Foto fehlt',
  karte: 'Karte draußen'
};

export function filtern(gaerten, { suche = '', filter = 'alle' } = {}) {
  const begriff = suche.trim().toLowerCase();

  return gaerten.filter((g) => {
    if (filter === 'offen' && g.erhalten) return false;
    if (filter === 'erledigt' && !g.erhalten) return false;
    if (ARTEN.includes(filter) && g.art !== filter) return false;
    if (filter === 'karte' && !g.karte) return false;
    if (filter === 'ohneFoto') {
      const braucht = g.erhalten && (g.art === 'hinterlegt' || g.art === 'post');
      if (!braucht || (g.fotos ?? []).length > 0) return false;
    }
    if (begriff === '') return true;

    /* Die Gartennummer soll exakt treffen: wer "7" sucht, meint Garten 7 und
       nicht 17, 27 und 37. Alles andere sucht als Teiltext. */
    if (String(g.nr) === begriff) return true;
    return [g.person, g.ort, g.adresse, g.notiz, g.erfasst_von, ART_KURZ[g.art]]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(begriff);
  });
}
