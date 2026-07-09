package anilist

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGetAnimeBatchByMALIDUsesOneGraphQLRequest(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"m0":{"id":20,"idMal":20,"title":{"romaji":"NARUTO","english":"Naruto"},"type":"ANIME","format":"TV","startDate":{"year":2002},"coverImage":{"extraLarge":"cover"}}}}`))
	}))
	defer server.Close()

	items, err := NewClientWithHTTPClient(server.URL, server.Client()).GetAnimeBatchByMALID(context.Background(), []int{20, 20, 0})
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

	items, err := NewClientWithHTTPClient(server.URL, server.Client()).GetAnimeBatchByMALID(context.Background(), []int{20, 999999})
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].MALID != 20 {
		t.Fatalf("items = %#v", items)
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

	result, err := NewClientWithHTTPClient(server.URL, server.Client()).SearchAdvanced(context.Background(), "Naruto", "", "", "popularity", "desc", nil, 0, true, 1, 20)
	if err != nil {
		t.Fatal(err)
	}
	if !result.HasNextPage || len(result.Items) != 1 || result.Items[0].MALID != 20 {
		t.Fatalf("result = %#v", result)
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

	_, err := NewClientWithHTTPClient(server.URL, server.Client()).Search(context.Background(), "Naruto", 1, 20)
	apiErr, ok := err.(*APIError)
	if !ok || apiErr.Status != 429 || apiErr.RetryAfter != "42" {
		t.Fatalf("err = %#v", err)
	}
}
