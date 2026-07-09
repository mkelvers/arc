package anime

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"mal/integrations/metadata"
	"mal/internal/anime/recommendations"
	"mal/internal/domain"
)

func TestGetTopPicksForYouReturnsRefreshingOnCacheMissAndRefreshesInBackground(t *testing.T) {
	refreshed := make(chan struct{}, 1)
	svc := NewAnimeService(nil, nil)
	svc.computeTopPicks = func(context.Context, string, int) (domain.CatalogSectionData, error) {
		refreshed <- struct{}{}
		return domain.CatalogSectionData{Animes: []domain.Anime{{Anime: metadata.Anime{MalID: 7}}}}, nil
	}

	got, err := svc.GetTopPicksForYou(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("GetTopPicksForYou cache miss: %v", err)
	}
	if len(got.Animes) != 0 {
		t.Fatalf("cache miss animes = %+v, want empty while refresh runs", got.Animes)
	}
	if got.RecommendationState != domain.RecommendationStateRefreshing {
		t.Fatalf("cache miss state = %q, want %q", got.RecommendationState, domain.RecommendationStateRefreshing)
	}

	waitForRefresh(t, refreshed)
	got = waitForTopPicksState(t, svc, func(data domain.CatalogSectionData) bool {
		return data.RecommendationState == domain.RecommendationStateReady && len(data.Animes) == 1 && data.Animes[0].MalID == 7
	})
	if len(got.Animes) != 1 || got.Animes[0].MalID != 7 {
		t.Fatalf("cache hit animes = %+v, want anime 7", got.Animes)
	}
	if got.RecommendationState != domain.RecommendationStateReady {
		t.Fatalf("cache hit state = %q, want %q", got.RecommendationState, domain.RecommendationStateReady)
	}
}

func TestGetTopPicksForYouCachesCompletedEmptyResult(t *testing.T) {
	refreshed := make(chan struct{}, 1)
	var calls int32
	svc := NewAnimeService(nil, nil)
	svc.computeTopPicks = func(context.Context, string, int) (domain.CatalogSectionData, error) {
		atomic.AddInt32(&calls, 1)
		refreshed <- struct{}{}
		return domain.CatalogSectionData{Animes: []domain.Anime{}}, nil
	}

	got, err := svc.GetTopPicksForYou(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("GetTopPicksForYou cache miss: %v", err)
	}
	if got.RecommendationState != domain.RecommendationStateRefreshing {
		t.Fatalf("cache miss state = %q, want %q", got.RecommendationState, domain.RecommendationStateRefreshing)
	}
	waitForRefresh(t, refreshed)

	got = waitForTopPicksState(t, svc, func(data domain.CatalogSectionData) bool {
		return data.RecommendationState == domain.RecommendationStateEmpty
	})
	if got.RecommendationState != domain.RecommendationStateEmpty {
		t.Fatalf("completed empty state = %q, want %q", got.RecommendationState, domain.RecommendationStateEmpty)
	}

	got, err = svc.GetTopPicksForYou(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("GetTopPicksForYou cached empty: %v", err)
	}
	if got.RecommendationState != domain.RecommendationStateEmpty {
		t.Fatalf("cached empty state = %q, want %q", got.RecommendationState, domain.RecommendationStateEmpty)
	}
	if got := atomic.LoadInt32(&calls); got != 1 {
		t.Fatalf("compute calls = %d, want 1", got)
	}
}

func TestGetTopPicksForYouReturnsFailedWhenRefreshFailsWithoutData(t *testing.T) {
	refreshed := make(chan struct{}, 1)
	svc := NewAnimeService(nil, nil)
	svc.computeTopPicks = func(context.Context, string, int) (domain.CatalogSectionData, error) {
		refreshed <- struct{}{}
		return domain.CatalogSectionData{}, errors.New("provider unavailable")
	}

	got, err := svc.GetTopPicksForYou(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("GetTopPicksForYou cache miss: %v", err)
	}
	if got.RecommendationState != domain.RecommendationStateRefreshing {
		t.Fatalf("cache miss state = %q, want %q", got.RecommendationState, domain.RecommendationStateRefreshing)
	}
	waitForRefresh(t, refreshed)

	got = waitForTopPicksState(t, svc, func(data domain.CatalogSectionData) bool {
		return data.RecommendationState == domain.RecommendationStateFailed
	})
	if got.RecommendationState != domain.RecommendationStateFailed {
		t.Fatalf("failed state = %q, want %q", got.RecommendationState, domain.RecommendationStateFailed)
	}
	if got.RetryAfterSeconds <= 0 {
		t.Fatalf("RetryAfterSeconds = %d, want positive retry delay", got.RetryAfterSeconds)
	}
}

