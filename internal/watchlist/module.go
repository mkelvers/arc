package watchlist

import (
	"mal/internal/server"

	"go.uber.org/fx"
)

var Module = fx.Options(
	fx.Provide(
		NewWatchlistRepository,
		NewWatchlistServiceWithAniList,
		NewWatchlistHandler,
	),
	fx.Provide(
		server.AsRouteRegister(func(h *WatchlistHandler) server.RouteRegister {
			return h
		}),
	),
)
