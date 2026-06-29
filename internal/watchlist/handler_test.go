package watchlist

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

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

func TestHandleGetPublicWatchlistReturnsMinimalJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)

	addedAt := time.Date(2026, time.June, 1, 12, 30, 0, 0, time.UTC)
	completedAt := time.Date(2026, time.June, 20, 18, 45, 0, 0, time.UTC)
	lastWatchedAt := time.Date(2026, time.June, 28, 20, 15, 0, 0, time.UTC)
	svc := &fakeWatchlistService{watchlist: publicWatchlistRows(addedAt, completedAt, lastWatchedAt)}
	router := newWatchlistTestRouter(svc)

	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/public/users/user-42/watchlist", nil)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	if got := rec.Header().Get("Content-Type"); !strings.HasPrefix(got, "application/json") {
		t.Fatalf("Content-Type = %q, want application/json", got)
	}
	if svc.watchlistUserID != "user-42" {
		t.Fatalf("GetWatchlist user id = %q, want user-42", svc.watchlistUserID)
	}

	var body publicWatchlistResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v; body=%s", err, rec.Body.String())
	}

	assertPublicWatchlistEnvelope(t, body)
	if len(body.Entries) != 2 {
		t.Fatalf("entries = %d, want 2", len(body.Entries))
	}
	assertCompletedPublicEntry(t, body.Entries[0], addedAt, completedAt)
	assertWatchingPublicEntry(t, body.Entries[1], lastWatchedAt)

	assertMinimalPublicWatchlistJSON(t, rec.Body.Bytes())
}

func publicWatchlistRows(addedAt time.Time, completedAt time.Time, lastWatchedAt time.Time) []domain.UserWatchListRow {
	return []domain.UserWatchListRow{
		{
			AnimeID:       1,
			Status:        "completed",
			CreatedAt:     addedAt,
			UpdatedAt:     completedAt.Add(48 * time.Hour),
			CompletedAt:   sql.NullTime{Time: completedAt, Valid: true},
			TitleOriginal: "Sousou no Frieren",
			TitleEnglish:  sql.NullString{String: "Frieren: Beyond Journey's End", Valid: true},
			TitleJapanese: sql.NullString{String: "葬送のフリーレン", Valid: true},
			ImageUrl:      "https://cdn.example/frieren.webp",
			Airing:        sql.NullBool{Bool: false, Valid: true},
		},
		{
			AnimeID:                    2,
			Status:                     "watching",
			CreatedAt:                  addedAt.Add(24 * time.Hour),
			CurrentEpisode:             sql.NullInt64{Int64: 3, Valid: true},
			CurrentTimeSeconds:         10,
			PlaybackCurrentEpisode:     sql.NullInt64{Int64: 7, Valid: true},
			PlaybackCurrentTimeSeconds: sql.NullFloat64{Float64: 321.5, Valid: true},
			PlaybackUpdatedAt:          sql.NullTime{Time: lastWatchedAt, Valid: true},
			TitleOriginal:              "Dungeon Meshi",
			ImageUrl:                   "https://cdn.example/dungeon.webp",
		},
	}
}

type publicWatchlistResponse struct {
	SchemaVersion string `json:"schema_version"`
	UserID        string `json:"user_id"`
	Summary       struct {
		Total     int `json:"total"`
		Completed int `json:"completed"`
		Watching  int `json:"watching"`
	} `json:"summary"`
	Entries []publicWatchlistResponseEntry `json:"entries"`
}

type publicWatchlistResponseEntry struct {
	MALID                  int64   `json:"mal_id"`
	Status                 string  `json:"status"`
	AddedAt                string  `json:"added_at"`
	CompletedAt            *string `json:"completed_at"`
	CompletionDateAccuracy *string `json:"completion_date_accuracy"`
	LastWatchedAt          *string `json:"last_watched_at"`
	Progress               struct {
		CurrentEpisode     *int64   `json:"current_episode"`
		CurrentTimeSeconds *float64 `json:"current_time_seconds"`
	} `json:"progress"`
	Titles struct {
		Preferred string  `json:"preferred"`
		Original  string  `json:"original"`
		English   *string `json:"english"`
		Japanese  *string `json:"japanese"`
	} `json:"titles"`
}