func TestGetTopPicksForYouJoinsColdRefresh(t *testing.T) {
	started := make(chan struct{}, 1)
	completed := make(chan struct{}, 1)
	release := make(chan struct{})
	var calls int32
	svc := NewAnimeService(nil, nil)
	svc.computeTopPicks = func(context.Context, string, int) (domain.CatalogSectionData, error) {
		atomic.AddInt32(&calls, 1)
		started <- struct{}{}
		<-release
		completed <- struct{}{}
		return domain.CatalogSectionData{Animes: []domain.Anime{{Anime: metadata.Anime{MalID: 7}}}}, nil
	}

	first, err := svc.GetTopPicksForYou(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("first GetTopPicksForYou: %v", err)
	}
	waitForRefresh(t, started)

	second, err := svc.GetTopPicksForYou(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("second GetTopPicksForYou: %v", err)
	}
	if first.RecommendationState != domain.RecommendationStateRefreshing || second.RecommendationState != domain.RecommendationStateRefreshing {
		t.Fatalf("states = %q/%q, want refreshing while one compute runs", first.RecommendationState, second.RecommendationState)
	}
	if got := atomic.LoadInt32(&calls); got != 1 {
		t.Fatalf("compute calls = %d, want 1", got)
	}

	close(release)
	waitForRefresh(t, completed)
	waitForTopPicksState(t, svc, func(data domain.CatalogSectionData) bool {
		return data.RecommendationState == domain.RecommendationStateReady && len(data.Animes) == 1 && data.Animes[0].MalID == 7
	})
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
	waitForTopPicksState(t, svc, func(data domain.CatalogSectionData) bool {
		return data.RecommendationState == domain.RecommendationStateReady && len(data.Animes) == recommendations.TopPickLimit+1
	})

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
	refreshed := make(chan struct{}, 2)
	svc.computeTopPicks = func(context.Context, string, int) (domain.CatalogSectionData, error) {
		refreshed <- struct{}{}
		return domain.CatalogSectionData{Animes: []domain.Anime{{Anime: metadata.Anime{MalID: 11}}}}, nil
	}

	if _, err := svc.GetTopPicksForYou(context.Background(), "user-1"); err != nil {
		t.Fatalf("prime cache: %v", err)
	}
	waitForRefresh(t, refreshed)
	waitForTopPicksState(t, svc, func(data domain.CatalogSectionData) bool {
		return data.RecommendationState == domain.RecommendationStateReady && len(data.Animes) == 1 && data.Animes[0].MalID == 11
	})

	svc.topPicksCacheTTL = time.Nanosecond
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
	if got.RecommendationState != domain.RecommendationStateStale {
		t.Fatalf("stale state = %q, want %q", got.RecommendationState, domain.RecommendationStateStale)
	}
	waitForRefresh(t, refreshed)
}

func TestInvalidateTopPicksForUserPreservesStaleCardsAndRefreshes(t *testing.T) {
	refreshed := make(chan struct{}, 2)
	proceed := make(chan struct{})
	var calls int32
	svc := NewAnimeService(nil, nil)
	svc.computeTopPicks = func(context.Context, string, int) (domain.CatalogSectionData, error) {
		call := atomic.AddInt32(&calls, 1)
		if call == 2 {
			<-proceed
		}
		refreshed <- struct{}{}
		return domain.CatalogSectionData{Animes: []domain.Anime{{Anime: metadata.Anime{MalID: int(call + 2)}}}}, nil
	}

	primePickCache(t, svc, refreshed)
	svc.InvalidateTopPicksForUser("user-1")

	got, err := svc.GetTopPicksForYou(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("GetTopPicksForYou after invalidation: %v", err)
	}
	assertTopPicksAnimeState(t, got, 3, domain.RecommendationStateStale, "invalidated")

	close(proceed)
	waitForRefresh(t, refreshed)

	got = waitForTopPicksState(t, svc, func(data domain.CatalogSectionData) bool {
		return data.RecommendationState == domain.RecommendationStateReady && len(data.Animes) == 1 && data.Animes[0].MalID == 4
	})
	assertTopPicksAnimeState(t, got, 4, domain.RecommendationStateReady, "refreshed")
}

func primePickCache(t *testing.T, svc *animeService, refreshed chan struct{}) {
	t.Helper()
	if _, err := svc.GetTopPicksForYou(context.Background(), "user-1"); err != nil {
		t.Fatalf("prime cache: %v", err)
	}
	waitForRefresh(t, refreshed)
	waitForTopPicksState(t, svc, func(data domain.CatalogSectionData) bool {
		return data.RecommendationState == domain.RecommendationStateReady && len(data.Animes) > 0
	})
}

func waitForRefresh(t *testing.T, refreshed chan struct{}) {
	t.Helper()
	select {
	case <-refreshed:
	case <-time.After(time.Second):
		t.Fatal("background refresh did not run")
	}
}

func waitForTopPicksState(t *testing.T, svc *animeService, ready func(domain.CatalogSectionData) bool) domain.CatalogSectionData {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	var last domain.CatalogSectionData
	for time.Now().Before(deadline) {
		got, err := svc.GetTopPicksForYou(context.Background(), "user-1")
		if err != nil {
			t.Fatalf("GetTopPicksForYou while waiting for cache state: %v", err)
		}
		last = got
		if ready(got) {
			return got
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("top picks cache did not reach expected state; last = %+v", last)
	return last
}

func assertTopPicksAnimeState(t *testing.T, data domain.CatalogSectionData, malID int, state domain.RecommendationRefreshState, label string) {
	t.Helper()
	if len(data.Animes) != 1 || data.Animes[0].MalID != malID {
		t.Fatalf("%s animes = %+v, want anime %d", label, data.Animes, malID)
	}
	if data.RecommendationState != state {
		t.Fatalf("%s state = %q, want %q", label, data.RecommendationState, state)
	}
}
