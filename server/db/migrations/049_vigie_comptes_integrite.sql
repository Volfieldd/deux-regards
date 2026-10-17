-- Revue de la phase A de la Vigie (17 octobre 2026) : le journal des comptes (migration 048) devait pouvoir être
-- trompé ou effacé par qui écrit directement dans la base.
--   - Tickets signés : l'application signe chaque ticket (HMAC, clé dérivée de COOKIE_SECRET, jamais dans la base) ;
--     un ticket ouvert à la main n'a pas de signature valide et ne couvre plus un changement.
--   - Colonnes surveillées en plus : sub (un compte qui prend l'identité d'un administrateur), e-mail et adresse de
--     notification (e-mails des demandes RGPD détournés), décision d'un administrateur (decided_at).
--   - Journal en ajout seul : ni modification, ni effacement avant 13 mois (purge de l'application seulement) ; un
--     déclencheur supprimé pour passer outre est signalé par l'état que le site envoie à la Vigie.
ALTER TABLE account_change_tickets ADD COLUMN sig TEXT;
ALTER TABLE account_changes ADD COLUMN old_sub TEXT;
ALTER TABLE account_changes ADD COLUMN champs TEXT;

DROP TRIGGER account_changes_update;
CREATE TRIGGER account_changes_update AFTER UPDATE ON accounts
WHEN OLD.sub IS NOT NEW.sub OR OLD.roles IS NOT NEW.roles OR OLD.status IS NOT NEW.status OR OLD.author_id IS NOT NEW.author_id
  OR OLD.adjust IS NOT NEW.adjust OR OLD.email IS NOT NEW.email OR OLD.notify_to IS NOT NEW.notify_to OR OLD.decided_at IS NOT NEW.decided_at
BEGIN
  INSERT INTO account_changes (at, op, sub, old_sub, old_roles, new_roles, old_status, new_status, old_author, new_author, old_adjust, new_adjust, champs, ticket_id)
  VALUES (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 'UPDATE', NEW.sub, CASE WHEN OLD.sub IS NOT NEW.sub THEN OLD.sub END,
    OLD.roles, NEW.roles, OLD.status, NEW.status, OLD.author_id, NEW.author_id, OLD.adjust, NEW.adjust,
    trim(CASE WHEN OLD.sub IS NOT NEW.sub THEN 'sub ' ELSE '' END || CASE WHEN OLD.roles IS NOT NEW.roles THEN 'roles ' ELSE '' END
      || CASE WHEN OLD.status IS NOT NEW.status THEN 'etat ' ELSE '' END || CASE WHEN OLD.author_id IS NOT NEW.author_id THEN 'photographe ' ELSE '' END
      || CASE WHEN OLD.adjust IS NOT NEW.adjust THEN 'circuit ' ELSE '' END || CASE WHEN OLD.email IS NOT NEW.email THEN 'email ' ELSE '' END
      || CASE WHEN OLD.notify_to IS NOT NEW.notify_to THEN 'notification ' ELSE '' END || CASE WHEN OLD.decided_at IS NOT NEW.decided_at THEN 'decision ' ELSE '' END),
    (SELECT id FROM account_change_tickets WHERE open = 1 ORDER BY id DESC LIMIT 1));
END;

CREATE TRIGGER account_changes_immuable BEFORE UPDATE ON account_changes
BEGIN
  SELECT RAISE(ABORT, 'journal des comptes : modification interdite');
END;
CREATE TRIGGER account_changes_conserve BEFORE DELETE ON account_changes
WHEN OLD.at > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER) - 396 * 86400000
BEGIN
  SELECT RAISE(ABORT, 'journal des comptes : effacement interdit avant 13 mois');
END;
-- Un ticket ne change qu'une fois : fermé (open 1 → 0) et signé (sig vide → valeur).
CREATE TRIGGER account_change_tickets_immuable BEFORE UPDATE ON account_change_tickets
WHEN NEW.id IS NOT OLD.id OR NEW.at IS NOT OLD.at OR NEW.action IS NOT OLD.action OR NEW.by_sub IS NOT OLD.by_sub
  OR (OLD.sig IS NOT NULL AND NEW.sig IS NOT OLD.sig) OR (OLD.open = 0 AND NEW.open = 1)
BEGIN
  SELECT RAISE(ABORT, 'tickets des comptes : modification interdite');
END;
CREATE TRIGGER account_change_tickets_conserve BEFORE DELETE ON account_change_tickets
WHEN OLD.at > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER) - 396 * 86400000
BEGIN
  SELECT RAISE(ABORT, 'tickets des comptes : effacement interdit avant 13 mois');
END;
