-- Page « Confidentialité » : contact des responsables (réglable dans l'admin, Réglages).
INSERT INTO settings (key, value) VALUES ('privacy_contact', '"info@nicephos.art"') ON CONFLICT(key) DO NOTHING;
