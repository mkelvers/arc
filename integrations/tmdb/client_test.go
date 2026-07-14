package tmdb

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGetMediaLoadsDetailsAndArtwork(t *testing.T) {
	t.Parallel()
	requests := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/tv/136840", func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Fatalf("unexpected authorization header %q", r.Header.Get("Authorization"))
		}
		writeJSON(t, w, `{"id":136840,"name":"The Apothecary Diaries","original_name":"薬屋のひとりごと","overview":"Mysteries at the palace.","backdrop_path":"/hero.jpg","poster_path":"/poster.jpg","seasons":[{"id":1,"name":"Specials","season_number":0},{"id":2,"name":"Season 1","season_number":1,"episode_count":24}]}`)
	})
	mux.HandleFunc("/tv/136840/images", func(w http.ResponseWriter, r *http.Request) {
		requests++
		if got := r.URL.Query().Get("include_image_language"); got != "en,ja,null" {
			t.Fatalf("unexpected image languages %q", got)
		}
		writeJSON(t, w, `{"id":136840,"backdrops":[{"file_path":"/backdrop.jpg","width":1920,"height":1080}],"logos":[{"file_path":"/logo.png","iso_639_1":"en"}]}`)
	})
	client, server := testClient(t, mux)
	defer server.Close()

	media, err := client.GetMedia(context.Background(), MediaRef{Type: MediaTypeTV, ID: 136840}, ImageOptions{IncludeImageLanguages: []string{"en", "ja", "null"}})
	if err != nil {
		t.Fatal(err)
	}
	if requests != 2 || media.Name != "The Apothecary Diaries" || len(media.Seasons) != 2 || len(media.Backdrops) != 1 || len(media.Logos) != 1 {
		t.Fatalf("unexpected media response: requests=%d media=%+v", requests, media)
	}
}

func TestEpisodeGroupMethods(t *testing.T) {
	t.Parallel()
	mux := http.NewServeMux()
	mux.HandleFunc("/tv/136840/episode_groups", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, `{"id":136840,"results":[{"id":"seasons","name":"Seasons","episode_count":48,"group_count":3,"type":1}]}`)
	})
	mux.HandleFunc("/tv/episode_group/seasons", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, `{"id":"seasons","name":"Seasons","group_count":2,"groups":[{"id":"specials","name":"Specials","order":0,"episodes":[]},{"id":"season-1","name":"Season 1","order":1,"episodes":[{"id":10,"name":"Maomao","overview":"An apothecary arrives.","still_path":"/episode.jpg","episode_number":1,"season_number":1,"order":0}]}]}`)
	})
	client, server := testClient(t, mux)
	defer server.Close()

	groups, err := client.GetEpisodeGroups(context.Background(), 136840)
	if err != nil || len(groups.Results) != 1 || groups.Results[0].Name != "Seasons" {
		t.Fatalf("unexpected episode groups: groups=%+v err=%v", groups, err)
	}
	group, err := client.GetEpisodeGroup(context.Background(), groups.Results[0].ID)
	if err != nil || len(group.Groups) != 2 || len(group.Groups[1].Episodes) != 1 {
		t.Fatalf("unexpected episode group: group=%+v err=%v", group, err)
	}
}

func TestGetSeason(t *testing.T) {
	t.Parallel()
	mux := http.NewServeMux()
	mux.HandleFunc("/tv/136840/season/1", func(w http.ResponseWriter, r *http.Request) {
		if got := r.URL.Query().Get("language"); got != "en-US" {
			t.Fatalf("unexpected language %q", got)
		}
		writeJSON(t, w, `{"id":2,"name":"Season 1","season_number":1,"overview":"The first season.","episodes":[{"id":10,"name":"Maomao","overview":"An apothecary arrives.","still_path":"/episode.jpg","episode_number":1,"season_number":1}]}`)
	})
	client, server := testClient(t, mux)
	defer server.Close()

	season, err := client.GetSeason(context.Background(), 136840, 1, "en-US")
	if err != nil || len(season.Episodes) != 1 || season.Episodes[0].StillPath != "/episode.jpg" {
		t.Fatalf("unexpected season: season=%+v err=%v", season, err)
	}
}

func TestAPIErrorAndMissingToken(t *testing.T) {
	t.Parallel()
	client, server := testClient(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		writeJSON(t, w, `{"success":false,"status_code":34,"status_message":"The resource you requested could not be found."}`)
	}))
	defer server.Close()

	_, err := client.GetEpisodeGroups(context.Background(), 999)
	var apiError *APIError
	if !errors.As(err, &apiError) || apiError.StatusCode != http.StatusNotFound || apiError.Code != 34 || apiError.StatusMessage == "" {
		t.Fatalf("expected TMDB API error, got %v", err)
	}
	_, err = NewClient(Config{}).GetEpisodeGroups(context.Background(), 999)
	if err == nil {
		t.Fatal("expected missing token error")
	}
}

func TestImageURL(t *testing.T) {
	t.Parallel()
	if got := ImageURL("/still.jpg", "w780"); got != "https://image.tmdb.org/t/p/w780/still.jpg" {
		t.Fatalf("unexpected image URL %q", got)
	}
	if got := ImageURL("", "original"); got != "" {
		t.Fatalf("expected empty URL, got %q", got)
	}
}

func testClient(t *testing.T, handler http.Handler) (*Client, *httptest.Server) {
	t.Helper()
	server := httptest.NewServer(handler)
	client := NewClient(Config{AccessToken: "test-token"})
	client.baseURL = server.URL
	return client, server
}

func writeJSON(t *testing.T, w http.ResponseWriter, body string) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write([]byte(body)); err != nil {
		t.Fatal(err)
	}
}
