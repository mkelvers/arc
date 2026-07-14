package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"mal/internal/domain"
	"mal/internal/observability"
)

func (s *EpisodeService) EnrichEpisodeTitles(ctx context.Context, anime domain.Anime) (domain.CanonicalEpisodeList, error) {
	payload, _, ok := s.cachedEpisodePayload(ctx, anime)
	if !ok {
		return domain.CanonicalEpisodeList{}, errors.New("episode titles: episode availability is not cached")
	}
	if !hasPlaceholderTitles(payload.Episodes) {
		return payload, nil
	}
	if s.titles == nil {
		return payload, errors.New("episode titles: provider is not configured")
	}

	value, err, _ := s.titleLoad.Do(strconv.Itoa(anime.MalID), func() (any, error) {
		return s.loadEpisodeTitles(ctx, anime)
	})
	if err != nil {
		return payload, err
	}
	return value.(domain.CanonicalEpisodeList), nil
}

func (s *EpisodeService) loadEpisodeTitles(ctx context.Context, anime domain.Anime) (domain.CanonicalEpisodeList, error) {
	payload, _, ok := s.cachedEpisodePayload(ctx, anime)
	if !ok {
		return domain.CanonicalEpisodeList{}, errors.New("episode titles: episode availability cache disappeared")
	}

	providerID, err := s.providerID(ctx, anime, s.titles, titleCandidates(anime))
	if err != nil {
		return domain.CanonicalEpisodeList{}, err
	}

	titles, err := s.titles.GetEpisodeTitlesByProviderID(ctx, providerID, anime, len(payload.Episodes))
	if err != nil {
		return domain.CanonicalEpisodeList{}, err
	}

	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()

	payload, row, ok := s.cachedEpisodePayload(ctx, anime)
	if !ok {
		return domain.CanonicalEpisodeList{}, errors.New("episode titles: episode availability cache disappeared")
	}

	changed := mergeMissingTitles(payload.Episodes, titles)
	if !changed {
		return payload, nil
	}
	if err := s.storeEnrichedPayload(ctx, row, payload); err != nil {
		return domain.CanonicalEpisodeList{}, err
	}

	observability.Info(
		"episode_titles_enriched",
		"episodes",
		"",
		map[string]any{
			"anime_id": anime.MalID,
			"provider": s.titles.Name(),
			"titles":   len(titles),
		},
	)
	return payload, nil
}

func (s *EpisodeService) cachedEpisodePayload(ctx context.Context, anime domain.Anime) (domain.CanonicalEpisodeList, episodeCacheRow, bool) {
	row, _, ok := s.getEpisodeCache(ctx, int64(anime.MalID))
	if !ok {
		return domain.CanonicalEpisodeList{}, episodeCacheRow{}, false
	}
	payload, ok := s.decodeCachedPayload(anime, row.Data)
	if !ok {
		return domain.CanonicalEpisodeList{}, episodeCacheRow{}, false
	}
	return enrichCachedPayload(payload, row), row, true
}

func (s *EpisodeService) storeEnrichedPayload(ctx context.Context, row episodeCacheRow, payload domain.CanonicalEpisodeList) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("episode metadata: encode cache: %w", err)
	}
	row.Data = string(body)
	err = s.setEpisodeCache(ctx, row)
	if err != nil {
		return fmt.Errorf("episode metadata: update cache: %w", err)
	}
	return nil
}

func hasPlaceholderTitles(episodes []domain.CanonicalEpisode) bool {
	for _, episode := range episodes {
		if isPlaceholderTitle(episode.Number, episode.Title) {
			return true
		}
	}
	return false
}

func mergeMissingTitles(episodes []domain.CanonicalEpisode, titles map[int]string) bool {
	changed := false
	for i := range episodes {
		episode := &episodes[i]
		title := strings.TrimSpace(titles[episode.Number])
		if title == "" || !isPlaceholderTitle(episode.Number, episode.Title) || title == episode.Title {
			continue
		}
		episode.Title = title
		changed = true
	}
	return changed
}

func isPlaceholderTitle(number int, title string) bool {
	return strings.TrimSpace(title) == fmt.Sprintf("Episode %d", number)
}
