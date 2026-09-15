#!/usr/bin/env bash
# Manual backup + optional off-site copy (S3-compatible: AWS S3, Oracle OCI, Backblaze, MinIO).
# Usage: ./scripts/backup.sh [s3://bucket/path]
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
FILE="backups/mysupplier-$(date +%F-%H%M).dump"
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c > "$FILE"
echo "Wrote $FILE ($(du -h "$FILE" | cut -f1))"
if [ "${1:-}" != "" ]; then aws s3 cp "$FILE" "$1/" && echo "Uploaded to $1"; fi
