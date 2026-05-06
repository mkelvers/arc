# Project Structure Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize the Go project structure, consolidate database packages, and remove redundant files to improve maintainability and idiomatic code patterns.

**Architecture:** 
1. Consolidate all database-related code into `internal/db` with the package name `db`.
2. Remove the `internal/db/sqlite` sub-package and move its contents to `internal/db`.
3. Update `sqlc.yaml` and regenerate code.
4. Clean up the `tmp/scripts/` directory.
5. Update all imports throughout the project.

**Tech Stack:** Go, sqlc, Bun

---

### Task 1: Clean up tmp/scripts

**Files:**
- Delete: `tmp/scripts/*.go`

- [ ] **Step 1: Delete redundant scripts**

Run: `rm tmp/scripts/*.go`

- [ ] **Step 2: Commit cleanup**

```bash
git add tmp/scripts/
git commit -m "chore: remove redundant scripts"
```

### Task 2: Standardize internal/db Package and Flatten Structure

**Files:**
- Modify: `sqlc.yaml`
- Move: `internal/db/sqlite/sqlite.go` -> `internal/db/sqlite.go`
- Modify: `internal/db/*.go` (generated and manual)

- [ ] **Step 1: Update sqlc configuration**

Modify `sqlc.yaml`:
```yaml
version: "2"
sql:
  - engine: "sqlite"
    queries: "internal/db/queries.sql"
    schema: "migrations/"
    gen:
      go:
        package: "db"
        out: "internal/db"
        emit_json_tags: true
        emit_prepared_queries: false
        emit_interface: true
        emit_exact_table_names: false
```

- [ ] **Step 2: Regenerate sqlc code**

Run: `sqlc generate`

- [ ] **Step 3: Move and update sqlite.go**

Run: `mv internal/db/sqlite/sqlite.go internal/db/sqlite.go && rm -rf internal/db/sqlite`

Modify `internal/db/sqlite.go`:
```go
package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3"
)
// ... existing functions, update return types to use local db package if needed
```

- [ ] **Step 4: Update package names in manual files**

Modify `internal/db/helpers.go` and `internal/db/migrate.go` to use `package db`.

- [ ] **Step 5: Commit database structural changes**

```bash
git add internal/db/ sqlc.yaml
git commit -m "refactor: consolidate db package and flatten structure"
```

### Task 3: Update Global Imports

**Files:**
- Modify: All files importing `mal/internal/db` or `mal/internal/db/sqlite`

- [ ] **Step 1: Replace imports and qualifiers**

Use `sed` or `edit` to update all imports:
- `database "mal/internal/db"` -> `"mal/internal/db"`
- `"mal/internal/db"` -> `"mal/internal/db"` (ensure it's used as `db.`)
- `"mal/internal/db/sqlite"` -> `"mal/internal/db"`

- [ ] **Step 2: Update code references**

Replace `database.` and `sqlite.` with `db.` globally where applicable.

- [ ] **Step 3: Verify build**

Run: `go build ./...`
Expected: PASS

- [ ] **Step 4: Commit import updates**

```bash
git add .
git commit -m "refactor: update imports to use new db package"
```

### Task 4: Clean dist/ and Verify Build

**Files:**
- Modify: `package.json` (if needed)
- Clean: `dist/`

- [ ] **Step 1: Clean dist directory**

Run: `rm -rf dist/*`

- [ ] **Step 2: Run frontend build**

Run: `bun run build:assets`

- [ ] **Step 3: Verify dist structure**

Check if `dist/static/static` still exists. If so, investigate `bun build` command in `package.json`.

- [ ] **Step 4: Final verification**

Run: `go build ./... && bun run typecheck`
Expected: PASS

- [ ] **Step 5: Commit build fixes**

```bash
git add .
git commit -m "build: clean dist and verify assets"
```
