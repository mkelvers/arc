#!/bin/sh
set -eu

: "${DATABASE_URL:?Set DATABASE_URL to the exact Arc database}"

code=$(openssl rand -hex 24)
hash=$(printf '%s' "$code" | openssl dgst -sha256 -r | awk '{print $1}')

psql "$DATABASE_URL" -v code_hash="$hash" <<'SQL'
INSERT INTO invitations (code_hash, expires_at)
VALUES (:'code_hash', now() + interval '24 hours');
SQL

printf 'Invitation code (show once, valid for 24 hours): %s\n' "$code"
