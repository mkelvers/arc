package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	_ "github.com/mattn/go-sqlite3"

	"mal/api/auth"
	"mal/integrations/jikan"
	"mal/internal/db"
	"mal/internal/server"
	"mal/internal/worker"
)

func main() {
	_ = godotenv.Load()

	dbConn, err := db.Open(db.GetDBFile())
	if err != nil {
		log.Fatalf("failed to open db: %v", err)
	}
	defer func() { _ = dbConn.Close() }()

	queries, err := db.Init(dbConn)
	if err != nil {
		log.Fatalf("failed to initialize database: %v", err)
	}

	jikanClient := jikan.NewClient(queries)

	authLimiter := server.NewAuthLimiter()
	go func() {
		for {
			time.Sleep(time.Minute)
			authLimiter.Cleanup(time.Now())
		}
	}()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go worker.New(queries, jikanClient).Start(ctx)

	app := server.Config{
		DB:                  queries,
		SQLDB:               dbConn,
		JikanClient:         jikanClient,
		AuthService:         auth.NewService(queries),
		AuthLimiter:         authLimiter,
		PlaybackProxySecret: playbackSecret(),
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	httpServer := &http.Server{
		Addr:              ":" + port,
		Handler:           server.NewRouter(app),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	go gracefulShutdown(httpServer, ctx)

	log.Printf("Server starting on http://localhost:%s", port)
	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server failed to start: %v", err)
	}
}

func playbackSecret() string {
	secret := os.Getenv("PLAYBACK_PROXY_SECRET")
	if len(secret) < 32 {
		log.Fatal("PLAYBACK_PROXY_SECRET must be set and at least 32 characters")
	}
	return secret
}

func gracefulShutdown(srv *http.Server, ctx context.Context) {
	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("server shutdown failed: %v", err)
	}
}
