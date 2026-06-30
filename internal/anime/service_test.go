package anime

import (
	"context"
	"mal/internal/db"
	"testing"
)

type catalogRepoStub struct {
	watchlist            []db.GetUserWatchListRow
	allContinueRows      []db.GetContinueWatchingEntriesRow
	carouselContinueRows []db.GetContinueWatchingEntriesRow
	carouselLimit        int64
}

func (r *catalogRepoStub) GetUserWatchList(ctx context.Context, userID string) ([]db.GetUserWatchListRow, error) {
	return r.watchlist, nil
}

func (r *catalogRepoStub) GetWatchListEntry(ctx context.Context, params db.GetWatchListEntryParams) (db.WatchListEntry, error) {
	return db.WatchListEntry{}, nil
}

func (r *catalogRepoStub) GetContinueWatchingEntries(ctx context.Context, userID string) ([]db.GetContinueWatchingEntriesRow, error) {
	return r.allContinueRows, nil
}

func (r *catalogRepoStub) GetContinueWatchingCarouselEntries(ctx context.Context, userID string, limit int64) ([]db.GetContinueWatchingEntriesRow, error) {
	r.carouselLimit = limit
	return r.carouselContinueRows, nil
}

func TestGetCatalogSectionLimitsContinueWatchingCarousel(t *testing.T) {
	repo := &catalogRepoStub{
		allContinueRows: make([]db.GetContinueWatchingEntriesRow, 30),
		carouselContinueRows: []db.GetContinueWatchingEntriesRow{
			{AnimeID: 30},
			{AnimeID: 29},
		},
	}
	svc := NewAnimeService(nil, repo)

	got, err := svc.GetCatalogSection(context.Background(), "user-1", "Continue")
	if err != nil {
		t.Fatalf("GetCatalogSection: %v", err)
	}
	if repo.carouselLimit != continueWatchingCarouselLimit {
		t.Fatalf("carousel limit = %d, want %d", repo.carouselLimit, continueWatchingCarouselLimit)
	}
	if len(got.ContinueWatching) != len(repo.carouselContinueRows) {
		t.Fatalf("len(ContinueWatching) = %d, want %d", len(got.ContinueWatching), len(repo.carouselContinueRows))
	}
	if got.ContinueWatching[0].AnimeID != 30 || got.ContinueWatching[1].AnimeID != 29 {
		t.Fatalf("ContinueWatching = %+v, want anime IDs [30 29]", got.ContinueWatching)
	}
}
