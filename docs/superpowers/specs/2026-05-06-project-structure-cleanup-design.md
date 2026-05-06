# Design Spec: Project Structure Cleanup and Standardization

Standardize the Go project structure, consolidate database packages, and remove redundant files to improve maintainability and idiomatic code patterns.

## 1. Database Package Consolidation

### Current State
- `internal/db` contains `sqlc` generated code in package `database`.
- `internal/db/sqlite/sqlite.go` is in a separate package for DB initialization.
- Imports are scattered between `mal/internal/db` (often aliased) and `mal/internal/db/sqlite`.

### Changes
- **Package Renaming:** Change package `database` to `db` in all `internal/db/*.go` files.
- **sqlc configuration:** Update `sqlc.yaml` to use `package: db`.
- **Flattening:** Move `internal/db/sqlite/sqlite.go` to `internal/db/sqlite.go`.
- **Import Cleanup:** Update all consumers to use `mal/internal/db` directly.

## 2. Redundant File Removal

### Changes
- Delete all `.go` files in `tmp/scripts/` (`fix_json.go`, `fix_proxy.go`, `test_jikan.go`, etc.).
- Remove the empty directory `internal/db/sqlite` after moving the file.

## 3. Asset Build Optimization

### Changes
- Investigate `dist/` duplication.
- Update `package.json` build scripts if necessary to ensure `dist/` has a flat, clean structure matching what `NewRouter` expects.

## 4. Verification Plan

### Automated Checks
- `go build ./...`: Verify all Go imports and package renames.
- `bun run typecheck`: Verify TS/JS integrity.
- `sqlc generate`: Verify that regeneration doesn't break the new package naming.

### Manual Checks
- Verify server starts and database migrations apply correctly.
