#!/bin/sh
set -eu

bun dist/migrate.js
exec "$@"
