package watchorder

import (
	"net/http"
	"time"

	rediscache "mal/internal/cache/redis"
	"mal/internal/config"

	"go.uber.org/fx"
)

var Module = fx.Options(
	fx.Provide(func(cfg config.Config, cache *rediscache.Store) *CachedClient {
		return NewCachedClient(cfg.ChiaKiURL, &http.Client{Timeout: 15 * time.Second}, cache)
	}),
)
