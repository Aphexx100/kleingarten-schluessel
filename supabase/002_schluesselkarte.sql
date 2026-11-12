-- Schlüsselkarte: wer hat gerade eine?
--
-- Im Supabase SQL-Editor einfügen und ausführen. Läuft auch mehrfach ohne
-- Schaden — bestehende Einträge bleiben unberührt.
--
-- Hintergrund: mit der Schlüsselkarte darf ein Garten weitere Schlüssel
-- nachmachen lassen. Jeder Garten braucht sie einmal, aber es gibt nur 13
-- Stück für 54 Gärten. Die Karten wandern also reihum, und das Feld sagt
-- deshalb nicht "hat eine bekommen", sondern "hat gerade eine".

alter table gaerten
  add column if not exists karte boolean not null default false;

comment on column gaerten.karte is
  'Garten hat gerade eine der 13 Schlüsselkarten ausgeliehen (Leihgabe, wandert reihum).';

-- Wie viele Karten sind gerade draußen? Sollte 13 nie überschreiten.
--   select count(*) from gaerten where karte;
