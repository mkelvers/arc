# AniList persistence over cache

- Status: historical incident record; release consumers superseded by permanent `anime_release` persistence
- Date: 2026-08-24
- Origin: production incident after the local-to-production watchlist migration

## Incident summary

The current release-persistence and scheduler design is documented in [Scheduler-driven anime persistence](./scheduler-driven-anime-persistence.md). The cache paths below describe the incident-era implementation and are retained as historical context, not the current release read contract.

All 230 watchlist entries for `mkelvers` were migrated from the local database (`admin`) to the production database. The rows committed correctly, verified by state distribution on both sides (148 completed, 81 plan_to_watch, 1 watching). The production watchlist UI showed only 8 entries.

Cause, confirmed from API logs:

```text
GraphQLRequestError: The AniList API has been temporarily disabled
due to severe stability issues.
Watchlist metadata refresh failed; using cached values
```

AniList was down. The watchlist page depends on AniList card metadata at render time, so every entry without locally stored metadata disappeared from the page. Production's `anime_card_cache` contained only 8 rows at the time.

## Incident-era repaired behavior

### What persists

Release metadata and release cards are owned permanently by `anime_release`. Query, synopsis, franchise, and artwork workloads keep their separate stores (`anilist_query_cache`, `anime_synopsis_cache`, `anime_franchise_cache`, and `anime_artwork_cache`). The legacy `anime_card_cache` and `anime_details_cache` rows were backfilled into `anime_release`; migrated release consumers no longer read them, but the physical tables remain until the later contract deployment. A steady-state page load for a known release makes zero AniList requests.

### The watchlist render path

1. `GET /v1/watchlist` (`apps/api/src/routes/watchlist.ts`) calls `getWatchlistPage` (`packages/backend/src/watchlist/application.ts`).
2. `getWatchlistEntries` (`packages/backend/src/watchlist/store.ts`) reads the user's rows from the `watchlist` table joined to `anime_external_id` — pure DB, no AniList.
3. `getWatchlistAnime` resolves each stored AniList ID from `anime_release`. A missing permanent record enters the durable, rate-limited first-contact queue; known releases render without an AniList request.
4. `enrichAnimeCards` (`packages/backend/src/anime/card-enrichment.ts`) layers TMDB posters and synopses onto the cards.
5. `selectWatchlistEntries` combines cards with the stored watchlist rows. An entry without a card renders as a title-only placeholder. New interactive watchlist writes persist the title, existing titles are recovered from stored card, catalog, or detail data, and the last fallback is `Anime <id>`.

By contrast, `GET /v1/watchlist/states` reads only from the database and was unaffected by the outage — state badges across the app reflected all 230 entries throughout.

### Retention policy

The shared query client keeps every valid stored response. Expiry is scheduler information. It does not start AniList work during a page read. A missing query response still makes one coordinated first-contact request because Arc has no local result to show.

The API and scheduler share one PostgreSQL AniList lease and cooldown. The row records the last operation and cumulative request, success, and failure counts. A `Retry-After` response blocks both processes, including later cron invocations.

### Dynamic anime pages

A valid stored AniList detail record is returned before any external refresh. Finished releases never expire, including records written by an older cache revision that still pass the current schema. Releasing, upcoming, hiatus, and cancelled releases remain eligible for status-aware background refreshes. A passed airing event starts an immediate background refresh without delaying the current response.

Each season remains independent because AniList assigns it a separate release ID. A new Frieren season can therefore refresh without invalidating the stored details for an earlier finished season.

Stored TMDB mappings are also returned before their periodic revalidation, and stored episodes for finished releases are returned before metadata or classification maintenance. Missing details, mappings, artwork, or episode inventory still require first contact because Arc has no local value to display.

## Original diagnosis

**Gap 1 — the freshness rule sits on the critical path.** Staleness triggers a blocking refetch during render, and refetch failure silently drops content. Data we already own is thrown away from the user's point of view because a clock elapsed.

**Gap 2 — cold data has no local source.** Entries never browsed before have no stored metadata, so no amount of persistence helps them; first contact with a title necessarily requires AniList. Discussed mitigation: warm caches proactively (for example a scheduled job refreshing watchlist titles off-hours) instead of discovering cold entries on-request during a user's page load.

**Naming lies.** The tables are named `*_cache`, which describes disposable copies safe to purge. Under the target model they are the permanent source of truth. Renaming them would be honest but touches every import plus a migration, so it is deferred as churn without behavior change.

## Incident-era target model

Persist by mutability, not by one global clock:

- **Finished and cancelled** — retain permanently and audit every 90 days.
- **Not-yet-released or incomplete metadata** — retain and refresh daily so a planned title can transition into releasing.
- **Hiatus** — retain and refresh weekly.
- **RELEASING** — retain and refresh every 6 hours.
- **Nothing is deleted because of age.** Age decides whether a row is eligible for a background refresh; it never decides whether the row may be read or kept.

Render from the database alone:

- The watchlist page becomes a pure DB read of stored rows plus stored cards. AniList is never on the critical path.
- Missing metadata starts one coordinated first-contact request. Age alone never starts an AniList request from a page read.
- Cold entries that have no card yet render minimally from data Arc owns — `anime.title` is already stored — instead of disappearing from the page.

Browse and detail query-cache reads keep stored responses until an explicit scheduler or repair refresh replaces them.

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
- The scheduler refreshes mutable fixed snapshots. Arbitrary cold queries still make their unavoidable first-contact request.
- PostgreSQL retains AniList request leases, cooldowns, retry times, and counters across process restarts.
- Storage grows monotonically. Nothing is deleted for age, so tables grow for the lifetime of the deployment. Growth is slow (one row per title), but the cleanup path that existed before is gone by design.
- The `*_cache` names become actively misleading. Until a rename happens, the tables read as disposable even though they are the source of truth; a future contributor could reasonably add a purge job and destroy persistent state.
- First contact still requires AniList once per never-seen title. Persistence cannot produce data that was never fetched; the optional warming job reduces how often users hit that path, not whether it exists.

## Incident-era implementation status

- Implemented: permanent query reads, no age-based query deletion, database-only watchlist rendering, persisted watchlist titles, local title backfill, and pending metadata cards.
- Implemented: dynamic anime pages return valid stored finished details and episodes without blocking on AniList or periodic TMDB maintenance.
- Implemented: `/shows/new` reads provider-confirmed scheduler targets and stored catalog rows. It no longer runs the timestamp-varying recent-airing query.
- Implemented: the scheduler refreshes the current home and popular snapshots, taxonomy, simulcast range, and hero candidates once per day. Page reads keep the last valid snapshots.
- Deferred: `*_cache` table renames.

## Related context

The migration itself created bare identity rows (`anime`, `anime_external_id`, `anime_external_id_link`) for the 190 titles production had never seen, mirroring `ensureInternalAnimeId` (`packages/backend/src/anime/identity.ts`). Those rows carry titles but no cards. They now render as pending metadata cards while background enrichment retries AniList.
