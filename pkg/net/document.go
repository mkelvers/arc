package netutil

import (
	"context"
	"fmt"
	"io"
	"mal/pkg/errlog"
	"net/http"

	"github.com/PuerkitoBio/goquery"
)

func responseURL(response *http.Response, fallbackRequest *http.Request) string {
	if response != nil && response.Request != nil && response.Request.URL != nil {
		return response.Request.URL.String()
	}
	if fallbackRequest != nil && fallbackRequest.URL != nil {
		return fallbackRequest.URL.String()
	}
	return ""
}

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
	defer func() {
		errlog.Log("failed to close html response body", response.Body.Close())
	}()

	if response.StatusCode != http.StatusOK {
		body, readErr := io.ReadAll(io.LimitReader(response.Body, Bytes512))
		if readErr != nil {
			return nil, responseURL(response, request), fmt.Errorf("failed to read error response body: %w", readErr)
		}
		return nil, responseURL(response, request), buildStatusError(response, body)
	}

	document, err := goquery.NewDocumentFromReader(response.Body)
	if err != nil {
		return nil, responseURL(response, request), fmt.Errorf("failed to parse html: %w", err)
	}

	return document, responseURL(response, request), nil
}
