-- Mesure d'audience anonyme : seulement des compteurs par jour (aucune adresse IP, aucun identifiant).
-- Conservés 25 mois au plus (purge automatique, voir server/stats.js).
CREATE TABLE stats_pages (            -- pages vues : accueil, série, auteur, à propos, droits
  day   TEXT NOT NULL,                -- AAAA-MM-JJ (heure de Paris)
  page  TEXT NOT NULL,                -- « accueil », « serie:rue », « auteur:julien », « a-propos », « droits »
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, page)
);
CREATE TABLE stats_photos (           -- ouvertures d'une photo dans la visionneuse
  day      TEXT NOT NULL,
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  views    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, photo_id)
);
CREATE TABLE stats_days (             -- visiteurs uniques du jour, par type d'appareil
  day      TEXT PRIMARY KEY,
  visitors INTEGER NOT NULL DEFAULT 0,
  mobile   INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE stats_sources (          -- provenance des visites (nom du site d'origine seulement)
  day    TEXT NOT NULL,
  source TEXT NOT NULL,               -- « direct », ou un nom de domaine sans « www. »
  visits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, source)
);
