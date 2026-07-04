package config

import (
	"os"
	"testing"
)

func TestFirstNonEmptyReturnsFirstNonBlank(t *testing.T) {
	if got := firstNonEmpty("", "b", "c"); got != "b" {
		t.Fatalf("got %q, want %q", got, "b")
	}
}

func TestFirstNonEmptyReturnsEmptyWhenAllBlank(t *testing.T) {
	if got := firstNonEmpty("", "", ""); got != "" {
		t.Fatalf("got %q, want empty", got)
	}
}

func TestFirstNonEmptySkipsWhitespaceOnly(t *testing.T) {
	if got := firstNonEmpty("  ", "x"); got != "x" {
		t.Fatalf("got %q, want %q", got, "x")
	}
}

func TestTruthyRecognises1TrueYesYOn(t *testing.T) {
	for _, v := range []string{"1", "true", "True", "TRUE", "yes", "Yes", "y", "Y", "on", "ON"} {
		if !truthy(v) {
			t.Fatalf("truthy(%q) = false, want true", v)
		}
	}
}

func TestTruthyReturnsFalseForEmptyAndGarbage(t *testing.T) {
	for _, v := range []string{"", "0", "false", "no", "off", "maybe"} {
		if truthy(v) {
			t.Fatalf("truthy(%q) = true, want false", v)
		}
	}
}

func TestLoadDefaults(t *testing.T) {
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load(): %v", err)
	}
	if cfg.Port != "3000" {
		t.Fatalf("Port = %q, want %q", cfg.Port, "3000")
	}
	if cfg.DatabaseFile != "mal.db" {
		t.Fatalf("DatabaseFile = %q, want %q", cfg.DatabaseFile, "mal.db")
	}
	if cfg.EpisodeAvailabilityMode != EpisodeAvailabilityModeAuto {
		t.Fatalf("EpisodeAvailabilityMode = %q, want %q", cfg.EpisodeAvailabilityMode, EpisodeAvailabilityModeAuto)
	}
}

func TestLoadReadsEnv(t *testing.T) {
	os.Setenv("PORT", "8080")
	os.Setenv("DATABASE_FILE", "/tmp/test.db")
	os.Setenv("MAL_CORS_ALLOW_ALL", "1")
	os.Setenv("MAL_JIKAN_TRACE", "true")
	defer func() {
		os.Unsetenv("PORT")
		os.Unsetenv("DATABASE_FILE")
		os.Unsetenv("MAL_CORS_ALLOW_ALL")
		os.Unsetenv("MAL_JIKAN_TRACE")
	}()

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load(): %v", err)
	}
	if cfg.Port != "8080" {
		t.Fatalf("Port = %q, want %q", cfg.Port, "8080")
	}
	if cfg.DatabaseFile != "/tmp/test.db" {
		t.Fatalf("DatabaseFile = %q, want %q", cfg.DatabaseFile, "/tmp/test.db")
	}
	if !cfg.CORSAllowAll {
		t.Fatal("CORSAllowAll = false, want true")
	}
	if !cfg.JikanTrace {
		t.Fatal("JikanTrace = false, want true")
	}
}

func TestLoadInvalidEpisodeAvailabilityMode(t *testing.T) {
	os.Setenv("EPISODE_AVAILABILITY_MODE", "invalid")
	defer os.Unsetenv("EPISODE_AVAILABILITY_MODE")

	_, err := Load()
	if err == nil {
		t.Fatal("expected error for invalid EPISODE_AVAILABILITY_MODE")
	}
}

func TestLoadEmptyPortIsError(t *testing.T) {
	os.Setenv("PORT", "")
	os.Setenv("DATABASE_FILE", "mal.db")
	defer os.Unsetenv("PORT")

	_, err := Load()
	if err == nil {
		t.Fatal("expected error for empty PORT")
	}
}
