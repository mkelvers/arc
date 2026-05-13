package watchlist

import (
	"mal/internal/server"
	"mal/internal/watchlist/handler"
	"mal/internal/watchlist/repository"
	"mal/internal/watchlist/service"

	"go.uber.org/fx"
)

var Module = fx.Options(
	fx.Provide(
		repository.NewWatchlistRepository,
		service.NewWatchlistService,
		handler.NewWatchlistHandler,
	),
	fx.Provide(
		server.AsRouteRegister(func(h *handler.WatchlistHandler) server.RouteRegister {
			return h
		}),
	),
)
