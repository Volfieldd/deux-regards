#!/usr/bin/env bash
# Exporte les données d'une installation Docker Compose existante (dossier du dépôt), sans arrêter le site :
#   - instantané cohérent de la base, pris par le conteneur de sauvegarde ;
#   - originaux, logos du filigrane et marque, copiés depuis DATA_DIR.
# Les images servies (variants/) ne sont pas exportées : elles se recalculent au démarrage.
#
#   deploy/unraid/exporter-donnees.sh [archive.tar.gz]
# Puis sur Unraid, pile arrêtée (voir README, étape 6) :
#   tar -xzf archive.tar.gz -C /mnt/cache/appdata/nicephos/data && rm -f …/data/site.db-wal …/data/site.db-shm
#   && chown -R 99:100 …/data ; même DATA_KEY que le serveur de test ; archive effacée des deux machines ensuite.
set -euo pipefail
# L'archive contient des données personnelles (noms, e-mails, signatures, originaux) : lisible par son seul propriétaire.
umask 077
cd "$(dirname "$0")/../.."
out="${1:-nicephos-donnees-$(date +%F).tar.gz}"
value() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
data="$(value DATA_DIR)"
backups="$(value BACKUP_DIR)"
[ -d "$data" ] && [ -d "$backups" ] || { echo "DATA_DIR ou BACKUP_DIR introuvable (fichier .env)" >&2; exit 1; }

# 1. Instantané de la base par le conteneur de sauvegarde (même code que la sauvegarde quotidienne).
docker compose exec -T backup node server/db/backup.js >/dev/null
snapshot="$(ls -1t "$backups"/db/site-*.db | head -1)"

# 2. Archive : base + fichiers irremplaçables tels qu'ils sont aujourd'hui dans DATA_DIR.
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp "$snapshot" "$work/site.db"
for d in originals watermarks brand; do
  if [ -d "$data/$d" ]; then cp -a "$data/$d" "$work/"; fi
done
tar -czf "$out" -C "$work" .
photos="$(ls "$work/originals" 2>/dev/null | wc -l)"
echo "Archive : $out ($(du -h "$out" | cut -f1), base du $(basename "$snapshot" .db | sed 's/^site-//'), $photos original(aux))"
