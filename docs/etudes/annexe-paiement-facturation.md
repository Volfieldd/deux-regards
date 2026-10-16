# Annexe : paiement et facturation

| | |
|---|---|
| Statut | Étude, rien n'est développé. Annexe de [blog-galeries-boutique.md](blog-galeries-boutique.md) (parties 4 et 5). |
| Date | 15 octobre 2026. Tarifs et documentations consultés ce jour-là. |
| Contenu | Comparatif détaillé des prestataires de paiement ; séquences et états ; webhook ; rapprochement ; outils de facturation ; modèle de données du catalogue, des commandes, des paiements, des factures et des registres ; écrans de comptabilité ; tests. |
| Base de code | `/home/claudecode/dr-work/etude`, commit `7f3727f` (Fastify 5.12.5, Node 22, better-sqlite3) ; références à `server/routes/admin.js` recalées sur `main` à `c88632d` (version 1.88.0 : une ligne de plus en tête du fichier) |
| Relecture | 16 octobre 2026 : contre-vérification des tarifs et revue de conception ; sources ajoutées consultées ce jour-là. |
| Sources | `[n]` : même numérotation que le document principal ; liste en fin d'annexe. |

Les exigences citées (S…, P…, F…) sont celles du document principal.

---

## 1. Prestataires de paiement

### 1.1 Frais

Tarifs publics pour un vendeur établi en France, TTC sauf « HT ». « ? » : non publié ou illisible au 15/10/2026.

