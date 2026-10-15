-- Publication Instagram en échec : le photographe qui n'a pas la main sur la file peut demander qu'elle soit
-- republiée (qui, quand) ; la demande s'efface quand la photo repart dans la file.
ALTER TABLE instagram_posts ADD COLUMN retry_requested_at INTEGER;
ALTER TABLE instagram_posts ADD COLUMN retry_requested_by TEXT;
