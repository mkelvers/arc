package playback

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"

	"mal/internal/db"
	"mal/internal/domain"
)

func TestSaveProgressCreatesMinimalAnimeAndContinueWatchingEntry(t *testing.T) {
	repo := &fakePlaybackRepository{getAnimeErr: sql.ErrNoRows}
	auditSvc := &fakePlaybackAuditService{}
	svc := &playbackService{repo: repo, auditSvc: auditSvc}

	if err := svc.SaveProgress(context.Background(), "user-1", 12, 3, 45.5); err != nil {
		t.Fatalf("SaveProgress: %v", err)
	}
	assertSaveProgressCalls(t, repo, auditSvc)
}

func TestSaveProgressDoesNotUpsertAnimeWhenExistingRowFound(t *testing.T) {
	repo := &fakePlaybackRepository{}
	svc := &playbackService{repo: repo, auditSvc: &fakePlaybackAuditService{}}

	if err := svc.SaveProgress(context.Background(), "user-1", 12, 3, 45.5); err != nil {
		t.Fatalf("SaveProgress: %v", err)
	}
	if repo.upsertAnimeCalled {
		t.Fatalf("did not expect anime upsert for existing row")
	}
}

func TestSaveProgressWrapsContinueWatchingErrors(t *testing.T) {
	repo := &fakePlaybackRepository{upsertContinueErr: errors.New("insert failed")}
	svc := &playbackService{repo: repo, auditSvc: &fakePlaybackAuditService{}}

	err := svc.SaveProgress(context.Background(), "user-1", 12, 3, 45.5)
	if err == nil || !strings.Contains(err.Error(), "save progress transaction user_id=user-1 anime_id=12 episode=3") {
		t.Fatalf("SaveProgress error = %v, want wrapped transaction error", err)
	}
}

func assertSaveProgressCalls(t *testing.T, repo *fakePlaybackRepository, auditSvc *fakePlaybackAuditService) {
	t.Helper()
	if !repo.inTxCalled {
		t.Fatalf("expected transaction")
	}
	assertSaveProgressRepo(t, repo)
	assertSaveProgressAudit(t, auditSvc)
}

func assertSaveProgressRepo(t *testing.T, repo *fakePlaybackRepository) {
	t.Helper()
	if repo.upsertedAnime.ID != 12 || repo.upsertedAnime.TitleOriginal != "Anime 12" {
		t.Fatalf("upserted anime = %#v, want minimal anime 12", repo.upsertedAnime)
	}
	if repo.upsertedContinue.UserID != "user-1" || repo.upsertedContinue.AnimeID != 12 {
		t.Fatalf("continue watching params = %#v", repo.upsertedContinue)
	}
	if !repo.upsertedContinue.CurrentEpisode.Valid || repo.upsertedContinue.CurrentEpisode.Int64 != 3 {
		t.Fatalf("current episode = %#v, want 3", repo.upsertedContinue.CurrentEpisode)
	}
	if repo.upsertedContinue.CurrentTimeSeconds != 45.5 {
		t.Fatalf("current time = %f, want 45.5", repo.upsertedContinue.CurrentTimeSeconds)
	}
}

func assertSaveProgressAudit(t *testing.T, auditSvc *fakePlaybackAuditService) {
	t.Helper()
	if len(auditSvc.events) != 1 || auditSvc.events[0].Action != "watch_progress_saved" {
		t.Fatalf("audit events = %#v, want watch_progress_saved", auditSvc.events)
	}
	if !strings.Contains(string(auditSvc.events[0].MetadataJSON), `"episode":3`) {
		t.Fatalf("audit metadata = %s, want episode", auditSvc.events[0].MetadataJSON)
	}
}

func TestCompleteAnimeUpsertsCompletedStatusAndAudits(t *testing.T) {
	repo := &fakePlaybackRepository{watchlistErr: sql.ErrNoRows}
	auditSvc := &fakePlaybackAuditService{}
	svc := &playbackService{repo: repo, auditSvc: auditSvc}

	if err := svc.CompleteAnime(context.Background(), "user-1", 12); err != nil {
		t.Fatalf("CompleteAnime: %v", err)
	}
	if repo.upsertedWatchlist.UserID != "user-1" || repo.upsertedWatchlist.AnimeID != 12 || repo.upsertedWatchlist.Status != "completed" {
		t.Fatalf("upserted watchlist = %#v, want completed", repo.upsertedWatchlist)
	}
	if len(auditSvc.events) != 1 || auditSvc.events[0].Action != "watch_completed" || auditSvc.events[0].ResourceID != "12" {
		t.Fatalf("audit events = %#v, want watch_completed for 12", auditSvc.events)
	}
}

func TestCompleteAnimeSkipsUpsertWhenAlreadyCompleted(t *testing.T) {
	repo := &fakePlaybackRepository{watchlistEntry: db.WatchListEntry{UserID: "user-1", AnimeID: 12, Status: "completed"}}
	svc := &playbackService{repo: repo, auditSvc: &fakePlaybackAuditService{}}

	if err := svc.CompleteAnime(context.Background(), "user-1", 12); err != nil {
		t.Fatalf("CompleteAnime: %v", err)
	}
	if repo.upsertWatchlistCalled {
		t.Fatalf("did not expect completed watchlist upsert")
	}
}

