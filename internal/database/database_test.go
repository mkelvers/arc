package database

import (
	"context"
	"database/sql"
	"mal/internal/database/db"
	"testing"

	_ "github.com/mattn/go-sqlite3"
	"github.com/pressly/goose/v3"
)

func TestRunMigrationsCreatesHotPathIndexes(t *testing.T) {
	sqlDB, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer func() {
		if err := sqlDB.Close(); err != nil {
			t.Errorf("close sqlite: %v", err)
		}
	}()
	sqlDB.SetMaxOpenConns(1)

	if err := RunMigrations(sqlDB); err != nil {
		t.Fatalf("RunMigrations: %v", err)
	}

	for _, indexName := range []string{
		"idx_watch_list_entry_user_updated_at",
		"idx_watch_list_entry_user_status_updated_at_desc",
		"idx_watch_list_entry_status_updated_at_anime_id",
		"idx_continue_watching_anime_id",
	} {
		t.Run(indexName, func(t *testing.T) {
			var count int
			err := sqlDB.QueryRowContext(context.Background(), `SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = ?`, indexName).Scan(&count)
			if err != nil {
				t.Fatalf("query index: %v", err)
			}
			if count != 1 {
				t.Fatalf("index %s count = %d, want 1", indexName, count)
			}
		})
	}
}

func TestWatchlistCompletionDateFollowsCompletedStatus(t *testing.T) {
	sqlDB := newMigratedTestDB(t)
	defer closeTestDB(t, sqlDB)

	ctx := context.Background()
	mustExecTestSQL(t, sqlDB, `INSERT INTO user (id, username, password_hash) VALUES ('user-1', 'alice', 'hash')`)
	mustExecTestSQL(t, sqlDB, `INSERT INTO anime (id, title_original, image_url) VALUES (1, 'Anime', 'image.jpg')`)

	queries := db.New(sqlDB)
	upsertTestWatchlistStatus(ctx, t, queries, "completed")
	completedAt, estimated := testWatchlistCompletion(ctx, t, sqlDB)
	if !completedAt.Valid {
		t.Fatalf("completed status should record completed_at")
	}
	if estimated {
		t.Fatalf("new completion date should be exact")
	}

	upsertTestWatchlistStatus(ctx, t, queries, "watching")
	completedAt, estimated = testWatchlistCompletion(ctx, t, sqlDB)
	if completedAt.Valid || estimated {
		t.Fatalf("watching status completion = %v estimated=%v, want empty", completedAt, estimated)
	}

	upsertTestWatchlistStatus(ctx, t, queries, "completed")
	completedAt, estimated = testWatchlistCompletion(ctx, t, sqlDB)
	if !completedAt.Valid || estimated {
		t.Fatalf("re-completed status completion = %v estimated=%v, want exact date", completedAt, estimated)
	}
}

func TestCompletionDateMigrationMarksHistoricalEstimates(t *testing.T) {
	sqlDB, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer closeTestDB(t, sqlDB)
	sqlDB.SetMaxOpenConns(1)

	goose.SetBaseFS(migrationsFS)
	goose.SetLogger(goose.NopLogger())
	if err := goose.SetDialect("sqlite3"); err != nil {
		t.Fatalf("set goose dialect: %v", err)
	}
	if err := goose.UpTo(sqlDB, "migrations", 25); err != nil {
		t.Fatalf("migrate to version 25: %v", err)
	}

	ctx := context.Background()
	mustExecTestSQL(t, sqlDB, `INSERT INTO user (id, username, password_hash) VALUES ('user-1', 'alice', 'hash')`)
	mustExecTestSQL(t, sqlDB, `INSERT INTO anime (id, title_original, image_url) VALUES (1, 'Audited', '1.jpg'), (2, 'Estimated', '2.jpg')`)
	mustExecTestSQL(t, sqlDB, `
INSERT INTO watch_list_entry (id, user_id, anime_id, status, updated_at)
VALUES
    ('entry-1', 'user-1', 1, 'completed', '2026-06-20 20:00:00'),
    ('entry-2', 'user-1', 2, 'completed', '2026-06-21 21:00:00')`)
	mustExecTestSQL(t, sqlDB, `
INSERT INTO audit_log (id, occurred_at, user_id, action, resource_type, resource_id)
VALUES ('audit-1', '2026-06-19 19:00:00', 'user-1', 'watch_completed', 'anime', '1')`)

	if err := goose.UpTo(sqlDB, "migrations", 26); err != nil {
		t.Fatalf("migrate to version 26: %v", err)
	}

	assertHistoricalCompletion(ctx, t, sqlDB, 1, "2026-06-19T19:00:00Z", false)
	assertHistoricalCompletion(ctx, t, sqlDB, 2, "2026-06-21T21:00:00Z", true)
}

func mustExecTestSQL(t *testing.T, sqlDB *sql.DB, query string) {
	t.Helper()
	if _, err := sqlDB.ExecContext(context.Background(), query); err != nil {
		t.Fatalf("execute test SQL: %v", err)
	}
}

func upsertTestWatchlistStatus(ctx context.Context, t *testing.T, queries *db.Queries, status string) {
	t.Helper()
	_, err := queries.UpsertWatchListEntry(ctx, db.UpsertWatchListEntryParams{
		ID:      "entry-1",
		UserID:  "user-1",
		AnimeID: 1,
		Status:  status,
	})
	if err != nil {
		t.Fatalf("upsert %s watchlist entry: %v", status, err)
	}
}

func testWatchlistCompletion(ctx context.Context, t *testing.T, sqlDB *sql.DB) (sql.NullTime, bool) {
	t.Helper()
	var completedAt sql.NullTime
	var estimated bool
	if err := sqlDB.QueryRowContext(ctx, `SELECT completed_at, completed_at_estimated FROM watch_list_entry WHERE user_id = 'user-1' AND anime_id = 1`).Scan(&completedAt, &estimated); err != nil {
		t.Fatalf("query completion date: %v", err)
	}
	return completedAt, estimated
}

func assertHistoricalCompletion(ctx context.Context, t *testing.T, sqlDB *sql.DB, animeID int64, wantTime string, wantEstimated bool) {
	t.Helper()
	var completedAt string
	var estimated bool
	if err := sqlDB.QueryRowContext(ctx, `SELECT completed_at, completed_at_estimated FROM watch_list_entry WHERE anime_id = ?`, animeID).Scan(&completedAt, &estimated); err != nil {
		t.Fatalf("query completion for anime %d: %v", animeID, err)
	}
	if completedAt != wantTime || estimated != wantEstimated {
		t.Fatalf("anime %d completion = %q estimated=%v, want %q estimated=%v", animeID, completedAt, estimated, wantTime, wantEstimated)
	}
}

func newMigratedTestDB(t *testing.T) *sql.DB {
	t.Helper()

	sqlDB, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)

	if err := RunMigrations(sqlDB); err != nil {
		closeTestDB(t, sqlDB)
		t.Fatalf("RunMigrations: %v", err)
	}

	return sqlDB
}

func closeTestDB(t *testing.T, sqlDB *sql.DB) {
	t.Helper()

	if err := sqlDB.Close(); err != nil {
		t.Errorf("close sqlite: %v", err)
	}
}
