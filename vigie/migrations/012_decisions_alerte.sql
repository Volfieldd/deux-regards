-- Console de la Vigie (audit D3-D3) : l'alerte à laquelle répond une décision, dans une colonne indexée. La console
-- cherchait les réponses d'une alerte dans le motif (« alerte #n », ou « alerte #n · … » pour une décision prise depuis
-- la fiche) : sans index, dans une table jamais purgée (238 ms par vue d'ensemble pour 200 000 décisions, rafraîchie
-- chaque minute). La colonne ne sert qu'à la console : elle n'entre ni dans l'empreinte de la ligne (mac) ni dans la
-- liste signée lue par le site. Reprise de l'existant : le numéro écrit au début du motif, sous la forme même que la
-- console cherchait (« alerte #412 », « alerte #412 · enquête » ; pas « alerte #0412 », ni « Alerte #412 »).
-- Les décisions levées ou échues depuis plus de 13 mois sont effacées par la purge quotidienne (vigie/moteur.js, purge).
ALTER TABLE decisions ADD COLUMN alerte_id INTEGER;

UPDATE decisions SET alerte_id = CAST(substr(motif, 9) AS INTEGER)
  WHERE motif GLOB 'alerte #[1-9]*'
    AND (motif = 'alerte #' || CAST(substr(motif, 9) AS INTEGER)
      OR substr(motif, 1, length('alerte #' || CAST(substr(motif, 9) AS INTEGER)) + 3) = 'alerte #' || CAST(substr(motif, 9) AS INTEGER) || ' · ');

CREATE INDEX decisions_alerte ON decisions (alerte_id) WHERE alerte_id IS NOT NULL;
-- Blocages des 7 derniers jours (vue d'ensemble, chaque minute) : par la date, sans relire toute la table.
CREATE INDEX decisions_cree ON decisions (cree_a);
