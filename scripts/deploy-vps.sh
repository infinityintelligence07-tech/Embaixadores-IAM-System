#!/usr/bin/env bash
# Deploy na VPS (Ubuntu/Debian + Docker)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/embaixadores}"
REPO="${REPO:-https://github.com/infinityintelligence07-tech/Embaixadores-IAM-System.git}"

if [[ ! -d "$APP_DIR/.git" ]]; then
  sudo mkdir -p "$APP_DIR"
  sudo git clone "$REPO" "$APP_DIR"
fi

cd "$APP_DIR"
sudo git fetch origin
sudo git checkout main
sudo git pull origin main

if [[ ! -f .env ]]; then
  echo "Crie $APP_DIR/.env a partir de .env.example e preencha os segredos."
  exit 1
fi

sudo docker compose build
sudo docker compose up -d
sudo docker compose ps
curl -fsS "http://127.0.0.1/api/health" || curl -fsS "http://127.0.0.1:3000/api/health" || true

echo "OK. Configure DNS A embaixadores -> IP desta VPS (Cloudflare Proxied)."
echo "Depois emita TLS e troque nginx.http.conf por nginx.conf (Full Strict)."
