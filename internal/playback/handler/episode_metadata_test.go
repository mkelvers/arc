package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"mal/internal/db"
	"mal/internal/domain"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

type episodeMetadataAnimeService struct {
	domain.AnimePlaybackService
	err error
}

func (s episodeMetadataAnimeService) GetAllEpisodes(context.Context, int) ([]domain.EpisodeData, error) {
	if s.err != nil {
		return nil, s.err
	}
	return []domain.EpisodeData{
		{MalID: 1, Title: "The Beginning"},
		{MalID: 2, Title: "The Follow-Up"},
	}, nil
}

func (s episodeMetadataAnimeService) GetAnimeByID(context.Context, int) (domain.Anime, error) {
	return domain.Anime{}, nil
}

type failingSkipSegmentPlaybackService struct {
	domain.PlaybackService
}

func (s failingSkipSegmentPlaybackService) UpsertSkipSegmentOverride(context.Context, string, int64, int, string, float64, float64) error {
	return errors.New("database constraint skip_segments_user_id_fkey failed")
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

func TestEpisodeMetadataRouteHidesServiceError(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	h := NewPlaybackHandler(nil, episodeMetadataAnimeService{err: errors.New("upstream returned credentials in URL")})
	h.Register(router)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/watch/episodes/123/metadata", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusInternalServerError)
	}
	body := rec.Body.String()
	if !strings.Contains(body, `"error":"failed to load episode metadata"`) {
		t.Fatalf("expected stable public error, got %s", body)
	}
	if strings.Contains(body, "upstream returned credentials") {
		t.Fatalf("expected private service error to stay out of response, got %s", body)
	}
}

func TestUpsertSkipSegmentRouteHidesServiceError(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("User", &domain.User{User: db.User{ID: "user-1"}})
	})
	h := NewPlaybackHandler(failingSkipSegmentPlaybackService{}, nil)
	h.Register(router)

	body := bytes.NewBufferString(`{"mal_id":123,"episode":1,"skip_type":"op","start_time":10,"end_time":90}`)
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/api/watch/segments", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
	responseBody := rec.Body.String()
	if !strings.Contains(responseBody, `"error":"invalid skip segment"`) {
		t.Fatalf("expected stable public error, got %s", responseBody)
	}
	if strings.Contains(responseBody, "database constraint") {
		t.Fatalf("expected private service error to stay out of response, got %s", responseBody)
	}
}
