# AniList persistence over cache

- Status: proposed (not implemented)
- Date: 2026-08-24
- Origin: production incident after the local-to-production watchlist migration

## Incident summary

All 230 watchlist entries for `mkelvers` were migrated from the local database
(`admin`) to the production database. The rows committed correctly, verified by
state distribution on both sides (148 completed, 81 plan_to_watch, 1 watching).
The production watchlist UI showed only 8 entries.

Cause, confirmed from API logs:

```text
GraphQLRequestError: The AniList API has been temporarily disabled
due to severe stability issues.
Watchlist metadata refresh failed; using cached values
```

AniList was down. The watchlist page depends on AniList card metadata at render
time, so every entry without locally stored metadata disappeared from the page.
Production's `anime_card_cache` contained only 8 rows at the time.

## Current behavior

### What already persists

Card, query, details, synopsis, franchise, and artwork data are stored in
database tables (`anime_card_cache`, `anilist_query_cache`,
`anime_details_cache`, `anime_synopsis_cache`, `anime_franchise_cache`,
`anime_artwork_cache`, defined in `packages/db/src/schema/index.ts`). Reads are
DB-first. A steady-state page load with warm tables makes zero AniList
requests. The system is therefore closer to "persist then refresh" than to a
request proxy — but the retention policy undoes much of that advantage.

### The watchlist render path

1. `GET /v1/watchlist` (`apps/api/src/routes/watchlist.ts`) calls
   `getWatchlistPage` (`packages/backend/src/watchlist/application.ts`).
2. `getWatchlistEntries`
   (`packages/backend/src/watchlist/store.ts`) reads the user's rows from the
   `watchlist` table joined to `anime_external_id` — pure DB, no AniList.
3. `getWatchlistAnime`
   (`packages/backend/src/anime/anilist/watchlist.ts`) resolves each stored
   AniList ID to an `AnimeCard`:
   - It first reads `anime_card_cache`.
   - IDs that are missing or older than 24 hours are fetched from AniList
     synchronously during the request, in batches of 50.
   - Results are written back to `anime_card_cache` (upsert on conflict).
   - If the AniList request fails and *some* rows exist in the table, it logs
     "using cached values" and returns only what was stored — entries that were
     never cached simply vanish.
   - The result is memoized in-process for 5 minutes.
4. `enrichAnimeCards` (`packages/backend/src/anime/card-enrichment.ts`) layers
   TMDB posters and synopses onto the cards.
5. `selectWatchlistEntries` intersects the cards with the stored watchlist
   rows. An entry with no card cannot appear, regardless of its database row.

By contrast, `GET /v1/watchlist/states` reads only from the database and was
unaffected by the outage — state badges across the app reflected all 230
entries throughout.

### Retention policy

`packages/backend/src/anime/anilist/client.ts` applies a default 24-hour
freshness window to everything, including `anilist_query_cache`. Two
consequences:

- Expired rows are deleted by a periodic cleanup pass, and stale rows are
  treated as unusable until refreshed.
- Refreshing happens synchronously inside page renders: the first load after
  expiry blocks on AniList, and any AniList failure degrades the page to
  whatever happens to be stored.

Finished shows from years ago are re-fetched on the same schedule as shows
airing this week.

## Diagnosis

**Gap 1 — the freshness rule sits on the critical path.** Staleness triggers a
blocking refetch during render, and refetch failure silently drops content.
Data we already own is thrown away from the user's point of view because a
clock elapsed.

**Gap 2 — cold data has no local source.** Entries never browsed before have
no stored metadata, so no amount of persistence helps them; first contact with
a title necessarily requires AniList. Discussed mitigation: warm caches
proactively (for example a scheduled job refreshing watchlist titles off-hours)
instead of discovering cold entries on-request during a user's page load.

**Naming lies.** The tables are named `*_cache`, which describes disposable
copies safe to purge. Under the target model they are the permanent source of
truth. Renaming them would be honest but touches every import plus a migration,
so it is deferred as churn without behavior change.

## Target model

Persist by mutability, not by clock:

- **Finished, not-yet-released, cancelled, hiatus** — persist forever, never
  re-fetched. Metadata for these is effectively immutable.
