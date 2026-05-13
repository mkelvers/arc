package app

import (
	"mal/internal/database"
	"mal/internal/server"

	"github.com/gin-gonic/gin"
	"go.uber.org/fx"
)

func NewApp() *fx.App {
	return fx.New(
		database.Module,
		server.Module,
		fx.Invoke(func(r *gin.Engine, registers []server.RouteRegister) {
			server.RegisterRoutes(r, registers)
		}),
	)
}
