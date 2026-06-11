package observability

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestMetricsHandlerRendersPrometheusFamilies(t *testing.T) {
	metrics := NewMetrics()
	metrics.ObserveHTTPRequest(http.MethodGet, "/anime/:id", http.StatusOK, 125*time.Millisecond)
	metrics.ObserveJikanRequest("/anime/{id}", http.StatusTooManyRequests, 800*time.Millisecond, assertErr{})
	metrics.ObserveWorkerTick("episodes_availability", nil)
	metrics.ObserveCache("jikan", "hit")
	metrics.ObserveCache("episode_availability", "miss")

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/metrics", nil)
	rec := httptest.NewRecorder()
	metrics.Handler().ServeHTTP(rec, req)

	body, err := io.ReadAll(rec.Result().Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}

	text := string(body)
	assertContains(t, text, `mal_http_requests_total{method="GET",route="/anime/:id",status="200"} 1`)
	assertContains(t, text, `mal_http_request_duration_seconds_count{method="GET",route="/anime/:id",status="200"} 1`)
	assertContains(t, text, `mal_jikan_upstream_requests_total{endpoint="/anime/{id}",status="429"} 1`)
	assertContains(t, text, `mal_jikan_upstream_errors_total{endpoint="/anime/{id}",status="429"} 1`)
	assertContains(t, text, `mal_worker_ticks_total{result="success",worker="episodes_availability"} 1`)
	assertContains(t, text, `mal_cache_operations_total{cache="episode_availability",result="miss"} 1`)
}

type assertErr struct{}

func (assertErr) Error() string { return "boom" }

func assertContains(t *testing.T, text string, want string) {
	t.Helper()
	if !strings.Contains(text, want) {
		t.Fatalf("missing metric line %q in:\n%s", want, text)
	}
}
