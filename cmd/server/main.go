// Package main runs the MAL web server.
package main

import (
	"mal/internal"
	"mal/internal/observability"

	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		observability.Warn("env_file_load_failed", "server", "", nil, err)
	}

	application := internal.NewApp()
	application.Run()
}
