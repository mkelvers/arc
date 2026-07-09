package playback

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"mal/internal/db"
	"mal/internal/domain"
	"net/http"
	"strings"
	"testing"
	"time"
)

type fakeCanonicalEpisodeService struct {
	list domain.CanonicalEpisodeList
	err  error
}

func (s fakeCanonicalEpisodeService) GetCanonicalEpisodes(context.Context, domain.Anime, bool) (domain.CanonicalEpisodeList, error) {
	return s.list, s.err
}

func (s fakeCanonicalEpisodeService) RefreshTrackedDue(context.Context, int) error {
	return nil
}

func TestWatchModeSourcesDefersProviderResolution(t *testing.T) {
	provider := &sourceCacheProvider{get: func(context.Context, int, []string, string, string) (*domain.StreamResult, error) {
		t.Fatal("deferred watch page resolved a provider source")
		return nil, nil
	}}
	svc := newSourceCacheService(provider)

	sources, result, mode, from := svc.watchModeSources(
		context.Background(), 42, nil, "1", "sub", "", false, true,
	)

	if len(sources) != 0 || result != nil || mode != "sub" || from != "" {
		t.Fatalf("deferred result = (%v, %v, %q, %q)", sources, result, mode, from)
	}
	if provider.calls.Load() != 0 {
		t.Fatalf("provider calls = %d, want 0", provider.calls.Load())
	}
}

func TestBuildWatchDataRunsIndependentBranchesConcurrently(t *testing.T) {
	setup := newConcurrentWatchDataSetup()
	releaseClosed := false

	done := make(chan watchDataResult, 1)
	go func() {
		data, err := setup.svc.BuildWatchData(context.Background(), 12, nil, "1", "sub", "user-1")
		done <- watchDataResult{data: data, err: err}
	}()
	doneConsumed := false
	defer func() {
		if !releaseClosed {
			close(setup.release)
		}
		if !doneConsumed {
			<-done
		}
	}()

	waitForSignal(t, setup.sourceStarted, "source resolution did not start")
	waitForSignal(t, setup.progressStarted, "progress lookup did not start")
	waitForSignal(t, setup.segmentsStarted, "segment lookup did not start")
	close(setup.release)
	releaseClosed = true

	result := <-done
	doneConsumed = true
	if result.err != nil {
		t.Fatalf("BuildWatchData() error = %v", result.err)
	}
	if result.data.WatchData.StartTimeSeconds != 42 {
		t.Fatalf("start time = %f, want 42", result.data.WatchData.StartTimeSeconds)
	}
	if source := result.data.WatchData.ModeSources["sub"]; source.Type != "hls" {
		t.Fatalf("sub source = %#v, want hls source", source)
	}
	if len(result.data.WatchData.Segments) != 1 || result.data.WatchData.Segments[0].Type != "opening" {
		t.Fatalf("segments = %#v, want opening segment", result.data.WatchData.Segments)
	}
}

