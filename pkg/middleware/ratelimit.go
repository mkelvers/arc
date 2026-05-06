package middleware

import (
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

type visitor struct {
	attempts int
	lastSeen time.Time
}

type Config struct {
	MaxAttempts int
	Window      time.Duration
}

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

func (l *Limiter) Cleanup(now time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()
	for ip, v := range l.visitors {
		if now.Sub(v.lastSeen) > l.config.Window*3 {
			delete(l.visitors, ip)
		}
	}
}

func getIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		ips := strings.Split(xff, ",")
		return strings.TrimSpace(ips[0])
	}
	if realIP := r.Header.Get("X-Real-IP"); realIP != "" {
		return realIP
	}
	ip := r.RemoteAddr
	if colonIdx := strings.LastIndex(ip, ":"); colonIdx != -1 {
		ip = ip[:colonIdx]
	}
	return ip
}

func (l *Limiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !l.allow(getIP(r)) {
			http.Error(w, "Too many requests. Please try again later.", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

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

func (l *Limiter) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	v, exists := l.visitors[ip]
	if !exists {
		l.visitors[ip] = &visitor{1, time.Now()}
		return true
	}

	if time.Since(v.lastSeen) > l.config.Window {
		v.attempts = 1
		v.lastSeen = time.Now()
		return true
	}

	v.attempts++
	v.lastSeen = time.Now()
	return v.attempts <= l.config.MaxAttempts
}
