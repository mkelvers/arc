package tvmaze

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode"
)

const baseURL = "https://api.tvmaze.com"

type Client struct {
	httpClient *http.Client
	baseURL    string
}

type searchResult struct {
	Show show `json:"show"`
}

type show struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
}

type episode struct {
	Name    string `json:"name"`
	Season  int    `json:"season"`
	Airdate string `json:"airdate"`
}

func NewClient() *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 5 * time.Second},
		baseURL:    baseURL,
	}
}

func (c *Client) Name() string {
	return "TVmaze"
}

func (c *Client) ResolveEpisodeProviderID(ctx context.Context, _ int, titleCandidates []string) (string, error) {
	matches := map[int]struct{}{}
	for _, candidate := range uniqueTitleCandidates(titleCandidates, 4) {
		results, err := c.search(ctx, candidate)
		if err != nil {
			return "", err
		}
		addExactMatches(matches, results, normalizeTitle(candidate))
		if len(matches) == 1 {
			for id := range matches {
				return strconv.Itoa(id), nil
			}
		}
	}

	if len(matches) > 1 {
		return "", errors.New("tvmaze: multiple exact show matches")
	}
	return "", errors.New("tvmaze: no exact show match")
}

func uniqueTitleCandidates(candidates []string, limit int) []string {
	seen := map[string]struct{}{}
	unique := make([]string, 0, min(len(candidates), limit))
	for _, candidate := range candidates {
		normalized := normalizeTitle(candidate)
		if normalized == "" {
			continue
		}
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		unique = append(unique, candidate)
		if len(unique) == limit {
			break
		}
	}
	return unique
}

func addExactMatches(matches map[int]struct{}, results []searchResult, normalizedTitle string) {
	for _, result := range results {
		if result.Show.ID <= 0 || normalizeTitle(result.Show.Name) != normalizedTitle {
			continue
		}
		if result.Show.Type != "" && !strings.EqualFold(result.Show.Type, "Animation") {
			continue
		}
		matches[result.Show.ID] = struct{}{}
	}
}

func (c *Client) GetEpisodeTitlesByProviderID(ctx context.Context, providerID string) (map[int]string, error) {
	var episodes []episode
	if err := c.getJSON(ctx, "/shows/"+url.PathEscape(providerID)+"/episodes", &episodes); err != nil {
		return nil, err
	}

	titles := make(map[int]string, len(episodes))
	for i, item := range episodes {
		title := strings.TrimSpace(item.Name)
		if title != "" {
			titles[i+1] = title
		}
	}
	if len(titles) == 0 {
		return nil, errors.New("tvmaze: show has no episode titles")
	}
	return titles, nil
}

func (c *Client) search(ctx context.Context, title string) ([]searchResult, error) {
	var results []searchResult
	err := c.getJSON(ctx, "/search/shows?q="+url.QueryEscape(title), &results)
	return results, err
}

func (c *Client) getJSON(ctx context.Context, path string, target any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.apiURL()+path, nil)
	if err != nil {
		return fmt.Errorf("tvmaze: create request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "mal/1.0")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("tvmaze: request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("tvmaze: status %d", resp.StatusCode)
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 2<<20)).Decode(target); err != nil {
		return fmt.Errorf("tvmaze: decode response: %w", err)
	}
	return nil
}

func (c *Client) apiURL() string {
	if c.baseURL != "" {
		return c.baseURL
	}
	return baseURL
}

func normalizeTitle(value string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			return unicode.ToLower(r)
		}
		return -1
	}, strings.TrimSpace(value))
}
