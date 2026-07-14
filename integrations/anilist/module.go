package anilist

import (
	"mal/internal/domain"

	"go.uber.org/fx"
)

var Module = fx.Options(
	fx.Provide(NewClient),
	fx.Provide(func(cache domain.CacheStore) *CachedClient {
		return NewCachedClient(NewClient(), cache)
	}),
)
