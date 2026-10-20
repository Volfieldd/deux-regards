-- Messages des visiteurs (PLAN point 8, maquette MQ-06 sans la vente de tirages) : la page Contact (/contact, « Écrire à
-- Sébastien, à Julien, ou aux deux ») et la demande de licence d'une photo (/droits/demande?photo=<slug>). Lus dans
-- l'admin, boîte « Messages et demandes » (server/messages.js, server/routes/messages.js).
--   kind      : 'contact' ou 'licence' ;
--   author_id : le photographe à qui le message est adressé (celui de la photo pour une licence) ; NULL : aux deux
--               (to_all = 1), ou photographe supprimé depuis (to_all = 0 : le message n'est plus lisible que de qui voit
--               tous les messages, jamais de l'autre photographe) ;
--   to_all    : 1 pour un message adressé aux deux (Contact « aux deux », demande de licence sans photo) ;
--   photo_id  : la photo d'une demande de licence (NULL : aucune, ou supprimée depuis) ;
--   usage     : usage prévu d'une licence (presse, web, publicite, autre), liste fermée ;
--   name, email, company, diffusion, message : données personnelles, chiffrées par DATA_KEY (server/vault.js) quand elle
--   est définie, comme les signalements ; effacées 12 mois après l'envoi (purge quotidienne) ;
--   notified_at : e-mail « Un nouveau message vous attend » envoyé (ou impossible) ; NULL : à envoyer.
CREATE TABLE messages (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('contact', 'licence')),
  author_id   INTEGER REFERENCES authors(id) ON DELETE SET NULL,
  to_all      INTEGER NOT NULL DEFAULT 0 CHECK (to_all IN (0, 1)),
  photo_id    INTEGER REFERENCES photos(id) ON DELETE SET NULL,
  usage       TEXT NOT NULL DEFAULT '' CHECK (usage IN ('', 'presse', 'web', 'publicite', 'autre')),
  name        TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  company     TEXT NOT NULL DEFAULT '',
  diffusion   TEXT NOT NULL DEFAULT '',
  message     TEXT NOT NULL DEFAULT '',
  lang        TEXT NOT NULL DEFAULT 'fr' CHECK (lang IN ('fr', 'en', 'de')),
  status      TEXT NOT NULL DEFAULT 'nouveau' CHECK (status IN ('nouveau', 'traite')),
  created_at  INTEGER NOT NULL,
  done_at     INTEGER,
  notified_at INTEGER
);
CREATE INDEX messages_status ON messages (status, created_at);
CREATE INDEX messages_author ON messages (author_id);
CREATE INDEX messages_photo ON messages (photo_id);
