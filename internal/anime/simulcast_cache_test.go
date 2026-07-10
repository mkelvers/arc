package anime

import (
	"context"
	"errors"
	"fmt"
	"mal/integrations/playback/allanime"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type scriptedSeasonalProvider struct {
	mu      sync.Mutex
	calls   map[string]int
	scripts map[string][]seasonalProviderResult
}

type seasonalProviderResult struct {
	shows   []allanime.ProviderShow
	err     error
	started chan<- struct{}
	release <-chan struct{}
}

func (p *scriptedSeasonalProvider) SeasonalShows(ctx context.Context, season string, year int) ([]allanime.ProviderShow, error) {
	key := seasonTestKey(season, year)

	p.mu.Lock()
	if p.calls == nil {
		p.calls = map[string]int{}
	}
	p.calls[key]++
	result := p.nextResultLocked(key)
	p.mu.Unlock()

	if result.started != nil {
		result.started <- struct{}{}
	}
	if result.release != nil {
		select {
		case <-result.release:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	if result.err != nil {
		return nil, result.err
	}
	return cloneProviderShows(result.shows), nil
}

func (p *scriptedSeasonalProvider) nextResultLocked(key string) seasonalProviderResult {
	if len(p.scripts[key]) == 0 {
		return seasonalProviderResult{}
	}
	result := p.scripts[key][0]
	p.scripts[key] = p.scripts[key][1:]
	return result
}

func (p *scriptedSeasonalProvider) callCount(season string, year int) int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.calls[seasonTestKey(season, year)]
}

func seasonTestKey(season string, year int) string {
	return fmt.Sprintf("%s-%d", season, year)
}

type atomicClock struct {
	nanos atomic.Int64
}

func newAtomicClock(now time.Time) *atomicClock {
	clock := &atomicClock{}
	clock.nanos.Store(now.UnixNano())
	return clock
}

func (c *atomicClock) now() time.Time {
	return time.Unix(0, c.nanos.Load())
}

func (c *atomicClock) advance(d time.Duration) {
	c.nanos.Add(int64(d))
}

func TestGetSimulcastCachesSeasonWithinTTL(t *testing.T) {
	provider := &scriptedSeasonalProvider{scripts: map[string][]seasonalProviderResult{
		"winter-2024": {{shows: []allanime.ProviderShow{{MalID: 1, Name: "First"}}}},
	}}
	svc := newSeasonDiscoveryService(provider)

	first, err := svc.GetSimulcast(context.Background(), animeSeason{Season: "winter", Year: 2024})
	if err != nil {
		t.Fatalf("first GetSimulcast: %v", err)
	}
	second, err := svc.GetSimulcast(context.Background(), animeSeason{Season: "winter", Year: 2024})
	if err != nil {
		t.Fatalf("second GetSimulcast: %v", err)
	}

	if len(first.Animes) != 1 || first.Animes[0].MalID != 1 {
		t.Fatalf("first animes = %+v, want anime 1", first.Animes)
	}
	if len(second.Animes) != 1 || second.Animes[0].MalID != 1 {
		t.Fatalf("second animes = %+v, want anime 1", second.Animes)
	}
	if got := provider.callCount("winter", 2024); got != 1 {
		t.Fatalf("provider calls = %d, want 1", got)
	}
}

func TestLatestAvailableSeasonPopulatesSharedSeasonCache(t *testing.T) {
	provider := &scriptedSeasonalProvider{scripts: map[string][]seasonalProviderResult{
		"summer-2026": {{shows: []allanime.ProviderShow{{MalID: 2, Name: "Shared"}}}},
	}}
	svc := newSeasonDiscoveryService(provider)

	latest := svc.LatestAvailableSeason(context.Background(), animeSeason{Season: "spring", Year: 2026})
	if latest != (animeSeason{Season: "summer", Year: 2026}) {
		t.Fatalf("LatestAvailableSeason = %+v, want summer 2026", latest)
	}

	data, err := svc.GetSimulcast(context.Background(), latest)
	if err != nil {
		t.Fatalf("GetSimulcast after latest lookup: %v", err)
	}
	if len(data.Animes) != 1 || data.Animes[0].MalID != 2 {
		t.Fatalf("cached animes = %+v, want anime 2", data.Animes)
	}
	if got := provider.callCount("summer", 2026); got != 1 {
		t.Fatalf("provider calls = %d, want 1", got)
	}
}

func TestConcurrentSimulcastMissesShareProviderCall(t *testing.T) {
	started := make(chan struct{}, 1)
	release := make(chan struct{})
	provider := &scriptedSeasonalProvider{scripts: map[string][]seasonalProviderResult{
		"winter-2024": {{
			shows:   []allanime.ProviderShow{{MalID: 3, Name: "Concurrent"}},
			started: started,
			release: release,
		}},
	}}
	svc := newSeasonDiscoveryService(provider)

	const workers = 8
	ready := make(chan struct{}, workers)
	start := make(chan struct{})
	errs := make(chan error, workers)
	var wg sync.WaitGroup
	for range workers {
		wg.Go(func() {
			ready <- struct{}{}
			<-start
			data, err := svc.GetSimulcast(context.Background(), animeSeason{Season: "winter", Year: 2024})
			if err != nil {
				errs <- err
				return
			}
			if len(data.Animes) != 1 || data.Animes[0].MalID != 3 {
				errs <- fmt.Errorf("animes = %+v, want anime 3", data.Animes)
			}
		})
	}
	for range workers {
		<-ready
	}
	close(start)
	waitForSignal(t, started, "provider call did not start")
	time.Sleep(20 * time.Millisecond)
	close(release)
	wg.Wait()
	close(errs)

	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if got := provider.callCount("winter", 2024); got != 1 {
		t.Fatalf("provider calls = %d, want 1", got)
	}
}

func TestGetSimulcastServesStaleDataWhileRefreshing(t *testing.T) {
	started := make(chan struct{}, 1)
	release := make(chan struct{})
	provider := &scriptedSeasonalProvider{scripts: map[string][]seasonalProviderResult{
		"winter-2024": {
			{shows: []allanime.ProviderShow{{MalID: 4, Name: "Stale"}}},
			{
				shows:   []allanime.ProviderShow{{MalID: 5, Name: "Fresh"}},
				started: started,
				release: release,
			},
		},
	}}
	svc := newSeasonDiscoveryService(provider)
	clock := newAtomicClock(time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC))
	svc.now = clock.now

	if _, err := svc.GetSimulcast(context.Background(), animeSeason{Season: "winter", Year: 2024}); err != nil {
		t.Fatalf("prime GetSimulcast: %v", err)
	}
	clock.advance(seasonalCacheFreshTTL + time.Second)

	stale, err := svc.GetSimulcast(context.Background(), animeSeason{Season: "winter", Year: 2024})
	if err != nil {
		t.Fatalf("stale GetSimulcast: %v", err)
	}
	if len(stale.Animes) != 1 || stale.Animes[0].MalID != 4 {
		t.Fatalf("stale animes = %+v, want anime 4", stale.Animes)
	}

	waitForSignal(t, started, "background refresh did not start")
	close(release)
	waitForCondition(t, func() bool {
		data, err := svc.GetSimulcast(context.Background(), animeSeason{Season: "winter", Year: 2024})
		return err == nil && len(data.Animes) == 1 && data.Animes[0].MalID == 5
	}, "cache did not update after background refresh")
}

func TestEmptyNextSeasonUsesShorterTTL(t *testing.T) {
	refreshed := make(chan struct{}, 1)
	provider := &scriptedSeasonalProvider{scripts: map[string][]seasonalProviderResult{
		"summer-2026": {
			{shows: []allanime.ProviderShow{}},
			{shows: []allanime.ProviderShow{{MalID: 6, Name: "New Season"}}, started: refreshed},
		},
	}}
	svc := newSeasonDiscoveryService(provider)
	clock := newAtomicClock(time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC))
	svc.now = clock.now

	current := animeSeason{Season: "spring", Year: 2026}
	if latest := svc.LatestAvailableSeason(context.Background(), current); latest != current {
		t.Fatalf("first latest = %+v, want current %+v", latest, current)
	}

	clock.advance(9 * time.Minute)
	if latest := svc.LatestAvailableSeason(context.Background(), current); latest != current {
		t.Fatalf("fresh empty latest = %+v, want current %+v", latest, current)
	}
	if got := provider.callCount("summer", 2026); got != 1 {
		t.Fatalf("provider calls before empty TTL expires = %d, want 1", got)
	}

	clock.advance(2 * time.Minute)
	if latest := svc.LatestAvailableSeason(context.Background(), current); latest != current {
		t.Fatalf("stale empty latest = %+v, want current %+v", latest, current)
	}
	waitForSignal(t, refreshed, "empty next-season refresh did not start")
	waitForCondition(t, func() bool {
		return svc.LatestAvailableSeason(context.Background(), current) == (animeSeason{Season: "summer", Year: 2026})
	}, "latest season did not update after empty TTL refresh")
	if got := provider.callCount("summer", 2026); got != 2 {
		t.Fatalf("provider calls after empty TTL refresh = %d, want 2", got)
	}
}

