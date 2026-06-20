package db

import (
	"context"
	"database/sql"
	"reflect"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func TestGetUserWatchlistAnimeIDsFiltersRequestedIDs(t *testing.T) {
	sqlDB, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer func() {
		if err := sqlDB.Close(); err != nil {
			t.Errorf("close sqlite: %v", err)
		}
	}()

	_, err = sqlDB.ExecContext(context.Background(), `
		CREATE TABLE watch_list_entry (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			anime_id INTEGER NOT NULL
		);
		INSERT INTO watch_list_entry (id, user_id, anime_id) VALUES
			('1', 'user-a', 10),
			('2', 'user-a', 20),
			('3', 'user-b', 30);
	`)
	if err != nil {
		t.Fatalf("seed watchlist: %v", err)
	}

	got, err := New(sqlDB).GetUserWatchlistAnimeIDs(context.Background(), "user-a", []int64{0, 10, 10, 30, 20})
	if err != nil {
		t.Fatalf("GetUserWatchlistAnimeIDs: %v", err)
	}

	want := []int64{10, 20}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ids = %v, want %v", got, want)
	}
}
