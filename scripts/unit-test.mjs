/* Prueft die Rechenteile ohne Browser: Regeln, Zahlen, Filter, CSV, ZIP.
 *
 * Kein Testwerkzeug als Abhaengigkeit — node:test und node:assert reichen und
 * sind schon da.
 *
 * Aufruf:  node scripts/unit-test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ARTEN,
  FILTER,
  SCHLUESSEL_GESAMT,
  bereinigen,
  datumDE,
  fehler,
  filtern,
  heute,
  hinweise,
  leererGarten,
  statistik,
  zusammenfassung
} from '../src/js/modell.js';
import { alsCsv } from '../src/js/export.js';
import { crc32, zipErstellen } from '../src/js/zip.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Baut einen Garten mit den uebergebenen Abweichungen vom Leerzustand. */
const g = (nr, werte = {}) => ({ ...leererGarten(nr), ...werte });

const persoenlich = (nr) =>
  g(nr, { erhalten: true, art: 'persoenlich', person: 'Anna Berger', datum: '2026-11-02' });
const hinterlegt = (nr, extra = {}) =>
  g(nr, { erhalten: true, art: 'hinterlegt', ort: 'Gerätehaus', datum: '2026-11-03', ...extra });
const post = (nr, extra = {}) =>
  g(nr, {
    erhalten: true,
    art: 'post',
    adresse: 'Marianne Voss\nLindenstraße 14\n45127 Essen',
    datum: '2026-11-04',
    ...extra
  });

/* ------------------------------------------------------------- Regeln */

test('eine leere Zeile ist gueltig — nichts erhalten heisst nichts auszufuellen', () => {
  assert.equal(fehler(leererGarten(7)), null);
});

test('erhalten ohne Art der Uebergabe ist unvollstaendig', () => {
  assert.match(fehler(g(7, { erhalten: true })), /wie der Schlüssel übergeben/);
});

test('jede Art verlangt ihr eigenes Pflichtfeld', () => {
  assert.match(fehler({ ...persoenlich(1), person: null }), /Namen der Person/);
  assert.match(fehler({ ...hinterlegt(2), ort: null }), /wo der Schlüssel hinterlegt/);
  assert.match(fehler({ ...post(3), adresse: null }), /Empfangsadresse/);
});

test('leerzeichenfelder zaehlen nicht als ausgefuellt', () => {
  assert.match(fehler({ ...persoenlich(1), person: '   ' }), /Namen der Person/);
});

test('jede Art verlangt ein Datum', () => {
  for (const art of ARTEN) {
    const basis = { persoenlich, hinterlegt, post }[art](1);
    assert.match(fehler({ ...basis, datum: null }), /Datum/, `Art ${art} ohne Datum`);
  }
});

test('vollstaendige Zeilen sind fehlerfrei', () => {
  assert.equal(fehler(persoenlich(1)), null);
  assert.equal(fehler(hinterlegt(2)), null);
  assert.equal(fehler(post(3)), null);
});

/* Die Regeln stehen doppelt: hier und in der Edge Function. Dieser Test
   vergleicht sie Wort fuer Wort, damit die beiden nicht auseinanderlaufen. */
test('die Edge Function prueft dieselben Pflichtfelder wie das Modell', () => {
  const quelle = fs.readFileSync(
    path.join(WURZEL, 'supabase/functions/api/index.ts'),
    'utf8'
  );
  const block = quelle.slice(quelle.indexOf('function fehler('));
  assert.ok(block.includes("!g.erhalten) return null"), 'leere Zeile bleibt gueltig');
  assert.ok(block.includes("!g.datum"), 'Datum ist Pflicht');
  assert.ok(block.includes("g.art === 'persoenlich' && !g.person"), 'Person ist Pflicht');
  assert.ok(block.includes("g.art === 'hinterlegt' && !g.ort"), 'Ort ist Pflicht');
  assert.ok(block.includes("g.art === 'post' && !g.adresse"), 'Adresse ist Pflicht');
  for (const art of ARTEN) {
    assert.ok(quelle.includes(`'${art}'`), `Art ${art} ist der Function bekannt`);
  }
});

