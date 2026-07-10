package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"mal/integrations/metadata"
	"mal/internal/database/db"
	"mal/internal/domain"

	_ "github.com/mattn/go-sqlite3"
)

type fixedClock struct {
	now time.Time
}

func (c fixedClock) Now() time.Time { return c.now }

type episodeRefreshProviderStub struct {
	availability    domain.EpisodeAvailability
	err             error
	wait            chan struct{}
	calls           chan int64
	resolveCalls    atomic.Int64
	availabilityReq atomic.Int64
	contextCanceled atomic.Bool
}

func (p *episodeRefreshProviderStub) Name() string { return "AllAnime" }

func (p *episodeRefreshProviderStub) ResolveEpisodeProviderID(context.Context, int, []string) (string, error) {
	p.resolveCalls.Add(1)
	return "provider-show-id", nil
}

func (p *episodeRefreshProviderStub) GetEpisodeAvailabilityByProviderID(ctx context.Context, providerID string) (domain.EpisodeAvailability, error) {
	call := p.availabilityReq.Add(1)
	if p.calls != nil {
		p.calls <- call
	}
	if p.wait != nil {
		select {
		case <-p.wait:
		case <-ctx.Done():
			p.contextCanceled.Store(true)
			return domain.EpisodeAvailability{}, ctx.Err()
		}
	}
	if p.err != nil {
		return domain.EpisodeAvailability{}, p.err
	}
	return p.availability, nil
}

type canonicalRefreshResult struct {
	payload domain.CanonicalEpisodeList
	err     error
}

func TestGetCanonicalEpisodesCollapsesConcurrentRefreshes(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, time.July, 9, 13, 0, 0, 0, time.UTC)
	sqlDB := newEpisodeRefreshTestDB(ctx, t)
	wait := make(chan struct{})
	provider := &episodeRefreshProviderStub{
		availability: domain.EpisodeAvailability{
			Sub:    []int{1, 2},
			Dub:    []int{2},
			Titles: map[int]string{1: "The Beginning", 2: "The Follow Through"},
		},
		wait:  wait,
		calls: make(chan int64, 10),
	}
	svc := newEpisodeRefreshService(sqlDB, provider, now)
	anime := episodeRefreshAnime()

	first := getCanonicalEpisodesAsync(ctx, svc, anime)
	waitForProviderCalls(t, provider, 1)

	second := getCanonicalEpisodesAsync(ctx, svc, anime)
	assertNoProviderCall(t, provider, 50*time.Millisecond)
	close(wait)

	firstResult := waitForCanonicalResult(t, first)
	secondResult := waitForCanonicalResult(t, second)
	if firstResult.err != nil {
		t.Fatalf("first GetCanonicalEpisodes() error = %v", firstResult.err)
	}
	if secondResult.err != nil {
		t.Fatalf("second GetCanonicalEpisodes() error = %v", secondResult.err)
	}
	if provider.availabilityReq.Load() != 1 {
		t.Fatalf("availability calls = %d, want 1", provider.availabilityReq.Load())
	}
	if len(firstResult.payload.Episodes) != 2 || len(secondResult.payload.Episodes) != 2 {
		t.Fatalf("episodes = %d and %d, want 2 each", len(firstResult.payload.Episodes), len(secondResult.payload.Episodes))
	}

	firstResult.payload.Episodes[0].Title = "mutated"
	if secondResult.payload.Episodes[0].Title == "mutated" {
		t.Fatal("joined callers shared the same episode slice")
	}
}

func TestCanonicalRefreshRechecksCacheInsideFlight(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, time.July, 9, 13, 0, 0, 0, time.UTC)
	sqlDB := newEpisodeRefreshTestDB(ctx, t)
	provider := &episodeRefreshProviderStub{
		availability: domain.EpisodeAvailability{Sub: []int{1}},
		calls:        make(chan int64, 10),
	}
	svc := newEpisodeRefreshService(sqlDB, provider, now)
	anime := episodeRefreshAnime()
	insertEpisodeRefreshCache(ctx, t, sqlDB, anime.MalID, domain.CanonicalEpisodeList{
		AnimeID:             anime.MalID,
		Source:              "AllAnime",
		AvailabilityVersion: episodeAvailabilityPayloadVersion,
		Episodes: []domain.CanonicalEpisode{
			{Number: 1, Title: "Cached", HasSub: true},
		},
	}, sql.NullTime{Time: now.Add(time.Hour), Valid: true}, 0, "", now)

	payload, err := svc.waitForCanonicalRefresh(ctx, anime, canonicalRefreshRegular)
	if err != nil {
		t.Fatalf("waitForCanonicalRefresh() error = %v", err)
	}
	if provider.availabilityReq.Load() != 0 {
		t.Fatalf("availability calls = %d, want 0", provider.availabilityReq.Load())
	}
	if len(payload.Episodes) != 1 || payload.Episodes[0].Title != "Cached" {
		t.Fatalf("payload episodes = %#v, want cached episode", payload.Episodes)
	}
}

