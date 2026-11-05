/* Prueft von aussen, wie weit die Einrichtung ist.
 *
 * Braucht keine Zugangsdaten und keinen Datenbankschluessel — es wird nur das
 * befragt, was ohnehin oeffentlich antwortet. Jeder Schritt sagt entweder "ok"
 * oder, was genau zu tun ist.
 *
 * Aufruf:
 *   node scripts/pruefe-einrichtung.mjs
 *   node scripts/pruefe-einrichtung.mjs --mit-code   (prueft auch Code und Tabellen)
 *
 * Der Zugangscode wird dabei abgefragt und nirgends gespeichert — nicht in einer
 * Datei, nicht in der Befehlszeile (sonst stuende er in der Shell-Historie).
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Die Adresse aus index.html lesen, damit sie nur an einer Stelle steht. */
const html = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
const treffer = html.match(/window\.SCHLUESSEL_BASIS\s*=\s*'([^']*)'/);
const BASIS = treffer?.[1] ?? '';

if (!BASIS) {
  console.error('In index.html ist keine Adresse der Edge Function eingetragen.');
  process.exit(1);
}

const REF = BASIS.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];

const gruen = (t) => `\x1b[32m${t}\x1b[0m`;
const rot = (t) => `\x1b[31m${t}\x1b[0m`;
const gelb = (t) => `\x1b[33m${t}\x1b[0m`;

let offeneSchritte = 0;

function ok(was, zusatz) {
  console.log(`  ${gruen('ok')}    ${was}${zusatz ? gelb(`  (${zusatz})`) : ''}`);
}

function fehlt(was, zutun) {
  offeneSchritte++;
  console.log(`  ${rot('offen')} ${was}`);
  console.log(`         ${gelb('→ ' + zutun)}`);
}

async function frage(text) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const antwort = await new Promise((f) => rl.question(text, f));
  rl.close();
  return antwort.trim();
}

console.log(`\nProjekt ${REF ?? '?'} — ${BASIS}\n`);

/* ------------------------------------------------- 1. Projekt erreichbar */

let region = null;
try {
  const antwort = await fetch(`https://${REF}.supabase.co/rest/v1/`, { signal: AbortSignal.timeout(20_000) });
  if (antwort.status === 401 || antwort.ok) {
    ok('Das Projekt antwortet');
  } else {
    fehlt(`Das Projekt antwortet mit ${antwort.status}`, 'Projekt-Kennung in index.html pruefen');
  }
} catch (e) {
  fehlt('Das Projekt ist nicht erreichbar', `Internet und Projekt-Kennung pruefen (${e.message})`);
}

/* ------------------------------------------------------------ 2. Region */

/* Die Region steht in der Kopfzeile der Edge-Runtime. eu-central-1 ist
   Frankfurt — das ist der Punkt, der sich spaeter nicht mehr aendern laesst. */
let funktionDa = false;
let funktionAntwort = null;

try {
  const antwort = await fetch(BASIS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ aktion: 'pruefen', code: 'pruefskript-ohne-code' }),
    signal: AbortSignal.timeout(30_000)
  });

  region = antwort.headers.get('x-sb-edge-region');
  funktionAntwort = { status: antwort.status, text: await antwort.text() };
  funktionDa = antwort.status !== 404;

  if (region === 'eu-central-1') ok('Die Region ist Frankfurt', region);
  else if (region) fehlt(`Die Region ist ${region}, nicht Frankfurt`, 'Das Projekt in Central EU neu anlegen — die Region laesst sich nicht aendern');
  else console.log(`  ${gelb('?')}     Region nicht feststellbar`);
} catch (e) {
  fehlt('Die Edge Function ist nicht erreichbar', e.message);
}

/* --------------------------------------------- 3. Edge Function und Code */

if (funktionAntwort) {
  const { status, text } = funktionAntwort;
  let inhalt = {};
  try {
    inhalt = JSON.parse(text);
  } catch {
    /* kein JSON — dann hilft der Rohtext weiter */
  }

  if (status === 404) {
    fehlt(
      'Die Edge Function "api" ist nicht bereitgestellt',
      'Supabase → Edge Functions → Create a new function, Name genau "api", Inhalt aus supabase/functions/api/index.ts'
    );
  } else if (inhalt.code === 401 || /authorization|jwt/i.test(inhalt.message ?? '')) {
    fehlt(
      'Die Funktion verlangt noch einen Anmelde-Token',
      'In den Einstellungen der Funktion "Verify JWT" ausschalten'
    );
  } else if (inhalt.fehler === 'Auf dem Server ist kein Zugangscode eingerichtet.') {
    ok('Die Edge Function ist bereitgestellt und ohne Token erreichbar');
    fehlt(
      'Das Secret ZUGANGSCODE fehlt',
      'Supabase → Edge Functions → Secrets → ZUGANGSCODE anlegen, danach die Funktion neu bereitstellen'
    );
  } else if (status === 401 && /Zugangscode stimmt nicht/.test(inhalt.fehler ?? '')) {
    ok('Die Edge Function laeuft und weist falsche Codes ab');
  } else if (status === 429) {
    console.log(`  ${gelb('?')}     Die Bremse greift gerade — in 15 Minuten erneut pruefen`);
  } else {
    fehlt(
      `Unerwartete Antwort (${status})`,
      (text || '').slice(0, 200) || 'Die Protokolle der Funktion in Supabase ansehen'
    );
  }
}

