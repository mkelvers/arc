package watchlist

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"mal/internal/db"
	"mal/internal/domain"

	"github.com/gin-gonic/gin"
)

func TestHandleUpdateWatchlist(t *testing.T) {
	gin.SetMode(gin.TestMode)

	svc := &fakeWatchlistService{}
	router := newWatchlistTestRouter(svc)

	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/api/watchlist", strings.NewReader(`{"animeId":1,"status":"watching"}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	if svc.updatedUserID != "user-1" || svc.updatedAnimeID != 1 || svc.updatedStatus != "watching" {
		t.Fatalf("update args user=%q anime=%d status=%q", svc.updatedUserID, svc.updatedAnimeID, svc.updatedStatus)
	}
}

func TestHandleUpdateWatchlistRejectsInvalidBody(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := newWatchlistTestRouter(&fakeWatchlistService{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/api/watchlist", strings.NewReader(`{"animeId":0,"status":""}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestHandleUpdateWatchlistReportsServiceError(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := newWatchlistTestRouter(&fakeWatchlistService{updateErr: errors.New("boom")})
	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/api/watchlist", strings.NewReader(`{"animeId":1,"status":"watching"}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusInternalServerError)
	}
}

func TestHandleDeleteWatchlist(t *testing.T) {
	gin.SetMode(gin.TestMode)

	svc := &fakeWatchlistService{}
	router := newWatchlistTestRouter(svc)

	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodDelete, "/api/watchlist/12", nil)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if svc.removedUserID != "user-1" || svc.removedAnimeID != 12 {
		t.Fatalf("remove args user=%q anime=%d", svc.removedUserID, svc.removedAnimeID)
	}
}

func TestHandleDeleteWatchlistRejectsInvalidID(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := newWatchlistTestRouter(&fakeWatchlistService{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodDelete, "/api/watchlist/nope", nil)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestHandleDeleteContinueWatching(t *testing.T) {
	gin.SetMode(gin.TestMode)

	svc := &fakeWatchlistService{}
	router := newWatchlistTestRouter(svc)

	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodDelete, "/api/continue-watching/44", nil)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if svc.deletedContinueUserID != "user-1" || svc.deletedContinueAnimeID != 44 {
		t.Fatalf("delete continue args user=%q anime=%d", svc.deletedContinueUserID, svc.deletedContinueAnimeID)
	}
}

func newWatchlistTestRouter(svc domain.WatchlistService) *gin.Engine {
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("User", &domain.User{User: db.User{ID: "user-1", Username: "alice"}})
		c.Next()
	})
	NewWatchlistHandler(svc).Register(router)
	return router
}

type fakeWatchlistService struct {
	updateErr         error
	removeErr         error
	deleteContinueErr error

	updatedUserID  string
	updatedAnimeID int64
	updatedStatus  string

	removedUserID  string
	removedAnimeID int64

	deletedContinueUserID  string
	deletedContinueAnimeID int64
}

func (s *fakeWatchlistService) UpdateEntry(_ context.Context, userID string, animeID int64, status string) error {
	s.updatedUserID = userID
	s.updatedAnimeID = animeID
	s.updatedStatus = status
	return s.updateErr
}

func (s *fakeWatchlistService) RemoveEntry(_ context.Context, userID string, animeID int64) error {
	s.removedUserID = userID
	s.removedAnimeID = animeID
	return s.removeErr
}

func (s *fakeWatchlistService) GetWatchlist(context.Context, string) ([]domain.UserWatchListRow, error) {
	return nil, nil
}

func (s *fakeWatchlistService) GetWatchlistMap(context.Context, string, []int64) (map[int64]bool, error) {
	return nil, nil
}

func (s *fakeWatchlistService) GetWatchListEntry(context.Context, string, int64) (domain.WatchlistEntry, error) {
	return db.WatchListEntry{}, nil
}

func (s *fakeWatchlistService) GetContinueWatchingEntry(context.Context, string, int64) (db.ContinueWatchingEntry, error) {
	return db.ContinueWatchingEntry{}, nil
}

func (s *fakeWatchlistService) DeleteContinueWatching(_ context.Context, userID string, animeID int64) error {
	s.deletedContinueUserID = userID
	s.deletedContinueAnimeID = animeID
	return s.deleteContinueErr
}
