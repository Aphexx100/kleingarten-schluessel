/* Zusammenbau der Seite.
 *
 * Ablauf: Zugangscode holen → Liste laden → 54 Zeilen zeichnen. Danach lebt die
 * Seite von einzelnen Änderungen; es wird nie die ganze Liste neu gebaut.
 *
 * Warum das wichtig ist: wer in Garten 31 gerade eine Adresse eintippt, soll
 * seine Eingabe nicht verlieren, weil in Garten 4 jemand anders etwas
 * gespeichert hat. Jede Zeile behält darum ihr eigenes Element; Suche und
 * Filter blenden nur aus, statt neu zu zeichnen.
 */

import { api, zugang, ApiFehler } from './api.js';
import { demoApi } from './demo.js';
import { filtern, statistik } from './modell.js';
import { exportieren, herunterladen } from './export.js';
import { h, leeren } from './ui/dom.js';
import { kopf } from './ui/kopf.js';
import { zeile } from './ui/zeile.js';
import { zugangsmaske } from './ui/zugang.js';

const wurzel = document.getElementById('app');
const demo = new URLSearchParams(location.search).has('demo');
const dienst = demo ? demoApi : api;

let gaerten = [];
let zeilen = new Map();
let suche = '';
let filter = 'alle';
let kopfteil = null;
let listenEl = null;
let leermeldung = null;

/* ------------------------------------------------------------------ Start */

starten();

async function starten() {
  wurzel.setAttribute('aria-busy', 'true');

  if (!demo && !zugang.angemeldet()) {
    anmeldungZeigen();
    return;
  }

  try {
    gaerten = await dienst.laden();
  } catch (e) {
    /* Ein abgelehnter Code ist keine Störung, sondern heißt: neu anmelden. */
    if (e instanceof ApiFehler && (e.status === 401 || e.status === 0)) {
      if (e.status === 401) zugang.vergessen();
      anmeldungZeigen(e.status === 401 ? null : e.message);
      return;
    }
    stoerungZeigen(e.message);
    return;
  }

  seiteZeichnen();
}

function anmeldungZeigen(meldung) {
  /* append() wandelt null in die Zeichenkette "null" um und schreibt sie sichtbar
     ins Dokument — anders als h(), das leere Kinder verwirft. Darum hier vorher
     aussortieren. */
  const teile = [
    meldung
      ? h('div', { class: 'zugang' }, h('div', { class: 'meldung fehler', text: meldung }))
      : null,
    zugangsmaske(() => starten())
  ].filter(Boolean);

  leeren(wurzel).append(...teile);
  wurzel.setAttribute('aria-busy', 'false');
}

function stoerungZeigen(text) {
  leeren(wurzel).append(
    h(
      'div',
      { class: 'zugang' },
      h('h1', { text: 'Die Liste ist nicht erreichbar' }),
      h('div', { class: 'meldung fehler', text: text || 'Unbekannte Störung.' }),
      h(
        'div',
        { class: 'aktionen' },
        h('button', {
          class: 'haupt',
          type: 'button',
          text: 'Erneut versuchen',
          onclick: () => starten()
        }),
        h('button', {
          class: 'leise',
          type: 'button',
          text: 'Neu anmelden',
          onclick: () => {
            zugang.vergessen();
            anmeldungZeigen();
          }
        })
      )
    )
  );
  wurzel.setAttribute('aria-busy', 'false');
}

/* ------------------------------------------------------------- Zeichnen */

function seiteZeichnen() {
  kopfteil = kopf({
    name: zugang.name(),
    demo,
    onSuche: (wert) => {
      suche = wert;
      sichtbarkeit();
    },
    onFilter: (wert) => {
      filter = wert;
      sichtbarkeit();
    },
    onNameAendern: (neu) => {
      zugang.merken({ name: neu });
      kopfteil.nameSetzen(neu);
    }
  });

  listenEl = h('ul', { class: 'liste' });
  leermeldung = h('p', { class: 'leer', hidden: true, text: 'Keine Zeile passt zur Suche.' });

  zeilen = new Map();
  for (const garten of gaerten) {
    const bauteil = zeile(garten, {
      speichern: (entwurf) => speichern(entwurf),
      fotoHochladen: (nr, datei) => fotoHochladen(nr, datei),
      fotoLoeschen: (nr, pfad) => fotoLoeschen(nr, pfad),
      verlauf: (nr) => dienst.verlauf(nr)
    });
    zeilen.set(garten.nr, bauteil);
    listenEl.append(bauteil.el);
  }

  leeren(wurzel).append(kopfteil.el, listenEl, leermeldung, fuss());
  kopfteil.aktualisieren(gaerten);
  sichtbarkeit();
  wurzel.setAttribute('aria-busy', 'false');
}

