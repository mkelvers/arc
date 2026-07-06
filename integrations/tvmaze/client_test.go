package tvmaze

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
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
			{"season":1,"number":1,"name":" First title "},
			{"season":2,"number":1,"name":"Second title"},
			{"season":2,"number":2,"name":null}
		]`))
	}))
	defer server.Close()

	client := newTestClient(server)
	titles, err := client.GetEpisodeTitlesByProviderID(context.Background(), "80712")
	if err != nil {
		t.Fatal(err)
	}
	want := map[int]string{1: "First title", 2: "Second title"}
	if !reflect.DeepEqual(titles, want) {
		t.Fatalf("titles = %#v, want %#v", titles, want)
	}
}

func newTestClient(server *httptest.Server) *Client {
	return &Client{httpClient: server.Client(), baseURL: server.URL}
}
