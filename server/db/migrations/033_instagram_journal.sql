-- Journal de la file Instagram (page Instagram, en bas) : ce qui s'est passé, photo par photo — mise en file,
-- envoi, étapes, publication, échec, pause, reprise, demande de republication. Jamais de jeton ni de contenu de
-- l'API ; message en français, traduit à l'affichage. Effacé au-delà de 90 jours.
CREATE TABLE instagram_events (
  id       INTEGER PRIMARY KEY,
  at       INTEGER NOT NULL,                 -- epoch ms
  post_id  INTEGER,
  photo_id INTEGER,
  level    TEXT NOT NULL CHECK (level IN ('info', 'ok', 'warn', 'error')),
  message  TEXT NOT NULL,
  by_name  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX instagram_events_at ON instagram_events (at);
