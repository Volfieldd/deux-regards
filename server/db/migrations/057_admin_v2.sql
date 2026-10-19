-- Admin v2 (maquettes MQ-07 à MQ-10 de l'audit d'ergonomie du 16 oct. 2026), à côté de l'admin v1 : chaque compte
-- choisit la sienne (« Admin : v1 / v2 », menu du compte), et peut revenir en arrière d'un clic.
-- Préférences d'un compte, dans une table à part : le schéma de la table accounts entre dans l'empreinte surveillée par
-- la Vigie (server/securite/site.js, état) ; il ne change pas. Aucun déclencheur ici. Une clé, une valeur (texte) :
--   admin_version : 'v1' ou 'v2' (absente : v1).
-- Le compte supprimé emporte ses préférences.
CREATE TABLE account_prefs (
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, key)
) WITHOUT ROWID;
