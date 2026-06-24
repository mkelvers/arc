package watchlist

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"mal/internal/db"
	"mal/internal/domain"
)

func TestWatchlistServiceGetWatchlistMap(t *testing.T) {
	repo := &fakeWatchlistRepository{watchlistAnimeIDs: []int64{1, 3}}
	svc := NewWatchlistService(repo, nil)

	got, err := svc.GetWatchlistMap(context.Background(), "user-1", []int64{1, 2, 3})
	if err != nil {
		t.Fatalf("GetWatchlistMap: %v", err)
	}
	if !got[1] || got[2] || !got[3] {
		t.Fatalf("watchlist map = %#v, want 1 and 3 only", got)
	}
	if repo.watchlistMapUserID != "user-1" {
		t.Fatalf("repo user id = %q, want user-1", repo.watchlistMapUserID)
	}
}

func TestWatchlistServiceGetWatchlistMapSkipsEmptyInputs(t *testing.T) {
	repo := &fakeWatchlistRepository{}
	svc := NewWatchlistService(repo, nil)

	got, err := svc.GetWatchlistMap(context.Background(), "", []int64{1})
	if err != nil {
		t.Fatalf("GetWatchlistMap empty user: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("empty user map = %#v, want empty", got)
	}
	if repo.watchlistMapCalled {
		t.Fatalf("repo should not be called for empty user")
	}

	got, err = svc.GetWatchlistMap(context.Background(), "user-1", nil)
	if err != nil {
		t.Fatalf("GetWatchlistMap empty ids: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("empty ids map = %#v, want empty", got)
	}
}

func TestWatchlistServiceDeleteContinueWatchingClearsProgressInTransaction(t *testing.T) {
	repo := &fakeWatchlistRepository{}
	svc := NewWatchlistService(repo, nil)

	if err := svc.DeleteContinueWatching(context.Background(), "user-1", 12); err != nil {
		t.Fatalf("DeleteContinueWatching: %v", err)
	}
	if !repo.inTxCalled {
		t.Fatalf("expected transaction")
	}
	if repo.deletedContinue.UserID != "user-1" || repo.deletedContinue.AnimeID != 12 {
		t.Fatalf("deleted continue params = %#v", repo.deletedContinue)
	}
	if repo.savedProgress.UserID != "user-1" || repo.savedProgress.AnimeID != 12 {
		t.Fatalf("saved progress params = %#v", repo.savedProgress)
	}
	if repo.savedProgress.CurrentEpisode.Valid {
		t.Fatalf("current episode should be cleared")
	}
	if repo.savedProgress.CurrentTimeSeconds != 0 {
		t.Fatalf("current time = %f, want 0", repo.savedProgress.CurrentTimeSeconds)
	}
}

func TestWatchlistServiceDeleteContinueWatchingStopsAfterDeleteError(t *testing.T) {
	repo := &fakeWatchlistRepository{deleteContinueErr: errors.New("delete failed")}
	svc := NewWatchlistService(repo, nil)

	if err := svc.DeleteContinueWatching(context.Background(), "user-1", 12); err == nil || err.Error() != "delete failed" {
		t.Fatalf("DeleteContinueWatching error = %v, want delete failed", err)
	}
	if repo.saveProgressCalled {
		t.Fatalf("SaveWatchProgress should not run after delete error")
	}
}

func TestWatchlistServiceRemoveEntry(t *testing.T) {
	repo := &fakeWatchlistRepository{}
	svc := NewWatchlistService(repo, nil)

	if err := svc.RemoveEntry(context.Background(), "user-1", 9); err != nil {
		t.Fatalf("RemoveEntry: %v", err)
	}
	if repo.deletedWatchlist.UserID != "user-1" || repo.deletedWatchlist.AnimeID != 9 {
		t.Fatalf("delete params = %#v", repo.deletedWatchlist)
	}
}

type fakeWatchlistRepository struct {
	watchlistAnimeIDs  []int64
	watchlistMapUserID string
	watchlistMapCalled bool
	inTxCalled         bool
	saveProgressCalled bool
	deleteContinueErr  error
	deletedContinue    db.DeleteContinueWatchingEntryParams
	savedProgress      db.SaveWatchProgressParams
	deletedWatchlist   db.DeleteWatchListEntryParams
}

func (r *fakeWatchlistRepository) InTx(ctx context.Context, fn func(context.Context, domain.WatchlistRepository) error) error {
	r.inTxCalled = true
	return fn(ctx, r)
}

func (r *fakeWatchlistRepository) UpsertAnime(context.Context, db.UpsertAnimeParams) (db.Anime, error) {
	return db.Anime{}, nil
}

func (r *fakeWatchlistRepository) GetAnime(context.Context, int64) (db.Anime, error) {
	return db.Anime{}, sql.ErrNoRows
}

func (r *fakeWatchlistRepository) UpsertWatchListEntry(_ context.Context, arg db.UpsertWatchListEntryParams) (db.WatchListEntry, error) {
	return db.WatchListEntry{ID: arg.ID, UserID: arg.UserID, AnimeID: arg.AnimeID, Status: arg.Status}, nil
}

func (r *fakeWatchlistRepository) DeleteWatchListEntry(_ context.Context, arg db.DeleteWatchListEntryParams) error {
	r.deletedWatchlist = arg
	return nil
}

func (r *fakeWatchlistRepository) GetUserWatchList(context.Context, string) ([]db.GetUserWatchListRow, error) {
	return nil, nil
}

func (r *fakeWatchlistRepository) GetUserWatchlistAnimeIDs(_ context.Context, userID string, _ []int64) ([]int64, error) {
	r.watchlistMapCalled = true
	r.watchlistMapUserID = userID
	return r.watchlistAnimeIDs, nil
}

func (r *fakeWatchlistRepository) GetWatchListEntry(context.Context, db.GetWatchListEntryParams) (db.WatchListEntry, error) {
	return db.WatchListEntry{}, sql.ErrNoRows
}

func (r *fakeWatchlistRepository) GetContinueWatchingEntry(context.Context, db.GetContinueWatchingEntryParams) (db.ContinueWatchingEntry, error) {
	return db.ContinueWatchingEntry{}, nil
}

func (r *fakeWatchlistRepository) DeleteContinueWatchingEntry(_ context.Context, arg db.DeleteContinueWatchingEntryParams) error {
	r.deletedContinue = arg
	return r.deleteContinueErr
}

func (r *fakeWatchlistRepository) SaveWatchProgress(_ context.Context, arg db.SaveWatchProgressParams) error {
	r.saveProgressCalled = true
	r.savedProgress = arg
	return nil
}
