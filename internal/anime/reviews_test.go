package anime

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

func TestReviewPreviewLeavesShortReviewUnchanged(t *testing.T) {
	body := "short review\nwith a second paragraph"

	got, truncated := reviewPreview(body, 200)

	if truncated {
		t.Fatal("short review should not be truncated")
	}
	if got != body {
		t.Fatalf("preview = %q, want original body", got)
	}
}

func TestReviewPreviewTruncatesAtUnicodeWordBoundary(t *testing.T) {
	body := "alpha beta 世界 gamma delta"

	got, truncated := reviewPreview(body, 18)

	if !truncated {
		t.Fatal("long review should be truncated")
	}
	if got != "alpha beta 世界..." {
		t.Fatalf("preview = %q, want word-boundary unicode prefix", got)
	}
	if !strings.HasPrefix(body, strings.TrimSuffix(got, "...")) {
		t.Fatalf("preview %q should be a faithful prefix of %q", got, body)
	}
}

func TestReviewPreviewFallsBackToRuneBoundary(t *testing.T) {
	got, truncated := reviewPreview("世界世界世界", 3)

	if !truncated {
		t.Fatal("long unspaced review should be truncated")
	}
	if got != "世界世..." {
		t.Fatalf("preview = %q, want rune-boundary prefix", got)
	}
}

func TestReviewEntryMapperKeepsFullReviewAndAddsPreview(t *testing.T) {
	body := strings.Repeat("review ", 260)

	got := mapReviewEntry(jikanReviewEntry(12, body), 4)

	if got.Review != body {
		t.Fatal("mapped review should keep the full review body")
	}
	if got.Preview == "" || got.Preview == got.Review {
		t.Fatalf("mapped preview should be populated and shorter than full body")
	}
	if !got.IsTruncated {
		t.Fatal("mapped review should mark long body as truncated")
	}
	if got.SourcePage != 4 {
		t.Fatalf("SourcePage = %d, want 4", got.SourcePage)
	}
}

func jikanReviewEntry(id int, body string) jikan.ReviewEntry {
	return jikan.ReviewEntry{MalID: id, Review: body}
}

func TestHandleAnimeReviewBodyRendersFullFragment(t *testing.T) {
	gin.SetMode(gin.TestMode)
	review := domain.ReviewEntry{
		MalID:       456,
		Review:      "full review text",
		Preview:     "preview",
		IsTruncated: true,
		SourcePage:  3,
	}
	svc := &reviewBodyServiceStub{review: review}
	router := newReviewBodyTestRouter(t, svc)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/anime/123/reviews/456/body?source_page=3", nil)
	req.Header.Set("HX-Request", "true")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d\n%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	if svc.animeID != 123 || svc.page != 3 || svc.reviewID != 456 {
		t.Fatalf("GetReview called with anime=%d page=%d review=%d, want 123/3/456", svc.animeID, svc.page, svc.reviewID)
	}
	body := rec.Body.String()
	if strings.Contains(body, "<!DOCTYPE html>") {
		t.Fatalf("fragment unexpectedly rendered full page:\n%s", body)
	}
	if !strings.Contains(body, "full review text") || !strings.Contains(body, `aria-expanded="true"`) {
		t.Fatalf("full fragment missing body or expanded state:\n%s", body)
	}
}

func TestHandleAnimeReviewBodyReturnsNotFoundForMismatchedPage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := newReviewBodyTestRouter(t, &reviewBodyServiceStub{err: errReviewNotFound})

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/anime/123/reviews/456/body?source_page=2", nil)
	req.Header.Set("HX-Request", "true")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNotFound)
	}
}

func TestHandleAnimeReviewBodyRejectsInvalidSourcePage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := newReviewBodyTestRouter(t, &reviewBodyServiceStub{})

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/anime/123/reviews/456/body?source_page=0", nil)
	req.Header.Set("HX-Request", "true")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

type reviewBodyServiceStub struct {
	Service
	review   domain.ReviewEntry
	err      error
	animeID  int
	page     int
	reviewID int
}

func (s *reviewBodyServiceStub) GetReview(_ context.Context, animeID int, page int, reviewID int) (domain.ReviewEntry, error) {
	s.animeID = animeID
	s.page = page
	s.reviewID = reviewID
	if s.err != nil {
		return domain.ReviewEntry{}, s.err
	}
	if s.review.MalID != reviewID {
		return domain.ReviewEntry{}, errors.New("unexpected review id")
	}
	return s.review, nil
}

func newReviewBodyTestRouter(t *testing.T, svc Service) *gin.Engine {
	t.Helper()

	renderer, err := templates.ProvideRenderer()
	if err != nil {
		t.Fatalf("ProvideRenderer: %v", err)
	}

	router := gin.New()
	router.HTMLRender = renderer
	NewAnimeHandler(svc, nil, nil, nil).Register(router)
	return router
}
