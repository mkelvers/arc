package app

import (
	"mal/internal/database"
	"mal/internal/auth"
	"mal/internal/anime"
	"mal/internal/watchlist"
	"mal/internal/playback"
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
		anime.Module,
		watchlist.Module,
		playback.Module,
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
