# Passerelle Signal de la Vigie

La Vigie (composant de sécurité, voir [l'étude](../../../docs/etudes/annexe-vigie-architecture.md)) enverra ses alertes hautes et critiques sur Signal. Ce dossier prépare la passerelle **avant** la Vigie : on enregistre le numéro, on crée le groupe, on vérifie qu'un message arrive. La Vigie n'aura plus qu'à s'y brancher.

| Fichier | Rôle |
|---|---|
| `compose.yaml` | la passerelle (`signal-cli-rest-api`, version épinglée), sans port publié, sur un réseau interne réservé à la Vigie |
| `env.example` | le dossier des clés, et les valeurs à noter pour la Vigie |

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

## 2. Créer le dossier des clés

Dans le terminal Unraid :

```bash
mkdir -p /mnt/cache/appdata/nicephos/signal
chown 1000:1000 /mnt/cache/appdata/nicephos/signal
chmod 700 /mnt/cache/appdata/nicephos/signal
```

- `1000:1000` est l'utilisateur de l'image (et non `99:100` comme le site).
- Le dossier contient les clés du compte Signal : hors de tout partage réseau (`appdata` non exporté, comme pour le site).

## 3. Lancer la passerelle

Docker Compose Manager → **Add New Stack** « nicephos-signal », coller `compose.yaml`, puis **Edit Stack → ENV FILE** avec `env.example` complété, puis **Compose Up**.

Vérifier :

```bash
docker exec nicephos-signal curl -s http://localhost:8080/v1/about
```

La réponse indique la version et le mode (`json-rpc-native`).

**Si le conteneur ne démarre pas** à cause du système de fichiers en lecture seule (message de `s6` dans les journaux) : retirer les lignes `read_only: true` et `tmpfs`, relancer, et me le signaler pour corriger le modèle.

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

Ils iront dans le `.env` de la Vigie (`VIGIE_SIGNAL_URL`, `VIGIE_SIGNAL_NUMERO`, `VIGIE_SIGNAL_GROUPE`) à la phase B.

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

- **Mise à jour** : changer l'étiquette et l'empreinte de l'image dans `compose.yaml` (une PR), puis **Compose Pull** et **Compose Up**. Les clés restent dans le dossier.
- **Sauvegarde** : le dossier des clés peut être perdu sans drame (on réenregistre le numéro, étapes 4 à 7, avec le même PIN). Ne pas le copier dans les sauvegardes du site.
- **Limite de Signal** : si Signal réclame un captcha à l'envoi (`rate-limit-challenge` dans les journaux), suivre l'étape 4.1 puis :

  ```bash
  docker exec nicephos-signal curl -s -X POST -H "Content-Type: application/json" \
    -d '{"challenge_token":"JETON_DU_JOURNAL","captcha":"COLLER_LE_CAPTCHA"}' \
    http://localhost:8080/v1/accounts/+33XXXXXXXXX/rate-limit-challenge
  ```

- **Arrêter les messages** : **Compose Down** de cette pile ; la Vigie bascule sur l'e-mail.

## Sécurité

- L'API de la passerelle n'a pas d'authentification : elle n'a **aucun port publié** et vit sur le réseau interne `nicephos-vigie-signal` (sans sortie vers Internet), où seule la Vigie la rejoindra. Ne jamais ajouter de ligne `ports:`.
- Conteneur sans privilège (utilisateur non root, `cap_drop: ALL`, `no-new-privileges`, système de fichiers en lecture seule), mémoire bornée.
- Les messages sont chiffrés de bout en bout par Signal ; la passerelle ne garde aucun historique utile (réception ignorée).
- Le projet `signal-cli` n'est pas un client officiel de Signal : un usage raisonnable (quelques messages par jour) ne pose pas de problème connu, mais Signal peut changer ses règles.
