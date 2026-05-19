package server

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/render"
	"go.uber.org/fx"
)

var Module = fx.Options(
	fx.Provide(ProvideRouter),
	fx.Invoke(RunServer),
)

func ProvideRouter(htmlRender render.HTMLRender) *gin.Engine {
	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.New()
	r.Use(CORSMiddleware(), gin.Logger(), gin.Recovery())
	r.Static("/static", "./static")
	r.Static("/dist", "./dist")
	r.HTMLRender = htmlRender
	return r
}

func RunServer(lifecycle fx.Lifecycle, r *gin.Engine) {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	srv := newHTTPServer(":"+port, r)

	lifecycle.Append(fx.Hook{
		OnStart: func(context.Context) error {
			log.Printf("Starting server on http://localhost:%s", port)
			go func() {
				if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
					// Avoid exiting the process from a goroutine; let the process supervisor handle restarts.
					log.Printf("server listen error: %s", err)
				}
			}()
			return nil
		},
		OnStop: func(ctx context.Context) error {
			log.Println("Shutting down server...")
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
