package watchlist

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"
	"testing"

	"mal/integrations/metadata"
	"mal/internal/database/db"
	"mal/internal/domain"
)

func TestWatchlistServiceGetWatchlistMap(t *testing.T) {
	repo := &fakeWatchlistRepository{watchlistAnimeIDs: []int64{1, 3}}
	svc := newWatchlistService(repo, nil, nil)

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
	svc := newWatchlistService(repo, nil, nil)

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
	svc := newWatchlistService(repo, nil, nil)

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
	svc := newWatchlistService(repo, nil, nil)

	if err := svc.DeleteContinueWatching(context.Background(), "user-1", 12); err == nil || err.Error() != "delete failed" {
		t.Fatalf("DeleteContinueWatching error = %v, want delete failed", err)
	}
	if repo.saveProgressCalled {
		t.Fatalf("SaveWatchProgress should not run after delete error")
	}
}

func TestWatchlistServiceRemoveEntry(t *testing.T) {
	repo := &fakeWatchlistRepository{}
	invalidator := &fakeRecommendationInvalidator{}
	svc := newWatchlistService(repo, nil, invalidator)

	if err := svc.RemoveEntry(context.Background(), "user-1", 9); err != nil {
		t.Fatalf("RemoveEntry: %v", err)
	}
	if repo.deletedWatchlist.UserID != "user-1" || repo.deletedWatchlist.AnimeID != 9 {
		t.Fatalf("delete params = %#v", repo.deletedWatchlist)
	}
	if invalidator.userID != "user-1" {
		t.Fatalf("invalidated user = %q, want user-1", invalidator.userID)
	}
}

func TestWatchlistServiceUpdateEntryInvalidatesRecommendations(t *testing.T) {
	repo := &fakeWatchlistRepository{}
	invalidator := &fakeRecommendationInvalidator{}
	svc := newWatchlistService(repo, nil, invalidator)

	if err := svc.UpdateEntry(context.Background(), "user-1", 9, "watching"); err != nil {
		t.Fatalf("UpdateEntry: %v", err)
	}
	if invalidator.userID != "user-1" {
		t.Fatalf("invalidated user = %q, want user-1", invalidator.userID)
	}
}

func TestWatchlistServiceUpdateEntryKnownAnimeSkipsProvider(t *testing.T) {
	repo := &fakeWatchlistRepository{anime: db.Anime{ID: 9}}
	provider := &fakeAnimeProvider{anime: testProviderAnime(9)}
	svc := &watchlistService{repo: repo, animeProvider: provider}

	if err := svc.UpdateEntry(context.Background(), "user-1", 9, "watching"); err != nil {
		t.Fatalf("UpdateEntry: %v", err)
	}
	if provider.calls != 0 {
		t.Fatalf("provider calls = %d, want 0", provider.calls)
	}
	if repo.upsertAnimeCalled {
		t.Fatalf("UpsertAnime should not run for known anime")
	}
	if !repo.upsertWatchlistCalled {
		t.Fatalf("UpsertWatchListEntry should run")
	}
}

func TestWatchlistServiceUpdateEntryMissingAnimeFetchesAndInserts(t *testing.T) {
	repo := &fakeWatchlistRepository{animeErr: sql.ErrNoRows}
	provider := &fakeAnimeProvider{anime: testProviderAnime(9)}
	svc := &watchlistService{repo: repo, animeProvider: provider}

	if err := svc.UpdateEntry(context.Background(), "user-1", 9, "watching"); err != nil {
		t.Fatalf("UpdateEntry: %v", err)
	}
	if provider.calls != 1 {
		t.Fatalf("provider calls = %d, want 1", provider.calls)
	}
	if len(provider.ids) != 1 || provider.ids[0] != 9 {
		t.Fatalf("provider ids = %#v, want 9", provider.ids)
	}
	if !repo.upsertAnimeCalled {
		t.Fatalf("UpsertAnime should run for missing anime")
	}
	if repo.upsertedAnime.ID != 9 || repo.upsertedAnime.TitleOriginal != "Anime 9" || repo.upsertedAnime.ImageUrl == "" {
		t.Fatalf("upserted anime = %#v", repo.upsertedAnime)
	}
	if !repo.upsertWatchlistCalled {
		t.Fatalf("UpsertWatchListEntry should run")
	}
}

func TestWatchlistServiceUpdateEntryMissingAnimeProviderFailureWritesNothing(t *testing.T) {
	repo := &fakeWatchlistRepository{animeErr: sql.ErrNoRows}
	provider := &fakeAnimeProvider{err: errors.New("provider unavailable")}
	invalidator := &fakeRecommendationInvalidator{}
	svc := &watchlistService{repo: repo, animeProvider: provider, invalidator: invalidator}

	err := svc.UpdateEntry(context.Background(), "user-1", 9, "watching")
	if err == nil || !strings.Contains(err.Error(), "fetch watchlist anime metadata 9") {
		t.Fatalf("UpdateEntry error = %v, want metadata fetch error", err)
	}
	if repo.inTxCalled {
		t.Fatalf("transaction should not start after metadata fetch failure")
	}
	if repo.upsertAnimeCalled || repo.upsertWatchlistCalled {
		t.Fatalf("writes should not run after metadata fetch failure")
	}
	if invalidator.userID != "" {
		t.Fatalf("invalidated user = %q, want none", invalidator.userID)
	}
}

