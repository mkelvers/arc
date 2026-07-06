package anime

import (
	"context"
	"mal/integrations/playback/allanime"
	"mal/templates"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

type countingSeasonalProvider struct {
	calls int
}

func (p *countingSeasonalProvider) SeasonalShows(context.Context, string, int) ([]allanime.ProviderShow, error) {
	p.calls++
	return nil, nil
}

func TestSimulcastPageDefersProviderFetch(t *testing.T) {
	gin.SetMode(gin.TestMode)
	provider := &countingSeasonalProvider{}
	handler := NewAnimeHandler(nil, nil, nil, newSeasonDiscoveryService(provider))
	renderer, err := templates.ProvideRenderer()
	if err != nil {
		t.Fatalf("ProvideRenderer: %v", err)
	}

	router := gin.New()
	router.HTMLRender = renderer
	router.GET("/simulcast", handler.HandleSimulcast)
	router.GET("/api/simulcast", handler.HandleSimulcastContent)

	page := httptest.NewRecorder()
	router.ServeHTTP(page, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/simulcast?season=winter&year=2024", nil))
	if page.Code != http.StatusOK {
		t.Fatalf("page status = %d, want %d", page.Code, http.StatusOK)
	}
	if provider.calls != 0 {
		t.Fatalf("provider calls during page render = %d, want 0", provider.calls)
	}
	if !strings.Contains(page.Body.String(), `hx-get="/api/simulcast?season=winter&amp;year=2024"`) {
		t.Fatalf("page did not preserve the selected season in the deferred request:\n%s", page.Body.String())
	}

	fragment := httptest.NewRecorder()
	router.ServeHTTP(fragment, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/simulcast?season=winter&year=2024", nil))
	if fragment.Code != http.StatusOK {
		t.Fatalf("fragment status = %d, want %d", fragment.Code, http.StatusOK)
	}
	if provider.calls != 2 {
		t.Fatalf("provider calls after fragment render = %d, want 2", provider.calls)
	}
	if strings.Contains(fragment.Body.String(), "<!DOCTYPE html>") {
		t.Fatal("fragment response unexpectedly rendered the full page")
	}
	if !strings.Contains(fragment.Body.String(), `id="simulcast-content"`) {
		t.Fatalf("fragment response is missing its replacement root:\n%s", fragment.Body.String())
	}
}
