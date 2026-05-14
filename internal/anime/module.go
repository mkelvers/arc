package anime

import (
	"mal/internal/anime/handler"
	"mal/internal/anime/repository"
	"mal/internal/anime/service"
	"mal/internal/server"

	"go.uber.org/fx"
)

var Module = fx.Options(
	fx.Provide(
		repository.NewAnimeRepository,
		service.NewAnimeService,
		handler.NewAnimeHandler,
	),
	fx.Provide(
		server.AsRouteRegister(func(h *handler.AnimeHandler) server.RouteRegister {
			return h
		}),
	),
)
