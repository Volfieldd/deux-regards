-- Console de la Vigie (phase D3, annexe architecture § 5) : sessions, connexions en cours, droits (deux clés).
-- Sessions : seule l'empreinte du jeton du cookie est en base (une copie de la base ne donne pas de session).
CREATE TABLE console_sessions (
  id            TEXT PRIMARY KEY,                -- SHA-256 du jeton du cookie
  sub           TEXT NOT NULL,
  nom           TEXT,
  plafond       TEXT NOT NULL CHECK (plafond IN ('viewer', 'handler', 'analyst', 'admin')),
  plafond_lu    INTEGER NOT NULL,                -- dernière lecture du plafond (jeton ou API de Zitadel)
  access        TEXT,                            -- identité Cloudflare Access à l'ouverture (la même est exigée ensuite)
  csrf          TEXT NOT NULL,
  cree_a        INTEGER NOT NULL,
  vu_a          INTEGER NOT NULL,
  auth_a        INTEGER NOT NULL,                -- dernière authentification chez Zitadel (auth_time), ré-authentification comprise
  ip            TEXT,
  ua            TEXT,
  ferme_a       INTEGER,
  ferme_raison  TEXT
);
CREATE INDEX console_sessions_sub ON console_sessions (sub);
CREATE INDEX console_sessions_cree ON console_sessions (cree_a);

-- Connexions en cours (aller-retour chez Zitadel, 10 minutes au plus).
CREATE TABLE console_tx (
  state     TEXT PRIMARY KEY,
  verifier  TEXT NOT NULL,
  nonce     TEXT NOT NULL,
  retour    TEXT NOT NULL,
  reauth    TEXT,                                -- session qui se ré-authentifie (empreinte), sinon NULL
  cree_a    INTEGER NOT NULL
);

-- Droits : la seconde clé (attribution par un Administrateur de la Vigie) et le dernier plafond vu (première clé, Zitadel).
CREATE TABLE console_droits (
  sub          TEXT PRIMARY KEY,
  nom          TEXT,
  attribution  TEXT CHECK (attribution IN ('viewer', 'handler', 'analyst', 'admin')),   -- NULL : pas encore attribuée (Lecteur)
  attribue_par TEXT,
  attribue_a   INTEGER,
  plafond      TEXT,                                                                    -- NULL : aucun rôle vigie.*
  plafond_a    INTEGER,
  premiere     INTEGER NOT NULL,
  derniere     INTEGER NOT NULL
);
