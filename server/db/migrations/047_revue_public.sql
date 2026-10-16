-- Codes de contrôle des cartes (3 caractères, revue du 16 octobre 2026) : chaque code faux envoyé sur /bonjour est noté
-- par référence, d'où que vienne l'essai. Au-delà de 5 en 24 h, tout code de cette référence est ignoré (demande
-- traitée comme une référence sans code) ; les lignes de plus de 24 h sont effacées au passage.
CREATE TABLE card_code_failures (
  ref  TEXT NOT NULL,
  at   INTEGER NOT NULL
);
CREATE INDEX card_code_failures_ref ON card_code_failures (ref, at);
CREATE INDEX card_code_failures_at ON card_code_failures (at);
