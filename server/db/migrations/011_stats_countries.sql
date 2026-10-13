-- Visiteurs uniques du jour par pays (code ISO à deux lettres fourni par Cloudflare, « XX » si inconnu).
-- Aucune adresse IP : le pays est déjà calculé par Cloudflare (en-tête CF-IPCountry). Purgé à 25 mois.
CREATE TABLE stats_countries (
  day      TEXT NOT NULL,
  country  TEXT NOT NULL,
  visitors INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, country)
);
