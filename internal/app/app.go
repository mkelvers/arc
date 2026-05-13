package app

import (
	"mal/integrations/jikan"
	"mal/integrations/playback/allanime"
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
		allanime.Module,
		auth.Module,
		anime.Module,
		watchlist.Module,
		playback.Module,
		templates.Module,
		server.Module,
		fx.Provide(func(r *templates.Renderer) render.HTMLRender {
			return r
		}),
		fx.Invoke(fx.Annotate(
			func(r *gin.Engine, authMiddleware gin.HandlerFunc, registers []server.RouteRegister) {
				r.Use(authMiddleware)
				server.RegisterRoutes(r, registers)
			},
			fx.ParamTags(``, ``, `group:"routes"`),
		)),
	)
}
