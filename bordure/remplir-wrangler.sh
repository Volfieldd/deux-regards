#!/usr/bin/env bash
# Remplit bordure/wrangler.toml à partir de vigie.env (compte, espace KV, jeu de données) et du .env du site (clé publique
# des décisions). Crée wrangler.toml depuis wrangler.toml.example s'il n'existe pas ; sinon le met à jour (copie .bak).
# Avec --secret, pose aussi BORDURE_KEY (= VIGIE_BORDURE_KEY du site) chez Cloudflare, sans l'afficher.
#
# Procédure complète : deploy/unraid/vigie-phase-0.md, étape 3.7.
#
# Usage : ./remplir-wrangler.sh [--secret] <vigie.env> <.env du site> [dossier bordure]
set -euo pipefail

SECRET=0
if [ "${1:-}" = "--secret" ]; then SECRET=1; shift; fi
VIGIE_ENV=${1:?Usage : $0 [--secret] <vigie.env> <.env du site> [dossier bordure]}
SITE_ENV=${2:?Usage : $0 [--secret] <vigie.env> <.env du site> [dossier bordure]}
BORDURE=${3:-$(cd "$(dirname "$0")" && pwd)}
TOML="$BORDURE/wrangler.toml"

# Valeur d'une variable dans un fichier .env, sans l'exécuter : dernière ligne « NOM=… », guillemets et \r retirés.
lire() {
  local v
  v=$(grep -E "^[[:space:]]*(export[[:space:]]+)?$1=" "$2" | tail -n 1 | sed -E "s/^[^=]*=//; s/\r$//; s/[[:space:]]+#.*$//; s/^[[:space:]]+|[[:space:]]+$//g") || true
  v=${v#\"}; v=${v%\"}; v=${v#\'}; v=${v%\'}
  printf '%s' "$v"
}
erreur() { echo "Erreur : $*" >&2; exit 1; }

[ -r "$VIGIE_ENV" ] || erreur "vigie.env illisible ($VIGIE_ENV)"
[ -r "$SITE_ENV" ] || erreur ".env du site illisible ($SITE_ENV)"

COMPTE=$(lire VIGIE_CF_ACCOUNT_ID "$VIGIE_ENV")
KV=$(lire VIGIE_CF_KV_NAMESPACE "$VIGIE_ENV")
JEU=$(lire VIGIE_CF_DATASET "$VIGIE_ENV"); JEU=${JEU:-vigie_bordure}
CLE_PUB=$(lire VIGIE_DECISIONS_PUBKEY "$SITE_ENV")

# Mêmes contrôles que la Vigie et le site : rien d'inattendu n'entre dans le fichier.
[[ $COMPTE =~ ^[0-9a-f]{32}$ ]] || erreur "VIGIE_CF_ACCOUNT_ID absent ou invalide dans $VIGIE_ENV (32 caractères hexadécimaux)"
[[ $KV =~ ^[0-9a-f]{32}$ ]] || erreur "VIGIE_CF_KV_NAMESPACE absent ou invalide dans $VIGIE_ENV (32 caractères hexadécimaux)"
[[ $JEU =~ ^[a-z_][a-z0-9_]{0,63}$ ]] || erreur "VIGIE_CF_DATASET invalide dans $VIGIE_ENV"
[[ $CLE_PUB =~ ^[A-Za-z0-9+/]+=*$ ]] || erreur "VIGIE_DECISIONS_PUBKEY absente ou invalide dans $SITE_ENV (base64, sortie de « node vigie/cli.js cles »)"

if [ -f "$TOML" ]; then
  cp -p "$TOML" "$TOML.bak"
  echo "Mise à jour de $TOML (ancienne version : wrangler.toml.bak)"
else
  [ -r "$BORDURE/wrangler.toml.example" ] || erreur "ni wrangler.toml ni wrangler.toml.example dans $BORDURE"
  cp "$BORDURE/wrangler.toml.example" "$TOML"
  echo "Création de $TOML depuis wrangler.toml.example"
fi

# DECISIONS_PUBKEY (bloc [vars]), id de [[kv_namespaces]], dataset de [[analytics_engine_datasets]].
sed -i -E \
  -e "s|^DECISIONS_PUBKEY[[:space:]]*=.*|DECISIONS_PUBKEY = \"$CLE_PUB\"|" \
  -e "/^\[\[kv_namespaces\]\]/,/^\[/ s|^id[[:space:]]*=.*|id = \"$KV\"|" \
  -e "/^\[\[analytics_engine_datasets\]\]/,/^\[/ s|^dataset[[:space:]]*=.*|dataset = \"$JEU\"|" \
  "$TOML"
# account_id : clé de premier niveau (avant le premier tableau) ; évite à wrangler de demander le compte.
if grep -qE '^account_id[[:space:]]*=' "$TOML"; then
  sed -i -E "s|^account_id[[:space:]]*=.*|account_id = \"$COMPTE\"|" "$TOML"
else
  sed -i -E "0,/^workers_dev[[:space:]]*=.*/ s||&\naccount_id = \"$COMPTE\"|" "$TOML"
  grep -qE '^account_id' "$TOML" || sed -i "1i account_id = \"$COMPTE\"" "$TOML"
fi

# Vérification : plus aucun « REMPLACER » et les quatre valeurs en place.
if grep -q 'REMPLACER' "$TOML"; then erreur "il reste des valeurs à remplacer dans $TOML : $(grep -n REMPLACER "$TOML")"; fi
for attendu in "account_id = \"$COMPTE\"" "DECISIONS_PUBKEY = \"$CLE_PUB\"" "id = \"$KV\"" "dataset = \"$JEU\""; do
  grep -qF "$attendu" "$TOML" || erreur "valeur absente de $TOML : ${attendu%% =*}"
done
echo "OK : compte ${COMPTE:0:6}…, KV ${KV:0:6}…, jeu de données $JEU, clé publique ${CLE_PUB:0:12}…"

if [ "$SECRET" = 1 ]; then
  CLE=$(lire VIGIE_BORDURE_KEY "$SITE_ENV")
  [ -n "$CLE" ] || erreur "VIGIE_BORDURE_KEY absente de $SITE_ENV (openssl rand -base64 32)"
  (cd "$BORDURE" && printf '%s' "$CLE" | npx wrangler@4 secret put BORDURE_KEY)
  echo "BORDURE_KEY posée chez Cloudflare."
fi

echo "Ensuite : cd $BORDURE && npx wrangler@4 deploy"
