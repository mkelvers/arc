# Conflicts / Remaining Issues

1. **God interface (`AnimeService`)**
   - `internal/domain/anime.go` still defines a large `AnimeService` interface (catalog + discover + search + details + staff/stats/reviews).
   - Needs to be split into smaller interfaces (ISP) and rewired through handlers/services.

2. **Domain layer still leaks external models**
   - While `domain.User` and `domain.Anime` are now real types, many other domain types are still direct aliases to integration/DB types (e.g. `Genre`, `Recommendation`, etc. in `internal/domain/anime.go`).
   - Goal is a stable domain model that does not break if Jikan/DB structs change.

3. **No real DB transactions for multi-write operations**
   - Multi-step writes (e.g. playback completion / watchlist updates) still do not run inside a database transaction.
   - Errors are no longer swallowed in several places, but atomicity is still not guaranteed.

4. **DiceBear URL duplication**
   - Default avatar URL logic is duplicated in `cmd/user/main.go` and `internal/database/migrations/016_add_avatar_url.sql`.
   - Needs centralization (or migration updated to match single source of truth).

5. **AllAnime package-level shared HTTP client**
   - `integrations/playback/allanime/client.go` still has a package-level mutable `http.Client` (`allAnimeUTLSClient`).
   - Should be instance-owned or injected to avoid cross-test/env coupling.

6. **Regex-based parsing of upstream JSON-ish responses**
   - `integrations/playback/allanime/extractor.go` still parses provider responses using regex.
   - Should be replaced with real JSON decoding (or a more robust parser) where possible.

7. **Template duplication / drift risk**
   - `templates/watchlist.gohtml` and `templates/watchlist_partial.gohtml` are still separate with overlapping markup.
   - Inline JS was removed, but the duplication itself remains and can still drift.

8. **Remaining handler consistency**
   - Some modules still have duplicated user extraction patterns and could be unified (e.g. `currentUser()` helper usage beyond playback).