func TestLoadWatchProgressPrefersWatchlistProgressForRequestedEpisode(t *testing.T) {
	repo := &fakePlaybackRepository{
		watchlistEntry: db.WatchListEntry{
			UserID:             "user-1",
			AnimeID:            12,
			Status:             "watching",
			CurrentEpisode:     sql.NullInt64{Int64: 2, Valid: true},
			CurrentTimeSeconds: 33,
		},
		continueEntry: db.ContinueWatchingEntry{
			UserID:             "user-1",
			AnimeID:            12,
			CurrentEpisode:     sql.NullInt64{Int64: 2, Valid: true},
			CurrentTimeSeconds: 99,
		},
	}
	svc := &playbackService{repo: repo}

	startTime, status, ids := svc.loadWatchProgress(context.Background(), "user-1", 12, 12, "2")
	if startTime != 33 || status != "watching" || len(ids) != 1 || ids[0] != 12 {
		t.Fatalf("progress = start:%f status:%q ids:%v, want watchlist progress", startTime, status, ids)
	}
}

func TestLoadWatchProgressFallsBackToContinueWatching(t *testing.T) {
	repo := &fakePlaybackRepository{
		watchlistEntry: db.WatchListEntry{
			UserID:             "user-1",
			AnimeID:            12,
			Status:             "watching",
			CurrentEpisode:     sql.NullInt64{Int64: 1, Valid: true},
			CurrentTimeSeconds: 33,
		},
		continueEntry: db.ContinueWatchingEntry{
			UserID:             "user-1",
			AnimeID:            12,
			CurrentEpisode:     sql.NullInt64{Int64: 2, Valid: true},
			CurrentTimeSeconds: 99,
		},
	}
	svc := &playbackService{repo: repo}

	startTime, status, ids := svc.loadWatchProgress(context.Background(), "user-1", 12, 12, "2")
	if startTime != 99 || status != "watching" || len(ids) != 1 || ids[0] != 12 {
		t.Fatalf("progress = start:%f status:%q ids:%v, want continue watching progress", startTime, status, ids)
	}
}

func TestPlaybackServiceProxyTokenWrappers(t *testing.T) {
	svc := &playbackService{proxyTokenKey: "secret", proxyTokens: newProxyTokenStore()}

	token, err := svc.SignProxyToken("https://cdn.example.test/seg.ts", "https://referer.example.test", "stream")
	if err != nil {
		t.Fatalf("SignProxyToken: %v", err)
	}
	targetURL, referer, err := svc.ResolveProxyToken(token, "stream")
	if err != nil {
		t.Fatalf("ResolveProxyToken: %v", err)
	}
	if targetURL != "https://cdn.example.test/seg.ts" || referer != "https://referer.example.test" {
		t.Fatalf("resolved target=%q referer=%q", targetURL, referer)
	}
	if _, _, err := svc.ResolveProxyToken(token, "subtitle"); err == nil || !strings.Contains(err.Error(), "invalid proxy token scope") {
		t.Fatalf("wrong scope error = %v, want invalid scope", err)
	}
}

func TestPlaybackServiceProxyTokenDisabled(t *testing.T) {
	svc := &playbackService{proxyTokens: newProxyTokenStore()}

	token, err := svc.SignProxyToken("https://cdn.example.test/seg.ts", "", "stream")
	if err != nil {
		t.Fatalf("SignProxyToken: %v", err)
	}
	if token != "" {
		t.Fatalf("token = %q, want empty when signing disabled", token)
	}
	if _, _, err := svc.ResolveProxyToken("token", "stream"); err == nil || !strings.Contains(err.Error(), "proxy token key not configured") {
		t.Fatalf("ResolveProxyToken error = %v, want missing key", err)
	}
}

func TestPlaybackServiceSignProxyTokenRejectsUnsafeTargets(t *testing.T) {
	svc := &playbackService{proxyTokenKey: "secret", proxyTokens: newProxyTokenStore()}

	tests := []struct {
		name      string
		targetURL string
	}{
		{name: "loopback ipv4", targetURL: "http://127.0.0.1/video.m3u8"},
		{name: "private ipv4", targetURL: "https://10.0.0.4/segment.ts"},
		{name: "loopback ipv6", targetURL: "http://[::1]/subtitle.vtt"},
		{name: "unsupported scheme", targetURL: "file:///tmp/video.m3u8"},
		{name: "missing host", targetURL: "https:///segment.ts"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			token, err := svc.SignProxyToken(tt.targetURL, "", "stream")
			if err == nil {
				t.Fatalf("SignProxyToken(%q) error = nil, token = %q", tt.targetURL, token)
			}
			if token != "" {
				t.Fatalf("SignProxyToken(%q) token = %q, want empty", tt.targetURL, token)
			}
		})
	}
}

