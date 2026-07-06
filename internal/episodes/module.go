// Package episodes manages episode availability checking and refresh scheduling.
package episodes

import (
	"mal/integrations/playback/allanime"
	"mal/integrations/tvmaze"
	"mal/internal/config"
	"mal/internal/domain"
	episodeService "mal/internal/episodes/service"

	"go.uber.org/fx"
)

func episodeAvailabilityEnabled(cfg config.Config) bool {
	return cfg.EpisodeAvailabilityMode != config.EpisodeAvailabilityModeLegacy && cfg.EpisodeAvailabilityMode != config.EpisodeAvailabilityModeJikan
}

var Module = fx.Options(
	fx.Provide(
		episodeAvailabilityEnabled,
		tvmaze.NewClient,
		fx.Annotate(
			episodeService.NewEpisodeService,
		),
	),
	fx.Provide(func(p *allanime.AllAnimeProvider) []domain.EpisodeAvailabilityProvider {
		return []domain.EpisodeAvailabilityProvider{p}
	}),
	fx.Provide(func(p *tvmaze.Client) domain.EpisodeTitleProvider {
		return p
	}),
	fx.Invoke(RegisterWorker),
)
