package handler

import (
	"testing"
	"time"
)

func TestSubtitleCache_TTLExpiry(t *testing.T) {
	c := newSubtitleCache(50*time.Millisecond, 10)
	now := time.Unix(100, 0)

	c.Set("k", []byte("v"), "text/plain", now)

	if _, _, ok := c.Get("k", now.Add(49*time.Millisecond)); !ok {
		t.Fatalf("expected cache hit before expiry")
	}
	if _, _, ok := c.Get("k", now.Add(51*time.Millisecond)); ok {
		t.Fatalf("expected cache miss after expiry")
	}
}

func TestSubtitleCache_LRUEviction(t *testing.T) {
	c := newSubtitleCache(time.Minute, 2)
	now := time.Unix(200, 0)

	c.Set("a", []byte("a"), "text/plain", now)
	c.Set("b", []byte("b"), "text/plain", now)

	// Make "a" most recently used; "b" should be evicted next.
	if _, _, ok := c.Get("a", now); !ok {
		t.Fatalf("expected hit for a")
	}

	c.Set("c", []byte("c"), "text/plain", now)

	if _, _, ok := c.Get("b", now); ok {
		t.Fatalf("expected b to be evicted")
	}
	if _, _, ok := c.Get("a", now); !ok {
		t.Fatalf("expected a to remain")
	}
	if _, _, ok := c.Get("c", now); !ok {
		t.Fatalf("expected c to exist")
	}
}