func TestCanonicalRefreshSeparatesForcedAndRegularFlights(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, time.July, 9, 13, 0, 0, 0, time.UTC)
	sqlDB := newEpisodeRefreshTestDB(ctx, t)
	wait := make(chan struct{})
	provider := &episodeRefreshProviderStub{
		availability: domain.EpisodeAvailability{Sub: []int{1}},
		wait:         wait,
		calls:        make(chan int64, 10),
	}
	svc := newEpisodeRefreshService(sqlDB, provider, now)
	anime := episodeRefreshAnime()

	regular := waitForCanonicalRefreshAsync(ctx, svc, anime, canonicalRefreshRegular)
	forced := waitForCanonicalRefreshAsync(ctx, svc, anime, canonicalRefreshForced)
	waitForProviderCalls(t, provider, 2)
	close(wait)

	if result := waitForCanonicalResult(t, regular); result.err != nil {
		t.Fatalf("regular refresh error = %v", result.err)
	}
	if result := waitForCanonicalResult(t, forced); result.err != nil {
		t.Fatalf("forced refresh error = %v", result.err)
	}
	if provider.availabilityReq.Load() != 2 {
		t.Fatalf("availability calls = %d, want 2", provider.availabilityReq.Load())
	}
}

func TestCanonicalRefreshCallerCancellationDoesNotCancelSharedRefresh(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, time.July, 9, 13, 0, 0, 0, time.UTC)
	sqlDB := newEpisodeRefreshTestDB(ctx, t)
	wait := make(chan struct{})
	provider := &episodeRefreshProviderStub{
		availability: domain.EpisodeAvailability{Sub: []int{1}},
		wait:         wait,
		calls:        make(chan int64, 10),
	}
	svc := newEpisodeRefreshService(sqlDB, provider, now)
	anime := episodeRefreshAnime()
	canceledCtx, cancel := context.WithCancel(ctx)

	first := getCanonicalEpisodesAsync(canceledCtx, svc, anime)
	waitForProviderCalls(t, provider, 1)
	second := getCanonicalEpisodesAsync(ctx, svc, anime)

	cancel()
	firstResult := waitForCanonicalResult(t, first)
	if !errors.Is(firstResult.err, context.Canceled) {
		t.Fatalf("first error = %v, want context.Canceled", firstResult.err)
	}
	if provider.contextCanceled.Load() {
		t.Fatal("leader cancellation canceled the shared refresh context")
	}

	close(wait)
	secondResult := waitForCanonicalResult(t, second)
	if secondResult.err != nil {
		t.Fatalf("second GetCanonicalEpisodes() error = %v", secondResult.err)
	}
	if len(secondResult.payload.Episodes) != 1 {
		t.Fatalf("second episodes = %d, want 1", len(secondResult.payload.Episodes))
	}
	if provider.contextCanceled.Load() {
		t.Fatal("shared refresh context was canceled before provider completed")
	}
}

func TestCanonicalRefreshFailureRecordsFailureOnceForJoinedCallers(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, time.July, 9, 13, 0, 0, 0, time.UTC)
	sqlDB := newEpisodeRefreshTestDB(ctx, t)
	wait := make(chan struct{})
	provider := &episodeRefreshProviderStub{
		err:   errors.New("provider down"),
		wait:  wait,
		calls: make(chan int64, 10),
	}
	svc := newEpisodeRefreshService(sqlDB, provider, now)
	anime := episodeRefreshAnime()
	insertEpisodeRefreshCache(ctx, t, sqlDB, anime.MalID, domain.CanonicalEpisodeList{
		AnimeID:             anime.MalID,
		Source:              "AllAnime",
		AvailabilityVersion: episodeAvailabilityPayloadVersion,
		Episodes: []domain.CanonicalEpisode{
			{Number: 1, Title: "Stale", HasSub: true},
		},
	}, sql.NullTime{Time: now.Add(-time.Minute), Valid: true}, 2, "previous error", now)

	first := getCanonicalEpisodesAsync(ctx, svc, anime)
	waitForProviderCalls(t, provider, 1)
	second := getCanonicalEpisodesAsync(ctx, svc, anime)
	assertNoProviderCall(t, provider, 50*time.Millisecond)
	close(wait)

	firstResult := waitForCanonicalResult(t, first)
	secondResult := waitForCanonicalResult(t, second)
	if firstResult.err != nil {
		t.Fatalf("first GetCanonicalEpisodes() error = %v", firstResult.err)
	}
	if secondResult.err != nil {
		t.Fatalf("second GetCanonicalEpisodes() error = %v", secondResult.err)
	}
	if provider.availabilityReq.Load() != 1 {
		t.Fatalf("availability calls = %d, want 1", provider.availabilityReq.Load())
	}

	var failureCount int64
	var lastError string
	if err := sqlDB.QueryRowContext(ctx, `SELECT failure_count, last_error FROM episode_availability_cache WHERE anime_id = ?`, anime.MalID).Scan(&failureCount, &lastError); err != nil {
		t.Fatal(err)
	}
	if failureCount != 3 {
		t.Fatalf("failure_count = %d, want 3", failureCount)
	}
	if !strings.Contains(lastError, "no episode availability provider matched anime_id=59846") {
		t.Fatalf("last_error = %q, want provider failure", lastError)
	}
}

