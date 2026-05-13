package auth

import (
	"mal/internal/auth/handler"
	"mal/internal/auth/repository"
	"mal/internal/auth/service"
	"mal/internal/server"

	"go.uber.org/fx"
)

var Module = fx.Options(
	fx.Provide(
		repository.NewAuthRepository,
		service.NewAuthService,
		handler.NewAuthHandler,
	),
	fx.Provide(
		server.AsRouteRegister(func(h *handler.AuthHandler) server.RouteRegister {
			return h
		}),
	),
)
