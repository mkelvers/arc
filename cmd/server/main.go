// Package main runs the MAL web server.
package main

import (
	"log/slog"
	"mal/internal"

	"github.com/joho/godotenv"
)

func main() {
	internal.ConfigureLogger()

	if err := godotenv.Load(); err != nil {
		slog.Warn("env_file_load_failed", "component", "server", "error", err)
	}

	application := internal.NewApp()
	application.Run()
}
