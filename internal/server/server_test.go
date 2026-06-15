package server

import (
	"bytes"
	"context"
	"io"
	"log"
	"mal/internal/config"
	"mal/internal/observability"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestNewHTTPServer_TimeoutsAndAddr(t *testing.T) {
	srv := newHTTPServer(":1234", http.NewServeMux())

	if srv.Addr != ":1234" {
		t.Fatalf("Addr: got %q want %q", srv.Addr, ":1234")
	}
	if srv.ReadHeaderTimeout != 5*time.Second {
		t.Fatalf("ReadHeaderTimeout: got %s want %s", srv.ReadHeaderTimeout, 5*time.Second)
	}
	if srv.ReadTimeout != 30*time.Second {
		t.Fatalf("ReadTimeout: got %s want %s", srv.ReadTimeout, 30*time.Second)
	}
	if srv.WriteTimeout != 30*time.Second {
		t.Fatalf("WriteTimeout: got %s want %s", srv.WriteTimeout, 30*time.Second)
	}
	if srv.IdleTimeout != 2*time.Minute {
		t.Fatalf("IdleTimeout: got %s want %s", srv.IdleTimeout, 2*time.Minute)
	}
}

func TestProvideRouterRegistersPprof(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := ProvideRouter(config.Config{GinMode: gin.TestMode}, nil, observability.NewMetrics())
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/debug/pprof/", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("pprof status = %d, want %d", rec.Code, http.StatusOK)
	}
	if !strings.Contains(rec.Body.String(), "Types of profiles available") {
		t.Fatalf("pprof index missing profile list: %s", rec.Body.String())
	}
}

func TestRequestLoggerUsesMatchedRoute(t *testing.T) {
	gin.SetMode(gin.TestMode)

	var logs bytes.Buffer
	previousOutput := log.Writer()
	log.SetOutput(&logs)
	defer log.SetOutput(previousOutput)

	router := gin.New()
	router.Use(RequestContextMiddleware())
	router.Use(RequestLogger(observability.NewMetrics()))
	router.GET("/anime/:id", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/anime/1?section=characters", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	output, err := io.ReadAll(&logs)
	if err != nil {
		t.Fatalf("read logs: %v", err)
	}

	logLine := string(output)
	if !strings.Contains(logLine, " INFO http 200 GET /anime/1") {
		t.Fatalf("log line missing compact http summary: %s", logLine)
	}
	if !strings.Contains(logLine, " route=/anime/:id") {
		t.Fatalf("log line missing route: %s", logLine)
	}
	if !strings.Contains(logLine, " request_id=") {
		t.Fatalf("log line missing request id: %s", logLine)
	}
	if strings.Contains(logLine, `"GET /anime/1"`) {
		t.Fatalf("log line should not duplicate request summary: %s", logLine)
	}
	if rec.Header().Get(requestIDHeader) == "" {
		t.Fatalf("expected %s response header to be set", requestIDHeader)
	}
}

func TestRespondErrorIncludesRequestContext(t *testing.T) {
	gin.SetMode(gin.TestMode)

	var logs bytes.Buffer
	previousOutput := log.Writer()
	log.SetOutput(&logs)
	defer log.SetOutput(previousOutput)

	router := gin.New()
	router.Use(RequestContextMiddleware())
	router.GET("/anime/:id", func(c *gin.Context) {
		RespondError(c, http.StatusInternalServerError, "anime_lookup_failed", "anime", "failed", nil, context.DeadlineExceeded)
	})

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/anime/1", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	output, err := io.ReadAll(&logs)
	if err != nil {
		t.Fatalf("read logs: %v", err)
	}

	logLine := string(output)
	if !strings.Contains(logLine, " request_id=") {
		t.Fatalf("log line missing request id: %s", logLine)
	}
	if !strings.Contains(logLine, " request_path=/anime/1") {
		t.Fatalf("log line missing request path: %s", logLine)
	}
	if !strings.Contains(logLine, " request_route=/anime/:id") {
		t.Fatalf("log line missing request route: %s", logLine)
	}
}
