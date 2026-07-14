package internal

import (
	"mal/integrations/anilist"
	"mal/integrations/playback/allanime"
	"mal/integrations/watchorder"
	"mal/internal/anime"
	"mal/internal/auth"
	rediscache "mal/internal/cache/redis"
	"mal/internal/config"
	"mal/internal/database"
	"mal/internal/episodes"
	"mal/internal/observability"
	"mal/internal/playback"
	"mal/internal/server"
	"mal/internal/watchlist"
	"mal/templates"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/render"
	"go.uber.org/fx"
)

func NewApp() *fx.App {
	return fx.New(
		fx.WithLogger(observability.NewFxLogger),
		config.Module,
		rediscache.Module,
		database.Module,
		anilist.Module,
		watchorder.Module,
		allanime.Module,
		episodes.Module,
		auth.Module,
		anime.Module,
		watchlist.Module,
		playback.Module,
		templates.Module,
		server.Module,
		fx.Invoke(ApplyPostgresSchemaAndFixes),
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
