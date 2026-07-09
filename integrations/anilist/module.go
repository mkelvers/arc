package anilist

import (
	rediscache "mal/internal/cache/redis"
	"mal/internal/config"

	"go.uber.org/fx"
)

var Module = fx.Options(
	fx.Provide(func(cfg config.Config) *Client { return NewClient(cfg.AniListURL) }),
	fx.Provide(func(cfg config.Config, cache *rediscache.Store) *CachedClient {
		return NewCachedClient(NewClient(cfg.AniListURL), cache)
	}),
)
