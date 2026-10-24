-- Bilans : une correction est un nouvel objet lié, jamais une réécriture du texte publié.
CREATE TABLE saison_bilans (
  id INTEGER PRIMARY KEY,
  saison_id INTEGER NOT NULL REFERENCES saisons(id) ON DELETE CASCADE,
  rectifies_id INTEGER REFERENCES saison_bilans(id) ON DELETE RESTRICT,
  state TEXT NOT NULL DEFAULT 'brouillon' CHECK (state IN ('brouillon', 'publie', 'retire')),
  title TEXT NOT NULL,
  title_en TEXT NOT NULL DEFAULT '',
  title_de TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  body_en TEXT NOT NULL DEFAULT '',
  body_de TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER
);
CREATE INDEX saison_bilans_saison ON saison_bilans (saison_id, published_at, id);
CREATE INDEX saison_bilans_rectifies ON saison_bilans (rectifies_id);
CREATE UNIQUE INDEX saison_bilans_initial ON saison_bilans (saison_id) WHERE rectifies_id IS NULL AND published_at IS NOT NULL;

CREATE TABLE saison_bilan_photos (
  bilan_id INTEGER NOT NULL REFERENCES saison_bilans(id) ON DELETE CASCADE,
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (bilan_id, photo_id),
  UNIQUE (bilan_id, position)
);
CREATE INDEX saison_bilan_photos_photo ON saison_bilan_photos (photo_id);

CREATE TABLE saison_collections (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  bilan_id INTEGER NOT NULL REFERENCES saison_bilans(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES authors(id) ON DELETE SET NULL,
  state TEXT NOT NULL DEFAULT 'brouillon' CHECK (state IN ('brouillon', 'publie', 'retire')),
  cover_id INTEGER REFERENCES photos(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  title_en TEXT NOT NULL DEFAULT '',
  title_de TEXT NOT NULL DEFAULT '',
  subtitle TEXT NOT NULL DEFAULT '',
  subtitle_en TEXT NOT NULL DEFAULT '',
  subtitle_de TEXT NOT NULL DEFAULT '',
  intro TEXT NOT NULL DEFAULT '',
  intro_en TEXT NOT NULL DEFAULT '',
  intro_de TEXT NOT NULL DEFAULT '',
  prologue TEXT NOT NULL DEFAULT '',
  prologue_en TEXT NOT NULL DEFAULT '',
  prologue_de TEXT NOT NULL DEFAULT '',
  conclusion TEXT NOT NULL DEFAULT '',
  conclusion_en TEXT NOT NULL DEFAULT '',
  conclusion_de TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER
);
CREATE INDEX saison_collections_bilan ON saison_collections (bilan_id);
CREATE INDEX saison_collections_author ON saison_collections (author_id);
CREATE INDEX saison_collections_cover ON saison_collections (cover_id);
CREATE INDEX saison_collections_public ON saison_collections (state, published_at, id);

CREATE TABLE saison_collection_photos (
  id INTEGER PRIMARY KEY,
  collection_id INTEGER NOT NULL REFERENCES saison_collections(id) ON DELETE CASCADE,
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  cartel TEXT NOT NULL DEFAULT '',
  cartel_en TEXT NOT NULL DEFAULT '',
  cartel_de TEXT NOT NULL DEFAULT '',
  UNIQUE (collection_id, photo_id),
  UNIQUE (collection_id, position)
);
CREATE INDEX saison_collection_photos_photo ON saison_collection_photos (photo_id);

-- Reprise des seuls bilans S0 déjà publiés. Les textes préparés restent privés ; aucune traduction n’est inventée.
INSERT INTO saison_bilans (saison_id, state, title, title_en, title_de, body, body_en, body_de, created_at, updated_at, published_at)
SELECT id, 'publie', title, title_en, title_de, report, report_en, report_de, report_published_at, report_published_at, report_published_at
FROM saisons WHERE report_published_at IS NOT NULL;
INSERT INTO saison_bilan_photos (bilan_id, photo_id, position)
SELECT b.id, s.photo_id, s.position FROM saison_selection s JOIN saison_bilans b ON b.saison_id = s.saison_id;
