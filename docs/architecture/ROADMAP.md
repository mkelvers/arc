# Arc architecture roadmap

Arc is replacing `@arc/backend` with a smaller `@arc/core` catalog boundary. The migration is stacked on `refactor/core-package` and must preserve observable behavior and persisted meaning unless a change is explicitly approved.

## Rules

- New catalog behavior belongs in `@arc/core`.
- `@arc/backend` is temporary migration scaffolding, not a place to polish or redesign.
- Backend changes are limited to mechanical wiring, compatibility, behavior preservation, and deletion.
- Shared code must be cross-runtime infrastructure genuinely used by API, frontend, scheduler, core, or tests.
- Tests live in the top-level `tests/` workspace, outside production packages.
- Historical migrations and persisted data remain intact.
- Delete a helper when its operation has one owner; inline it at that owner.

## Completed

- Established `@arc/core` and moved catalog identity and discovery rules.
- Moved browse pagination, browse transformation, catalog cards, homepage selection, detail shaping, airing normalization, and release-calendar parsing into core.
- Moved focused tests into `tests/`.
- Moved the generic nullable-array utility to `@arc/core/utils/array`.
- Moved the database client, schema, and migration history into `@arc/shared`.
- Removed obsolete database SQL and migration runtime helpers.

## Remaining sequence

### 1. Catalog application boundary

Move catalog persistence and query composition out of backend-owned anime modules. Core should own catalog reads, refresh writes, taxonomy reads, and the deliberate interfaces consumed by routes and scheduler code.

Exit criteria:

- API and scheduler call named core catalog operations.
- Database tables remain owned by the catalog boundary.
- No route imports backend internals for catalog behavior.
- Existing refresh keys, filters, ordering, and persisted records remain compatible.

### 2. AniList catalog lifecycle

Give core a deliberate AniList catalog port for fetching metadata. Keep request retries, snapshot leases, and persistence behind the implementation boundary; callers must not import internal client modules.

Exit criteria:

- Core catalog operations depend on an explicit provider boundary.
- Snapshot and retry policy have one owner.
- Generated AniList GraphQL documents and types remain in `@arc/shared`.

### 3. Anime metadata and episode ownership

Move catalog-owned release, episode metadata, and schedule transformations into core where they are independent of playback and provider inventory. Keep episode synchronization orchestration and persistence ordering at the application boundary.

Exit criteria:

- Catalog metadata is separate from playback truth.
- Provider inventory remains the playback authority.
- Refresh and reconciliation behavior has external tests.

### 4. Consumer migration

Replace backend imports in API routes, scheduler jobs, and application operations with core interfaces. Remove backend-only catalog modules as each consumer leaves them.

Exit criteria:

- No production consumer requires `@arc/backend` for catalog behavior.
- Focused checks cover each migrated public boundary.
- The backend package can be deleted without compatibility shims.

### 5. Delete `@arc/backend`

Delete the package only after the core replacement, consumer migration, tests, and focused runtime checks are complete. Do not delete historical database migrations or user data.
