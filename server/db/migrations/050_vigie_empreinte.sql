-- Vigie, arbitrage N1 (17 octobre 2026) : empreinte plus fine du navigateur d'une session (navigateur complet, langues,
-- plateforme et mobile annoncés par le navigateur), en plus de sa famille. Cloudflare terminant le TLS, l'empreinte
-- TLS (JA3/JA4) n'arrive pas au site en offre gratuite. Empreinte seule (SHA-256 tronqué), jamais les en-têtes.
ALTER TABLE sessions ADD COLUMN ctx_fp TEXT;
ALTER TABLE sessions_revoked ADD COLUMN ctx_fp TEXT;
