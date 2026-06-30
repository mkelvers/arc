package allanime

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	stdhtml "html"
	"strconv"
	"strings"

	"golang.org/x/net/html"
)

type ProviderShow struct {
	ID           string
	Name         string
	EnglishName  string
	Description  string
	MalID        int
	Status       string
	Thumbnail    string
	Type         string
	Year         int
	EpisodeCount int
	SubEpisodes  []int
	DubEpisodes  []int
}

func (c *AllAnimeProvider) DirectSequels(ctx context.Context, show ProviderShow) ([]string, error) {
	query := `query($showId: String!) { show(_id: $showId) { relatedShows } }`
	result, err := c.graphqlRequest(ctx, query, map[string]any{"showId": show.ID})
	if err != nil {
		return nil, err
	}
	data, _ := result["data"].(map[string]any)
	rawShow, _ := data["show"].(map[string]any)
	relations, _ := rawShow["relatedShows"].([]any)
	ids := make([]string, 0, len(relations))
	for _, raw := range relations {
		relation, _ := raw.(map[string]any)
		id, _ := relation["showId"].(string)
		if relation["relation"] == "sequel" && id != "" {
			ids = append(ids, id)
		}
	}
	return ids, nil
}

func (c *AllAnimeProvider) GetProviderShow(ctx context.Context, showID string) (ProviderShow, error) {
	query := `query($showId: String!) { show(_id: $showId) { _id name englishName description malId status thumbnail type season episodeCount availableEpisodesDetail } }`
	result, err := c.graphqlRequest(ctx, query, map[string]any{"showId": showID})
	if err != nil {
		return ProviderShow{}, err
	}
	data, _ := result["data"].(map[string]any)
	raw, _ := data["show"].(map[string]any)
	if raw == nil {
		return ProviderShow{}, fmt.Errorf("allanime: show %s not found", showID)
	}
	return providerShowFrom(raw), nil
}

func (c *AllAnimeProvider) SeasonalShows(ctx context.Context, season string, year int) ([]ProviderShow, error) {
	const pageSize = 40
	query := `query($search: SearchInput, $page: Int) { shows(search: $search, limit: 40, page: $page, countryOrigin: ALL) { edges { _id name englishName description malId status thumbnail type season episodeCount availableEpisodesDetail } } }`
	if season == "" {
		return nil, errors.New("allanime: season is required")
	}
	search := map[string]any{
		"allowAdult":   false,
		"allowUnknown": false,
		"season":       strings.ToUpper(season[:1]) + strings.ToLower(season[1:]),
		"year":         year,
		"types":        []string{"TV"},
		"includeTypes": true,
	}
	out := make([]ProviderShow, 0)
	seen := make(map[int]bool)
	for page := 1; page <= 20; page++ {
		result, err := c.graphqlRequest(ctx, query, map[string]any{"search": search, "page": page})
		if err != nil {
			return nil, err
		}
		data, _ := result["data"].(map[string]any)
		shows, _ := data["shows"].(map[string]any)
		edges, _ := shows["edges"].([]any)
		for _, edge := range edges {
			raw, _ := edge.(map[string]any)
			show := providerShowFrom(raw)
			if show.MalID <= 0 || seen[show.MalID] || show.Type != "TV" || max(len(show.SubEpisodes), len(show.DubEpisodes)) == 0 {
				continue
			}
			seen[show.MalID] = true
			out = append(out, show)
		}
		if len(edges) < pageSize {
			break
		}
	}
	return out, nil
}

func providerShowFrom(raw map[string]any) ProviderShow {
	detail, _ := raw["availableEpisodesDetail"].(map[string]any)
	season, _ := raw["season"].(map[string]any)
	return ProviderShow{
		ID:           stringValue(raw["_id"]),
		Name:         stringValue(raw["name"]),
		EnglishName:  stringValue(raw["englishName"]),
		Description:  plainText(stringValue(raw["description"])),
		MalID:        intValue(raw["malId"]),
		Status:       stringValue(raw["status"]),
		Thumbnail:    stringValue(raw["thumbnail"]),
		Type:         stringValue(raw["type"]),
		Year:         numericInt(season["year"]),
		EpisodeCount: intValue(raw["episodeCount"]),
		SubEpisodes:  episodeNums(stringsFrom(detail["sub"])),
		DubEpisodes:  episodeNums(stringsFrom(detail["dub"])),
	}
}

func plainText(value string) string {
	tokenizer := html.NewTokenizer(bytes.NewBufferString(value))
	var out strings.Builder
	for {
		switch tokenizer.Next() {
		case html.ErrorToken:
			return out.String()
		case html.TextToken:
			text := strings.Join(strings.Fields(stdhtml.UnescapeString(string(tokenizer.Text()))), " ")
			if text == "" {
				continue
			}
			if out.Len() > 0 {
				out.WriteByte(' ')
			}
			out.WriteString(text)
		}
	}
}

func stringValue(value any) string {
	valueString, _ := value.(string)
	return valueString
}

func intValue(value any) int {
	n, _ := strconv.Atoi(stringValue(value))
	return n
}

func numericInt(value any) int {
	if n := intValue(value); n > 0 {
		return n
	}
	n, _ := value.(float64)
	return int(n)
}
