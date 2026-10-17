-- Vigie, phase C3 (capteur en bordure) : contexte de session vu par la bordure Cloudflare, quand elle est en place
-- (en-têtes signés du Worker) : opérateur réseau (ASN) et empreintes TLS (SHA-256 tronqué, jamais le ClientHello).
ALTER TABLE sessions ADD COLUMN ctx_asn TEXT;
ALTER TABLE sessions ADD COLUMN ctx_tls TEXT;
ALTER TABLE sessions ADD COLUMN ctx_tls_brut TEXT;
ALTER TABLE sessions_revoked ADD COLUMN ctx_asn TEXT;
ALTER TABLE sessions_revoked ADD COLUMN ctx_tls TEXT;
ALTER TABLE sessions_revoked ADD COLUMN ctx_tls_brut TEXT;
