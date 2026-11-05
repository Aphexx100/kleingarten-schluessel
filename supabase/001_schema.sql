-- Schlüsselausgabe Außentore — Grundschema
-- Im Supabase SQL-Editor einfügen und ausführen (Projekt-Region: EU Central, Frankfurt).
--
-- Grundgedanke der Absicherung: niemand greift mit dem anon-Key direkt auf diese
-- Tabellen zu. RLS ist an und es gibt KEINE Policy, also kann der anon-Key nichts
-- lesen und nichts schreiben. Alle Zugriffe laufen über die Edge Function "api",
-- die den gemeinsamen Zugangscode prüft und dafür den service_role-Key benutzt.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- Gärten
create table if not exists gaerten (
  nr            integer primary key,
  -- Hat der Garten seinen Schlüssel bekommen?
  erhalten      boolean     not null default false,
  anzahl        integer     not null default 1 check (anzahl between 0 and 5),
  -- Art der Übergabe; null solange nichts übergeben wurde
  art           text        check (art in ('persoenlich', 'hinterlegt', 'post')),
  -- Bei persönlicher Übergabe: wer hat ihn entgegengenommen
  person        text,
  -- Bei Hinterlegung: wo
  ort           text,
  -- Bei Postversand: an welche Adresse
  adresse       text,
  -- Je nach Art: Übergabedatum / Hinterlegungsdatum / Abgabedatum bei der Post
  datum         date,
  notiz         text,
  -- Nachweisfotos: [{ "pfad": "12/abc.jpg", "name": "Briefkasten.jpg", "groesse": 148213 }]
  fotos         jsonb       not null default '[]'::jsonb,
  -- Freiwilliger Name dessen, der den Eintrag gemacht hat
  erfasst_von   text,
  geaendert_am  timestamptz not null default now()
);

alter table gaerten enable row level security;
-- Absichtlich keine Policy: direkter Zugriff mit dem anon-Key ist damit gesperrt.

-- 54 Gärten anlegen. Falls die Gärten bei euch anders durchnummeriert sind
-- (Lücken, Buchstaben, Beginn bei 100 …), siehe docs/EINRICHTUNG.md — dort steht,
-- wie man die Nummern in einem Rutsch austauscht.
insert into gaerten (nr)
select generate_series(1, 54)
on conflict (nr) do nothing;

-- ------------------------------------------------------------ Änderungen
-- Wer wann was geändert hat. Weil alle denselben Zugangscode benutzen, lässt sich
-- eine Änderung nicht beweisbar einer Person zuordnen — der Verlauf zeigt aber,
-- was sich wann geändert hat und welchen Namen die Person angegeben hat.
create table if not exists aenderungen (
  id          bigserial   primary key,
  garten_nr   integer     not null references gaerten (nr) on delete cascade,
  erfasst_von text,
  vorher      jsonb,
  nachher     jsonb,
  zeitpunkt   timestamptz not null default now()
);

create index if not exists aenderungen_garten_idx on aenderungen (garten_nr, zeitpunkt desc);

alter table aenderungen enable row level security;

-- -------------------------------------------------------- Fehlversuche
-- Bremse gegen das Durchprobieren des Zugangscodes.
create table if not exists zugriffsversuche (
  id        bigserial   primary key,
  kennung   text        not null,  -- Hash aus IP-Adresse, keine Klartext-IP
  zeitpunkt timestamptz not null default now()
);

create index if not exists zugriffsversuche_idx on zugriffsversuche (kennung, zeitpunkt desc);

alter table zugriffsversuche enable row level security;

-- ------------------------------------------------------------- Aufräumen
-- Alte Fehlversuche verfallen; die Tabelle soll nicht endlos wachsen.
create or replace function zugriffsversuche_aufraeumen() returns void
language sql security definer set search_path = public as $$
  delete from zugriffsversuche where zeitpunkt < now() - interval '1 day';
$$;

-- ----------------------------------------------------------- Fotospeicher
-- Privater Bucket. Hochladen und Anzeigen laufen über kurzlebige signierte
-- URLs, die die Edge Function ausstellt — der Bucket ist nie öffentlich.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
