#!/bin/sh
# Runs migrations (when AUTO_CREATE_TABLES=0) then starts the API with N workers.
set -e
if [ "${AUTO_CREATE_TABLES:-1}" = "0" ]; then
  echo "Running database migrations..."
  alembic upgrade head
fi
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers "${WEB_CONCURRENCY:-2}" --proxy-headers --forwarded-allow-ips="*"
