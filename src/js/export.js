/* Export für den Proton Drive.
 *
 * Die laufende Liste steht auf einem EU-Server, damit mehrere Leute gleichzeitig
 * eintragen können. Das Archiv gehört aber dorthin, wo du es haben willst: der
 * Knopf packt den vollständigen Stand — Tabelle, Rohdaten und alle Fotos — in
 * eine ZIP-Datei, die du in deinen Proton Drive legst.
 *
 * Bewusst eine Datei statt eines Ordners: ein ZIP lässt sich im Drive in einem
 * Zug hochladen und bleibt beisammen. Die CSV darin öffnet Excel oder
 * LibreOffice direkt.
 */

import { zipErstellen } from './zip.js';
import { ART_NAMEN, datumDE, statistik } from './modell.js';

const SPALTEN = [
  'Garten',
  'Schlüsselkarte',
  'Schlüssel erhalten',
  'Anzahl',
  'Art der Übergabe',
  'Person',
  'Ort der Hinterlegung',
  'Empfangsadresse',
  'Datum',
  'Fotos',
  'Notiz',
  'Eingetragen von',
  'Zuletzt geändert'
];

function csvFeld(wert) {
  const text = wert === null || wert === undefined ? '' : String(wert);
  /* Zeilenumbrüche in Adressen würden die Tabelle zerreißen. */
  const einzeilig = text.replace(/\r?\n/g, ' / ');
  return /[";]/.test(einzeilig) ? `"${einzeilig.replace(/"/g, '""')}"` : einzeilig;
}

export function alsCsv(gaerten) {
  const zeilen = [SPALTEN.join(';')];

  for (const g of gaerten) {
    zeilen.push(
      [
        g.nr,
        g.karte ? 'ausgeliehen' : '',
        g.erhalten ? 'ja' : 'nein',
        g.erhalten ? g.anzahl : '',
        g.art ? ART_NAMEN[g.art] : '',
        g.person,
        g.ort,
        g.adresse,
        datumDE(g.datum),
        (g.fotos ?? []).length,
        g.notiz,
        g.erfasst_von,
        g.geaendert_am ? new Date(g.geaendert_am).toLocaleString('de-DE') : ''
      ]
        .map(csvFeld)
        .join(';')
    );
  }

  /* Excel erkennt UTF-8 in CSV nur mit dieser Bytefolge am Anfang; ohne sie
     steht in der Tabelle "Schlüssel" als "SchlÃ¼ssel". */
  return '﻿' + zeilen.join('\r\n') + '\r\n';
}

function liesmich(gaerten, zeitpunkt) {
  const z = statistik(gaerten);
  return [
    'Schlüsselausgabe Außentore — Stand ' + zeitpunkt.toLocaleString('de-DE'),
    '',
    `Gärten insgesamt:        ${z.gaerten}`,
    `davon mit Schlüssel:     ${z.versorgt}`,
    `noch offen:              ${z.offen}`,
    '',
    `Schlüssel ausgegeben:    ${z.ausgegeben} von ${z.schluesselGesamt}`,
    `noch übrig:              ${z.uebrig}`,
    '',
    `Karten draußen:          ${z.kartenDraussen} von ${z.kartenGesamt}`,
    '',
    `persönlich übergeben:    ${z.nachArt.persoenlich}`,
    `hinterlegt:              ${z.nachArt.hinterlegt}`,
    `per Post geschickt:      ${z.nachArt.post}`,
    '',
    z.ohneFoto > 0
      ? `Achtung: ${z.ohneFoto} Übergabe(n) ohne Nachweisfoto.`
      : 'Alle Hinterlegungen und Postversände haben ein Nachweisfoto.',
    z.kartenUebrig < 0
      ? `Achtung: ${-z.kartenUebrig} Karte(n) mehr ausgeliehen als vorhanden.`
      : '',
    '',
    'Inhalt dieses Archivs',
    '---------------------',
    'liste.csv    Tabelle zum Öffnen in Excel oder LibreOffice',
    'liste.json   dieselben Daten maschinenlesbar, zum Wiedereinlesen',
    'fotos/       die Nachweisfotos, benannt nach Gartennummer',
    '',
    'Dieses Archiv enthält Namen, Adressen und Fotos und ist damit eine Sammlung',
    'personenbezogener Daten. Es gehört in einen geschützten Ordner und nicht in',
    'einen geteilten Link.'
  ].join('\n');
}

/* Lädt die Fotos über die kurzlebigen signierten Links nach. Einzelne Fehler
   brechen den Export nicht ab — eine fehlende Datei soll nicht verhindern, dass
   die Tabelle gesichert wird; stattdessen steht sie in der Fehlliste. */
async function fotosHolen(api, meldung) {
  const links = await api.fotosFuerExport();
  const dateien = [];
  const fehlend = [];

  let fertig = 0;
  for (const { path, signedUrl } of links) {
    meldung?.(`Fotos werden geholt … ${fertig} von ${links.length}`);
    try {
      const antwort = await fetch(signedUrl);
      if (!antwort.ok) throw new Error(String(antwort.status));
      const bytes = new Uint8Array(await antwort.arrayBuffer());
      /* "12/abc-def.jpg" wird zu "fotos/Garten-12-abc-def.jpg", damit die
         Dateien auch ausgepackt noch ihrem Garten zuzuordnen sind. */
      const [nr, rest] = path.split('/');
      dateien.push({ name: `fotos/Garten-${nr}-${rest}`, inhalt: bytes });
    } catch {
      fehlend.push(path);
    }
    fertig++;
  }

  return { dateien, fehlend };
}

export async function exportieren(gaerten, api, meldung) {
  const zeitpunkt = new Date();

  meldung?.('Tabelle wird erstellt …');
  const eintraege = [
    { name: 'LIESMICH.txt', inhalt: liesmich(gaerten, zeitpunkt) },
    { name: 'liste.csv', inhalt: alsCsv(gaerten) },
    {
      name: 'liste.json',
      inhalt: JSON.stringify(
        {
          erzeugt: zeitpunkt.toISOString(),
          schluesselGesamt: statistik(gaerten).schluesselGesamt,
          gaerten: gaerten.map(({ fotos, ...rest }) => ({
            ...rest,
            fotos: (fotos ?? []).map(({ pfad, name, groesse }) => ({ pfad, name, groesse }))
          }))
        },
        null,
        2
      )
    }
  ];

  const { dateien, fehlend } = await fotosHolen(api, meldung);
  eintraege.push(...dateien);

  if (fehlend.length > 0) {
    eintraege.push({
      name: 'FEHLENDE-FOTOS.txt',
      inhalt:
        'Diese Fotos konnten beim Export nicht geladen werden:\n\n' +
        fehlend.join('\n') +
        '\n\nBitte den Export später noch einmal ausführen.\n'
    });
  }

  meldung?.('Archiv wird gepackt …');
  const blob = zipErstellen(eintraege);
  const stempel = zeitpunkt.toISOString().slice(0, 10);

  return { blob, name: `schluessel-aussentore-${stempel}.zip`, fehlend: fehlend.length };
}

export function herunterladen(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  /* Erst freigeben, wenn der Browser den Download begonnen hat. */
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
