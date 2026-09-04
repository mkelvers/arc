# Arc architecture boundaries

## `@arc/shared`

Owns runtime-agnostic contracts and values shared by API, frontend, scheduler, and tests:

- generated AniList GraphQL documents and types
- request and response schemas used across runtimes
- shared media, browse, search, audio, and player types
- small generic utilities with multiple real consumers, such as nullable-array normalization

It does not own database access, provider clients, authentication, route behavior, or catalog workflows.

## `@arc/core`

Owns anime catalog and metadata behavior:

- AniList catalog normalization and validation
- catalog identity and discovery rules
- browse, search-card, homepage, detail, airing, and release-calendar shaping
- catalog persistence/query operations once migrated
- deliberate provider ports needed by catalog workflows

Core must expose intentional operations. Consumers must not import `@arc/core/internal/*` or reach through implementation files.

## `@arc/backend` during migration

Owns only temporary orchestration that has not yet moved:

- compatibility wiring
- existing request/snapshot lifecycle until the core provider boundary exists
- application-level coordination during migration
- provider inventory, playback, user state, authentication, and other non-catalog behavior

Do not add new backend abstractions or improve backend internals. Every backend change should make deletion closer and be removable when its consumer moves.

## Apps and routes

Routes own HTTP methods, authentication checks, response status, and page composition. They call core or application operations and do not assemble catalog internals.

## Tests

Tests live in the top-level `tests/` workspace. Tests should call public package exports and verify behavior at the smallest meaningful boundary.
