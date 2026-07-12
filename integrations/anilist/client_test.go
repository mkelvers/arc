package anilist

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"mal/integrations/metadata"
)

func TestSearchAdvancedRetriesTransientServerError(t *testing.T) {
	t.Parallel()

	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if requests.Add(1) == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = fmt.Fprint(w, `{"errors":[{"message":"Internal Server Error","status":500}]}`)
			return
		}
		_, _ = fmt.Fprint(w, `{"data":{"Page":{"pageInfo":{"hasNextPage":false},"media":[{"id":1,"idMal":1,"title":{"romaji":"Test"},"coverImage":{}}]}}}`)
	}))
	defer server.Close()

	client := NewClient(server.URL)
	result, err := client.SearchAdvanced(context.Background(), metadata.SearchOptions{SFW: true})
	if err != nil {
		t.Fatalf("SearchAdvanced() error = %v", err)
	}
	if requests.Load() != 2 {
		t.Fatalf("requests = %d, want 2", requests.Load())
	}
	if len(result.Items) != 1 || result.Items[0].ID != 1 {
		t.Fatalf("items = %#v, want one result with ID 1", result.Items)
	}
}
