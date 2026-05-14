#!/bin/sh
set -e

# Print diagnostic info
echo "[$(date -Iseconds)] Running as user: $(id)"
echo "[$(date -Iseconds)] Database file: $DATABASE_FILE"

if [ -f "/app/main_server" ]; then
    echo "[$(date -Iseconds)] main_server found, size: $(stat -c%s /app/main_server) bytes"
    chmod +x /app/main_server
else
    echo "[$(date -Iseconds)] ERROR: /app/main_server not found!"
    exit 1
fi

echo "[$(date -Iseconds)] Starting server..."
exec /app/main_server
