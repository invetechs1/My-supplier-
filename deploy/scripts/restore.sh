#!/usr/bin/env bash
# Restore a dump created by backup.sh / the backup container. DESTROYS current data.
# Usage: ./scripts/restore.sh backups/mysupplier-2026-09-15-0300.dump
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
[ -f "$1" ] || { echo "dump not found: $1" >&2; exit 1; }
read -r -p "This will overwrite database $POSTGRES_DB. Type RESTORE to continue: " ans
[ "$ans" = "RESTORE" ] || exit 1
docker compose -f docker-compose.prod.yml stop api
docker compose -f docker-compose.prod.yml exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < "$1"
docker compose -f docker-compose.prod.yml start api
echo "Restored $1"