func newEpisodeRefreshService(sqlDB *sql.DB, provider *episodeRefreshProviderStub, now time.Time) *EpisodeService {
	return &EpisodeService{
		queries:   db.New(sqlDB),
		providers: []domain.EpisodeAvailabilityProvider{provider},
		clock:     fixedClock{now: now},
		enabled:   true,
	}
}

func episodeRefreshAnime() domain.Anime {
	anime := domain.Anime{Anime: metadata.Anime{
		MalID:    59846,
		Title:    "Test Anime",
		Airing:   true,
		Episodes: 2,
	}}
	anime.Broadcast.Day = "Thursdays"
	anime.Broadcast.Time = "12:00"
	anime.Broadcast.Timezone = "UTC"
	return anime
}

func getCanonicalEpisodesAsync(ctx context.Context, svc *EpisodeService, anime domain.Anime) <-chan canonicalRefreshResult {
	results := make(chan canonicalRefreshResult, 1)
	go func() {
		payload, err := svc.GetCanonicalEpisodes(ctx, anime, false)
		results <- canonicalRefreshResult{payload: payload, err: err}
	}()
	return results
}

func waitForCanonicalRefreshAsync(ctx context.Context, svc *EpisodeService, anime domain.Anime, policy canonicalRefreshPolicy) <-chan canonicalRefreshResult {
	results := make(chan canonicalRefreshResult, 1)
	go func() {
		payload, err := svc.waitForCanonicalRefresh(ctx, anime, policy)
		results <- canonicalRefreshResult{payload: payload, err: err}
	}()
	return results
}

func waitForCanonicalResult(t *testing.T, results <-chan canonicalRefreshResult) canonicalRefreshResult {
	t.Helper()
	select {
	case result := <-results:
		return result
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for canonical refresh result")
		return canonicalRefreshResult{}
	}
}

func waitForProviderCalls(t *testing.T, provider *episodeRefreshProviderStub, want int) {
	t.Helper()
	for range want {
		select {
		case <-provider.calls:
		case <-time.After(time.Second):
			t.Fatalf("timed out waiting for provider call %d", want)
		}
	}
}

func assertNoProviderCall(t *testing.T, provider *episodeRefreshProviderStub, wait time.Duration) {
	t.Helper()
	select {
	case call := <-provider.calls:
		t.Fatalf("unexpected provider call %d", call)
	case <-time.After(wait):
	}
}

func newEpisodeRefreshTestDB(ctx context.Context, t *testing.T) *sql.DB {
	t.Helper()
	sqlDB, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := sqlDB.Close(); err != nil {
			t.Errorf("close sqlite: %v", err)
		}
	})
	sqlDB.SetMaxOpenConns(1)

	for _, statement := range []string{
		`CREATE TABLE episode_availability_cache (
			anime_id INTEGER PRIMARY KEY, data TEXT NOT NULL, next_refresh_at DATETIME,
			retry_until_at DATETIME, last_attempt_at DATETIME, last_success_at DATETIME,
			failure_count INTEGER NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT '',
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE episode_provider_mapping (
			anime_id INTEGER NOT NULL, provider TEXT NOT NULL, provider_show_id TEXT NOT NULL,
			failed_until DATETIME, last_error TEXT NOT NULL DEFAULT '',
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (anime_id, provider)
		)`,
	} {
		if _, err := sqlDB.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	return sqlDB
}

func insertEpisodeRefreshCache(ctx context.Context, t *testing.T, sqlDB *sql.DB, animeID int, payload domain.CanonicalEpisodeList, nextRefresh sql.NullTime, failureCount int, lastError string, updatedAt time.Time) {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	var nextRefreshValue any
	if nextRefresh.Valid {
		nextRefreshValue = nextRefresh.Time
	}
	_, err = sqlDB.ExecContext(
		ctx,
		`INSERT INTO episode_availability_cache (
			anime_id, data, next_refresh_at, failure_count, last_error, updated_at
		) VALUES (?, ?, ?, ?, ?, ?)`,
		animeID,
		string(body),
		nextRefreshValue,
		failureCount,
		lastError,
		updatedAt,
	)
	if err != nil {
		t.Fatal(err)
	}
}
