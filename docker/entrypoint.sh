#!/bin/sh
set -e

echo "[$(date -Iseconds)] Clearing dist/ directory..."
rm -rf /app/dist/*
echo "[$(date -Iseconds)] dist/ cleared"

echo "[$(date -Iseconds)] Starting server..."
exec /app/main_server