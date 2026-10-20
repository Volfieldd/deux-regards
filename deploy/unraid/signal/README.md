# Passerelle Signal de la Vigie

La Vigie (composant de sécurité, voir [l'étude](../../../docs/etudes/annexe-vigie-architecture.md)) envoie ses alertes hautes et critiques sur Signal. La passerelle (`signal-cli-rest-api`, version épinglée) est le service `signal` de la pile ([`../compose.yaml`](../compose.yaml)), sous le profil `signal` : sans port publié, sur un réseau interne que seule la Vigie rejoint. Ce guide enregistre le numéro, crée le groupe et vérifie qu'un message arrive ; la Vigie n'a plus qu'à s'y brancher.

Coût : **gratuit**, sauf le numéro de téléphone si vous n'en avez pas de libre (voir étape 1).

---

## 1. Choisir le numéro

La Vigie a besoin de **son propre numéro Signal** : un message que l'on s'envoie à soi-même ne fait pas sonner son téléphone.

| Choix | Coût | Remarque |
|---|---|---|
| **Ligne fixe de la box internet** | gratuit (déjà inclus) | **recommandé** : vérification par **appel vocal** (le code est dicté) ; la ligne ne sert plus à rien d'autre pour Signal |
| Carte SIM prépayée | **payant** (quelques euros, et une recharge de temps en temps pour garder la ligne) | vérification par SMS |
| Numéro virtuel en ligne | souvent refusé par Signal | à éviter |

Ce numéro ne doit **jamais** être réenregistré ailleurs (sur un téléphone, par exemple) : Signal désactiverait la passerelle.

## 2. Le dossier des clés

C'est `NICEPHOS_DIR/signal`, créé à l'étape 2 du [guide Unraid](../README.md#2-dossiers-sur-unraid) (bloc « Passerelle Signal »), avec deux différences par rapport au reste :

- propriétaire `1000:1000`, l'utilisateur de l'image (et non `99:100` comme le site), droits `700` ;
- il contient les clés du compte Signal : hors de tout partage réseau, et pas dans les sauvegardes du site.

## 3. Lancer la passerelle

Dans la pile `nicephos` (Compose Manager → **Edit Stack → ENV FILE**), ajouter `signal` au profil :

```dotenv
COMPOSE_PROFILES=vigie,signal
```

Puis **Compose Pull** et **Compose Up**. Le conteneur `nicephos-signal` apparaît. Le profil `signal` seul (sans `vigie`) suffit pour enregistrer le numéro avant d'installer la Vigie.

Vérifier :

```bash
docker exec nicephos-signal curl -s http://localhost:8080/v1/about
```

La réponse indique la version (`0.101`) et le mode (`json-rpc`).

Le conteneur est durci comme le reste de la pile (système de fichiers en lecture seule, aucun privilège) ; `/run` et `/tmp` sont en mémoire.

**Ancienne pile à part** (`nicephos-signal`, avant le 18 octobre 2026) : **Compose Down** de cette pile, puis supprimez-la dans Compose Manager **avant** de relancer la pile `nicephos` avec le profil `signal`. Le dossier des clés reste le même : rien à réenregistrer.

## 4. Enregistrer le numéro

Dans les commandes, remplacer `+33XXXXXXXXX` par le numéro choisi, au format international.

1. **Captcha** (Signal en demande presque toujours) : ouvrir <https://signalcaptchas.org/registration/generate.html> dans un navigateur d'ordinateur, résoudre le captcha, ouvrir la console du navigateur (F12) et copier la valeur qui suit `signalcaptcha://` (elle commence par `signal-hcaptcha…` ou `signal-recaptcha…`). Elle n'est valable que quelques minutes.
2. **Demander le code**, par appel vocal (ligne fixe) :

   ```bash
   docker exec nicephos-signal curl -s -X POST -H "Content-Type: application/json" \
     -d '{"captcha":"COLLER_LE_CAPTCHA","use_voice":true}' \
     http://localhost:8080/v1/register/+33XXXXXXXXX
   ```

   Pour une SIM : retirer `,"use_voice":true`. Signal impose parfois d'essayer d'abord par SMS avant l'appel vocal : si la réponse le dit, refaire la demande sans `use_voice`, attendre une minute, puis avec.
3. **Valider le code** reçu (format `123-456` ou `123456`) :

   ```bash
   docker exec nicephos-signal curl -s -X POST \
     http://localhost:8080/v1/register/+33XXXXXXXXX/verify/123456
   ```

## 5. Protéger le compte

1. **Code PIN** (verrou d'enregistrement : personne ne peut réenregistrer ce numéro ailleurs sans lui). Choisir un PIN long, le garder dans votre gestionnaire de mots de passe :

   ```bash
   docker exec nicephos-signal curl -s -X POST -H "Content-Type: application/json" \
     -d '{"pin":"VOTRE_PIN"}' http://localhost:8080/v1/accounts/+33XXXXXXXXX/pin
   ```

2. **Nom affiché** :

   ```bash
   docker exec nicephos-signal curl -s -X PUT -H "Content-Type: application/json" \
     -d '{"name":"Vigie Nicephos"}' http://localhost:8080/v1/profiles/+33XXXXXXXXX
   ```

## 6. Premier message

Sur chacun des deux téléphones, ajouter le numéro de la Vigie aux contacts (« Vigie Nicephos »). Puis :

```bash
docker exec nicephos-signal curl -s -X POST -H "Content-Type: application/json" \
  -d '{"message":"Vigie : essai de la passerelle Signal","number":"+33XXXXXXXXX","recipients":["+33NUMERO_ADMIN_1","+33NUMERO_ADMIN_2"]}' \
  http://localhost:8080/v2/send
```

Sur chaque téléphone : **accepter** la demande de message de la Vigie. Sans cela, les messages suivants restent en « demande ».

## 7. Créer le groupe « Vigie Nicephos »

Un groupe évite de mettre les numéros personnels dans la configuration de la Vigie, et permet d'ajouter ou retirer un destinataire depuis Signal.

```bash
docker exec nicephos-signal curl -s -X POST -H "Content-Type: application/json" \
  -d '{"name":"Vigie Nicephos","members":["+33NUMERO_ADMIN_1","+33NUMERO_ADMIN_2"],"permissions":{"add_members":"only-admins","edit_group":"only-admins"},"group_link":"disabled"}' \
  http://localhost:8080/v1/groups/+33XXXXXXXXX

# Identifiant du groupe (champ « id », de la forme group.xxxxx) :
docker exec nicephos-signal curl -s http://localhost:8080/v1/groups/+33XXXXXXXXX
```

Essai dans le groupe :

```bash
docker exec nicephos-signal curl -s -X POST -H "Content-Type: application/json" \
  -d '{"message":"Vigie : essai du groupe","number":"+33XXXXXXXXX","recipients":["group.IDENTIFIANT"]}' \
  http://localhost:8080/v2/send
```

Dans Signal, sur vos téléphones : régler les notifications du groupe pour qu'elles sonnent même en mode « Ne pas déranger » si vous le souhaitez (réglage de votre téléphone, pas de la Vigie).

## 8. À garder pour la Vigie

Dans votre gestionnaire de mots de passe (jamais dans le dépôt, qui est public) :

- le numéro de la Vigie et son PIN ;
- l'identifiant du groupe (`group.…`).

Ils vont dans `vigie.env` (`VIGIE_SIGNAL_NUMERO`, `VIGIE_SIGNAL_GROUPE` ; `VIGIE_SIGNAL_URL` vaut `http://nicephos-signal:8080` par défaut), puis **Compose Up**. Essai : `docker exec nicephos-vigie node vigie/cli.js notifier essai signal`.

---

## Ce que la Vigie enverra

Un message court, **sans adresse IP, sans compte, sans donnée personnelle** : gravité, nature de l'alerte, composant d'où vient le signal, heure, lien de la console (qui exige Cloudflare Access et Zitadel). Par exemple :

```
[Critique] Rôle donné hors de l'application
Source : contrôle des sauvegardes (Vigie)
14 h 02 · https://vigie.nicephos.art/alertes/412
```

Au plus 20 messages par heure, puis un message de synthèse. Si l'envoi échoue (passerelle arrêtée, Signal qui demande un captcha de limite), la Vigie ouvre une alerte dans sa console et envoie l'e-mail de secours.

## Entretien

- **Mise à jour** : changer l'étiquette et l'empreinte de l'image du service `signal` dans `../compose.yaml` (une PR), puis **Compose Pull** et **Compose Up**. Les clés restent dans le dossier.
- **Sauvegarde** : le dossier des clés peut être perdu sans drame (on réenregistre le numéro, étapes 4 à 7, avec le même PIN). Ne pas le copier dans les sauvegardes du site.
- **Limite de Signal** : si Signal réclame un captcha à l'envoi (`rate-limit-challenge` dans les journaux), suivre l'étape 4.1 puis :

  ```bash
  docker exec nicephos-signal curl -s -X POST -H "Content-Type: application/json" \
    -d '{"challenge_token":"JETON_DU_JOURNAL","captcha":"COLLER_LE_CAPTCHA"}' \
    http://localhost:8080/v1/accounts/+33XXXXXXXXX/rate-limit-challenge
  ```

- **`passerelle Signal : réponse 400`** à l'essai : la Vigie affiche la raison donnée par la passerelle et, pour les cas connus, quoi corriger. Pour voir la réponse complète, refaire le même envoi depuis la passerelle, avec les valeurs de `vigie.env` :

  ```bash
  N=$(docker exec nicephos-vigie printenv VIGIE_SIGNAL_NUMERO); G=$(docker exec nicephos-vigie printenv VIGIE_SIGNAL_GROUPE)
  docker exec nicephos-signal curl -s -X POST -H "Content-Type: application/json" \
    -d "{\"message\":\"Vigie : essai\",\"number\":\"$N\",\"recipients\":[\"$G\"]}" http://localhost:8080/v2/send; echo
  docker exec nicephos-signal curl -s http://localhost:8080/v1/groups/$N; echo
  ```

  Causes habituelles : `VIGIE_SIGNAL_GROUPE` recopié depuis `internal_id` au lieu du champ `id` (`group.…`), numéro mal saisi ou pas enregistré sur la passerelle (étape 4), `vigie.env` modifié sans **Compose Up** de la Vigie (l'ancienne valeur reste dans le conteneur).
- **Arrêter les messages** : retirer `signal` de `COMPOSE_PROFILES` puis **Compose Up** (ou `docker stop nicephos-signal`) ; la Vigie bascule sur l'e-mail.

## Sécurité

- L'API de la passerelle n'a pas d'authentification : elle n'a **aucun port publié** et vit sur le réseau interne `nicephos-vigie-signal` (sans sortie vers Internet), où seule la Vigie la rejoint (le site n'y est pas). Ne jamais ajouter de ligne `ports:`.
- Conteneur sans privilège (utilisateur non root, `cap_drop: ALL`, `no-new-privileges`, système de fichiers en lecture seule), mémoire bornée.
- Les messages sont chiffrés de bout en bout par Signal ; la passerelle ne garde aucun historique utile (réception ignorée).
- Le projet `signal-cli` n'est pas un client officiel de Signal : un usage raisonnable (quelques messages par jour) ne pose pas de problème connu, mais Signal peut changer ses règles.
