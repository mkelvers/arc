package database

import (
	"context"
	"database/sql"
	"mal/internal/db"
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

func TestCleanupExpiredJikanCache(t *testing.T) {
	sqlDB := newMigratedTestDB(t)
	defer closeTestDB(t, sqlDB)

	ctx := context.Background()
	for _, row := range []struct {
		key       string
		expiresAt string
	}{
		{key: "expired", expiresAt: "2000-01-01T00:00:00Z"},
		{key: "fresh", expiresAt: "2999-01-01T00:00:00Z"},
	} {
		_, err := sqlDB.ExecContext(ctx, `INSERT INTO jikan_cache (key, data, expires_at) VALUES (?, ?, ?)`, row.key, "{}", row.expiresAt)
		if err != nil {
			t.Fatalf("insert %s cache row: %v", row.key, err)
		}
	}

	cleanupExpiredJikanCache(ctx, db.New(sqlDB))

	keys := jikanCacheKeys(ctx, t, sqlDB)
	if len(keys) != 1 || keys[0] != "fresh" {
		t.Fatalf("remaining cache keys = %v, want [fresh]", keys)
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

func jikanCacheKeys(ctx context.Context, t *testing.T, sqlDB *sql.DB) []string {
	t.Helper()

	var keys []string
	rows, err := sqlDB.QueryContext(ctx, `SELECT key FROM jikan_cache ORDER BY key`)
	if err != nil {
		t.Fatalf("query cache keys: %v", err)
	}
	defer func() {
		if err := rows.Close(); err != nil {
			t.Errorf("close rows: %v", err)
		}
	}()
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			t.Fatalf("scan key: %v", err)
		}
		keys = append(keys, key)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate keys: %v", err)
	}

	return keys
}
