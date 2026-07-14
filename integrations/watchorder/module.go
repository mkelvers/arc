package watchorder

import (
	"net/http"
	"time"

	"mal/internal/domain"

	"go.uber.org/fx"
)

type Config struct {
	URL string
}

var Module = fx.Options(
	fx.Provide(func(cfg Config, cache domain.CacheStore) *CachedClient {
		return NewCachedClient(cfg.URL, &http.Client{Timeout: 15 * time.Second}, cache)
	}),
)
