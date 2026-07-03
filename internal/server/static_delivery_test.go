package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestStaticCacheMiddleware(t *testing.T) {
	tests := []struct {
		name string
		path string
		want string
	}{
		{name: "versioned dist", path: "/dist/static/app.js?v=test", want: "public, max-age=31536000, immutable"},
		{name: "unversioned dist", path: "/dist/static/app.js", want: "public, max-age=0, must-revalidate"},
		{name: "static image", path: "/static/assets/logo.png", want: "public, max-age=86400"},
		{name: "html", path: "/anime/1", want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			router := gin.New()
			router.Use(StaticCacheMiddleware())
			path, _, _ := strings.Cut(tt.path, "?")
			router.GET(path, func(c *gin.Context) {
				c.String(http.StatusOK, "response")
			})

			req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, tt.path, nil)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if got := rec.Header().Get("Cache-Control"); got != tt.want {
				t.Fatalf("Cache-Control = %q, want %q", got, tt.want)
			}
		})
	}
}

//nolint:unused
func headerContains(header http.Header, name, want string) bool {
	for _, line := range header.Values(name) {
		for _, value := range strings.Split(line, ",") {
			if strings.EqualFold(strings.TrimSpace(value), want) {
				return true
			}
		}
	}
	return false
}
