package allanime

import (
	"context"
	"fmt"
	"mal/internal/domain"
	"strconv"
	"strings"
)

type AvailableEpisodes struct {
	Sub []string
	Dub []string
	Raw []string
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

	sub := parseEpisodeNumbers(append(available.Sub, available.Raw...))
	dub := parseEpisodeNumbers(available.Dub)
	return domain.EpisodeAvailability{Sub: sub, Dub: dub}, nil
}

func (c *AllAnimeProvider) GetAvailableEpisodes(ctx context.Context, showID string) (AvailableEpisodes, error) {
	graphqlQuery := `query($showId: String!) {
		show(_id: $showId) {
			availableEpisodesDetail
			lastEpisodeInfo
		}
	}`

	result, err := c.graphqlRequest(ctx, graphqlQuery, map[string]any{"showId": showID})
	if err != nil {
		return AvailableEpisodes{}, err
	}

	data, ok := result["data"].(map[string]any)
	if !ok {
		return AvailableEpisodes{}, fmt.Errorf("invalid response")
	}

	show, ok := data["show"].(map[string]any)
	if !ok || show == nil {
		return AvailableEpisodes{}, fmt.Errorf("show not found")
	}

	detail, ok := show["availableEpisodesDetail"].(map[string]any)
	if !ok {
		return AvailableEpisodes{}, fmt.Errorf("invalid detail")
	}

	return AvailableEpisodes{
		Sub: stringSliceFromAny(detail["sub"]),
		Dub: stringSliceFromAny(detail["dub"]),
		Raw: stringSliceFromAny(detail["raw"]),
	}, nil
}

func parseEpisodeNumbers(raw []string) []int {
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

func stringSliceFromAny(value any) []string {
	items, ok := value.([]any)
	if !ok {
		return nil
	}

	values := make([]string, 0, len(items))
	for _, item := range items {
		str, ok := item.(string)
		if !ok {
			continue
		}

		values = append(values, str)
	}

	return values
}
