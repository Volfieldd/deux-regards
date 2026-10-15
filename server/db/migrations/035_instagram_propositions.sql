-- Circuit Instagram : le photographe propose une photo publiée sur le site pour Instagram (cadre, filigrane, légende,
-- un mot), le modérateur la met dans la file ou la renvoie avec une remarque. Une proposition ouverte par photo ;
-- les décisions restent (historique, et journal de la file).
CREATE TABLE instagram_proposals (
  id           INTEGER PRIMARY KEY,
  photo_id     INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'proposee' CHECK (status IN ('proposee', 'validee', 'renvoyee', 'retiree')),
  frame        TEXT NOT NULL,
  watermark    INTEGER NOT NULL DEFAULT 0,
  caption      TEXT,                           -- légende personnalisée ; NULL : celle du modèle
  message      TEXT NOT NULL DEFAULT '',       -- le mot du photographe
  by_sub       TEXT,
  by_name      TEXT NOT NULL DEFAULT '',
  at           INTEGER NOT NULL,
  decided_by   TEXT NOT NULL DEFAULT '',
  decided_at   INTEGER,
  remark       TEXT NOT NULL DEFAULT ''        -- la remarque du modérateur quand il renvoie
);
CREATE INDEX instagram_proposals_open ON instagram_proposals (status, at);
CREATE INDEX instagram_proposals_photo ON instagram_proposals (photo_id);