func TestBuildWatchDataCancellationStopsRequestBranches(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	sourceStarted := make(chan struct{})
	providerRelease := make(chan struct{})
	providerDone := make(chan struct{}, 2)
	providerReleaseClosed := false
	progressStarted := make(chan struct{})
	progressCanceled := make(chan struct{})
	segmentsStarted := make(chan struct{})
	segmentsCanceled := make(chan struct{})
	defer func() {
		if !providerReleaseClosed {
			close(providerRelease)
		}
	}()

	provider := &sourceCacheProvider{get: func(context.Context, int, []string, string, string) (*domain.StreamResult, error) {
		signal(sourceStarted)
		defer func() { providerDone <- struct{}{} }()
		<-providerRelease
		return &domain.StreamResult{URL: "https://cdn.example.test/episode.m3u8"}, nil
	}}
	repo := &fakePlaybackRepository{
		getWatchListEntryFunc: func(ctx context.Context, params db.GetWatchListEntryParams) (db.WatchListEntry, error) {
			signal(progressStarted)
			<-ctx.Done()
			signal(progressCanceled)
			return db.WatchListEntry{}, ctx.Err()
		},
	}
	transport := roundTripFunc(func(req *http.Request) (*http.Response, error) {
		signal(segmentsStarted)
		<-req.Context().Done()
		signal(segmentsCanceled)
		return nil, req.Context().Err()
	})
	svc := newWatchDataBuildService(repo, provider, transport)

	done := make(chan watchDataResult, 1)
	go func() {
		data, err := svc.BuildWatchData(ctx, 12, nil, "1", "sub", "user-1")
		done <- watchDataResult{data: data, err: err}
	}()

	waitForSignal(t, sourceStarted, "source resolution did not start")
	waitForSignal(t, progressStarted, "progress lookup did not start")
	waitForSignal(t, segmentsStarted, "segment lookup did not start")
	cancel()

	waitForSignal(t, progressCanceled, "progress lookup did not observe cancellation")
	waitForSignal(t, segmentsCanceled, "segment lookup did not observe cancellation")

	result := waitForWatchDataResult(t, done)
	if result.err == nil || !strings.Contains(result.err.Error(), "no streams found") {
		t.Fatalf("BuildWatchData() error = %v, want no-stream error after cancellation", result.err)
	}

	close(providerRelease)
	providerReleaseClosed = true
	waitForSignal(t, providerDone, "provider source goroutine did not finish")
}

func TestWatchAnimeUsesLocalRow(t *testing.T) {
	svc := &playbackService{repo: &fakePlaybackRepository{}}

	anime, err := svc.watchAnime(context.Background(), 12)
	if err != nil {
		t.Fatalf("watchAnime() error = %v", err)
	}
	if anime.MalID != 12 || anime.Title != "Anime 12" {
		t.Fatalf("watchAnime() = %+v", anime.Anime)
	}
}

type watchDataResult struct {
	data domain.WatchPageData
	err  error
}

type concurrentWatchDataSetup struct {
	svc             *playbackService
	sourceStarted   chan struct{}
	progressStarted chan struct{}
	segmentsStarted chan struct{}
	release         chan struct{}
}

func newConcurrentWatchDataSetup() concurrentWatchDataSetup {
	sourceStarted := make(chan struct{})
	progressStarted := make(chan struct{})
	segmentsStarted := make(chan struct{})
	release := make(chan struct{})
	provider := &sourceCacheProvider{get: func(context.Context, int, []string, string, string) (*domain.StreamResult, error) {
		signal(sourceStarted)
		<-release
		return &domain.StreamResult{URL: "https://cdn.example.test/episode.m3u8", Type: "hls"}, nil
	}}
	repo := &fakePlaybackRepository{
		getWatchListEntryFunc: func(context.Context, db.GetWatchListEntryParams) (db.WatchListEntry, error) {
			signal(progressStarted)
			<-release
			return watchlistProgressEntry(), nil
		},
	}
	transport := roundTripFunc(func(*http.Request) (*http.Response, error) {
		signal(segmentsStarted)
		<-release
		return skipSegmentResponse(`{"found":true,"results":[{"skip_type":"op","interval":{"start_time":90,"end_time":180}}]}`), nil
	})
	return concurrentWatchDataSetup{
		svc:             newWatchDataBuildService(repo, provider, transport),
		sourceStarted:   sourceStarted,
		progressStarted: progressStarted,
		segmentsStarted: segmentsStarted,
		release:         release,
	}
}

func watchlistProgressEntry() db.WatchListEntry {
	return db.WatchListEntry{
		UserID:             "user-1",
		AnimeID:            12,
		Status:             "watching",
		CurrentEpisode:     sql.NullInt64{Int64: 1, Valid: true},
		CurrentTimeSeconds: 42,
	}
}

