package watchlist

import (
	"context"
	"strings"
	"testing"

	"mal/internal/db"
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
	t.Parallel()

	q := &fakeQuerier{}
	svc := NewService(q, nil, nil)

	csvData := `anime_id,status,current_episode,current_time_seconds
1,watching,5,120.5
2,invalid,10,0
`
	err := svc.ImportWatchlist(context.Background(), "user-1", strings.NewReader(csvData))
	if err != nil {
		t.Fatalf("ImportWatchlist failed: %v", err)
	}

	if !q.upsertEntryCalled {
		t.Fatal("expected entries to be upserted")
	}

	// Verify the second record with invalid status was defaulted
	// Note: We need a way to track all calls if we want to check the second record specifically,
	// but the current fake only tracks the last call.
	// For now, let's just check the last call which was record 2.
	if q.upsertEntryParams.Status != "plan_to_watch" {
		t.Errorf("expected status to be defaulted to plan_to_watch, got %s", q.upsertEntryParams.Status)
	}
}
