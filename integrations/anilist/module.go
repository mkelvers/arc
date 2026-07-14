package anilist

import (
	"mal/internal/domain"

	"go.uber.org/fx"
)

type Config struct {
	URL string
}

var Module = fx.Options(
	fx.Provide(func(cfg Config) *Client { return NewClient(cfg.URL) }),
	fx.Provide(func(cfg Config, cache domain.CacheStore) *CachedClient {
		return NewCachedClient(NewClient(cfg.URL), cache)
	}),
)
