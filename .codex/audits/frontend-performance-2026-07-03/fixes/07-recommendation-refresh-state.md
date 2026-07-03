# Fix 07: represent recommendation refresh state

Priority: P1  
Risk: Medium  
Primary benefit: Honest background behavior and automatic completion

## Issue

Recommendation computation already runs in the background, which is the right architecture. The cache contract loses an important distinction, however:

- The user has no usable watchlist signal.
- Recommendations are currently being computed.
- Computation failed.
- Stale recommendations exist while refresh runs.

On a cold cache, `getCachedTopPicksForYou` starts a goroutine and immediately returns an empty anime slice. The UI therefore renders “No top picks yet—add a few anime” even when the user just added an anime and a roughly ten-second computation is active. Results appear only after a manual reload.

## Goal

Preserve asynchronous computation while returning an explicit state that lets the UI show the truth and update automatically.

## Proposed domain model

Add a typed state to recommendation results:

```text
empty       no usable signals after a completed computation
refreshing  no result yet; computation in progress
ready       current result available
stale       previous result shown while refresh runs
failed      no result and the latest computation failed
```

Include only the minimum supporting metadata needed by the UI, such as `retryAfter` or `updatedAt`. Do not expose internal provider errors.

## Cache behavior

### First request, no entry

1. Create an entry with `refreshing=true`.
2. Start the background computation.
3. Return `refreshing` with no items.

### Fresh data

Return `ready` immediately.

### Expired data

1. Preserve the old data.
2. Mark refresh in progress.
3. Return `stale` with old items.
4. Refresh in the background.

### Watchlist mutation

Do not delete the cache entry. Mark it stale and start refresh immediately. This preserves existing recommendations while the new profile is computed.

### Completed empty result

Store a completed `empty` result so every request does not restart computation.

### Failure

- With stale data: keep serving stale and record refresh failure.
- Without data: return `failed` with Retry.
- Use bounded retry/backoff; do not restart on every poll.

## HTMX update flow

The simplest UI is an outer fragment that polls only while state is `refreshing`:

```html
<section
  hx-get="/api/catalog/top-pick"
  hx-trigger="every 2s"
  hx-swap="outerHTML"
  aria-busy="true">
  <p role="status">Preparing recommendations…</p>
</section>
```

When the server returns `ready`, `stale`, `empty`, or `failed`, render markup without the polling trigger. Replacing the polling element naturally stops polling. HTTP status `286` can also stop polling, but removing the trigger from the final fragment is easier to inspect and does not depend on status-specific behavior.

Use a two-second interval rather than aggressive sub-second polling. The job takes seconds and does not need real-time granularity.

For the full Top Picks page, use the same state-aware fragment or a small page-specific status endpoint. Avoid duplicating state rules between home and `/top-picks`.

## Request synchronization

Ensure one client poll is active at a time. If a poll response can exceed the interval, use an HTMX synchronization policy or a longer interval. Server-side cache locking/singleflight remains authoritative; client synchronization is only a traffic guard.

## Copy

- Refreshing with no data: “Preparing recommendations…”
- Stale: keep cards visible; optional subtle “Updating…” text.
- Completed empty: current “Add a few anime…” guidance.
- Failed with no data: “Recommendations could not be prepared.” plus Retry.

Do not show provider or scoring implementation details to the user.

## Affected files

- `internal/anime/recommendations.go`
- Recommendation/cache domain types
- Recommendation invalidator interface and watchlist integration
- `internal/anime/catalog_handler.go`
- `templates/index.gohtml`
- `templates/top_picks.gohtml`
- Recommendation and handler tests

## Tests

- Cold cache returns `refreshing`, not `empty`.
- Completed empty computation returns `empty` and is cached.
- Fresh data returns `ready`.
- Expired data returns stale cards and starts exactly one refresh.
- Watchlist mutation preserves stale cards and starts refresh immediately.
- Failure preserves stale data when available.
- Final fragments do not continue polling.
- Home and Top Picks use the same state rules.

## Observability

Track:

- Refresh started/completed/failed.
- Refresh duration.
- Ready/stale/refreshing/empty responses.
- Poll count per refresh.
- Number of refreshes joined or suppressed.

## Rollout

Ship the state contract, server rendering, and templates together. During rollout, tolerate missing/zero state as `empty` only for compatibility with old tests; remove that fallback after all call sites are migrated.

## Acceptance criteria

- A cold recommendation build never displays the completed-empty message.
- Results appear without manual page reload.
- Existing cards remain visible during refresh.
- Exactly one computation runs per cache key.
- Polling stops after a terminal state.
- Failure has a visible bounded Retry path.

## Reference

- [HTMX polling and progress pattern](https://github.com/bigskysoftware/htmx/blob/v2.0.4/www/content/examples/progress-bar.md)

