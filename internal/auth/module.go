package auth

import (
	"mal/internal/domain"
	"mal/internal/server"

	"github.com/gin-gonic/gin"
	"go.uber.org/fx"
)

var Module = fx.Options(
	fx.Provide(
		NewAuthRepository,
		NewAuthService,
		NewAuthHandler,
		func(svc domain.AuthService) gin.HandlerFunc {
			return AuthMiddleware(svc)
		},
	),
	fx.Provide(
		server.AsRouteRegister(func(h *AuthHandler) server.RouteRegister {
			return h
		}),
	),
)
