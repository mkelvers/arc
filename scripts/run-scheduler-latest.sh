#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bun_bin="${BUN_BIN:-/home/mkelvers/.bun/bin/bun}"

git -C "$repo_dir" fetch --quiet origin main
git -C "$repo_dir" reset --quiet --hard origin/main
cd "$repo_dir"
"$bun_bin" install --frozen-lockfile --silent
"$bun_bin" run --cwd apps/scheduler build >/dev/null
exec "$bun_bin" "$repo_dir/apps/scheduler/dist/worker.js"
