package allanime

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	stdhtml "html"
	"mal/integrations/playback/allanime/allanimeql"
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
	result, err := allanimeql.AllAnimeDirectSequels(ctx, c.graphqlClient(), show.ID)
	if err != nil {
		return nil, err
	}
	if result.Show == nil {
		return nil, nil
	}

	ids := make([]string, 0, len(result.Show.RelatedShows))
	for _, relation := range result.Show.RelatedShows {
		if relation.Relation == "sequel" && relation.ShowId != "" {
			ids = append(ids, relation.ShowId)
		}
	}
	return ids, nil
}

func (c *AllAnimeProvider) GetProviderShow(ctx context.Context, showID string) (ProviderShow, error) {
	result, err := allanimeql.AllAnimeProviderShow(ctx, c.graphqlClient(), showID)
	if err != nil {
		return ProviderShow{}, err
	}
	if result.Show == nil {
		return ProviderShow{}, fmt.Errorf("allanime: show %s not found", showID)
	}
	return providerShowFrom(result.Show.ProviderShowFields), nil
}

func (c *AllAnimeProvider) SeasonalShows(ctx context.Context, season string, year int) ([]ProviderShow, error) {
	const pageSize = 40
	if season == "" {
		return nil, errors.New("allanime: season is required")
	}
	search := allanimeql.SearchInput{
		AllowAdult:   false,
		AllowUnknown: false,
		Season:       strings.ToUpper(season[:1]) + strings.ToLower(season[1:]),
		Types:        []string{"TV"},
		IncludeTypes: true,
	}
	out := make([]ProviderShow, 0)
	seen := make(map[int]bool)
	for page := 1; page <= 20; page++ {
		pageShows, err := c.fetchSeasonalShowsPage(ctx, search, page)
		if err != nil {
			return nil, err
		}
		newestYear := 0
		for _, show := range pageShows {
			newestYear = max(newestYear, show.Year)
			if seen[show.MalID] || !isPlayableSeasonShow(show, year) {
				continue
			}
			seen[show.MalID] = true
			out = append(out, show)
		}
		if len(pageShows) < pageSize || (newestYear > 0 && newestYear < year) {
			break
		}
	}
	return out, nil
}

func isPlayableSeasonShow(show ProviderShow, year int) bool {
	return show.Year == year && show.MalID > 0 && show.Type == "TV" && max(len(show.SubEpisodes), len(show.DubEpisodes)) > 0
}

func providerShowFrom(raw allanimeql.ProviderShowFields) ProviderShow {
	return ProviderShow{
		ID:           raw.Id,
		Name:         raw.Name,
		EnglishName:  raw.EnglishName,
		Description:  plainText(raw.Description),
		MalID:        intValue(raw.MalId),
		Status:       raw.Status,
		Thumbnail:    raw.Thumbnail,
		Type:         raw.Type,
		Year:         raw.Season.Year.Int(),
		EpisodeCount: intValue(raw.EpisodeCount),
		SubEpisodes:  episodeNums(raw.AvailableEpisodesDetail.Sub),
		DubEpisodes:  episodeNums(raw.AvailableEpisodesDetail.Dub),
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

func intValue(value string) int {
	n, _ := strconv.Atoi(value)
	return n
}
