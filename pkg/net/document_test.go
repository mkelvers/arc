package netutil

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}

func TestFetchHTMLDocumentFallsBackToOriginalURLWhenResponseRequestMissing(t *testing.T) {
	client := &http.Client{
		Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     make(http.Header),
				Body:       io.NopCloser(strings.NewReader("<!doctype html><html><body><main>ok</main></body></html>")),
			}, nil
		}),
	}

	url := "https://example.test/watch-order"
	document, finalURL, err := FetchHTMLDocument(context.Background(), client, url, nil, nil)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if finalURL != url {
		t.Fatalf("expected final url %q, got %q", url, finalURL)
	}

	if got := strings.TrimSpace(document.Find("main").Text()); got != "ok" {
		t.Fatalf("expected document text ok, got %q", got)
	}
}
