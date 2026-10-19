-- Vigie, décision « verifier_identite » (décision du propriétaire du 19 octobre 2026) : heure de l'authentification chez
-- Zitadel de chaque session (auth_time du jeton d'identité, en millisecondes ; l'heure de la connexion pour la connexion
-- de test). Une session authentifiée avant le début d'une vérification d'identité demandée par la Vigie ne peut plus rien
-- écrire dans l'admin sans une nouvelle authentification du même compte. Vide pour les sessions ouvertes avant cette
-- migration (tenues pour anciennes). Colonne de la table des sessions : la table accounts, dont la Vigie surveille le
-- schéma, n'est pas touchée.
ALTER TABLE sessions ADD COLUMN auth_time INTEGER;
