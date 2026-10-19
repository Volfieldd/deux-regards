-- Numéro d'inventaire (migration 053) : l'année est celle de Paris, plus celle de l'UTC. Une photo publiée le
-- 1er janvier entre minuit et 1 h (heure de Paris) prenait l'année précédente. Le passage d'année tombe toujours en
-- heure d'hiver (UTC+1) : l'année de Paris est exactement celle de published_at (UTC, migration 009) plus une heure.
-- Seuls les deux déclencheurs de la première publication sont recréés : les numéros déjà donnés ne changent pas (ils
-- sont stables, photos_inventory_stable), les compteurs non plus ; rien ne touche aux déclencheurs des comptes ni des
-- sessions.
DROP TRIGGER photos_inventory_insert;
DROP TRIGGER photos_inventory_update;

CREATE TRIGGER photos_inventory_insert AFTER INSERT ON photos
  WHEN NEW.status = 'published' AND NEW.inventory IS NULL
BEGIN
  INSERT INTO inventory_counters (prefix, last)
    VALUES ((SELECT COALESCE(NULLIF(card_prefix, ''), upper(substr(slug, 1, 1))) FROM authors WHERE id = NEW.author_id)
      || substr(strftime('%Y', COALESCE((SELECT published_at FROM photos WHERE id = NEW.id), 'now'), '+1 hour'), 3, 2), 1)
    ON CONFLICT(prefix) DO UPDATE SET last = last + 1;
  UPDATE photos SET inventory = (SELECT prefix || '-' || printf('%03d', last) FROM inventory_counters
    WHERE prefix = (SELECT COALESCE(NULLIF(card_prefix, ''), upper(substr(slug, 1, 1))) FROM authors WHERE id = NEW.author_id)
      || substr(strftime('%Y', COALESCE((SELECT published_at FROM photos WHERE id = NEW.id), 'now'), '+1 hour'), 3, 2)) WHERE id = NEW.id;
END;
CREATE TRIGGER photos_inventory_update AFTER UPDATE OF status ON photos
  WHEN NEW.status = 'published' AND NEW.inventory IS NULL
BEGIN
  INSERT INTO inventory_counters (prefix, last)
    VALUES ((SELECT COALESCE(NULLIF(card_prefix, ''), upper(substr(slug, 1, 1))) FROM authors WHERE id = NEW.author_id)
      || substr(strftime('%Y', COALESCE((SELECT published_at FROM photos WHERE id = NEW.id), 'now'), '+1 hour'), 3, 2), 1)
    ON CONFLICT(prefix) DO UPDATE SET last = last + 1;
  UPDATE photos SET inventory = (SELECT prefix || '-' || printf('%03d', last) FROM inventory_counters
    WHERE prefix = (SELECT COALESCE(NULLIF(card_prefix, ''), upper(substr(slug, 1, 1))) FROM authors WHERE id = NEW.author_id)
      || substr(strftime('%Y', COALESCE((SELECT published_at FROM photos WHERE id = NEW.id), 'now'), '+1 hour'), 3, 2)) WHERE id = NEW.id;
END;
