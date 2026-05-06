# Rate Limiter Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the global-state rate limiter into a struct-based implementation that supports multiple instances with different configurations.

**Architecture:** 
1. Introduce a `Limiter` struct that encapsulates state and configuration.
2. Remove global variables and `init()` in `pkg/middleware/ratelimit.go`.
3. Provide generic and auth-specific middleware methods.
4. Integrate the new `Limiter` into the server startup and router.

**Tech Stack:** Go (Standard Library)

---

### Task 1: Refactor Limiter Logic and State

**Files:**
- Modify: `pkg/middleware/ratelimit.go`

- [ ] **Step 1: Define new structs and remove global state**

Replace content of `pkg/middleware/ratelimit.go`:
```go
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
```

- [ ] **Step 2: Implement Middleware methods**

Add to `pkg/middleware/ratelimit.go`:
```go
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
```

- [ ] **Step 3: Commit refactor**

```bash
git add pkg/middleware/ratelimit.go
git commit -m "refactor: convert rate limiter to struct-based implementation"
```

### Task 2: Add Unit Tests for Limiter

**Files:**
- Create: `pkg/middleware/ratelimit_test.go`

- [ ] **Step 1: Write tests for Limiter logic**

Create `pkg/middleware/ratelimit_test.go`:
```go
package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func testHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
}

func TestLimiter(t *testing.T) {
	cfg := Config{MaxAttempts: 2, Window: 100 * time.Millisecond}
	l := NewLimiter(cfg)
	handler := l.Middleware(testHandler())

	// First attempt
	req := httptest.NewRequest("GET", "/", nil)
	req.RemoteAddr = "1.2.3.4:1234"
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}

	// Second attempt
	rr = httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}

	// Third attempt (should fail)
	rr = httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusTooManyRequests {
		t.Errorf("expected 429, got %d", rr.Code)
	}

	// Wait for window to expire
	time.Sleep(150 * time.Millisecond)

	// Fourth attempt (should pass again)
	rr = httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}
}
```

- [ ] **Step 2: Run tests**

Run: `go test -v pkg/middleware/ratelimit.go pkg/middleware/ratelimit_test.go`
Expected: PASS

- [ ] **Step 3: Commit tests**

```bash
git add pkg/middleware/ratelimit_test.go
git commit -m "test: add unit tests for rate limiter"
```

### Task 3: Integrate Limiter into Server

**Files:**
- Modify: `internal/server/routes.go`
- Modify: `cmd/server/main.go`

- [ ] **Step 1: Update Config and NewRouter**

Modify `internal/server/routes.go`:
```go
type Config struct {
	DB                  *db.Queries
	SQLDB               *sql.DB
	JikanClient         *jikan.Client
	AuthService         *auth.Service
	PlaybackProxySecret string
	AuthLimiter         *pkgmiddleware.Limiter // Add this
}

// ... in NewRouter function, replace:
// pkgmiddleware.RateLimitAuth(...)
// with:
// cfg.AuthLimiter.AuthMiddleware(...)
```

- [ ] **Step 2: Instantiate Limiter in main.go**

Modify `cmd/server/main.go`:
```go
// ... in main function
authLimiter := pkgmiddleware.NewLimiter(pkgmiddleware.Config{
    MaxAttempts: 5,
    Window:      time.Minute,
})

// Start cleanup goroutine
go func() {
    for {
        time.Sleep(time.Minute)
        authLimiter.Cleanup(time.Now())
    }
}()

router := server.NewRouter(server.Config{
    // ...
    AuthLimiter: authLimiter,
})
```

- [ ] **Step 3: Verify build and manual test**

Run: `go build ./...`
Expected: PASS

- [ ] **Step 4: Commit integration**

```bash
git add internal/server/routes.go cmd/server/main.go
git commit -m "feat: integrate new rate limiter into server"
```
