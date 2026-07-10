package service

import (
	"context"
	"errors"

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
