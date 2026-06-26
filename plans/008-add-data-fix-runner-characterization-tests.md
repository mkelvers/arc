---
finding: "Add data-fix runner characterization tests"
catalog: "Tests"
impact: "Startup data repairs can drift or fail partway without fast regression coverage."
base_commit: "0d31d46"
---

## Effort

S - seed in-memory SQLite rows and assert before/after behavior.

## Risk

LOW - tests should use existing migration helpers and avoid production data.

## Confidence

HIGH - the runner and registered fixes currently lack direct characterization tests.

## Evidence

- `internal/database/fixes.go:33-50` runs each unapplied registered fix and records it only after success.
- `internal/database/fixes/20260526_episode_availability_backfill_next_refresh_at.go:12-24` mutates cached episode availability rows at startup.
- `internal/database/database_test.go:12-72` covers migrations and cache cleanup, but not `RunDataFixes` or registered fix effects.

## Resolution Approach

Add tests in `internal/database` or `internal/database/fixes` that use an in-memory SQLite database and existing migration helpers. Cover runner behavior and at least each registered fix’s observable effect.

Runner tests should assert that unapplied fixes run, applied fix IDs are skipped, successful fixes are recorded in `data_fixes`, and failed fixes do not get marked applied. Individual fix tests should seed the minimum relevant rows, run the fix, and assert the changed fields and idempotency.

If a registered fix depends on external services or slow behavior, isolate it behind existing dependency seams or test the row-selection/mutation behavior directly. Do not introduce network calls into these tests.

Verify with `go test ./internal/database ./internal/database/fixes ./...`.
