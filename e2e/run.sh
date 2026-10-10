#!/usr/bin/env bash
# Lance les tests navigateur dans le conteneur Playwright officiel, contre un serveur déjà démarré.
# Usage : BASE_URL=http://10.21.30.23:3080 e2e/run.sh [options playwright]
# Le projet « parcours » modifie les données (import, réordonnancement, réglages d'images…) puis les
# remet en état : il ne tourne que si E2E_ALLOW_WRITES=1, à réserver à un serveur de test jetable.
set -euo pipefail
cd "$(dirname "$0")"
VERSION=$(node -p "require('./package.json').devDependencies['@playwright/test']")
docker run --rm --network host --ipc host \
  --user "$(id -u):$(id -g)" -e HOME=/tmp -e CI=1 \
  -e BASE_URL="${BASE_URL:-http://localhost:3000}" -e E2E_LOCAL_AUTH="${E2E_LOCAL_AUTH:-}" -e E2E_ALLOW_WRITES="${E2E_ALLOW_WRITES:-}" \
  -v "$PWD":/e2e -w /e2e \
  "mcr.microsoft.com/playwright:v${VERSION}-noble" \
  bash -c "npm install --no-audit --no-fund --loglevel=error && npx playwright test $*"
