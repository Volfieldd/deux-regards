-- Relances par e-mail. Demandes RGPD : nombre d'étapes déjà envoyées (1 : à l'arrivée, 2 : au quart du délai,
-- 3 : à la moitié, administrateur en copie, 4 : aux trois quarts, prioritaire) ; remis à zéro à chaque demande.
-- Récapitulatif de ce qui attend chaque compte : jamais, chaque jour ou chaque semaine (jamais plus d'un par jour).
ALTER TABLE encounters ADD COLUMN rights_reminders INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN digest TEXT NOT NULL DEFAULT 'off' CHECK (digest IN ('off', 'daily', 'weekly'));
ALTER TABLE accounts ADD COLUMN digest_sent_at INTEGER;
