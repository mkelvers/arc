package watchlist

import (
	"context"
	"testing"

	"mal/internal/db"
)

type fakeQuerier struct {
	db.Querier
	upsertAnimeCalled bool
	upsertEntryCalled bool
	addRows           []db.GetUserWatchListRow
}

func (f *fakeQuerier) UpsertAnime(ctx context.Context, arg db.UpsertAnimeParams) (db.Anime, error) {
	f.upsertAnimeCalled = true
	return db.Anime{}, nil
}

func (f *fakeQuerier) UpsertWatchListEntry(ctx context.Context, arg db.UpsertWatchListEntryParams) (db.WatchListEntry, error) {
	f.upsertEntryCalled = true
	return db.WatchListEntry{}, nil
}

func (f *fakeQuerier) GetUserWatchList(ctx context.Context, userID string) ([]db.GetUserWatchListRow, error) {
	return f.addRows, nil
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
