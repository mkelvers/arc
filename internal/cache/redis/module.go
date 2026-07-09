package redis

import (
	"mal/internal/config"

	"go.uber.org/fx"
)

var Module = fx.Options(
	fx.Provide(func(cfg config.Config) (*Store, error) { return New(cfg.RedisURL) }),
)
