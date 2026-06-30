package allanime

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mal/internal/domain"
	errlog "mal/pkg"
	netutil "mal/pkg/net"
	"net/http"
	"strings"
	"time"
)

const (
	allAnimeBaseURL  = "https://api.allanime.day"
	allAnimeSiteURL  = "https://allanime.day"
	allAnimeReferer  = "https://youtu-chan.com"
	allAnimeOrigin   = "https://youtu-chan.com"
	defaultUserAgent = netutil.Firefox121
)

type AllAnimeProvider struct {
	httpClient *http.Client
	utlsClient *http.Client
	extractor  *providerExtractor
	baseURL    string
}

func NewAllAnimeProvider() *AllAnimeProvider {
	return &AllAnimeProvider{
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		utlsClient: &http.Client{
			Transport: &netutil.UtlsRoundTripper{},
			Timeout:   30 * time.Second,
		},
		extractor: newProviderExtractor(),
		baseURL:   allAnimeBaseURL,
	}
}

func (c *AllAnimeProvider) Name() string {
	return "AllAnime"
}

func (c *AllAnimeProvider) apiBaseURL() string {
	if c.baseURL != "" {
		return c.baseURL
	}
	return allAnimeBaseURL
}

func (c *AllAnimeProvider) GetStreams(ctx context.Context, animeID int, titleCandidates []string, episode string, mode string) (*domain.StreamResult, error) {
	showID := c.showID(ctx, animeID, titleCandidates, mode)
	if showID == "" {
		return nil, fmt.Errorf("allanime: show not found for malID %d", animeID)
	}

	sources, err := c.GetEpisodeSources(ctx, showID, episode, mode)
	if err != nil || len(sources) == 0 {
		return nil, fmt.Errorf("allanime: no sources for show %s", showID)
	}

	primary := sources[0]

	result := &domain.StreamResult{
		URL:     primary.URL,
		Referer: primary.Referer,
		Type:    primary.Type,
	}

	for _, sub := range primary.Subtitles {
		result.Subtitles = append(result.Subtitles, domain.Subtitle{
			Label: sub.Lang,
			URL:   sub.URL,
		})
	}

	return result, nil
}

func (c *AllAnimeProvider) graphqlRequest(ctx context.Context, query string, variables map[string]any) (map[string]any, error) {
	if mode, ok := variables["translationType"].(string); ok {
		variables["translationType"] = strings.ToLower(mode)
	}

	payload := map[string]any{
		"query":     query,
		"variables": variables,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal graphql payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.apiBaseURL()+"/api", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create graphql request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Referer", allAnimeReferer)
	req.Header.Set("User-Agent", defaultUserAgent)

	statusCode, respBody, err := executeAndReadResponse(c.httpClient, req, "execute graphql request", "read graphql response")
	if err != nil {
		return nil, err
	}

	if statusCode != http.StatusOK {
		return nil, fmt.Errorf("graphql status %d", statusCode)
	}

	var parsed map[string]any
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, fmt.Errorf("decode graphql response: %w", err)
	}

	if errs, ok := parsed["errors"].([]any); ok && len(errs) > 0 {
		return nil, fmt.Errorf("graphql error: %v", errs[0])
	}

	return parsed, nil
}

func executeAndReadResponse(client *http.Client, req *http.Request, executeErrPrefix string, readErrPrefix string) (int, []byte, error) {
	resp, err := client.Do(req)
	if err != nil {
		return 0, nil, fmt.Errorf("%s: %w", executeErrPrefix, err)
	}
	defer func() {
		errlog.Log("failed to close allanime response body", resp.Body.Close())
	}()

	body, err := io.ReadAll(io.LimitReader(resp.Body, netutil.MiB2))
	if err != nil {
		return 0, nil, fmt.Errorf("%s: %w", readErrPrefix, err)
	}

	return resp.StatusCode, body, nil
}
