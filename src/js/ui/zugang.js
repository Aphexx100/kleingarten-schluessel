/* Die Anmeldung: ein gemeinsamer Zugangscode für alle.
 *
 * Es gibt keine persönlichen Konten — so war es gewollt. Der Code ersetzt sie
 * und sorgt dafür, dass die Liste nicht offen im Netz steht, nur weil jemand
 * die Adresse kennt. Der Name daneben ist freiwillig und dient nur dazu, im
 * Verlauf zu sehen, wer einen Eintrag gemacht hat.
 *
 * Die Serveradresse wird nur gezeigt, wenn sie nicht schon beim Bauen eingesetzt
 * wurde — im Alltag soll dort niemand etwas eintippen müssen.
 */

import { h, feld } from './dom.js';
import { zugang } from '../api.js';

export function zugangsmaske(onFertig) {
  const basisVorhanden = Boolean(zugang.basis());

  const codefeld = h('input', {
    type: 'password',
    autocomplete: 'current-password',
    placeholder: 'Zugangscode',
    value: ''
  });

  const basisfeld = h('input', {
    type: 'url',
    autocomplete: 'off',
    placeholder: 'https://….supabase.co/functions/v1/api',
    value: zugang.basis()
  });

  const namensfeld = h('input', {
    type: 'text',
    autocomplete: 'name',
    placeholder: 'z. B. Sascha',
    value: zugang.name()
  });

  const meldung = h('div');

  const knopf = h('button', { class: 'haupt', type: 'submit', text: 'Liste öffnen' });

  const form = h(
    'form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        meldung.replaceChildren();

        const code = codefeld.value;
        const basis = basisfeld.value.trim();

        if (!basis) {
          zeigeFehler('Bitte die Adresse des Servers eintragen.');
          return;
        }
        if (!code) {
          zeigeFehler('Bitte den Zugangscode eintragen.');
          return;
        }

        knopf.disabled = true;
        knopf.textContent = 'Wird geprüft …';
        zugang.merken({ basis, code, name: namensfeld.value });

        try {
          /* Ein Probeaufruf, damit ein falscher Code hier auffällt und nicht
             erst beim ersten Speichern. */
          const { api } = await import('../api.js');
          await api.pruefen();
          onFertig();
        } catch (fehlschlag) {
          /* Den Code nicht behalten, wenn er nicht stimmt — sonst scheitert
             beim nächsten Laden alles stumm. */
          zugang.vergessen();
          zeigeFehler(fehlschlag.message || 'Die Anmeldung hat nicht funktioniert.');
          knopf.disabled = false;
          knopf.textContent = 'Liste öffnen';
          codefeld.focus();
          codefeld.select();
        }
      }
    },
    h('h1', { text: 'Schlüsselausgabe Außentore' }),
    h('p', {
      class: 'vorab',
      text: 'Bitte den gemeinsamen Zugangscode des Vorstands eingeben.'
    }),
    meldung,
    feld('Zugangscode', codefeld),
    feld(
      'Dein Name (freiwillig)',
      namensfeld,
      'Steht später im Verlauf deiner Einträge. Kann leer bleiben.'
    ),
    basisVorhanden
      ? h(
          'details',
          {},
          h('summary', { text: 'Serveradresse ändern' }),
          h('div', { style: 'margin-top: 12px' }, feld('Adresse der Edge Function', basisfeld))
        )
      : feld(
          'Adresse der Edge Function',
          basisfeld,
          'Steht in Supabase unter Edge Functions → api. Siehe docs/EINRICHTUNG.md.'
        ),
    h('div', { class: 'aktionen' }, knopf)
  );

  function zeigeFehler(text) {
    meldung.replaceChildren(h('div', { class: 'meldung fehler', text }));
  }

  /* Nach dem Zeichnen den Fokus setzen, damit man direkt tippen kann. */
  setTimeout(() => codefeld.focus(), 0);

  return h('div', { class: 'zugang' }, form);
}
