package rate

import (
	"context"
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
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

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
		l.release(waitUntil)
		return ctx.Err()
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

func (l *Limiter) release(waitUntil time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()

	reservationEnd := waitUntil.Add(l.interval)
	if l.nextReqTime.Equal(reservationEnd) {
		l.nextReqTime = waitUntil
	}
}
