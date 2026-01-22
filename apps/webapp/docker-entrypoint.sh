#!/bin/sh
set -e

echo "Waiting for postgres to be ready..."
until pg_isready -h postgres -U kontexted -p 5432 > /dev/null 2>&1; do
  echo "Postgres is unavailable - sleeping"
  sleep 1
done

echo "Postgres is ready! Running migrations..."
cd /app/apps/webapp && bun db:migrate && cd /app

echo "Migrations completed. Starting webapp..."
cd /app/apps/webapp && exec bun start
