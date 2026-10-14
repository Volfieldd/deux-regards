-- Sorties : une journée de prise de vue d'un photographe (ses photos de ce jour-là et les personnes rencontrées).
-- Une sortie existe d'elle-même (photographe + jour) ; une ligne ici la découpe ou la nomme. Pour un photographe et un
-- jour, les lignes triées par heure de début partagent la journée : chaque sortie va de son début au début suivant.
-- taken_time : heure de prise de vue (EXIF, HH:MM) ; NULL : pas encore lue ; '' : inconnue (photo comptée dans
-- toutes les sorties du jour, par prudence).
ALTER TABLE photos ADD COLUMN taken_time TEXT;
CREATE TABLE outings (
  id         INTEGER PRIMARY KEY,
  author_id  INTEGER NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  day        TEXT NOT NULL,
  starts     TEXT NOT NULL DEFAULT '00:00',
  place      TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE (author_id, day, starts)
);
