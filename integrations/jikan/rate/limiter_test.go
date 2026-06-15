package rate

import (
	"context"
	"testing"
	"time"
)

func TestLimiterDoesNotHoldLockWhileWaiting(t *testing.T) {
	limiter := NewLimiter(250 * time.Millisecond)
	if err := limiter.Wait(context.Background()); err != nil {
		t.Fatalf("initial wait: %v", err)
	}

	firstCtx, cancelFirst := context.WithCancel(context.Background())
	defer cancelFirst()

	firstDone := make(chan error, 1)
	go func() {
		firstDone <- limiter.Wait(firstCtx)
	}()

	time.Sleep(20 * time.Millisecond)

	secondCtx, cancelSecond := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancelSecond()

	startedAt := time.Now()
	err := limiter.Wait(secondCtx)
	elapsed := time.Since(startedAt)
	if err == nil {
		t.Fatal("second wait succeeded, want context timeout")
	}
	if elapsed > 150*time.Millisecond {
		t.Fatalf("second wait took %s, want it to observe context timeout without waiting behind first caller", elapsed)
	}

	cancelFirst()
	<-firstDone
}
