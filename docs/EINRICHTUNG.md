# Einrichtung

Einmalige Arbeit, etwa eine halbe Stunde. Du brauchst nichts zu programmieren,
aber du musst zweimal etwas kopieren und einmal einen Haken setzen.

**Wichtig vorweg:** Zugangscode, Schlüssel und Passwörter gehören nie in den
Chat und nie ins Repo. Sie werden nur im Supabase-Dashboard und im Browser
eingetragen.

## Nach jedem Schritt prüfen

```bash
npm run einrichtung
```

Sagt dir, was schon steht und was als Nächstes dran ist. Braucht keine
Zugangsdaten. Sobald die Edge Function läuft, prüft

```bash
node scripts/pruefe-einrichtung.mjs --mit-code
```

zusätzlich Zugangscode und Tabellen; der Code wird dabei abgefragt und nirgends
gespeichert.

---

## 1. Supabase-Projekt anlegen (EU, Frankfurt) — ✅ erledigt

Projekt `yrvlclolmkdqrkkhbnvn`, Region **`eu-central-1` (Frankfurt)** — am
2026-11-05 von außen bestätigt. Die Adresse der Edge Function steht bereits in
`index.html`, sie muss niemand abtippen.

<details>
<summary>Wie es angelegt wurde (falls je ein zweites Projekt nötig ist)</summary>

