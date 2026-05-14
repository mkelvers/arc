package auth

import (
	"mal/internal/auth/handler"
	"mal/internal/auth/middleware"
	"mal/internal/auth/repository"
	"mal/internal/auth/service"
	"mal/internal/domain"
	"mal/internal/server"

	"github.com/gin-gonic/gin"
	"go.uber.org/fx"
)

var Module = fx.Options(
	fx.Provide(
		repository.NewAuthRepository,
		service.NewAuthService,
		handler.NewAuthHandler,
		func(svc domain.AuthService) gin.HandlerFunc {
			return middleware.AuthMiddleware(svc)
		},
	),
	fx.Provide(
		server.AsRouteRegister(func(h *handler.AuthHandler) server.RouteRegister {
			return h
		}),
	),
)
