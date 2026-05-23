package server

import (
	"bytes"
	"io"
	"log"
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

func TestRequestLoggerUsesMatchedRoute(t *testing.T) {
	gin.SetMode(gin.TestMode)

	var logs bytes.Buffer
	previousOutput := log.Writer()
	log.SetOutput(&logs)
	defer log.SetOutput(previousOutput)

	router := gin.New()
	router.Use(RequestLogger(observability.NewMetrics()))
	router.GET("/anime/:id", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	req := httptest.NewRequest(http.MethodGet, "/anime/1?section=characters", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	output, err := io.ReadAll(&logs)
	if err != nil {
		t.Fatalf("read logs: %v", err)
	}

	logLine := string(output)
	if !strings.Contains(logLine, `"event":"http_request"`) {
		t.Fatalf("log line missing event: %s", logLine)
	}
	if !strings.Contains(logLine, `"route":"/anime/:id"`) {
		t.Fatalf("log line missing route: %s", logLine)
	}
	if !strings.Contains(logLine, `"status":200`) {
		t.Fatalf("log line missing status: %s", logLine)
	}
}
