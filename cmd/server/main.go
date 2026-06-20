// Package main runs the MAL web server.
package main

import (
	"mal/internal/app"
	"mal/internal/observability"

	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		observability.Warn("env_file_load_failed", "server", "", nil, err)
	}

	application := app.NewApp()
	application.Run()
}
