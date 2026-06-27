package handler

import (
	"context"
	"encoding/json"
	"mal/internal/domain"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

type episodeMetadataAnimeService struct {
	domain.AnimePlaybackService
}

func (s episodeMetadataAnimeService) GetAllEpisodes(context.Context, int) ([]domain.EpisodeData, error) {
	return []domain.EpisodeData{
		{MalID: 1, Title: "The Beginning"},
		{MalID: 2, Title: "The Follow-Up"},
	}, nil
}

func (s episodeMetadataAnimeService) GetAnimeByID(context.Context, int) (domain.Anime, error) {
	return domain.Anime{}, nil
}

func TestEpisodeMetadataRouteReturnsEpisodeTitles(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	h := NewPlaybackHandler(nil, episodeMetadataAnimeService{})
	h.Register(router)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/watch/episodes/123/metadata", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var got []struct {
		MalID int    `json:"mal_id"`
		Title string `json:"title"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}

	if len(got) != 2 {
		t.Fatalf("len(got) = %d, want 2", len(got))
	}
	if got[0].MalID != 1 || got[0].Title != "The Beginning" {
		t.Fatalf("got[0] = %+v, want episode 1 title", got[0])
	}
}
