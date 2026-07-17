package anime

import (
	"mal/internal/domain"
	"mal/internal/server"

	"go.uber.org/fx"
)

var Module = fx.Options(
	fx.Provide(
		NewAnimeRepository,
		NewMappingStore,
		NewMappingSyncer,
		NewSeasonDiscoveryService,
		fx.Annotate(
			NewAnimeServiceWithMetadata,
			fx.As(new(Service)),
			fx.As(new(domain.AnimeCatalogService)),
			fx.As(new(domain.AnimeSearchService)),
			fx.As(new(domain.AnimeDetailsService)),
			fx.As(new(domain.AnimePlaybackService)),
			fx.As(new(domain.RecommendationInvalidator)),
		),
		NewAnimeHandler,
	),
	fx.Invoke(RegisterMappingSync),
	fx.Provide(
		server.AsRouteRegister(func(h *AnimeHandler) server.RouteRegister {
			return h
		}),
	),
)