/* ------------------------------------------- 4. Herkunft eingeschraenkt? */

/* Zwei Fragen, beide ohne Zugangsdaten beantwortbar: Kommt die Vereinsseite
   durch? Und bleiben fremde Seiten draussen?

   Der Trick ist dieselbe Vorab-Anfrage mit unterschiedlichem Origin. Die
   Funktion spiegelt einen erlaubten Origin zurueck; ist ERLAUBTE_HERKUNFT gar
   nicht gesetzt, spiegelt sie jeden. */
const VEREINSSEITEN = ['https://www.kgvgruenerwinkel.de', 'https://kgvgruenerwinkel.de'];
const SOLL_HERKUNFT = VEREINSSEITEN.join(',');

async function darfAnsprechen(origin) {
  const antwort = await fetch(BASIS, {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
    signal: AbortSignal.timeout(20_000)
  });
  return antwort.headers.get('access-control-allow-origin');
}

if (funktionDa) {
  const erfunden = 'https://fremde-seite.example';
  try {
    const beiFremd = await darfAnsprechen(erfunden);

    if (beiFremd === erfunden || beiFremd === '*') {
      fehlt(
        'Jede Webseite darf die Funktion ansprechen',
        `Secret ERLAUBTE_HERKUNFT auf ${SOLL_HERKUNFT} setzen (nur Ursprünge, keine Pfade)`
      );
    } else {
      ok('Fremde Seiten werden abgewiesen');

      /* Wichtiger als die Abweisung: kommt die eigene Seite noch durch? Ein
         Tippfehler im Secret sperrt sonst den Vorstand aus, und das faellt
         erst auf, wenn jemand vor der Liste steht. */
      for (const seite of VEREINSSEITEN) {
        const antwort = await darfAnsprechen(seite);
        if (antwort === seite) {
          ok(`${seite} darf die Funktion ansprechen`);
        } else {
          fehlt(
            `${seite} wird abgewiesen`,
            `ERLAUBTE_HERKUNFT muss beide Schreibweisen enthalten: ${SOLL_HERKUNFT}`
          );
        }
      }
    }
  } catch (e) {
    console.log(`  ${gelb('?')}     Herkunft nicht pruefbar (${e.message})`);
  }
}

/* ------------------------------------------------ 5. Tabellen (mit Code) */

if (process.argv.includes('--mit-code') && funktionDa) {
  console.log('');
  const code = await frage('Zugangscode (wird nirgends gespeichert): ');

  if (!code) {
    console.log(`  ${gelb('?')}     Ohne Code nicht pruefbar`);
  } else {
    try {
      const antwort = await fetch(BASIS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aktion: 'laden', code }),
        signal: AbortSignal.timeout(30_000)
      });
      const inhalt = await antwort.json().catch(() => ({}));

      if (antwort.status === 401) {
        fehlt('Der Zugangscode stimmt nicht', 'Wert des Secrets ZUGANGSCODE in Supabase pruefen');
      } else if (!antwort.ok) {
        fehlt(
          `Laden fehlgeschlagen (${antwort.status})`,
          inhalt.fehler === 'Auf dem Server ist etwas schiefgegangen.'
            ? 'Vermutlich fehlen die Tabellen — supabase/001_schema.sql im SQL Editor ausfuehren'
            : inhalt.fehler ?? 'Protokolle der Funktion ansehen'
        );
      } else {
        const gaerten = inhalt.gaerten ?? [];
        ok('Der Zugangscode stimmt');
        if (gaerten.length === 0) {
          fehlt(
            'Es sind keine Gaerten angelegt',
            'supabase/001_schema.sql im SQL Editor ausfuehren'
          );
        } else {
          const versorgt = gaerten.filter((g) => g.erhalten).length;
          ok(`${gaerten.length} Gaerten in der Datenbank`, `${versorgt} davon versorgt`);
          if (gaerten.length !== 54) {
            console.log(
              `  ${gelb('?')}     Erwartet waren 54 Gaerten — falls eure Nummerierung abweicht, ist das in Ordnung`
            );
          }
        }
      }
    } catch (e) {
      fehlt('Die Pruefung mit Code ist fehlgeschlagen', e.message);
    }
  }
} else if (funktionDa) {
  console.log(
    `\n  Fuer die Pruefung der Tabellen: ${gelb('node scripts/pruefe-einrichtung.mjs --mit-code')}`
  );
}

/* ------------------------------------------------------------- Abschluss */

console.log('');
if (offeneSchritte === 0) {
  console.log(gruen('Alles eingerichtet.\n'));
} else {
  console.log(`${offeneSchritte} Schritt(e) offen — Einzelheiten in docs/EINRICHTUNG.md`);
  /* Die Pruefung laeuft der Reihe nach: was hinter einem offenen Schritt liegt,
     ist von aussen noch gar nicht sichtbar. Das soll nicht als "nur noch das
     eine" missverstanden werden. */
  if (!funktionDa) {
    console.log(
      gelb('Dahinter liegende Schritte (Tabellen, Zugangscode) sind erst danach pruefbar.')
    );
  }
  console.log('');
  process.exitCode = 1;
}
