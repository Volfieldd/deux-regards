# Image du site. Les données (base, originaux, variantes, logos) ne sont JAMAIS dans l'image :
# elles vivent dans /data, qui doit être un dossier de l'hôte monté explicitement (voir compose.yaml).
# 1. Dépendances (better-sqlite3 se compile : outillage dans cette étape seulement).
FROM node:22-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
# ONNX Runtime (détection des visages) : aucun téléchargement à l'installation (le binaire CPU est dans le paquet ;
# voir aussi .npmrc), et seulement les binaires Linux x64 de l'image. transformers.js (descriptions Florence-2) :
# seulement sa version Node ; les fichiers pour navigateur (WebAssembly, WebGPU, cartes de source) sont retirés.
ENV ONNXRUNTIME_NODE_INSTALL=skip
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force \
 && rm -rf node_modules/onnxruntime-node/bin/napi-v*/darwin node_modules/onnxruntime-node/bin/napi-v*/win32 node_modules/onnxruntime-node/bin/napi-v*/linux/arm64 \
 && rm -rf node_modules/onnxruntime-web/dist/*.map node_modules/onnxruntime-web/dist/*webgl* node_modules/onnxruntime-web/dist/*webgpu* node_modules/onnxruntime-web/dist/*.wasm \
           node_modules/@huggingface/transformers/dist/*.map node_modules/@huggingface/transformers/dist/transformers.js node_modules/@huggingface/transformers/dist/transformers.min.js \
           node_modules/@huggingface/transformers/dist/ort-wasm-*
# Script d'installation d'ONNX Runtime (déjà passé, sans rien télécharger) et ses seules dépendances : jamais chargés à
# l'exécution, mais signalés par npm audit (adm-zip, sprintf-js). Puis contrôle que le site charge toujours ses modèles.
RUN rm -rf node_modules/onnxruntime-node/script node_modules/adm-zip node_modules/global-agent node_modules/roarr \
           node_modules/sprintf-js node_modules/matcher node_modules/escape-string-regexp node_modules/serialize-error \
           node_modules/type-fest node_modules/boolean node_modules/es6-error node_modules/detect-node \
           node_modules/json-stringify-safe node_modules/semver-compare \
 && node --input-type=module -e "await import('onnxruntime-node'); await import('@huggingface/transformers'); await import('sharp')"

# 2. Image finale, sans compilateur.
FROM node:22-bookworm-slim
# jemalloc : recommandé par sharp quand libvips utilise plusieurs threads sous glibc (IMAGE_THREADS),
# sinon la mémoire du processus se fragmente et grossit au fil des imports.
RUN apt-get update && apt-get install -y --no-install-recommends libjemalloc2 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    STORAGE_DIR=/data \
    DATABASE_PATH=/data/site.db \
    REQUIRE_PERSISTENT_STORAGE=1 \
    LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY views ./views
COPY public ./public
COPY assets ./assets
COPY seed ./seed
COPY docs/aide ./docs/aide

# Pas d'instruction VOLUME : un oubli de montage ferait écrire les données dans un volume anonyme,
# perdu au prochain « docker compose down -v ». Le serveur refuse au contraire de démarrer sans montage.
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
