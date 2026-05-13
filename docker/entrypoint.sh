#!/bin/sh
set -e

echo "[$(date -Iseconds)] Checking dist directory contents:"
ls -la /app/dist/
echo "[$(date -Iseconds)] Starting server..."
exec /app/main_server