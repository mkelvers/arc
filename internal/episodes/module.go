package episodes

import (
	"mal/integrations/jikan"
	"mal/integrations/playback/allanime"
	"mal/internal/config"
	"mal/internal/db"
	"mal/internal/domain"
	episodeService "mal/internal/episodes/service"
	"mal/internal/observability"

	"go.uber.org/fx"
)

func episodeAvailabilityEnabled(cfg config.Config) bool {
	return cfg.EpisodeAvailabilityMode != config.EpisodeAvailabilityModeLegacy && cfg.EpisodeAvailabilityMode != config.EpisodeAvailabilityModeJikan
}

var Module = fx.Options(
	fx.Provide(
		episodeAvailabilityEnabled,
			fx.Annotate(
				func(queries *db.Queries, jikanClient *jikan.Client, providers []domain.EpisodeAvailabilityProvider, enabled bool, metrics *observability.Metrics) domain.EpisodeService {
					return episodeService.NewEpisodeService(queries, jikanClient, providers, enabled, metrics)
				},
			),
		),
	fx.Provide(func(p *allanime.AllAnimeProvider) []domain.EpisodeAvailabilityProvider {
		return []domain.EpisodeAvailabilityProvider{p}
	}),
	fx.Invoke(RegisterWorker),
)
