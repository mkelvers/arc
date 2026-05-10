package middleware

import (
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

// visitor tracks request attempts and last access time per IP
type visitor struct {
	attempts int
	lastSeen time.Time
}

// Config holds rate limiter settings
type Config struct {
	MaxAttempts int           // max requests per window
	Window      time.Duration // sliding window duration
}

// Limiter implements a simple in-memory IP-based rate limiter
type Limiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	config   Config
}

func NewLimiter(cfg Config) *Limiter {
	return &Limiter{
		visitors: make(map[string]*visitor),
		config:   cfg,
	}
}

// Cleanup removes stale visitor entries older than 3x the window
func (l *Limiter) Cleanup(now time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()
	for ip, v := range l.visitors {
		if now.Sub(v.lastSeen) > l.config.Window*3 {
			delete(l.visitors, ip)
		}
	}
}

// getIP extracts the client IP, checking X-Forwarded-For and X-Real-IP headers
func getIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		ips := strings.Split(xff, ",")
		return strings.TrimSpace(ips[0]) // first proxy IP
	}
	if realIP := r.Header.Get("X-Real-IP"); realIP != "" {
		return realIP
	}
	ip := r.RemoteAddr
	if colonIdx := strings.LastIndex(ip, ":"); colonIdx != -1 {
		ip = ip[:colonIdx] // strip port for IPv4-mapped IPv6
	}
	return ip
}

// Middleware returns 429 for rate-limited API requests
func (l *Limiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !l.allow(getIP(r)) {
			http.Error(w, "Too many requests. Please try again later.", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// AuthMiddleware redirects rate-limited form submissions back to the page
// returns 429 for non-path requests (e.g. API calls)
func (l *Limiter) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !l.allow(getIP(r)) {
			if strings.HasPrefix(r.URL.Path, "/") {
				http.Redirect(w, r, fmt.Sprintf("%s?error=rate_limited", r.URL.Path), http.StatusFound)
				return
			}
			http.Error(w, "Too many requests. Please try again later.", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// allow checks and updates the visitor's attempt count; returns true if allowed
// resets counter if window has expired, otherwise increments and checks limit
func (l *Limiter) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	v, exists := l.visitors[ip]
	if !exists {
		l.visitors[ip] = &visitor{1, time.Now()}
		return true
	}

	if time.Since(v.lastSeen) > l.config.Window {
		v.attempts = 1 // reset counter on window expiry
		v.lastSeen = time.Now()
		return true
	}

	v.attempts++
	v.lastSeen = time.Now()
	return v.attempts <= l.config.MaxAttempts
}
