/* Edge Function "api" — das einzige Tor zu den Daten.
 *
 * Warum es diese Funktion gibt: die Seite liegt öffentlich auf GitHub Pages und
 * es gibt keine persönlichen Konten. Läge der Datenzugriff beim Browser, müsste
 * ein Supabase-Key mit Leserechten im Seitenquelltext stehen — damit könnte
 * jeder, der die Adresse kennt, alle Namen, Adressen und Fotos abrufen.
 * Stattdessen hält diese Funktion den service_role-Key, prüft bei jeder Anfrage
 * den gemeinsamen Zugangscode und gibt nur das heraus, was gebraucht wird.
 *
 * Erwartete Secrets (Supabase → Edge Functions → Secrets):
 *   ZUGANGSCODE        der gemeinsame Code, den der Vorstand eingibt
 *   ERLAUBTE_HERKUNFT  optional, Komma-Liste erlaubter Origins
 * SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY setzt Supabase selbst.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const ZUGANGSCODE = Deno.env.get('ZUGANGSCODE') ?? '';
const HERKUNFT = (Deno.env.get('ERLAUBTE_HERKUNFT') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
);

const ARTEN = ['persoenlich', 'hinterlegt', 'post'];
const MAX_FEHLVERSUCHE = 10;
const SPERRE_MINUTEN = 15;

/* ------------------------------------------------------------------ Hilfen */

