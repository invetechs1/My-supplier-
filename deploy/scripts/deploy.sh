#!/usr/bin/env bash
# Zero-downtime-ish redeploy on a single VM: pull, rebuild, migrate (runs on api start), restart.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
docker compose -f docker-compose.prod.yml build --pull
docker compose -f docker-compose.prod.yml up -d --remove-orphans
docker compose -f docker-compose.prod.yml ps
echo "Waiting for API health…"
for i in $(seq 1 30); do
  if docker compose -f docker-compose.prod.yml exec -T api wget -qO- http://localhost:4000/api/v1/health >/dev/null 2>&1; then echo "API healthy"; exit 0; fi
  sleep 3
done
echo "API did not become healthy; showing logs" >&2
docker compose -f docker-compose.prod.yml logs --tail=100 api >&2
exit 1
