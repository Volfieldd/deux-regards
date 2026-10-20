-- Page /bonjour, personne de moins de 15 ans qui demande à recevoir sa photo (PLAN point 8, décision du propriétaire du
-- 20 octobre 2026 ; RGPD art. 8, loi Informatique et libertés art. 45) : elle donne l'adresse e-mail d'un parent à la
-- place de la sienne ; la photo et les réponses partent au parent, l'adresse de la personne n'est jamais gardée.
--   email_parent : 1 quand encounters.email est l'adresse d'un parent (chiffrée par DATA_KEY comme toute adresse, mêmes
--                  durées et même effacement que la rencontre ; pas d'empreinte email_hash : elle ne rapproche pas deux
--                  personnes d'une même famille) ; 0 sinon.
ALTER TABLE encounters ADD COLUMN email_parent INTEGER NOT NULL DEFAULT 0;
