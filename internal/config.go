package internal

import (
	"os"
	"strings"
)

type Config struct {
	Port string

	// GinMode maps to gin.SetMode. When empty, the server uses release mode by default.
	GinMode string

	DatabaseURL     string
	RedisURL        string
	TMDBAccessToken string
	ChiakiURL       string

	// Optional. When empty, proxy token signing is disabled.
	PlaybackProxySecret string
}

func LoadConfig() Config {
	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "3000"
	}

	chiakiURL := strings.TrimSpace(os.Getenv("CHIAKI_URL"))
	if chiakiURL == "" {
		chiakiURL = "https://chiaki.site"
	}

	return Config{
		Port:                port,
		GinMode:             strings.TrimSpace(os.Getenv("GIN_MODE")),
		DatabaseURL:         strings.TrimSpace(os.Getenv("DATABASE_URL")),
		RedisURL:            strings.TrimSpace(os.Getenv("REDIS_URL")),
		TMDBAccessToken:     strings.TrimSpace(os.Getenv("TMDB_ACCESS_TOKEN")),
		ChiakiURL:           chiakiURL,
		PlaybackProxySecret: strings.TrimSpace(os.Getenv("PLAYBACK_PROXY_SECRET")),
	}
}
