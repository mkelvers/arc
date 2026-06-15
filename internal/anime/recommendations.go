package anime

import (
	"context"
	"mal/internal/anime/recommendations"
	"mal/internal/domain"
)

func (s *animeService) GetTopPickForYou(ctx context.Context, userID string) (domain.CatalogSectionData, error) {
	return recommendations.GetTopPicksForYou(ctx, s.jikan, s.repo, userID, recommendations.TopPickLimit)
}

func (s *animeService) GetTopPicksForYou(ctx context.Context, userID string) (domain.CatalogSectionData, error) {
	return recommendations.GetTopPicksForYou(ctx, s.jikan, s.repo, userID, recommendations.TopPicksLimit)
}
