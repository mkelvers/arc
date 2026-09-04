# Core migration intent

This migration replaces `@arc/backend` with a deliberately designed `@arc/core`. The goal is to preserve the product behavior and the fundamentals of the old implementation while changing ownership, boundaries, and structure. It is not a backend cleanup project and it is not a file-by-file port.

## Non-negotiable rules

- `@arc/core` is the final owner of the required domain and application fundamentals.
- `@arc/backend` is a temporary reference implementation. Read it to understand behavior, then reimplement that behavior in core.
- Do not repair, redesign, or keep backend green during the migration. Backend compile and test failures are expected while its consumers are being moved.
- When a behavior has a core replacement, delete the old backend implementation. Do not leave duplicate implementations or compatibility wrappers solely to keep backend compiling.
- A migrated backend file is not complete until its production consumers have a planned core owner and the old file can be removed.
- `@arc/shared` is limited to genuinely shared infrastructure. For now that means GraphQL documents/generated output and database access/schema/migrations.
- Temporary core modules with no current owner, including `player`, `audio`, `search`, `season`, and the broad `types` module, may be deleted. Reintroduce each capability later at the boundary where it is actually needed.
- Tests stay in the top-level `tests/` workspace, outside production packages.
- Prefer direct code and meaningful modules. Inline one-use values and operations instead of creating named constants or helpers with no independent rule, boundary, effect, or repeated contract.

## Current truth

The catalog migration is not complete. Core contains a meaningful portion of catalog shaping and primitives, but backend still owns important AniList lifecycle work, refresh/application orchestration, episode synchronization, TMDB metadata, and scheduler coordination. These are migration work, not backend maintenance work.

The integration branch may therefore be broken between migration slices. A slice is complete when its core behavior is tested at its public boundary and the old implementation is removed, even if the remaining backend consumers now fail until later slices move them.

## Completion condition

The migration is complete when all required backend behavior has a deliberate core owner, all consumers use the new owner, the obsolete backend package and api-contract package are deleted, and focused checks pass on the integrated branch. Historical migrations and persisted data are not deleted as part of this replacement.
