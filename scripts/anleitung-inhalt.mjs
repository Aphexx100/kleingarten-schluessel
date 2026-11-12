/* Der Text der Anleitung — einmal, für beide Ausgaben.
 *
 * PDF und Word-Datei entstehen aus dieser Datei. Stünde der Text zweimal da,
 * liefen die Fassungen beim ersten Nachtragen auseinander, und niemand wüsste
 * hinterher, welche die richtige ist.
 *
 * Fettdruck wird als **so** geschrieben; beide Ausgaben setzen ihn selbst um.
 */

export const TITEL = 'Schlüsselausgabe Außentore';
export const UNTERTITEL = 'Kurzanleitung für den Vorstand';

/* "bild" verweist auf den Namen einer Aufnahme aus scripts/anleitung.mjs.
   null heißt: dieser Schritt kommt ohne Bild aus. */
export const SCHRITTE = [
  {
    nr: 1,
    titel: 'Liste öffnen',
    bild: null,
    absaetze: [
      '`kgvgruenerwinkel.de` → Reiter **Vorstandsbereich** ganz rechts → Zugangscode eingeben → **Zur Schlüsselliste**.'
    ],
    merke:
      'Den Code nie zusammen mit dem Link verschicken. Seite einmal auf den Startbildschirm legen, sonst vergisst der Browser den Code nach ein, zwei Wochen.'
  },
  {
    nr: 2,
    titel: 'Oben: der Stand',
    bild: 'zahlen',
    absaetze: ['Versorgte Gärten, offene Gärten, ausgegebene und übrige Schlüssel.']
  },
  {
    nr: 3,
    titel: 'Zeile antippen',
    bild: 'haken',
    absaetze: [
      'Garten antippen, dann den Haken setzen. Erst danach kommen die weiteren Fragen.'
    ]
  },
  {
    nr: 4,
    titel: 'Schlüsselkarte',
    bild: 'karte',
    absaetze: [
      'Mit der Karte dürfen weitere Schlüssel nachgemacht werden. Schalter umlegen, wenn ein Garten sie bekommt — und wieder zurück, sobald sie zurück ist.'
    ],
    merke:
      'Es gibt nur **13 Karten für 54 Gärten**. Sie gehen reihum, also bitte nachhalten. Oben zeigt die Liste, wie viele gerade draußen sind.'
  },
  {
    nr: 5,
    titel: 'Weg auswählen',
    bild: 'rollout',
    absaetze: [
      'Antippen, wie der Schlüssel übergeben wurde. Je nach Wahl erscheinen unterschiedliche Felder.'
    ]
  },
  {
    nr: 6,
    titel: 'Persönlich übergeben',
    bild: 'persoenlich',
    absaetze: ['Name der Person und Datum. Kein Foto nötig — der Name ist der Nachweis.']
  },
  {
    nr: 7,
    titel: 'Hinterlegt',
    bild: 'hinterlegt',
    absaetze: [
      'Wo genau, Datum, **Foto vom Ort**. So genau beschreiben, dass die Person ohne Rückfrage hinfindet.'
    ]
  },
  {
    nr: 8,
    titel: 'Per Post',
    bild: 'post',
    absaetze: ['Adresse, Datum des Abschickens, **Foto** vom Brief oder vom Einwurf.'],
    merke: '**Foto aufnehmen** öffnet direkt die Kamera. Das Bild wird automatisch verkleinert.'
  },
  {
    nr: 9,
    titel: 'Speichern',
    bild: 'fehler',
    absaetze: [
      'Auf **Speichern** tippen. Fehlt etwas, sagt die Liste welches Feld — gespeichert wird dann noch nicht. **Abbrechen** verwirft die Eingabe.'
    ]
  },
  {
    nr: 10,
    titel: 'Suchen und filtern',
    bild: 'filter',
    absaetze: [
      'Suchfeld: Gartennummer, Name, Ort oder Adresse.',
      '**Foto fehlt** zeigt die Übergaben, bei denen der Nachweis noch aussteht. Da regelmäßig hineinschauen.'
    ]
  },
  {
    nr: 11,
    titel: 'Sicherung ziehen',
    bild: 'sichern',
    absaetze: [
      '**Als ZIP für Proton Drive** packt Tabelle und alle Fotos in eine Datei. Einmal pro Woche, und am Ende der Ausgabe.'
    ]
  }
];

export const STOERUNGEN_TITEL = 'Wenn etwas klemmt';

export const STOERUNGEN = [
  ['Fragt wieder nach dem Code', 'Browser hat ihn vergessen — neu eingeben.'],
  ['„Zugangscode stimmt nicht"', 'Vertippt oder Leerzeichen am Ende.'],
  ['„Zu viele Fehlversuche"', 'Nach 15 Minuten geht es wieder.'],
  ['„Keine Verbindung"', 'Kein Internet. Eingabe ist nicht gespeichert.'],
  ['„Vorschau abgelaufen"', 'Nur die Anzeige. Seite neu laden.']
];

export const SCHLUSSHINWEIS =
  'Die Liste enthält Namen, Anschriften und Fotos von Mitgliedern. Sie gehört in den Vorstand und sonst nirgendwohin.';

/* Zerlegt "a **b** c" in Teile mit und ohne Fettdruck. Rückgabe:
   [{ text: 'a ', fett: false }, { text: 'b', fett: true }, …] */
export function inlineTeile(text) {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter((t) => t !== '')
    .map((t) =>
      t.startsWith('**') && t.endsWith('**')
        ? { text: t.slice(2, -2), fett: true }
        : { text: t, fett: false }
    );
}

export function stand() {
  return new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}
