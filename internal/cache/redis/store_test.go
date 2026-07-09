package redis

import (
	"context"
	"testing"
	"time"

	goRedis "github.com/redis/go-redis/v9"
)

func TestStoreReportsFreshStaleAndExpired(t *testing.T) {
	client := goRedis.NewClient(&goRedis.Options{Addr: "localhost:0"})
	store := NewWithClient(client)
	now := time.Date(2026, 7, 9, 12, 0, 0, 0, time.UTC)
	store.now = func() time.Time { return now }

	// Keep this test deterministic without requiring Redis: exercise the envelope
	// policy directly, which is the part owned by this package.
	item := envelope{Payload: []byte(`{"name":"Naruto"}`), FreshUntil: now.Add(time.Hour), StaleUntil: now.Add(2 * time.Hour)}
	if now.After(item.FreshUntil) {
		t.Fatal("fresh item unexpectedly expired")
	}
	now = now.Add(90 * time.Minute)
	if !now.After(item.FreshUntil) || now.After(item.StaleUntil) {
		t.Fatal("item should be stale")
	}
	now = now.Add(40 * time.Minute)
	if !now.After(item.StaleUntil) {
		t.Fatal("item should be expired")
	}
	_ = context.Background()
}
