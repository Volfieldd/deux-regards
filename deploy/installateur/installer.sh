#!/bin/bash
# Installateur de Nicephos : lanceur côté hôte (Unraid, ou Linux avec Docker). Guide : deploy/installateur/README.md.
#
#   bash installer.sh              installation (ou mise à jour d'une installation existante), questions à l'écran
#   bash installer.sh --essai      tout vérifier et afficher ce qui serait fait, sans rien changer nulle part
#   bash installer.sh --mode linux forcer le mode (unraid est détecté tout seul)
#
# Ce lanceur vérifie la machine (Docker, Compose, connexion au registre privé, Compose Manager sur Unraid), puis lance
# l'installateur proprement dit (installer.mjs) dans l'image du site, qui a Node : rien à installer sur l'hôte. À la fin,
# il démarre la pile et vérifie le site, en local puis par Cloudflare.
set -euo pipefail

ICI=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
IMAGE=${IMAGE:-ghcr.io/volfieldd/deux-regards:latest}
MODE=""
ARGS=()

rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
vert() { printf '\033[32m%s\033[0m\n' "$*"; }
jaune() { printf '\033[33m%s\033[0m\n' "$*"; }
arret() { rouge "✘ $*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --mode) MODE=${2:-}; shift 2 ;;
    --mode=*) MODE=${1#--mode=}; shift ;;
    --image) IMAGE=${2:-}; shift 2 ;;
    --essai) ARGS+=(--essai); shift ;;
    -h|--aide|--help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) arret "option inconnue : $1 (--aide)" ;;
  esac
done
ESSAI=0; [ "${ARGS[*]-}" = "--essai" ] && ESSAI=1

if [ -z "$MODE" ]; then if [ -f /etc/unraid-version ]; then MODE=unraid; else MODE=linux; fi; fi
case "$MODE" in unraid|linux) ;; *) arret "mode inconnu : $MODE (unraid ou linux)" ;; esac
[[ "$IMAGE" =~ ^[a-z0-9./_:@-]+$ ]] || arret "image invalide : $IMAGE"

printf '\n\033[1mNicephos : installation (%s%s)\033[0m\n\n' "$MODE" "$([ $ESSAI = 1 ] && echo ', essai sans rien changer')"

# ---------- la machine ----------
[ "$(id -u)" = 0 ] || arret "à lancer en root (Unraid : terminal de l'interface ; Linux : sudo bash $0)"
[ -t 0 ] && [ -t 1 ] || arret "à lancer dans un terminal (questions à l'écran)"
command -v docker >/dev/null || arret "Docker est introuvable"
docker info >/dev/null 2>&1 || arret "Docker ne répond pas (Unraid : Settings → Docker → Enable Docker)"
DOCKER_V=$(docker version --format '{{.Server.Version}}' 2>/dev/null | tr -cd '0-9.')
COMPOSE_V=$(docker compose version --short 2>/dev/null | tr -cd '0-9.' || true)
UNRAID_V=""; MANAGER=0; AUTH_GARDEE=0
if [ "$MODE" = unraid ]; then
  UNRAID_V=$(sed -n 's/^version="\{0,1\}\([0-9.]*\).*/\1/p' /etc/unraid-version 2>/dev/null | head -1)
  [ -d /boot/config/plugins/compose.manager ] && MANAGER=1
  [ -s /boot/config/docker-auth/config.json ] && grep -q 'ghcr.io' /boot/config/docker-auth/config.json && AUTH_GARDEE=1
fi
[ -n "$COMPOSE_V" ] || arret "docker compose (v2) est introuvable$([ "$MODE" = unraid ] && echo ' : installez le plugin « Docker Compose Manager » (Apps)')"
vert "✔ Docker $DOCKER_V, Compose $COMPOSE_V${UNRAID_V:+, Unraid $UNRAID_V}"

