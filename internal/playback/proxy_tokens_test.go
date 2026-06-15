package playback

import (
	"testing"
	"time"
)

func TestProxyTokenStoreReusesUnexpiredTokenForSameTarget(t *testing.T) {
	store := newProxyTokenStore()
	now := time.Date(2026, 6, 16, 12, 0, 0, 0, time.UTC)

	first, err := store.create("https://cdn.example.test/seg.ts", "https://referer.example.test", "stream", time.Hour, now)
	if err != nil {
		t.Fatalf("create first token: %v", err)
	}
	second, err := store.create("https://cdn.example.test/seg.ts", "https://referer.example.test", "stream", time.Hour, now.Add(time.Minute))
	if err != nil {
		t.Fatalf("create second token: %v", err)
	}

	if first != second {
		t.Fatalf("tokens differ for same target: %q != %q", first, second)
	}
	if len(store.tokens) != 1 {
		t.Fatalf("token count = %d, want 1", len(store.tokens))
	}
}

func TestProxyTokenStoreCreatesNewTokenAfterExpiry(t *testing.T) {
	store := newProxyTokenStore()
	now := time.Date(2026, 6, 16, 12, 0, 0, 0, time.UTC)

	first, err := store.create("https://cdn.example.test/seg.ts", "https://referer.example.test", "stream", time.Hour, now)
	if err != nil {
		t.Fatalf("create first token: %v", err)
	}
	second, err := store.create("https://cdn.example.test/seg.ts", "https://referer.example.test", "stream", time.Hour, now.Add(time.Hour))
	if err != nil {
		t.Fatalf("create second token: %v", err)
	}

	if first == second {
		t.Fatalf("token was reused after expiry: %q", first)
	}
	if len(store.tokens) != 1 {
		t.Fatalf("token count = %d, want 1", len(store.tokens))
	}
}

func TestProxyTokenStoreCleansReverseIndexOnResolveExpiry(t *testing.T) {
	store := newProxyTokenStore()
	now := time.Date(2026, 6, 16, 12, 0, 0, 0, time.UTC)

	token, err := store.create("https://cdn.example.test/seg.ts", "https://referer.example.test", "stream", time.Hour, now)
	if err != nil {
		t.Fatalf("create token: %v", err)
	}
	if _, err := store.resolve(token, now.Add(time.Hour)); err == nil {
		t.Fatal("resolve expired token unexpectedly succeeded")
	}

	if len(store.tokens) != 0 {
		t.Fatalf("token count = %d, want 0", len(store.tokens))
	}
	if len(store.byTarget) != 0 {
		t.Fatalf("target index count = %d, want 0", len(store.byTarget))
	}
}
