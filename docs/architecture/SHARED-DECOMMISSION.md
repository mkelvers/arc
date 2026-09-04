# `@arc/shared` decommission plan

`@arc/shared` currently mixes several unrelated responsibilities. We are reducing it to the canonical GraphQL source tree first, then moving or deleting the remaining contracts by ownership.

## Current contents and destination

| Current area | Current job | Destination | Status |
| --- | --- | --- | --- |
| `src/anilist/generated` | Generated AniList GraphQL documents and types | `src/graphql/generated` | Move now |
| Backend `src/graphql/operations/anilist` | Handwritten AniList operations | `src/graphql/operations/anilist` | Move now |
| `src/graphql-error.ts` | GraphQL error contract | Core/provider boundary or a dedicated transport package | Keep temporarily |
| `src/browse.ts` | Browse URL/filter contract | Catalog boundary | Pending |
| `src/audio.ts` | Audio labels and modes | Playback/provider boundary | Pending |
| `src/search.ts` | Search result contracts and ranking | Catalog/search boundary | Pending |
| `src/season.ts` | Season parsing and selection | Catalog boundary | Pending |
| `src/types.ts` | Mixed catalog, playback, progress, and franchise types | Split by owner | Pending |
| `src/player/skip-times.ts` | Player skip contracts | Playback boundary | Pending |
| `src/utils/array.ts` | Generic nullable-array utility | Inline or move to its real multi-consumer owner | Pending |

## GraphQL rule

All handwritten GraphQL operations belong under `src/graphql/operations`. All generated GraphQL output belongs under `src/graphql/generated`. No other package may contain AniList `.graphql` operations or inline AniList query documents.

Generated output remains tracked for clean checkouts and package consumers. We can ignore it only after the repository build proves codegen runs before every consumer and a clean checkout remains buildable.

## Completion criteria

- Every remaining shared export has an explicit owner or is deleted.
- No production import points at an abandoned shared module.
- API contracts, frontend types, playback state, and catalog metadata retain their behavior.
- GraphQL codegen has one input tree and one output tree.
- The shared package contains only the documented GraphQL tree before it is removed or renamed.
