package db

import (
	"context"
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func TestGetCommandPaletteContinueWatchingFiltersAndLimits(t *testing.T) {
	sqlDB := openCommandPaletteTestDB(t)

	got, err := New(sqlDB).GetCommandPaletteContinueWatching(context.Background(), "user-a", "continue", 1)
	if err != nil {
		t.Fatalf("GetCommandPaletteContinueWatching: %v", err)
	}
	if len(got) != 1 || got[0].AnimeID != 20 {
		t.Fatalf("continue rows = %+v, want latest anime 20 only", got)
	}

	got, err = New(sqlDB).GetCommandPaletteContinueWatching(context.Background(), "user-a", "nar", 5)
	if err != nil {
		t.Fatalf("GetCommandPaletteContinueWatching filtered: %v", err)
	}
	if len(got) != 1 || got[0].AnimeID != 10 {
		t.Fatalf("filtered continue rows = %+v, want anime 10", got)
	}
}

func TestGetCommandPaletteWatchlistFiltersAndOrders(t *testing.T) {
	sqlDB := openCommandPaletteTestDB(t)

	got, err := New(sqlDB).GetCommandPaletteWatchlist(context.Background(), "user-a", "", 5)
	if err != nil {
		t.Fatalf("GetCommandPaletteWatchlist: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("watchlist rows len = %d, want 2", len(got))
	}
	if got[0].AnimeID != 10 || got[1].AnimeID != 20 {
		t.Fatalf("watchlist order = [%d %d], want watching anime 10 before plan anime 20", got[0].AnimeID, got[1].AnimeID)
	}

	got, err = New(sqlDB).GetCommandPaletteWatchlist(context.Background(), "user-a", "plan", 5)
	if err != nil {
		t.Fatalf("GetCommandPaletteWatchlist filtered: %v", err)
	}
	if len(got) != 1 || got[0].AnimeID != 20 {
		t.Fatalf("filtered watchlist rows = %+v, want anime 20", got)
	}
}

func openCommandPaletteTestDB(t *testing.T) *sql.DB {
	t.Helper()

	sqlDB, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	_, err = sqlDB.Exec(`
		CREATE TABLE anime (
			id INTEGER PRIMARY KEY,
			title_original TEXT NOT NULL,
			title_english TEXT,
			title_japanese TEXT,
			image_url TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			airing BOOLEAN DEFAULT 0,
			duration_seconds REAL
		);
		CREATE TABLE watch_list_entry (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			anime_id INTEGER NOT NULL,
			status TEXT NOT NULL,
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL,
			current_episode INTEGER,
			last_episode_at DATETIME,
			current_time_seconds REAL NOT NULL DEFAULT 0
		);
		CREATE TABLE continue_watching_entry (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			anime_id INTEGER NOT NULL,
			current_episode INTEGER,
			current_time_seconds REAL NOT NULL DEFAULT 0,
			duration_seconds REAL,
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL
		);
		INSERT INTO anime (id, title_original, title_english, title_japanese, image_url, airing, duration_seconds) VALUES
			(10, 'Naruto', NULL, NULL, 'naruto.jpg', 0, 1440),
			(20, 'Frieren', 'Frieren: Beyond Journey''s End', NULL, 'frieren.jpg', 0, 1440),
			(30, 'Dropped Show', NULL, NULL, 'dropped.jpg', 0, 1440);
		INSERT INTO watch_list_entry (id, user_id, anime_id, status, created_at, updated_at, current_episode, current_time_seconds) VALUES
			('w1', 'user-a', 10, 'watching', '2026-01-01 00:00:00', '2026-01-01 00:00:00', 3, 0),
			('w2', 'user-a', 20, 'plan_to_watch', '2026-01-02 00:00:00', '2026-01-03 00:00:00', 0, 0),
			('w3', 'user-a', 30, 'dropped', '2026-01-04 00:00:00', '2026-01-04 00:00:00', 0, 0),
			('w4', 'user-b', 10, 'watching', '2026-01-05 00:00:00', '2026-01-05 00:00:00', 1, 0);
		INSERT INTO continue_watching_entry (id, user_id, anime_id, current_episode, current_time_seconds, duration_seconds, created_at, updated_at) VALUES
			('c1', 'user-a', 10, 4, 120, 1440, '2026-01-01 00:00:00', '2026-01-01 00:00:00'),
			('c2', 'user-a', 20, 1, 60, 1440, '2026-01-02 00:00:00', '2026-01-03 00:00:00'),
			('c3', 'user-b', 10, 1, 30, 1440, '2026-01-04 00:00:00', '2026-01-04 00:00:00');
	`)
	if err != nil {
		t.Fatalf("seed command palette db: %v", err)
	}

	return sqlDB
}