/* --------------------------------------------------------------- Hinweise */

test('Hinterlegung und Post ohne Foto werden angemahnt, persoenlich nicht', () => {
  assert.match(hinweise(hinterlegt(1))[0], /kein Foto|Ohne Foto/);
  assert.match(hinweise(post(2))[0], /Ohne Foto/);
  assert.deepEqual(hinweise(persoenlich(3)), []);
});

test('mit Foto gibt es keinen Hinweis mehr', () => {
  const mitFoto = hinterlegt(1, { fotos: [{ pfad: '1/a.jpg', name: 'a.jpg', groesse: 10 }] });
  assert.deepEqual(hinweise(mitFoto), []);
});

test('ein Datum in der Zukunft faellt auf', () => {
  const morgen = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  assert.ok(hinweise({ ...persoenlich(1), datum: morgen }).some((t) => /Zukunft/.test(t)));
});

test('heute() liefert ein ISO-Datum ohne Zeitzonenversatz', () => {
  const jetzt = new Date();
  const erwartet = [
    jetzt.getFullYear(),
    String(jetzt.getMonth() + 1).padStart(2, '0'),
    String(jetzt.getDate()).padStart(2, '0')
  ].join('-');
  assert.equal(heute(), erwartet);
});

/* ------------------------------------------------------------ Bereinigen */

test('beim Wechsel der Art bleiben keine Angaben der alten Art stehen', () => {
  const vorher = { ...hinterlegt(5), art: 'post', adresse: 'Neue Adresse' };
  const nachher = bereinigen(vorher);
  assert.equal(nachher.ort, null, 'der alte Ort ist weg');
  assert.equal(nachher.adresse, 'Neue Adresse');
});

test('wird der Haken entfernt, bleibt keine Uebergabe zurueck', () => {
  const nachher = bereinigen({ ...post(9), erhalten: false });
  assert.equal(nachher.art, null);
  assert.equal(nachher.adresse, null);
  assert.equal(nachher.datum, null);
  assert.equal(nachher.anzahl, 0);
});

/* ---------------------------------------------------------- Darstellung */

test('datumDE dreht das ISO-Datum', () => {
  assert.equal(datumDE('2026-11-02'), '02.11.2026');
  assert.equal(datumDE(null), '');
  assert.equal(datumDE('kaputt'), '');
});

test('die Zusammenfassung nennt das Wesentliche je Art', () => {
  assert.equal(zusammenfassung(leererGarten(3)), 'Noch kein Schlüssel');
  assert.equal(zusammenfassung(persoenlich(1)), 'Persönlich an Anna Berger, 02.11.2026');
  assert.match(zusammenfassung(hinterlegt(2)), /^Hinterlegt: Gerätehaus, 03\.11\.2026$/);
  /* Bei der Post nur die erste Zeile der Adresse, damit die Zeile schmal bleibt. */
  assert.equal(zusammenfassung(post(3)), 'Post an Marianne Voss, abgeschickt 04.11.2026');
});

test('mehrere Schluessel stehen in der Zusammenfassung', () => {
  assert.match(zusammenfassung({ ...persoenlich(1), anzahl: 2 }), /\(2 Schlüssel\)$/);
  assert.doesNotMatch(zusammenfassung(persoenlich(1)), /Schlüssel\)/);
});

/* ---------------------------------------------------------------- Zahlen */

test('die Statistik zaehlt Gaerten, Schluessel und Arten', () => {
  const liste = [
    persoenlich(1),
    { ...persoenlich(2), anzahl: 2 },
    hinterlegt(5, { fotos: [{ pfad: '5/a.jpg' }] }),
    post(9, { fotos: [{ pfad: '9/a.jpg' }] }),
    leererGarten(3),
    leererGarten(4)
  ];
  const z = statistik(liste);

  assert.equal(z.gaerten, 6);
  assert.equal(z.versorgt, 4);
  assert.equal(z.offen, 2);
  assert.equal(z.ausgegeben, 5, '1 + 2 + 1 + 1');
  assert.equal(z.uebrig, SCHLUESSEL_GESAMT - 5);
  assert.deepEqual(z.nachArt, { persoenlich: 2, hinterlegt: 1, post: 1 });
  assert.equal(z.ohneFoto, 0);
  assert.equal(z.unvollstaendig, 0);
});

