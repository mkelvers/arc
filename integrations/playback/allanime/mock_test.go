package allanime

import (
	"io"
	"net/http"
	"strings"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func mockStringResponse(status int, body string) *http.Response {
	hdr := make(http.Header)
	hdr.Set("Content-Type", "application/json")
	return &http.Response{
		StatusCode: status,
		Header:     hdr,
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}
