package allanime

import (
	"context"
	"errors"
	"mal/integrations/playback/allanime/allanimeql"
	"mal/internal/domain"
	"strconv"
	"strings"
)

type AvailableEpisodes struct {
	Sub    []string
	Dub    []string
	Raw    []string
	Titles map[int]string
}

func (c *AllAnimeProvider) GetEpisodeAvailability(ctx context.Context, animeID int, titleCandidates []string) (domain.EpisodeAvailability, error) {
	showID, err := c.ResolveEpisodeProviderID(ctx, animeID, titleCandidates)
	if err != nil {
		return domain.EpisodeAvailability{}, err
	}
	return c.GetEpisodeAvailabilityByProviderID(ctx, showID)
}

func (c *AllAnimeProvider) GetEpisodeAvailabilityByProviderID(ctx context.Context, showID string) (domain.EpisodeAvailability, error) {
	available, err := c.GetAvailableEpisodes(ctx, showID)
	if err != nil {
		return domain.EpisodeAvailability{}, err
	}

	sub := episodeNums(append(available.Sub, available.Raw...))
	dub := episodeNums(available.Dub)
	return domain.EpisodeAvailability{Sub: sub, Dub: dub, Titles: available.Titles}, nil
}

func (c *AllAnimeProvider) GetAvailableEpisodes(ctx context.Context, showID string) (AvailableEpisodes, error) {
	result, err := allanimeql.AllAnimeAvailableEpisodes(ctx, c.graphqlClient(), showID, 1, 100000)
	if err != nil {
		return AvailableEpisodes{}, err
	}

	if result.Show == nil {
		return AvailableEpisodes{}, errors.New("show not found")
	}

	titles := map[int]string{}
	for _, info := range result.EpisodeInfos {
		number := info.EpisodeIdNum.Int()
		title := plainText(info.Notes)
		if number > 0 && title != "" {
			titles[number] = title
		}
	}

	return AvailableEpisodes{
		Sub:    result.Show.AvailableEpisodesDetail.Sub,
		Dub:    result.Show.AvailableEpisodesDetail.Dub,
		Raw:    result.Show.AvailableEpisodesDetail.Raw,
		Titles: titles,
	}, nil
}

// episode ids
func episodeNums(raw []string) []int {
	seen := make(map[int]bool, len(raw))
	out := make([]int, 0, len(raw))
	for _, value := range raw {
		n, err := strconv.Atoi(strings.TrimSpace(value))
		if err != nil || n <= 0 || seen[n] {
			continue
		}
		seen[n] = true
		out = append(out, n)
	}
	return out
}
