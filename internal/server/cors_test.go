package server

import (
	"context"
	"mal/internal/config"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestCORSAllowAllSetsOriginHeader(t *testing.T) {
	gin.SetMode(gin.TestMode)

	cfg := config.Config{CORSAllowAll: true}
	router := gin.New()
	router.Use(CORSMiddlewareWithConfig(cfg))
	router.GET("/api/test", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/test", nil)
	req.Header.Set("Origin", "https://example.com")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://example.com" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want %q", got, "https://example.com")
	}
	if got := rec.Header().Get("Vary"); got != "Origin" {
		t.Fatalf("Vary = %q, want %q", got, "Origin")
	}
}

func TestCORSDisallowNonLocalOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)

	cfg := config.Config{CORSAllowAll: false}
	router := gin.New()
	router.Use(CORSMiddlewareWithConfig(cfg))
	router.GET("/api/test", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/test", nil)
	req.Header.Set("Origin", "https://example.com")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want empty", got)
	}
}

func TestCORSAllowsLocalOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)

	cfg := config.Config{CORSAllowAll: false}
	router := gin.New()
	router.Use(CORSMiddlewareWithConfig(cfg))
	router.GET("/api/test", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	for _, origin := range []string{"http://localhost:3000", "https://localhost:5173", "http://127.0.0.1:8080"} {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/test", nil)
		req.Header.Set("Origin", origin)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != origin {
			t.Fatalf("origin %q: Access-Control-Allow-Origin = %q, want %q", origin, got, origin)
		}
	}
}

func TestCORSPreflightReturnsNoContent(t *testing.T) {
	gin.SetMode(gin.TestMode)

	cfg := config.Config{CORSAllowAll: true}
	router := gin.New()
	router.Use(CORSMiddlewareWithConfig(cfg))

	req := httptest.NewRequestWithContext(context.Background(), http.MethodOptions, "/api/test", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
	}
}

func TestCORSPreflightSkipsNonAPI(t *testing.T) {
	gin.SetMode(gin.TestMode)

	cfg := config.Config{CORSAllowAll: true}
	router := gin.New()
	router.Use(CORSMiddlewareWithConfig(cfg))
	router.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	req := httptest.NewRequestWithContext(context.Background(), http.MethodOptions, "/test", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNotFound)
	}
}
