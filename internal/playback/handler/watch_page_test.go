package handler

import (
	"context"
	"errors"
	"mal/integrations/jikan"
	"mal/internal/domain"
	"mal/templates"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

type watchPagePlaybackService struct {
	domain.PlaybackService

	data             domain.WatchPageData
	deferred         bool
	err              error
	refreshRequested bool
	titles           []domain.CanonicalEpisode
	classifications  []domain.CanonicalEpisode
}

func (s *watchPagePlaybackService) BuildWatchData(ctx context.Context, _ int, _ []string, _ string, _ string, _ string) (domain.WatchPageData, error) {
	s.deferred = domain.PlaybackDataDeferred(ctx)
	s.refreshRequested = domain.PlaybackSourceRefreshRequested(ctx)
	return s.data, s.err
}

func (s *watchPagePlaybackService) EnrichEpisodeTitles(context.Context, int) ([]domain.CanonicalEpisode, error) {
	return s.titles, s.err
}

func (s *watchPagePlaybackService) EnrichEpisodeClassifications(context.Context, int) ([]domain.CanonicalEpisode, error) {
	return s.classifications, s.err
}

func TestHandleEpisodeDataRequestsForcedSourceRefresh(t *testing.T) {
	data := baseWatchPageData()
	data.WatchData.ModeSources = map[string]domain.ModeSource{
		"sub": {Token: "opaque", Type: "m3u8"},
	}
	svc := &watchPagePlaybackService{data: data}
	h := &PlaybackHandler{svc: svc}
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/api/watch/episode/:animeId/:episode", h.HandleEpisodeData)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/watch/episode/123/1?mode=sub&refresh=1", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if !svc.refreshRequested {
		t.Fatal("episode handler did not request a forced source refresh")
	}
}

func TestHandleEpisodeTitlesReturnsMinimalEnrichedList(t *testing.T) {
	svc := &watchPagePlaybackService{titles: []domain.CanonicalEpisode{
		{Number: 1, Title: "The First Title", HasSub: true},
		{Number: 2, Title: "The Second Title", HasDub: true},
	}}
	h := &PlaybackHandler{svc: svc}
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/api/watch/episodes/:animeId/titles", h.HandleEpisodeTitles)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/watch/episodes/123/titles", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if got := strings.TrimSpace(rec.Body.String()); got != `[{"number":1,"title":"The First Title"},{"number":2,"title":"The Second Title"}]` {
		t.Fatalf("body = %s", got)
	}
}

func TestHandleEpisodeClassificationsReturnsMinimalList(t *testing.T) {
	svc := &watchPagePlaybackService{classifications: []domain.CanonicalEpisode{
		{Number: 1},
		{Number: 2, Filler: true},
		{Number: 3, Recap: true},
	}}
	h := &PlaybackHandler{svc: svc}
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/api/watch/episodes/:animeId/classifications", h.HandleEpisodeClassifications)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/watch/episodes/123/classifications", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if got := strings.TrimSpace(rec.Body.String()); got != `[{"filler":false,"number":1,"recap":false},{"filler":true,"number":2,"recap":false},{"filler":false,"number":3,"recap":true}]` {
		t.Fatalf("body = %s", got)
	}
}

type watchPageAnimeService struct {
	domain.AnimePlaybackService
	t *testing.T
}

func (s watchPageAnimeService) GetAnimeByID(context.Context, int) (domain.Anime, error) {
	s.t.Fatal("unexpected anime lookup")
	return domain.Anime{}, nil
}

func baseWatchPageData() domain.WatchPageData {
	return domain.WatchPageData{
		Anime: domain.Anime{Anime: jikan.Anime{MalID: 123, Title: "Example Anime"}},
		Episodes: []domain.CanonicalEpisode{
			{Number: 1, Title: "Episode 1", HasSub: true},
			{Number: 2, Title: "Episode 2", HasSub: true},
		},
		CurrentEpID: "1",
		WatchData: domain.WatchData{
			MalID:          123,
			Title:          "Example Anime",
			CurrentEpisode: "1",
			Episodes: []domain.CanonicalEpisode{
				{Number: 1, Title: "Episode 1", HasSub: true},
				{Number: 2, Title: "Episode 2", HasSub: true},
			},
			ModeSources:    map[string]domain.ModeSource{},
			AvailableModes: []string{},
		},
	}
}

func newWatchPageRouter(t *testing.T, h *PlaybackHandler) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	renderer, err := templates.ProvideRenderer()
	if err != nil {
		t.Fatalf("ProvideRenderer() error = %v", err)
	}
	router := gin.New()
	router.HTMLRender = renderer
	router.GET("/anime/:id/watch", h.HandleWatchPage)
	return router
}

func TestHandleWatchPagePreservesPartialDataOnPlaybackFailure(t *testing.T) {
	t.Parallel()

	router := newWatchPageRouter(t, &PlaybackHandler{
		svc: &watchPagePlaybackService{
			data: baseWatchPageData(),
			err:  errors.New("no streams found"),
		},
		animeSvc: watchPageAnimeService{t: t},
	})

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/anime/123/watch?ep=1", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	body := rec.Body.String()
	if !strings.Contains(body, `data-mal-id="123"`) {
		t.Fatalf("expected player MAL id in body, got:\n%s", body)
	}
	if !strings.Contains(body, `data-episode-id="1"`) {
		t.Fatalf("expected episode list in body, got:\n%s", body)
	}
	if !strings.Contains(body, `data-playback-error="failed to load playback data"`) {
		t.Fatalf("expected stable playback error data attribute in body, got:\n%s", body)
	}
	if strings.Contains(body, "no streams found") {
		t.Fatalf("expected private playback error to stay out of body, got:\n%s", body)
	}
	if !strings.Contains(body, `/anime/123/watch?ep=2`) {
		t.Fatalf("expected episode links to keep the anime id, got:\n%s", body)
	}
	if strings.Contains(body, "No episodes found") {
		t.Fatalf("expected partial episode list instead of empty state, got:\n%s", body)
	}
}

func TestHandleWatchPageDefersPlaybackData(t *testing.T) {
	t.Parallel()

	svc := &watchPagePlaybackService{data: baseWatchPageData()}
	router := newWatchPageRouter(t, &PlaybackHandler{svc: svc})
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/anime/123/watch?ep=1", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if !svc.deferred {
		t.Fatal("watch page did not defer playback data")
	}
}

func TestHandleWatchPageRendersEpisodeAvailabilityWarningModal(t *testing.T) {
	t.Parallel()

	data := baseWatchPageData()
	data.EpisodeAvailabilityWarning = "Episode availability may be incomplete or out of date. Continue only if you understand that the episode list and audio availability may be uncertain."
	router := newWatchPageRouter(t, &PlaybackHandler{
		svc: &watchPagePlaybackService{data: data},
	})

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/anime/123/watch?ep=1", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	body := rec.Body.String()
	for _, want := range []string{
		`data-episode-availability-warning`,
		`Episode availability is uncertain`,
		`Continue anyway`,
		data.EpisodeAvailabilityWarning,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("watch page missing %q in body:\n%s", want, body)
		}
	}
}
