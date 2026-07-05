package playback

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"mal/internal/domain"
)

type sourceCacheProvider struct {
	calls atomic.Int32
	get   func(context.Context, int, []string, string, string) (*domain.StreamResult, error)
}

func (p *sourceCacheProvider) Name() string { return "test" }

func (p *sourceCacheProvider) GetStreams(ctx context.Context, animeID int, titles []string, episode string, mode string) (*domain.StreamResult, error) {
	p.calls.Add(1)
	return p.get(ctx, animeID, titles, episode, mode)
}

func newSourceCacheService(provider domain.Provider) *playbackService {
	return &playbackService{
		providers:   []domain.Provider{provider},
		sourceCache: newSourceCache(time.Minute, time.Minute, 8),
	}
}

func TestResolveStreamResultCachesClonedProviderResult(t *testing.T) {
	provider := &sourceCacheProvider{get: func(context.Context, int, []string, string, string) (*domain.StreamResult, error) {
		return &domain.StreamResult{
			URL:       "https://cdn.example.test/episode.m3u8",
			Subtitles: []domain.Subtitle{{URL: "https://cdn.example.test/sub.vtt", Label: "English"}},
		}, nil
	}}
	svc := newSourceCacheService(provider)

	first := svc.resolveStreamResult(context.Background(), 42, []string{"Title"}, "3", "SUB", false, false)
	first.Subtitles[0].Label = "changed"
	second := svc.resolveStreamResult(context.Background(), 42, []string{"Different title"}, "3", "sub", false, false)

	if provider.calls.Load() != 1 {
		t.Fatalf("provider calls = %d, want 1", provider.calls.Load())
	}
	if second == nil || second.Subtitles[0].Label != "English" {
		t.Fatalf("cached result was not cloned: %#v", second)
	}
}

func TestResolveStreamResultCollapsesConcurrentMisses(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	provider := &sourceCacheProvider{get: func(context.Context, int, []string, string, string) (*domain.StreamResult, error) {
		select {
		case <-started:
		default:
			close(started)
		}
		<-release
		return &domain.StreamResult{URL: "https://cdn.example.test/episode.m3u8"}, nil
	}}
	svc := newSourceCacheService(provider)

	const requests = 8
	results := make(chan *domain.StreamResult, requests)
	var wg sync.WaitGroup
	for range requests {
		wg.Go(func() {
			results <- svc.resolveStreamResult(context.Background(), 42, nil, "3", "sub", false, false)
		})
	}
	<-started
	close(release)
	wg.Wait()
	close(results)

	for result := range results {
		if result == nil {
			t.Fatal("concurrent lookup returned nil")
		}
	}
	if provider.calls.Load() != 1 {
		t.Fatalf("provider calls = %d, want 1", provider.calls.Load())
	}
}

func TestResolveStreamResultSeparatesKeysAndForcesRefresh(t *testing.T) {
	provider := &sourceCacheProvider{get: func(_ context.Context, _ int, _ []string, episode string, mode string) (*domain.StreamResult, error) {
		return &domain.StreamResult{URL: "https://cdn.example.test/" + episode + "/" + mode}, nil
	}}
	svc := newSourceCacheService(provider)

	svc.resolveStreamResult(context.Background(), 42, nil, "1", "sub", false, false)
	svc.resolveStreamResult(context.Background(), 42, nil, "2", "sub", false, false)
	svc.resolveStreamResult(context.Background(), 42, nil, "2", "dub", false, false)
	svc.resolveStreamResult(context.Background(), 42, nil, "2", "dub", false, true)

	if provider.calls.Load() != 4 {
		t.Fatalf("provider calls = %d, want 4", provider.calls.Load())
	}
}

func TestResolveStreamResultUsesStaleCompletedMediaOnProviderError(t *testing.T) {
	provider := &sourceCacheProvider{get: func(context.Context, int, []string, string, string) (*domain.StreamResult, error) {
		return nil, errors.New("provider unavailable")
	}}
	svc := newSourceCacheService(provider)
	svc.sourceCache.set(
		newSourceCacheKey(42, "3", "sub"),
		&domain.StreamResult{URL: "https://cdn.example.test/stale.m3u8"},
		time.Now().Add(-90*time.Second),
	)

	result := svc.resolveStreamResult(context.Background(), 42, nil, "3", "sub", true, false)
	if result == nil || result.URL != "https://cdn.example.test/stale.m3u8" {
		t.Fatalf("result = %#v, want stale source", result)
	}
	if airing := svc.resolveStreamResult(context.Background(), 42, nil, "3", "sub", false, false); airing != nil {
		t.Fatalf("airing result = %#v, want nil after provider failure", airing)
	}
}

func TestSourceCacheExpiresAndEvictsLeastRecentlyUsed(t *testing.T) {
	now := time.Unix(100, 0)
	cache := newSourceCache(time.Minute, time.Minute, 2)
	keyA := newSourceCacheKey(1, "1", "sub")
	keyB := newSourceCacheKey(1, "2", "sub")
	keyC := newSourceCacheKey(1, "3", "sub")
	cache.set(keyA, &domain.StreamResult{URL: "a"}, now)
	cache.set(keyB, &domain.StreamResult{URL: "b"}, now)
	cache.get(keyA, now)
	cache.set(keyC, &domain.StreamResult{URL: "c"}, now)

	if _, state := cache.get(keyB, now); state != sourceCacheMiss {
		t.Fatalf("evicted cache state = %d, want miss", state)
	}
	if _, state := cache.get(keyA, now.Add(90*time.Second)); state != sourceCacheStale {
		t.Fatalf("stale cache state = %d, want stale", state)
	}
	if _, state := cache.get(keyA, now.Add(2*time.Minute)); state != sourceCacheMiss {
		t.Fatalf("expired cache state = %d, want miss", state)
	}
}
