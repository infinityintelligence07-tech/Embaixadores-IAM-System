#!/usr/bin/env bash
# Executado na VPS pelo workflow de deploy (ou manualmente): atualiza o código,
# reconstrói o container do app e falha se o healthcheck não ficar saudável.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/embaixadores}"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.vps.yml)
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3012/api/health}"

cd "$APP_DIR"

git fetch --prune origin main
git reset --hard origin/main

"${COMPOSE[@]}" up -d --build --remove-orphans app

for attempt in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL" | grep -q '"status":"healthy"'; then
    echo "Deploy OK ($(git rev-parse --short HEAD))"
    docker image prune -f >/dev/null
    exit 0
  fi
  echo "Aguardando app ficar saudável ($attempt/30)..."
  sleep 5
done

echo "App não ficou saudável após o deploy" >&2
"${COMPOSE[@]}" logs --tail=100 app >&2
exit 1
