package rate

import (
	"context"
	"fmt"
	"sync"
	"time"
)

type Limiter struct {
	mu          sync.Mutex
	lastReqTime time.Time
	interval    time.Duration
}

func NewLimiter(interval time.Duration) *Limiter {
	return &Limiter{interval: interval}
}

// Wait enforces minimum spacing between upstream Jikan requests.
func (l *Limiter) Wait(ctx context.Context) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	nextAllowed := l.lastReqTime.Add(l.interval)
	if now.Before(nextAllowed) {
		timer := time.NewTimer(nextAllowed.Sub(now))
		defer timer.Stop()

		select {
		case <-timer.C:
		case <-ctx.Done():
			return fmt.Errorf("request canceled while waiting for rate limit: %w", ctx.Err())
		}
		l.lastReqTime = time.Now()
		return nil
	}

	l.lastReqTime = now
	return nil
}
