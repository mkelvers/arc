# Arc architecture roadmap

Arc is replacing `@arc/backend` with a deliberately designed `@arc/core`. The migration is integrated on `refactor/core-package` and preserves observable behavior and persisted meaning while reimplementing ownership and structure.

## Rules

- New catalog behavior belongs in `@arc/core`.
- `@arc/backend` is temporary migration scaffolding and a reference for behavior, not a package to keep working.
- Do not repair backend merely to make it compile. Backend failures are expected until all consumers have moved.
- Reimplement fundamentals in core, then delete the replaced backend implementation. Do not port backend structure or add compatibility wrappers just to preserve it.
- Shared code must be cross-runtime infrastructure genuinely used by API, frontend, scheduler, core, or tests.
- Tests live in the top-level `tests/` workspace, outside production packages.
- Historical migrations and persisted data remain intact.
- Delete a helper when its operation has one owner; inline it at that owner.
- Temporary core modules without a current owner, such as player, audio, search, season, and broad types modules, may be deleted and intentionally reintroduced later.

## Completed

- Established `@arc/core` and moved catalog identity and discovery rules.
- Moved browse pagination, browse transformation, catalog cards, homepage selection, detail shaping, airing normalization, and release-calendar parsing into core.
- Moved focused tests into `tests/`.
- Removed the one-use nullable-array helper by inlining its filtering at the catalog call sites.
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