func TestSeasonalCacheKeysDoNotCollide(t *testing.T) {
	provider := &scriptedSeasonalProvider{scripts: map[string][]seasonalProviderResult{
		"winter-2024": {{shows: []allanime.ProviderShow{{MalID: 7, Name: "Winter"}}}},
		"spring-2024": {{shows: []allanime.ProviderShow{{MalID: 8, Name: "Spring"}}}},
	}}
	svc := newSeasonDiscoveryService(provider)

	winter, err := svc.GetSimulcast(context.Background(), animeSeason{Season: "winter", Year: 2024})
	if err != nil {
		t.Fatalf("winter GetSimulcast: %v", err)
	}
	spring, err := svc.GetSimulcast(context.Background(), animeSeason{Season: "spring", Year: 2024})
	if err != nil {
		t.Fatalf("spring GetSimulcast: %v", err)
	}

	if winter.Animes[0].MalID != 7 || spring.Animes[0].MalID != 8 {
		t.Fatalf("animes = winter %+v spring %+v, want distinct cache entries", winter.Animes, spring.Animes)
	}
}

func TestSeasonalCacheEvictsOldEntriesAtLimit(t *testing.T) {
	scripts := map[string][]seasonalProviderResult{}
	for i := range seasonalCacheMaxEntries + 5 {
		year := 2000 + i
		scripts[seasonTestKey("winter", year)] = []seasonalProviderResult{{
			shows: []allanime.ProviderShow{{MalID: year, Name: fmt.Sprintf("Winter %d", year)}},
		}}
	}
	provider := &scriptedSeasonalProvider{scripts: scripts}
	svc := newSeasonDiscoveryService(provider)

	for i := range seasonalCacheMaxEntries + 5 {
		year := 2000 + i
		if _, err := svc.GetSimulcast(context.Background(), animeSeason{Season: "winter", Year: year}); err != nil {
			t.Fatalf("GetSimulcast(%d): %v", year, err)
		}
	}

	svc.seasonalCache.mu.Lock()
	got := len(svc.seasonalCache.entries)
	svc.seasonalCache.mu.Unlock()
	if got > seasonalCacheMaxEntries {
		t.Fatalf("cache entries = %d, want at most %d", got, seasonalCacheMaxEntries)
	}
}

