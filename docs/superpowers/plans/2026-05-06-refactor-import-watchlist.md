# Refactor ImportWatchlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `ImportWatchlist` to use a database transaction for the import loop and improve logging.

**Architecture:** Use `db.BeginTx` to wrap the loop. `ensureAnimeExists` continues to use `s.db` to avoid long-running transactions during external API calls.

**Tech Stack:** Go, `database/sql`, `csv`.

---

### Task 1: Refactor ImportWatchlist with Transaction

**Files:**
- Modify: `api/watchlist/service.go`

- [ ] **Step 1: Update ImportWatchlist implementation**

```go
func (s *Service) ImportWatchlist(ctx context.Context, userID string, r io.Reader) error {
	txQueries, tx, err := db.BeginTx(ctx, s.sqlDB)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	reader := csv.NewReader(r)
	if _, err := reader.Read(); err != nil {
		return fmt.Errorf("failed to read csv header: %w", err)
	}

	records, err := reader.ReadAll()
	if err != nil {
		return fmt.Errorf("failed to read csv records: %w", err)
	}

	for i, record := range records {
		if len(record) < 4 {
			log.Printf("skipping row %d: insufficient columns", i+2) // i+2 because i is 0-indexed record after header
			continue
		}

		animeID, err := strconv.ParseInt(record[0], 10, 64)
		if err != nil {
			return fmt.Errorf("row %d: invalid anime id: %w", i+2, err)
		}

		status := record[1]
		if _, ok := validStatuses[status]; !ok {
			status = "plan_to_watch"
		}

		currentEpisode, _ := strconv.ParseInt(record[2], 10, 64)
		currentTimeSeconds, _ := strconv.ParseFloat(record[3], 64)

		if err := s.ensureAnimeExists(ctx, animeID); err != nil {
			return fmt.Errorf("row %d: failed to ensure anime: %w", i+2, err)
		}

		_, err = txQueries.UpsertWatchListEntry(ctx, db.UpsertWatchListEntryParams{
			ID:                 uuid.New().String(),
			UserID:             userID,
			AnimeID:            animeID,
			Status:             status,
			CurrentEpisode:     sql.NullInt64{Int64: currentEpisode, Valid: currentEpisode > 0},
			CurrentTimeSeconds: currentTimeSeconds,
		})
		if err != nil {
			return fmt.Errorf("row %d: failed to upsert entry: %w", i+2, err)
		}
	}

	return tx.Commit()
}
```

- [ ] **Step 2: Add missing import `log`**

- [ ] **Step 3: Verify compilation**

Run: `go build ./api/watchlist/...`
Expected: Success (no output)

- [ ] **Step 4: Verify tests**

Run: `go test ./api/watchlist/...`
Expected: Success

- [ ] **Step 5: Commit**

```bash
git add api/watchlist/service.go
git commit -m "refactor: wrap watchlist import in transaction"
```
