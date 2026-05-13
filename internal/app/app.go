package app

import (
	"mal/internal/database"
	"mal/internal/auth"
	"mal/internal/server"
	"mal/internal/templates"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/render"
	"go.uber.org/fx"
)

func NewApp() *fx.App {
	return fx.New(
		database.Module,
		jikan.Module,
		auth.Module,
		templates.Module,
		server.Module,
		fx.Decorate(func(r *templates.Renderer) render.HTMLRender {
			return r
		}),
		fx.Invoke(func(r *gin.Engine, registers []server.RouteRegister) {
			server.RegisterRoutes(r, registers)
		}),
	)
}
