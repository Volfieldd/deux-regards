-- Adresse temporaire de l'image envoyée à Instagram : date d'émission du jeton (expiration au bout de 15 minutes).
ALTER TABLE instagram_posts ADD COLUMN media_token_at INTEGER;
