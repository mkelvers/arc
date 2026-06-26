// Package server provides the HTTP server, routing, and middleware setup.
package server

import (
	"context"
	"mal/internal/audit"
	"mal/internal/config"
	"mal/internal/observability"
	"net/http"
	_ "net/http/pprof" // register pprof handlers on http.DefaultServeMux
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/render"
	"go.uber.org/fx"
)

var Module = fx.Options(
	fx.Provide(ProvideRouter),
	fx.Invoke(RunServer),
)

func ProvideRouter(cfg config.Config, htmlRender render.HTMLRender) *gin.Engine {
	if cfg.GinMode == "" {
		gin.SetMode(gin.ReleaseMode)
	} else {
		gin.SetMode(cfg.GinMode)
	}
	r := gin.New()
	r.Use(CORSMiddlewareWithConfig(cfg), RequestContextMiddleware(), audit.ContextMiddleware(), RequestLogger(), gin.Recovery())
	r.NoRoute(func(c *gin.Context) {
		if acceptsHTML(c) {
			c.HTML(http.StatusNotFound, "not_found.gohtml", gin.H{
				"CurrentPath": c.Request.URL.Path,
			})
			return
		}
		c.JSON(http.StatusNotFound, ErrorResponse{Error: "Not found"})
	})
	r.Static("/static", "./static")
	r.Static("/dist", "./dist")
	r.GET("/debug/pprof", gin.WrapH(http.DefaultServeMux))
	r.GET("/debug/pprof/*action", gin.WrapH(http.DefaultServeMux))
	r.HTMLRender = htmlRender
	return r
}

func RunServer(cfg config.Config, lifecycle fx.Lifecycle, r *gin.Engine) {
	port := cfg.Port

	srv := newHTTPServer(":"+port, r)

	lifecycle.Append(fx.Hook{
		OnStart: func(context.Context) error {
			observability.Info(
				"server_start",
				"server",
				"",
				map[string]any{
					"port": port,
				},
			)
			go func() {
				if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
					// Avoid exiting the process from a goroutine; let the process supervisor handle restarts.
					observability.Error(
						"server_listen_error",
						"server",
						"",
						map[string]any{
							"port": port,
						},
						err,
					)
				}
			}()
			return nil
		},
		OnStop: func(ctx context.Context) error {
			observability.Info("server_stop", "server", "", nil)
			ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
			defer cancel()
			return srv.Shutdown(ctx)
		},
	})
}

func newHTTPServer(addr string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}
}

// RouteRegister is an interface that modules can implement to register their routes.
type RouteRegister interface {
	Register(r *gin.Engine)
}

func RegisterRoutes(r *gin.Engine, registers []RouteRegister) {
	for _, reg := range registers {
		reg.Register(r)
	}
}

// AsRouteRegister is a helper to provide a RouteRegister to the fx group.
func AsRouteRegister(f any) any {
	return fx.Annotate(
		f,
		fx.As(new(RouteRegister)),
		fx.ResultTags(`group:"routes"`),
	)
}
