# Design Spec: Generic Rate Limiter Refactor

Refactor the current global-state rate limiter into a struct-based implementation that supports multiple instances with different configurations, improving testability and flexibility.

## 1. Core Architecture

### Current State
- `pkg/middleware/ratelimit.go` uses global variables (`visitors`, `mu`, `quit`).
- Cleanup logic is started automatically via `init()`.
- Limits are hardcoded (5 attempts per minute).

### Changes
- **Limiter Struct:** Encapsulate state within a `Limiter` struct.
- **Explicit Configuration:** Pass limits and windows via a `Config` struct.
- **Context-aware Cleanup:** Use `context.Context` to manage the cleanup goroutine lifecycle instead of a global `quit` channel.

## 2. Component Design

### `Limiter` Struct
```go
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
```

### Initialization
```go
func NewLimiter(cfg Config) *Limiter {
	return &Limiter{
		visitors: make(map[string]*visitor),
		config:   cfg,
	}
}
```

### Middleware Methods
- `Middleware(next http.Handler) http.Handler`: Generic rate limiting.
- `AuthMiddleware(next http.Handler) http.Handler`: Specific logic for auth (redirects with error params).

## 3. Integration Plan

- Instantiate the `Limiter` in `cmd/server/main.go`.
- Pass the `Limiter` or its middleware to `internal/server/NewRouter`.
- Update `internal/server/routes.go` to use the new instance-based middleware.

## 4. Verification Plan

### Automated Checks
- **Unit Tests:** Create `pkg/middleware/ratelimit_test.go` to verify:
    - Multiple IPs are tracked independently.
    - Limits are enforced correctly.
    - Attempts reset after the window expires.
- `go test ./pkg/middleware/...`: Run the new tests.

### Manual Checks
- Verify that exceeding login attempts still triggers the `rate_limited` redirect.
