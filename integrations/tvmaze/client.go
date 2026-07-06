package tvmaze

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"

	"mal/internal/domain"
)

var (
	seasonNumberPattern = regexp.MustCompile(`(?i)(?:\bseason\s+(\d+)|\b(\d+)(?:st|nd|rd|th)\s+season)\b`)
	seasonSuffixPattern = regexp.MustCompile(`(?i)\s+(?:(?:season\s+\d+)|(?:\d+(?:st|nd|rd|th)\s+season))(?:\s+part\s+\d+)?\s*$`)
	partNumberPattern   = regexp.MustCompile(`(?i)\bpart\s+(\d+)\b`)
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
	for _, candidate := range titleSearchCandidates(titleCandidates, 6) {
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

func (c *Client) GetEpisodeTitlesByProviderID(ctx context.Context, providerID string, anime domain.Anime, episodeCount int) (map[int]string, error) {
	var episodes []episode
	if err := c.getJSON(ctx, "/shows/"+url.PathEscape(providerID)+"/episodes", &episodes); err != nil {
		return nil, err
	}
	episodes, err := episodesForAnimeSeason(episodes, anime, episodeCount)
	if err != nil {
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

func titleSearchCandidates(candidates []string, limit int) []string {
	expanded := make([]string, 0, len(candidates)*2)
	for _, candidate := range candidates {
		parent := strings.TrimSpace(seasonSuffixPattern.ReplaceAllString(candidate, ""))
		if parent != "" && parent != strings.TrimSpace(candidate) {
			expanded = append(expanded, parent)
		}
		expanded = append(expanded, candidate)
	}
	return uniqueTitleCandidates(expanded, limit)
}

func episodesForAnimeSeason(episodes []episode, anime domain.Anime, episodeCount int) ([]episode, error) {
	seasons := groupEpisodesBySeason(episodes)
	season := animeSeasonNumber(anime)
	if season == 0 {
		season = seasonForYear(seasons, anime.Year)
	}
	if season == 0 {
		season = 1
	}

	selected := seasons[season]
	if len(selected) == 0 {
		return nil, fmt.Errorf("tvmaze: season %d has no episodes", season)
	}
	if episodeCount <= 0 || episodeCount >= len(selected) {
		return selected, nil
	}
	if animePartNumber(anime) > 1 {
		return selected[len(selected)-episodeCount:], nil
	}
	return selected[:episodeCount], nil
}

func groupEpisodesBySeason(episodes []episode) map[int][]episode {
	seasons := map[int][]episode{}
	for _, item := range episodes {
		if item.Season > 0 {
			seasons[item.Season] = append(seasons[item.Season], item)
		}
	}
	return seasons
}

func animeSeasonNumber(anime domain.Anime) int {
	return titleNumber(animeTitles(anime), seasonNumberPattern)
}

func animePartNumber(anime domain.Anime) int {
	return titleNumber(animeTitles(anime), partNumberPattern)
}

func titleNumber(titles []string, pattern *regexp.Regexp) int {
	for _, title := range titles {
		match := pattern.FindStringSubmatch(title)
		if len(match) <= 1 {
			continue
		}
		for _, value := range match[1:] {
			number, err := strconv.Atoi(value)
			if err == nil && number > 0 {
				return number
			}
		}
	}
	return 0
}

func animeTitles(anime domain.Anime) []string {
	titles := make([]string, 0, 3+len(anime.TitleSynonyms))
	titles = append(titles, anime.Title, anime.TitleEnglish, anime.TitleJapanese)
	titles = append(titles, anime.TitleSynonyms...)
	return titles
}

func seasonForYear(seasons map[int][]episode, year int) int {
	if year <= 0 {
		return 0
	}
	matchedSeason := 0
	for season, episodes := range seasons {
		if len(episodes) == 0 || !strings.HasPrefix(episodes[0].Airdate, strconv.Itoa(year)+"-") {
			continue
		}
		if matchedSeason != 0 {
			return 0
		}
		matchedSeason = season
	}
	return matchedSeason
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
