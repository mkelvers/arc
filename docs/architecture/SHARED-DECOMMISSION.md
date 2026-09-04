# `@arc/shared` decommission plan

`@arc/shared` previously mixed unrelated application contracts with infrastructure. It now contains the two cross-runtime infrastructure concerns that still need one source of truth: GraphQL and the database. The table below records what the removed modules did and where their behavior lives now.

## Current contents and destination

| Former area | Former job | Destination | Status |
| --- | --- | --- | --- |
| `src/anilist/generated` | Generated AniList GraphQL documents and types | `src/graphql/generated` | Move now |
| Backend `src/graphql/operations/anilist` | Handwritten AniList operations | `src/graphql/operations/anilist` | Move now |
| `src/graphql-error.ts` | GraphQL error contract | `@arc/core/graphql/error` | Moved |
| `src/browse.ts` | Browse URL/filter contract | `@arc/core/catalog/browse-filters` | Moved |
| `src/audio.ts` | Audio labels and modes | `@arc/core/audio` | Moved |
| `src/search.ts` | Search result contracts and ranking | `@arc/core/search` | Moved |
| `src/season.ts` | Season parsing and selection | `@arc/core/season` | Moved |
| `src/types.ts` | Mixed catalog, playback, progress, and franchise types | `@arc/core/types` | Moved; split later if needed |
| `src/player/skip-times.ts` | Player skip contracts | `@arc/core/player/skip-times` | Moved |
| `src/utils/array.ts` | Generic nullable-array utility | `@arc/core/utils/array` | Moved |
| `@arc/db/src/index.ts` | Drizzle client and transaction type | `@arc/shared/db` | Moved |
| `@arc/db/src/schema/index.ts` | Database schema and inferred persistence types | `@arc/shared/db/schema` | Moved |
| `@arc/db/drizzle` | Historical migration files | `@arc/shared/drizzle` | Moved intact |

## Infrastructure rules

All handwritten GraphQL operations belong under `src/graphql/operations`. All generated GraphQL output belongs under `src/graphql/generated`. No other package may contain AniList `.graphql` operations or inline AniList query documents.

Generated output remains tracked for clean checkouts and package consumers. We can ignore it only after the repository build proves codegen runs before every consumer and a clean checkout remains buildable.

The database client, schema, and migration history belong in this same package because API, scheduler, core, and the temporary backend all share the persistence boundary. Database-specific runtime helpers do not belong here unless they own a real database boundary.

## Completion criteria

- Every remaining shared export has an explicit owner or is deleted.
- No production import points at an abandoned shared module.
- API contracts, frontend types, playback state, and catalog metadata retain their behavior.
- GraphQL codegen has one input tree and one output tree.
- The shared package contains only the documented GraphQL and database trees.
