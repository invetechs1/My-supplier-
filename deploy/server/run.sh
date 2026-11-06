#!/usr/bin/env bash
# Deploy My Supplier from mysupplier-api.tar in this folder.
# - removes ONLY this project's old containers + image (never touches other projects)
# - loads the new tar, picks the first free host port starting at 3000 (3000, 3001, 3002, ...)
# - keeps the same port and the database on later runs
set -euo pipefail
cd "$(dirname "$0")"
TAR=mysupplier-api.tar
IMAGE=mysupplier/api:latest
PROJECT=mysupplier-app
START_PORT=3000
SERVER_IP="${SERVER_IP:-13.140.138.252}"

[ -f "$TAR" ] || { echo "ERROR: $TAR not found in $(pwd)"; exit 1; }

# first run: generate secrets
if [ ! -f .env ]; then
  cat > .env <<ENV
POSTGRES_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
ADMIN_EMAIL=admin@mysupplier.sa
ADMIN_PASSWORD=$(openssl rand -hex 8)
SEED_DEMO_DATA=1
ENV
  chmod 600 .env
fi

port_in_use() { ss -ltn | awk '{print $4}' | grep -qE "[:.]$1\$"; }

# stop/remove this project's old containers and image (volumes are kept)
CURRENT=$(docker inspect -f '{{range $p,$b := .NetworkSettings.Ports}}{{range $b}}{{.HostPort}}{{end}}{{end}}' mysupplier-app-api 2>/dev/null || true)
docker compose -p "$PROJECT" --env-file .env down --remove-orphans 2>/dev/null || true
docker rmi -f "$IMAGE" 2>/dev/null || true

echo "Loading $TAR ..."
docker load -i "$TAR"

# choose the port: reuse ours if still free, otherwise first free from START_PORT
PORT="${CURRENT:-}"
if [ -z "$PORT" ] || port_in_use "$PORT"; then
  PORT=$START_PORT
  while port_in_use "$PORT"; do PORT=$((PORT+1)); done
fi
echo "Using host port $PORT"

grep -v -E '^(HOST_PORT|PUBLIC_BASE_URL)=' .env > .env.tmp || true
{ cat .env.tmp; echo "HOST_PORT=$PORT"; echo "PUBLIC_BASE_URL=http://$SERVER_IP:$PORT"; } > .env
rm -f .env.tmp; chmod 600 .env

docker compose -p "$PROJECT" --env-file .env up -d

echo "Waiting for health check ..."
for i in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:$PORT/api/v1/health" >/dev/null; then
    echo "OK  ->  http://$SERVER_IP:$PORT"
    echo "$PORT" > .port
    echo "Admin: $(grep ADMIN_EMAIL .env | cut -d= -f2) / $(grep ADMIN_PASSWORD .env | cut -d= -f2)"
    exit 0
  fi
  sleep 3
done
echo "Health check failed. Logs:"; docker logs --tail 50 mysupplier-app-api; exit 1
