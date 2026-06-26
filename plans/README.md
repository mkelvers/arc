# Advisory Plans

Plans written against commit `0d31d46`.

## Status

| # | Plan | Catalog | Status | Dependency |
|---|---|---|---|---|
| 001 | Fix broken Go lint baseline | DX / Tooling | TODO | None |
| 002 | Stop marking JSON attributes as trusted HTML | Security | TODO | None |
| 003 | Gate or remove unauthenticated pprof routes | Security | TODO | None |
| 004 | Validate playback proxy targets before signing/fetching | Security | TODO | None |
| 005 | Limit home continue-watching carousel query | Performance | TODO | None |
| 006 | Move top-picks recommendation expansion off request path | Performance | TODO | None |
| 007 | Characterize the browser player flow | Tests | TODO | Before major player refactors |
| 008 | Add data-fix runner characterization tests | Tests | TODO | None |
| 009 | Add CI for the existing verification command | DX / Tooling | TODO | 001 |
| 010 | Add watchlist import / restore | Direction | TODO | None |
| 011 | Surface recommendation rationale | Direction | TODO | None |
| 012 | Expose episode availability freshness / retry state | Direction | TODO | None |

## Recommended Order

1. `001-fix-broken-go-lint-baseline.md`
2. `009-add-ci-for-existing-verification-command.md`
3. `002-stop-marking-json-attributes-trusted-html.md`
4. `003-gate-or-remove-unauthenticated-pprof-routes.md`
5. `005-limit-home-continue-watching-carousel-query.md`
6. `008-add-data-fix-runner-characterization-tests.md`
7. `004-validate-playback-proxy-targets.md`
8. `007-characterize-browser-player-flow.md`
9. `006-move-top-picks-recommendation-expansion-off-request-path.md`
10. Direction plans as product priorities: `010`, `011`, `012`.

## Verification Baseline

Known passing during audit:

- `go test ./...`
- `bun test`
- `bunx tsc -p tsconfig.json --noEmit`
- `bun run lint:ts`
- `bun audit`

Known failing during audit:

- `bun run lint:go` fails on `internal/observability/fx.go:22` for `cyclop` complexity.

Unavailable during audit:

- `govulncheck ./...` because `govulncheck` was not installed.
