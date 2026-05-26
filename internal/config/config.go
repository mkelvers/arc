package config

import (
	"errors"
	"fmt"
	"os"
	"strings"
)

type EpisodeAvailabilityMode string

const (
	EpisodeAvailabilityModeAuto   EpisodeAvailabilityMode = "auto"
	EpisodeAvailabilityModeLegacy EpisodeAvailabilityMode = "legacy"
	EpisodeAvailabilityModeJikan  EpisodeAvailabilityMode = "jikan"
)

type Config struct {
	Port string

	// GinMode maps to gin.SetMode. When empty, the server uses release mode by default.
	GinMode string

	DatabaseFile string

	// Allow any Origin for CORS. Intended for local dev / reverse proxy setups only.
	CORSAllowAll bool

	EpisodeAvailabilityMode EpisodeAvailabilityMode

	// Optional. When empty, proxy token signing is disabled.
	PlaybackProxySecret string

	// Optional debug toggle for Jikan client tracing.
	JikanTrace bool
}

func Load() (Config, error) {
	cfg := Config{
		Port:                    firstNonEmpty(strings.TrimSpace(os.Getenv("PORT")), "3000"),
		GinMode:                 strings.TrimSpace(os.Getenv("GIN_MODE")),
		DatabaseFile:            firstNonEmpty(strings.TrimSpace(os.Getenv("DATABASE_FILE")), "mal.db"),
		CORSAllowAll:            strings.TrimSpace(os.Getenv("MAL_CORS_ALLOW_ALL")) == "1",
		PlaybackProxySecret:     strings.TrimSpace(os.Getenv("PLAYBACK_PROXY_SECRET")),
		JikanTrace:              truthy(strings.TrimSpace(os.Getenv("MAL_JIKAN_TRACE"))),
		EpisodeAvailabilityMode: EpisodeAvailabilityModeAuto,
	}

	if raw := strings.ToLower(strings.TrimSpace(os.Getenv("EPISODE_AVAILABILITY_MODE"))); raw != "" {
		switch EpisodeAvailabilityMode(raw) {
		case EpisodeAvailabilityModeAuto, EpisodeAvailabilityModeLegacy, EpisodeAvailabilityModeJikan:
			cfg.EpisodeAvailabilityMode = EpisodeAvailabilityMode(raw)
		default:
			return Config{}, fmt.Errorf("invalid EPISODE_AVAILABILITY_MODE: %q (expected auto|legacy|jikan)", raw)
		}
	}

	if strings.TrimSpace(cfg.Port) == "" {
		return Config{}, errors.New("PORT must not be empty")
	}
	if strings.TrimSpace(cfg.DatabaseFile) == "" {
		return Config{}, errors.New("DATABASE_FILE must not be empty")
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

func truthy(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "y", "on":
		return true
	default:
		return false
	}
}
