---
finding: "Move top-picks recommendation expansion off request path"
catalog: "Performance"
impact: "Top-picks requests can fan out into many Jikan calls, competing with rate limits and making the page slow on cache misses."
base_commit: "0d31d46"
---

## Effort

M - requires cache/materialization design plus tests around freshness and fallback behavior.

## Risk

MED - caching changes can alter recommendation freshness, ordering, and perceived personalization.

## Confidence

HIGH - recommendation handlers currently call the expansion engine during requests.

## Evidence

- `internal/anime/catalog_handler.go:43` calls `GetTopPickForYou` during the home HTMX request.
- `internal/anime/catalog_handler.go:86` calls `GetTopPicksForYou` during the full top-picks page request.
- `internal/anime/recommendations/engine.go:83-107` fetches seed anime and recommendations from Jikan.
- `internal/anime/recommendations/engine.go:209-215` may fetch individual candidate anime while scoring.
- `internal/anime/recommendations/constants.go:6-12` bounds the work, but the bounds still allow many provider calls per request.

## Resolution Approach

Introduce a cached or materialized recommendation result per user. The request path should first read a bounded cached result and render quickly. A refresh path can reuse the current recommendation engine to recompute candidates in the background or on explicit cache miss with a short timeout.

Preserve existing ranking logic initially. This plan should not redesign recommendation scoring; it should move expensive expansion away from synchronous rendering. Prefer stale-while-refresh behavior if the app already has enough data to show previous recommendations.

Define freshness explicitly, for example a short TTL for active users and invalidation when watchlist entries change. Add tests around cache hit, cache miss, stale fallback, and provider failure. Include observability logs for refresh failures without breaking the page when stale data is available.

Verify with `go test ./internal/anime/... ./integrations/jikan/...` and the existing full `go test ./...` suite.
