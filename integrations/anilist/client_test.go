package anilist

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newTestClient(baseURL string, httpClient *http.Client) *Client {
	client := NewClient(baseURL)
	client.httpClient = httpClient
	return client
}

func TestGetAnimeBatchByMALIDUsesOneGraphQLRequest(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"m0":{"id":20,"idMal":20,"title":{"romaji":"NARUTO","english":"Naruto"},"type":"ANIME","format":"TV","startDate":{"year":2002},"coverImage":{"extraLarge":"cover"}}}}`))
	}))
	defer server.Close()

	items, err := newTestClient(server.URL, server.Client()).GetAnimeBatchByMALID(context.Background(), []int{20, 20, 0})
	if err != nil {
		t.Fatal(err)
	}
	if requests != 1 {
		t.Fatalf("requests = %d, want 1", requests)
	}
	if len(items) != 1 || items[0].MALID != 20 || items[0].Title.English != "Naruto" {
		t.Fatalf("items = %#v", items)
	}
}

func TestGetAnimeBatchByMALIDKeepsValidItemsWhenSomeIDsAreMissing(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"errors":[{"message":"Not Found.","status":404}],"data":{"m0":{"id":20,"idMal":20,"title":{"romaji":"NARUTO","english":"Naruto"},"type":"ANIME","format":"TV","startDate":{"year":2002},"coverImage":{"extraLarge":"cover"}},"m1":null}}`))
	}))
	defer server.Close()

	items, err := newTestClient(server.URL, server.Client()).GetAnimeBatchByMALID(context.Background(), []int{20, 999999})
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].MALID != 20 {
		t.Fatalf("items = %#v", items)
	}
}

func TestGetAnimeBatchByMALIDRetriesNotFoundBatchesIndividually(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		w.Header().Set("Content-Type", "application/json")
		if requests == 1 {
			_, _ = w.Write([]byte(`{"errors":[{"message":"Not Found.","status":404}],"data":{"m0":null,"m1":null}}`))
			return
		}
		body, _ := io.ReadAll(r.Body)
		if strings.Contains(string(body), `"idMal":20`) {
			_, _ = w.Write([]byte(`{"data":{"Media":{"id":20,"idMal":20,"title":{"romaji":"NARUTO","english":"Naruto"},"type":"ANIME","format":"TV","startDate":{"year":2002},"coverImage":{"extraLarge":"cover"}}}}`))
			return
		}
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"errors":[{"message":"Not Found.","status":404}]}`))
	}))
	defer server.Close()

	items, err := newTestClient(server.URL, server.Client()).GetAnimeBatchByMALID(context.Background(), []int{20, 999999})
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].MALID != 20 {
		t.Fatalf("items = %#v", items)
	}
	if requests != 3 {
		t.Fatalf("requests = %d, want 3", requests)
	}
}

func TestSearchAdvancedOmitsUnsetFilters(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatal(err)
		}
		query := string(body)
		if strings.Contains(query, `"format":null`) || strings.Contains(query, `"status":null`) {
			t.Fatalf("request contains null filters: %s", query)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"Page":{"pageInfo":{"hasNextPage":true},"media":[{"id":20,"idMal":20,"title":{"romaji":"NARUTO","english":"Naruto"},"type":"ANIME","format":"TV","startDate":{"year":2002},"coverImage":{"extraLarge":"cover"}}]}}}`))
	}))
	defer server.Close()

	result, err := newTestClient(server.URL, server.Client()).SearchAdvanced(context.Background(), "Naruto", "", "", "popularity", "desc", nil, 0, true, 1, 20)
	if err != nil {
		t.Fatal(err)
	}
	if !result.HasNextPage || len(result.Items) != 1 || result.Items[0].MALID != 20 {
		t.Fatalf("result = %#v", result)
	}
}

