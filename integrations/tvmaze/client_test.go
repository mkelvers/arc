package tvmaze

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"mal/integrations/metadata"
	"mal/internal/domain"
)

func TestResolveEpisodeProviderIDRequiresExactAnimatedTitle(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/search/shows" {
			t.Fatalf("path = %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[
			{"show":{"id":1,"name":"May I Ask for One Final Thing Extra","type":"Animation"}},
			{"show":{"id":80712,"name":"May I Ask for One Final Thing?","type":"Animation"}},
			{"show":{"id":99,"name":"May I Ask for One Final Thing?","type":"Scripted"}}
		]`))
	}))
	defer server.Close()

	client := newTestClient(server)
	id, err := client.ResolveEpisodeProviderID(context.Background(), 59846, []string{"May I Ask for One Final Thing?"})
	if err != nil {
		t.Fatal(err)
	}
	if id != "80712" {
		t.Fatalf("id = %q, want 80712", id)
	}
}

func TestGetEpisodeTitlesUsesAiringOrder(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/shows/80712/episodes" {
			t.Fatalf("path = %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[
			{"season":1,"number":1,"name":"Wrong season"},
			{"season":2,"number":1,"name":" First title "},
			{"season":2,"number":2,"name":"Second title"},
			{"season":2,"number":3,"name":"Future title"},
			{"season":3,"number":1,"name":"Another wrong season"}
		]`))
	}))
	defer server.Close()

	client := newTestClient(server)
	titles, err := client.GetEpisodeTitlesByProviderID(context.Background(), "80712", domain.Anime{Anime: metadata.Anime{
		Title: "Example 2nd Season",
	}}, 2)
	if err != nil {
		t.Fatal(err)
	}
	want := map[int]string{1: "First title", 2: "Second title"}
	if !reflect.DeepEqual(titles, want) {
		t.Fatalf("titles = %#v, want %#v", titles, want)
	}
}

func TestGetEpisodeTitlesSelectsSplitCourWithinSeason(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[
			{"season":2,"number":1,"name":"Cour one A"},
			{"season":2,"number":2,"name":"Cour one B"},
			{"season":2,"number":3,"name":"Cour two A"},
			{"season":2,"number":4,"name":"Cour two B"}
		]`))
	}))
	defer server.Close()

	client := newTestClient(server)
	titles, err := client.GetEpisodeTitlesByProviderID(context.Background(), "14459", domain.Anime{Anime: metadata.Anime{
		Title: "Re:Zero kara Hajimeru Isekai Seikatsu 2nd Season Part 2",
	}}, 2)
	if err != nil {
		t.Fatal(err)
	}
	want := map[int]string{1: "Cour two A", 2: "Cour two B"}
	if !reflect.DeepEqual(titles, want) {
		t.Fatalf("titles = %#v, want %#v", titles, want)
	}
}

func TestTitleSearchCandidatesUseParentShowName(t *testing.T) {
	got := titleSearchCandidates([]string{
		"Re:Zero kara Hajimeru Isekai Seikatsu 2nd Season Part 2",
	}, 6)
	want := []string{
		"Re:Zero kara Hajimeru Isekai Seikatsu",
		"Re:Zero kara Hajimeru Isekai Seikatsu 2nd Season Part 2",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("candidates = %#v, want %#v", got, want)
	}
}

func newTestClient(server *httptest.Server) *Client {
	return &Client{httpClient: server.Client(), baseURL: server.URL}
}