test('fehlende Nachweisfotos und unvollstaendige Zeilen werden gezaehlt', () => {
  const z = statistik([
    hinterlegt(1),
    post(2),
    persoenlich(3),
    { ...persoenlich(4), person: null }
  ]);
  assert.equal(z.ohneFoto, 2, 'Hinterlegung und Post ohne Foto');
  assert.equal(z.unvollstaendig, 1, 'die Zeile ohne Namen');
});

test('mehr ausgegebene als vorhandene Schluessel ergeben einen negativen Rest', () => {
  const viele = Array.from({ length: 31 }, (_, i) => ({ ...persoenlich(i + 1), anzahl: 2 }));
  assert.equal(statistik(viele).uebrig, SCHLUESSEL_GESAMT - 62);
});

/* ---------------------------------------------------------------- Filter */

test('die Filterliste deckt alle Arten ab', () => {
  for (const art of ARTEN) assert.ok(art in FILTER, `Filter fuer ${art}`);
  assert.ok('offen' in FILTER && 'erledigt' in FILTER && 'ohneFoto' in FILTER);
});

test('Filter trennen offen, erledigt und die Arten', () => {
  const liste = [persoenlich(1), hinterlegt(2), post(3), leererGarten(4)];
  const nr = (f) => filtern(liste, { filter: f }).map((x) => x.nr);

  assert.deepEqual(nr('alle'), [1, 2, 3, 4]);
  assert.deepEqual(nr('offen'), [4]);
  assert.deepEqual(nr('erledigt'), [1, 2, 3]);
  assert.deepEqual(nr('persoenlich'), [1]);
  assert.deepEqual(nr('hinterlegt'), [2]);
  assert.deepEqual(nr('post'), [3]);
});

test('der Filter "Foto fehlt" meint nur Zeilen, die ein Foto brauchen', () => {
  const liste = [
    persoenlich(1),
    hinterlegt(2),
    post(3, { fotos: [{ pfad: '3/a.jpg' }] }),
    leererGarten(4)
  ];
  assert.deepEqual(
    filtern(liste, { filter: 'ohneFoto' }).map((x) => x.nr),
    [2],
    'die persoenliche Uebergabe und der leere Garten brauchen keins'
  );
});

test('die Suche nach einer Gartennummer trifft genau diesen Garten', () => {
  const liste = [leererGarten(7), leererGarten(17), leererGarten(27), leererGarten(70)];
  assert.deepEqual(
    filtern(liste, { suche: '7' }).map((x) => x.nr),
    [7],
    '17, 27 und 70 sind nicht gemeint'
  );
});

test('die Suche findet Namen, Orte und Adressen, Gross- und Kleinschreibung egal', () => {
  const liste = [persoenlich(1), hinterlegt(2), post(3)];
  assert.deepEqual(filtern(liste, { suche: 'anna' }).map((x) => x.nr), [1]);
  assert.deepEqual(filtern(liste, { suche: 'GERÄTEHAUS' }).map((x) => x.nr), [2]);
  assert.deepEqual(filtern(liste, { suche: 'Lindenstraße' }).map((x) => x.nr), [3]);
  assert.deepEqual(filtern(liste, { suche: 'nichts dergleichen' }), []);
});

test('Suche und Filter wirken zusammen', () => {
  const liste = [persoenlich(1), { ...hinterlegt(2), ort: 'Anna hat ihn' }];
  assert.deepEqual(
    filtern(liste, { suche: 'anna', filter: 'hinterlegt' }).map((x) => x.nr),
    [2]
  );
});

/* ------------------------------------------------------------------- CSV */