func TestMediaSortUsesAniListTitleEnum(t *testing.T) {
	for _, test := range []struct {
		direction string
		want      string
	}{
		{direction: "asc", want: "TITLE_ROMAJI_ASC"},
		{direction: "desc", want: "TITLE_ROMAJI_DESC"},
	} {
		if got := mediaSort("title", test.direction); got != test.want {
			t.Errorf("mediaSort(title, %q) = %q, want %q", test.direction, got, test.want)
		}
	}
}

func TestGetPopularIncludesSynopsis(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(body), "description(asHtml: false)") {
			t.Fatalf("popular query does not request description: %s", body)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"Page":{"pageInfo":{"hasNextPage":false},"media":[{"id":20,"idMal":20,"title":{"romaji":"NARUTO","english":"Naruto"},"description":"A ninja story.","type":"ANIME","format":"TV","startDate":{"year":2002},"coverImage":{"extraLarge":"cover"}}]}}}`))
	}))
	defer server.Close()

	result, err := newTestClient(server.URL, server.Client()).GetPopular(context.Background(), 1, 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Items) != 1 || result.Items[0].Description != "A ninja story." {
		t.Fatalf("result = %#v", result)
	}
}

func TestGetAnimeByMALIDRequestsSidebarFields(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sidebarTestResponse(t, &requests, w, r)
	}))
	defer server.Close()

	anime, err := newTestClient(server.URL, server.Client()).GetAnimeByMALID(context.Background(), 20)
	if err != nil {
		t.Fatal(err)
	}
	if requests != 2 || len(anime.Producers) != 1 || anime.Producers[0].Name != "Producer One" || len(anime.Studios) != 1 || anime.Studios[0].Name != "Studio KAI" || anime.Rank != 3 || anime.RankLabel != "Highest Rated All Time" {
		t.Fatalf("mapped sidebar fields = %+v", anime)
	}
}

func sidebarTestResponse(t *testing.T, requests *int, w http.ResponseWriter, r *http.Request) {
	t.Helper()
	*requests++
	body, err := io.ReadAll(r.Body)
	if err != nil {
		t.Fatal(err)
	}
	query := string(body)
	w.Header().Set("Content-Type", "application/json")
	if strings.Contains(query, "studios(isMain: false)") {
		_, _ = w.Write([]byte(`{"data":{"Media":{"studios":{"nodes":[{"name":"Producer One"}]}}}}`))
		return
	}
	for _, field := range []string{"tags { id name rank isGeneralSpoiler isMediaSpoiler }", "staff(perPage: 50)", "meanScore", "popularity", "favourites", "rankings"} {
		if !strings.Contains(query, field) {
			t.Fatalf("sidebar query does not request %q: %s", field, query)
		}
	}
	_, _ = w.Write([]byte(`{"data":{"Media":{"id":1,"idMal":20,"meanScore":86,"popularity":1234,"favourites":56,"rankings":[{"rank":3,"context":"highest rated all time"}],"studios":{"nodes":[{"id":4,"name":"Studio KAI"}]},"staff":{"edges":[{"role":"Animation Producer","node":{"id":5,"name":{"full":"Wrong Person"}}}]},"tags":[{"id":9,"name":"Tag","rank":80,"isGeneralSpoiler":false,"isMediaSpoiler":false}]}}}`))
}

func TestGetGenresReadsAniListCollection(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"GenreCollection":["Action","Drama"]}}`))
	}))
	defer server.Close()

	genres, err := newTestClient(server.URL, server.Client()).GetGenres(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(genres) != 2 || genres[0] != "Action" || genres[1] != "Drama" {
		t.Fatalf("genres = %#v", genres)
	}
}

func TestQueryReturnsRateLimitDetails(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-RateLimit-Remaining", "0")
		w.Header().Set("Retry-After", "42")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"errors":[{"message":"Too Many Requests.","status":429}]}`))
	}))
	defer server.Close()

	_, err := newTestClient(server.URL, server.Client()).Search(context.Background(), "Naruto", 1, 20)
	apiErr, ok := err.(*APIError)
	if !ok || apiErr.Status != 429 || apiErr.RetryAfter != "42" {
		t.Fatalf("err = %#v", err)
	}
}
