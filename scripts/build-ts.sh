#!/usr/bin/env bash
set -euo pipefail

started_at=$(date +%s%N)

steps=(
    "player:bun build ./static/player/main.ts --outdir ./dist/static/player --target browser --splitting"
    "app:bun build ./static/app.ts --outdir ./dist/static --target browser --root ./static --entry-naming [name].js"
)

for step in "${steps[@]}"; do
    name="${step%%:*}"
    cmd="${step#*:}"
    echo "building $name..."
    if ! eval "$cmd"; then
        echo "ts build failed at $name" >&2
        exit 1
    fi
done

mkdir -p ./dist/static
cp ./node_modules/htmx.org/dist/htmx.min.js ./dist/static/htmx-lib.js

total_entries=2
elapsed_ms=$((($(date +%s%N) - started_at) / 1000000))
echo "ts build ok ($total_entries entries, ${elapsed_ms}ms)"