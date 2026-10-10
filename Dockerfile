# Image du site. Les données (base, originaux, variantes, logos) ne sont JAMAIS dans l'image :
# elles vivent dans /data, qui doit être un dossier de l'hôte monté explicitement (voir compose.yaml).
# 1. Dépendances (better-sqlite3 se compile : outillage dans cette étape seulement).
FROM node:22-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# 2. Image finale, sans compilateur.
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    STORAGE_DIR=/data \
    DATABASE_PATH=/data/site.db \
    REQUIRE_PERSISTENT_STORAGE=1

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY views ./views
COPY public ./public
COPY assets ./assets
COPY seed ./seed

# Pas d'instruction VOLUME : un oubli de montage ferait écrire les données dans un volume anonyme,
# perdu au prochain « docker compose down -v ». Le serveur refuse au contraire de démarrer sans montage.
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