test('die CSV traegt eine Byte-Marke und Semikolons fuer Excel', () => {
  const csv = alsCsv([persoenlich(1)]);
  assert.ok(csv.startsWith('﻿'), 'ohne Byte-Marke zeigt Excel Umlaute falsch');
  assert.ok(csv.split('\r\n')[0].includes('Garten;'));
});

test('mehrzeilige Adressen zerreissen die CSV nicht', () => {
  const zeilen = alsCsv([post(9)]).trim().split('\r\n');
  assert.equal(zeilen.length, 2, 'Kopfzeile und genau eine Datenzeile');
  assert.ok(zeilen[1].includes('Marianne Voss / Lindenstraße 14 / 45127 Essen'));
});

test('Anfuehrungszeichen und Semikolons in Notizen werden maskiert', () => {
  const csv = alsCsv([{ ...persoenlich(1), notiz: 'Er sagte "ja"; sie nicht' }]);
  assert.ok(csv.includes('"Er sagte ""ja""; sie nicht"'));
});

test('offene Gaerten stehen mit nein in der Tabelle', () => {
  const zeile = alsCsv([leererGarten(4)]).trim().split('\r\n')[1];
  assert.ok(zeile.startsWith('4;nein;'));
});

/* ------------------------------------------------------------------- ZIP */

test('crc32 stimmt mit dem bekannten Wert fuer "123456789" ueberein', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('das ZIP hat die richtigen Kennungen und enthaelt alle Eintraege', async () => {
  const blob = zipErstellen([
    { name: 'liste.csv', inhalt: 'a;b\r\n1;2\r\n' },
    { name: 'fotos/Garten-5-a.jpg', inhalt: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) }
  ]);
  const bytes = new Uint8Array(await blob.arrayBuffer());

  assert.equal(blob.type, 'application/zip');
  /* "PK\x03\x04" am Anfang, "PK\x05\x06" fuer das Ende des Verzeichnisses. */
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes('liste.csv'));
  assert.ok(text.includes('fotos/Garten-5-a.jpg'));
  assert.equal((text.match(/PK\x01\x02/g) ?? []).length, 2, 'zwei Verzeichniseintraege');
  assert.ok(text.includes('PK\x05\x06'), 'Abschluss des Verzeichnisses');
});

test('Umlaute in Dateinamen werden als UTF-8 gekennzeichnet', async () => {
  const bytes = new Uint8Array(
    await zipErstellen([{ name: 'Übergabe.txt', inhalt: 'x' }]).arrayBuffer()
  );
  /* Bit 11 im Flaggenfeld (Versatz 6) sagt dem Entpacker: der Name ist UTF-8. */
  const flaggen = bytes[6] | (bytes[7] << 8);
  assert.ok(flaggen & 0x800, 'ohne dieses Bit zeigt Windows "Ãœbergabe"');
});

/* -------------------------------------------------------------- Aufbau */

test('das Schema legt 54 Gaerten an und sperrt den direkten Zugriff', () => {
  const sql = fs.readFileSync(path.join(WURZEL, 'supabase/001_schema.sql'), 'utf8');
  assert.ok(/generate_series\(1,\s*54\)/.test(sql), '54 Gaerten');
  assert.ok(/alter table gaerten enable row level security/.test(sql));
  assert.ok(!/create policy/.test(sql), 'ohne Policy kommt der anon-Key nicht an die Daten');
  assert.ok(/'fotos'.*false/s.test(sql), 'der Fotospeicher ist nicht oeffentlich');
});

test('die Edge Function bremst das Durchprobieren und vergleicht in fester Zeit', () => {
  const quelle = fs.readFileSync(path.join(WURZEL, 'supabase/functions/api/index.ts'), 'utf8');
  assert.ok(quelle.includes('MAX_FEHLVERSUCHE'), 'Fehlversuche werden begrenzt');
  assert.ok(/abweichung \|=/.test(quelle), 'Vergleich ohne Laufzeitunterschied');
  assert.ok(!/SUPABASE_ANON_KEY/.test(quelle), 'die Function benutzt den service_role-Key');
  assert.ok(quelle.includes('createSignedUrls'), 'Fotos nur ueber kurzlebige Links');
});
