package internal

import (
	"os"
	"strings"
)

type Config struct {
	Port string

	// GinMode maps to gin.SetMode. When empty, the server uses release mode by default.
	GinMode string

	DatabaseURL string
	RedisURL    string

	// Optional. When empty, proxy token signing is disabled.
	PlaybackProxySecret string
}

func LoadConfig() Config {
	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "3000"
	}

	return Config{
		Port:                port,
		GinMode:             strings.TrimSpace(os.Getenv("GIN_MODE")),
		DatabaseURL:         strings.TrimSpace(os.Getenv("DATABASE_URL")),
		RedisURL:            strings.TrimSpace(os.Getenv("REDIS_URL")),
		PlaybackProxySecret: strings.TrimSpace(os.Getenv("PLAYBACK_PROXY_SECRET")),
	}
}
