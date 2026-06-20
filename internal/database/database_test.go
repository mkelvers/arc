package database

import (
	"context"
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
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
		"idx_jikan_cache_expires_at_datetime",
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
