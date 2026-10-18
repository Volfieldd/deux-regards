-- Console de la Vigie, phase D3b : flux et provenance des alertes (MV-11, /flux) et barre de provenance de la vue d'ensemble
-- (MV-01, recalculée chaque minute). Les volumes viennent de la table daily ; il reste à savoir, pour chaque alerte de la
-- période, de quels événements elle est faite (type, gravité, composant : sa provenance) et lesquels elle « porte » dans le
-- diagramme des événements (un événement rattaché à deux alertes n'y compte qu'une fois).
-- Sans cette table, la console relirait alert_events et, pour chaque lien, la ligne de l'événement : une lecture par
-- événement rattaché. Mesuré sur une base de 600 000 événements et 140 000 liens d'alertes : 0,5 à 1 s pour 30 jours, et
-- autant de plus à chaque afflux (une adresse qui balaie le site rattache des dizaines de milliers d'événements à son
-- alerte de score). Ici : quelques lignes par alerte, par jour et par type, lues par la clé.
-- Tenue par deux déclencheurs, dans la transaction de l'écriture : à chaque lien ajouté (INSERT OR IGNORE du moteur : un
-- lien déjà connu ne déclenche rien), une lecture de l'événement par sa clé, une de alert_events par l'index
-- alert_events_seq (migration 008, repris ici s'il manque) et une écriture ; à la suppression d'une alerte (purge des
-- alertes closes depuis 13 mois), ses lignes partent avec elle.
-- premier : les événements que cette alerte a été la première à rattacher (aucune autre alerte ne les avait encore) ; c'est
-- elle qui les porte dans le diagramme des événements. Reprise de l'existant : la plus ancienne alerte (plus petit numéro).
CREATE TABLE alert_flux (
  alert_id   INTEGER NOT NULL,
  jour       TEXT NOT NULL,                -- jour UTC de réception de l'événement (comme daily)
  type       TEXT NOT NULL,
  severity   TEXT NOT NULL,
  composant  TEXT NOT NULL,
  n          INTEGER NOT NULL DEFAULT 0,   -- événements rattachés à l'alerte
  premier    INTEGER NOT NULL DEFAULT 0,   -- dont ceux qu'elle a rattachés la première
  PRIMARY KEY (alert_id, jour, type, severity, composant)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS alert_events_seq ON alert_events (seq);

CREATE TRIGGER alert_flux_lien AFTER INSERT ON alert_events BEGIN
  INSERT INTO alert_flux (alert_id, jour, type, severity, composant, n, premier)
  SELECT NEW.alert_id, strftime('%Y-%m-%d', e.recu_a / 1000, 'unixepoch'), e.type, e.severity, e.composant, 1,
    NOT EXISTS (SELECT 1 FROM alert_events a2 WHERE a2.seq = NEW.seq AND a2.alert_id <> NEW.alert_id)
  FROM events e WHERE e.seq = NEW.seq
  ON CONFLICT (alert_id, jour, type, severity, composant) DO UPDATE SET n = n + 1, premier = premier + excluded.premier;
END;

CREATE TRIGGER alert_flux_alerte AFTER DELETE ON alerts BEGIN
  DELETE FROM alert_flux WHERE alert_id = OLD.id;
END;

INSERT INTO alert_flux (alert_id, jour, type, severity, composant, n, premier)
  SELECT ae.alert_id, strftime('%Y-%m-%d', e.recu_a / 1000, 'unixepoch'), e.type, e.severity, e.composant, COUNT(*),
    SUM(ae.alert_id = (SELECT MIN(a2.alert_id) FROM alert_events a2 WHERE a2.seq = ae.seq))
  FROM alert_events ae JOIN events e ON e.seq = ae.seq
  GROUP BY 1, 2, 3, 4, 5;