func assertPublicWatchlistEnvelope(t *testing.T, body publicWatchlistResponse) {
	t.Helper()
	assertEqual(t, "schema version", body.SchemaVersion, "1.0")
	assertEqual(t, "user id", body.UserID, "user-42")
	assertEqual(t, "summary total", body.Summary.Total, 2)
	assertEqual(t, "summary completed", body.Summary.Completed, 1)
	assertEqual(t, "summary watching", body.Summary.Watching, 1)
}

func assertCompletedPublicEntry(t *testing.T, entry publicWatchlistResponseEntry, addedAt time.Time, completedAt time.Time) {
	t.Helper()
	assertEqual(t, "completed MAL id", entry.MALID, int64(1))
	assertEqual(t, "completed status", entry.Status, "completed")
	assertEqual(t, "added_at", entry.AddedAt, addedAt.Format(time.RFC3339))
	assertPointerEqual(t, "completed_at", entry.CompletedAt, completedAt.Format(time.RFC3339))
	assertPointerEqual(t, "completion date accuracy", entry.CompletionDateAccuracy, "exact")
	assertEqual(t, "preferred title", entry.Titles.Preferred, "Frieren: Beyond Journey's End")
	assertEqual(t, "original title", entry.Titles.Original, "Sousou no Frieren")
}

func assertWatchingPublicEntry(t *testing.T, entry publicWatchlistResponseEntry, lastWatchedAt time.Time) {
	t.Helper()
	assertPointerEqual(t, "watching progress episode", entry.Progress.CurrentEpisode, int64(7))
	assertPointerEqual(t, "watching progress seconds", entry.Progress.CurrentTimeSeconds, 321.5)
	assertPointerEqual(t, "last_watched_at", entry.LastWatchedAt, lastWatchedAt.Format(time.RFC3339))
	assertNilPointer(t, "watching completed_at", entry.CompletedAt)
	assertNilPointer(t, "watching completion date accuracy", entry.CompletionDateAccuracy)
}

func assertEqual[T comparable](t *testing.T, label string, got T, want T) {
	t.Helper()
	if got != want {
		t.Fatalf("%s = %v, want %v", label, got, want)
	}
}

func assertPointerEqual[T comparable](t *testing.T, label string, got *T, want T) {
	t.Helper()
	if got == nil || *got != want {
		t.Fatalf("%s = %v, want %v", label, got, want)
	}
}

func assertNilPointer[T any](t *testing.T, label string, got *T) {
	t.Helper()
	if got != nil {
		t.Fatalf("%s = %v, want null", label, got)
	}
}

func assertMinimalPublicWatchlistJSON(t *testing.T, data []byte) {
	t.Helper()
	var raw struct {
		RecommendationGuidance json.RawMessage              `json:"recommendation_guidance"`
		Entries                []map[string]json.RawMessage `json:"entries"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("decode raw response: %v", err)
	}
	if raw.RecommendationGuidance != nil {
		t.Fatalf("recommendation_guidance should not be part of the public contract")
	}
	for _, key := range []string{
		"updated_at",
		"status_meaning",
		"myanimelist_status",
		"anilist_status",
		"exclude_from_recommendations",
		"recommendation_exclusion_reason",
		"anime",
		"external_ids",
		"links",
	} {
		if _, exists := raw.Entries[0][key]; exists {
			t.Fatalf("%s should not be part of the public contract", key)
		}
	}
}

func TestHandleGetPublicWatchlistCanDownloadJSON(t *testing.T) {
	router := newWatchlistTestRouter(&fakeWatchlistService{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/public/users/user-42/watchlist?download=1", nil)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if got := rec.Header().Get("Content-Disposition"); got != `attachment; filename="watchlist-user-42.json"` {
		t.Fatalf("Content-Disposition = %q", got)
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

	watchlist       []domain.UserWatchListRow
	watchlistUserID string
	watchlistErr    error
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

func (s *fakeWatchlistService) GetWatchlist(_ context.Context, userID string) ([]domain.UserWatchListRow, error) {
	s.watchlistUserID = userID
	return s.watchlist, s.watchlistErr
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