/* Suche und Filter blenden Zeilen aus, statt die Liste neu zu bauen. */
function sichtbarkeit() {
  const treffer = new Set(filtern(gaerten, { suche, filter }).map((g) => g.nr));
  let gezeigt = 0;

  for (const [nr, bauteil] of zeilen) {
    /* Eine offene Zeile bleibt stehen, auch wenn sie nicht mehr zum Filter
       passt — sonst verschwindet sie unter den Händen, während man tippt. */
    const sichtbar = treffer.has(nr) || bauteil.istOffen();
    bauteil.el.hidden = !sichtbar;
    if (sichtbar) gezeigt++;
  }

  leermeldung.hidden = gezeigt > 0;
}

/* ------------------------------------------------------------- Vorgänge */

function uebernehmen(neu) {
  const i = gaerten.findIndex((g) => g.nr === neu.nr);
  if (i === -1) return;
  gaerten[i] = neu;
  zeilen.get(neu.nr)?.aktualisieren(neu);
  kopfteil.aktualisieren(gaerten);
  sichtbarkeit();
}

async function speichern(entwurf) {
  const gespeichert = await dienst.speichern(entwurf);
  uebernehmen(gespeichert);
}

async function fotoHochladen(nr, datei) {
  /* Erst im Browser verkleinern — siehe bilder.js. */
  const { vorbereiten } = await import('./bilder.js');
  const { blob, name } = await vorbereiten(datei);
  const neu = await dienst.fotoHochladen(nr, blob, name);
  uebernehmen(neu);
}

async function fotoLoeschen(nr, pfad) {
  const neu = await dienst.fotoLoeschen(nr, pfad);
  uebernehmen(neu);
}

/* ---------------------------------------------------------------- Fuß */

function fuss() {
  const stand = h('span', { class: 'hinweis' });

  const exportKnopf = h('button', {
    type: 'button',
    text: 'Als ZIP für Proton Drive',
    onclick: async () => {
      exportKnopf.disabled = true;
      const alt = exportKnopf.textContent;
      try {
        const ergebnis = await exportieren(gaerten, dienst, (text) => {
          exportKnopf.textContent = text;
        });
        herunterladen(ergebnis.blob, ergebnis.name);
        stand.textContent =
          ergebnis.fehlend > 0
            ? `Archiv erstellt, aber ${ergebnis.fehlend} Foto(s) fehlen — siehe FEHLENDE-FOTOS.txt im ZIP.`
            : `Archiv erstellt: ${ergebnis.name}. Jetzt in den Proton Drive legen.`;
      } catch (e) {
        stand.textContent = e.message || 'Der Export ist fehlgeschlagen.';
      } finally {
        exportKnopf.textContent = alt;
        exportKnopf.disabled = false;
      }
    }
  });

  const z = statistik(gaerten);

  return h(
    'div',
    { class: 'fuss' },
    exportKnopf,
    h('button', {
      type: 'button',
      text: 'Neu laden',
      onclick: () => starten()
    }),
    h('span', { class: 'luecke' }),
    demo
      ? null
      : h('button', {
          class: 'leise',
          type: 'button',
          text: 'Abmelden',
          onclick: () => {
            zugang.vergessen();
            anmeldungZeigen();
          }
        }),
    stand,
    h('p', {
      class: 'hinweis',
      text:
        z.ohneFoto > 0
          ? `Hinweis: bei ${z.ohneFoto} Übergabe(n) fehlt noch das Nachweisfoto. ` +
            'Über den Filter „Foto fehlt" sind sie schnell zu finden.'
          : 'Diese Liste enthält Namen, Adressen und Fotos. Den Zugangscode nur ' +
            'im Vorstand weitergeben und nicht zusammen mit dem Link verschicken.'
    })
  );
}
