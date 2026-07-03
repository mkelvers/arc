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
type compressionTestCase struct {
	name            string
	method          string
	path            string
	acceptEncoding  string
	rangeHeader     string
	contentEncoding string
	status          int
	contentType     string
	wantEncoding    string
	wantVary        bool
}

//nolint:unused
var compressionCases = []compressionTestCase{
	{
		name:           "gzip text",
		method:         http.MethodGet,
		path:           "/dist/static/app.js",
		acceptEncoding: "gzip",
		status:         http.StatusOK,
		contentType:    "application/javascript",
		wantEncoding:   "gzip",
		wantVary:       true,
	},
	{
		name:         "plain without negotiation",
		method:       http.MethodGet,
		path:         "/dist/static/app.js",
		status:       http.StatusOK,
		contentType:  "application/javascript",
		wantEncoding: "",
		wantVary:     true,
	},
	{
		name:           "playback stream",
		method:         http.MethodGet,
		path:           "/watch/proxy/stream",
		acceptEncoding: "gzip",
		status:         http.StatusOK,
		contentType:    "application/vnd.apple.mpegurl",
		wantEncoding:   "",
	},
	{
		name:           "playback subtitle",
		method:         http.MethodGet,
		path:           "/watch/proxy/subtitle",
		acceptEncoding: "gzip",
		status:         http.StatusOK,
		contentType:    "text/vtt",
		wantEncoding:   "",
	},
	{
		name:           "range response",
		method:         http.MethodGet,
		path:           "/media",
		acceptEncoding: "gzip",
		rangeHeader:    "bytes=0-99",
		status:         http.StatusPartialContent,
		contentType:    "text/plain",
		wantEncoding:   "",
	},
	{
		name:           "compressed image",
		method:         http.MethodGet,
		path:           "/image",
		acceptEncoding: "gzip",
		status:         http.StatusOK,
		contentType:    "image/png",
		wantEncoding:   "",
	},
	{
		name:            "already encoded",
		method:          http.MethodGet,
		path:            "/encoded",
		acceptEncoding:  "gzip",
		contentEncoding: "br",
		status:          http.StatusOK,
		contentType:     "text/plain",
		wantEncoding:    "br",
	},
	{
		name:           "gzip refused",
		method:         http.MethodGet,
		path:           "/text",
		acceptEncoding: "br, gzip;q=0",
		status:         http.StatusOK,
		contentType:    "text/plain",
		wantEncoding:   "",
		wantVary:       true,
	},
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
