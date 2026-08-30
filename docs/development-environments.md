# Development environments

Arc supports two local environments for testing against production-like data.

## Staging snapshot

Staging is the normal development environment. It uses a separate PostgreSQL database that can be replaced with a production snapshot.

Start the local database if needed:

```sh
COMPOSE_PROJECT_NAME=arc-staging POSTGRES_PORT=5434 \
    docker compose up -d --wait postgres
```

Set the database URLs in the shell or a local, untracked secret manager. Do not commit them:

```sh
export PRODUCTION_DATABASE_URL='postgresql://...'
export STAGING_DATABASE_URL='postgresql://arc:arc@127.0.0.1:5434/arc'
```

When production is reached through the homelab SSH tunnel, start it in another terminal:

```sh
ssh -N -L 15433:127.0.0.1:5433 homelab
```

Refresh staging. The command takes a rollback dump of the current staging data, then imports and retains the production snapshot:

```sh
./scripts/refresh-staging-db.sh
```

Run Arc with Vite and the API watcher. The scheduler is deliberately not started:

```sh
./scripts/dev-environment.sh staging
```

All writes affect only the staging database and can be discarded by refreshing it again.

## Production read-only diagnostics

Create a dedicated PostgreSQL login for diagnostics. It must not own the Arc database or tables and must have no write privileges. Run this once as an administrator, replacing the placeholders with secret values:

```sql
CREATE ROLE arc_diagnostic LOGIN PASSWORD '<password>';
GRANT CONNECT ON DATABASE arc TO arc_diagnostic;
GRANT USAGE ON SCHEMA public TO arc_diagnostic;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO arc_diagnostic;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO arc_diagnostic;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO arc_diagnostic;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO arc_diagnostic;
```

Set the read-only URL and run the local app:

```sh
export PRODUCTION_READONLY_DATABASE_URL='postgresql://arc_diagnostic:...'
./scripts/dev-environment.sh production-readonly
```

Arc also requests `default_transaction_read_only=on` for this mode. The database role is the actual protection; the session setting is defense in depth. Write requests should be expected to fail. Do not run migrations, invitation scripts, reset scripts, or the scheduler against this database.

Use staging for authenticated mutation testing. Local sign-in and registration need database writes, so the read-only diagnostic mode is intended for public and already-authenticated read paths.

## Boundaries

- Local code reloads immediately through Vite and Bun watchers.
- The API and SvelteKit app run locally; no deployment is required.
- The scheduler is never started by these commands.
- Production data is copied into staging, not exposed through a writable local connection.
- Keep production and diagnostic credentials outside `.env` files that could be shared or committed.
