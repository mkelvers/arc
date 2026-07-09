package allanime

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDirectSequelsReturnsOnlyPlayableSequels(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"show":{"relatedShows":[
			{"relation":"sequel","showId":"season-2"},
			{"relation":"side story","showId":"ova"}
		]}}}`))
	}))
	defer server.Close()

	provider := NewAllAnimeProvider()
	provider.httpClient = server.Client()
	provider.baseURL = server.URL
	providerShow := ProviderShow{ID: "season-1"}

	got, err := provider.DirectSequels(context.Background(), providerShow)
	if err != nil {
		t.Fatalf("DirectSequels: %v", err)
	}
	if len(got) != 1 || got[0] != "season-2" {
		t.Fatalf("DirectSequels = %v, want [season-2]", got)
	}
}

func TestGetProviderShowKeepsOnlyPositiveIntegerEpisodes(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"show":{"_id":"season-2","name":"Example Season 2","englishName":"Example Season 2","description":"A useful<br><i>synopsis</i> &amp; summary.","malId":"42","status":"Finished","episodeCount":"2","availableEpisodesDetail":{"sub":["2","1","0","1.5"],"dub":["1"],"raw":[]}}}}`))
	}))
	defer server.Close()

	provider := NewAllAnimeProvider()
	provider.httpClient = server.Client()
	provider.baseURL = server.URL

	got, err := provider.GetProviderShow(context.Background(), "season-2")
	if err != nil {
		t.Fatalf("GetProviderShow: %v", err)
	}
	if got.MalID != 42 || len(got.SubEpisodes) != 2 || len(got.DubEpisodes) != 1 {
		t.Fatalf("GetProviderShow = %+v", got)
	}
	if got.Description != "A useful synopsis & summary." {
		t.Fatalf("Description = %q", got.Description)
	}
}

func TestSeasonalShowsReturnsPlayableTVAnime(t *testing.T) {
	server := httptest.NewServer(seasonalShowsTestHandler(t))
	defer server.Close()

	provider := NewAllAnimeProvider()
	provider.httpClient = server.Client()
	provider.baseURL = server.URL

	got, err := provider.SeasonalShows(context.Background(), "summer", 2026)
	if err != nil {
		t.Fatalf("SeasonalShows: %v", err)
	}
	if len(got) != 1 || got[0].MalID != 10 || got[0].Year != 2026 {
		t.Fatalf("SeasonalShows = %+v", got)
	}
}

type seasonalShowsTestRequest struct {
	Query     string `json:"query"`
	Variables struct {
		Page   int            `json:"page"`
		Search map[string]any `json:"search"`
	} `json:"variables"`
}

func seasonalShowsTestHandler(t *testing.T) http.HandlerFunc {
	t.Helper()
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		request := decodeSeasonalShowsTestRequest(t, r)
		edges := seasonalShowsTestEdges(request.Variables.Page)
		_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"shows": map[string]any{"edges": edges}}})
	}
}

func decodeSeasonalShowsTestRequest(t *testing.T, r *http.Request) seasonalShowsTestRequest {
	t.Helper()
	var request seasonalShowsTestRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		t.Fatalf("decode request: %v", err)
	}
	if strings.Contains(request.Query, "season {") || strings.Contains(request.Query, "availableEpisodesDetail {") {
		t.Fatalf("seasonal request must select provider Object fields without nested selections: %s", request.Query)
	}
	if _, ok := request.Variables.Search["year"]; ok {
		t.Fatal("seasonal request must filter normalized years locally")
	}
	return request
}

func seasonalShowsTestEdges(page int) []map[string]any {
	edges := make([]map[string]any, 0)
	switch page {
	case 1:
		for range 40 {
			edges = append(edges, map[string]any{"_id": "empty", "malId": "12", "type": "TV", "availableEpisodesDetail": map[string]any{"sub": []string{}, "dub": []string{}}})
		}
	case 2:
		edges = append(edges,
			map[string]any{"_id": "tv", "name": "Summer Show", "malId": "10", "type": "TV", "season": map[string]any{"quarter": "Summer", "year": "2026"}, "availableEpisodesDetail": map[string]any{"sub": []string{"1"}, "dub": []string{}}},
			map[string]any{"_id": "old", "name": "Old Summer Show", "malId": "11", "type": "TV", "season": map[string]any{"quarter": "Summer", "year": 2025}, "availableEpisodesDetail": map[string]any{"sub": []string{"1"}, "dub": []string{}}},
		)
	}
	return edges
}
