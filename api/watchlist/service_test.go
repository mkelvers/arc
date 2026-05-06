package watchlist

import (
	"context"
	"database/sql"
	"os"
	"strings"
	"testing"

	"mal/internal/db"

	_ "github.com/mattn/go-sqlite3"
)

type fakeQuerier struct {
	db.Querier
	upsertAnimeCalled bool
	upsertEntryCalled bool
	upsertEntryParams db.UpsertWatchListEntryParams
	getAnimeFunc      func(ctx context.Context, id int64) (db.Anime, error)
}

func (f *fakeQuerier) GetAnime(ctx context.Context, id int64) (db.Anime, error) {
	if f.getAnimeFunc != nil {
		return f.getAnimeFunc(ctx, id)
	}
	return db.Anime{}, nil
}

func (f *fakeQuerier) UpsertAnime(ctx context.Context, arg db.UpsertAnimeParams) (db.Anime, error) {
	f.upsertAnimeCalled = true
	return db.Anime{}, nil
}

func (f *fakeQuerier) UpsertWatchListEntry(ctx context.Context, arg db.UpsertWatchListEntryParams) (db.WatchListEntry, error) {
	f.upsertEntryCalled = true
	f.upsertEntryParams = arg
	return db.WatchListEntry{}, nil
}

func (f *fakeQuerier) GetUserWatchList(ctx context.Context, userID string) ([]db.GetUserWatchListRow, error) {
	return nil, nil
}

func TestAddEntry_RejectsInvalidAnimeID(t *testing.T) {
	t.Parallel()

	q := &fakeQuerier{}
	svc := NewService(q, nil, nil)

	err := svc.AddToWatchlist(context.Background(), "user-1", 0, "watching")

	if err != ErrInvalidAnimeID {
		t.Fatalf("expected ErrInvalidAnimeID, got %v", err)
	}

	if q.upsertAnimeCalled || q.upsertEntryCalled {
		t.Fatal("expected no database writes for invalid anime id")
	}
}

func TestAddEntry_RejectsInvalidStatus(t *testing.T) {
	t.Parallel()

	q := &fakeQuerier{}
	svc := NewService(q, nil, nil)

	err := svc.AddToWatchlist(context.Background(), "user-1", 1, "invalid")

	if err != ErrInvalidStatus {
		t.Fatalf("expected ErrInvalidStatus, got %v", err)
	}

	if q.upsertAnimeCalled || q.upsertEntryCalled {
		t.Fatal("expected no database writes for invalid status")
	}
}

func TestImportWatchlist(t *testing.T) {
	dbFile := "test_watchlist.db"
	defer os.Remove(dbFile)

	sqlDB, err := sql.Open("sqlite3", dbFile)
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()

	// Minimal schema for testing
	_, err = sqlDB.Exec(`
		CREATE TABLE anime (
			id INTEGER PRIMARY KEY,
			title_original TEXT NOT NULL,
			image_url TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			title_english TEXT,
			title_japanese TEXT,
			airing BOOLEAN,
			status TEXT,
			relations_synced_at DATETIME,
			duration_seconds REAL
		);
		CREATE TABLE watch_list_entry (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			anime_id INTEGER NOT NULL REFERENCES anime(id),
			status TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			current_episode INTEGER DEFAULT 0,
			last_episode_at DATETIME,
			current_time_seconds REAL NOT NULL DEFAULT 0,
			UNIQUE(user_id, anime_id)
		);
	`)
	if err != nil {
		t.Fatal(err)
	}

	queries := db.New(sqlDB)
	svc := NewService(queries, sqlDB, nil)

	// Pre-insert anime so ensureAnimeExists succeeds
	_, err = sqlDB.Exec(`INSERT INTO anime (id, title_original, image_url) VALUES (1, 'Test 1', '');`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = sqlDB.Exec(`INSERT INTO anime (id, title_original, image_url) VALUES (2, 'Test 2', '');`)
	if err != nil {
		t.Fatal(err)
	}

	csvData := `anime_id,status,current_episode,current_time_seconds
1,watching,5,120.5
2,invalid,10,0
`
	err = svc.ImportWatchlist(context.Background(), "user-1", strings.NewReader(csvData))
	if err != nil {
		t.Fatalf("ImportWatchlist failed: %v", err)
	}

	// Verify entries
	var count int
	err = sqlDB.QueryRow("SELECT COUNT(*) FROM watch_list_entry WHERE user_id = 'user-1'").Scan(&count)
	if err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Errorf("expected 2 entries, got %d", count)
	}

	var status string
	err = sqlDB.QueryRow("SELECT status FROM watch_list_entry WHERE anime_id = 2").Scan(&status)
	if err != nil {
		t.Fatal(err)
	}
	if status != "plan_to_watch" {
		t.Errorf("expected status to be defaulted to plan_to_watch, got %s", status)
	}
}
