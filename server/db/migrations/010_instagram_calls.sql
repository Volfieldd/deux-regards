-- Journal des appels à l'API Instagram : budget horaire et consommation affichée. Dates et types seulement
-- (jamais de jeton ni de contenu) ; effacé au-delà de 7 jours.
CREATE TABLE instagram_calls (
  id   INTEGER PRIMARY KEY,
  at   INTEGER NOT NULL,          -- epoch ms
  kind TEXT NOT NULL              -- media, status, publish, permalink, quota, token, refresh, me
);
CREATE INDEX instagram_calls_at ON instagram_calls (at);
