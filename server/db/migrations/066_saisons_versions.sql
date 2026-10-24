-- Verrou optimiste de l’atelier : une horloge à la milliseconde ne distingue pas deux écritures simultanées.
ALTER TABLE saisons ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);
