#!/usr/bin/env bash
# Loads the demo catalogue/accounts into the production database (only for a staging or first launch!).
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose -f docker-compose.prod.yml exec api sh -c "cd /app/apps/api && npx tsx prisma/seed.ts"
