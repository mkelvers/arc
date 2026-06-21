package observability

import (
	"context"
	"database/sql"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

func TestMetricsHandlerRendersPrometheusFamilies(t *testing.T) {
	metrics := NewMetrics()
	metrics.ObserveHTTPRequest(http.MethodGet, "/anime/:id", http.StatusOK, 125*time.Millisecond)
	metrics.ObserveJikanRequest("/anime/{id}", http.StatusTooManyRequests, 800*time.Millisecond, assertErr{})
	metrics.ObserveDBQuery("query", 25*time.Millisecond, nil)
	metrics.ObserveWorkerTick("episodes_availability", nil)
	metrics.ObserveCache("jikan", "hit")
	metrics.ObserveCache("episode_availability", "miss")
	metrics.ObserveJikanCacheStats(12, 3, 1770000000)

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
	assertContains(t, text, `mal_db_query_duration_seconds_count{operation="query",result="success"} 1`)
	assertContains(t, text, `mal_worker_ticks_total{result="success",worker="episodes_availability"} 1`)
	assertContains(t, text, `mal_cache_operations_total{cache="episode_availability",result="miss"} 1`)
	assertContains(t, text, `mal_jikan_cache_rows{state="total"} 12`)
	assertContains(t, text, `mal_jikan_cache_rows{state="expired"} 3`)
	assertContains(t, text, `mal_jikan_cache_oldest_expires_at_seconds 1770000000`)
}

func TestInstrumentDBRecordsQueryLatency(t *testing.T) {
	metrics := NewMetrics()
	sqlDB, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer func() {
		if err := sqlDB.Close(); err != nil {
			t.Errorf("close sqlite: %v", err)
		}
	}()

	instrumented := InstrumentDB(sqlDB, metrics)
	if _, err := instrumented.ExecContext(context.Background(), `CREATE TABLE item (id INTEGER PRIMARY KEY)`); err != nil {
		t.Fatalf("create table: %v", err)
	}
	if _, err := instrumented.QueryContext(context.Background(), `SELECT id FROM item`); err != nil {
		t.Fatalf("query table: %v", err)
	}
	if _, err := instrumented.QueryContext(context.Background(), `SELECT id FROM missing_table`); err == nil {
		t.Fatal("expected missing table query to fail")
	}

	samples := metrics.dbQueryLatency.snapshot()
	if len(samples) != 3 {
		t.Fatalf("db samples = %d, want 3", len(samples))
	}
	assertHistogramSample(t, samples, "exec", "success")
	assertHistogramSample(t, samples, "query", "success")
	assertHistogramSample(t, samples, "query", "error")
}

type assertErr struct{}

func (assertErr) Error() string { return "boom" }

func assertContains(t *testing.T, text string, want string) {
	t.Helper()
	if !strings.Contains(text, want) {
		t.Fatalf("missing metric line %q in:\n%s", want, text)
	}
}

func assertHistogramSample(t *testing.T, samples []histogramSample, operation string, result string) {
	t.Helper()
	for _, sample := range samples {
		if sample.labels["operation"] == operation && sample.labels["result"] == result && sample.count == 1 {
			return
		}
	}
	t.Fatalf("missing db histogram sample operation=%q result=%q in %#v", operation, result, samples)
}
