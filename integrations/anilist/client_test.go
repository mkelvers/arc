package anilist

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGetMALIDsByAniListID(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"m0":{"id":207674,"idMal":63468},"m1":{"id":999999,"idMal":null}}}`))
	}))
	defer server.Close()

	client := &Client{baseURL: server.URL, httpClient: server.Client()}
	resolved, err := client.GetMALIDsByAniListID(context.Background(), []int{207674, 999999, 207674, 0})
	if err != nil {
		t.Fatalf("resolve MAL IDs: %v", err)
	}
	if resolved[207674] != 63468 {
		t.Fatalf("resolved MAL ID = %d, want 63468", resolved[207674])
	}
	if _, ok := resolved[999999]; ok {
		t.Fatal("anime without a MAL ID should be omitted")
	}
}

func TestGetMALIDsByAniListIDChunksRequests(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests++
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{}}`))
	}))
	defer server.Close()

	ids := make([]int, 51)
	for index := range ids {
		ids[index] = index + 1
	}
	client := &Client{baseURL: server.URL, httpClient: server.Client()}
	if _, err := client.GetMALIDsByAniListID(context.Background(), ids); err != nil {
		t.Fatalf("resolve chunked MAL IDs: %v", err)
	}
	if requests != 2 {
		t.Fatalf("requests = %d, want 2", requests)
	}
}
