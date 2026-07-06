package handler

import (
	"bytes"
	"context"
	"errors"
	"mal/internal/db"
	"mal/internal/domain"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

type failingSkipSegmentPlaybackService struct {
	domain.PlaybackService
}

func (s failingSkipSegmentPlaybackService) UpsertSkipSegmentOverride(context.Context, string, int64, int, string, float64, float64) error {
	return errors.New("database constraint skip_segments_user_id_fkey failed")
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
