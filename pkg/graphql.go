// Package graphql provides a GraphQL client for the AniList API.
package graphql

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type Error struct {
	Message string `json:"message"`
}

type Response[T any] struct {
	Data   T       `json:"data"`
	Errors []Error `json:"errors"`
}

type PostOptions struct {
	Headers map[string]string
	BodyMax int64
}

func Post[T any](ctx context.Context, httpClient *http.Client, url string, query string, variables any, opts PostOptions) (T, error) {
	var zero T

	payload := map[string]any{
		"query":     query,
		"variables": variables,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return zero, fmt.Errorf("graphql: marshal payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return zero, fmt.Errorf("graphql: create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	for k, v := range opts.Headers {
		req.Header.Set(k, v)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return zero, fmt.Errorf("graphql: execute request: %w", err)
	}
	defer func() {
		Log("failed to close graphql response body", resp.Body.Close())
	}()

	bodyMax := opts.BodyMax
	if bodyMax <= 0 {
		bodyMax = 2 << 20
	}

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, bodyMax))
	if err != nil {
		return zero, fmt.Errorf("graphql: read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return zero, fmt.Errorf("graphql: status %d", resp.StatusCode)
	}

	var parsed Response[T]
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return zero, fmt.Errorf("graphql: decode response: %w", err)
	}

	if len(parsed.Errors) > 0 {
		return zero, fmt.Errorf("graphql: %s", parsed.Errors[0].Message)
	}

	return parsed.Data, nil
}
