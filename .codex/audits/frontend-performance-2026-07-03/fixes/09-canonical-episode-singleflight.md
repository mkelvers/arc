# Fix 09: deduplicate canonical episode refreshes

Priority: P2  
Risk: Medium  
Primary benefit: Provider load and cold anime-detail completion

## Issue

The anime detail page loads release information and audio availability as independent HTMX fragments. Both can call `EpisodeService.GetCanonicalEpisodes` at nearly the same time.

During the cold audit, logs showed two episode refreshes for the same anime starting together. The Jikan layer collapsed part of its own refresh, but provider-ID resolution, availability checks, merging, and cache writes still ran twice.

## Goal

Allow independent fragments to remain asynchronous while ensuring only one canonical-episode refresh runs for a given anime and refresh mode.

## Where to deduplicate

Keep the existing fast cache checks outside the shared refresh. Only enter request collapsing after the service has decided that provider/Jikan refresh work is required.

Suggested key:

```text
anime_id | refresh_policy
```

At minimum distinguish ordinary refresh from an explicit force refresh. A force refresh must not silently join a request that is intentionally serving an existing fresh cache entry.

## Proposed flow

1. Validate anime input.
2. Read the canonical episode cache.
3. Return immediately when it is fresh and the caller did not force refresh.
4. Enter a keyed singleflight refresh.
5. Recheck the cache inside the shared function; another request may have completed between steps 2 and 4.
6. Fetch Jikan/provider data once.
7. Merge and write the canonical cache once.
8. Return cloned result data to all waiting callers.

The second cache check is important. It prevents back-to-back refreshes caused by requests that both observed the same stale entry before either joined the shared call.

## Context and cancellation

Do not let one browser cancellation terminate useful work for all joined callers.

Recommended policy:

- Create a service-owned bounded refresh context using a strict timeout.
- Preserve tracing/request values when safe, but detach individual request cancellation.
- Let each waiting caller stop waiting when its own context is cancelled.
- Allow the shared refresh to finish for the cache and remaining callers.
- Stop all refreshes during application shutdown through a service lifecycle context if one is available.

Using the first caller's context directly is simpler but creates a fragile leader/follower relationship: closing one detail fragment can fail the other fragment's refresh.

## Result ownership

Canonical episode results contain slices. Return a clone to callers or treat the type as immutable by contract. Do not let one handler mutate data shared with another joined request or cache entry.

## Error behavior

- If refresh fails and stale canonical data is allowed by current policy, serve stale as today.
- All joined callers should observe the same refresh error/result.
- Do not negative-cache provider failures beyond the existing failure/backoff policy.
- Preserve failure counters and next-refresh timestamps exactly once.

## Affected files

- `internal/episodes/service/service.go`
- Optional helper under `internal/episodes/service/`
- Episode service constructor/state
- Episode service concurrency tests

## Tests

- Two concurrent ordinary refreshes call Jikan/provider once.
- Cache is rechecked inside the shared refresh.
- Force and ordinary refresh policies do not collide incorrectly.
- One caller cancellation does not cancel the refresh for another caller.
- All waiters receive equivalent cloned results.
- Failed refresh records failure once.
- Stale fallback behavior remains unchanged.
- Race detector passes under concurrent refresh tests.

Run the focused tests with `-race` because this change introduces shared state.

## Observability

Track:

- Refresh owner count.
- Joined caller count.
- Cache hit after joining/recheck.
- Shared refresh duration and result.
- Caller cancellation while waiting.

## Rollout

No route or template changes are required. Ship behind the service boundary, then verify that duplicate `episodes_refresh_start` events for one anime disappear under concurrent fragment loads.

## Acceptance criteria

- Concurrent release-info and audio-availability loads trigger one canonical refresh.
- No additional provider request occurs after the inner cache recheck.
- Caller cancellation does not poison unrelated waiters.
- Existing stale/failure semantics remain intact.
- `go test -race ./internal/episodes/...` passes.