1. Auf [supabase.com](https://supabase.com) anmelden und **New project** wählen.
2. Name: z. B. `kleingarten-schluessel`.
3. **Region: `Central EU (Frankfurt)`** — das ist der Punkt, an dem entschieden
   wird, wo die Daten liegen. Später lässt sich die Region nicht mehr ändern.
4. Das Datenbank-Passwort, das dabei vergeben wird, in deinem Passwortspeicher
   ablegen. Du brauchst es im Alltag nicht.

Der kostenlose Tarif reicht für 54 Gärten mit Fotos bei Weitem.
</details>

## 2. Tabellen anlegen

1. Im Projekt links auf **SQL Editor**.
2. Den gesamten Inhalt von [`supabase/001_schema.sql`](../supabase/001_schema.sql)
   hineinkopieren und **Run** drücken.
3. Es sollte „Success. No rows returned" erscheinen.

Danach stehen unter **Table Editor** die Tabellen `gaerten` (mit 54 Zeilen),
`aenderungen` und `zugriffsversuche`, und unter **Storage** ein nicht
öffentlicher Ordner `fotos`.

### Wenn eure Gärten anders nummeriert sind

Das Schema legt die Nummern 1 bis 54 an. Falls eure Parzellen andere Nummern
haben, im SQL Editor stattdessen dies ausführen und die Liste anpassen:

```sql
delete from gaerten;
insert into gaerten (nr) values
  (1),(2),(3),(5),(6),(8),(11),(12);  -- eure echten Nummern, Komma getrennt
```

Das geht nur, solange noch nichts eingetragen ist.

## 3. Den gemeinsamen Zugangscode festlegen

1. Links auf **Edge Functions**, dann auf den Reiter **Secrets**.
2. Ein neues Secret anlegen:
   - Name: `ZUGANGSCODE`
   - Wert: ein Code deiner Wahl, den der Vorstand bekommt.

Nimm etwas, das man am Telefon durchgeben kann, aber nicht zu erraten ist — drei
zufällige Wörter sind besser als ein kurzes Passwort, zum Beispiel
`Hollunder-Regenfass-17`. **Nicht** den Vereinsnamen, nicht „Kleingarten2026".

Wer den Code hat, sieht alle Namen, Adressen und Fotos. Er gehört in den
Vorstand und sonst nirgendwohin — und nicht in dieselbe Nachricht wie der Link
zur Seite.

Optional, empfehlenswert sobald die Seite online ist: ein zweites Secret
`ERLAUBTE_HERKUNFT` mit dem Wert deiner Pages-Adresse, z. B.
`https://aphexx100.github.io`. Dann nehmen andere Webseiten die Funktion nicht
in Anspruch.

## 4. Die Edge Function anlegen

1. Unter **Edge Functions** auf **Create a new function**.
2. Als Namen genau `api` eintragen — die Seite ruft diesen Namen auf.
3. Den gesamten Inhalt von
   [`supabase/functions/api/index.ts`](../supabase/functions/api/index.ts) in den
   Editor kopieren und bereitstellen (**Deploy**).

**Der eine Haken, der leicht übersehen wird:** Supabase verlangt bei Funktionen
ab Werk einen Anmelde-Token. Diese Funktion prüft stattdessen selbst den
Zugangscode, darf also ohne Token erreichbar sein. In den Einstellungen der
Funktion deshalb **„Verify JWT" ausschalten**. Ohne das antwortet die Seite
immer mit „401" und man sucht an der falschen Stelle.

Die Adresse ist dann

```
https://yrvlclolmkdqrkkhbnvn.supabase.co/functions/v1/api
```

und steht schon in `index.html`. Sie ist nicht geheim — ohne Zugangscode gibt
sie nichts heraus.

## 5. Ausprobieren

Erst von außen prüfen:

```bash
npm run einrichtung
```

Dann lokal öffnen:

```bash
npm start
```

Auf `http://localhost:8095/` genügt der Zugangscode, die Adresse ist hinterlegt.
Es sollten 54 leere Gärten erscheinen.

Ohne jede Einrichtung ansehen kannst du die Seite jederzeit mit
`http://localhost:8095/?demo` — dort liegt alles nur im Browserfenster.

## 6. Ins Netz stellen (GitHub Pages)

Wie bei deinen anderen Projekten: Repo anlegen, pushen, unter **Settings →
Pages** die Quelle auf `main` / root stellen.

Die Adresse der Funktion steht bereits in `index.html` — der Vorstand braucht
also nur den Zugangscode.

Vergiss danach nicht `ERLAUBTE_HERKUNFT` aus Schritt 3: sobald die Pages-Adresse
feststeht, als Secret eintragen (z. B. `https://aphexx100.github.io`).

## 7. An den Vorstand weitergeben

Zwei getrennte Nachrichten, bewusst auf verschiedenen Wegen:

- den Link zur Seite,
- den Zugangscode (besser mündlich oder am Telefon).

Jeder trägt beim ersten Öffnen seinen Vornamen ein. Der steht dann an seinen
Einträgen und im Verlauf.

---

## Hinweise zum Datenschutz

Die Liste enthält Namen, Anschriften und Fotos — personenbezogene Daten im Sinne
der DSGVO. Das ist für einen Verein nichts Ungewöhnliches, aber drei Dinge
gehören dazu:

- **Auftragsverarbeitung.** Supabase bietet einen Vertrag zur
  Auftragsverarbeitung an (im Dashboard unter *Organization → Legal → DPA*).
  Für einen Verein als Verantwortlichen ist das der saubere Weg.
- **Zweckbindung und Löschung.** Die Daten dienen dem Nachweis der
  Schlüsselübergabe. Wenn die Ausgabe abgeschlossen und abgenommen ist, den
  ZIP-Export ziehen, im Proton Drive ablegen und das Supabase-Projekt löschen.
  Was nicht mehr gebraucht wird, soll nicht weiterlaufen.
- **Fotos sparsam.** Ein Foto vom Briefkasten oder vom Regal reicht. Keine
  Aufnahmen, auf denen Menschen zu erkennen sind.

Bei persönlicher Übergabe fragt die Seite bewusst kein Foto ab — dort ist der
Name der Nachweis.

## Der Export in den Proton Drive

Unten auf der Seite liegt **„Als ZIP für Proton Drive"**. Das Archiv enthält:

- `liste.csv` — zum Öffnen in Excel oder LibreOffice
- `liste.json` — dieselben Daten maschinenlesbar
- `fotos/` — alle Nachweisfotos, benannt nach Gartennummer
- `LIESMICH.txt` — der Stand in Zahlen

Diese eine Datei lädst du im Proton Drive hoch. Sinnvoll einmal wöchentlich
während der Ausgabe und ein letztes Mal, wenn alle 54 versorgt sind.

Warum nicht direkt in den Proton Drive gespeichert wird, steht in der
[README](../README.md#warum-nicht-direkt-auf-proton-drive).

## Wenn etwas klemmt

| Symptom | Ursache |
| --- | --- |
| „401" oder „Zugangscode stimmt nicht", obwohl er stimmt | „Verify JWT" ist noch an (Schritt 4), oder das Secret `ZUGANGSCODE` wurde nach dem Bereitstellen angelegt — dann die Funktion neu bereitstellen |
| „Auf dem Server ist kein Zugangscode eingerichtet" | Secret `ZUGANGSCODE` fehlt |
| „Keine Verbindung" | Adresse der Funktion falsch, oder `ERLAUBTE_HERKUNFT` passt nicht zur Adresse der Seite |
| „Zu viele Fehlversuche" | Schutz gegen Durchprobieren, nach 15 Minuten vorbei |
| Fotovorschau zeigt „Vorschau abgelaufen" | Die Bildlinks gelten eine Stunde. Seite neu laden |
| Jemand muss sich ständig neu anmelden | Der Browser räumt den Speicher der Seite auf. Seite zum Startbildschirm hinzufügen hilft |
