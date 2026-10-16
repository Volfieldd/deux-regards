-- Revue du 16 octobre 2026 (infra) : chaque clé étrangère a un index dont sa colonne est la première. Sans lui, SQLite
-- parcourt toute la table fille à chaque suppression du parent (ON DELETE CASCADE / SET NULL) : supprimer une photo
-- lisait tout stats_photos (une ligne par jour et par photo vue, 25 mois), et bloquait le site pendant ce temps.
CREATE INDEX IF NOT EXISTS stats_photos_photo ON stats_photos (photo_id, day);
CREATE INDEX IF NOT EXISTS encounter_shares_photo ON encounter_shares (photo_id);
CREATE INDEX IF NOT EXISTS encounter_exclusions_photo ON encounter_exclusions (photo_id);
CREATE INDEX IF NOT EXISTS photo_reports_photo ON photo_reports (photo_id);
CREATE INDEX IF NOT EXISTS encounters_author ON encounters (author_id);
CREATE INDEX IF NOT EXISTS people_distinct_b ON people_distinct (b);
CREATE INDEX IF NOT EXISTS trips_author ON trips (author_id);
