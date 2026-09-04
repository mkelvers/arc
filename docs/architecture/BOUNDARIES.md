# Arc architecture boundaries

## `@arc/shared`

Owns cross-runtime infrastructure shared by API, frontend, scheduler, core, and tests:

- generated AniList GraphQL documents and types
- handwritten AniList GraphQL operations
- the Drizzle database client, schema, and migration history

It does not own catalog workflows, provider clients, authentication, route behavior, or application-specific contracts.

## `@arc/core`

Is the final owner of required anime catalog, metadata, and later application fundamentals:

- AniList catalog normalization and validation
- catalog identity and discovery rules
- browse, search-card, homepage, detail, airing, and release-calendar shaping
- catalog persistence/query operations once migrated
- deliberate provider ports needed by catalog workflows

Core must expose intentional operations. Consumers must not import `@arc/core/internal/*` or reach through implementation files. Core is not a compatibility copy of backend; its modules should be redesigned around clear ownership.

## `@arc/backend` during migration

Is a disposable reference implementation for behavior that has not yet moved:

- compatibility wiring
- existing request/snapshot lifecycle until the core provider boundary exists
- application-level coordination during migration
- provider inventory, playback, user state, authentication, and other non-catalog behavior

Do not add new backend abstractions or improve backend internals. Do not fix backend consumers just to keep it green. Delete each backend implementation when its core replacement is established, even if later consumers still fail and require their own migration slice.

## Apps and routes

Routes own HTTP methods, authentication checks, response status, and page composition. They call core or application operations and do not assemble catalog internals.

## Tests

Tests live in the top-level `tests/` workspace. Tests should call public package exports and verify behavior at the smallest meaningful boundary.
