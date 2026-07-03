# Fix 08: cache Simulcast discovery

Priority: P2  
Risk: Low to medium  
Primary benefit: Simulcast page latency and provider load

## Issue

`HandleSimulcast` first calls `LatestAvailableSeason`, which requests the next calendar season from AllAnime. It then calls `GetSimulcast`, which requests the selected season. These calls are serial.

The audit measured 1.38s before the page was ready. Seasonal data changes slowly relative to page views, so repeated synchronous provider requests are unnecessary.

## Goal

Cache seasonal show lists and latest-season discovery, reuse the next-season lookup when it is also the selected season, and serve stale data while refresh occurs.

## Proposed cache

Use one shared seasonal cache keyed by:

```text
normalized season | year
```

The latest-season check should call the same cached seasonal fetch function. If it fetches next season, `GetSimulcast` can reuse that entry rather than issuing another provider request.

Suggested policy:

- Fresh TTL: 30 minutes.
- Stale window: 6 hours.
- Maximum entries: 40 seasons, comfortably covering active navigation without unbounded growth.
- Empty next-season result: cache for 10 minutes, because availability can appear around season boundaries.
- Provider error: serve stale data when available.

## Stale-while-refresh behavior

1. Fresh entry: return immediately.
2. Stale entry: return stale immediately and start one background refresh.
3. Missing entry: fetch synchronously because there is no usable page data.
4. Failed missing fetch: preserve current error behavior.

Use singleflight keyed by season/year to collapse concurrent misses.

## Latest-season caching

The latest season is a derived value. It can either:

- Be cached separately for 30-60 minutes, or
- Be recomputed cheaply from the shared next-season cache.

Prefer the second option so there is one source of truth. Around a calendar-season rollover, use a shorter empty-result TTL to discover newly published shows promptly.

## Data ownership

Cache provider show values before converting them into template/domain anime values. Clone slices on read so handlers cannot mutate cached storage accidentally.

An in-memory cache is sufficient initially. Persisting seasonal data in SQLite adds migration and invalidation complexity without evidence that restart cold starts are a major problem.

## Affected files

- `internal/anime/discovery.go`
- `internal/anime/simulcast.go`
- `internal/anime/catalog_handler.go`
- Anime module wiring if a cache dependency is separated
- Simulcast/cache tests

## Tests

- Two requests for the same season call the provider once within TTL.
- Latest-season lookup populates the shared seasonal cache.
- Concurrent misses collapse into one provider call.
- Stale data is served while one refresh runs.
- Empty next season uses the shorter TTL.
- Different season/year keys do not collide.
- Cached slices are not mutable by callers.
- Provider failure serves stale data when available.

## Observability

Track seasonal cache hit, miss, stale-hit, refresh duration, provider error, and empty-next-season result. Do not log full provider payloads.

## Rollout

Ship in-memory caching without changing routes or templates. A configuration flag is optional but probably unnecessary because the fallback is simply cache miss behavior.

## Acceptance criteria

- Warm Simulcast requests do not call AllAnime.
- Latest-season and selected-season requests reuse the same cached fetch path.
- Warm page readiness is below 500ms locally and trends below 1 second at p75 in production.
- Seasonal data refreshes within the chosen TTL.
- Cache memory is bounded.
