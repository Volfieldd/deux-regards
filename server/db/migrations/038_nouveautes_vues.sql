-- Nouveautés de l'admin (server/nouveautes.json) : la dernière version que le compte a vue dans la fenêtre
-- « Nouveautés ». NULL : aucune encore — la fenêtre montre alors tout depuis la version 1.79.0.
ALTER TABLE accounts ADD COLUMN seen_release TEXT;
