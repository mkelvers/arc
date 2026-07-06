package service

import (
	"context"
	"errors"
	"strconv"

	"mal/integrations/jikan"
	"mal/internal/domain"
	"mal/internal/observability"
)

func (s *EpisodeService) EnrichEpisodeClassifications(ctx context.Context, anime domain.Anime) (domain.CanonicalEpisodeList, error) {
	payload, _, ok := s.cachedEpisodePayload(ctx, anime)
	if !ok {
		return domain.CanonicalEpisodeList{}, errors.New("episode classifications: episode availability is not cached")
	}
	if payload.ClassificationChecked {
		return payload, nil
	}
	if s.jikan == nil {
		return payload, errors.New("episode classifications: provider is not configured")
	}

	value, err, _ := s.classificationLoad.Do(strconv.Itoa(anime.MalID), func() (any, error) {
		return s.loadEpisodeClassifications(ctx, anime)
	})
	if err != nil {
		return payload, err
	}
	return value.(domain.CanonicalEpisodeList), nil
}

func (s *EpisodeService) loadEpisodeClassifications(ctx context.Context, anime domain.Anime) (domain.CanonicalEpisodeList, error) {
	episodes, err := s.jikan.GetAllEpisodes(ctx, anime.MalID)
	if err != nil {
		return domain.CanonicalEpisodeList{}, err
	}

	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()

	payload, row, ok := s.cachedEpisodePayload(ctx, anime)
	if !ok {
		return domain.CanonicalEpisodeList{}, errors.New("episode classifications: episode availability cache disappeared")
	}
	mergeEpisodeClassifications(payload.Episodes, episodes)
	payload.ClassificationChecked = true
	if err := s.storeEnrichedPayload(ctx, row, payload); err != nil {
		return domain.CanonicalEpisodeList{}, err
	}

	observability.Info(
		"episode_classifications_enriched",
		"episodes",
		"",
		map[string]any{
			"anime_id": anime.MalID,
			"episodes": len(episodes),
		},
	)
	return payload, nil
}

func mergeEpisodeClassifications(canonical []domain.CanonicalEpisode, episodes []jikan.Episode) {
	byNumber := make(map[int]jikan.Episode, len(episodes))
	for i, episode := range episodes {
		number, ok := jikanEpisodeNumber(episode, i)
		if ok {
			byNumber[number] = episode
		}
	}
	for i := range canonical {
		classification, ok := byNumber[canonical[i].Number]
		if !ok {
			continue
		}
		canonical[i].Filler = classification.Filler
		canonical[i].Recap = classification.Recap
	}
}
