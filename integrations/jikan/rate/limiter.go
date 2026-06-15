package rate

import (
	"context"
	"fmt"
	"sync"
	"time"
)

type Limiter struct {
	mu          sync.Mutex
	nextReqTime time.Time
	interval    time.Duration
}

func NewLimiter(interval time.Duration) *Limiter {
	return &Limiter{interval: interval}
}

// Wait enforces minimum spacing between upstream Jikan requests.
func (l *Limiter) Wait(ctx context.Context) error {
	waitUntil := l.reserve(time.Now())
	if waitUntil.IsZero() {
		return nil
	}

	timer := time.NewTimer(time.Until(waitUntil))
	defer timer.Stop()

	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return fmt.Errorf("request canceled while waiting for rate limit: %w", ctx.Err())
	}
}

func (l *Limiter) reserve(now time.Time) time.Time {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.nextReqTime.IsZero() || now.After(l.nextReqTime) {
		l.nextReqTime = now.Add(l.interval)
		return time.Time{}
	}

	waitUntil := l.nextReqTime
	l.nextReqTime = l.nextReqTime.Add(l.interval)
	return waitUntil
}
