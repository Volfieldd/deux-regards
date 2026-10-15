-- Voyages : un groupe de sorties (journées de prise de vue), facultatif — « Maroc 2025 » = dix journées. Une journée
-- d'un photographe appartient à un voyage au plus ; un voyage peut réunir les deux photographes (author_id NULL :
-- voyage commun, réglé par un administrateur) ou être celui d'un photographe. Nom et texte en trois langues ; page
-- publique facultative, voyage par voyage (public).
CREATE TABLE trips (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  name_en     TEXT NOT NULL DEFAULT '',
  name_de     TEXT NOT NULL DEFAULT '',
  intro       TEXT NOT NULL DEFAULT '',
  intro_en    TEXT NOT NULL DEFAULT '',
  intro_de    TEXT NOT NULL DEFAULT '',
  author_id   INTEGER REFERENCES authors(id) ON DELETE SET NULL,
  public      INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE TABLE trip_days (
  trip_id    INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  author_id  INTEGER NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  day        TEXT NOT NULL,
  PRIMARY KEY (author_id, day)
);
CREATE INDEX trip_days_trip ON trip_days (trip_id, day);
