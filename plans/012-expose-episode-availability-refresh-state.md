---
finding: "Expose episode availability freshness / retry state"
catalog: "Direction"
impact: "Users cannot see stale, retrying, or failed episode availability state even though the app tracks it."
base_commit: "0d31d46"
---

## Effort

M/L - scope depends on whether this is a small per-title detail or a broader maintenance page.

## Risk

MED - exposing provider/cache internals can clutter UI or confuse users if wording is too technical.

## Confidence

MED - the data exists, but product shape needs maintainer judgment.

## Evidence

- `internal/episodes/worker.go:12-31` refreshes due episode availability in the background.
- `internal/episodes/service/cache_store.go:50-65` stores next refresh, retry window, last attempt/success, failure count, and last error metadata through query parameters.
- `templates/components/anime_episode_count.gohtml` currently collapses availability to a compact episode/audio label.

## Resolution Approach

Start with the smallest useful user-facing surface: a per-title availability status detail near the existing episode-count/audio label. Show human-readable freshness such as last refreshed, next refresh, retrying soon, or temporarily unavailable. Avoid exposing raw provider errors unless they are sanitized and clearly useful.

Consider adding an authenticated manual refresh action only after the read-only status is useful. Manual refresh should be rate-limited or guarded to avoid hammering providers.

Add service/view-model tests that map cache metadata to user-facing states. Add template tests for fresh, stale, retrying, and failed states. If this becomes a maintenance page instead, split that into a separate design plan before implementation.

Verify with `go test ./internal/episodes/... ./templates ./...` and relevant lint/typecheck commands if UI scripts are added.
