#!/bin/sh
set -e

: "${DATABASE_FILE:=/app/data/mal.db}"

if [ ! -x /app/main_server ]; then
  echo "ERROR: /app/main_server not found or not executable" >&2
  exit 1
fi

exec /app/main_server

