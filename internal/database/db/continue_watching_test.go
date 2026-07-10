package db

import (
	"context"
	"database/sql"
	"fmt"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func TestGetContinueWatchingCarouselEntriesLimitsNewestFirst(t *testing.T) {
	ctx := context.Background()
	sqlDB := newContinueWatchingTestDB(ctx, t)
	defer closeContinueWatchingTestDB(t, sqlDB)
	seedContinueWatchingRows(ctx, t, sqlDB, 30)

	rows, err := New(sqlDB).GetContinueWatchingCarouselEntries(ctx, GetContinueWatchingCarouselEntriesParams{
		UserID: "user-1",
		Limit:  24,
	})
	if err != nil {
		t.Fatalf("GetContinueWatchingCarouselEntries: %v", err)
	}
	if len(rows) != 24 {
		t.Fatalf("len(rows) = %d, want 24", len(rows))
	}
	if rows[0].AnimeID != 30 {
		t.Fatalf("first AnimeID = %d, want 30", rows[0].AnimeID)
	}
	if rows[len(rows)-1].AnimeID != 7 {
		t.Fatalf("last AnimeID = %d, want 7", rows[len(rows)-1].AnimeID)
	}
}

func newContinueWatchingTestDB(ctx context.Context, t *testing.T) *sql.DB {
	t.Helper()

	sqlDB, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}

	_, err = sqlDB.ExecContext(ctx, `
CREATE TABLE anime (
    id INTEGER PRIMARY KEY,
    title_original TEXT NOT NULL,
    title_english TEXT,
    title_japanese TEXT,
    image_url TEXT NOT NULL,
    banner_image_url TEXT NOT NULL DEFAULT '',
    duration_seconds REAL
);
CREATE TABLE continue_watching_entry (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    anime_id INTEGER NOT NULL REFERENCES anime(id),
    current_episode INTEGER,
    current_time_seconds REAL NOT NULL DEFAULT 0,
    duration_seconds REAL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, anime_id)
);`)
	if err != nil {
		closeContinueWatchingTestDB(t, sqlDB)
		t.Fatalf("create schema: %v", err)
	}

	return sqlDB
}

func closeContinueWatchingTestDB(t *testing.T, sqlDB *sql.DB) {
	t.Helper()

	if err := sqlDB.Close(); err != nil {
		t.Errorf("close sqlite: %v", err)
	}
}

func seedContinueWatchingRows(ctx context.Context, t *testing.T, sqlDB *sql.DB, totalRows int) {
	t.Helper()

	for i := 1; i <= totalRows; i++ {
		if _, err := sqlDB.ExecContext(ctx, `INSERT INTO anime (id, title_original, image_url) VALUES (?, ?, ?)`, i, fmt.Sprintf("Anime %02d", i), "image.jpg"); err != nil {
			t.Fatalf("insert anime %d: %v", i, err)
		}
		if _, err := sqlDB.ExecContext(ctx, `
INSERT INTO continue_watching_entry (id, user_id, anime_id, current_episode, current_time_seconds, updated_at)
VALUES (?, ?, ?, ?, ?, datetime('2026-01-01', printf('+%d minutes', ?)))`, fmt.Sprintf("cw-%02d", i), "user-1", i, i, 0, i); err != nil {
			t.Fatalf("insert continue watching %d: %v", i, err)
		}
	}
}
