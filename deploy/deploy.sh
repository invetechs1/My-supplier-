#!/usr/bin/env bash
# One-command deploy/update on the server: pull latest main, rebuild image, migrate, restart.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "Missing .env — copy .env.production.example to .env and fill it in"; exit 1; }
git pull --ff-only origin main
docker compose -f docker-compose.prod.yml build api
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec -T api alembic upgrade head
docker compose -f docker-compose.prod.yml ps
curl -sf "https://$(grep -E '^DOMAIN=' .env | cut -d= -f2)/api/v1/health" && echo " ✓ live"