async function hash(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* Vergleich über die Hashes, damit die Laufzeit nicht verrät, wie viele Zeichen
   des Codes stimmen. */
function gleich(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let abweichung = 0;
  for (let i = 0; i < a.length; i++) abweichung |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return abweichung === 0;
}

function kopfzeilen(origin: string | null): Record<string, string> {
  const erlaubt = HERKUNFT.length === 0 || (origin !== null && HERKUNFT.includes(origin));
  return {
    'Access-Control-Allow-Origin': erlaubt && origin ? origin : HERKUNFT[0] ?? '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  };
}

function antwort(daten: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(daten), { status, headers: kopfzeilen(origin) });
}

function text(wert: unknown, maxLaenge: number): string | null {
  if (typeof wert !== 'string') return null;
  const gekuerzt = wert.trim().slice(0, maxLaenge);
  return gekuerzt === '' ? null : gekuerzt;
}

/* Prüft die Pflichtfelder. Dieselben Regeln stehen in src/js/modell.js für die
   Rückmeldung im Formular — hier gelten sie verbindlich, weil der Browser
   manipulierbar ist. Wird eine Regel geändert, muss sie an beiden Stellen
   geändert werden. */
function fehler(g: Record<string, unknown>): string | null {
  if (!g.erhalten) return null;
  if (typeof g.art !== 'string' || !ARTEN.includes(g.art)) return 'Art der Übergabe fehlt.';
  if (!g.datum) return 'Datum fehlt.';
  if (g.art === 'persoenlich' && !g.person) return 'Name der Person fehlt.';
  if (g.art === 'hinterlegt' && !g.ort) return 'Ort der Hinterlegung fehlt.';
  if (g.art === 'post' && !g.adresse) return 'Empfangsadresse fehlt.';
  return null;
}

/* --------------------------------------------------------------- Fotolinks */

async function mitFotolinks(gaerten: Record<string, unknown>[]) {
  const pfade = gaerten.flatMap((g) =>
    ((g.fotos as { pfad: string }[]) ?? []).map((f) => f.pfad)
  );
  if (pfade.length === 0) return gaerten;

  /* Eine Stunde reicht zum Ansehen und läuft dann ab — die Links taugen nicht
     zum dauerhaften Weitergeben. */
  const { data } = await db.storage.from('fotos').createSignedUrls(pfade, 3600);
  const links = new Map((data ?? []).map((e) => [e.path, e.signedUrl]));
  return gaerten.map((g) => ({
    ...g,
    fotos: ((g.fotos as { pfad: string }[]) ?? []).map((f) => ({
      ...f,
      url: links.get(f.pfad) ?? null
    }))
  }));
}

/* ------------------------------------------------------------------ Bremse */

async function gesperrt(kennung: string): Promise<boolean> {
  const seit = new Date(Date.now() - SPERRE_MINUTEN * 60_000).toISOString();
  const { count } = await db
    .from('zugriffsversuche')
    .select('id', { count: 'exact', head: true })
    .eq('kennung', kennung)
    .gte('zeitpunkt', seit);
  return (count ?? 0) >= MAX_FEHLVERSUCHE;
}

/* ---------------------------------------------------------------- Zugriffe */

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: kopfzeilen(origin) });
  }
  if (req.method !== 'POST') return antwort({ fehler: 'Nur POST.' }, 405, origin);

  if (ZUGANGSCODE === '') {
    return antwort({ fehler: 'Auf dem Server ist kein Zugangscode eingerichtet.' }, 500, origin);
  }

  let anfrage: Record<string, unknown>;
  try {
    anfrage = await req.json();
  } catch {
    return antwort({ fehler: 'Unlesbare Anfrage.' }, 400, origin);
  }

  /* Kennung aus der IP, aber nur als Hash: die Bremse braucht Wiedererkennung,
     keine Adressen. */
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unbekannt';
  const kennung = (await hash('bremse:' + ip)).slice(0, 32);

  if (await gesperrt(kennung)) {
    return antwort(
      { fehler: 'Zu viele Fehlversuche. Bitte ' + SPERRE_MINUTEN + ' Minuten warten.' },
      429,
      origin
    );
  }

  const code = typeof anfrage.code === 'string' ? anfrage.code : '';
  if (!gleich(await hash(code), await hash(ZUGANGSCODE))) {
    await db.from('zugriffsversuche').insert({ kennung });
    /* Kurze Verzögerung, damit Durchprobieren zäh wird. */
    await new Promise((r) => setTimeout(r, 400));
    return antwort({ fehler: 'Zugangscode stimmt nicht.' }, 401, origin);
  }

  const erfasstVon = text(anfrage.erfasstVon, 80);

  try {
    switch (anfrage.aktion) {
      /* ------------------------------------------------- Code prüfen */
      case 'pruefen':
        return antwort({ ok: true }, 200, origin);

      /* ------------------------------------------------ alles laden */
      case 'laden': {
        const { data, error } = await db.from('gaerten').select('*').order('nr');
        if (error) throw error;
        return antwort({ gaerten: await mitFotolinks(data ?? []) }, 200, origin);
      }

      /* ---------------------------------------------- Garten sichern */
      case 'speichern': {
        const eingang = (anfrage.garten ?? {}) as Record<string, unknown>;
        const nr = Number(eingang.nr);
        if (!Number.isInteger(nr)) return antwort({ fehler: 'Gartennummer fehlt.' }, 400, origin);

        const erhalten = eingang.erhalten === true;
        const art =
          typeof eingang.art === 'string' && ARTEN.includes(eingang.art) ? eingang.art : null;

        /* Nur die Felder übernehmen, die zur gewählten Art gehören. Wer erst
           "Hinterlegt" ausfüllt und dann auf "Per Post" wechselt, soll den
           alten Ort nicht als Altlast in der Zeile stehen lassen. */
        const satz = {
          nr,
          erhalten,
          /* Die Karte haengt nicht am Schluessel: ein Garten kann eine Karte
             haben, ohne schon einen Schluessel bekommen zu haben. */
          karte: eingang.karte === true,
          anzahl: Math.max(0, Math.min(5, Number(eingang.anzahl) || (erhalten ? 1 : 0))),
          art: erhalten ? art : null,
          person: erhalten && art === 'persoenlich' ? text(eingang.person, 120) : null,
          ort: erhalten && art === 'hinterlegt' ? text(eingang.ort, 200) : null,
          adresse: erhalten && art === 'post' ? text(eingang.adresse, 300) : null,
          datum:
            erhalten && typeof eingang.datum === 'string' && eingang.datum ? eingang.datum : null,
          notiz: text(eingang.notiz, 1000),
          erfasst_von: erfasstVon,
          geaendert_am: new Date().toISOString()
        };

        const meldung = fehler(satz);
        if (meldung) return antwort({ fehler: meldung }, 400, origin);

        const { data: vorher } = await db.from('gaerten').select('*').eq('nr', nr).single();
        if (!vorher) return antwort({ fehler: 'Garten ' + nr + ' ist nicht in der Liste.' }, 404, origin);

        /* fotos bleiben unberührt: die werden über die Foto-Aktionen gepflegt. */
        const { data: nachher, error } = await db
          .from('gaerten')
          .update(satz)
          .eq('nr', nr)
          .select('*')
          .single();
        if (error) throw error;

        await db.from('aenderungen').insert({
          garten_nr: nr,
          erfasst_von: erfasstVon,
          vorher,
          nachher
        });

        return antwort({ garten: (await mitFotolinks([nachher]))[0] }, 200, origin);
      }

      /* -------------------------------------- Platz für ein Foto holen */
      case 'fotoZiel': {
        const nr = Number(anfrage.nr);
        if (!Number.isInteger(nr)) return antwort({ fehler: 'Gartennummer fehlt.' }, 400, origin);
        const pfad = nr + '/' + crypto.randomUUID() + '.jpg';
        const { data, error } = await db.storage.from('fotos').createSignedUploadUrl(pfad);
        if (error) throw error;
        return antwort({ pfad, url: data.signedUrl, token: data.token }, 200, origin);
      }

      /* ------------------------------------- hochgeladenes Foto buchen */
      case 'fotoBuchen': {
        const nr = Number(anfrage.nr);
        const pfad = text(anfrage.pfad, 200);
        if (!Number.isInteger(nr) || !pfad) return antwort({ fehler: 'Angaben fehlen.' }, 400, origin);
        /* Nur Pfade im Ordner des Gartens annehmen. */
        if (!pfad.startsWith(nr + '/')) {
          return antwort({ fehler: 'Pfad passt nicht zum Garten.' }, 400, origin);
        }

        const { data: g } = await db.from('gaerten').select('fotos').eq('nr', nr).single();
        if (!g) return antwort({ fehler: 'Garten ' + nr + ' ist nicht in der Liste.' }, 404, origin);

        const fotos = [
          ...((g.fotos as unknown[]) ?? []),
          {
            pfad,
            name: text(anfrage.name, 160) ?? 'Foto.jpg',
            groesse: Number(anfrage.groesse) || 0,
            zeitpunkt: new Date().toISOString()
          }
        ].slice(-12);

        const { data: nachher, error } = await db
          .from('gaerten')
          .update({ fotos, erfasst_von: erfasstVon, geaendert_am: new Date().toISOString() })
          .eq('nr', nr)
          .select('*')
          .single();
        if (error) throw error;
        return antwort({ garten: (await mitFotolinks([nachher]))[0] }, 200, origin);
      }

      /* ------------------------------------------------ Foto entfernen */
      case 'fotoLoeschen': {
        const nr = Number(anfrage.nr);
        const pfad = text(anfrage.pfad, 200);
        if (!Number.isInteger(nr) || !pfad) return antwort({ fehler: 'Angaben fehlen.' }, 400, origin);
        if (!pfad.startsWith(nr + '/')) {
          return antwort({ fehler: 'Pfad passt nicht zum Garten.' }, 400, origin);
        }

        const { data: g } = await db.from('gaerten').select('fotos').eq('nr', nr).single();
        if (!g) return antwort({ fehler: 'Garten ' + nr + ' ist nicht in der Liste.' }, 404, origin);

        await db.storage.from('fotos').remove([pfad]);
        const fotos = ((g.fotos as { pfad: string }[]) ?? []).filter((f) => f.pfad !== pfad);

        const { data: nachher, error } = await db
          .from('gaerten')
          .update({ fotos, erfasst_von: erfasstVon, geaendert_am: new Date().toISOString() })
          .eq('nr', nr)
          .select('*')
          .single();
        if (error) throw error;
        return antwort({ garten: (await mitFotolinks([nachher]))[0] }, 200, origin);
      }

      /* -------------------------------------------- Verlauf einer Zeile */
      case 'verlauf': {
        const nr = Number(anfrage.nr);
        if (!Number.isInteger(nr)) return antwort({ fehler: 'Gartennummer fehlt.' }, 400, origin);
        const { data, error } = await db
          .from('aenderungen')
          .select('id, erfasst_von, vorher, nachher, zeitpunkt')
          .eq('garten_nr', nr)
          .order('zeitpunkt', { ascending: false })
          .limit(50);
        if (error) throw error;
        return antwort({ verlauf: data ?? [] }, 200, origin);
      }

      /* ------------------------------------- Fotos für den ZIP-Export */
      case 'fotosFuerExport': {
        const { data: gaerten, error } = await db.from('gaerten').select('nr, fotos').order('nr');
        if (error) throw error;
        const pfade = (gaerten ?? []).flatMap((g) =>
          ((g.fotos as { pfad: string }[]) ?? []).map((f) => f.pfad)
        );
        if (pfade.length === 0) return antwort({ fotos: [] }, 200, origin);
        const { data } = await db.storage.from('fotos').createSignedUrls(pfade, 900);
        return antwort({ fotos: data ?? [] }, 200, origin);
      }

      default:
        return antwort({ fehler: 'Unbekannte Aktion.' }, 400, origin);
    }
  } catch (e) {
    console.error('api', anfrage.aktion, e);
    return antwort({ fehler: 'Auf dem Server ist etwas schiefgegangen.' }, 500, origin);
  }
});
