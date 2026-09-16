#!/usr/bin/env bash
# Nightly PostgreSQL dump into deploy/backups (keep 14 days). Cron: 0 3 * * * /opt/mysupplier/deploy/backup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p deploy/backups
STAMP=$(date +%Y%m%d-%H%M)
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U "${POSTGRES_USER:-mysupplier}" "${POSTGRES_DB:-mysupplier}" | gzip > "deploy/backups/mysupplier-$STAMP.sql.gz"
find deploy/backups -name '*.sql.gz' -mtime +14 -delete
echo "backup written: deploy/backups/mysupplier-$STAMP.sql.gz"
