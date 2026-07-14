// Package episodes manages episode availability checking and refresh scheduling.
package episodes

import (
	"mal/integrations/playback/allanime"
	"mal/internal/domain"
	episodeService "mal/internal/episodes/service"

	"go.uber.org/fx"
)

var Module = fx.Options(
	fx.Provide(
		fx.Annotate(
			episodeService.NewEpisodeServiceWithAniList,
		),
	),
	fx.Provide(func() bool { return true }),
	fx.Provide(func(p *allanime.AllAnimeProvider, cache domain.CacheStore) []domain.EpisodeAvailabilityProvider {
		return []domain.EpisodeAvailabilityProvider{newCachedAvailabilityProvider(p, cache)}
	}),
	fx.Invoke(RegisterWorker),
)
