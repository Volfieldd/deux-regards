-- Likes et commentaires des posts Instagram publiés depuis le site : un relevé par post et par jour (heure de Paris),
-- pour l'évolution. Seulement des nombres : l'API ne dit pas qui a aimé, et rien d'autre n'est gardé.
CREATE TABLE instagram_engagement (
  ig_media_id TEXT NOT NULL,
  day         TEXT NOT NULL,              -- AAAA-MM-JJ
  likes       INTEGER NOT NULL DEFAULT 0,
  comments    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ig_media_id, day)
);