func TestCachedProviderShowsAreCloned(t *testing.T) {
	provider := &scriptedSeasonalProvider{scripts: map[string][]seasonalProviderResult{
		"winter-2024": {{shows: []allanime.ProviderShow{{
			MalID:       9,
			Name:        "Original",
			SubEpisodes: []int{1},
			DubEpisodes: []int{2},
		}}}},
	}}
	svc := newSeasonDiscoveryService(provider)
	selected := animeSeason{Season: "winter", Year: 2024}
	opts := seasonalFetchOptions{source: "test", emptyFreshTTL: seasonalCacheFreshTTL}

	shows, err := svc.cachedSeasonalShows(context.Background(), selected, opts)
	if err != nil {
		t.Fatalf("cachedSeasonalShows: %v", err)
	}
	shows[0].Name = "Mutated"
	shows[0].SubEpisodes[0] = 99
	shows[0].DubEpisodes[0] = 100

	cached, err := svc.cachedSeasonalShows(context.Background(), selected, opts)
	if err != nil {
		t.Fatalf("cachedSeasonalShows hit: %v", err)
	}
	if cached[0].Name != "Original" || cached[0].SubEpisodes[0] != 1 || cached[0].DubEpisodes[0] != 2 {
		t.Fatalf("cached show was mutated: %+v", cached[0])
	}
}

func TestGetSimulcastServesStaleDataWhenRefreshFails(t *testing.T) {
	refreshed := make(chan struct{}, 1)
	provider := &scriptedSeasonalProvider{scripts: map[string][]seasonalProviderResult{
		"winter-2024": {
			{shows: []allanime.ProviderShow{{MalID: 10, Name: "Stale"}}},
			{err: errors.New("provider unavailable"), started: refreshed},
		},
	}}
	svc := newSeasonDiscoveryService(provider)
	clock := newAtomicClock(time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC))
	svc.now = clock.now

	if _, err := svc.GetSimulcast(context.Background(), animeSeason{Season: "winter", Year: 2024}); err != nil {
		t.Fatalf("prime GetSimulcast: %v", err)
	}
	clock.advance(seasonalCacheFreshTTL + time.Second)

	stale, err := svc.GetSimulcast(context.Background(), animeSeason{Season: "winter", Year: 2024})
	if err != nil {
		t.Fatalf("stale GetSimulcast after provider failure: %v", err)
	}
	if len(stale.Animes) != 1 || stale.Animes[0].MalID != 10 {
		t.Fatalf("stale animes = %+v, want anime 10", stale.Animes)
	}
	waitForSignal(t, refreshed, "failed refresh did not run")
}

func waitForSignal(t *testing.T, ch <-chan struct{}, message string) {
	t.Helper()
	select {
	case <-ch:
	case <-time.After(time.Second):
		t.Fatal(message)
	}
}

func waitForCondition(t *testing.T, condition func() bool, message string) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal(message)
}
