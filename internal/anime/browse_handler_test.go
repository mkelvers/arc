package anime

import (
	"net/url"
	"testing"
)

func TestCanonicalBrowseURLAddsSFWTrueWhenMissing(t *testing.T) {
	t.Parallel()

	rawURL, err := url.Parse("/browse?status=airing&order_by=popularity&sort=asc")
	if err != nil {
		t.Fatalf("url.Parse() error = %v", err)
	}

	got, ok := canonicalBrowseURL(rawURL)
	if !ok {
		t.Fatal("canonicalBrowseURL() should request redirect when sfw is missing")
	}

	want := "/browse?order_by=popularity&sfw=true&sort=asc&status=airing"
	if got != want {
		t.Fatalf("canonicalBrowseURL() = %q, want %q", got, want)
	}
}

func TestCanonicalBrowseURLSkipsWhenSFWAlreadyPresent(t *testing.T) {
	t.Parallel()

	rawURL, err := url.Parse("/browse?status=airing&sfw=false")
	if err != nil {
		t.Fatalf("url.Parse() error = %v", err)
	}

	got, ok := canonicalBrowseURL(rawURL)
	if ok {
		t.Fatalf("canonicalBrowseURL() unexpectedly requested redirect to %q", got)
	}
}
