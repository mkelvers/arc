package allanime

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		var request struct {
			Variables struct {
				Page int `json:"page"`
			} `json:"variables"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		edges := make([]map[string]any, 0)
		switch request.Variables.Page {
		case 1:
			for i := 0; i < 40; i++ {
				edges = append(edges, map[string]any{"_id": "empty", "malId": "12", "type": "TV", "availableEpisodesDetail": map[string]any{"sub": []string{}, "dub": []string{}}})
			}
		case 2:
			edges = append(edges, map[string]any{"_id": "tv", "name": "Summer Show", "malId": "10", "type": "TV", "season": map[string]any{"quarter": "Summer", "year": 2026}, "availableEpisodesDetail": map[string]any{"sub": []string{"1"}, "dub": []string{}}})
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"shows": map[string]any{"edges": edges}}})
	}))
	defer server.Close()

	provider := NewAllAnimeProvider()
	provider.httpClient = server.Client()
	provider.baseURL = server.URL

	got, err := provider.SeasonalShows(context.Background(), "summer", 2026)
	if err != nil {
		t.Fatalf("SeasonalShows: %v", err)
	}
	if len(got) != 1 || got[0].MalID != 10 {
		t.Fatalf("SeasonalShows = %+v", got)
	}
}
