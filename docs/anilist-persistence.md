# AniList persistence over cache

- Status: stage 1 implemented (watchlist and shared query retention)
- Date: 2026-08-24
- Origin: production incident after the local-to-production watchlist migration

## Incident summary

All 230 watchlist entries for `mkelvers` were migrated from the local database (`admin`) to the production database. The rows committed correctly, verified by state distribution on both sides (148 completed, 81 plan_to_watch, 1 watching). The production watchlist UI showed only 8 entries.

Cause, confirmed from API logs:

```text
GraphQLRequestError: The AniList API has been temporarily disabled
due to severe stability issues.
Watchlist metadata refresh failed; using cached values
```

AniList was down. The watchlist page depends on AniList card metadata at render time, so every entry without locally stored metadata disappeared from the page. Production's `anime_card_cache` contained only 8 rows at the time.

## Current behavior

### What persists

Card, query, details, synopsis, franchise, and artwork data are stored in database tables (`anime_card_cache`, `anilist_query_cache`, `anime_details_cache`, `anime_synopsis_cache`, `anime_franchise_cache`, `anime_artwork_cache`, defined in `packages/db/src/schema/index.ts`). Reads are DB-first. A steady-state page load with warm tables makes zero AniList requests. Expired query rows remain readable and are refreshed in the background. Arc deletes malformed stored JSON, not usable data whose freshness window elapsed.

### The watchlist render path

1. `GET /v1/watchlist` (`apps/api/src/routes/watchlist.ts`) calls `getWatchlistPage` (`packages/backend/src/watchlist/application.ts`).
2. `getWatchlistEntries` (`packages/backend/src/watchlist/store.ts`) reads the user's rows from the `watchlist` table joined to `anime_external_id` — pure DB, no AniList.
3. `getWatchlistAnime` (`packages/backend/src/anime/anilist/watchlist.ts`) resolves each stored AniList ID to an `AnimeCard`:
    - It first reads `anime_card_cache`.
    - Stored cards are returned immediately regardless of age.
    - Missing or stale IDs start a batched background refresh. The request is rate-limited and deduplicated through the shared AniList client.
    - Results are written back to `anime_card_cache` (upsert on conflict).
    - The result is memoized in-process for 5 minutes.
4. `enrichAnimeCards` (`packages/backend/src/anime/card-enrichment.ts`) layers TMDB posters and synopses onto the cards.
5. `selectWatchlistEntries` combines cards with the stored watchlist rows. An entry without a card renders as a title-only placeholder. New interactive watchlist writes persist the title, existing titles are recovered from stored card, catalog, or detail data, and the last fallback is `Anime <id>`.

By contrast, `GET /v1/watchlist/states` reads only from the database and was unaffected by the outage — state badges across the app reflected all 230 entries throughout.

### Retention policy

The shared query client keeps each caller's freshness window, but expiry now starts one deduplicated background refresh and returns the stored response. Watchlist cards use status-aware refresh windows: 6 hours for releasing, one day for upcoming or incomplete metadata, one week for hiatus, and 90 days for finished or cancelled titles.

## Original diagnosis

**Gap 1 — the freshness rule sits on the critical path.** Staleness triggers a blocking refetch during render, and refetch failure silently drops content. Data we already own is thrown away from the user's point of view because a clock elapsed.

**Gap 2 — cold data has no local source.** Entries never browsed before have no stored metadata, so no amount of persistence helps them; first contact with a title necessarily requires AniList. Discussed mitigation: warm caches proactively (for example a scheduled job refreshing watchlist titles off-hours) instead of discovering cold entries on-request during a user's page load.

**Naming lies.** The tables are named `*_cache`, which describes disposable copies safe to purge. Under the target model they are the permanent source of truth. Renaming them would be honest but touches every import plus a migration, so it is deferred as churn without behavior change.

## Target model

Persist by mutability, not by one global clock:

- **Finished and cancelled** — retain permanently and audit every 90 days.
- **Not-yet-released or incomplete metadata** — retain and refresh daily so a planned title can transition into releasing.
- **Hiatus** — retain and refresh weekly.
- **RELEASING** — retain and refresh every 6 hours.
- **Nothing is deleted because of age.** Age decides whether a row is eligible for a background refresh; it never decides whether the row may be read or kept.

Render from the database alone:

- The watchlist page becomes a pure DB read of stored rows plus stored cards. AniList is never on the critical path.
- Missing or stale metadata starts a background refresh from an active read: batched (50 per AniList request), rate-limited, and deduplicated. A future worker may add proactive warming for inactive data.
- Cold entries that have no card yet render minimally from data Arc owns — `anime.title` is already stored — instead of disappearing from the page.

Browse and detail query-cache reads inherit stale-while-refresh behavior from the shared client. Their derived stores still need route-by-route review before the database-first rollout is complete.

Caveats discussed:

- If AniList returns degraded or starts rate-limiting, some background batches will still fail; the page stays fully rendered from the DB meanwhile and fills in incrementally across subsequent refresh attempts.
- The 5-minute in-process memoization remains useful to prevent hammering AniList on repeated loads.

## Consequences

**What improves**

- AniList outages no longer remove watchlist entries. The watchlist renders stored cards or title-only placeholders from the database.
- AniList request volume collapses in steady state. Finished shows are fetched every 90 days instead of daily, while releasing titles retain frequent updates. This lowers exposure to AniList rate limits.
- Watchlist loads get faster and more predictable. Metadata refresh never blocks the watchlist response.
- Cold entries are visible immediately with minimal data (stored title) instead of disappearing until first successful enrichment.

**What it costs or risks**

- Stored metadata can remain stale for its status-specific audit interval. A correction to a finished title may take up to 90 days to appear.
- Refreshes start from active reads. Data nobody visits will not refresh until a future worker provides proactive warming.
- Background work must be owned somewhere. Refresh scheduling lives inside the API process under this scope; that work has to be bounded and rate-limited so a large backlog (for example after a long outage) cannot hammer AniList or starve request handling. Durable retry across restarts is not solved by an in-process helper and may eventually want the future worker described in ADR 0001.
- Storage grows monotonically. Nothing is deleted for age, so tables grow for the lifetime of the deployment. Growth is slow (one row per title), but the cleanup path that existed before is gone by design.
- The `*_cache` names become actively misleading. Until a rename happens, the tables read as disposable even though they are the source of truth; a future contributor could reasonably add a purge job and destroy persistent state.
- First contact still requires AniList once per never-seen title. Persistence cannot produce data that was never fetched; the optional warming job reduces how often users hit that path, not whether it exists.

## Implementation status

- Implemented: shared stale query reads, no age-based query deletion, database-only watchlist rendering, status-aware background card refreshes, persisted watchlist titles, local title backfill, and pending metadata cards.
- Next stages: apply the same database-first read policy to each derived browse, detail, home, airing, and simulcast store, verifying one route group at a time.
- Deferred: scheduled warming worker and `*_cache` table renames.

## Related context

The migration itself created bare identity rows (`anime`, `anime_external_id`, `anime_external_id_link`) for the 190 titles production had never seen, mirroring `ensureInternalAnimeId` (`packages/backend/src/anime/identity.ts`). Those rows carry titles but no cards. They now render as pending metadata cards while background enrichment retries AniList.
