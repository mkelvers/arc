package allanime

import (
	"context"
	"fmt"
	"mal/pkg"
	netutil "mal/pkg/net"
	"strconv"
	"strings"
)

const searchQuery = `query(
  $search: SearchInput
  $translationType: VaildTranslationTypeEnumType
  $limit: Int = 40
  $page: Int = 1
  $countryOrigin: VaildCountryOriginEnumType = ALL
) {
  shows(
    search: $search
    limit: $limit
    page: $page
    translationType: $translationType
    countryOrigin: $countryOrigin
  ) {
    edges {
      _id
      malId
      name
    }
  }
}`

type searchResult struct {
	ID    string
	MalID string
	Name  string
}

func (c *AllAnimeProvider) Search(ctx context.Context, query string, mode string) ([]searchResult, error) {
	type searchData struct {
		Shows struct {
			Edges []struct {
				ID    string `json:"_id"`
				MalID string `json:"malId"`
				Name  string `json:"name"`
			} `json:"edges"`
		} `json:"shows"`
	}

	type searchInput struct {
		AllowAdult   bool   `json:"allowAdult"`
		AllowUnknown bool   `json:"allowUnknown"`
		Query        string `json:"query"`
	}

	type searchVariables struct {
		Search          searchInput `json:"search"`
		TranslationType string      `json:"translationType"`
	}

	vars := searchVariables{
		Search: searchInput{
			AllowAdult:   false,
			AllowUnknown: false,
			Query:        query,
		},
		TranslationType: mode,
	}

	data, err := graphql.Post[searchData](ctx, c.httpClient, c.apiBaseURL()+"/api", searchQuery, vars, graphql.PostOptions{
		Headers: map[string]string{
			"Referer":    allAnimeReferer,
			"User-Agent": defaultUserAgent,
		},
		BodyMax: netutil.MiB2,
	})
	if err != nil {
		return nil, err
	}

	out := make([]searchResult, 0, len(data.Shows.Edges))
	for _, edge := range data.Shows.Edges {
		id := edge.ID
		malID := edge.MalID
		name := edge.Name
		if unquoted, err := strconv.Unquote("\"" + name + "\""); err == nil {
			name = unquoted
		}
		name = strings.TrimSpace(name)

		if id == "" {
			continue
		}

		out = append(out, searchResult{ID: id, MalID: malID, Name: name})
	}

	return out, nil
}

func (c *AllAnimeProvider) ResolveEpisodeProviderID(ctx context.Context, animeID int, titleCandidates []string) (string, error) {
	for _, mode := range []string{"sub", "dub"} {
		showID, err := c.strictShowID(ctx, animeID, titleCandidates, mode)
		if err == nil {
			return showID, nil
		}
	}
	return "", fmt.Errorf("allanime: no exact mal id match for %d", animeID)
}

func (c *AllAnimeProvider) strictShowID(ctx context.Context, animeID int, titleCandidates []string, mode string) (string, error) {
	targetMalIDStr := strconv.Itoa(animeID)
	for _, title := range titleCandidates {
		searchResults, err := c.Search(ctx, title, mode)
		if err != nil {
			continue
		}
		for _, res := range searchResults {
			if res.MalID == targetMalIDStr {
				return res.ID, nil
			}
		}
	}
	return "", fmt.Errorf("allanime: no exact mal id match for %d in %s search", animeID, mode)
}
