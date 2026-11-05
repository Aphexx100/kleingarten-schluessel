# Schlüsselausgabe Außentore

**Live: <https://www.kgvgruenerwinkel.de/schluessel/>** (Zugangscode nötig)

Eine Liste für die Verteilung der neuen Zylinderschlüssel im Kleingartenverein:
54 Gärten, 60 Schlüssel, 7 gleichschließende Zylinder.

Jeder Garten hat eine Zeile. Pro Garten wird festgehalten, ob er einen Schlüssel
bekommen hat und auf welchem Weg — persönlich übergeben, hinterlegt oder per
Post. Je nach Weg fragt die Zeile das ab, was später als Nachweis zählt:

| Weg | Angaben | Foto |
| --- | --- | --- |
| Persönlich übergeben | Name der Person, Datum | nein — der Name ist der Nachweis |
| Hinterlegt | Ort der Hinterlegung, Datum | ja, vom Ort |
| Per Post geschickt | Empfangsadresse, Datum des Abschickens | ja, vom Brief oder vom Einwurf |

Oben stehen die Zahlen, die im Vorstand gefragt werden: wie viele Gärten noch
offen sind, wie viele Schlüssel raus sind und wie viele übrig. Der Filter
„Foto fehlt" zeigt die Übergaben, bei denen der Nachweis noch aussteht.

Die Seite ist fürs Handy gebaut — Einträge entstehen meistens direkt nach der
Übergabe im Garten. Der Fotoknopf öffnet dort die Kamera, nicht den
Dateiauswähler.

## Ansehen ohne alles

```bash
npm install && npm start
```

Dann `http://localhost:8095/?demo` öffnen. Im Vorführbetrieb liegen die Daten
nur im Browserfenster: kein Server, kein Zugangscode, nichts wird gespeichert.

## Einrichtung

Siehe **[docs/EINRICHTUNG.md](docs/EINRICHTUNG.md)**. Kurz:

1. Supabase-Projekt in der Region **Central EU (Frankfurt)**
2. `supabase/001_schema.sql` im SQL Editor ausführen
3. Secret `ZUGANGSCODE` setzen
4. Edge Function `api` bereitstellen, dabei **„Verify JWT" ausschalten**
5. Liste mit `npm run nach-vereinsseite` auf die Vereinsseite bringen

## Wie der Zugang geregelt ist

Es gibt keine persönlichen Konten, sondern **einen gemeinsamen Zugangscode** für
den Vorstand. Wer die Seite öffnet, gibt ihn einmal ein; danach merkt der
Browser ihn.

Der reine Link genügt also nicht. Das ist der Punkt: die Seite ist öffentlich
erreichbar, und ohne Code stünden Namen, Adressen und Fotos für jeden offen,
der die Adresse kennt.

Technisch kommt der Browser nie an die Datenbank. Alle Zugriffe laufen über die
Edge Function `api`, die den Code prüft. Der Datenbankschlüssel liegt auf dem
Server, nicht im Seitenquelltext. Auf den Tabellen ist RLS aktiv und bewusst
*keine* Policy gesetzt — ohne die Funktion geht nichts.

Dazu: Vergleich des Codes ohne Laufzeitunterschied, Sperre nach zehn
Fehlversuchen für 15 Minuten, Fotos nur über Links, die nach einer Stunde
ablaufen, und ein Verlauf pro Zeile mit dem Namen, den die eintragende Person
angegeben hat.

Ein gemeinsamer Code hat eine bekannte Grenze: eine Änderung lässt sich nicht
beweisbar einer Person zuordnen, und wer ausscheidet, nimmt den Code mit. Wenn
jemand den Vorstand verlässt, den Code in Supabase ändern und neu verteilen.

## Warum nicht direkt auf Proton Drive

Ursprünglich sollten die Daten im Proton Drive liegen. Das geht für eine
Webseite nicht, und zwar aus mehreren Gründen gleichzeitig:

- Das [Proton Drive SDK](https://github.com/ProtonDriveApps/sdk) enthält
  ausdrücklich **keine Authentifizierung und keine Sitzungsverwaltung**. Diese
  Teile liefert Proton nur in seinen eigenen Apps.
- Einen OAuth-Zugang für fremde Anwendungen gibt es nicht — er steht seit Jahren
  als unerfüllter Wunsch in Protons Feedback-Forum.
- Das README des SDK sagt, es sei **nicht für den Produktiveinsatz durch Dritte
  bereit**; eine Freigabe wird auf Ende 2026 / Anfang 2027 geschätzt.
- Für Ende 2026 ist zudem eine Umstellung der Verschlüsselung angekündigt, nach
  der ältere SDK-Versionen nicht mehr funktionieren.

Praktisch hieße das: die App müsste das Proton-Passwort selbst eingeben, und
dieses Passwort läge im Browser jedes Vorstandsmitglieds. Das verbietet sich.

Stattdessen: die laufende Liste steht auf einem Server in Frankfurt, und der
Knopf **„Als ZIP für Proton Drive"** packt den vollständigen Stand — Tabelle,
Rohdaten und alle Fotos — in eine Datei, die in den Proton Drive hochgeladen
wird. Das Archiv liegt damit genau dort, wo es liegen soll.

## Aufbau

```
index.html              Gerüst, lädt die Module
src/css/tokens.css      Farben und Abstände, hell und dunkel
src/css/app.css         Aussehen
src/js/modell.js        Regeln, Zahlen, Filter — reine Rechnung, voll getestet
src/js/api.js           Verbindung zur Edge Function
src/js/demo.js          Vorführbetrieb ohne Server
src/js/bilder.js        Fotos verkleinern vor dem Hochladen
src/js/zip.js           kleiner ZIP-Schreiber ohne Abhängigkeiten
src/js/export.js        das Archiv für den Proton Drive
src/js/ui/              Zugangsmaske, Kopfbereich, Gartenzeile
supabase/001_schema.sql Tabellen, RLS, Fotospeicher
supabase/functions/api/ die Edge Function
```

Reine ES-Module ohne Laufzeit-Abhängigkeiten. `esbuild` und `playwright` werden
nur zum Bauen und Testen gebraucht.

## Prüfen

```bash
npm run check
```

Das sind 34 Prüfungen der Rechenteile (Regeln, Statistik, Filter, CSV, ZIP) und
30 im echten Browser (eintragen, Rollout wechseln, Pflichtfelder, suchen,
filtern, exportieren). **Muss vor jedem Push grün sein.**

Eine der Prüfungen vergleicht die Pflichtfeld-Regeln in `src/js/modell.js` mit
denen in der Edge Function — die stehen notgedrungen doppelt, und der Test
sorgt dafür, dass sie nicht auseinanderlaufen.

## Wenn die Ausgabe durch ist

Letzten ZIP-Export ziehen, in den Proton Drive legen, Supabase-Projekt löschen.
Die Daten haben dann ihren Zweck erfüllt.
