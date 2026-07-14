package allanime

import (
	"context"
	"fmt"
	"strconv"
	"strings"
)

type SearchResult struct {
	ID    string
	MalID string
	Name  string
}

func (c *AllAnimeProvider) Search(ctx context.Context, query string, mode string) ([]SearchResult, error) {
	search := SearchInput{
		AllowAdult:   false,
		AllowUnknown: false,
		Query:        query,
	}
	data, err := AllAnimeSearch(ctx, c.graphqlClient(), search, translationType(mode))
	if err != nil {
		return nil, err
	}

	out := make([]SearchResult, 0, len(data.Shows.Edges))
	for _, edge := range data.Shows.Edges {
		id := edge.Id
		malID := edge.MalId
		name := edge.Name
		if unquoted, err := strconv.Unquote("\"" + name + "\""); err == nil {
			name = unquoted
		}
		name = strings.TrimSpace(name)

		if id == "" {
			continue
		}

		out = append(out, SearchResult{ID: id, MalID: malID, Name: name})
	}

	return out, nil
}

func translationType(mode string) VaildTranslationTypeEnumType {
	return VaildTranslationTypeEnumType(strings.ToLower(mode))
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
