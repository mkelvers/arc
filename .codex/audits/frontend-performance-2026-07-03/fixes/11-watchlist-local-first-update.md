# Fix 11: make watchlist updates local-first

Priority: P2  
Risk: Low to medium  
Primary benefit: Existing-anime watchlist mutation latency

## Issue

`watchlistService.UpdateEntry` calls `GetAnimeByID` before entering the transaction for every update. It later checks whether the anime row already exists.

This means changing an existing watchlist entry can wait on Jikan even though all required anime data is already stored locally. During the audit, adding an uncached anime took roughly 0.59s on the server. The frontend hides much of this with optimistic UI, but unnecessary network dependency still increases failure and rollback risk.

## Goal

- Existing anime rows: update watchlist state using SQLite only.
- Missing anime rows: fetch metadata, insert/upsert anime, then create the watchlist entry.
- Preserve atomic watchlist writes and optimistic client rollback.

## Proposed flow

```text
validate request
  -> read anime row
     -> exists: skip Jikan
     -> missing: fetch Jikan metadata
  -> transaction
     -> ensure anime row when fetched
     -> read existing watchlist progress
     -> upsert watchlist entry
  -> invalidate/start recommendation refresh
```

## Transaction strategy

Perform the initial existence check outside the write transaction so a slow network request never holds a SQLite transaction open.

Inside the transaction:

- Recheck or use `INSERT ... ON CONFLICT` when metadata was fetched; another request may have inserted the anime meanwhile.
- Preserve existing progress fields exactly as the current implementation does.
- Upsert the watchlist entry atomically.

The preflight read is an optimization hint, not an integrity guarantee. Database constraints and the transaction remain authoritative.

## Missing-anime failure

If the anime row is missing and Jikan fetch fails, return a clear service error before attempting a foreign-key-invalid watchlist insert. The client should roll back its optimistic state and show the existing failure toast.

Do not create placeholder anime rows unless a separate product decision defines acceptable placeholder title/image semantics. The current schema requires meaningful non-null anime data.

## Existing-anime refresh policy

Skipping Jikan means local metadata may age. That is a separate concern from changing watchlist status. If metadata refresh is needed:

- Queue/best-effort refresh in the background after the mutation, or
- Let existing catalog/detail refresh paths maintain metadata.

Do not keep the user action blocked solely to refresh display metadata.

## Recommendation invalidation

Invalidate or start recommendation refresh only after the transaction commits. Integrate with Fix 07 so existing recommendations become stale and refresh begins immediately.

## Affected files

- `internal/watchlist/service.go`
- Watchlist repository interface only if a more direct existence query is added
- Watchlist service tests

## Tests

- Existing anime update does not call Jikan.
- Missing anime fetches Jikan once and inserts anime before watchlist entry.
- Concurrent missing-anime updates remain correct under conflict.
- Missing anime plus provider failure returns a clear error and writes nothing.
- Existing progress is preserved.
- Recommendation invalidation occurs only after commit.
- Transaction failure does not invalidate recommendations.

## Observability

Track local-hit versus metadata-fetch update paths and mutation duration. This should make it obvious whether most watchlist actions are DB-only.

## Rollout

This is an internal service refactor with no contract change. Preserve the existing API and optimistic frontend. Verify mutation latency and rollback rate after release.

## Acceptance criteria

- Status changes for known anime issue no external request.
- Missing anime is inserted safely before the watchlist entry.
- Failed metadata fetch writes nothing.
- Existing progress remains unchanged.
- Recommendation invalidation happens after a successful commit only.

