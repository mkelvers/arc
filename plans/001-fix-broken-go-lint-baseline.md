---
finding: "Fix broken Go lint baseline"
catalog: "DX / Tooling"
impact: "The documented full verification gate cannot pass because Go lint currently fails."
base_commit: "0d31d46"
---

## Effort

S - one focused refactor plus verification.

## Risk

LOW - the change should preserve behavior and only reduce function complexity.

## Confidence

HIGH - `bun run lint:go` fails reproducibly on one function.

## Evidence

- `internal/observability/fx.go:22` defines `describeFXEventError` with a large type switch.
- `bun run lint:go` reports `cyclop`: calculated cyclomatic complexity is 11, max is 10.
- `justfile:40` defines `check` as `lint test typecheck build`, so this failure breaks `just check`.

## Resolution Approach

Refactor `describeFXEventError` without changing the log events it emits. Keep the same public behavior: `LogEvent` should call `describeFXEventError`, ignore events with no error, and log failed Fx lifecycle events with the same event names and field maps.

A small, safe approach is to split the switch into narrower helpers, for example one helper for constructor/invoke/run failures and one helper for lifecycle/start/stop/rollback failures. Another acceptable approach is to use small typed helper functions for repeated return shapes. Do not suppress the linter unless a refactor proves impossible.

Add or update tests if existing tests cover Fx event descriptions. Verify with `bun run lint:go`, then run `go test ./...`. After this lands, `just check` should be able to proceed past Go lint.
