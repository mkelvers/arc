# Fix 10: parallelize watch-data assembly

Priority: P2  
Risk: Medium  
Primary benefit: Watch-page server response time

## Issue

After anime metadata and canonical episodes are available, `BuildWatchData` performs several independent operations serially:

- Stream/mode-source resolution.
- Watch progress and watchlist status lookup.
- Season/relation loading.
- Skip-segment lookup.

The audited watch page spent roughly 0.46s in the server on the first tested request. Media startup was the larger problem, but shortening server work makes the shell and source token available sooner.

## Goal

Run independent work concurrently without hiding errors, breaking cancellation, or increasing provider load uncontrollably.

## Dependency boundary

Keep these steps serial:

1. Fetch anime metadata.
2. Ensure the local anime row.
3. Build title candidates.
4. Load canonical episodes.
5. Resolve requested mode/fallback policy from episode availability.

After step 5, these operations can run concurrently:

- Resolve stream source for the requested/fallback mode.
- Load watch progress/status.
- Load seasons/relations.
- Load skip-segment overrides.

Build the final payload only after all required results have joined.

## Error classification

Not every operation has the same severity:

- Stream resolution: required for playable success; preserve current no-stream error behavior.
- Progress lookup: user-state concern; decide whether failure should fail the page or render from zero. Do not silently change existing semantics.
- Seasons/relations: optional enhancement; current code already logs and returns an empty list on failure.
- Skip segments: optional enhancement; current code logs and continues.

Represent these policies explicitly instead of relying on whichever goroutine returns first.

## Concurrency mechanism

Use a small fixed group of goroutines tied to the request context. Four operations are enough; do not introduce a generic worker pool.

Each goroutine writes only to its own result variable. Join before reading any result. Run the race detector.

If using an error group, do not let an optional seasons error cancel required stream resolution. Either:

- Handle optional errors inside their goroutines and return nil, or
- Use separate result wrappers and join all operations before applying severity rules.

## Provider pressure

Stream resolution and season/relation loading may both touch external systems when caches are cold. Concurrency can reduce latency but increase burst pressure. Mitigations:

- Land Fix 05 source caching and Fix 09 deduplication first where practical.
- Rely on existing Jikan rate limiting/cache behavior.
- Keep concurrency bounded to the fixed set above.
- Measure upstream retry/rate-limit events before and after rollout.

## Cancellation

- Request cancellation should stop all request-owned operations.
- Background warm-up should remain separately bounded and should not inherit an already cancelled context.
- Do not detach operations that are useful only for the current response.

## Affected files

- `internal/playback/watch_data.go`
- Playback service tests
- Optional observability timing helpers

## Tests

- All independent functions start before the slowest one completes.
- Payload matches the previous serial implementation.
- Required stream failure produces the same page error.
- Optional season/segment failures continue with empty data and log once.
- Request cancellation stops outstanding request work.
- No result variable race occurs.
- Existing mode fallback remains correct.

Use deterministic fake functions/channels rather than timing-sensitive sleeps in concurrency tests.

## Observability

Add spans/timers for:

- Anime metadata.
- Canonical episodes.
- Stream resolution.
- Progress lookup.
- Seasons lookup.
- Segment lookup.
- Total `BuildWatchData`.

The goal is to confirm that total time approaches the slowest parallel branch rather than the sum of all branches.

## Rollout

Refactor with behavior-preserving tests first. Ship after source caching if possible. Compare total watch-data duration, upstream request count, and rate-limit errors.

## Acceptance criteria

- Independent branches overlap in tests and tracing.
- Watch-page data is behaviorally identical.
- Optional failures retain current fallback behavior.
- Server watch-page duration decreases without increased provider error rate.
- `go test -race ./internal/playback/...` passes.

