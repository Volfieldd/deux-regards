-- Rencontre saisie sur le téléphone, avec la personne : photo de repère, signature au doigt, position arrondie
-- (~100 m, jamais plus précise), majorité ou accord d'un parent. Tout est effacé avec la rencontre.
ALTER TABLE encounters ADD COLUMN portrait_jpeg BLOB;
ALTER TABLE encounters ADD COLUMN signature_png BLOB;
ALTER TABLE encounters ADD COLUMN lat REAL;
ALTER TABLE encounters ADD COLUMN lon REAL;
ALTER TABLE encounters ADD COLUMN adult INTEGER;            -- 1 : majeure ; 0 : mineure (accord du parent) ; NULL : non renseigné
ALTER TABLE encounters ADD COLUMN guardian TEXT NOT NULL DEFAULT '';
ALTER TABLE encounters ADD COLUMN mailed_at INTEGER;        -- récapitulatif envoyé par le serveur
