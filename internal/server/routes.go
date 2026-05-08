package server

import (
	"database/sql"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"mal/api/anime"
	"mal/api/auth"
	"mal/api/playback"
	"mal/api/watchlist"
	"mal/integrations/jikan"
	"mal/internal/db"
	"mal/internal/middleware"
	pkgmiddleware "mal/pkg/middleware"
)

type Config struct {
	DB                  *db.Queries
	SQLDB               *sql.DB
	JikanClient         *jikan.Client
	AuthService         *auth.Service
	AuthLimiter         *pkgmiddleware.Limiter
	PlaybackProxySecret string
}

func withMimeTypes(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ext := strings.ToLower(filepath.Ext(r.URL.Path))
		switch ext {
		case ".js":
			w.Header().Set("Content-Type", "application/javascript")
		case ".css":
			w.Header().Set("Content-Type", "text/css")
		case ".svg":
			w.Header().Set("Content-Type", "image/svg+xml")
		case ".json":
			w.Header().Set("Content-Type", "application/json")
		}
		next.ServeHTTP(w, r)
	})
}

func noCache(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		next.ServeHTTP(w, r)
	})
}

func NewAuthLimiter() *pkgmiddleware.Limiter {
	return pkgmiddleware.NewLimiter(pkgmiddleware.Config{
		MaxAttempts: 5,
		Window:      time.Minute,
	})
}

func NewRouter(cfg Config) http.Handler {
	mux := http.NewServeMux()

	authHandler := auth.NewHandler(cfg.AuthService)

	watchlistSvc := watchlist.NewService(cfg.DB, cfg.SQLDB, cfg.JikanClient)
	watchlistHandler := watchlist.NewHandler(watchlistSvc)

	middleware.InitAuth(cfg.AuthService)

	animeSvc := anime.NewService(cfg.JikanClient, cfg.DB)
	animeHandler := anime.NewHandler(animeSvc)

	playbackSvc := playback.NewService(cfg.DB, cfg.SQLDB, playback.Config{
		ProxyTokenSecret: cfg.PlaybackProxySecret,
	})
	playbackHandler := playback.NewHandler(playbackSvc, cfg.JikanClient)

	// Serve static files with no-cache headers
	fs := noCache(http.FileServer(http.Dir("./static")))
	mux.Handle("/static/", http.StripPrefix("/static/", fs))

	// Serve built frontend assets with no-cache headers
	dist := noCache(http.FileServer(http.Dir("./dist")))
	mux.Handle("/dist/", http.StripPrefix("/dist/", withMimeTypes(dist)))

	// Serve Apple Touch Icons from static directory
	mux.HandleFunc("/apple-touch-icon.png", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/svg+xml")
		http.ServeFile(w, r, "./static/apple-touch-icon.svg")
	})
	mux.HandleFunc("/apple-touch-icon-precomposed.png", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/svg+xml")
		http.ServeFile(w, r, "./static/apple-touch-icon-precomposed.svg")
	})
	mux.HandleFunc("/apple-touch-icon-120x120.png", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/svg+xml")
		http.ServeFile(w, r, "./static/apple-touch-icon-120x120.svg")
	})
	mux.HandleFunc("/apple-touch-icon-120x120-precomposed.png", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/svg+xml")
		http.ServeFile(w, r, "./static/apple-touch-icon-120x120-precomposed.svg")
	})

	mux.HandleFunc("/", animeHandler.HandleCatalog)
	mux.HandleFunc("/api/catalog/airing", animeHandler.HandleCatalogAiring)
	mux.HandleFunc("/api/catalog/popular", animeHandler.HandleCatalogPopular)
	mux.HandleFunc("/api/catalog/continue", animeHandler.HandleCatalogContinue)
	mux.HandleFunc("/search", animeHandler.HandleSearch)
	mux.HandleFunc("/browse", animeHandler.HandleBrowse)
	mux.HandleFunc("/discover", animeHandler.HandleDiscover)
	mux.HandleFunc("/api/discover/trending", animeHandler.HandleDiscoverTrending)
	mux.HandleFunc("/api/discover/upcoming", animeHandler.HandleDiscoverUpcoming)
	mux.HandleFunc("/api/discover/top", animeHandler.HandleDiscoverTop)
	mux.HandleFunc("/api/search-quick", animeHandler.HandleQuickSearch)
	mux.HandleFunc("/api/jikan/random/anime", animeHandler.HandleRandomAnime)
	mux.HandleFunc("/anime/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/watch") {
			playbackHandler.HandleWatchPage(w, r)
			return
		}
		animeHandler.HandleAnimeDetails(w, r)
	})
	mux.HandleFunc("/api/watch-order", animeHandler.HandleHTMLWatchOrder)
	mux.HandleFunc("/watch/", playbackHandler.HandleWatchPage)
	mux.HandleFunc("/watch/proxy/stream", playbackHandler.HandleProxy)
	mux.HandleFunc("/watch/proxy/segment", playbackHandler.HandleProxy)
	mux.HandleFunc("/watch/proxy/subtitle", playbackHandler.HandleProxy)
	mux.HandleFunc("/api/watch-progress", playbackHandler.HandleSaveProgress)
	mux.HandleFunc("/api/watch-complete", playbackHandler.HandleCompleteAnime)
	mux.HandleFunc("/api/watch/episode/", playbackHandler.HandleEpisodeData)
	mux.HandleFunc("/api/watch/thumbnails/", playbackHandler.HandleEpisodeThumbnails)

	// Auth Endpoints
	mux.HandleFunc("/login", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			authHandler.HandleLoginPage(w, r)
		} else {
			cfg.AuthLimiter.AuthMiddleware(pkgmiddleware.VerifyOrigin(http.HandlerFunc(authHandler.HandleLogin))).ServeHTTP(w, r)
		}
	})
	mux.HandleFunc("/logout", authHandler.HandleLogout)

	// Watchlist Endpoints
	mux.HandleFunc("/api/watchlist", watchlistHandler.HandleUpdateWatchlist)
	mux.HandleFunc("/api/watchlist/", watchlistHandler.HandleDeleteWatchlist)
	mux.HandleFunc("/api/continue-watching/", watchlistHandler.HandleDeleteContinueWatching)
	mux.HandleFunc("/watchlist", watchlistHandler.HandleGetWatchlist)

	// Wrap mux with global CSRF origin verification and auth checking
	protectedHandler := middleware.RequireGlobalAuthWithPolicy(middleware.NewAccessPolicy())(pkgmiddleware.VerifyOrigin(mux))
	authenticatedHandler := middleware.Auth(cfg.AuthService)(protectedHandler)
	return pkgmiddleware.RequestLogger(authenticatedHandler)
}
