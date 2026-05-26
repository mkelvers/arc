# Fix checklist (generated)

This file tracks each finding as:

- `verified`: confirmed in repo by code inspection/grep.
- `supported (inference)`: not directly observed, but likely given verified conditions.
- `not found / outdated`: claim doesn't match current code.

Each item also notes a commit that fixes it (once done).

## Build / Frontend

- [ ] **verified** Build output dir mismatch (`package.json` vs `templates/base.gohtml`)
  - Fix: build non-player TS into `dist/static/` instead of `dist/`
  - Commit: `build: fix dist static output` (6da80df)
- [ ] **not found / outdated** Player event listener leak on HTMX re-init (current code prevents re-init)
  - Actual bug: HTMX swap can introduce a new player but `initialized` prevents init.
  - Fix: re-init per-container with proper teardown.
  - Commit: `fix: reinit player safely` (30441c3)
- [ ] **verified** Unguarded `localStorage` access in player modules (Safari private browsing `SecurityError`)
  - Fix: centralized safe storage helpers + migrate call sites.
  - Commit: `fix: reinit player safely` (30441c3)
- [ ] **verified** `genresParams` `&&` bug in browse sentinel URL (`templates/browse.gohtml`)
  - Fix: guard the `&{{genresParams}}` segment when empty.
  - Commit: `fix: browse genres params` (7bff60f)
- [ ] **verified** Inline `onclick` usage (broad surface); `browse.gohtml:55` injection risk is low because ID is int
  - Fix: move handlers to delegated JS; remove inline JS strings where practical.
  - Commit: _(pending)_

## Go / Domain / DB

- [ ] **verified** `internal/db.Querier` interface missing handwritten `(*Queries)` methods
  - Fix: include handwritten methods in the interface or stop using interface where not useful.
  - Commit: _(pending)_
- [ ] **verified** Migration 012 disables foreign keys + rebuilds `user` without explicit transaction
  - Fix: wrap in `BEGIN; ... COMMIT;` + validate copy counts, or use safer `ALTER TABLE` strategy.
  - Commit: `fix: wrap user rebuild migration` (6274212) + `fix: goose tx for user rebuild` (f2a319a)
- [ ] **verified** SQLite lacks WAL + busy timeout (`internal/db/sqlite.go`)
  - Fix: set WAL mode + `_busy_timeout` and/or PRAGMA busy_timeout; tune connection settings.
  - Commit: `fix: sqlite concurrency defaults` (c609060)
- [ ] **verified** Episodes worker has no per-tick timeout and uses `context.Background()`
  - Fix: derive ctx from lifecycle, add per-tick `context.WithTimeout`.
  - Commit: `fix: sqlite concurrency defaults` (c609060)
- [ ] **verified** Handler error response patterns inconsistent; some leak `err.Error()` or return empty bodies
  - Fix: use `server.RespondError` / `server.RespondHTMLOrJSONError` consistently.
  - Commit: `fix: unify handler errors` (4e8ba72)
- [ ] **verified** `strconv.Atoi/ParseInt` errors ignored in handlers
  - Fix: validate parse errors and return 400.
  - Commit: `fix: unify handler errors` (4e8ba72)
- [ ] **verified** Jikan client sends requests without a `User-Agent`
  - Fix: set a stable UA header (and accept override if config exists).
  - Commit: `fix: add jikan user-agent` (4ffa6af)

## Misc verified smells

- [ ] **verified** `internal/observability/metrics.go` panics on label cardinality mismatch
  - Fix: return early (drop sample) instead of panic.
  - Commit: `fix: avoid metrics panic` (7279eac)
- [ ] **verified** `templates/components/dropdown.gohtml` references undefined sub-templates
  - Fix: remove dead template or define missing parts; align with web component usage.
  - Commit: _(pending)_
- [ ] **verified** Navigation `.IsCollapsed` never set by handlers
  - Fix: wire value into template data or remove dead branch.
  - Commit: _(pending)_
- [ ] **verified** `cmd/user/main.go` hardcodes DiceBear URL; duplicated with migration 016
  - Fix: centralize default avatar URL construction and reuse in both.
  - Commit: _(pending)_
