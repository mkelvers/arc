package server

import (
	"compress/gzip"
	"context"
	"io"
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

func TestCompressionMiddleware(t *testing.T) {
	body := strings.Repeat("compressible javascript;", 100)

	for _, tt := range compressionCases {
		t.Run(tt.name, func(t *testing.T) {
			testCompressionResponse(t, tt, body)
		})
	}
}

func testCompressionResponse(t *testing.T, tt compressionTestCase, body string) {
	t.Helper()
	router := compressionRouter(tt, body)
	req := compressionRequest(tt)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assertCompressionResponse(t, tt, rec, body)
}

func compressionRouter(tt compressionTestCase, body string) *gin.Engine {
	router := gin.New()
	router.Use(CompressionMiddleware())
	router.Handle(tt.method, tt.path, func(c *gin.Context) {
		if tt.contentEncoding != "" {
			c.Header("Content-Encoding", tt.contentEncoding)
		}
		if tt.status == http.StatusPartialContent {
			c.Header("Accept-Ranges", "bytes")
			c.Header("Content-Range", "bytes 0-99/2300")
		}
		c.Data(tt.status, tt.contentType, []byte(body))
	})
	return router
}

func compressionRequest(tt compressionTestCase) *http.Request {
	req := httptest.NewRequestWithContext(context.Background(), tt.method, tt.path, nil)
	if tt.acceptEncoding != "" {
		req.Header.Set("Accept-Encoding", tt.acceptEncoding)
	}
	if tt.rangeHeader != "" {
		req.Header.Set("Range", tt.rangeHeader)
	}
	return req
}

func assertCompressionResponse(t *testing.T, tt compressionTestCase, rec *httptest.ResponseRecorder, body string) {
	t.Helper()
	if got := rec.Header().Get("Content-Encoding"); got != tt.wantEncoding {
		t.Fatalf("Content-Encoding = %q, want %q", got, tt.wantEncoding)
	}
	if got := headerContains(rec.Header(), "Vary", "Accept-Encoding"); got != tt.wantVary {
		t.Fatalf("Vary contains Accept-Encoding = %t, want %t", got, tt.wantVary)
	}
	if rec.Code != tt.status {
		t.Fatalf("status = %d, want %d", rec.Code, tt.status)
	}
	if got := responseBody(t, rec, tt.wantEncoding); got != body {
		t.Fatalf("body length = %d, want %d", len(got), len(body))
	}
	if tt.status == http.StatusPartialContent && rec.Header().Get("Content-Range") != "bytes 0-99/2300" {
		t.Fatalf("Content-Range = %q", rec.Header().Get("Content-Range"))
	}
}

func responseBody(t *testing.T, rec *httptest.ResponseRecorder, encoding string) string {
	t.Helper()
	if encoding != "gzip" {
		return rec.Body.String()
	}
	reader, err := gzip.NewReader(rec.Body)
	if err != nil {
		t.Fatalf("open gzip response: %v", err)
	}
	decompressed, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("read gzip response: %v", err)
	}
	if err := reader.Close(); err != nil {
		t.Fatalf("close gzip response: %v", err)
	}
	return string(decompressed)
}

func TestCompressionMiddlewareSkipsSmallResponses(t *testing.T) {
	router := gin.New()
	router.Use(CompressionMiddleware())
	router.GET("/text", func(c *gin.Context) {
		c.String(http.StatusOK, "small response")
	})

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/text", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if got := rec.Header().Get("Content-Encoding"); got != "" {
		t.Fatalf("Content-Encoding = %q, want empty", got)
	}
	if got := rec.Body.String(); got != "small response" {
		t.Fatalf("body = %q", got)
	}
}

func TestCompressionMiddlewarePreservesNotModifiedAndHead(t *testing.T) {
	tests := []struct {
		name     string
		method   string
		path     string
		status   int
		wantVary bool
	}{
		{name: "not modified", method: http.MethodGet, path: "/not-modified", status: http.StatusNotModified, wantVary: true},
		{name: "head", method: http.MethodHead, path: "/text", status: http.StatusOK},
		{name: "no content", method: http.MethodGet, path: "/no-content", status: http.StatusNoContent},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			router := gin.New()
			router.Use(CompressionMiddleware())
			router.Handle(tt.method, tt.path, func(c *gin.Context) {
				c.Status(tt.status)
			})
			req := httptest.NewRequestWithContext(context.Background(), tt.method, tt.path, nil)
			req.Header.Set("Accept-Encoding", "gzip")
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if rec.Code != tt.status || rec.Body.Len() != 0 {
				t.Fatalf("response = %d with %d body bytes", rec.Code, rec.Body.Len())
			}
			if got := rec.Header().Get("Content-Encoding"); got != "" {
				t.Fatalf("Content-Encoding = %q, want empty", got)
			}
			if got := headerContains(rec.Header(), "Vary", "Accept-Encoding"); got != tt.wantVary {
				t.Fatalf("Vary contains Accept-Encoding = %t, want %t", got, tt.wantVary)
			}
		})
	}
}
