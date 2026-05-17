package episodes

import (
	"os"
	"strings"

	"mal/integrations/jikan"
	"mal/integrations/playback/allanime"
	"mal/internal/db"
	"mal/internal/domain"
	episodeService "mal/internal/episodes/service"

	"go.uber.org/fx"
)

func episodeAvailabilityEnabled() bool {
	value := strings.ToLower(strings.TrimSpace(os.Getenv("EPISODE_AVAILABILITY_MODE")))
	return value != "legacy" && value != "jikan"
}

var Module = fx.Options(
	fx.Provide(
		episodeAvailabilityEnabled,
		fx.Annotate(
			func(queries *db.Queries, jikanClient *jikan.Client, providers []domain.EpisodeAvailabilityProvider, enabled bool) domain.EpisodeService {
				return episodeService.NewEpisodeService(queries, jikanClient, providers, enabled)
			},
			fx.ParamTags(``, ``, ``, ``),
		),
	),
	fx.Provide(func(p *allanime.AllAnimeProvider) []domain.EpisodeAvailabilityProvider {
		return []domain.EpisodeAvailabilityProvider{p}
	}),
	fx.Invoke(RegisterWorker),
)