| Prestataire | Abonnement | Carte EEE courante | Carte premium ou professionnelle | Carte hors EEE | Wallets | Remboursement | Litige | Sources |
|---|---|---|---|---|---|---|---|---|
| **Stripe** | Aucun | 1,5 % + 0,25 € | 2,8 % + 0,25 € (premium EEE) | 3,15 % + 0,25 € ; Royaume-Uni 2,5 % + 0,25 € ; +2 % si conversion | Apple Pay, Google Pay au tarif carte ; **Wero 0,29 €** ; PayPal : 0,2 % + 0,10 €, plus les frais PayPal [143] ; Klarna dès 4,99 % + 0,40 € | Sans frais, mais les frais du paiement initial ne sont pas rendus | 20 € par litige ; 20 € de plus pour le contester, rendus si gagné | [142], [143], [149] |
| **Mollie** | Aucun en ligne | Visa, Mastercard 1,80 % + 0,25 € ; **Cartes Bancaires 1,20 % + 0,25 €** | 2,90 % + 0,25 € (commerciales) | 3,25 % + 0,25 € | Apple Pay, Google Pay au tarif carte ; PayPal : frais PayPal + 0,10 € ; Wero 0,90 % + 0,25 € (France : « bientôt ») | 0,25 € (source secondaire, à confirmer) | 25 € par litige perdu (à confirmer : page en 403) | [163], [164], [170] |
| **Payplug** Starter (jusqu'à 100 k€ par an) ; tous les tarifs de la page sont **HT** | 10 € HT par mois | 1,5 % + 0,25 € HT | 2,5 % + 0,25 € HT (« Business ») | 2,9 % + 0,25 € HT (hors zone euro) | Apple Pay sans frais additionnels ; **Wero (France) : sur devis** (« Nous contacter ») ; 0,39 € HT pour « iDEAL \| Wero » aux Pays-Bas seulement | Sans frais ; frais initiaux non rendus (à confirmer) | 18 € TTC | [172], [174] |
| **SumUp** (en ligne) | Aucun ; « Paiements Plus » 19 € par mois (taux en ligne illisible) | 2,50 % | ? | ? | Apple Pay, Google Pay sur la page hébergée | ? | ? | [178]-[180] |
| **PayPal** | Aucun | 2,90 % + 0,35 € | Idem | +1,99 % hors EEE ; Royaume-Uni +1,29 % ; conversion 3,0 % au-dessus du taux | — | Sans frais ; frais initiaux non rendus | 14 € (28 € si volume élevé de litiges) | [183] |
| **Stancer** (groupe Iliad) | Aucun en ligne | **0,7 % + 0,15 € HT** | Si interchange et frais de réseau dépassent 0,7 % : prix coûtant + 10 % | 2,5 % + 0,25 € HT | Non documentés | ? | Forfait rendu si le litige est gagné (montant dans les conditions tarifaires, non lu) | [186], [189] |
| **Lydia Pro** | Aucun | 1,90 % HT + 0,10 € HT (de 0,50 € à 1 000 €) | Idem | ? | QR code Lydia 1,90 % HT | ? | ? | [192] (source secondaire, 10/03/2026) |
| **Qonto** (liens de paiement) | Compte Qonto : Basic 9 € HT par mois en paiement annuel | Dès 1,4 % + 0,25 € | ? | ? | Carte, Apple Pay, PayPal, iDEAL | ? | ? | [194], [196] |
| **Wero** (EPI) | Pas de contrat direct : par un prestataire | — | — | — | Stripe 0,29 € ; Payplug sur devis en France ; Mollie 0,90 % + 0,25 € (pas encore en France) | Jusqu'à 730 jours (Stripe) | **Aucun litige** (compte à compte) | [156], [164], [172] |

Notes : Stancer, Lydia et Payplug affichent des prix HT (Payplug : « L'ensemble des tarifs indiqués sur cette page sont hors taxes » [172], relu le 16/10/2026), comme l'abonnement de Qonto (10 € HT = 12 € TTC) ; un vendeur en franchise ne récupère pas la TVA : montant réellement facturé à vérifier sur la première facture. Carte « premium » : définie par Stripe [142]. Le taux CB de Mollie s'applique quand le paiement passe par le réseau CB ; la plupart des cartes françaises sont co-badgées.

### 1.2 Délais, ouverture, intégration

| Prestataire | Versement | Ouverture | Page hébergée | Webhooks | 3DS2 | Facturation | Taxes | Répartition entre vendeurs | API |
|---|---|---|---|---|---|---|---|---|---|
| **Stripe** | Premier versement sous 7 à 14 jours, ensuite 3 jours ouvrés [148] | Type « individual » possible ; l'outil de Stripe pour la France ne demande pas de SIREN à l'ouverture mais identité, adresse, date de naissance, site, IBAN (outil prévu pour Connect ; à confirmer pour un compte direct) [159] ; associations acceptées | **Oui** : Checkout `ui_mode=hosted_page` sur `checkout.stripe.com` [152] | **Signés** : `Stripe-Signature`, HMAC-SHA256 sur `t.corps`, tolérance de 5 min, réessais 3 jours, ordre non garanti, doublons possibles [150] | Inclus [142] | Factures après paiement : 0,4 % plafonné à environ 2 $ [146] ; Invoicing 0,4 % [145] | Stripe Tax 0,5 % ou forfait dès 80 € par mois [144] | Connect : 2 € par compte actif et par mois + 0,25 % + 0,10 € par versement [147] | REST en formulaire, `Authorization: Bearer`, `Idempotency-Key`, `Stripe-Version` [154] |
| **Mollie** | Au choix ; 5 versements par mois gratuits, puis 0,25 € [163] | Numéro d'immatriculation demandé (à confirmer) | **Oui** | **Identifiant seul**, à relire par l'API ; 10 envois sur environ 26 h [166] ; webhooks « next-gen » signés `X-Mollie-Signature`, mais Mollie conseille encore les classiques pour les paiements [167] ; remboursements et litiges notifiés [168] | Oui | Mollie Invoicing inclus [163] | Non (à confirmer) | Connect for Marketplaces, `routing` en EUR et GBP [169] | REST JSON, Bearer |
| **Payplug** | Demande traitée en 24 à 48 h ouvrées, réception en environ 3 jours, jusqu'à 7 ou 8 [175] | **Activité immatriculée obligatoire** [173] | **Oui**, URL valable **15 min** [176] | IPN non signée : relecture obligatoire [176] | Oui | ? | Non | Non | REST JSON |
| **SumUp** | Lendemain 7 h sur le compte SumUp ; 1 à 2 jours ouvrés ailleurs [178] | Professionnel (à confirmer) | **Oui**, session expirée après 30 min d'inactivité [180] | `{event_type, id}`, à vérifier par l'API ; signature non documentée [181] | Flux EMV 3DS [182] | ? | Non | Non | REST JSON |
| **PayPal** | Solde PayPal, virement sans frais [183] | Compte Business (à confirmer pour un particulier) | Oui sans SDK : API Orders v2, lien `payer-action` ; 6 h pour rediriger (à confirmer) [185] | Signés (CRC32 + certificat) ou API de vérification ; 25 envois sur 3 jours [184] | Intégré | À confirmer | Non | Non étudié | OAuth2 puis REST |
| **Stancer** | **7 jours de cantonnement**, anticipé à 2 % [188] | Entreprise ; dossier LCB-FT, signature électronique [191] | **Oui** (`payment.stancer.com/payment_intents/…`) [187] | « Synchrones » ; autorisation puis capture, autorisation expirée au bout de 7 jours sans capture [187] | Oui | ? | Non | Non | REST JSON, authentification Basic |
| **Lydia Pro** | Jours ouvrés, 2 à 3 jours en moyenne [192] | Micro-entreprises, associations, TVA non applicable possible [193] | « Pages de paiement sécurisées » [192] ; API non documentée publiquement | ? | ? | ? | Non | Non | ? |
| **Qonto** | Jour ouvré suivant [195] | Client Qonto | Oui : page hébergée par Mollie [196] | Signature à confirmer [196] | Oui | Facturation Qonto | Non | Non | REST JSON |

### 1.3 Ce qu'il faut retenir

- **Stripe** : le plus complet pour une intégration maison (session bornée et expirable [152], [153], webhooks signés et rejoués [150], guide d'exécution des commandes [151], remboursements partiels [149], Wero et wallets sans code). Limites : groupe américain (entité contractante Stripe Payments Europe Ltd en Irlande ; services de paiement de l'EEE fournis par Stripe Technology Europe Ltd, établissement de monnaie électronique agréé en Irlande [302] ; responsable conjoint pour certaines finalités [160], [162]) ; cartes premium à 2,8 % ; litige à 20 €.
- **Mollie** : européen, sans abonnement, tarif CB le plus bas des grands prestataires ; webhook « identifiant seul » sans secret à gérer ; Connect. Wero pas encore ouvert en France ; frais de remboursement et de litige non vérifiés à la source.
- **Payplug** : français, premier paiement Wero en ligne en France [177] ; mais 10 € HT par mois, commissions HT, Wero sur devis et URL de paiement de 15 min.
- **Stancer** : de loin le moins cher, mais 7 jours de cantonnement, flux en deux temps, wallets non documentés. À revoir si le volume augmente.
- **SumUp** : simple, 2,5 % à plat. **PayPal** : cher, utile seulement comme moyen de plus, activé chez le prestataire principal. **Lydia Pro**, **Qonto** : faits pour encaisser une demande ou une facture, pas un panier.

### 1.4 Wero en octobre 2026

- Portefeuille paneuropéen d'EPI ; paiement de compte à compte par virement instantané SEPA validé dans l'application bancaire [164] ; chez Stripe, aboutit d'ordinaire en moins de 10 s, sans litige [156].
- Allemagne fin 2025, Belgique début 2026 ; France : premières transactions en ligne le 20 avril 2026 (Groupe BPCE), ouverture aux clients Banque Populaire et Caisse d'Épargne de mai à l'été 2026 [197] ; disponibilité générale annoncée pour l'automne 2026 [177].
- Par un prestataire : Stripe (la documentation liste les comptes français et les clients en Belgique, France et Allemagne ; Checkout et Payment Links ; 0,29 € ; remboursements jusqu'à 730 jours ; pas de litige [156], [143] ; essai en mode test avant la production, TP12) ; Payplug (sur devis en France ; 0,39 € HT pour iDEAL | Wero aux Pays-Bas [172]) ; Mollie (0,90 % + 0,25 €, second semestre 2026 [164], [165]).
- Avec une page hébergée : moyen activé dans le tableau de bord, **et** liste explicite des moyens passée à chaque session Checkout (`payment_method_types`, P15) ; sinon Checkout montre tout ce qui est activé, moyens différés compris.
- Stripe interdit ou restreint Wero pour certaines catégories (dont « économie des créateurs et entreprises de diffusion en direct ») [156] : vérifier à l'ouverture que la vente de tirages n'en relève pas.

### 1.5 Exemple chiffré et sensibilité

Hypothèses : 20 commandes de 80 € par mois, ni litige ni remboursement, versements hebdomadaires chez Mollie (gratuits).

| Prestataire | Hypothèse | Par commande | Par mois | Par an | Taux effectif |
|---|---|---|---|---|---|
| Stancer | Carte EEE (HT) | 0,71 € | 14,20 € | 170,40 € | 0,89 % |
| Stripe | Wero | 0,29 € | 5,80 € | 69,60 € | 0,36 % |
| Mollie | Carte routée CB | 1,21 € | 24,20 € | 290,40 € | 1,51 % |
| Stripe | Carte EEE courante | 1,45 € | 29,00 € | 348,00 € | 1,81 % |
| Lydia Pro | Carte (HT) | 1,62 € | 32,40 € | 388,80 € | 2,03 % |
| Mollie | Visa ou Mastercard | 1,69 € | 33,80 € | 405,60 € | 2,11 % |
| Qonto | Lien + Basic 9 € HT | 1,37 € | 36,40 € | 436,80 € | 2,28 % |
| Payplug Starter | Carte (HT) + 10 € HT | 1,45 € HT | 39,00 € HT | 468,00 € HT | 2,44 % |
| SumUp | En ligne | 2,00 € | 40,00 € | 480,00 € | 2,50 % |
| PayPal | PayPal EEE | 2,67 € | 53,40 € | 640,80 € | 3,34 % |

Mélange plausible (16 cartes courantes, 2 premium ou professionnelles, 1 hors EEE, 1 Wero si proposé ; sinon, ce client paie par carte courante) :

| Prestataire | Calcul | Par mois |
|---|---|---|
| Stancer (HT, borne basse) | 18 × 0,71 + 2,25 | 15,03 € |
| Mollie (CB) | 16 × 1,21 + 2 × 2,57 + 2,85 + 1,69 | 29,04 € |
| Stripe | 16 × 1,45 + 2 × 2,49 + 2,77 + 0,29 | 31,24 € |
| Payplug (HT ; Wero sur devis, donc une carte de plus) | 17 × 1,45 + 2 × 2,25 + 2,57 + 10 | 41,72 € HT |

| Cas (commande de 80 €) | Stripe | Mollie | Payplug | Stancer (HT) | PayPal |
|---|---|---|---|---|---|
| Carte premium ou professionnelle EEE | 2,49 € | 2,57 € | 2,25 € HT | Interchange + 10 % | 2,67 € |
| Carte hors EEE, en euros | 2,77 € | 2,85 € | 2,57 € HT | 2,25 € | 4,26 € |
| Litige perdu (en plus des 80 € et du tirage) | 20 € (+20 € si contesté, rendus si gagné) | 25 € (à confirmer) | 18 € TTC | Forfait (montant non lu) | 14 € |
| Remboursement | Frais initiaux perdus (1,45 €) | 0,25 € + frais initiaux (à confirmer) | Frais initiaux perdus | ? | Frais initiaux perdus (2,67 €) |

---

## 2. Intégration de Stripe Checkout

### 2.1 Séquence nominale

```
Client (navigateur)         Nicephos (Fastify + SQLite)                      Stripe
      |                               |                                          |
 1    | POST /commande                |                                          |
      | (_csrf, Origin, CGV cochées,  |                                          |
      |  jeton de formulaire)         |                                          |
      |------------------------------>|                                          |
 2    |                               | Transaction SQLite :                     |
      |                               |  - relit prix, stock et port en base     |
      |                               |  - crée la commande « a_payer »          |
      |                               |  - réserve une ligne edition_copies par  |
      |                               |    exemplaire (échéance = maintenant     |
      |                               |    + 35 min ; numéro montré au paiement) |
 3    |                               | POST /v1/checkout/sessions (clé du       |
      |                               |  vendeur de la commande)                 |
      |                               |  Idempotency-Key: commande-<id>-1        |
      |                               |  client_reference_id=<ref>, EUR,         |
      |                               |  payment_method_types = liste explicite, |
      |                               |  expires_at = maintenant + 30 min,       |
      |                               |  locale = fr|en|de, success_url,         |
      |                               |  cancel_url (avec le préfixe de langue)  |
      |                               |----------------------------------------->|
      |                               |<------------- { id: cs_…, url } ---------|
 4    |                               | payments(cs_…, « ouvert ») + order_event |
 5    |<-- 303 Location: https://checkout.stripe.com/c/pay/cs_… ---------------- |
      |   (autorisé par form-action)  |                                          |
 6    |------------------------------------------------------------------------->|
      |      carte / Apple Pay / Wero, 3-D Secure 2 avec la banque               |
 7    |                               |<== POST /paiement/webhook/stripe/<préf.>=|
      |                               |    checkout.session.completed            |
      |                               |    Stripe-Signature: t=…,v1=…            |
 8    |                               | signature vérifiée avec le secret du     |
      |                               |   vendeur de la route (corps brut, 5 min)|
      |                               | INSERT OR IGNORE payment_events          |
      |                               |   (fournisseur, compte, événement) ;     |
      |                               |   déjà traité (processed_at) => 200      |
      |                               | settle(commande) :                       |
      |                               |   - commande du vendeur de la route ?    |
      |                               |   - payment_status = paid ?              |
      |                               |   - montant, devise, ref = commande ?    |
      |                               |   - UPDATE … SET pay_status='payee'      |
      |                               |       WHERE pay_status='a_payer'         |
      |                               |   - exemplaires réservés → « vendu »     |
      |                               |   - order_event ; e-mails dans outbox    |
      |                               | processed_at = maintenant                |
      |                               |-- 200 ---------------------------------->|
 9    |<-- 303 success_url : /commande/<ref>/merci ------------------------------|
      |   (Stripe attend jusqu'à 10 s la réponse au webhook avant de rediriger)  |
10    | GET /commande/<ref>/merci (cookie de session visiteur, Lax)              |
      |------------------------------>|                                          |
      |                               | si encore « a_payer » :                  |
      |                               |   GET /v1/checkout/sessions/cs_…  ------>|
      |                               |   settle(commande)                       |
      |<-- « Merci », ou « confirmation en cours » + lien « Actualiser » --------|
```

| Variante | Déroulé |
|---|---|
| Retour avant le webhook | L'étape 10 règle la commande ; le webhook arrivé ensuite trouve `payee` et ne fait rien. |
| Échec de création de la session (étape 3 : réseau, erreur 4xx ou 5xx) | Dans la même requête : commande `annulee`, exemplaires libérés, message « paiement indisponible, réessayez » ; la minuterie libère aussi, **sans appeler `expire`**, toute commande `a_payer` restée sans session. |
| Session `complete` mais `payment_status = unpaid` (moyen différé activé par erreur) | Pas de `payee` ; réservation prolongée jusqu'à `checkout.session.async_payment_succeeded` ou `async_payment_failed` ; alerte dans « Aujourd'hui ». La minuterie ne tente jamais `expire` sur une session terminée (elle relit d'abord son statut), sinon elle tournerait en boucle. |
| Webhook jamais reçu | La minuterie de rapprochement appelle `getStatus` puis `settle`. |
| Carte refusée | Checkout laisse réessayer sur la même session ; aucun état terminal chez nous. |
| Retour arrière chez Stripe | `cancel_url` mène à `/commande/<ref>/interrompu` : « Reprendre le paiement » (GET `/commande/<ref>/payer`, qui renvoie vers la même session tant qu'elle est ouverte) ou « Annuler la commande » (POST avec CSRF). Ces trois adresses ne répondent qu'à la session visiteur qui a passé la commande (404 sinon) : la référence seule ne donne pas accès au lien de paiement ni à l'e-mail prérempli. |
| Annulation | `expire(cs_…)` ; Stripe répond `expired` : commande `annulee`, stock libéré ; session déjà payée : `settle`. |
| Session arrivée à échéance | `checkout.session.expired` ou rapprochement : `expiree`, stock libéré. |
| Remboursement | Admin → `POST /v1/refunds` (clé = identifiant du remboursement) → `refund.updated`, `charge.refunded` → `remboursee_partiellement` ou `remboursee`. |
| Litige | `charge.dispute.created` → `en_litige` + alerte ; `charge.dispute.closed` → `payee` (gagné) ou `litige_perdu`. |
| Événement d'un vendeur sur la commande de l'autre | `settle` refuse : `anomalie`, alerte (TP13). |

### 2.2 États

**Paiement** (`orders.pay_status`)

| État | Sens | Entrée | Sorties |
|---|---|---|---|
| `a_payer` | Commande créée, stock réservé, session ouverte (ou en attente d'un paiement différé, voir § 2.1) | `POST /commande` | `payee`, `expiree`, `annulee`, `echouee`, `anomalie` |
| `payee` | Paiement confirmé et cohérent | `settle` : session `complete`, `payment_status=paid`, montants égaux | `remboursee_partiellement`, `remboursee`, `en_litige` |
| `echouee` | Paiement différé refusé (seulement si des moyens différés sont activés) | `checkout.session.async_payment_failed` | — |
| `expiree` | Échéance sans paiement | `checkout.session.expired`, rapprochement | `payee` (paiement tardif, S39) |
| `annulee` | Abandon avant paiement | « Annuler » + expiration réussie, ou admin | `payee` (paiement tardif, S39) |
| `anomalie` | Montant, devise ou référence incohérents | `settle` | `payee` (vérification manuelle) ou `remboursee` |
| `remboursee_partiellement` | Une partie rendue | Remboursement réussi, total rendu < payé | `remboursee`, `en_litige` |
| `remboursee` | Tout rendu | Total rendu = payé | — |
| `en_litige` | Contestation ouverte par la banque | `charge.dispute.created` | `payee`, `litige_perdu` |
| `litige_perdu` | Fonds repris | `charge.dispute.closed` (`lost`) | — |

**Préparation** (`orders.ship_status`), qui ne bouge que si le paiement est `payee` : `a_preparer` → `en_preparation` (commandé au laboratoire, reçu, signé) → `expediee` → `livree` → `close` (fin du délai de rétractation) ; `retour_attendu` → `retournee` après une rétractation ; `annulee_avant_envoi` (nom distinct de l'état de paiement `annulee`).

**Fin du délai** : le délai court à partir de la réception [10], [12]. Sans date de livraison confirmée (`shipments.delivered_at` vide), `close` n'arrive qu'à expédition + transit maximal de la zone + 14 jours + 7 jours de marge (C) ; la fonction de rétractation reste ouverte jusque-là (S48, S54 ; test TP17).

**Exemplaire** (`edition_copies.status`) : `libre` → `reserve` → `vendu` → `livre` ; retour intact → `libre` (même numéro) ; retour abîmé → `detruit` et retirage ; échéance de réservation → `libre` ; `garde` pour un numéro conservé par l'auteur.

**Envoi** (`shipments.status`) : `a_commander` → `chez_labo` → `recu` → `signe` → `emballe` → `expedie` → `livre` ; `incident` (perte, avarie) → retirage du même numéro.

Toutes les transitions sont décrites dans une table JavaScript unique (`server/shop.js`), testée ; chacune écrit une ligne d'`order_events`.

Correspondances : **Mollie** `open` → `a_payer`, `paid` → `payee`, `expired`/`canceled`/`failed` → `expiree`/`annulee`/`echouee`, remboursements et litiges lus dans le paiement relu [171] ; **Payplug** : `is_paid` sur l'objet relu [176].

### 2.3 Réserver un exemplaire

1. À la création de la commande, dans **une** transaction `db.transaction()` : pour chaque exemplaire commandé, la ligne `edition_copies` libre de plus petit numéro passe à `reserve` avec `reserved_until = maintenant + 35 min` et `order_item_id` ; rien de libre : refus. `better-sqlite3` est synchrone et l'application tourne en une instance. **Règle unique** (S7, D4 du document principal) : l'exemplaire est réservé à la commande ; son numéro n'est montré au client qu'après le paiement.
2. Session de paiement de 30 min (`expires_at`, minimum de Stripe [152]) ; réservation de 5 min de plus.
3. Libération seulement quand l'échéance est certaine : `expire()` réussi ou statut relu `expired` ; si l'expiration échoue parce que la session est payée, `settle` [153], [161]. Commande sans session (création échouée, § 2.1) : libération directe, sans appel au prestataire.
4. Au passage en `payee`, dans la même transaction, l'exemplaire réservé passe à `vendu` : son numéro (« 7/30 ») est alors affiché et figé ; contrainte d'unicité (œuvre, numéro) ; un exemplaire payé ne change plus de numéro.
5. Anti-accaparement : une commande `a_payer` **par vendeur** et par session visiteur (un panier mixte donne deux commandes, arbitrage 7) ; 10 créations par heure et par adresse ; au plus N exemplaires d'une édition par commande (C).
6. Paiement sur une commande `expiree` ou `annulee` : exemplaire réattribué s'il est libre, sinon un autre numéro, sinon **remboursement intégral automatique**, e-mail, journal.

### 2.4 Webhook

Fastify 5.12.5 permet de remplacer l'analyseur JSON intégré dans un plugin encapsulé (`existingParser`, `node_modules/fastify/lib/content-type-parser.js:105-117`) ; le reste du site garde le JSON analysé.

```js
// Plugin encapsulé : seul ce chemin reçoit le corps brut.
app.register(async scope => {
  scope.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: 256 * 1024 },
    (request, body, done) => done(null, body));
  // Une route par vendeur : le secret de signature et la clé d'API sont choisis par le préfixe, jamais essayés tour à tour.
  scope.post('/paiement/webhook/stripe/:prefixe', async (request, reply) => { /* … */ });
});
```

Vérification de la signature sans SDK (format décrit dans [150]) :

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

// header : « t=1492774577,v1=5257…,v0=… ». Seul le schéma v1 compte (pas de repli vers un schéma plus faible).
export function verifyStripeSignature(rawBody, header, secrets, nowSec = Math.floor(Date.now() / 1000), tolerance = 300) {
  const pairs = String(header || '').split(',').map(kv => kv.split('='));
  const t = Number(pairs.find(([k]) => k === 't')?.[1]);
  const sigs = pairs.filter(([k, v]) => k === 'v1' && /^[0-9a-f]{64}$/.test(v)).map(([, v]) => Buffer.from(v, 'hex'));
  if (!Number.isInteger(t) || Math.abs(nowSec - t) > tolerance || !sigs.length) return false;
  const signed = Buffer.concat([Buffer.from(`${t}.`), rawBody]);
  return secrets.some(secret => {
    const expected = createHmac('sha256', secret).update(signed).digest();
    return sigs.some(sig => timingSafeEqual(sig, expected));
  });
}
```

Traitement :

1. Préfixe inconnu ou signature invalide avec le secret **de ce vendeur** : **400**, une ligne de journal sans le corps.
2. `INSERT OR IGNORE INTO payment_events (provider, account, event_id, type, object_ref, received_at)`, clé d'unicité (fournisseur, compte, événement). Si la ligne existe **et** porte `processed_at`, réponse 200 sans rien faire ; sinon (événement reçu mais jamais traité, par exemple `settle` en erreur au premier envoi), on le traite de nouveau.
3. Événements utiles : `settle(orderId)`, qui vérifie que la commande appartient au vendeur de la route (sinon `anomalie`, alerte), relit l'état **avec la clé de ce vendeur** (ou utilise l'objet signé), puis fait une mise à jour conditionnelle. L'ordre et les doublons n'importent pas [150]. En fin de traitement réussi : `processed_at = maintenant`.
4. Réponse 200 rapide. Les e-mails ne partent pas « au mieux » : ils sont écrits dans la **boîte d'envoi** (`outbox`, § 4.2) dans la même transaction que la transition, puis envoyés et réessayés par une minuterie. Erreur de base ou de `settle` : 500, pour que Stripe réessaie.
5. Événements à cocher : `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `charge.refunded`, `refund.updated`, `refund.failed`, `charge.dispute.created`, `charge.dispute.closed`.
6. Les réessais de Stripe ne durent que 3 jours [150] : un rapprochement quotidien relit aussi les remboursements et les litiges du compte de chaque vendeur (§ 2.5), pour rattraper un événement perdu.

Prestataires sans signature (Mollie classique, Payplug, SumUp) : on ne lit que l'identifiant reçu et on relit l'objet par l'API, en HTTPS avec notre clé [166], [176], [181].

### 2.5 Rapprochement

| Mécanisme | Quand | Effet |
|---|---|---|
| Page de retour | À chaque affichage de `/merci` | `getStatus` + `settle` si encore `a_payer` (délai de 5 s) ; sinon « confirmation en cours », message dans `role="status"` et lien « Actualiser ». **Pas de rafraîchissement automatique** (`<meta http-equiv="refresh">` contraire au RGAA, critère 13.1 [242]) |
| Minuterie | Toutes les 5 min (modèle `setInterval(…).unref()`, `app.js:240-242`) et au démarrage | Commandes `a_payer` de plus de 2 min : `getStatus` + `settle` ; réservations échues : statut relu, puis `expire` si la session est encore ouverte, et libération ; commande sans session : libération directe ; événements reçus sans `processed_at` depuis plus de 5 min : retraités |
| Remboursements et litiges | Une fois par jour | Liste des remboursements et des litiges de la veille chez chaque vendeur (clé restreinte en lecture), comparée aux états des commandes : un événement perdu au-delà des 3 jours de réessais est rattrapé |
| Boîte d'envoi | Toutes les minutes | E-mails non partis réessayés (délai croissant) ; après 24 h d'échec, alerte dans « Aujourd'hui » |
| Rejeux du prestataire | Automatique | Stripe 3 jours [150] ; Mollie 10 fois en environ 26 h [166] ; PayPal 25 fois sur 3 jours [184] |
| Bouton d'admin | À la demande | « Vérifier auprès du prestataire » |
| Versements | Une fois par jour | Paiements, remboursements et frais de la veille comparés aux commandes ; écarts dans « Aujourd'hui » |
| Alerte | Une fois par jour | Commandes réglées par la minuterie sans webhook depuis 24 h : point d'entrée probablement bloqué |

Cloudflare : le Bot Fight Mode « peut défier le trafic d'API » et ne se contourne par aucune règle WAF ni Page Rule [201] ; le vérifier désactivé, sinon compter sur le seul rapprochement. Aucune règle de cache sur `/paiement/` ni `/commande/`.

### 2.6 Remboursements et litiges

- **Admin** : montant proposé = reste à rembourser ; motif obligatoire ; permission `boutique.rembourser` ; journal automatique (`admin.js:150-158`) ; commande désignée par son identifiant interne, jamais par un identifiant du prestataire dans l'URL.
- **Écriture d'abord** : ligne `refunds` en `demande`, puis `POST /v1/refunds` avec `payment_intent`, `amount` en centimes, `Idempotency-Key: remboursement-<id>` [149], [154] ; ensuite `en_cours`, `effectue`, `echoue`.
- **Contrôle** : somme des remboursements ≤ montant payé, vérifiée en base avant l'appel.
- **Échec** (carte clôturée) : « Aujourd'hui » ; rembourser autrement avec l'accord du client [10].
- **Délai légal** : 14 jours après une rétractation, report possible jusqu'au retour du tirage [10] ; date limite affichée. Avoir (F10). Frais du prestataire non rendus au vendeur [149], [183].
- **Montant à rembourser après une rétractation** : « la totalité des sommes versées, y compris les frais de livraison », sauf le supplément d'une livraison plus chère que la livraison standard, choisie expressément par le client (art. L221-24 [10]). Rétractation partielle : prix des lignes rendues ; part des frais de livraison standard à rembourser (aucune, au prorata du prix des lignes, ou totale si l'envoi ne portait que sur elles) : **à confirmer** avec un juriste ; règle par défaut proposée (C) : au prorata du prix des lignes. Le montant proposé dans l'admin suit cette règle (TP8).
- **Litige** : `en_litige`, alerte, préparation suspendue ; preuves (CGV et version, date d'acceptation, adresse, suivi, preuve de remise, échanges) ; contester (20 € de plus chez Stripe, rendus si gagné [142]) seulement avec des preuves solides ; prévention : libellé de relevé qui nomme le vendeur (par exemple « NICEPHOS » suivi du nom du vendeur ; longueur maximale imposée par Stripe à vérifier), confirmation immédiate.

### 2.7 CSP, cookies, en-têtes, secrets

- `form-action` : origine de la page hébergée ajoutée à la liste de `csp()` (`app.js:261`) ; rien d'autre [255].
- Cookie de session visiteur en `SameSite=Lax`, envoyé au retour de Stripe (navigation GET de premier niveau) ; `Strict` ferait perdre la session sur `/merci`.
- `Referrer-Policy: strict-origin-when-cross-origin` : seule l'origine part vers Stripe.
- Pages de commande et de retour : `Cache-Control: no-store`, `noindex` ; `Disallow` de `/commande` et `/paiement/` (et formes `/en`, `/de`).
- Webhook : ni CSRF ni `Origin` (appel de serveur à serveur), pas de `stats.hit`, pas de redirection de langue.

| Variable | Contenu | Contrôles dans `config.js` |
|---|---|---|
| `PAYMENT_PROVIDER` | `stripe`, `mollie` ou vide (boutique sans paiement) | Valeur connue |
| `STRIPE_SECRET_KEY_<préfixe>` | Clé **restreinte** (`rk_…`) par vendeur : sessions Checkout, PaymentIntents en lecture, remboursements, événements et soldes en lecture | Clé `*_live_*` refusée hors production ; clé `*_test_*` refusée en production sauf `PAYMENT_TEST_MODE=1` |
| `STRIPE_WEBHOOK_SECRET_<préfixe>` | `whsec_…`, plusieurs valeurs séparées par des virgules | Ancien secret actif jusqu'à 24 h lors d'une rotation [150] |
| `STRIPE_API_VERSION` | Version figée, en-tête `Stripe-Version` | Format daté |

**Un point d'entrée de webhook par vendeur** (`/paiement/webhook/stripe/<préfixe>`), déclaré dans le tableau de bord du compte Stripe de ce vendeur (I). Le secret est choisi par la route ; `settle()` relit avec la clé du vendeur de la commande ; un événement signé par A ne peut régler qu'une commande de A (sinon `anomalie`). L'adresse unique qui essaie les secrets des deux est écartée : rien n'y lierait l'événement au bon vendeur. Les secrets ne vont jamais dans la base, les journaux ni les erreurs ; une erreur d'appel n'affiche pas l'en-tête `Authorization`.

### 2.8 Journal et données personnelles

- Journal : identifiants seulement (`cs_…`, `pi_…`, `evt_…`) ; jamais le corps d'un webhook, la signature, l'e-mail ni l'adresse.
- Données envoyées : `client_reference_id` et `metadata[order]` = référence aléatoire ; e-mail prérempli au choix (`customer_email`) ; adresse de livraison saisie chez nous, scellée, non transmise.
- Aucune donnée de carte ; seul le type de moyen (`card`, `wero`…) est gardé [54].
- `/confidentialite` et registre : traitement « commande et paiement », prestataire destinataire (responsable conjoint pour certaines finalités chez Stripe [160]), durées, cookie de panier.

### 2.9 Tests du paiement

`node:test`, sans dépendance, faux services injectés.

| Id | Test |
|---|---|
| TP1 | Faux prestataire local, modèle `test/oidc-provider.js` : crée des sessions, sert `GET` et `expire`, signe ses webhooks au format Stripe. |
| TP2 | Signature invalide, horodatage hors tolérance, schéma `v0` seul : 400, aucun changement. |
| TP3 | Même événement deux fois, ou deux événements dans le désordre : une transition, un e-mail. Échec forcé de `settle` au premier envoi puis réessai du même événement : traité (pas de « déjà vu »), `processed_at` posé. |
| TP4 | Webhook et page de retour simultanés : un seul passage de l'exemplaire à « vendu », un seul e-mail dans la boîte d'envoi. |
| TP5 | Montant ou devise différents : `anomalie`, pas de `payee`. |
| TP6 | Dernier exemplaire refusé à une seconde commande, puis libéré après expiration ; paiement tardif après libération : remboursement automatique. |
| TP7 | Rapprochement sans webhook : la minuterie règle la commande. |
| TP8 | Remboursement partiel puis total ; refus au-delà du reste ; clé d'idempotence réutilisée après un délai dépassé. Rétractation totale : montant proposé = prix + frais de livraison standard (sans le supplément d'une livraison plus chère) ; rétractation partielle : règle du § 2.6. |
| TP9 | Litige ouvert puis gagné, ouvert puis perdu. |
| TP10 | En-têtes : `form-action` contient l'origine du prestataire et rien d'autre de tiers ; `no-store` et `noindex` sur les pages de commande ; webhook absent des statistiques. |
| TP11 | Clé `live` refusée hors production ; aucun secret dans les journaux pino capturés. |
| TP12 | Recette manuelle en mode test avant la production : carte de test, carte qui demande 3DS, refus, Wero si proposé (vérifier que `payment_status` vaut `paid` dès `checkout.session.completed`), remboursement (cartes de test : https://docs.stripe.com/testing). Stripe ne peut pas joindre le serveur de test du réseau local : webhooks relayés par `stripe listen --forward-to <serveur de test>/paiement/webhook/stripe/<préfixe>` (CLI Stripe), ou recette limitée au rapprochement (minuterie et page de retour). |
| TP13 | Événement signé avec le secret du vendeur A sur une commande du vendeur B : `anomalie`, aucune transition ; préfixe inconnu : 400. |
| TP14 | Session `complete` avec `payment_status = unpaid` : pas de `payee`, réservation prolongée, alerte ; la minuterie n'appelle pas `expire`. |
| TP15 | Création de session refusée par le faux prestataire : commande `annulee`, exemplaires libérés dans la même requête. |
| TP16 | Boîte d'envoi : SMTP en panne au paiement, puis rétabli : la confirmation part une fois ; arrêt du serveur juste après la réponse 200 au webhook : la confirmation part au redémarrage. |
| TP17 | Sans date de livraison confirmée, `close` et la fonction de rétractation suivent la règle du § 2.2 (horloge injectée). |
| TP18 | Rapprochement quotidien : remboursement et litige créés chez le faux prestataire sans webhook : rattrapés. |

### 2.10 Exploitation

- Horloge du serveur synchronisée par NTP, sinon la tolérance de 5 min rejette les webhooks [150].
- Attestation SAQ A chaque année, documents dans le tableau de bord du prestataire [155] ; argument d'éligibilité (« pas de scripts exploitables » [198]) écrit dans `docs/wiki/Sécurité.md`.
- Moyens activés un par un : cartes, Apple Pay, Google Pay, puis Wero ; la liste passée à Checkout (`payment_method_types`) suit le réglage de la boutique, jamais le seul tableau de bord.
- Un point d'entrée de webhook par vendeur, déclaré dans le compte Stripe de ce vendeur ; relais SMTP sous contrat de sous-traitance, avec SPF, DKIM et DMARC, avant l'ouverture (la confirmation de commande et l'accusé de rétractation sont obligatoires [3], [7]).

---

## 3. Outils de facturation

### 3.1 Voie 1 : factures produites par le site (recommandée)

| Point | Détail |
|---|---|
| PDF | **pdfkit** 0.20.2, MIT, publiée le 30/08/2026 : PDF/A-3b et PDF/A-3a (balisé), fichiers incorporés avec la relation `Alternative`, XMP (`appendXML`), PDF balisé et PDF/UA ; dépendances légères (`fontkit`, `linebreak`, `png-js`, `fflate`, `@noble/*`) [212]. Le PDF/A exige des polices TrueType incorporées : le dépôt en a (`assets/fonts/Filigrane-*.ttf` : Jost, Cormorant Garamond, IBM Plex Mono, `watermark.js:9-11`), sous licence SIL OFL 1.1 (`assets/fonts/LICENSE-*.txt`), qui permet l'incorporation dans un document : **réglé**. Ce sont des graisses fixes, réduites au sous-ensemble latin (`assets/fonts/README.md`) : reste à tester leur incorporation dans un PDF/A produit par pdfkit et les noms de clients hors de ce sous-ensemble. Contrôle avec veraPDF. |
| Factur-X (2027, ventes aux professionnels) | (a) XML CII EN 16931 écrit par gabarit, sans dépendance, attaché par `doc.file(…, { relationship: 'Alternative' })`, avec le schéma XMP de Factur-X ; ou (b) JSON EN 16931 envoyé à une plateforme qui produit le Factur-X (SUPER PDP le fait [203]). Bibliothèques plus lourdes : `@stafyniaksacha/facturx` 0.6.1 (MIT, saxon-js et libxml2-wasm), `@e-invoice-eu/core` 3.4.1 (WTFPL), `node-zugferd` (bêta) [213]. Profil BASIC WL toléré seulement au démarrage selon SUPER PDP (à confirmer) [203]. |
| Numérotation, intégrité | En base : déclencheurs de figeage, chaînage d'empreintes, horodatage RFC 3161 par une file propre à `server/invoices.js` qui réutilise `requestTimestamp` (`timestamp.js:118`) ; la file de `proofs.js` ne traite que des photos (`timestamps.photo_id` renvoie à `photos`, `proofs.js:21-41`). Jeton dans `invoice_files` (`tsr`), état dans `invoice_events` |
| Envoi | `mailer.send` étendu aux pièces jointes (SO7) |
| Coût | 0 € |
| Limites | N'émet pas lui-même vers les professionnels, ne fait pas l'e-reporting, ne tient pas une comptabilité au réel |

### 3.2 Voie 2 : outils externes

État au 15/10/2026 ; statut d'après la liste DGFiP du 13/10/2026 [101] ; prix d'après les pages des éditeurs.

| Outil | Plateforme agréée (immatriculation) | Offre gratuite | API | Remarques | Source |
|---|---|---|---|---|---|
| **SUPER PDP** | Oui (22/12/2025) | Compte web jusqu'à 1 000 factures par mois | **Oui** : REST, OpenAPI, webhooks, environnement de test ; JSON, Factur-X, CII, UBL ; e-reporting des transactions et des paiements ; 0,01 € HT par facture (dégressif), minimum 10 € HT par an ; en e-reporting, une journée = une facture | Pensée pour les développeurs ; données en France (selon l'éditeur) | [203] |
| **Dougs** | Oui (12/12/2025) | Oui, sans limite annoncée ; e-reporting des ventes aux particuliers annoncé | Non mentionnée | Simple | [204] |
| **Indy** | Oui (09/01/2026) | « Essentiel » gratuit, facturation électronique incluse | Non mentionnée | Comptabilité dès 9 € HT par mois | [206] |
| **Tiime** | Oui, « TIIME PDP » (18/12/2025) | Offre à 0 € | Pas d'API publique (Stripe, GoCardless, Make) | Payant dès 9,99 € HT par mois | [207] |
| **Abby** | Oui (29/01/2026) | « Basique » gratuit | Documentation publique, périmètre à vérifier | Déclaration URSSAF dès « Start » | [205] |
| Pennylane | Oui (11/12/2025) | Non : 7 à 79 € HT par mois, 1 200 factures par an au plus | Dès « Essentiel » (24 € HT par mois) | Pour une société avec expert-comptable | [208] |
| Axonaut | Oui (08/01/2026) | Non : dès 38 € par mois | API publique | Trop large ici | [209] |
| Qonto | Oui (18/12/2025) | Non : banque dès 9 € HT par mois | Oui | Si le compte dédié y est | [194] |
| Henrri | **Non** : passe par des plateformes partenaires | Oui | Non détaillée | E-reporting des particuliers non mentionné | [210] |
| Freebe | **Absent de la liste** | Non : 12,50 € par mois | Non mentionnée | Conformité annoncée sans plateforme nommée | [211] |

### 3.3 Voie 3 : facture du prestataire de paiement

Stripe Invoicing : 0,4 % par facture payée (Starter) ou 0,5 % (Plus), en plus des frais de paiement [145]. Stripe n'est pas une plateforme agréée [101] ; ses pages ne parlent ni de Factur-X ni de la réforme française ; numérotation, mentions françaises (franchise, SIREN, exemplaire n/30) et conservation de 10 ans hors de Stripe : à vérifier. Coût indicatif pour 100 commandes de 150 € : environ 60 € par an, contre 0 € pour la voie 1. **Écartée.**

### 3.4 Recommandation par scénario

| Scénario | Factures aux particuliers | Réception (obligatoire) | E-reporting (1/9/2027) | Factures aux professionnels (1/9/2027) |
|---|---|---|---|---|
| Chacun vend, en franchise | Voie 1 | Compte gratuit chez une plateforme agréée, un par vendeur | Export bimestriel du site (F17), saisi sur la plateforme ; avec du volume, API de SUPER PDP (environ 10 € HT par an) | V1 : pas de commande professionnelle en ligne, facture saisie sur la plateforme ; V2 : Factur-X par le site et API |
| Association | Voie 1 | Idem | Selon que les ventes sont exonérées ou non [98] | Idem |
| Société | Voie 1, ou l'outil du cabinet | Outil du cabinet | Par cet outil, alimenté par l'API du site ou un export | Idem |

### 3.5 E-reporting : ce qui est transmis

| Élément | Règle | Source |
|---|---|---|
| Opérations | Ventes à des non-assujettis : livraisons en France, ventes à distance intracommunautaires, prestations situées en France ; certaines ventes à des professionnels étrangers | [109] § 50-100 ; [99] |
| Exclusions | Opérations exonérées et dispensées de facture ; opérations des assujettis **non établis** en France qui utilisent le guichet unique. Un vendeur établi en France transmet aussi les livraisons expédiées de France vers un autre État membre, **y compris celles déclarées par OSS** | [109] § 20, § 90 |
| Granularité | Données « globalisées par jour », sans détail des lignes | [110] § 50 |
| Données | SIREN, période, option sur les débits, catégorie (livraisons, prestations, hors France, régimes particuliers), base HT par taux et TVA, TVA totale due en France, devise, date | [110] § 60 |
| Données personnelles | Aucune | [102] |
| Fréquence | Franchise : tous les bimestres civils (janvier-février, mars-avril…), du 25 à la fin du mois suivant ; première période : septembre-octobre 2027, transmise du 25 au 30 novembre 2027 ; régime simplifié : chaque mois ; réel normal mensuel : trois fois par mois ; réel trimestriel : chaque mois | [111] § 50-100 |
| Paiements | Prestations de services seulement : date d'encaissement, montant par taux ; franchise comprise, tous les deux mois | [112] § 1, 50-60, 180 |
| Canal | Plateforme agréée, XML structuré | [111] |

---

## 4. Modèle de données

Conventions du dépôt : dates en millisecondes epoch, montants en centimes entiers, traductions `_en` et `_de`, JSON dans des `TEXT`, états validés en JavaScript sans `CHECK`, commentaire de tête en français. Numéros de migration indicatifs (document principal, § 7.3).

### 4.1 `045_boutique.sql` : vendeurs, catalogue, éditions, panier, expédition

```sql
-- Boutique : vendeurs (un par photographe), catalogue (papiers, formats, œuvres, déclinaisons), éditions limitées
-- (au plus 30 exemplaires par photo, tous formats confondus, EA comprises : contrôlé dans le code), panier des
-- visiteurs, zones et tarifs d'envoi, versions des CGV. Une photo qui a des ventes ne se supprime pas (RESTRICT).

CREATE TABLE sellers (                       -- vendeurs : émetteurs des factures
  id             INTEGER PRIMARY KEY,
  author_id      INTEGER UNIQUE REFERENCES authors(id) ON DELETE RESTRICT,   -- NULL pour une structure commune
  legal_name     TEXT NOT NULL,
  siren          TEXT NOT NULL DEFAULT '',
  siret          TEXT NOT NULL DEFAULT '',
  address        TEXT NOT NULL DEFAULT '',      -- lignes séparées par \n (information publique des mentions légales)
  email          TEXT NOT NULL DEFAULT '',
  phone          TEXT NOT NULL DEFAULT '',
  vat_regime     TEXT NOT NULL DEFAULT 'franchise',  -- franchise | simplifie | normal
  vat_since      INTEGER,                       -- date d'effet du régime (F26)
  vat_number     TEXT NOT NULL DEFAULT '',
  mentions       TEXT NOT NULL DEFAULT '[]',    -- [{texte, depuis}] : mention de franchise datée (CGI puis CIBS)
  social_regime  TEXT NOT NULL DEFAULT '',      -- artiste_auteur | micro_bic | association | societe
  mediator       TEXT NOT NULL DEFAULT '{}',    -- {nom, site, adresse}
  rep_idu        TEXT NOT NULL DEFAULT '',      -- identifiant unique de l'éco-organisme
  manufacturer   TEXT NOT NULL DEFAULT '{}',    -- informations GPSR du fabricant
  prefix         TEXT NOT NULL UNIQUE,          -- 'S', 'J' (authors.card_prefix par défaut)
  platform       TEXT NOT NULL DEFAULT '',      -- plateforme agréée de réception (information)
  payment_key    TEXT NOT NULL DEFAULT '',      -- suffixe des variables d'environnement (jamais la clé elle-même)
  active         INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE shop_papers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL, name_en TEXT NOT NULL DEFAULT '', name_de TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '', description_en TEXT NOT NULL DEFAULT '', description_de TEXT NOT NULL DEFAULT '',
  finish TEXT NOT NULL DEFAULT '', gsm INTEGER, active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE shop_formats (                  -- gabarits réutilisés d'une photo à l'autre
  id INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  paper_id INTEGER NOT NULL REFERENCES shop_papers(id) ON DELETE RESTRICT,
  sheet_w_mm INTEGER NOT NULL, sheet_h_mm INTEGER NOT NULL,
  image_long_mm INTEGER NOT NULL, margin_mm INTEGER NOT NULL DEFAULT 0,
  min_ppi INTEGER NOT NULL,                     -- résolution minimale, à régler avec le laboratoire
  lab TEXT NOT NULL DEFAULT '', lab_ref TEXT NOT NULL DEFAULT '',
  cost_cents INTEGER NOT NULL DEFAULT 0,        -- prix d'achat, admin seulement
  weight_g INTEGER NOT NULL DEFAULT 0,          -- emballé
  ship_class TEXT NOT NULL,                     -- plat_s | plat_l | tube | caisse
  lead_days_min INTEGER NOT NULL DEFAULT 0, lead_days_max INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE shop_products (                 -- une œuvre en vente
  id INTEGER PRIMARY KEY,
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE RESTRICT,
  seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'edition',         -- edition ; plus tard ouvert | carte | fichier | bon
  intro TEXT NOT NULL DEFAULT '', intro_en TEXT NOT NULL DEFAULT '', intro_de TEXT NOT NULL DEFAULT '',
  edition_size INTEGER,                         -- ≤ 30, EA comprises
  ea_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'brouillon',     -- brouillon | en_vente | suspendu | epuise | retire
  proof_ok_at INTEGER,                          -- épreuve de contrôle validée (S18)
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX shop_products_edition ON shop_products (photo_id) WHERE kind = 'edition';  -- une édition par photo

CREATE TABLE shop_variants (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES shop_products(id) ON DELETE RESTRICT,
  format_id INTEGER NOT NULL REFERENCES shop_formats(id) ON DELETE RESTRICT,
  price_cents INTEGER NOT NULL,                 -- TTC
  tax_class TEXT NOT NULL,                      -- oeuvre_originale | reproduction | fichier | objet
  cap INTEGER,                                  -- plafond propre au format ; NULL : plafond global
  active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE shop_price_history (            -- règle des 30 jours en cas de promotion
  variant_id INTEGER NOT NULL REFERENCES shop_variants(id) ON DELETE RESTRICT,
  price_cents INTEGER NOT NULL, from_at INTEGER NOT NULL,
  PRIMARY KEY (variant_id, from_at)
);

CREATE TABLE edition_copies (                -- un exemplaire par numéro, créé à l'ouverture de l'édition
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES shop_products(id) ON DELETE RESTRICT,
  number INTEGER NOT NULL,
  is_ea INTEGER NOT NULL DEFAULT 0,
  variant_id INTEGER REFERENCES shop_variants(id) ON DELETE RESTRICT,   -- fixé à la réservation (commande)
  status TEXT NOT NULL DEFAULT 'libre',         -- libre | reserve | vendu | livre | retourne | detruit | garde
  channel TEXT NOT NULL DEFAULT 'site',         -- site | exposition | autre : les ventes hors site comptent
  order_item_id INTEGER,                        -- order_items.id (table de la migration suivante)
  reserved_until INTEGER,
  signed_at INTEGER,
  invoice_number TEXT NOT NULL DEFAULT '',      -- vente hors site : pièce correspondante
  note TEXT NOT NULL DEFAULT '',
  UNIQUE (product_id, is_ea, number)
);
CREATE TABLE edition_events (                -- réservé, vendu, signé, expédié, retourné, détruit, retiré, retirage
  id INTEGER PRIMARY KEY,
  copy_id INTEGER NOT NULL REFERENCES edition_copies(id) ON DELETE RESTRICT,
  at INTEGER NOT NULL, type TEXT NOT NULL, actor TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE carts (                         -- panier d'une session visiteur (cookie posé au premier ajout) ; visitor_sessions.id
                                             -- est un identifiant interne stable : la rotation du jeton et « Quitter la galerie »
                                             -- ne suppriment pas la session, donc pas le panier (annexe galeries, § 3.4)
  id INTEGER PRIMARY KEY,
  visitor_session_id TEXT NOT NULL UNIQUE REFERENCES visitor_sessions(id) ON DELETE CASCADE,
  country TEXT NOT NULL DEFAULT 'FR',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE cart_items (
  cart_id INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL REFERENCES shop_variants(id) ON DELETE CASCADE,
  qty INTEGER NOT NULL,
  price_seen_cents INTEGER NOT NULL,            -- pour signaler un changement de prix
  added_at INTEGER NOT NULL,
  PRIMARY KEY (cart_id, variant_id)
);

CREATE TABLE shipping_zones (
  id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE,
  countries TEXT NOT NULL,                      -- JSON, codes ISO
  label TEXT NOT NULL, label_en TEXT NOT NULL DEFAULT '', label_de TEXT NOT NULL DEFAULT '',
  incoterm TEXT NOT NULL DEFAULT 'DAP',
  customs_note TEXT NOT NULL DEFAULT '', customs_note_en TEXT NOT NULL DEFAULT '', customs_note_de TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE shipping_rates (                -- port = premier article de la plus grande classe + supplément par article
  zone_id INTEGER NOT NULL REFERENCES shipping_zones(id) ON DELETE CASCADE,
  ship_class TEXT NOT NULL,
  first_cents INTEGER NOT NULL, extra_cents INTEGER NOT NULL DEFAULT 0, free_from_cents INTEGER,
  transit_days_min INTEGER NOT NULL, transit_days_max INTEGER NOT NULL,
  carrier TEXT NOT NULL DEFAULT '', insured_up_to_cents INTEGER,
  PRIMARY KEY (zone_id, ship_class)
);

CREATE TABLE terms_versions (                -- textes des CGV acceptés (preuve de la version)
  id INTEGER PRIMARY KEY, lang TEXT NOT NULL, sha256 TEXT NOT NULL, body TEXT NOT NULL, published_at INTEGER NOT NULL,
  UNIQUE (lang, sha256)
);
```

### 4.2 `046_commandes.sql` : commandes, paiements, rétractations, production, envois

```sql
-- Commandes : un vendeur par commande ; coordonnées scellées (vault) ; lignes figées ; paiement et préparation séparés ;
-- historique en ajout seul, chaîné par empreintes. Aucune donnée de carte : seuls les identifiants du prestataire.

CREATE TABLE orders (
  id                 INTEGER PRIMARY KEY,
  ref                TEXT NOT NULL UNIQUE,      -- 'C-' + 11 caractères de CODE_CHARS (≈ 54 bits ; 10 n'en donnent que 49,5) ;
                                                -- ne donne aucun accès à elle seule
  seller_id          INTEGER NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
  visitor_session_id TEXT,                      -- session qui a commandé : seule à ouvrir /merci, /payer, /interrompu,
                                                -- /annuler ; sans clé étrangère
  pay_status         TEXT NOT NULL DEFAULT 'a_payer',
  ship_status        TEXT NOT NULL DEFAULT 'a_preparer',  -- … | annulee_avant_envoi (§ 2.2)
  lang               TEXT NOT NULL DEFAULT 'fr',
  email              TEXT NOT NULL,             -- scellé
  email_idx          TEXT NOT NULL,             -- vault.index
  name               TEXT NOT NULL,             -- scellé
  phone              TEXT,                      -- scellé
  ship_address       TEXT NOT NULL,             -- JSON scellé
  bill_address       TEXT,                      -- JSON scellé ou NULL
  ship_country       TEXT NOT NULL,             -- ISO, en clair (zones, statistiques)
  zone_id            INTEGER REFERENCES shipping_zones(id) ON DELETE RESTRICT,
  subtotal_cents     INTEGER NOT NULL,
  shipping_cents     INTEGER NOT NULL,
  discount_cents     INTEGER NOT NULL DEFAULT 0,
  total_cents        INTEGER NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'EUR',
  terms_version_id   INTEGER NOT NULL REFERENCES terms_versions(id) ON DELETE RESTRICT,
  terms_accepted_at  INTEGER NOT NULL,
  form_nonce         TEXT NOT NULL UNIQUE,      -- idempotence du formulaire (S31)
  track_hash         TEXT UNIQUE,               -- empreinte du jeton de suivi (S54)
  track_expires_at   INTEGER,
  promised_from      TEXT, promised_to TEXT,    -- AAAA-MM-JJ
  created_at         INTEGER NOT NULL,
  paid_at            INTEGER,
  expires_at         INTEGER,
  personal_purged_at INTEGER                    -- données personnelles effacées (S64) : commande non payée après 30 jours ;
                                                -- commande payée 3 ans après la livraison (C) ; les factures gardent l'identité
);
CREATE INDEX orders_status ON orders (pay_status, ship_status);
CREATE INDEX orders_email ON orders (email_idx);

CREATE TABLE order_items (                   -- une ligne par exemplaire ; copie figée de tout ce qui a été vendu
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  product_id INTEGER REFERENCES shop_products(id) ON DELETE RESTRICT,
  variant_id INTEGER REFERENCES shop_variants(id) ON DELETE RESTRICT,
  photo_ref INTEGER,                            -- rappel sans clé étrangère
  kind TEXT NOT NULL, title TEXT NOT NULL, author TEXT NOT NULL,
  format TEXT NOT NULL, paper TEXT NOT NULL, copy_label TEXT NOT NULL DEFAULT '',   -- « 7/30 »
  unit_cents INTEGER NOT NULL, qty INTEGER NOT NULL DEFAULT 1, line_cents INTEGER NOT NULL,
  tax_class TEXT NOT NULL,
  copy_id INTEGER REFERENCES edition_copies(id) ON DELETE RESTRICT
);

CREATE TABLE order_events (                  -- historique, en ajout seul, chaîné (F25)
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  at INTEGER NOT NULL, type TEXT NOT NULL,
  actor TEXT NOT NULL,                          -- compte, client, prestataire, labo, systeme
  data TEXT NOT NULL DEFAULT '{}',              -- sans donnée personnelle en clair
  prev_hash TEXT NOT NULL, hash TEXT NOT NULL
);
CREATE INDEX order_events_order ON order_events (order_id, at);
CREATE TRIGGER order_events_figes   BEFORE UPDATE ON order_events BEGIN SELECT RAISE(ABORT, 'historique : ajout seul'); END;
CREATE TRIGGER order_events_gardes  BEFORE DELETE ON order_events BEGIN SELECT RAISE(ABORT, 'historique : ajout seul'); END;

CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL,
  session_ref TEXT NOT NULL,                    -- cs_…
  payment_ref TEXT,                             -- pi_…
  status TEXT NOT NULL,                         -- ouvert | paye | expire | annule | echoue
  amount_cents INTEGER NOT NULL, currency TEXT NOT NULL,
  method TEXT,                                  -- card | wero | … (aucune donnée de carte)
  expires_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE (provider, session_ref)
);
CREATE TABLE payment_events (                -- idempotence des webhooks ; un événement non traité est retraité
  provider TEXT NOT NULL,
  account TEXT NOT NULL,                        -- préfixe du vendeur (route du webhook)
  event_id TEXT NOT NULL, type TEXT NOT NULL, object_ref TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  processed_at INTEGER,                         -- NULL : reçu mais pas encore traité avec succès
  PRIMARY KEY (provider, account, event_id)
);
CREATE TABLE outbox (                        -- boîte d'envoi : e-mails obligatoires (confirmation, accusé de rétractation…)
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL,                           -- confirmation | expedition | retractation | remboursement | …
  lang TEXT NOT NULL, attachments TEXT NOT NULL DEFAULT '[]',
  attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, sent_at INTEGER, last_error TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE (order_id, kind)                       -- une confirmation par commande ; autres types : suffixe dans kind
);
CREATE TABLE refunds (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL, reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'demande',       -- demande | en_cours | effectue | echoue
  provider_ref TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

CREATE TABLE withdrawals (                   -- rétractations (fonction en ligne, e-mail, courrier)
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  declared_at INTEGER NOT NULL,
  channel TEXT NOT NULL,                        -- fonction_en_ligne | email | courrier
  items TEXT NOT NULL,                          -- JSON des lignes concernées
  ack_sent_at INTEGER,
  return_received_at INTEGER, return_state TEXT
);

CREATE TABLE lab_orders (
  id INTEGER PRIMARY KEY, lab TEXT NOT NULL, external_ref TEXT NOT NULL DEFAULT '',
  ship_to TEXT NOT NULL DEFAULT 'auteur',       -- auteur | client
  status TEXT NOT NULL, cost_cents INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE lab_order_items (
  lab_order_id INTEGER NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  master_file TEXT NOT NULL DEFAULT '',         -- fichier maître hors de variants/
  master_expires_at INTEGER,
  PRIMARY KEY (lab_order_id, order_item_id)
);

CREATE TABLE shipments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  status TEXT NOT NULL,
  carrier TEXT NOT NULL DEFAULT '', service TEXT NOT NULL DEFAULT '',
  tracking_number TEXT NOT NULL DEFAULT '', tracking_url TEXT NOT NULL DEFAULT '',
  insured_cents INTEGER, signature INTEGER NOT NULL DEFAULT 0, cost_cents INTEGER,
  packed_at INTEGER, shipped_at INTEGER, delivered_at INTEGER, incident TEXT NOT NULL DEFAULT ''
);
CREATE TABLE shipment_items (
  shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  PRIMARY KEY (shipment_id, order_item_id)
);
```

### 4.3 `047_factures.sql` : factures, avoirs, registres, e-reporting

```sql
-- Factures, avoirs et registres de la boutique. Une facture émise ne change plus jamais : des déclencheurs refusent
-- toute modification ou suppression ; les corrections passent par un avoir. Conservation : 10 ans au moins (code de
-- commerce, L123-22). Jamais touché par la purge quotidienne. Les vendeurs sont dans 045 (sellers).

CREATE TABLE invoice_series (                -- une ligne par vendeur et par année
  seller_id   INTEGER NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
  year        INTEGER NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  last_hash   TEXT NOT NULL DEFAULT '',        -- tête de chaîne (reprise de l'année précédente)
  PRIMARY KEY (seller_id, year)
);

CREATE TABLE invoices (
  id          INTEGER PRIMARY KEY,
  seller_id   INTEGER NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
  year        INTEGER NOT NULL,
  seq         INTEGER NOT NULL,
  number      TEXT NOT NULL UNIQUE,            -- 'S-2027-0001'
  kind        TEXT NOT NULL,                   -- facture | avoir
  credits_id  INTEGER REFERENCES invoices(id) ON DELETE RESTRICT,   -- avoir → facture d'origine
  order_id    INTEGER REFERENCES orders(id) ON DELETE RESTRICT,   -- NULL : facture hors site (exposition, licence)
  shipment_id INTEGER REFERENCES shipments(id) ON DELETE RESTRICT, -- une facture par envoi (F2)
  issued_at   INTEGER NOT NULL,
  supply_date TEXT NOT NULL,                   -- AAAA-MM-JJ (Paris) : expédition ou mise à disposition
  category    TEXT NOT NULL,                   -- biens | services | mixte
  seller_json TEXT NOT NULL,                   -- instantané du vendeur
  buyer_json  TEXT NOT NULL,                   -- instantané du client (scellé) : nom, adresse, SIREN, TVA
  ship_json   TEXT NOT NULL DEFAULT '',        -- adresse de livraison si différente (scellée)
  lang        TEXT NOT NULL DEFAULT 'fr',
  currency    TEXT NOT NULL DEFAULT 'EUR',
  total_ht    INTEGER NOT NULL,                -- centimes ; négatifs pour un avoir
  total_vat   INTEGER NOT NULL,
  total_ttc   INTEGER NOT NULL,
  vat_json    TEXT NOT NULL,                   -- [{rate_bp, base, vat}] ; [] en franchise
  mentions    TEXT NOT NULL,                   -- textes exacts imprimés
  payment     TEXT NOT NULL DEFAULT '',        -- {date, moyen, référence prestataire}
  reason      TEXT NOT NULL DEFAULT '',        -- motif de l'avoir
  prev_hash   TEXT NOT NULL,
  hash        TEXT NOT NULL,
  UNIQUE (seller_id, year, seq)
);

CREATE TABLE invoice_lines (
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  pos        INTEGER NOT NULL,
  kind       TEXT NOT NULL,                    -- bien | service | port
  label      TEXT NOT NULL,                    -- dénomination précise, figée
  detail     TEXT NOT NULL DEFAULT '',         -- format, papier, « exemplaire 3/30 », licence…
  photo_ref  INTEGER,                          -- rappel SANS clé étrangère (une action SET NULL toucherait une ligne figée)
  qty        INTEGER NOT NULL,
  unit_ht    INTEGER NOT NULL,
  rate_bp    INTEGER NOT NULL,                 -- 0, 550, 2000…
  exemption  TEXT NOT NULL DEFAULT '',
  total_ht   INTEGER NOT NULL,
  PRIMARY KEY (invoice_id, pos)
);

CREATE TABLE invoice_files (                 -- PDF, Factur-X, jeton d'horodatage : on ajoute, on ne change pas
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  kind       TEXT NOT NULL,                    -- pdf | facturx | tsr
  path       TEXT NOT NULL,                    -- dossier plat storage/invoices/<numéro>.<ext> : la sauvegarde ne copie
                                               -- que le premier niveau d'un dossier (server/db/backup.js:30-60)
  sha256     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (invoice_id, kind)
);

CREATE TABLE invoice_events (                -- envoi, téléchargement, horodatage, transmission
  id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  at INTEGER NOT NULL, type TEXT NOT NULL, detail TEXT NOT NULL DEFAULT ''
);

CREATE TRIGGER invoices_figees  BEFORE UPDATE ON invoices      BEGIN SELECT RAISE(ABORT, 'facture émise : modification interdite'); END;
CREATE TRIGGER invoices_gardees BEFORE DELETE ON invoices      BEGIN SELECT RAISE(ABORT, 'facture émise : suppression interdite'); END;
CREATE TRIGGER lines_figees     BEFORE UPDATE ON invoice_lines BEGIN SELECT RAISE(ABORT, 'ligne de facture figée'); END;
CREATE TRIGGER lines_gardees    BEFORE DELETE ON invoice_lines BEGIN SELECT RAISE(ABORT, 'ligne de facture figée'); END;
CREATE TRIGGER files_figes      BEFORE UPDATE ON invoice_files BEGIN SELECT RAISE(ABORT, 'fichier de facture figé'); END;
CREATE TRIGGER files_gardes     BEFORE DELETE ON invoice_files BEGIN SELECT RAISE(ABORT, 'fichier de facture figé'); END;

CREATE TABLE receipts (                      -- livre des recettes : une ligne par encaissement ou remboursement
  id INTEGER PRIMARY KEY,
  seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
  at INTEGER NOT NULL, day TEXT NOT NULL,
  amount INTEGER NOT NULL,                     -- brut, centimes ; négatif = remboursement
  fee INTEGER NOT NULL DEFAULT 0,
  method TEXT NOT NULL,                        -- carte | wero | virement | especes | cheque
  provider TEXT NOT NULL DEFAULT '', provider_ref TEXT UNIQUE,
  piece TEXT NOT NULL,                         -- pièce justificative connue au paiement : référence de commande (C-…),
                                               -- ou numéro de facture pour une recette hors site ; la facture d'une
                                               -- commande, émise plus tard (expédition), se retrouve par invoices.order_id
  order_id INTEGER,
  channel TEXT NOT NULL DEFAULT 'site',        -- site | exposition | licence | autre (F27)
  client TEXT NOT NULL DEFAULT '',             -- identité déclarée (scellée)
  payout_ref TEXT NOT NULL DEFAULT ''
);
CREATE TRIGGER receipts_figees BEFORE UPDATE OF amount, at, method, client, piece, channel ON receipts
  BEGIN SELECT RAISE(ABORT, 'recette enregistrée : passer une contre-écriture'); END;
CREATE TRIGGER receipts_gardees BEFORE DELETE ON receipts BEGIN SELECT RAISE(ABORT, 'recette enregistrée'); END;

CREATE TABLE payouts (                       -- versements du prestataire, pointés avec la banque
  id INTEGER PRIMARY KEY, seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL, provider_ref TEXT NOT NULL UNIQUE, amount INTEGER NOT NULL,
  arrival_date TEXT NOT NULL, bank_date TEXT NOT NULL DEFAULT '', bank_amount INTEGER, note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE purchases (                     -- registre des achats
  id INTEGER PRIMARY KEY, seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
  date TEXT NOT NULL, supplier TEXT NOT NULL, supplier_siren TEXT NOT NULL DEFAULT '', number TEXT NOT NULL DEFAULT '',
  total_ht INTEGER NOT NULL, total_vat INTEGER NOT NULL, total_ttc INTEGER NOT NULL,
  method TEXT NOT NULL, category TEXT NOT NULL, received_via TEXT NOT NULL,   -- plateforme | email | papier
  file_path TEXT NOT NULL DEFAULT '', file_sha256 TEXT NOT NULL DEFAULT '',
  locked_at INTEGER, created_at INTEGER NOT NULL
);

CREATE TABLE ereporting_periods (            -- suivi des transmissions (manuelles en V1)
  seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
  period TEXT NOT NULL,                        -- '2027-09/10' (bimestre) ou '2027-09'
  kind TEXT NOT NULL,                          -- transactions | paiements
  status TEXT NOT NULL, sent_at INTEGER, platform_ref TEXT NOT NULL DEFAULT '', payload_sha256 TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (seller_id, period, kind)
);
```

### 4.4 Notes de conception

- **Émission** (`server/invoices.js`, `createInvoices({ db, vault, storageDir, outbox, requestTimestamp, now })`) : (1) transaction `immediate` ; (2) lire ou créer la série, calculer `seq + 1` et l'empreinte ; (3) insérer la facture et ses lignes ; (4) mettre à jour la série (`WHERE last_number = ?`) ; (5) **après la validation**, écrire le PDF (ouverture exclusive), mettre l'horodatage dans la file propre aux factures (`requestTimestamp`, `timestamp.js:118`), mettre l'e-mail dans la boîte d'envoi.
- **PDF reproductible** : pdfkit date le document à sa création et en tire un identifiant ; `CreationDate` et `ModDate` sont fixés à `issued_at` (et l'identifiant du document dérivé du numéro), puis un test vérifie qu'un PDF refait sort identique, octet pour octet. Si pdfkit ne le permet pas, l'intégrité se vérifie sur le contenu canonique, pas sur l'empreinte du PDF.
- **Contenu canonique** de l'empreinte : JSON à clés triées, champs de la facture (sauf `hash`) et lignes dans l'ordre de `pos`. Les champs scellés (`buyer_json`, `ship_json`) entrent **tels que stockés, chiffrés** : la vérification de la chaîne ne demande pas `DATA_KEY`, et ces champs ne sont jamais rechiffrés (sinon la chaîne casserait). Le PDF, en clair, a sa propre empreinte dans `invoice_files`.
- **`DATA_KEY` exigée** : sans elle, `vault.seal()` ne chiffre rien et `vault.index()` renvoie `null` (`vault.js:33-36`), ce qui ferait échouer les colonnes d'index `NOT NULL` et écrirait des factures figées en clair, à jamais. La boutique refuse de s'ouvrir sans `DATA_KEY` (F21).
- **Livre des recettes** : seuls `payout_ref` et `fee` restent modifiables (rapprochement).
- **Données personnelles** : `orders.email`, `name`, `phone`, adresses, `invoices.buyer_json`, `ship_json`, `receipts.client` scellés ; le PDF de la facture reste en clair (document légal, hors coffre, F13).
- **Photos vendues** : `shop_products.photo_id` en `RESTRICT` ; l'admin refuse proprement la suppression et propose de retirer la vente.
- **Références croisées** : `edition_copies.order_item_id` sans clé étrangère (table créée ensuite) ; cohérence vérifiée par les invariants testés.

### 4.5 Conservation et purge

| Donnée | Durée | Niveau |
|---|---|---|
| Panier | 30 jours sans activité | C |
| Commande non payée (expirée, annulée) | Données personnelles effacées après 30 jours ; montants gardés pour les statistiques | C, à valider côté RGPD |
| Commande payée : e-mail, téléphone, adresses | 3 ans après la livraison (C : « durée de la relation » chiffrée), puis effacés ; montants, lignes et historique gardés | C, à valider côté RGPD |
| Factures, avoirs, livre des recettes, registre des achats | 10 ans au moins, hors purge ; copie annuelle hors du serveur (C) | O / R ([130], [129]) |
| Boîte d'envoi (`outbox`) | 90 jours après l'envoi | R |
| Fichier maître d'impression | 30 jours après l'expédition | R |
| Jeton de suivi | Fin du délai de rétractation + 30 jours | C |
| Événements de webhook (`payment_events`) | Avec la commande | R |
| Archives ZIP des galeries | 24 h, dans `storage/private/archives/` (`storage/tmp/` est vidé à chaque démarrage, `admin.js:64-67`) | R |

---

## 5. Écrans de comptabilité

Branchés comme `voyages.js` (`server/routes/compta.js`), avec `P()` et `W()`, `render`, `done` et `failed` ; menu dans `views/admin/layout.eta` ; aide dans `docs/aide/` ; traductions dans `server/admin-i18n/NN-compta.json`.

| Écran | Contenu | Permission |
|---|---|---|
| Réglages → Vendeurs | Identité légale, régime de TVA et date, mentions datées, régime social, préfixe, médiateur, IDU, fabricant, plateforme ; « boutique fermée : il manque … » (F21) | `vendeurs.gerer` |
| Boutique → Factures | Liste par vendeur, période, type ; fiche : aperçu, lignes, chaîne et horodatage, événements ; télécharger, renvoyer, **établir un avoir** (motif obligatoire) | `factures.voir`, `factures.avoir` |
| Comptabilité → Recettes | Livre des recettes par vendeur et par mois, totaux, export CSV | `compta.voir` |
| Comptabilité → Achats | Saisie avec justificatif, verrouillage, export | `compta.saisir` |
| Comptabilité → Rapprochement | Versements du prestataire, écarts, pointage bancaire | `compta.saisir` |
| Comptabilité → Seuils | Jauges de franchise, UE, micro, compte dédié (F19) | `compta.voir` |
| Comptabilité → Déclarations | Chiffre d'affaires à déclarer (mois ou trimestre) ; totaux annuels ; e-reporting : tableau par jour de la période, export, « marquer transmis » | `compta.voir`, `compta.saisir` |
| Comptabilité → Intégrité | « Vérifier l'intégrité » : chaîne, empreintes des PDF, jetons d'horodatage ; résultat daté et noté au journal | `compta.voir` |
| Comptabilité → Hors site | Saisie d'une vente ou d'une recette faite hors du site (exposition, licence sur devis) : facture dans la même série, ligne du livre des recettes, prise en compte dans les seuils (F27) | `factures.avoir`, `compta.saisir` |
| Aujourd'hui | Commandes payées à expédier, facture dont le PDF a échoué, e-mail de la boîte d'envoi non parti après 24 h, événement de paiement non traité, écart de rapprochement, seuil proche, e-reporting à transmettre (du 25 à la fin du mois) | Selon la permission |

---

## 6. Tests de la facturation

| Id | Test |
|---|---|
| TF1 | Numérotation : 1 000 factures sans trou ni doublon ; erreur forcée au milieu d'une émission, numéro suivant continu ; changement d'année (31 décembre, 23 h 59, heure de Paris) ; deux vendeurs, séries indépendantes. |
| TF2 | Figeage : `UPDATE` et `DELETE` sur `invoices`, `invoice_lines`, `invoice_files`, `receipts`, `order_events` lèvent une erreur ; supprimer une photo vendue est refusé proprement. |
| TF3 | Avoirs : partiel puis reste ; dépassement refusé ; renvoi à la facture d'origine dans le PDF et l'instantané. |
| TF4 | Mentions : franchise avant et après le 1/1/2027 (horloge injectée) ; 5,5 % pour une œuvre ; mentions B2B avec un SIREN ; mentions de la réforme présentes. |
| TF5 | Intégrité : altération de la base (déclencheurs désactivés dans le test) détectée ; PDF refait avec `CreationDate` et `ModDate` fixées à `issued_at` : même empreinte (sinon, contrôle sur le contenu canonique). |
| TF6 | E-reporting : agrégats d'une période connue (plusieurs jours et taux, avoirs, ventes à distance dans l'UE **comprises**, même déclarées par OSS) ; bimestre civil et mois. |
| TF7 | Rapprochement : versement juste, versement avec écart, remboursement après versement. |
| TF8 | Éditions : 31e exemplaire refusé tous formats confondus ; tirage d'exposition compté. |
| TF9 | Accès : lien de téléchargement mal formé (404), expiré après 30 jours (410 ; F11), autre facture refusée ; `no-store`, `noindex` ; jeton absent des journaux. |
| TF10 | PDF/A : validation veraPDF dans un test e2e facultatif (outil Java, hors `npm test`). |
| TF11 | Recette et facture hors site (exposition, licence) : même série, livre des recettes et seuils de F19 compris (F27). |
| TF12 | Sauvegarde : une facture écrite dans `storage/invoices/` se retrouve dans la copie de sauvegarde (dossier plat). |
| TF13 | Recette enregistrée au paiement avec la référence de commande ; facture émise à l'expédition ; aucune mise à jour de `receipts` refusée par le déclencheur. Commande en deux envois : deux factures. |
| TF14 | Sans `DATA_KEY` : boutique fermée, aucune insertion dans `orders` ni `invoices`. |

## Sources

Consultées le 15 octobre 2026, sauf mention du 16 octobre 2026 (relectures). Numérotation commune avec le document principal.

**Droit de la consommation, commerce en ligne, publication**

- [1] Code de la consommation, art. L221-14 (« commande avec obligation de paiement ») : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032226854
- [3] Code de la consommation, art. L221-13 (confirmation sur support durable) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044563210
- [7] Code de la consommation, section contenant l'art. D221-5 (fonction de rétractation, en vigueur depuis le 19/06/2026) : https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006069565/LEGISCTA000032807234
- [10] Code de la consommation, art. L221-24 (remboursement, « y compris les frais de livraison » ; relu le 16/10/2026) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032226828
- [12] Service-public.fr, « Droit de rétractation », F10485 (vérifié le 01/01/2026) : https://www.service-public.gouv.fr/particuliers/vosdroits/F10485

**Données personnelles**

- [54] CNIL, délibération n° 2018-303 (cartes de paiement) : https://www.legifrance.gouv.fr/cnil/id/CNILTEXT000037481613

**Facturation électronique (administration fiscale)**

- [98] impots.gouv.fr, « Je n'émets pas de facture, ou je facture sans TVA… » : https://www.impots.gouv.fr/professionnel/questions/je-nemets-pas-de-facture-ou-je-facture-sans-tva-suis-je-concerne-par-la
- [99] impots.gouv.fr, « Mes clients sont à la fois des entreprises et des particuliers… » : https://www.impots.gouv.fr/professionnel/questions/mes-clients-sont-la-fois-des-entreprises-et-des-particuliers-par-quel
- [101] impots.gouv.fr, « Je consulte la liste des plateformes agréées » (modifiée le 13/10/2026, fichiers XLSX) : https://www.impots.gouv.fr/je-consulte-la-liste-des-plateformes-agreees
- [102] DGFiP, FAQ « Tout savoir sur la facturation électronique » (PDF, août 2026) : https://www.impots.gouv.fr/sites/default/files/media/1_metier/2_professionnel/EV/2_gestion/290_facturation_electronique/faq_tout_savoir_facturation-electronique.pdf
- [109] BOFiP, BOI-TVA-DECLA-20-30-50-10-20260930 (champ d'application) : https://bofip.impots.gouv.fr/bofip/13898-PGP.html/identifiant=BOI-TVA-DECLA-20-30-50-10-20260930
- [110] BOFiP, BOI-TVA-DECLA-20-30-50-20-20260930 (données à transmettre) : https://bofip.impots.gouv.fr/bofip/13899-PGP.html/identifiant=BOI-TVA-DECLA-20-30-50-20-20260930
- [111] BOFiP, BOI-TVA-DECLA-20-30-50-30-20260930 (modalités et fréquences) : https://bofip.impots.gouv.fr/bofip/13900-PGP.html/identifiant=BOI-TVA-DECLA-20-30-50-30-20260930
- [112] BOFiP, BOI-TVA-DECLA-20-30-60-20260930 (données de paiement) : https://bofip.impots.gouv.fr/bofip/13901-PGP.html/identifiant=BOI-TVA-DECLA-20-30-60-20260930

**Statut social, micro-entreprise, conservation**

- [129] Entreprendre.service-public.fr, « Registres obligatoires du micro-entrepreneur », F36018 (vérifiée le 21/02/2026) : https://entreprendre.service-public.gouv.fr/vosdroits/F36018
- [130] Entreprendre.service-public.fr, « Durée de conservation des documents », F10029 : https://entreprendre.service-public.gouv.fr/vosdroits/F10029

**Paiement**

- [142] Stripe, tarifs France : https://stripe.com/fr/pricing
- [143] Stripe, tarifs des moyens de paiement locaux (Wero, PayPal, SEPA) : https://stripe.com/fr/pricing/local-payment-methods
- [144] Stripe Tax, tarifs : https://stripe.com/fr/tax/pricing
- [145] Stripe Invoicing, tarifs : https://stripe.com/fr/invoicing/pricing
- [146] Stripe, factures après paiement de Checkout : https://support.stripe.com/questions/pricing-for-post-payment-invoices-for-one-time-purchases-via-checkout-and-payment-links ; reçus : https://docs.stripe.com/receipts?payment-ui=checkout
- [147] Stripe Connect, tarifs : https://stripe.com/fr/connect/pricing
- [148] Stripe, virements : https://docs.stripe.com/payouts
- [149] Stripe, remboursements : https://docs.stripe.com/refunds
- [150] Stripe, webhooks (signature, tolérance, réessais, ordre, doublons, rotation) : https://docs.stripe.com/webhooks
- [151] Stripe, exécution des commandes (page hébergée) : https://docs.stripe.com/checkout/fulfillment?payment-ui=stripe-hosted
- [152] Stripe API, création d'une session Checkout : https://docs.stripe.com/api/checkout/sessions/create
- [153] Stripe API, expirer une session : https://docs.stripe.com/api/checkout/sessions/expire
- [154] Stripe API, requêtes idempotentes : https://docs.stripe.com/api/idempotent_requests
- [155] Stripe, guide de sécurité (PCI, CSP) : https://docs.stripe.com/security/guide
- [156] Stripe, paiements Wero : https://docs.stripe.com/payments/wero
- [157] Stripe, guide Wero pour la France (mis à jour le 06/04/2026) : https://stripe.com/resources/more/wero-guide-france
- [159] Stripe, informations de vérification requises (France, « individual ») : https://docs.stripe.com/connect/required-verification-information?country=FR ; outil : https://docs.stripe.com/_endpoint/get-requirements-for-setups
- [160] Stripe, centre de confidentialité (entités, responsables de traitement) : https://stripe.com/legal/privacy-center
- [161] Stripe, « Manage limited inventory with Checkout » : https://docs.stripe.com/payments/checkout/managing-limited-inventory
- [162] Stripe, conditions générales (entité pour l'EEE) : https://stripe.com/fr/legal/ssa
- [163] Mollie, tarifs France : https://www.mollie.com/fr/pricing
- [164] Mollie, Wero : https://www.mollie.com/fr/payments/wero
- [165] Mollie, adhésion à EPI (08/01/2026) : https://www.mollie.com/news/mollie-epi-principal-member-wero
- [166] Mollie, webhooks : https://docs.mollie.com/reference/webhooks
- [167] Mollie, webhooks « next-gen » : https://docs.mollie.com/reference/webhooks-new
- [168] Mollie, webhooks de l'API Payments : https://docs.mollie.com/reference/payments-api-webhooks
- [169] Mollie Connect, répartition des paiements : https://docs.mollie.com/docs/connect-splitting-payments
- [170] Mollie, frais de litige (page en 403, montant tiré d'un résultat de recherche) : https://help.mollie.com/hc/en-us/articles/35795203499154-What-fees-do-I-pay-for-disputes
- [171] Mollie, « Handling payment status » : https://docs.mollie.com/docs/handling-payment-status
- [172] Payplug, tarifs : https://www.payplug.com/fr/tarifs
- [173] Payplug, qui peut utiliser Payplug : https://support.payplug.com/hc/en-gb/articles/360021353311-Who-can-use-PayPlug
- [174] Payplug, frais de rétrofacturation : https://support.payplug.com/hc/en-gb/articles/360021319572
- [175] Payplug, délais de virement : https://support.payplug.com/hc/en-gb/articles/360021325211
- [176] Payplug, référence de l'API : https://docs.payplug.com/api/apiref.html
- [177] Payplug, Wero (24/09/2025 ; premier paiement Wero en ligne en France en avril 2026) : https://www.payplug.com/blog/payment-wero/
- [178] SumUp, tarifs France : https://www.sumup.com/fr-fr/tarifs/
- [179] SumUp, paiement par lien : https://www.sumup.com/fr-fr/paiement-par-lien/
- [180] SumUp, Hosted Checkout : https://developer.sumup.com/online-payments/checkouts/hosted-checkout/
- [181] SumUp, webhooks : https://developer.sumup.com/online-payments/webhooks/
- [182] SumUp, documentation abrégée (3DS) : https://developer.sumup.com/llms-small.txt
- [183] PayPal, frais marchands France (mis à jour le 15/07/2026) : https://www.paypal.com/fr/business/paypal-business-fees ; https://www.paypal.com/fr/webapps/mpp/merchant-fees
- [184] PayPal, webhooks : https://developer.paypal.com/api/rest/webhooks/rest/
- [185] PayPal, API Orders v2 : https://docs.paypal.ai/reference/api/rest/orders/create-order.md
- [186] Stancer, tarifs (page dynamique ; valeurs lues dans https://www.stancer.com/assets/transaction-B7_Yi4TM.js et https://www.stancer.com/assets/fr-gvV2KjTK.js) : https://www.stancer.com/fr/tarifs
- [187] Stancer, documentation de l'API v2 : https://docs.stancer.com/fr/API.html
- [188] Stancer, reversements : https://docs.stancer.com/fr/Concepts/Payouts.html
- [189] Stancer, contestations : https://docs.stancer.com/fr/Concepts/Disputes.html
- [191] Stancer, introduction et souscription : https://docs.stancer.com/fr/Introduction.html ; https://docs.stancer.com/fr/Subscribe.html
- [192] Moneyvox, Lydia Pro (mise à jour le 10/03/2026, source secondaire) : https://www.moneyvox.fr/banque-en-ligne/lydia-pro
- [193] Lydia Pro, aide : https://supportpro.lydia-app.com/l/fr/category/x3bmx5e7xz-a-propos-de-lydia-pro
- [194] Qonto, tarifs : https://qonto.com/fr/pricing
- [195] Qonto, paiements en ligne : https://qonto.com/fr/get-paid/online
- [196] Qonto, API des liens de paiement : https://docs.qonto.com/api-reference/business-api/payments-transfers/payment-links/introduction
- [197] Groupe BPCE, communiqué du 20/04/2026 (premières transactions Wero en ligne en France) : https://newsroom.groupebpce.fr/download-pdf/69e5d022e4a0acb5eb0029e6
- [198] PCI Security Standards Council, mise à jour de la SAQ A : https://blog.pcisecuritystandards.org/important-updates-announced-for-merchants-validating-to-self-assessment-questionnaire-a
- [201] Cloudflare, Bot Fight Mode : https://developers.cloudflare.com/bots/get-started/bot-fight-mode/

**Facturation : normes, éditeurs, bibliothèques**

- [203] SUPER PDP : https://www.superpdp.tech/tarifs ; https://www.superpdp.tech/fonctionnalites ; https://www.superpdp.tech/documentation
- [204] Dougs, facturation gratuite : https://www.dougs.fr/logiciel-facturation-gratuit/
- [205] Abby : https://abby.fr/tarifs ; https://docs.abby.fr
- [206] Indy, tarifs : https://www.indy.fr/tarifs/
- [207] Tiime, tarifs : https://www.tiime.fr/tarifs
- [208] Pennylane, tarifs : https://www.pennylane.com/fr/tarifs
- [209] Axonaut, prix : https://axonaut.com/content/prix
- [210] Henrri, facturation électronique : https://www.henrri.com/mes-questions-dentrepreneurs/facturation-electronique-b2b/
- [211] Freebe, tarifs : https://www.freebe.me/tarifs
- [212] pdfkit 0.20.2 : https://registry.npmjs.org/pdfkit ; https://github.com/foliojs/pdfkit (`docs/getting_started.md`, `docs/attachments.md`)
- [213] Autres bibliothèques : https://registry.npmjs.org/@stafyniaksacha%2Ffacturx ; https://registry.npmjs.org/@e-invoice-eu%2Fcore ; https://registry.npmjs.org/node-zugferd

**Ergonomie, accessibilité, sobriété**

- [242] RGAA 4.1.2, critères et tests (critère 13.1 : contrôle des limites de temps, dont `meta refresh` ; consulté le 16/10/2026) : https://accessibilite.numerique.gouv.fr/methode/criteres-et-tests/#13.1

**Web, sécurité, référencement**

- [255] MDN, CSP `form-action` (redirections) : https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/form-action

**Ajouts de la contre-vérification (consultés le 16 octobre 2026)**

- [302] Stripe, « Stripe Technology Europe Limited » (établissement de monnaie électronique agréé par la Banque centrale d'Irlande, réf. C187865) : https://stripe.com/fr/legal/stel
