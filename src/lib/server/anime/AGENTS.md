# Server anime domain

Import concrete operations from their owning modules. Do not recreate the deleted `anime` aggregate, `anilist`/`tmdb` object facades, single-module barrels, or collection objects whose methods simply forward to local functions.

`anilist/types.ts` is the single owner of the generated AniList media shape used across providers, episodes, and TMDB enrichment. Import that type directly instead of redeclaring or re-exporting it in each subdomain. Provider-specific types stay with their provider.

AniList and AllAnime client modules are allowed because they own different endpoints and transport policies. The shared GraphQL module owns HTTP behavior, bounded transient retries, payload validation, and diagnostic errors. Do not add per-operation Promise/Effect adapters around it.

Provider adapters under `providers` are meaningful when they translate a provider inventory and stream protocol into `PlaybackProvider`. A short adapter is not automatically shallow. By contrast, an object that merely renames `getEpisodes` or `getStreams` without provider policy should be deleted.

Keep security and protocol rules named when the name explains why the code exists. Stream host allowlists, provider referers, redirect limits, content-size limits, and playlist rewriting are not incidental wrappers even when an individual expression is short. Keep route-specific status codes and user-facing messages at the route boundary.

The internal episode refresh route is an authenticated machine-facing adapter; `internal` describes its trust boundary. Do not remove or relocate it based on the folder name alone.