func TestWatchlistServiceUpdateEntryPreservesProgress(t *testing.T) {
	repo := &fakeWatchlistRepository{
		existingEntry: db.WatchListEntry{
			CurrentEpisode:     sql.NullInt64{Int64: 7, Valid: true},
			CurrentTimeSeconds: 321.5,
		},
	}
	svc := newWatchlistService(repo, nil, nil)

	if err := svc.UpdateEntry(context.Background(), "user-1", 9, "completed"); err != nil {
		t.Fatalf("UpdateEntry: %v", err)
	}
	if !repo.upsertedWatchlist.CurrentEpisode.Valid || repo.upsertedWatchlist.CurrentEpisode.Int64 != 7 {
		t.Fatalf("current episode = %#v, want 7", repo.upsertedWatchlist.CurrentEpisode)
	}
	if repo.upsertedWatchlist.CurrentTimeSeconds != 321.5 {
		t.Fatalf("current time = %f, want 321.5", repo.upsertedWatchlist.CurrentTimeSeconds)
	}
}

func TestWatchlistServiceUpdateEntryTransactionFailureDoesNotInvalidateRecommendations(t *testing.T) {
	repo := &fakeWatchlistRepository{inTxErr: errors.New("commit failed")}
	invalidator := &fakeRecommendationInvalidator{}
	svc := newWatchlistService(repo, nil, invalidator)

	if err := svc.UpdateEntry(context.Background(), "user-1", 9, "watching"); err == nil || err.Error() != "commit failed" {
		t.Fatalf("UpdateEntry error = %v, want commit failed", err)
	}
	if invalidator.userID != "" {
		t.Fatalf("invalidated user = %q, want none", invalidator.userID)
	}
}

type fakeWatchlistRepository struct {
	watchlistAnimeIDs     []int64
	watchlistMapUserID    string
	watchlistMapCalled    bool
	inTxCalled            bool
	saveProgressCalled    bool
	deleteContinueErr     error
	anime                 db.Anime
	animeErr              error
	getAnimeCalls         int
	inTxErr               error
	upsertAnimeCalled     bool
	upsertedAnime         db.UpsertAnimeParams
	upsertWatchlistCalled bool
	upsertedWatchlist     db.UpsertWatchListEntryParams
	existingEntry         db.WatchListEntry
	existingEntryErr      error
	deletedContinue       db.DeleteContinueWatchingEntryParams
	savedProgress         db.SaveWatchProgressParams
	deletedWatchlist      db.DeleteWatchListEntryParams
}

type fakeRecommendationInvalidator struct {
	userID string
}

func (i *fakeRecommendationInvalidator) InvalidateTopPicksForUser(userID string) {
	i.userID = userID
}

func (r *fakeWatchlistRepository) InTx(ctx context.Context, fn func(context.Context, domain.WatchlistRepository) error) error {
	r.inTxCalled = true
	if r.inTxErr != nil {
		return r.inTxErr
	}
	return fn(ctx, r)
}

func (r *fakeWatchlistRepository) UpsertAnime(_ context.Context, arg db.UpsertAnimeParams) (db.Anime, error) {
	r.upsertAnimeCalled = true
	r.upsertedAnime = arg
	return db.Anime{}, nil
}

func (r *fakeWatchlistRepository) GetAnime(context.Context, int64) (db.Anime, error) {
	r.getAnimeCalls++
	if r.animeErr != nil {
		return db.Anime{}, r.animeErr
	}
	return r.anime, nil
}

func (r *fakeWatchlistRepository) UpsertWatchListEntry(_ context.Context, arg db.UpsertWatchListEntryParams) (db.WatchListEntry, error) {
	r.upsertWatchlistCalled = true
	r.upsertedWatchlist = arg
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
	if r.existingEntryErr != nil {
		return db.WatchListEntry{}, r.existingEntryErr
	}
	if r.existingEntry.ID == "" && !r.existingEntry.CurrentEpisode.Valid && r.existingEntry.CurrentTimeSeconds == 0 {
		return db.WatchListEntry{}, sql.ErrNoRows
	}
	return r.existingEntry, nil
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

type fakeAnimeProvider struct {
	anime metadata.Anime
	err   error
	calls int
	ids   []int
}

func (p *fakeAnimeProvider) GetAnimeByID(_ context.Context, id int) (metadata.Anime, error) {
	p.calls++
	p.ids = append(p.ids, id)
	if p.err != nil {
		return metadata.Anime{}, p.err
	}
	return p.anime, nil
}

func testProviderAnime(id int) metadata.Anime {
	anime := metadata.Anime{
		MalID:        id,
		Title:        "Anime " + strconv.Itoa(id),
		TitleEnglish: "English " + strconv.Itoa(id),
	}
	anime.Images.Webp.LargeImageURL = "https://cdn.example/anime.webp"
	return anime
}
