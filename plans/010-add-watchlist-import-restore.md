---
finding: "Add watchlist import / restore"
catalog: "Direction"
impact:
  "Local-first users can export watchlist state but cannot round-trip it into a new install or after
  data loss."
base_commit: "0d31d46"
---

## Effort

M - server-side CSV parsing, validation, UI, and service tests.

## Risk

MED - import needs careful duplicate handling, status validation, and partial-failure reporting.

## Confidence

HIGH - export exists and the inverse capability is missing.

## Evidence

- `templates/watchlist.gohtml:18` exposes an “Export to CSV” action.
- `static/watchlist.ts:317-343` implements CSV export from rendered watchlist rows.
- `internal/watchlist/handler.go:21-25` registers update, delete, continue-watching delete, and page
  routes, but no import route.

## Resolution Approach

Treat this as a product/design implementation plan, not a bug fix. Define the import contract to
match the existing export columns: `mal_id`, `title`, `status`, and `updated_at`. The server should
validate `mal_id` and supported status values, ignore or display title only as user context, and
decide whether `updated_at` is informational or preserved.

Prefer a dry-run or preview step before mutation. The preview should report valid rows, duplicates,
unknown statuses, malformed IDs, and rows that would update existing entries. The final apply step
should upsert valid watchlist entries for the current authenticated user and return row-level
results.

Add service and handler tests for valid import, duplicate rows, invalid statuses, malformed CSV,
empty files, and partial success. Keep import scoped to watchlist entries; do not attempt to restore
playback progress or continue-watching state unless a separate plan expands the export schema.

Verify with `go test ./internal/watchlist ./...`, `bunx tsc -p tsconfig.json --noEmit`, and
`bun run lint:ts` if frontend UI is added.
