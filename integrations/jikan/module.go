package jikan

import (
	"mal/internal/db"

	"go.uber.org/fx"
)

var Module = fx.Options(
	fx.Provide(NewClient),
)
