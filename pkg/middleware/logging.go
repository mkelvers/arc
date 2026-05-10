package middleware

import (
	"bufio"
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"
	"time"
)

// statusRecorder wraps ResponseWriter to capture the status code
// defaults to 200 if WriteHeader is never called before Write
type statusRecorder struct {
	http.ResponseWriter
	statusCode  int
	wroteHeader bool
}

func newStatusRecorder(w http.ResponseWriter) *statusRecorder {
	return &statusRecorder{
		ResponseWriter: w,
		statusCode:     http.StatusOK,
	}
}

// WriteHeader records the status code and proxies to underlying writer
func (rw *statusRecorder) WriteHeader(code int) {
	if rw.wroteHeader {
		return
	}
	rw.statusCode = code
	rw.wroteHeader = true
	rw.ResponseWriter.WriteHeader(code)
}

// Write ensures a status code is set before writing the body
func (rw *statusRecorder) Write(b []byte) (int, error) {
	if !rw.wroteHeader {
		rw.WriteHeader(http.StatusOK)
	}
	return rw.ResponseWriter.Write(b)
}

// Flush proxies the Flusher interface if supported
func (rw *statusRecorder) Flush() {
	if flusher, ok := rw.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

// Hijack proxies the Hijacker interface if supported
func (rw *statusRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := rw.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, fmt.Errorf("response writer does not support hijacking")
	}
	return hijacker.Hijack()
}

// Push proxies the Pusher interface if supported
func (rw *statusRecorder) Push(target string, opts *http.PushOptions) error {
	pusher, ok := rw.ResponseWriter.(http.Pusher)
	if !ok {
		return http.ErrNotSupported
	}
	return pusher.Push(target, opts)
}

// Unwrap returns the underlying ResponseWriter for middleware chaining
func (rw *statusRecorder) Unwrap() http.ResponseWriter {
	return rw.ResponseWriter
}

// RequestLogger logs requests that result in 4xx/5xx responses
// skips static assets, streaming, and common bot paths
func RequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		if strings.HasPrefix(r.URL.Path, "/dist/") ||
			strings.HasPrefix(r.URL.Path, "/static/") ||
			strings.HasPrefix(r.URL.Path, "/watch/proxy/stream") ||
			strings.HasPrefix(r.URL.Path, "/watch/proxy/segment") ||
			r.URL.Path == "/favicon.ico" ||
			r.URL.Path == "/robots.txt" {
			next.ServeHTTP(w, r)
			return
		}

		recorder := newStatusRecorder(w)

		next.ServeHTTP(recorder, r)

		if recorder.statusCode >= 400 {
			log.Printf("%s %s %d %s", r.Method, r.URL.Path, recorder.statusCode, time.Since(start))
		}
	})
}
