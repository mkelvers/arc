#!/usr/bin/env bash
set -euo pipefail

get_hash() {
    find . -name "*.go" -type f ! -path "./vendor/*" -exec sha256sum {} + | sha256sum | cut -d' ' -f1
}

echo "running go fix recursively until no changes..."

prev_hash=$(get_hash)
iteration=0

while true; do
    iteration=$((iteration + 1))
    echo "iteration $iteration..."

    go fix ./... >/dev/null 2>&1 || true

    curr_hash=$(get_hash)

    if [[ "$prev_hash" == "$curr_hash" ]]; then
        echo "no more changes after $iteration iteration(s)"
        break
    fi

    prev_hash=$curr_hash
done

echo "done"