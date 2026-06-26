package handler

import (
	"context"
	"io"
	"mal/internal/domain"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

type proxyTargetPlaybackService struct {
	targetURL string
	referer   string
}

func (s proxyTargetPlaybackService) BuildWatchData(context.Context, int, []string, string, string, string) (domain.WatchPageData, error) {
	return domain.WatchPageData{}, nil
}

func (s proxyTargetPlaybackService) SaveProgress(context.Context, string, int64, int, float64) error {
	return nil
}

func (s proxyTargetPlaybackService) CompleteAnime(context.Context, string, int64) error {
	return nil
}

func (s proxyTargetPlaybackService) SignProxyToken(string, string, string) (string, error) {
	return "token", nil
}

func (s proxyTargetPlaybackService) ResolveProxyToken(string, string) (string, string, error) {
	return s.targetURL, s.referer, nil
}

func (s proxyTargetPlaybackService) UpsertSkipSegmentOverride(context.Context, string, int64, int, string, float64, float64) error {
	return nil
}

type recordingRoundTripper struct {
	called bool
}

func (rt *recordingRoundTripper) RoundTrip(*http.Request) (*http.Response, error) {
	rt.called = true
	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader("WEBVTT\n")),
	}, nil
}

func TestHandleProxySubtitleRejectsUnsafeTargetBeforeFetch(t *testing.T) {
	rt := &recordingRoundTripper{}
	h := &PlaybackHandler{
		svc:           proxyTargetPlaybackService{targetURL: "http://127.0.0.1/subtitle.vtt"},
		proxyClient:   &http.Client{Transport: rt},
		subtitleCache: newSubtitleCache(0, 1),
	}

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/watch/proxy/subtitle?token=token", nil)
	rec := httptest.NewRecorder()
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/watch/proxy/subtitle", h.HandleProxySubtitle)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadGateway)
	}
	if rt.called {
		t.Fatal("proxy client was called for unsafe target")
	}
}
