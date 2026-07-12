package anilist

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"mal/integrations/metadata"
)

func TestLegacyProviderSearchAdvancedUsesFilteredSearchWithoutTextQuery(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Variables map[string]any `json:"variables"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatal(err)
		}
		if request.Variables["genres"] == nil {
			t.Fatal("expected genre filter in AniList request")
		}
		_, _ = fmt.Fprint(w, `{"data":{"Page":{"pageInfo":{"hasNextPage":false},"media":[{"id":1,"idMal":1,"title":{"romaji":"Test"},"description":"Synopsis","format":"TV","startDate":{"year":2026},"coverImage":{"extraLarge":"https://example.com/test.jpg"}}]}}}`)
	}))
	defer server.Close()

	provider := NewLegacyProvider(&CachedClient{client: NewClient(server.URL)})
	result, err := provider.SearchAdvanced(context.Background(), metadata.SearchOptions{Genres: []int{metadata.GenreID("Action")}, SFW: true, Limit: 24})
	if err != nil {
		t.Fatalf("SearchAdvanced() error = %v", err)
	}
	if len(result.Animes) != 1 {
		t.Fatalf("results = %d, want 1", len(result.Animes))
	}
	if got := result.Animes[0]; got.Title != "Test" || got.Synopsis != "Synopsis" {
		t.Fatalf("anime = %#v, want mapped summary fields", got)
	}
}
