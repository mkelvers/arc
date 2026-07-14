// Package config provides application configuration loading and access.
package config

import (
	"errors"
	"os"
	"strings"
)

type Config struct {
	Port string

	// GinMode maps to gin.SetMode. When empty, the server uses release mode by default.
	GinMode string

	DatabaseURL string
	RedisURL    string
	AniListURL  string
	ChiaKiURL   string

	// Allow any Origin for CORS. Intended for local dev / reverse proxy setups only.
	CORSAllowAll bool

	// Optional. When empty, proxy token signing is disabled.
	PlaybackProxySecret string
}

func Load() (Config, error) {
	cfg := Config{
		Port:                firstNonEmpty(strings.TrimSpace(os.Getenv("PORT")), "3000"),
		GinMode:             strings.TrimSpace(os.Getenv("GIN_MODE")),
		DatabaseURL:         strings.TrimSpace(os.Getenv("DATABASE_URL")),
		RedisURL:            firstNonEmpty(strings.TrimSpace(os.Getenv("REDIS_URL")), "redis://localhost:6379/0"),
		AniListURL:          firstNonEmpty(strings.TrimSpace(os.Getenv("ANILIST_URL")), "https://graphql.anilist.co"),
		ChiaKiURL:           firstNonEmpty(strings.TrimSpace(os.Getenv("CHIAKI_URL")), "https://chiaki.site"),
		CORSAllowAll:        strings.TrimSpace(os.Getenv("MAL_CORS_ALLOW_ALL")) == "1",
		PlaybackProxySecret: strings.TrimSpace(os.Getenv("PLAYBACK_PROXY_SECRET")),
	}

	if strings.TrimSpace(cfg.Port) == "" {
		return Config{}, errors.New("PORT must not be empty")
	}
	return cfg, nil
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
