package allanime

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"mal/integrations/playback/allanime/allanimeql"
	"net/http"
)

const seasonalShowsQuery = `
query AllAnimeSeasonalShows($search: SearchInput, $page: Int!) {
  shows(search: $search, limit: 40, page: $page, countryOrigin: ALL) {
    edges {
      _id
      name
      englishName
      description
      malId
      status
      thumbnail
      type
      season
      episodeCount
      availableEpisodesDetail
    }
  }
}
`

type seasonalShowsRequest struct {
	Query     string                 `json:"query"`
	Variables seasonalShowsVariables `json:"variables"`
}

type seasonalShowsVariables struct {
	Search allanimeql.SearchInput `json:"search"`
	Page   int                    `json:"page"`
}

type seasonalShowsResponse struct {
	Data struct {
		Shows struct {
			Edges []seasonalShow `json:"edges"`
		} `json:"shows"`
	} `json:"data"`
	Errors []graphqlError `json:"errors"`
}

type graphqlError struct {
	Message string `json:"message"`
}

type seasonalShow struct {
	ID                      string                `json:"_id"`
	Name                    string                `json:"name"`
	EnglishName             string                `json:"englishName"`
	Description             string                `json:"description"`
	MalID                   string                `json:"malId"`
	Status                  string                `json:"status"`
	Thumbnail               string                `json:"thumbnail"`
	Type                    string                `json:"type"`
	Season                  seasonalShowSeason    `json:"season"`
	EpisodeCount            string                `json:"episodeCount"`
	AvailableEpisodesDetail seasonalEpisodeDetail `json:"availableEpisodesDetail"`
}

type seasonalShowSeason struct {
	Year allanimeql.FlexibleInt `json:"year"`
}

type seasonalEpisodeDetail struct {
	Sub []string `json:"sub"`
	Dub []string `json:"dub"`
	Raw []string `json:"raw"`
}

func (c *AllAnimeProvider) fetchSeasonalShowsPage(ctx context.Context, search allanimeql.SearchInput, page int) ([]ProviderShow, error) {
	body, err := json.Marshal(seasonalShowsRequest{
		Query: seasonalShowsQuery,
		Variables: seasonalShowsVariables{
			Search: search,
			Page:   page,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("marshal allanime seasonal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.apiBaseURL()+"/api", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create allanime seasonal request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Referer", allAnimeReferer)
	req.Header.Set("User-Agent", defaultUserAgent)

	client := c.httpClient
	if client == nil {
		client = http.DefaultClient
	}
	status, respBody, err := executeAndReadResponse(client, req, "execute allanime seasonal request", "read allanime seasonal response")
	if err != nil {
		return nil, err
	}

	return decodeSeasonalShowsResponse(status, respBody)
}

func decodeSeasonalShowsResponse(status int, respBody []byte) ([]ProviderShow, error) {
	var result seasonalShowsResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		if status < http.StatusOK || status >= http.StatusMultipleChoices {
			return nil, fmt.Errorf("allanime seasonal request returned status %d: %s", status, string(respBody))
		}
		return nil, fmt.Errorf("unmarshal allanime seasonal response: %w", err)
	}
	if len(result.Errors) > 0 {
		return nil, fmt.Errorf("graphql error: %s", result.Errors[0].Message)
	}
	if status < http.StatusOK || status >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("allanime seasonal request returned status %d: %s", status, string(respBody))
	}

	return seasonalProviderShows(result.Data.Shows.Edges), nil
}

func seasonalProviderShows(edges []seasonalShow) []ProviderShow {
	out := make([]ProviderShow, 0, len(edges))
	for _, edge := range edges {
		out = append(out, seasonalProviderShowFrom(edge))
	}
	return out
}

func seasonalProviderShowFrom(raw seasonalShow) ProviderShow {
	return ProviderShow{
		ID:           raw.ID,
		Name:         raw.Name,
		EnglishName:  raw.EnglishName,
		Description:  plainText(raw.Description),
		MalID:        intValue(raw.MalID),
		Status:       raw.Status,
		Thumbnail:    raw.Thumbnail,
		Type:         raw.Type,
		Year:         raw.Season.Year.Int(),
		EpisodeCount: intValue(raw.EpisodeCount),
		SubEpisodes:  episodeNums(raw.AvailableEpisodesDetail.Sub),
		DubEpisodes:  episodeNums(raw.AvailableEpisodesDetail.Dub),
	}
}
