-- Carnets : les billets du site (étude docs/etudes/blog-galeries-boutique.md, partie 1 ; maquettes MQ-11, MQ-12 et MQ-20 ;
-- décisions du propriétaire, docs/etudes/vigie-besoins-des-briques.md, « Tranché »). Le code dit « carnet » (jamais
-- « journal », pris par le journal d'audit). Dates en millisecondes. États validés par server/carnet.js, sans CHECK :
-- SQLite ne sait pas modifier un CHECK (B12).
--   state       brouillon · propose · a_reprendre · programme · publie · retire
--   rubrique    voyages · atelier (liste fermée de server/carnet.js : le filtre ?rubrique= de la liste, BV-13)
--   langs       langues publiées, « fr » toujours, « fr,en » quand la traduction anglaise est relue (B7)
--   body        Markdown restreint (server/carnet-markdown.js) ; une photo s'y écrit d'une ligne, photo:<id> en base
--               (le slug du moment dans l'éditeur, B9 et lexique § 4.10)
--   visibility  « public » seulement dans ce lot ; « prive » viendra avec les galeries privées (§ 1.9)
--   version     verrou optimiste de l'éditeur (B33)
CREATE TABLE posts (
  id            INTEGER PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  state         TEXT NOT NULL DEFAULT 'brouillon',
  rubrique      TEXT NOT NULL DEFAULT 'atelier',
  title         TEXT NOT NULL,
  title_en      TEXT NOT NULL DEFAULT '',
  title_de      TEXT NOT NULL DEFAULT '',
  dek           TEXT NOT NULL DEFAULT '',
  dek_en        TEXT NOT NULL DEFAULT '',
  dek_de        TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL DEFAULT '',
  body_en       TEXT NOT NULL DEFAULT '',
  body_de       TEXT NOT NULL DEFAULT '',
  -- Mention commerciale (LCEN, art. 20, B14) et réponse publiée (droit de réponse, B82), en trois langues.
  mention       TEXT NOT NULL DEFAULT '',
  mention_en    TEXT NOT NULL DEFAULT '',
  mention_de    TEXT NOT NULL DEFAULT '',
  reply         TEXT NOT NULL DEFAULT '',
  reply_en      TEXT NOT NULL DEFAULT '',
  reply_de      TEXT NOT NULL DEFAULT '',
  reply_at      INTEGER,
  langs         TEXT NOT NULL DEFAULT 'fr',
  cover_id      INTEGER REFERENCES photos(id) ON DELETE SET NULL,
  share_id      INTEGER REFERENCES photos(id) ON DELETE SET NULL,
  trip_id       INTEGER REFERENCES trips(id) ON DELETE SET NULL,
  -- « Écrire aux auteurs » en bas du billet (mailto:, rien n'est stocké ; B79, décision 9).
  contact       INTEGER NOT NULL DEFAULT 1,
  visibility    TEXT NOT NULL DEFAULT 'public',
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  publish_at    INTEGER,
  published_at  INTEGER,
  revised_at    INTEGER,
  retired_at    INTEGER,
  retired_reason TEXT NOT NULL DEFAULT ''
);
CREATE INDEX posts_state ON posts (state, published_at);
-- Une clé étrangère a toujours son index (une photo, un voyage supprimés : la base retrouve vite les billets touchés).
CREATE INDEX posts_cover ON posts (cover_id);
CREATE INDEX posts_share ON posts (share_id);
CREATE INDEX posts_trip ON posts (trip_id);
-- Une ou deux signatures (B6) : la portée « les miennes » d'un billet, c'est l'un de ses auteurs.
CREATE TABLE post_authors (
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  INTEGER NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, author_id)
);
CREATE INDEX post_authors_author ON post_authors (author_id);
-- Anciennes adresses d'un billet publié dont le slug a changé : 301 vers l'adresse du jour (B3).
CREATE TABLE post_slugs (
  slug     TEXT PRIMARY KEY,
  post_id  INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE
);
CREATE INDEX post_slugs_post ON post_slugs (post_id);
-- Réglages d'une photo dans un billet, par langue : texte de remplacement, légende, taille (« texte » ou « large »), et
-- photo décorative (alt="" voulu). Les photos elles-mêmes sont celles de la photothèque.
CREATE TABLE post_photos (
  post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  photo_id    INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  alt         TEXT NOT NULL DEFAULT '',
  alt_en      TEXT NOT NULL DEFAULT '',
  alt_de      TEXT NOT NULL DEFAULT '',
  legend      TEXT NOT NULL DEFAULT '',
  legend_en   TEXT NOT NULL DEFAULT '',
  legend_de   TEXT NOT NULL DEFAULT '',
  size        TEXT NOT NULL DEFAULT 'texte',
  decorative  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, photo_id)
);
CREATE INDEX post_photos_photo ON post_photos (photo_id);
-- Index des références internes (B9) : photo, série, voyage, billet ; recalculé à chaque enregistrement.
CREATE TABLE post_refs (
  post_id  INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  kind     TEXT NOT NULL,
  ref_id   INTEGER NOT NULL,
  PRIMARY KEY (post_id, kind, ref_id)
);
CREATE INDEX post_refs_ref ON post_refs (kind, ref_id);
-- Décisions du circuit (B38), comme photo_reviews (migration 031) : by_sub NULL pour la publication programmée.
CREATE TABLE post_reviews (
  id          INTEGER PRIMARY KEY,
  post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  by_sub      TEXT,
  by_name     TEXT NOT NULL DEFAULT '',
  at          INTEGER NOT NULL,
  message     TEXT NOT NULL DEFAULT '',
  publish_at  INTEGER
);
CREATE INDEX post_reviews_post ON post_reviews (post_id, at);
-- Versions enregistrées (B38) : les 30 dernières, à rétablir.
CREATE TABLE post_revisions (
  id       INTEGER PRIMARY KEY,
  post_id  INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  at       INTEGER NOT NULL,
  by_sub   TEXT,
  by_name  TEXT NOT NULL DEFAULT '',
  data     TEXT NOT NULL
);
CREATE INDEX post_revisions_post ON post_revisions (post_id, at);
-- Enregistrement automatique de l'éditeur (B31) : jamais dans le billet lui-même, hors du journal d'audit (B34). Une ligne
-- par billet, remplacée à chaque envoi, effacée dès que le billet est enregistré.
CREATE TABLE post_drafts (
  post_id  INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  data     TEXT NOT NULL,
  by_sub   TEXT,
  by_name  TEXT NOT NULL DEFAULT '',
  at       INTEGER NOT NULL,
  version  INTEGER NOT NULL
);