func newWatchDataBuildService(repo *fakePlaybackRepository, provider domain.Provider, transport http.RoundTripper) *playbackService {
	return &playbackService{
		repo:      repo,
		providers: []domain.Provider{provider},
		episodes: fakeCanonicalEpisodeService{list: domain.CanonicalEpisodeList{
			AnimeID: 12,
			Episodes: []domain.CanonicalEpisode{{
				Number: 1,
				HasSub: true,
			}},
		}},
		httpClient:  &http.Client{Transport: transport},
		proxyTokens: newProxyTokenStore(),
		sourceCache: newSourceCache(time.Minute, time.Minute, 8),
	}
}

func skipSegmentResponse(body string) *http.Response {
	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}

func signal(ch chan struct{}) {
	defer func() {
		_ = recover()
	}()
	close(ch)
}

func waitForSignal(t *testing.T, ch <-chan struct{}, message string) {
	t.Helper()
	select {
	case <-ch:
	case <-time.After(2 * time.Second):
		t.Fatal(message)
	}
}

func waitForWatchDataResult(t *testing.T, ch <-chan watchDataResult) watchDataResult {
	t.Helper()
	select {
	case result := <-ch:
		return result
	case <-time.After(2 * time.Second):
		t.Fatal("BuildWatchData did not return")
		return watchDataResult{err: fmt.Errorf("unreachable")}
	}
}

func TestFallbackModes(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		mode string
		want []string
	}{
		{name: "sub falls back to dub", mode: "sub", want: []string{"dub"}},
		{name: "dub falls back to sub", mode: "dub", want: []string{"sub"}},
		{name: "unknown tries both canonical modes", mode: "raw", want: []string{"sub", "dub"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := fallbackModes(tt.mode)
			if len(got) != len(tt.want) {
				t.Fatalf("len(got) = %d, want %d", len(got), len(tt.want))
			}
			for i, want := range tt.want {
				if got[i] != want {
					t.Fatalf("got[%d] = %q, want %q", i, got[i], want)
				}
			}
		})
	}
}

func TestEpisodeAvailabilityWarning(t *testing.T) {
	now := time.Date(2026, time.June, 27, 11, 0, 0, 0, time.UTC)
	tests := []struct {
		name string
		list domain.CanonicalEpisodeList
		want string
	}{
		{
			name: "fresh availability does not warn",
			list: domain.CanonicalEpisodeList{
				Episodes:      []domain.CanonicalEpisode{{Number: 1, HasSub: true}},
				LastSuccessAt: "2026-06-27T10:00:00Z",
				NextRefreshAt: "2026-06-27T12:00:00Z",
			},
		},
		{
			name: "stale availability warns",
			list: domain.CanonicalEpisodeList{
				Episodes:      []domain.CanonicalEpisode{{Number: 1, HasSub: true}},
				LastSuccessAt: "2026-06-27T09:00:00Z",
				NextRefreshAt: "2026-06-27T10:00:00Z",
			},
			want: episodeAvailabilityUncertainWarning,
		},
		{
			name: "retrying availability warns",
			list: domain.CanonicalEpisodeList{
				Episodes:      []domain.CanonicalEpisode{{Number: 1, HasSub: true}},
				NextRefreshAt: "2026-06-27T11:05:00Z",
				RetryUntilAt:  "2026-06-27T11:30:00Z",
				FailureCount:  1,
			},
			want: episodeAvailabilityUncertainWarning,
		},
		{
			name: "failed availability warns",
			list: domain.CanonicalEpisodeList{
				Episodes:     []domain.CanonicalEpisode{{Number: 1, HasSub: true}},
				FailureCount: 3,
			},
			want: episodeAvailabilityUncertainWarning,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := episodeAvailabilityWarning(tt.list, now)
			if got != tt.want {
				t.Fatalf("episodeAvailabilityWarning() = %q, want %q", got, tt.want)
			}
		})
	}
}