- **RELEASING** — the only category needing updates (episode counts, airing
  status). Short freshness window, refreshed exclusively in the background.
- **Nothing is deleted because of age.** Age decides whether a row is eligible
  for a background refresh; it never decides whether the row may be read or
  kept.

Render from the database alone:

- The watchlist page becomes a pure DB read of stored rows plus stored cards.
  AniList is never on the critical path.
- Missing or stale metadata is queued into a background refresh: batched (50
  per AniList request, as today), rate-limited, and spaced out rather than
  fired all at once.
- Cold entries that have no card yet render minimally from data Arc owns —
  `anime.title` is already stored — instead of disappearing from the page.

Browse and detail routes inherit the same policy through the shared client,
so fixing the policy fixes them too.

Caveats discussed:

- If AniList returns degraded or starts rate-limiting, some background batches
  will still fail; the page stays fully rendered from the DB meanwhile and
  fills in incrementally across subsequent refresh attempts.
- The 5-minute in-process memoization remains useful to prevent hammering
  AniList on repeated loads.

## Consequences

**What improves**

- AniList outages stop being visible to users. Pages render entirely from the
  database; the failure mode seen in this incident (entries silently vanishing)
  cannot recur for any title that has been fetched at least once.
- AniList request volume collapses in steady state. Finished shows are fetched
  once, ever, so daily traffic shrinks to releasing titles only. This also
  lowers exposure to AniList rate limits and their current degraded limits.
- Page loads get faster and more predictable. No request ever blocks on a
  synchronous metadata refresh; worst-case latency becomes the database read.
- Cold entries are visible immediately with minimal data (stored title) instead
  of disappearing until first successful enrichment.

**What it costs or risks**

- Stale data can be shown indefinitely. If upstream metadata for a
  non-releasing title actually changes — an AniList correction, a retitled
  show, shifted dates — Arc will not notice, because nothing is re-fetched.
  Correctness now depends on AniList being immutable for finished titles,
  which is mostly but not perfectly true.
- The "not-yet-released" bucket ages into a problem. A planned show that
  starts airing is exactly the case the user-stated rule ("persist everything
  forever except if the anime is aired") excludes from refreshes, yet its
  episode counts and airing status start changing at that moment. The
  implementation needs to decide how a stored title transitions into the
  RELEASING policy — otherwise planned shows freeze the day they are added.
- Background work must be owned somewhere. Refresh scheduling lives inside the
  API process under this scope; that work has to be bounded and rate-limited so
  a large backlog (for example after a long outage) cannot hammer AniList or
  starve request handling. Durable retry across restarts is not solved by an
  in-process helper and may eventually want the future worker described in
  ADR 0001.
- Storage grows monotonically. Nothing is deleted for age, so tables grow for
  the lifetime of the deployment. Growth is slow (one row per title), but the
  cleanup path that existed before is gone by design.
- The `*_cache` names become actively misleading. Until a rename happens, the
  tables read as disposable even though they are the source of truth; a future
  contributor could reasonably add a purge job and destroy persistent state.
- First contact still requires AniList once per never-seen title. Persistence
  cannot produce data that was never fetched; the optional warming job reduces
  how often users hit that path, not whether it exists.

## Implementation scope (when picked up)

- `packages/backend/src/anime/anilist/client.ts` — per-status freshness policy;
  stop deleting rows on expiry.
- `packages/backend/src/anime/anilist/watchlist.ts` — serve from DB
  unconditionally; move refresh out of the render path.
- `packages/backend/src/anime/card-enrichment.ts` — unchanged read path, but no
  longer able to fail the render.
- New background refresh helper under `packages/backend/src/anime/anilist/` for
  batched, rate-limited, spaced refresh scheduling.
- Optional follow-up: scheduled warming job; deferred `*_cache` table renames.

## Related context

The migration itself created bare identity rows (`anime`, `anime_external_id`,
`anime_external_id_link`) for the 190 titles production had never seen,
mirroring `ensureInternalAnimeId`
(`packages/backend/src/anime/identity.ts`). Those rows carry titles but no
cards; under the current model they are invisible on the watchlist page until
AniList recovers and their metadata is first fetched. Under the proposed model
they would render minimally immediately.
