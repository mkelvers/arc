package db

import (
	"context"
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func TestHasSkipSegmentOverrideTableReturnsFalseWhenMissing(t *testing.T) {
	sqlDB, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer func() { _ = sqlDB.Close() }()

	ok, err := New(sqlDB).HasSkipSegmentOverrideTable(context.Background())
	if err != nil {
		t.Fatalf("HasSkipSegmentOverrideTable: %v", err)
	}
	if ok {
		t.Fatalf("HasSkipSegmentOverrideTable returned true for missing table")
	}
}

func TestHasSkipSegmentOverrideTableReturnsTrueWhenPresent(t *testing.T) {
	sqlDB, err := openSkipSegmentOverrideTestDB(t)
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	defer func() { _ = sqlDB.Close() }()

	queries := New(sqlDB)

	ok, err := queries.HasSkipSegmentOverrideTable(context.Background())
	if err != nil {
		t.Fatalf("HasSkipSegmentOverrideTable: %v", err)
	}
	if !ok {
		t.Fatal("HasSkipSegmentOverrideTable returned false for existing table")
	}
}

func TestSkipSegmentOverrideUpsertAndList(t *testing.T) {
	sqlDB, err := openSkipSegmentOverrideTestDB(t)
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	defer func() { _ = sqlDB.Close() }()

	queries := New(sqlDB)

	row := SkipSegmentOverrideRow{
		ID:        "override-1",
		UserID:    "user-a",
		AnimeID:   123,
		Episode:   4,
		SkipType:  "op",
		StartTime: 12.5,
		EndTime:   28.25,
	}
	if err := queries.UpsertSkipSegmentOverride(context.Background(), row); err != nil {
		t.Fatalf("UpsertSkipSegmentOverride insert: %v", err)
	}

	got, err := queries.ListSkipSegmentOverrides(context.Background(), row.UserID, row.AnimeID, row.Episode)
	if err != nil {
		t.Fatalf("ListSkipSegmentOverrides insert: %v", err)
	}
	assertSingleSkipSegmentOverrideRow(t, got, row)

	updated := row
	updated.StartTime = 13.75
	updated.EndTime = 29.5
	if err := queries.UpsertSkipSegmentOverride(context.Background(), updated); err != nil {
		t.Fatalf("UpsertSkipSegmentOverride update: %v", err)
	}

	got, err = queries.ListSkipSegmentOverrides(context.Background(), row.UserID, row.AnimeID, row.Episode)
	if err != nil {
		t.Fatalf("ListSkipSegmentOverrides update: %v", err)
	}
	assertSingleSkipSegmentOverrideRow(t, got, updated)
}

func assertSingleSkipSegmentOverrideRow(t *testing.T, got []SkipSegmentOverrideRow, want SkipSegmentOverrideRow) {
	t.Helper()

	if len(got) != 1 {
		t.Fatalf("len(got) = %d, want 1", len(got))
	}
	if got[0] != want {
		t.Fatalf("row = %+v, want %+v", got[0], want)
	}
}

func openSkipSegmentOverrideTestDB(t *testing.T) (*sql.DB, error) {
	t.Helper()

	sqlDB, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		return nil, err
	}

	_, err = sqlDB.ExecContext(context.Background(), `
		CREATE TABLE skip_segment_override (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			anime_id INTEGER NOT NULL,
			episode INTEGER NOT NULL,
			skip_type TEXT NOT NULL,
			start_time REAL NOT NULL,
			end_time REAL NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id, anime_id, episode, skip_type)
		);
	`)
	if err != nil {
		_ = sqlDB.Close()
		return nil, err
	}

	return sqlDB, nil
}
