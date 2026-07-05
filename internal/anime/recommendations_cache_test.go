package anime

import (
	"context"
	"errors"
	"testing"
	"time"

	"mal/integrations/jikan"
	"mal/internal/anime/recommendations"
	"mal/internal/domain"
)

func TestGetTopPicksForYouReturnsEmptyOnCacheMissAndRefreshesInBackground(t *testing.T) {
	refreshed := make(chan struct{}, 1)
	svc := NewAnimeService(nil, nil)
	svc.computeTopPicks = func(context.Context, string, int) (domain.CatalogSectionData, error) {
		refreshed <- struct{}{}
		return domain.CatalogSectionData{Animes: []domain.Anime{{Anime: jikan.Anime{MalID: 7}}}}, nil
	}

	got, err := svc.GetTopPicksForYou(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("GetTopPicksForYou cache miss: %v", err)
	}
	if len(got.Animes) != 0 {
		t.Fatalf("cache miss animes = %+v, want empty while refresh runs", got.Animes)
	}

	waitForRefresh(t, refreshed)

	got, err = svc.GetTopPicksForYou(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("GetTopPicksForYou cache hit: %v", err)
	}
	if len(got.Animes) != 1 || got.Animes[0].MalID != 7 {
		t.Fatalf("cache hit animes = %+v, want anime 7", got.Animes)
	}
}

func TestTopPickAndTopPicksShareCache(t *testing.T) {
	refreshed := make(chan struct{}, 1)
	limits := make(chan int, 1)
	svc := NewAnimeService(nil, nil)
	svc.computeTopPicks = func(_ context.Context, _ string, limit int) (domain.CatalogSectionData, error) {
		limits <- limit
		animes := make([]domain.Anime, recommendations.TopPickLimit+1)
		for i := range animes {
			animes[i].MalID = i + 1
		}
		refreshed <- struct{}{}
		return domain.CatalogSectionData{Animes: animes}, nil
	}

	if _, err := svc.GetTopPickForYou(context.Background(), "user-1"); err != nil {
		t.Fatalf("GetTopPickForYou cache miss: %v", err)
	}
	waitForRefresh(t, refreshed)

	carousel, err := svc.GetTopPickForYou(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("GetTopPickForYou cache hit: %v", err)
	}
	if len(carousel.Animes) != recommendations.TopPickLimit {
		t.Fatalf("carousel animes = %d, want %d", len(carousel.Animes), recommendations.TopPickLimit)
	}

	all, err := svc.GetTopPicksForYou(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("GetTopPicksForYou shared cache: %v", err)
	}
	if len(all.Animes) != recommendations.TopPickLimit+1 {
		t.Fatalf("all animes = %d, want %d", len(all.Animes), recommendations.TopPickLimit+1)
	}

	if limit := <-limits; limit != recommendations.TopPicksLimit {
		t.Fatalf("computed limit = %d, want %d", limit, recommendations.TopPicksLimit)
	}
}

func TestGetTopPicksForYouReturnsStaleDataWhenRefreshFails(t *testing.T) {
	svc := NewAnimeService(nil, nil)
	svc.topPicksCacheTTL = time.Nanosecond
	refreshed := make(chan struct{}, 2)
	svc.computeTopPicks = func(context.Context, string, int) (domain.CatalogSectionData, error) {
		refreshed <- struct{}{}
		return domain.CatalogSectionData{Animes: []domain.Anime{{Anime: jikan.Anime{MalID: 11}}}}, nil
	}

	if _, err := svc.GetTopPicksForYou(context.Background(), "user-1"); err != nil {
		t.Fatalf("prime cache: %v", err)
	}
	waitForRefresh(t, refreshed)

	svc.computeTopPicks = func(context.Context, string, int) (domain.CatalogSectionData, error) {
		refreshed <- struct{}{}
		return domain.CatalogSectionData{}, errors.New("provider unavailable")
	}
	time.Sleep(time.Nanosecond)

	got, err := svc.GetTopPicksForYou(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("stale GetTopPicksForYou: %v", err)
	}
	if len(got.Animes) != 1 || got.Animes[0].MalID != 11 {
		t.Fatalf("stale animes = %+v, want anime 11", got.Animes)
	}
}

func TestInvalidateTopPicksForUserRefreshesNextRequest(t *testing.T) {
	refreshed := make(chan struct{}, 2)
	results := []int{3, 4}

	svc := newPickSvc(refreshed, &results)

	primePickCache(t, svc, refreshed)

	svc.InvalidateTopPicksForUser("user-1")

	got, err := svc.GetTopPicksForYou(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("GetTopPicksForYou after invalidation: %v", err)
	}
	if len(got.Animes) != 0 {
		t.Fatalf("invalidated cache animes = %+v, want empty while refresh runs", got.Animes)
	}
	waitForRefresh(t, refreshed)

	got, err = svc.GetTopPicksForYou(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("GetTopPicksForYou refreshed cache: %v", err)
	}
	if len(got.Animes) != 1 || got.Animes[0].MalID != 4 {
		t.Fatalf("refreshed animes = %+v, want anime 4", got.Animes)
	}
}

func newPickSvc(refreshed chan struct{}, results *[]int) *animeService {
	svc := NewAnimeService(nil, nil)
	svc.computeTopPicks = func(context.Context, string, int) (domain.CatalogSectionData, error) {
		id := (*results)[0]
		*results = (*results)[1:]
		refreshed <- struct{}{}
		return domain.CatalogSectionData{Animes: []domain.Anime{{Anime: jikan.Anime{MalID: id}}}}, nil
	}
	return svc
}

func primePickCache(t *testing.T, svc *animeService, refreshed chan struct{}) {
	t.Helper()
	if _, err := svc.GetTopPicksForYou(context.Background(), "user-1"); err != nil {
		t.Fatalf("prime cache: %v", err)
	}
	waitForRefresh(t, refreshed)
}

func waitForRefresh(t *testing.T, refreshed chan struct{}) {
	t.Helper()
	select {
	case <-refreshed:
	case <-time.After(time.Second):
		t.Fatal("background refresh did not run")
	}
}
