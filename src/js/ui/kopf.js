/* Kopfbereich: Zahlen, Suche, Filter.
 *
 * Die vier Kacheln beantworten die Fragen, die im Vorstand tatsächlich gestellt
 * werden: Wie viele Gärten fehlen noch? Wie viele Schlüssel sind raus? Wie viele
 * habe ich noch? Und: ist irgendwo ein Nachweis offen?
 */

import { h } from './dom.js';
import { FILTER, statistik } from '../modell.js';

export function kopf({ name, demo, onSuche, onFilter, onNameAendern }) {
  const zahlen = h('div', { class: 'zahlen' });
  const balken = h('i');
  const filterleiste = h('div', { class: 'filter', role: 'group', 'aria-label': 'Liste filtern' });

  let aktiverFilter = 'alle';

  const suchfeld = h('input', {
    type: 'search',
    placeholder: 'Gartennummer, Name, Ort …',
    'aria-label': 'In der Liste suchen',
    oninput: (e) => onSuche(e.target.value)
  });

  const werZeile = h(
    'span',
    { class: 'wer' },
    'Einträge als ',
    h('b', { text: name || 'ohne Namen' }),
    ' ',
    h('button', {
      class: 'leise',
      type: 'button',
      text: 'ändern',
      onclick: () => {
        const neu = prompt('Welcher Name soll bei deinen Einträgen stehen?', name || '');
        if (neu !== null) onNameAendern(neu.trim());
      }
    })
  );

  function filterKnoepfe() {
    for (const [schluessel, beschriftung] of Object.entries(FILTER)) {
      filterleiste.append(
        h('button', {
          type: 'button',
          text: beschriftung,
          'aria-pressed': String(aktiverFilter === schluessel),
          dataset: { filter: schluessel },
          onclick: () => {
            aktiverFilter = schluessel;
            for (const k of filterleiste.children) {
              k.setAttribute('aria-pressed', String(k.dataset.filter === schluessel));
            }
            onFilter(schluessel);
          }
        })
      );
    }
  }

  filterKnoepfe();

  const el = h(
    'div',
    {},
    demo
      ? h('p', {
          class: 'demoband',
          text:
            'Vorführbetrieb: die Daten liegen nur in diesem Browserfenster und ' +
            'verschwinden beim Neuladen. Nichts wird gespeichert.'
        })
      : null,
    h(
      'div',
      { class: 'kopf' },
      h('h1', { text: 'Schlüsselausgabe Außentore' }),
      demo ? null : werZeile
    ),
    zahlen,
    h('div', { class: 'balken', role: 'presentation' }, balken),
    h('div', { class: 'werkzeuge' }, suchfeld),
    filterleiste
  );

  function kachel(wert, was, art) {
    return h(
      'div',
      { class: art ? `kachel ${art}` : 'kachel' },
      h('div', { class: 'wert', text: String(wert) }),
      h('div', { class: 'was', text: was })
    );
  }

  return {
    el,
    aktualisieren(gaerten) {
      const z = statistik(gaerten);

      zahlen.replaceChildren(
        kachel(`${z.versorgt}/${z.gaerten}`, 'Gärten versorgt', z.offen === 0 ? 'betont' : null),
        kachel(z.offen, 'noch offen', z.offen > 0 ? 'achtung' : null),
        kachel(`${z.ausgegeben}/${z.schluesselGesamt}`, 'Schlüssel ausgegeben'),
        kachel(
          z.uebrig,
          z.uebrig < 0 ? 'zu viele ausgegeben!' : 'Schlüssel übrig',
          z.uebrig < 0 ? 'achtung' : null
        ),
        /* Die 13 Schlüsselkarten sind Leihgaben: entscheidend ist, wie viele
           gerade draußen sind, nicht wie viele je ausgegeben wurden. */
        kachel(
          `${z.kartenDraussen}/${z.kartenGesamt}`,
          z.kartenUebrig < 0 ? 'mehr Karten als vorhanden!' : 'Karten draußen',
          z.kartenUebrig < 0 ? 'achtung' : z.kartenDraussen > 0 ? 'karte' : null
        )
      );

      const anteil = z.gaerten === 0 ? 0 : (z.versorgt / z.gaerten) * 100;
      balken.style.width = `${anteil}%`;
      balken.parentElement.setAttribute(
        'aria-label',
        `${z.versorgt} von ${z.gaerten} Gärten versorgt`
      );

      return z;
    },
    nameSetzen(neu) {
      werZeile.querySelector('b').textContent = neu || 'ohne Namen';
    },
    suchfeld
  };
}
