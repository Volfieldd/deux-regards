-- Index dérivé des étiquettes des signaux chaînés (console ATT&CK, D3). Une ligne par signal et technique,
-- jamais une réécriture du journal. Les doublons et les détails anciens mal formés ne bloquent pas l'ingestion.
CREATE TABLE events_techniques (
  seq INTEGER NOT NULL REFERENCES events(seq) ON DELETE CASCADE,
  technique TEXT NOT NULL,
  recu_a INTEGER NOT NULL,
  PRIMARY KEY (seq, technique)
);
CREATE INDEX events_techniques_lecture ON events_techniques (technique, recu_a, seq);

INSERT OR IGNORE INTO events_techniques (seq, technique, recu_a)
SELECT e.seq, upper(substr(j.value, 8)), e.recu_a
FROM events e, json_each(CASE WHEN json_valid(e.detail) THEN
  CASE WHEN json_type(e.detail, '$.tags') = 'array' THEN json_extract(e.detail, '$.tags') ELSE '[]' END ELSE '[]' END) j
WHERE e.type = 'vigie_signal' AND j.type = 'text'
  AND (lower(j.value) GLOB 'attack.t[0-9][0-9][0-9][0-9]' OR lower(j.value) GLOB 'attack.t[0-9][0-9][0-9][0-9].[0-9][0-9][0-9]');

CREATE TRIGGER events_techniques_ajout AFTER INSERT ON events WHEN NEW.type = 'vigie_signal' BEGIN
  INSERT OR IGNORE INTO events_techniques (seq, technique, recu_a)
  SELECT NEW.seq, upper(substr(j.value, 8)), NEW.recu_a
  FROM json_each(CASE WHEN json_valid(NEW.detail) THEN
    CASE WHEN json_type(NEW.detail, '$.tags') = 'array' THEN json_extract(NEW.detail, '$.tags') ELSE '[]' END ELSE '[]' END) j
  WHERE j.type = 'text' AND (lower(j.value) GLOB 'attack.t[0-9][0-9][0-9][0-9]' OR lower(j.value) GLOB 'attack.t[0-9][0-9][0-9][0-9].[0-9][0-9][0-9]');
END;
-- La purge fonctionne aussi dans les outils qui n'activent pas les clés étrangères SQLite.
CREATE TRIGGER events_techniques_effacer AFTER DELETE ON events WHEN OLD.type = 'vigie_signal' BEGIN
  DELETE FROM events_techniques WHERE seq = OLD.seq;
END;

-- Une fiche de technique retrouve les dossiers par les règles qui la portent, sans relire les faits ordinaires.
CREATE INDEX dossier_signaux_regle ON dossier_signaux (regle, survenu_a, dossier_id) WHERE nature != 'fait';