type fakePlaybackRepository struct {
	inTxCalled            bool
	getAnimeErr           error
	upsertAnimeCalled     bool
	upsertContinueErr     error
	watchlistErr          error
	upsertWatchlistCalled bool

	upsertedAnime                db.UpsertAnimeParams
	upsertedContinue             db.UpsertContinueWatchingEntryParams
	upsertedWatchlist            db.UpsertWatchListEntryParams
	watchlistEntry               db.WatchListEntry
	continueEntry                db.ContinueWatchingEntry
	getAnimeFunc                 func(context.Context, int64) (db.Anime, error)
	getWatchListEntryFunc        func(context.Context, db.GetWatchListEntryParams) (db.WatchListEntry, error)
	getContinueWatchingEntryFunc func(context.Context, db.GetContinueWatchingEntryParams) (db.ContinueWatchingEntry, error)
	listSkipSegmentOverridesFunc func(context.Context, string, int64, int64) ([]db.SkipSegmentOverrideRow, error)
	hasSkipSegmentOverrideFunc   func(context.Context) (bool, error)
}

func (r *fakePlaybackRepository) InTx(ctx context.Context, fn func(context.Context, domain.PlaybackRepository) error) error {
	r.inTxCalled = true
	return fn(ctx, r)
}

func (r *fakePlaybackRepository) UpsertAnime(_ context.Context, params db.UpsertAnimeParams) (db.Anime, error) {
	r.upsertAnimeCalled = true
	r.upsertedAnime = params
	return db.Anime{ID: params.ID, TitleOriginal: params.TitleOriginal}, nil
}

func (r *fakePlaybackRepository) GetAnime(ctx context.Context, id int64) (db.Anime, error) {
	if r.getAnimeFunc != nil {
		return r.getAnimeFunc(ctx, id)
	}
	if r.getAnimeErr != nil {
		return db.Anime{}, r.getAnimeErr
	}
	return db.Anime{ID: 12, TitleOriginal: "Anime 12"}, nil
}

func (r *fakePlaybackRepository) GetWatchListEntry(ctx context.Context, params db.GetWatchListEntryParams) (db.WatchListEntry, error) {
	if r.getWatchListEntryFunc != nil {
		return r.getWatchListEntryFunc(ctx, params)
	}
	if r.watchlistErr != nil {
		return db.WatchListEntry{}, r.watchlistErr
	}
	return r.watchlistEntry, nil
}

func (r *fakePlaybackRepository) GetContinueWatchingEntry(ctx context.Context, params db.GetContinueWatchingEntryParams) (db.ContinueWatchingEntry, error) {
	if r.getContinueWatchingEntryFunc != nil {
		return r.getContinueWatchingEntryFunc(ctx, params)
	}
	return r.continueEntry, nil
}

func (r *fakePlaybackRepository) SaveWatchProgress(context.Context, db.SaveWatchProgressParams) error {
	return nil
}

func (r *fakePlaybackRepository) UpsertWatchListEntry(_ context.Context, params db.UpsertWatchListEntryParams) (db.WatchListEntry, error) {
	r.upsertWatchlistCalled = true
	r.upsertedWatchlist = params
	return db.WatchListEntry{ID: params.ID, UserID: params.UserID, AnimeID: params.AnimeID, Status: params.Status}, nil
}

func (r *fakePlaybackRepository) UpsertContinueWatchingEntry(_ context.Context, params db.UpsertContinueWatchingEntryParams) (db.ContinueWatchingEntry, error) {
	r.upsertedContinue = params
	if r.upsertContinueErr != nil {
		return db.ContinueWatchingEntry{}, r.upsertContinueErr
	}
	return db.ContinueWatchingEntry{ID: params.ID, UserID: params.UserID, AnimeID: params.AnimeID}, nil
}

func (r *fakePlaybackRepository) DeleteContinueWatchingEntry(context.Context, db.DeleteContinueWatchingEntryParams) error {
	return nil
}

func (r *fakePlaybackRepository) ListSkipSegmentOverrides(ctx context.Context, userID string, animeID int64, episode int64) ([]db.SkipSegmentOverrideRow, error) {
	if r.listSkipSegmentOverridesFunc != nil {
		return r.listSkipSegmentOverridesFunc(ctx, userID, animeID, episode)
	}
	return nil, nil
}

func (r *fakePlaybackRepository) UpsertSkipSegmentOverride(context.Context, db.SkipSegmentOverrideRow) error {
	return nil
}

func (r *fakePlaybackRepository) HasSkipSegmentOverrideTable(ctx context.Context) (bool, error) {
	if r.hasSkipSegmentOverrideFunc != nil {
		return r.hasSkipSegmentOverrideFunc(ctx)
	}
	return true, nil
}

type fakePlaybackAuditService struct {
	events []domain.AuditEvent
}

func (s *fakePlaybackAuditService) Record(_ context.Context, event domain.AuditEvent) error {
	s.events = append(s.events, event)
	return nil
}
