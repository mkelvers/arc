package netutil

import (
	"context"
	"fmt"
	"io"
	"net/http"

	"github.com/PuerkitoBio/goquery"
)

func FetchHTMLDocument(
	ctx context.Context,
	httpClient *http.Client,
	url string,
	prepareRequest func(*http.Request),
	buildStatusError func(*http.Response, []byte) error,
) (*goquery.Document, string, error) {
	client := httpClient
	if client == nil {
		client = http.DefaultClient
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, "", fmt.Errorf("failed to create request: %w", err)
	}
	if prepareRequest != nil {
		prepareRequest(request)
	}

	response, err := client.Do(request)
	if err != nil {
		return nil, "", fmt.Errorf("request failed: %w", err)
	}
	defer func() { _ = response.Body.Close() }()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(response.Body, Bytes512))
		return nil, response.Request.URL.String(), buildStatusError(response, body)
	}

	document, err := goquery.NewDocumentFromReader(response.Body)
	if err != nil {
		return nil, response.Request.URL.String(), fmt.Errorf("failed to parse html: %w", err)
	}

	return document, response.Request.URL.String(), nil
}