# Image privée : connexion au registre si le téléchargement est refusé.
if ! docker pull -q "$IMAGE" >/dev/null 2>&1; then
  jaune "⚠ Téléchargement de $IMAGE refusé : connexion au registre ghcr.io nécessaire (image privée)."
  echo "  Jeton GitHub (classic) avec le seul droit read:packages : GitHub → Settings → Developer settings →"
  echo "  Personal access tokens → Tokens (classic) → Generate new token (classic)."
  read -r -p "  Identifiant GitHub [Volfieldd] : " GH_USER
  docker login ghcr.io -u "${GH_USER:-Volfieldd}" || arret "connexion à ghcr.io refusée"
  docker pull -q "$IMAGE" >/dev/null || arret "image $IMAGE introuvable même connecté (droits du jeton ?)"
fi
vert "✔ Image $IMAGE"

# Unraid : /root est en mémoire, la connexion au registre disparaît au redémarrage (README Unraid, étape 1).
if [ "$MODE" = unraid ] && [ $ESSAI = 0 ] && [ -s /root/.docker/config.json ] && grep -q 'ghcr.io' /root/.docker/config.json; then
  if ! cmp -s /root/.docker/config.json /boot/config/docker-auth/config.json 2>/dev/null || ! grep -q 'docker-auth/config.json' /boot/config/go 2>/dev/null; then
    read -r -p "? Garder la connexion à ghcr.io après un redémarrage d'Unraid (copie sur la clé USB et /boot/config/go) [O/n] : " R
    if [ -z "$R" ] || [[ "$R" =~ ^[oOyY] ]]; then
      mkdir -p /boot/config/docker-auth
      cp /root/.docker/config.json /boot/config/docker-auth/config.json
      chmod 600 /boot/config/docker-auth/config.json 2>/dev/null || true
      if ! grep -q 'docker-auth/config.json' /boot/config/go 2>/dev/null; then
        printf '\n# Nicephos : connexion au registre ghcr.io (installateur)\nmkdir -p /root/.docker\ncp /boot/config/docker-auth/config.json /root/.docker/config.json\nchmod 600 /root/.docker/config.json\n' >> /boot/config/go
      fi
      AUTH_GARDEE=1
      vert "✔ Connexion au registre gardée au redémarrage"
    fi
  else
    AUTH_GARDEE=1
  fi
fi

# ---------- l'installateur (Node, dans l'image du site) ----------
SORTIE=$(mktemp -d)
trap 'rm -rf "$SORTIE"' EXIT
HOTE=$(printf '{"mode":"%s","docker":"%s","compose":"%s","unraid":"%s","composeManager":%s,"authGardee":%s,"image":"%s"}' \
  "$MODE" "$DOCKER_V" "$COMPOSE_V" "$UNRAID_V" "$([ $MANAGER = 1 ] && echo true || echo false)" "$([ $AUTH_GARDEE = 1 ] && echo true || echo false)" "$IMAGE")

MONTAGES=(-v "$SORTIE:/sortie")
if [ "$MODE" = unraid ]; then
  # Mêmes chemins que l'hôte : pools et tableau (/mnt), clé USB (/boot/config : pile de Compose Manager, partages).
  MONTAGES+=(-v /mnt:/mnt -v /boot/config:/boot/config -e INSTALLEUR_RACINE=)
else
  MONTAGES+=(-v /:/hote -e INSTALLEUR_RACINE=/hote)
fi
# Lancé depuis une copie du dépôt : ses fichiers à lui, plutôt que ceux de l'image (essai d'une nouvelle version).
if [ -f "$ICI/installer.mjs" ] && [ -f "$ICI/../unraid/compose.yaml" ]; then
  MONTAGES+=(-v "$ICI:/app/deploy/installateur:ro" -v "$(cd "$ICI/../unraid" && pwd):/app/deploy/unraid:ro")
fi

