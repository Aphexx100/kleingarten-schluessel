/* Eine Zeile der Liste: zugeklappt ein Satz, aufgeklappt das Formular.
 *
 * Der Zustand des Formulars lebt in diesem Baustein (der "Entwurf"), nicht in
 * der Liste. Dadurch kann die Liste sich neu zeichnen, ohne dass einer, der
 * gerade eine Adresse eintippt, seine Eingabe verliert. Gespeichert wird erst
 * auf Knopfdruck — wer die Zeile zuklappt, ohne zu speichern, hat nichts
 * geändert.
 */

import { h, feld, leeren, anhaengen } from './dom.js';
import { groesseLesbar } from '../bilder.js';
import {
  ARTEN,
  ART_NAMEN,
  ART_KURZ,
  DATUM_BESCHRIFTUNG,
  bereinigen,
  fehler,
  heute,
  hinweise,
  zusammenfassung
} from '../modell.js';

export function zeile(garten, handlungen) {
  const { aufklappen, zuklappen, speichern, fotoHochladen, fotoLoeschen, verlauf } = handlungen;

  const el = h('li', { class: klassen(garten, false), dataset: { nr: String(garten.nr) } });
  let entwurf = null;
  let offen = false;
  let laeuft = false;

  function zeichnen() {
    leeren(el);
    el.className = klassen(garten, offen);
    el.append(kopfzeile());
    if (offen) el.append(formular());
  }

  /* ------------------------------------------------------ zugeklappt */

  function kopfzeile() {
    const unvollstaendig = garten.erhalten && fehler(garten) !== null;
    const fotoZahl = (garten.fotos ?? []).length;
    const fotoFehlt =
      garten.erhalten && (garten.art === 'hinterlegt' || garten.art === 'post') && fotoZahl === 0;

    /* Die Nummer steht als Zeichen links; für Vorlesesoftware muss sie noch
       einmal als Wort in die Beschriftung, sonst liest sie nur "5". */
    const vorgelesen = `Garten ${garten.nr}: ${zusammenfassung(garten)}`;

    return h(
      'button',
      {
        class: 'zeile',
        type: 'button',
        'aria-label': vorgelesen,
        'aria-expanded': String(offen),
        onclick: () => {
          if (offen) {
            offen = false;
            entwurf = null;
            zuklappen?.(garten.nr);
          } else {
            offen = true;
            entwurf = { ...garten };
            aufklappen?.(garten.nr);
          }
          zeichnen();
          if (offen) el.querySelector('.form input, .form select')?.focus({ preventScroll: true });
        }
      },
      h('span', { class: 'nr', text: String(garten.nr), 'aria-hidden': 'true' }),
      h(
        'span',
        { class: 'mitte' },
        /* Die Zusammenfassung ist die Hauptzeile: auf einem 375 Pixel breiten
           Handy ist jeder Buchstabe knapp, und "Garten 5" steht schon links. */
        h('span', { class: 'zusammenfassung', text: zusammenfassung(garten) }),
        fotoZahl > 0 || garten.erfasst_von
          ? h(
              'span',
              { class: 'unten' },
              fotoZahl > 0 ? h('span', { text: `${fotoZahl} Foto${fotoZahl > 1 ? 's' : ''}` }) : null,
              fotoZahl > 0 && garten.erfasst_von ? h('span', { text: '·' }) : null,
              garten.erfasst_von ? h('span', { text: garten.erfasst_von }) : null
            )
          : null
      ),
      garten.karte ? h('span', { class: 'marke karte', text: 'Karte' }) : null,
      unvollstaendig
        ? h('span', { class: 'marke achtung', text: 'Unvollständig' })
        : fotoFehlt
          ? h('span', { class: 'marke achtung', text: 'Foto fehlt' })
          : garten.erhalten
            ? h('span', { class: 'marke ja', text: ART_KURZ[garten.art] ?? 'Erhalten' })
            : h('span', { class: 'marke nein', text: 'Offen' }),
      h('span', { class: 'pfeil', 'aria-hidden': 'true', text: '›' })
    );
  }

  /* ------------------------------------------------------ aufgeklappt */

  function formular() {
    const form = h('div', { class: 'form' });
    const meldungsplatz = h('div');

    /* Schlüssel erhalten — der Schalter, von dem alles andere abhängt. */
    const schalter = h('input', {
      type: 'checkbox',
      id: `erhalten-${garten.nr}`,
      checked: entwurf.erhalten,
      onchange: (e) => {
        entwurf.erhalten = e.target.checked;
        /* Beim ersten Anhaken gleich ein brauchbarer Ausgangszustand: heutiges
           Datum und ein Schlüssel. Das ist der weitaus häufigste Fall. */
        if (entwurf.erhalten) {
          if (!entwurf.datum) entwurf.datum = heute();
          if (!entwurf.anzahl) entwurf.anzahl = 1;
        }
        zeichnen();
      }
    });

    /* Die Schlüsselkarte steht oben und eigens hervorgehoben: sie ist eine
       Leihgabe, die reihum geht, und wer sie gerade hat, ist die Frage, die
       am häufigsten gestellt wird. Sie hängt nicht am Schlüssel — ein Garten
       kann eine Karte haben, ohne schon einen Schlüssel bekommen zu haben. */
    form.append(
      h(
        'div',
        { class: entwurf.karte ? 'schalter karte an' : 'schalter karte' },
        h('input', {
          type: 'checkbox',
          id: `karte-${garten.nr}`,
          checked: entwurf.karte,
          onchange: (e) => {
            entwurf.karte = e.target.checked;
            zeichnen();
          }
        }),
        h('label', {
          for: `karte-${garten.nr}`,
          text: 'Schlüsselkarte ausgeliehen'
        })
      ),
      h('p', {
        class: 'hinweis karte-hinweis',
        text: entwurf.karte
          ? 'Zurückgeben nicht vergessen — es gibt nur 13 Karten für alle Gärten.'
          : 'Mit der Karte dürfen weitere Schlüssel nachgemacht werden. Es gibt 13 Stück, sie gehen reihum.'
      })
    );

    form.append(
      h(
        'div',
        /* Eigene Kennzeichnung: seit es den Kartenschalter gibt, waere
           ".schalter" allein mehrdeutig. */
        { class: 'schalter schluessel' },
        schalter,
        h('label', {
          for: `erhalten-${garten.nr}`,
          text: `Garten ${garten.nr} hat einen Schlüssel bekommen`
        })
      )
    );

    if (entwurf.erhalten) {
      /* Anzahl: meistens einer, aber es gibt 60 Schlüssel für 54 Gärten. */
      form.append(
        h(
          'div',
          { class: 'anzahl' },
          h('label', { for: `anzahl-${garten.nr}`, text: 'Anzahl Schlüssel' }),
          h(
            'select',
            {
              id: `anzahl-${garten.nr}`,
              onchange: (e) => {
                entwurf.anzahl = Number(e.target.value);
              }
            },
            [1, 2, 3, 4, 5].map((n) =>
              h('option', { value: String(n), selected: entwurf.anzahl === n, text: String(n) })
            )
          )
        )
      );

      /* Das Rollout. */
      form.append(
        h('label', { text: 'Wie wurde der Schlüssel übergeben?' }),
        h(
          'div',
          { class: 'rollout', role: 'radiogroup' },
          ARTEN.map((art) =>
            h(
              'label',
              { class: 'wahl' },
              h('input', {
                type: 'radio',
                name: `art-${garten.nr}`,
                value: art,
                checked: entwurf.art === art,
                onchange: () => {
                  entwurf.art = art;
                  zeichnen();
                }
              }),
              h('span', { text: ART_NAMEN[art] })
            )
          )
        )
      );

      if (entwurf.art) form.append(...artFelder());
    }

    /* Notiz gibt es immer — auch für offene Gärten ("niemand angetroffen"). */
    form.append(
      feld(
        'Notiz (freiwillig)',
        h('textarea', {
          rows: '2',
          value: entwurf.notiz ?? '',
          oninput: (e) => {
            entwurf.notiz = e.target.value;
          }
        })
      )
    );

    /* Hinweise, die nicht am Speichern hindern. */
    const offeneHinweise = hinweise(bereinigen(entwurf));
    if (offeneHinweise.length > 0) {
      meldungsplatz.append(
        h(
          'div',
          { class: 'meldung warnung' },
          offeneHinweise.length === 1
            ? offeneHinweise[0]
            : h('ul', {}, offeneHinweise.map((t) => h('li', { text: t })))
        )
      );
    }
    form.append(meldungsplatz);

    const sichern = h('button', {
      class: 'haupt',
      type: 'button',
      text: 'Speichern',
      disabled: laeuft,
      onclick: async () => {
        const sauber = bereinigen(entwurf);
        const problem = fehler(sauber);
        if (problem) {
          leeren(meldungsplatz).append(h('div', { class: 'meldung fehler', text: problem }));
          return;
        }
        laeuft = true;
        zeichnen();
        try {
          await speichern(sauber);
          /* Nach dem Speichern zuklappen: die Zeile ist erledigt, der Blick
             soll zurück auf die Liste gehen. */
          offen = false;
          entwurf = null;
        } catch (e) {
          leeren(meldungsplatz).append(
            h('div', { class: 'meldung fehler', text: e.message || 'Speichern fehlgeschlagen.' })
          );
        } finally {
          laeuft = false;
          zeichnen();
        }
      }
    });

    anhaengen(
      form,
      h(
        'div',
        { class: 'aktionen' },
        sichern,
        h('button', {
          class: 'leise',
          type: 'button',
          text: 'Abbrechen',
          disabled: laeuft,
          onclick: () => {
            offen = false;
            entwurf = null;
            zeichnen();
          }
        }),
        h('span', { class: 'luecke' }),
        verlauf
          ? h('button', {
              class: 'leise',
              type: 'button',
              text: 'Verlauf',
              onclick: async (e) => {
                const knopf = e.currentTarget;
                knopf.disabled = true;
                try {
                  const liste = await verlauf(garten.nr);
                  knopf.replaceWith(verlaufAnzeigen(liste));
                } catch {
                  knopf.disabled = false;
                }
              }
            })
          : null
      ),
      garten.geaendert_am
        ? h('p', {
            class: 'stand',
            text:
              `Zuletzt geändert am ${new Date(garten.geaendert_am).toLocaleString('de-DE')}` +
              (garten.erfasst_von ? ` von ${garten.erfasst_von}` : '')
          })
        : null
    );

    return form;
  }

  /* Die Felder, die zur gewählten Art gehören. */
  function artFelder() {
    const stuecke = [];

    if (entwurf.art === 'persoenlich') {
      stuecke.push(
        feld(
          'An wen wurde übergeben?',
          h('input', {
            type: 'text',
            value: entwurf.person ?? '',
            autocomplete: 'off',
            placeholder: 'Vor- und Nachname',
            oninput: (e) => {
              entwurf.person = e.target.value;
            }
          }),
          'Der Name der Person, die den Schlüssel in der Hand hatte.'
        )
      );
    }

    if (entwurf.art === 'hinterlegt') {
      stuecke.push(
        feld(
          'Wo wurde der Schlüssel hinterlegt?',
          h('textarea', {
            rows: '2',
            value: entwurf.ort ?? '',
            placeholder: 'z. B. Gerätehaus, oberes Regal links, brauner Umschlag',
            oninput: (e) => {
              entwurf.ort = e.target.value;
            }
          }),
          'So genau, dass die Person den Schlüssel ohne Rückfrage findet.'
        )
      );
    }

    if (entwurf.art === 'post') {
      stuecke.push(
        feld(
          'An welche Adresse?',
          h('textarea', {
            rows: '3',
            value: entwurf.adresse ?? '',
            placeholder: 'Name\nStraße und Hausnummer\nPLZ Ort',
            oninput: (e) => {
              entwurf.adresse = e.target.value;
            }
          })
        )
      );
    }

    stuecke.push(
      feld(
        DATUM_BESCHRIFTUNG[entwurf.art],
        h('input', {
          type: 'date',
          value: entwurf.datum ?? '',
          max: heute(),
          oninput: (e) => {
            entwurf.datum = e.target.value;
          }
        })
      )
    );

    /* Fotos nur dort, wo sie etwas belegen. Bei persönlicher Übergabe steht der
       Name als Nachweis, ein Foto wäre dort eher unangenehm als nützlich. */
    if (entwurf.art === 'hinterlegt' || entwurf.art === 'post') {
      stuecke.push(fotoBereich());
    }

    return stuecke;
  }

  /* ---------------------------------------------------------- Fotos */

  function fotoBereich() {
    const bereich = h('div', { class: 'fotos' });
    const galerie = h('div', { class: 'galerie' });
    const stand = h('span', { class: 'hinweis' });

    for (const foto of garten.fotos ?? []) {
      galerie.append(
        h(
          'figure',
          {},
          foto.url
            ? h('img', { src: foto.url, alt: foto.name, loading: 'lazy' })
            : h('div', { class: 'fehlt', text: 'Vorschau abgelaufen' }),
          h('figcaption', { text: groesseLesbar(foto.groesse) || foto.name }),
          h('button', {
            class: 'weg',
            type: 'button',
            text: '×',
            title: 'Dieses Foto entfernen',
            'aria-label': `Foto ${foto.name} entfernen`,
            onclick: async () => {
              if (!confirm('Dieses Foto wirklich entfernen?')) return;
              stand.textContent = 'Foto wird entfernt …';
              try {
                await fotoLoeschen(garten.nr, foto.pfad);
              } catch (e) {
                stand.textContent = e.message || 'Entfernen fehlgeschlagen.';
              }
            }
          })
        )
      );
    }

    /* capture bringt am Handy direkt die Kamera, nicht den Dateiauswähler —
       man steht vor dem Briefkasten und will fotografieren, nicht suchen. */
    const auswahl = h('input', {
      type: 'file',
      accept: 'image/*',
      capture: 'environment',
      multiple: true,
      onchange: async (e) => {
        const dateien = [...e.target.files];
        e.target.value = '';
        for (const [i, datei] of dateien.entries()) {
          stand.textContent = `Foto ${i + 1} von ${dateien.length} wird hochgeladen …`;
          try {
            await fotoHochladen(garten.nr, datei);
          } catch (err) {
            stand.textContent = err.message || 'Hochladen fehlgeschlagen.';
            return;
          }
        }
      }
    });

    bereich.append(
      h('label', {
        text:
          entwurf.art === 'hinterlegt'
            ? 'Foto vom Ort der Hinterlegung'
            : 'Foto vom Brief oder vom Einwurf'
      }),
      galerie,
      h(
        'div',
        { class: 'holen' },
        auswahl,
        h('button', {
          type: 'button',
          text: (garten.fotos ?? []).length > 0 ? 'Weiteres Foto' : 'Foto aufnehmen',
          onclick: () => auswahl.click()
        }),
        stand
      )
    );

    return bereich;
  }

  function verlaufAnzeigen(liste) {
    if (liste.length === 0) {
      return h('p', { class: 'verlauf', text: 'Für diesen Garten ist noch nichts verzeichnet.' });
    }
    return h(
      'div',
      { class: 'verlauf' },
      h('strong', { text: 'Änderungen' }),
      h(
        'ol',
        {},
        liste.map((e) =>
          h('li', {
            text:
              new Date(e.zeitpunkt).toLocaleString('de-DE') +
              (e.erfasst_von ? ` — ${e.erfasst_von}` : ' — ohne Namen') +
              ': ' +
              zusammenfassung(e.nachher ?? {})
          })
        )
      )
    );
  }

  /* -------------------------------------------------------- nach außen */

  zeichnen();

  return {
    el,
    nr: garten.nr,
    /* Neuer Datenstand von außen, z. B. nach einem Foto-Upload. Ein offenes
       Formular bleibt offen und der Entwurf bleibt erhalten — nur die Teile,
       die vom Server kommen (Fotos, Zeitstempel), werden übernommen. */
    aktualisieren(neu) {
      garten = neu;
      if (entwurf) entwurf = { ...entwurf, fotos: neu.fotos };
      zeichnen();
    },
    istOffen() {
      return offen;
    }
  };
}

function klassen(garten, offen) {
  const teile = ['garten'];
  if (garten.erhalten && fehler(garten) !== null) teile.push('unvollstaendig');
  else if (garten.erhalten) teile.push('erledigt');
  else teile.push('offen');
  /* Eigene Markierung, nicht statt der anderen: eine Zeile kann gleichzeitig
     versorgt sein und eine Karte draußen haben. */
  if (garten.karte) teile.push('hat-karte');
  if (offen) teile.push('auf');
  return teile.join(' ');
}
