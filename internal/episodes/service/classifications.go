package service

import (
	"context"
	"errors"

	"mal/integrations/metadata"
	"mal/internal/domain"
)

func (s *EpisodeService) EnrichEpisodeClassifications(ctx context.Context, anime domain.Anime) (domain.CanonicalEpisodeList, error) {
	payload, _, ok := s.cachedEpisodePayload(ctx, anime)
	if !ok {
		return domain.CanonicalEpisodeList{}, errors.New("episode classifications: episode availability is not cached")
	}
	if payload.ClassificationChecked {
		return payload, nil
	}
	return payload, errors.New("episode classifications: provider is not configured")
}

func mergeEpisodeClassifications(canonical []domain.CanonicalEpisode, episodes []metadata.Episode) {
	byNumber := make(map[int]metadata.Episode, len(episodes))
	for i, episode := range episodes {
		number, ok := providerEpisodeNumber(episode, i)
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