set +e
docker run --rm -it --name nicephos-installateur --user 0:0 --network bridge \
  -e INSTALLEUR_MODE="$MODE" -e INSTALLEUR_HOTE="$HOTE" -e INSTALLEUR_SORTIE=/sortie/suite -e TERM="${TERM:-xterm}" ${NO_COLOR:+-e NO_COLOR=1} \
  "${MONTAGES[@]}" --entrypoint node "$IMAGE" /app/deploy/installateur/installer.mjs ${ARGS[@]+"${ARGS[@]}"}
CODE=$?
set -e
[ $CODE = 0 ] || exit $CODE
[ -s "$SORTIE/suite" ] || exit 0

# ---------- la suite : démarrer la pile et vérifier ----------
# Fichier écrit par l'installateur : CLE=valeur, clés connues seulement, valeurs contrôlées (jamais « source »).
PROJET=""; NOM=""; ADRESSE=""; REDIRECTION=""; DEMARRER=0
while IFS='=' read -r CLE VALEUR; do
  case "$CLE" in
    PROJET) [[ "$VALEUR" =~ ^/[A-Za-z0-9._/-]+$ ]] && PROJET=$VALEUR ;;
    NOM) [[ "$VALEUR" =~ ^[a-z0-9_-]+$ ]] && NOM=$VALEUR ;;
    ADRESSE) [[ "$VALEUR" =~ ^https://[a-z0-9.-]+$ ]] && ADRESSE=$VALEUR ;;
    REDIRECTION) [[ "$VALEUR" =~ ^https://[a-z0-9.-]+$ ]] && REDIRECTION=$VALEUR ;;
    DEMARRER) [ "$VALEUR" = 1 ] && DEMARRER=1 ;;
  esac
done < "$SORTIE/suite"
[ $DEMARRER = 1 ] && [ -n "$PROJET" ] && [ -n "$NOM" ] || exit 0

echo
echo "→ Démarrage de la pile ($PROJET)"
( cd "$PROJET" && docker compose -p "$NOM" -f docker-compose.yml pull -q && docker compose -p "$NOM" -f docker-compose.yml up -d ) \
  || arret "la pile n'a pas démarré : lisez le message ci-dessus, corrigez, puis relancez l'installateur (rien n'est perdu)"

printf "→ Attente du site (jusqu’à 3 minutes) "
ETAT=""
for _ in $(seq 1 36); do
  ETAT=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' nicephos 2>/dev/null || true)
  [ "$ETAT" = healthy ] && break
  printf '.'; sleep 5
done
echo
if [ "$ETAT" = healthy ]; then vert "✔ nicephos : healthy"; else
  jaune "⚠ nicephos n'est pas « healthy » ($ETAT) : docker logs --tail 50 nicephos"
fi

if [ -n "$ADRESSE" ]; then
  # Le tunnel met parfois une minute à prendre la nouvelle configuration.
  CODE_PUBLIC=""
  for _ in $(seq 1 12); do
    CODE_PUBLIC=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$ADRESSE/healthz" || true)
    [ "$CODE_PUBLIC" = 200 ] && break
    sleep 5
  done
  if [ "$CODE_PUBLIC" = 200 ]; then vert "✔ $ADRESSE répond par Cloudflare"; else
    jaune "⚠ $ADRESSE/healthz répond « $CODE_PUBLIC » : docker logs --tail 30 nicephos-tunnel (DNS en cours de propagation ?)"
  fi
fi
if [ -n "$REDIRECTION" ]; then
  LOC=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 10 "$REDIRECTION/serie/essai?x=1" || true)
  case "$LOC" in
    "301 $ADRESSE/serie/essai?x=1") vert "✔ $REDIRECTION redirige vers $ADRESSE" ;;
    *) jaune "⚠ redirection de $REDIRECTION : « $LOC » au lieu de « 301 $ADRESSE/serie/essai?x=1 »" ;;
  esac
fi
echo
if [ -s "$SORTIE/suite-a-faire" ]; then
  printf '\033[1mReste à faire à la main\033[0m\n'
  sed 's/^/  ☐ /' "$SORTIE/suite-a-faire"
  echo
fi
vert "Installation terminée."
