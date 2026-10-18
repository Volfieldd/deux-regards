-- Galeries privées (étude docs/etudes/blog-galeries-boutique.md, partie 2 ; annexe de sécurité
-- docs/etudes/annexe-galeries-privees-securite.md, § 4 ; décisions « Tranché » de docs/etudes/vigie-besoins-des-briques.md).
-- Une galerie (photos choisies) est ouverte à des personnes invitées par un accès : un lien personnel (ou de groupe) ET
-- un mot de passe généré. Ni le jeton du lien ni le mot de passe ne sont gardés : seulement leurs empreintes.
-- Dates en millisecondes ; états validés en JavaScript (server/spaces.js).

-- Sessions des visiteurs du site public (galeries privées, plus tard le panier). Le cookie porte un jeton aléatoire de
-- 32 octets ; la base n'en garde que l'empreinte. L'identifiant est interne, aléatoire et stable : la rotation du jeton
-- (mot de passe accepté, « Quitter ») ne change que token_hash.
CREATE TABLE visitor_sessions (
  id           TEXT PRIMARY KEY,
  token_hash   TEXT NOT NULL UNIQUE,
  csrf         TEXT NOT NULL,
  lang         TEXT NOT NULL DEFAULT '',          -- langue choisie dans les pages privées ('' : celle de l'accès)
  ctx          TEXT NOT NULL DEFAULT '',          -- empreinte courte du réseau (/24, /48) et de la famille du navigateur
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL                   -- durée de la session ; ne prolonge jamais une autorisation
);
CREATE INDEX visitor_sessions_exp ON visitor_sessions (expires_at);

-- Jetons de session visiteur remplacés ou fermés, gardés 48 h : un cookie qui revient après a été copié (BV-22).
CREATE TABLE visitor_tokens_revoked (
  token_hash  TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL,
  raison      TEXT NOT NULL,                      -- quitte | rotation | expiree
  ctx         TEXT NOT NULL DEFAULT '',
  revoked_at  INTEGER NOT NULL
);
CREATE INDEX visitor_tokens_revoked_at ON visitor_tokens_revoked (revoked_at);

-- Galeries privées. author_id NULL : galerie commune, réservée aux comptes de portée « tout » (G1).
CREATE TABLE private_spaces (
  id          INTEGER PRIMARY KEY,
  public_id   TEXT NOT NULL UNIQUE,               -- 12 caractères aléatoires, adresse /prive/<public_id> ; pas un secret
  author_id   INTEGER REFERENCES authors(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  title_en    TEXT NOT NULL DEFAULT '',
  title_de    TEXT NOT NULL DEFAULT '',
  intro       TEXT NOT NULL DEFAULT '',
  intro_en    TEXT NOT NULL DEFAULT '',
  intro_de    TEXT NOT NULL DEFAULT '',
  state       TEXT NOT NULL DEFAULT 'brouillon',  -- brouillon | ouverte | fermee
  closes_at   INTEGER NOT NULL,                   -- fermeture ; aucun accès ne va au-delà
  closed_at   INTEGER,                            -- fermeture effective (échéance ou à la main) : départ des purges
  created_by  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX private_spaces_author ON private_spaces (author_id);

-- Photos d'une galerie, dans l'ordre choisi. Les photos gardent leur statut (G2). Une photo « à vérifier » pour l'usage
-- privé garde la confirmation de l'équipe (G61).
CREATE TABLE space_items (
  id            INTEGER PRIMARY KEY,
  space_id      INTEGER NOT NULL REFERENCES private_spaces(id) ON DELETE CASCADE,
  photo_id      INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL DEFAULT 0,
  confirmed_by  TEXT,
  confirmed_at  INTEGER,
  added_at      INTEGER NOT NULL,
  UNIQUE (space_id, photo_id)
);
CREATE INDEX space_items_photo ON space_items (photo_id);

-- Accès (invitations). label : chiffré (vault.seal). rights : JSON { favoris, telechargement: non|web|grande }.
-- Compteurs d'essais en base, comptés avant le calcul du mot de passe (G19).
CREATE TABLE space_invites (
  id               INTEGER PRIMARY KEY,
  space_id         INTEGER NOT NULL REFERENCES private_spaces(id) ON DELETE CASCADE,
  token_hash       TEXT NOT NULL UNIQUE,          -- SHA-256 du jeton du lien
  password_hash    TEXT NOT NULL,                 -- scrypt$15$8$3$<sel>$<clé>
  label            TEXT NOT NULL,
  lang             TEXT NOT NULL DEFAULT 'fr',
  is_group         INTEGER NOT NULL DEFAULT 0,
  rights           TEXT NOT NULL DEFAULT '{}',
  expires_at       INTEGER NOT NULL,
  revoked_at       INTEGER,
  failed_count     INTEGER NOT NULL DEFAULT 0,    -- refus consécutifs (remis à zéro au succès)
  failed_total     INTEGER NOT NULL DEFAULT 0,    -- refus depuis le dernier succès ou déblocage (suspension à 30)
  locked_until     INTEGER,
  suspended_at     INTEGER,
  first_opened_at  INTEGER,
  last_seen_at     INTEGER,
  downloads        INTEGER NOT NULL DEFAULT 0,
  selection_sent_at INTEGER,                      -- « Envoyer ma sélection »
  selection_seen_at INTEGER,                      -- vue par l'équipe : l'invité ne la reprend plus seul
  created_by       TEXT NOT NULL,
  created_at       INTEGER NOT NULL,
  ended_at         INTEGER                        -- révocation ou échéance passée : départ du délai de purge (6 mois)
);
CREATE INDEX space_invites_space ON space_invites (space_id);
CREATE INDEX space_invites_end ON space_invites (ended_at);

-- Liens remplacés par « Nouveau lien » : empreinte gardée jusqu'à l'effacement de l'accès, pour reconnaître un rejeu (BV-22).
CREATE TABLE space_invite_old_links (
  token_hash  TEXT PRIMARY KEY,
  invite_id   INTEGER NOT NULL REFERENCES space_invites(id) ON DELETE CASCADE,
  replaced_at INTEGER NOT NULL
);
CREATE INDEX space_invite_old_links_invite ON space_invite_old_links (invite_id);

-- Autorisations ouvertes par un mot de passe accepté. Révoquer un accès ou « Quitter » supprime ses lignes.
CREATE TABLE visitor_grants (
  session_id    TEXT NOT NULL REFERENCES visitor_sessions(id) ON DELETE CASCADE,
  invite_id     INTEGER NOT NULL REFERENCES space_invites(id) ON DELETE CASCADE,
  remember      INTEGER NOT NULL DEFAULT 0,
  granted_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,                 -- plafond : 7 jours (30 avec remember), jamais au-delà de l'accès
  PRIMARY KEY (session_id, invite_id)
);
CREATE INDEX visitor_grants_invite ON visitor_grants (invite_id);

-- Autorisations retirées (révocation, effacement, « Quitter »), gardées 48 h pour reconnaître un accès tenté après (BV-22).
CREATE TABLE visitor_grants_revoked (
  session_id  TEXT NOT NULL,
  invite_id   INTEGER NOT NULL,
  space_id    INTEGER NOT NULL,
  raison      TEXT NOT NULL,                      -- acces_revoque | acces_efface | quitte | acces_suspendu
  revoked_at  INTEGER NOT NULL,
  PRIMARY KEY (session_id, invite_id)
);
CREATE INDEX visitor_grants_revoked_at ON visitor_grants_revoked (revoked_at);

-- Appareils d'un accès : sessions visiteur distinctes qui ont accepté son mot de passe (G31 ; signal à 3, sans refus).
CREATE TABLE space_invite_devices (
  invite_id   INTEGER NOT NULL REFERENCES space_invites(id) ON DELETE CASCADE,
  session_id  TEXT NOT NULL,
  first_at    INTEGER NOT NULL,
  PRIMARY KEY (invite_id, session_id)
);

-- Favoris d'un accès (sa sélection).
CREATE TABLE space_favorites (
  invite_id  INTEGER NOT NULL REFERENCES space_invites(id) ON DELETE CASCADE,
  item_id    INTEGER NOT NULL REFERENCES space_items(id) ON DELETE CASCADE,
  added_at   INTEGER NOT NULL,
  PRIMARY KEY (invite_id, item_id)
);
CREATE INDEX space_favorites_item ON space_favorites (item_id);

-- Journal des accès : réseau (/24, /48) et pays ; ni navigateur ni jeton (§ 3.9). Effacé avec l'accès.
CREATE TABLE space_events (
  id          INTEGER PRIMARY KEY,
  space_id    INTEGER NOT NULL REFERENCES private_spaces(id) ON DELETE CASCADE,
  invite_id   INTEGER REFERENCES space_invites(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  item_id     INTEGER,
  detail      TEXT NOT NULL DEFAULT '',
  robot       INTEGER NOT NULL DEFAULT 0,
  ip          TEXT,
  country     TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX space_events_space ON space_events (space_id, created_at);
CREATE INDEX space_events_invite ON space_events (invite_id, created_at);

-- Archives ZIP préparées (« Tout télécharger »), effacées après 24 h ; 3 par jour et par accès (G46).
CREATE TABLE space_archives (
  id          INTEGER PRIMARY KEY,
  invite_id   INTEGER NOT NULL REFERENCES space_invites(id) ON DELETE CASCADE,
  file        TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  photos      INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX space_archives_invite ON space_archives (invite_id, created_at);
