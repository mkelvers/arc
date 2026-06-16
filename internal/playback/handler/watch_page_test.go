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
	data domain.WatchPageData
	err  error
}

func (s *watchPagePlaybackService) BuildWatchData(context.Context, int, []string, string, string, string) (domain.WatchPageData, error) {
	return s.data, s.err
}

func (s *watchPagePlaybackService) SaveProgress(context.Context, string, int64, int, float64) error {
	return nil
}

func (s *watchPagePlaybackService) CompleteAnime(context.Context, string, int64) error {
	return nil
}

func (s *watchPagePlaybackService) SignProxyToken(string, string, string) (string, error) {
	return "", nil
}

func (s *watchPagePlaybackService) ResolveProxyToken(string, string) (string, string, error) {
	return "", "", nil
}

func (s *watchPagePlaybackService) UpsertSkipSegmentOverride(context.Context, string, int64, int, string, float64, float64) error {
	return nil
}

type watchPageAnimeService struct{}

func (watchPageAnimeService) GetAnimeByID(context.Context, int) (domain.Anime, error) {
	return domain.Anime{}, errors.New("unexpected anime lookup")
}

func (watchPageAnimeService) GetAllEpisodes(context.Context, int) ([]domain.EpisodeData, error) {
	return nil, nil
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
		animeSvc: watchPageAnimeService{},
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
	if !strings.Contains(body, `data-playback-error="no streams found"`) {
		t.Fatalf("expected playback error data attribute in body, got:\n%s", body)
	}
	if !strings.Contains(body, `/anime/123/watch?ep=2`) {
		t.Fatalf("expected episode links to keep the anime id, got:\n%s", body)
	}
	if strings.Contains(body, "No episodes found") {
		t.Fatalf("expected partial episode list instead of empty state, got:\n%s", body)
	}
}
