package playback

import (
	"mal/integrations/jikan"
	"mal/integrations/playback/allanime"
	"mal/internal/config"
	"mal/internal/domain"
	"mal/internal/playback/handler"
	"mal/internal/playback/repository"
	"mal/internal/playback/service"
	"mal/internal/server"

	"go.uber.org/fx"
)

func provideProxyTokenKey(cfg config.Config) service.ProxyTokenKey {
	return service.ProxyTokenKey(cfg.PlaybackProxySecret)
}

var Module = fx.Options(
	fx.Provide(
		repository.NewPlaybackRepository,
			fx.Annotate(
				func(repo domain.PlaybackRepository, providers []domain.Provider, jikan *jikan.Client, episodeSvc domain.EpisodeService, auditSvc domain.AuditService, proxyTokenKey service.ProxyTokenKey) domain.PlaybackService {
					return service.NewPlaybackService(repo, providers, jikan, episodeSvc, auditSvc, proxyTokenKey)
				},
			),
		func(svc domain.PlaybackService, animeSvc domain.AnimeService) *handler.PlaybackHandler {
			return handler.NewPlaybackHandler(svc, animeSvc)
		},
	),
	fx.Provide(
		server.AsRouteRegister(func(h *handler.PlaybackHandler) server.RouteRegister {
			return h
		}),
	),
	fx.Provide(func(p *allanime.AllAnimeProvider) []domain.Provider {
		return []domain.Provider{p}
	}),
	fx.Provide(provideProxyTokenKey),
)
