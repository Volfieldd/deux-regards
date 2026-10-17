-- Revue de la phase B (17 octobre 2026) : chaque décision porte un HMAC (clé du journal, hors de la base). Une ligne
-- écrite ou modifiée à la main n'a pas de signature valide : la Vigie ne la signe pas pour le site et le signale.
ALTER TABLE decisions ADD COLUMN mac TEXT;
