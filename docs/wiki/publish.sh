#!/usr/bin/env bash
# Publie docs/wiki/ sur le wiki GitHub du dépôt (voir README.md de ce dossier).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
remote="$(git -C "$here" remote get-url origin | sed -E 's#(\.git)?$#.wiki.git#')"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
if ! git clone -q "$remote" "$work" 2>/dev/null; then
  echo "Wiki introuvable : créez d'abord sa première page dans l'interface GitHub (onglet Wiki)." >&2
  exit 1
fi
find "$work" -maxdepth 1 -name '*.md' -delete
rm -rf "$work/captures"
for f in "$here"/*.md; do
  [ "$(basename "$f")" = README.md ] || cp "$f" "$work/"
done
if [ -d "$here/captures" ]; then cp -r "$here/captures" "$work/"; fi
find "$work" -maxdepth 1 \( -name 'Aide*.md' -o -name 'Unraid.md' \) -delete
node "$here/aide.mjs" "$work"          # pages « Aide » générées depuis docs/aide/
node "$here/unraid.mjs" "$work"        # pages « Unraid » et « Installateur » (deploy/unraid, deploy/installateur)
cd "$work"
git add -A
if git diff --cached --quiet; then echo "Wiki déjà à jour."; exit 0; fi
# Identité : celle configurée, sinon l'auteur du dernier commit du dépôt.
name="$(git config user.name || git -C "$here" log -1 --format=%an)"
email="$(git config user.email || git -C "$here" log -1 --format=%ae)"
git -c user.name="$name" -c user.email="$email" commit -q -m "Mise à jour du wiki depuis docs/wiki ($(git -C "$here" rev-parse --short HEAD))"
git push -q origin HEAD
echo "Wiki publié."
