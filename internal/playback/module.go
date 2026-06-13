package playback

import (
	"mal/integrations/playback/allanime"
	"mal/internal/config"
	"mal/internal/domain"
	"mal/internal/playback/handler"
	"mal/internal/server"

	"go.uber.org/fx"
)

func provideProxyTokenKey(cfg config.Config) ProxyTokenKey {
	return ProxyTokenKey(cfg.PlaybackProxySecret)
}

var Module = fx.Options(
	fx.Provide(
		NewPlaybackRepository,
		NewPlaybackService,
		func(svc domain.PlaybackService, animeSvc domain.AnimePlaybackService) *handler.PlaybackHandler {
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
