---
finding: "Gate or remove unauthenticated pprof routes"
catalog: "Security"
impact: "Anyone who can reach the server can access debug profiling endpoints and runtime internals."
base_commit: "0d31d46"
---

## Effort

S - small routing/configuration change plus route tests.

## Risk

LOW - normal application routes should be unaffected.

## Confidence

HIGH - `pprof` routes are registered before authentication middleware is applied.

## Evidence

- `internal/server/server.go:10` imports `net/http/pprof`, registering handlers on `http.DefaultServeMux`.
- `internal/server/server.go:42-43` mounts `/debug/pprof` and `/debug/pprof/*action` on the Gin router.
- `internal/app.go:43-45` applies auth middleware later, before module routes are registered, so these pre-existing routes are not protected by that middleware.

## Resolution Approach

Choose one explicit policy and implement it consistently. The safest default is to remove pprof routes from the main application router. If local profiling is still desired, add an explicit configuration flag such as `MAL_ENABLE_PPROF=1` and register routes only when it is enabled.

If pprof remains available, it should be behind the same authentication middleware as protected pages or restricted to development-only usage. Avoid enabling it by default in release mode.

Add tests in `internal/server` or an app-level route test that assert `/debug/pprof` is not available by default. If a config flag is added, test both disabled and enabled behavior.

Verify with `go test ./internal/server ./...` and `bun run lint:go` after the lint baseline plan is complete.
