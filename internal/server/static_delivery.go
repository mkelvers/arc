package server

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"errors"
	"mime"
	"net"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

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
	case strings.HasPrefix(path, "/static/assets/") && r.URL.Query().Get("v") != "":
		return "public, max-age=31536000, immutable"
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

func (w *cacheControlWriter) WriteHeader(status int) {
	w.apply(status)
	w.ResponseWriter.WriteHeader(status)
}

func (w *cacheControlWriter) WriteHeaderNow() {
	w.apply(w.Status())
	w.ResponseWriter.WriteHeaderNow()
}

func (w *cacheControlWriter) Write(data []byte) (int, error) {
	if !w.Written() {
		w.apply(w.Status())
	}
	return w.ResponseWriter.Write(data)
}

func (w *cacheControlWriter) WriteString(data string) (int, error) {
	if !w.Written() {
		w.apply(w.Status())
	}
	return w.ResponseWriter.WriteString(data)
}

func (w *cacheControlWriter) Flush() {
	if !w.Written() {
		w.apply(w.Status())
	}
	w.ResponseWriter.Flush()
}

func (w *cacheControlWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	return w.ResponseWriter.Hijack()
}

func (w *cacheControlWriter) apply(status int) {
	if status >= http.StatusOK && status < http.StatusMultipleChoices || status == http.StatusNotModified {
		w.Header().Set("Cache-Control", w.policy)
	} else {
		w.Header().Del("Cache-Control")
	}
}

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

type compressionMode uint8

const (
	compressionUndecided compressionMode = iota
	compressionPlain
	compressionGzip
)

const compressionMinLength = 1024

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

type compressionWriter struct {
	gin.ResponseWriter
	buffer      bytes.Buffer
	gzip        *gzip.Writer
	mode        compressionMode
	status      int
	wroteBody   bool
	acceptsGzip bool
}

func (w *compressionWriter) WriteHeader(status int) {
	if status > 0 && w.mode == compressionUndecided && !w.wroteBody {
		w.status = status
	}
}

func (w *compressionWriter) WriteHeaderNow() {
	if w.mode == compressionUndecided {
		w.startPlain()
		_ = w.flushBuffer()
	}
}

func (w *compressionWriter) WriteString(data string) (int, error) {
	return w.Write([]byte(data))
}

func (w *compressionWriter) Status() int {
	if w.status != 0 {
		return w.status
	}
	return w.ResponseWriter.Status()
}

func (w *compressionWriter) Size() int {
	if size := w.ResponseWriter.Size(); size >= 0 {
		return size
	}
	if w.buffer.Len() > 0 {
		return w.buffer.Len()
	}
	return -1
}

func (w *compressionWriter) Written() bool {
	return w.wroteBody || w.ResponseWriter.Written()
}

func (w *compressionWriter) startPlain() {
	if w.mode != compressionUndecided {
		return
	}
	w.mode = compressionPlain
	w.ResponseWriter.WriteHeader(w.Status())
}

func (w *compressionWriter) flushBuffer() error {
	if w.buffer.Len() == 0 {
		return nil
	}
	data := w.buffer.Bytes()
	w.buffer.Reset()
	var err error
	if w.mode == compressionGzip {
		_, err = w.gzip.Write(data)
	} else {
		//nolint:staticcheck
		_, err = w.ResponseWriter.Write(data)
	}
	return err
}

func (w *compressionWriter) writePlain(data []byte) (int, error) {
	w.startPlain()
	if err := w.flushBuffer(); err != nil {
		return 0, err
	}
	//nolint:staticcheck
	return w.ResponseWriter.Write(data)
}

func (w *compressionWriter) startGzip() {
	if w.mode != compressionUndecided {
		return
	}
	w.mode = compressionGzip
	w.Header().Del("Content-Length")
	if etag := w.Header().Get("ETag"); etag != "" && !strings.HasPrefix(etag, "W/") {
		w.Header().Set("ETag", "W/"+etag)
	}
	addVary(w.Header(), "Accept-Encoding")
	w.Header().Set("Content-Encoding", "gzip")
	w.ResponseWriter.WriteHeader(w.Status())
	w.gzip = gzip.NewWriter(w.ResponseWriter)
}

func (w *compressionWriter) knownContentLength() (compress, known bool) {
	contentLength := w.Header().Get("Content-Length")
	if contentLength == "" {
		return false, false
	}
	length, err := strconv.ParseInt(contentLength, 10, 64)
	if err != nil {
		return false, false
	}
	return length >= compressionMinLength, true
}

func (w *compressionWriter) canCompress(data []byte) bool {
	status := w.Status()
	if status < http.StatusOK || status == http.StatusNoContent || status == http.StatusPartialContent || status == http.StatusNotModified {
		return false
	}
	if w.Header().Get("Content-Encoding") != "" {
		return false
	}

	contentType := w.Header().Get("Content-Type")
	if contentType == "" && len(data) > 0 {
		contentType = http.DetectContentType(data)
		w.Header().Set("Content-Type", contentType)
	}
	if !isCompressibleContentType(contentType) {
		return false
	}
	addVary(w.Header(), "Accept-Encoding")
	return w.acceptsGzip
}

func (w *compressionWriter) Write(data []byte) (int, error) {
	w.wroteBody = true

	switch w.mode {
	case compressionPlain:
		//nolint:staticcheck
		return w.ResponseWriter.Write(data)
	case compressionGzip:
		return w.gzip.Write(data)
	}

	if !w.canCompress(data) {
		return w.writePlain(data)
	}

	if compress, known := w.knownContentLength(); known {
		if compress {
			w.startGzip()
			return w.gzip.Write(data)
		}
		return w.writePlain(data)
	}

	if w.buffer.Len()+len(data) < compressionMinLength {
		return w.buffer.Write(data)
	}

	w.startGzip()
	if err := w.flushBuffer(); err != nil {
		return 0, err
	}
	return w.gzip.Write(data)
}

func (w *compressionWriter) Flush() {
	if w.mode == compressionUndecided {
		if w.canCompress(w.buffer.Bytes()) {
			w.startGzip()
			_ = w.flushBuffer()
		} else {
			w.startPlain()
			_ = w.flushBuffer()
		}
	}
	if w.mode == compressionGzip {
		_ = w.gzip.Flush()
	}
	w.ResponseWriter.Flush()
}

func (w *compressionWriter) finish() error {
	if w.mode == compressionUndecided {
		if w.Status() == http.StatusNotModified {
			addVary(w.Header(), "Accept-Encoding")
		}
		if w.buffer.Len() > 0 || w.status != 0 {
			w.startPlain()
			if err := w.flushBuffer(); err != nil {
				return err
			}
			w.ResponseWriter.WriteHeaderNow()
		}
		return nil
	}
	if w.mode == compressionPlain {
		return w.flushBuffer()
	}
	if w.gzip == nil {
		return errors.New("gzip writer was not initialized")
	}
	return w.gzip.Close()
}

func CompressionMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !canNegotiateCompression(c.Request) {
			return
		}

		writer := &compressionWriter{
			ResponseWriter: c.Writer,
			acceptsGzip:    acceptsGzip(c.Request.Header.Get("Accept-Encoding")),
		}
		c.Writer = writer
		c.Next()
		if err := writer.finish(); err != nil {
			_ = c.Error(err)
		}
	}
}
