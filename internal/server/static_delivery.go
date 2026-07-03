package server

import (
	"bufio"
	"mime"
	"net"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

//nolint:unused
func addVary(header http.Header, value string) {
	for _, line := range header.Values("Vary") {
		for _, existing := range strings.Split(line, ",") {
			if strings.EqualFold(strings.TrimSpace(existing), value) {
				return
			}
		}
	}
	header.Add("Vary", value)
}

//nolint:unused
func isCompressibleContentType(value string) bool {
	mediaType, _, err := mime.ParseMediaType(value)
	if err != nil {
		mediaType = strings.TrimSpace(strings.Split(value, ";")[0])
	}
	mediaType = strings.ToLower(mediaType)
	if strings.HasPrefix(mediaType, "text/") || strings.HasSuffix(mediaType, "+json") || strings.HasSuffix(mediaType, "+xml") {
		return true
	}
	switch mediaType {
	case "application/javascript", "application/json", "application/manifest+json", "application/x-javascript", "application/xhtml+xml", "application/xml", "image/svg+xml":
		return true
	default:
		return false
	}
}

func isCompressedPath(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".7z", ".avif", ".br", ".gif", ".gz", ".ico", ".jpeg", ".jpg", ".m4a", ".m4v", ".mov", ".mp3", ".mp4", ".oga", ".ogg", ".ogv", ".pdf", ".png", ".rar", ".webm", ".webp", ".woff", ".woff2", ".zip":
		return true
	default:
		return false
	}
}

func isImagePath(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".avif", ".gif", ".ico", ".jpeg", ".jpg", ".png", ".svg", ".webp":
		return true
	default:
		return false
	}
}

func staticCachePolicy(r *http.Request) string {
	path := r.URL.Path
	switch {
	case strings.HasPrefix(path, "/dist/"):
		if r.URL.Query().Get("v") != "" {
			return "public, max-age=31536000, immutable"
		}
		return "public, max-age=0, must-revalidate"
	case strings.HasPrefix(path, "/static/assets/") && isImagePath(path):
		return "public, max-age=86400"
	default:
		return ""
	}
}

type cacheControlWriter struct {
	gin.ResponseWriter
	policy string
}

//nolint:unused
func (w *cacheControlWriter) WriteHeader(status int) {
	w.apply(status)
	w.ResponseWriter.WriteHeader(status)
}

//nolint:unused
func (w *cacheControlWriter) WriteHeaderNow() {
	w.apply(w.Status())
	w.ResponseWriter.WriteHeaderNow()
}

//nolint:unused
func (w *cacheControlWriter) Write(data []byte) (int, error) {
	if !w.Written() {
		w.apply(w.Status())
	}
	return w.ResponseWriter.Write(data)
}

//nolint:unused
func (w *cacheControlWriter) WriteString(data string) (int, error) {
	if !w.Written() {
		w.apply(w.Status())
	}
	return w.ResponseWriter.WriteString(data)
}

//nolint:unused
func (w *cacheControlWriter) Flush() {
	if !w.Written() {
		w.apply(w.Status())
	}
	w.ResponseWriter.Flush()
}

//nolint:unused
func (w *cacheControlWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	return w.ResponseWriter.Hijack()
}

//nolint:unused
func (w *cacheControlWriter) apply(status int) {
	if status >= http.StatusOK && status < http.StatusMultipleChoices || status == http.StatusNotModified {
		w.Header().Set("Cache-Control", w.policy)
	} else {
		w.Header().Del("Cache-Control")
	}
}

//nolint:unused
func StaticCacheMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
			return
		}

		policy := staticCachePolicy(c.Request)
		if policy == "" {
			return
		}

		c.Writer = &cacheControlWriter{ResponseWriter: c.Writer, policy: policy}
		c.Next()
	}
}

//nolint:unused
type compressionMode uint8

const (
	compressionUndecided compressionMode = iota //nolint:unused
	compressionPlain                            //nolint:unused
	compressionGzip                             //nolint:unused
)

//nolint:unused
func acceptsGzip(value string) bool {
	wildcard := false
	for _, part := range strings.Split(value, ",") {
		params := strings.Split(part, ";")
		encoding := strings.TrimSpace(strings.ToLower(params[0]))
		quality := 1.0
		for _, param := range params[1:] {
			name, raw, ok := strings.Cut(strings.TrimSpace(param), "=")
			if !ok || !strings.EqualFold(name, "q") {
				continue
			}
			parsed, err := strconv.ParseFloat(raw, 64)
			if err != nil {
				quality = 0
			} else {
				quality = parsed
			}
		}
		if encoding == "gzip" {
			return quality > 0
		}
		if encoding == "*" && quality > 0 {
			wildcard = true
		}
	}
	return wildcard
}

//nolint:unused
func canNegotiateCompression(r *http.Request) bool {
	if r.Method == http.MethodHead || r.Header.Get("Range") != "" {
		return false
	}
	if strings.EqualFold(r.Header.Get("Connection"), "Upgrade") {
		return false
	}
	if r.URL.Path == "/watch/proxy/stream" || r.URL.Path == "/watch/proxy/subtitle" {
		return false
	}
	return !isCompressedPath(r.URL.Path)
}
