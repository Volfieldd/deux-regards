Jetons RFC 3161 réels émis par FreeTSA, vérifiables hors ligne jusqu'en 2040 :

- `freetsa-test.tsr` : empreinte SHA-256 de la chaîne « test », sans nonce ;
- `freetsa-deux-regards.tsr` : empreinte de « deux regards », avec nonce.

Chaîne à trois niveaux, générée avec OpenSSL (valable jusqu'en 2046) pour vérifier une TSA dont le certificat
est émis par une AC intermédiaire :

- `tsa-chaine-racine.pem` : la racine seule ;
- `tsa-chaine.tsr` : jeton sur l'empreinte de « deux regards », sans nonce, qui joint le certificat de la TSA et
  celui de l'AC intermédiaire (`openssl ts -verify … -CAfile tsa-chaine-racine.pem` répond « Verification: OK »).

Détection des visages et descriptions (revue du 16 octobre 2026) :

- `visage.jpg` : visage de l'astronaute Eileen Collins, recadré (160 × 190 px) de l'image `astronaut.png` de scikit-image (photo de la NASA, domaine public) ; le visage fait 61 % de la hauteur de l'image ;
- `faux-florence.mjs` : faux processus de calcul des descriptions (même protocole que `server/describe-worker.js`), qui répond, calcule longtemps, plante ou se tait selon son argument.
