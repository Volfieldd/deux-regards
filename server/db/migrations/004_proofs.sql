-- Preuve d'antériorité : empreinte de l'original et horodatage RFC 3161.
ALTER TABLE photos ADD COLUMN sha256 TEXT;               -- empreinte SHA-256 de l'original (hex)

CREATE TABLE timestamps (
  photo_id   INTEGER PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
  sha256     TEXT NOT NULL,                            -- empreinte horodatée
  tsa        TEXT NOT NULL,                            -- URL du service
  status     TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  token      BLOB,                                     -- réponse RFC 3161 complète (DER)
  gen_time   TEXT,                                     -- date certifiée (ISO 8601, UTC)
  serial     TEXT,
  signer     TEXT,                                     -- sujet du certificat de la TSA
  error      TEXT,
  attempts   INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL                          -- epoch ms
);
