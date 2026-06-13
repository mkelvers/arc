package auth

import (
	"mal/internal/server"

	"go.uber.org/fx"
)

var Module = fx.Options(
	fx.Provide(
		NewAuthRepository,
		NewAuthService,
		NewAuthHandler,
		AuthMiddleware,
	),
	fx.Provide(
		server.AsRouteRegister(func(h *AuthHandler) server.RouteRegister {
			return h
		}),
	),
)
