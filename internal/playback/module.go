package playback

import (
	"mal/internal/domain"
	"mal/internal/playback/handler"
	"mal/internal/playback/repository"
	"mal/internal/playback/service"
	"mal/internal/server"

	"go.uber.org/fx"
)

var Module = fx.Options(
	fx.Provide(
		repository.NewPlaybackRepository,
		service.NewPlaybackService,
		handler.NewPlaybackHandler,
	),
	fx.Provide(
		server.AsRouteRegister(func(h *handler.PlaybackHandler) server.RouteRegister {
			return h
		}),
	),
)
