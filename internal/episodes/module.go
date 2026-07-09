// Package episodes manages episode availability checking and refresh scheduling.
package episodes

import (
	"mal/integrations/playback/allanime"
	"mal/integrations/tvmaze"
	rediscache "mal/internal/cache/redis"
	"mal/internal/domain"
	episodeService "mal/internal/episodes/service"

	"go.uber.org/fx"
)

var Module = fx.Options(
	fx.Provide(
		tvmaze.NewClient,
		fx.Annotate(
			episodeService.NewEpisodeServiceWithAniList,
		),
	),
	fx.Provide(func() bool { return true }),
	fx.Provide(func(p *allanime.AllAnimeProvider, cache *rediscache.Store) []domain.EpisodeAvailabilityProvider {
		return []domain.EpisodeAvailabilityProvider{newCachedAvailabilityProvider(p, cache)}
	}),
	fx.Provide(func(p *tvmaze.Client) domain.EpisodeTitleProvider {
		return p
	}),
	fx.Invoke(RegisterWorker),
)
