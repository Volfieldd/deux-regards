-- Données du site public v2 (PLAN.md, point 8 ; maquettes de l'audit d'ergonomie du 16 octobre 2026). Textes en trois
-- langues comme leurs voisins (vide : repli sur une autre langue, server/i18n.js) ; tous vides par défaut, rien ne
-- change sur le site tant qu'ils ne sont pas écrits dans l'admin.
--   - Texte d'intention d'une série (MQ-03) : ce que la série cherche, quelques phrases.
ALTER TABLE categories ADD COLUMN intent TEXT NOT NULL DEFAULT '';
ALTER TABLE categories ADD COLUMN intent_en TEXT NOT NULL DEFAULT '';
ALTER TABLE categories ADD COLUMN intent_de TEXT NOT NULL DEFAULT '';
--   - Description courte d'un photographe, son « regard » (MQ-01) : une phrase sous son nom.
ALTER TABLE authors ADD COLUMN short_bio TEXT NOT NULL DEFAULT '';
ALTER TABLE authors ADD COLUMN short_bio_en TEXT NOT NULL DEFAULT '';
ALTER TABLE authors ADD COLUMN short_bio_de TEXT NOT NULL DEFAULT '';
--   - Texte de remplacement d'une photo (UX-F-44) : ce qu'on y voit, lu par les personnes aveugles à la place de la
--     photo. Écrit ou validé par une personne : la description suggérée (photo_descriptions, migration 039) n'y est
--     jamais recopiée seule.
ALTER TABLE photos ADD COLUMN alt_text TEXT NOT NULL DEFAULT '';
ALTER TABLE photos ADD COLUMN alt_text_en TEXT NOT NULL DEFAULT '';
ALTER TABLE photos ADD COLUMN alt_text_de TEXT NOT NULL DEFAULT '';

-- Numéro d'inventaire (UX-T-05, lexique des maquettes § 2) : « J26-003 » = initiale du photographe (sa lettre des
-- cartes, à défaut la première de son adresse), deux chiffres de l'année de première publication, rang du photographe
-- dans l'année sur trois chiffres. Donné à la première publication, quel que soit le chemin qui publie (déclencheurs,
-- comme published_at, migration 009) ; jamais changé ensuite (dépublication, autre photographe, réordonnancement) ;
-- jamais réutilisé : le dernier rang de chaque préfixe est gardé ici, même quand la photo est supprimée. Ni l'heure,
-- ni l'identifiant interne de la photo n'y figurent.
CREATE TABLE inventory_counters (
  prefix TEXT PRIMARY KEY,                     -- « J26 »
  last   INTEGER NOT NULL CHECK (last > 0)     -- dernier rang donné
);
ALTER TABLE photos ADD COLUMN inventory TEXT;
CREATE UNIQUE INDEX photos_inventory ON photos (inventory);

-- Photos déjà publiées une fois (published_at posée) : numérotées dans l'ordre de leur première publication.
UPDATE photos SET inventory = r.code FROM (
  SELECT id, prefix || '-' || printf('%03d', ROW_NUMBER() OVER (PARTITION BY prefix ORDER BY published_at, id)) AS code
  FROM (SELECT p.id, p.published_at, COALESCE(NULLIF(a.card_prefix, ''), upper(substr(a.slug, 1, 1))) || substr(strftime('%Y', p.published_at), 3, 2) AS prefix
        FROM photos p JOIN authors a ON a.id = p.author_id WHERE p.published_at IS NOT NULL)
) AS r WHERE photos.id = r.id;
INSERT INTO inventory_counters (prefix, last)
  SELECT substr(inventory, 1, instr(inventory, '-') - 1), MAX(CAST(substr(inventory, instr(inventory, '-') + 1) AS INTEGER))
  FROM photos WHERE inventory IS NOT NULL GROUP BY 1;

-- Première publication : le rang suivant du préfixe, puis le numéro. L'année est celle de published_at (posée par
-- l'autre déclencheur, dans n'importe quel ordre : à défaut, l'année en cours, la même).
CREATE TRIGGER photos_inventory_insert AFTER INSERT ON photos
  WHEN NEW.status = 'published' AND NEW.inventory IS NULL
BEGIN
  INSERT INTO inventory_counters (prefix, last)
    VALUES ((SELECT COALESCE(NULLIF(card_prefix, ''), upper(substr(slug, 1, 1))) FROM authors WHERE id = NEW.author_id)
      || substr(strftime('%Y', COALESCE((SELECT published_at FROM photos WHERE id = NEW.id), 'now')), 3, 2), 1)
    ON CONFLICT(prefix) DO UPDATE SET last = last + 1;
  UPDATE photos SET inventory = (SELECT prefix || '-' || printf('%03d', last) FROM inventory_counters
    WHERE prefix = (SELECT COALESCE(NULLIF(card_prefix, ''), upper(substr(slug, 1, 1))) FROM authors WHERE id = NEW.author_id)
      || substr(strftime('%Y', COALESCE((SELECT published_at FROM photos WHERE id = NEW.id), 'now')), 3, 2)) WHERE id = NEW.id;
END;
CREATE TRIGGER photos_inventory_update AFTER UPDATE OF status ON photos
  WHEN NEW.status = 'published' AND NEW.inventory IS NULL
BEGIN
  INSERT INTO inventory_counters (prefix, last)
    VALUES ((SELECT COALESCE(NULLIF(card_prefix, ''), upper(substr(slug, 1, 1))) FROM authors WHERE id = NEW.author_id)
      || substr(strftime('%Y', COALESCE((SELECT published_at FROM photos WHERE id = NEW.id), 'now')), 3, 2), 1)
    ON CONFLICT(prefix) DO UPDATE SET last = last + 1;
  UPDATE photos SET inventory = (SELECT prefix || '-' || printf('%03d', last) FROM inventory_counters
    WHERE prefix = (SELECT COALESCE(NULLIF(card_prefix, ''), upper(substr(slug, 1, 1))) FROM authors WHERE id = NEW.author_id)
      || substr(strftime('%Y', COALESCE((SELECT published_at FROM photos WHERE id = NEW.id), 'now')), 3, 2)) WHERE id = NEW.id;
END;
-- Stable : un numéro donné ne change plus ; un rang ne redescend pas et n'est pas effacé (il serait redonné).
CREATE TRIGGER photos_inventory_stable BEFORE UPDATE OF inventory ON photos
  WHEN OLD.inventory IS NOT NULL AND NEW.inventory IS NOT OLD.inventory
BEGIN
  SELECT RAISE(ABORT, 'numéro d’inventaire : il ne change jamais');
END;
CREATE TRIGGER inventory_counters_monotone BEFORE UPDATE ON inventory_counters
  WHEN NEW.prefix IS NOT OLD.prefix OR NEW.last <= OLD.last
BEGIN
  SELECT RAISE(ABORT, 'numéro d’inventaire : un rang n’est jamais redonné');
END;
CREATE TRIGGER inventory_counters_conserve BEFORE DELETE ON inventory_counters
BEGIN
  SELECT RAISE(ABORT, 'numéro d’inventaire : un rang n’est jamais redonné');
END;
