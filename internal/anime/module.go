package anime

import (
	"mal/internal/anime/handler"
	"mal/internal/anime/repository"
	"mal/internal/anime/service"
	"mal/internal/domain"
	"mal/internal/server"

	"go.uber.org/fx"
)

var Module = fx.Options(
	fx.Provide(
		repository.NewAnimeRepository,
		fx.Annotate(
			service.NewAnimeService,
			fx.As(new(handler.Service)),
			fx.As(new(domain.AnimeCatalogService)),
			fx.As(new(domain.AnimeDiscoverService)),
			fx.As(new(domain.AnimeSearchService)),
			fx.As(new(domain.AnimeDetailsService)),
			fx.As(new(domain.AnimePlaybackService)),
		),
		handler.NewAnimeHandler,
	),
	fx.Provide(
		server.AsRouteRegister(func(h *handler.AnimeHandler) server.RouteRegister {
			return h
		}),
	),
)
