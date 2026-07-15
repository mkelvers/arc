package allanime

import (
	"context"
	"errors"
	"strconv"
	"strings"

	"mal/internal/domain"
)

type AvailableEpisodes struct {
	Sub    []string
	Dub    []string
	Raw    []string
	Titles map[string]string
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

	sub := episodeIDs(append(available.Sub, available.Raw...))
	dub := episodeIDs(available.Dub)
	return domain.EpisodeAvailability{Sub: sub, Dub: dub, Titles: available.Titles}, nil
}

func (c *AllAnimeProvider) GetAvailableEpisodes(ctx context.Context, showID string) (AvailableEpisodes, error) {
	result, err := AllAnimeAvailableEpisodes(ctx, c.graphqlClient(), showID, 1, 100000)
	if err != nil {
		return AvailableEpisodes{}, err
	}

	if result.Show == nil {
		return AvailableEpisodes{}, errors.New("show not found")
	}

	titles := map[string]string{}
	for _, info := range result.EpisodeInfos {
		number := strings.TrimSpace(info.EpisodeIdNum.String())
		title := plainText(info.Notes)
		if number != "" && title != "" {
			titles[number] = title
		}
	}

	detail := providerEpisodeDetailFrom(result.Show.AvailableEpisodesDetail)
	return AvailableEpisodes{Sub: detail.Sub, Dub: detail.Dub, Raw: detail.Raw, Titles: titles}, nil
}

func episodeIDs(raw []string) []string {
	seen := make(map[string]bool, len(raw))
	out := make([]string, 0, len(raw))
	for _, value := range raw {
		value = strings.TrimSpace(value)
		if _, err := strconv.ParseFloat(value, 64); err != nil || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
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
