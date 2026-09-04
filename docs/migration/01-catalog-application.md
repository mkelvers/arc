# Slice 1: catalog application boundary

## Objective

Make core the owner of catalog reads, refresh writes, taxonomy reads, query composition, and catalog-facing application operations. Routes and scheduler code should call named core operations instead of assembling backend internals.

## Behavior to understand

Inspect the current backend catalog application, browse, home, search, release-calendar, simulcast, and AniList modules. Preserve filter parsing, ordering, pagination, identity rules, refresh persistence, taxonomy semantics, and database write ordering. Do not preserve the backend module layout.

## Core design

- Keep catalog domain rules under `packages/core/src/catalog/`.
- Keep database access through `@arc/shared/db`.
- Expose a small set of direct operations from the core entrypoint.
- Keep HTTP status codes, authentication, response shapes, and route wording in `apps/api`.
- Keep AniList transport details for the lifecycle slice unless this slice needs a narrow port.

## Consumers

Audit and migrate `apps/api/src/routes/catalog.ts`, `apps/api/src/routes/anime.ts`, and the scheduler catalog entrypoints. Remove each consumer's backend catalog import as its replacement is ready.

## Remove after migration

Delete the replaced backend catalog application/read/write modules and any backend-only catalog wrappers. Do not add backend compatibility exports.

## Focused checks

- Core catalog tests for browse, search, refresh writes, taxonomy reads, pagination, and ordering.
- API route typecheck only as far as the moved consumers require.
- Import inventory proving catalog routes no longer depend on backend internals.
- `git diff --check`.

## Exit criteria

Core owns catalog application behavior, production catalog consumers call core operations, persistence behavior is covered, and the replaced backend files are deleted even if later backend consumers remain broken.
