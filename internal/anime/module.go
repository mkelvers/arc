package anime

import (
	"mal/internal/domain"
	"mal/internal/server"

	"go.uber.org/fx"
)

var Module = fx.Options(
	fx.Provide(
		NewAnimeRepository,
		fx.Annotate(
			NewAnimeService,
			fx.As(new(Service)),
			fx.As(new(domain.AnimeCatalogService)),
			fx.As(new(domain.AnimeDiscoverService)),
			fx.As(new(domain.AnimeSearchService)),
			fx.As(new(domain.AnimeDetailsService)),
			fx.As(new(domain.AnimePlaybackService)),
		),
		NewAnimeHandler,
	),
	fx.Provide(
		server.AsRouteRegister(func(h *AnimeHandler) server.RouteRegister {
			return h
		}),
	),
)
