#!/bin/sh
set -eu

: "${DATABASE_URL:?Set DATABASE_URL to the exact Arc database to reset}"
: "${ARC_RESET_CONFIRM:?Set ARC_RESET_CONFIRM=reset-arc-database to continue}"

if [ "$ARC_RESET_CONFIRM" != 'reset-arc-database' ]; then
    echo 'Refusing reset: ARC_RESET_CONFIRM is incorrect.' >&2
    exit 1
fi

echo 'This permanently deletes every table in the selected Arc database.' >&2
printf 'Type reset-arc-database to continue: ' >&2
read confirmation
if [ "$confirmation" != 'reset-arc-database' ]; then
    echo 'Reset cancelled.' >&2
    exit 1
fi

psql "$DATABASE_URL" <<'SQL'
DROP SCHEMA public CASCADE;
DROP SCHEMA IF EXISTS drizzle CASCADE;
CREATE SCHEMA public;
CREATE SCHEMA drizzle;
SQL

echo 'Arc database reset. Start the API once to apply migrations.'
